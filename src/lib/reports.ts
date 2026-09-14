import { prisma } from "@/lib/prisma";

export interface MonthlyFinancial {
  month: string; // "YYYY-MM"
  label: string; // "Tháng 9/2026"
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-");
  return `Tháng ${Number(month)}/${year}`;
}

export async function getMonthlyFinancialReport(monthsBack = 12): Promise<MonthlyFinancial[]> {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  const [ledgerEntries, saleTransactions] = await Promise.all([
    prisma.cashLedgerEntry.findMany({
      where: { createdAt: { gte: rangeStart } },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { type: "SALE", transactionDate: { gte: rangeStart }, totalCost: { not: null } },
      select: { totalAmount: true, totalCost: true, transactionDate: true },
    }),
  ]);

  const months: MonthlyFinancial[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    months.push({ month: key, label: monthLabel(key), totalIncome: 0, totalExpense: 0, netProfit: 0 });
  }

  const byMonth = new Map(months.map((m) => [m.month, m]));

  // Thu/Chi = raw cash movement (every sale/purchase/manual adjustment).
  for (const entry of ledgerEntries) {
    const bucket = byMonth.get(monthKey(entry.createdAt));
    if (!bucket) continue;

    const amount = Number(entry.amount);
    if (amount >= 0) {
      bucket.totalIncome += amount;
    } else {
      bucket.totalExpense += Math.abs(amount);
    }
  }

  // Lợi nhuận = tổng giá bán - tổng giá gốc của các đơn bán trong tháng
  // (không phải Thu - Chi, để không lẫn với các đợt nhập hàng chưa bán hết).
  for (const sale of saleTransactions) {
    const bucket = byMonth.get(monthKey(sale.transactionDate));
    if (!bucket) continue;

    bucket.netProfit += Number(sale.totalAmount) - Number(sale.totalCost ?? 0);
  }

  return months;
}
