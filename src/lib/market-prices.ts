import { prisma } from "@/lib/prisma";
import {
  buildTcgSource,
  fetchTcgplayerUsd,
  parseTcgSource,
  tcgProductUrl,
} from "@/lib/tcgplayer/client";
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

/** USD market price for any stored source ("tcgplayer:…" or the legacy per-game APIs). */
export async function fetchUsdPrice(source: string): Promise<number | null> {
  const tcg = parseTcgSource(source);
  if (tcg) return (await fetchTcgplayerUsd(tcg))?.usd ?? null;

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
  const payload = { ...data, priceLinkAttemptedAt: new Date() };
  if (row.kind === "SEALED") {
    await prisma.sealedProduct.update({ where: { id: row.id }, data: payload });
  } else {
    await prisma.singleCard.update({ where: { id: row.id }, data: payload });
  }
}

function labelFor(c: TcgCandidate): string {
  return c.lineName === "Pokemon Japan" ? `${c.name} (JP)` : c.name;
}

async function linkRow(row: LinkableRow, rate: number): Promise<boolean> {
  const match =
    row.kind === "SEALED" ? await findSealedMatch(row.name, row.game) : await findSingleMatch(row.name, row.game);

  const none = { priceSource: null, priceSourceLabel: null, priceSourceUrl: null, priceMatchScore: null };
  if (!match) {
    await saveLink(row, none);
    return false;
  }

  const c = match.candidate;
  let printing = "Normal";
  let usd = c.marketPrice ?? c.medianPrice;
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
    }
  }
  if (usd == null || usd <= 0) {
    await saveLink(row, none);
    return false;
  }

  const vnd = usdToVnd(usd, rate);
  await saveLink(row, {
    priceSource: buildTcgSource(c, printing),
    priceSourceLabel: labelFor(c),
    priceSourceUrl: tcgProductUrl(c.productId),
    priceMatchScore: plausibilityCap(match.score, vnd, row.costPrice),
    marketPrice: vnd,
    marketPriceUpdatedAt: new Date(),
  });
  return true;
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
  unmatched: number; // looked up but nothing confident found
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
  const attemptFilter = { OR: [{ priceLinkAttemptedAt: null }, { priceLinkAttemptedAt: { lt: retryBefore } }] };

  const [sealedToLink, singlesToLink] = await Promise.all([
    prisma.sealedProduct.findMany({
      where: { priceSource: null, ...attemptFilter },
      select: { id: true, name: true, game: true, costPrice: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.singleCard.findMany({
      where: { priceSource: null, condition: "RAW", status: { not: "SOLD" }, ...attemptFilter },
      select: { id: true, cardName: true, game: true, costPrice: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const queue: LinkableRow[] = [
    ...sealedToLink.map((p) => ({
      id: p.id,
      kind: "SEALED" as const,
      name: p.name,
      game: p.game,
      costPrice: Number(p.costPrice),
    })),
    ...singlesToLink.map((c) => ({
      id: c.id,
      kind: "SINGLE" as const,
      name: c.cardName,
      game: c.game,
      costPrice: Number(c.costPrice),
    })),
  ];
  const batch = queue.slice(0, linkLimit);

  let linked = 0;
  let unmatched = 0;
  const linkedIds = new Set<string>();
  await pool(batch, 2, async (row) => {
    try {
      if (await linkRow(row, rate)) {
        linked += 1;
        linkedIds.add(row.id); // already priced by the link itself
      } else unmatched += 1;
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
      unmatched,
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
      select: { id: true, priceSource: true },
    }),
    prisma.singleCard.findMany({
      where: { priceSource: { not: null }, status: { not: "SOLD" }, ...staleFilter },
      select: { id: true, priceSource: true },
    }),
  ]);

  const due = [
    ...sealedLinked.map((p) => ({ id: p.id, kind: "SEALED" as Kind, source: p.priceSource! })),
    ...singlesLinked.map((c) => ({ id: c.id, kind: "SINGLE" as Kind, source: c.priceSource! })),
  ].filter((item) => !linkedIds.has(item.id));

  let updated = 0;
  let failed = 0;
  await pool(due, 3, async (item) => {
    const usd = await fetchUsdPrice(item.source);
    if (usd === null) {
      failed += 1;
      return;
    }
    const data = { marketPrice: usdToVnd(usd, rate), marketPriceUpdatedAt: new Date() };
    if (item.kind === "SEALED") await prisma.sealedProduct.update({ where: { id: item.id }, data });
    else await prisma.singleCard.update({ where: { id: item.id }, data });
    updated += 1;
  });

  return {
    checked: due.length,
    updated,
    failed,
    linked,
    unmatched,
    remainingToLink: Math.max(0, queue.length - batch.length),
    rate,
    at: new Date().toISOString(),
  };
}
