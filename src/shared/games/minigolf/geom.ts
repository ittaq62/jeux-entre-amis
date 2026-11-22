// La géométrie plane du minigolf : des points (x, z) vus de dessus, des polygones, des segments, des chemins épaissis.
// Tout est pur et déterministe : le serveur et les appareils construisent exactement les mêmes trous.

/** Un point vu de dessus : x vers la droite, z vers le bas de l'écran (l'axe des hauteurs est y) */
export type Pt = readonly [number, number];
/** Un point dans l'espace : x, y (la hauteur), z */
export type P3 = readonly [number, number, number];

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Aire signée (positive quand les points tournent de x vers z) */
export function ringArea(ring: readonly Pt[]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
  return s / 2;
}

/** Le point est-il dans l'anneau (règle pair-impair) */
export function inRing(x: number, z: number, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const zi = ring[i]![1];
    const xj = ring[j]![0];
    const zj = ring[j]![1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Dans le polygone (le premier anneau) et hors de ses trous (les suivants) */
export function inRings(x: number, z: number, rings: readonly (readonly Pt[])[]): boolean {
  if (!inRing(x, z, rings[0]!)) return false;
  for (let i = 1; i < rings.length; i++) if (inRing(x, z, rings[i]!)) return false;
  return true;
}

export interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export function boxOf(pts: readonly Pt[], pad = 0): Box {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < z0) z0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > z1) z1 = p[1];
  }
  return { x0: x0 - pad, z0: z0 - pad, x1: x1 + pad, z1: z1 + pad };
}

export function inBox(x: number, z: number, b: Box): boolean {
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

/** Distance au carré d'un point au segment ab, et la position (0..1) du point le plus proche */
export function segClosest(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { d2: number; s: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let s = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const qx = ax + dx * s - px;
  const qz = az + dz * s - pz;
  return { d2: qx * qx + qz * qz, s };
}

// ---------------------------------------------------------------------------
// Formes : tout devient un anneau de points
// ---------------------------------------------------------------------------

/** Un rectangle de centre (cx, cz), de largeur w (selon x) et de longueur l (selon z), tourné de `angle` */
export function rect(cx: number, cz: number, w: number, l: number, angle = 0): Pt[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const hw = w / 2;
  const hl = l / 2;
  const corners: Pt[] = [
    [-hw, -hl],
    [hw, -hl],
    [hw, hl],
    [-hw, hl],
  ];
  return corners.map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c] as Pt);
}

/** Un rectangle par ses coins */
export function box(x0: number, z0: number, x1: number, z1: number): Pt[] {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}

/** Un cercle en n côtés (le premier sommet à l'angle a0) */
export function circle(cx: number, cz: number, r: number, n = 40, a0 = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/** Une ellipse */
export function ellipse(cx: number, cz: number, rx: number, rz: number, n = 40, angle = 0): Pt[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = Math.cos(a) * rx;
    const z = Math.sin(a) * rz;
    out.push([cx + x * c - z * s, cz + x * s + z * c]);
  }
  return out;
}

/** Des points sur un arc de cercle, de a0 à a1 (radians), extrémités comprises */
export function arc(cx: number, cz: number, r: number, a0: number, a1: number, n?: number): Pt[] {
  const steps = n ?? Math.max(2, Math.ceil((Math.abs(a1 - a0) * Math.max(r, 0.5)) / 0.25));
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/**
 * Un bord de rivière (ou de coulée) qui ondule autour de z0, de x0 à x1, un point tous les `step` ; il reste droit au-dessus
 * des intervalles `flat` (là où passent les ponts, où il rejoint une allée) et s'en écarte en douceur
 */
export function wavyEdge(x0: number, x1: number, z0: number, amp: number, phase: number, flat: [number, number][], step = 0.1): Pt[] {
  const xs: number[] = [];
  for (let k = 0; x0 + k * step <= x1 + 1e-9; k++) xs.push(Math.round((x0 + k * step) * 1000) / 1000);
  for (const [a, b] of flat) for (const v of [a, b]) if (v >= x0 && v <= x1 && !xs.some((x) => Math.abs(x - v) < 1e-6)) xs.push(v);
  if (!xs.some((x) => Math.abs(x - x1) < 1e-6)) xs.push(x1);
  xs.sort((a, b) => a - b);
  return xs.map((x) => {
    let m = 1;
    for (const [a, b] of flat) {
      const d = x < a ? a - x : x > b ? x - b : 0;
      m = Math.min(m, d / 0.3);
    }
    m = Math.min(1, m);
    const s = m * m * (3 - 2 * m);
    return [x, z0 + amp * s * (Math.sin(x * 2.3 + phase) * 0.7 + Math.sin(x * 5.1 + phase * 2) * 0.3)] as Pt;
  });
}

/** Les points d'un bord (voir `wavyEdge`) entre x = a et x = b */
export function edgeSpan(edge: readonly Pt[], a: number, b: number): Pt[] {
  return edge.filter((p) => p[0] >= a - 1e-6 && p[0] <= b + 1e-6).map((p) => [p[0], p[1]] as Pt);
}

/** La hauteur z d'un bord au point x (qui doit en être un) */
export function edgeAt(edge: readonly Pt[], x: number): number {
  return edge.find((p) => Math.abs(p[0] - x) < 1e-6)![1];
}

/** Un morceau d'anneau (une allée courbe) entre les rayons r0 et r1, de l'angle a0 à a1 */
export function ringSector(cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, n?: number): Pt[] {
  const steps = n ?? Math.max(2, Math.ceil((Math.abs(a1 - a0) * r1) / 0.25));
  return [...arc(cx, cz, r1, a0, a1, steps), ...arc(cx, cz, r0, a1, a0, steps)];
}

/** Une courbe lisse (Catmull-Rom) qui passe par les points, découpée tous les `step` mètres environ */
export function smooth(points: readonly Pt[], step = 0.25): Pt[] {
  if (points.length < 3) return points.map((p) => [p[0], p[1]] as Pt);
  const out: Pt[] = [];
  const P = (i: number) => points[clamp(i, 0, points.length - 1)]!;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const n = Math.max(1, Math.ceil(dist(p1, p2) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const last = points[points.length - 1]!;
  out.push([last[0], last[1]]);
  return out;
}

/**
 * Les deux bords d'une allée de largeur w qui suit la ligne `pts` (jointures en onglet, bornées) : `left` à gauche
 * dans le sens de la marche, `right` à droite, un point de chaque côté pour chaque point de la ligne.
 */
export function laneSides(pts: readonly Pt[], w: number): { left: Pt[]; right: Pt[] } {
  const hw = w / 2;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    const here = pts[i]!;
    // Les directions des deux segments qui se rejoignent ici
    const d0 = norm2(here[0] - prev[0], here[1] - prev[1]) ?? norm2(next[0] - here[0], next[1] - here[1])!;
    const d1 = norm2(next[0] - here[0], next[1] - here[1]) ?? d0;
    // La normale à gauche de la marche (x vers la droite, z vers le bas : la gauche de (dx, dz) est (dz, -dx))
    const n0: Pt = [d0[1], -d0[0]];
    const n1: Pt = [d1[1], -d1[0]];
    const m = norm2(n0[0] + n1[0], n0[1] + n1[1]) ?? n0;
    const cos = m[0] * n0[0] + m[1] * n0[1];
    const k = hw / Math.max(0.35, cos);
    left.push([here[0] + m[0] * k, here[1] + m[1] * k]);
    right.push([here[0] - m[0] * k, here[1] - m[1] * k]);
  }
  return { left, right };
}

/** Une allée de largeur w le long de la ligne, en un seul polygone */
export function lane(pts: readonly Pt[], w: number): Pt[] {
  const { left, right } = laneSides(pts, w);
  return [...left, ...right.reverse()];
}

function norm2(x: number, z: number): Pt | null {
  const l = Math.hypot(x, z);
  return l > 1e-9 ? [x / l, z / l] : null;
}

/** Longueur d'une ligne brisée */
export function pathLength(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1]!, pts[i]!);
  return s;
}

/** Les morceaux de la ligne entre les abscisses s0 et s1 (en mètres depuis le début), extrémités comprises */
export function subPath(pts: readonly Pt[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = dist(a, b);
    const t0 = l > 0 ? (s0 - acc) / l : 0;
    const t1 = l > 0 ? (s1 - acc) / l : 0;
    if (out.length === 0 && t0 >= 0 && t0 <= 1) out.push(lerpPt(a, b, t0));
    if (out.length > 0) {
      if (t1 <= 1 && t1 >= 0) {
        out.push(lerpPt(a, b, t1));
        return dedupe(out);
      }
      out.push(b);
    }
    acc += l;
  }
  return dedupe(out);
}

function dedupe(pts: Pt[]): Pt[] {
  return pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]!) > 1e-6);
}

/** Le symétrique d'un point par rapport à l'axe z (la droite et la gauche échangées) */
export function mirrorPt(p: Pt): Pt {
  return [-p[0], p[1]];
}

/** Rotation et translation d'un point */
export function place(p: Pt, at: Pt, angle: number): Pt {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [at[0] + p[0] * c - p[1] * s, at[1] + p[0] * s + p[1] * c];
}
