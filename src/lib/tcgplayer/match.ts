import { bestSim, isCodeToken, tokenize, TYPE_WORDS } from "@/lib/tcgplayer/text";
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

// ---------- Sealed products ----------

export interface SealedQuery {
  setTokens: string[]; // identity of the set / character, e.g. ["chaos","rising"]
  typeTokens: string[]; // form factor, e.g. ["booster","box"]
}

/** "Pokémon - Choas Rissing - Booster Box" -> set ["choas","rissing"], type ["booster","box"]. */
export function parseSealedName(name: string): SealedQuery {
  const parts = name
    .split(/\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // First segment is the game name when the structured "Game - Set - Loại Box" format is used.
  const body = parts.length >= 2 ? parts.slice(1).join(" ") : name;

  const setTokens: string[] = [];
  const typeTokens: string[] = [];
  for (const token of tokenize(body)) {
    if (TYPE_WORDS.has(token)) typeTokens.push(token);
    else setTokens.push(token);
  }
  return { setTokens, typeTokens };
}

export function sealedSearchQueries(q: SealedQuery): string[] {
  const queries: string[] = [];
  const full = [...q.setTokens, ...q.typeTokens].join(" ").trim();
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

export function scoreSealed(q: SealedQuery, c: TcgCandidate): number {
  const nameTokens = tokenize(c.name);
  const setNameTokens = tokenize(c.setName).filter((t) => !isCodeToken(t));
  const pool = [...nameTokens, ...setNameTokens];

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
  const setCov = avg(q.setTokens.map((t) => bestSim(t, pool)));
  const typeCov = avg(q.typeTokens.map((t) => bestSim(t, nameTokens)));

  const known = [...q.setTokens, ...q.typeTokens, ...setNameTokens];
  let penalty = 0;
  for (const t of nameTokens) {
    if (NEUTRAL_TOKENS.has(t)) continue;
    if (bestSim(t, known) > 0) continue;
    penalty += HEAVY_EXTRAS.has(t) ? 0.25 : 0.06;
  }
  penalty = Math.min(penalty, 0.6);

  const price = c.marketPrice != null ? 0.04 : c.medianPrice != null ? 0 : -0.12;
  let score = 0.5 * setCov + 0.4 * typeCov - penalty + price;
  if (q.setTokens.length > 0 && setCov < 0.6) score = Math.min(score, 0.3);
  return Math.max(0, Math.min(1, score));
}

export function bestSealed(q: SealedQuery, candidates: TcgCandidate[]): MatchResult | null {
  let best: MatchResult | null = null;
  for (const candidate of candidates) {
    if (!candidate.sealed) continue;
    const score = scoreSealed(q, candidate);
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
  return best;
}

// ---------- Single cards ----------

const RARITY_ABBREVIATIONS: Record<string, string[]> = {
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

export interface SingleQuery {
  tokens: string[];
  numbers: string[]; // numeric card numbers, leading zeros stripped
  rarityTokens: string[];
}

export function parseSingleName(cardName: string): SingleQuery {
  const tokens = tokenize(cardName);
  const numbers = tokens.filter((t) => /^\d+$/.test(t)).map((t) => String(Number(t)));
  const rarityTokens: string[] = [];
  for (const t of tokens) {
    const expansion = RARITY_ABBREVIATIONS[t];
    if (expansion) rarityTokens.push(...expansion);
  }
  return { tokens, numbers, rarityTokens };
}

export function singleSearchQuery(q: SingleQuery): string {
  return q.tokens.filter((t) => !/^\d+$/.test(t) && !RARITY_ABBREVIATIONS[t]).join(" ");
}

function cardCoreName(name: string): string {
  return name
    .replace(/\s-\s[\w/]+\s*$/, "") // " - 199/165"
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ");
}

/** Numeric card number(s) of a TCGplayer card: "199/165" -> "199", "LOB-EN001" -> "1", "OP05-119" -> "119". */
export function cardNumberOf(number: string | null): string | null {
  if (!number) return null;
  const head = number.split("/")[0];
  const runs = head.match(/\d+/g);
  return runs ? String(Number(runs[runs.length - 1])) : null;
}

// Qualifiers such as "(Alternate Art)" or "[Reverse Holofoil]" that the owner did not mention
// make a printing less likely than the plain one.
function qualifierPenalty(name: string, queryTokens: string[]): number {
  const quals = [...name.matchAll(/[(\[]([^)\]]*)[)\]]/g)].map((m) => m[1]);
  let penalty = 0;
  for (const qual of quals) {
    const tokens = tokenize(qual).filter((t) => !/^\d+$/.test(t));
    if (tokens.length > 0 && tokens.some((t) => bestSim(t, queryTokens) === 0)) penalty += 0.1;
  }
  return penalty;
}

export function scoreSingle(q: SingleQuery, c: TcgCandidate): number {
  const nameTokens = tokenize(cardCoreName(c.name));
  if (nameTokens.length === 0) return 0;
  const nameCov = nameTokens.reduce((s, t) => s + bestSim(t, q.tokens), 0) / nameTokens.length;
  if (nameCov < 0.95) return 0; // every word of the card's name must appear in the query

  let score = 0.55 * nameCov;

  const cardNumber = cardNumberOf(c.number);
  if (cardNumber && q.numbers.length > 0) {
    score += q.numbers.includes(cardNumber) ? 0.25 : -0.2;
  }

  if (c.rarity) {
    const rarityTokens = tokenize(c.rarity);
    const asked = new Set([...q.tokens, ...q.rarityTokens]);
    const hit = rarityTokens.filter((t) => bestSim(t, [...asked]) > 0).length / Math.max(1, rarityTokens.length);
    // "rare" alone is too generic to prove anything; require at least one distinctive word.
    const distinctive = rarityTokens.filter((t) => t !== "rare").some((t) => bestSim(t, [...asked]) > 0);
    score += distinctive ? 0.15 * hit : 0;
  }

  const setTokens = tokenize(c.setName).filter((t) => !isCodeToken(t));
  if (setTokens.length > 0) {
    const setHit = setTokens.reduce((s, t) => s + (bestSim(t, q.tokens) > 0 ? 1 : 0), 0) / setTokens.length;
    score += 0.1 * setHit;
  }
  if (c.setCode && q.tokens.includes(c.setCode.toLowerCase())) score += 0.15;

  score -= qualifierPenalty(c.name, q.tokens);
  score += c.marketPrice != null ? 0.03 : 0;
  // Deliberately NOT clamped to 1: several printings can all be "perfect" and the margin between
  // them (set code, qualifiers) decides which one wins.
  return Math.max(0, score);
}

/** Best single-card match, or null when nothing clearly wins (avoids guessing between printings). */
export function bestSingle(q: SingleQuery, candidates: TcgCandidate[]): MatchResult | null {
  const scored = candidates
    .filter((c) => !c.sealed)
    .map((candidate) => ({ candidate, score: scoreSingle(q, candidate) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  const [first, second] = scored;
  if (second && first.score - second.score < 0.08) return null;
  return { candidate: first.candidate, score: Math.min(1, first.score) };
}
