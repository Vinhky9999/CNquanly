import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { SingleCardForm } from "@/components/inventory/single-card-form";

export default async function EditSingleCardPage({ params }: { params: { id: string } }) {
  const [card, gradingCompanies] = await Promise.all([
    prisma.singleCard.findUnique({ where: { id: params.id } }),
    prisma.gradingCompany.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!card) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Sửa lá bài</h1>
      <SingleCardForm card={card} gradingCompanies={gradingCompanies} />
    </div>
  );
}
