import { notFound } from "next/navigation";

import { ItemDetail } from "@/components/consignment/item-detail";
import { getItemDto } from "@/lib/consignment/service";

export const dynamic = "force-dynamic";

export default async function ConsignmentItemPage({ params }: { params: { id: string } }) {
  const item = await getItemDto(params.id);
  if (!item) notFound();
  return <ItemDetail initial={item} />;
}
