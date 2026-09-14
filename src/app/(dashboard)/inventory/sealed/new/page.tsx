import { SealedProductForm } from "@/components/inventory/sealed-product-form";

export default function NewSealedProductPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Thêm Box/Case</h1>
      <SealedProductForm />
    </div>
  );
}
