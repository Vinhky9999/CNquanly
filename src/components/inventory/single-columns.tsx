"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { GradingCompany, SingleCard } from "@prisma/client";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatVND } from "@/lib/utils";
import { deleteSingleCardAction } from "@/server/actions/inventory";
import { SaleDialog } from "@/components/inventory/sale-dialog";
import { ProductThumbnail } from "@/components/inventory/product-thumbnail";

type SingleCardRow = SingleCard & { gradingCompany: GradingCompany | null };

const statusVariant: Record<string, "default" | "secondary" | "success"> = {
  IN_STOCK: "success",
  RESERVED: "secondary",
  SOLD: "default",
};

const statusLabel: Record<string, string> = {
  IN_STOCK: "Còn hàng",
  RESERVED: "Đã giữ",
  SOLD: "Đã bán",
};

export const singleColumns: ColumnDef<SingleCardRow, any>[] = [
  {
    id: "product",
    header: "Sản phẩm",
    cell: ({ row }) => {
      const card = row.original;
      return (
        <div className="flex items-center gap-3">
          <ProductThumbnail src={card.imageUrl} alt={card.cardName} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{card.cardName}</p>
            <p className="truncate text-xs text-muted-foreground">{card.sku}</p>
          </div>
        </div>
      );
    },
  },
  {
    id: "condition",
    header: "Tình trạng",
    cell: ({ row }) => {
      const c = row.original;
      if (c.condition === "RAW") {
        return <Badge variant="slate">Raw · {c.rawGrade}</Badge>;
      }
      return (
        <Badge variant="indigo">
          {c.gradingCompany?.name ?? "Graded"} · #{c.certNumber}
        </Badge>
      );
    },
  },
  {
    accessorKey: "grade",
    header: "Điểm số",
    cell: ({ row }) => {
      const grade = row.original.grade;
      return grade != null ? <Badge variant="warning">{String(grade)}</Badge> : <span className="text-muted-foreground">—</span>;
    },
  },
  { accessorKey: "quantity", header: "Số lượng" },
  {
    accessorKey: "costPrice",
    header: "Giá nhập",
    cell: ({ row }) => formatVND(row.original.costPrice as unknown as number),
  },
  {
    id: "totalValue",
    header: "Tổng tiền",
    cell: ({ row }) => formatVND(Number(row.original.costPrice) * row.original.quantity),
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status]}>
        {statusLabel[row.original.status]}
      </Badge>
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
      const card = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <div className="flex items-center justify-end gap-2">
          {card.status !== "SOLD" && (
            <SaleDialog
              itemType="SINGLE"
              itemId={card.id}
              itemLabel={card.cardName}
              defaultUnitPrice={Number(card.costPrice)}
              maxQuantity={card.quantity}
              onSuccess={onMutated}
            />
          )}
          <Button asChild size="icon" variant="ghost">
            <Link href={`/inventory/singles/${card.id}/edit`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              if (!confirm(`Xoá "${card.cardName}"?`)) return;
              await deleteSingleCardAction(card.id);
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
