"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createGradingAction,
  updateGradingAction,
  type GradingActionState,
} from "@/server/actions/grading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GRADING_COMPANIES, GRADING_STATUSES, GRADING_TIERS, gradingStatusLabel } from "@/lib/grading";
import { GAME_OPTIONS } from "@/lib/tcg-games";
import { cn, formatVND } from "@/lib/utils";

const initialState: GradingActionState = {};
const OTHER = "Khác";

export interface GradingItemRow {
  id?: string;
  cardName: string;
  game: string | null;
  sku: string | null;
  certNumber: string | null;
  company: string;
  tier: string;
  quantity: number;
  listedFee: unknown;
  costPrice: unknown;
  markup: unknown;
}

export interface GradingFormSubmission {
  id: string;
  customerName: string;
  customerContact: string | null;
  status: string;
  notes: string | null;
  incomeEntryId: string | null;
  costEntryId: string | null;
  items: GradingItemRow[];
}

// Form-side card line: money kept as strings so the inputs stay editable.
interface DraftItem {
  key: number;
  cardName: string;
  game: string;
  sku: string;
  certNumber: string;
  company: string;
  customCompany: boolean;
  tier: string;
  quantity: string;
  listedFee: string;
  costPrice: string;
  markup: string;
  costTouched: boolean;
}

let nextKey = 1;

function blankItem(from?: DraftItem): DraftItem {
  return {
    key: nextKey++,
    cardName: "",
    game: from?.game ?? "",
    sku: "",
    certNumber: "",
    company: from?.company ?? "PSA",
    customCompany: from?.customCompany ?? false,
    tier: from?.tier ?? "",
    quantity: "1",
    listedFee: "",
    costPrice: "",
    markup: "",
    costTouched: false,
  };
}

function toDraft(item: GradingItemRow): DraftItem {
  return {
    key: nextKey++,
    cardName: item.cardName,
    game: item.game ?? "",
    sku: item.sku ?? "",
    certNumber: item.certNumber ?? "",
    company: item.company,
    customCompany: !(GRADING_COMPANIES as readonly string[]).includes(item.company) || item.company === OTHER,
    tier: item.tier,
    quantity: String(item.quantity),
    listedFee: String(Number(item.listedFee)),
    costPrice: String(Number(item.costPrice)),
    markup: String(Number(item.markup)),
    costTouched: true,
  };
}

const num = (v: string) => Number(v) || 0;

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Tạo đơn chấm điểm"}
    </Button>
  );
}

interface GradingFormDialogProps {
  submission?: GradingFormSubmission;
  onSuccess?: () => void;
}

export function GradingFormDialog({ submission, onSuccess }: GradingFormDialogProps) {
  const editing = Boolean(submission);
  const [open, setOpen] = useState(false);

  const action = submission ? updateGradingAction.bind(null, submission.id) : createGradingAction;
  const [state, formAction] = useFormState(action, initialState);

  const initialItems = () =>
    submission && submission.items.length > 0 ? submission.items.map(toDraft) : [blankItem()];
  const [status, setStatus] = useState<string>(submission?.status ?? "PENDING_SEND");
  const [items, setItems] = useState<DraftItem[]>(initialItems);

  // Every time the dialog opens, start from the saved order (or an empty one) rather than stale edits.
  function handleOpenChange(next: boolean) {
    if (next) {
      setItems(initialItems());
      setStatus(submission?.status ?? "PENDING_SEND");
    }
    setOpen(next);
  }

  function patch(key: number, changes: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...changes } : it)));
  }

  const totals = useMemo(() => {
    const cost = items.reduce((s, i) => s + num(i.costPrice), 0);
    const markup = items.reduce((s, i) => s + num(i.markup), 0);
    return { cost, markup, charge: cost + markup, cards: items.reduce((s, i) => s + (num(i.quantity) || 0), 0) };
  }, [items]);

  const itemsJson = JSON.stringify(
    items.map((i) => ({
      cardName: i.cardName,
      game: i.game,
      sku: i.sku,
      certNumber: i.certNumber,
      company: i.company,
      tier: i.tier,
      quantity: i.quantity,
      listedFee: i.listedFee || "0",
      costPrice: i.costPrice || "0",
      markup: i.markup || "0",
    }))
  );

  useEffect(() => {
    if (state.success) {
      toast.success(editing ? "Đã cập nhật đơn chấm điểm" : "Đã tạo đơn chấm điểm");
      setOpen(false);
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {editing ? (
          <Button size="icon" variant="ghost">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="h-10">
            <Plus className="h-4 w-4" />
            Tạo đơn chấm điểm
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Sửa đơn chấm điểm" : "Tạo đơn gửi chấm điểm"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="items" value={itemsJson} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="customerName">Tên khách hàng</Label>
              <Input id="customerName" name="customerName" defaultValue={submission?.customerName ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerContact">Liên hệ (SĐT / Zalo / FB)</Label>
              <Input id="customerContact" name="customerContact" defaultValue={submission?.customerContact ?? ""} />
            </div>
            <div className="space-y-2">
              <Label>Trạng thái đơn</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {gradingStatusLabel[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                Danh sách thẻ bài ({items.length})
              </p>
            </div>

            {items.map((item, index) => {
              const tiers = GRADING_TIERS[item.customCompany ? OTHER : item.company] ?? GRADING_TIERS[OTHER];
              const listId = `grading-tier-${item.key}`;
              const gameListId = `grading-game-${item.key}`;
              return (
                <div
                  key={item.key}
                  className="space-y-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3 backdrop-blur-xl dark:bg-slate-900/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Thẻ #{index + 1}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        Khách trả{" "}
                        <span className="font-semibold text-foreground">
                          {formatVND(num(item.costPrice) + num(item.markup))}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={items.length === 1}
                        aria-label={`Xoá thẻ #${index + 1}`}
                        onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-6">
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label>Tên lá bài</Label>
                      <Input
                        value={item.cardName}
                        onChange={(e) => patch(item.key, { cardName: e.target.value })}
                        placeholder="Charizard ex 199/165"
                        required
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Dòng game</Label>
                      <Input
                        value={item.game}
                        onChange={(e) => patch(item.key, { game: e.target.value })}
                        list={gameListId}
                        placeholder="Pokémon"
                      />
                      <datalist id={gameListId}>
                        {GAME_OPTIONS.filter((g) => g !== OTHER).map((g) => (
                          <option key={g} value={g} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Số lượng</Label>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => patch(item.key, { quantity: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-6">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Hãng chấm điểm</Label>
                      <Select
                        value={item.customCompany ? OTHER : item.company}
                        onValueChange={(value) =>
                          value === OTHER
                            ? patch(item.key, { customCompany: true, company: "" })
                            : patch(item.key, { customCompany: false, company: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GRADING_COMPANIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {item.customCompany && (
                        <Input
                          value={item.company}
                          onChange={(e) => patch(item.key, { company: e.target.value })}
                          placeholder="Tên hãng"
                          required
                        />
                      )}
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Gói chấm điểm</Label>
                      <Input
                        value={item.tier}
                        onChange={(e) => patch(item.key, { tier: e.target.value })}
                        list={listId}
                        placeholder="Regular, Express..."
                        required
                      />
                      <datalist id={listId}>
                        {tiers.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-1.5">
                      <Label>SKU / Mã</Label>
                      <Input value={item.sku} onChange={(e) => patch(item.key, { sku: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cert / Serial</Label>
                      <Input
                        value={item.certNumber}
                        onChange={(e) => patch(item.key, { certNumber: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>Phí niêm yết hãng (₫)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="1000"
                        value={item.listedFee}
                        onChange={(e) =>
                          patch(item.key, {
                            listedFee: e.target.value,
                            ...(item.costTouched ? {} : { costPrice: e.target.value }),
                          })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Giá gốc thực tế (₫)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="1000"
                        value={item.costPrice}
                        onChange={(e) => patch(item.key, { costTouched: true, costPrice: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Lãi dịch vụ (₫)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="1000"
                        value={item.markup}
                        onChange={(e) => patch(item.key, { markup: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              className="h-10 w-full border-dashed"
              onClick={() => setItems((prev) => [...prev, blankItem(prev[prev.length - 1])])}
            >
              <Plus className="h-4 w-4" />
              Thêm thẻ bài
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/60 p-3 sm:grid-cols-4">
            <TotalCell label="Tổng số thẻ" value={String(totals.cards)} />
            <TotalCell label="Tổng giá gốc" value={formatVND(totals.cost)} tone="rose" />
            <TotalCell label="Tổng lãi dịch vụ" value={formatVND(totals.markup)} tone="emerald" />
            <TotalCell label="Khách phải trả" value={formatVND(totals.charge)} strong />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Input id="notes" name="notes" defaultValue={submission?.notes ?? ""} />
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 p-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Đồng bộ Dòng tiền</p>
            {!submission?.incomeEntryId && (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="collectPayment" defaultChecked={!editing} className="h-4 w-4 accent-emerald-500" />
                Đã thu tiền khách — ghi khoản Thu vào Dòng tiền
              </label>
            )}
            {!submission?.costEntryId && (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="payCost" className="h-4 w-4 accent-rose-500" />
                Đã trả phí gốc cho hãng — ghi khoản Chi vào Dòng tiền
              </label>
            )}
            {submission?.incomeEntryId && submission?.costEntryId && (
              <p className="text-xs text-muted-foreground">
                Đã ghi nhận đủ thu/chi — sửa số tiền ở đây sẽ tự cập nhật các dòng trong Dòng tiền.
              </p>
            )}
          </div>

          <SubmitButton editing={editing} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TotalCell({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "rose" | "emerald";
  strong?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-base font-semibold tabular-nums",
          tone === "rose" && "text-rose-600 dark:text-rose-400",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
          strong && "text-lg"
        )}
      >
        {value}
      </p>
    </div>
  );
}
