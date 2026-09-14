import { ShippingTable } from "@/components/shipping/shipping-table";

export default function ShippingPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Giao Hàng</h1>
      <ShippingTable />
    </div>
  );
}
