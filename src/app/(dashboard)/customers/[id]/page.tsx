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
          include: { items: { include: { sealedProduct: true, singleCard: true } } },
        },
      },
    }),
    prisma.customerTag.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!customer) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{customer.name}</h1>

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
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
