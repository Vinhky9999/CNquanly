import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus } from "lucide-react";

import { UsMarketBadge } from "@/components/inventory/us-market-badge";
import { CONFIDENT_SCORE, LISTED_PRICE_NOTE, TCG_MARKET } from "@/lib/tcgplayer/constants";
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
  /** Shown instead of "—" when there is no price and nothing is linked (e.g. graded slabs). */
  emptyHint?: string;
}

export function MarketPriceCell({ marketPrice, source, label, url, score, updatedAt, emptyHint }: MarketPriceCellProps) {
  if (marketPrice == null) {
    // Right product found, but TCGplayer has no price for it yet (no sales and no listings).
    if (source && url) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Chưa có giá</span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            title={label ?? "Xem trên TCGplayer"}
            className="inline-flex items-center gap-0.5 text-[10px] leading-tight text-emerald-600 hover:underline dark:text-emerald-400"
          >
            {TCG_MARKET.label}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      );
    }
    return emptyHint ? (
      <span className="text-[10px] leading-tight text-muted-foreground">{emptyHint}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : null;
  const approximate = score != null && score < CONFIDENT_SCORE;
  const listedOnly = Boolean(label?.includes(LISTED_PRICE_NOTE.trim()));

  return (
    <div className="flex flex-col gap-0.5 tabular-nums">
      <span>{formatVND(Number(marketPrice))}</span>
      {source?.startsWith("tcgplayer:") && <UsMarketBadge className="w-fit" />}
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
              {source.startsWith("tcgplayer:") ? TCG_MARKET.label : "TCGplayer"}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ) : (
            "Tự động"
          )}
          {time ? ` · ${time}` : ""}
        </span>
      )}
      {listedOnly && (
        <span
          className="text-[10px] leading-tight text-amber-600 dark:text-amber-400"
          title="TCGplayer chưa có giao dịch gần đây cho thẻ này — đang dùng trung vị giá các tin đang bán"
        >
          giá niêm yết, chưa có giao dịch
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
