"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EbayPageImport, type ImportedPage } from "@/components/consignment/ebay-page-import";
import { formatDateTime, formatMoney, STATUS_LABEL } from "@/components/consignment/format";
import type { ConsignmentItemDTO } from "@/lib/consignment/types";

interface Row {
  label: string;
  before: string;
  after: string;
  /** The page gave a value, so it will be written to the card. */
  apply: boolean;
}

/** What to send to the card for this page: only what the page really said, never an empty value. */
export function updateFromPage(page: ImportedPage): Record<string, unknown> {
  const l = page.listing;
  const body: Record<string, unknown> = { pageSync: true, listingStatus: l.ended ? "ENDED" : "ACTIVE" };
  // A price without a known currency is not applied: a bare "$" could be dollars of any country.
  if (l.currentPrice !== null && l.currency) {
    body.currentPrice = l.currentPrice;
    body.currency = l.currency;
  }
  if (l.bidCount !== null) body.bidCount = l.bidCount;
  if (l.endsAt) body.endsAt = l.endsAt;
  if (l.seller) body.seller = l.seller;
  return body;
}

// "Cập nhật từ trang eBay": the keyless way to refresh a card's live auction figures. The owner copies the listing page from
// his own browser, the figures are shown next to the saved ones, and only what the page really said is written.
export function PageUpdateDialog({
  item,
  open,
  onOpenChange,
  busy,
  onApply,
}: {
  item: ConsignmentItemDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onApply: (body: Record<string, unknown>) => void | Promise<void>;
}) {
  const [page, setPage] = useState<ImportedPage | null>(null);

  useEffect(() => {
    if (!open) setPage(null);
  }, [open]);

  const rows: Row[] = [];
  if (page) {
    const l = page.listing;
    const priceKnown = l.currentPrice !== null && Boolean(l.currency);
    const unread = "không đọc được, giữ nguyên";
    rows.push(
      { label: "Giá hiện tại", before: formatMoney(item.currentPrice, item.currency), after: priceKnown ? formatMoney(l.currentPrice, l.currency!) : l.currentPrice !== null ? `${l.currentPrice} (không rõ loại tiền, giữ nguyên)` : unread, apply: priceKnown },
      { label: "Số lượt đấu giá", before: String(item.bidCount ?? "—"), after: l.bidCount !== null ? String(l.bidCount) : unread, apply: l.bidCount !== null },
      { label: "Kết thúc", before: formatDateTime(item.endsAt), after: l.endsAt ? formatDateTime(l.endsAt) : unread, apply: Boolean(l.endsAt) },
      { label: "Trạng thái", before: STATUS_LABEL[item.listingStatus], after: STATUS_LABEL[l.ended ? "ENDED" : "ACTIVE"], apply: true },
      { label: "Seller", before: item.seller ?? "—", after: l.seller ?? unread, apply: Boolean(l.seller) }
    );
  }
  // Card details are not touched by an update, so warnings about them are not shown here.
  const warnings = page ? page.warnings.filter((w) => !/Item specifics|tên sản phẩm/i.test(w)) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cập nhật từ trang eBay</DialogTitle>
          <DialogDescription>
            Lấy giá, số lượt đấu giá và trạng thái mới nhất từ trang eBay của thẻ {item.code}, không cần khoá API. Thông tin thẻ bạn đã nhập không bị thay đổi.
          </DialogDescription>
        </DialogHeader>

        {!page ? (
          <EbayPageImport openUrl={item.ebayUrl} expectedItemId={item.ebayItemId} onParsed={setPage} title="Sao chép trang eBay của thẻ này" />
        ) : (
          <div className="space-y-3">
            <p className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Đã đọc trang của Item ID {page.itemId}
                {page.capturedAt ? ` (sao chép lúc ${formatDateTime(page.capturedAt.toISOString())})` : ""}. Kiểm tra số liệu rồi bấm “Áp dụng”.
              </span>
            </p>

            <div className="divide-y divide-border/50 rounded-xl border border-border/60">
              {rows.map((r) => {
                const changed = r.apply && r.before !== r.after;
                return (
                  <div key={r.label} className="grid grid-cols-[110px_1fr] items-center gap-2 px-3 py-2 text-sm sm:grid-cols-[140px_1fr_auto_1fr]">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="tabular-nums">{r.before}</span>
                    <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
                    <span className={changed ? "font-semibold tabular-nums text-foreground" : "tabular-nums text-muted-foreground"}>
                      <span className="sm:hidden">→ </span>
                      {r.after}
                    </span>
                  </div>
                );
              })}
            </div>

            {page.listing.ended && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Đấu giá đã kết thúc
                  {page.winningBid !== null ? `; giá thắng ghi trên trang là ${formatMoney(page.winningBid, page.listing.currency ?? item.currency)}` : ""}. Sau khi áp dụng, vào mục “Kết quả đấu giá” để xác nhận Đã bán và nhập giá End thực tế.
                </span>
              </p>
            )}
            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {w}
              </p>
            ))}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setPage(null)} disabled={busy}>
                Đọc lại trang khác
              </Button>
              <Button type="button" onClick={() => void onApply(updateFromPage(page))} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Áp dụng
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
