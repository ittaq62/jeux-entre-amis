// Capitale Builder : la carte du centre du plateau, en cases, dessinée comme le plan d'une vraie ville.
// Un fleuve la traverse par le milieu (avec ses ponts), une avenue la coupe de haut en bas, et la place des dés est au
// centre, sur le fleuve. Dans chaque coin, deux quartiers aux contours en escalier s'emboîtent ; chacun tient, dans son
// liseré, les parcelles de ses rues (numérotées 1, 2, 3) et sa réserve de terrain, que seules ses rues annexent. Des
// squares arborés comblent l'espace entre les quartiers ; les gares, les réseaux, la banque et le kiosque ont leur lot.
// Le plan est dessiné en blocs de 2 × 2 cases. Les colonnes (x) vont de gauche à droite, les rangées (z) du haut vers
// le bas, vues du dessus avec Départ en bas à droite, comme le plateau.

import { GROUP_ORDER, GROUPS, SQUARES, type GroupId } from "./board.ts";

/** Un bloc du plan fait BLOCK × BLOCK cases */
export const BLOCK = 2;

/**
 * Le plan, bloc par bloc : une lettre par ville ; un chiffre pour la réserve d'un quartier ; « * » square ; « ~ »
 * fleuve ; « = » pont ; « # » avenue ; « P » la place des dés ; les lots : E S A N les gares (25, 15, 5, 35), W le
 * barrage (12), Y les éoliennes (28), I les impôts (4), T le péage (38), $ la banque, K le kiosque aux cartes.
 */
const PLAN = [
  "lllmm5nnn#oo6pppqqr",
  "4llmm5nnn#ooo6ppqqr",
  "455m5555E#6o66p6qqr",
  "kk555*5*E#*66666qrr",
  "kk44*****#Y*66777rr",
  "kjj44*K**#***77sss7",
  "4jjj4****#***7sssst",
  "iii44**PPPPP*77tttt",
  "ii4SS**PPPPPNN77ttt",
  "W~~=~~~PPPPP~~~=~~~",
  "W~~=~~~PPPPP~~~=~~~",
  "hhh3***PPPPP***8uuu",
  "3h33*****#*$**8uuuu",
  "ggg3*****#**T*88uv8",
  "3g3***22*#****8vvv8",
  "ff3**22*A#*I**8vvvv",
  "3ff*22ccA#***11888v",
  "3e2dd2c2*#***1bb1a1",
  "ee2d2222*#****111a1",
];

/** La carte fait MAP cases de côté */
export const MAP = PLAN.length * BLOCK;

export interface Rect {
  /** La case en haut à gauche */
  x: number;
  z: number;
  /** La largeur (en x) et la profondeur (en z), en cases */
  w: number;
  d: number;
}

export type MapSide = "top" | "right" | "bottom" | "left";

/** La ville de chaque lettre du plan (sa case du plateau) */
const CITY_LETTERS: Record<string, number> = {
  a: 1,
  b: 3,
  c: 6,
  d: 8,
  e: 9,
  f: 11,
  g: 13,
  h: 14,
  i: 16,
  j: 18,
  k: 19,
  l: 21,
  m: 23,
  n: 24,
  o: 26,
  p: 27,
  q: 29,
  r: 31,
  s: 32,
  t: 34,
  u: 37,
  v: 39,
};

/** La réserve de chaque quartier, par son chiffre */
const RESERVE_DIGITS: Record<string, GroupId> = {
  "1": "brun",
  "2": "ciel",
  "3": "rose",
  "4": "orange",
  "5": "rouge",
  "6": "jaune",
  "7": "vert",
  "8": "bleu",
};

export type LotKind = "plaza" | "station" | "utility" | "tax" | "toll" | "bank" | "kiosk";

/** Ce qui ne se bâtit pas : la place des dés, les gares, les réseaux, les impôts, le péage, la banque et le kiosque */
export interface Lot extends Rect {
  kind: LotKind;
  /** La case du plateau qu'il représente (-1 pour la place, la banque et le kiosque) */
  square: number;
}

const LOT_LETTERS: Record<string, { kind: LotKind; square: number }> = {
  P: { kind: "plaza", square: -1 },
  E: { kind: "station", square: 25 },
  S: { kind: "station", square: 15 },
  A: { kind: "station", square: 5 },
  N: { kind: "station", square: 35 },
  W: { kind: "utility", square: 12 },
  Y: { kind: "utility", square: 28 },
  I: { kind: "tax", square: 4 },
  T: { kind: "toll", square: 38 },
  $: { kind: "bank", square: -1 },
  K: { kind: "kiosk", square: -1 },
};

export type CellKind = "city" | "reserve" | "park" | "river" | "bridge" | "avenue" | "lot";

export interface Cell {
  kind: CellKind;
  /** La ville (case du plateau) d'une parcelle, ou celle d'un lot ; -1 sinon */
  square: number;
  /** Le quartier d'une parcelle ou d'une réserve */
  group: GroupId | null;
}

export const cellIndex = (x: number, z: number) => z * MAP + x;
export const cellX = (cell: number) => cell % MAP;
export const cellZ = (cell: number) => Math.floor(cell / MAP);
export const onMap = (x: number, z: number) => x >= 0 && z >= 0 && x < MAP && z < MAP;

/** Les cases d'un bloc du plan */
function blockCells(bx: number, bz: number): number[] {
  const out: number[] = [];
  for (let dz = 0; dz < BLOCK; dz++) for (let dx = 0; dx < BLOCK; dx++) out.push(cellIndex(bx * BLOCK + dx, bz * BLOCK + dz));
  return out;
}

function buildCells(): Cell[] {
  const cells: Cell[] = Array.from({ length: MAP * MAP }, () => ({ kind: "park" as CellKind, square: -1, group: null }));
  PLAN.forEach((row, bz) => {
    [...row].forEach((ch, bx) => {
      let cell: Cell;
      if (ch in CITY_LETTERS) {
        const square = CITY_LETTERS[ch]!;
        cell = { kind: "city", square, group: SQUARES[square]!.group! };
      } else if (ch in RESERVE_DIGITS) cell = { kind: "reserve", square: -1, group: RESERVE_DIGITS[ch]! };
      else if (ch in LOT_LETTERS) cell = { kind: "lot", square: LOT_LETTERS[ch]!.square, group: null };
      else if (ch === "~") cell = { kind: "river", square: -1, group: null };
      else if (ch === "=") cell = { kind: "bridge", square: -1, group: null };
      else if (ch === "#") cell = { kind: "avenue", square: -1, group: null };
      else cell = { kind: "park", square: -1, group: null };
      for (const c of blockCells(bx, bz)) cells[c] = { ...cell };
    });
  });
  return cells;
}

export const CELLS: Cell[] = buildCells();

/** Le territoire de départ de chaque ville : ses cases, dans l'ordre de la carte */
export const TERRITORY_CELLS: Record<number, number[]> = {};
CELLS.forEach((cell, c) => {
  if (cell.kind === "city") (TERRITORY_CELLS[cell.square] ??= []).push(c);
});

/** Les villes de la carte, dans l'ordre du plateau */
export const MAP_CITIES = Object.keys(TERRITORY_CELLS)
  .map(Number)
  .sort((a, b) => a - b);

/** Le quartier en entier (ses parcelles et sa réserve) : le dedans de son liseré */
export const DISTRICT_CELLS: Record<GroupId, number[]> = Object.fromEntries(
  GROUP_ORDER.map((g) => [g, CELLS.flatMap((cell, c) => (cell.group === g ? [c] : []))]),
) as Record<GroupId, number[]>;

/** Les lots, chacun dans le rectangle de ses blocs */
export const LOTS: Lot[] = Object.entries(LOT_LETTERS).flatMap(([ch, info]) => {
  const blocks: [number, number][] = [];
  PLAN.forEach((row, bz) => [...row].forEach((c, bx) => c === ch && blocks.push([bx, bz])));
  if (blocks.length === 0) return [];
  const xs = blocks.map(([x]) => x);
  const zs = blocks.map(([, z]) => z);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  return [{ ...info, x: x0 * BLOCK, z: z0 * BLOCK, w: (Math.max(...xs) - x0 + 1) * BLOCK, d: (Math.max(...zs) - z0 + 1) * BLOCK }];
});

/** Une ville de la carte ? */
export const isMapCity = (index: number) => TERRITORY_CELLS[index] !== undefined;

/** Le côté du plateau que regarde une ville (ses façades), selon sa case */
export function sideOfSquare(index: number): MapSide {
  if (index < 10) return "bottom";
  if (index < 20) return "left";
  if (index < 30) return "top";
  return "right";
}

/** Le numéro d'une ville dans son quartier (1, 2, 3), dans l'ordre du plateau, comme sur sa parcelle et sur sa case */
export function parcelNumber(index: number): number {
  const g = SQUARES[index]?.group;
  return g ? GROUPS[g].squares.indexOf(index) + 1 : 0;
}

export function rectCells(r: Rect): number[] {
  const out: number[] = [];
  for (let z = r.z; z < r.z + r.d; z++) for (let x = r.x; x < r.x + r.w; x++) out.push(cellIndex(x, z));
  return out;
}

/** Le rectangle qui englobe des cases */
export function boxOf(cells: Iterable<number>): Rect {
  const list = [...cells];
  const xs = list.map(cellX);
  const zs = list.map(cellZ);
  const x = Math.min(...xs);
  const z = Math.min(...zs);
  return { x, z, w: Math.max(...xs) - x + 1, d: Math.max(...zs) - z + 1 };
}

/** La distance en cases entre deux rectangles (0 s'ils se chevauchent, 1 s'ils se touchent, même par un coin) */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x - (a.x + a.w - 1), a.x - (b.x + b.w - 1));
  const dz = Math.max(0, b.z - (a.z + a.d - 1), a.z - (b.z + b.d - 1));
  return Math.max(dx, dz);
}

/** Deux rectangles côte à côte, par un bord (pas seulement par un coin) */
export function rectsTouch(a: Rect, b: Rect): boolean {
  const xs = a.x < b.x + b.w && b.x < a.x + a.w;
  const zs = a.z < b.z + b.d && b.z < a.z + a.d;
  return ((a.x + a.w === b.x || b.x + b.w === a.x) && zs) || ((a.z + a.d === b.z || b.z + b.d === a.z) && xs);
}

/** Une case de la réserve d'un quartier (annexable par ses rues, si personne ne l'a déjà prise) */
export const isReserve = (cell: number) => CELLS[cell]?.kind === "reserve";
/** Le quartier dont une case fait partie (parcelle ou réserve), ou null */
export const groupOfCell = (cell: number): GroupId | null => CELLS[cell]?.group ?? null;

/** Les cases du territoire de départ d'une ville */
export const baseCells = (index: number): number[] => TERRITORY_CELLS[index] ?? [];
export const baseSize = (index: number) => baseCells(index).length;
/** Le rectangle qui englobe le territoire de départ d'une ville */
export const territoryBox = (index: number): Rect => boxOf(baseCells(index));

/** Une ville s'agrandit au plus de moitié de sa taille de départ */
export const maxAnnex = (index: number) => Math.floor(baseSize(index) / 2);

/** Les quatre voisines d'une case (par un bord), sur la carte */
export function neighbors(cell: number): number[] {
  const x = cellX(cell);
  const z = cellZ(cell);
  return (
    [
      [x + 1, z],
      [x - 1, z],
      [x, z + 1],
      [x, z - 1],
    ] as const
  )
    .filter(([a, b]) => onMap(a, b))
    .map(([a, b]) => cellIndex(a, b));
}
