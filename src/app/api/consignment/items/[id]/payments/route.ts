import { NextRequest, NextResponse } from "next/server";

import { guarded, readJson } from "@/lib/consignment/api";
import { addPayment } from "@/lib/consignment/mutations";
import { getItemDto } from "@/lib/consignment/service";
import { paymentSchema } from "@/lib/consignment/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return guarded(async () => {
    await addPayment(params.id, paymentSchema.parse(await readJson(request)));
    return NextResponse.json({ item: await getItemDto(params.id) }, { status: 201 });
  });
}
