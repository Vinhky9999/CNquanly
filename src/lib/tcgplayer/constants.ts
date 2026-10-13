/**
 * Every TCGplayer price in the app is the United States marketplace price in USD (Market Price from
 * recent US sales, or the median of US listings when there are none). It is converted to VND for
 * display only; this constant is the single place that pins the region.
 */
export const TCG_MARKET = {
  country: "US",
  currency: "USD",
  label: "TCGplayer US",
  badge: "US Market",
} as const;

/** Auto-matches scoring below this are shown as "approximate — please verify". */
export const CONFIDENT_SCORE = 0.8;

/** Sentinel for priceLinkAttemptedAt meaning "owner unlinked this product — never auto-link again". */
export const AUTO_LINK_OPTED_OUT = new Date("2100-01-01T00:00:00.000Z");

/**
 * Bump whenever the TCGplayer matcher gets smarter: products the previous matcher gave up on
 * are then tried again right away instead of after the usual 24-hour wait.
 *   1 = first matcher (name search only)
 *   2 = set codes, card numbers, printing words, typo-fixed form factors, numbered sets ("02")
 */
export const MATCHER_VERSION = 2;

/** Appended to the stored label when TCGplayer has no Market Price yet and the listed median is used. */
export const LISTED_PRICE_NOTE = " · giá niêm yết (chưa có giao dịch)";
