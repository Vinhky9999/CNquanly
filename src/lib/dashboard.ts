import { prisma } from "@/lib/prisma";
import { getDebtSummary, type DebtSummary } from "@/lib/debt-summary";
import { getInventoryGameOverview, type GameOverviewEntry } from "@/lib/inventory-overview";
import { getPortfolioSummary } from "@/lib/portfolio";

const DAY_MS = 24 * 3600 * 1000;
/** Stock with no sale for this many days counts as slow-moving. */
export const SLOW_MOVING_DAYS = 60;

export interface AttentionDebt {
  id: string;
  personName: string;
  type: "ADVANCED_BY_PERSON" | "ADVANCED_TO_PERSON";
  remaining: number;
  referenceLabel: string | null;
  ageDays: number;
}

export interface AttentionChat {
  id: string;
  customerName: string;
  preview: string;
  unreadCount: number;
  waitingReply: boolean;
  label: string | null;
  lastMessageAt: Date;
}

export interface SlowItem {
  id: string;
  kind: "SEALED" | "SINGLE";
  sku: string;
  name: string;
  quantity: number;
  capital: number;
  ageDays: number;
  neverSold: boolean;
}

export interface DashboardData {
  portfolio: Awaited<ReturnType<typeof getPortfolioSummary>>;
  valuation: {
    capital: number;
    marketValue: number;
    pricedCost: number;
    pricedSkus: number;
    totalSkus: number;
    unrealized: number;
    unrealizedPct: number;
  };
  debts: DebtSummary;
  games: GameOverviewEntry[];
  crm: {
    customers: number;
    conversations: number;
    unreadConversations: number;
    waitingReply: number;
    needsAttention: number; // unread or waiting for the shop's reply, each conversation once
    vip: number;
    potential: number;
  };
  grading: {
    pendingSend: { orders: number; cards: number };
    atGrader: { orders: number; cards: number };
    shippingBack: { orders: number; cards: number };
    uncollected: number;
  };
  attention: {
    debts: AttentionDebt[];
    chats: AttentionChat[];
    slow: SlowItem[];
    slowTotal: number;
  };
}

async function slowMovingItems(): Promise<{ items: SlowItem[]; total: number }> {
  const [sealed, singles, sales] = await Promise.all([
    prisma.sealedProduct.findMany({
      where: { quantity: { gt: 0 } },
      select: { id: true, sku: true, name: true, quantity: true, costPrice: true, createdAt: true },
    }),
    prisma.singleCard.findMany({
      where: { status: { not: "SOLD" }, quantity: { gt: 0 } },
      select: { id: true, sku: true, cardName: true, quantity: true, costPrice: true, createdAt: true },
    }),
    // Newest first, so the first time a product is seen is its latest sale.
    prisma.transaction.findMany({
      where: { type: "SALE" },
      orderBy: { transactionDate: "desc" },
      select: { transactionDate: true, items: { select: { sealedProductId: true, singleCardId: true } } },
    }),
  ]);

  const lastSale = new Map<string, Date>();
  for (const t of sales) {
    for (const i of t.items) {
      const id = i.sealedProductId ?? i.singleCardId;
      if (id && !lastSale.has(id)) lastSale.set(id, t.transactionDate);
    }
  }

  const now = Date.now();
  const build = (
    kind: SlowItem["kind"],
    row: { id: string; sku: string; quantity: number; costPrice: unknown; createdAt: Date },
    name: string
  ): SlowItem => {
    const sold = lastSale.get(row.id);
    const since = sold ?? row.createdAt;
    return {
      id: row.id,
      kind,
      sku: row.sku,
      name,
      quantity: row.quantity,
      capital: Number(row.costPrice) * row.quantity,
      ageDays: Math.floor((now - since.getTime()) / DAY_MS),
      neverSold: !sold,
    };
  };

  const all = [...sealed.map((p) => build("SEALED", p, p.name)), ...singles.map((c) => build("SINGLE", c, c.cardName))].filter(
    (i) => i.ageDays >= SLOW_MOVING_DAYS
  );
  all.sort((a, b) => b.capital - a.capital);
  return { items: all.slice(0, 6), total: all.length };
}

export async function getDashboardData(): Promise<DashboardData> {
  const [portfolio, games, debts, customers, conversations, grading, openDebts, slow] = await Promise.all([
    getPortfolioSummary(),
    getInventoryGameOverview(),
    getDebtSummary(),
    prisma.customer.count(),
    prisma.messengerConversation.findMany({
      orderBy: { lastMessageAt: "desc" },
      take: 300,
      select: {
        id: true,
        customerName: true,
        lastMessageText: true,
        lastMessageAt: true,
        unreadCount: true,
        label: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true } },
      },
    }),
    prisma.gradingSubmission.findMany({
      select: { status: true, quantity: true, chargeAmount: true, incomeEntryId: true },
    }),
    prisma.debt.findMany({
      where: { status: { not: "PAID" } },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, type: true, personName: true, amount: true, paidAmount: true, referenceLabel: true, createdAt: true },
    }),
    slowMovingItems(),
  ]);

  const valuation = games.reduce(
    (acc, g) => {
      acc.capital += g.totalValue;
      acc.marketValue += g.marketValue;
      acc.pricedCost += g.pricedCost;
      acc.pricedSkus += g.pricedSkuCount;
      acc.totalSkus += g.skuCount;
      return acc;
    },
    { capital: 0, marketValue: 0, pricedCost: 0, pricedSkus: 0, totalSkus: 0 }
  );
  // Compared against the cost of the SAME priced SKUs, so unpriced stock never shows as a fake loss.
  const unrealized = valuation.marketValue - valuation.pricedCost;

  const withState = conversations.map((c) => ({
    ...c,
    waitingReply: c.messages[0]?.direction === "IN",
  }));
  const needsAttention = withState.filter((c) => c.unreadCount > 0 || c.waitingReply);

  const bucket = (status: string) => {
    const rows = grading.filter((g) => g.status === status);
    return { orders: rows.length, cards: rows.reduce((s, g) => s + g.quantity, 0) };
  };

  const now = Date.now();
  return {
    portfolio,
    valuation: {
      ...valuation,
      unrealized,
      unrealizedPct: valuation.pricedCost > 0 ? (unrealized / valuation.pricedCost) * 100 : 0,
    },
    debts,
    games,
    crm: {
      customers,
      conversations: conversations.length,
      unreadConversations: withState.filter((c) => c.unreadCount > 0).length,
      waitingReply: withState.filter((c) => c.waitingReply).length,
      needsAttention: needsAttention.length,
      vip: conversations.filter((c) => c.label === "VIP").length,
      potential: conversations.filter((c) => c.label === "POTENTIAL").length,
    },
    grading: {
      pendingSend: bucket("PENDING_SEND"),
      atGrader: bucket("AT_GRADER"),
      shippingBack: bucket("SHIPPING_BACK"),
      uncollected: grading.filter((g) => !g.incomeEntryId).reduce((s, g) => s + Number(g.chargeAmount), 0),
    },
    attention: {
      debts: openDebts
        .map((d) => ({
          id: d.id,
          personName: d.personName,
          type: d.type,
          remaining: Number(d.amount) - Number(d.paidAmount),
          referenceLabel: d.referenceLabel,
          ageDays: Math.floor((now - d.createdAt.getTime()) / DAY_MS),
        }))
        .slice(0, 5),
      chats: needsAttention.slice(0, 6).map((c) => ({
        id: c.id,
        customerName: c.customerName,
        preview: c.lastMessageText ?? "",
        unreadCount: c.unreadCount,
        waitingReply: c.waitingReply,
        label: c.label,
        lastMessageAt: c.lastMessageAt,
      })),
      slow: slow.items,
      slowTotal: slow.total,
    },
  };
}
