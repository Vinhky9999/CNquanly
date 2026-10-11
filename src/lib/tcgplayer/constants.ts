/** Auto-matches scoring below this are shown as "approximate — please verify". */
export const CONFIDENT_SCORE = 0.8;

/** Sentinel for priceLinkAttemptedAt meaning "owner unlinked this product — never auto-link again". */
export const AUTO_LINK_OPTED_OUT = new Date("2100-01-01T00:00:00.000Z");
