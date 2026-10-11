import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus } from "lucide-react";

import { CONFIDENT_SCORE } from "@/lib/tcgplayer/constants";
import { cn, formatVND } from "@/lib/utils";

interface MarketInput {
  costPrice: unknown;
  marketPrice: unknown;
  quantity: number;
}

interface MarketPriceCellProps {
  marketPrice: unknown;
  source?: string | null;
  label?: string | null;
  url?: string | null;
  score?: number | null;
  updatedAt?: Date | string | null;
}

export function MarketPriceCell({ marketPrice, source, label, url, score, updatedAt }: MarketPriceCellProps) {
  if (marketPrice == null) return <span className="text-muted-foreground">—</span>;

  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : null;
  const approximate = score != null && score < CONFIDENT_SCORE;

  return (
    <div className="flex flex-col gap-0.5 tabular-nums">
      <span>{formatVND(Number(marketPrice))}</span>
      {source && (
        <span className="text-[10px] leading-tight text-emerald-600 dark:text-emerald-400">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              title={label ?? "Xem trên TCGplayer"}
              className="inline-flex items-center gap-0.5 hover:underline"
            >
              TCGplayer
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ) : (
            "Tự động"
          )}
          {time ? ` · ${time}` : ""}
        </span>
      )}
      {approximate && (
        <span className="text-[10px] leading-tight text-amber-600 dark:text-amber-400" title={label ?? undefined}>
          ≈ khớp gần đúng, kiểm tra
        </span>
      )}
    </div>
  );
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
