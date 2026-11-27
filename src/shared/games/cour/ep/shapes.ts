// Les formes gravées dans les sablés : une goutte, une lune, un cœur, une étoile, de la plus facile à la plus traîtresse.
// Chaque forme est un contour fermé, dans le repère du biscuit (son rayon vaut 1, le centre en 0) ; il est rééchantillonné
// en points également espacés, et chaque point sait s'il est dans un angle (on y casse plus facilement).

export type ShapeId = "goutte" | "lune" | "coeur" | "etoile";
export const SHAPES: readonly ShapeId[] = ["goutte", "lune", "coeur", "etoile"];
export const SHAPE_NAMES: Record<ShapeId, string> = { goutte: "la goutte", lune: "la lune", coeur: "le cœur", etoile: "l'étoile" };
/** La difficulté : ce qui multiplie la fragilité du biscuit pour les bots */
export const SHAPE_RISK: Record<ShapeId, number> = { goutte: 0.6, lune: 1, coeur: 1.2, etoile: 1.8 };

/** Le nombre de points du contour */
export const OUTLINE_N = 240;

export interface Outline {
  /** x, y alternés */
  pts: Float64Array;
  /** Dans un angle : de 0 (droit) à 1 (pointe) */
  corner: Float64Array;
  length: number;
}

type P = [number, number];

function rawShape(id: ShapeId): P[] {
  const out: P[] = [];
  const steps = 720;
  if (id === "goutte") {
    for (let k = 0; k < steps; k++) {
      const t = (k / steps) * Math.PI * 2;
      out.push([0.56 * Math.sin(t) * Math.sin(t / 2), 0.66 * Math.cos(t) - 0.08]);
    }
  } else if (id === "coeur") {
    for (let k = 0; k < steps; k++) {
      const t = (k / steps) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      out.push([(x / 17) * 0.66, (y / 17) * 0.66 + 0.06]);
    }
  } else if (id === "etoile") {
    const R = 0.68;
    const r = 0.29;
    const tips: P[] = [];
    for (let k = 0; k < 10; k++) {
      const a = Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 === 0 ? R : r;
      tips.push([rr * Math.cos(a), rr * Math.sin(a) - 0.03]);
    }
    for (let k = 0; k < 10; k++) {
      const a = tips[k]!;
      const b = tips[(k + 1) % 10]!;
      for (let j = 0; j < 72; j++) out.push([a[0] + ((b[0] - a[0]) * j) / 72, a[1] + ((b[1] - a[1]) * j) / 72]);
    }
  } else {
    // La lune : le grand disque moins un disque décalé ; le bord extérieur, puis le bord intérieur en revenant
    const r1 = 0.64;
    const r2 = 0.53;
    const d = 0.3;
    const xi = (d * d + r1 * r1 - r2 * r2) / (2 * d);
    const yi = Math.sqrt(r1 * r1 - xi * xi);
    const a1 = Math.atan2(yi, xi);
    const b1 = Math.atan2(yi, xi - d);
    for (let k = 0; k <= 400; k++) {
      const a = a1 + ((2 * Math.PI - 2 * a1) * k) / 400;
      out.push([r1 * Math.cos(a) - 0.06, r1 * Math.sin(a)]);
    }
    for (let k = 1; k < 320; k++) {
      const a = 2 * Math.PI - b1 - ((2 * Math.PI - 2 * b1) * k) / 320;
      out.push([d + r2 * Math.cos(a) - 0.06, r2 * Math.sin(a)]);
    }
  }
  return out;
}

const cache = new Map<ShapeId, Outline>();

/** Le contour d'une forme, en points également espacés */
export function outline(id: ShapeId): Outline {
  const hit = cache.get(id);
  if (hit) return hit;
  const raw = rawShape(id);
  const n = raw.length;
  const cum: number[] = [0];
  for (let k = 1; k <= n; k++) {
    const a = raw[k - 1]!;
    const b = raw[k % n]!;
    cum.push(cum[k - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[n]!;
  const pts = new Float64Array(OUTLINE_N * 2);
  let j = 0;
  for (let k = 0; k < OUTLINE_N; k++) {
    const want = (k / OUTLINE_N) * length;
    while (cum[j + 1]! < want) j++;
    const a = raw[j]!;
    const b = raw[(j + 1) % n]!;
    const seg = cum[j + 1]! - cum[j]!;
    const u = seg > 0 ? (want - cum[j]!) / seg : 0;
    pts[k * 2] = a[0] + (b[0] - a[0]) * u;
    pts[k * 2 + 1] = a[1] + (b[1] - a[1]) * u;
  }
  // L'angle en chaque point : le changement de direction sur quelques points de part et d'autre
  const corner = new Float64Array(OUTLINE_N);
  const at = (k: number): P => {
    const m = ((k % OUTLINE_N) + OUTLINE_N) % OUTLINE_N;
    return [pts[m * 2]!, pts[m * 2 + 1]!];
  };
  for (let k = 0; k < OUTLINE_N; k++) {
    const a = at(k - 3);
    const b = at(k);
    const c = at(k + 3);
    const u: P = [b[0] - a[0], b[1] - a[1]];
    const v: P = [c[0] - b[0], c[1] - b[1]];
    const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) || 1);
    corner[k] = Math.max(0, Math.min(1, (1 - cos) * 1.6));
  }
  // Un angle se fait sentir un peu autour de lui
  const spread = new Float64Array(OUTLINE_N);
  for (let k = 0; k < OUTLINE_N; k++) {
    let best = 0;
    for (let d = -4; d <= 4; d++) best = Math.max(best, corner[(k + d + OUTLINE_N) % OUTLINE_N]! * (1 - Math.abs(d) / 6));
    spread[k] = best;
  }
  const o = { pts, corner: spread, length };
  cache.set(id, o);
  return o;
}

/** Le point du contour le plus proche, et sa distance */
export function nearest(o: Outline, x: number, y: number): { k: number; d: number } {
  let best = Infinity;
  let bk = 0;
  for (let k = 0; k < OUTLINE_N; k++) {
    const dx = o.pts[k * 2]! - x;
    const dy = o.pts[k * 2 + 1]! - y;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      bk = k;
    }
  }
  return { k: bk, d: Math.sqrt(best) };
}
