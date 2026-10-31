import { GROUPS, SQUARES, type GroupId } from "../../../shared/games/capitale/board.ts";

// Le plateau en 3D : 12 unités de côté, centré sur l'origine, Départ en bas à droite (x > 0, z > 0).
// Les cases font le tour ; au centre, la ville : une rocade, quatre bandes de quartiers, une rue intérieure et la place.

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
/** La profondeur d'une bande de quartiers */
export const DEPTH = 1.5;
/** Les bords des rues : la rocade (contre les cases), la rue intérieure (autour de la place) */
export const OUTER_ROAD = INNER - ROAD / 2;
export const BAND_OUT = INNER - ROAD;
export const BAND_IN = BAND_OUT - DEPTH;
export const INNER_ROAD = BAND_IN - ROAD / 2;
export const PLAZA = BAND_IN - ROAD;
/** L'arène où roulent les dés, au milieu de la place */
export const ARENA = 1.35;

/** Un repère par bande : son départ (dans un coin), le long de la bande, vers le centre */
const FRAMES: Record<Side, { o: [number, number]; u: [number, number]; v: [number, number] }> = {
  bottom: { o: [BAND_OUT, BAND_OUT], u: [-1, 0], v: [0, -1] },
  left: { o: [-BAND_OUT, BAND_OUT], u: [0, -1], v: [1, 0] },
  top: { o: [-BAND_OUT, -BAND_OUT], u: [1, 0], v: [0, 1] },
  right: { o: [BAND_OUT, -BAND_OUT], u: [0, 1], v: [-1, 0] },
};

/** Ce qui occupe une parcelle de la ville */
export type LotKind = "property" | "station" | "tax" | "toll";

export interface Lot extends WRect {
  kind: LotKind;
  /** La case du plateau qu'elle représente */
  square: number;
  side: Side;
  /** L'angle (autour de y) qui tourne la façade vers la place */
  facing: number;
  group?: GroupId;
}

/** Le rectangle du monde qui va de (u0, v0) à (u1, v1) dans le repère d'une bande */
function frameRect(side: Side, u0: number, u1: number, v0: number, v1: number): WRect {
  const f = FRAMES[side];
  const pts = [
    [u0, v0],
    [u1, v1],
  ].map(([u, v]) => [f.o[0] + f.u[0] * u! + f.v[0] * v!, f.o[1] + f.u[1] * u! + f.v[1] * v!]);
  const x0 = Math.min(pts[0]![0]!, pts[1]![0]!);
  const z0 = Math.min(pts[0]![1]!, pts[1]![1]!);
  return { x: x0, z: z0, w: Math.abs(pts[0]![0]! - pts[1]![0]!), d: Math.abs(pts[0]![1]! - pts[1]![1]!) };
}

/** La façade regarde vers le centre : vers -z en bas, +x à gauche, +z en haut, -x à droite */
const FACING: Record<Side, number> = { bottom: Math.PI, left: Math.PI / 2, top: 0, right: -Math.PI / 2 };

const LOT_W = 0.84;
const LOT_GAP = 0.05;
const ITEM_GAP = 0.2;
const BIG_W = 1.0;
const SMALL_W = 0.9;

type Item = { kind: LotKind; squares: number[]; width: number };

/** Ce qu'il y a le long de chaque bande, dans l'ordre des cases */
const BANDS: Record<Side, Item[]> = {
  bottom: [
    { kind: "property", squares: [1, 3], width: 0 },
    { kind: "tax", squares: [4], width: SMALL_W },
    { kind: "station", squares: [5], width: BIG_W },
    { kind: "property", squares: [6, 8, 9], width: 0 },
  ],
  left: [
    { kind: "property", squares: [11, 13, 14], width: 0 },
    { kind: "station", squares: [15], width: BIG_W },
    { kind: "property", squares: [16, 18, 19], width: 0 },
  ],
  top: [
    { kind: "property", squares: [21, 23, 24], width: 0 },
    { kind: "station", squares: [25], width: BIG_W },
    { kind: "property", squares: [26, 27, 29], width: 0 },
  ],
  right: [
    { kind: "property", squares: [31, 32, 34], width: 0 },
    { kind: "station", squares: [35], width: BIG_W },
    { kind: "property", squares: [37, 39], width: 0 },
    { kind: "toll", squares: [38], width: SMALL_W },
  ],
};

/** La longueur d'une bande : d'un coin de la rocade jusqu'à la rue intérieure d'en face */
const BAND_LEN = BAND_OUT + BAND_IN;

function buildLots(): Lot[] {
  const lots: Lot[] = [];
  for (const side of Object.keys(BANDS) as Side[]) {
    const items = BANDS[side];
    const widthOf = (it: Item) => (it.kind === "property" ? it.squares.length * LOT_W + (it.squares.length - 1) * LOT_GAP : it.width);
    const used = items.reduce((s, it) => s + widthOf(it), 0) + ITEM_GAP * (items.length - 1);
    let u = (BAND_LEN - used) / 2;
    for (const it of items) {
      if (it.kind === "property") {
        for (const sq of it.squares) {
          lots.push({
            ...frameRect(side, u, u + LOT_W, 0, DEPTH),
            kind: "property",
            square: sq,
            side,
            facing: FACING[side],
            group: SQUARES[sq]!.group,
          });
          u += LOT_W + LOT_GAP;
        }
        u -= LOT_GAP;
      } else {
        lots.push({ ...frameRect(side, u, u + it.width, 0, DEPTH), kind: it.kind, square: it.squares[0]!, side, facing: FACING[side] });
        u += it.width;
      }
      u += ITEM_GAP;
    }
  }
  return lots;
}

export const LOTS: Lot[] = buildLots();
export const LOT_OF: Record<number, Lot> = Object.fromEntries(LOTS.map((l) => [l.square, l]));

/** Les grands lieux de la place, chacun dans un coin */
export const PLAZA_CORNER = { size: PLAZA - ARENA - 0.12, from: ARENA + 0.1 };
export interface Spot {
  x: number;
  z: number;
}
const corner = (sx: number, sz: number): Spot => ({
  x: sx * (PLAZA_CORNER.from + PLAZA_CORNER.size / 2),
  z: sz * (PLAZA_CORNER.from + PLAZA_CORNER.size / 2),
});
export const LANDMARKS = {
  bank: corner(1, 1),
  dam: corner(-1, 1),
  park: corner(-1, -1),
  wind: corner(1, -1),
};
/** Le barrage et le parc éolien sont des cases qu'on achète : on les touche pour voir leur fiche */
export const UTILITY_SPOT: Record<number, Spot> = { 12: LANDMARKS.dam, 28: LANDMARKS.wind };

/** Les deux paquets de cartes, posés au bord de la place */
export const DECK_SPOT: Record<"hasard" | "courrier", Spot> = {
  hasard: { x: 0, z: -(ARENA + 0.1 + PLAZA_CORNER.size / 2) },
  courrier: { x: 0, z: ARENA + 0.1 + PLAZA_CORNER.size / 2 },
};

/** Ce qu'on touche dans la ville : une parcelle, ou un coin de la place qui est une case */
export function citySquareAt(x: number, z: number): number | null {
  for (const l of LOTS) if (x >= l.x && x <= l.x + l.w && z >= l.z && z <= l.z + l.d) return l.square;
  const half = PLAZA_CORNER.size / 2;
  for (const [sq, s] of Object.entries(UTILITY_SPOT)) {
    if (Math.abs(x - s.x) <= half && Math.abs(z - s.z) <= half) return Number(sq);
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
