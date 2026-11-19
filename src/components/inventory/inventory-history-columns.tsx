"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { formatDate, formatVND } from "@/lib/utils";
import { ProductThumbnail } from "@/components/inventory/product-thumbnail";

export interface InventoryHistoryRow {
  id: string;
  date: string;
  type: "PURCHASE" | "SALE";
  itemType: "SEALED" | "SINGLE";
  sku: string;
  productName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

const typeLabel: Record<string, string> = {
  PURCHASE: "Nhập",
  SALE: "Xuất",
};

const typeVariant: Record<string, "default" | "success"> = {
  PURCHASE: "default",
  SALE: "success",
};

const itemTypeLabel: Record<string, string> = {
  SEALED: "Sealed",
  SINGLE: "Single",
};

const itemTypeVariant: Record<string, "indigo" | "slate"> = {
  SEALED: "indigo",
  SINGLE: "slate",
};

// Six columns: the direction (Nhập / Xuất) and the kind (Sealed / Single) share one cell. Only the columns the server
// can sort (date, quantity, amount) show sort arrows.
export const inventoryHistoryColumns: ColumnDef<InventoryHistoryRow, any>[] = [
  {
    accessorKey: "date",
    header: "Ngày",
    meta: { label: "Ngày" },
    cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span>,
  },
  {
    id: "kind",
    header: "Loại",
    meta: { label: "Loại" },
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <Badge variant={typeVariant[row.original.type]}>{typeLabel[row.original.type]}</Badge>
        <Badge variant={itemTypeVariant[row.original.itemType]}>
          {itemTypeLabel[row.original.itemType] ?? row.original.itemType}
        </Badge>
      </div>
    ),
  },
  {
    id: "product",
    header: "Sản phẩm",
    meta: { label: "", stack: "full" },
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="flex min-w-[190px] items-center gap-3 group-data-[layout=stacked]/dt:min-w-0">
          <ProductThumbnail src={r.imageUrl} alt={r.productName} size="md" />
          <div className="min-w-0">
            <p className="line-clamp-3 break-words font-medium leading-snug text-foreground group-data-[layout=stacked]/dt:line-clamp-none" title={r.productName}>
              {r.productName}
            </p>
            <p className="mt-0.5 break-all text-xs text-muted-foreground">{r.sku}</p>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "quantity",
    header: "Số lượng",
    meta: { align: "center", label: "Số lượng" },
    cell: ({ row }) => <span className="font-semibold tabular-nums">{row.original.quantity}</span>,
  },
  {
    id: "unitPrice",
    header: "Đơn giá",
    meta: { align: "right", label: "Đơn giá" },
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatVND(row.original.unitPrice)}</span>,
  },
  {
    accessorKey: "subtotal",
    header: "Thành tiền",
    meta: { align: "right", label: "Thành tiền" },
    cell: ({ row }) => <span className="whitespace-nowrap font-semibold tabular-nums">{formatVND(row.original.subtotal)}</span>,
  },
];
