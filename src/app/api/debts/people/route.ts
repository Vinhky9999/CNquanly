import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { getDebtsByPerson } from "@/lib/debt-summary";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const includeSettled = request.nextUrl.searchParams.get("includeSettled") === "1";
  return NextResponse.json({ rows: await getDebtsByPerson(includeSettled) });
}
