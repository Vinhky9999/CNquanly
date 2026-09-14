import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên khách hàng"),
  phone: z.string().optional(),
  zalo: z.string().optional(),
  facebook: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  tagIds: z.array(z.string()).optional().default([]),
});

export type CustomerInput = z.infer<typeof customerSchema>;
