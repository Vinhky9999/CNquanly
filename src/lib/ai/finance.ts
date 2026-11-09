import { prisma } from "@/lib/prisma";
import { getDebtSummary } from "@/lib/debt-summary";
import { getInventoryGameOverview } from "@/lib/inventory-overview";
import { getPortfolioSummary } from "@/lib/portfolio";
import { resolvePeriod, type Period } from "@/lib/ai/period";

const num = (v: unknown) => Number(v ?? 0);

export interface PeriodFinance {
  period: string;
  from: string;
  to: string;
  /** Tiền thật vào quỹ: khoản Thu loại bán hàng + thu chấm điểm. */
  revenue: { sales: number; grading: number; total: number };
  /** Chi kinh doanh: nhập hàng + chi phí chấm điểm. Rút tiền, trả nợ không tính. */
  expense: { purchases: number; grading: number; total: number };
  otherCash: { withdrawals: number; debtRepaid: number; debtCollected: number; adjustmentsIn: number; adjustmentsOut: number };
  salesOrders: { count: number; grossAmount: number };
  /** Cùng quy tắc với báo cáo tháng ở Tổng quan: lãi bán hàng (đã trừ đơn lỗ) + lãi chấm điểm đã thu + điều chỉnh tính vào lãi. */
  profit: { net: number; salesProfit: number; salesLoss: number; gradingProfitCollected: number; flaggedAdjustments: number };
  creditSales: { count: number; amount: number };
}

/** Finance figures of one period; the profit rules mirror the dashboard's monthly report and the Excel export. */
export async function getPeriodFinance(period: Period): Promise<PeriodFinance> {
  const inRange = { gte: period.start, lt: period.end };
  const [ledger, sales, creditDebts] = await Promise.all([
    prisma.cashLedgerEntry.findMany({
      where: { createdAt: inRange },
      select: { type: true, amount: true, countsAsProfit: true, gradingIncome: { select: { markup: true } } },
    }),
    prisma.transaction.findMany({
      where: { type: "SALE", transactionDate: inRange },
      select: { totalAmount: true, totalCost: true },
    }),
    prisma.debt.findMany({
      where: { type: "ADVANCED_TO_PERSON", createdAt: inRange, transactionId: { not: null } },
      select: { amount: true },
    }),
  ]);

  const sum = (types: string[], sign: "pos" | "neg" | "any" = "any") =>
    ledger
      .filter((e) => types.includes(e.type) && (sign === "any" || (sign === "pos" ? num(e.amount) > 0 : num(e.amount) < 0)))
      .reduce((s, e) => s + Math.abs(num(e.amount)), 0);

  const salesRev = sum(["SALE"]);
  const gradingRev = sum(["GRADING_INCOME"]);
  const purchases = sum(["PURCHASE"]);
  const gradingCost = sum(["GRADING_COST"]);

  let salesProfit = 0;
  let salesLoss = 0;
  for (const t of sales) {
    if (t.totalCost == null) continue;
    const p = num(t.totalAmount) - num(t.totalCost);
    salesProfit += p;
    if (p < 0) salesLoss += -p;
  }
  const gradingProfit = ledger.filter((e) => e.type === "GRADING_INCOME" && e.gradingIncome).reduce((s, e) => s + num(e.gradingIncome!.markup), 0);
  const flagged = ledger.filter((e) => e.countsAsProfit && num(e.amount) > 0).reduce((s, e) => s + num(e.amount), 0);

  return {
    period: period.label,
    from: period.start.toISOString(),
    to: period.end.toISOString(),
    revenue: { sales: salesRev, grading: gradingRev, total: salesRev + gradingRev },
    expense: { purchases, grading: gradingCost, total: purchases + gradingCost },
    otherCash: {
      withdrawals: sum(["WITHDRAWAL"]),
      debtRepaid: sum(["DEBT_REPAYMENT"]),
      debtCollected: sum(["DEBT_COLLECTION"]),
      adjustmentsIn: sum(["MANUAL_ADJUSTMENT"], "pos"),
      adjustmentsOut: sum(["MANUAL_ADJUSTMENT"], "neg"),
    },
    salesOrders: { count: sales.length, grossAmount: sales.reduce((s, t) => s + num(t.totalAmount), 0) },
    profit: { net: salesProfit + gradingProfit + flagged, salesProfit, salesLoss, gradingProfitCollected: gradingProfit, flaggedAdjustments: flagged },
    creditSales: { count: creditDebts.length, amount: creditDebts.reduce((s, d) => s + num(d.amount), 0) },
  };
}

export interface OverviewSnapshot {
  generatedAt: string;
  portfolio: {
    cash: number;
    inventoryCostWacc: number;
    receivable: number;
    payable: number;
    /** Tiền mặt + Kho + Công nợ phải thu − Công nợ phải trả */
    totalValue: number;
  };
  inventory: { skuCount: number; pricedSkuCount: number; marketValueUS: number; unrealizedPnl: number; unrealizedPnlPct: number };
  debts: { openCount: number };
  today: { revenue: number; netProfit: number; salesOrders: number };
  thisMonth: { revenue: number; expense: number; netProfit: number; salesOrders: number };
  customers: number;
  grading: { openOrders: number; cardsInProgress: number; uncollectedAmount: number };
}

/** Compact picture of the shop, used both as the assistant's context and by the "overview" tool. */
export async function getOverviewSnapshot(now = new Date()): Promise<OverviewSnapshot> {
  const today = resolvePeriod("today", now)!;
  const month = resolvePeriod("this_month", now)!;
  const [portfolio, debts, games, todayFin, monthFin, customers, grading] = await Promise.all([
    getPortfolioSummary(),
    getDebtSummary(),
    getInventoryGameOverview(),
    getPeriodFinance(today),
    getPeriodFinance(month),
    prisma.customer.count(),
    prisma.gradingSubmission.findMany({ select: { status: true, quantity: true, chargeAmount: true, incomeEntryId: true } }),
  ]);

  const inv = games.reduce(
    (a, g) => ({ sku: a.sku + g.skuCount, priced: a.priced + g.pricedSkuCount, market: a.market + g.marketValue, pricedCost: a.pricedCost + g.pricedCost }),
    { sku: 0, priced: 0, market: 0, pricedCost: 0 }
  );
  const unrealized = inv.market - inv.pricedCost;
  const open = grading.filter((g) => g.status !== "COMPLETED");

  return {
    generatedAt: now.toISOString(),
    portfolio: {
      cash: portfolio.liquidCash,
      inventoryCostWacc: portfolio.inventoryCostValue,
      receivable: portfolio.debtReceivable,
      payable: portfolio.debtPayable,
      totalValue: portfolio.totalPortfolioValue,
    },
    inventory: {
      skuCount: inv.sku,
      pricedSkuCount: inv.priced,
      marketValueUS: inv.market,
      unrealizedPnl: unrealized,
      unrealizedPnlPct: inv.pricedCost > 0 ? (unrealized / inv.pricedCost) * 100 : 0,
    },
    debts: { openCount: debts.unpaidCount },
    today: { revenue: todayFin.revenue.total, netProfit: todayFin.profit.net, salesOrders: todayFin.salesOrders.count },
    thisMonth: { revenue: monthFin.revenue.total, expense: monthFin.expense.total, netProfit: monthFin.profit.net, salesOrders: monthFin.salesOrders.count },
    customers,
    grading: {
      openOrders: open.length,
      cardsInProgress: open.reduce((s, g) => s + g.quantity, 0),
      uncollectedAmount: grading.filter((g) => !g.incomeEntryId).reduce((s, g) => s + num(g.chargeAmount), 0),
    },
  };
}
