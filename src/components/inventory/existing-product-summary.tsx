import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { ProductThumbnail } from "@/components/inventory/product-thumbnail";

interface ExistingProductSummaryProps {
  imageUrl: string | null;
  name: string;
  sku: string;
  kind: "Sealed" | "Single";
  game: string | null;
  extraBadges?: ReactNode;
}

// Read-only snapshot of a product being restocked — everything here was
// auto-filled from the existing SKU, so only quantity and cost stay editable.
export function ExistingProductSummary({
  imageUrl,
  name,
  sku,
  kind,
  game,
  extraBadges,
}: ExistingProductSummaryProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 backdrop-blur-xl">
      <ProductThumbnail src={imageUrl} alt={name} size="lg" />
      <div className="min-w-0 space-y-1.5">
        <p className="truncate font-semibold text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{sku}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={kind === "Sealed" ? "indigo" : "slate"}>{kind}</Badge>
          {game && <Badge variant="indigo">{game}</Badge>}
          {extraBadges}
        </div>
      </div>
    </div>
  );
}
