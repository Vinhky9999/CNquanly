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

export const inventoryHistoryColumns: ColumnDef<InventoryHistoryRow, any>[] = [
  {
    accessorKey: "date",
    header: "Ngày",
    cell: ({ row }) => formatDate(row.original.date),
  },
  {
    accessorKey: "type",
    header: "Loại",
    cell: ({ row }) => (
      <Badge variant={typeVariant[row.original.type]}>{typeLabel[row.original.type]}</Badge>
    ),
  },
  {
    id: "product",
    header: "Sản phẩm",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="flex items-center gap-3">
          <ProductThumbnail src={r.imageUrl} alt={r.productName} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{r.productName}</p>
            <p className="truncate text-xs text-muted-foreground">{r.sku}</p>
          </div>
        </div>
      );
    },
  },
  {
    id: "itemType",
    header: "Phân loại",
    cell: ({ row }) => (
      <Badge variant={itemTypeVariant[row.original.itemType]}>
        {itemTypeLabel[row.original.itemType] ?? row.original.itemType}
      </Badge>
    ),
  },
  { accessorKey: "quantity", header: "Số lượng" },
  {
    accessorKey: "unitPrice",
    header: "Đơn giá",
    cell: ({ row }) => formatVND(row.original.unitPrice),
  },
  {
    accessorKey: "subtotal",
    header: "Thành tiền",
    cell: ({ row }) => formatVND(row.original.subtotal),
  },
];
