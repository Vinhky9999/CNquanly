"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Link2, Loader2, PenLine, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fromLocalInput, formatDateTime, STATUS_LABEL, toLocalInput } from "@/components/consignment/format";
import { ImageGallery } from "@/components/consignment/image-gallery";
import { filesToDataUrls } from "@/components/consignment/image-tools";
import { parseEbayUrl } from "@/lib/ebay/url";
import type { ConsignmentItemDTO, ListingStatus } from "@/lib/consignment/types";

interface Draft {
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
  currency: string;
  currentPrice: string;
  bidCount: string;
  endsAt: string; // datetime-local
  listingStatus: ListingStatus;
  endPrice: string;
}

const EMPTY: Draft = {
  title: "", subject: "", setName: "", year: "", cardNumber: "", cardType: "", rarity: "", gradingCompany: "", grade: "", certNumber: "",
  condition: "", description: "", notes: "", seller: "", currency: "USD", currentPrice: "", bidCount: "", endsAt: "", listingStatus: "ACTIVE", endPrice: "",
};

interface LookupListing {
  title: string;
  description: string | null;
  images: string[];
  seller: string | null;
  currency: string | null;
  currentPrice: number | null;
  bidCount: number | null;
  endsAt: string | null;
  ended: boolean;
  card: Record<"subject" | "setName" | "year" | "cardNumber" | "cardType" | "rarity" | "gradingCompany" | "grade" | "certNumber" | "condition", string | null>;
}

type LookupResponse =
  | { ok: true; itemId: string; marketplace: string; url: string; listing: LookupListing; warnings: string[] }
  | { ok: false; kind: string; error: string; itemId?: string; marketplace?: string; url?: string };

interface OrderOption {
  id: string;
  code: string;
  customerName: string;
  cards: number;
}

const NEW_ORDER = "__new";
const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function draftFrom(listing: LookupListing): Draft {
  return {
    ...EMPTY,
    title: listing.title,
    subject: s(listing.card.subject),
    setName: s(listing.card.setName),
    year: s(listing.card.year),
    cardNumber: s(listing.card.cardNumber),
    cardType: s(listing.card.cardType),
    rarity: s(listing.card.rarity),
    gradingCompany: s(listing.card.gradingCompany),
    grade: s(listing.card.grade),
    certNumber: s(listing.card.certNumber),
    condition: s(listing.card.condition),
    description: s(listing.description),
    seller: s(listing.seller),
    currency: listing.currency ?? "USD",
    currentPrice: s(listing.currentPrice),
    bidCount: s(listing.bidCount),
    endsAt: toLocalInput(listing.endsAt),
    listingStatus: listing.ended ? "ENDED" : "ACTIVE",
  };
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  // The label wraps the control, so clicking the text focuses it and screen readers announce it.
  return (
    <label className={className ? `block space-y-1.5 ${className}` : "block space-y-1.5"}>
      <span className="block text-xs font-medium leading-none">{label}</span>
      {children}
    </label>
  );
}

// "Thêm thẻ ký gửi": paste an eBay link, check the preview, confirm. Without a link (or when eBay cannot be read) the
// same form is filled by hand and photos are uploaded from the device. Nothing is saved before "Lưu ký gửi".
export function AddConsignmentDialog({ onCreated, ebayConfigured }: { onCreated?: (item: ConsignmentItemDTO) => void; ebayConfigured?: boolean | null }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"start" | "form">("start");

  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [orderCode, setOrderCode] = useState(NEW_ORDER);
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");

  const [url, setUrl] = useState("");
  const [looking, setLooking] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "warn" | "ok"; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ itemId: string; marketplace: string; url: string } | null>(null);
  const [fromEbay, setFromEbay] = useState(false);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [ebayImages, setEbayImages] = useState<string[]>([]);
  const [uploads, setUploads] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keepAdding, setKeepAdding] = useState(false);

  const set = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));

  const loadOrders = useCallback(() => {
    fetch("/api/consignment/orders")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setOrders(j.orders ?? []))
      .catch(() => {});
  }, []);

  const resetCard = useCallback(() => {
    setStage("start");
    setUrl("");
    setNotice(null);
    setWarnings([]);
    setMeta(null);
    setFromEbay(false);
    setDraft(EMPTY);
    setEbayImages([]);
    setUploads([]);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetCard();
    setOrderCode(NEW_ORDER);
    setCustomerName("");
    setCustomerContact("");
    setKeepAdding(false);
    loadOrders();
  }, [open, resetCard, loadOrders]);

  const chosenOrder = orders.find((o) => o.code === orderCode);

  async function lookup() {
    if (!url.trim()) {
      setNotice({ tone: "error", text: "Hãy dán link sản phẩm eBay." });
      return;
    }
    setLooking(true);
    setNotice(null);
    try {
      const res = await fetch("/api/consignment/ebay/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const json = (await res.json().catch(() => null)) as LookupResponse | null;
      if (!json) throw new Error("Không nhận được phản hồi.");
      if (!json.ok) {
        if (json.kind === "INVALID_URL") {
          setNotice({ tone: "error", text: json.error });
          return;
        }
        // eBay could not be read: keep the Item ID (so the card can be tracked later) and open the form to fill by hand.
        setMeta(json.itemId ? { itemId: json.itemId, marketplace: json.marketplace ?? "EBAY_US", url: json.url ?? url } : null);
        setFromEbay(false);
        setDraft(EMPTY);
        setEbayImages([]);
        setNotice({ tone: "warn", text: `${json.error} Bạn nhập tay thông tin và tải ảnh lên bên dưới.` });
        setStage("form");
        return;
      }
      setMeta({ itemId: json.itemId, marketplace: json.marketplace, url: json.url });
      setFromEbay(true);
      setDraft(draftFrom(json.listing));
      setEbayImages(json.listing.images);
      setWarnings(json.warnings);
      setNotice({ tone: "ok", text: `Đã lấy thông tin từ eBay (Item ID ${json.itemId}). Kiểm tra lại rồi bấm “Lưu ký gửi”.` });
      setStage("form");
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Không lấy được thông tin. Thử lại hoặc nhập tay." });
    } finally {
      setLooking(false);
    }
  }

  function startManual() {
    setMeta(null);
    setFromEbay(false);
    setDraft(EMPTY);
    setEbayImages([]);
    setNotice(null);
    setStage("form");
  }

  async function pickFiles(files: FileList) {
    setProcessing(true);
    try {
      const { urls, errors } = await filesToDataUrls(files);
      errors.forEach((e) => toast.error(e));
      if (urls.length) setUploads((prev) => [...prev, ...urls].slice(0, 12 - ebayImages.length));
    } finally {
      setProcessing(false);
    }
  }

  async function save() {
    if (!draft.title.trim()) {
      toast.error("Nhập tên sản phẩm.");
      return;
    }
    if (orderCode === NEW_ORDER && !customerName.trim()) {
      toast.error("Nhập tên khách hàng (hoặc chọn một đơn ký gửi có sẵn).");
      return;
    }
    if (draft.listingStatus === "SOLD" && !(Number(draft.endPrice) > 0)) {
      toast.error("Đã bán thì phải nhập giá End.");
      return;
    }
    setSaving(true);
    try {
      // A link that is not a valid eBay link is left out (hand entry), a valid one is kept so the card can be tracked later.
      const typed = url.trim() ? parseEbayUrl(url) : null;
      const linkToSave = meta?.url ?? (typed?.ok ? typed.value.url : null);
      const body = {
        orderCode: orderCode === NEW_ORDER ? null : orderCode,
        customerName: orderCode === NEW_ORDER ? customerName : null,
        customerContact: orderCode === NEW_ORDER ? customerContact : null,
        ebayUrl: linkToSave,
        ebayMarketplace: meta?.marketplace ?? (typed?.ok ? typed.value.marketplace : null),
        dataSource: fromEbay ? "EBAY_API" : "MANUAL",
        title: draft.title,
        subject: draft.subject, setName: draft.setName, year: draft.year, cardNumber: draft.cardNumber, cardType: draft.cardType, rarity: draft.rarity,
        gradingCompany: draft.gradingCompany, grade: draft.grade, certNumber: draft.certNumber, condition: draft.condition,
        description: draft.description, notes: draft.notes, seller: draft.seller, currency: draft.currency || "USD",
        currentPrice: draft.currentPrice, bidCount: draft.bidCount, endsAt: fromLocalInput(draft.endsAt),
        listingStatus: draft.listingStatus, endPrice: draft.listingStatus === "SOLD" ? draft.endPrice : null,
        imageUrls: ebayImages, uploads,
      };
      const res = await fetch("/api/consignment/items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Không lưu được thẻ ký gửi.");
      const item = json.item as ConsignmentItemDTO;
      toast.success(`Đã lưu ${item.code}`);
      onCreated?.(item);
      if (keepAdding) {
        // Next card of the same customer: stay in the same order.
        resetCard();
        setOrderCode(item.order.code);
        loadOrders();
      } else {
        setOpen(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được thẻ ký gửi.");
    } finally {
      setSaving(false);
    }
  }

  const galleryImages = [
    ...ebayImages.map((src, i) => ({ id: `e${i}`, src, label: "Ảnh eBay" })),
    ...uploads.map((src, i) => ({ id: `u${i}`, src, label: "Ảnh tải lên" })),
  ];
  const removeImage = (id: string) => {
    const n = Number(id.slice(1));
    if (id.startsWith("e")) setEbayImages((prev) => prev.filter((_, i) => i !== n));
    else setUploads((prev) => prev.filter((_, i) => i !== n));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10 rounded-xl bg-brand-gradient px-4 text-white shadow-md shadow-primary/25 hover:opacity-95">
          <Plus className="h-4 w-4" />
          Thêm thẻ ký gửi
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Thêm thẻ ký gửi</DialogTitle>
          <DialogDescription>Dán link eBay để hệ thống tự lấy ảnh và thông tin. Không có link hoặc eBay không đọc được thì nhập tay và tải ảnh lên.</DialogDescription>
        </DialogHeader>

        {/* Customer / order */}
        <section className="grid gap-3 rounded-2xl border border-border/60 bg-card/40 p-3 sm:grid-cols-3" aria-label="Khách hàng và đơn ký gửi">
          <Field label="Đơn ký gửi">
            <Select value={orderCode} onValueChange={setOrderCode}>
              <SelectTrigger aria-label="Chọn đơn ký gửi">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_ORDER}>Đơn mới (khách mới hoặc khách cũ)</SelectItem>
                {orders.map((o) => (
                  <SelectItem key={o.id} value={o.code}>
                    {o.code} · {o.customerName} ({o.cards} thẻ)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {orderCode === NEW_ORDER ? (
            <>
              <Field label="Tên khách hàng">
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nguyễn Văn A" maxLength={120} />
              </Field>
              <Field label="Liên hệ (SĐT / Zalo / FB)">
                <Input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} maxLength={160} />
              </Field>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
              <Info className="h-4 w-4 shrink-0" />
              Thẻ mới sẽ thêm vào đơn <span className="font-semibold text-foreground">{chosenOrder?.code}</span> của khách <span className="font-semibold text-foreground">{chosenOrder?.customerName}</span>, có mã riêng.
            </p>
          )}
        </section>

        {/* eBay link */}
        <section className="space-y-2" aria-label="Link eBay">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="flex items-center gap-1.5 text-xs">
              <Link2 className="h-3.5 w-3.5" />
              Link sản phẩm eBay (Auction)
            </Label>
            {ebayConfigured === false && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">Chưa cấu hình eBay API: chỉ nhập tay được (xem DEPLOYMENT.md)</span>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lookup();
                }
              }}
              placeholder="https://www.ebay.com/itm/123456789012"
              aria-label="Link eBay"
              className="flex-1"
            />
            <Button type="button" onClick={lookup} disabled={looking} className="shrink-0">
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Lấy thông tin
            </Button>
            {stage === "start" && (
              <Button type="button" variant="outline" onClick={startManual} className="shrink-0">
                <PenLine className="h-4 w-4" />
                Nhập tay
              </Button>
            )}
          </div>
          {notice && (
            <p
              role="status"
              className={
                notice.tone === "ok"
                  ? "flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
                  : notice.tone === "warn"
                    ? "flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
                    : "flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
              }
            >
              {notice.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{notice.text}</span>
            </p>
          )}
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </p>
          ))}
        </section>

        {stage === "form" && (
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hình ảnh ({galleryImages.length})</p>
              <ImageGallery images={galleryImages} alt={draft.title || "Ảnh thẻ"} onDelete={removeImage} onPickFiles={pickFiles} busy={processing} />
              <p className="text-[11px] text-muted-foreground">{fromEbay ? "Ảnh eBay được lưu thêm một bản vào hồ sơ. " : ""}Ảnh tải lên được thu nhỏ trước khi lưu.</p>
            </div>

            <div className="space-y-4">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={fromEbay ? "rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400" : "rounded bg-slate-500/15 px-1.5 py-0.5 font-semibold"}>
                  {fromEbay ? "Lấy từ eBay API" : "Nhập tay"}
                </span>
                {meta && <span>Item ID {meta.itemId}</span>}
              </p>

              <Field label="Tên sản phẩm (Title)">
                <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={300} required />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tên Pokémon / Vận động viên / Nhân vật"><Input value={draft.subject} onChange={(e) => set({ subject: e.target.value })} /></Field>
                <Field label="Set / Series"><Input value={draft.setName} onChange={(e) => set({ setName: e.target.value })} /></Field>
                <Field label="Năm phát hành"><Input value={draft.year} onChange={(e) => set({ year: e.target.value })} /></Field>
                <Field label="Card Number"><Input value={draft.cardNumber} onChange={(e) => set({ cardNumber: e.target.value })} /></Field>
                <Field label="Loại thẻ"><Input value={draft.cardType} onChange={(e) => set({ cardType: e.target.value })} /></Field>
                <Field label="Độ hiếm"><Input value={draft.rarity} onChange={(e) => set({ rarity: e.target.value })} /></Field>
                <Field label="Grading Company (PSA, BGS, CGC…)"><Input value={draft.gradingCompany} onChange={(e) => set({ gradingCompany: e.target.value })} /></Field>
                <Field label="Grade"><Input value={draft.grade} onChange={(e) => set({ grade: e.target.value })} /></Field>
                <Field label="Certification Number"><Input value={draft.certNumber} onChange={(e) => set({ certNumber: e.target.value })} /></Field>
                <Field label="Tình trạng sản phẩm"><Input value={draft.condition} onChange={(e) => set({ condition: e.target.value })} /></Field>
              </div>

              <div className="grid gap-3 rounded-2xl border border-border/60 bg-card/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Trạng thái đấu giá">
                  <Select value={draft.listingStatus} onValueChange={(v) => set({ listingStatus: v as ListingStatus })}>
                    <SelectTrigger aria-label="Trạng thái đấu giá"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABEL) as ListingStatus[]).map((k) => (
                        <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={`Giá hiện tại (${draft.currency || "USD"})`}>
                  <Input type="number" min={0} step="0.01" value={draft.currentPrice} onChange={(e) => set({ currentPrice: e.target.value })} />
                </Field>
                <Field label="Số lượt đấu giá">
                  <Input type="number" min={0} step={1} value={draft.bidCount} onChange={(e) => set({ bidCount: e.target.value })} />
                </Field>
                <Field label="Thời gian kết thúc">
                  <Input type="datetime-local" value={draft.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
                </Field>
                <Field label="Seller"><Input value={draft.seller} onChange={(e) => set({ seller: e.target.value })} /></Field>
                {draft.listingStatus === "SOLD" && (
                  <Field label="Giá End (USD)">
                    <Input type="number" min={0} step="0.01" value={draft.endPrice} onChange={(e) => set({ endPrice: e.target.value })} required />
                  </Field>
                )}
              </div>
              {draft.endsAt && <p className="text-[11px] text-muted-foreground">Kết thúc lúc {formatDateTime(fromLocalInput(draft.endsAt))} (giờ Việt Nam).</p>}

              <Field label="Mô tả sản phẩm">
                <Textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} rows={3} maxLength={6000} />
              </Field>
              <Field label="Ghi chú">
                <Input value={draft.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} />
              </Field>

              <div className="flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={keepAdding} onChange={(e) => setKeepAdding(e.target.checked)} className="h-4 w-4 accent-primary" />
                  Lưu xong thêm thẻ khác vào cùng đơn
                </label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                    <X className="h-4 w-4" />
                    Huỷ
                  </Button>
                  <Button type="button" onClick={save} disabled={saving || processing}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Lưu ký gửi
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
