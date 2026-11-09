import { prisma } from "@/lib/prisma";
import { strip } from "@/lib/chat-payment";
import { CONFIDENT_SCORE, LISTED_PRICE_NOTE } from "@/lib/tcgplayer/constants";

// "Which product has the highest / lowest expected profit right now?" — a deterministic ranking of the stock the shop
// holds: US market price (already converted to VND by the price tracker) against the WACC cost of the same product.
// The sorting and arithmetic live here, so the model never has to do them.

const DAY = 24 * 3600 * 1000;
const STALE_PRICE_DAYS = 7;
const num = (v: unknown) => Number(v ?? 0);
const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export type RankMetric = "total" | "unit" | "percent";
export type RankOrder = "highest" | "lowest";

export interface RankInput {
  /** total = lãi dự kiến cả lô (mặc định) · unit = lãi trên 1 sản phẩm · percent = % trên giá vốn */
  metric?: RankMetric;
  /** highest = lãi cao nhất trước · lowest = lỗ nhiều nhất / lãi thấp nhất trước */
  order?: RankOrder;
  /** Số dòng trả về (1-20, mặc định 5) */
  limit?: number;
  /** Chỉ một dòng game, ví dụ "Pokémon" */
  game?: string;
  /** Chỉ sản phẩm có tên hoặc SKU chứa các từ này */
  query?: string;
  /** Chỉ sản phẩm đang tồn từ số lượng này trở lên (mặc định 1) */
  minQuantity?: number;
  /** Phí bán dự tính (% giá bán: phí sàn, ship...) trừ vào giá thị trường (0-50, mặc định 0) */
  sellingCostPct?: number;
}

export interface RankedProduct {
  rank: number;
  kind: "sealed" | "single";
  sku: string;
  name: string;
  game: string;
  quantity: number;
  /** Giá vốn bình quân WACC của 1 sản phẩm (VND) */
  unitCost: number;
  /** Giá thị trường US của 1 sản phẩm (VND), sau khi trừ phí bán dự tính nếu có */
  unitMarket: number;
  unitProfit: number;
  totalProfit: number;
  profitPct: number | null;
  priceUpdatedAt: string | null;
  /** Điều cần kiểm tra trước khi tin con số này */
  caveats: string[];
}

export interface ProductRanking {
  basis: string;
  metric: RankMetric;
  order: RankOrder;
  sellingCostPct: number;
  filters: { game: string | null; query: string | null; minQuantity: number };
  ranked: RankedProduct[];
  /**
   * Khi sản phẩm đứng đầu có cảnh báo về độ tin cậy của giá: sản phẩm đứng đầu trong nhóm KHÔNG có cảnh báo
   * (rank = vị trí của nó trong toàn bộ xếp hạng). Null khi sản phẩm đứng đầu đã đáng tin hoặc không có sản phẩm nào đáng tin.
   */
  topReliable: RankedProduct | null;
  /** Số sản phẩm có giá thị trường nằm trong phạm vi lọc */
  considered: number;
  profitable: number;
  losing: number;
  /** Tổng lãi / lỗ dự kiến của mọi sản phẩm trong phạm vi lọc */
  totalExpectedProfit: number;
  excluded: { unpricedSkus: number; unpricedCapital: number; unpricedExamples: string[]; belowMinQuantity: number };
  notes: string[];
}

const BASIS =
  "Lãi dự kiến = giá thị trường TCGplayer US (đã quy ra VND) − giá vốn bình quân WACC, nhân số lượng tồn. Đây là lãi tạm tính trên giấy: chỉ thành lãi thật khi bán được ở giá đó, và chưa trừ phí sàn, ship, thuế (trừ khi đặt phí bán dự tính).";

function sortKey(p: RankedProduct, metric: RankMetric): number | null {
  if (metric === "unit") return p.unitProfit;
  if (metric === "percent") return p.profitPct;
  return p.totalProfit;
}

export async function rankProducts(input: RankInput = {}, now = new Date()): Promise<ProductRanking> {
  const metric: RankMetric = input.metric ?? "total";
  const order: RankOrder = input.order ?? "highest";
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 5), 1), 20);
  const minQuantity = Math.max(Math.floor(input.minQuantity ?? 1), 1);
  const sellingCostPct = Math.min(Math.max(input.sellingCostPct ?? 0, 0), 50);
  // "Yu-Gi-Oh!" and "Yugioh" are the same game: compare letters and digits only.
  const squash = (s: string) => strip(s).replace(/[^a-z0-9]/g, "");
  const gameFilter = input.game?.trim() ? squash(input.game) : null;
  const queryTokens = input.query?.trim() ? strip(input.query.trim()).split(/\s+/).filter(Boolean) : [];

  const select = {
    sku: true,
    quantity: true,
    costPrice: true,
    marketPrice: true,
    marketPriceUpdatedAt: true,
    priceSourceLabel: true,
    priceMatchScore: true,
    game: true,
  } as const;
  const [sealed, singles] = await Promise.all([
    prisma.sealedProduct.findMany({ where: { quantity: { gt: 0 } }, select: { ...select, name: true } }),
    prisma.singleCard.findMany({ where: { status: { not: "SOLD" }, quantity: { gt: 0 } }, select: { ...select, cardName: true } }),
  ]);

  type Row = { kind: "sealed" | "single"; sku: string; name: string; game: string; qty: number; cost: number; market: number | null; marketAt: Date | null; label: string | null; score: number | null };
  const rows: Row[] = [
    ...sealed.map((p): Row => ({ kind: "sealed", sku: p.sku, name: p.name, game: p.game?.trim() || "Khác", qty: p.quantity, cost: num(p.costPrice), market: p.marketPrice == null ? null : num(p.marketPrice), marketAt: p.marketPriceUpdatedAt, label: p.priceSourceLabel, score: p.priceMatchScore })),
    ...singles.map((c): Row => ({ kind: "single", sku: c.sku, name: c.cardName, game: c.game?.trim() || "Khác", qty: c.quantity, cost: num(c.costPrice), market: c.marketPrice == null ? null : num(c.marketPrice), marketAt: c.marketPriceUpdatedAt, label: c.priceSourceLabel, score: c.priceMatchScore })),
  ];

  const inScope = rows.filter((r) => {
    if (gameFilter && !squash(r.game).includes(gameFilter)) return false;
    if (queryTokens.length > 0) {
      const hay = strip(`${r.name} ${r.sku}`);
      if (!queryTokens.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  const enough = inScope.filter((r) => r.qty >= minQuantity);
  const priced = enough.filter((r) => r.market != null);
  const unpriced = enough.filter((r) => r.market == null);

  const staleCut = now.getTime() - STALE_PRICE_DAYS * DAY;
  const items: RankedProduct[] = priced.map((r) => {
    const gross = r.market as number;
    const unitMarket = gross * (1 - sellingCostPct / 100);
    const unitProfit = unitMarket - r.cost;
    const caveats: string[] = [];
    if (!r.marketAt) caveats.push("không rõ ngày cập nhật giá");
    else if (r.marketAt.getTime() < staleCut) caveats.push(`giá đã ${Math.floor((now.getTime() - r.marketAt.getTime()) / DAY)} ngày chưa cập nhật`);
    if (r.score != null && r.score < CONFIDENT_SCORE) caveats.push(`khớp giá chưa chắc chắn (${Math.round(r.score * 100)}%), nên kiểm tra lại`);
    if (r.label?.endsWith(LISTED_PRICE_NOTE)) caveats.push("giá niêm yết, chưa có giao dịch thật");
    if (r.cost > 0) {
      const ratio = gross / r.cost;
      if (ratio > 2.2 || ratio < 0.45) caveats.push("giá thị trường lệch rất xa giá vốn, nên kiểm tra khớp giá hoặc giá vốn");
    }
    return {
      rank: 0,
      kind: r.kind,
      sku: r.sku,
      name: r.name,
      game: r.game,
      quantity: r.qty,
      unitCost: round(r.cost),
      unitMarket: round(unitMarket),
      unitProfit: round(unitProfit),
      totalProfit: round(unitProfit * r.qty),
      profitPct: r.cost > 0 ? round((unitProfit / r.cost) * 100, 1) : null,
      priceUpdatedAt: r.marketAt ? r.marketAt.toISOString() : null,
      caveats,
    };
  });

  const dir = order === "highest" ? -1 : 1;
  items.sort((a, b) => {
    const ka = sortKey(a, metric);
    const kb = sortKey(b, metric);
    if (ka === null && kb === null) return a.name.localeCompare(b.name);
    if (ka === null) return 1; // no cost basis: the percentage is meaningless, keep these last
    if (kb === null) return -1;
    return (ka - kb) * dir || (a.totalProfit - b.totalProfit) * dir || a.name.localeCompare(b.name);
  });
  const ranked = items.slice(0, limit).map((p, i) => ({ ...p, rank: i + 1 }));
  const reliableIndex = items.findIndex((p) => p.caveats.length === 0);
  const topReliable = ranked.length > 0 && ranked[0].caveats.length > 0 && reliableIndex >= 0 ? { ...items[reliableIndex], rank: reliableIndex + 1 } : null;

  const profitable = items.filter((p) => p.totalProfit > 0).length;
  const losing = items.filter((p) => p.totalProfit < 0).length;
  const notes: string[] = [];
  if (items.length === 0) {
    notes.push(
      priced.length === 0 && enough.length > 0
        ? "Các sản phẩm trong phạm vi này chưa có giá thị trường nên chưa tính được lãi / lỗ dự kiến."
        : "Không có sản phẩm nào đang tồn khớp bộ lọc."
    );
  }
  if (order === "lowest" && items.length > 0 && losing === 0) notes.push("Không có sản phẩm nào lỗ dự kiến; đây là các sản phẩm lãi thấp nhất.");
  if (order === "highest" && items.length > 0 && profitable === 0) notes.push("Không có sản phẩm nào lãi dự kiến; đây là các sản phẩm lỗ ít nhất.");
  if (unpriced.length > 0) notes.push(`${unpriced.length} sản phẩm chưa có giá thị trường (vốn ${Math.round(unpriced.reduce((s, r) => s + r.cost * r.qty, 0)).toLocaleString("vi-VN")} ₫) nên không nằm trong xếp hạng.`);
  if (ranked.some((p) => p.caveats.length > 0)) notes.push("Một số dòng có cảnh báo về độ tin cậy của giá; kiểm tra trước khi quyết định nhập hoặc bán.");

  return {
    basis: sellingCostPct > 0 ? `${BASIS} Đã trừ ${sellingCostPct}% phí bán dự tính khỏi giá thị trường.` : BASIS,
    metric,
    order,
    sellingCostPct,
    filters: { game: input.game?.trim() || null, query: input.query?.trim() || null, minQuantity },
    ranked,
    topReliable,
    considered: items.length,
    profitable,
    losing,
    totalExpectedProfit: round(items.reduce((s, p) => s + p.totalProfit, 0)),
    excluded: {
      unpricedSkus: unpriced.length,
      unpricedCapital: round(unpriced.reduce((s, r) => s + r.cost * r.qty, 0)),
      unpricedExamples: unpriced.slice(0, 3).map((r) => r.name),
      belowMinQuantity: inScope.length - enough.length,
    },
    notes,
  };
}
