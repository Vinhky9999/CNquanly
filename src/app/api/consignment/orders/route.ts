import { NextRequest, NextResponse } from "next/server";

import { guarded } from "@/lib/consignment/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Existing orders (for adding another card to a customer's order). ?q= filters by code or customer name. */
export async function GET(request: NextRequest) {
  return guarded(async () => {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    const orders = await prisma.consignmentOrder.findMany({
      where: q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }] } : {},
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, code: true, customerName: true, customerContact: true, _count: { select: { items: true } } },
    });
    return NextResponse.json({
      orders: orders.map((o) => ({ id: o.id, code: o.code, customerName: o.customerName, customerContact: o.customerContact, cards: o._count.items })),
    });
  });
}
