// Text helpers for matching hand-typed product names (Vietnamese keyboard, typos,
// "BlackBolt" style run-ons) against TCGplayer product names.

export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    // "BlackBolt" -> "Black Bolt", "WhiteFlare" -> "White Flare"
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Words that carry no product identity (game names, language/seal noise, Vietnamese fillers).
const STOP_WORDS = new Set([
  "pokemon",
  "tcg",
  "ccg",
  "the",
  "of",
  "and",
  "a",
  "an",
  "for",
  "le", // "lẻ" = loose
  "hop", // "hộp" = box
  "sealed",
  "seal",
  "card",
  "cards",
  "game",
  "jp",
  "jpn",
  "japan",
  "japanese",
  "en",
  "english",
  "nhat",
  "yu",
  "gi",
  "oh",
  "magic",
  "gathering",
  "one",
  "piece",
  "riftbound",
]);

// Tokens that are product *form factors* rather than part of the set / character name.
export const TYPE_WORDS = new Set([
  "booster",
  "box",
  "bundle",
  "display",
  "case",
  "elite",
  "trainer",
  "etb",
  "tin",
  "tins",
  "mini",
  "collection",
  "blister",
  "pack",
  "deck",
  "premium",
  "ultra",
  "super",
  "figure",
  "binder",
  "poster",
  "build",
  "battle",
  "half",
  "sleeved",
  "surprise",
  "theme",
  "starter",
  "checklane",
  "exclusive",
  "center",
  "art",
  "fun",
  "accessory",
  "pouch",
  "sticker",
  "tech",
  "structure",
  "enhanced",
  "bb",
  "special",
  "gift",
  "kit",
  "vault",
]);

// Catch-all type words. The owner picks "Special/Premium Collection" or "Collection Box" when a product
// is none of the standard kinds, so these never need to appear literally in the TCGplayer name.
export const GENERIC_TYPE_WORDS = new Set(["special", "premium", "collection", "box", "set", "gift"]);

// Words that only decorate a catch-all type: matching them is a bonus, never a requirement.
export const DECORATIVE_TYPE_WORDS = new Set(["special", "premium", "collection", "gift"]);

// TCGplayer calls the same thing "Booster Box" (Pokémon, One Piece) or "Booster Display" (Riftbound).
export const TYPE_EQUIVALENTS: Record<string, string[]> = {
  box: ["display"],
  display: ["box"],
};

const SYNONYMS: Record<string, string[]> = {
  etb: ["elite", "trainer", "box"],
  bb: ["booster", "box"],
  thung: ["case"], // "thùng"
  tins: ["tin"],
  boxes: ["box"],
};

export function tokenize(input: string, opts: { keepStop?: boolean } = {}): string[] {
  const out: string[] = [];
  for (const raw of normalize(input).split(" ")) {
    if (!raw) continue;
    if (!opts.keepStop && STOP_WORDS.has(raw)) continue;
    const expansion = SYNONYMS[raw];
    if (expansion) out.push(...expansion);
    else out.push(raw);
  }
  return out;
}

// Optimal-string-alignment distance: counts a swap of two adjacent letters ("choas" vs "chaos") as 1 edit.
export function osaDistance(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const d: number[][] = Array.from({ length: la + 1 }, () => new Array<number>(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[la][lb];
}

/** 0..1 similarity between two tokens, tolerant of plurals and small typos. */
export function tokenSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a + "s" === b || b + "s" === a || a + "es" === b || b + "es" === a) return 0.95;
  const shortest = Math.min(a.length, b.length);
  if (shortest < 4) return 0; // short tokens ("ex", "m2", "x") must match exactly
  const sim = 1 - osaDistance(a, b) / Math.max(a.length, b.length);
  return sim >= 0.78 ? sim : 0;
}

/** Best similarity of `token` against any token in `pool`. */
export function bestSim(token: string, pool: string[]): number {
  let best = 0;
  for (const p of pool) {
    const s = tokenSim(token, p);
    if (s > best) best = s;
    if (best === 1) break;
  }
  return best;
}

// Set codes like "me04", "sv08", "m2a", "sm11b" — noise when comparing set names.
export function isCodeToken(token: string): boolean {
  return /^(me|sv|sm|swsh|xy|bw|dp|ex|m|mp|op|st|eb|prb)\d+[a-z]?$/.test(token) || /^\d+[a-z]$/.test(token);
}

/**
 * "bunlde" -> "bundle", "colection" -> "collection": a token that is one edit away from a long
 * form-factor word is that word. Short tokens and numbers are left alone.
 */
export function correctTypeWord(token: string): string {
  if (TYPE_WORDS.has(token) || token.length < 5 || /\d/.test(token)) return token;
  for (const word of TYPE_WORDS) {
    if (word.length < 5 || Math.abs(word.length - token.length) > 1) continue;
    if (osaDistance(token, word) <= 1) return word;
  }
  return token;
}

// A set code typed as one token: "op05", "eb03", "st26", "prb01", "sv08", "m2", "sm11b".
export function isSetCodeToken(token: string): boolean {
  if (/^[a-z]{1,5}\d{1,2}[a-z]?$/.test(token)) return true;
  // Magic-style codes that start with a digit: "2xm", "3ed", "2x2" (but not "1st", "2nd", "9th").
  return /^\d[a-z0-9]{2}$/.test(token) && /[a-z]/.test(token) && !/^\d(st|nd|rd|th)$/.test(token);
}

// A card number with its letter prefix glued on: "en001", "bt14"-style numbers with 3+ digits.
export function isPrefixedNumberToken(token: string): boolean {
  return /^[a-z]{1,4}\d{3,4}$/.test(token);
}

const compactCode = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Every spelling under which a set can be referred to by code:
 * abbreviation "OP15-EB04" -> op15, eb04, op15eb04; "ST-26" -> st26; set name "ME04: Chaos Rising" -> me04.
 */
export function setCodeTokens(abbreviation: string | null | undefined, setName?: string | null): Set<string> {
  const out = new Set<string>();
  if (abbreviation) {
    out.add(compactCode(abbreviation));
    const parts = abbreviation.split(/[-\s]+/).filter(Boolean).map(compactCode);
    for (const part of parts) out.add(part);
    if (parts.length >= 2) out.add(parts[0] + parts[1]);
  }
  if (setName) for (const token of tokenize(setName)) if (isCodeToken(token) || isSetCodeToken(token)) out.add(token);
  return out;
}
