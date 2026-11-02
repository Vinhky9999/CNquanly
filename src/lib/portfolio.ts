import { prisma } from "@/lib/prisma";
import { getDebtSummary } from "@/lib/debt-summary";

export async function getLiquidCash(): Promise<number> {
  const latest = await prisma.cashLedgerEntry.findFirst({
    orderBy: { createdAt: "desc" },
  });
  return latest ? Number(latest.balanceAfter) : 0;
}

export async function getInventoryValuation() {
  const [sealedProducts, singleCards] = await Promise.all([
    prisma.sealedProduct.findMany({ select: { quantity: true, costPrice: true } }),
    prisma.singleCard.findMany({
      where: { status: { not: "SOLD" } },
      select: { costPrice: true, condition: true, quantity: true },
    }),
  ]);

  const sealedCost = sealedProducts.reduce((sum, p) => sum + Number(p.costPrice) * p.quantity, 0);
  const singlesCost = singleCards.reduce((sum, c) => sum + Number(c.costPrice) * c.quantity, 0);

  return {
    costValue: sealedCost + singlesCost,
    sealedCost,
    singlesCost,
    sealedSkuCount: sealedProducts.length,
    rawCount: singleCards.filter((c) => c.condition === "RAW").length,
    gradedCount: singleCards.filter((c) => c.condition === "GRADED").length,
  };
}

/**
 * Tổng giá trị danh mục = Tiền mặt + Giá trị kho hàng (vốn WACC) − Công nợ phải trả.
 * Công nợ phải trả là số tiền CardNest còn nợ người đã ứng tiền; nợ phải thu không được cộng vào công thức này.
 */
export const portfolioValue = (liquidCash: number, inventoryCostValue: number, debtPayable: number) =>
  liquidCash + inventoryCostValue - debtPayable;

export async function getPortfolioSummary() {
  const [liquidCash, inventory, debts] = await Promise.all([getLiquidCash(), getInventoryValuation(), getDebtSummary()]);

  return {
    liquidCash,
    inventoryCostValue: inventory.costValue,
    debtPayable: debts.totalOwedByShop,
    totalPortfolioValue: portfolioValue(liquidCash, inventory.costValue, debts.totalOwedByShop),
    sealedSkuCount: inventory.sealedSkuCount,
    rawCount: inventory.rawCount,
    gradedCount: inventory.gradedCount,
  };
}
