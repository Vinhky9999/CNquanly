import { Coins, PackageCheck, Plane, TrendingUp } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { formatVND } from "@/lib/utils";
import type { GradingSummary } from "@/lib/grading-summary";

export function GradingSummaryCards({ summary }: { summary: GradingSummary }) {
  const cardClass = "";

  return (
    <section aria-label="Tổng quan dịch vụ chấm điểm" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Tổng Quan Chấm Điểm
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Thẻ Đang Gửi Hãng"
          value={summary.activeCards}
          format="number"
          icon={Plane}
          tone="warning"
          className={cardClass}
          subtitle={`${summary.activeOrders.toLocaleString("vi-VN")} đơn chưa trả khách`}
        />
        <StatCard
          title="Doanh Thu Dịch Vụ"
          value={summary.totalRevenue}
          icon={Coins}
          className={cardClass}
          subtitle={
            summary.uncollected > 0
              ? `Chưa thu tiền khách ${formatVND(summary.uncollected)}`
              : "Đã thu đủ tiền khách"
          }
        />
        <StatCard
          title="Tổng Giá Gốc"
          value={summary.totalCost}
          icon={PackageCheck}
          tone="negative"
          className={cardClass}
          subtitle="Phí hãng + vận chuyển / bảo hiểm"
        />
        <StatCard
          title="Lợi Nhuận Dịch Vụ"
          value={summary.totalProfit}
          icon={TrendingUp}
          tone="positive"
          className={cardClass}
          subtitle="Doanh thu trừ giá gốc"
        />
      </div>
    </section>
  );
}
