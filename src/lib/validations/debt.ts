import { z } from "zod";

export const debtCreateSchema = z.object({
  type: z.enum(["ADVANCED_BY_PERSON", "ADVANCED_TO_PERSON"], {
    required_error: "Vui lòng chọn loại nợ",
  }),
  personName: z.string().min(1, "Vui lòng nhập tên người ứng tiền"),
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  referenceLabel: z.string().optional(),
  notes: z.string().optional(),
});

export type DebtCreateInput = z.infer<typeof debtCreateSchema>;

export const debtPaymentSchema = z.object({
  debtId: z.string().min(1, "Thiếu mã khoản nợ"),
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  note: z.string().optional(),
});

export type DebtPaymentInput = z.infer<typeof debtPaymentSchema>;
