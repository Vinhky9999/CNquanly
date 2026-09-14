"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function toInputDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function startOfQuarter(date: Date) {
  const q = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), q * 3, 1);
}
function endOfQuarter(date: Date) {
  const q = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), q * 3 + 3, 0);
}

type Preset = "thisMonth" | "lastMonth" | "thisQuarter" | "all";

export function ExportReportDialog() {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => toInputDate(startOfMonth(new Date())));
  const [to, setTo] = useState(() => toInputDate(new Date()));
  const [isAllTime, setIsAllTime] = useState(false);
  const [loading, setLoading] = useState(false);

  function applyPreset(preset: Preset) {
    const now = new Date();
    setIsAllTime(preset === "all");
    if (preset === "thisMonth") {
      setFrom(toInputDate(startOfMonth(now)));
      setTo(toInputDate(endOfMonth(now)));
    } else if (preset === "lastMonth") {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setFrom(toInputDate(startOfMonth(lastMonth)));
      setTo(toInputDate(endOfMonth(lastMonth)));
    } else if (preset === "thisQuarter") {
      setFrom(toInputDate(startOfQuarter(now)));
      setTo(toInputDate(endOfQuarter(now)));
    }
  }

  async function handleExport() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isAllTime) {
        params.set("all", "1");
      } else {
        params.set("from", from);
        params.set("to", to);
      }

      const res = await fetch(`/api/reports/export?${params.toString()}`);
      if (!res.ok) throw new Error("Không thể tạo báo cáo");

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] ?? "CardNest_BaoCao.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success("Đã xuất báo cáo");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể xuất báo cáo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileDown className="mr-2 h-4 w-4" />
          Xuất Báo Cáo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xuất báo cáo tài chính</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset("thisMonth")}>
              Tháng này
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset("lastMonth")}>
              Tháng trước
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset("thisQuarter")}>
              Quý này
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isAllTime ? "default" : "secondary"}
              onClick={() => applyPreset("all")}
            >
              Tất cả thời gian
            </Button>
          </div>

          <div className={cn("grid grid-cols-2 gap-4", isAllTime && "opacity-50")}>
            <div className="space-y-2">
              <Label htmlFor="export-from">Từ ngày</Label>
              <Input
                id="export-from"
                type="date"
                value={from}
                disabled={isAllTime}
                onChange={(e) => {
                  setIsAllTime(false);
                  setFrom(e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-to">Đến ngày</Label>
              <Input
                id="export-to"
                type="date"
                value={to}
                disabled={isAllTime}
                onChange={(e) => {
                  setIsAllTime(false);
                  setTo(e.target.value);
                }}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleExport} disabled={loading}>
            {loading ? "Đang tạo file..." : "Xuất file Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
