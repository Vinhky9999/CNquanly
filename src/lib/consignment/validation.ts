import { z } from "zod";

// An empty form box means "no value" (null), but a field that is simply not sent must stay untouched (undefined):
// otherwise a partial update such as "confirm sold" would wipe every other field.
const blankToNull = (v: unknown) => (v === "" || (typeof v === "string" && v.trim() === "") ? null : v);

const text = (max: number, label = "Giá trị") => z.string().trim().max(max, `${label} tối đa ${max} ký tự`);
const optText = (max: number) => z.preprocess(blankToNull, text(max).nullable().optional());
const optMoney = (label: string) =>
  z.preprocess(blankToNull, z.coerce.number({ invalid_type_error: `${label} không hợp lệ` }).min(0, `${label} không được âm`).max(1_000_000_000, `${label} quá lớn`).nullable().optional());
const optDate = z.preprocess(blankToNull, z.coerce.date({ invalid_type_error: "Ngày kết thúc không hợp lệ" }).nullable().optional());

export const LISTING_STATUSES = ["ACTIVE", "ENDED", "SOLD", "UNSOLD"] as const;
export const MAX_IMAGES = 12;
export const MAX_UPLOAD_BYTES = 1_500_000;

/** An image typed into the form: a data URL from the browser (already shrunk) or an eBay photo link. */
const dataUrl = z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Ảnh tải lên phải là JPEG, PNG hoặc WebP");

const cardFields = {
  title: text(300, "Tên sản phẩm").min(1, "Nhập tên sản phẩm"),
  subject: optText(120),
  setName: optText(160),
  year: optText(20),
  cardNumber: optText(40),
  cardType: optText(80),
  rarity: optText(80),
  gradingCompany: optText(40),
  grade: optText(20),
  certNumber: optText(40),
  condition: optText(120),
  description: optText(6000),
  notes: optText(1000),
};

const auctionFields = {
  seller: optText(80),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Mã tiền tệ không hợp lệ").default("USD"),
  currentPrice: optMoney("Giá hiện tại"),
  bidCount: z.preprocess(blankToNull, z.coerce.number().int("Số lượt đấu giá phải là số nguyên").min(0).max(100000).nullable().optional()),
  endsAt: optDate,
  listingStatus: z.enum(LISTING_STATUSES).default("ACTIVE"),
  endPrice: optMoney("Giá End"),
  feeScheduleId: z.preprocess(blankToNull, z.string().nullable().optional()),
};

export const createItemSchema = z
  .object({
    // Add to an existing order (its customer is used), or start a new order for this customer.
    orderCode: optText(40),
    customerName: optText(120),
    customerContact: optText(160),
    ebayUrl: optText(500),
    ebayItemId: z.preprocess(blankToNull, z.string().regex(/^\d{9,14}$/, "Item ID eBay phải gồm 9–14 chữ số").nullable().optional()),
    ebayMarketplace: optText(20),
    dataSource: z.enum(["EBAY_API", "MANUAL"]).default("MANUAL"),
    ...cardFields,
    ...auctionFields,
    // Photos: eBay photo links (a copy is downloaded) and uploads typed in by hand.
    imageUrls: z.array(z.string().url().max(500)).max(MAX_IMAGES).default([]),
    uploads: z.array(dataUrl).max(MAX_IMAGES).default([]),
  })
  .superRefine((v, ctx) => {
    if (!v.orderCode && !v.customerName) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nhập tên khách hàng (hoặc chọn một đơn ký gửi có sẵn)", path: ["customerName"] });
    if (v.listingStatus === "SOLD" && !(v.endPrice && v.endPrice > 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Đã bán thì phải nhập giá End lớn hơn 0", path: ["endPrice"] });
    if (v.imageUrls.length + v.uploads.length > MAX_IMAGES) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Tối đa ${MAX_IMAGES} ảnh cho mỗi thẻ`, path: ["uploads"] });
  });

export type CreateItemInput = z.infer<typeof createItemSchema>;

/** Editing a card: every field optional, only what is sent changes. */
export const updateItemSchema = z
  .object({
    customerName: optText(120),
    customerContact: optText(160),
    ebayUrl: optText(500),
    title: cardFields.title.optional(),
    subject: cardFields.subject,
    setName: cardFields.setName,
    year: cardFields.year,
    cardNumber: cardFields.cardNumber,
    cardType: cardFields.cardType,
    rarity: cardFields.rarity,
    gradingCompany: cardFields.gradingCompany,
    grade: cardFields.grade,
    certNumber: cardFields.certNumber,
    condition: cardFields.condition,
    description: cardFields.description,
    notes: cardFields.notes,
    seller: auctionFields.seller,
    currency: auctionFields.currency.optional(),
    currentPrice: auctionFields.currentPrice,
    bidCount: auctionFields.bidCount,
    endsAt: auctionFields.endsAt,
    listingStatus: z.enum(LISTING_STATUSES).optional(),
    endPrice: auctionFields.endPrice,
    feeScheduleId: auctionFields.feeScheduleId,
  })
  .strict();

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const paymentSchema = z.object({
  amount: z.coerce.number({ invalid_type_error: "Số tiền không hợp lệ" }).positive("Số tiền thanh toán phải lớn hơn 0").max(1_000_000_000, "Số tiền quá lớn"),
  paidAt: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.date({ invalid_type_error: "Ngày thanh toán không hợp lệ" }).optional()),
  note: optText(300),
});

export const uploadSchema = z.object({ uploads: z.array(dataUrl).min(1, "Chọn ít nhất 1 ảnh").max(MAX_IMAGES) });

/** Decodes a validated data URL. Returns null when it is too large. */
export function decodeDataUrl(url: string): { data: Buffer; contentType: string } | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(url);
  if (!match) return null;
  const data = Buffer.from(match[2], "base64");
  return data.length > 0 && data.length <= MAX_UPLOAD_BYTES ? { data, contentType: match[1] } : null;
}
