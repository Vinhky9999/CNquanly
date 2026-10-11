import { ArrowDownRight, ArrowUpRight, HandCoins, Scale } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { formatVND } from "@/lib/utils";
import type { CashOverview } from "@/lib/cash-overview";

export function CashOverviewCards({ overview }: { overview: CashOverview }) {
  const cardClass = "dark:border-indigo-500/30 dark:bg-slate-900/50 dark:backdrop-blur-md";

  return (
    <section aria-label="Tổng quan dòng tiền" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Tổng Quan Dòng Tiền
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng Doanh Thu"
          value={overview.totalInflow}
          icon={ArrowUpRight}
          tone="positive"
          className={cardClass}
          subtitle="Tổng các khoản thu (bán hàng, thu hồi nợ...)"
        />
        <StatCard
          title="Tổng Rút / Chi Vốn"
          value={overview.totalOutflow}
          icon={ArrowDownRight}
          tone="negative"
          className={cardClass}
          subtitle="Tổng các khoản chi (mua hàng, rút tiền, trả nợ...)"
        />
        <StatCard
          title="Số Dư Quỹ Thực Tế"
          value={overview.netBalance}
          icon={Scale}
          tone={overview.netBalance >= 0 ? "positive" : "negative"}
          className={cardClass}
          subtitle="Doanh thu trừ Rút/Chi vốn"
        />
        <StatCard
          title="Tổng Công Nợ Còn Lại"
          value={overview.pendingDebtTotal}
          icon={HandCoins}
          tone="warning"
          className={cardClass}
          subtitle={`Phải trả ${formatVND(overview.owedByShop)} · Phải thu ${formatVND(overview.owedToShop)}`}
        />
      </div>
    </section>
  );
}
