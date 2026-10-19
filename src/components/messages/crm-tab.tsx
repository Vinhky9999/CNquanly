"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ChevronDown, Link2, Link2Off, PackageOpen, Truck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CONVERSATION_LABELS, GRADING_BADGE, labelOf } from "@/lib/messenger-labels";
import { cn, formatDate, formatVND } from "@/lib/utils";
import { updateConversationAction } from "@/server/actions/messenger";

export interface ConversationProfile {
  conversation: {
    id: string;
    psid: string;
    customerName: string;
    profilePic: string | null;
    label: string | null;
    notes: string;
    customerId: string | null;
  };
  customer: { id: string; name: string; phone: string | null } | null;
  stats: {
    totalSpent: number;
    orderCount: number;
    gradingActiveCards: number;
    gradingOrders: number;
    paidTotal: number;
    lastPaymentAt: string | null;
    gradingOwed: number;
  };
  recentOrders: {
    id: string;
    code: string;
    date: string;
    total: number;
    summary: string;
    delivery: boolean;
    image: string | null;
    paid: boolean;
    fromChat: boolean;
  }[];
  history: {
    id: string;
    kind: "ORDER" | "GRADING";
    code: string;
    date: string;
    title: string;
    total: number;
    paid: boolean;
    paymentLabel: string;
    method: string | null;
    fromChat: boolean;
    auto: boolean;
    delivery: boolean;
    tracking: string | null;
  }[];
  shipment: { trackingCode: string | null; carrier: string | null } | null;
  interests: string[];
}

const NONE = "NONE";
const HEADING = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

interface CustomerHit {
  id: string;
  name: string;
  phone: string | null;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" | "primary" }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/70 bg-input/60 px-2 py-2.5">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 whitespace-nowrap text-[13px] font-semibold tabular-nums",
          tone === "emerald" && "text-success",
          tone === "amber" && "text-amber-400",
          tone === "primary" && "text-accent-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

// Collapsible card, like the "User Analytics" rows of the reference design.
function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-border/70 bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-2xl px-3.5 py-3 text-left transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={HEADING}>{title}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-2.5 px-3.5 pb-3.5">{children}</div>}
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-3 p-3" aria-busy="true">
      <Skeleton className="h-44 rounded-3xl" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-14 rounded-2xl" />
      </div>
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
    </div>
  );
}

export function CrmTab({
  profile,
  loading,
  onChanged,
  onConfirmPayment,
  onOpenHistory,
}: {
  profile: ConversationProfile | null;
  loading: boolean;
  onChanged: () => void;
  onConfirmPayment: () => void;
  onOpenHistory: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [linkQuery, setLinkQuery] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [suggestions, setSuggestions] = useState<CustomerHit[]>([]);

  const conversationId = profile?.conversation.id;
  const linked = Boolean(profile?.customer);

  useEffect(() => {
    setNotes(profile?.conversation.notes ?? "");
    setSavedNotes(profile?.conversation.notes ?? "");
    setLinkQuery("");
    setHits([]);
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchCustomers = (term: string, set: (rows: CustomerHit[]) => void) =>
    fetch(`/api/customers?search=${encodeURIComponent(term)}&pageSize=5`)
      .then((r) => r.json())
      .then((j) => set((j.rows ?? []).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone ?? null }))))
      .catch(() => set([]));

  // Suggest customers with the same name as the Facebook profile while nothing is linked yet.
  useEffect(() => {
    if (!profile || linked) return setSuggestions([]);
    searchCustomers(profile.conversation.customerName, setSuggestions);
  }, [conversationId, linked]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = linkQuery.trim();
    if (term.length < 2) return setHits([]);
    const timer = setTimeout(() => searchCustomers(term, setHits), 250);
    return () => clearTimeout(timer);
  }, [linkQuery]);

  if (loading && !profile) return <ProfileSkeleton />;
  if (!profile) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <PackageOpen className="h-8 w-8 opacity-40" />
        Chọn một hội thoại để xem hồ sơ khách hàng.
      </div>
    );
  }

  async function patch(change: Parameters<typeof updateConversationAction>[1], success?: string) {
    const result = await updateConversationAction(profile!.conversation.id, change);
    if (result.error) return toast.error(result.error);
    if (success) toast.success(success);
    onChanged();
  }

  const c = profile.conversation;
  const label = labelOf(c.label);
  const candidates = linkQuery.trim().length >= 2 ? hits : suggestions;

  return (
    <div className="space-y-3 p-3">
      {/* Profile card (gradient, like the reference) */}
      <div className="overflow-hidden rounded-3xl bg-brand-gradient p-4 text-white shadow-lg shadow-primary/20">
        <div className="flex flex-col items-center text-center">
          {c.profilePic ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.profilePic} alt="" className="h-16 w-16 rounded-full object-cover ring-4 ring-white/25" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-2xl font-semibold ring-4 ring-white/25">
              {c.customerName.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="mt-2.5 max-w-full truncate text-base font-semibold">{c.customerName}</p>
          <p className="max-w-full truncate text-[11px] text-white/75">Facebook ID: {c.psid}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            {label && (
              <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold">
                {label.emoji} {label.label}
              </span>
            )}
            {profile.stats.orderCount > 0 && (
              <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold">Đã mua {profile.stats.orderCount} lần</span>
            )}
            {profile.stats.gradingOrders > 0 && (
              <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold">
                {GRADING_BADGE.emoji} {GRADING_BADGE.label}
              </span>
            )}
          </div>
        </div>
        {profile.interests.length > 0 && (
          <div className="mt-3 border-t border-white/20 pt-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">Thẻ / sản phẩm quan tâm</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.interests.map((tag) => (
                <span key={tag} className="max-w-full truncate rounded-md border border-white/25 bg-white/15 px-2 py-0.5 text-[11px]">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Classification */}
      <div className="space-y-1.5 rounded-2xl border border-border/70 bg-background/40 p-3.5">
        <p className={HEADING}>Phân loại khách</p>
        <Select value={c.label ?? NONE} onValueChange={(v) => patch({ label: v === NONE ? null : v }, "Đã đổi nhãn")}>
          <SelectTrigger className="h-10 rounded-xl bg-input" aria-label="Phân loại khách">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Chưa phân loại</SelectItem>
            {CONVERSATION_LABELS.map((l) => (
              <SelectItem key={l.key} value={l.key}>
                {l.emoji} {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Tổng chi tiêu" value={linked ? formatVND(profile.stats.totalSpent) : "—"} tone="emerald" />
        <Stat label="Số đơn mua" value={linked ? String(profile.stats.orderCount) : "—"} tone="primary" />
        <Stat label="Thẻ gửi chấm" value={String(profile.stats.gradingActiveCards)} tone="amber" />
      </div>

      <Button
        type="button"
        onClick={onConfirmPayment}
        className="h-10 w-full rounded-xl bg-brand-gradient text-white shadow-md shadow-primary/25 hover:opacity-95"
      >
        <BadgeCheck className="h-4 w-4" />
        Xác nhận thanh toán / Chốt đơn
      </Button>

      <Section title="Khách hàng trong hệ thống">
        {profile.customer ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{profile.customer.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{profile.customer.phone ?? "Chưa có SĐT"}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 rounded-lg text-xs text-muted-foreground"
              onClick={() => patch({ customerId: null }, "Đã bỏ liên kết")}
            >
              <Link2Off className="h-3.5 w-3.5" />
              Bỏ liên kết
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Liên kết để xem chi tiêu và đơn hàng của khách này.</p>
            <Input
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
              placeholder="Tìm tên / SĐT khách..."
              aria-label="Tìm khách hàng để liên kết"
              className="h-9 rounded-xl text-xs"
            />
            {candidates.length > 0 && (
              <ul className="space-y-1">
                {candidates.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => patch({ customerId: h.id }, `Đã liên kết với ${h.name}`)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/70 px-2.5 py-2 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="truncate font-medium">{h.name}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
                        {h.phone ?? ""}
                        <Link2 className="h-3 w-3" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <Section title="Ghi chú riêng">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== savedNotes) {
              setSavedNotes(notes);
              patch({ notes }, "Đã lưu ghi chú");
            }
          }}
          rows={3}
          placeholder="VD: Khách hay mua Pokémon 151, ưu tiên rep nhanh"
          aria-label="Ghi chú riêng"
          className="thin-scroll max-h-40 resize-none rounded-xl bg-input text-sm"
        />
        <p className="text-[10px] text-muted-foreground">Chỉ chủ shop thấy — tự lưu khi bạn bấm ra ngoài ô.</p>
      </Section>

      <Section title="Đơn hàng gần đây">
        {!linked ? (
          <p className="rounded-xl border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground">
            Chưa liên kết khách hàng nên chưa có đơn hàng để hiển thị.
          </p>
        ) : profile.recentOrders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground">
            Khách này chưa có đơn mua.
          </p>
        ) : (
          <ul className="space-y-2">
            {profile.recentOrders.map((o) => (
              <li key={o.id} className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-input/40 p-2">
                {o.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.image} alt="" className="h-11 w-8 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-11 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-[8px] text-muted-foreground">
                    No img
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{o.summary}</p>
                  <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="font-mono">{o.code}</span>·{formatDate(o.date)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold tabular-nums">{formatVND(o.total)}</p>
                  <div className="mt-0.5 flex justify-end gap-1">
                    <Badge variant={o.paid ? "success" : "slate"} className="px-1 py-0 text-[9px]">
                      {o.paid ? "Đã thanh toán" : "Không thu tiền"}
                    </Badge>
                    <Badge variant={o.delivery ? "indigo" : "secondary"} className="gap-1 px-1 py-0 text-[9px]">
                      {o.delivery && <Truck className="h-2.5 w-2.5" />}
                      {o.delivery ? "Giao hàng" : o.fromChat ? "Qua Page" : "Trực tiếp"}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {linked && profile.history.length > profile.recentOrders.length && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="w-full rounded-lg py-1 text-center text-[11px] font-medium text-accent-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Xem toàn bộ lịch sử ({profile.history.length})
          </button>
        )}
        {profile.shipment?.trackingCode && (
          <p className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
            Vận đơn gần nhất: <span className="font-medium text-foreground">{profile.shipment.trackingCode}</span>
            {profile.shipment.carrier ? ` · ${profile.shipment.carrier}` : ""}
          </p>
        )}
      </Section>
    </div>
  );
}
