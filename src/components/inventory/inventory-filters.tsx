"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface InventoryFilterState {
  status: string; // "all" or an enum value
  stock: string; // sealed only: all | in | out
  condition: string; // singles only: all | RAW | GRADED
  priced: string; // all | yes | no — has a market price
  costMin: string;
  costMax: string;
  marketMin: string;
  marketMax: string;
}

export const EMPTY_FILTERS: InventoryFilterState = {
  status: "all",
  stock: "all",
  condition: "all",
  priced: "all",
  costMin: "",
  costMax: "",
  marketMin: "",
  marketMax: "",
};

/** Only the filters that are actually set, as API query params. */
export function filterParams(f: InventoryFilterState): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.status !== "all") out.status = f.status;
  if (f.stock !== "all") out.stock = f.stock;
  if (f.condition !== "all") out.condition = f.condition;
  if (f.priced !== "all") out.priced = f.priced;
  if (f.costMin.trim()) out.costMin = f.costMin.trim();
  if (f.costMax.trim()) out.costMax = f.costMax.trim();
  if (f.marketMin.trim()) out.marketMin = f.marketMin.trim();
  if (f.marketMax.trim()) out.marketMax = f.marketMax.trim();
  return out;
}

const STATUS_OPTIONS = {
  sealed: [
    { value: "IN_STOCK", label: "Sẵn hàng" },
    { value: "IN_TRANSIT", label: "Đang ship về" },
    { value: "PRE_ORDER", label: "Pre-order" },
    { value: "ON_HOLD", label: "Đang Hold" },
  ],
  single: [
    { value: "IN_STOCK", label: "Còn hàng" },
    { value: "RESERVED", label: "Đã giữ" },
    { value: "SOLD", label: "Đã bán" },
  ],
};

function SelectField({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-xl bg-input" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RangeField({
  label,
  min,
  max,
  onChange,
}: {
  label: string;
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step="1000"
          inputMode="numeric"
          value={min}
          onChange={(e) => onChange(e.target.value, max)}
          placeholder="Từ"
          aria-label={`${label} từ`}
          className="h-10 rounded-xl bg-input"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="number"
          min={0}
          step="1000"
          inputMode="numeric"
          value={max}
          onChange={(e) => onChange(min, e.target.value)}
          placeholder="Đến"
          aria-label={`${label} đến`}
          className="h-10 rounded-xl bg-input"
        />
      </div>
    </div>
  );
}

interface InventoryFiltersProps {
  kind: "sealed" | "single";
  value: InventoryFilterState;
  onApply: (next: InventoryFilterState) => void;
  /** Game scope chosen with the game cards above (shown for context; the cards stay the only game filter). */
  gameScope?: string | null;
}

// One filter system: this panel feeds the same server query as the search box, date range and game cards.
export function InventoryFilters({ kind, value, onApply, gameScope }: InventoryFiltersProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const activeCount = useMemo(() => Object.keys(filterParams(value)).length, [value]);
  const patch = (change: Partial<InventoryFilterState>) => setDraft((d) => ({ ...d, ...change }));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(value); // start from what is applied, not from abandoned edits
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-10 gap-2 rounded-xl border-border/80 bg-input px-3.5 hover:bg-accent/40",
            activeCount > 0 && "border-primary/60 text-foreground"
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Bộ lọc
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,380px)] space-y-4 rounded-2xl border-border/80 bg-card p-4">
        <p className="text-sm font-semibold">Bộ lọc nhanh</p>

        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Trạng thái kho"
            value={draft.status}
            onChange={(status) => patch({ status })}
            options={STATUS_OPTIONS[kind]}
            allLabel="Tất cả"
          />
          {kind === "sealed" ? (
            <SelectField
              label="Số lượng"
              value={draft.stock}
              onChange={(stock) => patch({ stock })}
              options={[
                { value: "in", label: "Còn hàng (SL > 0)" },
                { value: "out", label: "Hết hàng (SL = 0)" },
              ]}
              allLabel="Tất cả"
            />
          ) : (
            <SelectField
              label="Loại thẻ"
              value={draft.condition}
              onChange={(condition) => patch({ condition })}
              options={[
                { value: "RAW", label: "Raw" },
                { value: "GRADED", label: "Graded" },
              ]}
              allLabel="Tất cả"
            />
          )}
        </div>

        <SelectField
          label="Giá thị trường"
          value={draft.priced}
          onChange={(priced) => patch({ priced })}
          options={[
            { value: "yes", label: "Đã có giá thị trường" },
            { value: "no", label: "Chưa có giá thị trường" },
          ]}
          allLabel="Tất cả"
        />
        <RangeField label="Giá nhập (₫)" min={draft.costMin} max={draft.costMax} onChange={(costMin, costMax) => patch({ costMin, costMax })} />
        <RangeField
          label="Giá thị trường (₫)"
          min={draft.marketMin}
          max={draft.marketMax}
          onChange={(marketMin, marketMax) => patch({ marketMin, marketMax })}
        />

        <p className="text-[11px] text-muted-foreground">
          Dòng game: <span className="font-medium text-foreground">{gameScope ?? "Tất cả"}</span> — đổi bằng các thẻ dòng game phía trên.
        </p>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1 rounded-xl"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              onApply(EMPTY_FILTERS);
              setOpen(false);
            }}
          >
            Đặt lại
          </Button>
          <Button
            type="button"
            className="h-10 flex-1 rounded-xl bg-brand-gradient text-white shadow-md shadow-primary/25 hover:opacity-95"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Áp dụng
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
