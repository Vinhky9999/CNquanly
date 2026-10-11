export interface TcgCandidate {
  productId: number;
  name: string; // TCGplayer product name, e.g. "Chaos Rising Booster Box"
  setName: string; // e.g. "ME04: Chaos Rising"
  setCode: string | null; // e.g. "CRI", "LOB", "OP05"
  setId: number; // = TCGcsv groupId
  lineId: number; // = TCGcsv categoryId
  lineName: string; // e.g. "Pokemon", "Pokemon Japan"
  marketPrice: number | null; // USD, TCGplayer Market Price
  medianPrice: number | null; // USD, listed median
  number: string | null; // card number, e.g. "199/165" (cards only)
  rarity: string | null; // e.g. "Special Illustration Rare" (cards only)
  sealed: boolean;
}

export interface TcgPricepoint {
  printing: string; // "Normal" | "Holofoil" | "Reverse Holofoil" | "1st Edition Holofoil" ...
  marketPrice: number | null;
  medianPrice: number | null;
}

export interface ParsedTcgSource {
  productId: number;
  printing: string;
  categoryId: number | null;
  groupId: number | null;
}

export interface MatchResult {
  candidate: TcgCandidate;
  score: number; // 0..1
}
