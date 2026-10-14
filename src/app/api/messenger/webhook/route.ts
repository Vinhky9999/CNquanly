import { NextRequest, NextResponse } from "next/server";

import { getMessengerSettings, ingestMessagingEvent, verifySignature } from "@/lib/messenger";

// Public endpoint called by Meta. GET answers the subscription handshake with the verify token;
// POST delivers messages and is accepted only with a valid X-Hub-Signature-256 (needs the App Secret).

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const settings = await getMessengerSettings();

  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === settings.verifyToken) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const settings = await getMessengerSettings();
  const raw = await request.text();

  if (!settings.appSecret || !verifySignature(raw, request.headers.get("x-hub-signature-256"), settings.appSecret)) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  if (body?.object === "page") {
    for (const entry of body.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        try {
          await ingestMessagingEvent(event, settings.pageId ?? entry.id ?? null, settings.pageAccessToken);
        } catch {
          // One bad event must not make Meta retry the whole batch.
        }
      }
    }
  }
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}
