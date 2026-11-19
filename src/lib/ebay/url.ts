// Recognises an eBay item link (or a bare Item ID) and extracts the Item ID and the marketplace it belongs to.

export interface ParsedEbayUrl {
  itemId: string;
  /** eBay marketplace id for the API header, e.g. EBAY_US. */
  marketplace: string;
  /** Canonical link to the listing. */
  url: string;
}

export type ParseEbayResult = { ok: true; value: ParsedEbayUrl } | { ok: false; error: string };

const MARKETPLACES: [suffix: string, id: string][] = [
  ["com.au", "EBAY_AU"],
  ["com.hk", "EBAY_HK"],
  ["com.sg", "EBAY_SG"],
  ["com.my", "EBAY_MY"],
  ["co.uk", "EBAY_GB"],
  ["ca", "EBAY_CA"],
  ["de", "EBAY_DE"],
  ["fr", "EBAY_FR"],
  ["it", "EBAY_IT"],
  ["es", "EBAY_ES"],
  ["nl", "EBAY_NL"],
  ["ie", "EBAY_IE"],
  ["at", "EBAY_AT"],
  ["ch", "EBAY_CH"],
  ["pl", "EBAY_PL"],
  ["ph", "EBAY_PH"],
  ["com", "EBAY_US"],
];

const SHORT_LINK_HOSTS = ["ebay.us", "ebay.to", "pics.ebay.com"];
const ITEM_ID = /^\d{9,14}$/;

/** ebay.<country> itself or any subdomain of it (www., cgi., m. ...). A host that only starts with "ebay." or merely contains it does not count. */
function marketplaceOf(host: string): string | null {
  const clean = host.toLowerCase();
  return MARKETPLACES.find(([suffix]) => clean === `ebay.${suffix}` || clean.endsWith(`.ebay.${suffix}`))?.[1] ?? null;
}

/** The country endings of every eBay site the app understands (com, co.uk, com.au ...). */
export const EBAY_SUFFIXES: readonly string[] = MARKETPLACES.map(([suffix]) => suffix);

/** true for ebay.<country> and its subdomains. */
export function isEbayHost(host: string): boolean {
  return marketplaceOf(host) !== null;
}

export function parseEbayUrl(input: string): ParseEbayResult {
  const text = input.trim();
  if (!text) return { ok: false, error: "Hãy dán link sản phẩm eBay." };

  // A bare Item ID is fine: the US marketplace is assumed.
  if (ITEM_ID.test(text)) {
    return { ok: true, value: { itemId: text, marketplace: "EBAY_US", url: `https://www.ebay.com/itm/${text}` } };
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: "Link không hợp lệ. Hãy dán đúng link sản phẩm eBay, ví dụ https://www.ebay.com/itm/123456789012." };
  }

  const host = url.hostname.toLowerCase();
  if (SHORT_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { ok: false, error: "Đây là link rút gọn của eBay nên không đọc được Item ID. Hãy mở link trên trình duyệt rồi sao chép link đầy đủ (dạng ebay.com/itm/…)." };
  }
  const marketplace = marketplaceOf(host);
  if (!marketplace) return { ok: false, error: "Link này không phải của eBay. Hãy dán link sản phẩm eBay (ebay.com/itm/…)." };

  // /itm/123456789012, /itm/Some-Title/123456789012, /itm/p/123456789012
  const fromPath = url.pathname.split("/").filter(Boolean);
  const itmIndex = fromPath.indexOf("itm");
  let itemId: string | undefined;
  if (itmIndex >= 0) itemId = fromPath.slice(itmIndex + 1).find((seg) => ITEM_ID.test(seg));
  // Older style: ...ViewItem&item=123456789012
  itemId ??= [url.searchParams.get("item"), url.searchParams.get("itemId"), url.searchParams.get("iid")].find((v) => v && ITEM_ID.test(v)) ?? undefined;
  if (!itemId) return { ok: false, error: "Không tìm thấy Item ID (dãy 9–14 chữ số) trong link. Hãy dán link của một sản phẩm cụ thể (ebay.com/itm/…), không phải trang tìm kiếm hay trang cửa hàng." };

  return { ok: true, value: { itemId, marketplace, url: `https://${host.replace(/^www\./, "www.")}/itm/${itemId}` } };
}
