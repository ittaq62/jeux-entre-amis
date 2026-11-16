// Les bots d'Escarmouche : ils lisent la carte comme une grille de cases où l'on peut se tenir (une case par mètre,
// à chaque étage), y cherchent leur chemin, regardent autour d'eux, et visent avec un temps de réaction et une erreur
// qui dépendent de leur niveau. Ils jouent avec les mêmes commandes qu'un humain.

import { getMap, type MapId } from "./maps.ts";
import { isTeamMode, worldOf, type Match } from "./match.ts";
import type { BotLevel } from "./rules.ts";
import { B, eyeOf, heightOf, MAX_PITCH, RADIUS, wrapAngle, type Cmd } from "./soldier.ts";
import { WEAPONS, type PrimaryId } from "./weapons.ts";
import type { World } from "./world.ts";

// ---------------------------------------------------------------------------
// La grille des cases où l'on tient debout
// ---------------------------------------------------------------------------

export interface Nav {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** Les cases : x, y (le sol), z */
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  /** Les cases de chaque colonne */
  cols: number[][];
  links: number[][];
}

const CELL = 1;
const STEP = 0.46;

/**
 * Le sol le plus haut sous ce point, sans dépasser `maxY`, avec la place d'y tenir debout (sur une largeur `r`) ; null
 * s'il n'y en a pas
 */
function standAt(world: World, x: number, z: number, maxY: number, r = 0.05): number | null {
  const near: number[] = [];
  world.near(x, z, x, z, near);
  const tops = near
    .map((i) => world.boxes[i]!)
    .filter((b) => b.m !== "invisible" && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 <= maxY + 1e-3)
    .map((b) => b.y1)
    .sort((a, b) => b - a);
  // Une contremarche juste devant ne gêne pas : on y monte
  for (const y of tops) if (!world.overlaps(x - r, y + STEP + 0.01, z - r, x + r, y + 1.75, z + r)) return y;
  return null;
}

/** Un peu à côté du centre de la case, si le centre est trop près d'un mur (portes, escaliers étroits) */
const NUDGES: [number, number][] = [
  [0, 0],
  [0.3, 0],
  [-0.3, 0],
  [0, 0.3],
  [0, -0.3],
  [0.3, 0.3],
  [-0.3, 0.3],
  [0.3, -0.3],
  [-0.3, -0.3],
];

export function buildNav(map: MapId): Nav {
  const gm = getMap(map);
  const world = worldOf(map);
  const { x0, z0, x1, z1 } = gm.bounds;
  const nx = Math.round((x1 - x0) / CELL);
  const nz = Math.round((z1 - z0) / CELL);
  const px: number[] = [];
  const py: number[] = [];
  const pz: number[] = [];
  const cols: number[][] = Array.from({ length: nx * nz }, () => []);
  const near: number[] = [];
  const under: number[] = [];
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * CELL;
      const z = z0 + (k + 0.5) * CELL;
      world.near(x, z, x, z, near);
      const tops = [
        ...new Set(
          near
            .map((b) => world.boxes[b]!)
            .filter((b) => b.m !== "invisible" && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)
            .map((b) => b.y1),
        ),
      ];
      for (const top of tops) {
        for (const [ox, oz] of NUDGES) {
          const qx = x + ox;
          const qz = z + oz;
          if (Math.abs((standAt(world, qx, qz, top) ?? -99) - top) > 1e-3) continue;
          // Dans un escalier, les pieds touchent deux marches : il se tient sur la plus haute
          let y = top;
          world.near(qx - RADIUS, qz - RADIUS, qx + RADIUS, qz + RADIUS, under);
          for (const bi of under) {
            const b = world.boxes[bi]!;
            if (b.m === "invisible" || b.y1 <= y || b.y1 > top + STEP) continue;
            if (qx + RADIUS > b.x0 && qx - RADIUS < b.x1 && qz + RADIUS > b.z0 && qz - RADIUS < b.z1) y = b.y1;
          }
          if (world.overlaps(qx - RADIUS, y + 0.02, qz - RADIUS, qx + RADIUS, y + 1.75, qz + RADIUS)) continue;
          if (cols[k * nx + i]!.some((n) => Math.abs(py[n]! - y) < 0.05)) break;
          cols[k * nx + i]!.push(px.length);
          px.push(qx);
          py.push(y);
          pz.push(qz);
          break;
        }
      }
    }
  }
  const links: number[][] = px.map(() => []);
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      for (const a of cols[k * nx + i]!) {
        for (const [di, dk] of dirs) {
          const ii = i + di!;
          const kk = k + dk!;
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
          for (const b of cols[kk * nx + ii]!) {
            if (Math.abs(py[a]! - py[b]!) > 1.2) continue;
            if (!walkable(world, px[a]!, py[a]!, pz[a]!, px[b]!, py[b]!, pz[b]!)) continue;
            // En diagonale, il faut pouvoir passer par les deux côtés (pas de coin de mur coupé)
            if (di !== 0 && dk !== 0) {
              const side1 = standAt(world, px[b]!, pz[a]!, Math.max(py[a]!, py[b]!) + STEP);
              const side2 = standAt(world, px[a]!, pz[b]!, Math.max(py[a]!, py[b]!) + STEP);
              if (side1 === null || side2 === null) continue;
            }
            links[a]!.push(b);
            links[b]!.push(a);
          }
        }
      }
    }
  }
  return { x0, z0, nx, nz, px: Float32Array.from(px), py: Float32Array.from(py), pz: Float32Array.from(pz), cols, links };
}

/** On passe d'une case à l'autre en marchant : chaque quart de chemin a un sol à moins d'une marche du précédent */
function walkable(world: World, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  let y = ay;
  for (let q = 1; q <= 4; q++) {
    const t = q / 4;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const s = q === 4 ? by : standAt(world, x, z, Math.max(y, by) + STEP);
    if (s === null || Math.abs(s - y) > STEP) return false;
    y = s;
  }
  return Math.abs(y - by) < 0.05;
}

const navs = new Map<MapId, Nav>();
export function navOf(map: MapId): Nav {
  let n = navs.get(map);
  if (!n) {
    n = buildNav(map);
    navs.set(map, n);
  }
  return n;
}

/** La case la plus proche de ce point (même colonne d'abord, au sol le plus proche) */
export function nearestNode(nav: Nav, x: number, y: number, z: number): number {
  const ci = Math.floor((x - nav.x0) / CELL);
  const ck = Math.floor((z - nav.z0) / CELL);
  let best = -1;
  let bestD = Infinity;
  for (let r = 0; r <= 4 && best < 0; r++) {
    for (let k = ck - r; k <= ck + r; k++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || k < 0 || i >= nav.nx || k >= nav.nz) continue;
        for (const n of nav.cols[k * nav.nx + i]!) {
          const d = (nav.px[n]! - x) ** 2 + (nav.pz[n]! - z) ** 2 + ((nav.py[n]! - y) * 2) ** 2;
          if (d < bestD && nav.links[n]!.length > 0) {
            bestD = d;
            best = n;
          }
        }
      }
    }
  }
  return best;
}

/** Le chemin le plus court d'une case à l'autre (A*), en liste de cases ; vide s'il n'y en a pas */
export function findPath(nav: Nav, from: number, to: number, maxExpand = 6000): number[] {
  if (from < 0 || to < 0) return [];
  if (from === to) return [to];
  const g = new Map<number, number>([[from, 0]]);
  const came = new Map<number, number>();
  const heap: [number, number][] = [[h(nav, from, to), from]];
  const closed = new Set<number>();
  let expanded = 0;
  while (heap.length > 0 && expanded < maxExpand) {
    const [, cur] = pop(heap);
    if (cur === to) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    expanded++;
    const gc = g.get(cur)!;
    for (const nb of nav.links[cur]!) {
      if (closed.has(nb)) continue;
      const step = Math.hypot(nav.px[nb]! - nav.px[cur]!, nav.pz[nb]! - nav.pz[cur]!, nav.py[nb]! - nav.py[cur]!);
      const ng = gc + step;
      if (ng < (g.get(nb) ?? Infinity)) {
        g.set(nb, ng);
        came.set(nb, cur);
        push(heap, [ng + h(nav, nb, to), nb]);
      }
    }
  }
  if (!came.has(to)) return [];
  const path = [to];
  let c = to;
  while (came.has(c)) {
    c = came.get(c)!;
    path.push(c);
  }
  return path.reverse();
}

function h(nav: Nav, a: number, b: number) {
  return Math.hypot(nav.px[a]! - nav.px[b]!, nav.pz[a]! - nav.pz[b]!, nav.py[a]! - nav.py[b]!);
}

function push(heap: [number, number][], item: [number, number]) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p]![0] <= heap[i]![0]) break;
    [heap[p], heap[i]] = [heap[i]!, heap[p]!];
    i = p;
  }
}

function pop(heap: [number, number][]): [number, number] {
  const top = heap[0]!;
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
      if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i]!, heap[m]!];
      i = m;
    }
  }
  return top;
}

// ---------------------------------------------------------------------------
// Le cerveau d'un bot
// ---------------------------------------------------------------------------

interface LevelParams {
  reaction: number;
  /** Degrés par seconde */
  turn: number;
  /** L'erreur de visée en voyant quelqu'un (degrés), et sa décrue par seconde */
  error: number;
  settle: number;
  /** Le demi-angle de vue (degrés) */
  fov: number;
  /** La part de tirs visés à la tête */
  head: number;
  /** Grenades par seconde (en moyenne) quand il voit quelqu'un d'assez loin */
  grenade: number;
  /** Tolérance pour presser la détente (multiplie l'angle de la cible) */
  loose: number;
  /** Le tremblement de la visée qui ne s'en va jamais (degrés) */
  wobble: number;
  /** La part du temps où il tient la détente quand il vise juste (des rafales, puis il souffle) */
  duty: number;
  /** Combien de temps il garde en tête un adversaire qu'il ne voit plus (s) */
  memory: number;
  /** Les chances qu'il parte vers là où est vraiment un adversaire (sinon, il patrouille) */
  hunt: number;
}

export const BOT_PARAMS: Record<BotLevel, LevelParams> = {
  facile: {
    reaction: 1.3,
    turn: 130,
    error: 15,
    settle: 0.6,
    fov: 45,
    head: 0,
    grenade: 0,
    loose: 3.4,
    wobble: 4.5,
    duty: 0.4,
    memory: 0.6,
    hunt: 0,
  },
  moyen: {
    reaction: 0.7,
    turn: 240,
    error: 8,
    settle: 1.3,
    fov: 55,
    head: 0.08,
    grenade: 0.025,
    loose: 2.2,
    wobble: 1.8,
    duty: 0.65,
    memory: 1,
    hunt: 0.25,
  },
  fort: {
    reaction: 0.32,
    turn: 420,
    error: 3.5,
    settle: 2.8,
    fov: 65,
    head: 0.25,
    grenade: 0.05,
    loose: 1.4,
    wobble: 0.6,
    duty: 0.85,
    memory: 1.5,
    hunt: 0.5,
  },
};

export interface BotMemory {
  path: number[];
  goal: { x: number; y: number; z: number } | null;
  /** Il va relever un coéquipier : son but redevient le sien quand c'est fini */
  rescuing?: boolean;
  repathAt: number;
  goalUntil: number;
  target: number;
  seenAt: number;
  fireAt: number;
  errYaw: number;
  errPitch: number;
  aimYaw: number;
  aimPitch: number;
  strafe: number;
  strafeUntil: number;
  crouchUntil: number;
  lookAt: number;
  lastX: number;
  lastZ: number;
  stuckSince: number;
  thinkAt: number;
  fireToggle: boolean;
  role: "attaque" | "defense";
  wander: number;
  seq: number;
  /** Le dernier adversaire qui l'a touché, quand, et d'où venait le coup (pas sa position d'après) */
  hurtBy: number;
  hurtAt: number;
  hurtX: number;
  hurtZ: number;
  /** Son niveau (pour choisir où aller) */
  level?: BotLevel;
}

export function newBotMemory(i: number, yaw: number): BotMemory {
  return {
    path: [],
    goal: null,
    repathAt: 0,
    goalUntil: 0,
    target: -1,
    seenAt: -10,
    fireAt: 0,
    errYaw: 0,
    errPitch: 0,
    aimYaw: yaw,
    aimPitch: 0,
    strafe: 1,
    strafeUntil: 0,
    crouchUntil: 0,
    lookAt: 0,
    lastX: 0,
    lastZ: 0,
    stuckSince: 0,
    thinkAt: (i % 6) / 60,
    fireToggle: false,
    role: i % 2 === 0 ? "attaque" : "defense",
    wander: 0,
    seq: 0,
    hurtBy: -1,
    hurtAt: -10,
    hurtX: 0,
    hurtZ: 0,
  };
}

/** L'arme principale d'un bot, choisie une fois pour toutes d'après son nom */
export function botPrimary(seed: string): PrimaryId {
  let h = 0;
  for (const c of seed) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  const r = ((h >>> 0) % 100) / 100;
  return r < 0.4 ? "fa" : r < 0.68 ? "pm" : r < 0.85 ? "pompe" : "precision";
}

/** Un nombre pseudo-aléatoire propre au bot, qui ne touche pas au tirage de la partie */
function rand(mem: BotMemory): number {
  mem.wander = (mem.wander + 0x6d2b79f5) >>> 0;
  let t = mem.wander;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function enemy(m: Match, a: number, b: number) {
  if (a === b) return false;
  return !isTeamMode(m.mode) || m.fighters[a]!.team !== m.fighters[b]!.team;
}

/** La commande d'un bot pour ce pas */
export function botCommand(m: Match, i: number, mem: BotMemory, level: BotLevel, now: number): Cmd {
  mem.level = level;
  const f = m.fighters[i]!;
  const s = f.s;
  const P = BOT_PARAMS[level];
  const world = worldOf(m.map);
  const nav = navOf(m.map);
  const cmd: Cmd = { s: ++mem.seq, mx: 0, mz: 0, yaw: mem.aimYaw, pitch: mem.aimPitch, b: 0, vt: now };
  if (!s.alive || m.phase === "over") {
    mem.path = [];
    mem.goal = null;
    mem.target = -1;
    return cmd;
  }
  const t = m.t;
  const eye = eyeOf(s);

  // Regarder autour de lui, dix fois par seconde
  if (t >= mem.thinkAt) {
    mem.thinkAt = t + 0.1;
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < m.fighters.length; j++) {
      if (!enemy(m, i, j)) continue;
      const g = m.fighters[j]!;
      if (!g.s.alive) continue;
      const dx = g.s.x - s.x;
      const dz = g.s.z - s.z;
      const d = Math.hypot(dx, dz, g.s.y - s.y);
      if (d > 80) continue;
      const toward = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - s.yaw));
      const aware = toward < (P.fov * Math.PI) / 180 || d < 3 || (mem.hurtBy === j && t - mem.hurtAt < 1.5);
      if (!aware) continue;
      const chest = g.s.y + heightOf(g.s) * 0.7;
      if (!world.clear(s.x, eye, s.z, g.s.x, chest, g.s.z) && !world.clear(s.x, eye, s.z, g.s.x, eyeOf(g.s), g.s.z)) continue;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best >= 0 && best !== mem.target) {
      // Un nouvel adversaire : le temps de réagir, et une visée encore approximative
      mem.target = best;
      mem.fireAt = t + P.reaction * (0.8 + rand(mem) * 0.5);
      const e = (P.error * Math.PI) / 180;
      mem.errYaw = (rand(mem) * 2 - 1) * e;
      mem.errPitch = (rand(mem) * 2 - 1) * e * 0.5;
    }
    if (best >= 0) mem.seenAt = t;
    else if (t - mem.seenAt > P.memory) mem.target = -1;
  }

  const target = mem.target >= 0 ? m.fighters[mem.target] : undefined;
  const visible = target !== undefined && target.s.alive && t - mem.seenAt < 0.25;
  const w = WEAPONS[s.slot === 0 ? s.primary : s.secondary];

  // Un coéquipier tombé tout près, et personne en vue : il va le relever
  let rescue = -1;
  if (isTeamMode(m.mode) && !visible) {
    let bestD = 12;
    for (let j = 0; j < m.fighters.length; j++) {
      const g = m.fighters[j]!;
      if (j === i || g.s.alive || g.team !== f.team || g.s.y < -5) continue;
      const d = Math.hypot(g.s.x - s.x, g.s.z - s.z);
      if (d < bestD && Math.abs(g.s.y - s.y) < 2) {
        bestD = d;
        rescue = j;
      }
    }
  }
  const rescueAt = rescue >= 0 ? m.fighters[rescue]!.s : null;
  if (rescueAt && (!mem.goal || Math.hypot(mem.goal.x - rescueAt.x, mem.goal.z - rescueAt.z) > 0.5)) {
    mem.goal = { x: rescueAt.x, y: rescueAt.y, z: rescueAt.z };
    mem.goalUntil = t + 6;
    mem.repathAt = 0;
    mem.rescuing = true;
  } else if (!rescueAt && mem.rescuing) {
    mem.rescuing = false;
    mem.goal = null;
    mem.path = [];
  }
  const kneeling = rescueAt !== null && Math.hypot(rescueAt.x - s.x, rescueAt.z - s.z) < 1.2;

  // Où aller
  if (!mem.goal || t >= mem.goalUntil || (mem.path.length === 0 && t >= mem.repathAt)) pickGoal(m, i, mem);
  if (mem.goal && t >= mem.repathAt) {
    mem.repathAt = t + 1.5 + rand(mem);
    mem.path = findPath(nav, nearestNode(nav, s.x, s.y, s.z), nearestNode(nav, mem.goal.x, mem.goal.y, mem.goal.z), 4000);
    if (mem.path.length === 0) mem.goalUntil = t;
  }
  // Suivre le chemin : la case visée avance dès qu'on y est ; on coupe tout droit quand c'est dégagé
  let mvx = 0;
  let mvz = 0;
  while (mem.path.length > 0) {
    const n = mem.path[0]!;
    if (Math.hypot(nav.px[n]! - s.x, nav.pz[n]! - s.z) < 0.7 && Math.abs(nav.py[n]! - s.y) < 1.2) mem.path.shift();
    else break;
  }
  if (mem.path.length > 0) {
    let k = 0;
    for (let q = Math.min(4, mem.path.length - 1); q > 0; q--) {
      const n = mem.path[q]!;
      if (
        Math.abs(nav.py[n]! - s.y) < 0.2 &&
        world.clear(s.x, s.y + 0.5, s.z, nav.px[n]!, nav.py[n]! + 0.5, nav.pz[n]!) &&
        world.clear(s.x, s.y + 1.5, s.z, nav.px[n]!, nav.py[n]! + 1.5, nav.pz[n]!)
      ) {
        k = q;
        break;
      }
    }
    const n = mem.path[k]!;
    mvx = nav.px[n]! - s.x;
    mvz = nav.pz[n]! - s.z;
    const l = Math.hypot(mvx, mvz);
    if (l > 1e-3) {
      mvx /= l;
      mvz /= l;
    }
  } else if (mem.goal) {
    mem.goalUntil = Math.min(mem.goalUntil, t + 0.5);
  }

  // Arrivé près du coéquipier tombé : il s'arrête et s'agenouille
  if (kneeling) {
    mvx = 0;
    mvz = 0;
  }

  // Coincé : il saute, puis cherche autre chose
  let jump = false;
  if (Math.hypot(s.x - mem.lastX, s.z - mem.lastZ) > 0.4) {
    mem.lastX = s.x;
    mem.lastZ = s.z;
    mem.stuckSince = t;
  } else if ((mvx !== 0 || mvz !== 0) && t - mem.stuckSince > 0.9) {
    jump = true;
    if (t - mem.stuckSince > 2.2) {
      mem.stuckSince = t;
      mem.goal = null;
      mem.path = [];
      mem.repathAt = 0;
    }
  }

  // Viser
  let wantYaw = mem.aimYaw;
  let wantPitch = 0;
  let onTarget = false;
  let dist = 0;
  if (visible && target) {
    const head = P.head > 0 && (mem.seq >> 6) % 7 < P.head * 7;
    const ty = head ? eyeOf(target.s) + 0.05 : target.s.y + heightOf(target.s) * 0.62;
    const dx = target.s.x - s.x;
    const dz = target.s.z - s.z;
    dist = Math.hypot(dx, dz);
    wantYaw = Math.atan2(-dx, -dz);
    wantPitch = Math.atan2(ty - eye, dist);
    // L'erreur fond à mesure qu'il suit sa cible
    const k = Math.exp(-P.settle * (1 / 60));
    mem.errYaw *= k;
    mem.errPitch *= k;
    // Une main qui tremble, toujours un peu : plus il est novice, plus elle tremble
    const wob = (P.wobble * Math.PI) / 180;
    const ph = i * 1.7;
    const aimYaw = wantYaw + mem.errYaw + wob * (Math.sin(t * 2.3 + ph) * 0.7 + Math.sin(t * 5.1 + ph * 2) * 0.3);
    const aimPitch = wantPitch + mem.errPitch + wob * 0.6 * Math.sin(t * 3.1 + ph * 3);
    turnToward(mem, aimYaw, aimPitch, P.turn);
    const off = Math.hypot(wrapAngle(mem.aimYaw - wantYaw), mem.aimPitch - wantPitch);
    const size = Math.atan2(0.32, Math.max(1, Math.hypot(dist, ty - eye)));
    onTarget = off < size * P.loose;
  } else {
    // Sans adversaire en vue : il regarde où il va, et d'où venait le coup qu'il vient de prendre
    if (mem.hurtBy >= 0 && t - mem.hurtAt < 1.5) {
      wantYaw = Math.atan2(-(mem.hurtX - s.x), -(mem.hurtZ - s.z));
    } else if (mvx !== 0 || mvz !== 0) wantYaw = Math.atan2(-mvx, -mvz);
    turnToward(mem, wantYaw, wantPitch, P.turn * 0.6);
  }
  cmd.yaw = wrapAngle(mem.aimYaw);
  cmd.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, mem.aimPitch));

  // Se déplacer en combattant : de côté, et plus près s'il est trop loin pour son arme
  let mx = 0;
  let mz = 0;
  const yaw = cmd.yaw;
  const toLocal = (dx: number, dz: number) => {
    mx += dx * Math.cos(yaw) - dz * Math.sin(yaw);
    mz += -dx * Math.sin(yaw) - dz * Math.cos(yaw);
  };
  const ideal = w.id === "pompe" ? 6 : w.id === "pm" ? 12 : w.id === "precision" ? 30 : 20;
  if (visible) {
    if (t >= mem.strafeUntil) {
      mem.strafe = rand(mem) < 0.5 ? -1 : 1;
      mem.strafeUntil = t + 0.5 + rand(mem) * 0.9;
      if (level !== "facile" && rand(mem) < 0.25) mem.crouchUntil = t + 0.8;
    }
    if (w.id !== "precision" || dist < 12) mx += mem.strafe * 0.8;
    if (dist > ideal * 1.4 && (mvx !== 0 || mvz !== 0)) toLocal(mvx * 0.8, mvz * 0.8);
  } else if (mvx !== 0 || mvz !== 0) {
    toLocal(mvx, mvz);
  }
  const ml = Math.hypot(mx, mz);
  if (ml > 1) {
    mx /= ml;
    mz /= ml;
  }
  cmd.mx = mx;
  cmd.mz = mz;

  // Les boutons
  let b = 0;
  // Coincé, il saute pour se dégager, sans se hisser sur l'obstacle (son chemin ne passe pas par-dessus)
  if (jump) {
    b |= B.jump;
    cmd.mz = Math.min(cmd.mz, 0.25);
  }
  if (t < mem.crouchUntil || kneeling) b |= B.crouch;
  if (!visible && mz > 0.8 && ml > 0.9 && !jump) b |= B.sprint;
  const mag = s.mag[s.slot];
  // Des rafales courtes, puis une pause : il ne vide pas son chargeur d'un trait
  const period = 1.3;
  const burst = ((t + i * 0.37) % period) / period < P.duty;
  if (visible && onTarget && burst && t >= mem.fireAt && mag > 0 && dist < (w.id === "pompe" ? 22 : 90)) {
    if (w.auto) b |= B.fire;
    else {
      mem.fireToggle = !mem.fireToggle;
      if (mem.fireToggle) b |= B.fire;
    }
  }
  // Épauler : toujours à la lunette ; à distance, un bot fort épaule, un moyen une fois sur deux, un facile jamais
  const shoulder = level === "fort" ? dist > 8 : level === "moyen" ? dist > 14 && (mem.seq >> 7) % 2 === 0 : false;
  if (visible && ((w.id === "precision" && dist > 10) || (shoulder && w.id !== "pompe"))) b |= B.ads;
  if (visible && level !== "facile" && dist > 7 && dist < 18 && w.id !== "precision" && rand(mem) < P.grenade / 60) b |= B.grenade;
  if (mag === 0 && s.res[s.slot] > 0 && s.reloadEnd === 0) b |= B.reload;
  else if (!visible && mag < w.mag * 0.4 && s.res[s.slot] > 0 && s.reloadEnd === 0) b |= B.reload;
  if (mag === 0 && s.res[s.slot] === 0) b |= s.slot === 0 ? B.slot2 : B.slot1;
  if (visible && dist < 1.6 && rand(mem) < 0.05) b |= B.melee;
  cmd.b = b;
  return cmd;
}

function turnToward(mem: BotMemory, yaw: number, pitch: number, degPerSec: number) {
  const max = ((degPerSec * Math.PI) / 180) * (1 / 60);
  const dy = wrapAngle(yaw - mem.aimYaw);
  mem.aimYaw = wrapAngle(mem.aimYaw + Math.max(-max, Math.min(max, dy)));
  const dp = pitch - mem.aimPitch;
  mem.aimPitch += Math.max(-max, Math.min(max, dp));
}

/** Le bot vient d'être touché : il se retourne vers là où était le tireur à ce moment-là */
export function botHurt(mem: BotMemory, by: number, t: number, x: number, z: number) {
  if (by < 0) return;
  mem.hurtBy = by;
  mem.hurtAt = t;
  mem.hurtX = x;
  mem.hurtZ = z;
}

/** Où aller quand rien ne presse : selon le mode, chercher les adversaires, tenir la zone, prendre ou défendre un drapeau */
function pickGoal(m: Match, i: number, mem: BotMemory) {
  const f = m.fighters[i]!;
  const gm = getMap(m.map);
  const t = m.t;
  const set = (x: number, y: number, z: number, hold: number) => {
    mem.goal = { x, y, z };
    mem.goalUntil = t + hold;
    mem.repathAt = 0;
  };
  if (m.mode === "zone") {
    const a = rand(mem) * Math.PI * 2;
    const r = rand(mem) * gm.zone.r * 0.6;
    return set(gm.zone.x + Math.cos(a) * r, 0, gm.zone.z + Math.sin(a) * r, 4 + rand(mem) * 3);
  }
  if (m.mode === "drapeau" && m.flags) {
    const mine = f.team === 1 ? 1 : 0;
    const theirs = 1 - mine;
    const home = gm.flags[mine]!;
    if (f.carrying >= 0) return set(home.x, home.y, home.z, 3);
    const own = m.flags[mine]!;
    const enemyFlag = m.flags[theirs]!;
    if (own.at !== "home") {
      // Son drapeau est parti : on court après (on sait où il est)
      const target = own.at === "carried" ? m.fighters[own.carrier]!.s : own;
      return set(target.x, target.y, target.z, 1.5);
    }
    const defenders = m.fighters.filter((g) => g.bot && g.team === f.team).length;
    if (mem.role === "defense" && defenders > 1) {
      const a = rand(mem) * Math.PI * 2;
      return set(home.x + Math.cos(a) * 5 + (mine === 0 ? 6 : -6), 0, home.z + Math.sin(a) * 6, 5);
    }
    if (enemyFlag.at === "carried") {
      const c = m.fighters[enemyFlag.carrier]!.s;
      return set(c.x, c.y, c.z, 2);
    }
    return set(enemyFlag.x, enemyFlag.y, enemyFlag.z, 4);
  }
  // Chercher quelqu'un : là où il s'est fait tirer dessus, parfois (un bot fort) là où est un adversaire, ou un coin
  // de la carte. Un bot facile ne sait jamais où sont les autres : il patrouille.
  if (mem.hurtBy >= 0 && t - mem.hurtAt < 6 && rand(mem) < 0.6) return set(mem.hurtX, 0, mem.hurtZ, 4);
  const hunt = BOT_PARAMS[mem.level ?? "moyen"].hunt;
  const foes = m.fighters.filter((g, j) => g.s.alive && enemy(m, i, j));
  if (foes.length > 0 && rand(mem) < hunt) {
    const g = foes[Math.floor(rand(mem) * foes.length)]!;
    return set(g.s.x + (rand(mem) - 0.5) * 6, g.s.y, g.s.z + (rand(mem) - 0.5) * 6, 5 + rand(mem) * 3);
  }
  const spots = [...gm.ffa, ...gm.spawns[0], ...gm.spawns[1]];
  const sp = spots[Math.floor(rand(mem) * spots.length)]!;
  set(sp.x, sp.y, sp.z, 7);
}
