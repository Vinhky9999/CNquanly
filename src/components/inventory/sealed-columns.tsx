"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { SealedProduct } from "@prisma/client";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatVND } from "@/lib/utils";
import { deleteSealedProductAction } from "@/server/actions/inventory";
import { SaleDialog } from "@/components/inventory/sale-dialog";
import { ProductThumbnail } from "@/components/inventory/product-thumbnail";

const stockStatusVariant: Record<string, "success" | "default" | "secondary" | "warning"> = {
  IN_STOCK: "success",
  IN_TRANSIT: "default",
  PRE_ORDER: "secondary",
  ON_HOLD: "warning",
};

const stockStatusLabel: Record<string, string> = {
  IN_STOCK: "Sẵn hàng",
  IN_TRANSIT: "Đang ship về",
  PRE_ORDER: "Pre-order",
  ON_HOLD: "Đang Hold",
};

export const sealedColumns: ColumnDef<SealedProduct, any>[] = [
  {
    id: "product",
    header: "Sản phẩm",
    cell: ({ row }) => {
      const product = row.original;
      return (
        <div className="flex items-center gap-3">
          <ProductThumbnail src={product.imageUrl} alt={product.name} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{product.name}</p>
            <p className="truncate text-xs text-muted-foreground">{product.sku}</p>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "game",
    header: "Dòng game",
    cell: ({ row }) =>
      row.original.game ? (
        <Badge variant="indigo">{row.original.game}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    cell: ({ row }) => (
      <Badge variant={stockStatusVariant[row.original.status]}>
        {stockStatusLabel[row.original.status]}
      </Badge>
    ),
  },
  { accessorKey: "quantity", header: "Số lượng" },
  {
    accessorKey: "costPrice",
    header: "Giá nhập gốc",
    cell: ({ row }) => formatVND(row.original.costPrice as unknown as number),
  },
  {
    id: "totalValue",
    header: "Tổng tiền",
    cell: ({ row }) => formatVND(Number(row.original.costPrice) * row.original.quantity),
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
      const product = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <div className="flex items-center justify-end gap-2">
          <SaleDialog
            itemType="SEALED"
            itemId={product.id}
            itemLabel={product.name}
            defaultUnitPrice={Number(product.costPrice)}
            maxQuantity={product.quantity}
            onSuccess={onMutated}
          />
          <Button asChild size="icon" variant="ghost">
            <Link href={`/inventory/sealed/${product.id}/edit`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              if (!confirm(`Xoá "${product.name}"?`)) return;
              await deleteSealedProductAction(product.id);
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
