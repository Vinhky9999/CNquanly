import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";

// FB_GRAPH_URL only exists so the sync can be exercised against a local stand-in for Meta.
export const GRAPH = process.env.FB_GRAPH_URL || "https://graph.facebook.com/v19.0";

export interface MessengerSettings {
  appId: string | null;
  pageId: string | null;
  pageName: string | null;
  pageAccessToken: string | null;
  appSecret: string | null;
  verifyToken: string;
}

/** Reads the single config row, creating it (with a random verify token) the first time. */
export async function getMessengerSettings(): Promise<MessengerSettings> {
  const existing = await prisma.messengerConfig.findUnique({ where: { id: "default" } });
  const row =
    existing ??
    (await prisma.messengerConfig.create({
      data: { id: "default", verifyToken: crypto.randomBytes(16).toString("hex") },
    }));

  return {
    appId: process.env.FB_APP_ID || row.appId,
    pageId: row.pageId,
    pageName: row.pageName,
    // Environment variables win, so a deployment can keep secrets out of the database.
    pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN || row.pageAccessToken,
    appSecret: process.env.FB_APP_SECRET || row.appSecret,
    verifyToken: row.verifyToken,
  };
}

export function isConnected(settings: MessengerSettings): boolean {
  return Boolean(settings.pageAccessToken);
}

/** X-Hub-Signature-256 check for webhook POSTs ("sha256=<hmac of the raw body>"). */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function graph(path: string, token: string, init?: RequestInit): Promise<{ ok: boolean; json: any }> {
  try {
    const res = await fetch(`${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && !json?.error, json };
  } catch (err) {
    return { ok: false, json: { error: { message: err instanceof Error ? err.message : "Không kết nối được Meta" } } };
  }
}

/** Checks the token and returns the page it belongs to. */
export async function testPageToken(token: string, app?: { appId: string | null; appSecret: string | null }) {
  // Reading the Page's name needs the pages_read_engagement permission, which a fresh app often lacks.
  const named = await graph("/me?fields=id,name", token);
  if (named.ok) return { ok: true as const, pageId: String(named.json.id), pageName: String(named.json.name ?? "") };

  const plain = await graph("/me?fields=id", token);
  if (plain.ok) return { ok: true as const, pageId: String(plain.json.id), pageName: `Page ${plain.json.id}` };

  // Last resort: ask Meta what the token is (works with only the App ID / Secret).
  if (app?.appId && app.appSecret) {
    const dbg = await graph(`/debug_token?input_token=${encodeURIComponent(token)}`, `${app.appId}|${app.appSecret}`);
    const data = dbg.json?.data;
    if (dbg.ok && data?.is_valid && data.profile_id) {
      return { ok: true as const, pageId: String(data.profile_id), pageName: `Page ${data.profile_id}` };
    }
    if (dbg.ok && data && !data.is_valid) {
      return { ok: false as const, error: String(data.error?.message ?? "Token đã hết hạn hoặc không hợp lệ") };
    }
  }
  return { ok: false as const, error: String(named.json?.error?.message ?? "Token không hợp lệ") };
}

export async function fetchProfile(psid: string, token: string | null) {
  if (!token) return null;
  const r = await graph(`/${psid}?fields=name,profile_pic`, token);
  if (!r.ok) return null;
  return { name: (r.json.name as string | undefined) ?? null, picture: (r.json.profile_pic as string | undefined) ?? null };
}

export interface SendResult {
  ok: boolean;
  mid?: string;
  error?: string;
}

/** Sends a text or an image through the Send API (answers inside the 24-hour window). */
export async function sendToMessenger(
  token: string,
  psid: string,
  content: { text: string } | { imageUrl: string }
): Promise<SendResult> {
  const message =
    "text" in content
      ? { text: content.text }
      : { attachment: { type: "image", payload: { url: content.imageUrl, is_reusable: true } } };
  const r = await graph("/me/messages", token, {
    method: "POST",
    body: JSON.stringify({ recipient: { id: psid }, messaging_type: "RESPONSE", message }),
  });
  if (!r.ok) return { ok: false, error: String(r.json?.error?.message ?? "Meta từ chối tin nhắn") };
  return { ok: true, mid: r.json.message_id as string | undefined };
}

interface IncomingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: { type?: string; payload?: { url?: string } }[];
  };
}

function previewOf(text: string | null, imageUrl: string | null) {
  return text?.trim() ? text.trim() : imageUrl ? "[Hình ảnh]" : "";
}

/** Stores one inbound (customer) message or an echo of one the page sent from Facebook itself. */
export async function ingestMessagingEvent(event: IncomingEvent, pageId: string | null, token: string | null) {
  const msg = event.message;
  if (!msg || (!msg.text && !msg.attachments?.length)) return;

  const isEcho = Boolean(msg.is_echo);
  // For an echo the customer is the recipient; otherwise the sender.
  const psid = isEcho ? event.recipient?.id : event.sender?.id;
  if (!psid || psid === pageId) return;

  if (msg.mid && (await prisma.messengerMessage.findUnique({ where: { mid: msg.mid } }))) return; // webhook retry

  const text = msg.text ?? null;
  const imageUrl = msg.attachments?.find((a) => a.type === "image")?.payload?.url ?? null;
  const at = event.timestamp ? new Date(event.timestamp) : new Date();

  let conversation = await prisma.messengerConversation.findUnique({ where: { psid } });
  if (!conversation) {
    const profile = await fetchProfile(psid, token);
    conversation = await prisma.messengerConversation.create({
      data: {
        psid,
        customerName: profile?.name ?? `Khách ${psid.slice(-4)}`,
        profilePic: profile?.picture ?? null,
        lastMessageAt: at,
      },
    });
  }

  await prisma.messengerMessage.create({
    data: {
      conversationId: conversation.id,
      direction: isEcho ? "OUT" : "IN",
      text,
      imageUrl,
      mid: msg.mid ?? null,
      createdAt: at,
    },
  });
  await prisma.messengerConversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageText: previewOf(text, imageUrl),
      lastMessageAt: at,
      ...(isEcho ? {} : { unreadCount: { increment: 1 } }),
    },
  });
}

export { previewOf };
