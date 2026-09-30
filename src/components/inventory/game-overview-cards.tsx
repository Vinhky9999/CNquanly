"use client";

import { Flame, Layers, Package, Sparkles, Swords, Wand2, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

export function GameOverviewCards({ overview, selectedGame, onSelectGame }: GameOverviewCardsProps) {
  if (overview.length === 0) return null;

  const grandTotal = overview.reduce(
    (acc, g) => {
      acc.value += g.totalValue;
      acc.skuCount += g.skuCount;
      acc.quantity += g.totalQuantity;
      return acc;
    },
    { value: 0, skuCount: 0, quantity: 0 }
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <button
        type="button"
        onClick={() => onSelectGame(null)}
        className={cn(
          "group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200",
          "bg-card hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/10",
          selectedGame === null
            ? "border-indigo-500 ring-2 ring-indigo-500/50"
            : "border-border/60 hover:border-indigo-500/60"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
              <Layers className="h-5 w-5" />
            </span>
            <span className="font-semibold text-foreground">Tất Cả Dòng Game</span>
          </div>
          <Badge variant="indigo">{grandTotal.skuCount} SKU</Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {grandTotal.quantity.toLocaleString("vi-VN")} items trong kho
        </p>
        <p className="mt-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          Tổng vốn: {formatVND(grandTotal.value)}
        </p>
      </button>

      {overview.map((entry) => {
        const Icon = iconFor(entry.game);
        const isSelected = selectedGame === entry.game;
        return (
          <button
            key={entry.game}
            type="button"
            onClick={() => onSelectGame(isSelected ? null : entry.game)}
            className={cn(
              "group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200",
              "bg-card hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/20",
              isSelected
                ? "border-indigo-500 ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/10"
                : "border-border/60 hover:border-indigo-500/60"
            )}
          >
            <span
              className={cn(
                "pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-indigo-500/10 blur-2xl transition-opacity duration-200",
                isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
            />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="truncate font-semibold text-foreground">{entry.game}</span>
              </div>
              <Badge variant="indigo" className="shrink-0">
                {entry.skuCount} SKU
              </Badge>
            </div>
            <div className="relative mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{entry.totalQuantity.toLocaleString("vi-VN")} items</span>
              {entry.sealedSkuCount > 0 && (
                <Badge variant="indigo" className="px-1.5 py-0 text-[10px]">
                  {entry.sealedSkuCount} Sealed
                </Badge>
              )}
              {entry.singleSkuCount > 0 && (
                <Badge variant="slate" className="px-1.5 py-0 text-[10px]">
                  {entry.singleSkuCount} Single
                </Badge>
              )}
            </div>
            <p className="relative mt-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Tổng vốn: {formatVND(entry.totalValue)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
