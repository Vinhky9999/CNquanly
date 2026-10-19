import { z } from "zod";

export const PAYMENT_METHODS = ["BANK_TRANSFER", "CASH", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Chuyển khoản",
  CASH: "Tiền mặt",
  OTHER: "Khác",
};

export const paymentMethodLabel = (value: string | null | undefined) =>
  value && value in PAYMENT_METHOD_LABELS ? PAYMENT_METHOD_LABELS[value as PaymentMethod] : null;

// Chốt đơn từ khung chat Page: một hoặc nhiều sản phẩm trong kho, hoặc chỉ một khoản tiền đã nhận.
export const chatOrderSchema = z
  .object({
    conversationId: z.string().min(1, "Thiếu hội thoại"),
    idempotencyKey: z.string().min(8).max(80),
    paymentMethod: z.enum(PAYMENT_METHODS),
    items: z
      .array(
        z.object({
          itemType: z.enum(["SEALED", "SINGLE"]),
          itemId: z.string().min(1),
          quantity: z.number().int().min(1, "Số lượng tối thiểu là 1"),
          unitPrice: z.number().min(0, "Giá bán không được âm"),
        })
      )
      .max(30, "Tối đa 30 dòng sản phẩm mỗi đơn"),
    /** Only used when there are no product lines (deposit, service, anything not tied to stock). */
    amount: z.number().positive("Số tiền phải lớn hơn 0").optional(),
    description: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(500).optional(),
    delivery: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.items.length === 0 && !data.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chọn sản phẩm hoặc nhập số tiền khách đã thanh toán",
        path: ["amount"],
      });
    }
  });

export type ChatOrderInput = z.infer<typeof chatOrderSchema>;
