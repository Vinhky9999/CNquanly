import { CATEGORY_BY_LINE } from "@/lib/tcgplayer/match";
import { bestSim, isCodeToken, tokenize } from "@/lib/tcgplayer/text";
import type { ParsedTcgSource, TcgCandidate, TcgPricepoint } from "@/lib/tcgplayer/types";

const UA = "Mozilla/5.0";
const SEARCH_URL = "https://mp-search-api.tcgplayer.com/v1/search/request";
const DETAILS_URL = "https://mp-search-api.tcgplayer.com/v1/product";
const PRICEPOINTS_URL = "https://mpapi.tcgplayer.com/v2/product";
const TCGCSV = "https://tcgcsv.com/tcgplayer";

// ---------- HTTP with retries and a tiny in-memory cache ----------

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  // Never cache failures, otherwise a transient outage would stick for the whole TTL.
  if (value !== null && !(Array.isArray(value) && value.length === 0)) {
    cache.set(key, { at: Date.now(), value });
  }
  return value;
}

async function httpJson(url: string, init: RequestInit = {}, attempts = 4): Promise<any | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      if (res.ok) return await res.json();
      if (res.status < 500 && res.status !== 429) return null;
    } catch {
      // network error / timeout -> retry
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  return null;
}

// ---------- TCGplayer marketplace (live) ----------

function toNumber(v: unknown): number | null {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : null;
}

function toCandidate(x: any, sealed: boolean): TcgCandidate {
  return {
    productId: Number(x.productId),
    name: String(x.productName ?? ""),
    setName: String(x.setName ?? ""),
    setCode: x.setCode ? String(x.setCode) : null,
    setId: Number(x.setId ?? 0),
    lineId: Number(x.productLineId ?? 0),
    lineName: String(x.productLineName ?? ""),
    marketPrice: toNumber(x.marketPrice),
    medianPrice: toNumber(x.medianPrice),
    number: x.customAttributes?.number ?? null,
    rarity: x.rarityName ?? x.customAttributes?.rarityDbName ?? null,
    sealed,
  };
}

export interface SearchOptions {
  query: string;
  lines: string[]; // product line url names, [] = all lines
  kind: "sealed" | "card" | "any";
  size?: number;
  from?: number;
}

/** Live TCGplayer marketplace search. Returns null when the service is unreachable. */
export async function tcgSearch(opts: SearchOptions): Promise<TcgCandidate[] | null> {
  const size = opts.size ?? 50;
  const from = opts.from ?? 0;
  const key = `search:${opts.kind}:${opts.lines.join(",")}:${size}:${from}:${opts.query}`;

  return cached(key, 10 * 60 * 1000, async () => {
    const term: Record<string, string[]> = {};
    if (opts.lines.length) term.productLineName = opts.lines;
    if (opts.kind === "sealed") term.productTypeName = ["Sealed Products"];
    if (opts.kind === "card") term.productTypeName = ["Cards"];

    const body = {
      algorithm: "sales_synonym_v2",
      from,
      size,
      filters: { term, range: {}, match: {} },
      listingSearch: { filters: { term: {}, range: {}, exclude: { channelExclusion: 0 } } },
      context: { cart: {}, shippingCountry: "US", userProfile: {} },
      settings: { useFuzzySearch: true, didYouMean: {} },
      sort: {},
    };
    const url = `${SEARCH_URL}?${new URLSearchParams({ q: opts.query, isList: "true", mpfev: "3000" })}`;
    const json = await httpJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www.tcgplayer.com",
        Referer: "https://www.tcgplayer.com/",
      },
      body: JSON.stringify(body),
    });
    const rows = json?.results?.[0]?.results;
    if (!Array.isArray(rows)) return null as unknown as TcgCandidate[];
    return rows
      .filter((r: any) => r?.productId != null)
      .map((r: any) => toCandidate(r, opts.kind === "sealed"));
  });
}

/** Product details by id (used when the owner pastes a TCGplayer link). */
export async function tcgDetails(productId: number): Promise<TcgCandidate | null> {
  const json = await httpJson(`${DETAILS_URL}/${productId}/details`, {
    headers: { Origin: "https://www.tcgplayer.com", Referer: "https://www.tcgplayer.com/" },
  });
  if (!json?.productId) return null;
  return toCandidate(json, Boolean(json.sealed) || json.productTypeName === "Sealed Products");
}

export async function tcgPricepoints(productId: number): Promise<TcgPricepoint[] | null> {
  const json = await httpJson(`${PRICEPOINTS_URL}/${productId}/pricepoints`);
  if (!Array.isArray(json)) return null;
  return json.map((p: any) => ({
    printing: String(p.printingType ?? "Normal"),
    marketPrice: toNumber(p.marketPrice),
    medianPrice: toNumber(p.listedMedianPrice),
  }));
}

// ---------- TCGcsv (daily TCGplayer dump) — fallback when the marketplace API is unreachable ----------

interface CsvGroup {
  groupId: number;
  name: string;
}

async function csvGroups(categoryId: number): Promise<CsvGroup[]> {
  return cached(`csv:groups:${categoryId}`, 6 * 3600 * 1000, async () => {
    const json = await httpJson(`${TCGCSV}/${categoryId}/groups`);
    return Array.isArray(json?.results) ? (json.results as CsvGroup[]) : [];
  });
}

async function csvProducts(categoryId: number, groupId: number): Promise<any[]> {
  return cached(`csv:products:${categoryId}:${groupId}`, 3600 * 1000, async () => {
    const json = await httpJson(`${TCGCSV}/${categoryId}/${groupId}/products`);
    return Array.isArray(json?.results) ? json.results : [];
  });
}

async function csvPrices(categoryId: number, groupId: number): Promise<any[]> {
  return cached(`csv:prices:${categoryId}:${groupId}`, 30 * 60 * 1000, async () => {
    const json = await httpJson(`${TCGCSV}/${categoryId}/${groupId}/prices`);
    return Array.isArray(json?.results) ? json.results : [];
  });
}

/** Candidates built from the TCGcsv dump: best-matching sets of the given lines, with prices. */
export async function csvCandidates(
  lines: string[],
  setTokens: string[],
  kind: "sealed" | "card"
): Promise<TcgCandidate[]> {
  const out: TcgCandidate[] = [];
  for (const line of lines) {
    const categoryId = CATEGORY_BY_LINE[line];
    if (!categoryId) continue;

    const groups = await csvGroups(categoryId);
    const ranked = groups
      .map((g) => {
        const pool = tokenize(g.name).filter((t) => !isCodeToken(t));
        const cov = setTokens.length
          ? setTokens.reduce((s, t) => s + bestSim(t, pool), 0) / setTokens.length
          : 0;
        return { g, cov };
      })
      .filter((x) => x.cov >= 0.6)
      .sort((a, b) => b.cov - a.cov)
      .slice(0, 3);

    for (const { g } of ranked) {
      const [products, prices] = await Promise.all([
        csvProducts(categoryId, g.groupId),
        csvPrices(categoryId, g.groupId),
      ]);
      const byProduct = new Map<number, any>();
      for (const p of prices) if (!byProduct.has(p.productId)) byProduct.set(p.productId, p);

      for (const p of products) {
        const ext: any[] = p.extendedData ?? [];
        const number = ext.find((e) => e.name === "Number")?.value ?? null;
        const isSealed = number == null;
        if ((kind === "sealed") !== isSealed) continue;
        const price = byProduct.get(p.productId);
        out.push({
          productId: Number(p.productId),
          name: String(p.name ?? ""),
          setName: g.name,
          setCode: null,
          setId: g.groupId,
          lineId: categoryId,
          lineName: line === "pokemon-japan" ? "Pokemon Japan" : line === "pokemon" ? "Pokemon" : line,
          marketPrice: toNumber(price?.marketPrice),
          medianPrice: toNumber(price?.midPrice),
          number,
          rarity: ext.find((e) => e.name === "Rarity")?.value ?? null,
          sealed: isSealed,
        });
      }
    }
  }
  return out;
}

async function csvPrice(source: ParsedTcgSource): Promise<number | null> {
  if (!source.categoryId || !source.groupId) return null;
  const rows = (await csvPrices(source.categoryId, source.groupId)).filter(
    (r) => Number(r.productId) === source.productId
  );
  const pick = rows.find((r) => r.subTypeName === source.printing && r.marketPrice != null) ?? rows.find((r) => r.marketPrice != null);
  return toNumber(pick?.marketPrice ?? rows[0]?.midPrice);
}

// ---------- Source strings: tcgplayer:<productId>:<printing>:<categoryId>:<groupId> ----------

export function buildTcgSource(c: TcgCandidate, printing = "Normal"): string {
  return `tcgplayer:${c.productId}:${printing}:${c.lineId || ""}:${c.setId || ""}`;
}

export function parseTcgSource(source: string): ParsedTcgSource | null {
  const [provider, id, printing, cat, grp] = source.split(":");
  if (provider !== "tcgplayer" || !id) return null;
  return {
    productId: Number(id),
    printing: printing || "Normal",
    categoryId: cat ? Number(cat) : null,
    groupId: grp ? Number(grp) : null,
  };
}

export function tcgProductUrl(productId: number): string {
  return `https://www.tcgplayer.com/product/${productId}`;
}

/** Picks the printing to price: the requested one, else Normal, else Holofoil, else the first priced one. */
export function pickPricepoint(points: TcgPricepoint[], preferred?: string): TcgPricepoint | null {
  const priced = points.filter((p) => p.marketPrice != null || p.medianPrice != null);
  if (priced.length === 0) return null;
  const order = [preferred, "Normal", "Holofoil", "Reverse Holofoil"].filter(Boolean) as string[];
  for (const printing of order) {
    const hit = priced.find((p) => p.printing === printing);
    if (hit) return hit;
  }
  return priced[0];
}

/** Live USD market price for a stored source; falls back to the daily TCGcsv dump. */
export async function fetchTcgplayerUsd(
  source: ParsedTcgSource
): Promise<{ usd: number; printing: string } | null> {
  const points = await tcgPricepoints(source.productId);
  if (points) {
    const pick = pickPricepoint(points, source.printing);
    const usd = pick ? pick.marketPrice ?? pick.medianPrice : null;
    if (pick && usd != null && usd > 0) return { usd, printing: pick.printing };
  }
  const usd = await csvPrice(source);
  return usd != null && usd > 0 ? { usd, printing: source.printing } : null;
}
