import { Gem, Percent, Wallet } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import type { GameOverviewEntry } from "@/lib/inventory-overview";

interface PortfolioValuationCardsProps {
  overview: GameOverviewEntry[];
  selectedGame: string | null;
}

export function PortfolioValuationCards({ overview, selectedGame }: PortfolioValuationCardsProps) {
  const scope = selectedGame ? overview.filter((g) => g.game === selectedGame) : overview;
  const totals = scope.reduce(
    (acc, g) => {
      acc.capital += g.totalValue;
      acc.marketValue += g.marketValue;
      acc.pricedCost += g.pricedCost;
      acc.priced += g.pricedSkuCount;
      acc.skus += g.skuCount;
      return acc;
    },
    { capital: 0, marketValue: 0, pricedCost: 0, priced: 0, skus: 0 }
  );

  if (totals.skus === 0) return null;

  // P/L compares market value with the cost of the SAME priced SKUs, so unpriced stock
  // can't show up as a fake loss.
  const unrealized = totals.marketValue - totals.pricedCost;
  const pct = totals.pricedCost > 0 ? (unrealized / totals.pricedCost) * 100 : 0;
  const hasPrices = totals.priced > 0;
  const scopeLabel = selectedGame ?? "toàn kho";

  return (
    <section aria-label="Định giá danh mục" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Định Giá Danh Mục — {scopeLabel}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Tổng Giá Vốn (Total Capital)"
          value={totals.capital}
          icon={Wallet}
          className="dark:border-indigo-500/30"
          subtitle={`${totals.skus} SKU trong ${scopeLabel}`}
        />
        <StatCard
          title="Tổng Giá Trị Thị Trường"
          value={totals.marketValue}
          icon={Gem}
          className="dark:border-indigo-500/30"
          subtitle={
            hasPrices
              ? `${totals.priced}/${totals.skus} SKU đã có giá thị trường`
              : "Chưa SKU nào có giá thị trường"
          }
        />
        <StatCard
          title="Lãi / Lỗ Chưa Thực Hiện"
          value={unrealized}
          icon={Percent}
          tone={!hasPrices || unrealized === 0 ? "default" : unrealized > 0 ? "positive" : "negative"}
          className="dark:border-indigo-500/30"
          subtitle={
            hasPrices
              ? `${unrealized >= 0 ? "+" : ""}${pct.toFixed(2)}% so với giá vốn của các SKU đã có giá`
              : "Nhập giá thị trường để xem lãi/lỗ"
          }
        />
      </div>
    </section>
  );
}
