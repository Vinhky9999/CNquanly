import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn, formatVND } from "@/lib/utils";

interface MarketInput {
  costPrice: unknown;
  marketPrice: unknown;
  quantity: number;
}

export function MarketPriceCell({ marketPrice }: { marketPrice: unknown }) {
  if (marketPrice == null) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{formatVND(Number(marketPrice))}</span>;
}

// Unrealized P/L for the SKU's whole stock: (market - cost) x quantity, plus the % vs cost.
export function PnlCell({ costPrice, marketPrice, quantity }: MarketInput) {
  if (marketPrice == null) return <span className="text-muted-foreground">—</span>;

  const cost = Number(costPrice);
  const diff = Number(marketPrice) - cost;
  const total = diff * quantity;
  const pct = cost > 0 ? (diff / cost) * 100 : null;
  const up = diff > 0;
  const flat = diff === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className={cn(
        "inline-flex flex-col gap-0.5 tabular-nums",
        flat ? "text-muted-foreground" : up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
      )}
    >
      <span className="inline-flex items-center gap-1 font-semibold">
        <Icon className="h-3.5 w-3.5" />
        {up ? "+" : ""}
        {formatVND(total)}
      </span>
      {pct !== null && (
        <span className="text-xs">
          {up ? "+" : ""}
          {pct.toFixed(1)}%
        </span>
      )}
    </div>
  );
}
