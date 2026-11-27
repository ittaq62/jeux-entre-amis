// Le commis : un chef tenu par l'ordinateur. Il prend une commande à son compte et la mène de bout en bout (sortir les
// aliments, couper, faire cuire, dresser l'assiette, servir), sans toucher à ce que préparent les autres commis ; il
// éteint le feu, fait la vaisselle quand il n'y a plus d'assiettes propres, et met à l'abri ce qui va brûler. Il remplace
// aussi un joueur parti, et complète les tables de tournée.
//
// Il ne lit que l'état du monde (comme un joueur qui regarde l'écran) et répond par une commande à chaque pas : un stick
// et des boutons. Le chemin se cherche sur la grille des cases, à l'endroit où sont les tables et les wagons à ce moment.

import { random, type RngHolder } from "../../rng.ts";
import { CHOP, FRY, PAN, POT, POT_FULL, RECIPES, splitBaked, type BaseKind, type FoodId, type Part } from "./food.ts";
import { CART_LEN, cart } from "./hazards.ts";
import { buildKitchen, Cell, menuOf, solid, type Kitchen } from "./kitchens.ts";
import {
  ACT_CHOP,
  ACT_WASH,
  baseTakes,
  CHEF_R,
  GRAB,
  NO_INPUT,
  offsetsAt,
  panTakes,
  partOf,
  plateTakes,
  potTakes,
  returnFor,
  serviceTime,
  supportAt,
  targetCell,
  USE,
  DASH,
  type Chef,
  type Input,
  type Item,
  type Order,
  type World,
} from "./sim.ts";

export type BotLevel = "facile" | "moyen" | "fort";
export const BOT_LEVELS: BotLevel[] = ["facile", "moyen", "fort"];
export const isBotLevel = (v: unknown): v is BotLevel => v === "facile" || v === "moyen" || v === "fort";

/** Comment joue chaque niveau : sa vitesse, le temps qu'il met à se décider, et s'il prend de l'élan */
const LEVELS: Record<BotLevel, { speed: number; think: number; dash: boolean; slack: number }> = {
  facile: { speed: 0.72, think: 14, dash: false, slack: 0.3 },
  moyen: { speed: 0.9, think: 6, dash: false, slack: 0.12 },
  fort: { speed: 1, think: 2, dash: true, slack: 0 },
};

type Plan =
  /** Les mains vides : prendre ce qu'il y a sur cette case, puis (facultatif) le porter sur celle-là */
  | { t: "take"; cell: number; then: number }
  /** Ce qu'on tient : le poser (ou le verser, ou le servir) sur cette case */
  | { t: "put"; cell: number }
  /** Couper, laver : appuyer sur Utiliser devant cette case et attendre que ce soit fait */
  | { t: "use"; cell: number }
  /** Éteindre ce feu (l'extincteur en main) */
  | { t: "spray"; cell: number }
  /** Ramasser ce qui traîne par terre ici */
  | { t: "pickup"; x: number; y: number }
  /** Attendre un peu (la cuisson), près de cette case si on en donne une */
  | { t: "wait"; frames: number; cell: number };

/** Ce qu'un commis garde en tête d'un pas à l'autre */
export interface BotBrain {
  slot: number;
  level: BotLevel;
  rng: RngHolder;
  /** La commande qu'il prépare, et son assiette */
  order: number | null;
  plate: number | null;
  plan: Plan | null;
  path: [number, number][];
  /** La case où il doit se tenir, et quand le chemin a été calculé */
  stand: number;
  pathAt: number;
  think: number;
  /** Après un appui, quelques pas pour voir ce que ça a donné */
  settle: number;
  pressed: number;
  progress: { x: number; y: number; at: number };
  jiggle: number;
  jx: number;
  jy: number;
  /** Il a commencé à couper ou à laver (pour savoir quand c'est fini) */
  using: boolean;
  /** Combien de fois il a appuyé pour ce projet (au-delà, il passe à autre chose) */
  tries: number;
  /** Depuis combien de pas il n'a pas de chemin (le radeau est loin, les wagons séparés) */
  stranded: number;
  /** Le pas où il a commencé ce projet (au-delà d'un moment, il y renonce) */
  since: number;
  /** Il aide les autres : ce qu'il prépare est à tout le monde */
  helping: boolean;
  /** Les cases qui ont refusé ce qu'il apportait, jusqu'à tel pas */
  avoid: Map<number, number>;
  lastHeld: Item | null;
  lastSnap: string;
}

/** Ce que les commis d'une table se partagent : à qui est chaque objet qu'ils préparent (et quand il l'a touché) */
export interface BotTable {
  owner: Map<number, { slot: number; at: number }>;
  /** Les cases déjà promises (une planche qu'un commis va utiliser, un plan de travail où il va poser) */
  reserved: Map<number, number>;
  /** Qui prépare quel morceau de quelle commande (« 12:pizza:… »), et depuis quand : les autres n'en refont pas */
  claims: Map<string, { slot: number; at: number }>;
}

export function newBotTable(): BotTable {
  return { owner: new Map(), reserved: new Map(), claims: new Map() };
}

export function newBrain(slot: number, level: BotLevel, seed: number): BotBrain {
  return {
    slot,
    level,
    rng: { rng: (seed ^ (slot * 0x9e3779b1)) >>> 0 || 3 },
    order: null,
    plate: null,
    plan: null,
    path: [],
    stand: -1,
    pathAt: -999,
    think: 0,
    settle: 0,
    pressed: 0,
    progress: { x: 0, y: 0, at: 0 },
    jiggle: 0,
    jx: 0,
    jy: 0,
    using: false,
    tries: 0,
    stranded: 0,
    since: 0,
    helping: false,
    avoid: new Map(),
    lastHeld: null,
    lastSnap: "",
  };
}

// ---------------------------------------------------------------------------
// Ce que voit le commis
// ---------------------------------------------------------------------------

interface View {
  k: Kitchen;
  w: World;
  me: Chef;
  brain: BotBrain;
  table: BotTable;
  off: [number, number][];
  menu: ReturnType<typeof menuOf>;
  /** Chaque objet posé sur une case de ma cuisine */
  on: { cell: number; it: Item }[];
}

/** Ce qu'un commis a préparé reste à lui un moment (les autres n'y touchent pas) ; les ustensiles sont à tous */
const OWN_FRAMES = 25 * 30;
const mine = (v: View, it: Item) => {
  if (it.k === "pot" || it.k === "pan" || it.k === "ext") return true;
  const o = v.table.owner.get(it.id);
  return o === undefined || o.slot === v.me.slot || v.w.frame - o.at > OWN_FRAMES;
};

/** Cette case vient de refuser ce qu'il apportait : il ne réessaie pas tout de suite */
const avoided = (v: View, i: number) => (v.brain.avoid.get(i) ?? -1) > v.w.frame;

const myTeamCell = (v: View, i: number) => v.k.team[i] === v.me.team;

/** Les cases de ma cuisine de ce type */
function cellsOf(v: View, kind: Cell): number[] {
  const out: number[] = [];
  v.k.cells.forEach((c, i) => {
    if (c === kind && myTeamCell(v, i)) out.push(i);
  });
  return out;
}

const burning = (v: View, i: number) => v.w.fire[i]! > 0;

/** Le centre d'une case, là où elle est à ce moment */
function center(v: View, i: number): [number, number] {
  const o = v.off[v.k.section[i]!] ?? [0, 0];
  return [(i % v.k.W) + 0.5 + o[0], Math.floor(i / v.k.W) + 0.5 + o[1]];
}

function dist2(v: View, i: number): number {
  const [x, y] = center(v, i);
  return (x - v.me.x) * (x - v.me.x) + (y - v.me.y) * (y - v.me.y);
}

const byNear = (v: View) => (a: number, b: number) => dist2(v, a) - dist2(v, b);

/** Une case libre où poser quelque chose (un plan de travail, une planche si `board`) : la plus proche de `near` */
function freeSpot(v: View, near: number | null, kinds: Cell[] = [Cell.Counter]): number {
  const ref = near !== null && near >= 0 ? center(v, near) : [v.me.x, v.me.y];
  let best = -1;
  let bestD = Infinity;
  v.k.cells.forEach((c, i) => {
    if (!kinds.includes(c) || !myTeamCell(v, i) || v.w.items[i] || burning(v, i) || avoided(v, i)) return;
    const r = v.table.reserved.get(i);
    if (r !== undefined && r !== v.me.slot) return;
    if (!okCell(v, i)) return;
    const [x, y] = center(v, i);
    // Sur un radeau, une table qui glisse : seulement faute de mieux
    const d = (x - ref[0]!) * (x - ref[0]!) + (y - ref[1]!) * (y - ref[1]!) + (v.k.section[i] ? 40 : 0);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// Le chemin : la grille des cases où l'on peut marcher, à ce moment
// ---------------------------------------------------------------------------

interface Nav {
  W: number;
  H: number;
  free: boolean[];
  /** Où se tenir dans chaque case libre (le milieu, ou un peu à côté quand un wagon décalé la coupe) */
  pt: [number, number][];
  /** Le passage d'une case à sa voisine de droite, et à celle du dessous (pas d'écart entre deux wagons) */
  right: boolean[];
  down: boolean[];
  /** En attendant : d'une position du radeau (ou du wagon) à l'autre, porté par lui */
  links?: Map<number, number[]>;
  at: number;
}

const navCache = new WeakMap<World, Nav>();
/** Ce qui va bouger dans si peu de temps compte déjà : on ne reste pas sur la passerelle quand le train siffle */
const LOOKAHEAD_S = 2;
const NUDGES: [number, number][] = [
  [0, 0],
  [-0.25, 0],
  [0.25, 0],
  [0, -0.25],
  [0, 0.25],
  [-0.3, -0.3],
  [0.3, -0.3],
  [-0.3, 0.3],
  [0.3, 0.3],
];

function nav(v: View): Nav {
  const hit = navCache.get(v.w);
  if (hit && hit.at === v.w.frame) return hit;
  const n = buildNav(v.k, v.off, offsetsAt(v.k, serviceTime(v.w) + LOOKAHEAD_S), v.w.frame);
  navCache.set(v.w, n);
  return n;
}

/** La grille des cases libres quand les morceaux mobiles sont là (`now`), et le resteront encore un instant (`later`) */
function buildNav(k: Kitchen, now: [number, number][], later: [number, number][], at: number): Nav {
  const W = k.W + 3;
  const H = k.H;
  const free: boolean[] = new Array(W * H).fill(false);
  const pt: [number, number][] = new Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (const [dx, dy] of NUDGES) {
        const px = x + 0.5 + dx;
        const py = y + 0.5 + dy;
        const sup = supportAt(k, now, px, py);
        if (!sup || !clearAt(k, now, px, py)) continue;
        // Dans un instant : le même point (emporté par ce qui le porte) est encore sur du sol, et dégagé
        const mx = px + (later[sup.sec]![0] - now[sup.sec]![0]);
        const my = py + (later[sup.sec]![1] - now[sup.sec]![1]);
        if (!supportAt(k, later, mx, my) || !clearAt(k, later, mx, my)) continue;
        free[y * W + x] = true;
        pt[y * W + x] = [px, py];
        break;
      }
    }
  }
  // Le passage entre deux cases voisines : le chemin aussi est du sol, maintenant et dans un instant (au même endroit :
  // c'est là que s'ouvre l'écart entre deux wagons)
  const passable = (a: [number, number], b: [number, number]) => {
    for (const f of [0.25, 0.5, 0.75]) {
      const px = a[0] + (b[0] - a[0]) * f;
      const py = a[1] + (b[1] - a[1]) * f;
      if (!supportAt(k, now, px, py) || !supportAt(k, later, px, py)) return false;
    }
    return true;
  };
  const right: boolean[] = new Array(W * H).fill(false);
  const down: boolean[] = new Array(W * H).fill(false);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!free[i]) continue;
      if (x + 1 < W && free[i + 1]) right[i] = passable(pt[i]!, pt[i + 1]!);
      if (y + 1 < H && free[i + W]) down[i] = passable(pt[i]!, pt[i + W]!);
    }
  }
  return { W, H, free, pt, right, down, at };
}

/**
 * Ce qui est accessible en attendant que les morceaux mobiles se posent (le radeau à quai d'un côté puis de l'autre,
 * les wagons recollés) : la réunion des grilles de chaque position de repos, et les décalages de ces positions.
 */
interface Eventual {
  nav: Nav;
  rests: [number, number][][];
  /** La grille de chaque position de repos (pour savoir où se tenir devant une case quand elle y est) */
  each: Nav[];
}
const eventualCache = new Map<string, Eventual>();

function eventual(k: Kitchen): Eventual {
  const key = `${k.id}:${k.duel}`;
  const hit = eventualCache.get(key);
  if (hit) return hit;
  let rests: [number, number][][] = [[[0, 0]]];
  for (let s = 1; s < k.moving.length; s++) {
    const m = k.motions[s];
    const spots: [number, number][] = m ? m.moves.map((mv) => [mv.dx, mv.dy]) : [[0, 0]];
    rests = rests.flatMap((r) => spots.map((sp) => [...r, sp]));
  }
  let union: Nav | null = null;
  const each: Nav[] = [];
  for (const off of rests) {
    const n = buildNav(k, off, off, -1);
    each.push(n);
    if (!union) union = { ...n, free: [...n.free], pt: [...n.pt], right: [...n.right], down: [...n.down] };
    else
      for (let i = 0; i < n.free.length; i++) {
        if (n.free[i] && !union.free[i]) {
          union.free[i] = true;
          union.pt[i] = n.pt[i]!;
        }
        union.right[i] = union.right[i]! || n.right[i]!;
        union.down[i] = union.down[i]! || n.down[i]!;
      }
  }
  // Monté sur le radeau à un bout, on en descend à l'autre : chaque case de sol d'un morceau mobile, d'une position de
  // repos à l'autre
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    if (a === b) return;
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  const W = union!.W;
  for (let s = 1; s < k.moving.length; s++) {
    if (k.motions[s]?.ground !== "void") continue;
    for (const i of k.moving[s] ?? []) {
      if (k.cells[i] !== Cell.Floor && k.cells[i] !== Cell.Ice) continue;
      const spots = rests.map((off) => {
        const x = Math.floor((i % k.W) + 0.5 + off[s]![0]);
        const y = Math.floor(Math.floor(i / k.W) + 0.5 + off[s]![1]);
        return y * W + x;
      });
      for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) link(spots[a]!, spots[b]!);
    }
  }
  union!.links = links;
  const e = { nav: union!, rests, each };
  eventualCache.set(key, e);
  return e;
}

/** Un chef tiendrait là sans toucher une case solide */
function clearAt(k: Kitchen, off: [number, number][], x: number, y: number): boolean {
  const r = CHEF_R - 0.03;
  const near = (x0: number, y0: number) => {
    const qx = x < x0 ? x0 : x > x0 + 1 ? x0 + 1 : x;
    const qy = y < y0 ? y0 : y > y0 + 1 ? y0 + 1 : y;
    return (x - qx) * (x - qx) + (y - qy) * (y - qy) < r * r;
  };
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  for (let yy = iy - 1; yy <= iy + 1; yy++) {
    for (let xx = ix - 1; xx <= ix + 1; xx++) {
      if (xx < 0 || yy < 0 || xx >= k.W || yy >= k.H) continue;
      const i = yy * k.W + xx;
      if (k.section[i] === 0 && solid(k.cells[i]!) && near(xx, yy)) return false;
    }
  }
  for (let s = 1; s < k.moving.length; s++) {
    const o = off[s]!;
    for (const i of k.moving[s] ?? []) {
      if (solid(k.cells[i]!) && near((i % k.W) + o[0], Math.floor(i / k.W) + o[1])) return false;
    }
  }
  return true;
}

/** Les cases de sol d'où l'on atteint cette case (en la regardant) : leur point de passage est bien en face d'elle */
function standFor(v: View, target: number, n: Nav = nav(v), off: [number, number][] = v.off): number[] {
  const o = off[v.k.section[target]!] ?? [0, 0];
  const cx = (target % v.k.W) + 0.5 + o[0];
  const cy = Math.floor(target / v.k.W) + 0.5 + o[1];
  const out: number[] = [];
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    // Le point idéal, à un pas de la case ; la case de la grille qui le contient, si son point de passage en est près
    const ix = cx + dx * 0.95;
    const iy = cy + dy * 0.95;
    const x = Math.floor(ix);
    const y = Math.floor(iy);
    if (x < 0 || y < 0 || x >= n.W || y >= n.H) continue;
    const i = y * n.W + x;
    if (!n.free[i]) continue;
    const p = n.pt[i]!;
    // Bien en face : écarté de moins de 0,4 sur le côté, et pas plus loin qu'il ne faut
    const side = dx !== 0 ? Math.abs(p[1] - cy) : Math.abs(p[0] - cx);
    const along = dx !== 0 ? Math.abs(p[0] - cx) : Math.abs(p[1] - cy);
    if (side < 0.4 && along > 0.75 && along < 1.3) out.push(i);
  }
  return out;
}

/** Le chemin (de case en case) jusqu'à l'une de ces cases, ou null */
function route(v: View, goals: number[], n: Nav = nav(v)): number[] | null {
  if (goals.length === 0) return null;
  const sx = Math.max(0, Math.min(n.W - 1, Math.floor(v.me.x)));
  const sy = Math.max(0, Math.min(n.H - 1, Math.floor(v.me.y)));
  const start = sy * n.W + sx;
  const goal = new Set(goals);
  const prev = new Map<number, number>([[start, -1]]);
  const queue = [start];
  let found = -1;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q]!;
    if (goal.has(c)) {
      found = c;
      break;
    }
    const x = c % n.W;
    const y = Math.floor(c / n.W);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n.W || ny >= n.H) continue;
      const j = ny * n.W + nx;
      if (prev.has(j) || !n.free[j]) continue;
      // Depuis la case de départ (où il se tient, même mal placé), on peut toujours partir
      if (c !== start) {
        const ok = dx === 1 ? n.right[c] : dx === -1 ? n.right[j] : dy === 1 ? n.down[c] : n.down[j];
        if (!ok) continue;
      }
      prev.set(j, c);
      queue.push(j);
    }
    for (const j of n.links?.get(c) ?? []) {
      if (prev.has(j)) continue;
      prev.set(j, c);
      queue.push(j);
    }
  }
  if (found < 0) return null;
  const path: number[] = [];
  for (let c = found; c !== -1 && c !== start; c = prev.get(c)!) path.push(c);
  return path.reverse();
}

/** On peut aller se servir de cette case : maintenant, ou en attendant le radeau, les wagons */
function reachable(v: View, target: number): boolean {
  if (route(v, standFor(v, target)) !== null) return true;
  if (v.k.moving.length <= 1) return false;
  const e = eventual(v.k);
  return e.rests.some((off, r) => route(v, standFor(v, target, e.each[r], off), e.nav) !== null);
}

/** Une case dont on peut se servir maintenant : à portée, pas en feu, et qui n'a pas refusé à l'instant */
function okCell(v: View, i: number): boolean {
  return !burning(v, i) && !avoided(v, i) && reachable(v, i);
}

// ---------------------------------------------------------------------------
// Ce qu'il y a à faire
// ---------------------------------------------------------------------------

/** L'aliment cru qui donne celui-là une fois coupé */
const CHOPPED_FROM: Partial<Record<string, FoodId>> = Object.fromEntries(
  Object.entries(CHOP)
    .filter(([, v]) => !v!.base)
    .map(([k, v]) => [v!.to, k as FoodId]),
);
const PAN_FROM: Partial<Record<string, FoodId>> = Object.fromEntries(Object.entries(PAN).map(([k, v]) => [v!.to, k as FoodId]));
const FRY_FROM: Partial<Record<string, FoodId>> = Object.fromEntries(Object.entries(FRY).map(([k, v]) => [v!.to, k as FoodId]));
const POT_FROM: Partial<Record<string, FoodId>> = Object.fromEntries(Object.entries(POT).map(([k, v]) => [v!, k as FoodId]));
const DOUGH_OF: Partial<Record<BaseKind, FoodId>> = { pizza: "patePizza", tarte: "pateTarte" };

/** La caisse (de ma cuisine) qui sort cet aliment ou ce fond */
function crateFor(v: View, good: string): number {
  const list = cellsOf(v, Cell.Crate).filter((i) => {
    const g = v.k.crate[i];
    return g === good && !v.w.items[i] && !burning(v, i);
  });
  list.sort(byNear(v));
  return list.find((i) => okCell(v, i)) ?? -1;
}

/** Les objets posés qui donnent ce morceau tel quel, prêts (dans ma cuisine, à moi ou à personne) */
function readyCells(v: View, part: Part): number[] {
  return v.on
    .filter(({ cell, it }) => it.k !== "plate" && partOf(it) === part && mine(v, it) && !burning(v, cell) && okCell(v, cell))
    .map((x) => x.cell)
    .sort(byNear(v));
}

/** Ce que demande la commande, et ce qui est déjà sur mon assiette */
function myPlate(v: View): { it: Item; cell: number | null } | null {
  if (v.brain.plate === null) return null;
  if (v.me.held?.id === v.brain.plate) return { it: v.me.held, cell: null };
  const found = v.on.find((x) => x.it.id === v.brain.plate);
  if (found && found.it.k === "plate" && !found.it.dirty) return { it: found.it, cell: found.cell };
  return null;
}

function missingFor(order: Order, plate: Item | null): Part[] {
  const left = [...RECIPES[order.r].parts];
  for (const p of plate?.c ?? []) {
    const i = left.indexOf(p);
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

/** Une assiette propre et vide à prendre : posée quelque part, à l'égouttoir, ou au retour (sans vaisselle) */
function cleanPlateSource(v: View): number {
  const spots: number[] = [];
  for (const { cell, it } of v.on) {
    if (it.k === "plate" && !it.dirty && (it.c ?? []).length === 0 && mine(v, it) && v.k.cells[cell] !== Cell.Pass) spots.push(cell);
  }
  for (const r of cellsOf(v, Cell.Rack)) if (v.w.stack[r]! > 0) spots.push(r);
  if (!v.k.def.washing) {
    const r = returnFor(v.k, v.me.team);
    if (r >= 0 && v.w.stack[r]! > 0) spots.push(r);
  }
  spots.sort(byNear(v));
  return spots.find((i) => !burning(v, i) && okCell(v, i)) ?? -1;
}

/** La première chose à faire pour qu'existe (un jour) ce morceau ; null s'il est déjà en route ou impossible */
function produce(v: View, part: Part, depth = 0): Plan | null {
  if (depth > 4) return null;
  const food = part as FoodId;
  // Un aliment coupé
  const raw = CHOPPED_FROM[food];
  if (raw) {
    const boards = cellsOf(v, Cell.Board).filter((b) => !burning(v, b));
    const onBoard = boards.find((b) => {
      const it = v.w.items[b];
      return it?.k === "food" && it.f === raw && mine(v, it) && okCell(v, b);
    });
    if (onBoard !== undefined) return { t: "use", cell: onBoard };
    const loose = v.on.find(({ cell, it }) => it.k === "food" && it.f === raw && mine(v, it) && v.k.cells[cell] !== Cell.Board);
    const board = freeSpot(v, loose?.cell ?? null, [Cell.Board]);
    if (board < 0) return null;
    if (loose) return { t: "take", cell: loose.cell, then: board };
    const crate = crateFor(v, raw);
    return crate >= 0 ? { t: "take", cell: crate, then: board } : null;
  }
  // Ce qui sort tel quel d'une caisse (le sucre, le pain) : il ira directement sur l'assiette
  if (straightFromCrate(part)) return null;
  // La marmite
  const potIn = POT_FROM[part];
  if (potIn) {
    const pots = v.on.filter(({ it }) => it.k === "pot" && mine(v, it) && (it.p ?? 0) < 2);
    const fits = pots
      .filter(({ it }) => (it.c ?? []).length < POT_FULL && (it.c ?? []).every((x) => x === potIn))
      .sort((a, b) => (b.it.c ?? []).length - (a.it.c ?? []).length);
    // Une marmite pleine de ça, en train de cuire : c'est en route
    const full = pots.find(({ it }) => (it.c ?? []).length === POT_FULL && (it.c ?? []).every((x) => x === potIn));
    if (full) {
      if (v.k.cells[full.cell] !== Cell.Stove) {
        const stove = cellsOf(v, Cell.Stove).find((s) => !v.w.items[s] && !burning(v, s) && okCell(v, s));
        return stove !== undefined ? { t: "take", cell: full.cell, then: stove } : null;
      }
      return null;
    }
    const pot = fits.find(({ cell }) => okCell(v, cell));
    if (!pot) return null;
    const have = v.on.find(({ cell, it }) => it.k === "food" && it.f === potIn && mine(v, it) && okCell(v, cell));
    if (have) return { t: "take", cell: have.cell, then: pot.cell };
    if (potIn === "moules") {
      const crate = crateFor(v, "moules");
      return crate >= 0 ? { t: "take", cell: crate, then: pot.cell } : null;
    }
    return produce(v, potIn, depth + 1);
  }
  // La poêle
  const panIn = PAN_FROM[part];
  if (panIn) {
    const pans = v.on.filter(({ cell, it }) => it.k === "pan" && mine(v, it) && v.k.cells[cell] === Cell.Stove && okCell(v, cell));
    if (pans.some(({ it }) => it.c?.[0] === panIn)) return null;
    const empty = pans.find(({ it }) => panTakes(it, panIn));
    if (!empty) return null;
    const have = v.on.find(({ cell, it }) => it.k === "food" && it.f === panIn && mine(v, it) && okCell(v, cell));
    if (have) return { t: "take", cell: have.cell, then: empty.cell };
    const crate = crateFor(v, panIn);
    return crate >= 0 ? { t: "take", cell: crate, then: empty.cell } : null;
  }
  // La friteuse
  const fryIn = FRY_FROM[part];
  if (fryIn) {
    const fryers = cellsOf(v, Cell.Fryer).filter((f) => !burning(v, f) && okCell(v, f));
    if (fryers.some((f) => v.w.items[f]?.f === fryIn)) return null;
    const empty = fryers.find((f) => !v.w.items[f]);
    if (empty === undefined) return null;
    const have = v.on.find(
      ({ cell, it }) => it.k === "food" && it.f === fryIn && mine(v, it) && v.k.cells[cell] !== Cell.Fryer && okCell(v, cell),
    );
    if (have) return { t: "take", cell: have.cell, then: empty };
    return produce(v, fryIn, depth + 1);
  }
  // Un fond garni, cuit au four
  const baked = splitBaked(part);
  if (baked) {
    const want = baked.toppings;
    const sameSet = (c: readonly string[]) => c.length === want.length && want.every((t) => c.includes(t));
    const ovens = cellsOf(v, Cell.Oven).filter((o) => !burning(v, o) && okCell(v, o));
    if (ovens.some((o) => v.w.items[o]?.k === "base" && v.w.items[o]!.b === baked.base && sameSet(v.w.items[o]!.c ?? []))) return null;
    const bases = v.on.filter(
      ({ cell, it }) =>
        it.k === "base" &&
        it.b === baked.base &&
        (it.p ?? 0) === 0 &&
        mine(v, it) &&
        v.k.cells[cell] !== Cell.Oven &&
        (it.c ?? []).every((t) => want.includes(t as FoodId)) &&
        okCell(v, cell),
    );
    const base = bases.sort((a, b) => (b.it.c ?? []).length - (a.it.c ?? []).length)[0];
    if (base) {
      const lacking = want.filter((t) => !(base.it.c ?? []).includes(t));
      if (lacking.length === 0) {
        const oven = ovens.find((o) => !v.w.items[o]);
        return oven !== undefined ? { t: "take", cell: base.cell, then: oven } : null;
      }
      for (const t of lacking) {
        const have = v.on.find(({ cell, it }) => it.k === "food" && it.f === t && mine(v, it) && okCell(v, cell));
        if (have) return { t: "take", cell: have.cell, then: base.cell };
        if (t === "sucre") {
          const crate = crateFor(v, "sucre");
          if (crate >= 0) return { t: "take", cell: crate, then: base.cell };
          continue;
        }
        const p = produce(v, t, depth + 1);
        if (p) return p;
      }
      return null;
    }
    // Pas encore de fond : la pâte à étaler, ou le pain de mie qui sort de sa caisse
    const dough = DOUGH_OF[baked.base];
    if (!dough) {
      const crate = crateFor(v, `base:${baked.base}`);
      const spot = freeSpot(v, crate);
      return crate >= 0 && spot >= 0 ? { t: "take", cell: crate, then: spot } : null;
    }
    const boards = cellsOf(v, Cell.Board).filter((b) => !burning(v, b));
    const rolling = boards.find((b) => v.w.items[b]?.f === dough && mine(v, v.w.items[b]!) && okCell(v, b));
    if (rolling !== undefined) return { t: "use", cell: rolling };
    const board = freeSpot(v, null, [Cell.Board]);
    if (board < 0) return null;
    const crate = crateFor(v, dough);
    return crate >= 0 ? { t: "take", cell: crate, then: board } : null;
  }
  return null;
}

/** Les morceaux qui se prennent tels quels dans une caisse (le sucre, le pain) et vont droit sur l'assiette */
function straightFromCrate(part: Part): boolean {
  const f = part as FoodId;
  return !CHOPPED_FROM[f] && !PAN_FROM[f] && !FRY_FROM[f] && !POT_FROM[f] && !splitBaked(part) && !(f in POT) && CHOP[f] === undefined;
}

// ---------------------------------------------------------------------------
// Décider
// ---------------------------------------------------------------------------

function decide(v: View): Plan {
  const { w, me, brain } = v;
  const team = w.teams[me.team]!;
  const held = me.held;
  // Le feu d'abord : le commis le plus près de l'extincteur y va
  const fires = w.fire.map((f, i) => (f > 0 && myTeamCell(v, i) ? i : -1)).filter((i) => i >= 0);
  if (held?.k === "ext") {
    if (fires.length > 0) return { t: "spray", cell: fires.sort(byNear(v))[0]! };
    const home = held.home ?? -1;
    if (home >= 0 && !w.items[home] && okCell(v, home)) return { t: "put", cell: home };
    const spot = freeSpot(v, null);
    return spot >= 0 ? { t: "put", cell: spot } : { t: "wait", frames: 10, cell: -1 };
  }
  if (fires.length > 0 && firefighter(v)) {
    if (held) {
      const spot = freeSpot(v, null);
      if (spot >= 0) return { t: "put", cell: spot };
    } else {
      const ext = v.on.find(({ it }) => it.k === "ext");
      if (ext && !burning(v, ext.cell) && okCell(v, ext.cell)) return { t: "take", cell: ext.cell, then: -1 };
    }
  }

  // Ce qu'on tient décide de la suite
  if (held) return carry(v, held);

  // Les mains vides. Ma commande existe-t-elle encore ?
  let order = team.orders.find((o) => o.id === brain.order) ?? null;
  if (!order) {
    order = pickOrder(v);
    // Pas d'assiette pour la servir : il ne la prend pas, il donne un coup de main
    if (order && !myPlate(v) && cleanPlateSource(v) < 0) order = null;
    brain.order = order?.id ?? null;
  }
  brain.helping = !order;
  // Ce qui va brûler (à moi ou à personne) : on l'enlève du feu si on ne peut pas le servir tout de suite
  const rescue = rescueFood(v);
  if (rescue) return rescue;
  // Les planches toutes prises par ce qui est déjà coupé : on en libère une
  const clutter = declutter(v);
  if (clutter) return clutter;
  // Plus d'assiette propre nulle part : la vaisselle
  if (v.k.def.washing && cleanPlateSource(v) < 0 && !myPlate(v)) {
    const dish = dishes(v);
    if (dish) return dish;
  }
  if (!order) return dishes(v) ?? help(v) ?? idle(v);

  const plate = myPlate(v);
  const missing = missingFor(order, plate?.it ?? null);
  // Tout est sur l'assiette : on sert
  if (plate && missing.length === 0 && plate.cell !== null) return { t: "take", cell: plate.cell, then: passFor(v) };
  // L'assiette manque : en prendre une, la poser près du passe
  if (!plate) {
    const src = cleanPlateSource(v);
    if (src >= 0) {
      const spot = freeSpot(v, passFor(v));
      if (spot >= 0) {
        reserve(v, spot);
        return { t: "take", cell: src, then: spot };
      }
    }
  }
  // Un morceau prêt : on l'amène à l'assiette (un aliment posé), ou l'assiette à lui (dans une marmite, une poêle…)
  if (plate && plate.cell !== null) {
    for (const part of missing) {
      const ready = readyCells(v, part);
      if (ready.length > 0) {
        const at = ready[0]!;
        const it = w.items[at]!;
        if (it.k === "food" || (it.k === "base" && v.k.cells[at] !== Cell.Oven)) return { t: "take", cell: at, then: plate.cell };
        return { t: "take", cell: plate.cell, then: at };
      }
      if (straightFromCrate(part)) {
        const crate = crateFor(v, part);
        if (crate >= 0) return { t: "take", cell: crate, then: plate.cell };
      }
    }
  }
  // Le reste à préparer
  for (const part of missing) {
    if (claimedByOther(v, order.id, part)) continue;
    const p = produce(v, part);
    if (p) {
      claim(v, order.id, part);
      return p;
    }
  }
  // Tout cuit : on attend près de ce qui cuit, ou on fait la vaisselle en attendant
  return dishes(v) ?? { t: "wait", frames: 12, cell: -1 };
}

/** Un coup de main : préparer ce qui manque aux commandes des autres (sans toucher à leurs assiettes) */
function help(v: View): Plan | null {
  const team = v.w.teams[v.me.team]!;
  const plates = new Map<number, Item>();
  for (const [slot, b] of brainsOf(v.table)) {
    if (slot === v.me.slot || b.order === null || b.plate === null) continue;
    const p = v.on.find((x) => x.it.id === b.plate)?.it ?? v.w.chefs[slot]?.held;
    if (p && p.id === b.plate) plates.set(b.order, p);
  }
  for (const o of [...team.orders].sort((a, b) => a.until - b.until)) {
    for (const part of missingFor(o, plates.get(o.id) ?? null)) {
      // Ce qui est déjà prêt quelque part ne manque pas, ce qu'un autre prépare non plus
      if (readyCells(v, part).length > 0 || claimedByOther(v, o.id, part)) continue;
      const p = produce(v, part);
      if (p) {
        claim(v, o.id, part);
        return p;
      }
    }
  }
  return null;
}

/** Un morceau d'une commande qu'un autre commis prépare en ce moment */
const CLAIM_FRAMES = 8 * 30;
function claimedByOther(v: View, order: number, part: Part): boolean {
  const c = v.table.claims.get(`${order}:${part}`);
  return c !== undefined && c.slot !== v.me.slot && v.w.frame - c.at < CLAIM_FRAMES;
}
function claim(v: View, order: number, part: Part) {
  v.table.claims.set(`${order}:${part}`, { slot: v.me.slot, at: v.w.frame });
}

/** Une planche encombrée par ce qui n'est plus à couper, alors qu'il en faut une : on la débarrasse */
function declutter(v: View): Plan | null {
  const boards = cellsOf(v, Cell.Board).filter((b) => !burning(v, b));
  const busy = boards.filter((b) => {
    const it = v.w.items[b];
    return it && !(it.k === "food" && it.f && CHOP[it.f]);
  });
  if (busy.length === 0 || busy.length < boards.length - 1) return null;
  for (const b of busy.sort(byNear(v))) {
    const it = v.w.items[b]!;
    if (!mine(v, it) || !okCell(v, b)) continue;
    const spot = freeSpot(v, b);
    if (spot >= 0) return { t: "take", cell: b, then: spot };
  }
  return null;
}

/** Le commis le plus près de l'extincteur s'occupe du feu (un seul) */
function firefighter(v: View): boolean {
  const ext = v.on.find(({ it }) => it.k === "ext");
  if (!ext) return false;
  const [ex, ey] = center(v, ext.cell);
  const bots = v.w.chefs.filter((c) => c.team === v.me.team && c.out === 0);
  let best = v.me;
  let bestD = Infinity;
  for (const c of bots) {
    if (!isBot(v, c.slot)) continue;
    const d = (c.x - ex) ** 2 + (c.y - ey) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.slot === v.me.slot;
}

const botSlots = new WeakMap<BotTable, Set<number>>();
function isBot(v: View, slot: number): boolean {
  return botSlots.get(v.table)?.has(slot) ?? slot === v.me.slot;
}

/** La commande la plus pressée que personne d'autre ne prépare (ou, faute de mieux, la plus pressée) */
function pickOrder(v: View): Order | null {
  const team = v.w.teams[v.me.team]!;
  const taken = new Set<number>();
  for (const [slot, b] of brainsOf(v.table)) if (slot !== v.me.slot && b.order !== null) taken.add(b.order);
  const list = [...team.orders].sort((a, b) => a.until - b.until).filter((o) => !taken.has(o.id));
  // Une assiette déjà commencée : de préférence une commande qui la complète
  const plate = myPlate(v);
  if (plate && (plate.it.c ?? []).length > 0) {
    const fit = list.find((o) => missingFor(o, plate.it).length === RECIPES[o.r].parts.length - (plate.it.c ?? []).length);
    if (fit) return fit;
  }
  return list[0] ?? null;
}

const brainRegistry = new WeakMap<BotTable, Map<number, BotBrain>>();
function brainsOf(t: BotTable): Map<number, BotBrain> {
  let m = brainRegistry.get(t);
  if (!m) {
    m = new Map();
    brainRegistry.set(t, m);
  }
  return m;
}

function passFor(v: View): number {
  const list = cellsOf(v, Cell.Pass).sort(byNear(v));
  return list.find((p) => !burning(v, p) && okCell(v, p)) ?? list[0] ?? -1;
}

function reserve(v: View, cell: number) {
  v.table.reserved.set(cell, v.me.slot);
}

/** Ce qui cuit trop longtemps sans personne pour le servir : hors du feu */
function rescueFood(v: View): Plan | null {
  for (const { cell, it } of v.on) {
    const kind = v.k.cells[cell];
    const p = it.p ?? 0;
    if (p < 1.45 || p >= 2 || !mine(v, it) || burning(v, cell)) continue;
    const cooking =
      (kind === Cell.Stove && (it.k === "pot" || it.k === "pan") && (it.c ?? []).length > 0) || kind === Cell.Fryer || kind === Cell.Oven;
    if (!cooking || !okCell(v, cell)) continue;
    // Une assiette à moi qui le prendrait : on y va avec elle
    const plate = myPlate(v);
    if (plate && plate.cell !== null && plateTakes(plate.it, partOf(it), v.menu)) return { t: "take", cell: plate.cell, then: cell };
    const spot = freeSpot(v, cell);
    if (spot >= 0) return { t: "take", cell, then: spot };
  }
  // Ce qui a brûlé dans une marmite ou une poêle : à la poubelle
  for (const { cell, it } of v.on) {
    if ((it.k === "pot" || it.k === "pan") && it.c?.[0] === "charbon" && !burning(v, cell) && mine(v, it) && okCell(v, cell)) {
      const trash = cellsOf(v, Cell.Trash).sort(byNear(v))[0];
      if (trash !== undefined) return { t: "take", cell, then: trash };
    }
    if (it.k === "food" && it.f === "charbon" && !burning(v, cell) && okCell(v, cell)) {
      const trash = cellsOf(v, Cell.Trash).sort(byNear(v))[0];
      if (trash !== undefined) return { t: "take", cell, then: trash };
    }
  }
  return null;
}

/** La vaisselle : laver ce qui attend à l'évier, ou y porter ce qui attend au retour */
function dishes(v: View): Plan | null {
  if (!v.k.def.washing) return null;
  const sinks = cellsOf(v, Cell.Sink).filter((s) => !burning(v, s) && okCell(v, s));
  const busy = new Set(v.w.chefs.filter((c) => c.act === ACT_WASH && c.slot !== v.me.slot).map((c) => c.cell));
  const sink = sinks.find((s) => v.w.stack[s]! > 0 && !busy.has(s));
  // Pas la peine d'en laver dix d'avance
  const clean = cellsOf(v, Cell.Rack).reduce((n, r) => n + v.w.stack[r]!, 0);
  if (sink !== undefined && clean < 3) return { t: "use", cell: sink };
  const ret = returnFor(v.k, v.me.team);
  if (ret >= 0 && v.w.stack[ret]! > 0 && sinks.length > 0 && okCell(v, ret)) return { t: "take", cell: ret, then: sinks[0]! };
  return null;
}

/** Rien à faire : il attend un peu */
function idle(_v: View): Plan {
  return { t: "wait", frames: 20, cell: -1 };
}

/** On tient quelque chose : où le porter */
function carry(v: View, held: Item): Plan {
  const { w, k, menu } = v;
  const trash = () => cellsOf(v, Cell.Trash).sort(byNear(v))[0] ?? -1;
  const park = (near: number | null = null): Plan => {
    const spot = freeSpot(v, near);
    return spot >= 0 ? { t: "put", cell: spot } : { t: "wait", frames: 10, cell: -1 };
  };
  const order = w.teams[v.me.team]!.orders.find((o) => o.id === v.brain.order) ?? null;
  const plate = myPlate(v);
  if (held.k === "plate") {
    if (held.dirty) {
      const sink = cellsOf(v, Cell.Sink).sort(byNear(v))[0];
      return sink !== undefined ? { t: "put", cell: sink } : park();
    }
    // Mon assiette : servie si complète, sinon elle va chercher ce qui est prêt dans une marmite, une poêle, le four…
    if (order && (plate?.it.id === held.id || v.brain.plate === null)) {
      v.brain.plate = held.id;
      v.table.owner.set(held.id, { slot: v.me.slot, at: v.w.frame });
      const missing = missingFor(order, held);
      if (missing.length === 0) return { t: "put", cell: passFor(v) };
      for (const part of missing) {
        const ready = readyCells(v, part);
        const inside = ready.find((c) => w.items[c]!.k !== "food" && !(w.items[c]!.k === "base" && k.cells[c] !== Cell.Oven));
        if (inside !== undefined) return { t: "put", cell: inside };
      }
      return park(passFor(v));
    }
    // L'assiette complète d'une autre commande : au passe
    if ((held.c ?? []).length > 0) {
      const dish = w.teams[v.me.team]!.orders.find(
        (o) => missingFor(o, held).length === 0 && (held.c ?? []).length === RECIPES[o.r].parts.length,
      );
      if (dish) return { t: "put", cell: passFor(v) };
    }
    return park(passFor(v));
  }
  if (held.k === "food") {
    if (held.f === "charbon") return { t: "put", cell: trash() };
    const f = held.f!;
    // Sur mon assiette
    if (plate && plate.cell !== null && plateTakes(plate.it, partOf(held), menu)) return { t: "put", cell: plate.cell };
    // À couper
    if (CHOP[f] && !CHOP[f]!.base) {
      const board = freeSpot(v, null, [Cell.Board]);
      if (board >= 0) return { t: "put", cell: board };
      return park();
    }
    if (CHOP[f]?.base) {
      const board = freeSpot(v, null, [Cell.Board]);
      return board >= 0 ? { t: "put", cell: board } : park();
    }
    // Dans une marmite, une poêle, la friteuse, sur un fond
    const pot = v.on.find(({ cell, it }) => it.k === "pot" && potTakes(it, f) && mine(v, it) && okCell(v, cell));
    if (pot) return { t: "put", cell: pot.cell };
    const pan = v.on.find(({ cell, it }) => it.k === "pan" && k.cells[cell] === Cell.Stove && panTakes(it, f) && okCell(v, cell));
    if (pan) return { t: "put", cell: pan.cell };
    if (f in FRY) {
      const fryer = cellsOf(v, Cell.Fryer).find((c) => !w.items[c] && !burning(v, c) && okCell(v, c));
      if (fryer !== undefined) return { t: "put", cell: fryer };
    }
    const base = v.on.find(
      ({ cell, it }) => it.k === "base" && baseTakes(it, f) && mine(v, it) && k.cells[cell] !== Cell.Oven && okCell(v, cell),
    );
    if (base) return { t: "put", cell: base.cell };
    // Une autre assiette qui le prendrait
    const other = v.on.find(
      ({ cell, it }) => it.k === "plate" && plateTakes(it, partOf(held), menu) && mine(v, it) && okCell(v, cell) && (it.c ?? []).length > 0,
    );
    if (other) return { t: "put", cell: other.cell };
    return park(plate?.cell ?? null);
  }
  if (held.k === "pot" || held.k === "pan") {
    if (held.c?.[0] === "charbon") return { t: "put", cell: trash() };
    const part = partOf(held);
    if (part && plate && plate.cell !== null && plateTakes(plate.it, part, menu)) return { t: "put", cell: plate.cell };
    const stove = cellsOf(v, Cell.Stove)
      .filter((s) => !w.items[s] && !burning(v, s) && okCell(v, s))
      .sort(byNear(v))[0];
    // Ce qui est cuit reste hors du feu ; le reste y retourne
    if ((held.p ?? 0) >= 1 && part) return park(plate?.cell ?? null);
    return stove !== undefined ? { t: "put", cell: stove } : park();
  }
  if (held.k === "base") {
    if ((held.p ?? 0) >= 1) {
      if (plate && plate.cell !== null && plateTakes(plate.it, partOf(held), menu)) return { t: "put", cell: plate.cell };
      return park(plate?.cell ?? null);
    }
    // Garni comme il faut pour une commande : au four
    const wanted = w.teams[v.me.team]!.orders.some((o) =>
      RECIPES[o.r].parts.some((p) => {
        const s = splitBaked(p);
        return s && s.base === held.b && s.toppings.length === (held.c ?? []).length && s.toppings.every((t) => (held.c ?? []).includes(t));
      }),
    );
    if (wanted) {
      const oven = cellsOf(v, Cell.Oven).find((o) => !w.items[o] && !burning(v, o) && okCell(v, o));
      if (oven !== undefined) return { t: "put", cell: oven };
    }
    return park();
  }
  return park();
}

// ---------------------------------------------------------------------------
// Faire : marcher jusqu'à la case, la regarder, appuyer
// ---------------------------------------------------------------------------

function makeView(w: World, me: Chef, brain: BotBrain, table: BotTable): View {
  const k = buildKitchen(w.kitchen, w.duel);
  const off = offsetsAt(k, serviceTime(w));
  brainsOf(table).set(me.slot, brain);
  let bots = botSlots.get(table);
  if (!bots) botSlots.set(table, (bots = new Set()));
  bots.add(me.slot);
  const on: View["on"] = [];
  w.items.forEach((it, cell) => {
    if (it && k.team[cell] === me.team) on.push({ cell, it });
  });
  return { k, w, me, brain, table, off, menu: menuOf(w.kitchen), on };
}

/** Pour les tests : ce que déciderait le commis maintenant, et ce qu'il produirait pour chaque morceau */
export function explain(w: World, slot: number, brain: BotBrain, table: BotTable, parts: Part[]): string {
  const v = makeView(w, w.chefs[slot]!, brain, table);
  const out = parts.map((p) => `${p}: ${JSON.stringify(produce(v, p))} prêt=${JSON.stringify(readyCells(v, p))}`);
  return out.join(" | ");
}

/** La commande du commis pour ce pas */
export function botInput(w: World, slot: number, brain: BotBrain, table: BotTable): Input {
  const me = w.chefs[slot];
  if (!me || w.phase !== 1) return NO_INPUT;
  if (me.out > 0) {
    // Tombé : à son retour, il repart d'un chemin neuf
    brain.path = [];
    return NO_INPUT;
  }
  const v = makeView(w, me, brain, table);
  const { k, off, on } = v;
  const lvl = LEVELS[brain.level];

  // Ce qu'il tient est à lui (sauf quand il aide : c'est pour les autres)
  if (me.held && !brain.helping) table.owner.set(me.held.id, { slot: me.slot, at: w.frame });
  else if (me.held) table.owner.delete(me.held.id);
  // Son assiette a disparu (servie, perdue) : il n'en a plus
  if (brain.plate !== null && me.held?.id !== brain.plate && !on.some((x) => x.it.id === brain.plate)) brain.plate = null;
  // Une assiette propre en main, qui va avec sa commande : c'est la sienne
  const order = w.teams[me.team]!.orders.find((o) => o.id === brain.order);
  if (brain.plate === null && order && me.held?.k === "plate" && !me.held.dirty && (me.held.n ?? 1) === 1) {
    const left = missingFor(order, me.held);
    if (left.length === RECIPES[order.r].parts.length - (me.held.c ?? []).length) brain.plate = me.held.id;
  }
  if (brain.settle > 0) {
    brain.settle--;
    return NO_INPUT;
  }
  // Couper, laver : il attend que ce soit fini
  if (brain.using) {
    if (me.act === ACT_CHOP || me.act === ACT_WASH) return NO_INPUT;
    brain.using = false;
    brain.plan = null;
    brain.think = lvl.think;
  }
  if (brain.think > 0) {
    brain.think--;
    return NO_INPUT;
  }
  // Un projet qui traîne (plus de quinze secondes), ou le feu qui prend alors qu'il est le plus près de l'extincteur :
  // il y renonce et décide à nouveau
  if (brain.plan && brain.plan.t !== "spray" && brain.plan.t !== "wait") {
    const fire = w.fire.some((f, i) => f > 0 && k.team[i] === me.team);
    const onFire = fire && me.held?.k !== "ext" && firefighter(v) && !(brain.plan.t === "take" && w.items[brain.plan.cell]?.k === "ext");
    if (w.frame - brain.since > 15 * 30 || onFire) brain.plan = null;
  }
  if (!brain.plan) {
    brain.plan = decide(v);
    brain.path = [];
    brain.stand = -1;
    brain.tries = 0;
    brain.since = w.frame;
    brain.progress = { x: me.x, y: me.y, at: w.frame };
  }
  const plan = brain.plan;
  if (plan.t === "wait") {
    plan.frames--;
    if (plan.frames <= 0) brain.plan = null;
    return NO_INPUT;
  }
  if (plan.t === "pickup") {
    brain.plan = null;
    return NO_INPUT;
  }
  // Le but : la case dont il faut se servir
  const target = plan.t === "take" ? plan.cell : plan.cell;
  if (target < 0) {
    brain.plan = null;
    brain.think = lvl.think;
    return NO_INPUT;
  }
  // Déjà devant : on se sert
  const facing = targetCell(k, off, me) === target;
  const [tx, ty] = center(v, target);
  const close = (tx - me.x) * (tx - me.x) + (ty - me.y) * (ty - me.y) < 1.25 * 1.25;
  if (plan.t === "spray") {
    if (w.fire[target]! <= 0) {
      brain.plan = null;
      return NO_INPUT;
    }
    const d = Math.sqrt((tx - me.x) ** 2 + (ty - me.y) ** 2);
    if (d < 2.2) {
      // Face au feu, Utiliser tenu
      const fx = (tx - me.x) / Math.max(d, 1e-6);
      const fy = (ty - me.y) / Math.max(d, 1e-6);
      const aligned = fx * me.fx + fy * me.fy > 0.92;
      return { x: aligned ? 0 : fx * 0.3, y: aligned ? 0 : fy * 0.3, held: USE, pressed: 0 };
    }
  }
  // Sur une case d'où l'on atteint le but : il ne reste qu'à se tourner vers lui
  const n = nav(v);
  const here = Math.floor(me.y) * n.W + Math.floor(me.x);
  const inStand = plan.t !== "spray" && standFor(v, target).includes(here);
  if ((close || inStand) && facing && plan.t !== "spray") return press(v, plan);
  if ((close || inStand) && plan.t !== "spray") {
    // Se tourner vers la case : pousser un peu vers elle
    const d = Math.sqrt((tx - me.x) ** 2 + (ty - me.y) ** 2) || 1;
    // Sur sa case de sol, on ne pousse que pour se tourner
    return { x: ((tx - me.x) / d) * 0.45, y: ((ty - me.y) / d) * 0.45, held: 0, pressed: 0 };
  }
  // Le chemin (recalculé plus souvent quand un wagon ou le radeau va bouger)
  if (brain.path.length === 0 || w.frame - brain.pathAt > (motionSoon(v) ? 6 : 20)) {
    const stands = standFor(v, target);
    const path = route(v, stands);
    brain.pathAt = w.frame;
    if (!path) {
      // Pas de chemin pour l'instant (le radeau est de l'autre côté, les wagons séparés) : monter sur ce qui bouge, ou attendre
      const ride = rideTowards(v);
      if (ride) brain.path = ride;
      else {
        // Sur le radeau (ou le wagon) : il attend d'arriver ; ailleurs, il finit par changer d'idée
        const riding = (supportAt(k, off, me.x, me.y)?.sec ?? 0) > 0;
        if (!riding && ++brain.stranded > 150) {
          brain.plan = null;
          brain.stranded = 0;
        }
        return NO_INPUT;
      }
    } else brain.path = path.map((c) => nav(v).pt[c]!);
  }
  return walk(v, lvl.speed, lvl.dash);
}

/** Pas de chemin : la case de ce qui bouge (radeau, wagon) la plus proche qu'on peut atteindre */
function rideTowards(v: View): [number, number][] | null {
  const n = nav(v);
  const goals: number[] = [];
  for (let s = 1; s < v.k.moving.length; s++) {
    if (v.k.motions[s]?.ground !== "void") continue;
    for (let y = 0; y < n.H; y++)
      for (let x = 0; x < n.W; x++) {
        const sup = supportAt(v.k, v.off, x + 0.5, y + 0.5);
        if (sup && sup.sec === s && n.free[y * n.W + x]) goals.push(y * n.W + x);
      }
  }
  const here = supportAt(v.k, v.off, v.me.x, v.me.y);
  if (here && here.sec > 0) return null;
  const path = route(v, goals);
  return path ? path.map((c) => n.pt[c]!) : null;
}

/** Un morceau qui porte des chefs (wagon, radeau) bouge, ou va bouger d'ici peu */
function motionSoon(v: View): boolean {
  if (v.k.moving.length <= 1) return false;
  const t = serviceTime(v.w);
  const later = offsetsAt(v.k, t + 2.5);
  return v.off.some((o, s) => s > 0 && (Math.abs(o[0] - later[s]![0]) > 0.01 || Math.abs(o[1] - later[s]![1]) > 0.01));
}

/** Le sol devant lui tient encore un moment (pas de pas dans l'eau, dans l'écart entre deux wagons) */
function safeAhead(v: View, dx: number, dy: number): boolean {
  const x = v.me.x + dx * 0.42;
  const y = v.me.y + dy * 0.42;
  if (!supportAt(v.k, v.off, x, y)) return false;
  if (v.k.moving.length <= 1) return true;
  const sup = supportAt(v.k, v.off, v.me.x, v.me.y);
  const soon = offsetsAt(v.k, serviceTime(v.w) + 0.6);
  // Le point devant, emporté par ce qui le porte (le même wagon que lui), ou immobile
  const s2 = supportAt(v.k, v.off, x, y)!;
  const carry = s2.sec === (sup?.sec ?? 0) ? s2.sec : 0;
  const mx = x + (soon[carry]![0] - v.off[carry]![0]);
  const my = y + (soon[carry]![1] - v.off[carry]![1]);
  return supportAt(v.k, soon, mx, my) !== null;
}

/** L'élan va loin (deux cases) : seulement en ligne droite sur trois cases, sur du sol, loin du vide */
function dashSafe(v: View, path: [number, number][]): boolean {
  const [ax, ay] = path[0]!;
  const [bx, by] = path[2]!;
  const dx = bx - ax;
  const dy = by - ay;
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l < 1.8) return false;
  const ux = dx / l;
  const uy = dy / l;
  for (let d = 0.4; d <= 2.6; d += 0.3) {
    const x = v.me.x + ux * d;
    const y = v.me.y + uy * d;
    if (!supportAt(v.k, v.off, x, y)) return false;
    // Pas à côté du vide non plus (un chef bousculé y glisserait)
    if (!supportAt(v.k, v.off, x - uy * 0.45, y + ux * 0.45) || !supportAt(v.k, v.off, x + uy * 0.45, y - ux * 0.45)) return false;
  }
  return true;
}

function walk(v: View, speed: number, dash: boolean): Input {
  const { me, brain, w } = v;
  // Coincé : il se dégage un instant de travers
  if (brain.jiggle > 0 && brain.jx !== 0) {
    brain.jiggle--;
    if (brain.jiggle === 0) brain.jx = 0;
    return { x: brain.jx, y: brain.jy, held: 0, pressed: 0 };
  }
  if (w.frame - brain.progress.at > 40) {
    const moved = (me.x - brain.progress.x) ** 2 + (me.y - brain.progress.y) ** 2;
    brain.progress = { x: me.x, y: me.y, at: w.frame };
    if (moved < 0.09) {
      const a = random(brain.rng) * 4;
      brain.jx = a < 1 ? 1 : a < 2 ? -1 : 0;
      brain.jy = a < 2 ? 0 : a < 3 ? 1 : -1;
      brain.jiggle = 8;
      brain.path = [];
      return NO_INPUT;
    }
  }
  while (brain.path.length > 0) {
    const [nx, ny] = brain.path[0]!;
    const d = Math.sqrt((nx - me.x) ** 2 + (ny - me.y) ** 2);
    // Assez près de la case suivante : on vise déjà celle d'après (la dernière, on y entre franchement)
    if (d < (brain.path.length > 1 ? 0.42 : 0.18)) {
      brain.path.shift();
      continue;
    }
    // Les charrettes : on attend au bord de l'allée qu'elle soit passée
    if (cartComing(v, ny)) return NO_INPUT;
    const slow = brain.path.length === 1 && d < 0.5 ? Math.max(0.4, d * 2) : 1;
    // Le sol devant va manquer : on s'arrête et on cherche un autre chemin
    if (!safeAhead(v, (nx - me.x) / d, (ny - me.y) / d)) {
      brain.path = [];
      brain.pathAt = w.frame;
      return NO_INPUT;
    }
    const straight =
      brain.path.length >= 4 && me.cd === 0 && dash && me.fx * (nx - me.x) + me.fy * (ny - me.y) > 0.95 * d && dashSafe(v, brain.path);
    return { x: ((nx - me.x) / d) * speed * slow, y: ((ny - me.y) / d) * speed * slow, held: 0, pressed: straight ? DASH : 0 };
  }
  return NO_INPUT;
}

/** Une charrette arrive dans l'allée qu'il allait traverser : il attend au bord qu'elle soit passée */
function cartComing(v: View, nextY: number): boolean {
  if (v.k.def.hazard !== "charrettes") return false;
  const lane = v.k.def.lane ?? -1;
  if (Math.floor(nextY) !== lane || Math.floor(v.me.y) === lane) return false;
  const width = v.k.duel ? (v.k.W - 1) / 2 : v.k.W;
  const x = v.me.team === 1 ? v.k.W - v.me.x : v.me.x;
  const t = serviceTime(v.w);
  // La charrette, maintenant et dans les deux secondes qui viennent (le temps de traverser)
  for (let dt = 0; dt <= 2; dt += 0.25) {
    const c = cart(t + dt, width);
    if ((c.on || c.warn) && Math.abs(c.x - x) < CART_LEN / 2 + 1.6) return true;
  }
  return false;
}

/** Devant la case : prendre, poser, couper ou laver ; et vérifier, quelques pas plus tard, que c'est fait */
function press(v: View, plan: Plan): Input {
  const { me, brain, w } = v;
  if (plan.t === "use") {
    const it = w.items[plan.cell];
    const ok =
      (v.k.cells[plan.cell] === Cell.Board && it?.k === "food" && it.f && CHOP[it.f]) ||
      (v.k.cells[plan.cell] === Cell.Sink && w.stack[plan.cell]! > 0);
    if (!ok || me.held) {
      brain.plan = null;
      return NO_INPUT;
    }
    brain.using = true;
    brain.settle = 2;
    return { x: 0, y: 0, held: USE, pressed: USE };
  }
  if (plan.t === "take") {
    if (me.held) {
      // Pris : la suite (le porter là où il faut) ; ou, sans suite, décider
      brain.plan = plan.then >= 0 ? { t: "put", cell: plan.then } : null;
      brain.tries = 0;
      if (plan.then >= 0) v.table.reserved.delete(plan.then);
      return NO_INPUT;
    }
    if (++brain.tries > 2) {
      brain.avoid.set(plan.cell, w.frame + 90);
      brain.plan = null;
      return NO_INPUT;
    }
    brain.settle = 2;
    // Après l'appui, on regardera s'il tient quelque chose
    return { x: 0, y: 0, held: 0, pressed: GRAB };
  }
  if (plan.t === "put") {
    if (!me.held) {
      brain.plan = null;
      return NO_INPUT;
    }
    // Deuxième passage : ce qu'il tient n'a pas changé, la case a refusé
    if (brain.tries > 0) {
      if (me.held === brain.lastHeld && JSON.stringify(me.held) === brain.lastSnap) brain.avoid.set(plan.cell, w.frame + 120);
      brain.plan = null;
      brain.think = LEVELS[brain.level].think;
      return NO_INPUT;
    }
    brain.tries++;
    brain.lastHeld = me.held;
    brain.lastSnap = JSON.stringify(me.held);
    brain.settle = 2;
    return { x: 0, y: 0, held: 0, pressed: GRAB };
  }
  brain.plan = null;
  return NO_INPUT;
}

/** Le commis oublie ce qu'il préparait (une nouvelle partie, un joueur qui reprend la main) */
export function forgetBrain(table: BotTable, slot: number) {
  brainsOf(table).delete(slot);
  botSlots.get(table)?.delete(slot);
  for (const [id, s] of table.owner) if (s.slot === slot) table.owner.delete(id);
  for (const [c, s] of table.reserved) if (s === slot) table.reserved.delete(c);
}

/** Pour les tests : ce que le commis compte faire */
export function botPlan(brain: BotBrain): string {
  const p = brain.plan;
  if (!p) return "rien";
  return `${p.t}${"cell" in p ? `@${p.cell}` : ""}${p.t === "take" ? `→${p.then}` : ""}`;
}

/** Pour les tests : d'où le commis atteindrait cette case, maintenant et en attendant */
export function explainReach(w: World, slot: number, brain: BotBrain, table: BotTable, cell: number) {
  const v = makeView(w, w.chefs[slot]!, brain, table);
  const e = eventual(v.k);
  return {
    now: standFor(v, cell),
    route: route(v, standFor(v, cell)),
    later: e.rests.map((off, r) => ({
      off: off.map((o) => o[0]),
      stands: standFor(v, cell, e.each[r], off),
      route: route(v, standFor(v, cell, e.each[r], off), e.nav),
    })),
    ok: okCell(v, cell),
  };
}
