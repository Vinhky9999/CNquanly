"use client";

import Link from "next/link";
import type { Customer, CustomerTag } from "@prisma/client";

import { useServerTable } from "@/hooks/use-server-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { customerColumns } from "@/components/customers/customer-columns";

type CustomerRow = Customer & { tags: CustomerTag[] };

export function CustomerTable() {
  const t = useServerTable<CustomerRow>("/api/customers");

  return (
    <DataTable
      columns={customerColumns}
      data={t.data}
      total={t.total}
      page={t.page}
      onPageChange={t.setPage}
      pageSize={t.pageSize}
      onPageSizeChange={t.setPageSize}
      pageCount={t.pageCount}
      search={t.search}
      onSearchChange={t.setSearch}
      searchPlaceholder="Tìm theo tên, SĐT, Zalo, Facebook..."
      sorting={t.sorting}
      onSortingChange={t.setSorting}
      isLoading={t.isLoading}
      onMutated={t.refresh}
      toolbarExtra={
        <Button asChild size="sm" className="ml-auto">
          <Link href="/customers/new">+ Thêm khách hàng</Link>
        </Button>
      }
    />
  );
}
