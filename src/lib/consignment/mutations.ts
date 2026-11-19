import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { downloadImage, isAllowedImageUrl } from "@/lib/ebay/client";
import { parseEbayUrl } from "@/lib/ebay/url";
import { toCents, type FeeScheduleInput } from "@/lib/consignment/fees";
import { computeItemFinance, loadSchedules } from "@/lib/consignment/service";
import { MAX_IMAGES, decodeDataUrl, type CreateItemInput, type UpdateItemInput } from "@/lib/consignment/validation";

/** An error whose message is meant to be shown to the owner as it is. */
export class ConsignmentError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Codes: KG<yymmdd>-<nnn> for an order, <order code>-<nn> for each card in it
// ---------------------------------------------------------------------------------------------------------------------
const pad = (n: number, width: number) => String(n).padStart(width, "0");

function vietnamDay(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", year: "2-digit", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}`;
}

async function newOrderCode(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const base = `KG${vietnamDay(now)}`;
  let n = (await tx.consignmentOrder.count({ where: { code: { startsWith: `${base}-` } } })) + 1;
  for (;;) {
    const code = `${base}-${pad(n, 3)}`;
    if (!(await tx.consignmentOrder.findUnique({ where: { code }, select: { id: true } }))) return code;
    n += 1;
  }
}

async function newItemCode(tx: Prisma.TransactionClient, orderId: string, orderCode: string): Promise<string> {
  let n = (await tx.consignmentItem.count({ where: { orderId } })) + 1;
  for (;;) {
    const code = `${orderCode}-${pad(n, 2)}`;
    if (!(await tx.consignmentItem.findUnique({ where: { code }, select: { id: true } }))) return code;
    n += 1;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------------------
async function assertScheduleExists(id: string | null | undefined) {
  if (!id) return;
  if (!(await prisma.consignmentFeeSchedule.findUnique({ where: { id }, select: { id: true } }))) throw new ConsignmentError("Phiên bản biểu phí đã chọn không còn tồn tại.");
}

async function assertNotDuplicate(ebayItemId: string | null | undefined, exceptId?: string) {
  if (!ebayItemId) return;
  const same = await prisma.consignmentItem.findFirst({
    where: { ebayItemId, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { code: true, order: { select: { customerName: true } } },
  });
  if (same) throw new ConsignmentError(`Item ID ${ebayItemId} đã có trong hồ sơ ký gửi (${same.code}, khách ${same.order.customerName}). Mỗi thẻ chỉ nhập một lần.`, 409);
}

/** Downloads copies of eBay photos (a few at a time). A photo that cannot be downloaded is kept as a link only. */
async function copyEbayImages(urls: string[]) {
  const out: { url: string; data: Buffer | null; contentType: string | null }[] = [];
  for (let i = 0; i < urls.length; i += 4) {
    const batch = urls.slice(i, i + 4);
    const done = await Promise.all(batch.map((u) => downloadImage(u)));
    batch.forEach((url, k) => out.push({ url, data: done[k]?.data ?? null, contentType: done[k]?.contentType ?? null }));
  }
  return out;
}

export async function createItem(input: CreateItemInput): Promise<string> {
  await assertScheduleExists(input.feeScheduleId);

  let ebayUrl = input.ebayUrl ?? null;
  let ebayItemId = input.ebayItemId ?? null;
  let marketplace = input.ebayMarketplace ?? null;
  if (ebayUrl) {
    const parsed = parseEbayUrl(ebayUrl);
    if (!parsed.ok) throw new ConsignmentError(parsed.error);
    ebayItemId = parsed.value.itemId;
    marketplace = parsed.value.marketplace;
    ebayUrl = parsed.value.url;
  }
  await assertNotDuplicate(ebayItemId);

  const uploads = input.uploads.map((u) => {
    const decoded = decodeDataUrl(u);
    if (!decoded) throw new ConsignmentError("Một ảnh tải lên quá lớn (tối đa 1,5 MB sau khi thu nhỏ) hoặc không đọc được.");
    return decoded;
  });
  const ebayImages = await copyEbayImages(input.imageUrls.filter(isHttpImage).slice(0, MAX_IMAGES));

  const now = new Date();
  const isSold = input.listingStatus === "SOLD";
  return prisma.$transaction(async (tx) => {
    let order = input.orderCode ? await tx.consignmentOrder.findFirst({ where: { code: { equals: input.orderCode.trim(), mode: "insensitive" } } }) : null;
    if (input.orderCode && !order) throw new ConsignmentError(`Không tìm thấy đơn ký gửi ${input.orderCode}.`, 404);
    if (!order) {
      order = await tx.consignmentOrder.create({
        data: { code: await newOrderCode(tx, now), customerName: input.customerName!, customerContact: input.customerContact ?? null },
      });
    }
    const item = await tx.consignmentItem.create({
      data: {
        code: await newItemCode(tx, order.id, order.code),
        orderId: order.id,
        ebayUrl,
        ebayItemId,
        ebayMarketplace: marketplace,
        seller: input.seller ?? null,
        dataSource: ebayItemId ? input.dataSource : "MANUAL",
        fetchedAt: input.dataSource !== "MANUAL" && ebayItemId ? now : null,
        title: input.title,
        subject: input.subject ?? null,
        setName: input.setName ?? null,
        year: input.year ?? null,
        cardNumber: input.cardNumber ?? null,
        cardType: input.cardType ?? null,
        rarity: input.rarity ?? null,
        gradingCompany: input.gradingCompany ?? null,
        grade: input.grade ?? null,
        certNumber: input.certNumber ?? null,
        condition: input.condition ?? null,
        description: input.description ?? null,
        notes: input.notes ?? null,
        listingStatus: input.listingStatus,
        currency: input.currency,
        currentPrice: input.currentPrice ?? null,
        endPrice: isSold ? input.endPrice! : null,
        bidCount: input.bidCount ?? null,
        endsAt: input.endsAt ?? null,
        feeScheduleId: input.feeScheduleId ?? null,
      },
    });
    let position = 0;
    for (const img of ebayImages) {
      await tx.consignmentImage.create({ data: { itemId: item.id, source: "EBAY", url: img.url, data: img.data, contentType: img.contentType, position: position++ } });
    }
    for (const up of uploads) {
      await tx.consignmentImage.create({ data: { itemId: item.id, source: "UPLOAD", data: up.data, contentType: up.contentType, position: position++ } });
    }
    return item.id;
  });
}

const isHttpImage = (u: string) => /^https?:\/\//i.test(u);

export async function updateItem(id: string, patch: UpdateItemInput): Promise<void> {
  const existing = await prisma.consignmentItem.findUnique({ where: { id }, include: { payments: { select: { id: true } } } });
  if (!existing) throw new ConsignmentError("Không tìm thấy thẻ ký gửi.", 404);
  if (patch.feeScheduleId !== undefined) await assertScheduleExists(patch.feeScheduleId);
  if (patch.pageSync) {
    if (existing.listingStatus === "SOLD" || existing.listingStatus === "UNSOLD") throw new ConsignmentError("Thẻ đã xác nhận kết quả đấu giá nên không cập nhật từ trang eBay nữa.", 409);
    if (!existing.ebayItemId) throw new ConsignmentError("Thẻ không có Item ID eBay nên không cập nhật từ trang eBay được.");
  }

  const data: Prisma.ConsignmentItemUpdateInput = {};
  if (patch.pageSync) {
    data.fetchedAt = new Date();
    data.fetchError = null;
    // A card typed by hand becomes "read from a page"; one that was read through the API stays as it is.
    if (existing.dataSource === "MANUAL") data.dataSource = "EBAY_PAGE";
  }
  const copy = ["title", "subject", "setName", "year", "cardNumber", "cardType", "rarity", "gradingCompany", "grade", "certNumber", "condition", "description", "notes", "seller", "currency", "currentPrice", "bidCount", "endsAt"] as const;
  for (const key of copy) {
    if (patch[key] !== undefined) (data as Record<string, unknown>)[key] = patch[key];
  }
  if (patch.feeScheduleId !== undefined) data.feeSchedule = patch.feeScheduleId ? { connect: { id: patch.feeScheduleId } } : { disconnect: true };

  if (patch.ebayUrl !== undefined) {
    if (patch.ebayUrl) {
      const parsed = parseEbayUrl(patch.ebayUrl);
      if (!parsed.ok) throw new ConsignmentError(parsed.error);
      await assertNotDuplicate(parsed.value.itemId, id);
      data.ebayUrl = parsed.value.url;
      data.ebayItemId = parsed.value.itemId;
      data.ebayMarketplace = parsed.value.marketplace;
    } else {
      data.ebayUrl = null;
      data.ebayItemId = null;
      data.ebayMarketplace = null;
    }
  }

  // Result of the auction: SOLD always comes with a confirmed End price; any other status has none.
  const priceGiven = patch.endPrice !== undefined && patch.endPrice !== null && patch.endPrice > 0;
  let status = patch.listingStatus;
  if (!status && priceGiven && existing.listingStatus !== "SOLD") status = "SOLD";
  if (status || patch.endPrice !== undefined) {
    const finalStatus = status ?? existing.listingStatus;
    if (finalStatus === "SOLD") {
      const price = patch.endPrice !== undefined ? patch.endPrice : existing.endPrice !== null ? Number(existing.endPrice) : null;
      if (!(price && price > 0)) throw new ConsignmentError("Đã bán thì phải nhập giá End lớn hơn 0.");
      data.endPrice = price;
    } else {
      if (priceGiven) throw new ConsignmentError("Chỉ thẻ ở trạng thái “Đã bán” mới có giá End. Hãy chọn trạng thái Đã bán.");
      data.endPrice = null;
    }
    data.listingStatus = finalStatus;
    // A confirmed result stops the tracking error from lingering on screen.
    if (finalStatus === "SOLD" || finalStatus === "UNSOLD") data.fetchError = null;
  }

  await prisma.$transaction(async (tx) => {
    if (patch.customerName !== undefined || patch.customerContact !== undefined) {
      const order: Prisma.ConsignmentOrderUpdateInput = {};
      if (patch.customerName) order.customerName = patch.customerName;
      if (patch.customerContact !== undefined) order.customerContact = patch.customerContact;
      if (Object.keys(order).length) await tx.consignmentOrder.update({ where: { id: existing.orderId }, data: order });
    }
    if (Object.keys(data).length) await tx.consignmentItem.update({ where: { id }, data });
  });
}

export async function deleteItem(id: string): Promise<void> {
  const count = await prisma.consignmentPayment.count({ where: { itemId: id } });
  if (count > 0) throw new ConsignmentError("Thẻ này đã có thanh toán cho khách nên không xoá được. Xoá các khoản thanh toán trước nếu thật sự cần.", 409);
  const { count: removed } = await prisma.consignmentItem.deleteMany({ where: { id } });
  if (removed === 0) throw new ConsignmentError("Không tìm thấy thẻ ký gửi.", 404);
  // An order left without cards is removed as well, so empty orders do not pile up.
  await prisma.consignmentOrder.deleteMany({ where: { items: { none: {} } } });
}

// ---------------------------------------------------------------------------------------------------------------------
// Payments to the customer
// ---------------------------------------------------------------------------------------------------------------------
export async function addPayment(itemId: string, input: { amount: number; paidAt?: Date; note?: string | null }): Promise<void> {
  const [item, schedules] = await Promise.all([
    prisma.consignmentItem.findUnique({ where: { id: itemId }, include: { payments: true } }),
    loadSchedules(),
  ]);
  if (!item) throw new ConsignmentError("Không tìm thấy thẻ ký gửi.", 404);
  const finance = computeItemFinance(item, schedules);
  if (finance.basis !== "FINAL" || !finance.fees || finance.remaining === null) {
    throw new ConsignmentError(finance.problem ?? "Chỉ ghi nhận thanh toán sau khi đã xác nhận đã bán và có giá End.");
  }
  // Compared in cents so $0.01 rounding never blocks an exact final payment.
  if (toCents(input.amount) > toCents(finance.remaining)) {
    throw new ConsignmentError(`Số tiền vượt quá khoản còn phải trả khách ($${finance.remaining.toFixed(2)}).`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.consignmentPayment.create({ data: { itemId, amount: input.amount, paidAt: input.paidAt ?? new Date(), note: input.note ?? null } });
    // Once money has been paid, the schedule is pinned so a later fee update cannot change what is owed.
    if (!item.feeScheduleId && finance.scheduleId) await tx.consignmentItem.update({ where: { id: itemId }, data: { feeScheduleId: finance.scheduleId } });
  });
}

export async function deletePayment(itemId: string, paymentId: string): Promise<void> {
  const { count } = await prisma.consignmentPayment.deleteMany({ where: { id: paymentId, itemId } });
  if (count === 0) throw new ConsignmentError("Không tìm thấy khoản thanh toán.", 404);
}

// ---------------------------------------------------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------------------------------------------------
export async function addUploads(itemId: string, dataUrls: string[]): Promise<void> {
  const item = await prisma.consignmentItem.findUnique({ where: { id: itemId }, select: { id: true, _count: { select: { images: true } } } });
  if (!item) throw new ConsignmentError("Không tìm thấy thẻ ký gửi.", 404);
  if (item._count.images + dataUrls.length > MAX_IMAGES) throw new ConsignmentError(`Mỗi thẻ tối đa ${MAX_IMAGES} ảnh (đang có ${item._count.images}).`);
  const decoded = dataUrls.map((u) => {
    const d = decodeDataUrl(u);
    if (!d) throw new ConsignmentError("Một ảnh quá lớn (tối đa 1,5 MB sau khi thu nhỏ) hoặc không đọc được.");
    return d;
  });
  const last = await prisma.consignmentImage.aggregate({ where: { itemId }, _max: { position: true } });
  let position = (last._max.position ?? -1) + 1;
  await prisma.$transaction(decoded.map((d) => prisma.consignmentImage.create({ data: { itemId, source: "UPLOAD", data: d.data, contentType: d.contentType, position: position++ } })));
}

export async function deleteImage(itemId: string, imageId: string): Promise<void> {
  const { count } = await prisma.consignmentImage.deleteMany({ where: { id: imageId, itemId } });
  if (count === 0) throw new ConsignmentError("Không tìm thấy ảnh.", 404);
}

// ---------------------------------------------------------------------------------------------------------------------
// Fee schedules: history is kept, so "updating" the fees means adding a new version.
// ---------------------------------------------------------------------------------------------------------------------
export async function createSchedule(input: FeeScheduleInput): Promise<string> {
  const created = await prisma.consignmentFeeSchedule.create({
    data: {
      name: input.name,
      effectiveFrom: input.effectiveFrom,
      mode: input.mode,
      serviceRate: input.serviceRate,
      minimumFee: input.minimumFee,
      note: input.note || null,
      tiers: { create: input.tiers.map((t, i) => ({ fromPrice: t.from, toPrice: t.to, percent: t.percent, fixedFee: t.fixed, position: i })) },
    },
  });
  return created.id;
}

export async function deleteSchedule(id: string): Promise<void> {
  const used = await prisma.consignmentItem.count({ where: { feeScheduleId: id } });
  if (used > 0) throw new ConsignmentError(`Phiên bản này đang được ghim cho ${used} thẻ ký gửi nên không xoá được.`, 409);
  const { count } = await prisma.consignmentFeeSchedule.deleteMany({ where: { id } });
  if (count === 0) throw new ConsignmentError("Không tìm thấy phiên bản biểu phí.", 404);
}
