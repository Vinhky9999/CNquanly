import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";
import { getInventoryGameOverview } from "@/lib/inventory-overview";
import { getDebtSummary } from "@/lib/debt-summary";

export default async function InventoryPage() {
  const [overview, debtSummary] = await Promise.all([
    getInventoryGameOverview(),
    getDebtSummary(),
  ]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Quản lý Kho hàng</h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi tồn kho Sealed, Single, lịch sử xuất/nhập và sổ ghi nợ/ứng tiền.
        </p>
      </div>
      <InventoryWorkspace initialOverview={overview} initialDebtSummary={debtSummary} />
    </div>
  );
}
