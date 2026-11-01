// Bataille navale : les thèmes de la flotte. La Marine (les navires gris d'origine) pour tout le monde,
// les autres se gagnent avec les victoires à la bataille navale.

export type SkinId = "marine" | "jouet" | "pirate" | "camo" | "glace" | "royal" | "neon" | "lave";

export interface SkinInfo {
  id: SkinId;
  name: string;
  /** Les victoires à la bataille navale qu'il faut pour le débloquer */
  wins: number;
}

export const SKINS: SkinInfo[] = [
  { id: "marine", name: "Marine", wins: 0 },
  { id: "jouet", name: "Jouet de bain", wins: 1 },
  { id: "pirate", name: "Pirate", wins: 3 },
  { id: "camo", name: "Camouflage", wins: 5 },
  { id: "glace", name: "Banquise", wins: 10 },
  { id: "royal", name: "Royal", wins: 15 },
  { id: "neon", name: "Néon", wins: 20 },
  { id: "lave", name: "Lave", wins: 30 },
];

export const SKIN_BY_ID = new Map(SKINS.map((s) => [s.id, s]));
export const isSkinId = (v: unknown): v is SkinId => typeof v === "string" && SKIN_BY_ID.has(v as SkinId);
