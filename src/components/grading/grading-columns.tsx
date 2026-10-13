"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { GradingStatus } from "@prisma/client";
import { Banknote, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GradingFormDialog } from "@/components/grading/grading-form-dialog";
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
  incomeEntryId: string | null;
  costEntryId: string | null;
  createdAt: string;
  updatedAt: string;
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
    header: "Thẻ",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="min-w-0">
          <p className="font-medium">
            {r.cardName}
            {r.quantity > 1 && <span className="text-muted-foreground"> ×{r.quantity}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {[r.sku, r.certNumber ? `Cert ${r.certNumber}` : null].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      );
    },
  },
  {
    id: "service",
    header: "Hãng / Gói",
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <Badge variant="outline">{row.original.company}</Badge>
        <span className="text-xs text-muted-foreground">
          {row.original.tier} · niêm yết {formatVND(Number(row.original.listedFee))}
        </span>
      </div>
    ),
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
          <GradingFormDialog submission={r as any} onSuccess={onMutated} />
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
