import { z } from "zod";

export const cashAdjustmentSchema = z.object({
  amount: z.coerce.number().refine((v) => v !== 0, "Số tiền không được bằng 0"),
  description: z.string().min(1, "Vui lòng nhập lý do điều chỉnh"),
});

export type CashAdjustmentInput = z.infer<typeof cashAdjustmentSchema>;

// "Rút tiền" — người dùng nhập số tiền muốn rút dưới dạng số dương (dễ hiểu
// hơn), server tự chuyển thành số âm khi ghi vào Dòng Tiền.
export const cashWithdrawalSchema = z.object({
  amount: z.coerce.number().positive("Số tiền rút phải lớn hơn 0"),
  description: z.string().min(1, "Vui lòng nhập lý do rút tiền"),
});

export type CashWithdrawalInput = z.infer<typeof cashWithdrawalSchema>;

// Editing a manual adjustment: both amount and description are free to change.
export const cashEntryEditManualSchema = z.object({
  amount: z.coerce.number().refine((v) => v !== 0, "Số tiền không được bằng 0"),
  description: z.string().min(1, "Vui lòng nhập mô tả"),
});

export type CashEntryEditManualInput = z.infer<typeof cashEntryEditManualSchema>;

// Editing an auto-generated (sale/purchase) entry: only the description is
// safe to change — the amount is derived from the linked order.
export const cashEntryEditDescriptionSchema = z.object({
  description: z.string().min(1, "Vui lòng nhập mô tả"),
});

export type CashEntryEditDescriptionInput = z.infer<typeof cashEntryEditDescriptionSchema>;
