import { AUTO_LINK_OPTED_OUT } from "@/lib/tcgplayer/constants";

export interface PriceLinkInput {
  priceSource?: string;
  priceSourceLabel?: string;
  priceSourceUrl?: string;
  priceOptOut?: string; // "1" when the owner pressed "Bỏ liên kết"
}

interface ExistingLink {
  priceSource: string | null;
  priceMatchScore: number | null;
  marketPrice: unknown;
}

/** Link columns for a brand-new product. Without an explicit choice the auto-linker picks it up later. */
export function linkDataForCreate(input: PriceLinkInput, marketPrice: number | undefined) {
  if (input.priceSource) {
    return {
      priceSource: input.priceSource,
      priceSourceLabel: input.priceSourceLabel || null,
      priceSourceUrl: input.priceSourceUrl || null,
      priceMatchScore: 1, // chosen by hand
      priceLinkAttemptedAt: new Date(),
      marketPriceUpdatedAt: marketPrice != null ? new Date() : null,
    };
  }
  if (input.priceOptOut === "1") {
    return { priceLinkAttemptedAt: AUTO_LINK_OPTED_OUT, marketPriceUpdatedAt: marketPrice != null ? new Date() : null };
  }
  return { marketPriceUpdatedAt: marketPrice != null ? new Date() : null };
}

/** Restock of an existing SKU: only touch the link when the owner picked a (different) product. */
export function linkDataForMerge(input: PriceLinkInput, existing: ExistingLink) {
  if (input.priceSource && input.priceSource !== existing.priceSource) {
    return {
      priceSource: input.priceSource,
      priceSourceLabel: input.priceSourceLabel || null,
      priceSourceUrl: input.priceSourceUrl || null,
      priceMatchScore: 1,
      priceLinkAttemptedAt: new Date(),
      marketPriceUpdatedAt: new Date(),
    };
  }
  return {};
}

/** Edit form: the submitted fields are the truth — cleared fields mean "unlinked". */
export function linkDataForUpdate(
  input: PriceLinkInput,
  existing: ExistingLink,
  newMarketPrice: number | null
) {
  const priceChanged =
    (newMarketPrice ?? null) !== (existing.marketPrice != null ? Number(existing.marketPrice) : null);

  if (input.priceSource) {
    const sameSource = input.priceSource === existing.priceSource;
    return {
      priceSource: input.priceSource,
      priceSourceLabel: input.priceSourceLabel || null,
      priceSourceUrl: input.priceSourceUrl || null,
      priceMatchScore: sameSource ? existing.priceMatchScore : 1,
      ...(sameSource ? {} : { priceLinkAttemptedAt: new Date() }),
      ...(!sameSource || priceChanged ? { marketPriceUpdatedAt: new Date() } : {}),
    };
  }

  const wasLinked = existing.priceSource != null;
  return {
    priceSource: null,
    priceSourceLabel: null,
    priceSourceUrl: null,
    priceMatchScore: null,
    ...(input.priceOptOut === "1" || wasLinked ? { priceLinkAttemptedAt: AUTO_LINK_OPTED_OUT } : {}),
    ...(priceChanged ? { marketPriceUpdatedAt: newMarketPrice != null ? new Date() : null } : {}),
  };
}
