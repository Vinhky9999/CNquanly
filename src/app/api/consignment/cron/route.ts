import { NextRequest, NextResponse } from "next/server";

import { handle } from "@/lib/consignment/api";
import { refreshActiveItems } from "@/lib/consignment/tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Optional scheduled refresh (Vercel Cron or any scheduler): GET with `Authorization: Bearer <CRON_SECRET>`.
 * It does nothing unless CRON_SECRET is set, so it cannot be called anonymously.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Không được phép" }, { status: 401 });
  }
  return handle(async () => NextResponse.json(await refreshActiveItems()));
}
