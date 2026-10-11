import {
  bestSealed,
  bestSingle,
  cardNumberFilters,
  linesForGame,
  nameQueries,
  ORDINAL_SET_LINES,
  parseSealedName,
  parseSingleName,
  RARITY_TOKENS,
  sealedSearchQueries,
  variantQueryWords,
} from "@/lib/tcgplayer/match";
import {
  csvCandidates,
  csvCardCandidates,
  findGroupsByCode,
  mainExpansionGroups,
  tcgDetails,
  tcgSearch,
  type SearchOptions,
} from "@/lib/tcgplayer/client";
import { CONFIDENT_SCORE } from "@/lib/tcgplayer/constants";
import { isCodeToken, tokenize } from "@/lib/tcgplayer/text";
import type { MatchResult, TcgCandidate } from "@/lib/tcgplayer/types";

/** Below this score a sealed match is discarded instead of guessed. */
export const MIN_SEALED_SCORE = 0.6;

/** Below this score a single-card match is discarded instead of guessed. */
export const MIN_SINGLE_SCORE = 0.7;

/** "Riftbound - 02 - Sleeved Pack": the owner numbers the sets; resolve "02" to the 2nd main set's name. */
async function resolveOrdinalSet(lines: string[], ordinal: number): Promise<string[] | null> {
  if (lines.length !== 1 || !ORDINAL_SET_LINES.has(lines[0])) return null;
  const sets = await mainExpansionGroups(lines[0]);
  const group = sets[ordinal - 1];
  if (!group) return null;
  const tokens = tokenize(group.name).filter((t) => !isCodeToken(t));
  return tokens.length > 0 ? tokens : null;
}

/**
 * Finds the TCGplayer sealed product for a hand-typed name like
 * "Pokémon - Choas Rissing - Booster Box": live marketplace search first (typo tolerant),
 * re-ranked locally; the TCGcsv dump is used when the marketplace is unreachable.
 */
export async function findSealedMatch(name: string, game: string | null): Promise<MatchResult | null> {
  const q = parseSealedName(name, game);
  const lines = linesForGame(game);
  if (q.ordinal != null) {
    const resolved = await resolveOrdinalSet(lines, q.ordinal);
    if (resolved) q.setTokens = resolved;
  }
  if (q.setTokens.length === 0) return null;

  const pool = new Map<number, TcgCandidate>();
  let apiReachable = false;
  let best: MatchResult | null = null;

  const queries = sealedSearchQueries(q);
  for (let i = 0; i < queries.length; i++) {
    const pages = i === 0 ? [0] : [0, 50]; // set-only query can span several pages of products
    for (const from of pages) {
      const rows = await tcgSearch({ query: queries[i], lines, kind: "sealed", size: 50, from });
      if (!rows) break;
      apiReachable = true;
      for (const r of rows) pool.set(r.productId, r);
      if (rows.length < 50) break;
    }
    best = bestSealed(q, [...pool.values()]);
    if (best && best.score >= CONFIDENT_SCORE) break;
  }

  if (!apiReachable || !best || best.score < MIN_SEALED_SCORE) {
    const csvLines = lines.length ? lines : ["pokemon"];
    const fallback = await csvCandidates(csvLines, q.setTokens, "sealed");
    for (const r of fallback) if (!pool.has(r.productId)) pool.set(r.productId, r);
    best = bestSealed(q, [...pool.values()]);
  }

  return best && best.score >= MIN_SEALED_SCORE ? best : null;
}

/**
 * Best single-card match (Raw cards only — TCGplayer does not price graded slabs).
 *
 * The owner's text is searched from the most specific angle to the least, stopping as soon as one
 * printing is a confident match:
 *   1. the exact card number ("OP05" + "119" -> OP05-119): every printing of that card, reprints included
 *   2. the owner's set with the name (the card may carry another set's number, e.g. ST26-005 inside OP15)
 *   3. name + printing words ("nami treasure cup")
 *   4. everything typed, then the bare name
 */
export async function findSingleMatch(cardName: string, game: string | null): Promise<MatchResult | null> {
  const q = parseSingleName(cardName, game);
  if (q.nameTokens.length === 0) return null;

  const lines = linesForGame(game);
  const pool = new Map<number, TcgCandidate>();
  const state = { reachable: false, best: null as MatchResult | null };

  const search = async (opts: Pick<SearchOptions, "query" | "filters">) => {
    const rows = await tcgSearch({ ...opts, lines, kind: "card", size: 50 });
    if (!rows) return;
    state.reachable = true;
    for (const r of rows) pool.set(r.productId, r);
    state.best = bestSingle(q, [...pool.values()]);
  };
  const confident = () => state.best != null && state.best.score >= CONFIDENT_SCORE;

  for (const number of cardNumberFilters(q)) {
    await search({ query: "", filters: { number: [number] } });
    if (confident()) break;
  }

  if (!confident() && q.codes.length > 0) {
    const sets = await findGroupsByCode(lines, q.codes);
    const setCodes = [...new Set(sets.map((s) => s.group.abbreviation).filter((a): a is string => Boolean(a)))];
    if (setCodes.length > 0) {
      for (const query of nameQueries(q).slice(0, 2)) {
        await search({ query, filters: { setCode: setCodes } });
        if (confident()) break;
      }
    }
  }

  const printingWords = variantQueryWords(q);
  if (!confident() && printingWords.length > 0) {
    for (const nameQuery of nameQueries(q).slice(0, 2)) {
      await search({ query: [nameQuery, ...printingWords].join(" ") });
      if (confident()) break;
    }
  }

  if (!confident()) {
    await search({ query: q.tokens.filter((t) => !RARITY_TOKENS.has(t)).join(" ") });
  }
  if (!confident()) {
    for (const nameQuery of nameQueries(q)) {
      await search({ query: nameQuery });
      if (confident()) break;
    }
  }

  // The marketplace is unreachable (or knows nothing): the daily TCGcsv dump, by the owner's set code.
  const current = state.best;
  if ((!state.reachable || !current || current.score < MIN_SINGLE_SCORE) && q.codes.length > 0) {
    for (const r of await csvCardCandidates(lines, q.codes)) if (!pool.has(r.productId)) pool.set(r.productId, r);
    state.best = bestSingle(q, [...pool.values()]);
  }

  const best = state.best;
  if (!best || best.score < MIN_SINGLE_SCORE) return null;
  // "Japanese" cards priced from the English product (One Piece has no Japanese line on TCGplayer): approximate.
  if (q.language === "jp" && !/japan/i.test(best.candidate.lineName)) {
    return { candidate: best.candidate, score: Math.min(best.score, CONFIDENT_SCORE - 0.02) };
  }
  return best;
}

/** Manual search for the "link to TCGplayer" picker: relevance order, no auto-picking. */
export async function searchForLinking(
  query: string,
  game: string | null,
  kind: "sealed" | "card"
): Promise<TcgCandidate[]> {
  const text = query.trim();
  if (!text) return [];

  // A pasted TCGplayer link or bare product id resolves directly.
  const idMatch = text.match(/product\/(\d+)/) ?? text.match(/^(\d{4,})$/);
  if (idMatch) {
    const details = await tcgDetails(Number(idMatch[1]));
    return details ? [details] : [];
  }

  const rows = await tcgSearch({ query: text, lines: linesForGame(game), kind, size: 12 });
  return rows ?? [];
}
