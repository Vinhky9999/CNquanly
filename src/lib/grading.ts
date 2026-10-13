import type { GradingStatus } from "@prisma/client";

// Hãng chấm điểm và các gói dịch vụ phổ biến. Mức phí niêm yết thay đổi theo từng thời điểm nên
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
  markup: number;
  chargeAmount: number;
}

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}₫`;

function head(s: DescribableSubmission) {
  return `Chấm điểm ${s.company} ${s.tier} · ${s.customerName} · ${s.cardName}${s.quantity > 1 ? ` (x${s.quantity})` : ""}`;
}

/** Mô tả dòng thu của khách: ghi rõ doanh thu = giá gốc + lãi dịch vụ. */
export function gradingIncomeDescription(s: DescribableSubmission): string {
  return `${head(s)} — Thu ${vnd(s.chargeAmount)} (giá gốc ${vnd(s.costPrice)} + lãi ${vnd(s.markup)})`;
}

/** Mô tả dòng chi trả phí gốc cho hãng. */
export function gradingCostDescription(s: DescribableSubmission): string {
  return `${head(s)} — Trả phí gốc ${vnd(s.costPrice)}`;
}

interface AggregatableItem {
  cardName: string;
  company: string;
  tier: string;
  quantity: number;
  listedFee: number;
  costPrice: number;
  markup: number;
}

/** Tổng hợp các thẻ của đơn vào các cột của GradingSubmission (hiển thị, thống kê và Dòng tiền dùng). */
export function aggregateItems(items: AggregatableItem[]) {
  const companies = [...new Set(items.map((i) => i.company))];
  const tiers = [...new Set(items.map((i) => i.tier))];
  const costPrice = items.reduce((s, i) => s + i.costPrice, 0);
  const markup = items.reduce((s, i) => s + i.markup, 0);
  return {
    cardName: items.length > 1 ? `${items[0].cardName} +${items.length - 1} thẻ khác` : items[0].cardName,
    company: companies.join(" + "),
    tier: tiers.length === 1 ? tiers[0] : "Nhiều gói",
    quantity: items.reduce((s, i) => s + i.quantity, 0),
    listedFee: items.reduce((s, i) => s + i.listedFee, 0),
    costPrice,
    markup,
    chargeAmount: costPrice + markup,
  };
}
