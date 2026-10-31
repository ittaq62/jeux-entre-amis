import { SQUARES, type GroupId } from "../../../shared/games/capitale/board.ts";
import { HALF, INNER, ROAD, squareSpot } from "./layout.ts";

// La carte de la ville, au centre du plateau : des parcelles de formes et de tailles inégales, comme sur un vrai plan.
// Chaque rue, gare, réseau ou bureau a la sienne, près de sa case ; les rues d'une même couleur forment un quartier.
// Les parcelles sont les cellules de Voronoï de points posés en deux couronnes autour de la place, puis rétrécies :
// ce qui reste entre elles, ce sont les rues.

export interface Pt {
  x: number;
  z: number;
}

export type PlaceKind = "property" | "station" | "utility" | "tax" | "toll" | "bank" | "kiosk" | "garden" | "plaza";

export interface Parcel {
  kind: PlaceKind;
  /** La case du plateau qu'elle représente (-1 pour la banque, le kiosque, les jardins, la place) */
  square: number;
  group?: GroupId;
  /** Le contour du terrain, déjà rétréci de la moitié d'une rue */
  poly: Pt[];
  center: Pt;
  /** La plus courte distance du centre au bord : la place pour bâtir */
  room: number;
  /** L'angle (autour de y) qui tourne les façades vers l'extérieur, du côté des cases */
  facing: number;
}

/** La moitié du côté de la ville (sans la rocade) */
export const CITY_HALF = INNER - ROAD;
/** La moitié d'une rue entre deux parcelles */
const STREET = 0.085;

/** Garde la partie d'un polygone convexe où n·p <= c */
function clip(poly: Pt[], nx: number, nz: number, c: number): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]!;
    const b = poly[(k + 1) % poly.length]!;
    const da = nx * a.x + nz * a.z - c;
    const db = nx * b.x + nz * b.z - c;
    if (da <= 0) out.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

/** La cellule de Voronoï d'un point, dans le carré de la ville */
function cell(i: number, seeds: Pt[]): Pt[] {
  const h = CITY_HALF;
  let poly: Pt[] = [
    { x: -h, z: -h },
    { x: h, z: -h },
    { x: h, z: h },
    { x: -h, z: h },
  ];
  const s = seeds[i]!;
  seeds.forEach((o, j) => {
    if (j === i) return;
    poly = clip(poly, o.x - s.x, o.z - s.z, (o.x ** 2 + o.z ** 2 - s.x ** 2 - s.z ** 2) / 2);
  });
  return poly;
}

/** Rétrécit un polygone convexe de d sur tous ses côtés (les bords du carré restent contre la rocade, à d près) */
function inset(poly: Pt[], d: number): Pt[] {
  let out = poly;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]!;
    const b = poly[(k + 1) % poly.length]!;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez);
    if (len < 1e-6) continue;
    // Le côté est parcouru dans le sens trigonométrique du plan (x, z) : l'intérieur est à gauche
    const nx = ez / len;
    const nz = -ex / len;
    out = clip(out, nx, nz, nx * a.x + nz * a.z - d);
  }
  return out;
}

function area(poly: Pt[]): number {
  let s = 0;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]!;
    const b = poly[(k + 1) % poly.length]!;
    s += a.x * b.z - b.x * a.z;
  }
  return s / 2;
}

function centroid(poly: Pt[]): Pt {
  let cx = 0;
  let cz = 0;
  const a = area(poly);
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k]!;
    const q = poly[(k + 1) % poly.length]!;
    const f = p.x * q.z - q.x * p.z;
    cx += (p.x + q.x) * f;
    cz += (p.z + q.z) * f;
  }
  return { x: cx / (6 * a), z: cz / (6 * a) };
}

/** La distance d'un point au bord le plus proche d'un polygone convexe */
function room(poly: Pt[], c: Pt): number {
  let best = Infinity;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]!;
    const b = poly[(k + 1) % poly.length]!;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez) || 1;
    best = Math.min(best, Math.abs((c.x - a.x) * ez - (c.z - a.z) * ex) / len);
  }
  return best;
}

/** Le point de la ville en face d'une case : le long de son côté, à la distance r du centre (les côtés se resserrent vers la place) */
function towards(square: number, r: number): Pt {
  const s = squareSpot(square);
  const f = r / (HALF - 1.2);
  return Math.abs(s.z) > Math.abs(s.x) ? { x: s.x * f, z: Math.sign(s.z) * r } : { x: Math.sign(s.x) * r, z: s.z * f };
}

/** Un petit décalage propre à chaque point, toujours le même : la carte n'a pas l'air tirée au cordeau */
const jitter = (n: number, amp: number): Pt => ({ x: Math.sin(n * 12.9898) * amp, z: Math.sin(n * 78.233 + 1.3) * amp });

const OUTER = 3.5;
const INNERRING = 2.5;

/** Chaque lieu de la ville, dans l'ordre du tour : un sur deux sur la couronne extérieure, l'autre plus près de la place */
const PLACES: { square: number; ring: "out" | "in" }[] = [
  1, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14, 15, 16, 18, 19, 21, 23, 24, 25, 26, 27, 28, 29, 31, 32, 34, 35, 37, 38, 39,
].map((square, n) => ({ square, ring: n % 2 === 0 ? "in" : "out" }));

function kindOf(square: number): PlaceKind {
  const sq = SQUARES[square]!;
  if (square === 38) return "toll";
  if (sq.kind === "property" || sq.kind === "station" || sq.kind === "utility" || sq.kind === "tax") return sq.kind;
  return "garden";
}

function buildCity(): Parcel[] {
  const seeds: Pt[] = [];
  const meta: { kind: PlaceKind; square: number }[] = [];
  // La place, au milieu
  seeds.push({ x: 0, z: 0 });
  meta.push({ kind: "plaza", square: -1 });
  PLACES.forEach((p, n) => {
    const base = towards(p.square, p.ring === "out" ? OUTER : INNERRING);
    const j = jitter(n + 1, 0.16);
    seeds.push({ x: base.x + j.x, z: base.z + j.z });
    meta.push({ kind: kindOf(p.square), square: p.square });
  });
  // Les quatre coins de la ville : la banque, le kiosque aux cartes, deux jardins
  const c = CITY_HALF - 0.55;
  for (const [x, z, kind] of [
    [c, c, "bank"],
    [-c, -c, "kiosk"],
    [-c, c, "garden"],
    [c, -c, "garden"],
  ] as const) {
    seeds.push({ x, z });
    meta.push({ kind, square: -1 });
  }
  return seeds.map((_, i) => {
    const poly = inset(cell(i, seeds), STREET);
    const center = centroid(poly);
    const m = meta[i]!;
    const group = m.square >= 0 ? SQUARES[m.square]!.group : undefined;
    return {
      kind: m.kind,
      square: m.square,
      ...(group ? { group } : {}),
      poly,
      center,
      room: room(poly, center),
      facing: Math.atan2(center.x, center.z),
    };
  });
}

export const PARCELS: Parcel[] = buildCity();
export const PARCEL_OF: Record<number, Parcel> = Object.fromEntries(PARCELS.filter((p) => p.square >= 0).map((p) => [p.square, p]));
export const PLAZA_PARCEL = PARCELS.find((p) => p.kind === "plaza")!;
export const BANK_PARCEL = PARCELS.find((p) => p.kind === "bank")!;
export const KIOSK_PARCEL = PARCELS.find((p) => p.kind === "kiosk")!;
/** Les murs invisibles où rebondissent les dés : le carré qui tient dans la place */
export const ARENA = PLAZA_PARCEL.room * 0.82;

/** Le point est-il dans ce polygone convexe ? */
export function inside(poly: Pt[], x: number, z: number): boolean {
  let sign = 0;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]!;
    const b = poly[(k + 1) % poly.length]!;
    const cr = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    if (Math.abs(cr) < 1e-9) continue;
    const sg = Math.sign(cr);
    if (sign === 0) sign = sg;
    else if (sg !== sign) return false;
  }
  return true;
}

/** La parcelle sous un point de la ville */
export const parcelAt = (x: number, z: number): Parcel | null => PARCELS.find((p) => inside(p.poly, x, z)) ?? null;

/** Un point du repère d'une parcelle (façade vers +z), dans le monde */
export function parcelPoint(p: Parcel, x: number, z: number): Pt {
  const c = Math.cos(p.facing);
  const s = Math.sin(p.facing);
  return { x: p.center.x + x * c + z * s, z: p.center.z - x * s + z * c };
}

/** Le rectangle qui englobe une parcelle (pour les cadres et la caméra) */
export function parcelBox(p: Parcel): { x: number; z: number; w: number; d: number } {
  const xs = p.poly.map((q) => q.x);
  const zs = p.poly.map((q) => q.z);
  const x = Math.min(...xs);
  const z = Math.min(...zs);
  return { x, z, w: Math.max(...xs) - x, d: Math.max(...zs) - z };
}

/** La surface d'une parcelle, pour doser la taille des bâtiments */
export const parcelArea = (p: Parcel) => Math.abs(area(p.poly));
