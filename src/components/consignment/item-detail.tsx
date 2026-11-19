"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink, FileDown, Info, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fromLocalInput, formatDateTime, formatMoney, formatUSD, formatUSDSigned, STATUS_LABEL, STATUS_VARIANT, timeLeft, toLocalInput } from "@/components/consignment/format";
import { ImageGallery } from "@/components/consignment/image-gallery";
import { filesToDataUrls } from "@/components/consignment/image-tools";
import { PageUpdateDialog } from "@/components/consignment/page-update-dialog";
import type { ConsignmentItemDTO, FeeScheduleDTO, ListingStatus } from "@/lib/consignment/types";
import { cn } from "@/lib/utils";

const AUTO = "__auto";

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? "Có lỗi xảy ra. Thử lại sau.");
  return json;
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm", className)} aria-label={title}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-xs font-medium leading-none">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, tone, strong, hint }: { label: React.ReactNode; value: React.ReactNode; tone?: "rose" | "emerald"; strong?: boolean; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className={cn("text-sm", strong && "font-semibold")}>{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <p className={cn("shrink-0 text-sm tabular-nums", strong && "text-base font-semibold", tone === "rose" && "text-rose-600 dark:text-rose-400", tone === "emerald" && "text-emerald-600 dark:text-emerald-400")}>{value}</p>
    </div>
  );
}

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

interface Draft {
  customerName: string;
  customerContact: string;
  ebayUrl: string;
  title: string;
  subject: string;
  setName: string;
  year: string;
  cardNumber: string;
  cardType: string;
  rarity: string;
  gradingCompany: string;
  grade: string;
  certNumber: string;
  condition: string;
  description: string;
  notes: string;
  seller: string;
  currentPrice: string;
  bidCount: string;
  endsAt: string;
}

const draftOf = (it: ConsignmentItemDTO): Draft => ({
  customerName: it.order.customerName, customerContact: s(it.order.customerContact), ebayUrl: s(it.ebayUrl), title: it.title,
  subject: s(it.subject), setName: s(it.setName), year: s(it.year), cardNumber: s(it.cardNumber), cardType: s(it.cardType), rarity: s(it.rarity),
  gradingCompany: s(it.gradingCompany), grade: s(it.grade), certNumber: s(it.certNumber), condition: s(it.condition), description: s(it.description),
  notes: s(it.notes), seller: s(it.seller), currentPrice: s(it.currentPrice), bidCount: s(it.bidCount), endsAt: toLocalInput(it.endsAt),
});

export function ItemDetail({ initial }: { initial: ConsignmentItemDTO }) {
  const router = useRouter();
  const [item, setItem] = useState(initial);
  const [schedules, setSchedules] = useState<FeeScheduleDTO[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Whether the eBay API keys are set: with them "Cập nhật từ eBay" works; without them the page reader is the way.
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [pageOpen, setPageOpen] = useState(false);

  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [resultStatus, setResultStatus] = useState<ListingStatus>(initial.listingStatus);
  const [resultPrice, setResultPrice] = useState(() => s(initial.endPrice ?? (initial.currency === "USD" ? initial.currentPrice : null)));
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payNote, setPayNote] = useState("");

  const resync = useCallback((next: ConsignmentItemDTO) => {
    setItem(next);
    setDraft(draftOf(next));
    setResultStatus(next.listingStatus);
    setResultPrice(s(next.endPrice ?? (next.currency === "USD" ? next.currentPrice : null)));
  }, []);

  useEffect(() => {
    fetch("/api/consignment/fee-schedules")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setSchedules(j.schedules ?? []))
      .catch(() => {});
    fetch("/api/consignment/ebay/lookup")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setApiConfigured(Boolean(j.configured)))
      .catch(() => {});
  }, []);

  // Runs a request, shows the error as a toast, and replaces the card with the answer.
  async function run(key: string, work: () => Promise<{ item?: ConsignmentItemDTO } & Record<string, any>>, success?: string) {
    setBusy(key);
    try {
      const json = await work();
      if (json.item) resync(json.item);
      if (success) toast.success(success);
      return json;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const f = item.finance;
  const schedule = schedules.find((x) => x.id === f.scheduleId) ?? null;
  const rateLabel = schedule ? `${schedule.serviceRate}%` : "";
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(draftOf(item)), [draft, item]);
  const set = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));
  const left = timeLeft(item.endsAt);

  const refresh = async () => {
    const json = await run("refresh", () => api("POST", `/api/consignment/items/${item.id}/refresh`));
    if (json?.result) (json.result.outcome === "ERROR" ? toast.error : toast.success)(json.result.message);
  };

  const saveDetails = () =>
    run(
      "save",
      () =>
        api("PATCH", `/api/consignment/items/${item.id}`, {
          customerName: draft.customerName, customerContact: draft.customerContact, ebayUrl: draft.ebayUrl, title: draft.title,
          subject: draft.subject, setName: draft.setName, year: draft.year, cardNumber: draft.cardNumber, cardType: draft.cardType, rarity: draft.rarity,
          gradingCompany: draft.gradingCompany, grade: draft.grade, certNumber: draft.certNumber, condition: draft.condition,
          description: draft.description, notes: draft.notes, seller: draft.seller, currentPrice: draft.currentPrice, bidCount: draft.bidCount,
          endsAt: fromLocalInput(draft.endsAt),
        }),
      "Đã lưu thay đổi"
    );

  const saveResult = () =>
    run(
      "result",
      () => api("PATCH", `/api/consignment/items/${item.id}`, { listingStatus: resultStatus, endPrice: resultStatus === "SOLD" ? resultPrice : null }),
      "Đã cập nhật kết quả đấu giá"
    );

  const pinSchedule = (value: string) =>
    run("schedule", () => api("PATCH", `/api/consignment/items/${item.id}`, { feeScheduleId: value === AUTO ? null : value }), "Đã đổi biểu phí áp dụng");

  const addPayment = async () => {
    const json = await run("pay", () => api("POST", `/api/consignment/items/${item.id}/payments`, { amount: payAmount, paidAt: payDate || undefined, note: payNote }), "Đã ghi nhận thanh toán");
    if (json) {
      setPayAmount("");
      setPayNote("");
    }
  };

  const upload = async (files: FileList) => {
    setBusy("upload");
    try {
      const { urls, errors } = await filesToDataUrls(files);
      errors.forEach((e) => toast.error(e));
      if (urls.length) {
        const json = await api("POST", `/api/consignment/items/${item.id}/images`, { uploads: urls });
        resync(json.item);
        toast.success(`Đã thêm ${urls.length} ảnh`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tải được ảnh.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm(`Xoá thẻ ký gửi ${item.code}? Thao tác này không hoàn tác được.`)) return;
    setBusy("delete");
    try {
      await api("DELETE", `/api/consignment/items/${item.id}`);
      toast.success("Đã xoá thẻ ký gửi");
      router.push("/consignment");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xoá được.");
      setBusy(null);
    }
  };

  const isFinal = f.basis === "FINAL";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground">
            <Link href="/consignment">
              <ArrowLeft className="h-4 w-4" />
              Danh sách ký gửi
            </Link>
          </Button>
          <h1 className="break-words text-2xl font-semibold tracking-tight">{item.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{item.code}</span>
            <span>·</span>
            <span>Đơn {item.order.code}</span>
            <span>·</span>
            <span>Khách {item.order.customerName}</span>
            <Badge variant={STATUS_VARIANT[item.effectiveStatus]}>{STATUS_LABEL[item.effectiveStatus]}</Badge>
            <Badge variant={item.dataSource === "EBAY_API" ? "indigo" : item.dataSource === "EBAY_PAGE" ? "success" : "slate"}>
              {item.dataSource === "EBAY_API" ? "Lấy từ eBay API" : item.dataSource === "EBAY_PAGE" ? "Đọc từ trang eBay" : "Nhập tay"}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.ebayItemId && apiConfigured === true && (
            <Button type="button" variant="outline" onClick={refresh} disabled={busy !== null || item.listingStatus === "SOLD" || item.listingStatus === "UNSOLD"} title="Lấy giá và số lượt đấu giá mới nhất từ eBay bằng khoá API">
              {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Cập nhật từ eBay
            </Button>
          )}
          {item.ebayItemId && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setPageOpen(true)}
              disabled={busy !== null || item.listingStatus === "SOLD" || item.listingStatus === "UNSOLD"}
              title="Lấy giá và số lượt đấu giá mới nhất từ trang eBay bạn mở trên trình duyệt (không cần khoá API)"
            >
              <FileDown className="h-4 w-4" />
              Cập nhật từ trang eBay
            </Button>
          )}
          {item.ebayUrl && (
            <Button asChild variant="outline">
              <a href={item.ebayUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Mở trên eBay
              </a>
            </Button>
          )}
          <Button type="button" variant="outline" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={remove} disabled={busy !== null}>
            <Trash2 className="h-4 w-4" />
            Xoá
          </Button>
        </div>
      </div>

      {item.fetchError && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{item.fetchError}</span>
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <Section title="Hình ảnh">
            <ImageGallery
              images={item.images.map((i) => ({ id: i.id, src: i.src, label: i.source === "UPLOAD" ? "Ảnh tải lên" : "Ảnh eBay" }))}
              alt={item.title}
              onPickFiles={upload}
              onDelete={async (id) => {
                await run("image", () => api("DELETE", `/api/consignment/items/${item.id}/images/${id}`), "Đã xoá ảnh");
              }}
              busy={busy === "upload" || busy === "image"}
            />
          </Section>

          <Section title="Đấu giá eBay">
            <div className="divide-y divide-border/50">
              <Row label="Item ID" value={<span className="font-mono">{item.ebayItemId ?? "—"}</span>} />
              <Row label="Seller" value={item.seller ?? "—"} />
              <Row label="Giá hiện tại" value={formatMoney(item.currentPrice, item.currency)} hint={item.effectiveStatus === "ENDED" ? "Giá cuối đã theo dõi" : undefined} />
              <Row label="Số lượt đấu giá" value={item.bidCount ?? "—"} />
              <Row label="Kết thúc" value={formatDateTime(item.endsAt)} hint={item.effectiveStatus === "ACTIVE" ? (left ?? undefined) : undefined} />
              <Row label="Cập nhật từ eBay lần cuối" value={item.fetchedAt ? formatDateTime(item.fetchedAt) : "Chưa lần nào"} />
            </div>
          </Section>
        </div>

        <div className="space-y-5">
          {/* Money */}
          <Section title="Tính tiền">
            {f.problem && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {f.problem}{" "}
                  {/biểu phí/i.test(f.problem) && (
                    <Link href="/consignment/settings" className="font-semibold underline">
                      Cài đặt biểu phí
                    </Link>
                  )}
                </span>
              </p>
            )}
            {f.basis === "NONE" && item.effectiveStatus === "UNSOLD" && <p className="text-sm text-muted-foreground">Thẻ không bán được nên không phát sinh phí và không có tiền trả khách.</p>}
            {f.basis === "NONE" && !f.problem && item.effectiveStatus !== "UNSOLD" && (
              <p className="text-sm text-muted-foreground">Chưa có giá để tính. Khi có giá hiện tại hoặc giá End, các khoản phí sẽ tự hiện ở đây.</p>
            )}
            {f.basis === "CURRENT" && (
              <p className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {item.effectiveStatus === "ENDED"
                  ? "Đấu giá đã kết thúc. Đây chỉ là số tạm tính theo giá cuối đã theo dõi; hãy xác nhận kết quả bên dưới để chốt giá End."
                  : "Tạm tính theo giá hiện tại, chưa phải giá cuối. Số liệu tự cập nhật khi giá thay đổi và được chốt khi bạn xác nhận giá End."}
              </p>
            )}

            {f.fees && (
              <div className="divide-y divide-border/50">
                <Row label={isFinal ? "Giá End" : "Giá hiện tại (tạm tính)"} value={formatUSD(f.fees.endPrice)} strong />
                <Row label="Phí Probstein" value={`− ${formatUSD(f.fees.probsteinFee)}`} tone="rose" hint={f.fees.breakdown.length ? f.fees.breakdown.map((b) => `${b.label}: ${formatUSD(b.amount)}`).join(" · ") : "Không có phí"} />
                <Row label={`Phí dịch vụ của shop${rateLabel ? ` (${rateLabel} trên giá End)` : ""}`} value={`− ${formatUSD(f.fees.myFee)}`} tone="rose" />
                <Row label="Tổng phí khấu trừ" value={`− ${formatUSD(f.fees.totalFee)}`} />
                <Row label={isFinal ? "Tiền khách nhận" : "Tiền khách nhận (tạm tính)"} value={formatUSDSigned(f.fees.customerPayout)} strong tone={f.fees.customerPayout < 0 ? "rose" : undefined} />
                <Row label={isFinal ? "Lợi nhuận của shop" : "Lợi nhuận của shop (tạm tính)"} value={formatUSD(f.fees.myFee)} tone="emerald" strong />
                {isFinal && <Row label="Đã thanh toán cho khách" value={formatUSD(f.paid)} />}
                {isFinal && f.remaining !== null && <Row label="Còn phải trả khách" value={formatUSDSigned(f.remaining)} strong tone={f.remaining > 0 ? undefined : "emerald"} />}
              </div>
            )}
            {f.fees && f.fees.customerPayout < 0 && <p className="text-xs text-rose-600 dark:text-rose-400">Phí lớn hơn giá End nên tiền khách nhận bị âm. Kiểm tra lại biểu phí.</p>}

            <div className="grid gap-2 border-t border-border/50 pt-3 sm:grid-cols-[1fr_260px] sm:items-end">
              <div>
                <p className="text-xs text-muted-foreground">
                  Biểu phí áp dụng: <span className="font-semibold text-foreground">{f.scheduleName ?? "chưa có"}</span> {f.scheduleName ? (f.scheduleAuto ? "(tự động theo ngày kết thúc)" : "(đã chọn cho thẻ này)") : ""}
                </p>
                {f.scheduleNote && <p className="text-[11px] text-amber-600 dark:text-amber-400">{f.scheduleNote}</p>}
              </div>
              <Select value={item.feeScheduleId ?? AUTO} onValueChange={pinSchedule} disabled={busy !== null || schedules.length === 0}>
                <SelectTrigger aria-label="Chọn phiên bản biểu phí"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>Tự động (theo ngày kết thúc)</SelectItem>
                  {schedules.map((x) => (
                    <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>

          {/* Result */}
          <Section title="Kết quả đấu giá">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Trạng thái">
                <Select value={resultStatus} onValueChange={(v) => setResultStatus(v as ListingStatus)}>
                  <SelectTrigger aria-label="Trạng thái kết quả"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as ListingStatus[]).map((k) => (
                      <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Giá End (USD)">
                <Input type="number" min={0} step="0.01" value={resultPrice} onChange={(e) => setResultPrice(e.target.value)} disabled={resultStatus !== "SOLD"} placeholder={resultStatus === "SOLD" ? "Giá bán cuối cùng" : "Chỉ nhập khi đã bán"} aria-label="Giá End" />
              </Field>
              <Button type="button" onClick={saveResult} disabled={busy !== null || (resultStatus === item.listingStatus && (resultStatus !== "SOLD" || Number(resultPrice) === item.endPrice))}>
                {busy === "result" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {resultStatus === "SOLD" ? "Xác nhận đã bán" : "Lưu kết quả"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              eBay chỉ cung cấp giá khi listing còn hiệu lực, nên sau khi đấu giá kết thúc hãy nhập giá End thực tế (xem email / trang eBay của người bán).
              {item.currentPrice !== null && item.currency === "USD" ? ` Giá cuối hệ thống đã theo dõi: ${formatUSD(item.currentPrice)}.` : ""}
            </p>
          </Section>

          {/* Payments */}
          <Section title="Thanh toán cho khách">
            {!isFinal ? (
              <p className="text-sm text-muted-foreground">Chỉ ghi nhận thanh toán sau khi đã xác nhận đã bán và có giá End.</p>
            ) : (
              <>
                {item.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Chưa thanh toán khoản nào.</p>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {item.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium tabular-nums">{formatUSD(p.amount)}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(p.paidAt)}{p.note ? ` · ${p.note}` : ""}</p>
                        </div>
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-danger/80 hover:bg-danger/10 hover:text-danger" disabled={busy !== null} onClick={() => confirm("Xoá khoản thanh toán này?") && run("pay", () => api("DELETE", `/api/consignment/items/${item.id}/payments/${p.id}`), "Đã xoá khoản thanh toán")} aria-label="Xoá khoản thanh toán" title="Xoá khoản thanh toán">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {f.remaining !== null && f.remaining > 0 && (
                  <div className="grid gap-2 border-t border-border/50 pt-3 sm:grid-cols-[140px_160px_1fr_auto] sm:items-end">
                    <Field label="Số tiền (USD)">
                      <Input type="number" min={0} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={f.remaining.toFixed(2)} aria-label="Số tiền thanh toán" />
                    </Field>
                    <Field label="Ngày trả">
                      <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} aria-label="Ngày thanh toán" />
                    </Field>
                    <Field label="Ghi chú">
                      <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} maxLength={300} aria-label="Ghi chú thanh toán" />
                    </Field>
                    <div className="flex gap-1.5">
                      <Button type="button" variant="outline" onClick={() => setPayAmount(f.remaining!.toFixed(2))} disabled={busy !== null} title="Điền đúng số còn phải trả">Trả hết</Button>
                      <Button type="button" onClick={addPayment} disabled={busy !== null || !(Number(payAmount) > 0)}>
                        {busy === "pay" && <Loader2 className="h-4 w-4 animate-spin" />}
                        Ghi nhận
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Section>
        </div>
      </div>

      {/* Details, editable by hand */}
      <Section title="Thông tin thẻ (có thể chỉnh sửa)">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tên sản phẩm (Title)" className="sm:col-span-2 lg:col-span-3"><Input value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={300} /></Field>
          <Field label="Tên Pokémon / Vận động viên / Nhân vật"><Input value={draft.subject} onChange={(e) => set({ subject: e.target.value })} /></Field>
          <Field label="Set / Series"><Input value={draft.setName} onChange={(e) => set({ setName: e.target.value })} /></Field>
          <Field label="Năm phát hành"><Input value={draft.year} onChange={(e) => set({ year: e.target.value })} /></Field>
          <Field label="Card Number"><Input value={draft.cardNumber} onChange={(e) => set({ cardNumber: e.target.value })} /></Field>
          <Field label="Loại thẻ"><Input value={draft.cardType} onChange={(e) => set({ cardType: e.target.value })} /></Field>
          <Field label="Độ hiếm"><Input value={draft.rarity} onChange={(e) => set({ rarity: e.target.value })} /></Field>
          <Field label="Grading Company"><Input value={draft.gradingCompany} onChange={(e) => set({ gradingCompany: e.target.value })} /></Field>
          <Field label="Grade"><Input value={draft.grade} onChange={(e) => set({ grade: e.target.value })} /></Field>
          <Field label="Certification Number"><Input value={draft.certNumber} onChange={(e) => set({ certNumber: e.target.value })} /></Field>
          <Field label="Tình trạng sản phẩm"><Input value={draft.condition} onChange={(e) => set({ condition: e.target.value })} /></Field>
          <Field label="Seller"><Input value={draft.seller} onChange={(e) => set({ seller: e.target.value })} /></Field>
          <Field label={`Giá hiện tại (${item.currency})`}><Input type="number" min={0} step="0.01" value={draft.currentPrice} onChange={(e) => set({ currentPrice: e.target.value })} /></Field>
          <Field label="Số lượt đấu giá"><Input type="number" min={0} step={1} value={draft.bidCount} onChange={(e) => set({ bidCount: e.target.value })} /></Field>
          <Field label="Thời gian kết thúc"><Input type="datetime-local" value={draft.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></Field>
          <Field label="Link eBay" className="sm:col-span-2"><Input value={draft.ebayUrl} onChange={(e) => set({ ebayUrl: e.target.value })} placeholder="https://www.ebay.com/itm/…" /></Field>
          <Field label="Mô tả sản phẩm" className="sm:col-span-2 lg:col-span-3"><Textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} rows={4} maxLength={6000} /></Field>
          <Field label="Ghi chú" className="sm:col-span-2 lg:col-span-3"><Input value={draft.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} /></Field>
        </div>
        <div className="grid gap-3 rounded-xl border border-border/60 bg-background/30 p-3 sm:grid-cols-2">
          <Field label="Khách hàng (áp dụng cho cả đơn)"><Input value={draft.customerName} onChange={(e) => set({ customerName: e.target.value })} maxLength={120} /></Field>
          <Field label="Liên hệ"><Input value={draft.customerContact} onChange={(e) => set({ customerContact: e.target.value })} maxLength={160} /></Field>
        </div>
        <div className="flex items-center justify-end gap-2">
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Có thay đổi chưa lưu</span>}
          <Button type="button" variant="outline" onClick={() => setDraft(draftOf(item))} disabled={!dirty || busy !== null}>Hoàn tác</Button>
          <Button type="button" onClick={saveDetails} disabled={!dirty || busy !== null || !draft.title.trim()}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu thay đổi
          </Button>
        </div>
      </Section>

      <PageUpdateDialog
        item={item}
        open={pageOpen}
        onOpenChange={setPageOpen}
        busy={busy === "pageSync"}
        onApply={async (body) => {
          const json = await run("pageSync", () => api("PATCH", `/api/consignment/items/${item.id}`, body), "Đã cập nhật từ trang eBay");
          if (json) setPageOpen(false);
        }}
      />
    </div>
  );
}
