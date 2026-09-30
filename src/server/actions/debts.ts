"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getLatestCashBalance } from "@/lib/cash-ledger";
import { reverseAndDeleteDebt } from "@/lib/debt-reversal";
import { debtCreateSchema, debtPaymentSchema } from "@/lib/validations/debt";

export interface DebtActionState {
  error?: string;
  success?: boolean;
}

export async function createDebtAction(
  _prevState: DebtActionState,
  formData: FormData
): Promise<DebtActionState> {
  const parsed = debtCreateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  await prisma.debt.create({
    data: {
      type: data.type,
      personName: data.personName,
      amount: data.amount,
      referenceLabel: data.referenceLabel || null,
      notes: data.notes || null,
    },
  });

  revalidatePath("/inventory");

  return { success: true };
}

export async function createDebtPaymentAction(
  _prevState: DebtActionState,
  formData: FormData
): Promise<DebtActionState> {
  const parsed = debtPaymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { debtId, amount: paymentAmount, note } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId } });

      const remaining = Number(debt.amount) - Number(debt.paidAmount);
      if (paymentAmount > remaining) {
        throw new Error(
          `Số tiền vượt quá số còn lại (${remaining.toLocaleString("vi-VN")} ₫)`
        );
      }

      // CardNest nợ người này -> trả tiền ra là chi (âm). Người này nợ CardNest
      // -> thu hồi tiền về là thu (dương).
      const isRepayment = debt.type === "ADVANCED_BY_PERSON";
      const cashDelta = isRepayment ? -paymentAmount : paymentAmount;
      const previousBalance = await getLatestCashBalance(tx);

      const description = isRepayment
        ? `Trả nợ ứng tiền — ${debt.personName}${debt.referenceLabel ? ` (${debt.referenceLabel})` : ""}`
        : `Thu hồi tiền ứng — ${debt.personName}${debt.referenceLabel ? ` (${debt.referenceLabel})` : ""}`;

      const cashLedgerEntry = await tx.cashLedgerEntry.create({
        data: {
          type: isRepayment ? "DEBT_REPAYMENT" : "DEBT_COLLECTION",
          amount: cashDelta,
          balanceAfter: previousBalance + cashDelta,
          description,
        },
      });

      await tx.debtPayment.create({
        data: {
          debtId: debt.id,
          amount: paymentAmount,
          note: note || null,
          cashLedgerEntryId: cashLedgerEntry.id,
        },
      });

      const newPaidAmount = Number(debt.paidAmount) + paymentAmount;
      const newStatus =
        newPaidAmount >= Number(debt.amount)
          ? "PAID"
          : newPaidAmount > 0
            ? "PARTIAL"
            : "UNPAID";

      await tx.debt.update({
        where: { id: debt.id },
        data: { paidAmount: newPaidAmount, status: newStatus },
      });
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể ghi nhận thanh toán" };
  }

  revalidatePath("/inventory");
  revalidatePath("/cash-flow");
  revalidatePath("/");

  return { success: true };
}

export async function deleteDebtAction(id: string): Promise<DebtActionState> {
  try {
    await prisma.$transaction(async (tx) => {
      await reverseAndDeleteDebt(tx, id);
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể xoá khoản nợ" };
  }

  revalidatePath("/inventory");
  revalidatePath("/cash-flow");
  revalidatePath("/");

  return { success: true };
}
