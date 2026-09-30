"use server";

export interface ProductImageSuggestion {
  url: string;
  label: string;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function searchPokemonTcg(query: string): Promise<ProductImageSuggestion[]> {
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${query}*"`)}&pageSize=6`;
  const json = await fetchJson(url);
  const cards = Array.isArray(json?.data) ? json.data : [];
  return cards
    .filter((c: any) => c?.images?.large)
    .map((c: any) => ({
      url: c.images.large as string,
      label: `${c.name} · ${c.set?.name ?? "Pokémon TCG"}`,
    }));
}

async function searchScryfall(query: string): Promise<ProductImageSuggestion[]> {
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=released&dir=desc`;
  const json = await fetchJson(url);
  const cards = Array.isArray(json?.data) ? json.data.slice(0, 6) : [];
  return cards
    .map((c: any) => {
      const image = c?.image_uris?.normal ?? c?.card_faces?.[0]?.image_uris?.normal;
      return image
        ? { url: image as string, label: `${c.name} · ${c.set_name ?? "Magic: The Gathering"}` }
        : null;
    })
    .filter((x: ProductImageSuggestion | null): x is ProductImageSuggestion => x !== null);
}

async function searchYugioh(query: string): Promise<ProductImageSuggestion[]> {
  const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}`;
  const json = await fetchJson(url);
  const cards = Array.isArray(json?.data) ? json.data.slice(0, 6) : [];
  return cards
    .filter((c: any) => c?.card_images?.[0]?.image_url)
    .map((c: any) => ({
      url: c.card_images[0].image_url as string,
      label: `${c.name} · Yu-Gi-Oh!`,
    }));
}

// Gợi ý ảnh thật từ các cơ sở dữ liệu thẻ bài công khai (Pokémon TCG API, Scryfall,
// YGOPRODeck) — cả ba đều không yêu cầu API key, phù hợp cho nhu cầu tra cứu ảnh nội
// bộ của một công cụ admin. Không có nguồn tương đương cho One Piece / hộp sealed, nên
// các trường hợp đó sẽ trả về danh sách rỗng và người dùng dùng URL thủ công như cũ.
export async function searchProductImagesAction(
  query: string,
  game?: string
): Promise<ProductImageSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const normalizedGame = (game ?? "").toLowerCase();

  if (normalizedGame.includes("pokemon") || normalizedGame.includes("pokémon")) {
    return searchPokemonTcg(trimmed);
  }
  if (normalizedGame.includes("magic")) {
    return searchScryfall(trimmed);
  }
  if (
    normalizedGame.includes("yu-gi-oh") ||
    normalizedGame.includes("yugioh") ||
    normalizedGame.includes("yu gi oh")
  ) {
    return searchYugioh(trimmed);
  }

  const [pokemon, magic, yugioh] = await Promise.all([
    searchPokemonTcg(trimmed),
    searchScryfall(trimmed),
    searchYugioh(trimmed),
  ]);
  return [...pokemon, ...magic, ...yugioh].slice(0, 8);
}
