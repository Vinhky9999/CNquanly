import type { Prisma } from "@prisma/client";

import { recalculateCashLedgerBalances } from "@/lib/cash-ledger";

type TxClient = Prisma.TransactionClient;

/**
 * Deletes a Transaction (sale or purchase) and undoes its side effects:
 * restores/reduces inventory quantity or card status, removes the linked
 * cash ledger entry, and recomputes the running balance chain.
 *
 * Reversing a PURCHASE is only allowed while the stock it added hasn't been
 * sold or folded into a later restock below that amount — otherwise there is
 * no way to know which units to take back.
 */
export async function reverseAndDeleteTransaction(tx: TxClient, transactionId: string) {
  const transaction = await tx.transaction.findUnique({
    where: { id: transactionId },
    include: { items: true, cashLedgerEntry: true },
  });
  if (!transaction) {
    throw new Error("Không tìm thấy giao dịch");
  }

  for (const item of transaction.items) {
    if (transaction.type === "SALE") {
      if (item.itemType === "SEALED" && item.sealedProductId) {
        await tx.sealedProduct.update({
          where: { id: item.sealedProductId },
          data: { quantity: { increment: item.quantity } },
        });
      } else if (item.itemType === "SINGLE" && item.singleCardId) {
        await tx.singleCard.update({
          where: { id: item.singleCardId },
          data: { status: "IN_STOCK" },
        });
      }
    } else {
      if (item.itemType === "SEALED" && item.sealedProductId) {
        const product = await tx.sealedProduct.findUniqueOrThrow({
          where: { id: item.sealedProductId },
        });
        if (product.quantity < item.quantity) {
          throw new Error(
            "Không thể xoá: một phần hàng nhập từ giao dịch này đã được bán hoặc nhập chồng thêm, tồn kho hiện tại không đủ để hoàn tác."
          );
        }
        await tx.sealedProduct.update({
          where: { id: item.sealedProductId },
          data: { quantity: { decrement: item.quantity } },
        });
      } else if (item.itemType === "SINGLE" && item.singleCardId) {
        const card = await tx.singleCard.findUniqueOrThrow({ where: { id: item.singleCardId } });
        if (card.status === "SOLD") {
          throw new Error("Không thể xoá: lá bài từ giao dịch nhập này đã được bán.");
        }
        await tx.singleCard.delete({ where: { id: item.singleCardId } });
      }
    }
  }

  if (transaction.cashLedgerEntry) {
    await tx.cashLedgerEntry.delete({ where: { id: transaction.cashLedgerEntry.id } });
  }

  await tx.transaction.delete({ where: { id: transactionId } });

  await recalculateCashLedgerBalances(tx);
}
