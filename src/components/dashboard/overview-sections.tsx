import Link from "next/link";
import {
  AlertCircle,
  Award,
  Coins,
  Gem,
  HandCoins,
  Hourglass,
  Layers,
  MessageCircle,
  Package,
  Percent,
  Plane,
  Users,
  Wallet,
} from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SLOW_MOVING_DAYS, type DashboardData } from "@/lib/dashboard";
import { labelOf } from "@/lib/messenger-labels";
import { cn, formatDate, formatVND, LUXURY_CARD_CLASS } from "@/lib/utils";

const CARD = "dark:border-indigo-500/30 dark:bg-slate-900/50 dark:backdrop-blur-md";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>;
}

/** Row 1: capital, US market value, unrealized P/L, cash, debts, total portfolio. */
export function FinanceCards({ data }: { data: DashboardData }) {
  const { valuation: v, portfolio, debts } = data;
  const hasPrices = v.pricedSkus > 0;
  const up = v.unrealized >= 0;
  const netDebt = debts.totalOwedToShop - debts.totalOwedByShop;

  return (
    <section aria-label="Chỉ số tài chính và kho hàng" className="space-y-3">
      <SectionTitle>Tài Chính & Kho Hàng</SectionTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Tổng Giá Trị Kho (WACC)"
          value={v.capital}
          icon={Package}
          className={CARD}
          subtitle={`${v.totalSkus} SKU · giá vốn bình quân`}
        />
        <StatCard
          title="Giá Trị Thị Trường (US Market)"
          value={v.marketValue}
          icon={Gem}
          className={CARD}
          subtitle={hasPrices ? `${v.pricedSkus}/${v.totalSkus} SKU đã có giá TCGplayer US` : "Chưa SKU nào có giá thị trường"}
        />
        <StatCard
          title="Lãi / Lỗ Tạm Tính"
          value={hasPrices ? v.unrealized : 0}
          icon={Percent}
          tone={!hasPrices ? "default" : up ? "positive" : "negative"}
          className={CARD}
          subtitle={
            hasPrices
              ? `${up ? "+" : ""}${v.unrealizedPct.toFixed(1)}% so với vốn của các SKU đã có giá`
              : "Cần giá thị trường để tính"
          }
        />
        <StatCard
          title="Số Dư Dòng Tiền Thực Tế"
          value={portfolio.liquidCash}
          icon={Wallet}
          tone={portfolio.liquidCash >= 0 ? "positive" : "negative"}
          className={CARD}
          subtitle="Số dư quỹ sau giao dịch gần nhất"
        />
        <StatCard
          title="Tổng Công Nợ Chưa Thanh Toán"
          value={debts.totalOwedByShop + debts.totalOwedToShop}
          icon={HandCoins}
          tone="warning"
          className={CARD}
          subtitle={`Phải trả ${formatVND(debts.totalOwedByShop)} · Phải thu ${formatVND(debts.totalOwedToShop)} · ${debts.unpaidCount} khoản`}
        />
        <StatCard
          title="Tổng Giá Trị Danh Mục"
          value={portfolio.totalPortfolioValue}
          icon={Layers}
          className={CARD}
          subtitle={`Tiền mặt + vốn tồn kho${netDebt !== 0 ? ` · công nợ ròng ${netDebt > 0 ? "+" : ""}${formatVND(netDebt)}` : ""}`}
        />
      </div>
    </section>
  );
}

/** Row 2: customers, Page chat workload, VIP / potential, grading pipeline. */
export function CrmCards({ data }: { data: DashboardData }) {
  const { crm, grading } = data;
  const inPipeline = grading.pendingSend.cards + grading.atGrader.cards + grading.shippingBack.cards;

  return (
    <section aria-label="Chỉ số khách hàng và CRM" className="space-y-3">
      <SectionTitle>Khách Hàng & CRM</SectionTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Tổng Số Khách Hàng"
          value={crm.customers}
          format="number"
          icon={Users}
          className={CARD}
          subtitle={`${crm.conversations} hội thoại trên Page`}
        />
        <StatCard
          title="Hội Thoại Cần Xử Lý"
          value={crm.needsAttention}
          format="number"
          icon={MessageCircle}
          tone="warning"
          className={CARD}
          subtitle={`${crm.unreadConversations} chưa đọc · ${crm.waitingReply} chờ shop trả lời`}
        />
        <StatCard
          title="Khách VIP"
          value={crm.vip}
          format="number"
          icon={Gem}
          tone="positive"
          className={CARD}
          subtitle={`${crm.potential} khách tiềm năng ⚡`}
        />
        <StatCard
          title="Thẻ Đang Chấm Điểm"
          value={inPipeline}
          format="number"
          icon={Award}
          className={CARD}
          subtitle={`Chờ gửi ${grading.pendingSend.orders} đơn · tại hãng ${grading.atGrader.orders} · đang về ${grading.shippingBack.orders}`}
        />
      </div>
    </section>
  );
}

/** Capital vs US market value per game, as paired bars. */
export function GameValuePanel({ games }: { games: DashboardData["games"] }) {
  const max = Math.max(1, ...games.map((g) => Math.max(g.totalValue, g.marketValue)));

  return (
    <Card className={cn(LUXURY_CARD_CLASS, "h-full")}>
      <CardHeader>
        <CardTitle>Giá Trị Kho Theo Dòng Game</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {games.length === 0 && <p className="text-sm text-muted-foreground">Chưa có sản phẩm trong kho.</p>}
        {games.slice(0, 6).map((g) => (
          <div key={g.game} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{g.game}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{g.skuCount} SKU</span>
            </div>
            <div className="space-y-1">
              <Bar label="Vốn" value={g.totalValue} max={max} tone="bg-indigo-500" />
              <Bar label="TT US" value={g.marketValue} max={max} tone="bg-emerald-500" empty={g.pricedSkuCount === 0} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Bar({ label, value, max, tone, empty }: { label: string; value: number; max: number; tone: string; empty?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-9 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted dark:bg-slate-800">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(empty ? 0 : 2, (value / max) * 100)}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right tabular-nums">{empty ? "—" : formatVND(value)}</span>
    </div>
  );
}

function PanelCard({
  title,
  icon: Icon,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  icon: typeof AlertCircle;
  href: string;
  hrefLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(LUXURY_CARD_CLASS, "flex h-full flex-col")}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-amber-500" />
          {title}
        </CardTitle>
        <Link href={href} className="text-xs font-medium text-indigo-500 hover:underline dark:text-indigo-400">
          {hrefLabel}
        </Link>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">{children}</CardContent>
    </Card>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>
);

const ROW = "flex items-start justify-between gap-3 rounded-xl border border-border/60 px-3 py-2 text-sm dark:border-slate-800/80";

/** Quick tables: open debts, customers waiting for the shop, slow-moving stock. */
export function AttentionPanels({ data }: { data: DashboardData }) {
  const { debts, chats, slow, slowTotal } = data.attention;

  return (
    <section aria-label="Cần chú ý" className="space-y-3">
      <SectionTitle>Cần Chú Ý Hôm Nay</SectionTitle>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PanelCard title="Công Nợ Chưa Thanh Toán" icon={Coins} href="/cash-flow" hrefLabel="Sổ công nợ →">
          {debts.length === 0 && <Empty>Không có khoản nợ nào đang mở.</Empty>}
          {debts.map((d) => (
            <div key={d.id} className={ROW}>
              <div className="min-w-0">
                <p className="truncate font-medium">{d.personName}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {d.referenceLabel ? `${d.referenceLabel} · ` : ""}
                  {d.ageDays} ngày trước
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums">{formatVND(d.remaining)}</p>
                <Badge variant={d.type === "ADVANCED_BY_PERSON" ? "rose" : "indigo"}>
                  {d.type === "ADVANCED_BY_PERSON" ? "Phải trả" : "Phải thu"}
                </Badge>
              </div>
            </div>
          ))}
          {debts.length > 0 && (
            <p className="pt-1 text-[11px] text-muted-foreground">Sắp theo khoản cũ nhất (khoản nợ chưa có ngày hết hạn).</p>
          )}
        </PanelCard>

        <PanelCard title="Khách Cần Chăm Sóc" icon={MessageCircle} href="/messages" hrefLabel="Mở Page →">
          {chats.length === 0 && <Empty>Đã trả lời hết khách. 🎉</Empty>}
          {chats.map((c) => {
            const label = labelOf(c.label);
            return (
              <Link key={c.id} href="/messages" className={cn(ROW, "transition-colors hover:bg-accent/60")}>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {c.customerName}
                    {label && <span title={label.label}>{label.emoji}</span>}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{c.preview || "—"}</p>
                </div>
                <div className="shrink-0 text-right">
                  {c.unreadCount > 0 ? (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-950">
                      {c.unreadCount}
                    </span>
                  ) : (
                    <Badge variant="warning">Chờ trả lời</Badge>
                  )}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(c.lastMessageAt)}</p>
                </div>
              </Link>
            );
          })}
          {data.grading.shippingBack.orders > 0 && (
            <Link
              href="/grading"
              className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-3 py-2 text-xs"
            >
              <Plane className="h-3.5 w-3.5 text-indigo-500" />
              {data.grading.shippingBack.orders} đơn chấm điểm đang về — chuẩn bị trả khách
            </Link>
          )}
        </PanelCard>

        <PanelCard title={`Hàng Tồn Lâu (≥ ${SLOW_MOVING_DAYS} ngày)`} icon={Hourglass} href="/inventory" hrefLabel="Mở kho →">
          {slow.length === 0 && <Empty>Không có SKU nào tồn quá {SLOW_MOVING_DAYS} ngày.</Empty>}
          {slow.map((i) => (
            <div key={`${i.kind}-${i.id}`} className={ROW}>
              <div className="min-w-0">
                <p className="truncate font-medium">{i.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {i.sku} · còn {i.quantity} · {i.neverSold ? "chưa bán" : "bán lần cuối"} {i.ageDays} ngày
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {formatVND(i.capital)}
              </span>
            </div>
          ))}
          {slowTotal > slow.length && (
            <p className="pt-1 text-[11px] text-muted-foreground">
              và {slowTotal - slow.length} SKU khác — hiển thị theo vốn đang găm cao nhất.
            </p>
          )}
        </PanelCard>
      </div>
    </section>
  );
}
