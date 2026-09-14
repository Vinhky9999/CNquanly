"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { generateSku } from "@/lib/utils";
import { getLatestCashBalance } from "@/lib/cash-ledger";
import { sealedProductCreateSchema, sealedProductEditSchema } from "@/lib/validations/sealed-product";
import { singleCardCreateSchema, singleCardEditSchema } from "@/lib/validations/single-card";

export interface InventoryActionState {
  error?: string;
}

function parseFormData(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function createSealedProductAction(
  _prevState: InventoryActionState,
  formData: FormData
): Promise<InventoryActionState> {
  const parsed = sealedProductCreateSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;
  const skipCashLedger = formData.get("skipCashLedger") === "on";

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.sealedProduct.findUnique({ where: { sku: data.sku } });

      let productId: string;
      if (existing) {
        // Restocking an existing SKU: merge quantity and recompute cost price
        // as a weighted average of the old stock and the newly added batch.
        const newQuantity = existing.quantity + data.quantity;
        const newCostPrice =
          (existing.quantity * Number(existing.costPrice) + data.quantity * data.costPrice) /
          newQuantity;

        const updated = await tx.sealedProduct.update({
          where: { id: existing.id },
          data: { quantity: newQuantity, costPrice: newCostPrice, status: data.status },
        });
        productId = updated.id;
      } else {
        const created = await tx.sealedProduct.create({
          data: {
            sku: data.sku,
            name: data.name,
            game: data.game || null,
            quantity: data.quantity,
            costPrice: data.costPrice,
            status: data.status,
            notes: data.notes || null,
          },
        });
        productId = created.id;
      }

      const purchaseAmount = data.quantity * data.costPrice;

      const transaction = await tx.transaction.create({
        data: {
          type: "PURCHASE",
          totalAmount: purchaseAmount,
          items: {
            create: [
              {
                itemType: "SEALED",
                sealedProductId: productId,
                quantity: data.quantity,
                unitPrice: data.costPrice,
                subtotal: purchaseAmount,
              },
            ],
          },
        },
      });

      // "Hàng có sẵn" — nhập liệu tài sản đã mua từ trước, không trừ tiền mặt lần nữa.
      if (!skipCashLedger) {
        const previousBalance = await getLatestCashBalance(tx);
        await tx.cashLedgerEntry.create({
          data: {
            type: "PURCHASE",
            amount: -purchaseAmount,
            balanceAfter: previousBalance - purchaseAmount,
            description: "Mua hàng",
            transactionId: transaction.id,
          },
        });
      }
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể lưu sản phẩm" };
  }

  revalidatePath("/inventory");
  revalidatePath("/cash-flow");
  revalidatePath("/");
  redirect("/inventory");
}

export async function updateSealedProductAction(
  id: string,
  _prevState: InventoryActionState,
  formData: FormData
): Promise<InventoryActionState> {
  const parsed = sealedProductEditSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;
  const skipCashLedger = formData.get("skipCashLedger") === "on";

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.sealedProduct.findUniqueOrThrow({ where: { id } });
      const quantityDelta = data.quantity - existing.quantity;

      await tx.sealedProduct.update({
        where: { id },
        data: {
          name: data.name,
          game: data.game || null,
          quantity: data.quantity,
          costPrice: data.costPrice,
          status: data.status,
          notes: data.notes || null,
        },
      });

      // Tăng số lượng qua form Sửa được coi như một lần nhập hàng cho phần
      // chênh lệch tăng thêm — trừ tiền Dòng Tiền như "Thêm hàng", trừ khi
      // tích "Hàng có sẵn". Giảm số lượng không tạo hiệu ứng dòng tiền.
      if (quantityDelta > 0) {
        const purchaseAmount = quantityDelta * data.costPrice;

        const transaction = await tx.transaction.create({
          data: {
            type: "PURCHASE",
            totalAmount: purchaseAmount,
            items: {
              create: [
                {
                  itemType: "SEALED",
                  sealedProductId: id,
                  quantity: quantityDelta,
                  unitPrice: data.costPrice,
                  subtotal: purchaseAmount,
                },
              ],
            },
          },
        });

        if (!skipCashLedger) {
          const previousBalance = await getLatestCashBalance(tx);
          await tx.cashLedgerEntry.create({
            data: {
              type: "PURCHASE",
              amount: -purchaseAmount,
              balanceAfter: previousBalance - purchaseAmount,
              description: "Mua hàng (chỉnh sửa số lượng)",
              transactionId: transaction.id,
            },
          });
        }
      }
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể lưu sản phẩm" };
  }

  revalidatePath("/inventory");
  revalidatePath("/cash-flow");
  revalidatePath("/");
  redirect("/inventory");
}

export async function deleteSealedProductAction(id: string) {
  await prisma.sealedProduct.delete({ where: { id } });
  revalidatePath("/inventory");
}

/** SKU suggestions for the "Thêm hàng" autocomplete — returns lightweight matches. */
export async function searchSealedProductSkusAction(query: string) {
  if (!query.trim()) return [];
  const products = await prisma.sealedProduct.findMany({
    where: {
      OR: [
        { sku: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { sku: true, name: true, quantity: true, costPrice: true },
    take: 8,
    orderBy: { sku: "asc" },
  });
  return products.map((p) => ({ ...p, costPrice: Number(p.costPrice) }));
}

/** SKU suggestions for the Single "Thêm hàng" autocomplete — returns lightweight matches. */
export async function searchSingleCardSkusAction(query: string) {
  if (!query.trim()) return [];
  const cards = await prisma.singleCard.findMany({
    where: {
      OR: [
        { sku: { contains: query, mode: "insensitive" } },
        { cardName: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { sku: true, cardName: true, quantity: true, costPrice: true, condition: true },
    take: 8,
    orderBy: { sku: "asc" },
  });
  return cards.map((c) => ({ ...c, costPrice: Number(c.costPrice) }));
}

export async function createSingleCardAction(
  _prevState: InventoryActionState,
  formData: FormData
): Promise<InventoryActionState> {
  const parsed = singleCardCreateSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;
  const skipCashLedger = formData.get("skipCashLedger") === "on";
  const customSku = (formData.get("sku") as string | null)?.trim();
  // Mỗi thẻ Graded là duy nhất (mã Cert riêng) nên không thể gộp số lượng —
  // chỉ Raw mới cho phép nhập nhiều thẻ giống hệt nhau trong 1 lần.
  const quantity = data.condition === "RAW" ? data.quantity : 1;

  try {
    await prisma.$transaction(async (tx) => {
      const sku = customSku || generateSku("SGL");
      const existing = await tx.singleCard.findUnique({ where: { sku } });

      let cardId: string;
      if (existing) {
        if (data.condition === "GRADED" || existing.condition === "GRADED") {
          throw new Error(
            "Mã SKU này đã tồn tại và không thể gộp với thẻ Graded (mỗi thẻ Graded là duy nhất theo mã Cert). Vui lòng dùng SKU khác."
          );
        }
        // Gộp vào SKU đã có: cộng dồn số lượng và tính lại giá vốn bình quân
        // gia quyền, giống hệt logic restock của Sealed.
        const newQuantity = existing.quantity + quantity;
        const newCostPrice =
          (existing.quantity * Number(existing.costPrice) + quantity * data.costPrice) / newQuantity;

        const updated = await tx.singleCard.update({
          where: { id: existing.id },
          data: { quantity: newQuantity, costPrice: newCostPrice },
        });
        cardId = updated.id;
      } else {
        const created = await tx.singleCard.create({
          data: {
            sku,
            cardName: data.cardName,
            game: data.game || null,
            condition: data.condition,
            quantity,
            costPrice: data.costPrice,
            rawGrade: data.condition === "RAW" ? data.rawGrade : null,
            gradingCompanyId: data.condition === "GRADED" ? data.gradingCompanyId : null,
            certNumber: data.condition === "GRADED" ? data.certNumber : null,
          },
        });
        cardId = created.id;
      }

      const purchaseAmount = quantity * data.costPrice;

      const transaction = await tx.transaction.create({
        data: {
          type: "PURCHASE",
          totalAmount: purchaseAmount,
          items: {
            create: [
              {
                itemType: "SINGLE",
                singleCardId: cardId,
                quantity,
                unitPrice: data.costPrice,
                subtotal: purchaseAmount,
              },
            ],
          },
        },
      });

      // "Hàng có sẵn" — nhập liệu tài sản đã mua từ trước, không trừ tiền mặt lần nữa.
      if (!skipCashLedger) {
        const previousBalance = await getLatestCashBalance(tx);
        await tx.cashLedgerEntry.create({
          data: {
            type: "PURCHASE",
            amount: -purchaseAmount,
            balanceAfter: previousBalance - purchaseAmount,
            description: "Mua hàng",
            transactionId: transaction.id,
          },
        });
      }
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể lưu lá bài" };
  }

  revalidatePath("/inventory");
  revalidatePath("/cash-flow");
  revalidatePath("/");
  redirect("/inventory");
}

export async function updateSingleCardAction(
  id: string,
  _prevState: InventoryActionState,
  formData: FormData
): Promise<InventoryActionState> {
  const parsed = singleCardEditSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  await prisma.singleCard.update({
    where: { id },
    data: {
      cardName: data.cardName,
      game: data.game || null,
      condition: data.condition,
      costPrice: data.costPrice,
      rawGrade: data.condition === "RAW" ? data.rawGrade : null,
      gradingCompanyId: data.condition === "GRADED" ? data.gradingCompanyId : null,
      certNumber: data.condition === "GRADED" ? data.certNumber : null,
    },
  });

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function deleteSingleCardAction(id: string) {
  await prisma.singleCard.delete({ where: { id } });
  revalidatePath("/inventory");
}

export async function createGradingCompanyAction(name: string) {
  const company = await prisma.gradingCompany.create({ data: { name } });
  revalidatePath("/inventory");
  return company;
}
