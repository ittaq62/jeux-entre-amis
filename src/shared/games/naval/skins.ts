// Bataille navale : les thèmes de la flotte. La Marine (les navires gris d'origine) pour tout le monde,
// les autres s'achètent avec ses points, dans l'ordre qu'on veut.

export type SkinId = "marine" | "jouet" | "pirate" | "camo" | "glace" | "royal" | "neon" | "lave";

export interface SkinInfo {
  id: SkinId;
  name: string;
  /** Son prix en points (0 : offert à tous) */
  price: number;
}

export const SKINS: SkinInfo[] = [
  { id: "marine", name: "Marine", price: 0 },
  { id: "jouet", name: "Jouet de bain", price: 50 },
  { id: "pirate", name: "Pirate", price: 120 },
  { id: "camo", name: "Camouflage", price: 200 },
  { id: "glace", name: "Banquise", price: 400 },
  { id: "royal", name: "Royal", price: 600 },
  { id: "neon", name: "Néon", price: 800 },
  { id: "lave", name: "Lave", price: 1200 },
];

export const SKIN_BY_ID = new Map(SKINS.map((s) => [s.id, s]));
export const isSkinId = (v: unknown): v is SkinId => typeof v === "string" && SKIN_BY_ID.has(v as SkinId);
