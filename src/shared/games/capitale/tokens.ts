// Capitale : les pions qu'on choisit avant la partie. Quatre dès le départ, les autres s'achètent avec ses points, dans l'ordre qu'on veut.

export type TokenId = "pion" | "voiture" | "beret" | "bateau" | "croissant" | "fusee" | "montgolfiere" | "tour" | "diamant" | "couronne";

export interface TokenInfo {
  id: TokenId;
  name: string;
  /** Son prix en points (0 : offert à tous) */
  price: number;
}

export const TOKENS: TokenInfo[] = [
  { id: "pion", name: "Pion", price: 0 },
  { id: "voiture", name: "Voiture", price: 0 },
  { id: "beret", name: "Béret", price: 0 },
  { id: "bateau", name: "Bateau", price: 0 },
  { id: "croissant", name: "Croissant", price: 50 },
  { id: "fusee", name: "Fusée", price: 120 },
  { id: "montgolfiere", name: "Montgolfière", price: 200 },
  { id: "tour", name: "Tour Eiffel", price: 400 },
  { id: "diamant", name: "Diamant", price: 600 },
  { id: "couronne", name: "Couronne", price: 1000 },
];

export const TOKEN_BY_ID = new Map(TOKENS.map((t) => [t.id, t]));
export const isTokenId = (v: unknown): v is TokenId => typeof v === "string" && TOKEN_BY_ID.has(v as TokenId);
export const FREE_TOKENS = TOKENS.filter((t) => t.price === 0).map((t) => t.id);
