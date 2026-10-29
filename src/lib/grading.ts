import type { GradingStatus } from "@prisma/client";

// Hãng chấm điểm và các gói dịch vụ phổ biến. Giá dịch vụ thay đổi theo từng thời điểm nên
// được nhập tay trên mỗi đơn; "Khác" cho phép nhập hãng / gói riêng.
export const GRADING_COMPANIES = ["PSA", "BGS", "ARS", "CGC", "Khác"] as const;

export const GRADING_TIERS: Record<string, string[]> = {
  PSA: ["Value Bulk", "Value", "Regular", "Express", "Super Express", "Walk-Through"],
  BGS: ["Economy", "Standard", "Express", "Premium"],
  ARS: ["Regular", "Express", "Bulk"],
  CGC: ["Economy", "Standard", "Express", "Walk-Through"],
  Khác: ["Regular", "Express", "Bulk", "Super Express"],
};

export const GRADING_STATUSES: GradingStatus[] = ["PENDING_SEND", "AT_GRADER", "SHIPPING_BACK", "COMPLETED"];

export const gradingStatusLabel: Record<GradingStatus, string> = {
  PENDING_SEND: "Chờ gửi hãng",
  AT_GRADER: "Đang chấm tại hãng",
  SHIPPING_BACK: "Đang vận chuyển về",
  COMPLETED: "Đã trả khách",
};

export const gradingStatusVariant: Record<GradingStatus, "slate" | "warning" | "indigo" | "success"> = {
  PENDING_SEND: "slate",
  AT_GRADER: "warning",
  SHIPPING_BACK: "indigo",
  COMPLETED: "success",
};

interface DescribableSubmission {
  customerName: string;
  cardName: string;
  company: string;
  tier: string;
  quantity: number;
  costPrice: number;
  shipFee: number;
  markup: number;
  chargeAmount: number;
}

/** Lãi dịch vụ = Giá dịch vụ - Giá gốc - Phí ship (có thể âm nếu bán dưới chi phí). */
export const serviceProfit = (servicePrice: number, costPrice: number, shipFee: number) =>
  servicePrice - costPrice - shipFee;

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}₫`;

function head(s: DescribableSubmission) {
  return `Chấm điểm ${s.company} ${s.tier} · ${s.customerName} · ${s.cardName}${s.quantity > 1 ? ` (x${s.quantity})` : ""}`;
}

/** Mô tả dòng thu của khách: tiền thu = giá dịch vụ, kèm giá gốc, phí ship và lãi. */
export function gradingIncomeDescription(s: DescribableSubmission): string {
  const ship = s.shipFee > 0 ? ` + ship ${vnd(s.shipFee)}` : "";
  return `${head(s)} — Thu giá dịch vụ ${vnd(s.chargeAmount)} (giá gốc ${vnd(s.costPrice)}${ship} · lãi ${vnd(s.markup)})`;
}

/** Số tiền shop phải chi cho đơn: phí gốc trả hãng cộng phí ship. */
export const gradingCostTotal = (s: { costPrice: number; shipFee: number }) => s.costPrice + s.shipFee;

/** Mô tả dòng chi trả phí gốc (và ship) cho hãng. */
export function gradingCostDescription(s: DescribableSubmission): string {
  const ship = s.shipFee > 0 ? ` + ship ${vnd(s.shipFee)}` : "";
  return `${head(s)} — Trả phí gốc ${vnd(s.costPrice)}${ship}`;
}

interface AggregatableItem {
  cardName: string;
  company: string;
  tier: string;
  quantity: number;
  listedFee: number;
  costPrice: number;
  shipFee: number;
  markup: number;
}

/** Tổng hợp các thẻ của đơn vào các cột của GradingSubmission (hiển thị, thống kê và Dòng tiền dùng). */
export function aggregateItems(items: AggregatableItem[]) {
  const companies = [...new Set(items.map((i) => i.company))];
  const tiers = [...new Set(items.map((i) => i.tier))];
  const costPrice = items.reduce((s, i) => s + i.costPrice, 0);
  const shipFee = items.reduce((s, i) => s + i.shipFee, 0);
  const markup = items.reduce((s, i) => s + i.markup, 0);
  const servicePrice = items.reduce((s, i) => s + i.listedFee, 0);
  return {
    cardName: items.length > 1 ? `${items[0].cardName} +${items.length - 1} thẻ khác` : items[0].cardName,
    company: companies.join(" + "),
    tier: tiers.length === 1 ? tiers[0] : "Nhiều gói",
    quantity: items.reduce((s, i) => s + i.quantity, 0),
    listedFee: servicePrice,
    costPrice,
    shipFee,
    markup,
    // Khách trả = tổng Giá dịch vụ của các thẻ.
    chargeAmount: servicePrice,
  };
}
