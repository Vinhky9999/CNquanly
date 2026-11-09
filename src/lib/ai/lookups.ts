import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getDebtSummary, getDebtsByPerson } from "@/lib/debt-summary";
import { getGradingSummary } from "@/lib/grading-summary";
import { gradingStatusLabel } from "@/lib/grading";
import { paymentMethodLabel } from "@/lib/validations/chat-order";

// Read-only lookups over the real data. Money is always VND as plain numbers; the model / rules do the formatting.
// Customer chat messages are never returned: only structured business data.

const num = (v: unknown) => Number(v ?? 0);
const day = (d: Date) => d.toISOString();

const tokensOf = (query: string) =>
  query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 6);

// ---------------------------------------------------------------------------------------------------------------------
export interface InventoryHit {
  kind: "sealed" | "single";
  sku: string;
  name: string;
  game: string | null;
  quantity: number;
  status: string;
  /** Giá vốn bình quân WACC của 1 sản phẩm */
  costWacc: number;
  capital: number;
  /** Giá thị trường US (VND) của 1 sản phẩm; null = chưa có giá */
  marketPrice: number | null;
  marketPriceUpdatedAt: string | null;
  estimatedPnl: number | null;
  detail: string | null;
}

export async function searchInventory(query: string, limit = 8): Promise<{ query: string; matches: number; items: InventoryHit[] }> {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return { query, matches: 0, items: [] };
  const take = Math.min(Math.max(limit, 1), 20);

  const nameOrSku = (nameField: "name" | "cardName") =>
    tokens.map((t) => ({
      OR: [{ [nameField]: { contains: t, mode: "insensitive" as const } }, { sku: { contains: t, mode: "insensitive" as const } }],
    }));

  const [sealed, singles] = await Promise.all([
    prisma.sealedProduct.findMany({ where: { AND: nameOrSku("name") as Prisma.SealedProductWhereInput[] }, orderBy: { name: "asc" }, take }),
    prisma.singleCard.findMany({
      where: { AND: nameOrSku("cardName") as Prisma.SingleCardWhereInput[] },
      include: { gradingCompany: { select: { name: true } } },
      orderBy: { cardName: "asc" },
      take,
    }),
  ]);

  const items: InventoryHit[] = [
    ...sealed.map((p) => {
      const market = p.marketPrice == null ? null : num(p.marketPrice);
      return {
        kind: "sealed" as const,
        sku: p.sku,
        name: p.name,
        game: p.game,
        quantity: p.quantity,
        status: p.quantity > 0 ? "Còn hàng" : "Hết hàng",
        costWacc: num(p.costPrice),
        capital: num(p.costPrice) * p.quantity,
        marketPrice: market,
        marketPriceUpdatedAt: p.marketPriceUpdatedAt ? day(p.marketPriceUpdatedAt) : null,
        estimatedPnl: market == null ? null : (market - num(p.costPrice)) * p.quantity,
        detail: null,
      };
    }),
    ...singles.map((c) => {
      const market = c.marketPrice == null ? null : num(c.marketPrice);
      const sold = c.status === "SOLD";
      return {
        kind: "single" as const,
        sku: c.sku,
        name: c.cardName,
        game: c.game,
        quantity: sold ? 0 : c.quantity,
        status: sold ? "Đã bán" : c.quantity > 0 ? "Còn hàng" : "Hết hàng",
        costWacc: num(c.costPrice),
        capital: sold ? 0 : num(c.costPrice) * c.quantity,
        marketPrice: market,
        marketPriceUpdatedAt: c.marketPriceUpdatedAt ? day(c.marketPriceUpdatedAt) : null,
        estimatedPnl: market == null || sold ? null : (market - num(c.costPrice)) * c.quantity,
        detail:
          c.condition === "GRADED"
            ? `Slab ${c.gradingCompany?.name ?? ""} ${c.grade != null ? num(c.grade) : ""}`.trim()
            : `Raw${c.rawGrade ? ` hạng ${c.rawGrade}` : ""}`,
      };
    }),
  ];
  return { query, matches: items.length, items: items.slice(0, take) };
}

// ---------------------------------------------------------------------------------------------------------------------
export interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  orderCount: number;
  totalSpent: number;
  receivable: number;
  lastOrders: { date: string; total: number; items: string; payment: string; source: string }[];
  grading: { orders: number; cards: number; uncollected: number };
  pageConversation: { label: string | null; lastMessageAt: string } | null;
}

export async function lookupCustomers(query: string): Promise<{ query: string; customers: CustomerProfile[] }> {
  const q = query.trim();
  if (!q) return { query, customers: [] };
  const rows = await prisma.customer.findMany({
    where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q, mode: "insensitive" } }, { zalo: { contains: q, mode: "insensitive" } }] },
    orderBy: { name: "asc" },
    take: 3,
  });

  const customers = await Promise.all(
    rows.map(async (c): Promise<CustomerProfile> => {
      const [agg, orders, debts, grading, conv] = await Promise.all([
        prisma.transaction.aggregate({ where: { customerId: c.id, type: "SALE" }, _sum: { totalAmount: true }, _count: { _all: true } }),
        prisma.transaction.findMany({
          where: { customerId: c.id, type: "SALE" },
          orderBy: { transactionDate: "desc" },
          take: 5,
          include: {
            cashLedgerEntry: { select: { id: true } },
            debts: { select: { amount: true, paidAmount: true } },
            items: { include: { sealedProduct: { select: { name: true } }, singleCard: { select: { cardName: true } } } },
          },
        }),
        prisma.debt.findMany({
          where: { type: "ADVANCED_TO_PERSON", status: { not: "PAID" }, OR: [{ customerId: c.id }, { personName: { equals: c.name.trim(), mode: "insensitive" } }] },
          select: { amount: true, paidAmount: true },
        }),
        prisma.gradingSubmission.findMany({
          where: { customerName: { equals: c.name.trim(), mode: "insensitive" } },
          select: { quantity: true, chargeAmount: true, incomeEntryId: true },
        }),
        prisma.messengerConversation.findFirst({ where: { customerId: c.id }, select: { label: true, lastMessageAt: true } }),
      ]);

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        orderCount: agg._count._all,
        totalSpent: num(agg._sum.totalAmount),
        receivable: debts.reduce((s, d) => s + (num(d.amount) - num(d.paidAmount)), 0),
        lastOrders: orders.map((t) => {
          const owed = t.debts.reduce((s, d) => s + (num(d.amount) - num(d.paidAmount)), 0);
          const names = t.items.map((i) => i.sealedProduct?.name ?? i.singleCard?.cardName ?? "Sản phẩm").slice(0, 4);
          return {
            date: day(t.transactionDate),
            total: num(t.totalAmount),
            items: names.length > 0 ? names.join(", ") + (t.items.length > names.length ? ` +${t.items.length - names.length} món` : "") : (t.notes ?? "Thanh toán không gắn sản phẩm"),
            payment: t.debts.length > 0 ? (owed > 0 ? `Còn nợ ${Math.round(owed)}₫` : "Đã thu nợ") : t.cashLedgerEntry ? `Đã thanh toán${paymentMethodLabel(t.paymentMethod) ? ` (${paymentMethodLabel(t.paymentMethod)})` : ""}` : "Không thu tiền (xuất nội bộ)",
            source: t.source?.startsWith("MESSENGER") ? "Chốt qua Page" : "Trực tiếp",
          };
        }),
        grading: {
          orders: grading.length,
          cards: grading.reduce((s, g) => s + g.quantity, 0),
          uncollected: grading.filter((g) => !g.incomeEntryId).reduce((s, g) => s + num(g.chargeAmount), 0),
        },
        pageConversation: conv ? { label: conv.label, lastMessageAt: day(conv.lastMessageAt) } : null,
      };
    })
  );
  return { query, customers };
}

// ---------------------------------------------------------------------------------------------------------------------
export interface DebtReport {
  totals: { payable: number; receivable: number; openCount: number };
  people: { name: string; payable: number; receivable: number; net: number; openCount: number }[];
  openDebts: { person: string; direction: "receivable" | "payable"; amount: number; remaining: number; reference: string | null; createdAt: string }[];
}

export async function listDebts(options: { direction?: "receivable" | "payable" | "all"; person?: string } = {}): Promise<DebtReport> {
  const direction = options.direction ?? "all";
  const person = options.person?.trim().toLowerCase();
  const [summary, people, open] = await Promise.all([
    getDebtSummary(),
    getDebtsByPerson(false),
    prisma.debt.findMany({
      where: {
        status: { not: "PAID" },
        ...(direction === "receivable" ? { type: "ADVANCED_TO_PERSON" as const } : direction === "payable" ? { type: "ADVANCED_BY_PERSON" as const } : {}),
        ...(person ? { personName: { contains: options.person!.trim(), mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 30,
    }),
  ]);

  return {
    totals: { payable: summary.totalOwedByShop, receivable: summary.totalOwedToShop, openCount: summary.unpaidCount },
    people: people
      .filter((p) => !person || p.personName.toLowerCase().includes(person))
      .filter((p) => (direction === "receivable" ? p.owedToShop > 0 : direction === "payable" ? p.owedByShop > 0 : true))
      .slice(0, 20)
      .map((p) => ({ name: p.personName, payable: p.owedByShop, receivable: p.owedToShop, net: p.net, openCount: p.openCount })),
    openDebts: open.map((d) => ({
      person: d.personName,
      direction: d.type === "ADVANCED_TO_PERSON" ? "receivable" : "payable",
      amount: num(d.amount),
      remaining: num(d.amount) - num(d.paidAmount),
      reference: d.referenceLabel,
      createdAt: day(d.createdAt),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
const ENTRY_LABEL: Record<string, string> = {
  PURCHASE: "Nhập hàng",
  SALE: "Doanh thu bán hàng",
  MANUAL_ADJUSTMENT: "Điều chỉnh",
  WITHDRAWAL: "Rút tiền",
  DEBT_REPAYMENT: "Trả nợ ứng tiền",
  DEBT_COLLECTION: "Thu hồi tiền ứng",
  GRADING_INCOME: "Thu chấm điểm",
  GRADING_COST: "Chi phí chấm điểm",
};

export interface RecentEntry {
  date: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  goods: string[];
}

export async function listRecentEntries(options: { limit?: number; kind?: "sale" | "purchase" | "all" } = {}): Promise<{ entries: RecentEntry[] }> {
  const take = Math.min(Math.max(options.limit ?? 10, 1), 30);
  const kind = options.kind ?? "all";
  const rows = await prisma.cashLedgerEntry.findMany({
    where: kind === "sale" ? { type: { in: ["SALE", "GRADING_INCOME"] } } : kind === "purchase" ? { type: { in: ["PURCHASE", "GRADING_COST"] } } : undefined,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      transaction: { select: { items: { select: { quantity: true, unitPrice: true, sealedProduct: { select: { name: true } }, singleCard: { select: { cardName: true } } } } } },
      gradingIncome: { select: { items: { select: { cardName: true, quantity: true } } } },
      gradingCost: { select: { items: { select: { cardName: true, quantity: true } } } },
    },
  });

  return {
    entries: rows.map((e) => ({
      date: day(e.createdAt),
      type: ENTRY_LABEL[e.type] ?? e.type,
      amount: num(e.amount),
      balanceAfter: num(e.balanceAfter),
      description: e.description,
      goods: [
        ...(e.transaction?.items ?? []).map((i) => `${i.sealedProduct?.name ?? i.singleCard?.cardName ?? "Sản phẩm"} ×${i.quantity} @ ${Math.round(num(i.unitPrice))}₫`),
        ...(e.gradingIncome?.items ?? []).map((i) => `${i.cardName} ×${i.quantity}`),
        ...(e.gradingCost?.items ?? []).map((i) => `${i.cardName} ×${i.quantity}`),
      ],
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
export async function gradingStatus(customer?: string) {
  const [summary, rows] = await Promise.all([
    getGradingSummary(),
    prisma.gradingSubmission.findMany({
      where: { status: { not: "COMPLETED" }, ...(customer?.trim() ? { customerName: { contains: customer.trim(), mode: "insensitive" as const } } : {}) },
      orderBy: { createdAt: "asc" },
      take: 15,
    }),
  ]);
  return {
    summary: {
      activeOrders: summary.activeOrders,
      activeCards: summary.activeCards,
      totalServiceRevenue: summary.totalRevenue,
      totalCost: summary.totalCost,
      totalShip: summary.totalShip,
      totalServiceProfit: summary.totalProfit,
      uncollectedFromCustomers: summary.uncollected,
    },
    openOrders: rows.map((g) => ({
      code: `CĐ-${g.id.slice(-5).toUpperCase()}`,
      customer: g.customerName,
      cards: g.quantity,
      cardName: g.cardName,
      status: gradingStatusLabel[g.status],
      serviceTotal: num(g.chargeAmount),
      serviceProfit: num(g.markup),
      collected: Boolean(g.incomeEntryId),
      createdAt: day(g.createdAt),
    })),
  };
}
