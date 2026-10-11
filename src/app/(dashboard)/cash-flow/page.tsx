import { CashFlowWorkspace } from "@/components/cash-flow/cash-flow-workspace";
import { getDebtSummary } from "@/lib/debt-summary";
import { getCashOverview } from "@/lib/cash-overview";

export default async function CashFlowPage() {
  const [debtSummary, overview] = await Promise.all([getDebtSummary(), getCashOverview()]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dòng tiền</h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi thu chi quỹ và sổ ghi công nợ & ứng tiền của CardNest.
        </p>
      </div>
      <CashFlowWorkspace initialDebtSummary={debtSummary} initialOverview={overview} />
    </div>
  );
}
