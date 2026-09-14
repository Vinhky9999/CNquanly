import { z } from "zod";

import { isStructuredName } from "@/lib/utils";

const sealedStockStatus = z
  .enum(["IN_STOCK", "IN_TRANSIT", "PRE_ORDER", "ON_HOLD"])
  .default("IN_STOCK");

// Used by the "Thêm hàng" (add stock) form — this is a purchase/restock action,
// so it always records at least 1 unit at a real cost (see createSealedProductAction).
export const sealedProductCreateSchema = z.object({
  sku: z.string().min(1, "Vui lòng nhập mã SKU"),
  name: z
    .string()
    .min(1, "Vui lòng nhập đủ Game, Set và Loại Box")
    .refine(isStructuredName, "Tên sản phẩm phải đúng cấu trúc Game - Set - Loại Box"),
  game: z.string().optional(),
  quantity: z.coerce.number().int().min(1, "Số lượng phải lớn hơn 0"),
  costPrice: z.coerce.number().min(0, "Giá nhập không được âm"),
  status: sealedStockStatus,
  notes: z.string().optional(),
});

export type SealedProductCreateInput = z.infer<typeof sealedProductCreateSchema>;

// Used by the edit form — direct field correction, no purchase/cash-flow side effects.
export const sealedProductEditSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên Box/Case"),
  game: z.string().optional(),
  quantity: z.coerce.number().int().min(0, "Số lượng không được âm"),
  costPrice: z.coerce.number().min(0, "Giá nhập không được âm"),
  status: sealedStockStatus,
  notes: z.string().optional(),
});

export type SealedProductEditInput = z.infer<typeof sealedProductEditSchema>;
