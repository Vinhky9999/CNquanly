import { NextResponse } from "next/server";

import { getInventoryGameOverview } from "@/lib/inventory-overview";

export const dynamic = "force-dynamic";

export async function GET() {
  const overview = await getInventoryGameOverview();
  return NextResponse.json({ overview });
}
