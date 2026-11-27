// Ce que porte un candidat de La Cour des Grands, en plus de son personnage du profil : le maillot de candidat (sa
// couleur et son motif), et l'effet qui le salue quand il passe une épreuve. Des articles de la boutique ; le maillot
// uni aux couleurs du portrait est à tout le monde.

export type JerseyId = "portrait" | "rayures" | "pois" | "etoiles" | "arcenciel" | "damier" | "or";
export type CheerId = "confettis" | "bulles" | "feuilles" | "paillettes" | "feu";

export interface CourLook {
  jersey: JerseyId;
  cheer: CheerId;
}

export const DEFAULT_LOOK: CourLook = { jersey: "portrait", cheer: "confettis" };

export interface JerseyInfo {
  id: JerseyId;
  name: string;
  price: number;
  /** Les deux couleurs du motif (le portrait : celles de l'avatar) */
  colors: [string, string] | null;
}

export const JERSEYS: readonly JerseyInfo[] = [
  { id: "portrait", name: "Aux couleurs du portrait", price: 0, colors: null },
  { id: "rayures", name: "Marinière", price: 80, colors: ["#f4f1e8", "#23408e"] },
  { id: "pois", name: "À pois", price: 120, colors: ["#e8435a", "#fff6e8"] },
  { id: "damier", name: "Damier de kermesse", price: 180, colors: ["#2f8f5b", "#f4ead2"] },
  { id: "etoiles", name: "Ciel étoilé", price: 260, colors: ["#1d2a5e", "#ffd45c"] },
  { id: "arcenciel", name: "Arc-en-ciel", price: 380, colors: ["#ff6b6b", "#4dabf7"] },
  { id: "or", name: "Maillot d'or", price: 650, colors: ["#d9a426", "#fff1b8"] },
];

export interface CheerInfo {
  id: CheerId;
  name: string;
  price: number;
}

export const CHEERS: readonly CheerInfo[] = [
  { id: "confettis", name: "Confettis", price: 0 },
  { id: "bulles", name: "Bulles de savon", price: 90 },
  { id: "feuilles", name: "Pluie de pétales", price: 150 },
  { id: "paillettes", name: "Paillettes dorées", price: 240 },
  { id: "feu", name: "Feu d'artifice", price: 420 },
];

export const JERSEY_BY_ID = new Map(JERSEYS.map((j) => [j.id, j]));
export const CHEER_BY_ID = new Map(CHEERS.map((c) => [c.id, c]));

/** L'article de la boutique d'un maillot ou d'un effet */
export const jerseyItem = (id: JerseyId) => `cour-maillot:${id}`;
export const cheerItem = (id: CheerId) => `cour-salut:${id}`;

export function isCourLook(v: unknown): v is CourLook {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return JERSEY_BY_ID.has(o.jersey as JerseyId) && CHEER_BY_ID.has(o.cheer as CheerId);
}

/** Ce qu'il porte vraiment : ce qu'il a choisi s'il l'a (les articles gratuits sont à tout le monde) */
export function usableLook(look: CourLook, owns: (item: string) => boolean): CourLook {
  const j = JERSEY_BY_ID.get(look.jersey);
  const c = CHEER_BY_ID.get(look.cheer);
  return {
    jersey: j && (j.price === 0 || owns(jerseyItem(j.id))) ? j.id : DEFAULT_LOOK.jersey,
    cheer: c && (c.price === 0 || owns(cheerItem(c.id))) ? c.id : DEFAULT_LOOK.cheer,
  };
}

/** Le maillot d'un bot de la foule : souvent le portrait, parfois un motif */
export function botLook(seed: number): CourLook {
  const r = (seed * 2654435761) >>> 0;
  const jersey = r % 5 < 3 ? "portrait" : JERSEYS[1 + (r % (JERSEYS.length - 2))]!.id;
  return { jersey, cheer: "confettis" };
}
