import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SealedTable } from "@/components/inventory/sealed-table";
import { SingleTable } from "@/components/inventory/single-table";
import { InventoryHistoryTable } from "@/components/inventory/inventory-history-table";

export default function InventoryPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <Tabs defaultValue="sealed">
        <TabsList>
          <TabsTrigger value="sealed">Hàng Sealed</TabsTrigger>
          <TabsTrigger value="singles">Bài Singles</TabsTrigger>
          <TabsTrigger value="history">Lịch sử Xuất/Nhập</TabsTrigger>
        </TabsList>
        <TabsContent value="sealed">
          <SealedTable />
        </TabsContent>
        <TabsContent value="singles">
          <SingleTable />
        </TabsContent>
        <TabsContent value="history">
          <InventoryHistoryTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
