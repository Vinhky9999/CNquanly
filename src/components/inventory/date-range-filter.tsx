"use client";

import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface DateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}

export function DateRangeFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: DateRangeFilterProps) {
  const hasFilter = Boolean(dateFrom || dateTo);

  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="dateFrom" className="text-xs text-muted-foreground">
          Từ ngày
        </Label>
        <Input
          id="dateFrom"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="h-9 w-[140px]"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="dateTo" className="text-xs text-muted-foreground">
          Đến ngày
        </Label>
        <Input
          id="dateTo"
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="h-9 w-[140px]"
        />
      </div>
      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          title="Xoá lọc ngày"
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
