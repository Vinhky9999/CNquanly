import { prisma } from "@/lib/prisma";
import {
  buildTcgSource,
  fetchTcgplayerUsd,
  parseTcgSource,
  tcgProductUrl,
} from "@/lib/tcgplayer/client";
import { AUTO_LINK_OPTED_OUT, LISTED_PRICE_NOTE, MATCHER_VERSION } from "@/lib/tcgplayer/constants";
import { findSealedMatch, findSingleMatch } from "@/lib/tcgplayer/finder";
import type { TcgCandidate } from "@/lib/tcgplayer/types";

const FALLBACK_USD_VND = Number(process.env.USD_VND_RATE) || 25000;
const FX_TTL_MS = 60 * 60 * 1000;
let fxCache: { rate: number; at: number } | null = null;

// Free public price APIs are occasionally flaky (5xx / timeouts), so retry a couple of times.
async function fetchJson(url: string, attempts = 5): Promise<any | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000), cache: "no-store" });
      if (res.ok) return await res.json();
      if (res.status < 500 && res.status !== 429) return null;
    } catch {
      // network error / timeout — fall through to retry
    }
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  return null;
}

export async function getUsdVndRate(): Promise<number> {
  if (fxCache && Date.now() - fxCache.at < FX_TTL_MS) return fxCache.rate;
  const json = await fetchJson("https://open.er-api.com/v6/latest/USD");
  const rate = Number(json?.rates?.VND);
  if (Number.isFinite(rate) && rate > 0) {
    fxCache = { rate, at: Date.now() };
    return rate;
  }
  return fxCache?.rate ?? FALLBACK_USD_VND;
}

export function usdToVnd(usd: number, rate: number): number {
  const vnd = usd * rate;
  // Whole thousands for normal prices, hundreds for very cheap singles.
  const step = vnd >= 100_000 ? 1000 : 100;
  return Math.round(vnd / step) * step;
}

export interface PriceQuote {
  usd: number;
  /** "listed" = TCGplayer has no Market Price yet, only the median of the current listings. null = legacy sources. */
  basis: "market" | "listed" | null;
}

/** USD price for any stored source ("tcgplayer:…" or the legacy per-game APIs). */
export async function fetchPriceQuote(source: string): Promise<PriceQuote | null> {
  const tcg = parseTcgSource(source);
  if (tcg) {
    const quote = await fetchTcgplayerUsd(tcg);
    return quote ? { usd: quote.usd, basis: quote.basis } : null;
  }
  const usd = await fetchLegacyUsdPrice(source);
  return usd == null ? null : { usd, basis: null };
}

/** USD market price for any stored source ("tcgplayer:…" or the legacy per-game APIs). */
export async function fetchUsdPrice(source: string): Promise<number | null> {
  return (await fetchPriceQuote(source))?.usd ?? null;
}

async function fetchLegacyUsdPrice(source: string): Promise<number | null> {
  const [provider, ...rest] = source.split(":");
  const id = rest.join(":");
  if (!id) return null;

  if (provider === "pokemontcg") {
    const json = await fetchJson(`https://api.pokemontcg.io/v2/cards/${encodeURIComponent(id)}`);
    const prices = json?.data?.tcgplayer?.prices;
    if (!prices) return null;
    for (const variant of Object.values<any>(prices)) {
      const market = Number(variant?.market);
      if (Number.isFinite(market) && market > 0) return market;
    }
    return null;
  }
  if (provider === "scryfall") {
    const json = await fetchJson(`https://api.scryfall.com/cards/${encodeURIComponent(id)}`);
    const usd = Number(json?.prices?.usd ?? json?.prices?.usd_foil);
    return Number.isFinite(usd) && usd > 0 ? usd : null;
  }
  if (provider === "ygoprodeck") {
    const json = await fetchJson(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(id)}`);
    const usd = Number(json?.data?.[0]?.card_prices?.[0]?.tcgplayer_price);
    return Number.isFinite(usd) && usd > 0 ? usd : null;
  }
  return null;
}

// ---------- Auto-link: find the TCGplayer product for products that have no price source ----------

type Kind = "SEALED" | "SINGLE";

interface LinkableRow {
  id: string;
  kind: Kind;
  sku: string;
  name: string;
  game: string | null;
  costPrice: number;
}

/** A price this far from the cost price is probably the wrong product (e.g. a display vs one box). */
function plausibilityCap(score: number, vnd: number, cost: number): number {
  if (cost <= 0) return score;
  const ratio = vnd / cost;
  return ratio > 2.2 || ratio < 0.45 ? Math.min(score, 0.7) : score;
}

async function saveLink(
  row: LinkableRow,
  data: {
    priceSource: string | null;
    priceSourceLabel: string | null;
    priceSourceUrl: string | null;
    priceMatchScore: number | null;
    marketPrice?: number;
    marketPriceUpdatedAt?: Date;
  }
) {
  const payload = { ...data, priceLinkAttemptedAt: new Date(), priceMatcherVersion: MATCHER_VERSION };
  if (row.kind === "SEALED") {
    await prisma.sealedProduct.update({ where: { id: row.id }, data: payload });
  } else {
    await prisma.singleCard.update({ where: { id: row.id }, data: payload });
  }
}

function labelFor(c: TcgCandidate, basis: PriceQuote["basis"]): string {
  const name = c.lineName === "Pokemon Japan" ? `${c.name} (JP)` : c.name;
  return basis === "listed" ? `${name}${LISTED_PRICE_NOTE}` : name;
}

/** Keeps the "listed median" note in step with the price that is actually used. */
function relabel(label: string | null, basis: PriceQuote["basis"]): string | null {
  if (!label || basis === null) return label;
  const base = label.split(LISTED_PRICE_NOTE).join("");
  return basis === "listed" ? `${base}${LISTED_PRICE_NOTE}` : base;
}

type LinkOutcome = "priced" | "linked" | "none";

/**
 * priced = matched and priced; linked = right product but TCGplayer has no price for it yet
 * (nobody has bought or listed it) — the link is kept so the price appears as soon as it exists;
 * none = no product found.
 */
async function linkRow(row: LinkableRow, rate: number): Promise<LinkOutcome> {
  const match =
    row.kind === "SEALED" ? await findSealedMatch(row.name, row.game) : await findSingleMatch(row.name, row.game);

  const none = { priceSource: null, priceSourceLabel: null, priceSourceUrl: null, priceMatchScore: null };
  if (!match) {
    await saveLink(row, none);
    return "none";
  }

  const c = match.candidate;
  let printing = "Normal";
  let usd: number | null = c.marketPrice ?? c.medianPrice;
  let basis: PriceQuote["basis"] = c.marketPrice != null ? "market" : c.medianPrice != null ? "listed" : null;
  if (row.kind === "SINGLE" || usd == null) {
    // Cards can have several printings (Normal / Holofoil / Reverse…): price the sensible one.
    const live = await fetchTcgplayerUsd({
      productId: c.productId,
      printing: "Normal",
      categoryId: c.lineId,
      groupId: c.setId,
    });
    if (live) {
      usd = live.usd;
      printing = live.printing;
      basis = live.basis;
    }
  }

  const link = {
    priceSource: buildTcgSource(c, printing),
    priceSourceLabel: labelFor(c, basis),
    priceSourceUrl: tcgProductUrl(c.productId),
  };
  if (usd == null || usd <= 0) {
    await saveLink(row, { ...link, priceMatchScore: match.score });
    return "linked";
  }

  const vnd = usdToVnd(usd, rate);
  await saveLink(row, {
    ...link,
    priceMatchScore: plausibilityCap(match.score, vnd, row.costPrice),
    marketPrice: vnd,
    marketPriceUpdatedAt: new Date(),
  });
  return "priced";
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) await worker(queue.shift()!);
    })
  );
}

export interface RefreshResult {
  checked: number; // linked products re-priced in this run
  updated: number;
  failed: number;
  linked: number; // newly matched to a TCGplayer product in this run
  unpriced: number; // of those, how many TCGplayer has no price for yet
  unmatched: number; // looked up but nothing confident found
  unmatchedNames: string[]; // SKUs of (some of) the unmatched products, for the owner to check
  remainingToLink: number; // still waiting to be matched (call again to continue)
  rate: number;
  at: string;
}

export interface RefreshOptions {
  force?: boolean;
  maxAgeMs?: number;
  linkLimit?: number;
  /** Only run the link phase (used by follow-up calls that keep matching the remaining products). */
  skipPricing?: boolean;
}

/**
 * 1) Matches products that have no price source to a TCGplayer product (sealed + raw singles),
 *    a few per run so the request stays short — callers repeat while remainingToLink > 0.
 * 2) Re-prices every linked product whose price is older than maxAgeMs (always when forced).
 */
export async function refreshMarketPrices(opts: RefreshOptions = {}): Promise<RefreshResult> {
  const force = Boolean(opts.force);
  const maxAgeMs = opts.maxAgeMs ?? 30 * 60 * 1000;
  const linkLimit = opts.linkLimit ?? 8;
  const rate = await getUsdVndRate();

  // ----- link phase -----
  const retryBefore = new Date(Date.now() - (force ? 60_000 : 24 * 3600 * 1000));
  const attemptFilter = {
    OR: [
      { priceLinkAttemptedAt: null },
      { priceLinkAttemptedAt: { lt: retryBefore } },
      // Given up on by an older, less capable matcher: try again right away (opted-out products stay opted out).
      {
        AND: [
          { priceLinkAttemptedAt: { not: AUTO_LINK_OPTED_OUT } },
          { OR: [{ priceMatcherVersion: null }, { priceMatcherVersion: { lt: MATCHER_VERSION } }] },
        ],
      },
    ],
  };

  const [sealedToLink, singlesToLink] = await Promise.all([
    prisma.sealedProduct.findMany({
      where: { priceSource: null, ...attemptFilter },
      select: { id: true, sku: true, name: true, game: true, costPrice: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.singleCard.findMany({
      where: { priceSource: null, condition: "RAW", status: { not: "SOLD" }, ...attemptFilter },
      select: { id: true, sku: true, cardName: true, game: true, costPrice: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const queue: LinkableRow[] = [
    ...sealedToLink.map((p) => ({
      id: p.id,
      kind: "SEALED" as const,
      sku: p.sku,
      name: p.name,
      game: p.game,
      costPrice: Number(p.costPrice),
    })),
    ...singlesToLink.map((c) => ({
      id: c.id,
      kind: "SINGLE" as const,
      sku: c.sku,
      name: c.cardName,
      game: c.game,
      costPrice: Number(c.costPrice),
    })),
  ];
  const batch = queue.slice(0, linkLimit);

  let linked = 0;
  let unpriced = 0;
  let unmatched = 0;
  const unmatchedNames: string[] = [];
  const linkedIds = new Set<string>();
  await pool(batch, 2, async (row) => {
    try {
      const outcome = await linkRow(row, rate);
      if (outcome === "none") {
        unmatched += 1;
        unmatchedNames.push(row.sku);
        return;
      }
      linked += 1;
      if (outcome === "linked") unpriced += 1;
      else linkedIds.add(row.id); // already priced by the link itself
    } catch {
      // Leave it unattempted so the next run retries (e.g. network blip).
    }
  });

  if (opts.skipPricing) {
    return {
      checked: 0,
      updated: 0,
      failed: 0,
      linked,
      unpriced,
      unmatched,
      unmatchedNames,
      remainingToLink: Math.max(0, queue.length - batch.length),
      rate,
      at: new Date().toISOString(),
    };
  }

  // ----- price phase -----
  const dueBefore = new Date(Date.now() - maxAgeMs);
  const staleFilter = force
    ? {}
    : { OR: [{ marketPriceUpdatedAt: null }, { marketPriceUpdatedAt: { lt: dueBefore } }] };
  const [sealedLinked, singlesLinked] = await Promise.all([
    prisma.sealedProduct.findMany({
      where: { priceSource: { not: null }, ...staleFilter },
      select: { id: true, priceSource: true, priceSourceLabel: true, marketPrice: true },
    }),
    prisma.singleCard.findMany({
      where: { priceSource: { not: null }, status: { not: "SOLD" }, ...staleFilter },
      select: { id: true, priceSource: true, priceSourceLabel: true, marketPrice: true },
    }),
  ]);

  const due = [
    ...sealedLinked.map((p) => ({ ...p, kind: "SEALED" as Kind, source: p.priceSource! })),
    ...singlesLinked.map((c) => ({ ...c, kind: "SINGLE" as Kind, source: c.priceSource! })),
  ].filter((item) => !linkedIds.has(item.id));

  let updated = 0;
  let failed = 0;
  await pool(due, 3, async (item) => {
    const quote = await fetchPriceQuote(item.source);
    if (quote === null) {
      // A product that never had a price simply has none yet; one that had a price lost its source for now.
      if (item.marketPrice != null) failed += 1;
      return;
    }
    const data: { marketPrice: number; marketPriceUpdatedAt: Date; priceSourceLabel?: string | null } = {
      marketPrice: usdToVnd(quote.usd, rate),
      marketPriceUpdatedAt: new Date(),
    };
    const label = relabel(item.priceSourceLabel, quote.basis);
    if (label !== item.priceSourceLabel) data.priceSourceLabel = label;
    if (item.kind === "SEALED") await prisma.sealedProduct.update({ where: { id: item.id }, data });
    else await prisma.singleCard.update({ where: { id: item.id }, data });
    updated += 1;
  });

  return {
    checked: due.length,
    updated,
    failed,
    linked,
    unpriced,
    unmatched,
    unmatchedNames,
    remainingToLink: Math.max(0, queue.length - batch.length),
    rate,
    at: new Date().toISOString(),
  };
}
