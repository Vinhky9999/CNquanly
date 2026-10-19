"use client";

import Link from "next/link";
import { BadgeCheck, History, Landmark, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversationProfile } from "@/components/messages/crm-tab";
import { cn, formatDate, formatVND } from "@/lib/utils";

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "success" | "primary" | "warning" }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/70 bg-input/60 px-3 py-2.5">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-sm font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "primary" && "text-accent-foreground",
          tone === "warning" && "text-warning"
        )}
      >
        {value}
      </p>
      {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// "Lịch sử / Đơn hàng": every order and grading job of the customer with its real payment state, so the owner can
// check who has paid without leaving the chat.
export function OrderHistoryTab({
  profile,
  loading,
  onConfirmPayment,
}: {
  profile: ConversationProfile | null;
  loading: boolean;
  onConfirmPayment: () => void;
}) {
  if (loading && !profile) {
    return (
      <div className="space-y-3 p-3" aria-busy="true">
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <History className="h-8 w-8 opacity-40" />
        Chọn một hội thoại để xem lịch sử đơn hàng và thanh toán.
      </div>
    );
  }

  const { stats, history } = profile;
  const linked = Boolean(profile.customer);

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Tổng chi tiêu" value={linked ? formatVND(stats.totalSpent) : "—"} tone="success" />
        <Metric label="Số đơn mua" value={linked ? String(stats.orderCount) : "—"} tone="primary" />
        <Metric label="Đã thanh toán" value={linked ? formatVND(stats.paidTotal) : "—"} hint="Tiền đã vào Dòng tiền" />
        <Metric
          label="Thu lần cuối"
          value={stats.lastPaymentAt ? formatDate(stats.lastPaymentAt) : "—"}
          hint={stats.gradingOwed > 0 ? `Chưa thu chấm điểm: ${formatVND(stats.gradingOwed)}` : undefined}
          tone={stats.gradingOwed > 0 ? "warning" : undefined}
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={onConfirmPayment}
          className="h-10 flex-1 rounded-xl bg-brand-gradient text-white shadow-md shadow-primary/25 hover:opacity-95"
        >
          <BadgeCheck className="h-4 w-4" />
          Xác nhận thanh toán
        </Button>
        <Button asChild type="button" variant="outline" className="h-10 rounded-xl border-border/80 bg-input hover:bg-accent/40">
          <Link href="/cash-flow" title="Mở Dòng tiền">
            <Landmark className="h-4 w-4" />
            Dòng tiền
          </Link>
        </Button>
      </div>

      {!linked && (
        <p className="rounded-xl border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground">
          Hội thoại chưa liên kết khách hàng. Khi xác nhận thanh toán, hệ thống sẽ tạo hồ sơ khách và liên kết giúp bạn.
        </p>
      )}

      {history.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
          Chưa có đơn hàng hay khoản thanh toán nào của khách này.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Lịch sử đơn hàng và thanh toán">
          {history.map((h) => (
            <li key={`${h.kind}-${h.id}`} className="rounded-2xl border border-border/70 bg-input/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[13px] font-medium leading-snug">{h.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    <span className="font-mono">{h.code}</span> · {formatDate(h.date)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{formatVND(h.total)}</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <Badge variant={h.paid ? "success" : h.kind === "GRADING" ? "warning" : "slate"}>{h.paymentLabel}</Badge>
                {h.method && <Badge variant="secondary">{h.method}</Badge>}
                {h.fromChat && <Badge variant="indigo">{h.auto ? "Tự động từ Messenger" : "Chốt qua Page"}</Badge>}
                {h.kind === "GRADING" && <Badge variant="indigo">Chấm điểm</Badge>}
                {h.delivery && (
                  <Badge variant="slate" className="gap-1">
                    <Truck className="h-3 w-3" />
                    {h.tracking ? h.tracking : "Giao hàng · chưa có mã vận đơn"}
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
