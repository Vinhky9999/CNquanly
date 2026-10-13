import { z } from "zod";

const money = (label: string) => z.coerce.number({ invalid_type_error: `${label} không hợp lệ` }).min(0, `${label} không được âm`);

export const gradingSchema = z.object({
  customerName: z.string().trim().min(1, "Vui lòng nhập tên khách hàng"),
  customerContact: z.string().trim().optional(),
  cardName: z.string().trim().min(1, "Vui lòng nhập tên thẻ"),
  sku: z.string().trim().optional(),
  certNumber: z.string().trim().optional(),
  company: z.string().trim().min(1, "Vui lòng chọn hãng chấm điểm"),
  tier: z.string().trim().min(1, "Vui lòng chọn gói chấm điểm"),
  quantity: z.coerce.number().int("Số lượng phải là số nguyên").min(1, "Số lượng tối thiểu là 1"),
  listedFee: money("Phí niêm yết"),
  costPrice: money("Giá gốc"),
  markup: money("Tiền lãi dịch vụ"),
  status: z.enum(["PENDING_SEND", "AT_GRADER", "SHIPPING_BACK", "COMPLETED"]),
  notes: z.string().trim().optional(),
  // Checkboxes arrive as "on" when ticked and are absent otherwise.
  collectPayment: z.string().optional(),
  payCost: z.string().optional(),
});

export type GradingInput = z.infer<typeof gradingSchema>;
