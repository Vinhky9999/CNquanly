import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { PENDING_COOKIE, unsealPages } from "@/lib/messenger-oauth";

// Pages waiting to be chosen after a Facebook login (names only — tokens stay in the sealed cookie).
export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  const pages = await unsealPages((await cookies()).get(PENDING_COOKIE)?.value);
  return NextResponse.json({ pages: pages.map((p) => ({ id: p.id, name: p.name })) });
}
