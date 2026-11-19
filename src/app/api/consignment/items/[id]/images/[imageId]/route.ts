import { NextRequest, NextResponse } from "next/server";

import { guarded } from "@/lib/consignment/api";
import { deleteImage } from "@/lib/consignment/mutations";
import { getItemDto } from "@/lib/consignment/service";

export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string; imageId: string } }) {
  return guarded(async () => {
    await deleteImage(params.id, params.imageId);
    return NextResponse.json({ item: await getItemDto(params.id) });
  });
}
