import type { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

/**
 * Recomputes balanceAfter for every CashLedgerEntry in chronological order.
 * Call this after any edit/delete that could shift the running balance chain.
 */
export async function recalculateCashLedgerBalances(tx: TxClient) {
  const entries = await tx.cashLedgerEntry.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, amount: true, balanceAfter: true },
  });

  let running = 0;
  for (const entry of entries) {
    running += Number(entry.amount);
    if (Number(entry.balanceAfter) !== running) {
      await tx.cashLedgerEntry.update({
        where: { id: entry.id },
        data: { balanceAfter: running },
      });
    }
  }
}

export async function getLatestCashBalance(tx: TxClient): Promise<number> {
  const latest = await tx.cashLedgerEntry.findFirst({ orderBy: { createdAt: "desc" } });
  return latest ? Number(latest.balanceAfter) : 0;
}
