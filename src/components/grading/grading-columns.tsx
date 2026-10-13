"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { GradingStatus } from "@prisma/client";
import { Banknote, Layers, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GradingFormDialog, type GradingItemRow } from "@/components/grading/grading-form-dialog";
import { GRADING_STATUSES, gradingStatusLabel, gradingStatusVariant } from "@/lib/grading";
import { formatDate, formatVND } from "@/lib/utils";
import {
  collectGradingPaymentAction,
  deleteGradingAction,
  payGradingCostAction,
  updateGradingStatusAction,
} from "@/server/actions/grading";

// Decimal columns arrive as strings in the JSON response.
export interface GradingRow {
  id: string;
  customerName: string;
  customerContact: string | null;
  cardName: string;
  sku: string | null;
  certNumber: string | null;
  company: string;
  tier: string;
  quantity: number;
  listedFee: string;
  costPrice: string;
  markup: string;
  chargeAmount: string;
  status: GradingStatus;
  notes: string | null;
  items: GradingItemRow[];
  incomeEntryId: string | null;
  costEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

function itemsTotal(item: GradingItemRow) {
  return Number(item.costPrice) + Number(item.markup);
}

// "Đơn 5 thẻ (PSA - Express)" with a popover listing every card the customer sent.
function CardsSummary({ row }: { row: GradingRow }) {
  const cards = row.items.reduce((s, i) => s + i.quantity, 0) || row.quantity;
  const label = `Đơn ${cards} thẻ (${row.company} - ${row.tier})`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex max-w-[220px] items-start gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/5"
          aria-label={`Xem chi tiết ${label}`}
        >
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{label}</span>
            <span className="block truncate text-xs text-muted-foreground">{row.cardName}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,420px)] space-y-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {row.customerName} · {row.items.length} dòng thẻ
        </p>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {row.items.map((item, index) => (
            <li
              key={item.id ?? index}
              className="rounded-xl border border-border/60 bg-card/60 p-2 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {item.cardName}
                    {item.quantity > 1 && <span className="text-muted-foreground"> ×{item.quantity}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[item.game, `${item.company} ${item.tier}`, item.sku, item.certNumber ? `Cert ${item.certNumber}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{formatVND(itemsTotal(item))}</span>
              </div>
              <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                Gốc {formatVND(Number(item.costPrice))} ·{" "}
                <span className="text-emerald-600 dark:text-emerald-400">lãi +{formatVND(Number(item.markup))}</span>
              </p>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs tabular-nums">
          <span className="text-muted-foreground">Gốc {formatVND(Number(row.costPrice))}</span>
          <span className="text-emerald-600 dark:text-emerald-400">Lãi +{formatVND(Number(row.markup))}</span>
          <span className="font-semibold">Khách trả {formatVND(Number(row.chargeAmount))}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const gradingColumns: ColumnDef<GradingRow, any>[] = [
  {
    accessorKey: "customerName",
    header: "Khách hàng",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="font-medium">{row.original.customerName}</p>
        {row.original.customerContact && (
          <p className="text-xs text-muted-foreground">{row.original.customerContact}</p>
        )}
      </div>
    ),
  },
  {
    id: "card",
    header: "Thẻ gửi chấm",
    cell: ({ row }) => <CardsSummary row={row.original} />,
  },
  {
    accessorKey: "costPrice",
    header: "Giá gốc",
    cell: ({ row, table }) => {
      const r = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <div className="flex flex-col items-start gap-1 tabular-nums">
          <span>{formatVND(Number(r.costPrice))}</span>
          {r.costEntryId ? (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Đã chi trả hãng</span>
          ) : (
            <button
              type="button"
              className="text-[10px] text-amber-600 underline dark:text-amber-400"
              onClick={async () => {
                const result = await payGradingCostAction(r.id);
                if (result?.error) return toast.error(result.error);
                toast.success("Đã ghi khoản chi phí gốc vào Dòng tiền");
                onMutated?.();
              }}
            >
              Chưa trả hãng — ghi chi
            </button>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "markup",
    header: "Lãi dịch vụ",
    cell: ({ row }) => (
      <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
        +{formatVND(Number(row.original.markup))}
      </span>
    ),
  },
  {
    accessorKey: "chargeAmount",
    header: "Khách trả",
    cell: ({ row, table }) => {
      const r = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <div className="flex flex-col items-start gap-1 tabular-nums">
          <span className="font-semibold">{formatVND(Number(r.chargeAmount))}</span>
          {r.incomeEntryId ? (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Đã thu tiền</span>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[10px] text-amber-600 underline dark:text-amber-400"
              onClick={async () => {
                const result = await collectGradingPaymentAction(r.id);
                if (result?.error) return toast.error(result.error);
                toast.success("Đã ghi khoản thu vào Dòng tiền");
                onMutated?.();
              }}
            >
              <Banknote className="h-3 w-3" />
              Chưa thu — ghi thu
            </button>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    cell: ({ row, table }) => {
      const r = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <div className="flex flex-col items-start gap-1.5">
          <Badge variant={gradingStatusVariant[r.status]}>{gradingStatusLabel[r.status]}</Badge>
          <Select
            value={r.status}
            onValueChange={async (value) => {
              const result = await updateGradingStatusAction(r.id, value as GradingStatus);
              if (result?.error) return toast.error(result.error);
              toast.success(`Đã chuyển sang "${gradingStatusLabel[value as GradingStatus]}"`);
              onMutated?.();
            }}
          >
            <SelectTrigger className="h-7 w-[150px] text-xs" aria-label="Đổi trạng thái">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRADING_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {gradingStatusLabel[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Ngày tạo",
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const r = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <div className="flex items-center justify-end gap-1">
          <GradingFormDialog submission={r} onSuccess={onMutated} />
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              const note =
                r.incomeEntryId || r.costEntryId ? " Các dòng thu/chi liên quan trong Dòng tiền cũng sẽ bị xoá." : "";
              if (!confirm(`Xoá đơn chấm điểm của ${r.customerName}?${note}`)) return;
              const result = await deleteGradingAction(r.id);
              if (result?.error) return toast.error(result.error);
              toast.success("Đã xoá đơn chấm điểm");
              onMutated?.();
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      );
    },
  },
];
