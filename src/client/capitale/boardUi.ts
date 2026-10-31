import { SQUARES } from "../../shared/games/capitale/board.ts";
import type { CapitaleState } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";

/** Les couleurs des pions, dans l'ordre des joueurs */
export const PAWN_COLORS = ["#e2453c", "#3f7fd8", "#2fa864", "#e8b12f", "#9b59d0", "#e07a3a"];

export function colorOf(g: CapitaleView, playerId: string | null | undefined): string {
  const i = g.players.findIndex((p) => p.id === playerId);
  return i >= 0 ? PAWN_COLORS[i % PAWN_COLORS.length]! : "transparent";
}

/** Un nom qui tient dans une case ; le nom complet reste sur la fiche */
const SHORT: Record<number, string> = {
  5: "TGV Atlantique",
  15: "TGV Sud-Est",
  21: "Clermont",
  25: "TGV Est",
  26: "Montpellier",
  28: "Éoliennes",
  35: "TGV Nord",
};
export const shortName = (i: number) => SHORT[i] ?? SQUARES[i]!.name;

/** Sur un petit plateau (téléphone), les cases étroites n'ont la place que pour quelques lettres */
const TINY: Record<number, string> = {
  3: "Auril.",
  11: "Périg.",
  14: "Chartr.",
  21: "Clerm.",
  26: "Montp.",
  27: "Strasb.",
  29: "Toul.",
  34: "Bordx",
};
export const tinyName = (i: number) => TINY[i] ?? shortName(i);

/** Le plateau fait 9 cases par côté entre deux coins plus grands */
const CORNER = 1.55;
const UNIT = 100 / (9 + 2 * CORNER);
const C = CORNER * UNIT;

export type Side = "bottom" | "left" | "top" | "right" | "corner";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  side: Side;
}

/** La place de chaque case sur le plateau, en pourcentage : Départ en bas à droite, puis dans le sens des aiguilles */
export function squareRect(i: number): Rect {
  if (i === 0) return { x: 100 - C, y: 100 - C, w: C, h: C, side: "corner" };
  if (i < 10) return { x: 100 - C - i * UNIT, y: 100 - C, w: UNIT, h: C, side: "bottom" };
  if (i === 10) return { x: 0, y: 100 - C, w: C, h: C, side: "corner" };
  if (i < 20) return { x: 0, y: 100 - C - (i - 10) * UNIT, w: C, h: UNIT, side: "left" };
  if (i === 20) return { x: 0, y: 0, w: C, h: C, side: "corner" };
  if (i < 30) return { x: C + (i - 21) * UNIT, y: 0, w: UNIT, h: C, side: "top" };
  if (i === 30) return { x: 100 - C, y: 0, w: C, h: C, side: "corner" };
  return { x: 100 - C, y: C + (i - 31) * UNIT, w: C, h: UNIT, side: "right" };
}

export const INNER = { x: C, y: C, size: 100 - 2 * C };

/**
 * La prison, en bas à gauche : les prisonniers derrière les barreaux (en haut à droite de la case),
 * ceux qui sont en simple visite le long des deux bords extérieurs.
 */
export const JAIL_SPOTS = {
  // Le premier au milieu de la cellule, les suivants autour
  inside: [
    [0, 0],
    [1.8, 0],
    [-1.8, 0],
    [0, 1.8],
    [0, -1.8],
    [1.8, 1.8],
  ].map(([dx, dy]) => ({ x: 0.64 * C + dx!, y: 100 - 0.64 * C + dy! })),
  visiting: [
    { x: 0.24 * C, y: 100 - 0.24 * C },
    { x: 0.24 * C, y: 100 - 0.55 * C },
    { x: 0.55 * C, y: 100 - 0.24 * C },
    { x: 0.24 * C, y: 100 - 0.84 * C },
    { x: 0.84 * C, y: 100 - 0.24 * C },
    { x: 0.5 * C, y: 100 - 0.5 * C },
  ],
};

/** Le centre d'une case, là où se posent les pions */
export function squareCenter(i: number): { x: number; y: number } {
  const r = squareRect(i);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Les aides du moteur (construire, vendre…) lisent la vue comme l'état : elle en a tout ce qu'il faut */
export const asState = (g: CapitaleView) => g as unknown as CapitaleState;

/** Une somme en francs, le symbole collé au nombre (jamais seul en début de ligne) */
export const money = (n: number) => `${n.toLocaleString("fr-FR")} ₣`;
