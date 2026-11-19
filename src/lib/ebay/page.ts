import { cardFromAspects, type Aspect, type EbayListing } from "@/lib/ebay/map";
import { parseEbayUrl } from "@/lib/ebay/url";

// Reads the listing page that the OWNER opened in his own browser (copied with the bookmark button, or pasted as page source).
// Nothing here talks to eBay: the app never requests eBay pages by itself, because eBay refuses automated access
// (its servers answer HTTP 403 and its terms forbid it). The page text comes from the person who is allowed to look at it.
//
// The reader is deliberately defensive: eBay changes its page layout without notice, so every field is read from several
// places (structured data, meta tags, the page markup, the visible text) and a field that cannot be read with confidence stays
// empty. Nothing is guessed, and an end time is only accepted when it agrees with what the page itself shows.

// ---------------------------------------------------------------------------------------------------------------------
// A tiny DOM contract: the browser's DOMParser result satisfies it, and so does the DOM used by the automated tests.
// ---------------------------------------------------------------------------------------------------------------------
export interface PageNodeLike {
  readonly nodeType: number;
  readonly textContent: string | null;
}

export interface PageElement extends PageNodeLike {
  readonly tagName: string;
  readonly childNodes: ArrayLike<PageNodeLike>;
  getAttribute(name: string): string | null;
  querySelector(selector: string): PageElement | null;
  querySelectorAll(selector: string): ArrayLike<PageElement>;
}

export interface PageDocument {
  querySelector(selector: string): PageElement | null;
  querySelectorAll(selector: string): ArrayLike<PageElement>;
}

export type PageListing = Omit<EbayListing, "itemId"> & { itemId: string | null };

export type PageProblemKind = "EMPTY" | "TOO_LARGE" | "BLOCKED" | "NOT_ITEM_PAGE" | "WRONG_ITEM";

export type PageParseResult =
  | {
      ok: true;
      itemId: string | null;
      marketplace: string | null;
      url: string | null;
      listing: PageListing;
      /** Price printed next to "Winning bid" on an ended auction (eBay shows it for the highest bid). */
      winningBid: number | null;
      warnings: string[];
      /** Which fields were read / not found, in the owner's words, so the screen can say what to check. */
      read: string[];
      missing: string[];
    }
  | { ok: false; kind: PageProblemKind; error: string };

export interface PageParseOptions {
  /** Turns page source into a DOM. In the browser: new DOMParser().parseFromString(html, "text/html"). */
  parseDom: (html: string) => PageDocument;
  /** When the page was captured (the bookmark button sends it). Defaults to now. */
  capturedAt?: Date | null;
  now?: Date;
  /** The link of the page, when the capture tool knows it. */
  url?: string | null;
  /** When set, the page must be this listing (used when updating a card that already exists). */
  expectedItemId?: string | null;
}

export const MAX_PAGE_CHARS = 12_000_000;
/** First line of the text the bookmark button puts on the clipboard. */
export const CLIPBOARD_MARK = "CARDNEST-EBAY-PAGE/1";

// ---------------------------------------------------------------------------------------------------------------------
// Clipboard text
// ---------------------------------------------------------------------------------------------------------------------

/** The bookmark button writes: mark, page link, capture time, then the page source. Plain page source (Ctrl+U) has no header. */
export function unwrapClipboardText(text: string): { html: string; url: string | null; capturedAt: Date | null } {
  if (text.startsWith(`${CLIPBOARD_MARK}\n`)) {
    const lines: string[] = [];
    let rest = text.slice(CLIPBOARD_MARK.length + 1);
    for (let i = 0; i < 2; i++) {
      const cut = rest.indexOf("\n");
      if (cut < 0) break;
      lines.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut + 1);
    }
    const when = lines[1] ? new Date(lines[1]) : null;
    return { html: rest, url: lines[0] || null, capturedAt: when && !Number.isNaN(when.getTime()) ? when : null };
  }
  return { html: text, url: null, capturedAt: null };
}

/** Quick check used before parsing: is this pasted text page source (or the bookmark button's output) at all? */
export function looksLikePageSource(text: string): boolean {
  if (text.startsWith(CLIPBOARD_MARK)) return true;
  return /<\s*(?:!doctype\s+html|html|head|body)\b/i.test(text.slice(0, 20000));
}

// ---------------------------------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------------------------------
const squash = (s: string | null | undefined): string =>
  (s ?? "")
    .replace(/[​-‍﻿]/g, "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "HEAD", "IFRAME"]);

function collect(el: PageElement, out: string[]): void {
  const kids = el.childNodes;
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i];
    if (kid.nodeType === 3) {
      out.push(kid.textContent ?? "");
    } else if (kid.nodeType === 1) {
      const child = kid as PageElement;
      if (SKIPPED_TAGS.has(child.tagName.toUpperCase())) continue;
      out.push(" ");
      collect(child, out);
      out.push(" ");
    }
  }
}

/** Visible text of an element: scripts and styles left out, one space between neighbouring elements, whitespace squashed. */
export function textOf(el: PageElement | null | undefined): string {
  if (!el || SKIPPED_TAGS.has(el.tagName.toUpperCase())) return "";
  const out: string[] = [];
  collect(el, out);
  return squash(out.join(""));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });

// ---------------------------------------------------------------------------------------------------------------------
// Money, durations, dates
// ---------------------------------------------------------------------------------------------------------------------
const MONEY = /(\b(?:US|C|AU|NZ|HK|S)\s?\$|\$|£|€|\b(?:USD|CAD|AUD|NZD|HKD|SGD|GBP|EUR|CHF|PLN|MYR|PHP)\b)\s?(\d[\d.,]*)/i;

function currencyFor(symbol: string, marketplace: string | null): string | null {
  const s = symbol.replace(/\s+/g, "").toUpperCase();
  const table: Record<string, string> = { "US$": "USD", "C$": "CAD", "AU$": "AUD", "NZ$": "NZD", "HK$": "HKD", "S$": "SGD", "£": "GBP", "€": "EUR" };
  if (table[s]) return table[s];
  if (/^[A-Z]{3}$/.test(s)) return s;
  // A bare "$" is only taken as US dollars on the US site; anywhere else it could be CAD, AUD...
  if (s === "$") return marketplace === "EBAY_US" ? "USD" : null;
  return null;
}

function toAmount(raw: string): number | null {
  let s = raw.replace(/[.,]+$/, "");
  const sep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (sep >= 0) {
    const ch = s[sep];
    const occurrences = s.split(ch).length - 1;
    const decimals = s.length - sep - 1;
    const isDecimal = occurrences === 1 && decimals >= 1 && decimals <= 2;
    s = isDecimal ? s.slice(0, sep).replace(/[.,]/g, "") + "." + s.slice(sep + 1) : s.replace(/[.,]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : null;
}

/** First price in a piece of text: "US $1,234.56" -> 1234.56 USD. The currency is null when it cannot be told. */
export function parseMoney(text: string, marketplace: string | null = null): { amount: number; currency: string | null } | null {
  const m = MONEY.exec(text);
  if (!m) return null;
  const amount = toAmount(m[2]);
  return amount === null ? null : { amount, currency: currencyFor(m[1], marketplace) };
}

const DUR = String.raw`\d+\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b`;
const DUR_SEQ = `${DUR}(?:[\\s,]+${DUR}){0,3}`;
const LEFT_AFTER = new RegExp(String.raw`(?:time left|ends in|ending in)\s*:?\s*(${DUR_SEQ})`, "i");
const LEFT_BEFORE = new RegExp(String.raw`(${DUR_SEQ})\s+left\b`, "i");

/** "5d 3h" -> 5 days 3 hours in seconds, plus how coarse the figure is (eBay rounds the countdown to its smallest unit). */
export function parseTimeLeft(text: string): { seconds: number; tolerance: number } | null {
  const seq = LEFT_AFTER.exec(text)?.[1] ?? LEFT_BEFORE.exec(text)?.[1];
  if (!seq) return null;
  const unit = /(\d+)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;
  const perUnit: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };
  let total = 0;
  let smallest = Infinity;
  let found = false;
  for (let m = unit.exec(seq); m; m = unit.exec(seq)) {
    const secs = perUnit[m[2][0].toLowerCase()];
    total += Number(m[1]) * secs;
    smallest = Math.min(smallest, secs);
    found = true;
  }
  return found ? { seconds: total, tolerance: smallest } : null;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const TZ_HOURS: Record<string, number> = {
  PST: -8, PDT: -7, MST: -7, MDT: -6, CST: -6, CDT: -5, EST: -5, EDT: -4, AKST: -9, AKDT: -8, HST: -10,
  GMT: 0, UTC: 0, WET: 0, WEST: 1, BST: 1, CET: 1, CEST: 2, EET: 2, EEST: 3,
  AEST: 10, AEDT: 11, ACST: 9.5, AWST: 8, NZST: 12, NZDT: 13, HKT: 8, SGT: 8,
};

const ENDED_MDY = /(?:ended|ends)\s*(?:on|:)?\s*(?:[a-z]{3,9},?\s+)?([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4}),?\s*(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?\s*([a-z]{2,5})?\b/i;
const ENDED_DMY = /(?:ended|ends)\s*(?:on|:)?\s*(?:[a-z]{3,9},?\s+)?(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4}),?\s*(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?\s*([a-z]{2,5})?\b/i;

function endedChunk(chunk: string): Date | null {
  let month: string, day: string, year: string, hour: string, minute: string, second: string | undefined, meridiem: string | undefined, zone: string | undefined;
  const mdy = ENDED_MDY.exec(chunk);
  const dmy = mdy ? null : ENDED_DMY.exec(chunk);
  if (mdy) [, month, day, year, hour, minute, second, meridiem, zone] = mdy;
  else if (dmy) [, day, month, year, hour, minute, second, meridiem, zone] = dmy;
  else return null;

  const mon = MONTHS[month.slice(0, 3).toLowerCase()];
  const offset = zone ? TZ_HOURS[zone.toUpperCase()] : undefined;
  if (mon === undefined || offset === undefined) return null;

  let h = Number(hour);
  if (meridiem) h = (h % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0);
  if (h > 23 || Number(minute) > 59) return null;
  const utc = Date.UTC(Number(year), mon, Number(day), h, Number(minute), Number(second ?? 0)) - offset * 3_600_000;
  return Number.isNaN(utc) ? null : new Date(utc);
}

/** "This listing ended on Nov 14, 2025 at 3:21:04 PM PST" -> the exact moment. Null unless the time zone is printed and known. */
export function parseEndedMoment(text: string): Date | null {
  // "Bidding has ended on this item" also says "ended on", so every "ended on / ends:" is tried until one carries a date.
  const anchor = /(?:ended|ends)\s*(?:on|:)/gi;
  for (let a = anchor.exec(text); a; a = anchor.exec(text)) {
    const moment = endedChunk(text.slice(a.index, a.index + 140));
    if (moment) return moment;
  }
  return null;
}

function describeDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [d ? `${d} ngày` : "", h ? `${h} giờ` : "", !d && m ? `${m} phút` : ""].filter(Boolean);
  return parts.join(" ") || "dưới 1 phút";
}

// ---------------------------------------------------------------------------------------------------------------------
// Structured data (JSON-LD)
// ---------------------------------------------------------------------------------------------------------------------
type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? decodeEntities(v).trim() : typeof v === "number" ? String(v) : null);

function jsonLdNodes(doc: PageDocument): Json[] {
  const out: Json[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (isObject(v)) {
      out.push(v);
      if (v["@graph"]) visit(v["@graph"]);
    }
  };
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const raw = scripts[i].textContent?.trim();
    if (!raw) continue;
    try {
      visit(JSON.parse(raw));
    } catch {
      /* a block that is not valid JSON is simply skipped */
    }
  }
  return out;
}

const hasType = (node: Json, type: string) => asArray(node["@type"]).some((t) => typeof t === "string" && t.toLowerCase() === type);

interface Structured {
  name: string | null;
  images: string[];
  price: number | null;
  currency: string | null;
  availability: string | null;
  seller: string | null;
  url: string | null;
  validUntil: string | null;
}

function readStructured(doc: PageDocument): Structured {
  const nodes = jsonLdNodes(doc);
  const product = nodes.find((n) => hasType(n, "product")) ?? null;
  const offer = product ? (asArray(product.offers).find(isObject) ?? null) : (nodes.find((n) => hasType(n, "offer")) ?? null);
  const images = product
    ? asArray(product.image)
        .map((i) => (isObject(i) ? str(i.url) : str(i)))
        .filter((u): u is string => Boolean(u))
    : [];
  const price = offer ? Number(str(offer.price)?.replace(/,/g, "")) : NaN;
  const sellerNode = offer && isObject(offer.seller) ? offer.seller : null;
  return {
    name: product ? str(product.name) : null,
    images,
    price: Number.isFinite(price) && price >= 0 ? price : null,
    currency: offer ? str(offer.priceCurrency)?.toUpperCase() ?? null : null,
    availability: offer ? str(offer.availability) : null,
    seller: sellerNode ? str(sellerNode.name) : null,
    url: str(product?.url) ?? str(offer?.url) ?? null,
    validUntil: offer ? str(offer.priceValidUntil) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Item specifics and photos
// ---------------------------------------------------------------------------------------------------------------------
function readAspects(doc: PageDocument): Aspect[] {
  const out: Aspect[] = [];
  const seen = new Set<string>();
  const push = (nameRaw: string, valueRaw: string) => {
    const name = nameRaw.replace(/:\s*$/, "").trim();
    let value = valueRaw.trim();
    // The condition row ends with help links ("Read more about the condition").
    value = value.replace(/\s*(?:read more|see all condition definitions|about the condition)\b.*$/i, "").trim();
    const key = name.toLowerCase();
    if (!name || !value || name.length > 80 || value.length > 600 || seen.has(key)) return;
    seen.add(key);
    out.push({ name, value });
  };

  const rows = doc.querySelectorAll("dl.ux-labels-values, .ux-labels-values");
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = row.querySelector(".ux-labels-values__labels-content") ?? row.querySelector(".ux-labels-values__labels");
    const value = row.querySelector(".ux-labels-values__values-content") ?? row.querySelector(".ux-labels-values__values");
    if (label && value) push(textOf(label), textOf(value));
  }

  // Plain definition lists, in case the class names changed.
  if (out.length === 0) {
    const lists = doc.querySelectorAll("dl");
    for (let i = 0; i < lists.length; i++) {
      const terms = lists[i].querySelectorAll("dt");
      const defs = lists[i].querySelectorAll("dd");
      for (let k = 0; k < Math.min(terms.length, defs.length); k++) push(textOf(terms[k]), textOf(defs[k]));
    }
  }
  return out;
}

const IMAGE_ATTRS = ["data-zoom-src", "data-src", "data-lazy-src", "src"];

/** Photo links must be https links on eBay's image hosts; thumbnails are swapped for the large version of the same photo. */
export function normalizeImageUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(host === "ebayimg.com" || host.endsWith(".ebayimg.com"))) return null;
  const m = /^\/(?:thumbs\/)?images\/g\/([^/]+)\/s-l\d+\.(?:jpe?g|png|webp)$/i.exec(url.pathname);
  return m ? `https://${host}/images/g/${m[1]}/s-l1600.jpg` : `https://${host}${url.pathname}`;
}

const imageKey = (url: string) => /\/images\/g\/([^/]+)\//.exec(url)?.[1] ?? url;

function readImages(doc: PageDocument, structured: string[], metaImage: string | null): string[] {
  const out: string[] = [];
  const keys = new Set<string>();
  /** Returns true when the link is a usable eBay photo (new or already listed). */
  const add = (raw: string | null | undefined): boolean => {
    const url = raw ? normalizeImageUrl(raw) : null;
    if (!url) return false;
    if (keys.has(imageKey(url)) || out.length >= 12) return true;
    keys.add(imageKey(url));
    out.push(url);
    return true;
  };

  const gallery = doc.querySelectorAll(".ux-image-carousel-item img, .ux-image-filmstrip-carousel-item img");
  for (let i = 0; i < gallery.length; i++) {
    // The real link may sit in a data-* attribute while src holds a placeholder.
    for (const attr of IMAGE_ATTRS) {
      const value = gallery[i].getAttribute(attr);
      if (value && add(value)) break;
    }
  }
  if (out.length === 0) structured.forEach(add);
  if (out.length === 0) add(metaImage);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// End time
// ---------------------------------------------------------------------------------------------------------------------
const END_KEYS = "endTime|endDate|itemEndDate|itemEndTime|auctionEndTime|auctionEndDate|endTimestamp|endsAt|endDateTime";
const ISO = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?`;

function toDate(value: string): Date | null {
  const t = /^\d{13}$/.test(value) ? Number(value) : /^\d{10}$/.test(value) ? Number(value) * 1000 : Date.parse(value);
  if (!Number.isFinite(t) || t < Date.UTC(2015, 0, 1) || t > Date.UTC(2100, 0, 1)) return null;
  return new Date(t);
}

/** End timestamps the page carries in its data, with no check yet. Used only when they agree with the countdown shown. */
function machineEndTimes(doc: PageDocument, validUntil: string | null): Date[] {
  const found: Date[] = [];
  const push = (value: string | null | undefined) => {
    const d = value ? toDate(value.trim()) : null;
    if (d && !found.some((f) => Math.abs(f.getTime() - d.getTime()) < 60_000)) found.push(d);
  };
  push(validUntil);

  const marked = doc.querySelectorAll("time[datetime], [data-endtime], [data-end-time]");
  for (let i = 0; i < marked.length; i++) push(marked[i].getAttribute("datetime") ?? marked[i].getAttribute("data-endtime") ?? marked[i].getAttribute("data-end-time"));

  const keyed = new RegExp(String.raw`\\?"(?:${END_KEYS})\\?"\s*:\s*(?:\\?"(${ISO})\\?"|(\d{10,13}))`, "g");
  const scripts = doc.querySelectorAll("script");
  for (let i = 0; i < scripts.length; i++) {
    const text = scripts[i].textContent ?? "";
    if (text.length > 4_000_000 || !/end/i.test(text)) continue;
    for (let m = keyed.exec(text); m; m = keyed.exec(text)) push(m[1] ?? m[2]);
  }
  return found;
}

/** A machine-readable end time counts only when it matches the countdown printed on the page (to the countdown's own precision). */
function confirmEnd(candidates: Date[], left: { seconds: number; tolerance: number } | null, reference: Date): Date | null {
  if (!left) return null;
  const expected = reference.getTime() + left.seconds * 1000;
  const slack = (left.tolerance + 120) * 1000;
  const close = candidates.filter((c) => Math.abs(c.getTime() - expected) <= slack);
  close.sort((a, b) => Math.abs(a.getTime() - expected) - Math.abs(b.getTime() - expected));
  return close[0] ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------------------------------------------------
const fail = (kind: PageProblemKind, error: string): PageParseResult => ({ ok: false, kind, error });

const BLOCK_PATTERN = /something went wrong on our end|pardon our interruption|security measure|verify yourself|are you (?:a )?(?:human|robot)|unusual traffic|checking your browser|access denied|robot check|captcha/i;
const ENDED_PATTERN = /\b(?:bidding has ended|this listing (?:has )?ended|this listing was ended|listing has ended|auction (?:has )?ended|this item is no longer available|ended by the seller)\b/i;
const NOT_AVAILABLE = /outofstock|soldout|discontinued|\bsold\s?out\b/i;

function meta(doc: PageDocument, prop: string): string | null {
  const el = doc.querySelector(`meta[property="${prop}"]`) ?? doc.querySelector(`meta[name="${prop}"]`);
  const value = squash(el?.getAttribute("content"));
  return value ? decodeEntities(value) : null;
}

function idFromUrl(raw: string | null | undefined): { itemId: string; marketplace: string; url: string } | null {
  if (!raw) return null;
  const parsed = parseEbayUrl(raw);
  return parsed.ok ? parsed.value : null;
}

const ENGLISH_MARKETPLACES = new Set(["EBAY_US", "EBAY_GB", "EBAY_CA", "EBAY_AU", "EBAY_IE", "EBAY_SG", "EBAY_HK", "EBAY_MY", "EBAY_PH"]);

export function parseEbayPage(rawHtml: string, options: PageParseOptions): PageParseResult {
  const html = rawHtml.trim();
  if (!html) return fail("EMPTY", "Chưa có nội dung. Hãy dán mã nguồn trang eBay (mở trang sản phẩm, nhấn Ctrl+U, rồi Ctrl+A và Ctrl+C).");
  if (html.length > MAX_PAGE_CHARS) return fail("TOO_LARGE", "Nội dung dán quá lớn để là một trang sản phẩm eBay.");

  const doc = options.parseDom(html);
  const body = doc.querySelector("body");
  const pageText = textOf(body);
  const pageTitle = squash(doc.querySelector("title")?.textContent);

  // ---- which listing is this -------------------------------------------------------------------------------------
  const canonical = idFromUrl(doc.querySelector('link[rel="canonical"]')?.getAttribute("href"));
  const structured = readStructured(doc);
  const identity = canonical ?? idFromUrl(meta(doc, "og:url")) ?? idFromUrl(structured.url) ?? idFromUrl(options.url);
  const numberOnPage = /ebay item number\s*:?\s*(\d{9,14})/i.exec(pageText)?.[1] ?? null;
  const itemId = identity?.itemId ?? numberOnPage;

  const itemTitle = doc.querySelector("h1.x-item-title__mainTitle");
  const h1 = itemTitle ?? doc.querySelector("h1");
  const title = squash(textOf(h1)) || structured.name || meta(doc, "og:title") || squash(pageTitle.replace(/\s*\|\s*ebay\s*$/i, "").replace(/^details about\s+/i, "")) || null;

  // A listing page has an Item ID, the item title block or Product data. A bare h1 is not enough (search pages have one too).
  const evidence = Boolean(itemId) || Boolean(itemTitle && textOf(itemTitle)) || structured.name !== null;
  if (!evidence) {
    if (BLOCK_PATTERN.test(`${pageTitle} ${pageText.slice(0, 2000)}`) || /^error page\b/i.test(pageTitle)) {
      return fail("BLOCKED", "eBay đang chặn hoặc yêu cầu xác minh trên trang này (lỗi / CAPTCHA). Hãy mở lại trang sản phẩm bình thường trên trình duyệt của bạn (tự xác minh nếu eBay yêu cầu), đợi trang hiện đầy đủ rồi sao chép lại.");
    }
    return fail("NOT_ITEM_PAGE", "Đây không phải trang sản phẩm eBay (không thấy tên sản phẩm hay Item ID). Hãy mở đúng trang sản phẩm (ebay.com/itm/…) rồi sao chép lại.");
  }

  if (options.expectedItemId) {
    if (!itemId) return fail("WRONG_ITEM", `Không xác nhận được đây là trang của Item ID ${options.expectedItemId}. Hãy mở đúng trang sản phẩm đó rồi sao chép lại.`);
    if (itemId !== options.expectedItemId) return fail("WRONG_ITEM", `Trang bạn sao chép là Item ID ${itemId}, không phải ${options.expectedItemId}. Hãy mở đúng trang của thẻ này.`);
  }

  const marketplace = identity?.marketplace ?? (options.url ? (idFromUrl(options.url)?.marketplace ?? null) : null);
  const reference = options.capturedAt ?? options.now ?? new Date();
  const warnings: string[] = [];
  const read: string[] = [];
  const missing: string[] = [];
  const note = (found: boolean, label: string) => (found ? read : missing).push(label);

  // The buy box (price, bids, countdown) is the text that follows the title; later parts of the page list other items.
  const at = title ? pageText.indexOf(title.slice(0, 80)) : -1;
  const buyBox = at >= 0 ? pageText.slice(at, at + 3500) : pageText.slice(0, 8000);
  const statusWindow = at >= 0 ? pageText.slice(Math.max(0, at - 1500), at + 3500) : pageText.slice(0, 8000);

  // ---- state -------------------------------------------------------------------------------------------------------
  const bidMatch = /(\d[\d,]*)\s+bids?\b/i.exec(buyBox);
  const bidCount = bidMatch ? Number(bidMatch[1].replace(/,/g, "")) : /\bno bids\b/i.test(buyBox) ? 0 : null;
  const isAuction = bidCount !== null || /\b(?:current bid|starting bid|winning bid|place bid|bid history)\b/i.test(buyBox);
  const endedText = ENDED_PATTERN.test(statusWindow) || NOT_AVAILABLE.test(structured.availability ?? "");

  // ---- price -------------------------------------------------------------------------------------------------------
  const domPrice = parseMoney(textOf(doc.querySelector(".x-price-primary")), marketplace);
  const boxPrice = (() => {
    const labelled = /\b(?:winning bid|current bid|starting bid|price)\s*:?\s*([\s\S]{0,40})/i.exec(buyBox)?.[1];
    return parseMoney(labelled ?? "", marketplace);
  })();
  const jsonPrice = structured.price !== null ? { amount: structured.price, currency: structured.currency } : null;
  const price = domPrice ?? boxPrice ?? jsonPrice;
  const winning = /\bwinning bid\s*:?\s*([\s\S]{0,40})/i.exec(buyBox)?.[1];
  const winningBid = winning ? (parseMoney(winning, marketplace)?.amount ?? null) : null;

  // ---- end time ----------------------------------------------------------------------------------------------------
  const left = endedText ? null : parseTimeLeft(buyBox);
  const endedAtText = endedText ? parseEndedMoment(statusWindow) : null;
  let endsAt: Date | null = endedAtText;
  if (!endsAt) endsAt = confirmEnd(machineEndTimes(doc, structured.validUntil), left, reference);
  const ended = endedText || (endsAt !== null && endsAt.getTime() <= reference.getTime());

  // ---- people, photos, specifics ----------------------------------------------------------------------------------
  const sellerEl = doc.querySelector(".x-sellercard-atf__info__about-seller a") ?? doc.querySelector(".x-sellercard-atf__info__about-seller");
  const seller = squash(textOf(sellerEl)) || structured.seller || null;
  const aspects = readAspects(doc);
  const images = readImages(doc, structured.images, meta(doc, "og:image"));
  const sellerNotes = aspects.find((a) => a.name?.toLowerCase() === "seller notes")?.value?.replace(/^[“"']+|[”"']+$/g, "").trim() || null;
  const card = cardFromAspects(aspects);

  note(Boolean(title), "tên sản phẩm");
  note(Boolean(itemId), "Item ID");
  note(price !== null, "giá");
  note(images.length > 0, `ảnh${images.length ? ` (${images.length})` : ""}`);
  note(aspects.length > 0, `thông số thẻ${aspects.length ? ` (${aspects.length} mục)` : ""}`);
  note(Boolean(seller), "seller");
  if (isAuction || bidCount !== null) note(bidCount !== null, "số lượt đấu giá");
  note(endsAt !== null, "giờ kết thúc");

  // ---- what the owner should double-check ------------------------------------------------------------------------
  if (!title) warnings.push("Không đọc được tên sản phẩm. Hãy nhập tay.");
  if (price === null) warnings.push("Không đọc được giá. Hãy nhập giá hiện tại từ trang eBay.");
  else if (price.currency === null) warnings.push("Không xác định được loại tiền của giá trên trang. Hãy kiểm tra loại tiền trước khi lưu.");
  if (!isAuction && !endedText) warnings.push("Trang này không thấy dấu hiệu đấu giá (Auction). Vẫn lưu được, nhưng giá là giá bán, không phải giá đấu.");
  if (isAuction && bidCount === null) warnings.push("Không đọc được số lượt đấu giá. Hãy nhập tay nếu cần.");
  if (!endsAt && !ended) {
    warnings.push(
      left
        ? `Trang chỉ ghi còn khoảng ${describeDuration(left.seconds)} nên chưa tính được giờ kết thúc chính xác. Hãy nhập giờ kết thúc theo trang eBay.`
        : "Không đọc được giờ kết thúc. Hãy nhập tay."
    );
  }
  if (ended) warnings.push("Đấu giá đã kết thúc. Hãy xác nhận kết quả và nhập giá End thực tế (giá thắng trên trang chỉ để tham khảo).");
  if (marketplace && !ENGLISH_MARKETPLACES.has(marketplace)) warnings.push("Trang eBay này không phải tiếng Anh nên một số trường (lượt đấu giá, giờ kết thúc, thông số thẻ) có thể không đọc được.");
  if (aspects.length === 0) warnings.push("Không đọc được bảng thông số (Item specifics). Hãy nhập tay các thông tin thẻ.");

  const listing: PageListing = {
    itemId,
    title: title ?? "",
    description: sellerNotes,
    images,
    seller,
    currency: price?.currency ?? null,
    currentPrice: price?.amount ?? null,
    bidCount,
    endsAt: endsAt ? endsAt.toISOString() : null,
    isAuction,
    ended,
    card,
  };

  return { ok: true, itemId, marketplace, url: identity?.url ?? null, listing, winningBid, warnings, read, missing };
}
