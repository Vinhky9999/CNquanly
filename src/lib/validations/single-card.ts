import { z } from "zod";

const baseFields = {
  game: z.string().optional(),
  costPrice: z.coerce.number().min(0, "Giá nhập không được âm"),
  // "Điểm số" từ hãng Grading (10, 9.5, 9, ...) — tuỳ chọn, bỏ trống khi là thẻ
  // Raw (chưa chấm điểm). Sentinel "NONE" từ dropdown coi như không chọn.
  grade: z.preprocess((val) => {
    if (typeof val !== "string") return val;
    const trimmed = val.trim();
    return !trimmed || trimmed === "NONE" ? undefined : trimmed;
  }, z.coerce.number().min(0, "Điểm số không hợp lệ").max(10, "Điểm số không hợp lệ").optional()),
  // URL ảnh thẻ — tuỳ chọn, bỏ trống coi như "không có ảnh".
  imageUrl: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().trim().url("Đường dẫn ảnh không hợp lệ").optional()
  ),
};

// Used by the "Thêm hàng" (add stock) form. The name builder concatenates 5
// discrete fields (Dòng game, Tên Set, Tên thẻ, Mã thẻ, Độ hiếm) client-side —
// by the time this reaches the server it's already one composed string.
// `quantity` lets bulk-identical Raw cards be added in one go, merging into an
// existing SKU with weighted-average cost the same way Sealed restocks do.
export const singleCardCreateSchema = z.discriminatedUnion("condition", [
  z.object({
    condition: z.literal("RAW"),
    cardName: z.string().min(1, "Vui lòng nhập đầy đủ Dòng game, Set, Tên thẻ, Mã thẻ và Độ hiếm"),
    rawGrade: z.enum(["S", "A", "B"], { required_error: "Vui lòng chọn hạng Raw" }),
    quantity: z.coerce.number().int().min(1, "Số lượng phải lớn hơn 0").default(1),
    ...baseFields,
  }),
  z.object({
    condition: z.literal("GRADED"),
    cardName: z.string().min(1, "Vui lòng nhập đầy đủ Dòng game, Set, Tên thẻ, Mã thẻ và Độ hiếm"),
    gradingCompanyId: z.string().min(1, "Vui lòng chọn hãng chấm điểm"),
    certNumber: z.string().min(1, "Vui lòng nhập mã Cert"),
    quantity: z.coerce.number().int().min(1).default(1),
    ...baseFields,
  }),
]);

export type SingleCardCreateInput = z.infer<typeof singleCardCreateSchema>;

// Used by the edit form — direct field correction, free-text name.
export const singleCardEditSchema = z.discriminatedUnion("condition", [
  z.object({
    condition: z.literal("RAW"),
    cardName: z.string().min(1, "Vui lòng nhập tên lá bài"),
    rawGrade: z.enum(["S", "A", "B"], { required_error: "Vui lòng chọn hạng Raw" }),
    ...baseFields,
  }),
  z.object({
    condition: z.literal("GRADED"),
    cardName: z.string().min(1, "Vui lòng nhập tên lá bài"),
    gradingCompanyId: z.string().min(1, "Vui lòng chọn hãng chấm điểm"),
    certNumber: z.string().min(1, "Vui lòng nhập mã Cert"),
    ...baseFields,
  }),
]);

export type SingleCardEditInput = z.infer<typeof singleCardEditSchema>;
