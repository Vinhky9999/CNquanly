"use client";

import { Flame, Layers, Sparkles, Swords, Wand2, type LucideIcon } from "lucide-react";

import { cn, formatVND } from "@/lib/utils";
import type { GameOverviewEntry } from "@/lib/inventory-overview";

interface GameOverviewCardsProps {
  overview: GameOverviewEntry[];
  selectedGame: string | null;
  onSelectGame: (game: string | null) => void;
}

const GAME_ICONS: Record<string, LucideIcon> = {
  "Pokémon": Sparkles,
  "One Piece": Swords,
  "Yu-Gi-Oh!": Flame,
  "Magic: The Gathering": Wand2,
};

function iconFor(game: string): LucideIcon {
  return GAME_ICONS[game] ?? Layers;
}

interface CardData {
  key: string;
  game: string | null; // null = every game
  label: string;
  icon: LucideIcon;
  skuCount: number;
  quantity: number;
  capital: number;
  marketValue: number;
  pricedCost: number;
  pricedSkus: number;
}

function GameCard({ data, selected, onSelect }: { data: CardData; selected: boolean; onSelect: () => void }) {
  const Icon = data.icon;
  const pnl = data.marketValue - data.pricedCost;
  const pct = data.pricedCost > 0 ? (pnl / data.pricedCost) * 100 : null;
  const up = pnl >= 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex h-full flex-col rounded-2xl border p-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-warning/80 bg-warning/[0.06]"
          : "border-border/70 bg-card hover:border-primary/50 hover:bg-accent/20"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              selected ? "bg-warning/15 text-warning" : "bg-primary/15 text-accent-foreground"
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <span className="truncate font-semibold text-foreground">{data.label}</span>
        </div>
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {data.skuCount} SKU
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{data.quantity.toLocaleString("vi-VN")} items trong kho</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Tổng vốn</dt>
        <dt className="text-right text-muted-foreground">Thị trường US</dt>
        <dd className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">{formatVND(data.capital)}</dd>
        <dd className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">
          {data.pricedSkus > 0 ? formatVND(data.marketValue) : <span className="text-muted-foreground">—</span>}
        </dd>
      </dl>

      {pct !== null && (
        <p className={cn("mt-2 text-xs font-semibold tabular-nums", up ? "text-success" : "text-danger")}>
          {up ? "▲ +" : "▼ "}
          {pct.toFixed(1)}% lãi/lỗ
        </p>
      )}
    </button>
  );
}

export function GameOverviewCards({ overview, selectedGame, onSelectGame }: GameOverviewCardsProps) {
  if (overview.length === 0) return null;

  const all = overview.reduce(
    (acc, g) => {
      acc.capital += g.totalValue;
      acc.skuCount += g.skuCount;
      acc.quantity += g.totalQuantity;
      acc.marketValue += g.marketValue;
      acc.pricedCost += g.pricedCost;
      acc.pricedSkus += g.pricedSkuCount;
      return acc;
    },
    { capital: 0, skuCount: 0, quantity: 0, marketValue: 0, pricedCost: 0, pricedSkus: 0 }
  );

  const cards: CardData[] = [
    { key: "__all__", game: null, label: "Tất Cả Dòng Game", icon: Layers, ...all },
    ...overview.map((g) => ({
      key: g.game,
      game: g.game,
      label: g.game,
      icon: iconFor(g.game),
      skuCount: g.skuCount,
      quantity: g.totalQuantity,
      capital: g.totalValue,
      marketValue: g.marketValue,
      pricedCost: g.pricedCost,
      pricedSkus: g.pricedSkuCount,
    })),
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const selected = card.game === null ? selectedGame === null : selectedGame === card.game;
        return (
          <GameCard
            key={card.key}
            data={card}
            selected={selected}
            onSelect={() => onSelectGame(card.game === null || selected ? null : card.game)}
          />
        );
      })}
    </div>
  );
}
