import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { ebayConfigured, fetchEbayItem } from "@/lib/ebay/client";
import { mapEbayItem } from "@/lib/ebay/map";
import { parseEbayUrl } from "@/lib/ebay/url";
import { guarded, readJson } from "@/lib/consignment/api";

export const dynamic = "force-dynamic";

/** Whether the eBay API keys are set (the screen shows it so the owner knows if links can be read automatically). */
export async function GET() {
  return guarded(async () => NextResponse.json({ configured: ebayConfigured() }));
}

/**
 * Reads an eBay link and returns a preview of the listing. Nothing is saved here. When eBay cannot be read the answer says
 * why (`ok: false`, `kind`, `error`) and the screen falls back to manual entry; it never returns made-up data.
 */
export async function POST(request: NextRequest) {
  return guarded(async () => {
    const { url } = z.object({ url: z.string().max(1000) }).parse(await readJson(request));
    const parsed = parseEbayUrl(url);
    if (!parsed.ok) return NextResponse.json({ ok: false, kind: "INVALID_URL", error: parsed.error }, { status: 400 });
    const { itemId, marketplace, url: canonical } = parsed.value;

    const existing = await prisma.consignmentItem.findFirst({
      where: { ebayItemId: itemId },
      select: { id: true, code: true, order: { select: { customerName: true } } },
    });

    const res = await fetchEbayItem(itemId, marketplace);
    if (!res.ok) return NextResponse.json({ ok: false, kind: res.kind, error: res.message, itemId, marketplace, url: canonical, existing });

    const listing = mapEbayItem(res.item, itemId);
    const warnings: string[] = [];
    if (!listing.isAuction) warnings.push("Listing này không phải đấu giá (Auction). Vẫn lưu được, nhưng giá hiện tại là giá bán, không phải giá đấu.");
    if (listing.ended) warnings.push("Đấu giá đã kết thúc. Hãy nhập giá End thực tế khi xác nhận kết quả.");
    if (listing.currency && listing.currency !== "USD") warnings.push(`Giá eBay tính bằng ${listing.currency}. Biểu phí tính bằng USD nên khi chốt hãy nhập giá End quy đổi ra USD.`);
    if (!listing.title) warnings.push("eBay không trả tên sản phẩm. Hãy nhập tay.");
    if (existing) warnings.push(`Item ID này đã có trong hồ sơ ký gửi (${existing.code}, khách ${existing.order.customerName}).`);
    return NextResponse.json({ ok: true, itemId, marketplace, url: canonical, listing, existing, warnings });
  });
}
