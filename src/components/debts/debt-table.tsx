"use client";

import { useState } from "react";
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
}

export function DebtTable({ onDebtChanged }: DebtTableProps) {
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const t = useServerTable<Debt>("/api/debts", {
    ...(type !== "all" ? { type } : {}),
    ...(status !== "all" ? { status } : {}),
  });

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
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại nợ</SelectItem>
              <SelectItem value="ADVANCED_BY_PERSON">CardNest nợ</SelectItem>
              <SelectItem value="ADVANCED_TO_PERSON">Cần thu hồi</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[170px]">
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
