// Capitale Builder : la carte du centre du plateau, en cases. Chaque ville y a son territoire, un rectangle dont la
// taille suit son prix (9 cases pour Guéret, 36 pour Paris), le long de sa case du plateau. Devant les villes, du
// terrain vague que leurs propriétaires peuvent annexer ; au milieu, les rues, les gares, les réseaux et la place où
// roulent les dés.
// Les colonnes (x) vont de gauche à droite, les rangées (z) du haut vers le bas, vues du dessus avec Départ en bas à
// droite, comme le plateau.

/** La carte fait MAP cases de côté */
export const MAP = 36;

export interface Rect {
  /** La case en haut à gauche */
  x: number;
  z: number;
  /** La largeur (en x) et la profondeur (en z), en cases */
  w: number;
  d: number;
}

export type MapSide = "top" | "right" | "bottom" | "left";

const rect = (x: number, z: number, w: number, d: number): Rect => ({ x, z, w, d });

/** Le territoire de départ de chaque ville (la clé est sa case du plateau) */
export const TERRITORIES: Record<number, Rect> = {
  // En haut, de gauche à droite : le rouge, puis le jaune
  21: rect(0, 0, 4, 5),
  23: rect(5, 0, 4, 5),
  24: rect(10, 0, 5, 5),
  26: rect(19, 0, 5, 5),
  27: rect(25, 0, 5, 5),
  29: rect(31, 0, 5, 5),
  // À droite, de haut en bas : le vert, puis le bleu
  31: rect(30, 6, 6, 5),
  32: rect(30, 12, 6, 5),
  34: rect(30, 18, 6, 5),
  37: rect(30, 24, 6, 5),
  39: rect(30, 30, 6, 6),
  // À gauche, de haut en bas : l'orange, puis le rose
  19: rect(0, 6, 5, 4),
  18: rect(0, 11, 5, 4),
  16: rect(0, 16, 5, 4),
  14: rect(0, 22, 4, 4),
  13: rect(0, 27, 4, 4),
  11: rect(0, 32, 4, 4),
  // En bas, de droite à gauche : le brun, puis le ciel
  1: rect(26, 33, 3, 3),
  3: rect(22, 33, 3, 3),
  6: rect(15, 33, 4, 3),
  8: rect(10, 33, 4, 3),
  9: rect(5, 33, 4, 3),
};

/** Les villes de la carte, dans l'ordre du plateau */
export const MAP_CITIES = Object.keys(TERRITORIES)
  .map(Number)
  .sort((a, b) => a - b);

/** Le côté du plateau que regarde une ville (ses façades), selon sa case */
export function sideOfSquare(index: number): MapSide {
  if (index < 10) return "bottom";
  if (index < 20) return "left";
  if (index < 30) return "top";
  return "right";
}

/** Les rues de la ville : la rocade intérieure, une rue entre deux quartiers sur chaque côté, et le tour de la place */
export const STREETS: Rect[] = [
  rect(7, 7, 21, 1),
  rect(7, 30, 21, 1),
  rect(7, 7, 1, 24),
  rect(27, 7, 1, 24),
  rect(16, 0, 3, 7),
  rect(28, 23, 8, 1),
  rect(0, 21, 7, 1),
  rect(19, 31, 3, 5),
  rect(12, 12, 12, 1),
  rect(12, 23, 12, 1),
  rect(12, 12, 1, 12),
  rect(23, 12, 1, 12),
];

export type LotKind = "plaza" | "station" | "utility" | "tax" | "toll" | "bank" | "kiosk";

/** Ce qui ne se bâtit pas : la place des dés, les gares, les réseaux, les impôts, le péage, la banque et le kiosque */
export interface Lot extends Rect {
  kind: LotKind;
  /** La case du plateau qu'il représente (-1 pour la place, la banque et le kiosque) */
  square: number;
}

export const LOTS: Lot[] = [
  { kind: "plaza", square: -1, ...rect(13, 13, 10, 10) },
  { kind: "station", square: 25, ...rect(16, 9, 4, 3) },
  { kind: "utility", square: 28, ...rect(22, 9, 3, 3) },
  { kind: "kiosk", square: -1, ...rect(9, 9, 3, 3) },
  { kind: "station", square: 35, ...rect(24, 16, 3, 4) },
  { kind: "toll", square: 38, ...rect(24, 25, 3, 3) },
  { kind: "bank", square: -1, ...rect(24, 21, 3, 2) },
  { kind: "station", square: 5, ...rect(16, 25, 4, 3) },
  { kind: "tax", square: 4, ...rect(20, 25, 3, 3) },
  { kind: "station", square: 15, ...rect(9, 16, 3, 4) },
  { kind: "utility", square: 12, ...rect(9, 24, 3, 4) },
];

export type CellKind = "city" | "vague" | "street" | "lot" | "garden";

export interface Cell {
  kind: CellKind;
  /** La ville (case du plateau) d'un territoire de départ, ou le lot ; -1 sinon */
  square: number;
}

export const cellIndex = (x: number, z: number) => z * MAP + x;
export const cellX = (cell: number) => cell % MAP;
export const cellZ = (cell: number) => Math.floor(cell / MAP);
export const onMap = (x: number, z: number) => x >= 0 && z >= 0 && x < MAP && z < MAP;

export function rectCells(r: Rect): number[] {
  const out: number[] = [];
  for (let z = r.z; z < r.z + r.d; z++) for (let x = r.x; x < r.x + r.w; x++) out.push(cellIndex(x, z));
  return out;
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

/** Le terrain vague : ce qui est à deux cases ou moins d'une ville, sans être une rue ni un lot */
const VAGUE_REACH = 2;

function buildCells(): Cell[] {
  const cells: Cell[] = Array.from({ length: MAP * MAP }, () => ({ kind: "garden" as CellKind, square: -1 }));
  for (const [sq, r] of Object.entries(TERRITORIES)) for (const c of rectCells(r)) cells[c] = { kind: "city", square: Number(sq) };
  for (const r of STREETS) for (const c of rectCells(r)) if (cells[c]!.kind === "garden") cells[c] = { kind: "street", square: -1 };
  for (const l of LOTS) for (const c of rectCells(l)) cells[c] = { kind: "lot", square: l.square };
  for (let z = 0; z < MAP; z++) {
    for (let x = 0; x < MAP; x++) {
      const cell = cells[cellIndex(x, z)]!;
      if (cell.kind !== "garden") continue;
      let near = false;
      for (let dz = -VAGUE_REACH; dz <= VAGUE_REACH && !near; dz++)
        for (let dx = -VAGUE_REACH; dx <= VAGUE_REACH && !near; dx++)
          if (onMap(x + dx, z + dz) && cells[cellIndex(x + dx, z + dz)]!.kind === "city") near = true;
      if (near) cell.kind = "vague";
    }
  }
  return cells;
}

export const CELLS: Cell[] = buildCells();

/** Une case de terrain vague (annexable, si personne ne l'a déjà prise) */
export const isVague = (cell: number) => CELLS[cell]?.kind === "vague";

/** Les cases du territoire de départ d'une ville */
export const baseCells = (index: number): number[] => (TERRITORIES[index] ? rectCells(TERRITORIES[index]) : []);
export const baseSize = (index: number) => {
  const r = TERRITORIES[index];
  return r ? r.w * r.d : 0;
};

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
