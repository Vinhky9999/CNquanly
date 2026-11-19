import { NextResponse } from "next/server";

import { guarded } from "@/lib/consignment/api";
import { refreshActiveItems } from "@/lib/consignment/tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Refreshes the cards still waiting for an auction result (called while the Ký gửi page is open). */
export async function POST() {
  return guarded(async () => NextResponse.json(await refreshActiveItems()));
}
