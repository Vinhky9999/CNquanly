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

/** A price older than this is shown as stale (the app refreshes prices every few minutes while it is open). */
const STALE_AFTER_MS = 24 * 3600 * 1000;

function updatedLabel(updatedAt: Date | string) {
  const d = new Date(updatedAt);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function MarketPriceCell({ marketPrice, source, label, url, score, updatedAt, emptyHint }: MarketPriceCellProps) {
  if (marketPrice == null) {
    // Right product found, but TCGplayer has no price for it yet (no sales and no listings).
    if (source && url) {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-muted-foreground">Chưa có giá</span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            title={label ?? "Xem trên TCGplayer"}
            className="inline-flex items-center gap-0.5 text-[10px] leading-tight text-success hover:underline"
          >
            {TCG_MARKET.label}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      );
    }
    return emptyHint ? (
      <span className="ml-auto block max-w-[180px] text-right text-[10px] leading-tight text-muted-foreground">{emptyHint}</span>
    ) : (
      <span className="text-muted-foreground" title="Chưa có giá thị trường">
        —
      </span>
    );
  }

  const approximate = score != null && score < CONFIDENT_SCORE;
  const listedOnly = Boolean(label?.includes(LISTED_PRICE_NOTE.trim()));
  const stale = updatedAt ? Date.now() - new Date(updatedAt).getTime() > STALE_AFTER_MS : false;

  return (
    <div className="flex flex-col items-end gap-1 tabular-nums">
      <span className="whitespace-nowrap font-semibold text-foreground">{formatVND(Number(marketPrice))}</span>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[10px] leading-tight">
        {source?.startsWith("tcgplayer:") && <UsMarketBadge />}
        {source &&
          (url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              title={label ?? "Xem trên TCGplayer"}
              className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground hover:underline"
            >
              {updatedAt ? updatedLabel(updatedAt) : source.startsWith("tcgplayer:") ? TCG_MARKET.label : "TCGplayer"}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ) : (
            <span className="text-muted-foreground">Tự động{updatedAt ? ` · ${updatedLabel(updatedAt)}` : ""}</span>
          ))}
      </span>
      {stale && (
        <span
          className="text-[10px] leading-tight text-warning"
          title="Giá chưa được cập nhật trong hơn 24 giờ — bấm “Cập nhật giá TCGplayer US” để làm mới"
        >
          giá cũ
        </span>
      )}
      {listedOnly && (
        <span
          className="text-[10px] leading-tight text-warning"
          title="TCGplayer chưa có giao dịch gần đây cho thẻ này — đang dùng trung vị giá các tin đang bán"
        >
          giá niêm yết, chưa có giao dịch
        </span>
      )}
      {approximate && (
        <span className="text-[10px] leading-tight text-warning" title={label ?? undefined}>
          ≈ khớp gần đúng, kiểm tra
        </span>
      )}
    </div>
  );
}

// Unrealized P/L for the SKU's whole stock: (market - cost) x quantity, plus the % vs cost.
// Sign and arrow carry the meaning too, not only the colour.
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
        "flex flex-col items-end gap-0.5 tabular-nums",
        flat ? "text-muted-foreground" : up ? "text-success" : "text-danger"
      )}
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold">
        <Icon className="h-3.5 w-3.5" />
        {up ? "+" : ""}
        {formatVND(total)}
      </span>
      {pct !== null && (
        <span className="whitespace-nowrap text-xs">
          {up ? "+" : ""}
          {pct.toFixed(1)}%
        </span>
      )}
    </div>
  );
}
