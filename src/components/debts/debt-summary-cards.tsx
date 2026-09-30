import { HandCoins, Landmark, ReceiptText } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import type { DebtSummary } from "@/lib/debt-summary";

export function DebtSummaryCards({ summary }: { summary: DebtSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        title="CardNest đang nợ (phải trả)"
        value={summary.totalOwedByShop}
        icon={HandCoins}
        tone="negative"
        subtitle="Tiền cá nhân đã ứng ra mua hàng, chưa hoàn trả"
      />
      <StatCard
        title="Cần thu hồi (phải thu)"
        value={summary.totalOwedToShop}
        icon={Landmark}
        tone="positive"
        subtitle="Tiền quỹ đã ứng cho người khác, chưa thu về"
      />
      <StatCard
        title="Khoản nợ chưa hoàn tất"
        value={summary.unpaidCount}
        icon={ReceiptText}
        format="number"
        subtitle="Tổng số khoản đang UNPAID hoặc PARTIAL"
      />
    </div>
  );
}
