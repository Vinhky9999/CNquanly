import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { DEFAULT_TEMPLATES, type ConversationFilter } from "@/lib/messenger-labels";
import { orderCode } from "@/lib/chat-orders";
import { paymentMethodLabel } from "@/lib/validations/chat-order";

/** One row of the customer's "Lịch sử / Đơn hàng": a sale order or a grading order, with its real payment state. */
export interface HistoryEntry {
  id: string;
  kind: "ORDER" | "GRADING";
  code: string;
  date: Date;
  title: string;
  total: number;
  /** Money really booked in the cash flow (orders) / collected from the customer (grading). */
  paid: boolean;
  paymentLabel: string;
  method: string | null;
  fromChat: boolean;
  /** Booked automatically from Messenger's payment confirmation (not by a click). */
  auto: boolean;
  delivery: boolean;
  tracking: string | null;
}

/** Lower-cased names of everyone who has a grading order, to mark matching conversations. */
async function gradingNameSet(): Promise<Set<string>> {
  const rows = await prisma.gradingSubmission.findMany({ select: { customerName: true }, distinct: ["customerName"] });
  return new Set(rows.map((r) => r.customerName.trim().toLowerCase()));
}

export async function listConversations(search: string | undefined, filter: ConversationFilter) {
  const where: Prisma.MessengerConversationWhereInput = {
    ...(search
      ? {
          OR: [
            { customerName: { contains: search, mode: "insensitive" } },
            { lastMessageText: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filter === "unread" ? { unreadCount: { gt: 0 } } : {}),
    ...(filter === "vip" ? { label: "VIP" } : {}),
  };

  const [rows, names] = await Promise.all([
    prisma.messengerConversation.findMany({
      where,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { lastMessageAt: "desc" },
      take: 200,
    }),
    gradingNameSet(),
  ]);

  const withFlags = rows.map(({ customer, ...c }) => ({
    ...c,
    hasGrading:
      names.has(c.customerName.trim().toLowerCase()) || (customer ? names.has(customer.name.trim().toLowerCase()) : false),
  }));
  return filter === "grading" ? withFlags.filter((c) => c.hasGrading) : withFlags;
}

/** How many conversations each quick filter would show (independent of the search box). */
export async function conversationCounts(): Promise<Record<ConversationFilter, number>> {
  const [rows, names] = await Promise.all([
    prisma.messengerConversation.findMany({
      select: { unreadCount: true, label: true, customerName: true, customer: { select: { name: true } } },
      take: 1000,
    }),
    gradingNameSet(),
  ]);
  return {
    all: rows.length,
    unread: rows.filter((r) => r.unreadCount > 0).length,
    vip: rows.filter((r) => r.label === "VIP").length,
    grading: rows.filter(
      (r) =>
        names.has(r.customerName.trim().toLowerCase()) ||
        (r.customer ? names.has(r.customer.name.trim().toLowerCase()) : false)
    ).length,
  };
}

/** CRM view of one conversation: linked customer, spend, orders, grading and the latest shipment. */
export async function getConversationProfile(conversationId: string) {
  const conv = await prisma.messengerConversation.findUnique({
    where: { id: conversationId },
    include: { customer: true },
  });
  if (!conv) return null;

  const names = [conv.customer?.name, conv.customerName].filter((n): n is string => Boolean(n?.trim()));
  const grading = names.length
    ? await prisma.gradingSubmission.findMany({
        where: { OR: names.map((n) => ({ customerName: { equals: n.trim(), mode: "insensitive" as const } })) },
        select: { id: true, status: true, quantity: true, chargeAmount: true, cardName: true, createdAt: true, incomeEntryId: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  let spend = { total: 0, orders: 0 };
  let recentOrders: {
    id: string;
    code: string;
    date: Date;
    total: number;
    summary: string;
    delivery: boolean;
    image: string | null;
    paid: boolean;
    fromChat: boolean;
  }[] = [];
  let orderHistory: HistoryEntry[] = [];
  let paidTotal = 0;
  let lastPaymentAt: Date | null = null;
  const interestCount = new Map<string, number>();
  let shipment: { trackingCode: string | null; carrier: string | null } | null = null;

  if (conv.customerId) {
    const [sum, count, recent, latestDelivery] = await Promise.all([
      prisma.transaction.aggregate({ _sum: { totalAmount: true }, where: { customerId: conv.customerId, type: "SALE" } }),
      prisma.transaction.count({ where: { customerId: conv.customerId, type: "SALE" } }),
      prisma.transaction.findMany({
        where: { customerId: conv.customerId, type: "SALE" },
        orderBy: { transactionDate: "desc" },
        take: 100,
        include: {
          cashLedgerEntry: { select: { id: true } },
          items: {
            include: {
              sealedProduct: { select: { name: true, game: true, imageUrl: true } },
              singleCard: { select: { cardName: true, game: true, imageUrl: true } },
            },
          },
        },
      }),
      prisma.transaction.findFirst({
        where: { customerId: conv.customerId, orderType: "DELIVERY", trackingCode: { not: null } },
        orderBy: { transactionDate: "desc" },
        select: { trackingCode: true, shippingCarrier: true },
      }),
    ]);
    spend = { total: Number(sum._sum.totalAmount ?? 0), orders: count };
    const mapped = recent.map((t) => {
      const labels = t.items.map((i) => i.sealedProduct?.name ?? i.singleCard?.cardName ?? "Sản phẩm");
      for (const i of t.items) {
        const game = i.sealedProduct?.game ?? i.singleCard?.game;
        if (game) interestCount.set(game, (interestCount.get(game) ?? 0) + 1);
        const card = i.singleCard?.cardName;
        if (card) interestCount.set(card, (interestCount.get(card) ?? 0) + 1);
      }
      const first = t.items[0];
      const paid = Boolean(t.cashLedgerEntry);
      const summary =
        labels.length > 1 ? `${labels[0]} +${labels.length - 1} món` : (labels[0] ?? t.notes ?? "Thanh toán không gắn sản phẩm");
      return {
        order: {
          id: t.id,
          code: orderCode(t.id),
          date: t.transactionDate,
          total: Number(t.totalAmount),
          summary,
          delivery: t.orderType === "DELIVERY",
          image: first?.sealedProduct?.imageUrl ?? first?.singleCard?.imageUrl ?? null,
          paid,
          fromChat: Boolean(t.source?.startsWith("MESSENGER")),
        },
        history: {
          id: t.id,
          kind: "ORDER" as const,
          code: orderCode(t.id),
          date: t.transactionDate,
          title: summary,
          total: Number(t.totalAmount),
          paid,
          paymentLabel: paid ? "Đã thanh toán" : "Không thu tiền (xuất nội bộ)",
          method: paymentMethodLabel(t.paymentMethod),
          fromChat: Boolean(t.source?.startsWith("MESSENGER")),
          auto: t.source === "MESSENGER_AUTO",
          delivery: t.orderType === "DELIVERY",
          tracking: t.trackingCode,
        } satisfies HistoryEntry,
      };
    });
    recentOrders = mapped.slice(0, 5).map((m) => m.order);
    orderHistory = mapped.map((m) => m.history);
    for (const m of mapped) {
      if (!m.history.paid) continue;
      paidTotal += m.history.total;
      if (!lastPaymentAt || m.history.date > lastPaymentAt) lastPaymentAt = m.history.date;
    }
    if (latestDelivery) shipment = { trackingCode: latestDelivery.trackingCode, carrier: latestDelivery.shippingCarrier };
  }

  const gradingHistory: HistoryEntry[] = grading.map((g) => ({
    id: g.id,
    kind: "GRADING" as const,
    code: `CĐ-${g.id.slice(-5).toUpperCase()}`,
    date: g.createdAt,
    title: `Chấm điểm: ${g.cardName}${g.quantity > 1 ? ` (${g.quantity} thẻ)` : ""}`,
    total: Number(g.chargeAmount),
    paid: Boolean(g.incomeEntryId),
    paymentLabel: g.incomeEntryId ? "Đã thu tiền" : "Chưa thu tiền",
    method: null,
    fromChat: false,
    auto: false,
    delivery: false,
    tracking: null,
  }));
  const history = [...orderHistory, ...gradingHistory].sort((a, b) => b.date.getTime() - a.date.getTime());
  const gradingOwed = gradingHistory.filter((g) => !g.paid).reduce((sum, g) => sum + g.total, 0);

  return {
    conversation: {
      id: conv.id,
      psid: conv.psid,
      customerName: conv.customerName,
      profilePic: conv.profilePic,
      label: conv.label,
      notes: conv.notes ?? "",
      customerId: conv.customerId,
    },
    customer: conv.customer ? { id: conv.customer.id, name: conv.customer.name, phone: conv.customer.phone } : null,
    stats: {
      totalSpent: spend.total,
      orderCount: spend.orders,
      gradingActiveCards: grading.filter((g) => g.status !== "COMPLETED").reduce((s, g) => s + g.quantity, 0),
      gradingOrders: grading.length,
      paidTotal,
      lastPaymentAt,
      gradingOwed,
    },
    history,
    recentOrders,
    shipment,
    // Real data only: games and single cards this customer actually bought, most frequent first.
    interests: [...interestCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name),
  };
}

/** Canned replies; the four defaults are created the first time they are asked for. */
export async function getTemplates() {
  const count = await prisma.messengerTemplate.count();
  if (count === 0) {
    await prisma.messengerTemplate.createMany({ data: DEFAULT_TEMPLATES.map((t, position) => ({ ...t, position })) });
  }
  return prisma.messengerTemplate.findMany({ orderBy: { position: "asc" } });
}
