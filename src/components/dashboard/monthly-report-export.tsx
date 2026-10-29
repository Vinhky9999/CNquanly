"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// Month / year picker + "Xuất Báo Cáo Excel Tháng": downloads CardNest_BaoCao_Thang_MM_YYYY.xlsx (4 sheets).
export function MonthlyReportExport() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);

  const years = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - i));

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/monthly?month=${year}-${month.padStart(2, "0")}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "Không thể tạo báo cáo tháng");
      }
      const blob = await res.blob();
      const match = (res.headers.get("Content-Disposition") ?? "").match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `CardNest_BaoCao_Thang_${month.padStart(2, "0")}_${year}.xlsx`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Đã xuất báo cáo Tháng ${month}/${year}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể xuất báo cáo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Xuất báo cáo Excel theo tháng">
      <Select value={month} onValueChange={setMonth}>
        <SelectTrigger className="h-10 w-[120px] rounded-xl bg-input" aria-label="Chọn tháng">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((m) => (
            <SelectItem key={m} value={String(m)}>
              Tháng {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={year} onValueChange={setYear}>
        <SelectTrigger className="h-10 w-[96px] rounded-xl bg-input" aria-label="Chọn năm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={y}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="h-10 rounded-xl bg-brand-gradient text-white shadow-md shadow-primary/25 hover:opacity-95"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        {loading ? "Đang tạo file…" : "Xuất Báo Cáo Excel Tháng"}
      </Button>
    </div>
  );
}
