"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { GradingCompany, SingleCard } from "@prisma/client";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatVND } from "@/lib/utils";
import { deleteSingleCardAction } from "@/server/actions/inventory";
import { SaleDialog } from "@/components/inventory/sale-dialog";

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
  { accessorKey: "sku", header: "SKU" },
  { accessorKey: "cardName", header: "Tên lá bài" },
  {
    id: "condition",
    header: "Tình trạng",
    cell: ({ row }) => {
      const c = row.original;
      if (c.condition === "RAW") {
        return <span>Raw · {c.rawGrade}</span>;
      }
      return (
        <span>
          Graded · {c.gradingCompany?.name ?? "—"} · #{c.certNumber}
        </span>
      );
    },
  },
  {
    accessorKey: "grade",
    header: "Điểm số",
    cell: ({ row }) => {
      const grade = row.original.grade;
      return grade != null ? String(grade) : "—";
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
