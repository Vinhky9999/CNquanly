"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Customer, SealedProduct, SingleCard, Transaction, TransactionItem } from "@prisma/client";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatVND } from "@/lib/utils";
import { deleteShippingOrderAction } from "@/server/actions/shipping";
import { ShippingEditDialog } from "@/components/shipping/shipping-edit-dialog";

type ShippingRow = Transaction & {
  customer: Customer | null;
  items: (TransactionItem & { sealedProduct: SealedProduct | null; singleCard: SingleCard | null })[];
};

export const shippingColumns: ColumnDef<ShippingRow, any>[] = [
  {
    accessorKey: "transactionDate",
    header: "Ngày",
    cell: ({ row }) => formatDate(row.original.transactionDate),
  },
  {
    accessorKey: "trackingCode",
    header: "Mã tracking",
    cell: ({ row }) => (
      <span className="font-mono text-xs font-medium">{row.original.trackingCode ?? "—"}</span>
    ),
  },
  {
    accessorKey: "shippingCarrier",
    header: "Đơn vị vận chuyển",
    cell: ({ row }) => <Badge variant="secondary">{row.original.shippingCarrier ?? "—"}</Badge>,
  },
  {
    id: "recipient",
    header: "Người nhận",
    cell: ({ row }) => {
      const t = row.original;
      return (
        <div>
          <div className="font-medium">{t.recipientName ?? t.customer?.name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">
            {t.recipientPhone ?? t.customer?.phone ?? ""}
          </div>
        </div>
      );
    },
  },
  {
    id: "address",
    header: "Địa chỉ giao",
    cell: ({ row }) => (
      <span className="line-clamp-2 max-w-[220px] text-sm">
        {row.original.recipientAddress ?? row.original.customer?.address ?? "—"}
      </span>
    ),
  },
  {
    id: "products",
    header: "Sản phẩm",
    cell: ({ row }) =>
      row.original.items
        .map((i) => i.sealedProduct?.name ?? i.singleCard?.cardName ?? "—")
        .join(", "),
  },
  {
    accessorKey: "totalAmount",
    header: "Tổng tiền",
    cell: ({ row }) => formatVND(row.original.totalAmount as unknown as number),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const order = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <div className="flex items-center justify-end gap-2">
          <ShippingEditDialog order={order} onSuccess={onMutated} />
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              if (!confirm("Xoá đơn giao hàng này? Tồn kho liên quan sẽ được hoàn lại.")) return;
              const result = await deleteShippingOrderAction(order.id);
              if (result?.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Đã xoá đơn giao hàng");
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
