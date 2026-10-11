"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { importBatchRows } from "@/lib/batch-import";

const rowSchema = z.object({
  sku: z.string(),
  name: z.string(),
  game: z.string(),
  kind: z.enum(["SEALED", "SINGLE"]),
  rawGrade: z.string(),
  quantity: z.coerce.number(),
  costPrice: z.coerce.number(),
});

const payloadSchema = z.object({
  rows: z.array(rowSchema).min(1, "Chưa có dòng nào để lưu").max(300, "Tối đa 300 dòng mỗi lần"),
  skipCashLedger: z.boolean(),
});

export interface BatchImportResult {
  success?: boolean;
  error?: string;
  sealed?: number;
  single?: number;
}

export async function bulkImportAction(input: unknown): Promise<BatchImportResult> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  try {
    const counts = await prisma.$transaction(
      (tx) => importBatchRows(tx, parsed.data.rows, parsed.data.skipCashLedger),
      { timeout: 30000, maxWait: 10000 }
    );
    revalidatePath("/inventory");
    revalidatePath("/cash-flow");
    revalidatePath("/");
    return { success: true, ...counts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể lưu nhập hàng loạt" };
  }
}

/** Looks an SKU up across Sealed and Single so the grid can auto-fill a known row. */
export async function lookupSkuAction(sku: string) {
  const key = sku.trim();
  if (!key) return null;

  const sealed = await prisma.sealedProduct.findFirst({
    where: { sku: { equals: key, mode: "insensitive" } },
  });
  if (sealed) {
    return {
      sku: sealed.sku,
      kind: "SEALED" as const,
      name: sealed.name,
      game: sealed.game ?? "",
      rawGrade: "",
      costPrice: Number(sealed.costPrice),
      quantity: sealed.quantity,
      isGraded: false,
    };
  }

  const single = await prisma.singleCard.findFirst({
    where: { sku: { equals: key, mode: "insensitive" } },
  });
  if (single) {
    return {
      sku: single.sku,
      kind: "SINGLE" as const,
      name: single.cardName,
      game: single.game ?? "",
      rawGrade: single.rawGrade ?? "",
      costPrice: Number(single.costPrice),
      quantity: single.quantity,
      isGraded: single.condition === "GRADED",
    };
  }
  return null;
}
