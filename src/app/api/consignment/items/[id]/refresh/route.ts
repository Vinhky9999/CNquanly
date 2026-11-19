import { NextRequest, NextResponse } from "next/server";

import { guarded } from "@/lib/consignment/api";
import { getItemDto } from "@/lib/consignment/service";
import { refreshItem } from "@/lib/consignment/tracking";

export const dynamic = "force-dynamic";

/** Asks eBay for the latest price, bids and end time of one card and returns the updated card with what happened. */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  return guarded(async () => {
    const result = await refreshItem(params.id);
    return NextResponse.json({ result, item: await getItemDto(params.id) });
  });
}
