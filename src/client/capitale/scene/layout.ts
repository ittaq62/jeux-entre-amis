import { GROUPS, SQUARES, type GroupId } from "../../../shared/games/capitale/board.ts";

// Le plateau en 3D : 12 unités de côté, centré sur l'origine, Départ en bas à droite (x > 0, z > 0).
// Les cases font le tour ; au centre, la ville (voir city.ts) entourée d'une rocade.

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
