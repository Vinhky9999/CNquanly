"use client";

import type { CashLedgerEntry } from "@prisma/client";

import { useServerTable } from "@/hooks/use-server-table";
import { DataTable } from "@/components/data-table";
import { cashFlowColumns } from "@/components/cash-flow/cash-flow-columns";
import { CashAdjustmentDialog } from "@/components/cash-flow/cash-adjustment-dialog";
import { CashWithdrawalDialog } from "@/components/cash-flow/cash-withdrawal-dialog";

interface CashFlowTableProps {
  onLedgerChanged?: () => void;
}

export function CashFlowTable({ onLedgerChanged }: CashFlowTableProps = {}) {
  const t = useServerTable<CashLedgerEntry>("/api/cash-flow");

  function handleMutated() {
    t.refresh();
    onLedgerChanged?.();
  }

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
      onMutated={handleMutated}
      toolbarExtra={
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <CashWithdrawalDialog onSuccess={handleMutated} />
          <CashAdjustmentDialog onSuccess={handleMutated} />
        </div>
      }
    />
  );
}
