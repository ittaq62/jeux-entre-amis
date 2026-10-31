// Capitale : les pions qu'on choisit avant la partie. Quatre dès le départ, les autres se gagnent avec les victoires à Capitale.

export type TokenId = "pion" | "voiture" | "beret" | "bateau" | "croissant" | "fusee" | "montgolfiere" | "tour" | "diamant" | "couronne";

export interface TokenInfo {
  id: TokenId;
  name: string;
  /** Les victoires à Capitale qu'il faut pour le débloquer */
  wins: number;
}

export const TOKENS: TokenInfo[] = [
  { id: "pion", name: "Pion", wins: 0 },
  { id: "voiture", name: "Voiture", wins: 0 },
  { id: "beret", name: "Béret", wins: 0 },
  { id: "bateau", name: "Bateau", wins: 0 },
  { id: "croissant", name: "Croissant", wins: 1 },
  { id: "fusee", name: "Fusée", wins: 3 },
  { id: "montgolfiere", name: "Montgolfière", wins: 5 },
  { id: "tour", name: "Tour Eiffel", wins: 10 },
  { id: "diamant", name: "Diamant", wins: 15 },
  { id: "couronne", name: "Couronne", wins: 25 },
];

export const TOKEN_BY_ID = new Map(TOKENS.map((t) => [t.id, t]));
export const isTokenId = (v: unknown): v is TokenId => typeof v === "string" && TOKEN_BY_ID.has(v as TokenId);
export const FREE_TOKENS = TOKENS.filter((t) => t.wins === 0).map((t) => t.id);

/** Les pions qu'ouvre ce nombre de victoires */
export const unlockedTokens = (wins: number): TokenId[] => TOKENS.filter((t) => t.wins <= wins).map((t) => t.id);
