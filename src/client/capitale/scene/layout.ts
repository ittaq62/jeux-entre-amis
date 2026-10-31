import { GROUPS, SQUARES, type GroupId } from "../../../shared/games/capitale/board.ts";

// Le plateau en 3D : 12 unités de côté, centré sur l'origine, Départ en bas à droite (x > 0, z > 0).
// Les cases font le tour ; au centre, la ville : une rocade, puis neuf pâtés de maisons séparés par des avenues.
// La place des dés au milieu, et autour un pâté par quartier de couleur, partagé en quatre : les parcelles des rues
// (chacune avec ses 4 cases à bâtir) et un lieu (gare, barrage, impôts…).

export const BOARD = 12;
export const HALF = BOARD / 2;
const CORNER = 1.55;
export const UNIT = BOARD / (9 + 2 * CORNER);
/** Le côté d'un coin */
export const C = CORNER * UNIT;
/** La moitié du côté de la ville (le bord intérieur des cases) */
export const INNER = HALF - C;
/** La largeur de la bande de couleur des terrains, sur le bord intérieur de la case */
export const BAND = 0.27;

export type Side = "bottom" | "left" | "top" | "right";

export interface WRect {
  /** Le coin en x et z les plus petits */
  x: number;
  z: number;
  /** La largeur en x, la profondeur en z */
  w: number;
  d: number;
}

export interface SquareRect extends WRect {
  side: Side | "corner";
}

/** La place d'une case sur le plateau */
export function squareRect(i: number): SquareRect {
  if (i === 0) return { x: HALF - C, z: HALF - C, w: C, d: C, side: "corner" };
  if (i < 10) return { x: HALF - C - i * UNIT, z: HALF - C, w: UNIT, d: C, side: "bottom" };
  if (i === 10) return { x: -HALF, z: HALF - C, w: C, d: C, side: "corner" };
  if (i < 20) return { x: -HALF, z: HALF - C - (i - 10) * UNIT, w: C, d: UNIT, side: "left" };
  if (i === 20) return { x: -HALF, z: -HALF, w: C, d: C, side: "corner" };
  if (i < 30) return { x: -HALF + C + (i - 21) * UNIT, z: -HALF, w: UNIT, d: C, side: "top" };
  if (i === 30) return { x: HALF - C, z: -HALF, w: C, d: C, side: "corner" };
  return { x: HALF - C, z: -HALF + C + (i - 31) * UNIT, w: C, d: UNIT, side: "right" };
}

/** La bande de couleur d'un terrain, côté ville */
export function bandRect(i: number): WRect {
  const r = squareRect(i);
  if (r.side === "bottom") return { x: r.x, z: r.z, w: r.w, d: BAND };
  if (r.side === "left") return { x: r.x + r.w - BAND, z: r.z, w: BAND, d: r.d };
  if (r.side === "top") return { x: r.x, z: r.z + r.d - BAND, w: r.w, d: BAND };
  return { x: r.x, z: r.z, w: BAND, d: r.d };
}

/** La case sous un point du plateau, ou null s'il est dans la ville */
export function squareAt(x: number, z: number): number | null {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return null;
  if (Math.abs(x) < INNER && Math.abs(z) < INNER) return null;
  for (let i = 0; i < 40; i++) {
    const r = squareRect(i);
    if (x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) return i;
  }
  return null;
}

/** Là où se tiennent les pions d'une case : le milieu, hors de la bande de couleur */
export function squareSpot(i: number): { x: number; z: number } {
  const r = squareRect(i);
  const cx = r.x + r.w / 2;
  const cz = r.z + r.d / 2;
  const shift = SQUARES[i]!.kind === "property" ? BAND / 2 : 0;
  if (r.side === "bottom") return { x: cx, z: cz + shift };
  if (r.side === "left") return { x: cx - shift, z: cz };
  if (r.side === "top") return { x: cx, z: cz - shift };
  if (r.side === "right") return { x: cx + shift, z: cz };
  return { x: cx, z: cz };
}

/** Plusieurs pions sur une case : chacun sa place, en petit groupe */
const SLOTS: [number, number][][] = [
  [[0, 0]],
  [
    [-0.17, 0],
    [0.17, 0],
  ],
  [
    [-0.17, -0.12],
    [0.17, -0.12],
    [0, 0.17],
  ],
  [
    [-0.17, -0.17],
    [0.17, -0.17],
    [-0.17, 0.17],
    [0.17, 0.17],
  ],
  [
    [-0.2, -0.17],
    [0.2, -0.17],
    [0, 0],
    [-0.2, 0.17],
    [0.2, 0.17],
  ],
  [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0],
    [0.2, 0],
    [-0.2, 0.2],
    [0.2, 0.2],
  ],
];

export function slotOffset(slot: number, count: number): [number, number] {
  const row = SLOTS[Math.min(5, Math.max(0, count - 1))]!;
  return row[Math.min(slot, row.length - 1)]!;
}

/** La prison (en bas à gauche) : la cellule côté ville, la simple visite le long des deux bords extérieurs */
const JAIL_X = -HALF;
const JAIL_Z = HALF - C;
export const CELL: WRect = { x: JAIL_X + 0.36 * C, z: JAIL_Z, w: 0.64 * C, d: 0.64 * C };
export function jailSpot(inside: boolean, slot: number): { x: number; z: number } {
  if (inside) {
    const cx = CELL.x + CELL.w / 2;
    const cz = CELL.z + CELL.d / 2;
    const [dx, dz] = slotOffset(slot, 6);
    return { x: cx + dx * 0.8, z: cz + dz * 0.8 };
  }
  // En visite : le long du bord gauche, puis du bord du bas
  const along = [0.2, 0.5, 0.8][slot % 3]! * C;
  const out = 0.18 * C;
  return slot < 3 ? { x: JAIL_X + out, z: JAIL_Z + C - along } : { x: JAIL_X + along, z: JAIL_Z + C - out };
}

// ---------------------------------------------------------------------------
// La ville
// ---------------------------------------------------------------------------

export const ROAD = 0.25;
/** Le milieu de la rocade, le long des cases */
export const OUTER_ROAD = INNER - ROAD / 2;
/** La moitié du côté de la ville bâtie (sans la rocade) */
export const CITY = INNER - ROAD;
/** Le côté d'un pâté de maisons : trois pâtés et deux avenues par côté */
export const BLOCK = (2 * CITY - 2 * ROAD) / 3;
/** Le milieu des avenues qui entourent la place */
export const AVENUE = BLOCK / 2 + ROAD / 2;
/** La place des dés : le pâté du milieu */
export const PLAZA = BLOCK / 2;
/** Les murs invisibles où rebondissent les dés */
export const ARENA = PLAZA - 0.1;
/** L'allée entre les quatre lieux d'un pâté, et le côté d'un lieu */
export const ALLEY = 0.08;
export const QUAD = (BLOCK - ALLEY) / 2;

// Une parcelle de rue, dans son propre repère (la rue devant, vers +z) : la bande au nom de la rue, puis 2 rangs de 2 cases
export const STRIP = 0.17;
const LOT_MARGIN = 0.06;
const CELL_GAP = 0.05;
export const CELL_W = (QUAD - 2 * LOT_MARGIN - CELL_GAP) / 2;
export const CELL_D = (QUAD - STRIP - LOT_MARGIN - CELL_GAP) / 2;
const frontRow = QUAD / 2 - STRIP - CELL_D / 2;
/** Le centre de chaque case dans le repère de la parcelle : 0 et 1 devant (côté rue), 2 et 3 au fond */
export const CELL_POS: { x: number; z: number }[] = [
  { x: -(CELL_GAP + CELL_W) / 2, z: frontRow },
  { x: (CELL_GAP + CELL_W) / 2, z: frontRow },
  { x: -(CELL_GAP + CELL_W) / 2, z: frontRow - CELL_D - CELL_GAP },
  { x: (CELL_GAP + CELL_W) / 2, z: frontRow - CELL_D - CELL_GAP },
];

/** Ce qui occupe un lieu de la ville */
export type LotKind = "property" | "station" | "utility" | "tax" | "toll" | "bank" | "kiosk";

export interface Lot extends WRect {
  kind: LotKind;
  /** La case du plateau qu'il représente (-1 pour la banque et le kiosque) */
  square: number;
  /** L'angle (autour de y) qui tourne la façade vers la rue de devant */
  facing: number;
  group?: GroupId;
}

/** Un pâté par quartier : sa place dans la grille, le côté du plateau qu'il longe, et ses quatre lieux dans l'ordre */
const BLOCKS: { col: number; row: number; side: Side; items: (number | "bank" | "kiosk")[] }[] = [
  { col: 1, row: 1, side: "bottom", items: [1, 3, "kiosk", 4] },
  { col: 0, row: 1, side: "bottom", items: [5, 6, 8, 9] },
  { col: -1, row: 1, side: "left", items: [11, 13, 12, 14] },
  { col: -1, row: 0, side: "left", items: [15, 16, 18, 19] },
  { col: -1, row: -1, side: "top", items: [21, 23, 24, 25] },
  { col: 0, row: -1, side: "top", items: [26, 27, 28, 29] },
  { col: 1, row: -1, side: "right", items: [31, 32, 34, 35] },
  { col: 1, row: 0, side: "right", items: [37, 39, 38, "bank"] },
];

/** Le repère d'un pâté : son coin de départ, le long du côté du plateau (u), vers la place (v) */
const FRAMES: Record<Side, { corner: [number, number]; u: [number, number]; v: [number, number] }> = {
  bottom: { corner: [1, 1], u: [-1, 0], v: [0, -1] },
  left: { corner: [-1, 1], u: [0, -1], v: [1, 0] },
  top: { corner: [-1, -1], u: [1, 0], v: [0, 1] },
  right: { corner: [1, -1], u: [0, 1], v: [-1, 0] },
};

const KIND_OF: Record<string, LotKind> = { station: "station", utility: "utility", tax: "tax", property: "property" };

function buildLots(): Lot[] {
  const lots: Lot[] = [];
  const step = BLOCK + ROAD;
  for (const b of BLOCKS) {
    const f = FRAMES[b.side];
    const ox = b.col * step + (f.corner[0] * BLOCK) / 2;
    const oz = b.row * step + (f.corner[1] * BLOCK) / 2;
    b.items.forEach((item, n) => {
      const a = n % 2;
      const r = Math.floor(n / 2);
      // Le centre du lieu, puis sa rue de devant : vers l'extérieur au premier rang, vers la place au second
      const cu = a * (QUAD + ALLEY) + QUAD / 2;
      const cv = r * (QUAD + ALLEY) + QUAD / 2;
      const cx = ox + f.u[0] * cu + f.v[0] * cv;
      const cz = oz + f.u[1] * cu + f.v[1] * cv;
      const front = r === 0 ? [-f.v[0], -f.v[1]] : f.v;
      const facing = Math.atan2(front[0]!, front[1]!);
      const rect = { x: cx - QUAD / 2, z: cz - QUAD / 2, w: QUAD, d: QUAD };
      if (item === "bank" || item === "kiosk") {
        lots.push({ ...rect, kind: item, square: -1, facing });
        return;
      }
      const sq = SQUARES[item]!;
      const kind: LotKind = sq.index === 38 ? "toll" : (KIND_OF[sq.kind] ?? "tax");
      lots.push({ ...rect, kind, square: item, facing, ...(sq.group ? { group: sq.group } : {}) });
    });
  }
  return lots;
}

export const LOTS: Lot[] = buildLots();
export const LOT_OF: Record<number, Lot> = Object.fromEntries(LOTS.filter((l) => l.square >= 0).map((l) => [l.square, l]));
export const BANK_LOT = LOTS.find((l) => l.kind === "bank")!;
export const KIOSK_LOT = LOTS.find((l) => l.kind === "kiosk")!;

export interface Spot {
  x: number;
  z: number;
}

/** Un point du repère d'un lieu (façade vers +z), dans le monde */
export function lotPoint(l: Lot, x: number, z: number): Spot {
  const c = Math.cos(l.facing);
  const s = Math.sin(l.facing);
  return { x: l.x + l.w / 2 + x * c + z * s, z: l.z + l.d / 2 - x * s + z * c };
}

/** Un point du monde, dans le repère d'un lieu */
export function toLot(l: Lot, x: number, z: number): Spot {
  const dx = x - (l.x + l.w / 2);
  const dz = z - (l.z + l.d / 2);
  const c = Math.cos(l.facing);
  const s = Math.sin(l.facing);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

export const cellCenter = (l: Lot, cell: number): Spot => lotPoint(l, CELL_POS[cell]!.x, CELL_POS[cell]!.z);

/** Les deux paquets de cartes, côte à côte sur le kiosque */
export const DECK_SPOT: Record<"hasard" | "courrier", Spot> = {
  hasard: lotPoint(KIOSK_LOT, -0.26, -0.08),
  courrier: lotPoint(KIOSK_LOT, 0.26, -0.08),
};
/** La banque, et la cagnotte de l'aire de repos posée sur son parvis */
export const BANK_SPOT: Spot = lotPoint(BANK_LOT, 0, -0.1);
export const POT_SPOT: Spot = lotPoint(BANK_LOT, 0.38, 0.4);

/** Ce qu'on touche dans la ville : la case d'une parcelle (et laquelle), ou un lieu qui est une case du plateau */
export function cityAt(x: number, z: number): { square: number; cell: number | null } | null {
  for (const l of LOTS) {
    if (l.square < 0 || x < l.x || x > l.x + l.w || z < l.z || z > l.z + l.d) continue;
    if (l.kind !== "property") return { square: l.square, cell: null };
    const p = toLot(l, x, z);
    const cell = CELL_POS.findIndex((c) => Math.abs(p.x - c.x) <= CELL_W / 2 && Math.abs(p.z - c.z) <= CELL_D / 2);
    return { square: l.square, cell: cell >= 0 ? cell : null };
  }
  return null;
}

/** Le chemin d'une boucle de rue (un carré aux coins arrondis), parcouru à la vitesse 1 */
export function loopPoint(half: number, radius: number, t: number): { x: number; z: number; angle: number } {
  const straight = 2 * (half - radius);
  const arc = (Math.PI / 2) * radius;
  const per = 4 * (straight + arc);
  let s = ((t % per) + per) % per;
  // Quatre côtés : bas (vers -x), gauche (vers -z), haut (vers +x), droite (vers +z)
  const sides = [
    { o: [half - radius, half], dir: [-1, 0] },
    { o: [-half, half - radius], dir: [0, -1] },
    { o: [-(half - radius), -half], dir: [1, 0] },
    { o: [half, -(half - radius)], dir: [0, 1] },
  ];
  for (let k = 0; k < 4; k++) {
    const sd = sides[k]!;
    if (s <= straight) {
      return { x: sd.o[0]! + sd.dir[0]! * s, z: sd.o[1]! + sd.dir[1]! * s, angle: Math.atan2(sd.dir[0]!, sd.dir[1]!) };
    }
    s -= straight;
    if (s <= arc) {
      // Le virage : autour du coin, vers le côté suivant
      const next = sides[(k + 1) % 4]!;
      const cx = sd.o[0]! + sd.dir[0]! * straight + next.dir[0]! * radius;
      const cz = sd.o[1]! + sd.dir[1]! * straight + next.dir[1]! * radius;
      const a0 = Math.atan2(sd.o[1]! + sd.dir[1]! * straight - cz, sd.o[0]! + sd.dir[0]! * straight - cx);
      const da = s / radius;
      // Le sens de rotation suit celui du tour (de la direction actuelle vers la suivante)
      const cross = sd.dir[0]! * next.dir[1]! - sd.dir[1]! * next.dir[0]!;
      const a = a0 + Math.sign(cross) * da;
      const x = cx + Math.cos(a) * radius;
      const z = cz + Math.sin(a) * radius;
      const tx = -Math.sin(a) * Math.sign(cross);
      const tz = Math.cos(a) * Math.sign(cross);
      return { x, z, angle: Math.atan2(tx, tz) };
    }
    s -= arc;
  }
  return { x: half, z: half, angle: 0 };
}

export const loopLength = (half: number, radius: number) => 4 * (2 * (half - radius) + (Math.PI / 2) * radius);

export const groupColor = (g: GroupId) => GROUPS[g].color;
