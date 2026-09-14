import { z } from "zod";

export const saleTransactionSchema = z
  .object({
    itemType: z.enum(["SEALED", "SINGLE"]),
    itemId: z.string().min(1),
    quantity: z.coerce.number().int().min(1).default(1),
    unitPrice: z.coerce.number().min(0, "Giá bán không được âm"),
    customerId: z.string().optional(),
    newCustomerName: z.string().optional(),
    notes: z.string().optional(),
    orderType: z.enum(["DIRECT", "DELIVERY"]).default("DIRECT"),
    trackingCode: z.string().optional(),
    shippingCarrier: z.string().optional(),
    recipientName: z.string().optional(),
    recipientPhone: z.string().optional(),
    recipientAddress: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.orderType !== "DELIVERY") return;

    if (!data.trackingCode?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng nhập mã tracking",
        path: ["trackingCode"],
      });
    }
    if (!data.shippingCarrier?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng nhập đơn vị vận chuyển",
        path: ["shippingCarrier"],
      });
    }
    if (!data.customerId && !data.recipientName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng chọn khách hàng có sẵn hoặc nhập tên người nhận",
        path: ["recipientName"],
      });
    }
  });

export type SaleTransactionInput = z.infer<typeof saleTransactionSchema>;

export const purchaseTransactionSchema = z.object({
  description: z.string().min(1, "Vui lòng nhập mô tả giao dịch mua"),
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
});

export type PurchaseTransactionInput = z.infer<typeof purchaseTransactionSchema>;
