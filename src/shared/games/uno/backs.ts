// UNO : les dos de cartes. Le dos classique (bordeaux et dorures) pour tout le monde, les autres s'achètent avec ses
// points, dans l'ordre qu'on veut. Chacun joue avec le sien : ses adversaires voient le dos des cartes qu'il a en main.

export type BackId = "classique" | "ocean" | "tapis" | "nuit" | "soleil" | "damier" | "neon" | "or";

export interface BackInfo {
  id: BackId;
  name: string;
  /** Son prix en points (0 : offert à tous) */
  price: number;
}

export const BACKS: BackInfo[] = [
  { id: "classique", name: "Classique", price: 0 },
  { id: "ocean", name: "Grand large", price: 50 },
  { id: "tapis", name: "Tapis vert", price: 120 },
  { id: "nuit", name: "Nuit étoilée", price: 200 },
  { id: "soleil", name: "Soleil rétro", price: 300 },
  { id: "damier", name: "Damier", price: 450 },
  { id: "neon", name: "Néon", price: 700 },
  { id: "or", name: "Or massif", price: 1000 },
];

export const BACK_BY_ID = new Map(BACKS.map((b) => [b.id, b]));
export const isBackId = (v: unknown): v is BackId => typeof v === "string" && BACK_BY_ID.has(v as BackId);
