import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { getMessengerSettings } from "@/lib/messenger";

// Never returns the token or the app secret — only whether they are set.
export async function GET(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const s = await getMessengerSettings();
  const origin = request.nextUrl.origin;
  return NextResponse.json({
    pageId: s.pageId,
    pageName: s.pageName,
    hasToken: Boolean(s.pageAccessToken),
    hasAppSecret: Boolean(s.appSecret),
    verifyToken: s.verifyToken,
    webhookUrl: `${origin}/api/messenger/webhook`,
    tokenFromEnv: Boolean(process.env.FB_PAGE_ACCESS_TOKEN),
  });
}
