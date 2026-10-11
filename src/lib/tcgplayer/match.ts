import {
  bestSim,
  correctTypeWord,
  DECORATIVE_TYPE_WORDS,
  GENERIC_TYPE_WORDS,
  isCodeToken,
  isPrefixedNumberToken,
  isSetCodeToken,
  setCodeTokens,
  tokenize,
  TYPE_EQUIVALENTS,
  TYPE_WORDS,
} from "@/lib/tcgplayer/text";
import type { MatchResult, TcgCandidate } from "@/lib/tcgplayer/types";

// ---------- Game -> TCGplayer product lines (url names used by the marketplace search) ----------

const LINES_BY_GAME: Record<string, string[]> = {
  "pokémon": ["pokemon", "pokemon-japan"],
  pokemon: ["pokemon", "pokemon-japan"],
  "one piece": ["one-piece-card-game"],
  "yu-gi-oh!": ["yugioh"],
  "yu-gi-oh": ["yugioh"],
  yugioh: ["yugioh"],
  "magic: the gathering": ["magic"],
  magic: ["magic"],
  riftbound: ["riftbound-league-of-legends-trading-card-game"],
  gundam: ["gundam-card-game"],
  "dragon ball super": ["dragon-ball-super-fusion-world", "dragon-ball-super-ccg"],
  digimon: ["digimon-card-game"],
  "union arena": ["union-arena"],
  "weiss schwarz": ["weiss-schwarz"],
  lorcana: ["lorcana-tcg"],
  "disney lorcana": ["lorcana-tcg"],
};

export function linesForGame(game: string | null | undefined): string[] {
  const key = (game ?? "").trim().toLowerCase();
  return LINES_BY_GAME[key] ?? [];
}

// TCGcsv category ids for the same product lines (fallback data source).
export const CATEGORY_BY_LINE: Record<string, number> = {
  pokemon: 3,
  "pokemon-japan": 85,
  "one-piece-card-game": 68,
  yugioh: 2,
  magic: 1,
  "riftbound-league-of-legends-trading-card-game": 89,
  "gundam-card-game": 86,
  "dragon-ball-super-fusion-world": 80,
  "dragon-ball-super-ccg": 27,
  "digimon-card-game": 63,
  "union-arena": 81,
  "weiss-schwarz": 20,
  "lorcana-tcg": 71,
};

// Franchise words TCGplayer puts in a name ("Riftbound: League of Legends Arcane Box Set") that nobody types.
const LINE_NOISE: Record<string, string[]> = {
  "riftbound-league-of-legends-trading-card-game": ["league", "legends"],
};

// Lines whose sets are numbered in release order, so an owner's "02" means "the 2nd main set".
export const ORDINAL_SET_LINES = new Set(["riftbound-league-of-legends-trading-card-game", "lorcana-tcg"]);

// ---------- Sealed products ----------

export interface SealedQuery {
  setTokens: string[]; // identity of the set / character, e.g. ["chaos","rising"]
  typeTokens: string[]; // every form-factor word, typos corrected, e.g. ["booster","box"]
  specificTypeTokens: string[]; // the ones that identify the kind (booster, bundle, elite...)
  genericType: boolean; // only catch-all words such as "Special/Premium Collection"
  ordinal: number | null; // "Riftbound - 02 - Sleeved Pack": the 2nd main set
  noise: string[]; // franchise words to ignore on the TCGplayer side
}

/** "Pokémon - Choas Rissing - Booster Box" -> set ["choas","rissing"], type ["booster","box"]. */
export function parseSealedName(name: string, game?: string | null): SealedQuery {
  const parts = name
    .split(/\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // First segment is the game name when the structured "Game - Set - Loại Box" format is used.
  const body = parts.length >= 2 ? parts.slice(1).join(" ") : name;

  const setTokens: string[] = [];
  const typeTokens: string[] = [];
  for (const raw of tokenize(body)) {
    // "Bunlde" is a typo of the form factor "Bundle", not a word of the set's name.
    const token = correctTypeWord(raw);
    if (TYPE_WORDS.has(token)) typeTokens.push(token);
    else setTokens.push(token);
  }

  const genericType = typeTokens.length > 0 && typeTokens.every((t) => GENERIC_TYPE_WORDS.has(t));
  // In "Collection Box" the box only restates the collection.
  const decorative = new Set(DECORATIVE_TYPE_WORDS);
  if (typeTokens.includes("collection")) decorative.add("box");
  const specificTypeTokens = genericType ? [] : typeTokens.filter((t) => !decorative.has(t));

  const numeric = setTokens.filter((t) => !["set", "vol", "volume", "chapter", "no"].includes(t));
  const ordinal = numeric.length === 1 && /^\d{1,2}$/.test(numeric[0]) ? Number(numeric[0]) : null;

  const noise = linesForGame(game).flatMap((line) => LINE_NOISE[line] ?? []);
  return { setTokens, typeTokens, specificTypeTokens, genericType, ordinal, noise };
}

export function sealedSearchQueries(q: SealedQuery): string[] {
  const queries: string[] = [];
  // The marketplace search ANDs every word, so the catch-all words ("special premium collection")
  // must stay out of the query: they are rarely in the product name and would return nothing.
  const full = [...q.setTokens, ...q.specificTypeTokens].join(" ").trim();
  if (full) queries.push(full);
  const setOnly = q.setTokens.join(" ").trim();
  if (setOnly && setOnly !== full) queries.push(setOnly);
  return queries;
}

// Tokens in a candidate that the query never asked for. These disqualify "Case", "Half Box",
// store exclusives, digital code cards etc. much harder than ordinary extra words.
const HEAVY_EXTRAS = new Set([
  "code",
  "case",
  "half",
  "exclusive",
  "costco",
  "sams",
  "club",
  "dollar",
  "general",
  "lgs",
  "retail",
  "digital",
  "ct",
  "set",
  "bundle", // only counts when the query did not ask for a bundle
]);
const NEUTRAL_TOKENS = new Set(["ex", "v", "gx", "vmax", "x", "y", "s"]);

// A candidate with one of these words is a regular booster product, not a "special collection".
const STANDARD_KIND_WORDS = new Set([
  "booster",
  "elite",
  "trainer",
  "etb",
  "case",
  "deck",
  "tin",
  "blister",
  "display",
  "pack",
]);

function typeCoverage(q: SealedQuery, nameTokens: string[]): number {
  if (q.typeTokens.length === 0) return 1;

  const sim = (token: string) => {
    const alias = TYPE_EQUIVALENTS[token]?.some((e) => nameTokens.includes(e)) ? 0.9 : 0;
    return Math.max(bestSim(token, nameTokens), alias);
  };

  // "Special/Premium Collection" means "some special product": anything that is not a standard booster
  // product fits, and the more of the owner's words it carries ("Premium Collection") the better.
  if (q.genericType) {
    if (nameTokens.some((t) => STANDARD_KIND_WORDS.has(t))) return 0.15;
    const carried = q.typeTokens.filter((t) => sim(t) > 0).length / q.typeTokens.length;
    return 0.6 + 0.4 * carried;
  }
  if (q.specificTypeTokens.length === 0) return 1;
  const base = q.specificTypeTokens.reduce((s, t) => s + sim(t), 0) / q.specificTypeTokens.length;
  const decorative = q.typeTokens.filter((t) => !q.specificTypeTokens.includes(t));
  const bonus = decorative.length ? decorative.filter((t) => sim(t) > 0).length / decorative.length : 0;
  return Math.min(1, base + 0.05 * bonus);
}

export function scoreSealed(q: SealedQuery, c: TcgCandidate): number {
  const nameTokens = tokenize(c.name);
  const setNameTokens = tokenize(c.setName);
  // The set code ("OP02", "SFD") counts as a way to name the set when the owner typed it.
  const pool = [...nameTokens, ...setNameTokens, ...(c.setCode ? [c.setCode.toLowerCase()] : [])];

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
  const setCov = avg(q.setTokens.map((t) => bestSim(t, pool)));
  const typeCov = typeCoverage(q, nameTokens);

  const known = [...q.setTokens, ...q.typeTokens, ...setNameTokens.filter((t) => !isCodeToken(t))];
  const lenient = q.genericType || q.typeTokens.some((t) => DECORATIVE_TYPE_WORDS.has(t));
  let penalty = 0;
  for (const t of nameTokens) {
    if (NEUTRAL_TOKENS.has(t) || isCodeToken(t) || q.noise.includes(t)) continue;
    // "Arcane Box Set" / "Ultra Premium Collection" is what "Special Collection" means.
    if (lenient && (GENERIC_TYPE_WORDS.has(t) || (TYPE_WORDS.has(t) && !HEAVY_EXTRAS.has(t)))) continue;
    if (bestSim(t, known) > 0) continue;
    penalty += HEAVY_EXTRAS.has(t) ? 0.25 : 0.06;
  }
  penalty = Math.min(penalty, 0.6);

  const price = c.marketPrice != null ? 0.04 : c.medianPrice != null ? -0.03 : -0.12;
  let score = 0.5 * setCov + 0.4 * typeCov - penalty + price;
  if (q.setTokens.length > 0 && setCov < 0.6) score = Math.min(score, 0.3);
  return Math.max(0, Math.min(1, score));
}

export function bestSealed(q: SealedQuery, candidates: TcgCandidate[]): MatchResult | null {
  let best: MatchResult | null = null;
  const scores = new Map<number, number>();
  for (const candidate of candidates) {
    if (!candidate.sealed) continue;
    const score = scoreSealed(q, candidate);
    scores.set(candidate.productId, score);
    if (!best || score > best.score + 1e-9) {
      best = { candidate, score };
    } else if (Math.abs(score - best.score) <= 1e-9) {
      // Tie: prefer the English product line, then the one that actually has a market price.
      const better =
        (candidate.lineName === "Pokemon" && best.candidate.lineName !== "Pokemon") ||
        (candidate.marketPrice != null && best.candidate.marketPrice == null);
      if (better) best = { candidate, score };
    }
  }
  if (!best) return null;

  // Confidence follows the margin: a clear winner is trusted, a coin-flip between look-alikes
  // (three "Mega ex Box" at the same price) is flagged "approximate" for the owner to check.
  let runnerUp = 0;
  for (const [productId, score] of scores) {
    if (productId !== best.candidate.productId && score > runnerUp) runnerUp = score;
  }
  if (best.score >= 0.6) {
    if (best.score - runnerUp < 0.02) best = { candidate: best.candidate, score: Math.min(best.score, 0.75) };
    else if (best.score - runnerUp >= 0.2) best = { candidate: best.candidate, score: Math.min(1, best.score + 0.06) };
  }
  return best;
}

// ---------- Single cards ----------

export const RARITY_ABBREVIATIONS: Record<string, string[]> = {
  sir: ["special", "illustration", "rare"],
  ir: ["illustration", "rare"],
  sar: ["special", "art", "rare"],
  ar: ["art", "rare"],
  sr: ["super", "rare"],
  ur: ["ultra", "rare"],
  hr: ["hyper", "rare"],
  ssr: ["super", "special", "rare"],
  scr: ["secret", "rare"],
  sec: ["secret", "rare"],
  manga: ["manga"],
  alt: ["alternate", "art"],
  promo: ["promo"],
};

export const RARITY_TOKENS = new Set(Object.keys(RARITY_ABBREVIATIONS));

// Words that pick one printing of a card ("Manga", "SP", "Serial", "Treasure Cup"...).
const VARIANT_WORDS = new Set([
  "manga",
  "sp",
  "alt",
  "alternate",
  "art",
  "parallel",
  "wanted",
  "poster",
  "serial",
  "numbered",
  "treasure",
  "cup",
  "store",
  "reprint",
  "gold",
  "textured",
  "foil",
  "holo",
  "holofoil",
  "reverse",
  "promo",
  "first",
  "edition",
  "unlimited",
  "shadowless",
  "full",
  "borderless",
  "showcase",
  "etched",
]);

// The variant words that really change which product it is. Plain finishes (foil, holo, reverse...)
// are priced through the product's printings, not through its name, so they never disqualify a card.
const DEFINING_VARIANTS = new Set([
  "manga",
  "sp",
  "alt",
  "alternate",
  "art",
  "parallel",
  "serial",
  "numbered",
  "treasure",
  "cup",
  "wanted",
  "poster",
  "reprint",
  "gold",
  "textured",
  "store",
]);

// Placement / volume numbers ("Top 8", "Vol 2") and condition words are not part of a card's identity.
const PLACEMENT_WORDS = new Set(["top", "vol", "volume", "round", "rank", "place"]);
const CONDITION_WORDS = new Set([
  "psa",
  "bgs",
  "cgc",
  "grade",
  "graded",
  "raw",
  "mint",
  "near",
  "nm",
  "lp",
  "mp",
  "hp",
  "damaged",
]);

export interface SingleQuery {
  tokens: string[]; // every meaningful word, stop words removed
  nameTokens: string[]; // the card's name as the owner typed it
  variantTokens: string[]; // printing words: "manga", "sp", "treasure", "cup"...
  numbers: string[]; // card numbers, leading zeros stripped
  fullNumbers: string[]; // card numbers as TCGplayer writes them: "OP05-119", "LOB-EN001"
  codes: string[]; // set codes: "op05"
  rarityTokens: string[];
  language: "jp" | "en" | null;
}

// "OP05-119", "ST26-005", "LOB-EN001": set code and card number written together.
const FULL_NUMBER_RE = /\b([A-Za-z]{1,5}\d{1,3}[A-Za-z]?|[A-Za-z]{2,4})-([A-Za-z]{0,3}\d{1,4})\b/g;

export function parseSingleName(cardName: string, game?: string | null): SingleQuery {
  const codes: string[] = [];
  const numbers: string[] = [];
  const fullNumbers: string[] = [];
  const consumed = new Set<string>();

  for (const m of cardName.matchAll(FULL_NUMBER_RE)) {
    const prefix = m[1].toUpperCase();
    const suffix = m[2].toUpperCase();
    fullNumbers.push(`${prefix}-${suffix}`);
    const prefixToken = tokenize(prefix).join("");
    if (prefixToken) {
      codes.push(prefixToken);
      consumed.add(prefixToken); // "LOB" / "OP05" are set codes, not words of the card's name
    }
    const digits = suffix.replace(/\D/g, "");
    if (digits) numbers.push(String(Number(digits)));
    for (const t of tokenize(suffix)) consumed.add(t);
  }

  const lower = cardName.toLowerCase();
  const language: SingleQuery["language"] = /\b(japanese|japan|jpn|jp)\b/.test(lower)
    ? "jp"
    : /\b(english)\b/.test(lower)
      ? "en"
      : null;

  let tokens = tokenize(cardName);
  // "Disney Lorcana Elsa ...": the game's name leads the text but is not part of the card's name.
  const gameWords = tokenize(game ?? "");
  if (gameWords.length > 0 && gameWords.every((w, i) => tokens[i] === w)) tokens = tokens.slice(gameWords.length);
  const nameTokens: string[] = [];
  const variantTokens: string[] = [];
  const rarityTokens: string[] = [];
  tokens.forEach((t, i) => {
    const expansion = RARITY_ABBREVIATIONS[t];
    if (expansion) rarityTokens.push(...expansion);

    if (consumed.has(t)) return;
    if (/^\d+$/.test(t)) {
      if (/^(19|20)\d\d$/.test(t)) return; // a year
      if (i > 0 && PLACEMENT_WORDS.has(tokens[i - 1])) return; // "Top 8"
      numbers.push(String(Number(t)));
      return;
    }
    if (isPrefixedNumberToken(t)) {
      numbers.push(String(Number(t.replace(/\D/g, ""))));
      return;
    }
    if (isSetCodeToken(t) && !expansion) {
      codes.push(t);
      return;
    }
    if (PLACEMENT_WORDS.has(t) || CONDITION_WORDS.has(t)) return;
    if (VARIANT_WORDS.has(t)) {
      variantTokens.push(t);
      return;
    }
    if (expansion) return; // a rarity abbreviation (sir, sec...)
    nameTokens.push(t);
  });

  return {
    tokens,
    nameTokens,
    variantTokens: [...new Set(variantTokens)],
    numbers: [...new Set(numbers)],
    fullNumbers: [...new Set(fullNumbers)],
    codes: [...new Set(codes)],
    rarityTokens,
    language,
  };
}

/** Exact card numbers worth asking the marketplace for: "OP05-119" typed, or built from "OP05" + "119". */
export function cardNumberFilters(q: SingleQuery): string[] {
  const out = new Set<string>(q.fullNumbers);
  for (const code of q.codes) {
    for (const n of q.numbers.slice(0, 2)) out.add(`${code.toUpperCase()}-${n.padStart(3, "0")}`);
  }
  return [...out].slice(0, 4);
}

/** The printing words worth putting into a search ("treasure cup"); abbreviations are expanded. */
export function variantQueryWords(q: SingleQuery): string[] {
  const words: string[] = [];
  for (const v of q.variantTokens) {
    if (!DEFINING_VARIANTS.has(v) || v === "sp") continue;
    words.push(...(RARITY_ABBREVIATIONS[v] ?? [v]));
  }
  return [...new Set(words)];
}

/** Name words as search queries: as typed, and with split run-ons glued back ("han cock" -> "hancock"). */
export function nameQueries(q: SingleQuery): string[] {
  const base = q.nameTokens.filter((t) => t.length > 1 || q.nameTokens.length === 1);
  if (base.length === 0) return [];
  const queries = [base.join(" ")];
  for (let i = 0; i + 1 < base.length && queries.length < 3; i++) {
    if (base[i].length <= 5 && base[i + 1].length <= 5) {
      queries.push([...base.slice(0, i), base[i] + base[i + 1], ...base.slice(i + 2)].join(" "));
    }
  }
  return queries;
}

function cardCoreName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s-\s[\w/-]+\s*$/, ""); // " - 199/165", " - OP07-118"
}

/** Numeric card number(s) of a TCGplayer card: "199/165" -> "199", "LOB-EN001" -> "1", "OP05-119" -> "119". */
export function cardNumberOf(number: string | null): string | null {
  if (!number) return null;
  const head = number.split("/")[0];
  const runs = head.match(/\d+/g);
  return runs ? String(Number(runs[runs.length - 1])) : null;
}

/** "OP05-119" -> "op05", "LOB-EN001" -> "lob", "199/165" -> null. */
function codePrefixOf(number: string | null): string | null {
  const m = number?.match(/^([A-Za-z]{1,5}\d{0,3}[A-Za-z]?)-/);
  return m ? m[1].toLowerCase() : null;
}

// "(Alternate Art) (Manga)" -> [["alternate","art"],["manga"]]; numbers and card codes are not variants.
function qualifierGroups(name: string): string[][] {
  const out: string[][] = [];
  for (const m of name.matchAll(/[(\[]([^)\]]*)[)\]]/g)) {
    const tokens = tokenize(m[1]).filter((t) => !/^\d+$/.test(t) && !isSetCodeToken(t) && !isPrefixedNumberToken(t));
    if (tokens.length > 0) out.push(tokens);
  }
  return out;
}

// For each token: is it found in `pool`, either as such or glued to its neighbour ("han" + "cock")?
function coverFlags(tokens: string[], pool: string[]): boolean[] {
  const flags = tokens.map((t) => bestSim(t, pool) > 0);
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (flags[i] && flags[i + 1]) continue;
    if (bestSim(tokens[i] + tokens[i + 1], pool) >= 0.9) {
      flags[i] = true;
      flags[i + 1] = true;
    }
  }
  return flags;
}

function withGluedNeighbours(tokens: string[]): string[] {
  const out = [...tokens];
  for (let i = 0; i + 1 < tokens.length; i++) out.push(tokens[i] + tokens[i + 1]);
  return out;
}

// What the printing words of the owner's text say about this candidate, in score points.
function variantScore(q: SingleQuery, quals: string[][], candTokens: string[], poolWords: string[] | undefined): number {
  const owner = [...q.tokens, ...q.rarityTokens];
  const wantsManga = q.variantTokens.includes("manga");
  const isSuperAltArt = (tokens: string[]) => tokens.join(" ") === "super alternate art";
  let gain = 0;
  let loss = 0;

  for (const tokens of quals) {
    // Sets without a "(Manga)" printing call the manga rare "Super Alternate Art" (the Red one is a different card).
    if (wantsManga && isSuperAltArt(tokens)) {
      gain += 0.1;
      continue;
    }
    const hits = tokens.filter((t) => bestSim(t, owner) > 0).length;
    if (hits === tokens.length) gain += 0.1;
    else if (hits > 0) {
      gain += 0.04 * hits;
      loss += 0.05 * (tokens.length - hits);
    } else loss += 0.08;
  }

  // The owner asked for a printing this candidate does not show (the plain card when they typed "Manga").
  let missing = 0;
  for (const v of q.variantTokens) {
    if (!DEFINING_VARIANTS.has(v)) continue;
    const words = RARITY_ABBREVIATIONS[v] ?? [v];
    if (poolWords) {
      // If no candidate anywhere writes this word, the game does not put it in product names: ignore it.
      const written =
        v === "manga"
          ? bestSim("manga", poolWords) > 0 || (bestSim("super", poolWords) > 0 && bestSim("alternate", poolWords) > 0)
          : words.every((w) => bestSim(w, poolWords) > 0);
      if (!written) continue;
    }
    const shown =
      words.every((w) => bestSim(w, candTokens) > 0) || (v === "manga" && quals.some((t) => isSuperAltArt(t)));
    if (!shown) missing = 0.15;
  }

  return Math.min(gain, 0.15) - Math.min(loss, 0.25) - missing;
}

/**
 * How well a TCGplayer card fits the owner's text. Anchors (card number, set code, printing words)
 * outweigh the name, so "Luffy" is enough to find "Monkey.D.Luffy" once "OP05" and "119" agree.
 * Deliberately NOT clamped to 1: several printings can all be "perfect" and the margin between
 * them (set code, qualifiers) decides which one wins.
 */
export function scoreSingle(q: SingleQuery, c: TcgCandidate, poolWords?: string[]): number {
  const core = tokenize(cardCoreName(c.name));
  if (core.length === 0 || q.nameTokens.length === 0) return 0;
  const quals = qualifierGroups(c.name);
  const candTokens = [...core, ...quals.flat()];
  const setNameTokens = tokenize(c.setName).filter((t) => !isCodeToken(t) && !isSetCodeToken(t));
  // The owner may have typed the set's name too ("Romance Dawn Luffy"), but a set called "EX Power Keepers"
  // must not make every "ex" in the query look matched.
  const setNameWords = setNameTokens.filter((t) => t.length > 2 && !NEUTRAL_TOKENS.has(t));

  const nameCov =
    coverFlags(q.nameTokens, [...candTokens, ...setNameWords]).filter(Boolean).length / q.nameTokens.length;
  const ownerPool = withGluedNeighbours([...q.tokens, ...q.rarityTokens]);
  const candCov = core.filter((t) => bestSim(t, ownerPool) > 0).length / core.length;

  const cardNumber = cardNumberOf(c.number);
  const numberMatch = cardNumber != null && q.numbers.includes(cardNumber);
  const groupCodes = setCodeTokens(c.setCode, c.setName);
  const groupMatch = q.codes.some((code) => groupCodes.has(code));
  const prefixMatch = !groupMatch && q.codes.includes(codePrefixOf(c.number) ?? "");

  // With a matching card number or set code the name may be abbreviated; without, it must be complete.
  const anchored = numberMatch || groupMatch || prefixMatch;
  if (anchored ? nameCov < 0.99 : nameCov < 0.95 || candCov < 0.95) return 0;

  let score = 0.45 * nameCov + 0.15 * candCov;

  if (cardNumber && q.numbers.length > 0) score += numberMatch ? 0.25 : -0.3;
  // The number exactly as typed ("LOB-EN001") beats a look-alike listing ("LOB-001").
  if (c.number && q.fullNumbers.includes(c.number.toUpperCase())) score += 0.08;
  if (q.codes.length > 0) {
    score += groupMatch ? 0.25 : prefixMatch ? 0.05 : 0;
    // "OP05" is the set OP05 itself, not its "OP05 ANN" tournament cards.
    const abbreviation = c.setCode ? c.setCode.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    if (groupMatch && q.codes.includes(abbreviation)) score += 0.06;
  }

  if (c.rarity) {
    const rarityTokens = tokenize(c.rarity);
    const asked = [...new Set([...q.tokens, ...q.rarityTokens])];
    const hit = rarityTokens.filter((t) => bestSim(t, asked) > 0).length / Math.max(1, rarityTokens.length);
    // "rare" alone is too generic to prove anything; require at least one distinctive word.
    const distinctive = rarityTokens.filter((t) => t !== "rare").some((t) => bestSim(t, asked) > 0);
    score += distinctive ? 0.1 * hit : 0;
  }

  if (setNameTokens.length > 0) {
    const setHit = setNameTokens.reduce((s, t) => s + (bestSim(t, q.tokens) > 0 ? 1 : 0), 0) / setNameTokens.length;
    score += 0.05 * setHit;
  }

  // English product unless the owner says Japanese (the same card exists in both lines for Pokémon).
  const japaneseLine = /japan/i.test(c.lineName);
  if (q.language === "jp") score += japaneseLine ? 0.06 : 0;
  else if (japaneseLine) score -= 0.06;

  score += variantScore(q, quals, candTokens, poolWords);
  return Math.max(0, score);
}

/** Printings closer than this are treated as indistinguishable (no guessing between them). */
const SINGLE_MARGIN = 0.05;

/** Best single-card match, or null when nothing clearly wins (avoids guessing between printings). */
export function bestSingle(q: SingleQuery, candidates: TcgCandidate[]): MatchResult | null {
  const cards = candidates.filter((c) => !c.sealed);
  const poolWords = [...new Set(cards.flatMap((c) => qualifierGroups(c.name).flat()))];
  const scored = cards
    .map((candidate) => ({ candidate, score: scoreSingle(q, candidate, poolWords) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;

  const [first, second] = scored;
  if (second && first.score - second.score < SINGLE_MARGIN) {
    // Only an exact tie can be broken (by price); anything else is a genuine "which printing?" question.
    const tied = scored.filter((r) => first.score - r.score < 1e-9);
    const priced = tied.filter((r) => r.candidate.marketPrice != null || r.candidate.medianPrice != null);
    if (tied.length < 2 || priced.length !== 1) return null;
    return { candidate: priced[0].candidate, score: Math.min(1, priced[0].score) };
  }
  return { candidate: first.candidate, score: Math.min(1, first.score) };
}
