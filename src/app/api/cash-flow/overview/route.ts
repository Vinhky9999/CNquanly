import { NextResponse } from "next/server";

import { getCashOverview } from "@/lib/cash-overview";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getCashOverview());
}
