"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getLatestCashBalance, recalculateCashLedgerBalances } from "@/lib/cash-ledger";
import { reverseAndDeleteTransaction } from "@/lib/transaction-reversal";
import {
  cashAdjustmentSchema,
  cashWithdrawalSchema,
  cashEntryEditManualSchema,
  cashEntryEditDescriptionSchema,
} from "@/lib/validations/cash-ledger";

export interface CashAdjustmentActionState {
  error?: string;
  success?: boolean;
}

export async function createCashAdjustmentAction(
  _prevState: CashAdjustmentActionState,
  formData: FormData
): Promise<CashAdjustmentActionState> {
  const parsed = cashAdjustmentSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const previousBalance = await getLatestCashBalance(prisma);

  await prisma.cashLedgerEntry.create({
    data: {
      type: "MANUAL_ADJUSTMENT",
      amount: parsed.data.amount,
      balanceAfter: previousBalance + parsed.data.amount,
      description: parsed.data.description,
    },
  });

  revalidatePath("/cash-flow");
  revalidatePath("/");

  return { success: true };
}

export async function createCashWithdrawalAction(
  _prevState: CashAdjustmentActionState,
  formData: FormData
): Promise<CashAdjustmentActionState> {
  const parsed = cashWithdrawalSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const previousBalance = await getLatestCashBalance(prisma);
  const amount = -parsed.data.amount;

  await prisma.cashLedgerEntry.create({
    data: {
      type: "WITHDRAWAL",
      amount,
      balanceAfter: previousBalance + amount,
      description: parsed.data.description,
    },
  });

  revalidatePath("/cash-flow");
  revalidatePath("/");

  return { success: true };
}

export interface CashEntryActionState {
  error?: string;
  success?: boolean;
}

export async function updateCashLedgerEntryAction(
  id: string,
  _prevState: CashEntryActionState,
  formData: FormData
): Promise<CashEntryActionState> {
  const raw = Object.fromEntries(formData.entries());

  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.cashLedgerEntry.findUniqueOrThrow({ where: { id } });

      if (entry.transactionId) {
        // Auto-generated (sale/purchase) entry — only the description is safe to edit.
        const parsed = cashEntryEditDescriptionSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
        }
        await tx.cashLedgerEntry.update({
          where: { id },
          data: { description: parsed.data.description },
        });
        return;
      }

      const parsed = cashEntryEditManualSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      }

      await tx.cashLedgerEntry.update({
        where: { id },
        data: { amount: parsed.data.amount, description: parsed.data.description },
      });

      await recalculateCashLedgerBalances(tx);
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể cập nhật" };
  }

  revalidatePath("/cash-flow");
  revalidatePath("/");

  return { success: true };
}

export async function deleteCashLedgerEntryAction(id: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.cashLedgerEntry.findUniqueOrThrow({ where: { id } });

      if (entry.transactionId) {
        await reverseAndDeleteTransaction(tx, entry.transactionId);
      } else {
        await tx.cashLedgerEntry.delete({ where: { id } });
        await recalculateCashLedgerBalances(tx);
      }
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể xoá" };
  }

  revalidatePath("/cash-flow");
  revalidatePath("/inventory");
  revalidatePath("/shipping");
  revalidatePath("/");

  return { success: true };
}
