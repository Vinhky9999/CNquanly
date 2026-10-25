"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { SealedProduct } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { deleteSealedProductAction } from "@/server/actions/inventory";
import { SaleDialog } from "@/components/inventory/sale-dialog";
import { DateCell, MoneyCell, ProductCell, RowActions } from "@/components/inventory/inventory-cells";
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

export const sealedColumns: ColumnDef<SealedProduct, any>[] = [
  {
    id: "product",
    header: "Sản phẩm",
    cell: ({ row }) => <ProductCell imageUrl={row.original.imageUrl} name={row.original.name} sku={row.original.sku} />,
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
    accessorKey: "status",
    header: "Trạng thái",
    meta: { align: "center" },
    cell: ({ row }) => {
      const { status, quantity } = row.original;
      // Quantity 0 is a fact about the stock, so "Sẵn hàng" with nothing on the shelf is shown as sold out.
      if (status === "IN_STOCK" && quantity <= 0) {
        return <Badge variant="rose">Hết hàng</Badge>;
      }
      return (
        <Badge variant={stockStatusVariant[status]} className="whitespace-nowrap">
          {stockStatusLabel[status]}
        </Badge>
      );
    },
  },
  {
    accessorKey: "quantity",
    header: "Số lượng",
    meta: { align: "center" },
    cell: ({ row }) => <span className="font-semibold tabular-nums">{row.original.quantity}</span>,
  },
  {
    accessorKey: "costPrice",
    header: "Giá nhập gốc",
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
