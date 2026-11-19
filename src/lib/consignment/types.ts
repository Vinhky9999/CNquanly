import type { FeeMode, FeeResult } from "@/lib/consignment/fees";

// Shapes sent by the API and read by the screens (dates as ISO strings, money as numbers in USD).

export type ListingStatus = "ACTIVE" | "ENDED" | "SOLD" | "UNSOLD";

export interface FeeScheduleDTO {
  id: string;
  name: string;
  effectiveFrom: string;
  mode: FeeMode;
  serviceRate: number;
  minimumFee: number | null;
  note: string | null;
  tiers: { from: number; to: number | null; percent: number; fixed: number }[];
  createdAt: string;
  /** Number of cards pinned to this version. */
  usedBy: number;
}

export interface ItemImageDTO {
  id: string;
  /** Where to load it from: the saved copy when there is one, otherwise the eBay link. */
  src: string;
  source: "EBAY" | "UPLOAD";
  saved: boolean;
}

export interface PaymentDTO {
  id: string;
  amount: number;
  paidAt: string;
  note: string | null;
}

export interface ItemFinance {
  /** FINAL = confirmed End price; CURRENT = provisional from the last tracked price; NONE = nothing to calculate. */
  basis: "FINAL" | "CURRENT" | "NONE";
  basisPrice: number | null;
  fees: FeeResult | null;
  scheduleId: string | null;
  scheduleName: string | null;
  /** true when the card follows the schedule in force on its end date instead of a pinned version. */
  scheduleAuto: boolean;
  /** Why the fees could not be calculated (no schedule, foreign currency...). */
  problem: string | null;
  /** Note shown next to the schedule, e.g. the card is older than every version. */
  scheduleNote: string | null;
  paid: number;
  /** Customer payout still to pay; null unless the End price is confirmed. */
  remaining: number | null;
}

export interface ConsignmentItemDTO {
  id: string;
  code: string;
  order: { id: string; code: string; customerName: string; customerContact: string | null };
  ebayUrl: string | null;
  ebayItemId: string | null;
  ebayMarketplace: string | null;
  seller: string | null;
  dataSource: "EBAY_API" | "MANUAL";
  fetchedAt: string | null;
  fetchError: string | null;
  title: string;
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
  description: string | null;
  notes: string | null;
  /** Stored status. */
  listingStatus: ListingStatus;
  /** Status as it is now: an ACTIVE auction whose end time has passed counts as ENDED until the result is confirmed. */
  effectiveStatus: ListingStatus;
  needsResult: boolean;
  currency: string;
  currentPrice: number | null;
  endPrice: number | null;
  bidCount: number | null;
  endsAt: string | null;
  feeScheduleId: string | null;
  images: ItemImageDTO[];
  payments: PaymentDTO[];
  finance: ItemFinance;
  createdAt: string;
  updatedAt: string;
}

export interface ConsignmentSummary {
  totalCards: number;
  soldCards: number;
  pendingResultCards: number;
  totalEndPrice: number;
  totalProbsteinFee: number;
  totalMyFee: number;
  totalCustomerPayout: number;
  totalPaid: number;
  totalRemaining: number;
  /** Sold cards that could not be calculated (no fee schedule): the totals above leave them out. */
  uncalculatedSold: number;
}
