"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Settings2 } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DateRangeFilter } from "@/components/inventory/date-range-filter";
import { AddConsignmentDialog } from "@/components/consignment/add-consignment-dialog";
import { consignmentColumns } from "@/components/consignment/consignment-columns";
import { formatUSD } from "@/components/consignment/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerTable } from "@/hooks/use-server-table";
import type { ConsignmentItemDTO, ConsignmentSummary } from "@/lib/consignment/types";
import { cn } from "@/lib/utils";

const ALL = "ALL";
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: ALL, label: "Tất cả trạng thái" },
  { value: "ACTIVE", label: "Đang đấu giá" },
  { value: "NEEDS_RESULT", label: "Chờ xác nhận kết quả" },
  { value: "SOLD", label: "Đã bán" },
  { value: "UNSOLD", label: "Không bán được" },
];

const EMPTY_SUMMARY: ConsignmentSummary = {
  totalCards: 0, soldCards: 0, pendingResultCards: 0, totalEndPrice: 0, totalProbsteinFee: 0, totalMyFee: 0,
  totalCustomerPayout: 0, totalPaid: 0, totalRemaining: 0, uncalculatedSold: 0,
};

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "emerald" | "rose" | "amber" }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-xl font-semibold tabular-nums",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
          tone === "rose" && "text-rose-600 dark:text-rose-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ConsignmentWorkspace() {
  const [status, setStatus] = useState(ALL);
  const [customer, setCustomer] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [summary, setSummary] = useState<ConsignmentSummary>(EMPTY_SUMMARY);
  const [summaryError, setSummaryError] = useState(false);
  const [ebayConfigured, setEbayConfigured] = useState<boolean | null>(null);

  // The same filters feed the table and the dashboard totals, so the numbers always describe what the table lists.
  const filters = useMemo<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    if (status !== ALL) f.status = status;
    if (customer.trim()) f.customer = customer.trim();
    if (orderCode.trim()) f.orderCode = orderCode.trim();
    if (dateFrom) f.dateFrom = dateFrom;
    if (dateTo) f.dateTo = dateTo;
    return f;
  }, [status, customer, orderCode, dateFrom, dateTo]);

  const t = useServerTable<ConsignmentItemDTO>("/api/consignment/items", filters);
  const { refresh, search } = t;

  const loadSummary = useCallback(() => {
    const params = new URLSearchParams({ summary: "1", ...filters });
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/consignment/items?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("summary"))))
      .then((j: ConsignmentSummary) => {
        setSummary(j);
        setSummaryError(false);
      })
      .catch(() => setSummaryError(true));
  }, [filters, search]);

  useEffect(() => {
    const timer = setTimeout(loadSummary, 250);
    return () => clearTimeout(timer);
  }, [loadSummary]);

  const refreshAll = useCallback(() => {
    refresh();
    loadSummary();
  }, [refresh, loadSummary]);

  // While the page is open, cards still waiting for an auction result are re-read from eBay (at most every 2 minutes per card).
  useEffect(() => {
    let cancelled = false;
    const run = () =>
      fetch("/api/consignment/refresh-active", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (cancelled || !j) return;
          setEbayConfigured(Boolean(j.configured));
          if (j.checked > 0) refreshAll();
        })
        .catch(() => {});
    run();
    const timer = setInterval(run, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Ký Gửi eBay &amp; Probstein</h1>
          <p className="text-sm text-muted-foreground">
            Theo dõi thẻ khách ký gửi đấu giá trên eBay: giá End, phí Probstein, phí dịch vụ của shop và tiền khách được nhận.
          </p>
        </div>
        <Button asChild variant="outline" className="h-10 rounded-xl border-border/80 bg-input hover:bg-accent/40">
          <Link href="/consignment/settings">
            <Settings2 className="h-4 w-4" />
            Biểu phí Probstein
          </Link>
        </Button>
      </div>

      {ebayConfigured === false && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Chưa cấu hình eBay API (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET): hệ thống chưa tự lấy được thông tin và giá từ link eBay. Bạn vẫn nhập tay và tải ảnh lên được; hướng dẫn trong DEPLOYMENT.md.
        </p>
      )}

      <section aria-label="Thống kê tài chính" className="space-y-2">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Tổng số thẻ ký gửi" value={String(summary.totalCards)} hint={summary.pendingResultCards > 0 ? `${summary.pendingResultCards} thẻ chờ xác nhận kết quả` : undefined} />
          <Stat label="Thẻ đã bán" value={String(summary.soldCards)} />
          <Stat label="Tổng giá End" value={formatUSD(summary.totalEndPrice)} />
          <Stat label="Tổng phí Probstein" value={formatUSD(summary.totalProbsteinFee)} tone="rose" />
          <Stat label="Doanh thu phí dịch vụ của shop" value={formatUSD(summary.totalMyFee)} tone="emerald" />
          <Stat label="Tổng tiền khách được nhận" value={formatUSD(summary.totalCustomerPayout)} />
          <Stat label="Tổng tiền đã thanh toán" value={formatUSD(summary.totalPaid)} />
          <Stat label="Còn phải trả khách" value={formatUSD(summary.totalRemaining)} tone={summary.totalRemaining > 0 ? "amber" : undefined} />
        </div>
        <p className="px-1 text-[11px] text-muted-foreground">
          Số tiền chỉ tính các thẻ đã bán và đã xác nhận giá End (USD). Thẻ đang đấu giá hoặc chờ xác nhận chỉ có số tạm tính trong từng thẻ.
        </p>
        {summary.uncalculatedSold > 0 && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {summary.uncalculatedSold} thẻ đã bán chưa được tính vào các khoản phí vì chưa có biểu phí Probstein.{" "}
            <Link href="/consignment/settings" className="font-semibold underline">Nhập biểu phí</Link>
          </p>
        )}
        {summaryError && <p className="px-1 text-xs text-danger">Không tải được số liệu thống kê. Thử tải lại trang.</p>}
      </section>

      <DataTable
        columns={consignmentColumns}
        data={t.data}
        total={t.total}
        page={t.page}
        onPageChange={t.setPage}
        pageSize={t.pageSize}
        onPageSizeChange={t.setPageSize}
        pageCount={t.pageCount}
        search={t.search}
        onSearchChange={t.setSearch}
        searchPlaceholder="Tìm mã ký gửi, tên thẻ, Item ID, Cert, khách…"
        sorting={t.sorting}
        onSortingChange={t.setSorting}
        isLoading={t.isLoading}
        error={t.error}
        onRetry={t.refresh}
        onMutated={refreshAll}
        emptyMessage="Chưa có thẻ ký gửi nào khớp bộ lọc."
        compact
        stackBelow={1100}
        toolbarExtra={
          <>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10 w-[210px]" aria-label="Lọc theo trạng thái">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Khách hàng" aria-label="Lọc theo khách hàng" className="h-10 w-[150px] rounded-xl bg-input" />
            <Input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} placeholder="Mã đơn" aria-label="Lọc theo mã đơn" className="h-10 w-[130px] rounded-xl bg-input" />
            <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
            <div className="sm:ml-auto">
              <AddConsignmentDialog ebayConfigured={ebayConfigured} onCreated={refreshAll} />
            </div>
          </>
        }
      />
    </div>
  );
}
