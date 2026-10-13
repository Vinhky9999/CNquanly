import { z } from "zod";

const money = (label: string) =>
  z.coerce.number({ invalid_type_error: `${label} không hợp lệ` }).min(0, `${label} không được âm`);

export const gradingItemSchema = z.object({
  cardName: z.string().trim().min(1, "Mỗi thẻ phải có tên lá bài"),
  game: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  certNumber: z.string().trim().optional(),
  company: z.string().trim().min(1, "Vui lòng chọn hãng chấm điểm cho từng thẻ"),
  tier: z.string().trim().min(1, "Vui lòng chọn gói chấm điểm cho từng thẻ"),
  quantity: z.coerce.number().int("Số lượng phải là số nguyên").min(1, "Số lượng tối thiểu là 1"),
  listedFee: money("Phí niêm yết"),
  costPrice: money("Giá gốc"),
  markup: money("Tiền lãi dịch vụ"),
});

export type GradingItemInput = z.infer<typeof gradingItemSchema>;

export const gradingSchema = z.object({
  customerName: z.string().trim().min(1, "Vui lòng nhập tên khách hàng"),
  customerContact: z.string().trim().optional(),
  status: z.enum(["PENDING_SEND", "AT_GRADER", "SHIPPING_BACK", "COMPLETED"]),
  notes: z.string().trim().optional(),
  // JSON array of cards, serialized by the form.
  items: z.string().min(2, "Đơn phải có ít nhất 1 thẻ bài"),
  // Checkboxes arrive as "on" when ticked and are absent otherwise.
  collectPayment: z.string().optional(),
  payCost: z.string().optional(),
});

export type GradingInput = z.infer<typeof gradingSchema>;
