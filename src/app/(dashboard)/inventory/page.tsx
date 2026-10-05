import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";
import { getInventoryGameOverview } from "@/lib/inventory-overview";

export default async function InventoryPage() {
  const overview = await getInventoryGameOverview();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Quản lý Kho hàng</h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi tồn kho Sealed, Single và toàn bộ lịch sử xuất/nhập hàng.
        </p>
      </div>
      <InventoryWorkspace initialOverview={overview} />
    </div>
  );
}
