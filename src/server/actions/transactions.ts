"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getLatestCashBalance } from "@/lib/cash-ledger";
import { saleTransactionSchema } from "@/lib/validations/transaction";

export interface SaleActionState {
  error?: string;
  success?: boolean;
}

export async function createSaleTransactionAction(
  _prevState: SaleActionState,
  formData: FormData
): Promise<SaleActionState> {
  const parsed = saleTransactionSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const skipCashLedger = formData.get("skipCashLedger") === "on";

  const {
    itemType,
    itemId,
    quantity,
    unitPrice,
    customerId,
    newCustomerName,
    notes,
    orderType,
    trackingCode,
    shippingCarrier,
    recipientName,
    recipientPhone,
    recipientAddress,
  } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      let finalCustomerId = customerId || null;

      if (!finalCustomerId && newCustomerName?.trim()) {
        const customer = await tx.customer.create({ data: { name: newCustomerName.trim() } });
        finalCustomerId = customer.id;
      }

      // Cost-basis snapshot at the moment of sale, used to compute profit
      // (sale price - cost) even if the product's cost price changes later.
      let costBasis: number;

      if (itemType === "SEALED") {
        const product = await tx.sealedProduct.findUniqueOrThrow({ where: { id: itemId } });
        if (product.quantity < quantity) {
          throw new Error("Số lượng tồn kho không đủ để xuất");
        }
        costBasis = Number(product.costPrice) * quantity;
        await tx.sealedProduct.update({
          where: { id: itemId },
          data: { quantity: product.quantity - quantity },
        });
      } else {
        const card = await tx.singleCard.findUniqueOrThrow({ where: { id: itemId } });
        if (card.status === "SOLD") {
          throw new Error("Lá bài này đã được bán trước đó");
        }
        if (card.quantity < quantity) {
          throw new Error("Số lượng tồn kho không đủ để xuất");
        }
        costBasis = Number(card.costPrice) * quantity;
        const remaining = card.quantity - quantity;
        await tx.singleCard.update({
          where: { id: itemId },
          data: {
            quantity: remaining,
            status: remaining === 0 ? "SOLD" : card.status,
          },
        });
      }

      const subtotal = unitPrice * quantity;

      let finalRecipientName = recipientName || null;
      let finalRecipientPhone = recipientPhone || null;
      let finalRecipientAddress = recipientAddress || null;

      if (orderType === "DELIVERY" && finalCustomerId) {
        const linkedCustomer = await tx.customer.findUnique({ where: { id: finalCustomerId } });
        if (linkedCustomer) {
          finalRecipientName = linkedCustomer.name;
          finalRecipientPhone = linkedCustomer.phone;
          finalRecipientAddress = linkedCustomer.address;
        }
      }

      const transaction = await tx.transaction.create({
        data: {
          type: "SALE",
          customerId: finalCustomerId,
          totalAmount: subtotal,
          totalCost: costBasis,
          notes: notes || null,
          orderType,
          trackingCode: orderType === "DELIVERY" ? trackingCode || null : null,
          shippingCarrier: orderType === "DELIVERY" ? shippingCarrier || null : null,
          recipientName: orderType === "DELIVERY" ? finalRecipientName : null,
          recipientPhone: orderType === "DELIVERY" ? finalRecipientPhone : null,
          recipientAddress: orderType === "DELIVERY" ? finalRecipientAddress : null,
          items: {
            create: [
              {
                itemType,
                sealedProductId: itemType === "SEALED" ? itemId : null,
                singleCardId: itemType === "SINGLE" ? itemId : null,
                quantity,
                unitPrice,
                subtotal,
                costBasis,
              },
            ],
          },
        },
      });

      // "Hàng nội bộ" — xuất kho (dùng nội bộ, tặng, mẫu...) không phải bán
      // thật, nên không ghi nhận Doanh thu vào Dòng Tiền.
      if (!skipCashLedger) {
        const previousBalance = await getLatestCashBalance(tx);

        await tx.cashLedgerEntry.create({
          data: {
            type: "SALE",
            amount: subtotal,
            balanceAfter: previousBalance + subtotal,
            description: "Bán hàng",
            transactionId: transaction.id,
          },
        });
      }
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể ghi nhận giao dịch" };
  }

  revalidatePath("/inventory");
  revalidatePath("/cash-flow");
  revalidatePath("/customers");
  revalidatePath("/shipping");
  revalidatePath("/");

  return { success: true };
}
