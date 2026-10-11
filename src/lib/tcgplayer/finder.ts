import {
  bestSealed,
  bestSingle,
  linesForGame,
  parseSealedName,
  parseSingleName,
  sealedSearchQueries,
  RARITY_TOKENS,
  singleSearchQuery,
} from "@/lib/tcgplayer/match";
import { csvCandidates, tcgDetails, tcgSearch } from "@/lib/tcgplayer/client";
import { CONFIDENT_SCORE } from "@/lib/tcgplayer/constants";
import type { MatchResult, TcgCandidate } from "@/lib/tcgplayer/types";

/** Below this score a sealed match is discarded instead of guessed. */
export const MIN_SEALED_SCORE = 0.6;

/**
 * Finds the TCGplayer sealed product for a hand-typed name like
 * "Pokémon - Choas Rissing - Booster Box": live marketplace search first (typo tolerant),
 * re-ranked locally; the TCGcsv dump is used when the marketplace is unreachable.
 */
export async function findSealedMatch(name: string, game: string | null): Promise<MatchResult | null> {
  const q = parseSealedName(name);
  if (q.setTokens.length === 0) return null;

  const lines = linesForGame(game);
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

/** Best single-card match (Raw cards only — TCGplayer does not price graded slabs). */
export async function findSingleMatch(cardName: string, game: string | null): Promise<MatchResult | null> {
  const q = parseSingleName(cardName);
  const nameOnly = singleSearchQuery(q);
  if (!nameOnly) return null;

  const lines = linesForGame(game);
  // Most specific first: everything the owner typed (set code, number...) narrows a crowded
  // card name down to one printing; the name alone is the fallback.
  const withDetails = q.tokens.filter((t) => !RARITY_TOKENS.has(t)).join(" ");
  const queries = [...new Set([withDetails, nameOnly])];

  const pool = new Map<number, TcgCandidate>();
  let best: MatchResult | null = null;
  for (const query of queries) {
    const rows = await tcgSearch({ query, lines, kind: "card", size: 50 });
    if (!rows) continue;
    for (const r of rows) pool.set(r.productId, r);
    best = bestSingle(q, [...pool.values()]);
    if (best && best.score >= 0.75) break;
  }
  return best && best.score >= 0.75 ? best : null;
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
