import { CustomerTable } from "@/components/customers/customer-table";

export default function CustomersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Khách hàng nội bộ</h1>
      <CustomerTable />
    </div>
  );
}
