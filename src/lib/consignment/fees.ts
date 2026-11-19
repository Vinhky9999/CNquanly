import { z } from "zod";

// Fee logic for consignment (USD). Pure functions, no database: the server computes with them and the settings screen
// uses the same code for its live calculator, so the two can never disagree.
//
//   END PRICE        = final eBay auction price
//   Probstein Fee    = from the configured schedule (percent and / or fixed parts, optional minimum)
//   My Profit        = END PRICE x service rate (5% by default), taken straight from END PRICE
//   Total Fee        = Probstein Fee + My Profit
//   CUSTOMER PAYOUT  = END PRICE - Probstein Fee - My Profit
//
// All money is handled in integer cents, and every fee is rounded half-up to the cent once, so
// payout + probsteinFee + myFee always equals the end price exactly.

export const DEFAULT_SERVICE_RATE = 5;

export type FeeMode = "FLAT_BY_BAND" | "MARGINAL";

export interface FeeTier {
  /** Lower bound in USD (price >= from). */
  from: number;
  /** Upper bound in USD (price < to); null = no upper bound. */
  to: number | null;
  /** Probstein percentage of the price (e.g. 10 = 10%). */
  percent: number;
  /** Fixed part in USD. */
  fixed: number;
}

export interface FeeSchedule {
  mode: FeeMode;
  /** My service fee, % of END PRICE. */
  serviceRate: number;
  /** Minimum Probstein fee in USD, when the schedule has one. */
  minimumFee: number | null;
  tiers: FeeTier[];
}

export interface FeeResult {
  endPrice: number;
  probsteinFee: number;
  myFee: number;
  totalFee: number;
  customerPayout: number;
  /** Which part of the schedule produced the Probstein fee, for display. */
  breakdown: { label: string; amount: number }[];
}

export const toCents = (usd: number) => Math.round(usd * 100);
export const fromCents = (cents: number) => cents / 100;

/** Percent of an amount in cents, rounded half-up to the cent. The percent keeps up to 4 decimals. */
function percentOfCents(cents: number, percent: number): number {
  const basisPoints = Math.round(percent * 10_000); // 10.5% -> 105000
  return Math.floor((cents * basisPoints + 500_000) / 1_000_000);
}

/** Validates a schedule: tiers must start at 0, follow each other without gaps or overlaps, and the last one is open-ended. */
export function validateSchedule(schedule: FeeSchedule): string | null {
  if (!(schedule.serviceRate >= 0 && schedule.serviceRate <= 100)) return "Phí dịch vụ của shop phải từ 0% đến 100%";
  if (schedule.minimumFee != null && schedule.minimumFee < 0) return "Phí tối thiểu không được âm";
  const { tiers } = schedule;
  if (tiers.length === 0) return "Biểu phí cần ít nhất 1 mức phí";
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (t.percent < 0 || t.percent > 100) return `Mức ${i + 1}: phần trăm phải từ 0% đến 100%`;
    if (t.fixed < 0) return `Mức ${i + 1}: phí cố định không được âm`;
    if (t.to != null && t.to <= t.from) return `Mức ${i + 1}: giá "đến" phải lớn hơn giá "từ"`;
    if (i === 0 && t.from !== 0) return "Mức đầu tiên phải bắt đầu từ $0";
    if (i > 0 && tiers[i - 1].to !== t.from) return `Mức ${i + 1} phải bắt đầu đúng tại giá kết thúc của mức ${i} (không để hở hoặc chồng)`;
    if (t.to == null && i !== tiers.length - 1) return `Chỉ mức cuối cùng được để trống giá "đến" (trở lên)`;
  }
  if (tiers[tiers.length - 1].to != null) return 'Mức cuối cùng phải là "trở lên" (để trống giá "đến") để mọi mức giá đều có phí';
  return null;
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Probstein fee in cents for an end price in cents, with a breakdown of the parts that were applied. */
export function probsteinFeeCents(endCents: number, schedule: FeeSchedule): { cents: number; breakdown: { label: string; amount: number }[] } {
  const parts: { label: string; cents: number }[] = [];
  const tiers = schedule.tiers;

  if (schedule.mode === "FLAT_BY_BAND") {
    const tier = tiers.find((t) => endCents >= toCents(t.from) && (t.to == null || endCents < toCents(t.to)));
    if (!tier) throw new Error("Biểu phí không có mức nào áp dụng cho giá này");
    const band = tier.to == null ? `từ ${usd(tier.from)} trở lên` : `${usd(tier.from)} – dưới ${usd(tier.to)}`;
    if (tier.percent > 0) parts.push({ label: `${tier.percent}% (mức ${band})`, cents: percentOfCents(endCents, tier.percent) });
    if (tier.fixed > 0) parts.push({ label: `Phí cố định ${usd(tier.fixed)} (mức ${band})`, cents: toCents(tier.fixed) });
  } else {
    for (const tier of tiers) {
      const from = toCents(tier.from);
      if (endCents <= from) continue; // the price does not reach this band
      const to = tier.to == null ? endCents : Math.min(endCents, toCents(tier.to));
      const slice = to - from;
      const band = tier.to == null ? `phần giá từ ${usd(tier.from)} trở lên` : `phần giá ${usd(tier.from)} – ${usd(tier.to)}`;
      if (tier.percent > 0) parts.push({ label: `${tier.percent}% của ${band}`, cents: percentOfCents(slice, tier.percent) });
      if (tier.fixed > 0) parts.push({ label: `Phí cố định ${usd(tier.fixed)} (${band})`, cents: toCents(tier.fixed) });
    }
  }

  let total = parts.reduce((s, p) => s + p.cents, 0);
  if (schedule.minimumFee != null && total < toCents(schedule.minimumFee)) {
    const min = toCents(schedule.minimumFee);
    parts.push({ label: `Nâng lên mức phí tối thiểu ${usd(schedule.minimumFee)}`, cents: min - total });
    total = min;
  }
  return { cents: total, breakdown: parts.map((p) => ({ label: p.label, amount: fromCents(p.cents) })) };
}

/** The whole calculation for one END PRICE (USD). */
export function computeFees(endPrice: number, schedule: FeeSchedule): FeeResult {
  if (!(endPrice >= 0)) throw new Error("Giá End không hợp lệ");
  const endCents = toCents(endPrice);
  const probstein = probsteinFeeCents(endCents, schedule);
  // My fee is a percentage of the END PRICE itself, not of what is left after Probstein's fee.
  const myCents = percentOfCents(endCents, schedule.serviceRate);
  const totalCents = probstein.cents + myCents;
  return {
    endPrice: fromCents(endCents),
    probsteinFee: fromCents(probstein.cents),
    myFee: fromCents(myCents),
    totalFee: fromCents(totalCents),
    customerPayout: fromCents(endCents - totalCents),
    breakdown: probstein.breakdown,
  };
}

// ---- schedule form / API validation -------------------------------------------------------------------------------

const money = (label: string) => z.coerce.number({ invalid_type_error: `${label} không hợp lệ` }).min(0, `${label} không được âm`);

export const feeScheduleInputSchema = z
  .object({
    name: z.string().trim().min(1, "Nhập tên phiên bản biểu phí").max(80, "Tên tối đa 80 ký tự"),
    effectiveFrom: z.coerce.date({ invalid_type_error: "Ngày hiệu lực không hợp lệ" }),
    mode: z.enum(["FLAT_BY_BAND", "MARGINAL"]),
    serviceRate: z.coerce.number({ invalid_type_error: "Phí dịch vụ không hợp lệ" }).min(0, "Phí dịch vụ không được âm").max(100, "Phí dịch vụ tối đa 100%"),
    minimumFee: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), money("Phí tối thiểu").nullable()),
    note: z.string().trim().max(500, "Ghi chú tối đa 500 ký tự").optional(),
    tiers: z
      .array(
        z.object({
          from: money("Giá từ"),
          to: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), money("Giá đến").nullable()),
          percent: money("Phần trăm").max(100, "Phần trăm tối đa 100%"),
          fixed: money("Phí cố định"),
        })
      )
      .min(1, "Biểu phí cần ít nhất 1 mức phí")
      .max(30, "Tối đa 30 mức phí"),
  })
  .superRefine((v, ctx) => {
    const problem = validateSchedule({ mode: v.mode, serviceRate: v.serviceRate, minimumFee: v.minimumFee, tiers: v.tiers });
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ["tiers"] });
  });

export type FeeScheduleInput = z.infer<typeof feeScheduleInputSchema>;
