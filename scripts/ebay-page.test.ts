// Run with: npm run test:ebay-page
// Checks the reader of eBay pages that the owner copies from his own browser, and the bookmark button that copies them.
// The pages below are synthetic: they follow the public structure of an eBay listing (structured data, item title block,
// price block, "ux-labels-values" item specifics, image carousel) but are written for this test. No real eBay page was used,
// and nothing here contacts eBay.

import vm from "node:vm";
import { parseHTML } from "linkedom";

import { BOOKMARKLET_HREF, BOOKMARKLET_SOURCE } from "../src/lib/ebay/bookmarklet";
import {
  CLIPBOARD_MARK,
  looksLikePageSource,
  normalizeImageUrl,
  parseEbayPage,
  parseEndedMoment,
  parseMoney,
  parseTimeLeft,
  unwrapClipboardText,
  type PageDocument,
  type PageParseResult,
} from "../src/lib/ebay/page";

let failures = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
};

const parseDom = (html: string) => parseHTML(html).document as unknown as PageDocument;
const NOW = new Date("2026-11-20T10:00:00.000Z");
const read = (html: string, extra: Partial<Parameters<typeof parseEbayPage>[1]> = {}) => parseEbayPage(html, { parseDom, now: NOW, ...extra });
const ok = (r: PageParseResult) => (r.ok ? r : null);

// ---------------------------------------------------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------------------------------------------------
interface Fixture {
  title?: string;
  canonical?: string | null;
  jsonLd?: object | null;
  scripts?: string[];
  statusText?: string | null;
  priceLabel?: string | null;
  priceText?: string | null;
  bidsText?: string | null;
  timerText?: string | null;
  endedText?: string | null;
  seller?: string | null;
  images?: { src: string; zoom?: string }[];
  specifics?: [string, string][];
  buyItNow?: boolean;
}

const TITLE = "PSA 10 GEM MINT 1999 Pokemon Base Set Charizard 4/102 Holo";
const SPECIFICS: [string, string][] = [
  ["Condition", "Graded Read more about the condition"],
  ["Professional Grader", "Professional Sports Authenticator (PSA)"],
  ["Grade", "10"],
  ["Certification Number", "12345678"],
  ["Card Name", "Charizard"],
  ["Set", "Base Set"],
  ["Year Manufactured", "1999"],
  ["Card Number", "4/102"],
  ["Rarity", "Holo Rare"],
  ["Seller Notes", "“Slab is crack-free.”"],
];

const row = ([label, value]: [string, string]) =>
  `<dl class="ux-labels-values ux-labels-values--inline"><dt class="ux-labels-values__labels"><div class="ux-labels-values__labels-content"><div><span class="ux-textspans">${label}</span></div></div></dt>` +
  `<dd class="ux-labels-values__values"><div class="ux-labels-values__values-content"><div><span class="ux-textspans">${value}</span></div></div></dd></dl>`;

function build(f: Fixture = {}): string {
  const title = f.title ?? TITLE;
  const canonical = f.canonical === undefined ? "https://www.ebay.com/itm/266806586363" : f.canonical;
  const images = f.images ?? [{ src: "https://i.ebayimg.com/images/g/AAAA~/s-l500.jpg", zoom: "https://i.ebayimg.com/images/g/AAAA~/s-l1600.jpg" }, { src: "https://i.ebayimg.com/images/g/BBBB~/s-l500.jpg" }];
  const filler = "<p>" + "Shipping and returns. ".repeat(400) + "</p>";
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title} | eBay</title>` +
    (canonical ? `<link rel="canonical" href="${canonical}">` : "") +
    `<meta property="og:title" content="${title}"><meta property="og:image" content="https://i.ebayimg.com/images/g/AAAA~/s-l1600.jpg">` +
    (f.jsonLd ? `<script type="application/ld+json">${JSON.stringify(f.jsonLd)}</script>` : "") +
    (f.scripts ?? []).map((s) => `<script>${s}</script>`).join("") +
    `<style>.x{color:red}</style></head><body><div id="mainContent">` +
    `<div class="top-bar">Hi! Sign in or register</div>` +
    (f.statusText ? `<div class="d-statusmessage"><span class="ux-textspans">${f.statusText}</span></div>` : "") +
    `<h1 class="x-item-title__mainTitle"><span class="ux-textspans ux-textspans--BOLD">${title}</span></h1>` +
    `<div class="x-price-section">` +
    (f.priceLabel ? `<span class="ux-textspans">${f.priceLabel}</span>` : "") +
    (f.priceText === null ? "" : `<div class="x-price-primary"><span class="ux-textspans">${f.priceText ?? "US $1,250.00"}</span></div>`) +
    `</div>` +
    (f.bidsText === null || f.buyItNow ? "" : `<div class="x-bid-count"><a href="#bids"><span class="ux-textspans">${f.bidsText ?? "[ 7 bids ]"}</span></a></div>`) +
    (f.timerText === null || f.buyItNow ? "" : `<div class="x-timer-module"><span class="ux-timer__text">${f.timerText ?? "2d 3h left"}</span> <span>(Sat, 02:30 PM)</span></div>`) +
    (f.endedText ? `<div class="x-end-note"><span>${f.endedText}</span></div>` : "") +
    (f.buyItNow ? `<div class="x-bin"><span>Buy It Now</span> <span>Free shipping</span></div>` : "") +
    (f.seller === null ? "" : `<div class="x-sellercard-atf__info__about-seller"><a href="https://www.ebay.com/usr/pokevault"><span class="ux-textspans ux-textspans--BOLD">${f.seller ?? "pokevault"}</span></a> <span>(2,345)</span></div>`) +
    `<div class="ux-image-carousel-container">${images.map((i) => `<div class="ux-image-carousel-item image"><img src="${i.src}"${i.zoom ? ` data-zoom-src="${i.zoom}"` : ""}></div>`).join("")}</div>` +
    `<div class="ux-layout-section--features">${(f.specifics ?? SPECIFICS).map(row).join("")}</div>` +
    filler +
    `<section class="similar"><h2>Similar sponsored items</h2><div>Other card 5 bids 1d 2h left US $9.99</div></section>` +
    `</div></body></html>`
  );
}

const productLd = (over: Record<string, unknown> = {}) => ({
  "@context": "https://schema.org/",
  "@type": "Product",
  name: TITLE,
  image: ["https://i.ebayimg.com/images/g/AAAA~/s-l1600.jpg"],
  offers: { "@type": "Offer", price: "1250.00", priceCurrency: "USD", availability: "https://schema.org/InStock", url: "https://www.ebay.com/itm/266806586363" },
  ...over,
});

// ---------------------------------------------------------------------------------------------------------------------
// 1. A live auction with a countdown and a machine-readable end time that agrees with it
// ---------------------------------------------------------------------------------------------------------------------
{
  const end = new Date(NOW.getTime() + (2 * 86400 + 3 * 3600 + 25 * 60) * 1000).toISOString(); // countdown says 2d 3h, rounded down to the hour
  const r = ok(read(build({ jsonLd: productLd(), scripts: [`window.__STATE__={"timer":{"endTime":"${end}"}};`] })));
  check("live auction: page is read", r !== null);
  if (r) {
    check("live auction: Item ID and marketplace come from the canonical link", r.itemId === "266806586363" && r.marketplace === "EBAY_US" && r.url === "https://www.ebay.com/itm/266806586363", [r.itemId, r.marketplace, r.url]);
    check("live auction: title from the item title block", r.listing.title === TITLE, r.listing.title);
    check("live auction: price, currency, bids", r.listing.currentPrice === 1250 && r.listing.currency === "USD" && r.listing.bidCount === 7, r.listing);
    check("live auction: end time accepted because it matches the countdown", r.listing.endsAt === end, r.listing.endsAt);
    check("live auction: flagged as auction, not ended", r.listing.isAuction === true && r.listing.ended === false);
    check("live auction: seller name only", r.listing.seller === "pokevault", r.listing.seller);
    check("live auction: photos are large eBay links, no duplicates", JSON.stringify(r.listing.images) === JSON.stringify(["https://i.ebayimg.com/images/g/AAAA~/s-l1600.jpg", "https://i.ebayimg.com/images/g/BBBB~/s-l1600.jpg"]), r.listing.images);
    const c = r.listing.card;
    check("live auction: card details from item specifics", c.subject === "Charizard" && c.setName === "Base Set" && c.year === "1999" && c.cardNumber === "4/102" && c.rarity === "Holo Rare", c);
    check("live auction: grading company, grade and certificate", c.gradingCompany === "Professional Sports Authenticator (PSA)" && c.grade === "10" && c.certNumber === "12345678", c);
    check("live auction: condition without the help link text", c.condition === "Graded", c.condition);
    check("live auction: seller notes become the description", r.listing.description === "Slab is crack-free.", r.listing.description);
    check("live auction: nothing to double-check", r.warnings.length === 0, r.warnings);
    check("live auction: report lists what was read", r.read.includes("giờ kết thúc") && r.read.includes("số lượt đấu giá") && r.missing.length === 0, [r.read, r.missing]);
    check("live auction: the similar-items block further down is ignored", r.listing.bidCount === 7 && r.listing.currentPrice === 1250);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. End times that disagree with the countdown are never used
// ---------------------------------------------------------------------------------------------------------------------
{
  const wrong = new Date(NOW.getTime() + 10 * 86400 * 1000).toISOString();
  const r = ok(read(build({ jsonLd: productLd(), scripts: [`var x={"endTime":"${wrong}"};`] })));
  check("end time that contradicts the countdown is rejected", r !== null && r.listing.endsAt === null, r?.listing.endsAt);
  check("rejected end time: owner is told how long is left and asked to enter the time", !!r && r.warnings.some((w) => w.includes("2 ngày 3 giờ") && w.includes("giờ kết thúc")), r?.warnings);
  check("rejected end time: not reported as read", !!r && r.missing.includes("giờ kết thúc"), r?.missing);

  const none = ok(read(build({ jsonLd: productLd() })));
  check("countdown only (no timestamp): end time stays empty", none !== null && none.listing.endsAt === null && none.warnings.length === 1, none?.warnings);

  // Capture time known (bookmark button): the countdown is measured from then, not from now.
  const captured = new Date(NOW.getTime() - 2 * 3600 * 1000);
  const end = new Date(captured.getTime() + (2 * 86400 + 3 * 3600 + 20 * 60) * 1000).toISOString();
  const late = ok(read(build({ jsonLd: productLd(), scripts: [`var x={"endTime":"${end}"};`] }), { capturedAt: captured }));
  check("capture time is the reference for the countdown", late !== null && late.listing.endsAt === end, late?.listing.endsAt);
  const stale = ok(read(build({ jsonLd: productLd(), scripts: [`var x={"endTime":"${end}"};`] })));
  check("a stale copy (pasted later, no capture time) does not produce a wrong end time", stale !== null && stale.listing.endsAt === null, stale?.listing.endsAt);

  // Epoch milliseconds and escaped JSON inside a script string are understood too.
  const ms = NOW.getTime() + (5 * 3600 + 15 * 60 + 30) * 1000; // the page rounds 5h 15m 30s down to "5h 15m"
  const epoch = ok(read(build({ timerText: "5h 15m left", scripts: [`var x={"itemEndDate":${ms}};`] })));
  check("epoch-millisecond end time that matches the countdown is accepted", epoch !== null && epoch.listing.endsAt === new Date(ms).toISOString(), epoch?.listing.endsAt);
  const iso = new Date(ms).toISOString();
  const escaped = ok(read(build({ timerText: "5h 15m left", scripts: [`window.s="{\\"auction\\":{\\"endTime\\":\\"${iso}\\"}}";`] })));
  check("escaped JSON inside a script string is understood", escaped !== null && escaped.listing.endsAt === iso, escaped?.listing.endsAt);
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. An ended auction
// ---------------------------------------------------------------------------------------------------------------------
{
  const r = ok(
    read(
      build({
        jsonLd: productLd({ offers: { "@type": "Offer", price: "1500.00", priceCurrency: "USD", availability: "https://schema.org/OutOfStock" } }),
        statusText: "Bidding has ended on this item.",
        priceLabel: "Winning bid:",
        priceText: "US $1,500.00",
        bidsText: "[ 12 bids ]",
        timerText: null,
        endedText: "This listing ended on Nov 14, 2026 at 3:21:04 PM PST.",
      })
    )
  );
  check("ended auction: read", r !== null);
  if (r) {
    check("ended auction: marked ended with the exact end moment (PST = UTC-8)", r.listing.ended === true && r.listing.endsAt === "2026-11-14T23:21:04.000Z", [r.listing.ended, r.listing.endsAt]);
    check("ended auction: winning bid is read and also the displayed price", r.winningBid === 1500 && r.listing.currentPrice === 1500 && r.listing.bidCount === 12, [r.winningBid, r.listing]);
    check("ended auction: owner is told to confirm the real End price", r.warnings.some((w) => w.includes("giá End")), r.warnings);
  }
  const noTime = ok(read(build({ statusText: "Bidding has ended on this item.", timerText: null })));
  check("ended without a printed date: ended, end time empty, no 'enter the time' nag", !!noTime && noTime.listing.ended && noTime.listing.endsAt === null && !noTime.warnings.some((w) => w.includes("Không đọc được giờ kết thúc")), noTime?.warnings);
  const gone = ok(read(build({ jsonLd: productLd({ offers: { price: "5", priceCurrency: "USD", availability: "https://schema.org/SoldOut" } }), timerText: null })));
  check("structured data saying sold out marks the listing ended", !!gone && gone.listing.ended === true);
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. Buy It Now, other currencies, layouts that changed
// ---------------------------------------------------------------------------------------------------------------------
{
  const bin = ok(read(build({ jsonLd: productLd(), buyItNow: true })));
  check("buy it now: not an auction, with a warning", !!bin && bin.listing.isAuction === false && bin.listing.bidCount === null && bin.listing.endsAt === null && bin.warnings.some((w) => w.includes("Auction")), bin?.warnings);

  const cad = ok(read(build({ priceText: "C $45.00", canonical: "https://www.ebay.ca/itm/266806586363" })));
  check("C $45.00 -> CAD 45", !!cad && cad.listing.currency === "CAD" && cad.listing.currentPrice === 45 && cad.marketplace === "EBAY_CA");
  const gbp = ok(read(build({ priceText: "£10.99", canonical: "https://www.ebay.co.uk/itm/266806586363" })));
  check("£10.99 -> GBP 10.99", !!gbp && gbp.listing.currency === "GBP" && gbp.listing.currentPrice === 10.99 && gbp.marketplace === "EBAY_GB");
  const eur = ok(read(build({ priceText: "EUR 1.234,50", canonical: "https://www.ebay.de/itm/266806586363" })));
  check("EUR 1.234,50 -> EUR 1234.5, with a note that the page is not English", !!eur && eur.listing.currency === "EUR" && eur.listing.currentPrice === 1234.5 && eur.warnings.some((w) => w.includes("không phải tiếng Anh")), eur?.warnings);
  const bareUs = ok(read(build({ priceText: "$20.00" })));
  check("bare $ on the US site is US dollars", !!bareUs && bareUs.listing.currency === "USD" && bareUs.listing.currentPrice === 20);
  const bareCa = ok(read(build({ priceText: "$20.00", canonical: "https://www.ebay.ca/itm/266806586363" })));
  check("bare $ elsewhere: currency left empty and flagged", !!bareCa && bareCa.listing.currency === null && bareCa.listing.currentPrice === 20 && bareCa.warnings.some((w) => w.includes("loại tiền")), bareCa?.warnings);

  const ldOnly = ok(
    read(
      `<!DOCTYPE html><html><head><title>${TITLE} | eBay</title><link rel="canonical" href="https://www.ebay.com/itm/266806586363"><script type="application/ld+json">${JSON.stringify(productLd())}</script></head><body><div>Layout changed</div></body></html>`
    )
  );
  check("only structured data left: title, price, photo still read", !!ldOnly && ldOnly.listing.title === TITLE && ldOnly.listing.currentPrice === 1250 && ldOnly.listing.images.length === 1, ldOnly?.listing);
  check("only structured data left: missing parts are reported, not invented", !!ldOnly && ldOnly.listing.seller === null && ldOnly.listing.card.grade === null && ldOnly.warnings.some((w) => w.includes("Item specifics")), ldOnly?.warnings);

  const domOnly = ok(read(build({ jsonLd: null })));
  check("no structured data: the page markup is enough", !!domOnly && domOnly.listing.title === TITLE && domOnly.listing.currentPrice === 1250 && domOnly.listing.card.grade === "10");

  const dl = ok(
    read(
      `<html><head><link rel="canonical" href="https://www.ebay.com/itm/266806586363"></head><body><h1 class="x-item-title__mainTitle">A card</h1><dl><dt>Grade:</dt><dd>9.5</dd><dt>Set</dt><dd>Jungle</dd></dl></body></html>`
    )
  );
  check("plain dt/dd lists are read when the eBay class names are gone", !!dl && dl.listing.card.grade === "9.5" && dl.listing.card.setName === "Jungle", dl?.listing.card);
}

// ---------------------------------------------------------------------------------------------------------------------
// 5. Things that are not listing pages
// ---------------------------------------------------------------------------------------------------------------------
{
  const akamai = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>Error Page | eBay</title></head><body><main class="main-content"><div class="error-header"><p class="error-header__headline">SORRY</p><div id="error-info"><p>Something went wrong on our end</p><hr><p class="reference-id">0.cc07f2ab.1795104705.495b9f2e</p><hr><p>Please go back and try again.</p></div></div></main><footer id="glbfooter"><p>Copyright © 1995-2026 eBay Inc. All Rights Reserved.</p></footer></body></html>`;
  const a = read(akamai);
  check("eBay error / block page is recognised", !a.ok && a.kind === "BLOCKED", a);
  const captcha = read(`<html><head><title>Security Measure | eBay</title></head><body><h1>Pardon Our Interruption</h1><p>Please verify yourself to continue.</p></body></html>`);
  check("verification page (CAPTCHA) is recognised and not mistaken for a listing", !captcha.ok && captcha.kind === "BLOCKED", captcha);
  const search = read(`<html><head><title>charizard psa 10 for sale | eBay</title></head><body><h1>1,234 results for charizard psa 10</h1><ul><li>Item A</li></ul></body></html>`);
  check("search results page is not a listing", !search.ok && search.kind === "NOT_ITEM_PAGE", search);
  const empty = read("   ");
  check("empty paste", !empty.ok && empty.kind === "EMPTY", empty);
  const huge = read("<html>" + "x".repeat(12_000_001));
  check("absurdly large paste is refused", !huge.ok && huge.kind === "TOO_LARGE");
  check("page source is recognised, plain text and links are not", looksLikePageSource("<!DOCTYPE html><html><head>") && looksLikePageSource(`${CLIPBOARD_MARK}\nhttps://www.ebay.com/itm/1\n2026\n<html>`) && !looksLikePageSource("https://www.ebay.com/itm/266806586363") && !looksLikePageSource("hello world"));
}

// ---------------------------------------------------------------------------------------------------------------------
// 6. Updating an existing card: the page must be that listing
// ---------------------------------------------------------------------------------------------------------------------
{
  const html = build({ jsonLd: productLd() });
  const good = read(html, { expectedItemId: "266806586363" });
  check("expected Item ID matches", good.ok);
  const bad = read(html, { expectedItemId: "111111111111" });
  check("a different listing is refused for an update", !bad.ok && bad.kind === "WRONG_ITEM" && bad.error.includes("266806586363") && bad.error.includes("111111111111"), bad);
  const noId = read(`<html><body><h1 class="x-item-title__mainTitle">Card</h1></body></html>`, { expectedItemId: "266806586363" });
  check("a page without an Item ID cannot be used for an update", !noId.ok && noId.kind === "WRONG_ITEM", noId);
  const viaHeader = ok(read(`<html><body><h1 class="x-item-title__mainTitle">Card</h1></body></html>`, { url: "https://www.ebay.com/itm/Some-Title/266806586363?hash=item3e" }));
  check("the page link sent by the bookmark button identifies the listing when the page has no canonical link", viaHeader?.itemId === "266806586363", viaHeader?.itemId);
  const viaText = ok(read(`<html><body><h1 class="x-item-title__mainTitle">Card</h1><div>eBay item number: 266806586363</div></body></html>`));
  check("'eBay item number' text is the last resort", viaText?.itemId === "266806586363", viaText?.itemId);
}

// ---------------------------------------------------------------------------------------------------------------------
// 7. Hostile or odd content
// ---------------------------------------------------------------------------------------------------------------------
{
  const r = ok(
    read(
      build({
        images: [
          { src: "https://evil.example/x.jpg" },
          { src: "http://i.ebayimg.com/images/g/CCCC~/s-l500.jpg" },
          { src: "data:image/png;base64,AAAA" },
          { src: "https://i.ebayimg.com.evil.example/images/g/DDDD~/s-l500.jpg" },
          { src: "https://i.ebayimg.com/images/g/EEEE~/s-l500.jpg" },
        ],
        title: "Card &lt;img src=x onerror=alert(1)&gt; <b>bold</b>",
      })
    )
  );
  check("only https links on eBay's own image hosts are kept", !!r && JSON.stringify(r.listing.images) === JSON.stringify(["https://i.ebayimg.com/images/g/EEEE~/s-l1600.jpg"]), r?.listing.images);
  check("markup in the title is plain text, never HTML", !!r && !r.listing.title.includes("<b>") && r.listing.title.includes("bold"), r?.listing.title);
  check("image links: thumbnails become the large photo, other hosts rejected", normalizeImageUrl("https://i.ebayimg.com/thumbs/images/g/ZZZZ~/s-l225.jpg") === "https://i.ebayimg.com/images/g/ZZZZ~/s-l1600.jpg" && normalizeImageUrl("https://example.com/a.jpg") === null && normalizeImageUrl("javascript:alert(1)") === null);
}

// ---------------------------------------------------------------------------------------------------------------------
// 8. Small parsers
// ---------------------------------------------------------------------------------------------------------------------
{
  const m = (t: string, mk: string | null = "EBAY_US") => parseMoney(t, mk);
  check("money: US $1,234.56", m("US $1,234.56")?.amount === 1234.56 && m("US $1,234.56")?.currency === "USD");
  check("money: US $12 and US $0.99", m("US $12")?.amount === 12 && m("US $0.99")?.amount === 0.99);
  check("money: 1,234 is one thousand two hundred thirty-four", m("US $1,234")?.amount === 1234);
  check("money: C $12,50 (comma decimals) is 12.5", m("C $12,50")?.amount === 12.5 && m("C $12,50")?.currency === "CAD");
  check("money: EUR 1.234,56", m("EUR 1.234,56")?.amount === 1234.56 && m("EUR 1.234,56")?.currency === "EUR");
  check("money: trailing full stop is not a decimal", m("Total US $15.")?.amount === 15);
  check("money: 'bus $5' is not read as Singapore dollars", m("bus $5", null)?.currency === null);
  check("money: no number, no money", m("Free shipping") === null);

  const tl = (t: string) => parseTimeLeft(t);
  check("time left: 5d 3h left", tl("5d 3h left")?.seconds === 5 * 86400 + 3 * 3600 && tl("5d 3h left")?.tolerance === 3600);
  check("time left: 'Time left: 2h 5m'", tl("Time left: 2h 5m (Sat)")?.seconds === 7500 && tl("Time left: 2h 5m (Sat)")?.tolerance === 60);
  check("time left: 12m 30s left", tl("12m 30s left")?.seconds === 750 && tl("12m 30s left")?.tolerance === 1);
  check("time left: Ends in 1 day 4 hours", tl("Ends in 1 day 4 hours")?.seconds === 86400 + 4 * 3600);
  check("time left: '30 day returns' and 'Only 1 left' are not countdowns", tl("Free 30 day returns") === null && tl("Only 1 left") === null && tl("30 days left") !== null);

  const iso = (t: string) => parseEndedMoment(t)?.toISOString() ?? null;
  check("ended moment: Nov 14, 2026 at 3:21:04 PM PST", iso("This listing ended on Nov 14, 2026 at 3:21:04 PM PST.") === "2026-11-14T23:21:04.000Z");
  check("ended moment: 14 Nov 2026 at 15:21:04 GMT", iso("Ended: 14 Nov 2026 at 15:21:04 GMT") === "2026-11-14T15:21:04.000Z");
  check("ended moment: 12:05 AM is just after midnight", iso("This listing ended on Nov 14, 2026 at 12:05 AM EST") === "2026-11-14T05:05:00.000Z");
  check("ended moment: no or unknown time zone gives nothing", iso("This listing ended on Nov 14, 2026 at 3:21 PM") === null && iso("This listing ended on Nov 14, 2026 at 3:21 PM XYZ") === null);
  check("ended moment: no date, no result", iso("Bidding has ended on this item.") === null);
}

// ---------------------------------------------------------------------------------------------------------------------
// 9. Clipboard text
// ---------------------------------------------------------------------------------------------------------------------
{
  const html = "<html><body>x\nyy</body></html>";
  const w = unwrapClipboardText(`${CLIPBOARD_MARK}\nhttps://www.ebay.com/itm/266806586363\n2026-11-20T09:55:00.000Z\n${html}`);
  check("clipboard header: link, capture time and untouched page source", w.url === "https://www.ebay.com/itm/266806586363" && w.capturedAt?.toISOString() === "2026-11-20T09:55:00.000Z" && w.html === html, w);
  const plain = unwrapClipboardText(html);
  check("plain page source has no header", plain.html === html && plain.url === null && plain.capturedAt === null);
  const badDate = unwrapClipboardText(`${CLIPBOARD_MARK}\nhttps://www.ebay.com/itm/1\nnot a date\n${html}`);
  check("a bad capture time is ignored", badDate.capturedAt === null && badDate.html === html);
}

// ---------------------------------------------------------------------------------------------------------------------
// 10. The bookmark button, run against a fake page
// ---------------------------------------------------------------------------------------------------------------------
class FakeElement {
  id = "";
  value = "";
  textContent = "";
  parentNode: FakeElement | null = null;
  style = { cssText: "" };
  children: FakeElement[] = [];
  appendChild(child: FakeElement) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child: FakeElement) {
    this.children = this.children.filter((c) => c !== child);
    child.parentNode = null;
    return child;
  }
  focus() {}
  select() {}
}

interface Run {
  copied: string | null;
  toast: string | null;
  toastBad: boolean;
  alerts: string[];
}

async function runBookmarklet(opts: { host: string; clipboard: "ok" | "reject" | "none"; legacyCopy: boolean }): Promise<Run> {
  const run: Run = { copied: null, toast: null, toastBad: false, alerts: [] };
  const body = new FakeElement();
  const document = {
    body,
    documentElement: { outerHTML: "<html><head><title>T</title></head><body>page</body></html>" },
    getElementById: () => null,
    createElement: () => new FakeElement(),
    execCommand: (cmd: string) => {
      if (cmd === "copy" && opts.legacyCopy) {
        run.copied = body.children.at(-1)?.value ?? null;
        return true;
      }
      return false;
    },
  };
  const navigator =
    opts.clipboard === "none"
      ? {}
      : {
          clipboard: {
            writeText: (t: string) => {
              if (opts.clipboard === "reject") return Promise.reject(new Error("denied"));
              run.copied = t;
              return Promise.resolve();
            },
          },
        };
  const context = vm.createContext({
    document,
    navigator,
    location: { hostname: opts.host, href: `https://${opts.host}/itm/266806586363` },
    setTimeout: () => 0,
    alert: (m: string) => run.alerts.push(m),
    Date,
    Error,
  });
  vm.runInContext(BOOKMARKLET_SOURCE, context);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const toast = body.children.find((c) => c.id === "cardnest-toast");
  run.toast = toast?.textContent ?? null;
  run.toastBad = toast?.style.cssText.includes("#b91c1c") ?? false;
  return run;
}

async function bookmarkChecks() {
  const good = await runBookmarklet({ host: "www.ebay.com", clipboard: "ok", legacyCopy: false });
  const unwrapped = good.copied ? unwrapClipboardText(good.copied) : null;
  check("bookmark button: copies mark, page link, time and the page source", !!unwrapped && unwrapped.url === "https://www.ebay.com/itm/266806586363" && unwrapped.capturedAt !== null && unwrapped.html.includes("<body>page</body>"), good.copied);
  check("bookmark button: says it worked", good.toast?.includes("Đã sao chép") === true && !good.toastBad, good.toast);

  const uk = await runBookmarklet({ host: "www.ebay.co.uk", clipboard: "ok", legacyCopy: false });
  check("bookmark button: works on other eBay sites", uk.copied !== null);

  const other = await runBookmarklet({ host: "www.example.com", clipboard: "ok", legacyCopy: false });
  check("bookmark button: refuses to copy a page that is not eBay", other.copied === null && other.toastBad && other.toast?.includes("eBay") === true, other);
  const lookalike = await runBookmarklet({ host: "ebay.com.evil.example", clipboard: "ok", legacyCopy: false });
  check("bookmark button: look-alike host is not eBay", lookalike.copied === null && lookalike.toastBad, lookalike);
  const lookalike2 = await runBookmarklet({ host: "www.ebay.evil.com", clipboard: "ok", legacyCopy: false });
  check("bookmark button: ebay.evil.com is not eBay", lookalike2.copied === null && lookalike2.toastBad, lookalike2);

  const denied = await runBookmarklet({ host: "www.ebay.com", clipboard: "reject", legacyCopy: true });
  check("bookmark button: falls back to the old copy command when the clipboard API is refused", denied.copied !== null && denied.toast?.includes("Đã sao chép") === true, denied);
  const old = await runBookmarklet({ host: "www.ebay.com", clipboard: "none", legacyCopy: true });
  check("bookmark button: falls back when there is no clipboard API", old.copied !== null && !old.toastBad, old);
  const stuck = await runBookmarklet({ host: "www.ebay.com", clipboard: "reject", legacyCopy: false });
  check("bookmark button: says so when nothing could be copied", stuck.copied === null && stuck.toastBad && stuck.toast?.includes("Ctrl+U") === true, stuck);

  check("bookmark address: javascript: link, one line, decodes back to the source", BOOKMARKLET_HREF.startsWith("javascript:") && !/[\r\n\s]/.test(BOOKMARKLET_HREF) && decodeURIComponent(BOOKMARKLET_HREF.slice("javascript:".length)) === BOOKMARKLET_SOURCE);
  check("bookmark address: short enough for any browser", BOOKMARKLET_HREF.length < 4000, BOOKMARKLET_HREF.length);
  let compiles = true;
  try {
    new vm.Script(BOOKMARKLET_SOURCE);
  } catch {
    compiles = false;
  }
  check("bookmark button: valid JavaScript", compiles);
}

bookmarkChecks()
  .catch((err) => {
    failures++;
    console.log("FAIL  bookmark checks crashed  ->", err);
  })
  .finally(() => {
    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  });
