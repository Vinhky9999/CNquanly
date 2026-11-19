"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { GradingCompany, SingleCard } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { deleteSingleCardAction } from "@/server/actions/inventory";
import { SaleDialog } from "@/components/inventory/sale-dialog";
import { CostCell, DateCell, ProductCell, RowActions } from "@/components/inventory/inventory-cells";
import { MarketPriceCell, PnlCell } from "@/components/inventory/market-cells";
import { UsMarketBadge } from "@/components/inventory/us-market-badge";

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

// Seven columns instead of twelve so the row fits without a horizontal scrollbar: the game, condition (or grading
// company and cert) and grade sit next to the SKU, the status under the quantity, the unit cost under the total capital. Only the columns
// the server can sort (name, cost, created date) show sort arrows.
export const singleColumns: ColumnDef<SingleCardRow, any>[] = [
  {
    accessorKey: "cardName",
    header: "Sản phẩm",
    meta: { label: "", sortLabel: "Tên thẻ", stack: "full" },
    cell: ({ row }) => {
      const c = row.original;
      return (
        <ProductCell
          imageUrl={c.imageUrl}
          name={c.cardName}
          sku={c.sku}
          badges={
            <>
              {c.game && (
                <Badge variant="indigo" className="whitespace-nowrap">
                  {c.game}
                </Badge>
              )}
              {c.condition === "RAW" ? (
                <Badge variant="slate" className="whitespace-nowrap" title="Tình trạng thẻ raw">
                  Raw · {c.rawGrade}
                </Badge>
              ) : (
                <Badge variant="indigo" className="whitespace-nowrap" title="Hãng chấm điểm · số cert">
                  {c.gradingCompany?.name ?? "Graded"} · #{c.certNumber}
                </Badge>
              )}
              {c.grade != null && (
                <Badge variant="warning" className="whitespace-nowrap" title="Điểm số">
                  Điểm {String(c.grade)}
                </Badge>
              )}
            </>
          }
        />
      );
    },
  },
  {
    id: "stock",
    header: "Tồn kho",
    meta: { align: "center", label: "Tồn kho" },
    cell: ({ row }) => (
      <div className="flex flex-col items-center gap-1 group-data-[layout=stacked]/dt:items-start">
        <span className="text-base font-semibold tabular-nums leading-none">{row.original.quantity}</span>
        <Badge variant={statusVariant[row.original.status]} className="whitespace-nowrap">
          {statusLabel[row.original.status]}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "costPrice",
    header: "Tổng vốn / giá nhập",
    meta: { align: "right", label: "Tổng vốn · giá nhập", sortLabel: "Giá nhập" },
    cell: ({ row }) => <CostCell unit={Number(row.original.costPrice)} quantity={row.original.quantity} />,
  },
  {
    id: "marketPrice",
    header: () => (
      <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5">
        Giá thị trường
        <UsMarketBadge />
      </span>
    ),
    meta: { align: "right", label: "Giá thị trường" },
    cell: ({ row }) => (
      <MarketPriceCell
        marketPrice={row.original.marketPrice}
        source={row.original.priceSource}
        label={row.original.priceSourceLabel}
        url={row.original.priceSourceUrl}
        score={row.original.priceMatchScore}
        updatedAt={row.original.marketPriceUpdatedAt}
        emptyHint={
          row.original.condition === "GRADED" ? "Slab: TCGplayer không định giá slab — nhập giá tay (Sửa)" : undefined
        }
      />
    ),
  },
  {
    id: "unrealizedPnl",
    header: "Lãi/Lỗ ước tính",
    meta: { align: "right", label: "Lãi/Lỗ ước tính" },
    cell: ({ row }) => (
      <PnlCell
        costPrice={row.original.costPrice}
        marketPrice={row.original.marketPrice}
        quantity={row.original.quantity}
      />
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Ngày tạo",
    meta: { label: "Ngày tạo" },
    cell: ({ row }) => <DateCell value={row.original.createdAt} />,
  },
  {
    id: "actions",
    header: "Thao tác",
    meta: { align: "right", label: "", stack: "end" },
    cell: ({ row, table }) => {
      const card = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <RowActions
          name={card.cardName}
          editHref={`/inventory/singles/${card.id}/edit`}
          onDelete={() => deleteSingleCardAction(card.id)}
          onMutated={onMutated}
          sale={
            card.status !== "SOLD" ? (
              <SaleDialog
                itemType="SINGLE"
                itemId={card.id}
                itemLabel={card.cardName}
                defaultUnitPrice={Number(card.costPrice)}
                unitCost={Number(card.costPrice)}
                maxQuantity={card.quantity}
                onSuccess={onMutated}
              />
            ) : undefined
          }
        />
      );
    },
  },
];
