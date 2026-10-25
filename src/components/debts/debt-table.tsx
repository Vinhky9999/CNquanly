"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Debt } from "@prisma/client";

import { useServerTable } from "@/hooks/use-server-table";
import { DataTable } from "@/components/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { debtColumns } from "@/components/debts/debt-columns";
import { DebtFormDialog } from "@/components/debts/debt-form-dialog";

interface DebtTableProps {
  onDebtChanged?: () => void;
  /** Person picked in the "Công nợ theo từng người" block: the table is filtered to their debts. */
  personFilter?: string | null;
  onClearPersonFilter?: () => void;
}

export function DebtTable({ onDebtChanged, personFilter, onClearPersonFilter }: DebtTableProps) {
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const t = useServerTable<Debt>("/api/debts", {
    ...(type !== "all" ? { type } : {}),
    ...(status !== "all" ? { status } : {}),
  });

  // A picked person fills the search box (type and status filters are cleared so all their debts show).
  useEffect(() => {
    if (!personFilter) return;
    setType("all");
    setStatus("all");
    t.setSearch(personFilter);
  }, [personFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMutated() {
    t.refresh();
    onDebtChanged?.();
  }

  function handleCreated() {
    t.refresh();
    onDebtChanged?.();
  }

  return (
    <DataTable
      columns={debtColumns}
      data={t.data}
      total={t.total}
      page={t.page}
      onPageChange={t.setPage}
      pageSize={t.pageSize}
      onPageSizeChange={t.setPageSize}
      pageCount={t.pageCount}
      search={t.search}
      onSearchChange={t.setSearch}
      searchPlaceholder="Tìm theo tên người ứng, SKU..."
      sorting={t.sorting}
      onSortingChange={t.setSorting}
      isLoading={t.isLoading}
      onMutated={handleMutated}
      toolbarExtra={
        <>
          {personFilter && (
            <button
              type="button"
              onClick={() => {
                onClearPersonFilter?.();
                t.setSearch("");
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-accent-foreground hover:bg-primary/20"
              title="Bỏ lọc theo người"
            >
              Đang xem: {personFilter}
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại nợ</SelectItem>
              <SelectItem value="ADVANCED_BY_PERSON">CardNest nợ</SelectItem>
              <SelectItem value="ADVANCED_TO_PERSON">Cần thu hồi</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="UNPAID">Chưa thanh toán</SelectItem>
              <SelectItem value="PARTIAL">Trả một phần</SelectItem>
              <SelectItem value="PAID">Đã hoàn tất</SelectItem>
            </SelectContent>
          </Select>
          <DebtFormDialog onSuccess={handleCreated} />
        </>
      }
    />
  );
}
