import { prisma } from "@/lib/prisma";
import { ebayConfigured, fetchEbayItem } from "@/lib/ebay/client";
import { mapEbayItem } from "@/lib/ebay/map";
import { ConsignmentError } from "@/lib/consignment/mutations";

// Keeps the auction figures of a card in step with eBay. It only ever updates the live auction fields (price, bids, end
// time, status): the card details the owner may have edited are left alone. A confirmed result (SOLD / UNSOLD) is never touched.

export interface RefreshOutcome {
  outcome: "UPDATED" | "ENDED" | "SKIPPED" | "ERROR";
  message: string;
}

export async function refreshItem(id: string, now = new Date()): Promise<RefreshOutcome> {
  const item = await prisma.consignmentItem.findUnique({ where: { id } });
  if (!item) throw new ConsignmentError("Không tìm thấy thẻ ký gửi.", 404);
  if (item.listingStatus === "SOLD" || item.listingStatus === "UNSOLD") return { outcome: "SKIPPED", message: "Đã xác nhận kết quả đấu giá nên không cập nhật nữa." };
  if (!item.ebayItemId) return { outcome: "SKIPPED", message: "Thẻ nhập tay, không có Item ID eBay để theo dõi." };

  const res = await fetchEbayItem(item.ebayItemId, item.ebayMarketplace ?? "EBAY_US");

  if (!res.ok) {
    if (res.kind === "NOT_FOUND") {
      // eBay no longer returns the listing: it has ended (or was removed). The last tracked price stays on the card for the owner to confirm.
      const last = item.currentPrice !== null ? ` Giá cuối đã theo dõi: ${item.currency} ${Number(item.currentPrice).toFixed(2)}.` : "";
      await prisma.consignmentItem.update({
        where: { id },
        data: { listingStatus: "ENDED", fetchError: `${res.message}${last} Hãy xác nhận kết quả (đã bán với giá End bao nhiêu, hoặc không bán được).` },
      });
      return { outcome: "ENDED", message: "Listing đã kết thúc hoặc không còn trên eBay. Cần xác nhận kết quả." };
    }
    await prisma.consignmentItem.update({ where: { id }, data: { fetchError: res.message } });
    return { outcome: "ERROR", message: res.message };
  }

  const listing = mapEbayItem(res.item, item.ebayItemId, now);
  await prisma.consignmentItem.update({
    where: { id },
    data: {
      listingStatus: listing.ended ? "ENDED" : "ACTIVE",
      ...(listing.currentPrice !== null ? { currentPrice: listing.currentPrice } : {}),
      ...(listing.currency ? { currency: listing.currency } : {}),
      ...(listing.bidCount !== null ? { bidCount: listing.bidCount } : {}),
      ...(listing.endsAt ? { endsAt: new Date(listing.endsAt) } : {}),
      ...(listing.seller ? { seller: listing.seller } : {}),
      dataSource: "EBAY_API",
      fetchedAt: now,
      fetchError: null,
    },
  });
  return listing.ended
    ? { outcome: "ENDED", message: "Đấu giá đã kết thúc. Hãy xác nhận kết quả và giá End." }
    : { outcome: "UPDATED", message: "Đã cập nhật giá và số lượt đấu giá từ eBay." };
}

const MIN_INTERVAL_MS = 2 * 60 * 1000;
const BATCH = 25;

/** Refreshes the cards still waiting for a result. Called while the Ký gửi page is open, and by the optional cron route. */
export async function refreshActiveItems(now = new Date()): Promise<{ configured: boolean; checked: number; updated: number; ended: number; errors: number }> {
  if (!ebayConfigured()) return { configured: false, checked: 0, updated: 0, ended: 0, errors: 0 };

  const due = await prisma.consignmentItem.findMany({
    where: {
      ebayItemId: { not: null },
      OR: [{ listingStatus: "ACTIVE" }, { listingStatus: "ENDED", fetchError: null }],
      AND: [{ OR: [{ fetchedAt: null }, { fetchedAt: { lt: new Date(now.getTime() - MIN_INTERVAL_MS) } }] }],
    },
    orderBy: { endsAt: { sort: "asc", nulls: "last" } },
    take: BATCH,
    select: { id: true },
  });

  const totals = { configured: true, checked: 0, updated: 0, ended: 0, errors: 0 };
  const queue = [...due];
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) {
        const next = queue.shift()!;
        const r = await refreshItem(next.id, now).catch(() => ({ outcome: "ERROR" as const, message: "" }));
        totals.checked += 1;
        if (r.outcome === "UPDATED") totals.updated += 1;
        else if (r.outcome === "ENDED") totals.ended += 1;
        else if (r.outcome === "ERROR") totals.errors += 1;
      }
    })
  );
  return totals;
}
