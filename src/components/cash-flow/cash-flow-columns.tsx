"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { CashLedgerEntry } from "@prisma/client";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, formatVND } from "@/lib/utils";
import { deleteCashLedgerEntryAction } from "@/server/actions/cash-flow";
import { CashEntryEditDialog } from "@/components/cash-flow/cash-entry-edit-dialog";

const typeLabel: Record<string, string> = {
  PURCHASE: "Mua hàng",
  SALE: "Doanh thu",
  MANUAL_ADJUSTMENT: "Điều chỉnh",
  WITHDRAWAL: "Rút tiền",
  DEBT_REPAYMENT: "Trả nợ ứng tiền",
  DEBT_COLLECTION: "Thu hồi tiền ứng",
};

const typeVariant: Record<string, "secondary" | "success" | "destructive" | "rose" | "indigo"> = {
  PURCHASE: "secondary",
  SALE: "success",
  MANUAL_ADJUSTMENT: "secondary",
  WITHDRAWAL: "destructive",
  DEBT_REPAYMENT: "rose",
  DEBT_COLLECTION: "indigo",
};

export const cashFlowColumns: ColumnDef<CashLedgerEntry, any>[] = [
  {
    accessorKey: "createdAt",
    header: "Ngày",
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
  {
    id: "type",
    header: "Loại",
    cell: ({ row }) => (
      <Badge variant={typeVariant[row.original.type] ?? "secondary"}>
        {typeLabel[row.original.type] ?? row.original.type}
      </Badge>
    ),
  },
  {
    accessorKey: "description",
    header: "Mô tả",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.description ?? "—"}</span>
    ),
  },
  {
    accessorKey: "amount",
    header: "Số tiền",
    cell: ({ row }) => {
      const amount = Number(row.original.amount);
      return (
        <span
          className={cn(
            "font-semibold",
            amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
          )}
        >
          {amount >= 0 ? "+" : ""}
          {formatVND(amount)}
        </span>
      );
    },
  },
  {
    accessorKey: "balanceAfter",
    header: "Số dư sau GD",
    cell: ({ row }) => formatVND(row.original.balanceAfter as unknown as number),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const entry = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <div className="flex items-center justify-end gap-2">
          <CashEntryEditDialog entry={entry} onSuccess={onMutated} />
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              if (!confirm("Xoá giao dịch này?")) return;
              const result = await deleteCashLedgerEntryAction(entry.id);
              if (result?.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Đã xoá");
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
