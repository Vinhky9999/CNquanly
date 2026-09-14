import { prisma } from "@/lib/prisma";
import { CustomerForm } from "@/components/customers/customer-form";

export default async function NewCustomerPage() {
  const allTags = await prisma.customerTag.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Thêm khách hàng</h1>
      <CustomerForm allTags={allTags} />
    </div>
  );
}
