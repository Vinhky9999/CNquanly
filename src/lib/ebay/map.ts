import type { RawEbayItem } from "@/lib/ebay/client";

// Turns a Browse API item into the fields of a consignment card. A field eBay did not provide stays null: nothing is
// guessed from the title or filled with a default, so what the screen shows is what eBay really said.

export interface EbayListing {
  itemId: string;
  title: string;
  description: string | null;
  images: string[];
  seller: string | null;
  currency: string | null;
  /** Current bid (auction) or price. */
  currentPrice: number | null;
  bidCount: number | null;
  endsAt: string | null;
  /** true when eBay lists AUCTION among the buying options. */
  isAuction: boolean;
  /** The listing is over: its end date has passed or eBay reports it as no longer available. */
  ended: boolean;
  card: {
    subject: string | null;
    setName: string | null;
    year: string | null;
    cardNumber: string | null;
    cardType: string | null;
    rarity: string | null;
    gradingCompany: string | null;
    grade: string | null;
    certNumber: string | null;
    condition: string | null;
  };
}

// eBay item specifics are free-form names; these are the names its trading-card categories use.
const ASPECTS = {
  subject: ["player/athlete", "player", "athlete", "character", "pokémon", "pokemon", "card name", "subject"],
  setName: ["set", "set name", "series", "card set"],
  year: ["year manufactured", "year", "season", "release year", "year of release"],
  cardNumber: ["card number", "number", "card no.", "card no"],
  cardType: ["type", "card type"],
  rarity: ["rarity", "rarity level"],
  gradingCompany: ["professional grader", "grading company", "grader", "graded by", "grade company"],
  grade: ["grade", "graded grade"],
  certNumber: ["certification number", "cert number", "certification #", "cert #", "certification no", "cert no"],
  condition: ["card condition", "condition"],
} as const;

/** One item specific as eBay shows it ("Professional Grader" -> "PSA"). */
export interface Aspect {
  name?: string;
  value?: string;
}

function aspect(list: readonly Aspect[], names: readonly string[]): string | null {
  for (const name of names) {
    const hit = list.find((a) => a.name?.trim().toLowerCase() === name && a.value?.trim());
    if (hit?.value) return hit.value.trim();
  }
  return null;
}

/** Card details from the item specifics. Shared by the API reader and the page reader so both name things the same way. */
export function cardFromAspects(list: readonly Aspect[], fallbackCondition?: string | null): EbayListing["card"] {
  return {
    subject: aspect(list, ASPECTS.subject),
    setName: aspect(list, ASPECTS.setName),
    year: aspect(list, ASPECTS.year),
    cardNumber: aspect(list, ASPECTS.cardNumber),
    cardType: aspect(list, ASPECTS.cardType),
    rarity: aspect(list, ASPECTS.rarity),
    gradingCompany: aspect(list, ASPECTS.gradingCompany),
    grade: aspect(list, ASPECTS.grade),
    certNumber: aspect(list, ASPECTS.certNumber),
    condition: aspect(list, ASPECTS.condition) ?? fallbackCondition?.trim() ?? null,
  };
}

/** Listing description HTML -> plain text. */
export function htmlToText(html: string | undefined | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return text ? text.slice(0, 4000) : null;
}

const toNumber = (v: string | undefined): number | null => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : null;
};

export function mapEbayItem(raw: RawEbayItem, itemId: string, now = new Date()): EbayListing {
  const priceObj = raw.currentBidPrice ?? raw.price;
  const endsAt = raw.itemEndDate && !Number.isNaN(Date.parse(raw.itemEndDate)) ? new Date(raw.itemEndDate).toISOString() : null;
  const outOfStock = (raw.estimatedAvailabilities ?? []).some((a) => a.estimatedAvailabilityStatus === "OUT_OF_STOCK");

  const images = [raw.image?.imageUrl, ...(raw.additionalImages ?? []).map((i) => i.imageUrl)].filter((u): u is string => Boolean(u));

  return {
    itemId,
    title: raw.title?.trim() || "",
    description: htmlToText(raw.description) ?? htmlToText(raw.shortDescription),
    images: [...new Set(images)],
    seller: raw.seller?.username ?? null,
    currency: priceObj?.currency ?? null,
    currentPrice: toNumber(priceObj?.value),
    bidCount: typeof raw.bidCount === "number" ? raw.bidCount : null,
    endsAt,
    isAuction: (raw.buyingOptions ?? []).includes("AUCTION"),
    ended: outOfStock || (endsAt !== null && new Date(endsAt).getTime() <= now.getTime()),
    card: cardFromAspects(raw.localizedAspects ?? [], raw.condition),
  };
}
