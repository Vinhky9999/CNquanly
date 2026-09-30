"use client";

import Link from "next/link";
import { useState } from "react";
import type { GradingCompany, SingleCard } from "@prisma/client";

import { useServerTable } from "@/hooks/use-server-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { singleColumns } from "@/components/inventory/single-columns";
import { DateRangeFilter } from "@/components/inventory/date-range-filter";

type SingleCardRow = SingleCard & { gradingCompany: GradingCompany | null };

interface SingleTableProps {
  gameFilter?: string | null;
  onInventoryChanged?: () => void;
}

export function SingleTable({ gameFilter, onInventoryChanged }: SingleTableProps = {}) {
  const [status, setStatus] = useState("all");
  const [condition, setCondition] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const t = useServerTable<SingleCardRow>("/api/inventory/singles", {
    ...(status !== "all" ? { status } : {}),
    ...(condition !== "all" ? { condition } : {}),
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
      onMutated={handleMutated}
      toolbarExtra={
        <>
          {gameFilter && (
            <Badge variant="indigo" className="h-9 items-center px-3">
              Đang lọc: {gameFilter}
            </Badge>
          )}
          <Select value={condition} onValueChange={setCondition}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả tình trạng</SelectItem>
              <SelectItem value="RAW">Raw</SelectItem>
              <SelectItem value="GRADED">Graded</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="IN_STOCK">Còn hàng</SelectItem>
              <SelectItem value="RESERVED">Đã giữ</SelectItem>
              <SelectItem value="SOLD">Đã bán</SelectItem>
            </SelectContent>
          </Select>
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
          <Button asChild size="sm" className="ml-auto">
            <Link href="/inventory/singles/new">+ Thêm lá bài</Link>
          </Button>
        </>
      }
    />
  );
}
