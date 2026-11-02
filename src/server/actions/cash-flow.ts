"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { canConvertToReceivable, getLatestCashBalance, recalculateCashLedgerBalances } from "@/lib/cash-ledger";
import { reverseAndDeleteTransaction } from "@/lib/transaction-reversal";
import { reverseDebtPaymentByCashLedgerEntry } from "@/lib/debt-reversal";
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
      countsAsProfit: parsed.data.countsAsProfit,
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

      // "Chuyển vào Công nợ": the money was never received. The entry leaves the cash flow (so the cash balance
      // does not include it) and the same amount becomes a receivable in the debt book.
      if (raw.convertToDebt === "on") {
        if (!canConvertToReceivable(entry)) {
          throw new Error("Chỉ khoản thu bán hàng hoặc điều chỉnh dương mới chuyển được vào Công nợ phải thu");
        }
        const person = String(raw.debtPersonName ?? "").trim();
        if (!person) throw new Error("Nhập tên khách / người đang nợ");
        const description = String(raw.description ?? "").trim() || entry.description || "Giao dịch Dòng tiền";

        let amount = Number(entry.amount);
        if (!entry.transactionId) {
          const edited = Number(raw.amount);
          if (Number.isFinite(edited) && edited > 0) amount = edited;
        }
        const sale = entry.transactionId
          ? await tx.transaction.findUnique({ where: { id: entry.transactionId }, select: { customerId: true } })
          : null;

        await tx.debt.create({
          data: {
            type: "ADVANCED_TO_PERSON",
            personName: person,
            amount,
            referenceLabel: `Chuyển từ Dòng tiền: ${description}`,
            customerId: sale?.customerId ?? null,
            transactionId: entry.transactionId,
          },
        });
        await tx.cashLedgerEntry.delete({ where: { id } });
        await recalculateCashLedgerBalances(tx);
        return;
      }

      const isDebtLinked =
        entry.type === "DEBT_REPAYMENT" ||
        entry.type === "DEBT_COLLECTION" ||
        entry.type === "GRADING_INCOME" ||
        entry.type === "GRADING_COST";

      if (entry.transactionId || isDebtLinked) {
        // Auto-generated (sale/purchase/debt payment) entry — only the description is safe to edit.
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
        data: { amount: parsed.data.amount, description: parsed.data.description, countsAsProfit: parsed.data.countsAsProfit },
      });

      await recalculateCashLedgerBalances(tx);
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể cập nhật" };
  }

  revalidatePath("/cash-flow");
  revalidatePath("/customers");
  revalidatePath("/messages");
  revalidatePath("/");

  return { success: true };
}

export async function deleteCashLedgerEntryAction(id: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.cashLedgerEntry.findUniqueOrThrow({ where: { id } });

      if (entry.transactionId) {
        await reverseAndDeleteTransaction(tx, entry.transactionId);
      } else if (entry.type === "DEBT_REPAYMENT" || entry.type === "DEBT_COLLECTION") {
        await reverseDebtPaymentByCashLedgerEntry(tx, entry.id);
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
