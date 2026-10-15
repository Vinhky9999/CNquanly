"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface DateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}

const FIELD_CLASS =
  "flex h-10 items-center gap-2 rounded-xl border border-border/80 bg-input px-3 text-sm transition-colors focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-ring/30";
const DATE_INPUT_CLASS =
  "h-full w-[128px] bg-transparent text-sm text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]";

export function DateRangeFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: DateRangeFilterProps) {
  const hasFilter = Boolean(dateFrom || dateTo);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="dateFrom" className={FIELD_CLASS}>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Từ ngày</span>
        <input
          id="dateFrom"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className={DATE_INPUT_CLASS}
        />
      </label>
      <label htmlFor="dateTo" className={FIELD_CLASS}>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Đến ngày</span>
        <input
          id="dateTo"
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className={DATE_INPUT_CLASS}
        />
      </label>
      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-xl"
          title="Xoá lọc ngày"
          aria-label="Xoá lọc ngày"
          onClick={() => {
            onDateFromChange("");
            onDateToChange("");
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
