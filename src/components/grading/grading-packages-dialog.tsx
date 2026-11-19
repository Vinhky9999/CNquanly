"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, PackageOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GRADING_COMPANIES } from "@/lib/grading";
import { USD_RATE, type GradingPackageRow } from "@/lib/grading-packages";
import { cn, formatVND } from "@/lib/utils";

interface Draft {
  company: string;
  tier: string;
  estimate: string;
  priceUsd: string;
  costPrice: string;
  servicePrice: string;
}

const toDraft = (p?: GradingPackageRow): Draft => ({
  company: p?.company ?? "",
  tier: p?.tier ?? "",
  estimate: p?.estimate ?? "",
  priceUsd: p?.priceUsd == null ? "" : String(p.priceUsd),
  costPrice: p ? String(p.costPrice) : "",
  servicePrice: p ? String(p.servicePrice) : "",
});

const sameDraft = (a: Draft, b: Draft) => (Object.keys(a) as (keyof Draft)[]).every((k) => a[k].trim() === b[k].trim());
const num = (v: string) => Number(v) || 0;

// Header labels shown above the columns on wide screens (each input also carries its own label for phones).
const COLUMNS = ["Hãng", "Gói", "Thời gian (tháng)", "Giá USD", "Giá gốc (₫)", "Giá chấm (₫)", "Lãi / thẻ"];
const GRID = "sm:grid-cols-[0.8fr_1.3fr_0.9fr_0.8fr_1.1fr_1.1fr_1fr_auto]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-muted-foreground sm:hidden">{label}</span>
      {children}
    </label>
  );
}

// One package: editable fields plus its own save / delete (or "add" for the empty row at the bottom).
function PackageEditor({
  initial,
  onSubmit,
  onDelete,
}: {
  initial: GradingPackageRow | undefined;
  /** Resolves true when saved, so a new row can clear itself. */
  onSubmit: (draft: Draft) => Promise<boolean>;
  onDelete?: () => Promise<void>;
}) {
  const saved = useMemo(() => toDraft(initial), [initial]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [busy, setBusy] = useState(false);
  const adding = !initial;

  // A saved change elsewhere (or a refreshed list) replaces the row's values.
  useEffect(() => setDraft(saved), [saved]);

  const dirty = !sameDraft(draft, saved);
  const profit = num(draft.servicePrice) - num(draft.costPrice);
  const set = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));

  // Typing the USD price fills the cost (USD x 26.000) while the cost still follows the previous USD price.
  function changeUsd(value: string) {
    const follows = draft.costPrice === "" || num(draft.costPrice) === Math.round(num(draft.priceUsd) * USD_RATE);
    set({ priceUsd: value, ...(follows && value !== "" ? { costPrice: String(Math.round(num(value) * USD_RATE)) } : {}) });
  }

  async function submit() {
    setBusy(true);
    try {
      const ok = await onSubmit(draft);
      if (ok && adding) setDraft(toDraft());
    } finally {
      setBusy(false);
    }
  }

  const name = `${draft.company} ${draft.tier}`.trim() || "gói mới";

  return (
    <div
      className={cn(
        "grid items-end gap-2 rounded-xl border p-2.5",
        GRID,
        adding ? "border-dashed border-border/80 bg-background/30" : "border-border/60 bg-card/40",
        dirty && !adding && "border-amber-500/50"
      )}
    >
      <Field label="Hãng">
        <Input
          value={draft.company}
          onChange={(e) => set({ company: e.target.value })}
          list="grading-package-companies"
          placeholder="PSA"
          aria-label={`Hãng của ${name}`}
          className="h-9"
        />
      </Field>
      <Field label="Gói">
        <Input value={draft.tier} onChange={(e) => set({ tier: e.target.value })} placeholder="Express" aria-label={`Tên gói ${name}`} className="h-9" />
      </Field>
      <Field label="Thời gian (tháng)">
        <Input value={draft.estimate} onChange={(e) => set({ estimate: e.target.value })} placeholder="1-2" aria-label={`Thời gian dự kiến ${name}`} className="h-9" />
      </Field>
      <Field label="Giá USD">
        <Input type="number" min={0} step="any" value={draft.priceUsd} onChange={(e) => changeUsd(e.target.value)} placeholder="65" aria-label={`Giá USD ${name}`} className="h-9" />
      </Field>
      <Field label="Giá gốc (₫)">
        <Input type="number" min={0} step="1000" value={draft.costPrice} onChange={(e) => set({ costPrice: e.target.value })} placeholder="1690000" aria-label={`Giá gốc ${name}`} className="h-9 tabular-nums" />
      </Field>
      <Field label="Giá chấm (₫)">
        <Input type="number" min={0} step="1000" value={draft.servicePrice} onChange={(e) => set({ servicePrice: e.target.value })} placeholder="2080000" aria-label={`Giá chấm ${name}`} className="h-9 tabular-nums" />
      </Field>
      <div className="space-y-1">
        <span className="block text-[11px] text-muted-foreground sm:hidden">Lãi / thẻ</span>
        <p
          className={cn(
            "flex h-9 items-center text-sm font-semibold tabular-nums",
            draft.servicePrice === "" ? "text-muted-foreground" : profit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
          )}
          title="Giá chấm − Giá gốc (chưa trừ phí ship)"
        >
          {draft.servicePrice === "" || draft.costPrice === "" ? "—" : formatVND(profit)}
        </p>
      </div>
      <div className="flex items-center gap-1 sm:justify-end">
        {adding ? (
          <Button type="button" size="sm" className="h-9" onClick={submit} disabled={busy || !draft.company.trim() || !draft.tier.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Thêm
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="icon"
              variant={dirty ? "default" : "ghost"}
              className="h-9 w-9"
              onClick={submit}
              disabled={busy || !dirty}
              title={dirty ? "Lưu thay đổi của gói này" : "Chưa có thay đổi"}
              aria-label={`Lưu ${name}`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-danger/80 hover:bg-danger/10 hover:text-danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm(`Xoá gói ${name}? Các đơn chấm điểm đã tạo không bị ảnh hưởng.`)) return;
                setBusy(true);
                try {
                  await onDelete?.();
                } finally {
                  setBusy(false);
                }
              }}
              title="Xoá gói này"
              aria-label={`Xoá ${name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// "Gói chấm" button: the price list of every grading company. Choosing a package on an order fills its cost and price.
export function GradingPackagesDialog({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState<GradingPackageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch("/api/grading/packages")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((j) => !cancelled && setPackages(j.packages ?? []))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Group by company in the order the list is kept.
  const groups = useMemo(() => {
    const map = new Map<string, GradingPackageRow[]>();
    for (const p of packages) map.set(p.company, [...(map.get(p.company) ?? []), p]);
    return [...map.entries()];
  }, [packages]);
  const companies = useMemo(() => [...new Set([...GRADING_COMPANIES.filter((c) => c !== "Khác"), ...packages.map((p) => p.company)])], [packages]);

  const payload = (d: Draft) => ({ company: d.company, tier: d.tier, estimate: d.estimate, priceUsd: d.priceUsd, costPrice: d.costPrice || "0", servicePrice: d.servicePrice || "0" });

  async function save(method: "POST" | "PUT", draft: Draft, id?: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/grading/packages${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload(draft)),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Không lưu được gói");
      setPackages(json.packages ?? []);
      toast.success(method === "POST" ? "Đã thêm gói chấm" : "Đã lưu gói chấm");
      onChanged?.();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được gói");
      return false;
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/grading/packages?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Không xoá được gói");
      setPackages(json.packages ?? []);
      toast.success("Đã xoá gói chấm");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xoá được gói");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-10 rounded-xl border-border/80 bg-input hover:bg-accent/40">
          <PackageOpen className="h-4 w-4" />
          Gói chấm
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Thiết lập gói chấm điểm</DialogTitle>
          <DialogDescription>
            Bảng giá theo từng hãng, tính cho 1 thẻ. Khi tạo đơn, chọn hãng và gói sẽ tự điền Giá gốc (trả hãng) và Giá dịch vụ (thu của khách), vẫn sửa tay được. Sửa bảng này không đổi các đơn đã tạo.
            Nhập giá USD sẽ tự tính giá gốc theo tỷ giá {USD_RATE.toLocaleString("vi-VN")} ₫/USD (sửa được).
          </DialogDescription>
        </DialogHeader>

        <datalist id="grading-package-companies">
          {companies.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        {failed ? (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">Không đọc được bảng gói. Đóng rồi mở lại để thử lại.</p>
        ) : loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải…
          </p>
        ) : (
          <div className="space-y-5">
            <div className={cn("hidden gap-2 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid", GRID)}>
              {COLUMNS.map((c) => (
                <span key={c}>{c}</span>
              ))}
              <span />
            </div>

            {groups.length === 0 && (
              <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">Chưa có gói nào. Thêm gói đầu tiên ở dưới.</p>
            )}
            {groups.map(([company, rows]) => (
              <section key={company} className="space-y-2" aria-label={`Gói ${company}`}>
                <h3 className="text-sm font-semibold">
                  {company} <span className="text-xs font-normal text-muted-foreground">· {rows.length} gói</span>
                </h3>
                {rows.map((p) => (
                  <PackageEditor key={p.id} initial={p} onSubmit={(d) => save("PUT", d, p.id)} onDelete={() => remove(p.id)} />
                ))}
              </section>
            ))}

            <section className="space-y-2" aria-label="Thêm gói mới">
              <h3 className="text-sm font-semibold">Thêm gói mới</h3>
              <PackageEditor initial={undefined} onSubmit={(d) => save("POST", d)} />
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
