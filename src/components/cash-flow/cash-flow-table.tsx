"use client";

import type { CashLedgerEntry } from "@prisma/client";

import { useServerTable } from "@/hooks/use-server-table";
import { DataTable } from "@/components/data-table";
import { cashFlowColumns } from "@/components/cash-flow/cash-flow-columns";
import { CashAdjustmentDialog } from "@/components/cash-flow/cash-adjustment-dialog";

export function CashFlowTable() {
  const t = useServerTable<CashLedgerEntry>("/api/cash-flow");

  return (
    <DataTable
      columns={cashFlowColumns}
      data={t.data}
      total={t.total}
      page={t.page}
      onPageChange={t.setPage}
      pageSize={t.pageSize}
      onPageSizeChange={t.setPageSize}
      pageCount={t.pageCount}
      search={t.search}
      onSearchChange={t.setSearch}
      searchPlaceholder="Tìm theo mô tả..."
      sorting={t.sorting}
      onSortingChange={t.setSorting}
      isLoading={t.isLoading}
      onMutated={t.refresh}
      toolbarExtra={
        <div className="ml-auto">
          <CashAdjustmentDialog />
        </div>
      }
    />
  );
}
