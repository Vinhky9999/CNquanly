import { NextRequest, NextResponse } from "next/server";

import { guarded, readJson } from "@/lib/consignment/api";
import { ConsignmentError, deleteItem, updateItem } from "@/lib/consignment/mutations";
import { getItemDto } from "@/lib/consignment/service";
import { updateItemSchema } from "@/lib/consignment/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: Ctx) {
  return guarded(async () => {
    const item = await getItemDto(params.id);
    if (!item) throw new ConsignmentError("Không tìm thấy thẻ ký gửi.", 404);
    return NextResponse.json({ item });
  });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  return guarded(async () => {
    await updateItem(params.id, updateItemSchema.parse(await readJson(request)));
    return NextResponse.json({ item: await getItemDto(params.id) });
  });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  return guarded(async () => {
    await deleteItem(params.id);
    return NextResponse.json({ ok: true });
  });
}
