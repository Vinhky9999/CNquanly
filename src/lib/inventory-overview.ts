import { prisma } from "@/lib/prisma";

export interface GameOverviewEntry {
  game: string;
  totalValue: number; // vốn (số lượng x giá vốn bình quân) của mọi SKU
  totalQuantity: number;
  skuCount: number;
  sealedSkuCount: number;
  singleSkuCount: number;
  // Định giá thị trường — chỉ tính các SKU đã nhập Giá thị trường, để so sánh cùng tập hàng.
  marketValue: number; // số lượng x giá thị trường
  pricedCost: number; // vốn của đúng các SKU đã có giá thị trường
  pricedSkuCount: number;
}

// Sealed: tính mọi SKU (kể cả đã hết hàng, vẫn là một mặt hàng trong danh mục).
// Single: bỏ qua thẻ đã bán hết (status SOLD), khớp với logic getInventoryValuation.
export async function getInventoryGameOverview(): Promise<GameOverviewEntry[]> {
  const select = { game: true, quantity: true, costPrice: true, marketPrice: true } as const;
  const [sealedProducts, singleCards] = await Promise.all([
    prisma.sealedProduct.findMany({ select }),
    prisma.singleCard.findMany({ where: { status: { not: "SOLD" } }, select }),
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
        marketValue: 0,
        pricedCost: 0,
        pricedSkuCount: 0,
      };
      map.set(key, entry);
    }
    return entry;
  }

  function add(
    item: { game: string | null; quantity: number; costPrice: unknown; marketPrice: unknown },
    kind: "sealed" | "single"
  ) {
    const entry = bucket(item.game);
    const cost = Number(item.costPrice) * item.quantity;
    entry.totalValue += cost;
    entry.totalQuantity += item.quantity;
    entry.skuCount += 1;
    if (kind === "sealed") entry.sealedSkuCount += 1;
    else entry.singleSkuCount += 1;

    if (item.marketPrice != null) {
      entry.marketValue += Number(item.marketPrice) * item.quantity;
      entry.pricedCost += cost;
      entry.pricedSkuCount += 1;
    }
  }

  for (const p of sealedProducts) add(p, "sealed");
  for (const c of singleCards) add(c, "single");

  return [...map.values()].sort((a, b) => b.totalValue - a.totalValue);
}
