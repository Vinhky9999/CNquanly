import { prisma } from "@/lib/prisma";

export interface DebtSummary {
  totalOwedByShop: number; // CardNest còn phải trả (ADVANCED_BY_PERSON, chưa xong)
  totalOwedToShop: number; // CardNest còn phải thu hồi (ADVANCED_TO_PERSON, chưa xong)
  unpaidCount: number; // số khoản chưa hoàn tất (UNPAID hoặc PARTIAL), cả 2 loại
}

export async function getDebtSummary(): Promise<DebtSummary> {
  const debts = await prisma.debt.findMany({
    where: { status: { not: "PAID" } },
    select: { type: true, amount: true, paidAmount: true },
  });

  let totalOwedByShop = 0;
  let totalOwedToShop = 0;

  for (const d of debts) {
    const remaining = Number(d.amount) - Number(d.paidAmount);
    if (d.type === "ADVANCED_BY_PERSON") {
      totalOwedByShop += remaining;
    } else {
      totalOwedToShop += remaining;
    }
  }

  return {
    totalOwedByShop,
    totalOwedToShop,
    unpaidCount: debts.length,
  };
}
