import { prisma } from "@/lib/prisma";

export interface MonthlyFinancial {
  month: string; // "YYYY-MM"
  label: string; // "Tháng 9/2026"
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  salesProfit: number; // lãi bán hàng RÒNG của tháng: tổng (giá bán - giá vốn) của mọi đơn, đơn bán lỗ bị trừ vào
  salesLoss: number; // tổng số tiền lỗ của các đơn bán dưới giá vốn trong tháng (số dương)
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

  const [ledgerEntries, saleTransactions, gradingIncome] = await Promise.all([
    prisma.cashLedgerEntry.findMany({
      where: { createdAt: { gte: rangeStart } },
      select: { amount: true, createdAt: true, countsAsProfit: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { type: "SALE", transactionDate: { gte: rangeStart }, totalCost: { not: null } },
      select: { totalAmount: true, totalCost: true, transactionDate: true },
    }),
    // Chấm điểm: đơn đã ghi nhận "khách đã trả tiền" (có dòng Thu trong Dòng tiền) thì lãi dịch vụ được tính vào lợi nhuận.
    prisma.cashLedgerEntry.findMany({
      where: { type: "GRADING_INCOME", createdAt: { gte: rangeStart }, gradingIncome: { isNot: null } },
      select: { createdAt: true, gradingIncome: { select: { markup: true } } },
    }),
  ]);

  const months: MonthlyFinancial[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    months.push({
      month: key,
      label: monthLabel(key),
      totalIncome: 0,
      totalExpense: 0,
      netProfit: 0,
      salesProfit: 0,
      salesLoss: 0,
    });
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
    // Điều chỉnh dương được đánh dấu "tính vào lãi": cộng thẳng vào lợi nhuận của tháng.
    if (entry.countsAsProfit && amount > 0) {
      bucket.netProfit += amount;
      bucket.salesProfit += amount;
    }
  }

  // Lợi nhuận = tổng giá bán - tổng giá gốc của các đơn bán trong tháng
  // (không phải Thu - Chi, để không lẫn với các đợt nhập hàng chưa bán hết).
  for (const sale of saleTransactions) {
    const bucket = byMonth.get(monthKey(sale.transactionDate));
    if (!bucket) continue;

    const profit = Number(sale.totalAmount) - Number(sale.totalCost ?? 0);
    bucket.netProfit += profit;
    // Bán lỗ (giá bán < giá vốn) được ghi nhận là lỗ và TRỪ thẳng vào lợi nhuận của tháng.
    bucket.salesProfit += profit;
    if (profit < 0) bucket.salesLoss += -profit;
  }

  // Lãi dịch vụ chấm điểm của các đơn đã thu tiền khách, tính vào tháng nhận tiền (âm = lỗ, trừ vào lợi nhuận).
  for (const entry of gradingIncome) {
    const bucket = byMonth.get(monthKey(entry.createdAt));
    if (!bucket || !entry.gradingIncome) continue;
    const profit = Number(entry.gradingIncome.markup);
    bucket.netProfit += profit;
    bucket.salesProfit += profit;
    if (profit < 0) bucket.salesLoss += -profit;
  }

  return months;
}
