import { Badge } from "@/components/ui/badge";
import { TCG_MARKET } from "@/lib/tcgplayer/constants";
import { cn } from "@/lib/utils";

/** Small "US Market" tag shown next to every TCGplayer-sourced market price. */
export function UsMarketBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="indigo"
      className={cn("whitespace-nowrap px-1 py-0 text-[9px] uppercase tracking-wide", className)}
      title="Giá TCGplayer thị trường United States (USD), quy đổi sang VND theo tỷ giá trực tiếp"
    >
      {TCG_MARKET.badge}
    </Badge>
  );
}
