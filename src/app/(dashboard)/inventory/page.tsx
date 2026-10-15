import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";
import { getInventoryGameOverview } from "@/lib/inventory-overview";

// Server actions on this page (TCGplayer matching/pricing) may need longer than the default timeout.
export const maxDuration = 60;

export default async function InventoryPage() {
  const overview = await getInventoryGameOverview();

  return <InventoryWorkspace initialOverview={overview} />;
}
