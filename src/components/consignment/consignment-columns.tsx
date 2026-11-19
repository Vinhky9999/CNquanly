"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductThumbnail } from "@/components/inventory/product-thumbnail";
import { formatDate, formatMoney, formatUSD, STATUS_LABEL, STATUS_VARIANT } from "@/components/consignment/format";
import type { ConsignmentItemDTO } from "@/lib/consignment/types";

// A fee figure: bold when the End price is confirmed, muted and marked "tạm tính" while it is only a projection.
function FeeCell({ item, pick, strong }: { item: ConsignmentItemDTO; pick: "probsteinFee" | "myFee" | "customerPayout"; strong?: boolean }) {
  const f = item.finance;
  if (!f.fees) {
    return (
      <span className="text-xs text-muted-foreground" title={f.problem ?? undefined}>
        {f.problem ? "Chưa tính được" : "—"}
      </span>
    );
  }
  const final = f.basis === "FINAL";
  return (
    <div className="flex flex-col items-end gap-0.5 tabular-nums group-data-[layout=stacked]/dt:items-start">
      <span className={final ? (strong ? "whitespace-nowrap font-semibold text-foreground" : "whitespace-nowrap") : "whitespace-nowrap italic text-muted-foreground"}>
        {formatUSD(f.fees[pick])}
      </span>
      {!final && <span className="text-[10px] text-muted-foreground">tạm tính</span>}
    </div>
  );
}

export const consignmentColumns: ColumnDef<ConsignmentItemDTO, any>[] = [
  {
    accessorKey: "title",
    header: "Thẻ",
    meta: { label: "", sortLabel: "Tên thẻ", stack: "full" },
    cell: ({ row }) => {
      const it = row.original;
      const grade = [it.gradingCompany, it.grade].filter(Boolean).join(" ");
      return (
        <div className="flex min-w-[210px] items-center gap-3 group-data-[layout=stacked]/dt:min-w-0">
          <ProductThumbnail src={it.images[0]?.src ?? null} alt={it.title} size="md" />
          <div className="min-w-0">
            <Link href={`/consignment/${it.id}`} className="line-clamp-3 break-words font-medium leading-snug text-foreground hover:underline group-data-[layout=stacked]/dt:line-clamp-none" title={it.title}>
              {it.title}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{it.code}</span>
              {grade && (
                <Badge variant="warning" className="whitespace-nowrap">
                  {grade}
                </Badge>
              )}
              {it.dataSource === "EBAY_API" && (
                <Badge variant="indigo" className="whitespace-nowrap" title="Thông tin lấy từ eBay API">
                  eBay
                </Badge>
              )}
              {it.dataSource === "EBAY_PAGE" && (
                <Badge variant="success" className="whitespace-nowrap" title="Thông tin đọc từ trang eBay do bạn mở trên trình duyệt">
                  eBay · trang
                </Badge>
              )}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "code",
    header: "Khách · Đơn",
    meta: { label: "Khách · Đơn", sortLabel: "Mã ký gửi" },
    cell: ({ row }) => (
      <div className="leading-tight">
        <p className="font-medium">{row.original.order.customerName}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{row.original.order.code}</p>
      </div>
    ),
  },
  {
    accessorKey: "endsAt",
    header: "Đấu giá",
    meta: { label: "Đấu giá", sortLabel: "Ngày kết thúc" },
    cell: ({ row }) => {
      const it = row.original;
      return (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={STATUS_VARIANT[it.effectiveStatus]} className="whitespace-nowrap">
            {STATUS_LABEL[it.effectiveStatus]}
          </Badge>
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {it.endsAt ? formatDate(it.endsAt) : "Chưa có ngày"}
            {it.bidCount !== null ? ` · ${it.bidCount} lượt` : ""}
          </span>
        </div>
      );
    },
  },
  {
    id: "price",
    header: "Giá",
    meta: { align: "right", label: "Giá" },
    cell: ({ row }) => {
      const it = row.original;
      if (it.effectiveStatus === "SOLD" && it.endPrice !== null) {
        return (
          <div className="flex flex-col items-end gap-0.5 tabular-nums group-data-[layout=stacked]/dt:items-start">
            <span className="whitespace-nowrap font-semibold text-foreground">{formatUSD(it.endPrice)}</span>
            <span className="text-[10px] text-muted-foreground">giá End</span>
          </div>
        );
      }
      if (it.effectiveStatus === "UNSOLD") return <span className="text-xs text-muted-foreground">Không bán</span>;
      return (
        <div className="flex flex-col items-end gap-0.5 tabular-nums group-data-[layout=stacked]/dt:items-start">
          <span className="whitespace-nowrap text-muted-foreground">{it.currentPrice !== null ? formatMoney(it.currentPrice, it.currency) : "—"}</span>
          {it.currentPrice !== null && <span className="text-[10px] text-muted-foreground">{it.effectiveStatus === "ENDED" ? "giá cuối theo dõi" : "hiện tại"}</span>}
        </div>
      );
    },
  },
  {
    id: "probsteinFee",
    header: "Phí Probstein",
    meta: { align: "right", label: "Phí Probstein" },
    cell: ({ row }) => <FeeCell item={row.original} pick="probsteinFee" />,
  },
  {
    id: "myFee",
    header: "Phí dịch vụ",
    meta: { align: "right", label: "Phí dịch vụ (lãi của shop)" },
    cell: ({ row }) => <FeeCell item={row.original} pick="myFee" />,
  },
  {
    id: "payout",
    header: "Khách nhận",
    meta: { align: "right", label: "Khách nhận" },
    cell: ({ row }) => <FeeCell item={row.original} pick="customerPayout" strong />,
  },
  {
    id: "actions",
    header: "",
    meta: { align: "right", label: "", stack: "end" },
    cell: ({ row }) => (
      <Button asChild size="sm" variant="secondary" className="h-8">
        <Link href={`/consignment/${row.original.id}`} aria-label={`Xem chi tiết ${row.original.code}`}>
          Chi tiết
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    ),
  },
];
