// Les bots d'Escarmouche : ils lisent la carte comme une grille de cases où l'on peut se tenir (une case par mètre,
// à chaque étage), y cherchent leur chemin, regardent autour d'eux, et visent avec un temps de réaction et une erreur
// qui dépendent de leur niveau. Ils jouent avec les mêmes commandes qu'un humain.

import { getMap, type MapId } from "./maps.ts";
import { CONQUEST, isTeamMode, matchWorld, worldOf, type FlagState, type Match } from "./match.ts";
import type { BotLevel } from "./rules.ts";
import { B, eyeOf, heightOf, MAX_PITCH, RADIUS, wrapAngle, type Cmd } from "./soldier.ts";
import { WEAPONS, type PrimaryId, type WeaponId } from "./weapons.ts";
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
  /** Le morceau du graphe de chaque case ; `main`, le plus grand (le terrain de jeu, le reste étant des îlots) */
  part: Int32Array;
  main: number;
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
  const { part, main } = parts(links);
  return { x0, z0, nx, nz, px: Float32Array.from(px), py: Float32Array.from(py), pz: Float32Array.from(pz), cols, links, part, main };
}

/** Les morceaux du graphe (cases reliées entre elles), et le plus grand */
function parts(links: number[][]): { part: Int32Array; main: number } {
  const part = new Int32Array(links.length).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < links.length; start++) {
    if (part[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    part[start] = id;
    while (stack.length > 0) {
      const n = stack.pop()!;
      size++;
      for (const o of links[n]!) {
        if (part[o] !== -1) continue;
        part[o] = id;
        stack.push(o);
      }
    }
    sizes.push(size);
  }
  return { part, main: sizes.indexOf(Math.max(0, ...sizes)) };
}

/** Un peu moins que la demi-largeur d'un soldat : on frôle un mur sans s'y coincer */
const BODY = RADIUS - 0.01;
/** De combien on s'écarte au plus de la ligne droite entre deux cases (une porte qu'on prend un peu de biais) */
const SIDE_STEPS = [0, 0.08, -0.08, 0.16, -0.16];

/** Un soldat tient-il debout ici, sur un sol à `y` (ce qui ne dépasse pas d'une marche ne gêne pas) ? */
function bodyFits(world: World, x: number, y: number, z: number): boolean {
  return !world.overlaps(x - BODY, y + STEP + 0.01, z - BODY, x + BODY, y + 1.75, z + BODY);
}

/**
 * On passe d'une case à l'autre en marchant : chaque quart de chemin a un sol à moins d'une marche du précédent, et la
 * place pour un soldat de toute sa largeur (à quelques centimètres près de côté). Sans ça, le chemin passait entre deux
 * coins trop proches ou longeait le bout d'un muret, et le soldat y restait collé.
 */
function walkable(world: World, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const sx = len > 1e-6 ? -(bz - az) / len : 0;
  const sz = len > 1e-6 ? (bx - ax) / len : 0;
  let y = ay;
  for (let q = 1; q <= 4; q++) {
    const t = q / 4;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const s = q === 4 ? by : standAt(world, x, z, Math.max(y, by) + STEP);
    if (s === null || Math.abs(s - y) > STEP) return false;
    if (q < 4 && !SIDE_STEPS.some((o) => bodyFits(world, x + sx * o, s, z + sz * o))) return false;
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

/**
 * La case la plus proche de ce point (même colonne d'abord, au sol le plus proche), prise sur le terrain de jeu : une
 * case posée sur un obstacle bas, isolée du reste, ne mène nulle part (le bot collé contre restait planté). Faute de
 * mieux tout près, n'importe quelle case reliée.
 */
export function nearestNode(nav: Nav, x: number, y: number, z: number): number {
  return nearestIn(nav, x, y, z, true) ?? nearestIn(nav, x, y, z, false) ?? -1;
}

function nearestIn(nav: Nav, x: number, y: number, z: number, mainOnly: boolean): number | null {
  const ci = Math.floor((x - nav.x0) / CELL);
  const ck = Math.floor((z - nav.z0) / CELL);
  let best = -1;
  let bestD = Infinity;
  for (let r = 0; r <= 4 && best < 0; r++) {
    for (let k = ck - r; k <= ck + r; k++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || k < 0 || i >= nav.nx || k >= nav.nz) continue;
        for (const n of nav.cols[k * nav.nx + i]!) {
          if (nav.links[n]!.length === 0 || (mainOnly && nav.part[n] !== nav.main)) continue;
          const d = (nav.px[n]! - x) ** 2 + (nav.pz[n]! - z) ** 2 + ((nav.py[n]! - y) * 2) ** 2;
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
    }
  }
  return best < 0 ? null : best;
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
  wander: number;
  seq: number;
  /** Le dernier adversaire qui l'a touché, quand, et d'où venait le coup (pas sa position d'après) */
  hurtBy: number;
  hurtAt: number;
  hurtX: number;
  hurtZ: number;
  /** Son niveau (pour choisir où aller) */
  level?: BotLevel;
  /** Capture du drapeau : ce qu'il fait (voir `flagJob`), le passage par où il attaque, et l'état des drapeaux qu'il a vu */
  job?: FlagJob;
  via?: { x: number; y: number; z: number } | null;
  /** Arrivé seul au passage du milieu : jusqu'à quand il attend un coéquipier */
  waitUntil?: number;
  flagKey?: number;
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
/** Les écarts essayés quand le bout d'un muret barre la route (radians, du plus petit au plus grand) */
const STEER = [0.4, -0.4, 0.8, -0.8, 1.2, -1.2];

/** Le corps entier, poussé de (dx, dz) par pas plus courts que sa largeur : rien ne passe entre deux, pas même un poteau */
function bodyPasses(world: World, x: number, y: number, z: number, dx: number, dz: number) {
  const n = Math.ceil(Math.hypot(dx, dz) / 0.25);
  for (let k = 1; k <= n; k++) if (!bodyFits(world, x + (dx * k) / n, y, z + (dz * k) / n)) return false;
  return true;
}

/**
 * La voie est-elle libre pour tout le corps, pas seulement pour un trait au milieu ? Un trait qui frôle le bout d'un
 * muret passe, l'épaule non : le bot poussait droit contre la tranche sans plus glisser (au Col, à la sortie des bases)
 */
function bodyClear(world: World, x: number, y: number, z: number, tx: number, ty: number, tz: number) {
  if (!world.clear(x, y + 0.5, z, tx, ty + 0.5, tz) || !world.clear(x, y + 1.5, z, tx, ty + 1.5, tz)) return false;
  const dx = tx - x;
  const dz = tz - z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-3) return true;
  const ox = (-dz / l) * RADIUS;
  const oz = (dx / l) * RADIUS;
  return (
    world.clear(x + ox, y + 0.5, z + oz, tx + ox, ty + 0.5, tz + oz) && world.clear(x - ox, y + 0.5, z - oz, tx - ox, ty + 0.5, tz - oz)
  );
}

export function botCommand(m: Match, i: number, mem: BotMemory, level: BotLevel, now: number): Cmd {
  mem.level = level;
  const f = m.fighters[i]!;
  const s = f.s;
  const P = BOT_PARAMS[level];
  const world = matchWorld(m);
  const nav = navOf(m.map);
  const cmd: Cmd = { s: ++mem.seq, mx: 0, mz: 0, yaw: mem.aimYaw, pitch: mem.aimPitch, b: 0, vt: now };
  if (!s.alive || m.phase === "over") {
    mem.path = [];
    mem.goal = null;
    mem.target = -1;
    mem.via = null;
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
      if (m.settings.night && d > 35 && t - g.lastFight > 1.5) continue;
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
  const seen = target !== undefined && target.s.alive && t - mem.seenAt < 0.25;
  const w = WEAPONS[s.slot === 0 ? s.primary : s.secondary];

  // Capture du drapeau : un drapeau pris, tombé ou rapporté, et il change d'idée, plus ou moins vite selon son niveau
  if (m.flags) {
    const key = flagKeyOf(m, i);
    if (key !== mem.flagKey) {
      mem.flagKey = key;
      mem.goalUntil = Math.min(mem.goalUntil, t + FLAG_REACT[level]);
    }
  }
  const job = m.flags ? mem.job : undefined;
  // Au drapeau, qui a un but ne s'arrête pas pour un duel de loin : il ne se bat qu'avec qui est assez près, et sinon il
  // court (le porteur, encore plus pressé)
  const reach = job === "porteur" ? FLAG_FIGHT.porteur : job === "attaque" || job === "escorte" ? FLAG_FIGHT.attaque : Infinity;
  const visible = seen && Math.hypot(target!.s.x - s.x, target!.s.z - s.z) < reach;

  // Un coéquipier tombé tout près, et personne en vue : il va le relever (sauf avec le drapeau, ou en courant après le sien)
  let rescue = -1;
  if (isTeamMode(m.mode) && !visible && job !== "porteur" && job !== "reprise") {
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
  // Sabotage : un attaquant va poser sa charge sur le dépôt debout le plus proche, un défenseur court désamorcer
  let sabAt: { x: number; y: number; z: number } | null = null;
  if (m.sab && !visible && rescue < 0) {
    const want = f.team === 1 ? 1 : 0;
    let bestD = f.team === 1 ? 60 : 14;
    m.sab.deps.forEach((d, k) => {
      const c = getMap(m.map).depots[k]!;
      const dd = Math.hypot(c.x - s.x, c.z - s.z);
      if (d.state === want && dd < bestD) {
        bestD = dd;
        sabAt = c;
      }
    });
  }
  const rescueAt = rescue >= 0 ? m.fighters[rescue]!.s : sabAt;
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
      if (Math.abs(nav.py[n]! - s.y) < 0.2 && bodyClear(world, s.x, s.y, s.z, nav.px[n]!, nav.py[n]!, nav.pz[n]!)) {
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
      // Le bout d'un muret ou un poteau droit devant, que l'épaule accroche : il s'en écarte de biais au lieu de pousser
      // contre (les murs ne font glisser que ce qui les aborde de biais)
      if (k === 0 && !bodyPasses(world, s.x, s.y, s.z, mvx * 0.8, mvz * 0.8)) {
        for (const a of STEER) {
          const c = Math.cos(a);
          const sn = Math.sin(a);
          const rx = mvx * c - mvz * sn;
          const rz = mvx * sn + mvz * c;
          if (bodyPasses(world, s.x, s.y, s.z, rx * 0.8, rz * 0.8)) {
            mvx = rx;
            mvz = rz;
            break;
          }
        }
      }
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
    if (mem.hurtBy >= 0 && t - mem.hurtAt < 1.5 && reach === Infinity) {
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
  // La bonne distance de son arme ; les fusils de chasse ne tirent pas au-delà de leur portée (les plombs s'y perdent)
  const shotgun = (id: WeaponId) => id === "pompe" || id === "double";
  // L'arme de poing sortie en attendant d'être assez près pour son fusil de chasse : il se bat comme avec son fusil
  // (il s'approche), sinon il restait à vingt mètres, le pistolet à la main
  const fightAs: WeaponId = s.slot === 1 && shotgun(s.primary) && s.mag[0] + s.res[0] > 0 ? s.primary : w.id;
  const ideal = shotgun(fightAs) ? 6 : fightAs === "pm" ? 12 : fightAs === "mitraillette" ? 10 : fightAs === "precision" ? 30 : 20;
  const reachOf = (id: WeaponId) => (shotgun(id) ? WEAPONS[id].range[1] : 90);
  const shortArm = shotgun(fightAs);
  // Au drapeau, on ne s'arrête pas pour se battre : le porteur file chez lui, les autres avancent en tirant
  const push = job === "porteur" ? 1 : job === "attaque" || job === "escorte" || job === "reprise" ? FLAG_PUSH[level] : 0;
  if (visible) {
    if (t >= mem.strafeUntil) {
      mem.strafe = rand(mem) < 0.5 ? -1 : 1;
      mem.strafeUntil = t + 0.5 + rand(mem) * 0.9;
      if (level !== "facile" && push === 0 && rand(mem) < 0.25) mem.crouchUntil = t + 0.8;
    }
    if (w.id !== "precision" || dist < 12) mx += mem.strafe * (job === "porteur" ? 0.35 : 0.8);
    const far = dist > ideal * 1.4 ? 0.8 : 0;
    const advance = Math.max(push, far);
    // Le fusil de chasse en main et l'adversaire trop loin : il va droit sur lui (il le voit, la voie est libre) plutôt
    // que de rester planté à découvert. Pas quand il y a un objectif : son chemin l'y mène, il le garde
    if (far > 0 && shortArm && (m.mode === "solo" || m.mode === "equipes") && target) {
      const dx = target.s.x - s.x;
      const dz = target.s.z - s.z;
      const l = Math.hypot(dx, dz) || 1;
      toLocal((dx / l) * far, (dz / l) * far);
    } else if (advance > 0 && (mvx !== 0 || mvz !== 0)) toLocal(mvx * advance, mvz * advance);
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
  if (visible && onTarget && burst && t >= mem.fireAt && mag > 0 && dist < reachOf(w.id)) {
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
  // Un fusil de chasse et l'adversaire hors de portée : il sort son arme de poing ; il reprend son fusil quand
  // l'adversaire est tout près (là où les plombs portent), ou quand il ne voit plus personne
  else if (s.slot === 0 && visible && shotgun(s.primary) && dist > reachOf(s.primary) * 0.8 && s.mag[1] + s.res[1] > 0) b |= B.slot2;
  else if (
    s.slot === 1 &&
    shotgun(s.primary) &&
    s.mag[0] + s.res[0] > 0 &&
    (visible ? dist < WEAPONS[s.primary].range[0] * 1.5 : t - mem.seenAt > 1.2)
  )
    b |= B.slot1;
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

/**
 * Capture du drapeau : dans une équipe, un bot sur trois défend (le deuxième, puis le cinquième…), les autres attaquent ;
 * un bot seul dans son équipe attaque. La parité de la place ne suffit pas : les équipes se font déjà par elle, et toute
 * une équipe défendait pendant que l'autre attaquait.
 */
export function flagRole(m: Match, i: number): "attaque" | "defense" {
  const team = m.fighters[i]!.team;
  const mates = m.fighters.flatMap((g, j) => (g.bot && g.team === team ? [j] : []));
  return mates.length > 1 && mates.indexOf(i) % 3 === 1 ? "defense" : "attaque";
}

/** Capture du drapeau : ce que fait un bot (voir `flagJob`) */
export type FlagJob = "attaque" | "defense" | "porteur" | "escorte" | "reprise";

/** Le temps qu'il met à changer d'idée quand un drapeau est pris, tombe ou revient (s), selon son niveau */
const FLAG_REACT: Record<BotLevel, number> = { facile: 1.6, moyen: 0.9, fort: 0.45 };
/** Au drapeau, la part de sa course qu'il garde en se battant (le porteur, toute) */
const FLAG_PUSH: Record<BotLevel, number> = { facile: 0.6, moyen: 0.75, fort: 0.9 };
/** Un attaquant court après son propre drapeau s'il en est à moins de ça (m) ; plus loin, il continue d'attaquer */
const FLAG_CHASE = 30;
/** Un défenseur escorte le porteur qui passe à moins de ça (m) */
const FLAG_ESCORT = 18;
/** Au-delà, l'attaquant (ou l'escorte) et le porteur ne s'arrêtent pas pour se battre (m) */
const FLAG_FIGHT = { attaque: 30, porteur: 16 };

/** L'état des drapeaux, vu par ce bot (où est chacun, qui le porte, et s'il en porte un) : quand il change, il change d'idée */
function flagKeyOf(m: Match, i: number): number {
  const F = m.flags!;
  const at = (k: 0 | 1) => (F[k].at === "home" ? 0 : F[k].at === "carried" ? 1 : 2) * 64 + F[k].carrier + 1;
  return (at(0) * 256 + at(1)) * 4 + m.fighters[i]!.carrying + 1;
}

/** Où est un drapeau : sur son porteur, ou là où il est */
function flagAt(m: Match, F: FlagState): { x: number; y: number; z: number } {
  return F.at === "carried" ? m.fighters[F.carrier]!.s : F;
}

/**
 * Ce que fait un bot à la capture du drapeau : il porte le drapeau adverse et file chez lui ; il reprend le sien (les
 * défenseurs, et ceux qui en sont tout près) ; il escorte le coéquipier qui porte le drapeau adverse (les attaquants, et
 * les défenseurs près de qui il passe) ; sinon, il tient son rôle, attaque ou défense
 */
export function flagJob(m: Match, i: number): FlagJob {
  const f = m.flags ? m.fighters[i] : undefined;
  if (!f || !m.flags) return "attaque";
  if (f.carrying >= 0) return "porteur";
  const mine = f.team === 1 ? 1 : 0;
  const own = m.flags[mine]!;
  const theirs = m.flags[1 - mine]!;
  const role = flagRole(m, i);
  if (own.at !== "home") {
    const at = flagAt(m, own);
    if (role === "defense" || Math.hypot(at.x - f.s.x, at.z - f.s.z) < FLAG_CHASE) return "reprise";
  }
  if (theirs.at === "carried" && theirs.carrier !== i) {
    const c = m.fighters[theirs.carrier]!.s;
    if (role === "attaque" || Math.hypot(c.x - f.s.x, c.z - f.s.z) < FLAG_ESCORT) return "escorte";
  }
  return role;
}

/** Les passages du milieu de chaque carte, en trois bandes (d'un bord à l'autre) : des cases au sol sur la ligne médiane */
const lanes = new Map<MapId, { x: number; y: number; z: number }[][]>();
function lanesOf(map: MapId) {
  let out = lanes.get(map);
  if (out) return out;
  const gm = getMap(map);
  const nav = navOf(map);
  const [a, b] = gm.flags;
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const ax = (b.x - a.x) / len;
  const az = (b.z - a.z) / len;
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const nodes: { x: number; y: number; z: number; side: number }[] = [];
  for (let n = 0; n < nav.px.length; n++) {
    if (nav.part[n] !== nav.main || nav.py[n]! > Math.max(a.y, b.y) + 0.6) continue;
    const dx = nav.px[n]! - mx;
    const dz = nav.pz[n]! - mz;
    if (Math.abs(dx * ax + dz * az) > 4) continue;
    nodes.push({ x: nav.px[n]!, y: nav.py[n]!, z: nav.pz[n]!, side: -dx * az + dz * ax });
  }
  const lo = Math.min(...nodes.map((p) => p.side));
  const hi = Math.max(...nodes.map((p) => p.side));
  const bands: { x: number; y: number; z: number }[][] = [[], [], []];
  for (const p of nodes) bands[Math.min(2, Math.floor(((p.side - lo) / (hi - lo || 1)) * 3))]!.push({ x: p.x, y: p.y, z: p.z });
  out = bands.filter((l) => l.length > 0);
  lanes.set(map, out);
  return out;
}

/** Au milieu, un attaquant seul attend un moment qu'un coéquipier le rejoigne (s), pour ne pas arriver un par un */
const FLAG_REGROUP = 5;

/**
 * Le passage par où l'on traverse le milieu, de `from` vers `to` (sa base vers celle d'en face pour attaquer, l'inverse
 * pour rapporter le drapeau) : pris en partant, oublié une fois passé (ou si l'on est déjà de l'autre côté). Les
 * attaquants d'une équipe qui partent ensemble prennent le même passage (il change toutes les 25 s), et celui qui y
 * arrive seul attend un peu qu'un coéquipier le rejoigne. Null : on va droit au but.
 */
function laneVia(
  m: Match,
  i: number,
  mem: BotMemory,
  from: { x: number; z: number },
  to: { x: number; z: number },
  regroup: boolean,
): { x: number; y: number; z: number } | null {
  const f = m.fighters[i]!;
  const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  // Où l'on en est sur le trajet (0 au départ, `len` à l'arrivée)
  const progress = (x: number, z: number) => ((x - from.x) * (to.x - from.x) + (z - from.z) * (to.z - from.z)) / len;
  const here = progress(f.s.x, f.s.z);
  if (mem.via && (here > progress(mem.via.x, mem.via.z) - 1 || Math.hypot(mem.via.x - f.s.x, mem.via.z - f.s.z) < 5)) {
    // Arrivé au passage : seul, il attend un peu qu'un coéquipier arrive (une fois par passage)
    const buddy = m.fighters.some((g, j) => j !== i && g.team === f.team && g.s.alive && Math.hypot(g.s.x - f.s.x, g.s.z - f.s.z) < 14);
    if (regroup && !buddy && mem.waitUntil === undefined) mem.waitUntil = m.t + FLAG_REGROUP;
    if (regroup && !buddy && m.t < (mem.waitUntil ?? 0)) return mem.via;
    mem.via = null;
    mem.waitUntil = undefined;
  }
  if (!mem.via && here < len / 2 - 10) {
    const list = lanesOf(m.map);
    const wave = Math.floor(m.t / 25) * 7 + f.team * 3;
    const lane = list[regroup ? wave % list.length : Math.floor(rand(mem) * list.length)] ?? [];
    mem.via = lane[Math.floor(rand(mem) * lane.length)] ?? null;
    mem.waitUntil = undefined;
  }
  return mem.via ?? null;
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
  if (m.mode === "sabotage" && m.sab) {
    // Attaquer le dépôt debout le plus proche ; défendre : garder un dépôt debout, ou courir à celui qu'on piège
    const deps = gm.depots;
    const live = m.sab.deps.map((d, k) => ({ d, k })).filter(({ d }) => d.state !== 2);
    if (live.length > 0) {
      let pick = live[Math.floor(rand(mem) * live.length)]!;
      if (f.team !== 1) {
        const up = live.filter(({ d }) => d.state === 0);
        const from = up.length > 0 ? up : live;
        pick = from.reduce((a, b) =>
          Math.hypot(deps[a.k]!.x - f.s.x, deps[a.k]!.z - f.s.z) < Math.hypot(deps[b.k]!.x - f.s.x, deps[b.k]!.z - f.s.z) ? a : b,
        );
      } else {
        const armed = live.find(({ d }) => d.state === 1);
        if (armed) pick = armed;
      }
      const c = deps[pick.k]!;
      const a = rand(mem) * Math.PI * 2;
      const r = f.team === 1 ? 2 + rand(mem) * 5 : rand(mem) * 1.5;
      return set(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r, 4 + rand(mem) * 3);
    }
  }
  if (m.mode === "conquete" && m.cq) {
    // Le drapeau le plus pressant : pas encore à nous, ou à nous mais qu'on est en train de nous prendre ; tout près,
    // de préférence. Tous tranquilles : en garder un.
    const mine = f.team === 1 ? 1 : 0;
    const side = mine === 0 ? -1 : 1;
    let best = -1;
    let bestScore = Infinity;
    m.cq.pts.forEach((p, k) => {
      const threat = p.owner === mine ? Math.abs(p.v - side) : 2;
      if (p.owner === mine && threat < 0.15) return;
      const c = gm.points[k]!;
      const score = Math.hypot(c.x - f.s.x, c.z - f.s.z) - threat * 15 + rand(mem) * 20;
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    });
    if (best < 0) best = Math.floor(rand(mem) * gm.points.length);
    const c = gm.points[best]!;
    const a = rand(mem) * Math.PI * 2;
    const r = rand(mem) * CONQUEST.r * 0.6;
    return set(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r, 4 + rand(mem) * 3);
  }
  if (m.mode === "drapeau" && m.flags) {
    const mine = f.team === 1 ? 1 : 0;
    const home = gm.flags[mine]!;
    const job = flagJob(m, i);
    const near = (r: number) => (rand(mem) * 2 - 1) * r;
    if (job !== mem.job) {
      mem.via = null;
      mem.waitUntil = undefined;
    }
    mem.job = job;
    const there = gm.flags[1 - mine]!;
    switch (job) {
      case "porteur": {
        // Chez lui, par un passage pris au hasard ; si son propre drapeau n'y est pas (on ne marque qu'avec le sien à sa
        // place), il attend tout près
        const via = laneVia(m, i, mem, there, home, false);
        if (via) return set(via.x, via.y, via.z, 4);
        if (m.flags[mine]!.at === "home" || Math.hypot(home.x - f.s.x, home.z - f.s.z) > 12) return set(home.x, home.y, home.z, 3);
        return set(home.x + near(5), home.y, home.z + near(5), 2.5);
      }
      case "reprise": {
        // Son drapeau est parti : on court après (on sait où il est), pour abattre le porteur ou le ramener
        const at = flagAt(m, m.flags[mine]!);
        return set(at.x, at.y, at.z, 1);
      }
      case "escorte": {
        const c = m.fighters[m.flags[1 - mine]!.carrier]!.s;
        return set(c.x + near(3.5), c.y, c.z + near(3.5), 1.2);
      }
      case "defense": {
        // Autour de son drapeau, un peu en avant, du côté d'où viennent les autres
        const ahead = gm.flags[1 - mine]!.x > home.x ? 1 : -1;
        return set(home.x + ahead * (3 + rand(mem) * 6), home.y, home.z + near(7), 4 + rand(mem) * 3);
      }
      case "attaque": {
        const flag = m.flags[1 - mine]!;
        if (flag.at !== "home") return set(flag.x, flag.y, flag.z, 2);
        // Il traverse le milieu par un passage (celui des coéquipiers qui partent avec lui), puis va au drapeau
        const via = laneVia(m, i, mem, home, there, true);
        if (via) return set(via.x, via.y, via.z, mem.waitUntil !== undefined ? 1 : 6);
        return set(flag.x, flag.y, flag.z, 4);
      }
    }
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
