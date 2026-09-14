"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { reverseAndDeleteTransaction } from "@/lib/transaction-reversal";
import { shippingUpdateSchema } from "@/lib/validations/shipping";

export interface ShippingActionState {
  error?: string;
  success?: boolean;
}

export async function updateShippingOrderAction(
  id: string,
  _prevState: ShippingActionState,
  formData: FormData
): Promise<ShippingActionState> {
  const parsed = shippingUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  await prisma.transaction.update({
    where: { id },
    data: {
      trackingCode: parsed.data.trackingCode,
      shippingCarrier: parsed.data.shippingCarrier,
      recipientName: parsed.data.recipientName,
      recipientPhone: parsed.data.recipientPhone || null,
      recipientAddress: parsed.data.recipientAddress || null,
      notes: parsed.data.notes || null,
    },
  });

  revalidatePath("/shipping");
  return { success: true };
}

export async function deleteShippingOrderAction(id: string): Promise<ShippingActionState> {
  try {
    await prisma.$transaction(async (tx) => {
      await reverseAndDeleteTransaction(tx, id);
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể xoá đơn giao hàng" };
  }

  revalidatePath("/shipping");
  revalidatePath("/inventory");
  revalidatePath("/cash-flow");
  revalidatePath("/");

  return { success: true };
}
