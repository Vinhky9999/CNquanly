"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Loader2, Minus, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/validations/chat-order";
import { cn, formatVND } from "@/lib/utils";
import { confirmChatPaymentAction, type ChatOrderActionResult } from "@/server/actions/chat-orders";

interface SearchRow {
  kind: "SEALED" | "SINGLE";
  id: string;
  sku: string;
  name: string;
  quantity: number;
  imageUrl: string | null;
  detail: string | null;
}

interface Line {
  kind: "SEALED" | "SINGLE";
  id: string;
  sku: string;
  name: string;
  stock: number;
  quantity: number;
  price: string; // digits only
}

type ConfirmedOrder = NonNullable<ChatOrderActionResult["order"]>;

interface ConfirmPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  customerName: string;
  /** Whether the conversation already points at a customer record (otherwise one is created on confirm). */
  linked: boolean;
  /** The customer message that triggered the suggestion, shown as context. */
  notice?: string | null;
  onConfirmed: (order: ConfirmedOrder) => void;
}

const digits = (v: string) => v.replace(/\D/g, "");
const money = (v: string) => (v ? Number(v).toLocaleString("vi-VN") : "");
const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function ConfirmPaymentDialog({
  open,
  onOpenChange,
  conversationId,
  customerName,
  linked,
  notice,
  onConfirmed,
}: ConfirmPaymentDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [delivery, setDelivery] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newKey());

  // Every time the dialog opens it is a fresh confirmation with its own idempotency key.
  useEffect(() => {
    if (!open) return;
    keyRef.current = newKey();
    setQuery("");
    setResults([]);
    setLines([]);
    setAmount("");
    setDescription("");
    setMethod("BANK_TRANSFER");
    setDelivery(false);
    setNotes("");
    setPending(false);
    setError(null);
  }, [open, conversationId]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setResults([]);
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/inventory/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { rows: [] }))
        .then((j) => setResults(j.rows ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const total = useMemo(
    () => (lines.length ? lines.reduce((sum, l) => sum + l.quantity * Number(l.price || 0), 0) : Number(amount || 0)),
    [lines, amount]
  );
  const missingPrice = lines.some((l) => !l.price);
  const canSubmit = !pending && Boolean(conversationId) && total > 0 && !missingPrice;

  function addLine(row: SearchRow) {
    setLines((prev) =>
      prev.some((l) => l.kind === row.kind && l.id === row.id)
        ? prev
        : [...prev, { kind: row.kind, id: row.id, sku: row.sku, name: row.name, stock: row.quantity, quantity: 1, price: "" }]
    );
    setQuery("");
    setResults([]);
  }

  const patchLine = (index: number, change: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...change } : l)));

  async function submit() {
    if (!conversationId || !canSubmit) return;
    setPending(true);
    setError(null);
    const result = await confirmChatPaymentAction({
      conversationId,
      idempotencyKey: keyRef.current,
      paymentMethod: method,
      items: lines.map((l) => ({ itemType: l.kind, itemId: l.id, quantity: l.quantity, unitPrice: Number(l.price) })),
      amount: lines.length ? undefined : Number(amount),
      description: description || undefined,
      notes: notes || undefined,
      delivery,
    }).catch(() => ({ error: "Không kết nối được máy chủ, hãy thử lại" }) as ChatOrderActionResult);
    setPending(false);
    if (result.error || !result.order) {
      setError(result.error ?? "Không thể ghi nhận thanh toán");
      return toast.error(result.error ?? "Không thể ghi nhận thanh toán");
    }
    onConfirmed(result.order);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-success" />
            Xác nhận thanh toán · {customerName}
          </DialogTitle>
          <DialogDescription>
            Ghi nhận đơn bán, cộng vào chi tiêu của khách và thêm giao dịch Thu vào Dòng tiền chỉ với một lần xác nhận.
          </DialogDescription>
        </DialogHeader>

        {notice && (
          <p className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-muted-foreground">
            Khách nhắn: <span className="font-medium text-foreground">“{notice}”</span>
          </p>
        )}

        {/* Products */}
        <div className="space-y-2">
          <Label htmlFor="pay-search">Sản phẩm khách đã mua</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="pay-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm tên hoặc SKU trong kho để thêm vào đơn..."
              className="h-10 rounded-xl bg-input pl-9"
              autoComplete="off"
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          {results.length > 0 && (
            <ul className="thin-scroll max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border/70 bg-background/40 p-1.5">
              {results.map((r) => {
                const out = r.quantity <= 0;
                return (
                  <li key={`${r.kind}-${r.id}`}>
                    <button
                      type="button"
                      disabled={out}
                      onClick={() => addLine(r)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {r.sku}
                          {r.detail ? ` · ${r.detail}` : ""}
                        </span>
                      </span>
                      <span className={cn("shrink-0 text-xs", out ? "text-danger" : "text-muted-foreground")}>
                        {out ? "Hết hàng" : `Còn ${r.quantity}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {lines.length > 0 ? (
            <ul className="space-y-2">
              {lines.map((l, i) => (
                <li key={`${l.kind}-${l.id}`} className="rounded-xl border border-border/70 bg-input/40 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {l.sku} · tồn {l.stock}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      aria-label={`Bỏ ${l.name} khỏi đơn`}
                      onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        aria-label="Giảm số lượng"
                        disabled={l.quantity <= 1}
                        onClick={() => patchLine(i, { quantity: l.quantity - 1 })}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        aria-label="Tăng số lượng"
                        disabled={l.quantity >= l.stock || l.kind === "SINGLE"}
                        onClick={() => patchLine(i, { quantity: l.quantity + 1 })}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="relative">
                      <Input
                        value={money(l.price)}
                        onChange={(e) => patchLine(i, { price: digits(e.target.value) })}
                        inputMode="numeric"
                        placeholder="Giá bán / 1 sản phẩm"
                        aria-label={`Giá bán ${l.name}`}
                        className="h-8 rounded-lg bg-input pr-7 text-right tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₫</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2 rounded-xl border border-dashed border-border/70 p-3">
              <p className="text-xs text-muted-foreground">
                Không chọn sản phẩm? Nhập số tiền khách đã thanh toán (cọc, dịch vụ, khoản khác). Khoản này không trừ tồn kho và không tính vào báo cáo lợi nhuận.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="relative">
                  <Input
                    value={money(amount)}
                    onChange={(e) => setAmount(digits(e.target.value))}
                    inputMode="numeric"
                    placeholder="Số tiền đã nhận"
                    aria-label="Số tiền khách đã thanh toán"
                    className="h-10 rounded-xl bg-input pr-7 text-right tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₫</span>
                </div>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Nội dung (VD: cọc đặt hàng)"
                  aria-label="Nội dung thanh toán"
                  maxLength={200}
                  className="h-10 rounded-xl bg-input"
                />
              </div>
            </div>
          )}
        </div>

        {/* Payment details */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Hình thức thanh toán</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="h-10 rounded-xl bg-input" aria-label="Hình thức thanh toán">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 bg-input/40 p-3 text-sm">
            <input
              type="checkbox"
              checked={delivery}
              onChange={(e) => setDelivery(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              Đơn giao hàng
              <span className="block text-[11px] text-muted-foreground">Nhập mã vận đơn sau ở mục Giao Hàng.</span>
            </span>
          </label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-notes">Ghi chú</Label>
          <Textarea
            id="pay-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="VD: Khách ck lúc 20:15, nội dung 'NGUYENVANA MUA BOX'"
            className="resize-none rounded-xl bg-input"
          />
        </div>

        {/* Summary */}
        <div className="space-y-2 rounded-2xl border border-success/30 bg-success/5 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Tổng tiền đã thu</span>
            <span className="text-xl font-bold tabular-nums text-success">{formatVND(total)}</span>
          </div>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            <li>• Tạo đơn bán và tăng “Số đơn mua” / “Tổng chi tiêu” của khách.</li>
            <li>• Thêm giao dịch Thu (IN) vào Dòng tiền và cập nhật Tổng quan.</li>
            {lines.length > 0 && <li>• Trừ tồn kho và lưu giá vốn tại thời điểm bán.</li>}
            {!linked && (
              <li className="flex items-center gap-1 text-accent-foreground">
                <UserPlus className="h-3 w-3" /> Chưa có hồ sơ khách: sẽ tạo khách mới “{customerName}” và liên kết với hội thoại này.
              </li>
            )}
          </ul>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="h-10 rounded-xl bg-brand-gradient px-5 text-white shadow-md shadow-primary/30 hover:opacity-95 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
            {pending ? "Đang ghi nhận…" : "Xác nhận đã thanh toán"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
