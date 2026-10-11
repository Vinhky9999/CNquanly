import type { Prisma } from "@prisma/client";

import { getLatestCashBalance } from "@/lib/cash-ledger";
import { generateSku, isStructuredName } from "@/lib/utils";

type TxClient = Prisma.TransactionClient;

export interface BatchRow {
  sku: string;
  name: string;
  game: string;
  kind: "SEALED" | "SINGLE";
  rawGrade: string;
  quantity: number;
  costPrice: number;
}

function fail(index: number, message: string): never {
  throw new Error(`Dòng ${index + 1}: ${message}`);
}

/**
 * Writes every row inside the caller's transaction using the same rules as the
 * single-item forms: weighted-average cost merge for an existing SKU, one
 * PURCHASE transaction per row, and (unless skipCashLedger) one cash-ledger
 * entry per row so each purchase can still be reversed individually.
 */
export async function importBatchRows(tx: TxClient, rows: BatchRow[], skipCashLedger: boolean) {
  let balance = await getLatestCashBalance(tx);
  // Explicit, strictly increasing timestamps keep the ledger order deterministic
  // even though every row is written in the same millisecond window.
  const baseTime = Date.now();
  const counts = { sealed: 0, single: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sku = row.sku.trim() || generateSku(row.kind === "SEALED" ? "SLD" : "SGL");

    if (!Number.isInteger(row.quantity) || row.quantity < 1) fail(i, "số lượng phải là số nguyên lớn hơn 0");
    if (!Number.isFinite(row.costPrice) || row.costPrice < 0) fail(i, "giá vốn không hợp lệ");

    let sealedProductId: string | null = null;
    let singleCardId: string | null = null;

    if (row.kind === "SEALED") {
      const existing = await tx.sealedProduct.findUnique({ where: { sku } });
      if (existing) {
        const newQuantity = existing.quantity + row.quantity;
        const newCost =
          (existing.quantity * Number(existing.costPrice) + row.quantity * row.costPrice) / newQuantity;
        await tx.sealedProduct.update({
          where: { id: existing.id },
          data: { quantity: newQuantity, costPrice: newCost },
        });
        sealedProductId = existing.id;
      } else {
        if (!isStructuredName(row.name)) {
          fail(i, 'tên Sealed mới phải đúng cấu trúc "Game - Set - Loại Box"');
        }
        const created = await tx.sealedProduct.create({
          data: {
            sku,
            name: row.name.trim(),
            game: row.game.trim() || null,
            quantity: row.quantity,
            costPrice: row.costPrice,
          },
        });
        sealedProductId = created.id;
      }
      counts.sealed += 1;
    } else {
      const existing = await tx.singleCard.findUnique({ where: { sku } });
      if (existing) {
        if (existing.condition === "GRADED") {
          fail(i, "SKU này là thẻ Graded (duy nhất theo mã Cert) nên không thể gộp");
        }
        const newQuantity = existing.quantity + row.quantity;
        const newCost =
          (existing.quantity * Number(existing.costPrice) + row.quantity * row.costPrice) / newQuantity;
        await tx.singleCard.update({
          where: { id: existing.id },
          data: { quantity: newQuantity, costPrice: newCost },
        });
        singleCardId = existing.id;
      } else {
        if (!row.name.trim()) fail(i, "thiếu tên lá bài");
        if (!["S", "A", "B"].includes(row.rawGrade)) fail(i, "thiếu hạng Raw (S/A/B)");
        const created = await tx.singleCard.create({
          data: {
            sku,
            cardName: row.name.trim(),
            game: row.game.trim() || null,
            condition: "RAW",
            rawGrade: row.rawGrade as "S" | "A" | "B",
            quantity: row.quantity,
            costPrice: row.costPrice,
          },
        });
        singleCardId = created.id;
      }
      counts.single += 1;
    }

    const amount = row.quantity * row.costPrice;
    const transaction = await tx.transaction.create({
      data: {
        type: "PURCHASE",
        totalAmount: amount,
        items: {
          create: [
            {
              itemType: row.kind,
              sealedProductId,
              singleCardId,
              quantity: row.quantity,
              unitPrice: row.costPrice,
              subtotal: amount,
            },
          ],
        },
      },
    });

    if (!skipCashLedger) {
      balance -= amount;
      await tx.cashLedgerEntry.create({
        data: {
          type: "PURCHASE",
          amount: -amount,
          balanceAfter: balance,
          description: "Mua hàng (nhập hàng loạt)",
          transactionId: transaction.id,
          createdAt: new Date(baseTime + i),
        },
      });
    }
  }

  return counts;
}
