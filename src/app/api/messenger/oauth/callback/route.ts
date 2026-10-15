import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { getMessengerSettings } from "@/lib/messenger";
import {
  originOf,
  PENDING_COOKIE,
  pagesFromLoginCode,
  redirectUriFor,
  sealPages,
  STATE_COOKIE,
} from "@/lib/messenger-oauth";
import { finishPageConnection } from "@/lib/messenger-connect";

// Step 2: Facebook sends the owner back here with ?code. One Page is connected straight away;
// several Pages are held (encrypted, 10 minutes) so the owner can choose in the app.
export async function GET(request: Request) {
  const origin = originOf(request);
  const back = (query: string) => NextResponse.redirect(`${origin}/messages?${query}`);
  const fail = (msg: string) => back(`fb=error&msg=${encodeURIComponent(msg)}`);

  if (await requireApiSession()) return NextResponse.redirect(`${origin}/login`);

  const url = new URL(request.url);
  if (url.searchParams.get("error")) return fail("Bạn đã huỷ hoặc không cấp quyền trên Facebook");

  const cookies = request.headers.get("cookie") ?? "";
  const cookie = (name: string) => cookies.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  const state = url.searchParams.get("state");
  if (!state || state !== cookie(STATE_COOKIE)) return fail("Phiên đăng nhập Facebook không hợp lệ, hãy thử lại");

  const code = url.searchParams.get("code");
  const settings = await getMessengerSettings();
  if (!code || !settings.appId || !settings.appSecret) return fail("Thiếu mã đăng nhập hoặc App ID / App Secret");

  const result = await pagesFromLoginCode(code, settings.appId, settings.appSecret, redirectUriFor(origin));
  if (!result.ok) return fail(result.error);

  const clear = (res: NextResponse) => {
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  if (result.pages.length === 1) {
    const outcome = await finishPageConnection(result.pages[0], origin);
    return clear(back(outcome.warning ? `fb=connected&warn=${encodeURIComponent(outcome.warning)}` : "fb=connected"));
  }

  const res = back("fb=pick");
  res.cookies.set(PENDING_COOKIE, await sealPages(result.pages), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    maxAge: 600,
    path: "/",
  });
  return clear(res);
}
