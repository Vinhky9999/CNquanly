"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/session";
import { getUsdVndRate, refreshMarketPrices, type RefreshResult, usdToVnd } from "@/lib/market-prices";
import { searchForLinking } from "@/lib/tcgplayer/finder";
import { buildTcgSource, tcgProductUrl } from "@/lib/tcgplayer/client";

export async function refreshMarketPricesAction(
  force = false,
  skipPricing = false
): Promise<RefreshResult | { error: string }> {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Chưa đăng nhập" };

  const result = await refreshMarketPrices({ force, skipPricing });
  if (result.updated > 0 || result.linked > 0) {
    revalidatePath("/inventory");
  }
  return result;
}

export interface TcgplayerPick {
  productId: number;
  name: string;
  setName: string;
  lineName: string;
  usd: number | null;
  vnd: number | null;
  source: string;
  url: string;
  label: string;
}

/** Manual "link to TCGplayer" search (also accepts a pasted TCGplayer product link or id). */
export async function searchTcgplayerAction(
  query: string,
  game: string,
  kind: "SEALED" | "SINGLE"
): Promise<TcgplayerPick[] | { error: string }> {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Chưa đăng nhập" };

  const rows = await searchForLinking(query, game || null, kind === "SEALED" ? "sealed" : "card");
  const rate = await getUsdVndRate();

  return rows.map((c) => {
    const usd = c.marketPrice ?? c.medianPrice;
    return {
      productId: c.productId,
      name: c.name,
      setName: c.setName,
      lineName: c.lineName,
      usd,
      vnd: usd != null ? usdToVnd(usd, rate) : null,
      source: buildTcgSource(c, "Normal"),
      url: tcgProductUrl(c.productId),
      label: c.lineName === "Pokemon Japan" ? `${c.name} (JP)` : c.name,
    };
  });
}
