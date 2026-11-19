"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { SealedProduct } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { deleteSealedProductAction } from "@/server/actions/inventory";
import { SaleDialog } from "@/components/inventory/sale-dialog";
import { CostCell, DateCell, ProductCell, RowActions } from "@/components/inventory/inventory-cells";
import { MarketPriceCell, PnlCell } from "@/components/inventory/market-cells";
import { UsMarketBadge } from "@/components/inventory/us-market-badge";

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

// Seven columns instead of ten, so the whole row fits without a horizontal scrollbar: the game sits next to the SKU,
// the status under the quantity, and the unit cost under the total capital. Only the columns the server can sort
// (name, quantity, cost, created date) show sort arrows.
export const sealedColumns: ColumnDef<SealedProduct, any>[] = [
  {
    accessorKey: "name",
    header: "Sản phẩm",
    meta: { label: "", sortLabel: "Tên sản phẩm", stack: "full" },
    cell: ({ row }) => (
      <ProductCell
        imageUrl={row.original.imageUrl}
        name={row.original.name}
        sku={row.original.sku}
        badges={
          row.original.game ? (
            <Badge variant="indigo" className="whitespace-nowrap">
              {row.original.game}
            </Badge>
          ) : undefined
        }
      />
    ),
  },
  {
    accessorKey: "quantity",
    header: "Tồn kho",
    meta: { align: "center", label: "Tồn kho" },
    cell: ({ row }) => {
      const { status, quantity } = row.original;
      // Quantity 0 is a fact about the stock, so "Sẵn hàng" with nothing on the shelf is shown as sold out.
      const soldOut = status === "IN_STOCK" && quantity <= 0;
      return (
        <div className="flex flex-col items-center gap-1 group-data-[layout=stacked]/dt:items-start">
          <span className="text-base font-semibold tabular-nums leading-none">{quantity}</span>
          {soldOut ? (
            <Badge variant="rose" className="whitespace-nowrap">
              Hết hàng
            </Badge>
          ) : (
            <Badge variant={stockStatusVariant[status]} className="whitespace-nowrap">
              {stockStatusLabel[status]}
            </Badge>
          )}
        </div>
      );
    },
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
      const product = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <RowActions
          name={product.name}
          editHref={`/inventory/sealed/${product.id}/edit`}
          onDelete={() => deleteSealedProductAction(product.id)}
          onMutated={onMutated}
          sale={
            <SaleDialog
              itemType="SEALED"
              itemId={product.id}
              itemLabel={product.name}
              defaultUnitPrice={Number(product.costPrice)}
              unitCost={Number(product.costPrice)}
              maxQuantity={product.quantity}
              onSuccess={onMutated}
            />
          }
        />
      );
    },
  },
];
