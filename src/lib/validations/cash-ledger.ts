import { z } from "zod";

export const cashAdjustmentSchema = z.object({
  amount: z.coerce.number().refine((v) => v !== 0, "Số tiền không được bằng 0"),
  description: z.string().min(1, "Vui lòng nhập lý do điều chỉnh"),
});

export type CashAdjustmentInput = z.infer<typeof cashAdjustmentSchema>;

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
