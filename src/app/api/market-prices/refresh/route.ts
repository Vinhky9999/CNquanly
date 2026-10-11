import { NextRequest, NextResponse } from "next/server";

import { refreshMarketPrices } from "@/lib/market-prices";

export const dynamic = "force-dynamic";

// Called by the Vercel cron (Authorization: Bearer $CRON_SECRET) to keep prices fresh
// even when nobody has the app open.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await refreshMarketPrices({ force: true }));
}
