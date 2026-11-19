import { NextRequest, NextResponse } from "next/server";

import { guarded } from "@/lib/consignment/api";
import { deletePayment } from "@/lib/consignment/mutations";
import { getItemDto } from "@/lib/consignment/service";

export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string; paymentId: string } }) {
  return guarded(async () => {
    await deletePayment(params.id, params.paymentId);
    return NextResponse.json({ item: await getItemDto(params.id) });
  });
}
