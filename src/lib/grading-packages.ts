import { z } from "zod";

// Gói chấm điểm của từng hãng (bảng giá). Giá gốc của hãng niêm yết bằng USD; bảng giá ban đầu quy đổi 26.000 đ / USD.
export const USD_RATE = 26000;

export interface GradingPackageRow {
  id: string;
  company: string;
  tier: string;
  /** Thời gian dự kiến (tháng), ví dụ "4-5" hoặc "<1". */
  estimate: string;
  priceUsd: number | null;
  /** Giá gốc / thẻ (VND): phí trả hãng. */
  costPrice: number;
  /** Giá chấm / thẻ (VND): Giá dịch vụ thu của khách. */
  servicePrice: number;
  position: number;
}

export const packageKey = (company: string, tier: string) => `${company.trim().toLowerCase()}|${tier.trim().toLowerCase()}`;

const money = (label: string) => z.coerce.number({ invalid_type_error: `${label} không hợp lệ` }).min(0, `${label} không được âm`);

export const gradingPackageSchema = z.object({
  company: z.string().trim().min(1, "Nhập tên hãng chấm điểm").max(40, "Tên hãng tối đa 40 ký tự"),
  tier: z.string().trim().min(1, "Nhập tên gói").max(60, "Tên gói tối đa 60 ký tự"),
  estimate: z.string().trim().max(20, "Thời gian tối đa 20 ký tự").default(""),
  // Empty = no USD price (the owner only knows the VND figures).
  priceUsd: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), money("Giá USD").nullable()),
  costPrice: money("Giá gốc"),
  servicePrice: money("Giá chấm"),
});

export type GradingPackageInput = z.infer<typeof gradingPackageSchema>;
