// eBay Browse API client (official API, OAuth "client credentials"). It needs an eBay developer application:
//   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET  (developer.ebay.com -> Application Keys, production keyset)
//   EBAY_ENV = production (default) | sandbox
//   EBAY_API_BASE  optional override of the API host (used by the automated tests)
// Without the keys nothing is fetched and every lookup says so: no data is ever invented.

export type EbayErrorKind = "NOT_CONFIGURED" | "NOT_FOUND" | "INVALID_ID" | "AUTH" | "RATE_LIMIT" | "NETWORK" | "API";

export type EbayFetchResult = { ok: true; item: RawEbayItem } | { ok: false; kind: EbayErrorKind; message: string };

/** The parts of a Browse API item that the app reads. Everything is optional: eBay omits fields freely. */
export interface RawEbayItem {
  itemId?: string;
  legacyItemId?: string;
  title?: string;
  shortDescription?: string;
  description?: string;
  price?: { value?: string; currency?: string };
  currentBidPrice?: { value?: string; currency?: string };
  bidCount?: number;
  image?: { imageUrl?: string };
  additionalImages?: { imageUrl?: string }[];
  condition?: string;
  conditionDescription?: string;
  seller?: { username?: string };
  itemEndDate?: string;
  buyingOptions?: string[];
  itemWebUrl?: string;
  localizedAspects?: { type?: string; name?: string; value?: string }[];
  estimatedAvailabilities?: { estimatedAvailabilityStatus?: string }[];
  categoryPath?: string;
}

const env = (name: string) => process.env[name]?.trim() || "";

export const ebayConfigured = () => Boolean(env("EBAY_CLIENT_ID") && env("EBAY_CLIENT_SECRET"));

export function ebayApiBase(): string {
  const override = env("EBAY_API_BASE");
  if (override) return override.replace(/\/+$/, "");
  return env("EBAY_ENV").toLowerCase() === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

export const NOT_CONFIGURED_MESSAGE =
  "Chưa cấu hình eBay API (thiếu EBAY_CLIENT_ID / EBAY_CLIENT_SECRET). Bạn vẫn nhập tay hoặc tải ảnh lên được; xem hướng dẫn lấy khoá trong DEPLOYMENT.md.";

const TIMEOUT_MS = 10_000;

let cachedToken: { value: string; expiresAt: number; key: string } | null = null;

async function getToken(): Promise<{ ok: true; token: string } | { ok: false; kind: EbayErrorKind; message: string }> {
  const id = env("EBAY_CLIENT_ID");
  const secret = env("EBAY_CLIENT_SECRET");
  const key = `${ebayApiBase()}|${id}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) return { ok: true, token: cachedToken.value };

  try {
    const res = await fetch(`${ebayApiBase()}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 400 || res.status === 403) {
      return { ok: false, kind: "AUTH", message: "eBay từ chối khoá API (sai EBAY_CLIENT_ID / EBAY_CLIENT_SECRET hoặc sai môi trường production / sandbox). Kiểm tra lại khoá." };
    }
    if (!res.ok) return { ok: false, kind: "API", message: `eBay trả lỗi ${res.status} khi cấp quyền truy cập. Thử lại sau.` };
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return { ok: false, kind: "API", message: "eBay không trả mã truy cập hợp lệ." };
    cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 7200) * 1000, key };
    return { ok: true, token: json.access_token };
  } catch {
    return { ok: false, kind: "NETWORK", message: "Không kết nối được tới eBay (mạng lỗi hoặc eBay phản hồi quá lâu). Thử lại sau hoặc nhập tay." };
  }
}

/** Looks up one listing by its Item ID (legacy id, the number in the eBay link). Never throws. */
export async function fetchEbayItem(itemId: string, marketplace = "EBAY_US"): Promise<EbayFetchResult> {
  if (!ebayConfigured()) return { ok: false, kind: "NOT_CONFIGURED", message: NOT_CONFIGURED_MESSAGE };

  const token = await getToken();
  if (!token.ok) return token;

  try {
    const res = await fetch(`${ebayApiBase()}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(itemId)}`, {
      headers: { authorization: `Bearer ${token.token}`, "x-ebay-c-marketplace-id": marketplace, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) return { ok: true, item: (await res.json()) as RawEbayItem };

    const body = (await res.json().catch(() => null)) as { errors?: { errorId?: number; message?: string }[] } | null;
    const errorId = body?.errors?.[0]?.errorId;
    if (res.status === 401 || res.status === 403) {
      cachedToken = null;
      return { ok: false, kind: "AUTH", message: "eBay từ chối truy cập (khoá hết hạn hoặc không đủ quyền). Kiểm tra lại EBAY_CLIENT_ID / EBAY_CLIENT_SECRET." };
    }
    if (res.status === 429) return { ok: false, kind: "RATE_LIMIT", message: "Đã vượt giới hạn số lần gọi eBay API trong ngày. Thử lại sau hoặc nhập tay." };
    if (res.status === 404 || errorId === 11001) {
      return { ok: false, kind: "NOT_FOUND", message: "eBay không trả dữ liệu cho Item ID này: listing không tồn tại, đã kết thúc hoặc đã bị gỡ." };
    }
    if (res.status === 400) {
      return { ok: false, kind: "INVALID_ID", message: body?.errors?.[0]?.message ? `eBay không nhận Item ID này: ${body.errors[0].message}` : "eBay không nhận Item ID này." };
    }
    return { ok: false, kind: "API", message: `eBay trả lỗi ${res.status}. Thử lại sau hoặc nhập tay.` };
  } catch {
    return { ok: false, kind: "NETWORK", message: "Không kết nối được tới eBay (mạng lỗi hoặc eBay phản hồi quá lâu). Thử lại sau hoặc nhập tay." };
  }
}

// ---- image copies -----------------------------------------------------------------------------------------------

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Only eBay's own image hosts (and the test server) may be downloaded, so a link cannot make the server fetch arbitrary URLs. */
export function isAllowedImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (env("EBAY_API_BASE") && url.host === new URL(env("EBAY_API_BASE")).host) return true;
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "ebayimg.com" || host.endsWith(".ebayimg.com") || host === "ebaystatic.com" || host.endsWith(".ebaystatic.com");
  } catch {
    return false;
  }
}

/** Downloads one listing photo to keep a copy in the consignment file. Returns null when it cannot (the link is kept anyway). */
export async function downloadImage(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (!isAllowedImageUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!contentType.startsWith("image/")) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length === 0 || data.length > IMAGE_MAX_BYTES) return null;
    return { data, contentType };
  } catch {
    return null;
  }
}
