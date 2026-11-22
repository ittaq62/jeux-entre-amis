// La hauteur du sol d'un morceau de parcours : plat, plan incliné, rampe (avec ou sans arrondi aux bouts), cuvette ou
// butte ronde, vagues, hauteur qui suit un chemin, plus des bosses ajoutées par-dessus. Chaque fonction est définie
// partout (même hors de son morceau) : la pente se calcule sans saut au bord.

import { clamp, type Pt } from "./geom.ts";

/** La forme d'une transition : linéaire, en S (douce aux deux bouts), douce au départ, douce à l'arrivée */
export type Ease = "lin" | "s" | "in" | "out";

export type HeightSpec =
  | number
  /** Un plan : la hauteur h au point `at`, et la pente (montée par mètre selon x et selon z) */
  | { k: "plane"; at: Pt; h: number; g: Pt }
  /** De la hauteur ha sur la ligne qui passe par a à hb sur celle qui passe par b (perpendiculaires à ab), plat au-delà */
  | { k: "ramp"; a: Pt; b: Pt; ha: number; hb: number; e?: Ease }
  /** Selon la distance au centre : h0 jusqu'à r0, h1 à partir de r1 (cuvette, butte, cratère, volcan) */
  | { k: "radial"; c: Pt; r0: number; r1: number; h0: number; h1: number; e?: Ease }
  /** Des vagues parallèles : h + amp·sin(2π·(p−at)·dir / len) */
  | { k: "wave"; at: Pt; dir: Pt; len: number; amp: number; h: number }
  /** La hauteur suit un chemin : hs[i] au point pts[i], interpolée selon la position le long du chemin */
  | { k: "path"; pts: Pt[]; hs: number[]; e?: Ease }
  /**
   * Une allée en coupes successives (left[i], right[i]) : hs[i] sur la coupe i, et entre deux coupes, selon la distance
   * à chacune. Exact sur chaque coupe : deux sections voisines se raccordent sans marche, même dans un coude.
   */
  | { k: "strip"; left: Pt[]; right: Pt[]; hs: number[] }
  /** La plus haute de plusieurs formes (une butte posée sur une pente…) */
  | { k: "max"; of: HeightSpec[] }
  /** La somme de plusieurs formes */
  | { k: "sum"; of: HeightSpec[] };

/** Une bosse (a > 0) ou un creux (a < 0) en cloche, de rayon r */
export interface Bump {
  c: Pt;
  r: number;
  a: number;
}

export function ease(t: number, e: Ease | undefined): number {
  const u = clamp(t, 0, 1);
  switch (e) {
    case "s":
      return u * u * (3 - 2 * u);
    case "in":
      return u * u;
    case "out":
      return 1 - (1 - u) * (1 - u);
    default:
      return u;
  }
}

/** La hauteur d'une forme en (x, z) */
export function specHeight(spec: HeightSpec, x: number, z: number): number {
  if (typeof spec === "number") return spec;
  switch (spec.k) {
    case "plane":
      return spec.h + spec.g[0] * (x - spec.at[0]) + spec.g[1] * (z - spec.at[1]);
    case "ramp": {
      const dx = spec.b[0] - spec.a[0];
      const dz = spec.b[1] - spec.a[1];
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? ((x - spec.a[0]) * dx + (z - spec.a[1]) * dz) / l2 : 0;
      return spec.ha + (spec.hb - spec.ha) * ease(t, spec.e);
    }
    case "radial": {
      const d = Math.hypot(x - spec.c[0], z - spec.c[1]);
      const t = spec.r1 > spec.r0 ? (d - spec.r0) / (spec.r1 - spec.r0) : d > spec.r0 ? 1 : 0;
      return spec.h0 + (spec.h1 - spec.h0) * ease(t, spec.e);
    }
    case "wave": {
      const u = (x - spec.at[0]) * spec.dir[0] + (z - spec.at[1]) * spec.dir[1];
      return spec.h + spec.amp * Math.sin((u / spec.len) * Math.PI * 2);
    }
    case "path":
      return pathHeight(spec, x, z);
    case "strip":
      return stripHeight(spec, x, z);
    case "max": {
      let h = -Infinity;
      for (const s of spec.of) h = Math.max(h, specHeight(s, x, z));
      return h;
    }
    case "sum": {
      let h = 0;
      for (const s of spec.of) h += specHeight(s, x, z);
      return h;
    }
  }
}

/**
 * Ce qu'on prépare pour un chemin : chaque segment, et une grille fine autour du chemin. Pour chaque maille (calculée la
 * première fois qu'une balle y passe), les seuls segments qui peuvent être les plus proches d'un de ses points : ceux
 * qui n'en sont jamais plus loin que le meilleur au pire
 */
interface PathIndex {
  dx: Float64Array;
  dz: Float64Array;
  l2: Float64Array;
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  cells: (Int32Array | undefined)[];
}

const PATH_CELL = 0.2;
/** La grille s'étend jusque-là autour du chemin ; au-delà, on cherche sur tout le chemin */
const PATH_MARGIN = 2;
const pathIndexes = new WeakMap<object, PathIndex>();

function pathIndex(pts: Pt[], key: object): PathIndex {
  let ix = pathIndexes.get(key);
  if (ix) return ix;
  const n = pts.length;
  const dx = new Float64Array(n);
  const dz = new Float64Array(n);
  const l2 = new Float64Array(n);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    z0 = Math.min(z0, p[1]);
    x1 = Math.max(x1, p[0]);
    z1 = Math.max(z1, p[1]);
  }
  for (let i = 1; i < n; i++) {
    dx[i] = pts[i]![0] - pts[i - 1]![0];
    dz[i] = pts[i]![1] - pts[i - 1]![1];
    l2[i] = dx[i]! * dx[i]! + dz[i]! * dz[i]!;
  }
  x0 -= PATH_MARGIN;
  z0 -= PATH_MARGIN;
  const nx = n > 1 ? Math.ceil((x1 + PATH_MARGIN - x0) / PATH_CELL) : 0;
  const nz = n > 1 ? Math.ceil((z1 + PATH_MARGIN - z0) / PATH_CELL) : 0;
  ix = { dx, dz, l2, x0, z0, nx, nz, cells: new Array(nx * nz) };
  pathIndexes.set(key, ix);
  return ix;
}

/** Le carré de la distance d'un point au segment ab */
function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  const qx = ax + dx * t - px;
  const qz = az + dz * t - pz;
  return qx * qx + qz * qz;
}

/** Les segments qui peuvent être les plus proches d'un point de la maille (x0, z0)–(x1, z1) */
function cellCandidates(pts: Pt[], x0: number, z0: number, x1: number, z1: number): Int32Array {
  const n = pts.length;
  const near = new Float64Array(n);
  let worst = Infinity;
  const corners: Pt[] = [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ];
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    // Au pire : un coin (la distance à un segment est convexe, son maximum sur la maille est à un coin)
    let far = 0;
    for (const c of corners) far = Math.max(far, segDist2(c[0], c[1], a[0], a[1], b[0], b[1]));
    worst = Math.min(worst, far);
    // Au mieux : zéro si le segment touche la maille, sinon la plus courte entre leurs bords
    const inside = (p: Pt) => p[0] >= x0 && p[0] <= x1 && p[1] >= z0 && p[1] <= z1;
    if (inside(a) || inside(b) || crossesBox(a, b, x0, z0, x1, z1)) near[i] = 0;
    else {
      let d = Infinity;
      for (const c of corners) d = Math.min(d, segDist2(c[0], c[1], a[0], a[1], b[0], b[1]));
      for (const p of [a, b]) {
        const qx = clamp(p[0], x0, x1) - p[0];
        const qz = clamp(p[1], z0, z1) - p[1];
        d = Math.min(d, qx * qx + qz * qz);
      }
      near[i] = d;
    }
  }
  // Une petite marge : on garde en cas de doute (garder un segment de trop ne change pas la réponse)
  const keep: number[] = [];
  for (let i = 1; i < n; i++) if (near[i]! <= worst * (1 + 1e-9) + 1e-12) keep.push(i);
  return Int32Array.from(keep);
}

/** Le segment ab coupe-t-il un bord de la maille ? */
function crossesBox(a: Pt, b: Pt, x0: number, z0: number, x1: number, z1: number): boolean {
  const edges: [Pt, Pt][] = [
    [
      [x0, z0],
      [x1, z0],
    ],
    [
      [x1, z0],
      [x1, z1],
    ],
    [
      [x1, z1],
      [x0, z1],
    ],
    [
      [x0, z1],
      [x0, z0],
    ],
  ];
  const cross = (o: Pt, p: Pt, q: Pt) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  for (const [c, d] of edges) {
    const d1 = cross(c, d, a);
    const d2 = cross(c, d, b);
    const d3 = cross(a, b, c);
    const d4 = cross(a, b, d);
    if (d1 * d2 <= 0 && d3 * d4 <= 0) return true;
  }
  return false;
}

/**
 * La hauteur d'un chemin : celle du segment le plus proche. Près du chemin, seulement parmi les segments qui peuvent
 * l'être (la liste de la maille) ; loin, sur tout le chemin. Les calculs sont ceux de la boucle complète, dans le même
 * ordre et avec la même règle à égalité (le premier segment) : la hauteur est la même au bit près
 */
function pathHeight(spec: { pts: Pt[]; hs: number[]; e?: Ease }, x: number, z: number): number {
  const pts = spec.pts;
  const ix = pathIndex(pts, spec);
  let best = Infinity;
  let bestI = 0;
  let bestT = 0;
  const seg = (i: number) => {
    const a = pts[i - 1]!;
    const dx = ix.dx[i]!;
    const dz = ix.dz[i]!;
    const l2 = ix.l2[i]!;
    const t = l2 > 0 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1) : 0;
    const qx = a[0] + dx * t - x;
    const qz = a[1] + dz * t - z;
    const d2 = qx * qx + qz * qz;
    if (d2 < best) {
      best = d2;
      bestI = i;
      bestT = t;
    }
  };
  const ci = Math.floor((x - ix.x0) / PATH_CELL);
  const cj = Math.floor((z - ix.z0) / PATH_CELL);
  if (ci >= 0 && cj >= 0 && ci < ix.nx && cj < ix.nz) {
    const k = cj * ix.nx + ci;
    let list = ix.cells[k];
    if (!list) {
      const cx = ix.x0 + ci * PATH_CELL;
      const cz = ix.z0 + cj * PATH_CELL;
      list = ix.cells[k] = cellCandidates(pts, cx, cz, cx + PATH_CELL, cz + PATH_CELL);
    }
    for (const i of list) seg(i);
  } else for (let i = 1; i < pts.length; i++) seg(i);
  const h0 = spec.hs[bestI - 1] ?? spec.hs[0] ?? 0;
  const h1 = spec.hs[bestI] ?? h0;
  return h0 + (h1 - h0) * ease(bestT, spec.e);
}

/** La hauteur d'un chemin, segment par segment sur tout le chemin (la référence, pour les tests) */
export function pathHeightSlow(spec: { pts: Pt[]; hs: number[]; e?: Ease }, x: number, z: number): number {
  const pts = spec.pts;
  let best = Infinity;
  let bestI = 0;
  let bestT = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1) : 0;
    const qx = a[0] + dx * t - x;
    const qz = a[1] + dz * t - z;
    const d2 = qx * qx + qz * qz;
    if (d2 < best) {
      best = d2;
      bestI = i;
      bestT = t;
    }
  }
  const h0 = spec.hs[bestI - 1] ?? spec.hs[0] ?? 0;
  const h1 = spec.hs[bestI] ?? h0;
  return h0 + (h1 - h0) * ease(bestT, spec.e);
}

/** La distance signée du point à la coupe i (la droite qui passe par left[i] et right[i]) */
function cutSide(left: Pt[], right: Pt[], i: number, x: number, z: number): number {
  const l = left[i]!;
  const r = right[i]!;
  const dx = r[0] - l[0];
  const dz = r[1] - l[1];
  return (dx * (z - l[1]) - dz * (x - l[0])) / (Math.hypot(dx, dz) || 1);
}

/**
 * Ce qu'on prépare une fois par allée pour trouver vite sa hauteur : la direction de chaque coupe, le milieu de chaque
 * section, et une grille de ces milieux. Les nombres sont calculés exactement comme dans `cutSide` et la boucle
 * d'origine : la hauteur trouvée est la même, au bit près (la physique doit être identique partout).
 */
interface StripIndex {
  dx: Float64Array;
  dz: Float64Array;
  len: Float64Array;
  cx: Float64Array;
  cz: Float64Array;
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  cells: Int32Array[];
}

/** Le rayon (et la maille de la grille) autour du point où l'on cherche d'abord la section */
const STRIP_R = 1.2;
const stripIndexes = new WeakMap<object, StripIndex>();

function stripIndex(spec: { left: Pt[]; right: Pt[] }): StripIndex {
  let ix = stripIndexes.get(spec);
  if (ix) return ix;
  const { left, right } = spec;
  const n = left.length;
  const dx = new Float64Array(n);
  const dz = new Float64Array(n);
  const len = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    dx[i] = right[i]![0] - left[i]![0];
    dz[i] = right[i]![1] - left[i]![1];
    len[i] = Math.hypot(dx[i]!, dz[i]!) || 1;
  }
  const cx = new Float64Array(Math.max(0, n - 1));
  const cz = new Float64Array(Math.max(0, n - 1));
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < n - 1; i++) {
    cx[i] = (left[i]![0] + right[i]![0] + left[i + 1]![0] + right[i + 1]![0]) / 4;
    cz[i] = (left[i]![1] + right[i]![1] + left[i + 1]![1] + right[i + 1]![1]) / 4;
    x0 = Math.min(x0, cx[i]!);
    z0 = Math.min(z0, cz[i]!);
    x1 = Math.max(x1, cx[i]!);
    z1 = Math.max(z1, cz[i]!);
  }
  const nx = n > 1 ? Math.floor((x1 - x0) / STRIP_R) + 1 : 0;
  const nz = n > 1 ? Math.floor((z1 - z0) / STRIP_R) + 1 : 0;
  const lists: number[][] = Array.from({ length: nx * nz }, () => []);
  for (let i = 0; i < n - 1; i++) lists[Math.floor((cz[i]! - z0) / STRIP_R) * nx + Math.floor((cx[i]! - x0) / STRIP_R)]!.push(i);
  ix = { dx, dz, len, cx, cz, x0, z0, nx, nz, cells: lists.map((l) => Int32Array.from(l)) };
  stripIndexes.set(spec, ix);
  return ix;
}

function stripHeight(spec: { left: Pt[]; right: Pt[]; hs: number[] }, x: number, z: number): number {
  const { left, right, hs } = spec;
  const n = left.length;
  const ix = stripIndex(spec);
  const side = (i: number) => (ix.dx[i]! * (z - left[i]![1]) - ix.dz[i]! * (x - left[i]![0])) / ix.len[i]!;
  let best = -1;
  let bestD = Infinity;
  let bestU = 0;
  // D'abord les sections dont le milieu est à moins de STRIP_R : si l'une contient le point, aucune plus loin ne peut
  // être plus proche. À égalité, la première dans l'ordre de l'allée, comme dans la boucle complète
  const ci = Math.floor((x - ix.x0) / STRIP_R);
  const cj = Math.floor((z - ix.z0) / STRIP_R);
  for (let j = cj - 1; j <= cj + 1; j++) {
    if (j < 0 || j >= ix.nz) continue;
    for (let k = ci - 1; k <= ci + 1; k++) {
      if (k < 0 || k >= ix.nx) continue;
      for (const i of ix.cells[j * ix.nx + k]!) {
        const d = (x - ix.cx[i]!) ** 2 + (z - ix.cz[i]!) ** 2;
        if (d > STRIP_R * STRIP_R || d > bestD || (d === bestD && i > best)) continue;
        const prev = side(i);
        const next = side(i + 1);
        if (prev * next <= 0 && prev !== next) {
          bestD = d;
          best = i;
          bestU = prev / (prev - next);
        }
      }
    }
  }
  if (best < 0) {
    // Rien de proche : toute l'allée, section par section
    let prev = side(0);
    for (let i = 0; i < n - 1; i++) {
      const next = side(i + 1);
      if (prev * next <= 0 && prev !== next) {
        // Entre ces deux coupes : la plus proche, si l'allée tourne au point de repasser par là
        const d = (x - ix.cx[i]!) ** 2 + (z - ix.cz[i]!) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
          bestU = prev / (prev - next);
        }
      }
      prev = next;
    }
  }
  if (best < 0) {
    // Au-delà des bouts : la hauteur du bout le plus proche
    const d0 = (x - (left[0]![0] + right[0]![0]) / 2) ** 2 + (z - (left[0]![1] + right[0]![1]) / 2) ** 2;
    const d1 = (x - (left[n - 1]![0] + right[n - 1]![0]) / 2) ** 2 + (z - (left[n - 1]![1] + right[n - 1]![1]) / 2) ** 2;
    return d0 <= d1 ? hs[0]! : hs[n - 1]!;
  }
  return hs[best]! + (hs[best + 1]! - hs[best]!) * bestU;
}

/** La hauteur d'une allée en coupes, calculée section par section sur toute l'allée (la référence, pour les tests) */
export function stripHeightSlow(spec: { left: Pt[]; right: Pt[]; hs: number[] }, x: number, z: number): number {
  const { left, right, hs } = spec;
  const n = left.length;
  let best = -1;
  let bestD = Infinity;
  let bestU = 0;
  let prev = cutSide(left, right, 0, x, z);
  for (let i = 0; i < n - 1; i++) {
    const next = cutSide(left, right, i + 1, x, z);
    if (prev * next <= 0 && prev !== next) {
      const cx = (left[i]![0] + right[i]![0] + left[i + 1]![0] + right[i + 1]![0]) / 4;
      const cz = (left[i]![1] + right[i]![1] + left[i + 1]![1] + right[i + 1]![1]) / 4;
      const d = (x - cx) ** 2 + (z - cz) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
        bestU = prev / (prev - next);
      }
    }
    prev = next;
  }
  if (best < 0) {
    const d0 = (x - (left[0]![0] + right[0]![0]) / 2) ** 2 + (z - (left[0]![1] + right[0]![1]) / 2) ** 2;
    const d1 = (x - (left[n - 1]![0] + right[n - 1]![0]) / 2) ** 2 + (z - (left[n - 1]![1] + right[n - 1]![1]) / 2) ** 2;
    return d0 <= d1 ? hs[0]! : hs[n - 1]!;
  }
  return hs[best]! + (hs[best + 1]! - hs[best]!) * bestU;
}

/** La hauteur ajoutée par les bosses */
export function bumpsHeight(bumps: readonly Bump[] | undefined, x: number, z: number): number {
  if (!bumps) return 0;
  let h = 0;
  for (const b of bumps) {
    const dx = x - b.c[0];
    const dz = z - b.c[1];
    const d2 = dx * dx + dz * dz;
    if (d2 >= b.r * b.r) continue;
    const c = Math.cos((Math.sqrt(d2) / b.r) * (Math.PI / 2));
    h += b.a * c * c;
  }
  return h;
}

/** Le symétrique d'une forme (la droite et la gauche échangées) */
export function mirrorSpec(spec: HeightSpec): HeightSpec {
  if (typeof spec === "number") return spec;
  const m = (p: Pt): Pt => [-p[0], p[1]];
  switch (spec.k) {
    case "plane":
      return { ...spec, at: m(spec.at), g: [-spec.g[0], spec.g[1]] };
    case "ramp":
      return { ...spec, a: m(spec.a), b: m(spec.b) };
    case "radial":
      return { ...spec, c: m(spec.c) };
    case "wave":
      return { ...spec, at: m(spec.at), dir: [-spec.dir[0], spec.dir[1]] };
    case "path":
      return { ...spec, pts: spec.pts.map(m) };
    case "strip":
      return { ...spec, left: spec.left.map(m), right: spec.right.map(m) };
    case "max":
    case "sum":
      return { ...spec, of: spec.of.map(mirrorSpec) };
  }
}
