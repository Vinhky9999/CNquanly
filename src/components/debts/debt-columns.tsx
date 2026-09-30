"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Debt } from "@prisma/client";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatVND } from "@/lib/utils";
import { deleteDebtAction } from "@/server/actions/debts";
import { DebtPaymentDialog } from "@/components/debts/debt-payment-dialog";

const typeLabel: Record<string, string> = {
  ADVANCED_BY_PERSON: "CardNest nợ",
  ADVANCED_TO_PERSON: "Cần thu hồi",
};

const typeVariant: Record<string, "rose" | "success"> = {
  ADVANCED_BY_PERSON: "rose",
  ADVANCED_TO_PERSON: "success",
};

const statusLabel: Record<string, string> = {
  UNPAID: "Chưa thanh toán",
  PARTIAL: "Trả một phần",
  PAID: "Đã hoàn tất",
};

const statusVariant: Record<string, "warning" | "indigo" | "success"> = {
  UNPAID: "warning",
  PARTIAL: "indigo",
  PAID: "success",
};

export const debtColumns: ColumnDef<Debt, any>[] = [
  { accessorKey: "personName", header: "Người ứng" },
  {
    accessorKey: "type",
    header: "Loại nợ",
    cell: ({ row }) => (
      <Badge variant={typeVariant[row.original.type]}>{typeLabel[row.original.type]}</Badge>
    ),
  },
  {
    accessorKey: "amount",
    header: "Tổng tiền",
    cell: ({ row }) => formatVND(row.original.amount as unknown as number),
  },
  {
    accessorKey: "paidAmount",
    header: "Đã trả",
    cell: ({ row }) => formatVND(row.original.paidAmount as unknown as number),
  },
  {
    id: "remaining",
    header: "Còn lại",
    cell: ({ row }) => {
      const remaining = Number(row.original.amount) - Number(row.original.paidAmount);
      return <span className="font-semibold">{formatVND(remaining)}</span>;
    },
  },
  {
    id: "reference",
    header: "SKU / Ghi chú",
    cell: ({ row }) => {
      const d = row.original;
      return (
        <div className="max-w-[220px]">
          {d.referenceLabel && (
            <p className="truncate text-sm font-medium text-foreground">{d.referenceLabel}</p>
          )}
          {d.notes && <p className="truncate text-xs text-muted-foreground">{d.notes}</p>}
          {!d.referenceLabel && !d.notes && <span className="text-muted-foreground">—</span>}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status]}>{statusLabel[row.original.status]}</Badge>
    ),
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
      const debt = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <div className="flex items-center justify-end gap-2">
          <DebtPaymentDialog debt={debt} onSuccess={onMutated} />
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              if (!confirm(`Xoá khoản nợ của "${debt.personName}"? Mọi khoản đã trả sẽ được hoàn tác khỏi Dòng Tiền.`))
                return;
              const result = await deleteDebtAction(debt.id);
              if (result?.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Đã xoá khoản nợ");
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
