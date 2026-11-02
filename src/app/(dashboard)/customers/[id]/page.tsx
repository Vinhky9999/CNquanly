import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerForm } from "@/components/customers/customer-form";
import { TransactionHistoryTable } from "@/components/customers/transaction-history-table";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const [customer, allTags] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: params.id },
      include: {
        tags: true,
        transactions: {
          orderBy: { transactionDate: "desc" },
          include: {
            items: { include: { sealedProduct: true, singleCard: true } },
            cashLedgerEntry: { select: { id: true } },
            debts: { select: { amount: true, paidAmount: true } },
          },
        },
      },
    }),
    prisma.customerTag.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!customer) notFound();

  // Open receivables of this customer: linked by customer, or typed in the debt book with the same name.
  const openDebts = await prisma.debt.findMany({
    where: {
      type: "ADVANCED_TO_PERSON",
      status: { not: "PAID" },
      OR: [{ customerId: customer.id }, { personName: { equals: customer.name.trim(), mode: "insensitive" } }],
    },
    select: { amount: true, paidAmount: true },
  });
  const receivable = openDebts.reduce((s, d) => s + (Number(d.amount) - Number(d.paidAmount)), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        {receivable > 0 && (
          <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
            Công nợ phải thu: {receivable.toLocaleString("vi-VN")} ₫
          </span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin & sở thích ngách</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm customer={customer} allTags={allTags} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử giao dịch</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionHistoryTable
            transactions={customer.transactions.map((t) => ({
              ...t,
              totalAmount: t.totalAmount as unknown as number,
              items: t.items.map((i) => ({ ...i, unitPrice: i.unitPrice as unknown as number })),
              debts: t.debts.map((d) => ({ amount: Number(d.amount), paidAmount: Number(d.paidAmount) })),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
