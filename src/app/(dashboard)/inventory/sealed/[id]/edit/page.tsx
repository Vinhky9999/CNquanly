import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { SealedProductForm } from "@/components/inventory/sealed-product-form";

export default async function EditSealedProductPage({ params }: { params: { id: string } }) {
  const product = await prisma.sealedProduct.findUnique({ where: { id: params.id } });
  if (!product) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Sửa Box/Case</h1>
      <SealedProductForm product={product} />
    </div>
  );
}
