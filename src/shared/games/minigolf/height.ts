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

function pathHeight(spec: { pts: Pt[]; hs: number[]; e?: Ease }, x: number, z: number): number {
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

function stripHeight(spec: { left: Pt[]; right: Pt[]; hs: number[] }, x: number, z: number): number {
  const { left, right, hs } = spec;
  const n = left.length;
  let best = -1;
  let bestD = Infinity;
  let bestU = 0;
  let prev = cutSide(left, right, 0, x, z);
  for (let i = 0; i < n - 1; i++) {
    const next = cutSide(left, right, i + 1, x, z);
    if (prev * next <= 0 && prev !== next) {
      // Entre ces deux coupes : la plus proche, si l'allée tourne au point de repasser par là
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
    // Au-delà des bouts : la hauteur du bout le plus proche
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
