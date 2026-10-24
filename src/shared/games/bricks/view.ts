// Ce que la salle de Briques envoie aux écrans : la partie en cours, le plateau de chacun après chaque pose,
// et l'état complet d'un joueur pour le remettre d'aplomb (début de manche, K.O., écart avec le serveur).

import type { Active, BricksMode, BricksSettings, GarbageChunk, PieceType, PlayerBoard, Spin, TargetStrategy } from "./engine.ts";

/** Stats d'un joueur sur tout le match */
export interface BricksStats {
  lines: number;
  /** Lignes envoyées chez les autres */
  sent: number;
  received: number;
  pieces: number;
  tetrises: number;
  tspins: number;
  allClears: number;
  maxCombo: number;
  kos: number;
  deaths: number;
  roundsWon: number;
}

export const emptyStats = (): BricksStats => ({
  lines: 0,
  sent: 0,
  received: 0,
  pieces: 0,
  tetrises: 0,
  tspins: 0,
  allClears: 0,
  maxCombo: 0,
  kos: 0,
  deaths: 0,
  roundsWon: 0,
});

export interface BricksPlayerView {
  id: string;
  team: number | null;
  grid: string;
  current: PieceType;
  hold: PieceType | null;
  next: PieceType[];
  /** Lignes grises en attente */
  pending: number;
  combo: number;
  b2b: boolean;
  /** Encore en lice (dernier debout) */
  alive: boolean;
  /** Mis K.O. au chrono : reprend à cette heure */
  koUntil: number | null;
  /** Place obtenue en étant éliminé */
  place: number | null;
  /** Dans la manche en cours */
  kos: number;
  sent: number;
  lines: number;
  pieces: number;
  roundWins: number;
  strategy: TargetStrategy;
  target: string | null;
  /** Solo 40 lignes : temps final en millisecondes */
  sprintTime: number | null;
  seq: number;
}

export interface BricksRoundView {
  index: number;
  phase: "countdown" | "playing" | "over";
  /** Fin du compte à rebours */
  startAt: number;
  /** Fin du chrono (mode K.O.) */
  endAt: number | null;
  /** Début de la marée montante (dernier debout) */
  tideAt: number | null;
  winners: string[] | null;
  /** Début de la manche suivante */
  nextAt: number | null;
}

export interface BricksView {
  settings: BricksSettings;
  mode: BricksMode;
  players: BricksPlayerView[];
  round: BricksRoundView;
  matchOver: boolean;
  ranking: string[] | null;
  ranks: Record<string, number> | null;
  /** Totaux du match par joueur (feuille de fin) */
  stats: Record<string, BricksStats>;
}

/** L'état complet de son propre plateau, pour repartir exactement comme le serveur */
export interface BricksSnapshot {
  id: string;
  round: number;
  board: PlayerBoard;
  koUntil: number | null;
}

/** Ce qui s'anime chez tout le monde */
export type BricksFx =
  | { type: "clear"; id: string; lines: number; rows: number[]; spin: Spin; combo: number; b2b: boolean; perfect: boolean; attack: number }
  | { type: "attack"; from: string; to: string; lines: number }
  | { type: "garbage"; id: string; lines: number }
  | { type: "ko"; id: string; by: string | null }
  | { type: "eliminated"; id: string; place: number }
  | { type: "sprint"; id: string; time: number };

export type { Active, GarbageChunk };
