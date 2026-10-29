import { getDashboardData } from "@/lib/dashboard";
import { getMonthlyFinancialReport } from "@/lib/reports";
import { AttentionPanels, CrmCards, FinanceCards, GameValuePanel } from "@/components/dashboard/overview-sections";
import { PortfolioBreakdown } from "@/components/dashboard/portfolio-breakdown";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { ExportReportDialog } from "@/components/dashboard/export-report-dialog";
import { MonthlyReportExport } from "@/components/dashboard/monthly-report-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LUXURY_CARD_CLASS } from "@/lib/utils";

export default async function DashboardPage() {
  const [data, monthlyReport] = await Promise.all([getDashboardData(), getMonthlyFinancialReport(12)]);
  const { portfolio: summary } = data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tổng quan</h1>
          <p className="text-sm text-muted-foreground">
            Tài chính, kho hàng, khách hàng và dịch vụ chấm điểm của CardNest trong một màn hình.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthlyReportExport />
          <ExportReportDialog />
        </div>
      </div>

      <FinanceCards data={data} />
      <CrmCards data={data} />

      <section aria-label="Biểu đồ" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Biến Động & Cơ Cấu</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <CashFlowChart months={monthlyReport} />
          </div>
          <GameValuePanel games={data.games} />
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
      </section>

      <AttentionPanels data={data} />
    </div>
  );
}
