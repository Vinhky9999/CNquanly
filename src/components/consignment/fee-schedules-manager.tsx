"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatUSD } from "@/components/consignment/format";
import { computeFees, DEFAULT_SERVICE_RATE, validateSchedule, type FeeMode, type FeeSchedule } from "@/lib/consignment/fees";
import type { FeeScheduleDTO } from "@/lib/consignment/types";
import { cn } from "@/lib/utils";

const MODE_LABEL: Record<FeeMode, string> = {
  FLAT_BY_BAND: "Theo khoảng giá",
  MARGINAL: "Lũy tiến",
};

const MODE_HELP: Record<FeeMode, string> = {
  FLAT_BY_BAND: "Mức phí của khoảng giá chứa giá End được áp cho cả giá End.",
  MARGINAL: "Mỗi khoảng giá chỉ tính cho phần giá nằm trong khoảng đó (như thuế lũy tiến).",
};

interface TierDraft {
  to: string; // upper bound; empty for the last tier ("trở lên")
  percent: string;
  fixed: string;
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? "Có lỗi xảy ra. Thử lại sau.");
  return json;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-xs font-medium leading-none">{label}</span>
      {children}
    </label>
  );
}

function ScheduleDialog({ latest, onSaved }: { latest: FeeScheduleDTO | null; onSaved: (schedules: FeeScheduleDTO[]) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayLocal());
  const [mode, setMode] = useState<FeeMode>("FLAT_BY_BAND");
  const [serviceRate, setServiceRate] = useState(String(DEFAULT_SERVICE_RATE));
  const [minimumFee, setMinimumFee] = useState("");
  const [note, setNote] = useState("");
  const [tiers, setTiers] = useState<TierDraft[]>([{ to: "", percent: "", fixed: "" }]);
  const [testPrice, setTestPrice] = useState("1000");
  const [saving, setSaving] = useState(false);

  // A new version starts as a copy of the latest one, so only what changed has to be typed.
  useEffect(() => {
    if (!open) return;
    setName("");
    setEffectiveFrom(todayLocal());
    setMode(latest?.mode ?? "FLAT_BY_BAND");
    setServiceRate(String(latest?.serviceRate ?? DEFAULT_SERVICE_RATE));
    setMinimumFee(latest?.minimumFee != null ? String(latest.minimumFee) : "");
    setNote("");
    setTiers(latest ? latest.tiers.map((t) => ({ to: t.to === null ? "" : String(t.to), percent: String(t.percent), fixed: String(t.fixed) })) : [{ to: "", percent: "", fixed: "" }]);
    setTestPrice("1000");
  }, [open, latest]);

  const setTier = (i: number, changes: Partial<TierDraft>) => setTiers((prev) => prev.map((t, k) => (k === i ? { ...t, ...changes } : t)));

  // Build the schedule exactly as the server will see it; the lower bound of each tier is the upper bound of the one before.
  const built = useMemo(() => {
    const rows = tiers.map((t, i) => ({
      from: i === 0 ? 0 : num(tiers[i - 1].to),
      to: i === tiers.length - 1 ? null : num(t.to),
      percent: t.percent.trim() === "" ? 0 : num(t.percent),
      fixed: t.fixed.trim() === "" ? 0 : num(t.fixed),
    }));
    const schedule: FeeSchedule = { mode, serviceRate: num(serviceRate), minimumFee: minimumFee.trim() === "" ? null : num(minimumFee), tiers: rows };
    const anyNaN = rows.some((r) => Number.isNaN(r.from) || (r.to !== null && Number.isNaN(r.to)) || Number.isNaN(r.percent) || Number.isNaN(r.fixed)) || Number.isNaN(schedule.serviceRate) || (schedule.minimumFee !== null && Number.isNaN(schedule.minimumFee));
    const problem = anyNaN ? "Điền đủ và đúng các ô số của biểu phí (giá đến của mỗi mức trừ mức cuối, phần trăm, phí cố định)." : validateSchedule(schedule);
    return { schedule, problem };
  }, [tiers, mode, serviceRate, minimumFee]);

  const preview = useMemo(() => {
    const price = num(testPrice);
    if (built.problem || !(price >= 0)) return null;
    try {
      return computeFees(price, built.schedule);
    } catch {
      return null;
    }
  }, [built, testPrice]);

  async function save() {
    if (!name.trim()) return void toast.error("Nhập tên phiên bản biểu phí.");
    if (built.problem) return void toast.error(built.problem);
    setSaving(true);
    try {
      const json = await api("POST", "/api/consignment/fee-schedules", {
        name,
        effectiveFrom: `${effectiveFrom}T00:00:00+07:00`,
        mode,
        serviceRate,
        minimumFee,
        note,
        tiers: built.schedule.tiers,
      });
      onSaved(json.schedules);
      toast.success("Đã lưu phiên bản biểu phí mới");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được biểu phí.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10 rounded-xl bg-brand-gradient px-4 text-white shadow-md shadow-primary/25 hover:opacity-95">
          <Plus className="h-4 w-4" />
          Tạo phiên bản biểu phí mới
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Phiên bản biểu phí mới</DialogTitle>
          <DialogDescription>
            Nhập đúng biểu phí Probstein đang áp dụng. Cập nhật biểu phí = tạo phiên bản mới; các phiên bản cũ được giữ lại để mỗi đơn dùng đúng biểu phí của thời điểm đó.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tên phiên bản" className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Biểu phí tháng 12/2026" maxLength={80} />
          </Field>
          <Field label="Có hiệu lực từ ngày">
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
          <Field label="Cách tính mức phí" className="sm:col-span-3">
            <Select value={mode} onValueChange={(v) => setMode(v as FeeMode)}>
              <SelectTrigger aria-label="Cách tính mức phí"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABEL) as FeeMode[]).map((m) => (
                  <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="block text-[11px] text-muted-foreground">{MODE_HELP[mode]}</span>
          </Field>
        </div>

        <section className="space-y-2" aria-label="Các mức phí Probstein">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phí Probstein theo giá bán (USD)</p>
          <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Giá từ (≥)</span>
            <span>Giá đến (&lt;)</span>
            <span>Phần trăm (%)</span>
            <span>Phí cố định ($)</span>
            <span className="w-9" />
          </div>
          {tiers.map((t, i) => {
            const last = i === tiers.length - 1;
            const from = i === 0 ? "0" : tiers[i - 1].to || "…";
            return (
              <div key={i} className="grid gap-2 rounded-xl border border-border/60 bg-card/40 p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-center">
                <div className="flex h-9 items-center px-1 text-sm tabular-nums text-muted-foreground"><span className="sm:hidden mr-2 text-[11px]">Từ</span>${from}</div>
                {last ? (
                  <div className="flex h-9 items-center px-1 text-sm text-muted-foreground"><span className="sm:hidden mr-2 text-[11px]">Đến</span>trở lên</div>
                ) : (
                  <Input type="number" min={0} step="any" value={t.to} onChange={(e) => setTier(i, { to: e.target.value })} placeholder="Giá đến" aria-label={`Mức ${i + 1}: giá đến`} className="h-9" />
                )}
                <Input type="number" min={0} max={100} step="any" value={t.percent} onChange={(e) => setTier(i, { percent: e.target.value })} placeholder="% (vd 10)" aria-label={`Mức ${i + 1}: phần trăm`} className="h-9" />
                <Input type="number" min={0} step="any" value={t.fixed} onChange={(e) => setTier(i, { fixed: e.target.value })} placeholder="$ (nếu có)" aria-label={`Mức ${i + 1}: phí cố định`} className="h-9" />
                <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-danger/80 hover:bg-danger/10 hover:text-danger" disabled={tiers.length === 1} onClick={() => setTiers((prev) => prev.filter((_, k) => k !== i).map((x, k, arr) => (k === arr.length - 1 ? { ...x, to: "" } : x)))} aria-label={`Xoá mức ${i + 1}`} title="Xoá mức này">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="border-dashed" onClick={() => setTiers((prev) => [...prev, { to: "", percent: "", fixed: "" }])}>
            <Plus className="h-4 w-4" />
            Thêm mức giá
          </Button>
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Phí tối thiểu của Probstein ($, nếu có)">
            <Input type="number" min={0} step="any" value={minimumFee} onChange={(e) => setMinimumFee(e.target.value)} placeholder="Để trống nếu không có" />
          </Field>
          <Field label="Phí dịch vụ của shop (% trên giá End)">
            <Input type="number" min={0} max={100} step="any" value={serviceRate} onChange={(e) => setServiceRate(e.target.value)} />
          </Field>
          <Field label="Ghi chú">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Nguồn biểu phí, ngày nhận…" />
          </Field>
        </div>

        <section className="space-y-2 rounded-2xl border border-border/60 bg-card/40 p-3" aria-label="Tính thử">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Tính thử với giá End ($)" className="w-40">
              <Input type="number" min={0} step="0.01" value={testPrice} onChange={(e) => setTestPrice(e.target.value)} />
            </Field>
            <p className="pb-2 text-xs text-muted-foreground">Kiểm tra biểu phí vừa nhập trước khi lưu.</p>
          </div>
          {built.problem ? (
            <p className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {built.problem}
            </p>
          ) : preview ? (
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <p className="flex justify-between"><span>Giá End</span><span className="tabular-nums">{formatUSD(preview.endPrice)}</span></p>
              <p className="flex justify-between"><span>Phí Probstein</span><span className="tabular-nums text-rose-600 dark:text-rose-400">− {formatUSD(preview.probsteinFee)}</span></p>
              <p className="flex justify-between"><span>Phí dịch vụ ({serviceRate}% × giá End)</span><span className="tabular-nums text-rose-600 dark:text-rose-400">− {formatUSD(preview.myFee)}</span></p>
              <p className="flex justify-between font-semibold"><span>Tiền khách nhận</span><span className="tabular-nums">{formatUSD(preview.customerPayout)}</span></p>
              <p className="flex justify-between"><span>Lợi nhuận của shop</span><span className="tabular-nums text-emerald-600 dark:text-emerald-400">{formatUSD(preview.myFee)}</span></p>
              {preview.breakdown.length > 0 && (
                <p className="text-[11px] text-muted-foreground sm:col-span-2">Phí Probstein gồm: {preview.breakdown.map((b) => `${b.label} = ${formatUSD(b.amount)}`).join("; ")}</p>
              )}
            </div>
          ) : null}
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Huỷ</Button>
          <Button type="button" onClick={save} disabled={saving || Boolean(built.problem) || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Lưu phiên bản
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FeeSchedulesManager() {
  const [schedules, setSchedules] = useState<FeeScheduleDTO[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api("GET", "/api/consignment/fee-schedules")
      .then((j) => setSchedules(j.schedules))
      .catch(() => setFailed(true));
  }, []);

  const inForceId = schedules?.find((s) => new Date(s.effectiveFrom).getTime() <= Date.now())?.id ?? null;

  async function remove(s: FeeScheduleDTO) {
    if (!confirm(`Xoá phiên bản “${s.name}”?`)) return;
    setBusyId(s.id);
    try {
      const json = await api("DELETE", `/api/consignment/fee-schedules/${s.id}`);
      setSchedules(json.schedules);
      toast.success("Đã xoá phiên bản biểu phí");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xoá được.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Biểu phí Probstein</h1>
          <p className="text-sm text-muted-foreground">Cài đặt (Admin): biểu phí Probstein và phí dịch vụ của shop cho đơn ký gửi eBay. Mọi số tiền tính bằng USD.</p>
        </div>
        {schedules && <ScheduleDialog latest={schedules[0] ?? null} onSaved={setSchedules} />}
      </div>

      <section className="space-y-1.5 rounded-2xl border border-border/70 bg-card p-4 text-sm shadow-sm" aria-label="Công thức">
        <p className="flex items-center gap-2 font-semibold"><Info className="h-4 w-4" />Công thức tính</p>
        <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
          <li>Phí Probstein = tính theo biểu phí bên dưới (phần trăm và / hoặc phí cố định, có thể có mức tối thiểu).</li>
          <li>Phí dịch vụ của shop = Giá End × tỷ lệ (mặc định 5%), tính <strong>thẳng trên giá End</strong>, không tính trên số còn lại sau phí Probstein. Đây là lợi nhuận của shop.</li>
          <li>Tiền khách nhận = Giá End − Phí Probstein − Phí dịch vụ của shop.</li>
        </ul>
      </section>

      {failed && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">Không tải được biểu phí. Thử tải lại trang.</p>}
      {!schedules && !failed && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Đang tải…</p>
      )}

      {schedules && schedules.length === 0 && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Chưa có biểu phí Probstein nào. Hệ thống không tự đặt phí: chừng nào chưa nhập, phí Probstein và tiền khách nhận của các thẻ sẽ hiển thị “Chưa tính được”. Bấm “Tạo phiên bản biểu phí mới” và nhập đúng biểu phí thực tế.
          </span>
        </p>
      )}

      {schedules?.map((s) => (
        <section key={s.id} className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm" aria-label={`Phiên bản ${s.name}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                {s.name}
                {s.id === inForceId && <Badge variant="success">Đang áp dụng</Badge>}
                {new Date(s.effectiveFrom).getTime() > Date.now() && <Badge variant="warning">Chưa hiệu lực</Badge>}
              </h2>
              <p className="text-xs text-muted-foreground">
                Hiệu lực từ {formatDate(s.effectiveFrom)} · {s.mode === "MARGINAL" ? "Lũy tiến" : "Theo khoảng giá"} · phí dịch vụ của shop {s.serviceRate}% · {s.minimumFee !== null ? `phí tối thiểu ${formatUSD(s.minimumFee)}` : "không có phí tối thiểu"} · {s.usedBy} thẻ được ghim
              </p>
              {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
            </div>
            <Button type="button" size="sm" variant="ghost" className="text-danger/80 hover:bg-danger/10 hover:text-danger" disabled={busyId !== null || s.usedBy > 0} onClick={() => remove(s)} title={s.usedBy > 0 ? "Đang được ghim cho thẻ ký gửi nên không xoá được" : "Xoá phiên bản này"}>
              {busyId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Xoá
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-input text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Giá từ (≥)</th>
                  <th className="px-3 py-2">Giá đến (&lt;)</th>
                  <th className="px-3 py-2 text-right">Phần trăm</th>
                  <th className="px-3 py-2 text-right">Phí cố định</th>
                </tr>
              </thead>
              <tbody>
                {s.tiers.map((t, i) => (
                  <tr key={i} className="border-t border-border/40 tabular-nums">
                    <td className="px-3 py-2">{formatUSD(t.from)}</td>
                    <td className="px-3 py-2">{t.to === null ? "trở lên" : formatUSD(t.to)}</td>
                    <td className="px-3 py-2 text-right">{t.percent}%</td>
                    <td className="px-3 py-2 text-right">{t.fixed > 0 ? formatUSD(t.fixed) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
