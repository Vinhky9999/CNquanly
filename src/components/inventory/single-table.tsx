"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { GradingCompany, SingleCard } from "@prisma/client";

import { useServerTable } from "@/hooks/use-server-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { BulkActions } from "@/components/inventory/bulk-actions";
import { singleColumns } from "@/components/inventory/single-columns";
import { DateRangeFilter } from "@/components/inventory/date-range-filter";
import { EMPTY_FILTERS, InventoryFilters, filterParams } from "@/components/inventory/inventory-filters";
import { deleteSingleCardAction } from "@/server/actions/inventory";

type SingleCardRow = SingleCard & { gradingCompany: GradingCompany | null };

interface SingleTableProps {
  gameFilter?: string | null;
  onInventoryChanged?: () => void;
}

export function SingleTable({ gameFilter, onInventoryChanged }: SingleTableProps = {}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Status and card type (Raw / Graded) live in the same filter panel as the price ranges.
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const t = useServerTable<SingleCardRow>("/api/inventory/singles", {
    ...(gameFilter ? { game: gameFilter } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...filterParams(filters),
  });

  function handleMutated() {
    t.refresh();
    onInventoryChanged?.();
  }

  return (
    <DataTable
      columns={singleColumns}
      data={t.data}
      total={t.total}
      page={t.page}
      onPageChange={t.setPage}
      pageSize={t.pageSize}
      onPageSizeChange={t.setPageSize}
      pageCount={t.pageCount}
      search={t.search}
      onSearchChange={t.setSearch}
      searchPlaceholder="Tìm theo tên, SKU, mã cert..."
      sorting={t.sorting}
      onSortingChange={t.setSorting}
      isLoading={t.isLoading}
      error={t.error}
      onRetry={t.refresh}
      onMutated={handleMutated}
      stickyHeader
      minWidth={1280}
      selectable
      emptyMessage="Không có lá bài nào khớp bộ lọc."
      renderSelectionBar={(rows, clear) => (
        <BulkActions
          skus={rows.map((r) => r.sku)}
          ids={rows.map((r) => r.id)}
          deleteOne={deleteSingleCardAction}
          clear={clear}
          onDone={(done) => {
            done();
            handleMutated();
          }}
        />
      )}
      toolbarExtra={
        <>
          <InventoryFilters kind="single" value={filters} onApply={setFilters} gameScope={gameFilter} />
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
          <Button
            asChild
            className="h-10 rounded-xl bg-brand-gradient px-4 text-white shadow-md shadow-primary/25 hover:opacity-95 sm:ml-auto"
          >
            <Link href="/inventory/singles/new">
              <Plus className="h-4 w-4" />
              Thêm lá bài
            </Link>
          </Button>
        </>
      }
    />
  );
}
