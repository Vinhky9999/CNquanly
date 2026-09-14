"use client";

import Link from "next/link";
import type { SealedProduct } from "@prisma/client";

import { useServerTable } from "@/hooks/use-server-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { sealedColumns } from "@/components/inventory/sealed-columns";

export function SealedTable() {
  const t = useServerTable<SealedProduct>("/api/inventory/sealed");

  return (
    <DataTable
      columns={sealedColumns}
      data={t.data}
      total={t.total}
      page={t.page}
      onPageChange={t.setPage}
      pageSize={t.pageSize}
      onPageSizeChange={t.setPageSize}
      pageCount={t.pageCount}
      search={t.search}
      onSearchChange={t.setSearch}
      searchPlaceholder="Tìm theo tên, SKU, dòng game..."
      sorting={t.sorting}
      onSortingChange={t.setSorting}
      isLoading={t.isLoading}
      onMutated={t.refresh}
      toolbarExtra={
        <Button asChild size="sm" className="ml-auto">
          <Link href="/inventory/sealed/new">+ Thêm Box/Case</Link>
        </Button>
      }
    />
  );
}
