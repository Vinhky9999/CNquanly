import { NextResponse } from "next/server";

import { getDebtSummary } from "@/lib/debt-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await getDebtSummary();
  return NextResponse.json(summary);
}
