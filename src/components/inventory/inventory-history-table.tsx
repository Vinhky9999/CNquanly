"use client";

import { useState } from "react";

import { useServerTable } from "@/hooks/use-server-table";
import { DataTable } from "@/components/data-table";
import { DateRangeFilter } from "@/components/inventory/date-range-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  inventoryHistoryColumns,
  type InventoryHistoryRow,
} from "@/components/inventory/inventory-history-columns";

export function InventoryHistoryTable() {
  const [type, setType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const t = useServerTable<InventoryHistoryRow>("/api/inventory/history", {
    ...(type !== "all" ? { type } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  });

  return (
    <DataTable
      columns={inventoryHistoryColumns}
      data={t.data}
      total={t.total}
      page={t.page}
      onPageChange={t.setPage}
      pageSize={t.pageSize}
      onPageSizeChange={t.setPageSize}
      pageCount={t.pageCount}
      search={t.search}
      onSearchChange={t.setSearch}
      searchPlaceholder="Tìm theo tên, SKU..."
      sorting={t.sorting}
      onSortingChange={t.setSorting}
      isLoading={t.isLoading}
      toolbarExtra={
        <>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả biến động</SelectItem>
              <SelectItem value="PURCHASE">Chỉ Nhập hàng</SelectItem>
              <SelectItem value="SALE">Chỉ Xuất hàng</SelectItem>
            </SelectContent>
          </Select>
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
        </>
      }
    />
  );
}
