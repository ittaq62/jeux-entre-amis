// Crampons à la boutique : des ballons et des célébrations de but. Les clubs de légende sont dans clubs.ts, avec les
// autres (leur prix y est noté). Tout s'achète avec les points gagnés en jouant, dans l'ordre qu'on veut.

/** Le ballon : chacun voit le sien (c'est l'affaire de son écran, personne d'autre n'est gêné) */
export type BallId = "classique" | "cuir" | "noir-blanc" | "plage" | "etoile" | "neon" | "or";

export interface BallInfo {
  id: BallId;
  name: string;
  /** Son prix en points (0 : offert à tous) */
  price: number;
}

export const BALLS: BallInfo[] = [
  { id: "classique", name: "Classique", price: 0 },
  { id: "cuir", name: "Cuir d'antan", price: 60 },
  { id: "noir-blanc", name: "Noir et blanc", price: 100 },
  { id: "plage", name: "Ballon de plage", price: 160 },
  { id: "etoile", name: "Étoilé", price: 250 },
  { id: "neon", name: "Néon", price: 400 },
  { id: "or", name: "Ballon d'or", price: 650 },
];

export const BALL_BY_ID = new Map(BALLS.map((b) => [b.id, b]));
export const isBallId = (v: unknown): v is BallId => typeof v === "string" && BALL_BY_ID.has(v as BallId);

/**
 * La célébration de ses buts : son buteur la fait sous les yeux de toute la table. « À sa façon » (offerte) : chaque
 * joueur fête à sa manière. `pose` : le numéro de la célébration pour l'animation des joueurs.
 */
export type FeteId = "maison" | "bras-croises" | "oreille" | "salut" | "toupie" | "genoux";

export interface FeteInfo {
  id: FeteId;
  name: string;
  /** Ce qu'il fait, en quelques mots */
  blurb: string;
  price: number;
  pose: number | null;
}

export const FETES: FeteInfo[] = [
  { id: "maison", name: "À sa façon", blurb: "Chaque buteur fête à sa manière.", price: 0, pose: null },
  { id: "bras-croises", name: "Bras croisés", blurb: "Il croise les bras, le menton levé, sûr de lui.", price: 120, pose: 4 },
  { id: "oreille", name: "Main à l'oreille", blurb: "« Je n'entends rien ! » face au public.", price: 180, pose: 5 },
  { id: "salut", name: "Le salut", blurb: "Au garde-à-vous, il salue la tribune.", price: 220, pose: 6 },
  { id: "toupie", name: "La toupie", blurb: "Les bras en croix, il tourne sur lui-même.", price: 300, pose: 7 },
  { id: "genoux", name: "Glissade à genoux", blurb: "Il file vers le coin et glisse à genoux, les bras au ciel.", price: 450, pose: 8 },
];

export const FETE_BY_ID = new Map(FETES.map((f) => [f.id, f]));
export const isFeteId = (v: unknown): v is FeteId => typeof v === "string" && FETE_BY_ID.has(v as FeteId);
