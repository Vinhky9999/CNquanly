"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { formatDate, formatVND } from "@/lib/utils";

export interface InventoryHistoryRow {
  id: string;
  date: string;
  type: "PURCHASE" | "SALE";
  itemType: "SEALED" | "SINGLE";
  sku: string;
  productName: string;
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
  { accessorKey: "sku", header: "SKU" },
  { accessorKey: "productName", header: "Sản phẩm" },
  {
    id: "itemType",
    header: "Phân loại",
    cell: ({ row }) => itemTypeLabel[row.original.itemType] ?? row.original.itemType,
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
