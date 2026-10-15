import { sealData, unsealData } from "iron-session";

import { GRAPH, graph } from "@/lib/messenger";

// "Kết nối với Facebook": the owner logs in, picks a Page, and the app stores the Page token and
// subscribes the Page / webhook itself — no copying tokens by hand.

export const OAUTH_SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_metadata"];
export const STATE_COOKIE = "fb_oauth_state";
export const PENDING_COOKIE = "fb_oauth_pending";

const password = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
};

export interface PendingPage {
  id: string;
  name: string;
  token: string;
}

/** Pages the owner can pick from, sealed (encrypted + signed) so tokens never reach the browser. */
export const sealPages = (pages: PendingPage[]) => sealData({ pages }, { password: password(), ttl: 600 });

export async function unsealPages(seal: string | undefined): Promise<PendingPage[]> {
  if (!seal) return [];
  try {
    const data = await unsealData<{ pages: PendingPage[] }>(seal, { password: password(), ttl: 600 });
    return data.pages ?? [];
  } catch {
    return [];
  }
}

export function redirectUriFor(origin: string) {
  return `${origin}/api/messenger/oauth/callback`;
}

export function loginUrl(appId: string, redirectUri: string, state: string) {
  const q = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: OAUTH_SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${q}`;
}

async function plainGet(path: string, params: Record<string, string>) {
  try {
    const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`, {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && !json?.error, json };
  } catch (err) {
    return { ok: false, json: { error: { message: err instanceof Error ? err.message : "Không kết nối được Meta" } } };
  }
}

/** Login code -> long-lived user token -> the Pages (with non-expiring Page tokens) the user manages. */
export async function pagesFromLoginCode(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<{ ok: true; pages: PendingPage[] } | { ok: false; error: string }> {
  const short = await plainGet("/oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  if (!short.ok) return { ok: false, error: String(short.json?.error?.message ?? "Không đổi được mã đăng nhập") };

  const long = await plainGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: String(short.json.access_token),
  });
  const userToken = String((long.ok ? long.json.access_token : short.json.access_token) ?? "");

  const accounts = await plainGet("/me/accounts", { fields: "id,name,access_token", limit: "50", access_token: userToken });
  if (!accounts.ok) return { ok: false, error: String(accounts.json?.error?.message ?? "Không lấy được danh sách Page") };

  const pages: PendingPage[] = (accounts.json.data ?? [])
    .filter((p: any) => p?.id && p?.access_token)
    .map((p: any) => ({ id: String(p.id), name: String(p.name ?? p.id), token: String(p.access_token) }));
  if (pages.length === 0) {
    return { ok: false, error: "Facebook không trả về Page nào. Khi đăng nhập hãy tick chọn đúng Fanpage ở bước \"Chọn Trang\". Nếu Page thuộc Business Portfolio (Meta Business Suite) và vẫn trống, dùng Cách B (dán Page Access Token)" };
  }
  return { ok: true, pages };
}

/** Makes the app receive this Page's messages. */
export async function subscribePage(pageId: string, pageToken: string) {
  const r = await graph(`/${pageId}/subscribed_apps?subscribed_fields=messages,message_echoes`, pageToken, { method: "POST" });
  return r.ok ? { ok: true as const } : { ok: false as const, error: String(r.json?.error?.message ?? "Không đăng ký được Page") };
}

/** Registers the webhook (callback URL + verify token) on the app, replacing the manual dashboard step. */
export async function subscribeAppWebhook(appId: string, appSecret: string, callbackUrl: string, verifyToken: string) {
  const r = await graph(
    `/${appId}/subscriptions?${new URLSearchParams({
      object: "page",
      callback_url: callbackUrl,
      fields: "messages,message_echoes",
      verify_token: verifyToken,
    })}`,
    `${appId}|${appSecret}`,
    { method: "POST" }
  );
  return r.ok
    ? { ok: true as const }
    : { ok: false as const, error: String(r.json?.error?.message ?? "Không đăng ký được webhook") };
}

/** Public origin of this deployment (behind Vercel's proxy the Host header is the real domain). */
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Confirms that App ID and App Secret belong together (client-credentials token request). */
export async function verifyAppCredentials(appId: string, appSecret: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await plainGet("/oauth/access_token", { client_id: appId, client_secret: appSecret, grant_type: "client_credentials" });
  if (r.ok && r.json?.access_token) return { ok: true };
  const message = String(r.json?.error?.message ?? "");
  if (/secret/i.test(message)) {
    return { ok: false, error: "App Secret không đúng. Dùng “Khóa bí mật của ứng dụng” ở Cài đặt ứng dụng → Cơ bản (không phải Mã ứng dụng / Client Token), và phải cùng App với App ID." };
  }
  if (/application|app id|does not exist/i.test(message)) return { ok: false, error: "App ID không đúng hoặc App không tồn tại" };
  return { ok: false, error: message || "Không kiểm tra được App ID / App Secret" };
}
