import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";

import { sessionOptions, type SessionData } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  if (!session.isLoggedIn) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/inventory/:path*",
    "/customers/:path*",
    "/cash-flow/:path*",
    "/shipping/:path*",
  ],
};
