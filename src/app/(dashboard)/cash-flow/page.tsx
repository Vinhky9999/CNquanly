import { CashFlowTable } from "@/components/cash-flow/cash-flow-table";

export default function CashFlowPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dòng tiền</h1>
      <CashFlowTable />
    </div>
  );
}
