import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatVND } from "@/lib/utils";

interface PortfolioBreakdownProps {
  liquidCash: number;
  inventoryCostValue: number;
  totalPortfolioValue: number;
}

export function PortfolioBreakdown({
  liquidCash,
  inventoryCostValue,
  totalPortfolioValue,
}: PortfolioBreakdownProps) {
  const cashPct = totalPortfolioValue > 0 ? (liquidCash / totalPortfolioValue) * 100 : 0;
  const inventoryPct = 100 - cashPct;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cơ cấu danh mục</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex h-4 overflow-hidden rounded-full bg-muted">
          <div className="bg-emerald-500" style={{ width: `${cashPct}%` }} />
          <div className="bg-indigo-500" style={{ width: `${inventoryPct}%` }} />
        </div>
        <div className="flex justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Tiền mặt ({cashPct.toFixed(1)}%) — {formatVND(liquidCash)}
          </div>
        </div>
        <div className="flex justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            Tồn kho ({inventoryPct.toFixed(1)}%) — {formatVND(inventoryCostValue)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
