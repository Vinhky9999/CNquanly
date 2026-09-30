import { prisma } from "@/lib/prisma";

export interface GameOverviewEntry {
  game: string;
  totalValue: number;
  totalQuantity: number;
  skuCount: number;
  sealedSkuCount: number;
  singleSkuCount: number;
}

// Sealed: tính mọi SKU (kể cả đã hết hàng, vẫn là một mặt hàng trong danh mục).
// Single: bỏ qua thẻ đã bán hết (status SOLD), khớp với logic getInventoryValuation.
export async function getInventoryGameOverview(): Promise<GameOverviewEntry[]> {
  const [sealedProducts, singleCards] = await Promise.all([
    prisma.sealedProduct.findMany({ select: { game: true, quantity: true, costPrice: true } }),
    prisma.singleCard.findMany({
      where: { status: { not: "SOLD" } },
      select: { game: true, quantity: true, costPrice: true },
    }),
  ]);

  const map = new Map<string, GameOverviewEntry>();

  function bucket(game: string | null): GameOverviewEntry {
    const key = game?.trim() || "Khác";
    let entry = map.get(key);
    if (!entry) {
      entry = {
        game: key,
        totalValue: 0,
        totalQuantity: 0,
        skuCount: 0,
        sealedSkuCount: 0,
        singleSkuCount: 0,
      };
      map.set(key, entry);
    }
    return entry;
  }

  for (const p of sealedProducts) {
    const entry = bucket(p.game);
    entry.totalValue += Number(p.costPrice) * p.quantity;
    entry.totalQuantity += p.quantity;
    entry.skuCount += 1;
    entry.sealedSkuCount += 1;
  }

  for (const c of singleCards) {
    const entry = bucket(c.game);
    entry.totalValue += Number(c.costPrice) * c.quantity;
    entry.totalQuantity += c.quantity;
    entry.skuCount += 1;
    entry.singleSkuCount += 1;
  }

  return [...map.values()].sort((a, b) => b.totalValue - a.totalValue);
}
