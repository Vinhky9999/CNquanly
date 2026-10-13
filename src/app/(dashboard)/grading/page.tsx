import { GradingWorkspace } from "@/components/grading/grading-workspace";
import { getGradingSummary } from "@/lib/grading-summary";

export default async function GradingPage() {
  const summary = await getGradingSummary();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dịch Vụ Chấm Điểm</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý thẻ khách gửi cửa hàng mang đi chấm điểm hộ (PSA / BGS / ARS / CGC): gói chấm, giá gốc, lãi dịch vụ và trạng thái đơn.
        </p>
      </div>
      <GradingWorkspace initialSummary={summary} />
    </div>
  );
}
