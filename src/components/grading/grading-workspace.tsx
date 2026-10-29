"use client";

import { useCallback, useMemo, useState } from "react";

import { DataTable } from "@/components/data-table";
import { GradingFormDialog } from "@/components/grading/grading-form-dialog";
import { GradingSummaryCards } from "@/components/grading/grading-summary-cards";
import { gradingColumns, type GradingRow } from "@/components/grading/grading-columns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerTable } from "@/hooks/use-server-table";
import { GRADING_STATUSES, gradingStatusLabel } from "@/lib/grading";
import type { GradingSummary } from "@/lib/grading-summary";

const ALL = "ALL";

export function GradingWorkspace({ initialSummary }: { initialSummary: GradingSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [status, setStatus] = useState(ALL);

  const extraParams = useMemo<Record<string, string>>(() => {
    const params: Record<string, string> = {};
    if (status !== ALL) params.status = status;
    return params;
  }, [status]);
  const t = useServerTable<GradingRow>("/api/grading", extraParams);
  const { refresh } = t;

  const refreshAll = useCallback(() => {
    refresh();
    fetch("/api/grading?summary=1")
      .then((res) => res.json())
      .then((json) => setSummary(json))
      .catch(() => {});
  }, [refresh]);

  return (
    <div className="space-y-6">
      <GradingSummaryCards summary={summary} />
      <DataTable
        columns={gradingColumns}
        data={t.data}
        total={t.total}
        page={t.page}
        onPageChange={t.setPage}
        pageSize={t.pageSize}
        onPageSizeChange={t.setPageSize}
        pageCount={t.pageCount}
        search={t.search}
        onSearchChange={t.setSearch}
        searchPlaceholder="Tìm theo khách, tên thẻ, hãng..."
        sorting={t.sorting}
        onSortingChange={t.setSorting}
        isLoading={t.isLoading}
        onMutated={refreshAll}
        toolbarExtra={
          <>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10 w-[200px]" aria-label="Lọc theo trạng thái">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
                {GRADING_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {gradingStatusLabel[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <GradingFormDialog onSuccess={refreshAll} />
          </>
        }
      />
    </div>
  );
}
