import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { DEFAULT_TEMPLATES, type ConversationFilter } from "@/lib/messenger-labels";

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
        select: { id: true, status: true, quantity: true, chargeAmount: true },
      })
    : [];

  let spend = { total: 0, orders: 0 };
  let recentOrders: { id: string; date: Date; total: number; summary: string; delivery: boolean }[] = [];
  let shipment: { trackingCode: string | null; carrier: string | null } | null = null;

  if (conv.customerId) {
    const [sum, count, recent, latestDelivery] = await Promise.all([
      prisma.transaction.aggregate({ _sum: { totalAmount: true }, where: { customerId: conv.customerId, type: "SALE" } }),
      prisma.transaction.count({ where: { customerId: conv.customerId, type: "SALE" } }),
      prisma.transaction.findMany({
        where: { customerId: conv.customerId, type: "SALE" },
        orderBy: { transactionDate: "desc" },
        take: 5,
        include: { items: { include: { sealedProduct: { select: { name: true } }, singleCard: { select: { cardName: true } } } } },
      }),
      prisma.transaction.findFirst({
        where: { customerId: conv.customerId, orderType: "DELIVERY", trackingCode: { not: null } },
        orderBy: { transactionDate: "desc" },
        select: { trackingCode: true, shippingCarrier: true },
      }),
    ]);
    spend = { total: Number(sum._sum.totalAmount ?? 0), orders: count };
    recentOrders = recent.map((t) => {
      const labels = t.items.map((i) => i.sealedProduct?.name ?? i.singleCard?.cardName ?? "Sản phẩm");
      return {
        id: t.id,
        date: t.transactionDate,
        total: Number(t.totalAmount),
        summary: labels.length > 1 ? `${labels[0]} +${labels.length - 1} món` : (labels[0] ?? "—"),
        delivery: t.orderType === "DELIVERY",
      };
    });
    if (latestDelivery) shipment = { trackingCode: latestDelivery.trackingCode, carrier: latestDelivery.shippingCarrier };
  }

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
    },
    recentOrders,
    shipment,
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
