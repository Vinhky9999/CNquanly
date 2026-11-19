import { Prisma, type ConsignmentListingStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computeFees, type FeeSchedule } from "@/lib/consignment/fees";
import type { ConsignmentItemDTO, ConsignmentSummary, FeeScheduleDTO, ItemFinance, ItemImageDTO, ListingStatus } from "@/lib/consignment/types";

const num = (v: unknown) => Number(v ?? 0);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------------------------------
// Fee schedules
// ---------------------------------------------------------------------------------------------------------------------
export async function loadSchedules(): Promise<FeeScheduleDTO[]> {
  const rows = await prisma.consignmentFeeSchedule.findMany({
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    include: { tiers: { orderBy: { position: "asc" } }, _count: { select: { items: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    effectiveFrom: s.effectiveFrom.toISOString(),
    mode: s.mode,
    serviceRate: num(s.serviceRate),
    minimumFee: numOrNull(s.minimumFee),
    note: s.note,
    tiers: s.tiers.map((t) => ({ from: num(t.fromPrice), to: numOrNull(t.toPrice), percent: num(t.percent), fixed: num(t.fixedFee) })),
    createdAt: s.createdAt.toISOString(),
    usedBy: s._count.items,
  }));
}

const asFeeSchedule = (s: FeeScheduleDTO): FeeSchedule => ({ mode: s.mode, serviceRate: s.serviceRate, minimumFee: s.minimumFee, tiers: s.tiers });

/**
 * Which fee schedule applies to a card: the version it is pinned to, otherwise the latest version in force on its end
 * date (or on the day it was added while the end date is unknown). A card older than every version uses the earliest one.
 */
export function resolveSchedule(
  item: { feeScheduleId: string | null; endsAt: Date | null; createdAt: Date },
  schedules: FeeScheduleDTO[]
): { schedule: FeeScheduleDTO | null; auto: boolean; note: string | null } {
  if (item.feeScheduleId) {
    const pinned = schedules.find((s) => s.id === item.feeScheduleId);
    if (pinned) return { schedule: pinned, auto: false, note: null };
  }
  if (schedules.length === 0) return { schedule: null, auto: true, note: null };
  const at = (item.endsAt ?? item.createdAt).getTime();
  const inForce = schedules.find((s) => new Date(s.effectiveFrom).getTime() <= at); // schedules are newest first
  if (inForce) return { schedule: inForce, auto: true, note: null };
  const earliest = schedules[schedules.length - 1];
  return { schedule: earliest, auto: true, note: "Thẻ này có trước mọi phiên bản biểu phí nên đang dùng phiên bản sớm nhất." };
}

// ---------------------------------------------------------------------------------------------------------------------
// Per-card finance
// ---------------------------------------------------------------------------------------------------------------------
interface FinanceInput {
  listingStatus: ConsignmentListingStatus;
  currency: string;
  currentPrice: Prisma.Decimal | null;
  endPrice: Prisma.Decimal | null;
  endsAt: Date | null;
  createdAt: Date;
  feeScheduleId: string | null;
  payments: { amount: Prisma.Decimal }[];
}

export function computeItemFinance(item: FinanceInput, schedules: FeeScheduleDTO[]): ItemFinance {
  const paid = round2(item.payments.reduce((s, p) => s + num(p.amount), 0));
  const { schedule, auto, note } = resolveSchedule(item, schedules);
  const base = { scheduleId: schedule?.id ?? null, scheduleName: schedule?.name ?? null, scheduleAuto: auto, scheduleNote: note, paid };

  if (item.listingStatus === "UNSOLD") return { ...base, basis: "NONE", basisPrice: null, fees: null, problem: null, remaining: null };

  const final = item.listingStatus === "SOLD" && item.endPrice !== null;
  const current = !final && item.currentPrice !== null;
  const basisPrice = final ? num(item.endPrice) : current ? num(item.currentPrice) : null;
  if (basisPrice === null) return { ...base, basis: "NONE", basisPrice: null, fees: null, problem: null, remaining: null };

  // The fee schedule and the formula are in USD: a provisional price in another currency is not converted behind the owner's back.
  if (!final && item.currency !== "USD") {
    return { ...base, basis: "NONE", basisPrice, fees: null, problem: `Giá hiện tại tính bằng ${item.currency}, còn biểu phí tính bằng USD. Khi đấu giá kết thúc hãy nhập giá End quy đổi ra USD.`, remaining: null };
  }
  if (!schedule) {
    return { ...base, basis: final ? "FINAL" : "CURRENT", basisPrice, fees: null, problem: "Chưa cấu hình biểu phí Probstein nên chưa tính được phí và tiền khách nhận. Vào Cài đặt biểu phí để nhập.", remaining: null };
  }
  try {
    const fees = computeFees(basisPrice, asFeeSchedule(schedule));
    return { ...base, basis: final ? "FINAL" : "CURRENT", basisPrice, fees, problem: null, remaining: final ? round2(fees.customerPayout - paid) : null };
  } catch (err) {
    return { ...base, basis: final ? "FINAL" : "CURRENT", basisPrice, fees: null, problem: err instanceof Error ? err.message : "Không tính được phí", remaining: null };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------------------------------------------------
const imageSelect = { id: true, source: true, url: true, contentType: true, position: true } as const;
const itemInclude = {
  order: true,
  images: { select: imageSelect, orderBy: { position: "asc" as const } },
  payments: { orderBy: { paidAt: "asc" as const } },
};
type ItemRow = Prisma.ConsignmentItemGetPayload<{ include: typeof itemInclude }>;

const imageDto = (i: ItemRow["images"][number]): ItemImageDTO => ({
  id: i.id,
  src: i.contentType ? `/api/consignment/images/${i.id}` : (i.url ?? ""),
  source: i.source === "UPLOAD" ? "UPLOAD" : "EBAY",
  saved: Boolean(i.contentType),
});

export function toItemDto(row: ItemRow, schedules: FeeScheduleDTO[], now = new Date()): ConsignmentItemDTO {
  const pastEnd = row.endsAt !== null && row.endsAt.getTime() < now.getTime();
  const effectiveStatus: ListingStatus = row.listingStatus === "ACTIVE" && pastEnd ? "ENDED" : row.listingStatus;
  return {
    id: row.id,
    code: row.code,
    order: { id: row.order.id, code: row.order.code, customerName: row.order.customerName, customerContact: row.order.customerContact },
    ebayUrl: row.ebayUrl,
    ebayItemId: row.ebayItemId,
    ebayMarketplace: row.ebayMarketplace,
    seller: row.seller,
    dataSource: row.dataSource,
    fetchedAt: row.fetchedAt?.toISOString() ?? null,
    fetchError: row.fetchError,
    title: row.title,
    subject: row.subject,
    setName: row.setName,
    year: row.year,
    cardNumber: row.cardNumber,
    cardType: row.cardType,
    rarity: row.rarity,
    gradingCompany: row.gradingCompany,
    grade: row.grade,
    certNumber: row.certNumber,
    condition: row.condition,
    description: row.description,
    notes: row.notes,
    listingStatus: row.listingStatus,
    effectiveStatus,
    needsResult: effectiveStatus === "ENDED",
    currency: row.currency,
    currentPrice: numOrNull(row.currentPrice),
    endPrice: numOrNull(row.endPrice),
    bidCount: row.bidCount,
    endsAt: row.endsAt?.toISOString() ?? null,
    feeScheduleId: row.feeScheduleId,
    images: row.images.map(imageDto),
    payments: row.payments.map((p) => ({ id: p.id, amount: num(p.amount), paidAt: p.paidAt.toISOString(), note: p.note })),
    finance: computeItemFinance(row, schedules),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getItemDto(id: string): Promise<ConsignmentItemDTO | null> {
  const [row, schedules] = await Promise.all([prisma.consignmentItem.findUnique({ where: { id }, include: itemInclude }), loadSchedules()]);
  return row ? toItemDto(row, schedules) : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// List + dashboard
// ---------------------------------------------------------------------------------------------------------------------
export interface ItemFilters {
  q?: string;
  customer?: string;
  status?: ListingStatus | "NEEDS_RESULT";
  orderCode?: string;
  /** YYYY-MM-DD, inclusive. Applied to the auction end date, or to the day the card was added when it has no end date. */
  dateFrom?: string;
  dateTo?: string;
}

export function buildWhere(f: ItemFilters): Prisma.ConsignmentItemWhereInput {
  const and: Prisma.ConsignmentItemWhereInput[] = [];
  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { ebayItemId: { contains: q } },
        { certNumber: { contains: q, mode: "insensitive" } },
        { order: { code: { contains: q, mode: "insensitive" } } },
        { order: { customerName: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (f.customer?.trim()) and.push({ order: { customerName: { contains: f.customer.trim(), mode: "insensitive" } } });
  if (f.orderCode?.trim()) and.push({ order: { code: { contains: f.orderCode.trim(), mode: "insensitive" } } });
  if (f.status === "NEEDS_RESULT") {
    and.push({ OR: [{ listingStatus: "ENDED" }, { listingStatus: "ACTIVE", endsAt: { lt: new Date() } }] });
  } else if (f.status === "ACTIVE") {
    and.push({ listingStatus: "ACTIVE", OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] });
  } else if (f.status) {
    and.push({ listingStatus: f.status });
  }
  // Vietnam time (UTC+7), same as the rest of the app's date filters.
  const start = f.dateFrom ? new Date(`${f.dateFrom}T00:00:00+07:00`) : null;
  const end = f.dateTo ? new Date(`${f.dateTo}T23:59:59.999+07:00`) : null;
  if ((start && !Number.isNaN(start.getTime())) || (end && !Number.isNaN(end.getTime()))) {
    const range: Prisma.DateTimeFilter = {};
    if (start && !Number.isNaN(start.getTime())) range.gte = start;
    if (end && !Number.isNaN(end.getTime())) range.lte = end;
    and.push({ OR: [{ endsAt: range }, { endsAt: null, createdAt: range }] });
  }
  return and.length ? { AND: and } : {};
}

const SORTABLE = ["createdAt", "endsAt", "code", "title"] as const;

export async function listItems(filters: ItemFilters, opts: { page: number; pageSize: number; sortBy?: string; sortDir?: "asc" | "desc" }) {
  const where = buildWhere(filters);
  const sortBy = (SORTABLE as readonly string[]).includes(opts.sortBy ?? "") ? (opts.sortBy as (typeof SORTABLE)[number]) : "createdAt";
  const [total, rows, schedules] = await Promise.all([
    prisma.consignmentItem.count({ where }),
    prisma.consignmentItem.findMany({
      where,
      include: itemInclude,
      orderBy: { [sortBy]: opts.sortDir ?? "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    loadSchedules(),
  ]);
  const now = new Date();
  return { total, rows: rows.map((r) => toItemDto(r, schedules, now)) };
}

/** Dashboard totals over every card that matches the filters. Money totals only count cards whose End price is confirmed. */
export async function summarize(filters: ItemFilters): Promise<ConsignmentSummary> {
  const [rows, schedules] = await Promise.all([
    prisma.consignmentItem.findMany({
      where: buildWhere(filters),
      select: {
        listingStatus: true, currency: true, currentPrice: true, endPrice: true, endsAt: true, createdAt: true, feeScheduleId: true,
        payments: { select: { amount: true } },
      },
    }),
    loadSchedules(),
  ]);
  const now = Date.now();
  const s: ConsignmentSummary = {
    totalCards: rows.length, soldCards: 0, pendingResultCards: 0, totalEndPrice: 0, totalProbsteinFee: 0, totalMyFee: 0,
    totalCustomerPayout: 0, totalPaid: 0, totalRemaining: 0, uncalculatedSold: 0,
  };
  for (const r of rows) {
    const finance = computeItemFinance(r, schedules);
    s.totalPaid += finance.paid;
    const ended = r.listingStatus === "ENDED" || (r.listingStatus === "ACTIVE" && r.endsAt !== null && r.endsAt.getTime() < now);
    if (ended) s.pendingResultCards += 1;
    if (r.listingStatus !== "SOLD") continue;
    s.soldCards += 1;
    if (finance.basis !== "FINAL" || !finance.fees) {
      s.uncalculatedSold += 1;
      continue;
    }
    s.totalEndPrice += finance.fees.endPrice;
    s.totalProbsteinFee += finance.fees.probsteinFee;
    s.totalMyFee += finance.fees.myFee;
    s.totalCustomerPayout += finance.fees.customerPayout;
    s.totalRemaining += finance.remaining ?? 0;
  }
  for (const k of ["totalEndPrice", "totalProbsteinFee", "totalMyFee", "totalCustomerPayout", "totalPaid", "totalRemaining"] as const) s[k] = round2(s[k]);
  return s;
}

export const itemRelations = itemInclude;
