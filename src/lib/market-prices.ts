import { prisma } from "@/lib/prisma";

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

/** USD market price for a source like "pokemontcg:base1-4"; null when unavailable. */
export async function fetchUsdPrice(source: string): Promise<number | null> {
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

export interface RefreshResult {
  checked: number;
  updated: number;
  failed: number;
  rate: number;
  at: string;
}

/**
 * Re-prices every Single card that has a priceSource. Prices newer than
 * `maxAgeMs` are skipped unless `force` is set, keeping external API usage low.
 */
export async function refreshMarketPrices(opts: { force?: boolean; maxAgeMs?: number } = {}): Promise<RefreshResult> {
  const maxAgeMs = opts.maxAgeMs ?? 10 * 60 * 1000;
  const cards = await prisma.singleCard.findMany({
    where: { priceSource: { not: null }, status: { not: "SOLD" } },
    select: { id: true, priceSource: true, marketPriceUpdatedAt: true },
  });

  const due = cards.filter(
    (c) => opts.force || !c.marketPriceUpdatedAt || Date.now() - c.marketPriceUpdatedAt.getTime() > maxAgeMs
  );
  const rate = await getUsdVndRate();
  let updated = 0;
  let failed = 0;

  // Small concurrency so free public APIs aren't hammered.
  const queue = [...due];
  async function worker() {
    while (queue.length) {
      const card = queue.shift()!;
      const usd = await fetchUsdPrice(card.priceSource!);
      if (usd === null) {
        failed += 1;
        continue;
      }
      await prisma.singleCard.update({
        where: { id: card.id },
        data: { marketPrice: Math.round((usd * rate) / 1000) * 1000, marketPriceUpdatedAt: new Date() },
      });
      updated += 1;
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  return { checked: due.length, updated, failed, rate, at: new Date().toISOString() };
}
