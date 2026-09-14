import { prisma } from "@/lib/prisma";
import { SingleCardForm } from "@/components/inventory/single-card-form";

export default async function NewSingleCardPage() {
  const gradingCompanies = await prisma.gradingCompany.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Thêm lá bài</h1>
      <SingleCardForm gradingCompanies={gradingCompanies} />
    </div>
  );
}
