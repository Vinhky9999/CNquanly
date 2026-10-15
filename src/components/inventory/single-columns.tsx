"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { GradingCompany, SingleCard } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { deleteSingleCardAction } from "@/server/actions/inventory";
import { SaleDialog } from "@/components/inventory/sale-dialog";
import { DateCell, MoneyCell, ProductCell, RowActions } from "@/components/inventory/inventory-cells";
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

export const singleColumns: ColumnDef<SingleCardRow, any>[] = [
  {
    id: "product",
    header: "Sản phẩm",
    cell: ({ row }) => <ProductCell imageUrl={row.original.imageUrl} name={row.original.cardName} sku={row.original.sku} />,
  },
  {
    accessorKey: "game",
    header: "Dòng game",
    cell: ({ row }) =>
      row.original.game ? (
        <Badge variant="indigo" className="whitespace-nowrap">
          {row.original.game}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "condition",
    header: "Tình trạng",
    cell: ({ row }) => {
      const c = row.original;
      if (c.condition === "RAW") {
        return (
          <Badge variant="slate" className="whitespace-nowrap">
            Raw · {c.rawGrade}
          </Badge>
        );
      }
      return (
        <Badge variant="indigo" className="whitespace-nowrap">
          {c.gradingCompany?.name ?? "Graded"} · #{c.certNumber}
        </Badge>
      );
    },
  },
  {
    accessorKey: "grade",
    header: "Điểm số",
    meta: { align: "center" },
    cell: ({ row }) => {
      const grade = row.original.grade;
      return grade != null ? <Badge variant="warning">{String(grade)}</Badge> : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    meta: { align: "center" },
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status]} className="whitespace-nowrap">
        {statusLabel[row.original.status]}
      </Badge>
    ),
  },
  {
    accessorKey: "quantity",
    header: "Số lượng",
    meta: { align: "center" },
    cell: ({ row }) => <span className="font-semibold tabular-nums">{row.original.quantity}</span>,
  },
  {
    accessorKey: "costPrice",
    header: "Giá nhập",
    meta: { align: "right" },
    cell: ({ row }) => <MoneyCell value={Number(row.original.costPrice)} />,
  },
  {
    id: "totalValue",
    header: "Tổng tiền vốn",
    meta: { align: "right" },
    cell: ({ row }) => <MoneyCell value={Number(row.original.costPrice) * row.original.quantity} strong />,
  },
  {
    id: "marketPrice",
    header: () => (
      <span className="inline-flex items-center gap-1.5">
        Giá thị trường
        <UsMarketBadge />
      </span>
    ),
    meta: { align: "right" },
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
    meta: { align: "right" },
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
    cell: ({ row }) => <DateCell value={row.original.createdAt} />,
  },
  {
    id: "actions",
    header: "Thao tác",
    meta: { align: "right" },
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
