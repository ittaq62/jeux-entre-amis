// Bots de Briques : ils regardent toutes les poses possibles de la pièce (et de la réserve),
// notent le plateau obtenu, et jouent la meilleure. Le niveau change la vitesse, la finesse et les erreurs.

import { random, type RngHolder } from "../../rng.ts";
import {
  attackOf,
  cellsOf,
  cleared,
  COLS,
  landings,
  locked,
  ROWS,
  takePiece,
  tSpin,
  type Active,
  type BotLevel,
  type Grid,
  type Placement,
  type PlayerBoard,
  type Spin,
} from "./engine.ts";

/**
 * Temps de réflexion par pièce, en millisecondes. Réglé sur des duels simulés contre des joueurs types :
 * un joueur moyen gagne presque toujours contre l'apprenti, une fois sur deux contre le confirmé,
 * et l'expert reste un défi pour un habitué (une victoire sur quatre).
 */
export const BOT_PACE: Record<BotLevel, number> = { apprenti: 1400, confirme: 1150, expert: 850 };

interface Weights {
  height: number;
  holes: number;
  bumpiness: number;
  lines: number;
  attack: number;
  spin: number;
  /** Puits laissé ouvert à droite pour les quatre lignes */
  well: number;
  noise: number;
  /** Chance de jouer une pose au hasard parmi les meilleures */
  blunder: number;
  useHold: boolean;
}

const WEIGHTS: Record<BotLevel, Weights> = {
  apprenti: {
    height: -0.55,
    holes: -0.3,
    bumpiness: -0.15,
    lines: 0.6,
    attack: 0,
    spin: 0,
    well: 0,
    noise: 1.6,
    blunder: 0.22,
    useHold: false,
  },
  confirme: {
    height: -0.51,
    holes: -0.42,
    bumpiness: -0.19,
    lines: 0.5,
    attack: 0.25,
    spin: 0.1,
    well: 0.08,
    noise: 1,
    blunder: 0.12,
    useHold: true,
  },
  expert: {
    height: -0.5,
    holes: -0.48,
    bumpiness: -0.2,
    lines: 0.25,
    attack: 0.9,
    spin: 1.4,
    well: 0.18,
    noise: 0.5,
    blunder: 0.06,
    useHold: true,
  },
};

function columnHeights(grid: Grid): number[] {
  const heights = new Array<number>(COLS).fill(0);
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if (grid[y * COLS + x] !== 0) {
        heights[x] = ROWS - y;
        break;
      }
    }
  }
  return heights;
}

function holesOf(grid: Grid, heights: number[]): number {
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    for (let y = ROWS - heights[x]!; y < ROWS; y++) if (grid[y * COLS + x] === 0) holes++;
  }
  return holes;
}

interface Candidate {
  placement: Placement;
  score: number;
}

function evaluate(board: PlayerBoard, piece: Active, kicks: Set<number> | undefined, hold: boolean, w: Weights, rng: RngHolder): Candidate {
  const kick = kicks ? (kicks.has(4) ? 4 : Math.min(...kicks)) : -1;
  const spin: Spin = kicks ? tSpin(board.grid, piece, true, kick) : "none";
  const { grid, rows } = cleared(locked(board.grid, piece));
  const lines = rows.length;
  const heights = columnHeights(grid);
  const aggregate = heights.reduce((a, b) => a + b, 0);
  let bumpiness = 0;
  for (let x = 0; x < COLS - 1; x++) bumpiness += Math.abs(heights[x]! - heights[x + 1]!);
  const holes = holesOf(grid, heights);
  const max = Math.max(...heights);
  const danger = max > 12 ? (max - 12) * 2.5 : 0;
  const combo = lines > 0 ? board.combo + 1 : -1;
  const attack = attackOf({ lines, spin, combo: Math.max(0, combo), b2b: false, perfect: lines > 0 && grid.every((c) => c === 0) });
  // Garder la dernière colonne libre tant que la pile est basse, pour placer une barre plus tard
  const wellOpen = heights[COLS - 1]! === 0 && max < 10 ? 1 : 0;
  // Une ou deux lignes sans attaque gâchent la pile quand elle est basse (sauf pour l'apprenti)
  const cheapClear = lines > 0 && attack === 0 && max < 8 ? -0.4 * lines * (w.attack > 0 ? 1 : 0) : 0;
  const score =
    w.height * aggregate * 0.1 * 10 +
    w.holes * holes * 3 +
    w.bumpiness * bumpiness +
    w.lines * lines * 3 +
    w.attack * attack * 3 +
    w.spin * (spin === "full" && lines > 0 ? 6 : 0) +
    w.well * wellOpen * 4 +
    cheapClear -
    danger -
    (cellsOf(piece).some(([, y]) => y < 4) ? 50 : 0) +
    (random(rng) - 0.5) * w.noise * 4;
  return {
    placement: {
      type: piece.type,
      x: piece.x,
      y: piece.y,
      rot: piece.rot,
      hold,
      lastRotation: kicks !== undefined,
      kick: Math.max(0, kick),
    },
    score,
  };
}

/** La pose que joue un bot pour la pièce en cours. */
export function botPlacement(board: PlayerBoard, level: BotLevel, holdAllowed: boolean, rng: RngHolder): Placement {
  const w = WEIGHTS[level];
  const candidates: Candidate[] = [];
  for (const { piece, byRotation } of landings(board.grid, board.current))
    candidates.push(evaluate(board, piece, byRotation, false, w, rng));
  if (holdAllowed && w.useHold) {
    const alt = board.hold ?? takePiece({ rng: board.bag.rng, queue: [...board.bag.queue] });
    if (alt !== board.current) {
      for (const { piece, byRotation } of landings(board.grid, alt)) candidates.push(evaluate(board, piece, byRotation, true, w, rng));
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length === 0) {
    // Plus aucune place : la pièce tombe là où elle apparaît, c'est le K.O.
    return { type: board.current, x: 3, y: board.current === "I" ? 1 : 2, rot: 0, hold: false, lastRotation: false, kick: 0 };
  }
  if (w.blunder > 0 && random(rng) < w.blunder) return candidates[Math.min(candidates.length - 1, Math.floor(random(rng) * 6))]!.placement;
  return candidates[0]!.placement;
}
