"use client";

import Link from "next/link";
import { useState } from "react";
import type { SealedProduct } from "@prisma/client";

import { useServerTable } from "@/hooks/use-server-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sealedColumns } from "@/components/inventory/sealed-columns";
import { DateRangeFilter } from "@/components/inventory/date-range-filter";

interface SealedTableProps {
  gameFilter?: string | null;
  onInventoryChanged?: () => void;
}

export function SealedTable({ gameFilter, onInventoryChanged }: SealedTableProps = {}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const t = useServerTable<SealedProduct>("/api/inventory/sealed", {
    ...(gameFilter ? { game: gameFilter } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  });

  function handleMutated() {
    t.refresh();
    onInventoryChanged?.();
  }

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
      onMutated={handleMutated}
      toolbarExtra={
        <>
          {gameFilter && (
            <Badge variant="indigo" className="h-9 items-center px-3">
              Đang lọc: {gameFilter}
            </Badge>
          )}
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
          <Button asChild size="sm" className="ml-auto">
            <Link href="/inventory/sealed/new">+ Thêm Box/Case</Link>
          </Button>
        </>
      }
    />
  );
}
