// Moteur de Briques : pur et déterministe, partagé par le serveur (qui fait foi) et l'écran de chaque joueur
// (qui fait tomber sa pièce sans attendre le réseau). Le temps (gravité, verrou) reste côté écran ;
// ici on ne fait que vérifier et appliquer chaque pose.

import { randomInt, shuffle, type RngHolder } from "../../rng.ts";

export const COLS = 10;
export const ROWS = 24;
/** Lignes cachées au-dessus du plateau : on y apparaît, et y poser une pièce entière, c'est le K.O. */
export const HIDDEN = 4;
export const GARBAGE = 8;
/** Lignes grises qui entrent au plus en une pose */
export const GARBAGE_CAP = 10;

export const PIECES = ["I", "O", "T", "S", "Z", "J", "L"] as const;
export type PieceType = (typeof PIECES)[number];
export type Rot = 0 | 1 | 2 | 3;
/** 0 vide, 1 à 7 une pièce (ordre de PIECES), 8 une ligne grise */
export type Grid = number[];

export type BricksWin = "ko" | "survival";
export type BotLevel = "apprenti" | "confirme" | "expert";
export type BricksMode = "duel" | "melee" | "teams" | "sprint";
export type TargetStrategy = "random" | "attackers" | "danger" | "manual";

export interface BricksSettings {
  /** Bataille, ou solo 40 lignes contre la montre */
  sprint: boolean;
  /** Au chrono avec les K.O., ou dernier debout */
  win: BricksWin;
  /** Durée d'une manche au chrono */
  minutes: 2 | 3;
  /** Manches gagnantes pour remporter le match */
  series: 1 | 2 | 3;
  /** 2 contre 2 (à 4 joueurs exactement) */
  teams: boolean;
  botLevel: BotLevel;
  /** Règles maison */
  hold: boolean;
  previews: 1 | 3 | 5;
  speedUp: boolean;
  /** Chaque ligne grise a son propre trou */
  messy: boolean;
}

export const DEFAULT_SETTINGS: BricksSettings = {
  sprint: false,
  win: "ko",
  minutes: 2,
  series: 1,
  teams: false,
  botLevel: "confirme",
  hold: true,
  previews: 5,
  speedUp: true,
  messy: false,
};

export const SPRINT_LINES = 40;

// ---------------------------------------------------------------------------
// Pièces et rotations (système SRS)
// ---------------------------------------------------------------------------

type Cells = readonly (readonly [number, number])[];

/** Cases de chaque pièce dans sa boîte, pour les 4 rotations (0, droite, 2, gauche), y vers le bas */
const SHAPES: Record<PieceType, readonly Cells[]> = {
  I: [
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
    ],
  ],
  O: [
    [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ],
  ],
  T: [
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  ],
  S: [
    [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    [
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  ],
  Z: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    [
      [2, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
  ],
  J: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [2, 0],
      [1, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [0, 2],
      [1, 2],
    ],
  ],
  L: [
    [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  ],
};

// Coups de pied SRS, écrits comme dans les tables officielles (y vers le haut) puis retournés
const KICKS_JLSTZ: Record<string, Cells> = {
  "0>1": [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  "1>0": [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  "1>2": [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  "2>1": [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  "2>3": [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  "3>2": [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  "3>0": [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  "0>3": [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
};
const KICKS_I: Record<string, Cells> = {
  "0>1": [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  "1>0": [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  "1>2": [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
  "2>1": [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  "2>3": [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  "3>2": [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  "3>0": [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  "0>3": [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
};
const KICKS_180: Cells = [
  [0, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
  [1, 0],
  [-1, 0],
];

export interface Active {
  type: PieceType;
  rot: Rot;
  x: number;
  y: number;
}

export const colorOf = (type: PieceType) => PIECES.indexOf(type) + 1;

export function shapeOf(type: PieceType, rot: Rot): Cells {
  return SHAPES[type][rot];
}

export function cellsOf(a: Active): [number, number][] {
  return SHAPES[a.type][a.rot].map(([dx, dy]) => [a.x + dx, a.y + dy]);
}

export function emptyGrid(): Grid {
  return new Array<number>(COLS * ROWS).fill(0);
}

export const at = (grid: Grid, x: number, y: number) => grid[y * COLS + x]!;

/** Une case est prise : bord, fond, plafond (au-dessus des lignes cachées) ou brique déjà posée. */
function blocked(grid: Grid, x: number, y: number): boolean {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
  return grid[y * COLS + x] !== 0;
}

export function fits(grid: Grid, a: Active): boolean {
  return cellsOf(a).every(([x, y]) => !blocked(grid, x, y));
}

export function spawn(type: PieceType): Active {
  return { type, rot: 0, x: 3, y: type === "I" ? 1 : 2 };
}

export function moved(grid: Grid, a: Active, dx: number, dy: number): Active | null {
  const next = { ...a, x: a.x + dx, y: a.y + dy };
  return fits(grid, next) ? next : null;
}

export function grounded(grid: Grid, a: Active): boolean {
  return moved(grid, a, 0, 1) === null;
}

export function dropped(grid: Grid, a: Active): Active {
  let cur = a;
  for (let next = moved(grid, cur, 0, 1); next; next = moved(grid, cur, 0, 1)) cur = next;
  return cur;
}

/** Rotation avec coups de pied : 1 sens horaire, -1 anti-horaire, 2 demi-tour. Renvoie aussi le n° du coup de pied. */
export function rotated(grid: Grid, a: Active, dir: 1 | -1 | 2): { piece: Active; kick: number } | null {
  if (a.type === "O") return null;
  const to = ((((a.rot + dir) % 4) + 4) % 4) as Rot;
  const kicks = dir === 2 ? KICKS_180 : (a.type === "I" ? KICKS_I : KICKS_JLSTZ)[`${a.rot}>${to}`]!;
  for (let k = 0; k < kicks.length; k++) {
    const [kx, ky] = kicks[k]!;
    const next = { type: a.type, rot: to, x: a.x + kx, y: a.y - ky };
    if (fits(grid, next)) return { piece: next, kick: k };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sac de 7 pièces
// ---------------------------------------------------------------------------

export interface Bag {
  rng: number;
  /** Pièces à venir, la première est la prochaine */
  queue: PieceType[];
}

export function newBag(seed: number): Bag {
  const bag: Bag = { rng: seed >>> 0, queue: [] };
  refill(bag);
  return bag;
}

function refill(bag: Bag) {
  const holder: RngHolder = { rng: bag.rng };
  while (bag.queue.length < 7) bag.queue.push(...shuffle(holder, [...PIECES]));
  bag.rng = holder.rng;
}

export function takePiece(bag: Bag): PieceType {
  const piece = bag.queue.shift()!;
  refill(bag);
  return piece;
}

// ---------------------------------------------------------------------------
// Atteignabilité : la pose envoyée est-elle possible depuis l'apparition ?
// ---------------------------------------------------------------------------

const key = (a: Active) => ((a.y + 4) * 32 + (a.x + 4)) * 4 + a.rot;

export interface Reach {
  /** États atteignables */
  seen: Set<number>;
  /** Pour chaque état atteint par une rotation : les coups de pied possibles */
  byRotation: Map<number, Set<number>>;
}

/** Parcours en largeur de tous les états (x, y, rotation) qu'une pièce peut atteindre, gravité ignorée. */
export function reachable(grid: Grid, from: Active): Reach {
  const seen = new Set<number>();
  const byRotation = new Map<number, Set<number>>();
  if (!fits(grid, from)) return { seen, byRotation };
  const todo: Active[] = [from];
  seen.add(key(from));
  while (todo.length > 0) {
    const cur = todo.pop()!;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, 1],
    ] as const) {
      const next = moved(grid, cur, dx, dy);
      if (next && !seen.has(key(next))) {
        seen.add(key(next));
        todo.push(next);
      }
    }
    for (const dir of [1, -1, 2] as const) {
      const r = rotated(grid, cur, dir);
      if (!r) continue;
      const k = key(r.piece);
      let kicks = byRotation.get(k);
      if (!kicks) byRotation.set(k, (kicks = new Set()));
      kicks.add(r.kick);
      if (!seen.has(k)) {
        seen.add(k);
        todo.push(r.piece);
      }
    }
  }
  return { seen, byRotation };
}

/** Toutes les poses finales possibles d'une pièce (pour les bots). */
export function landings(grid: Grid, type: PieceType): { piece: Active; byRotation: Set<number> | undefined }[] {
  const start = spawn(type);
  const reach = reachable(grid, start);
  const out: { piece: Active; byRotation: Set<number> | undefined }[] = [];
  const done = new Set<string>();
  for (const k of reach.seen) {
    const rot = (k % 4) as Rot;
    const rest = Math.floor(k / 4);
    const piece = { type, rot, x: (rest % 32) - 4, y: Math.floor(rest / 32) - 4 };
    if (!grounded(grid, piece)) continue;
    // Deux rotations du O ou du S/Z peuvent couvrir les mêmes cases : on n'en garde qu'une
    const cells = cellsOf(piece)
      .map(([x, y]) => y * COLS + x)
      .sort((a, b) => a - b)
      .join(",");
    const spin = reach.byRotation.get(k);
    const id = `${cells}${spin ? "r" : ""}`;
    if (done.has(id)) continue;
    done.add(id);
    out.push({ piece, byRotation: spin });
  }
  return out;
}

// ---------------------------------------------------------------------------
// T-spin, lignes, attaque
// ---------------------------------------------------------------------------

export type Spin = "none" | "mini" | "full";

/** Règle des 3 coins, sur le plateau avant la pose. */
export function tSpin(grid: Grid, a: Active, lastRotation: boolean, kick: number): Spin {
  if (a.type !== "T" || !lastRotation) return "none";
  const corners = [
    [a.x, a.y],
    [a.x + 2, a.y],
    [a.x + 2, a.y + 2],
    [a.x, a.y + 2],
  ].map(([x, y]) => blocked(grid, x!, y!));
  if (corners.filter(Boolean).length < 3) return "none";
  // Les deux coins du côté où pointe le T
  const front = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ][a.rot]!;
  if (corners[front[0]!] && corners[front[1]!]) return "full";
  return kick === 4 ? "full" : "mini";
}

export function locked(grid: Grid, a: Active): Grid {
  const next = grid.slice();
  const color = colorOf(a.type);
  for (const [x, y] of cellsOf(a)) next[y * COLS + x] = color;
  return next;
}

/** Retire les lignes pleines ; renvoie le nouveau plateau et les lignes retirées. */
export function cleared(grid: Grid): { grid: Grid; rows: number[] } {
  const rows: number[] = [];
  const kept: number[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const row = grid.slice(y * COLS, (y + 1) * COLS);
    if (row.every((c) => c !== 0)) rows.push(y);
    else kept.push(row);
  }
  if (rows.length === 0) return { grid, rows };
  const empty = Array.from({ length: rows.length }, () => new Array<number>(COLS).fill(0));
  return { grid: [...empty, ...kept].flat(), rows };
}

const COMBO_BONUS = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
export const PERFECT_BONUS = 10;

export interface ClearInfo {
  lines: number;
  spin: Spin;
  /** Enchaînement de poses qui font des lignes, 0 pour la première */
  combo: number;
  /** Deuxième « difficile » de suite (quatre lignes ou T-spin avec lignes) */
  b2b: boolean;
  perfect: boolean;
}

export function attackOf(c: ClearInfo): number {
  if (c.lines === 0) return 0;
  let base: number;
  if (c.spin === "full") base = [0, 2, 4, 6, 6][c.lines]!;
  else if (c.spin === "mini") base = [0, 0, 1, 2, 2][c.lines]!;
  else base = [0, 0, 1, 2, 4][c.lines]!;
  const bonus = (c.b2b ? 1 : 0) + COMBO_BONUS[Math.min(c.combo, COMBO_BONUS.length - 1)]!;
  return base + bonus + (c.perfect ? PERFECT_BONUS : 0);
}

/** Pousse des lignes grises par le bas. `overflow` : des briques sont sorties par le haut (K.O.). */
export function withGarbage(grid: Grid, holes: number[]): { grid: Grid; overflow: boolean } {
  if (holes.length === 0) return { grid, overflow: false };
  const n = holes.length;
  const overflow = grid.slice(0, n * COLS).some((c) => c !== 0);
  const rows = holes.map((hole) => Array.from({ length: COLS }, (_, x) => (x === hole ? 0 : GARBAGE)));
  return { grid: [...grid.slice(n * COLS), ...rows.flat()], overflow };
}

/** Hauteur de la pile, en lignes depuis le fond */
export function stackHeight(grid: Grid): number {
  for (let y = 0; y < ROWS; y++) if (grid.slice(y * COLS, (y + 1) * COLS).some((c) => c !== 0)) return ROWS - y;
  return 0;
}

// ---------------------------------------------------------------------------
// Un joueur : son plateau, ses pièces, ses lignes grises en attente
// ---------------------------------------------------------------------------

export interface GarbageChunk {
  /** Numéro croissant : l'écran du joueur dit jusqu'où il les a vues */
  id: number;
  lines: number;
  hole: number;
  /** Trou différent à chaque ligne (règle « en vrac ») : un trou par ligne */
  holes?: number[];
  from: string | null;
}

export interface PlayerBoard {
  grid: Grid;
  bag: Bag;
  current: PieceType;
  hold: PieceType | null;
  combo: number;
  b2b: boolean;
  pending: GarbageChunk[];
  /** Nombre de poses acceptées : sert à ignorer un message parti avant une resynchronisation */
  seq: number;
}

export function newBoard(seed: number): PlayerBoard {
  const bag = newBag(seed);
  return { grid: emptyGrid(), bag, current: takePiece(bag), hold: null, combo: -1, b2b: false, pending: [], seq: 0 };
}

export interface Placement {
  /** Pièce posée */
  type: PieceType;
  x: number;
  y: number;
  rot: Rot;
  /** La réserve a été utilisée pour cette pièce */
  hold: boolean;
  /** Le dernier geste était une rotation, avec ce coup de pied */
  lastRotation: boolean;
  kick: number;
}

export interface PlaceResult {
  ok: true;
  lines: number;
  rows: number[];
  spin: Spin;
  combo: number;
  b2b: boolean;
  perfect: boolean;
  /** Attaque avant annulation */
  attack: number;
  /** Ce qui part chez l'adversaire après avoir annulé ses propres lignes grises */
  sent: number;
  cancelled: number;
  /** Lignes grises entrées dans le plateau à cette pose */
  garbageIn: number;
  /** Dernier joueur dont les lignes grises sont entrées */
  garbageFrom: string | null;
  topOut: boolean;
}

/**
 * Pose une pièce sur le plateau d'un joueur et applique tout ce qui en découle.
 * `ack` : dernier paquet de lignes grises connu de l'écran du joueur (les suivants attendent).
 * `strict` : le serveur vérifie que la pose est atteignable ; l'écran, lui, sait déjà qu'elle l'est.
 */
export function place(
  board: PlayerBoard,
  p: Placement,
  ack: number,
  opts: { hold: boolean; strict: boolean },
): PlaceResult | { ok: false; error: string } {
  let current = board.current;
  let hold = board.hold;
  const bag = { rng: board.bag.rng, queue: [...board.bag.queue] };
  if (p.hold) {
    if (!opts.hold) return { ok: false, error: "La réserve est désactivée." };
    const next = hold ?? takePiece(bag);
    hold = current;
    current = next;
  }
  if (p.type !== current) return { ok: false, error: "Ce n'est pas la pièce attendue." };
  const piece: Active = { type: p.type, rot: p.rot, x: p.x, y: p.y };
  if (!fits(board.grid, piece) || !grounded(board.grid, piece)) return { ok: false, error: "Position impossible." };

  let lastRotation = p.lastRotation;
  let kick = p.kick;
  if (opts.strict) {
    const reach = reachable(board.grid, spawn(p.type));
    const k = key(piece);
    if (!reach.seen.has(k)) return { ok: false, error: "Cette pièce ne peut pas arriver là." };
    const kicks = reach.byRotation.get(k);
    if (!kicks) lastRotation = false;
    else if (lastRotation && !kicks.has(kick)) kick = Math.min(...kicks);
  }

  const spin = tSpin(board.grid, piece, lastRotation, kick);
  const lockOut = cellsOf(piece).every(([, y]) => y < HIDDEN);
  const { grid: afterClear, rows } = cleared(locked(board.grid, piece));
  const lines = rows.length;
  const difficult = lines > 0 && (lines === 4 || spin !== "none");
  const combo = lines > 0 ? board.combo + 1 : -1;
  const b2b = lines > 0 ? difficult && board.b2b : board.b2b;
  const perfect = lines > 0 && afterClear.every((c) => c === 0);
  const attack = attackOf({ lines, spin, combo: Math.max(0, combo), b2b, perfect });

  // On annule d'abord ses propres lignes grises connues, les plus anciennes d'abord
  let left = attack;
  let cancelled = 0;
  const pending = board.pending.map((g) => ({ ...g }));
  for (const g of pending) {
    if (left === 0 || g.id > ack) break;
    const take = Math.min(left, g.lines);
    g.lines -= take;
    if (g.holes) g.holes = g.holes.slice(take);
    left -= take;
    cancelled += take;
  }
  let rest = pending.filter((g) => g.lines > 0);

  // Sans ligne faite, les lignes grises connues montent
  let grid = afterClear;
  let garbageIn = 0;
  let garbageFrom: string | null = null;
  let overflow = false;
  if (lines === 0) {
    const holes: number[] = [];
    const kept: GarbageChunk[] = [];
    for (const g of rest) {
      const room = GARBAGE_CAP - holes.length;
      if (g.id > ack || room <= 0) {
        kept.push(g);
        continue;
      }
      const take = Math.min(room, g.lines);
      for (let i = 0; i < take; i++) holes.push(g.holes ? g.holes[i]! : g.hole);
      garbageFrom = g.from ?? garbageFrom;
      if (take < g.lines) kept.push({ ...g, lines: g.lines - take, ...(g.holes ? { holes: g.holes.slice(take) } : {}) });
    }
    const pushed = withGarbage(grid, holes);
    grid = pushed.grid;
    overflow = pushed.overflow;
    garbageIn = holes.length;
    rest = kept;
  }

  const nextPiece = takePiece(bag);
  const blockOut = !fits(grid, spawn(nextPiece));
  board.grid = grid;
  board.bag = bag;
  board.current = nextPiece;
  board.hold = hold;
  board.combo = combo;
  board.b2b = lines > 0 ? difficult : board.b2b;
  board.pending = rest;
  board.seq += 1;
  return {
    ok: true,
    lines,
    rows,
    spin,
    combo: Math.max(0, combo),
    b2b,
    perfect,
    attack,
    sent: left,
    cancelled,
    garbageIn,
    garbageFrom,
    topOut: lockOut || blockOut || overflow,
  };
}

/** Trou des lignes grises d'une attaque : une colonne par paquet, ou une par ligne en vrac. */
export function garbageHoles(holder: RngHolder, lines: number, messy: boolean): { hole: number; holes?: number[] } {
  const hole = randomInt(holder, COLS);
  if (!messy) return { hole };
  return { hole, holes: Array.from({ length: lines }, () => randomInt(holder, COLS)) };
}

// ---------------------------------------------------------------------------
// Transport compact du plateau
// ---------------------------------------------------------------------------

export function gridToString(grid: Grid): string {
  return grid.join("");
}

export function gridFromString(s: string): Grid {
  const g = emptyGrid();
  for (let i = 0; i < Math.min(s.length, g.length); i++) g[i] = s.charCodeAt(i) - 48;
  return g;
}

/** Gravité : millisecondes par ligne selon le temps écoulé dans la manche */
const GRAVITY = [1000, 820, 660, 520, 400, 300, 220, 160, 110, 75, 50, 35];
export function gravityMs(elapsedMs: number, speedUp: boolean): number {
  if (!speedUp) return GRAVITY[0]!;
  return GRAVITY[Math.min(GRAVITY.length - 1, Math.floor(elapsedMs / 20_000))]!;
}
