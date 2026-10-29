"use server";

import { revalidatePath } from "next/cache";
import type { GradingStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getLatestCashBalance, recalculateCashLedgerBalances } from "@/lib/cash-ledger";
import { aggregateItems, gradingCostDescription, gradingCostTotal, gradingIncomeDescription } from "@/lib/grading";
import { gradingItemSchema, gradingSchema } from "@/lib/validations/grading";

type TxClient = Prisma.TransactionClient;

export interface GradingActionState {
  error?: string;
  success?: boolean;
}

function revalidateAll() {
  revalidatePath("/grading");
  revalidatePath("/cash-flow");
  revalidatePath("/");
}

async function requireLogin(): Promise<string | null> {
  const session = await getSession();
  return session.isLoggedIn ? null : "Chưa đăng nhập";
}

function describable(sub: {
  customerName: string;
  cardName: string;
  company: string;
  tier: string;
  quantity: number;
  costPrice: unknown;
  shipFee: unknown;
  markup: unknown;
  chargeAmount: unknown;
}) {
  return {
    ...sub,
    costPrice: Number(sub.costPrice),
    shipFee: Number(sub.shipFee),
    markup: Number(sub.markup),
    chargeAmount: Number(sub.chargeAmount),
  };
}

async function appendEntry(
  tx: TxClient,
  type: "GRADING_INCOME" | "GRADING_COST",
  amount: number,
  description: string
) {
  const previous = await getLatestCashBalance(tx);
  return tx.cashLedgerEntry.create({
    data: { type, amount, balanceAfter: previous + amount, description },
  });
}

/** Thu tiền khách -> dòng IN trong Dòng tiền (doanh thu = tổng Giá dịch vụ). */
async function collectIncome(tx: TxClient, id: string) {
  const sub = await tx.gradingSubmission.findUniqueOrThrow({ where: { id } });
  if (sub.incomeEntryId) return;
  const charge = Number(sub.chargeAmount);
  if (charge <= 0) throw new Error("Đơn chưa có số tiền để thu");
  const entry = await appendEntry(tx, "GRADING_INCOME", charge, gradingIncomeDescription(describable(sub)));
  await tx.gradingSubmission.update({ where: { id }, data: { incomeEntryId: entry.id } });
}

/** Trả phí gốc cho hãng (cộng phí ship) -> dòng OUT trong Dòng tiền. */
async function payCost(tx: TxClient, id: string) {
  const sub = await tx.gradingSubmission.findUniqueOrThrow({ where: { id } });
  if (sub.costEntryId) return;
  const view = describable(sub);
  const cost = gradingCostTotal(view);
  if (cost <= 0) throw new Error("Đơn chưa có giá gốc / phí ship để chi");
  const entry = await appendEntry(tx, "GRADING_COST", -cost, gradingCostDescription(view));
  await tx.gradingSubmission.update({ where: { id }, data: { costEntryId: entry.id } });
}

function parse(formData: FormData) {
  const parsed = gradingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" } as const;
  const d = parsed.data;

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(d.items);
  } catch {
    return { error: "Danh sách thẻ bài không hợp lệ" } as const;
  }
  const itemsParsed = gradingItemSchema.array().min(1, "Đơn phải có ít nhất 1 thẻ bài").safeParse(rawItems);
  if (!itemsParsed.success) return { error: itemsParsed.error.issues[0]?.message ?? "Thẻ bài không hợp lệ" } as const;

  const items = itemsParsed.data.map((i, position) => ({
    cardName: i.cardName,
    game: i.game || null,
    company: i.company,
    tier: i.tier,
    quantity: i.quantity,
    listedFee: i.listedFee,
    costPrice: i.costPrice,
    shipFee: i.shipFee,
    markup: i.markup,
    position,
  }));

  const data = {
    customerName: d.customerName,
    customerContact: d.customerContact || null,
    status: d.status as GradingStatus,
    notes: d.notes || null,
    ...aggregateItems(items),
  };
  return { data, items, collectPayment: d.collectPayment === "on", payCost: d.payCost === "on" } as const;
}

export async function createGradingAction(
  _prev: GradingActionState,
  formData: FormData
): Promise<GradingActionState> {
  const denied = await requireLogin();
  if (denied) return { error: denied };

  const parsed = parse(formData);
  if ("error" in parsed) return { error: parsed.error };

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.gradingSubmission.create({
        data: { ...parsed.data, items: { create: parsed.items } },
      });
      if (parsed.collectPayment) await collectIncome(tx, created.id);
      if (parsed.payCost && parsed.data.costPrice + parsed.data.shipFee > 0) await payCost(tx, created.id);
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể tạo đơn chấm điểm" };
  }

  revalidateAll();
  return { success: true };
}

export async function updateGradingAction(
  id: string,
  _prev: GradingActionState,
  formData: FormData
): Promise<GradingActionState> {
  const denied = await requireLogin();
  if (denied) return { error: denied };

  const parsed = parse(formData);
  if ("error" in parsed) return { error: parsed.error };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.gradingItem.deleteMany({ where: { submissionId: id } });
      const updated = await tx.gradingSubmission.update({
        where: { id },
        data: { ...parsed.data, items: { create: parsed.items } },
      });
      const view = describable(updated);

      // Keep the cash-flow entries in step with the edited amounts.
      if (updated.incomeEntryId) {
        await tx.cashLedgerEntry.update({
          where: { id: updated.incomeEntryId },
          data: { amount: view.chargeAmount, description: gradingIncomeDescription(view) },
        });
      }
      if (updated.costEntryId) {
        await tx.cashLedgerEntry.update({
          where: { id: updated.costEntryId },
          data: { amount: -gradingCostTotal(view), description: gradingCostDescription(view) },
        });
      }
      if (updated.incomeEntryId || updated.costEntryId) await recalculateCashLedgerBalances(tx);

      if (parsed.collectPayment) await collectIncome(tx, id);
      if (parsed.payCost) await payCost(tx, id);
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể cập nhật đơn" };
  }

  revalidateAll();
  return { success: true };
}

export async function updateGradingStatusAction(id: string, status: GradingStatus) {
  const denied = await requireLogin();
  if (denied) return { error: denied };
  try {
    await prisma.gradingSubmission.update({ where: { id }, data: { status } });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể đổi trạng thái" };
  }
  revalidateAll();
  return { success: true };
}

export async function collectGradingPaymentAction(id: string) {
  const denied = await requireLogin();
  if (denied) return { error: denied };
  try {
    await prisma.$transaction((tx) => collectIncome(tx, id));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể ghi nhận thu tiền" };
  }
  revalidateAll();
  return { success: true };
}

export async function payGradingCostAction(id: string) {
  const denied = await requireLogin();
  if (denied) return { error: denied };
  try {
    await prisma.$transaction((tx) => payCost(tx, id));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể ghi nhận chi phí gốc" };
  }
  revalidateAll();
  return { success: true };
}

export async function deleteGradingAction(id: string) {
  const denied = await requireLogin();
  if (denied) return { error: denied };
  try {
    await prisma.$transaction(async (tx) => {
      const sub = await tx.gradingSubmission.findUniqueOrThrow({ where: { id } });
      await tx.gradingSubmission.delete({ where: { id } });
      const entryIds = [sub.incomeEntryId, sub.costEntryId].filter((v): v is string => Boolean(v));
      if (entryIds.length > 0) {
        await tx.cashLedgerEntry.deleteMany({ where: { id: { in: entryIds } } });
        await recalculateCashLedgerBalances(tx);
      }
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể xoá đơn" };
  }
  revalidateAll();
  return { success: true };
}
