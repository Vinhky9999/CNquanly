import { z } from "zod";

export const shippingUpdateSchema = z.object({
  trackingCode: z.string().min(1, "Vui lòng nhập mã tracking"),
  shippingCarrier: z.string().min(1, "Vui lòng nhập đơn vị vận chuyển"),
  recipientName: z.string().min(1, "Vui lòng nhập tên người nhận"),
  recipientPhone: z.string().optional(),
  recipientAddress: z.string().optional(),
  notes: z.string().optional(),
});

export type ShippingUpdateInput = z.infer<typeof shippingUpdateSchema>;
