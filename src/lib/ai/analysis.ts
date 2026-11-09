import { prisma } from "@/lib/prisma";
import { getDebtsByPerson } from "@/lib/debt-summary";
import { getPortfolioSummary } from "@/lib/portfolio";
import { getPeriodFinance, type PeriodFinance } from "@/lib/ai/finance";
import { resolvePeriod } from "@/lib/ai/period";

// Deep analysis building blocks. Everything is computed from the live database (VND, Vietnam-time months) and is
// deterministic: the model reads these figures, it never has to do the arithmetic itself.

const DAY = 24 * 3600 * 1000;
const num = (v: unknown) => Number(v ?? 0);
const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100, 1) : null);

/** "16730 ngày" reads as noise; past ten years the number only says "far too slow". */
export const formatDays = (days: number) => (days > 3650 ? "hơn 10 năm" : `${days} ngày`);

// ---------------------------------------------------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------------------------------------------------
export interface MonthlyPoint {
  month: string;
  partial: boolean;
  revenue: number;
  expense: number;
  netProfit: number;
  salesOrders: number;
  salesGross: number;
  salesProfit: number;
  salesMarginPct: number | null;
  gradingProfit: number;
  creditSales: number;
}

export interface FinancialTrends {
  months: MonthlyPoint[];
  summary: {
    monthsWithActivity: number;
    avgRevenue: number;
    avgNetProfit: number;
    bestMonth: { month: string; netProfit: number } | null;
    worstMonth: { month: string; netProfit: number } | null;
    last3VsPrev3: { revenueChangePct: number | null; netProfitChangePct: number | null } | null;
    note: string;
  };
}

/** Month-by-month results, newest last. The running month is flagged `partial`. */
export async function getFinancialTrends(monthCount = 12, now = new Date()): Promise<FinancialTrends> {
  const n = Math.min(Math.max(Math.floor(monthCount), 3), 24);
  const shifted = new Date(now.getTime() + 7 * 3600 * 1000);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const currentKey = keys[keys.length - 1];

  const finances: PeriodFinance[] = [];
  for (let i = 0; i < keys.length; i += 6) {
    finances.push(...(await Promise.all(keys.slice(i, i + 6).map((k) => getPeriodFinance(resolvePeriod(k, now)!)))));
  }

  const months: MonthlyPoint[] = finances.map((f, i) => ({
    month: keys[i],
    partial: keys[i] === currentKey,
    revenue: f.revenue.total,
    expense: f.expense.total,
    netProfit: f.profit.net,
    salesOrders: f.salesOrders.count,
    salesGross: f.salesOrders.grossAmount,
    salesProfit: f.profit.salesProfit,
    salesMarginPct: pct(f.profit.salesProfit, f.salesOrders.grossAmount),
    gradingProfit: f.profit.gradingProfitCollected,
    creditSales: f.creditSales.amount,
  }));

  const active = months.filter((m) => m.revenue > 0 || m.salesOrders > 0 || m.expense > 0);
  const full = active.filter((m) => !m.partial);
  const sum = (arr: MonthlyPoint[], pick: (m: MonthlyPoint) => number) => arr.reduce((s, m) => s + pick(m), 0);
  const change = (cur: number, prev: number) => (prev !== 0 ? round(((cur - prev) / Math.abs(prev)) * 100, 1) : null);

  let last3VsPrev3: FinancialTrends["summary"]["last3VsPrev3"] = null;
  if (full.length >= 6) {
    const last3 = full.slice(-3);
    const prev3 = full.slice(-6, -3);
    last3VsPrev3 = {
      revenueChangePct: change(sum(last3, (m) => m.revenue), sum(prev3, (m) => m.revenue)),
      netProfitChangePct: change(sum(last3, (m) => m.netProfit), sum(prev3, (m) => m.netProfit)),
    };
  }
  const ranked = [...full].sort((a, b) => b.netProfit - a.netProfit);

  return {
    months,
    summary: {
      monthsWithActivity: active.length,
      avgRevenue: full.length ? round(sum(full, (m) => m.revenue) / full.length) : 0,
      avgNetProfit: full.length ? round(sum(full, (m) => m.netProfit) / full.length) : 0,
      bestMonth: ranked.length ? { month: ranked[0].month, netProfit: ranked[0].netProfit } : null,
      worstMonth: ranked.length ? { month: ranked[ranked.length - 1].month, netProfit: ranked[ranked.length - 1].netProfit } : null,
      last3VsPrev3,
      note:
        full.length < 3
          ? "Dữ liệu chưa đủ 3 tháng đầy đủ nên xu hướng và tính mùa vụ chưa đáng tin."
          : full.length < 12
            ? "Chưa đủ 12 tháng nên chưa thể kết luận tính mùa vụ theo năm."
            : "Đủ 12 tháng để xem tính mùa vụ.",
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Inventory health
// ---------------------------------------------------------------------------------------------------------------------
export interface StockItem {
  sku: string;
  name: string;
  game: string;
  quantity: number;
  capital: number;
  capitalSharePct: number | null;
  marketPrice: number | null;
  unrealizedPnl: number | null;
  daysSinceLastMovement: number;
  neverSold: boolean;
  unitsSold30d: number;
  unitsSold90d: number;
  /** Số ngày bán hết tồn hiện tại nếu giữ tốc độ bán 90 ngày qua; null = chưa bán được trong 90 ngày */
  daysOfCover: number | null;
}

export interface InventoryHealth {
  totalCapital: number;
  skuCount: number;
  units: number;
  byGame: { game: string; capital: number; sharePct: number | null; skus: number; marketValue: number; unrealizedPnl: number }[];
  concentration: { top1SharePct: number | null; top3SharePct: number | null; topItems: StockItem[] };
  aging: { bucket: string; capital: number; sharePct: number | null; skus: number }[];
  pricing: { unpricedCapital: number; unpricedSharePct: number | null; staleMarketCapital: number; staleMarketSharePct: number | null; staleAfterDays: number };
  marketVsCost: { pricedCost: number; pricedMarketValue: number; unrealizedPnl: number; unrealizedPnlPct: number | null; winners: StockItem[]; losers: StockItem[] };
  turnover: { cogsLast90d: number; annualizedTurnover: number | null; daysOfInventory: number | null };
  slowMovers: StockItem[];
}

const AGING_BUCKETS = [
  { label: "0-30 ngày", max: 30 },
  { label: "31-60 ngày", max: 60 },
  { label: "61-90 ngày", max: 90 },
  { label: "91-180 ngày", max: 180 },
  { label: "trên 180 ngày", max: Infinity },
];
const STALE_PRICE_DAYS = 7;

export async function getInventoryHealth(now = new Date()): Promise<InventoryHealth> {
  const since90 = now.getTime() - 90 * DAY;
  const since30 = now.getTime() - 30 * DAY;
  const select = { id: true, sku: true, quantity: true, costPrice: true, marketPrice: true, marketPriceUpdatedAt: true, createdAt: true, game: true } as const;
  const [sealed, singles, saleItems] = await Promise.all([
    prisma.sealedProduct.findMany({ where: { quantity: { gt: 0 } }, select: { ...select, name: true } }),
    prisma.singleCard.findMany({ where: { status: { not: "SOLD" }, quantity: { gt: 0 } }, select: { ...select, cardName: true } }),
    prisma.transactionItem.findMany({
      where: { transaction: { type: "SALE" } },
      select: { sealedProductId: true, singleCardId: true, quantity: true, costBasis: true, transaction: { select: { transactionDate: true } } },
    }),
  ]);

  const lastSale = new Map<string, number>();
  const units30 = new Map<string, number>();
  const units90 = new Map<string, number>();
  let cogs90 = 0;
  for (const it of saleItems) {
    const id = it.sealedProductId ?? it.singleCardId;
    if (!id) continue;
    const at = it.transaction.transactionDate.getTime();
    if (at > (lastSale.get(id) ?? 0)) lastSale.set(id, at);
    if (at >= since90) {
      units90.set(id, (units90.get(id) ?? 0) + it.quantity);
      cogs90 += num(it.costBasis);
    }
    if (at >= since30) units30.set(id, (units30.get(id) ?? 0) + it.quantity);
  }

  type Row = { id: string; sku: string; name: string; game: string; qty: number; cost: number; market: number | null; marketAt: Date | null; since: number; neverSold: boolean };
  const rows: Row[] = [
    ...sealed.map((p) => ({ id: p.id, sku: p.sku, name: p.name, game: p.game?.trim() || "Khác", qty: p.quantity, cost: num(p.costPrice), market: p.marketPrice == null ? null : num(p.marketPrice), marketAt: p.marketPriceUpdatedAt, since: lastSale.get(p.id) ?? p.createdAt.getTime(), neverSold: !lastSale.has(p.id) })),
    ...singles.map((c) => ({ id: c.id, sku: c.sku, name: c.cardName, game: c.game?.trim() || "Khác", qty: c.quantity, cost: num(c.costPrice), market: c.marketPrice == null ? null : num(c.marketPrice), marketAt: c.marketPriceUpdatedAt, since: lastSale.get(c.id) ?? c.createdAt.getTime(), neverSold: !lastSale.has(c.id) })),
  ];

  const totalCapital = rows.reduce((s, r) => s + r.cost * r.qty, 0);
  const toItem = (r: Row): StockItem => {
    const rate = (units90.get(r.id) ?? 0) / 90;
    return {
      sku: r.sku,
      name: r.name,
      game: r.game,
      quantity: r.qty,
      capital: round(r.cost * r.qty),
      capitalSharePct: pct(r.cost * r.qty, totalCapital),
      marketPrice: r.market == null ? null : round(r.market),
      unrealizedPnl: r.market == null ? null : round((r.market - r.cost) * r.qty),
      daysSinceLastMovement: Math.floor((now.getTime() - r.since) / DAY),
      neverSold: r.neverSold,
      unitsSold30d: units30.get(r.id) ?? 0,
      unitsSold90d: units90.get(r.id) ?? 0,
      daysOfCover: rate > 0 ? round(r.qty / rate) : null,
    };
  };

  const items = rows.map((r) => ({ row: r, item: toItem(r) }));
  const byCapital = [...items].sort((a, b) => b.item.capital - a.item.capital);

  const games = new Map<string, { capital: number; skus: number; marketValue: number; pricedCost: number }>();
  for (const { row } of items) {
    const g = games.get(row.game) ?? { capital: 0, skus: 0, marketValue: 0, pricedCost: 0 };
    g.capital += row.cost * row.qty;
    g.skus += 1;
    if (row.market != null) {
      g.marketValue += row.market * row.qty;
      g.pricedCost += row.cost * row.qty;
    }
    games.set(row.game, g);
  }

  const aging = AGING_BUCKETS.map((b, i) => {
    const min = i === 0 ? -1 : AGING_BUCKETS[i - 1].max;
    const inBucket = items.filter(({ item }) => item.daysSinceLastMovement > min && item.daysSinceLastMovement <= b.max);
    const capital = inBucket.reduce((s, { row }) => s + row.cost * row.qty, 0);
    return { bucket: b.label, capital: round(capital), sharePct: pct(capital, totalCapital), skus: inBucket.length };
  });

  const unpriced = rows.filter((r) => r.market == null).reduce((s, r) => s + r.cost * r.qty, 0);
  const staleCut = now.getTime() - STALE_PRICE_DAYS * DAY;
  const stale = rows.filter((r) => r.market != null && (!r.marketAt || r.marketAt.getTime() < staleCut)).reduce((s, r) => s + r.cost * r.qty, 0);

  const priced = items.filter(({ row }) => row.market != null);
  const pricedCost = priced.reduce((s, { row }) => s + row.cost * row.qty, 0);
  const pricedMarket = priced.reduce((s, { row }) => s + (row.market as number) * row.qty, 0);
  const byPnl = [...priced].sort((a, b) => (b.item.unrealizedPnl ?? 0) - (a.item.unrealizedPnl ?? 0));

  const top3 = byCapital.slice(0, 3).reduce((s, { item }) => s + item.capital, 0);

  return {
    totalCapital: round(totalCapital),
    skuCount: rows.length,
    units: rows.reduce((s, r) => s + r.qty, 0),
    byGame: [...games.entries()]
      .map(([game, g]) => ({ game, capital: round(g.capital), sharePct: pct(g.capital, totalCapital), skus: g.skus, marketValue: round(g.marketValue), unrealizedPnl: round(g.marketValue - g.pricedCost) }))
      .sort((a, b) => b.capital - a.capital),
    concentration: {
      top1SharePct: byCapital[0]?.item.capitalSharePct ?? null,
      top3SharePct: pct(top3, totalCapital),
      topItems: byCapital.slice(0, 5).map(({ item }) => item),
    },
    aging,
    pricing: { unpricedCapital: round(unpriced), unpricedSharePct: pct(unpriced, totalCapital), staleMarketCapital: round(stale), staleMarketSharePct: pct(stale, totalCapital), staleAfterDays: STALE_PRICE_DAYS },
    marketVsCost: {
      pricedCost: round(pricedCost),
      pricedMarketValue: round(pricedMarket),
      unrealizedPnl: round(pricedMarket - pricedCost),
      unrealizedPnlPct: pct(pricedMarket - pricedCost, pricedCost),
      winners: byPnl.filter(({ item }) => (item.unrealizedPnl ?? 0) > 0).slice(0, 5).map(({ item }) => item),
      losers: [...byPnl].reverse().filter(({ item }) => (item.unrealizedPnl ?? 0) < 0).slice(0, 5).map(({ item }) => item),
    },
    turnover: {
      cogsLast90d: round(cogs90),
      annualizedTurnover: totalCapital > 0 && cogs90 > 0 ? round((cogs90 * 4) / totalCapital, 2) : null,
      daysOfInventory: cogs90 > 0 ? round(totalCapital / (cogs90 / 90)) : null,
    },
    slowMovers: byCapital.filter(({ item }) => item.unitsSold90d === 0).slice(0, 6).map(({ item }) => item),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Liquidity and receivables / payables
// ---------------------------------------------------------------------------------------------------------------------
export interface LiquidityRisk {
  cash: number;
  receivable: number;
  payable: number;
  inventoryCapital: number;
  gradingUncollected: number;
  /** (tiền mặt + phải thu) / phải trả; null = không có công nợ phải trả */
  coverageRatio: number | null;
  /** Dòng tiền ròng trung bình mỗi tháng của 3 tháng gần nhất đã đủ (mọi khoản Thu / Chi trong sổ quỹ) */
  avgMonthlyNetCashFlow: number;
  avgMonthlyRevenue: number;
  avgMonthlyBusinessExpense: number;
  avgMonthlyWithdrawals: number;
  /** Số tháng tiền mặt còn đủ nếu dòng tiền ròng vẫn âm như 3 tháng qua; null = dòng tiền không âm */
  runwayMonths: number | null;
  receivableAging: { bucket: string; amount: number; count: number }[];
  payableAging: { bucket: string; amount: number; count: number }[];
  topDebtors: { name: string; amount: number; sharePct: number | null }[];
  oldestReceivableDays: number | null;
}

const DEBT_BUCKETS = [
  { label: "0-30 ngày", max: 30 },
  { label: "31-60 ngày", max: 60 },
  { label: "61-90 ngày", max: 90 },
  { label: "trên 90 ngày", max: Infinity },
];

export async function getLiquidityRisk(now = new Date()): Promise<LiquidityRisk> {
  const shifted = new Date(now.getTime() + 7 * 3600 * 1000);
  const monthStart = (back: number) => Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - back, 1) - 7 * 3600 * 1000;
  const from = new Date(monthStart(3));
  const to = new Date(monthStart(0)); // the running month is left out: it is incomplete

  const [portfolio, debts, people, ledgerNet, grading] = await Promise.all([
    getPortfolioSummary(),
    prisma.debt.findMany({ where: { status: { not: "PAID" } }, select: { type: true, amount: true, paidAmount: true, createdAt: true } }),
    getDebtsByPerson(false),
    prisma.cashLedgerEntry.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { type: true, amount: true, createdAt: true } }),
    prisma.gradingSubmission.findMany({ where: { incomeEntryId: null }, select: { chargeAmount: true } }),
  ]);

  const net3 = ledgerNet.reduce((s, e) => s + num(e.amount), 0);
  const sumAbs = (types: string[], positive?: boolean) =>
    ledgerNet.filter((e) => types.includes(e.type) && (positive === undefined || (positive ? num(e.amount) > 0 : num(e.amount) < 0))).reduce((s, e) => s + Math.abs(num(e.amount)), 0);
  const hasHistory = ledgerNet.length > 0;
  const avgNet = hasHistory ? net3 / 3 : 0;

  const aging = (type: "ADVANCED_TO_PERSON" | "ADVANCED_BY_PERSON") =>
    DEBT_BUCKETS.map((b, i) => {
      const min = i === 0 ? -1 : DEBT_BUCKETS[i - 1].max;
      const rows = debts.filter((d) => {
        const age = Math.floor((now.getTime() - d.createdAt.getTime()) / DAY);
        return d.type === type && age > min && age <= b.max;
      });
      return { bucket: b.label, amount: round(rows.reduce((s, d) => s + (num(d.amount) - num(d.paidAmount)), 0)), count: rows.length };
    });

  const receivables = debts.filter((d) => d.type === "ADVANCED_TO_PERSON");
  const oldest = receivables.length ? Math.max(...receivables.map((d) => Math.floor((now.getTime() - d.createdAt.getTime()) / DAY))) : null;
  const debtors = people.filter((p) => p.owedToShop > 0).sort((a, b) => b.owedToShop - a.owedToShop).slice(0, 3);

  return {
    cash: round(portfolio.liquidCash),
    receivable: round(portfolio.debtReceivable),
    payable: round(portfolio.debtPayable),
    inventoryCapital: round(portfolio.inventoryCostValue),
    gradingUncollected: round(grading.reduce((s, g) => s + num(g.chargeAmount), 0)),
    coverageRatio: portfolio.debtPayable > 0 ? round((portfolio.liquidCash + portfolio.debtReceivable) / portfolio.debtPayable, 2) : null,
    avgMonthlyNetCashFlow: round(avgNet),
    avgMonthlyRevenue: round(sumAbs(["SALE", "GRADING_INCOME"]) / 3),
    avgMonthlyBusinessExpense: round(sumAbs(["PURCHASE", "GRADING_COST"]) / 3),
    avgMonthlyWithdrawals: round(sumAbs(["WITHDRAWAL"]) / 3),
    runwayMonths: hasHistory && avgNet < 0 && portfolio.liquidCash > 0 ? round(portfolio.liquidCash / -avgNet, 1) : null,
    receivableAging: aging("ADVANCED_TO_PERSON"),
    payableAging: aging("ADVANCED_BY_PERSON"),
    topDebtors: debtors.map((p) => ({ name: p.personName, amount: round(p.owedToShop), sharePct: pct(p.owedToShop, portfolio.debtReceivable) })),
    oldestReceivableDays: oldest,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Sales analytics
// ---------------------------------------------------------------------------------------------------------------------
export interface SalesAnalytics {
  days: number;
  orders: number;
  revenue: number;
  profit: number;
  marginPct: number | null;
  avgOrderValue: number;
  vsPreviousPeriod: { revenueChangePct: number | null; ordersChangePct: number | null };
  lossOrders: { count: number; totalLoss: number };
  byGame: { game: string; revenue: number; profit: number; marginPct: number | null }[];
  topProductsByProfit: { name: string; units: number; revenue: number; profit: number; marginPct: number | null }[];
  customers: { distinct: number; walkInOrders: number; repeatRatePct: number | null; top: { name: string; revenue: number; orders: number; sharePct: number | null }[]; top1SharePct: number | null };
  channels: { page: { orders: number; revenue: number }; direct: { orders: number; revenue: number } };
  creditShare: { amount: number; pctOfRevenue: number | null };
}

export async function getSalesAnalytics(days = 90, now = new Date()): Promise<SalesAnalytics> {
  const span = Math.min(Math.max(Math.floor(days), 7), 365);
  const from = new Date(now.getTime() - span * DAY);
  const prevFrom = new Date(now.getTime() - 2 * span * DAY);

  const [sales, prev, credit] = await Promise.all([
    prisma.transaction.findMany({
      where: { type: "SALE", transactionDate: { gte: from } },
      select: {
        totalAmount: true,
        totalCost: true,
        source: true,
        customerId: true,
        customer: { select: { name: true } },
        items: { select: { quantity: true, subtotal: true, costBasis: true, sealedProduct: { select: { name: true, game: true } }, singleCard: { select: { cardName: true, game: true } } } },
      },
    }),
    prisma.transaction.aggregate({ where: { type: "SALE", transactionDate: { gte: prevFrom, lt: from } }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.debt.aggregate({ where: { type: "ADVANCED_TO_PERSON", transactionId: { not: null }, createdAt: { gte: from } }, _sum: { amount: true } }),
  ]);

  const revenue = sales.reduce((s, t) => s + num(t.totalAmount), 0);
  const costed = sales.filter((t) => t.totalCost != null);
  const profit = costed.reduce((s, t) => s + num(t.totalAmount) - num(t.totalCost), 0);
  const costedRevenue = costed.reduce((s, t) => s + num(t.totalAmount), 0);
  const losses = costed.map((t) => num(t.totalCost) - num(t.totalAmount)).filter((l) => l > 0);
  const change = (cur: number, before: number) => (before > 0 ? round(((cur - before) / before) * 100, 1) : null);

  const gameAgg = new Map<string, { revenue: number; profit: number; costedRevenue: number }>();
  const productAgg = new Map<string, { units: number; revenue: number; profit: number; costedRevenue: number }>();
  for (const t of sales) {
    for (const i of t.items) {
      const game = (i.sealedProduct?.game ?? i.singleCard?.game)?.trim() || "Khác";
      const name = i.sealedProduct?.name ?? i.singleCard?.cardName ?? "Sản phẩm đã xoá";
      const sub = num(i.subtotal);
      const lineProfit = i.costBasis == null ? 0 : sub - num(i.costBasis);
      const lineCosted = i.costBasis == null ? 0 : sub;
      const g = gameAgg.get(game) ?? { revenue: 0, profit: 0, costedRevenue: 0 };
      g.revenue += sub; g.profit += lineProfit; g.costedRevenue += lineCosted;
      gameAgg.set(game, g);
      const p = productAgg.get(name) ?? { units: 0, revenue: 0, profit: 0, costedRevenue: 0 };
      p.units += i.quantity; p.revenue += sub; p.profit += lineProfit; p.costedRevenue += lineCosted;
      productAgg.set(name, p);
    }
  }

  const byCustomer = new Map<string, { name: string; revenue: number; orders: number }>();
  let walkIn = 0;
  for (const t of sales) {
    if (!t.customerId) {
      walkIn += 1;
      continue;
    }
    const c = byCustomer.get(t.customerId) ?? { name: t.customer?.name ?? "Khách", revenue: 0, orders: 0 };
    c.revenue += num(t.totalAmount);
    c.orders += 1;
    byCustomer.set(t.customerId, c);
  }
  const customersSorted = [...byCustomer.values()].sort((a, b) => b.revenue - a.revenue);
  const repeat = customersSorted.filter((c) => c.orders >= 2).length;

  const page = sales.filter((t) => t.source?.startsWith("MESSENGER"));
  const direct = sales.filter((t) => !t.source?.startsWith("MESSENGER"));
  const creditAmount = num(credit._sum.amount);

  return {
    days: span,
    orders: sales.length,
    revenue: round(revenue),
    profit: round(profit),
    marginPct: pct(profit, costedRevenue),
    avgOrderValue: sales.length ? round(revenue / sales.length) : 0,
    vsPreviousPeriod: { revenueChangePct: change(revenue, num(prev._sum.totalAmount)), ordersChangePct: change(sales.length, prev._count._all) },
    lossOrders: { count: losses.length, totalLoss: round(losses.reduce((s, l) => s + l, 0)) },
    byGame: [...gameAgg.entries()].map(([game, g]) => ({ game, revenue: round(g.revenue), profit: round(g.profit), marginPct: pct(g.profit, g.costedRevenue) })).sort((a, b) => b.revenue - a.revenue),
    topProductsByProfit: [...productAgg.entries()]
      .map(([name, p]) => ({ name, units: p.units, revenue: round(p.revenue), profit: round(p.profit), marginPct: pct(p.profit, p.costedRevenue) }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 6),
    customers: {
      distinct: byCustomer.size,
      walkInOrders: walkIn,
      repeatRatePct: byCustomer.size ? round((repeat / byCustomer.size) * 100, 1) : null,
      top: customersSorted.slice(0, 5).map((c) => ({ ...c, revenue: round(c.revenue), sharePct: pct(c.revenue, revenue) })),
      top1SharePct: customersSorted[0] ? pct(customersSorted[0].revenue, revenue) : null,
    },
    channels: {
      page: { orders: page.length, revenue: round(page.reduce((s, t) => s + num(t.totalAmount), 0)) },
      direct: { orders: direct.length, revenue: round(direct.reduce((s, t) => s + num(t.totalAmount), 0)) },
    },
    creditShare: { amount: round(creditAmount), pctOfRevenue: pct(creditAmount, revenue) },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Findings: a first diagnosis computed by rules, so the analyst starts from evidence
// ---------------------------------------------------------------------------------------------------------------------
export type Severity = "high" | "medium" | "low" | "positive";

export interface Finding {
  severity: Severity;
  area: "Thanh khoản" | "Công nợ" | "Kho hàng" | "Lợi nhuận" | "Khách hàng" | "Dữ liệu";
  title: string;
  evidence: string;
  suggestion: string;
}

export interface ShopAnalysis {
  generatedAt: string;
  liquidity: LiquidityRisk;
  inventory: InventoryHealth;
  sales: SalesAnalytics;
  trends: FinancialTrends;
  findings: Finding[];
}

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}₫`;

export function deriveFindings(liq: LiquidityRisk, inv: InventoryHealth, sales: SalesAnalytics, trends: FinancialTrends): Finding[] {
  const f: Finding[] = [];
  const add = (x: Finding) => f.push(x);

  // ---- liquidity
  if (liq.cash <= 0) {
    add({ severity: "high", area: "Thanh khoản", title: "Tiền mặt bằng hoặc dưới 0", evidence: `Tiền mặt hiện tại ${vnd(liq.cash)}.`, suggestion: "Ưu tiên thu công nợ phải thu, thanh lý hàng tồn chậm và hoãn nhập hàng mới cho tới khi dòng tiền dương." });
  }
  if (liq.payable > 0 && liq.cash < liq.payable) {
    add({ severity: liq.cash + liq.receivable < liq.payable ? "high" : "medium", area: "Thanh khoản", title: "Tiền mặt chưa đủ trả công nợ phải trả", evidence: `Tiền mặt ${vnd(liq.cash)} so với phải trả ${vnd(liq.payable)}; tính cả phải thu thì ${vnd(liq.cash + liq.receivable)} (hệ số bao phủ ${liq.coverageRatio}).`, suggestion: "Lập lịch trả nợ theo hạn, thương lượng gia hạn với người ứng tiền, thu nợ phải thu trước hạn trả." });
  }
  if (liq.runwayMonths !== null && liq.runwayMonths < 3) {
    add({ severity: liq.runwayMonths < 1.5 ? "high" : "medium", area: "Thanh khoản", title: "Quỹ tiền mặt chỉ đủ vài tháng nếu xu hướng hiện tại tiếp diễn", evidence: `Dòng tiền ròng trung bình ${vnd(liq.avgMonthlyNetCashFlow)}/tháng (3 tháng đủ gần nhất) → còn khoảng ${liq.runwayMonths} tháng.`, suggestion: "Giảm tốc độ nhập hàng, hạn chế rút tiền, đẩy nhanh bán hàng tồn lâu để chuyển vốn tồn kho thành tiền mặt." });
  }
  if (liq.avgMonthlyWithdrawals > 0 && liq.avgMonthlyRevenue > 0 && liq.avgMonthlyWithdrawals > liq.avgMonthlyRevenue * 0.5) {
    add({ severity: "medium", area: "Thanh khoản", title: "Rút tiền từ quỹ chiếm tỷ trọng lớn so với doanh thu", evidence: `Rút trung bình ${vnd(liq.avgMonthlyWithdrawals)}/tháng so với doanh thu ${vnd(liq.avgMonthlyRevenue)}/tháng.`, suggestion: "Đặt mức lương / rút tiền cố định theo lợi nhuận thực tế thay vì theo số dư quỹ." });
  }

  // ---- receivables
  const recTotal = liq.receivableAging.reduce((s, b) => s + b.amount, 0);
  const recOld = liq.receivableAging.filter((b) => b.bucket === "61-90 ngày" || b.bucket === "trên 90 ngày").reduce((s, b) => s + b.amount, 0);
  if (recTotal > 0 && recOld / recTotal >= 0.4) {
    add({ severity: recOld / recTotal >= 0.7 ? "high" : "medium", area: "Công nợ", title: "Công nợ phải thu quá hạn lâu", evidence: `${vnd(recOld)} (${pct(recOld, recTotal)}%) phải thu đã quá 60 ngày; khoản lâu nhất ${liq.oldestReceivableDays} ngày.`, suggestion: "Nhắc nợ theo từng người, đề xuất lịch trả góp, ngừng bán nợ thêm cho khách đang quá hạn." });
  }
  if (liq.topDebtors[0] && (liq.topDebtors[0].sharePct ?? 0) >= 50 && liq.receivable > 0) {
    add({ severity: "medium", area: "Công nợ", title: "Phải thu tập trung vào một người", evidence: `${liq.topDebtors[0].name} chiếm ${liq.topDebtors[0].sharePct}% tổng phải thu (${vnd(liq.topDebtors[0].amount)}).`, suggestion: "Đặt hạn mức công nợ cho từng khách và theo dõi sát khoản lớn nhất." });
  }
  if (liq.gradingUncollected > 0 && liq.cash > 0 && liq.gradingUncollected > liq.cash * 0.3) {
    add({ severity: "low", area: "Công nợ", title: "Nhiều đơn chấm điểm chưa thu tiền khách", evidence: `${vnd(liq.gradingUncollected)} chưa thu, tương đương ${pct(liq.gradingUncollected, liq.cash)}% tiền mặt.`, suggestion: "Thu tiền trước hoặc thu cọc khi nhận thẻ gửi chấm điểm." });
  }
  if (sales.creditShare.pctOfRevenue !== null && sales.creditShare.pctOfRevenue >= 30) {
    add({ severity: "medium", area: "Công nợ", title: "Tỷ lệ bán nợ cao", evidence: `${sales.creditShare.pctOfRevenue}% doanh số ${sales.days} ngày qua là bán nợ (${vnd(sales.creditShare.amount)}).`, suggestion: "Giới hạn bán nợ theo khách quen có lịch sử trả tốt, yêu cầu cọc cho đơn lớn." });
  }

  // ---- inventory
  const old = inv.aging.filter((b) => b.bucket === "91-180 ngày" || b.bucket === "trên 180 ngày");
  const oldCapital = old.reduce((s, b) => s + b.capital, 0);
  if (inv.totalCapital > 0 && oldCapital / inv.totalCapital >= 0.25) {
    add({ severity: oldCapital / inv.totalCapital >= 0.5 ? "high" : "medium", area: "Kho hàng", title: "Vốn nằm lâu trong hàng chậm luân chuyển", evidence: `${vnd(oldCapital)} (${pct(oldCapital, inv.totalCapital)}% vốn kho) không có giao dịch bán quá 90 ngày.`, suggestion: `Liệt kê SKU chậm (ví dụ ${inv.slowMovers.slice(0, 2).map((s) => s.sku).join(", ") || "xem danh sách chậm bán"}), giảm giá có kế hoạch hoặc bán theo combo để thu hồi vốn.` });
  }
  if (inv.turnover.daysOfInventory !== null && inv.turnover.daysOfInventory > 180) {
    add({ severity: "medium", area: "Kho hàng", title: "Vòng quay kho chậm", evidence: `Tồn kho đủ bán khoảng ${formatDays(inv.turnover.daysOfInventory)} theo tốc độ bán 90 ngày qua (vòng quay ${inv.turnover.annualizedTurnover} lần/năm).`, suggestion: "Giảm lượng nhập mỗi đợt, ưu tiên SKU bán nhanh, đặt trần tồn theo số ngày bán." });
  }
  if (inv.concentration.top1SharePct !== null && inv.concentration.top1SharePct >= 30) {
    add({ severity: "medium", area: "Kho hàng", title: "Vốn tập trung vào một SKU", evidence: `${inv.concentration.topItems[0]?.name} chiếm ${inv.concentration.top1SharePct}% vốn kho (${vnd(inv.concentration.topItems[0]?.capital ?? 0)}).`, suggestion: "Cân nhắc chia nhỏ rủi ro; theo dõi sát giá thị trường của SKU này." });
  } else if (inv.concentration.top3SharePct !== null && inv.concentration.top3SharePct >= 60) {
    add({ severity: "low", area: "Kho hàng", title: "Vốn tập trung vào 3 SKU lớn nhất", evidence: `3 SKU lớn nhất chiếm ${inv.concentration.top3SharePct}% vốn kho.`, suggestion: "Theo dõi biến động giá của nhóm này vì nó quyết định phần lớn giá trị kho." });
  }
  const topGame = inv.byGame[0];
  if (topGame && inv.byGame.length > 1 && (topGame.sharePct ?? 0) >= 70) {
    add({ severity: "medium", area: "Kho hàng", title: `Phụ thuộc vào một dòng game: ${topGame.game}`, evidence: `${topGame.game} chiếm ${topGame.sharePct}% vốn kho.`, suggestion: "Theo dõi chu kỳ ra bộ mới và tái bản của dòng này; cân nhắc phân bổ một phần vốn sang dòng khác." });
  }
  if (inv.pricing.unpricedSharePct !== null && inv.pricing.unpricedSharePct >= 30) {
    add({ severity: "medium", area: "Kho hàng", title: "Nhiều vốn chưa có giá thị trường", evidence: `${vnd(inv.pricing.unpricedCapital)} (${inv.pricing.unpricedSharePct}% vốn kho) chưa có giá US nên lãi/lỗ tạm tính chưa phản ánh đủ.`, suggestion: "Khớp thủ công các SKU còn thiếu giá (đặc biệt slab và hàng sưu tầm) để định giá chính xác." });
  }
  if (inv.pricing.staleMarketSharePct !== null && inv.pricing.staleMarketSharePct >= 50) {
    add({ severity: "low", area: "Kho hàng", title: "Giá thị trường chưa được cập nhật gần đây", evidence: `${inv.pricing.staleMarketSharePct}% vốn kho có giá cũ hơn ${inv.pricing.staleAfterDays} ngày.`, suggestion: "Bấm cập nhật giá TCGplayer US trước khi ra quyết định nhập / xả hàng." });
  }
  if (inv.marketVsCost.unrealizedPnlPct !== null && inv.marketVsCost.unrealizedPnlPct <= -5) {
    add({ severity: inv.marketVsCost.unrealizedPnlPct <= -15 ? "high" : "medium", area: "Kho hàng", title: "Giá thị trường đang thấp hơn giá vốn", evidence: `Lãi/lỗ tạm tính ${vnd(inv.marketVsCost.unrealizedPnl)} (${inv.marketVsCost.unrealizedPnlPct}%) trên phần kho đã có giá.`, suggestion: `Xem xét các SKU lỗ lớn nhất (${inv.marketVsCost.losers.slice(0, 2).map((s) => s.sku).join(", ")}): giữ chờ hồi hay cắt lỗ sớm tuỳ vào sức bán.` });
  } else if (inv.marketVsCost.unrealizedPnlPct !== null && inv.marketVsCost.unrealizedPnlPct >= 10) {
    add({ severity: "positive", area: "Kho hàng", title: "Kho đang có lãi tạm tính", evidence: `Giá thị trường cao hơn vốn ${inv.marketVsCost.unrealizedPnlPct}% (${vnd(inv.marketVsCost.unrealizedPnl)}) — chưa phải lãi thực.`, suggestion: "Cân nhắc chốt lời một phần ở SKU tăng mạnh nhưng bán chậm để chuyển thành tiền mặt." });
  }

  // ---- profitability / customers
  if (sales.orders >= 5 && sales.marginPct !== null && sales.marginPct < 10) {
    add({ severity: sales.marginPct < 0 ? "high" : "medium", area: "Lợi nhuận", title: "Biên lợi nhuận bán hàng thấp", evidence: `Biên lãi gộp ${sales.marginPct}% trên ${sales.orders} đơn ${sales.days} ngày qua.`, suggestion: "Rà lại giá bán so với giá vốn WACC và giá thị trường; tránh bán dưới giá vốn." });
  } else if (sales.orders >= 5 && sales.marginPct !== null && sales.marginPct >= 25) {
    add({ severity: "positive", area: "Lợi nhuận", title: "Biên lợi nhuận bán hàng tốt", evidence: `Biên lãi gộp ${sales.marginPct}% trên ${sales.orders} đơn.`, suggestion: "Duy trì chính sách giá hiện tại; tập trung nhóm sản phẩm có biên cao nhất." });
  }
  if (sales.lossOrders.count > 0) {
    add({ severity: sales.lossOrders.count >= 3 ? "medium" : "low", area: "Lợi nhuận", title: "Có đơn bán dưới giá vốn", evidence: `${sales.lossOrders.count} đơn lỗ, tổng lỗ ${vnd(sales.lossOrders.totalLoss)} trong ${sales.days} ngày.`, suggestion: "Xác định lỗ có chủ đích (xả hàng) hay do báo giá sai; đặt giá sàn theo giá vốn." });
  }
  if (sales.vsPreviousPeriod.revenueChangePct !== null && sales.vsPreviousPeriod.revenueChangePct <= -20) {
    add({ severity: "medium", area: "Lợi nhuận", title: "Doanh số giảm mạnh so với kỳ trước", evidence: `Doanh số ${sales.days} ngày qua giảm ${Math.abs(sales.vsPreviousPeriod.revenueChangePct)}% so với ${sales.days} ngày trước đó.`, suggestion: "Xác định nguyên nhân (mùa vụ, thiếu hàng, giá, kênh bán) trước khi điều chỉnh nhập hàng." });
  } else if (sales.vsPreviousPeriod.revenueChangePct !== null && sales.vsPreviousPeriod.revenueChangePct >= 20) {
    add({ severity: "positive", area: "Lợi nhuận", title: "Doanh số tăng so với kỳ trước", evidence: `Tăng ${sales.vsPreviousPeriod.revenueChangePct}% so với ${sales.days} ngày trước đó.`, suggestion: "Đảm bảo tồn kho và vốn lưu động đủ cho đà tăng, tránh hết hàng ở SKU bán chạy." });
  }
  const t = trends.summary.last3VsPrev3;
  if (t && t.netProfitChangePct !== null && t.netProfitChangePct <= -25) {
    add({ severity: "medium", area: "Lợi nhuận", title: "Lợi nhuận 3 tháng gần nhất giảm so với 3 tháng trước đó", evidence: `Lợi nhuận ròng giảm ${Math.abs(t.netProfitChangePct)}%.`, suggestion: "So sánh từng tháng ở bảng xu hướng để tìm tháng bắt đầu sụt giảm." });
  }
  if (sales.customers.top1SharePct !== null && sales.customers.top1SharePct >= 40 && sales.customers.distinct >= 2) {
    add({ severity: "medium", area: "Khách hàng", title: "Doanh số phụ thuộc vào một khách", evidence: `${sales.customers.top[0]?.name} chiếm ${sales.customers.top1SharePct}% doanh số ${sales.days} ngày.`, suggestion: "Mở rộng tập khách (Fanpage, khách quen giới thiệu) để giảm rủi ro mất một khách lớn." });
  }
  if (sales.customers.repeatRatePct !== null && sales.customers.distinct >= 5 && sales.customers.repeatRatePct < 15) {
    add({ severity: "low", area: "Khách hàng", title: "Ít khách quay lại mua", evidence: `Chỉ ${sales.customers.repeatRatePct}% khách có từ 2 đơn trở lên.`, suggestion: "Chăm sóc sau bán qua Page (nhắn khi có hàng mới, ưu đãi khách cũ)." });
  }

  // ---- data sufficiency
  if (sales.orders < 10 || trends.summary.monthsWithActivity < 3) {
    add({ severity: "low", area: "Dữ liệu", title: "Dữ liệu còn ít nên kết luận có độ chắc chắn thấp", evidence: `${sales.orders} đơn trong ${sales.days} ngày và ${trends.summary.monthsWithActivity} tháng có hoạt động. ${trends.summary.note}`, suggestion: "Coi các tỷ lệ là gợi ý ban đầu; ghi nhận đầy đủ đơn bán và chi phí để phân tích sau này đáng tin hơn." });
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2, positive: 3 };
  return f.sort((a, b) => order[a.severity] - order[b.severity]);
}

export async function analyzeShop(now = new Date()): Promise<ShopAnalysis> {
  const [liquidity, inventory, sales, trends] = await Promise.all([getLiquidityRisk(now), getInventoryHealth(now), getSalesAnalytics(90, now), getFinancialTrends(12, now)]);
  return { generatedAt: now.toISOString(), liquidity, inventory, sales, trends, findings: deriveFindings(liquidity, inventory, sales, trends) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Scenario model
// ---------------------------------------------------------------------------------------------------------------------
export interface ScenarioInput {
  /** % thay đổi giá thị trường của hàng tồn (chỉ ảnh hưởng định giá theo thị trường) */
  marketPriceChangePct?: number;
  /** % thay đổi số lượng bán mỗi tháng */
  salesVolumeChangePct?: number;
  /** % thay đổi giá bán trung bình */
  salesPriceChangePct?: number;
  /** % thay đổi giá nhập / giá vốn của hàng mới */
  unitCostChangePct?: number;
  /** Chi phí cố định thêm mỗi tháng (VND) */
  extraMonthlyCost?: number;
  /** Số tháng dự phóng (1-12) */
  months?: number;
}

export interface ScenarioResult {
  assumptions: string[];
  baselineMonthly: { salesRevenue: number; salesCogs: number; salesProfit: number; restockPurchases: number; gradingProfit: number; gradingRevenue: number; gradingCost: number; withdrawals: number; otherOutflows: number; netCashFlow: number; basedOnMonths: number };
  scenarioMonthly: { salesRevenue: number; salesCogs: number; salesProfit: number; restockPurchases: number; extraMonthlyCost: number; netCashFlow: number; netProfit: number };
  projection: { month: number; cash: number }[];
  start: { cash: number; inventoryCapital: number; inventoryAtMarket: number; receivable: number; payable: number };
  end: { cash: number; portfolioAtCost: number; portfolioAtMarket: number; portfolioAtMarketAfterShock: number };
  deltas: { cashVsBaseline: number; netProfitPerMonthVsBaseline: number; inventoryMarketShock: number };
  runwayMonths: number | null;
  warning: string | null;
}

export async function runScenario(input: ScenarioInput, now = new Date()): Promise<ScenarioResult> {
  const months = Math.min(Math.max(Math.floor(input.months ?? 3), 1), 12);
  const clampPct = (v: number | undefined) => Math.min(Math.max(v ?? 0, -95), 500) / 100;
  const market = clampPct(input.marketPriceChangePct);
  const vol = clampPct(input.salesVolumeChangePct);
  const price = clampPct(input.salesPriceChangePct);
  const cost = clampPct(input.unitCostChangePct);
  const extra = Math.max(0, input.extraMonthlyCost ?? 0);

  const shifted = new Date(now.getTime() + 7 * 3600 * 1000);
  const monthStart = (back: number) => Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - back, 1) - 7 * 3600 * 1000;
  const from = new Date(monthStart(3));
  const to = new Date(monthStart(0));
  const keys = [3, 2, 1].map((b) => {
    const d = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - b, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });

  const [finances, costedSales, portfolio, inv] = await Promise.all([
    Promise.all(keys.map((k) => getPeriodFinance(resolvePeriod(k, now)!))),
    prisma.transaction.findMany({ where: { type: "SALE", transactionDate: { gte: from, lt: to }, totalCost: { not: null } }, select: { totalAmount: true, totalCost: true } }),
    getPortfolioSummary(),
    getInventoryHealth(now),
  ]);

  const avg = (pick: (f: PeriodFinance) => number) => finances.reduce((s, f) => s + pick(f), 0) / 3;
  const salesRevenueCash = avg((f) => f.revenue.sales);
  const gradingRevenue = avg((f) => f.revenue.grading);
  const gradingCost = avg((f) => f.expense.grading);
  const purchases = avg((f) => f.expense.purchases);
  const withdrawals = avg((f) => f.otherCash.withdrawals);
  // Negative manual cash adjustments (rent, packaging, fees entered by hand) are real recurring outflows.
  const otherOutflows = avg((f) => f.otherCash.adjustmentsOut);
  const gradingProfit = avg((f) => f.profit.gradingProfitCollected);
  const costedRevenue = costedSales.reduce((s, t) => s + num(t.totalAmount), 0) / 3;
  const cogs = costedSales.reduce((s, t) => s + num(t.totalCost), 0) / 3;

  const baseNetCash = salesRevenueCash + gradingRevenue - purchases - gradingCost - withdrawals - otherOutflows;
  const sRevenueCash = salesRevenueCash * (1 + vol) * (1 + price);
  const sRevenueProfit = costedRevenue * (1 + vol) * (1 + price);
  const sCogs = cogs * (1 + vol) * (1 + cost);
  const sPurchases = purchases * (1 + vol) * (1 + cost);
  const sProfit = sRevenueProfit - sCogs;
  const scenarioNetCash = sRevenueCash + gradingRevenue - sPurchases - gradingCost - withdrawals - otherOutflows - extra;

  const projection = Array.from({ length: months }, (_, i) => ({ month: i + 1, cash: round(portfolio.liquidCash + scenarioNetCash * (i + 1)) }));
  const endCash = portfolio.liquidCash + scenarioNetCash * months;

  // Inventory at market: priced SKUs at their US price, the rest at cost; the shock only moves the priced part.
  const inventoryAtMarket = inv.totalCapital - inv.marketVsCost.pricedCost + inv.marketVsCost.pricedMarketValue;
  const shock = inv.marketVsCost.pricedMarketValue * market;
  const noHistory = finances.every((f) => f.revenue.total === 0 && f.expense.total === 0);
  const assumptions = [
    `Nền so sánh = trung bình 3 tháng đủ gần nhất (${keys.join(", ")}).`,
    `Số lượng bán ${(vol * 100).toFixed(0)}%, giá bán ${(price * 100).toFixed(0)}%, giá nhập/giá vốn mới ${(cost * 100).toFixed(0)}%, giá thị trường tồn kho ${(market * 100).toFixed(0)}%.`,
    "Lượng nhập hàng thay đổi theo số lượng bán và giá nhập (giữ nguyên tỷ lệ nhập so với bán).",
    "Chấm điểm, rút tiền và các khoản điều chỉnh tiền mặt âm (ví dụ chi phí nhập tay như thuê kho) giữ như nền; thêm vốn, thu / trả nợ không dự phóng; công nợ phải thu / phải trả giữ nguyên số hiện tại.",
    "Giá vốn của hàng đang tồn không đổi (WACC); thay đổi giá nhập chỉ áp dụng cho hàng nhập mới.",
  ];
  if (market !== 0 && inv.totalCapital > 0) {
    const unpricedCapital = Math.max(0, inv.totalCapital - inv.marketVsCost.pricedCost);
    assumptions.push(
      `Cú sốc giá thị trường chỉ áp lên phần kho đã có giá US (${Math.round(inv.marketVsCost.pricedMarketValue).toLocaleString("vi-VN")} ₫ theo giá thị trường); phần chưa có giá (${Math.round(unpricedCapital).toLocaleString("vi-VN")} ₫ theo vốn, ${((unpricedCapital / inv.totalCapital) * 100).toFixed(0)}% kho, như thẻ lẻ / slab) giữ theo giá vốn nên rủi ro thực có thể lớn hơn.`
    );
  }

  return {
    assumptions,
    baselineMonthly: {
      salesRevenue: round(salesRevenueCash), salesCogs: round(cogs), salesProfit: round(costedRevenue - cogs), restockPurchases: round(purchases),
      gradingProfit: round(gradingProfit), gradingRevenue: round(gradingRevenue), gradingCost: round(gradingCost), withdrawals: round(withdrawals), otherOutflows: round(otherOutflows), netCashFlow: round(baseNetCash), basedOnMonths: 3,
    },
    scenarioMonthly: { salesRevenue: round(sRevenueCash), salesCogs: round(sCogs), salesProfit: round(sProfit), restockPurchases: round(sPurchases), extraMonthlyCost: round(extra), netCashFlow: round(scenarioNetCash), netProfit: round(sProfit + gradingProfit - extra) },
    projection,
    start: { cash: round(portfolio.liquidCash), inventoryCapital: round(inv.totalCapital), inventoryAtMarket: round(inventoryAtMarket), receivable: round(portfolio.debtReceivable), payable: round(portfolio.debtPayable) },
    end: {
      cash: round(endCash),
      portfolioAtCost: round(endCash + inv.totalCapital + portfolio.debtReceivable - portfolio.debtPayable),
      portfolioAtMarket: round(endCash + inventoryAtMarket + portfolio.debtReceivable - portfolio.debtPayable),
      portfolioAtMarketAfterShock: round(endCash + inventoryAtMarket + shock + portfolio.debtReceivable - portfolio.debtPayable),
    },
    deltas: {
      cashVsBaseline: round((scenarioNetCash - baseNetCash) * months),
      netProfitPerMonthVsBaseline: round(sProfit + gradingProfit - extra - (costedRevenue - cogs + gradingProfit)),
      inventoryMarketShock: round(shock),
    },
    runwayMonths: scenarioNetCash < 0 && portfolio.liquidCash > 0 ? round(portfolio.liquidCash / -scenarioNetCash, 1) : null,
    warning: noHistory ? "Chưa có dữ liệu thu/chi trong 3 tháng đủ gần nhất nên phần dự phóng dòng tiền chỉ mang tính minh hoạ (nền bằng 0); phần định giá kho theo thị trường vẫn dùng dữ liệu thật." : null,
  };
}
