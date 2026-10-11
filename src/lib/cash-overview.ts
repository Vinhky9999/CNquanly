import { prisma } from "@/lib/prisma";
import { getDebtSummary } from "@/lib/debt-summary";

export interface CashOverview {
  totalInflow: number; // tổng các khoản dương (bán hàng, thu hồi nợ, điều chỉnh +...)
  totalOutflow: number; // tổng trị tuyệt đối các khoản âm (mua hàng, rút, trả nợ...)
  netBalance: number; // totalInflow - totalOutflow
  pendingDebtTotal: number; // phải trả + phải thu còn lại
  owedByShop: number;
  owedToShop: number;
}

export async function getCashOverview(): Promise<CashOverview> {
  const [positive, negative, debts] = await Promise.all([
    prisma.cashLedgerEntry.aggregate({ _sum: { amount: true }, where: { amount: { gt: 0 } } }),
    prisma.cashLedgerEntry.aggregate({ _sum: { amount: true }, where: { amount: { lt: 0 } } }),
    getDebtSummary(),
  ]);

  const totalInflow = Number(positive._sum.amount ?? 0);
  const totalOutflow = Math.abs(Number(negative._sum.amount ?? 0));

  return {
    totalInflow,
    totalOutflow,
    netBalance: totalInflow - totalOutflow,
    pendingDebtTotal: debts.totalOwedByShop + debts.totalOwedToShop,
    owedByShop: debts.totalOwedByShop,
    owedToShop: debts.totalOwedToShop,
  };
}
