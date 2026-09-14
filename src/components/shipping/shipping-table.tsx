"use client";

import type { Customer, SealedProduct, SingleCard, Transaction, TransactionItem } from "@prisma/client";

import { useServerTable } from "@/hooks/use-server-table";
import { DataTable } from "@/components/data-table";
import { shippingColumns } from "@/components/shipping/shipping-columns";

type ShippingRow = Transaction & {
  customer: Customer | null;
  items: (TransactionItem & { sealedProduct: SealedProduct | null; singleCard: SingleCard | null })[];
};

export function ShippingTable() {
  const t = useServerTable<ShippingRow>("/api/shipping");

  return (
    <DataTable
      columns={shippingColumns}
      data={t.data}
      total={t.total}
      page={t.page}
      onPageChange={t.setPage}
      pageSize={t.pageSize}
      onPageSizeChange={t.setPageSize}
      pageCount={t.pageCount}
      search={t.search}
      onSearchChange={t.setSearch}
      searchPlaceholder="Tìm theo mã tracking, đơn vị vận chuyển, người nhận..."
      sorting={t.sorting}
      onSortingChange={t.setSorting}
      isLoading={t.isLoading}
      onMutated={t.refresh}
    />
  );
}
