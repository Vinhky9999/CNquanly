"use client";

import { useEffect, useState } from "react";
import { Link2, Link2Off, Truck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CONVERSATION_LABELS, GRADING_BADGE } from "@/lib/messenger-labels";
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
  stats: { totalSpent: number; orderCount: number; gradingActiveCards: number; gradingOrders: number };
  recentOrders: { id: string; date: string; total: number; summary: string; delivery: boolean }[];
  shipment: { trackingCode: string | null; carrier: string | null } | null;
}

const NONE = "NONE";
const SECTION = "space-y-2 rounded-xl border border-border/60 p-3 dark:border-slate-800/80";
const HEADING = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

interface CustomerHit {
  id: string;
  name: string;
  phone: string | null;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-2.5 py-2 dark:border-slate-800/80 dark:bg-slate-800/40">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-sm font-semibold tabular-nums",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function CrmTab({ profile, onChanged }: { profile: ConversationProfile | null; onChanged: () => void }) {
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

  if (!profile) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Chọn một hội thoại để xem hồ sơ khách hàng.</p>;
  }

  async function patch(change: Parameters<typeof updateConversationAction>[1], success?: string) {
    const result = await updateConversationAction(profile!.conversation.id, change);
    if (result.error) return toast.error(result.error);
    if (success) toast.success(success);
    onChanged();
  }

  const c = profile.conversation;
  const label = CONVERSATION_LABELS.find((l) => l.key === c.label);
  const candidates = linkQuery.trim().length >= 2 ? hits : suggestions;

  return (
    <div className="space-y-3 p-3">
      {/* Identity */}
      <div className="flex items-center gap-3">
        {c.profilePic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.profilePic} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-lg font-semibold text-indigo-600 dark:text-indigo-300">
            {c.customerName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight">{c.customerName}</p>
          <p className="truncate text-[11px] text-muted-foreground">Facebook ID: {c.psid}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {label && (
              <Badge variant={label.variant}>
                {label.emoji} {label.label}
              </Badge>
            )}
            {profile.stats.gradingOrders > 0 && (
              <Badge variant="indigo">
                {GRADING_BADGE.emoji} {GRADING_BADGE.label}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className={HEADING}>Phân loại khách</p>
        <Select value={c.label ?? NONE} onValueChange={(v) => patch({ label: v === NONE ? null : v }, "Đã đổi nhãn")}>
          <SelectTrigger className="h-9">
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Tổng chi tiêu" value={linked ? formatVND(profile.stats.totalSpent) : "—"} tone="emerald" />
        <Stat label="Số đơn mua" value={linked ? String(profile.stats.orderCount) : "—"} />
        <Stat label="Thẻ gửi chấm" value={String(profile.stats.gradingActiveCards)} tone="amber" />
      </div>

      {/* Customer link */}
      <div className={SECTION}>
        <p className={HEADING}>Khách hàng trong hệ thống</p>
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
              className="h-8 shrink-0 text-xs text-muted-foreground"
              onClick={() => patch({ customerId: null }, "Đã bỏ liên kết")}
            >
              <Link2Off className="h-3.5 w-3.5" />
              Bỏ liên kết
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Liên kết để xem chi tiêu và đơn hàng của khách này.</p>
            <Input value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} placeholder="Tìm tên / SĐT khách..." className="h-8 text-xs" />
            {candidates.length > 0 && (
              <ul className="space-y-1">
                {candidates.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => patch({ customerId: h.id }, `Đã liên kết với ${h.name}`)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent dark:border-slate-800/80"
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
      </div>

      {/* Private notes */}
      <div className={SECTION}>
        <p className={HEADING}>Ghi chú riêng</p>
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
          className="thin-scroll resize-none text-sm"
        />
        <p className="text-[10px] text-muted-foreground">Chỉ chủ shop thấy — tự lưu khi bạn bấm ra ngoài ô.</p>
      </div>

      {/* Recent orders */}
      <div className={SECTION}>
        <p className={HEADING}>Đơn hàng gần đây</p>
        {!linked ? (
          <p className="text-xs text-muted-foreground">Chưa liên kết khách hàng.</p>
        ) : profile.recentOrders.length === 0 ? (
          <p className="text-xs text-muted-foreground">Khách này chưa có đơn mua.</p>
        ) : (
          <ul className="space-y-1.5">
            {profile.recentOrders.map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.summary}</p>
                  <p className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    {formatDate(o.date)}
                    {o.delivery && <Truck className="h-3 w-3" />}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{formatVND(o.total)}</span>
              </li>
            ))}
          </ul>
        )}
        {profile.shipment?.trackingCode && (
          <p className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground dark:border-slate-800/80">
            Vận đơn gần nhất: <span className="font-medium text-foreground">{profile.shipment.trackingCode}</span>
            {profile.shipment.carrier ? ` · ${profile.shipment.carrier}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
