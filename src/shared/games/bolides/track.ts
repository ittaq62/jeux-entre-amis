// Les circuits de Bolides : une route fermée qui passe par des points de contrôle, lissée en courbe, puis
// découpée en échantillons réguliers. Tout le reste (physique, bots, objets, dessin) s'appuie sur ces échantillons :
// où est-on sur la route, de combien s'en écarte-t-on, à quelle distance du départ.
//
// Repère : x et z au sol, y vers le haut, en mètres. Un cap h regarde vers (sin h, cos h) ; la droite du pilote
// est (-cos h, sin h). Tourner à droite fait donc baisser le cap.

export type TrackId = "port" | "vignes" | "col";
export type Theme = "port" | "vignes" | "col";

/**
 * Le tracé, comme le lirait un pilote : une ligne droite de tant de mètres, un virage à gauche ou à droite de tant
 * de degrés sur tel rayon. Il part de la ligne d'arrivée vers +x et doit faire un tour complet.
 */
export type Leg = ["S", number] | ["L" | "R", number, number];

export interface TrackDef {
  id: TrackId;
  name: string;
  /** Ce qu'on en dit dans le salon */
  blurb: string;
  theme: Theme;
  layout: Leg[];
  /**
   * Où est la ligne d'arrivée sur le tracé, en mètres depuis son début (négatif : avant sa fin) : au milieu d'une
   * ligne droite, pour que toute la grille de départ y tienne
   */
  start: number;
  /** Le relief : la hauteur de la route à différents endroits du tour (part du tour, hauteur en mètres) */
  hills: [number, number][];
  /** La largeur de la route */
  width: number;
  /** Les rangées de caisses, en part du tour (0 : la ligne d'arrivée) */
  boxes: number[];
  /** Les accélérateurs au sol : part du tour, et décalage depuis le milieu en part de la demi-largeur (+ : à droite) */
  boosts: [number, number][];
}

export const TRACK_IDS: TrackId[] = ["port", "vignes", "col"];

export const TRACKS: Record<TrackId, TrackDef> = {
  port: {
    id: "port",
    name: "Le Port",
    blurb: "Le long des quais, entre les grues et les bateaux : une longue ligne droite, une épingle serrée et une chicane.",
    theme: "port",
    width: 14,
    start: 50,
    layout: [
      ["S", 110],
      ["R", 90, 35],
      ["S", 30],
      ["R", 45, 25],
      ["L", 45, 25],
      ["S", 25],
      ["R", 180, 18],
      ["S", 20],
      ["L", 90, 25],
      ["S", 40],
      ["R", 30, 22],
      ["L", 60, 22],
      ["R", 30, 22],
      ["S", 30],
      ["R", 90, 30],
      ["S", 20],
      ["R", 90, 30],
    ],
    hills: [[0, 0]],
    boxes: [0.16, 0.5, 0.79],
    boosts: [
      [0.04, -0.35],
      [0.4, 0.3],
      [0.94, 0.25],
    ],
  },
  vignes: {
    id: "vignes",
    name: "Les Vignes",
    blurb: "Des virages en lacet entre les rangs de vigne, une montée vers le château et une longue descente.",
    theme: "vignes",
    width: 13,
    start: -80,
    layout: [
      ["S", 80],
      ["L", 70, 40],
      ["S", 30],
      ["R", 50, 30],
      ["L", 100, 30],
      ["S", 40],
      ["R", 60, 25],
      ["L", 120, 22],
      ["S", 50],
      ["L", 60, 45],
      ["R", 40, 30],
      ["L", 80, 35],
      ["S", 40],
      ["L", 80, 40],
    ],
    hills: [
      [0, 0],
      [0.2, 2],
      [0.42, 10],
      [0.55, 11],
      [0.8, 1],
    ],
    boxes: [0.13, 0.42, 0.72],
    boosts: [
      [0.06, 0.3],
      [0.3, -0.3],
      [0.57, 0.35],
      [0.86, -0.25],
    ],
  },
  col: {
    id: "col",
    name: "Le Col",
    blurb: "Une route de montagne enneigée, plus étroite, qui grimpe en épingles entre les sapins avant de plonger vers le village.",
    theme: "col",
    width: 12,
    start: 45,
    layout: [
      ["S", 90],
      ["R", 70, 30],
      ["S", 40],
      ["L", 160, 18],
      ["S", 40],
      ["R", 160, 18],
      ["S", 50],
      ["R", 60, 30],
      ["S", 60],
      ["R", 90, 28],
      ["S", 40],
      ["L", 40, 40],
      ["R", 80, 35],
      ["S", 30],
      ["R", 100, 30],
    ],
    hills: [
      [0, 0],
      [0.12, 1],
      [0.5, 16],
      [0.6, 16],
      [0.9, 1],
    ],
    boxes: [0.14, 0.45, 0.74],
    boosts: [
      [0.05, -0.3],
      [0.33, 0.25],
      [0.62, -0.3],
      [0.9, 0.3],
    ],
  },
};

/** L'écart entre deux échantillons de la route, en mètres */
export const STEP = 2;
/** La largeur du vibreur, de part et d'autre de la route */
export const CURB = 1.2;
/** L'herbe entre la route et le mur */
export const VERGE = 7;

export interface Track {
  def: TrackDef;
  /** La longueur d'un tour */
  length: number;
  n: number;
  /** Le milieu de la route, sa hauteur, sa direction (unitaire) */
  x: Float64Array;
  z: Float64Array;
  y: Float64Array;
  tx: Float64Array;
  tz: Float64Array;
  /** La courbure (radians par mètre, + : la route tourne à gauche) */
  bend: Float64Array;
  half: number;
  /** Au-delà, l'herbe ; au-delà encore, le mur */
  roadEdge: number;
  wall: number;
  boxes: BoxSpot[];
  boosts: BoostPad[];
}

export interface BoxSpot {
  /** Le numéro de la caisse sur le circuit */
  index: number;
  x: number;
  z: number;
  s: number;
  d: number;
}

export interface BoostPad {
  s: number;
  d: number;
  /** Sa longueur le long de la route et sa demi-largeur */
  length: number;
  halfWidth: number;
}

type P3 = [number, number, number];

/** La courbe de Catmull-Rom centripète entre p1 et p2 (t de 0 à 1) */
function catmull(p0: P3, p1: P3, p2: P3, p3: P3, t: number): P3 {
  const knot = (a: P3, b: P3, ti: number) => ti + Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) + 1e-6;
  const t0 = 0;
  const t1 = knot(p0, p1, t0);
  const t2 = knot(p1, p2, t1);
  const t3 = knot(p2, p3, t2);
  const u = t1 + (t2 - t1) * t;
  const mix = (a: P3, b: P3, ta: number, tb: number): P3 => {
    const wa = (tb - u) / (tb - ta);
    const wb = (u - ta) / (tb - ta);
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

const built = new Map<TrackId, Track>();

/** Le circuit prêt à servir (calculé une fois) */
export function getTrack(id: TrackId): Track {
  let t = built.get(id);
  if (!t) {
    t = buildTrack(TRACKS[id]);
    built.set(id, t);
  }
  return t;
}

/** La hauteur de la route à cette part du tour : on passe en douceur d'un repère du relief au suivant */
export function hillAt(def: TrackDef, frac: number): number {
  const keys = [...def.hills].sort((a, b) => a[0] - b[0]);
  if (keys.length === 1) return keys[0]![1];
  const f = ((frac % 1) + 1) % 1;
  for (let k = 0; k < keys.length; k++) {
    const [fa, ya] = keys[k]!;
    const [fb0, yb] = keys[(k + 1) % keys.length]!;
    const fb = k + 1 < keys.length ? fb0 : fb0 + 1;
    const ff = f < fa ? f + 1 : f;
    if (ff >= fa && ff <= fb) {
      const u = (ff - fa) / Math.max(1e-9, fb - fa);
      return ya + (yb - ya) * u * u * (3 - 2 * u);
    }
  }
  return keys[0]![1];
}

/** Où mène le tracé, et dans quelle direction part chaque ligne droite */
function walk(layout: Leg[]): { x: number; z: number; dirs: [number, number][] } {
  let x = 0;
  let z = 0;
  let h = Math.PI / 2;
  const dirs: [number, number][] = [];
  for (const leg of layout) {
    if (leg[0] === "S") {
      dirs.push([Math.sin(h), Math.cos(h)]);
      x += Math.sin(h) * leg[1];
      z += Math.cos(h) * leg[1];
    } else {
      const [dir, deg, r] = leg;
      const a = ((dir === "L" ? 1 : -1) * deg * Math.PI) / 180;
      // La corde de l'arc, dans la direction du milieu du virage
      const chord = 2 * r * Math.sin(Math.abs(a) / 2);
      x += Math.sin(h + a / 2) * chord;
      z += Math.cos(h + a / 2) * chord;
      h += a;
    }
  }
  return { x, z, dirs };
}

/**
 * Le tracé refermé : deux lignes droites (pas parallèles) s'allongent ou raccourcissent juste assez pour que la
 * route revienne exactement à son point de départ, en changeant le moins possible.
 */
export function closeLayout(layout: Leg[]): Leg[] {
  const { x, z, dirs } = walk(layout);
  const straights = layout.flatMap((leg, i) => (leg[0] === "S" ? [i] : []));
  let best: { i: number; j: number; a: number; b: number } | null = null;
  for (let p = 0; p < straights.length; p++) {
    for (let q = p + 1; q < straights.length; q++) {
      const [ux, uz] = dirs[p]!;
      const [vx, vz] = dirs[q]!;
      const det = ux * vz - uz * vx;
      if (Math.abs(det) < 0.3) continue;
      // a·u + b·v = -(x, z)
      const a = (-x * vz + z * vx) / det;
      const b = (-z * ux + x * uz) / det;
      const i = straights[p]!;
      const j = straights[q]!;
      const li = (layout[i] as ["S", number])[1] + a;
      const lj = (layout[j] as ["S", number])[1] + b;
      if (li < 12 || lj < 12) continue;
      if (!best || Math.max(Math.abs(a), Math.abs(b)) < Math.max(Math.abs(best.a), Math.abs(best.b))) best = { i, j, a, b };
    }
  }
  if (!best) return layout;
  return layout.map((leg, k): Leg => {
    if (k === best.i) return ["S", (leg as ["S", number])[1] + best.a];
    if (k === best.j) return ["S", (leg as ["S", number])[1] + best.b];
    return leg;
  });
}

/**
 * Le tracé déroulé en points tous les 3 m environ, refermé (voir `closeLayout`) ; ce qui reste d'écart (`gap`,
 * quelques centimètres) est réparti le long du tour. `turn` : le total des virages, en degrés (±360 attendus).
 */
export function traceLayout(def: TrackDef): { points: [number, number, number][]; gap: number; turn: number } {
  let x = 0;
  let z = 0;
  let h = Math.PI / 2;
  const flat: [number, number][] = [[0, 0]];
  for (const leg of closeLayout(def.layout)) {
    if (leg[0] === "S") {
      const n = Math.max(1, Math.round(leg[1] / 3));
      for (let k = 0; k < n; k++) {
        x += (Math.sin(h) * leg[1]) / n;
        z += (Math.cos(h) * leg[1]) / n;
        flat.push([x, z]);
      }
    } else {
      const [dir, deg, r] = leg;
      const total = (deg * Math.PI) / 180;
      const n = Math.max(2, Math.round((total * r) / 3));
      // À gauche, le cap augmente ; on avance par cordes de l'arc
      const turn = ((dir === "L" ? 1 : -1) * total) / n;
      const chord = 2 * r * Math.sin(total / n / 2);
      for (let k = 0; k < n; k++) {
        h += turn / 2;
        x += Math.sin(h) * chord;
        z += Math.cos(h) * chord;
        h += turn / 2;
        flat.push([x, z]);
      }
    }
  }
  const gap = Math.hypot(x, z);
  const turn = ((h - Math.PI / 2) * 180) / Math.PI;
  flat.pop();
  const cum = [0];
  for (let i = 1; i < flat.length; i++) cum.push(cum[i - 1]! + Math.hypot(flat[i]![0] - flat[i - 1]![0], flat[i]![1] - flat[i - 1]![1]));
  const total = cum[cum.length - 1]! + Math.hypot(flat[0]![0] - x, flat[0]![1] - z);
  const points = flat.map(([px, pz], i): [number, number, number] => {
    const f = cum[i]! / total;
    return [px - x * f, pz - z * f, hillAt(def, f)];
  });
  return { points, gap, turn };
}

export function buildTrack(def: TrackDef): Track {
  // Les points sont donnés en (x, z, y) : on lisse en (x, y, z)
  const pts: P3[] = traceLayout(def).points.map(([x, z, y]) => [x, y, z]);
  const m = pts.length;
  const dense: P3[] = [];
  const SUB = 6;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % m]!;
    const p3 = pts[(i + 2) % m]!;
    for (let k = 0; k < SUB; k++) dense.push(catmull(p0, p1, p2, p3, k / SUB));
  }
  // La longueur au sol, puis des échantillons tous les STEP mètres
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1]!;
    const b = dense[i % dense.length]!;
    cum.push(cum[i - 1]! + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  const total = cum[dense.length]!;
  const n = Math.round(total / STEP);
  const step = total / n;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    while (cum[j + 1]! < s) j++;
    const a = dense[j]!;
    const b = dense[(j + 1) % dense.length]!;
    const f = (s - cum[j]!) / Math.max(1e-9, cum[j + 1]! - cum[j]!);
    x[i] = a[0] + (b[0] - a[0]) * f;
    y[i] = a[1] + (b[1] - a[1]) * f;
    z[i] = a[2] + (b[2] - a[2]) * f;
  }
  // La ligne d'arrivée devient le premier échantillon
  const shift = ((Math.round(def.start / step) % n) + n) % n;
  for (const arr of [x, y, z]) {
    const copy = arr.slice();
    for (let i = 0; i < n; i++) arr[i] = copy[(i + shift) % n]!;
  }
  const tx = new Float64Array(n);
  const tz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const dx = x[b]! - x[a]!;
    const dz = z[b]! - z[a]!;
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l;
    tz[i] = dz / l;
  }
  const bend = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const h1 = Math.atan2(tx[a]!, tz[a]!);
    const h2 = Math.atan2(tx[b]!, tz[b]!);
    bend[i] = wrapAngle(h2 - h1) / (2 * step);
  }
  const half = def.width / 2;
  const track: Track = {
    def,
    length: total,
    n,
    x,
    z,
    y,
    tx,
    tz,
    bend,
    half,
    roadEdge: half + CURB,
    wall: half + CURB + VERGE,
    boxes: [],
    boosts: [],
  };
  // Les caisses : quatre par rangée, en travers de la route
  let index = 0;
  for (const frac of def.boxes) {
    for (const lane of [-0.62, -0.21, 0.21, 0.62]) {
      const s = frac * total;
      const p = pointAt(track, s, lane * half);
      track.boxes.push({ index: index++, x: p.x, z: p.z, s, d: lane * half });
    }
  }
  track.boosts = def.boosts.map(([frac, lane]) => ({ s: frac * total, d: lane * half, length: 7, halfWidth: 1.9 }));
  return track;
}

/** Un angle ramené entre -π et π */
export function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

/** Une distance le long du tour ramenée entre 0 et la longueur du tour */
export function wrapS(t: Track, s: number): number {
  return ((s % t.length) + t.length) % t.length;
}

/** L'écart (signé, le plus court) de s1 à s2 le long du tour */
export function deltaS(t: Track, s1: number, s2: number): number {
  const d = wrapS(t, s2 - s1);
  return d > t.length / 2 ? d - t.length : d;
}

/** Le point de la route à la distance s du départ, décalé de d vers la droite, et la direction de la route */
export function pointAt(t: Track, s: number, d = 0): { x: number; z: number; y: number; tx: number; tz: number } {
  const u = wrapS(t, s) / (t.length / t.n);
  const i = Math.floor(u) % t.n;
  const k = (i + 1) % t.n;
  const f = u - Math.floor(u);
  const tx = t.tx[i]! + (t.tx[k]! - t.tx[i]!) * f;
  const tz = t.tz[i]! + (t.tz[k]! - t.tz[i]!) * f;
  const l = Math.hypot(tx, tz) || 1;
  const ux = tx / l;
  const uz = tz / l;
  // La droite de la route : (-tz, tx)
  return {
    x: t.x[i]! + (t.x[k]! - t.x[i]!) * f - uz * d,
    z: t.z[i]! + (t.z[k]! - t.z[i]!) * f + ux * d,
    y: t.y[i]! + (t.y[k]! - t.y[i]!) * f,
    tx: ux,
    tz: uz,
  };
}

export interface Located {
  /** L'échantillon le plus proche (à redonner comme indice la fois suivante) */
  i: number;
  /** La distance depuis la ligne d'arrivée, le long de la route */
  s: number;
  /** L'écart au milieu de la route, + à droite */
  d: number;
  /** La hauteur de la route à cet endroit */
  y: number;
}

/**
 * Où est ce point sur la route. `hint` : l'échantillon trouvé la dernière fois, pour ne chercher qu'autour
 * (sinon, tout le circuit est parcouru).
 */
export function locate(t: Track, px: number, pz: number, hint = -1): Located {
  let best = -1;
  let bestD = Infinity;
  const scan = (from: number, to: number) => {
    for (let k = from; k <= to; k++) {
      const i = ((k % t.n) + t.n) % t.n;
      const dx = px - t.x[i]!;
      const dz = pz - t.z[i]!;
      const dd = dx * dx + dz * dz;
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
  };
  if (hint >= 0) scan(hint - 14, hint + 14);
  // Trop loin de l'indice (ou pas d'indice) : on cherche partout
  if (best < 0 || bestD > (t.wall + 6) ** 2) scan(0, t.n - 1);
  // Projeté sur le morceau de route le plus proche, de part ou d'autre de l'échantillon
  const i = best;
  const step = t.length / t.n;
  const along = (px - t.x[i]!) * t.tx[i]! + (pz - t.z[i]!) * t.tz[i]!;
  const d = -(px - t.x[i]!) * t.tz[i]! + (pz - t.z[i]!) * t.tx[i]!;
  const s = wrapS(t, i * step + along);
  const j = along >= 0 ? (i + 1) % t.n : (i - 1 + t.n) % t.n;
  const f = Math.min(1, Math.abs(along) / step);
  return { i, s, d, y: t.y[i]! + (t.y[j]! - t.y[i]!) * f };
}

/** La courbure moyenne de la route sur `ahead` mètres à partir de s (+ : vers la gauche) */
export function bendAhead(t: Track, s: number, ahead: number): number {
  const step = t.length / t.n;
  const from = Math.floor(wrapS(t, s) / step);
  const count = Math.max(1, Math.round(ahead / step));
  let sum = 0;
  for (let k = 0; k < count; k++) sum += t.bend[(from + k) % t.n]!;
  return sum / count;
}

/** Les places sur la grille de départ, derrière la ligne : deux par rangée, en quinconce */
export function gridSlot(t: Track, place: number): { x: number; z: number; h: number; s: number } {
  const row = Math.floor(place / 2);
  const side = place % 2 === 0 ? -1 : 1;
  const s = wrapS(t, -8 - row * 6 - (side > 0 ? 3 : 0));
  const p = pointAt(t, s, side * t.half * 0.42);
  return { x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz), s };
}
