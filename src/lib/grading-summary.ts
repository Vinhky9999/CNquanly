import { prisma } from "@/lib/prisma";

export interface GradingSummary {
  activeOrders: number; // đơn chưa trả khách
  activeCards: number; // số thẻ đang gửi hãng / chưa trả khách
  totalRevenue: number; // tổng khách phải trả
  totalCost: number; // tổng giá gốc
  totalProfit: number; // tổng lãi dịch vụ
  uncollected: number; // doanh thu chưa thu tiền khách
}

export async function getGradingSummary(): Promise<GradingSummary> {
  const rows = await prisma.gradingSubmission.findMany({
    select: { status: true, quantity: true, costPrice: true, markup: true, chargeAmount: true, incomeEntryId: true },
  });

  const summary: GradingSummary = {
    activeOrders: 0,
    activeCards: 0,
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    uncollected: 0,
  };

  for (const row of rows) {
    if (row.status !== "COMPLETED") {
      summary.activeOrders += 1;
      summary.activeCards += row.quantity;
    }
    summary.totalRevenue += Number(row.chargeAmount);
    summary.totalCost += Number(row.costPrice);
    summary.totalProfit += Number(row.markup);
    if (!row.incomeEntryId) summary.uncollected += Number(row.chargeAmount);
  }
  return summary;
}
