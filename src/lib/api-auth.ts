import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

/** Returns a 401 response when nobody is logged in, otherwise null. (API routes are not covered by the page middleware.) */
export async function requireApiSession(): Promise<NextResponse | null> {
  const session = await getSession();
  return session.isLoggedIn ? null : NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
}
