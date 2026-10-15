import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { getMessengerSettings } from "@/lib/messenger";
import { loginUrl, originOf, redirectUriFor, STATE_COOKIE } from "@/lib/messenger-oauth";

// Step 1 of "Kết nối với Facebook": send the owner to Facebook's login dialog.
export async function GET(request: Request) {
  const origin = originOf(request);
  if (await requireApiSession()) return NextResponse.redirect(`${origin}/login`);

  const settings = await getMessengerSettings();
  if (!settings.appId || !settings.appSecret) {
    return NextResponse.redirect(`${origin}/messages?fb=error&msg=${encodeURIComponent("Chưa nhập App ID / App Secret")}`);
  }

  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(loginUrl(settings.appId, redirectUriFor(origin), state));
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https"), maxAge: 600, path: "/" });
  return response;
}
