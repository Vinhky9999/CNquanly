import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatVND, LUXURY_CARD_CLASS } from "@/lib/utils";

interface PortfolioBreakdownProps {
  liquidCash: number;
  inventoryCostValue: number;
  debtPayable: number;
  totalPortfolioValue: number;
}

export function PortfolioBreakdown({
  liquidCash,
  inventoryCostValue,
  debtPayable,
  totalPortfolioValue,
}: PortfolioBreakdownProps) {
  // The bar shows what the portfolio is made of before debts; the payable is listed below and deducted from the total.
  const gross = Math.max(0, liquidCash) + inventoryCostValue;
  const cashPct = gross > 0 ? (Math.max(0, liquidCash) / gross) * 100 : 0;
  const inventoryPct = gross > 0 ? 100 - cashPct : 0;

  return (
    <Card className={LUXURY_CARD_CLASS}>
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
        <div className="flex justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Công nợ phải trả — −{formatVND(debtPayable)}
          </div>
        </div>
        <div className="flex justify-between border-t border-border/60 pt-3 text-sm font-semibold">
          <span>Tổng giá trị danh mục</span>
          <span className="tabular-nums">{formatVND(totalPortfolioValue)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
