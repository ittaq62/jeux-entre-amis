// Les bots du minigolf. Ils connaissent le chemin jusqu'au trou (une carte des distances qui contourne les bordures,
// les murs et l'eau, et suit les sauts, les tubes et les téléporteurs), puis essaient des coups pour de vrai, avec la
// même physique que tout le monde, et gardent celui qui laisse le moins de coups à jouer. Leur main tremble plus ou
// moins selon le niveau.

import { BALL_R, MATS, tileAt, tileHeight, type Course } from "./course.ts";
import { segClosest } from "./geom.ts";
import { shotSpeed, simulateShot, type PhysOpts, type ShotResult } from "./physics.ts";
import { random, type RngHolder } from "../../rng.ts";

export type BotLevel = "facile" | "moyen" | "fort";
export const BOT_LEVELS: BotLevel[] = ["facile", "moyen", "fort"];

export function isBotLevel(v: unknown): v is BotLevel {
  return v === "facile" || v === "moyen" || v === "fort";
}

// ---------------------------------------------------------------------------
// La carte des distances
// ---------------------------------------------------------------------------

const CELL = 0.12;

export interface Nav {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** Distance jusqu'au trou le plus proche (Infinity : on n'y arrive pas d'ici) */
  dist: Float64Array;
  /** Le sol de chaque case (-1 : pas de sol jouable) */
  tile: Int32Array;
  h: Float64Array;
}

const navCache = new WeakMap<Course, Nav>();

export function navOf(c: Course): Nav {
  let nav = navCache.get(c);
  if (!nav) {
    nav = buildNav(c);
    navCache.set(c, nav);
  }
  return nav;
}

function buildNav(c: Course): Nav {
  const x0 = c.box.x0;
  const z0 = c.box.z0;
  const nx = Math.ceil((c.box.x1 - x0) / CELL);
  const nz = Math.ceil((c.box.z1 - z0) / CELL);
  const N = nx * nz;
  const tile = new Int32Array(N).fill(-1);
  const h = new Float64Array(N);
  const cx = (i: number) => x0 + (i + 0.5) * CELL;
  const cz = (j: number) => z0 + (j + 0.5) * CELL;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = cx(i);
      const z = cz(j);
      const t = tileAt(c, x, z);
      if (t < 0 || c.tiles[t]!.phys.hazard) continue;
      // Trop près d'un poteau : la balle n'y tient pas
      if (c.posts.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + BALL_R * 0.6) ** 2)) continue;
      tile[j * nx + i] = t;
      h[j * nx + i] = tileHeight(c, t, x, z);
    }
  const dist = new Float64Array(N).fill(Infinity);
  // Les passages qui ne suivent pas le sol : sauts annoncés, tubes, téléporteurs (de → vers)
  const jumps: { from: number; to: number; cost: number }[] = [];
  const cellOf = (x: number, z: number) => {
    const i = Math.floor((x - x0) / CELL);
    const j = Math.floor((z - z0) / CELL);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  const addJump = (fx: number, fz: number, tx: number, tz: number, cost: number) => {
    const a = nearestOpen(cellOf(fx, fz));
    const b = nearestOpen(cellOf(tx, tz));
    if (a >= 0 && b >= 0) jumps.push({ from: a, to: b, cost });
  };
  const nearestOpen = (k: number): number => {
    if (k < 0) return -1;
    if (tile[k]! >= 0) return k;
    const i0 = k % nx;
    const j0 = Math.floor(k / nx);
    for (let r = 1; r < 6; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const i = i0 + di;
          const j = j0 + dj;
          if (i >= 0 && j >= 0 && i < nx && j < nz && tile[j * nx + i]! >= 0) return j * nx + i;
        }
    return -1;
  };
  for (const l of c.def.links) addJump(l.from[0], l.from[1], l.to[0], l.to[1], Math.hypot(l.to[0] - l.from[0], l.to[1] - l.from[1]));
  for (const p of c.def.portals) addJump(p.a[0], p.a[1], p.b[0] + Math.cos(p.dir) * 0.4, p.b[1] + Math.sin(p.dir) * 0.4, 0.5);
  for (const r of c.rails) {
    const a = r.def.pts[0]!;
    const z = r.def.pts[r.def.pts.length - 1]!;
    const q = r.def.pts[r.def.pts.length - 2]!;
    const l = Math.hypot(z[0] - q[0], z[2] - q[2]) || 1;
    addJump(a[0], a[2], z[0] + ((z[0] - q[0]) / l) * 0.5, z[2] + ((z[2] - q[2]) / l) * 0.5, r.total * 0.4);
  }
  // Recherche à rebours depuis les trous : on relâche u (d'où l'on vient) quand la balle peut aller de u à v
  const heap = new MinHeap();
  for (const cup of c.cups) {
    const k = nearestOpen(cellOf(cup.x, cup.z));
    if (k >= 0) {
      dist[k] = 0;
      heap.push(k, 0);
    }
  }
  const back = new Map<number, { from: number; cost: number }[]>();
  for (const j of jumps) {
    const list = back.get(j.to);
    if (list) list.push(j);
    else back.set(j.to, [j]);
  }
  const NB = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ] as const;
  while (heap.size > 0) {
    const [v, dv] = heap.pop();
    if (dv > dist[v]!) continue;
    const vi = v % nx;
    const vj = Math.floor(v / nx);
    for (const [di, dj, w] of NB) {
      const i = vi + di;
      const j = vj + dj;
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const u = j * nx + i;
      if (tile[u]! < 0) continue;
      if (blocked(c, cx(i), cz(j), cx(vi), cz(vj), h[u]!, h[v]!)) continue;
      const mat = c.tiles[tile[u]!]!.mat;
      const slow = mat === "sand" || mat === "snow" ? 3 : 1;
      const nd = dv + w * CELL * slow;
      if (nd < dist[u]!) {
        dist[u] = nd;
        heap.push(u, nd);
      }
    }
    for (const j of back.get(v) ?? []) {
      const nd = dv + j.cost;
      if (nd < dist[j.from]!) {
        dist[j.from] = nd;
        heap.push(j.from, nd);
      }
    }
  }
  return { x0, z0, nx, nz, dist, tile, h };
}

/** Un mur coupe-t-il le chemin de a à b ? (On descend une falaise, on ne la monte pas.) */
function blocked(c: Course, ax: number, az: number, bx: number, bz: number, ha: number, hb: number): boolean {
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const cell = (() => {
    const g = c.grid;
    const i = Math.floor((mx - g.x0) / g.size);
    const j = Math.floor((mz - g.z0) / g.size);
    return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : j * g.nx + i;
  })();
  if (cell < 0) return true;
  for (const wi of c.grid.walls[cell]!) {
    const w = c.walls[wi]!;
    if (!segCross(ax, az, bx, bz, w.ax, w.az, w.bx, w.bz, w.t + BALL_R * 0.5)) continue;
    if (w.kind === "cliff" && ha > hb + 0.02) continue;
    return true;
  }
  return false;
}

function segCross(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number, pad: number): boolean {
  const d1 = cross(cx, cz, dx, dz, ax, az);
  const d2 = cross(cx, cz, dx, dz, bx, bz);
  const d3 = cross(ax, az, bx, bz, cx, cz);
  const d4 = cross(ax, az, bx, bz, dx, dz);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  // Le chemin frôle le mur (ou passe par son bout)
  return segClosest(bx, bz, cx, cz, dx, dz).d2 < pad * pad || segClosest(cx, cz, ax, az, bx, bz).d2 < pad * pad;
}

function cross(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  return (bx - ax) * (pz - az) - (bz - az) * (px - ax);
}

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    this.k.push(key);
    this.v.push(val);
    let i = this.k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.v[p]! <= this.v[i]!) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.k[0]!, this.v[0]!];
    const lk = this.k.pop()!;
    const lv = this.v.pop()!;
    if (this.k.length > 0) {
      this.k[0] = lk;
      this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.k.length && this.v[l]! < this.v[m]!) m = l;
        if (r < this.k.length && this.v[r]! < this.v[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.k[a], this.k[b]] = [this.k[b]!, this.k[a]!];
    [this.v[a], this.v[b]] = [this.v[b]!, this.v[a]!];
  }
}

/** La distance au trou depuis ce point (Infinity si on n'y arrive pas) */
export function navDist(nav: Nav, x: number, z: number): number {
  const i = Math.floor((x - nav.x0) / CELL);
  const j = Math.floor((z - nav.z0) / CELL);
  let best = Infinity;
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nav.nx || jj >= nav.nz) continue;
      const d = nav.dist[jj * nav.nx + ii]!;
      if (d === Infinity) continue;
      const ex = x - (nav.x0 + (ii + 0.5) * CELL);
      const ez = z - (nav.z0 + (jj + 0.5) * CELL);
      best = Math.min(best, d + Math.hypot(ex, ez));
    }
  return best;
}

// ---------------------------------------------------------------------------
// Le choix du coup
// ---------------------------------------------------------------------------

const LEVEL = {
  facile: { aim: 0.1, power: 0.2, ring: 8, refine: 2, think: [2200, 4200] },
  moyen: { aim: 0.04, power: 0.085, ring: 12, refine: 6, think: [1500, 3200] },
  fort: { aim: 0.022, power: 0.045, ring: 18, refine: 10, think: [1100, 2600] },
} as const;

/** Combien de temps le bot regarde avant de jouer (ms) */
export function thinkTime(level: BotLevel, rng: RngHolder): number {
  const [a, b] = LEVEL[level].think;
  return a + (b - a) * random(rng);
}

/** Les coups qu'il resterait à jouer, d'après où s'arrête la balle */
function expected(c: Course, nav: Nav, r: ShotResult, fromCost: number): number {
  if (r.outcome === "in") return 0;
  if (r.outcome === "lost") return 1 + fromCost + 0.3;
  const d = navDist(nav, r.x, r.z);
  if (d === Infinity) return fromCost + 1.5;
  const t = tileAt(c, r.x, r.z);
  const sandy = t >= 0 && (c.tiles[t]!.mat === "sand" || c.tiles[t]!.mat === "snow") ? 0.25 : 0;
  // Près du trou : presque toujours un coup ; plus loin, de plus en plus
  return 1 + Math.min(3, Math.max(0, d - 0.5) / 4.5) + sandy;
}

export interface Plan {
  a: number;
  p: number;
  /** Attendre tant de pas avant de frapper (le bon moment pour passer un obstacle qui bouge) */
  wait: number;
}

/** La force pour faire rouler la balle d'environ d mètres sur ce sol */
function powerFor(d: number, roll: number): number {
  const v = Math.sqrt(2 * roll * Math.max(0.05, d));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (shotSpeed(m) < v) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/**
 * Le coup du bot, depuis la balle posée en `from`, au pas `tick` du trou. `budget` borne le nombre de coups essayés.
 */
export function planShot(
  c: Course,
  from: { x: number; y: number; z: number },
  tick: number,
  phys: PhysOpts,
  level: BotLevel,
  rng: RngHolder,
): Plan {
  const nav = navOf(c);
  const L = LEVEL[level];
  const here = navDist(nav, from.x, from.z);
  const fromCost = here === Infinity ? 3 : 1 + Math.min(3, Math.max(0, here - 0.5) / 4.5);
  const t0 = tileAt(c, from.x, from.z);
  const roll = (t0 >= 0 ? c.tiles[t0]!.phys.roll : MATS.green.roll) * phys.roll;
  const cands: { a: number; p: number }[] = [];
  const toward = (x: number, z: number) => Math.atan2(z - from.z, x - from.x);
  // Vers le trou le plus proche, à plusieurs forces
  for (const cup of c.cups) {
    const d = Math.hypot(cup.x - from.x, cup.z - from.z);
    for (const k of [0.95, 1.08, 1.25, 1.5]) cands.push({ a: toward(cup.x, cup.z), p: powerFor(d * k + 0.25, roll) });
  }
  // Le long du chemin : on descend la carte des distances, et on vise des points de ce chemin
  const path = descend(nav, from.x, from.z, 260);
  for (const f of [0.3, 0.55, 0.8, 1]) {
    const p = path[Math.min(path.length - 1, Math.floor((path.length - 1) * f))];
    if (!p) continue;
    const d = Math.hypot(p[0] - from.x, p[1] - from.z);
    if (d < 0.3) continue;
    for (const k of [1, 1.35, 1.8]) cands.push({ a: toward(p[0], p[1]), p: powerFor(d * k, roll) });
    // Plein élan (un tremplin, une longue montée)
    if (f === 0.3) for (const p2 of [0.82, 0.92]) cands.push({ a: toward(p[0], p[1]), p: p2 });
  }
  // Tout autour, pour les bandes et les détours
  for (let i = 0; i < L.ring; i++) {
    const a = (i / L.ring) * Math.PI * 2;
    for (const p of [0.38, 0.55, 0.72, 0.9]) cands.push({ a, p });
  }
  let best: Plan = { a: cands[0]?.a ?? c.tee.aim, p: cands[0]?.p ?? 0.4, wait: 0 };
  let bestScore = Infinity;
  const scored: { plan: Plan; s: number }[] = [];
  const all: { plan: Plan; s: number }[] = [];
  const tryPlan = (a: number, power: number, wait: number) => {
    const p = Math.max(0, Math.min(1, power));
    const r = simulateShot(c, from, a, p, tick + wait, phys);
    // Un peu moins bien noté d'attendre : à coups égaux, on joue tout de suite
    const s = expected(c, nav, r, fromCost) + p * 0.01 + wait * 0.0004;
    if (wait === 0) scored.push({ plan: { a, p, wait }, s });
    all.push({ plan: { a, p, wait }, s });
    if (s < bestScore) {
      bestScore = s;
      best = { a, p, wait };
    }
  };
  for (const plan of cands) tryPlan(plan.a, plan.p, 0);
  // Quelque chose bouge sur le trou : les meilleurs coups, essayés aussi un peu plus tard (le temps qu'une grille
  // s'ouvre, qu'une vague se retire)
  if (c.movers.length > 0 && level !== "facile") {
    const top = scored.sort((x, y) => x.s - y.s).slice(0, level === "fort" ? 8 : 5);
    for (const sec of [0.5, 1, 1.6, 2.3, 3.1]) for (const t of top) tryPlan(t.plan.a, t.plan.p, Math.round(sec * 240));
  }
  // Puis quelques retouches autour du meilleur
  for (let i = 0; i < L.refine; i++) {
    const b = best;
    tryPlan(b.a + (random(rng) - 0.5) * 0.09, b.p * (1 + (random(rng) - 0.5) * 0.16), b.wait);
  }
  // Un coup trop juste (un rebond millimétré sur un poteau) rate dès que la main tremble : parmi les meilleurs, celui
  // qui réussit le mieux en moyenne quand on le joue un peu à côté
  const seen = new Set<string>();
  const top = all
    .sort((x, y) => x.s - y.s)
    .filter((x) => {
      const k = `${x.plan.a.toFixed(3)}:${x.plan.p.toFixed(3)}:${x.plan.wait}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, level === "facile" ? 3 : 6);
  let robust = Infinity;
  for (const t of top) {
    const { a, p, wait } = t.plan;
    let sum = t.s;
    for (const [da, dp] of [
      [1.3, 0],
      [-1.3, 0],
      [0, 1.1],
      [0, -1.1],
    ] as const) {
      const pp = Math.max(0, Math.min(1, p * (1 + dp * L.power)));
      const r = simulateShot(c, from, a + da * L.aim, pp, tick + wait, phys);
      sum += expected(c, nav, r, fromCost);
    }
    const mean = sum / 5;
    if (mean < robust) {
      robust = mean;
      best = t.plan;
    }
  }
  // La main qui tremble
  const gauss = () => (random(rng) + random(rng) + random(rng) - 1.5) / 0.5;
  return {
    a: best.a + gauss() * L.aim,
    p: Math.max(0.02, Math.min(1, best.p * (1 + gauss() * L.power))),
    wait: best.wait,
  };
}

/** Le chemin le plus court vers le trou depuis ce point (une suite de points, de case en case) */
function descend(nav: Nav, x: number, z: number, max: number): [number, number][] {
  let i = Math.floor((x - nav.x0) / CELL);
  let j = Math.floor((z - nav.z0) / CELL);
  const out: [number, number][] = [];
  for (let n = 0; n < max; n++) {
    let bi = i;
    let bj = j;
    let bd = i >= 0 && j >= 0 && i < nav.nx && j < nav.nz ? nav.dist[j * nav.nx + i]! : Infinity;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nav.nx || jj >= nav.nz) continue;
        const d = nav.dist[jj * nav.nx + ii]!;
        if (d < bd) {
          bd = d;
          bi = ii;
          bj = jj;
        }
      }
    if (bi === i && bj === j) break;
    i = bi;
    j = bj;
    out.push([nav.x0 + (i + 0.5) * CELL, nav.z0 + (j + 0.5) * CELL]);
    if (bd === 0) break;
  }
  // Un point toutes les quatre cases suffit
  return out.filter((_, k) => k % 4 === 3 || k === out.length - 1);
}
