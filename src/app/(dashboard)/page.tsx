import { Wallet, Package, Layers } from "lucide-react";

import { getPortfolioSummary } from "@/lib/portfolio";
import { getMonthlyFinancialReport } from "@/lib/reports";
import { StatCard } from "@/components/dashboard/stat-card";
import { PortfolioBreakdown } from "@/components/dashboard/portfolio-breakdown";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { ExportReportDialog } from "@/components/dashboard/export-report-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LUXURY_CARD_CLASS } from "@/lib/utils";

export default async function DashboardPage() {
  const [summary, monthlyReport] = await Promise.all([
    getPortfolioSummary(),
    getMonthlyFinancialReport(12),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tổng quan danh mục</h1>
          <p className="text-sm text-muted-foreground">
            Sức khoẻ tài chính và giá trị danh mục CardNest theo thời gian thực.
          </p>
        </div>
        <ExportReportDialog />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Tổng giá trị danh mục" value={summary.totalPortfolioValue} icon={Layers} />
        <StatCard title="Tiền mặt lưu động" value={summary.liquidCash} icon={Wallet} tone="positive" />
        <StatCard
          title="Vốn đang găm vào tồn kho (giá gốc)"
          value={summary.inventoryCostValue}
          icon={Package}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PortfolioBreakdown
          liquidCash={summary.liquidCash}
          inventoryCostValue={summary.inventoryCostValue}
          totalPortfolioValue={summary.totalPortfolioValue}
        />
        <Card className={LUXURY_CARD_CLASS}>
          <CardHeader>
            <CardTitle>Số lượng SKU</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sealed products</span>
              <span className="font-medium tabular-nums">{summary.sealedSkuCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bài Raw</span>
              <span className="font-medium tabular-nums">{summary.rawCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bài Graded</span>
              <span className="font-medium tabular-nums">{summary.gradedCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <CashFlowChart months={monthlyReport} />
    </div>
  );
}
