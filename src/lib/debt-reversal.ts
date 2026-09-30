import type { Prisma } from "@prisma/client";

import { recalculateCashLedgerBalances } from "@/lib/cash-ledger";

type TxClient = Prisma.TransactionClient;

function computeStatus(amount: number, paidAmount: number): "UNPAID" | "PARTIAL" | "PAID" {
  if (paidAmount <= 0) return "UNPAID";
  if (paidAmount >= amount) return "PAID";
  return "PARTIAL";
}

/**
 * Undoes a single debt payment: removes its linked CashLedgerEntry (so the
 * running balance chain stays correct) and rolls the parent Debt's paidAmount
 * / status back. Used both by "delete a whole debt" and by deleting a
 * DEBT_REPAYMENT/DEBT_COLLECTION entry directly from the Cash Flow table.
 */
export async function reverseDebtPaymentByCashLedgerEntry(tx: TxClient, cashLedgerEntryId: string) {
  const payment = await tx.debtPayment.findUnique({ where: { cashLedgerEntryId } });
  if (!payment) {
    // Not a debt-linked entry — nothing to reverse here.
    return false;
  }

  const debt = await tx.debt.findUniqueOrThrow({ where: { id: payment.debtId } });
  const newPaidAmount = Math.max(0, Number(debt.paidAmount) - Number(payment.amount));

  await tx.debt.update({
    where: { id: debt.id },
    data: {
      paidAmount: newPaidAmount,
      status: computeStatus(Number(debt.amount), newPaidAmount),
    },
  });

  await tx.debtPayment.delete({ where: { id: payment.id } });
  await tx.cashLedgerEntry.delete({ where: { id: cashLedgerEntryId } });
  await recalculateCashLedgerBalances(tx);

  return true;
}

/**
 * Deletes an entire Debt record along with every payment made against it,
 * reversing each payment's cash-flow effect first so the ledger stays
 * consistent (mirrors reverseAndDeleteTransaction for sale/purchase).
 */
export async function reverseAndDeleteDebt(tx: TxClient, debtId: string) {
  const debt = await tx.debt.findUnique({
    where: { id: debtId },
    include: { payments: true },
  });
  if (!debt) {
    throw new Error("Không tìm thấy khoản nợ");
  }

  for (const payment of debt.payments) {
    if (payment.cashLedgerEntryId) {
      await tx.cashLedgerEntry.delete({ where: { id: payment.cashLedgerEntryId } });
    }
  }

  // onDelete: Cascade on DebtPayment.debt removes the remaining payment rows.
  await tx.debt.delete({ where: { id: debtId } });

  if (debt.payments.length > 0) {
    await recalculateCashLedgerBalances(tx);
  }
}
