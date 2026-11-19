import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { guarded } from "@/lib/consignment/api";

export const dynamic = "force-dynamic";

/**
 * Is this eBay Item ID already in the consignment file? Used after a page was read in the browser (the server never sees the
 * page itself), so the screen can warn about a duplicate before the card is saved.
 */
export async function GET(request: NextRequest) {
  return guarded(async () => {
    const itemId = request.nextUrl.searchParams.get("itemId")?.trim() ?? "";
    if (!/^\d{9,14}$/.test(itemId)) return NextResponse.json({ error: "Item ID eBay phải gồm 9–14 chữ số." }, { status: 400 });
    const existing = await prisma.consignmentItem.findFirst({
      where: { ebayItemId: itemId },
      select: { id: true, code: true, order: { select: { customerName: true } } },
    });
    return NextResponse.json({ existing: existing ? { id: existing.id, code: existing.code, customerName: existing.order.customerName } : null });
  });
}
