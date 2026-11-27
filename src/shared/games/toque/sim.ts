// Le service, pas à pas : les chefs qui courent et se bousculent, ce qu'ils prennent et posent, ce qui coupe, cuit,
// mijote, frit, brûle et prend feu, la vaisselle, les commandes et le score. Le serveur fait foi ; chaque téléphone
// rejoue les mêmes pas à partir du dernier état reçu, avec ses propres commandes, pour montrer son chef au présent.
// Seulement + − × ÷ et la racine carrée dans les calculs : les mêmes nombres partout.

import { random, type RngHolder } from "../../rng.ts";
import {
  bakedPart,
  CHOP,
  dishOf,
  FRY,
  FRY_BURN_S,
  onTheWay,
  OVEN,
  OVEN_BURN_S,
  PAN,
  PAN_BURN_S,
  POT,
  POT_BURN_S,
  POT_FULL,
  POT_S,
  potDish,
  RECIPES,
  throwable,
  TOPPINGS,
  WASH_S,
  type BaseKind,
  type FoodId,
  type Part,
  type RecipeId,
} from "./food.ts";
import { CART_LEN, cart, gust, hazardPush, tangage } from "./hazards.ts";
import {
  buildKitchen,
  Cell,
  crateGood,
  flammable,
  KITCHENS,
  menuOf,
  motionOffset,
  solid,
  usable,
  walkable,
  type Kitchen,
  type KitchenId,
} from "./kitchens.ts";

/** Le monde avance par trentièmes de seconde, au serveur comme au téléphone */
export const FPS = 30;
export const DT = 1 / FPS;

// Les boutons, en bits : ce qui est tenu, et ce qui vient d'être enfoncé
export const GRAB = 1;
export const USE = 2;
export const DASH = 4;
export const SWAP = 8;

/** Ce que demande un joueur pendant un pas : le stick dans le repère de la cuisine (de −1 à 1, y vers le bas du plan) */
export interface Input {
  x: number;
  y: number;
  held: number;
  pressed: number;
}
export const NO_INPUT: Input = { x: 0, y: 0, held: 0, pressed: 0 };

/** L'introduction (la caméra fait le tour de la cuisine, « Prêts ? »), puis la fin (la cloche) */
export const INTRO_S = 4;
export const OVER_S = 3;

/** Le rayon d'un chef, sa vitesse, son élan */
export const CHEF_R = 0.3;
const SPEED = 4.3;
const ACCEL = 42;
const ICE_ACCEL = 4.5;
const DASH_SPEED = 11;
const DASH_FRAMES = 6;
const DASH_COOLDOWN = 20;
/** Ce qu'on vise devant soi : un point à cette distance, et jusqu'où une case peut en être */
const PROBE = 0.62;
const REACH = 0.48;
/** Un geste du stick plus franc que ça arrête de couper ou de laver */
const CANCEL_STICK = 0.35;
/** Tombé à l'eau ou dans le vide : on revient au bout de tant de secondes */
const FALL_S = 3;
/** Lancer : la vitesse, et combien de temps vole un ingrédient (donc jusqu'où) */
const THROW_SPEED = 9;
const THROW_FRAMES = 17;
/** L'assiette servie revient (sale, s'il y a la vaisselle) au retour au bout de tant de secondes */
const RETURN_S = 7;
/** Le feu : il grandit, puis gagne une case voisine tant qu'on ne l'éteint pas ; l'extincteur, sa portée et son cône */
const FIRE_GROW_S = 1.6;
const FIRE_SPREAD_S = 3.6;
const SPRAY_RANGE = 2.7;
const SPRAY_CONE = 0.62;
const SPRAY_S = 0.55;
/** Une commande ratée coûte des points ; le pourboire, selon le temps qui restait, multiplié par l'enchaînement */
export const FAIL_COST = 10;
export const TIP_MAX = 8;
export const STREAK_MAX = 4;
/** Les charrettes bousculent : sonné tant de pas */
const CART_STUN = 20;

// ---------------------------------------------------------------------------
// Ce qu'il y a dans la cuisine
// ---------------------------------------------------------------------------

export type ItemKind = "food" | "plate" | "pot" | "pan" | "base" | "ext";

export interface Item {
  id: number;
  k: ItemKind;
  /** L'aliment (k = food) */
  f?: FoodId;
  /** Le fond (k = base) */
  b?: BaseKind;
  /** Ce qu'il contient : l'assiette (ses morceaux), la marmite, la poêle (un aliment), le fond (sa garniture) */
  c?: Part[];
  /** Où il en est : la coupe (un aliment), la cuisson (marmite, poêle, fond, ce qui frit) : 1 cuit, 2 brûlé */
  p?: number;
  /** Une pile d'assiettes sales (plus d'une) */
  n?: number;
  dirty?: boolean;
  /** Où il revient s'il est perdu (une marmite tombée à l'eau…) */
  home?: number;
}

/** Ce qui traîne par terre (dans le repère du morceau de cuisine qui le porte) */
export interface Loose {
  item: Item;
  x: number;
  y: number;
  sec: number;
}

/** Ce qui vole : un ingrédient lancé */
export interface Flying {
  item: Item;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  by: number;
}

export const ACT_NONE = 0;
export const ACT_CHOP = 1;
export const ACT_WASH = 2;
export const ACT_SPRAY = 3;

export interface ChefStats {
  served: number;
  chopped: number;
  washed: number;
  fires: number;
  thrown: number;
  caught: number;
  falls: number;
  burnt: number;
  dashes: number;
}

export interface Chef {
  slot: number;
  /** Le joueur (ou le bot) qui le commande */
  owner: number;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Où il regarde (un vecteur de longueur 1) */
  fx: number;
  fy: number;
  held: Item | null;
  act: number;
  /** La case de ce qu'il fait (la planche, l'évier) */
  cell: number;
  dash: number;
  cd: number;
  stun: number;
  /** Tombé : encore tant de pas avant de revenir */
  out: number;
  spawn: [number, number];
  st: ChefStats;
}

export interface Order {
  id: number;
  r: RecipeId;
  /** Le pas où elle est arrivée, celui où elle sera perdue */
  at: number;
  until: number;
}

export interface TeamState {
  score: number;
  /** L'enchaînement : les commandes servies dans l'ordre, d'affilée */
  streak: number;
  best: number;
  served: number;
  failed: number;
  tips: number;
  orders: Order[];
  /** Le pas de la prochaine commande */
  next: number;
  rng: number;
  /** Le rythme des commandes et le seuil des étoiles, selon le nombre de chefs */
  chefs: number;
}

export interface World {
  kitchen: KitchenId;
  duel: boolean;
  frame: number;
  /** 0 : l'introduction, 1 : le service, 2 : c'est fini */
  phase: number;
  /** Le pas où commence le service, celui où il s'arrête */
  service: number;
  end: number;
  chefs: Chef[];
  /** Pour chaque joueur, le chef qu'il commande (en solo à deux chefs, il passe de l'un à l'autre) */
  active: number[];
  /** Ce qui est posé sur chaque case */
  items: (Item | null)[];
  /** Les piles d'assiettes : propres à l'égouttoir, sales à l'évier ou au retour */
  stack: number[];
  /** Où en est la vaisselle à chaque évier */
  wash: number[];
  /** Le feu sur chaque case (0 : rien, jusqu'à 1), et depuis quand il brûle (pour gagner les voisines) */
  fire: number[];
  fireT: number[];
  loose: Loose[];
  flying: Flying[];
  /** Les assiettes servies qui reviendront au retour */
  returns: { at: number; team: number }[];
  teams: TeamState[];
  nextId: number;
  rng: number;
  /** Charrettes : celles qui ont déjà bousculé ce chef (pour ne pas le cogner à chaque pas) */
  hits: number[];
}

export type ToqueEvent =
  | { k: "take"; c: number; cell: number }
  | { k: "put"; c: number; cell: number }
  | { k: "drop"; c: number }
  | { k: "pickup"; c: number }
  | { k: "chopped"; c: number; cell: number }
  | { k: "washed"; c: number; cell: number }
  | { k: "cooked"; cell: number }
  | { k: "burn"; cell: number }
  | { k: "fire"; cell: number }
  | { k: "out"; cell: number; c: number }
  | { k: "serve"; team: number; r: RecipeId; points: number; tip: number; mult: number; c: number }
  | { k: "fail"; team: number; r: RecipeId }
  | { k: "order"; team: number; r: RecipeId }
  | { k: "refuse"; c: number }
  | { k: "trash"; c: number; cell: number }
  | { k: "throw"; c: number }
  | { k: "catch"; c: number }
  | { k: "land"; x: number; y: number }
  | { k: "splash"; x: number; y: number }
  | { k: "fall"; c: number }
  | { k: "back"; c: number }
  | { k: "dash"; c: number }
  | { k: "bump"; c: number; v: number }
  | { k: "hit"; c: number }
  | { k: "swap"; c: number }
  | { k: "go" }
  | { k: "end" };

// ---------------------------------------------------------------------------
// Le départ
// ---------------------------------------------------------------------------

export interface OwnerSetup {
  team: number;
  /** Deux chefs pour un joueur seul qui passe de l'un à l'autre */
  chefs: 1 | 2;
  bot: boolean;
}

/** Le nombre de chefs qui comptent pour le rythme et les étoiles : un commis vaut un peu moins qu'un joueur, le second chef d'un joueur seul beaucoup moins */
export function chefWeight(owners: readonly OwnerSetup[], team: number): number {
  let n = 0;
  for (const o of owners) {
    if (o.team !== team) continue;
    n += o.bot ? 0.8 : 1;
    if (o.chefs === 2) n += 0.3;
  }
  return Math.max(1, n);
}

const lerpTable = (table: readonly number[], n: number) => {
  const i = Math.max(0, Math.min(table.length - 1, n - 1));
  const lo = Math.floor(i);
  const hi = Math.min(table.length - 1, lo + 1);
  return table[lo]! + (table[hi]! - table[lo]!) * (i - lo);
};

/** Le temps entre deux commandes, multiplié par ça (1 pour deux chefs) */
export const gapFactor = (chefs: number) => lerpTable([1.5, 1, 0.8, 0.68], chefs);
/** Les seuils des étoiles, multipliés par ça (1 pour deux chefs) */
export const starFactor = (chefs: number) => lerpTable([0.6, 1, 1.2, 1.4], chefs);

/** Les points pour une, deux, trois étoiles dans cette cuisine, pour ce nombre de chefs (arrondis à cinq points) */
export function starThresholds(kitchen: KitchenId, chefs: number): [number, number, number] {
  const f = starFactor(chefs);
  const r = (v: number) => Math.max(5, Math.round((v * f) / 5) * 5);
  const [a, b, c] = KITCHENS[kitchen].stars;
  return [r(a), r(b), r(c)];
}

/** Les étoiles de ce score */
export function starsOf(kitchen: KitchenId, chefs: number, score: number): number {
  const t = starThresholds(kitchen, chefs);
  return score >= t[2] ? 3 : score >= t[1] ? 2 : score >= t[0] ? 1 : 0;
}

export function createWorld(kitchen: KitchenId, duel: boolean, owners: readonly OwnerSetup[], seed: number): World {
  const k = buildKitchen(kitchen, duel);
  const def = k.def;
  const teams = duel ? 2 : 1;
  const world: World = {
    kitchen,
    duel,
    frame: 0,
    phase: 0,
    service: Math.round(INTRO_S * FPS),
    end: Math.round((INTRO_S + def.duration) * FPS),
    chefs: [],
    active: [],
    items: new Array(k.W * k.H).fill(null),
    stack: new Array(k.W * k.H).fill(0),
    wash: new Array(k.W * k.H).fill(0),
    fire: new Array(k.W * k.H).fill(0),
    fireT: new Array(k.W * k.H).fill(0),
    loose: [],
    flying: [],
    returns: [],
    teams: [],
    nextId: 1,
    rng: seed >>> 0 || 1,
    hits: [],
  };
  for (let t = 0; t < teams; t++) {
    world.teams.push({
      score: 0,
      streak: 0,
      best: 0,
      served: 0,
      failed: 0,
      tips: 0,
      orders: [],
      next: world.service,
      // Les deux équipes d'un duel reçoivent les mêmes commandes : le même tirage
      rng: (seed ^ 0x9e3779b9) >>> 0 || 7,
      chefs: chefWeight(owners, t),
    });
  }
  for (const s of k.start) {
    const id = world.nextId++;
    const item: Item =
      s.item === "pot"
        ? { id, k: "pot", c: [], p: 0, home: s.cell }
        : s.item === "pan"
          ? { id, k: "pan", c: [], p: 0, home: s.cell }
          : s.item === "ext"
            ? { id, k: "ext", home: s.cell }
            : { id, k: "plate", c: [] };
    world.items[s.cell] = item;
  }
  const used = new Array(teams).fill(0);
  owners.forEach((o, owner) => {
    const team = Math.min(teams - 1, Math.max(0, o.team));
    for (let j = 0; j < o.chefs; j++) {
      const spots = k.spawns[team] ?? k.spawns[0]!;
      const n = used[team]++;
      const spot = spots[n % spots.length] ?? [k.W / 2, k.H / 2];
      // Au-delà des places prévues, un peu à côté
      const extra = Math.floor(n / Math.max(1, spots.length)) * 0.4;
      const slot = world.chefs.length;
      world.chefs.push({
        slot,
        owner,
        team,
        x: spot[0] + extra,
        y: spot[1],
        vx: 0,
        vy: 0,
        fx: 0,
        fy: 1,
        held: null,
        act: ACT_NONE,
        cell: -1,
        dash: 0,
        cd: 0,
        stun: 0,
        out: 0,
        spawn: [spot[0] + extra, spot[1]],
        st: { served: 0, chopped: 0, washed: 0, fires: 0, thrown: 0, caught: 0, falls: 0, burnt: 0, dashes: 0 },
      });
      if (j === 0) world.active[owner] = slot;
    }
  });
  return world;
}

// ---------------------------------------------------------------------------
// La géométrie : où sont les cases à ce moment (certaines bougent)
// ---------------------------------------------------------------------------

/** Le temps du service, en secondes (0 pendant l'introduction) */
export function serviceTime(w: World): number {
  return Math.max(0, w.frame - w.service) / FPS;
}

/** Le décalage de chaque morceau de cuisine qui bouge, à ce pas */
export function offsetsAt(k: Kitchen, t: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  for (let s = 1; s < k.moving.length; s++) out[s] = motionOffset(k.motions[s], t);
  return out;
}

/** Le coin d'une case (en haut à gauche), à sa place du moment */
export function cellCorner(k: Kitchen, i: number, off: [number, number][]): [number, number] {
  const o = off[k.section[i]!] ?? [0, 0];
  return [(i % k.W) + o[0], Math.floor(i / k.W) + o[1]];
}

/** La case solide (qui bouge ou non) sous ce point du monde, ou −1 */
function solidAt(k: Kitchen, off: [number, number][], x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix >= 0 && iy >= 0 && ix < k.W && iy < k.H) {
    const i = iy * k.W + ix;
    if (k.section[i] === 0 && solid(k.cells[i]!)) return i;
  }
  for (let s = 1; s < k.moving.length; s++) {
    const o = off[s]!;
    for (const i of k.moving[s] ?? []) {
      if (!solid(k.cells[i]!)) continue;
      const cx = (i % k.W) + o[0];
      const cy = Math.floor(i / k.W) + o[1];
      if (x >= cx && x < cx + 1 && y >= cy && y < cy + 1) return i;
    }
  }
  return -1;
}

/** Ce qui porte ce point : le morceau de cuisine (0 : le sol immobile), sa case de sol, ou rien (le vide) */
export function supportAt(k: Kitchen, off: [number, number][], x: number, y: number): { sec: number; cell: number; ice: boolean } | null {
  for (let s = 1; s < k.moving.length; s++) {
    const o = off[s]!;
    for (const i of k.moving[s] ?? []) {
      if (!walkable(k.cells[i]!)) continue;
      const cx = (i % k.W) + o[0];
      const cy = Math.floor(i / k.W) + o[1];
      if (x >= cx && x < cx + 1 && y >= cy && y < cy + 1) return { sec: s, cell: i, ice: k.cells[i] === Cell.Ice };
    }
  }
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= k.W || iy >= k.H) return null;
  const i = iy * k.W + ix;
  return walkable(k.under[i]!) ? { sec: 0, cell: i, ice: k.under[i] === Cell.Ice } : null;
}

/** Les cases solides près d'un point (immobiles autour, et toutes celles qui bougent) */
function solidsNear(k: Kitchen, x: number, y: number, out: number[]): number[] {
  out.length = 0;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  for (let yy = iy - 1; yy <= iy + 1; yy++) {
    if (yy < 0 || yy >= k.H) continue;
    for (let xx = ix - 1; xx <= ix + 1; xx++) {
      if (xx < 0 || xx >= k.W) continue;
      const i = yy * k.W + xx;
      if (k.section[i] === 0 && solid(k.cells[i]!)) out.push(i);
    }
  }
  for (let s = 1; s < k.moving.length; s++) for (const i of k.moving[s] ?? []) if (solid(k.cells[i]!)) out.push(i);
  return out;
}

const scratch: number[] = [];

/** Le chef sort des cases solides qu'il touche ; vrai s'il en touchait encore une après (coincé) */
function pushOut(k: Kitchen, off: [number, number][], c: Chef): boolean {
  let stuck = false;
  for (let pass = 0; pass < 3; pass++) {
    stuck = false;
    for (const i of solidsNear(k, c.x, c.y, scratch)) {
      const [x0, y0] = cellCorner(k, i, off);
      const px = c.x < x0 ? x0 : c.x > x0 + 1 ? x0 + 1 : c.x;
      const py = c.y < y0 ? y0 : c.y > y0 + 1 ? y0 + 1 : c.y;
      let dx = c.x - px;
      let dy = c.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 >= CHEF_R * CHEF_R) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-6) {
        // Le centre est dans la case : on ressort par le bord le plus proche
        const l = c.x - x0;
        const r = x0 + 1 - c.x;
        const u = c.y - y0;
        const b = y0 + 1 - c.y;
        const m = Math.min(l, r, u, b);
        dx = m === l ? -1 : m === r ? 1 : 0;
        dy = m === u ? -1 : m === b ? 1 : 0;
        d = 0;
        c.x += dx * (m + CHEF_R);
        c.y += dy * (m + CHEF_R);
      } else {
        dx /= d;
        dy /= d;
        c.x += dx * (CHEF_R - d);
        c.y += dy * (CHEF_R - d);
      }
      const vn = c.vx * dx + c.vy * dy;
      if (vn < 0) {
        c.vx -= vn * dx;
        c.vy -= vn * dy;
      }
      stuck = true;
    }
    if (!stuck) return false;
  }
  // Encore dedans après trois passes : coincé ?
  for (const i of solidsNear(k, c.x, c.y, scratch)) {
    const [x0, y0] = cellCorner(k, i, off);
    const px = c.x < x0 ? x0 : c.x > x0 + 1 ? x0 + 1 : c.x;
    const py = c.y < y0 ? y0 : c.y > y0 + 1 ? y0 + 1 : c.y;
    const dx = c.x - px;
    const dy = c.y - py;
    if (dx * dx + dy * dy < CHEF_R * CHEF_R * 0.6) return true;
  }
  return false;
}

/** Coincé entre une table qui glisse et le mur : on le pose sur la case de sol libre la plus proche */
function unstick(k: Kitchen, off: [number, number][], c: Chef) {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  const ix = Math.floor(c.x);
  const iy = Math.floor(c.y);
  for (let yy = iy - 3; yy <= iy + 3; yy++) {
    for (let xx = ix - 3; xx <= ix + 3; xx++) {
      const x = xx + 0.5;
      const y = yy + 0.5;
      if (!supportAt(k, off, x, y) || solidAt(k, off, x, y) >= 0) continue;
      // Assez de place autour
      if (solidAt(k, off, x - 0.32, y) >= 0 || solidAt(k, off, x + 0.32, y) >= 0) continue;
      if (solidAt(k, off, x, y - 0.32) >= 0 || solidAt(k, off, x, y + 0.32) >= 0) continue;
      const d = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);
      if (d < bestD) {
        bestD = d;
        best = [x, y];
      }
    }
  }
  if (best) {
    c.x = best[0];
    c.y = best[1];
    c.vx = 0;
    c.vy = 0;
  }
}

// ---------------------------------------------------------------------------
// Ce que vise un chef
// ---------------------------------------------------------------------------

/** La case devant le chef dont il se servirait (−1 : rien à portée) */
export function targetCell(k: Kitchen, off: [number, number][], c: Chef): number {
  const px = c.x + c.fx * PROBE;
  const py = c.y + c.fy * PROBE;
  let best = -1;
  let bestD = REACH;
  const consider = (i: number) => {
    if (!usable(k.cells[i]!)) return;
    const [x0, y0] = cellCorner(k, i, off);
    const qx = px < x0 ? x0 : px > x0 + 1 ? x0 + 1 : px;
    const qy = py < y0 ? y0 : py > y0 + 1 ? y0 + 1 : py;
    const d = Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
    // Devant soi : le milieu de la case n'est pas derrière
    const mx = x0 + 0.5 - c.x;
    const my = y0 + 0.5 - c.y;
    if (mx * c.fx + my * c.fy < 0.15) return;
    // À égalité (le point visé dans deux cases), la plus en face
    const score = d - (mx * c.fx + my * c.fy) * 0.001;
    if (score < bestD) {
      bestD = score;
      best = i;
    }
  };
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  for (let yy = iy - 1; yy <= iy + 1; yy++) {
    if (yy < 0 || yy >= k.H) continue;
    for (let xx = ix - 1; xx <= ix + 1; xx++) {
      if (xx < 0 || xx >= k.W) continue;
      const i = yy * k.W + xx;
      if (k.section[i] === 0) consider(i);
    }
  }
  for (let s = 1; s < k.moving.length; s++) for (const i of k.moving[s] ?? []) consider(i);
  return best;
}

/** Ce qui traîne par terre devant le chef (son rang dans `loose`), ou −1 */
export function targetLoose(k: Kitchen, w: World, off: [number, number][], c: Chef): number {
  const px = c.x + c.fx * 0.5;
  const py = c.y + c.fy * 0.5;
  let best = -1;
  let bestD = 0.62;
  w.loose.forEach((l, i) => {
    const o = off[l.sec] ?? [0, 0];
    const d = Math.sqrt((l.x + o[0] - px) * (l.x + o[0] - px) + (l.y + o[1] - py) * (l.y + o[1] - py));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  void k;
  return best;
}

// ---------------------------------------------------------------------------
// Ce que les choses acceptent
// ---------------------------------------------------------------------------

/** L'aliment cuit à point (et pas encore brûlé) */
const done = (p: number | undefined) => (p ?? 0) >= 1 && (p ?? 0) < 2;

/** Ce que cet objet donnerait, posé sur une assiette (rien s'il ne se sert pas tel quel) */
export function partOf(it: Item): Part | null {
  if (it.k === "food") return it.f && it.f !== "charbon" ? it.f : null;
  if (it.k === "base") return done(it.p) ? bakedPart(it.b!, it.c ?? []) : null;
  if (it.k === "pot") return done(it.p) ? potDish(it.c ?? []) : null;
  if (it.k === "pan") return done(it.p) && it.c?.[0] && it.c[0] !== "charbon" ? it.c[0] : null;
  return null;
}

/** L'assiette (propre, seule) accepte ce morceau : elle reste en chemin vers un plat du menu */
export function plateTakes(plate: Item, part: Part | null, menu: readonly RecipeId[]): boolean {
  if (!part || plate.k !== "plate" || plate.dirty || (plate.n ?? 1) > 1) return false;
  return onTheWay([...(plate.c ?? []), part], menu);
}

/** La marmite accepte cet aliment : il s'y mijote, trois fois la même chose */
export function potTakes(pot: Item, f: FoodId | undefined): boolean {
  if (!f || pot.k !== "pot" || !(f in POT) || (pot.p ?? 0) >= 2) return false;
  const c = pot.c ?? [];
  return c.length < POT_FULL && c.every((x) => x === f);
}

/** La poêle (vide) accepte cet aliment */
export function panTakes(pan: Item, f: FoodId | undefined): boolean {
  return Boolean(f && pan.k === "pan" && (pan.c ?? []).length === 0 && f in PAN);
}

/** Le fond (pas encore au four) accepte cette garniture */
export function baseTakes(base: Item, f: FoodId | undefined): boolean {
  if (!f || base.k !== "base" || (base.p ?? 0) > 0) return false;
  return TOPPINGS[base.b!].includes(f) && !(base.c ?? []).includes(f);
}

/** Ce qu'on peut mettre dans la friteuse */
const fryable = (it: Item) => it.k === "food" && it.f !== undefined && (it.f in FRY || Object.values(FRY).some((v) => v!.to === it.f));

/** Ce qu'on peut glisser dans le four : un fond, cru ou cuit */
const ovenable = (it: Item) => it.k === "base";

// ---------------------------------------------------------------------------
// Le pas
// ---------------------------------------------------------------------------

interface Ctx {
  k: Kitchen;
  w: World;
  off: [number, number][];
  prevOff: [number, number][];
  menu: RecipeId[];
  ev: ToqueEvent[];
  rng: RngHolder;
}

/** Un pas du service. `inputs` : la commande de chaque joueur (dans l'ordre des joueurs). Renvoie ce qui s'est passé. */
export function step(w: World, inputs: readonly Input[]): ToqueEvent[] {
  const k = buildKitchen(w.kitchen, w.duel);
  const prevOff = offsetsAt(k, serviceTime(w));
  w.frame++;
  const off = offsetsAt(k, serviceTime(w));
  const ctx: Ctx = { k, w, off, prevOff, menu: menuOf(w.kitchen), ev: [], rng: { rng: w.rng } };
  if (w.phase === 0 && w.frame >= w.service) {
    w.phase = 1;
    ctx.ev.push({ k: "go" });
  }
  if (w.phase === 1 && w.frame >= w.end) {
    w.phase = 2;
    for (const c of w.chefs) c.act = ACT_NONE;
    ctx.ev.push({ k: "end" });
  }
  const live = w.phase === 1;
  // Les commandes de chaque joueur vont à son chef du moment (le second chef d'un joueur seul attend, mais continue ce
  // qu'il faisait : couper, laver)
  for (const c of w.chefs) {
    const mine = w.active[c.owner] === c.slot;
    const input = live && mine ? (inputs[c.owner] ?? NO_INPUT) : NO_INPUT;
    if (live && mine && input.pressed & SWAP) {
      const other = w.chefs.find((o) => o.owner === c.owner && o.slot !== c.slot && o.out === 0);
      if (other) {
        w.active[c.owner] = other.slot;
        ctx.ev.push({ k: "swap", c: other.slot });
        moveChef(ctx, c, NO_INPUT, live);
        continue;
      }
    }
    moveChef(ctx, c, input, live);
  }
  separate(ctx);
  if (live) {
    for (const c of w.chefs) {
      const mine = w.active[c.owner] === c.slot;
      const input = mine ? (inputs[c.owner] ?? NO_INPUT) : NO_INPUT;
      act(ctx, c, input);
    }
    stations(ctx);
    fires(ctx);
    flight(ctx);
    plateReturns(ctx);
    orders(ctx);
    if (k.def.hazard === "charrettes") carts(ctx);
  }
  w.rng = ctx.rng.rng;
  return ctx.ev;
}

// ---------------------------------------------------------------------------
// Les chefs bougent
// ---------------------------------------------------------------------------

function moveChef(ctx: Ctx, c: Chef, input: Input, live: boolean) {
  const { k, w, off, prevOff } = ctx;
  if (c.out > 0) {
    c.out--;
    if (c.out === 0) {
      c.x = c.spawn[0];
      c.y = c.spawn[1];
      c.vx = 0;
      c.vy = 0;
      c.fx = 0;
      c.fy = 1;
      ctx.ev.push({ k: "back", c: c.slot });
    }
    return;
  }
  // Porté par ce qui bouge sous ses pieds (le wagon, le radeau)
  const under = supportAt(k, prevOff, c.x, c.y);
  if (under && under.sec > 0) {
    c.x += off[under.sec]![0] - prevOff[under.sec]![0];
    c.y += off[under.sec]![1] - prevOff[under.sec]![1];
  }
  let ix = live ? input.x : 0;
  let iy = live ? input.y : 0;
  if (!Number.isFinite(ix)) ix = 0;
  if (!Number.isFinite(iy)) iy = 0;
  let mag = Math.sqrt(ix * ix + iy * iy);
  if (mag > 1) {
    ix /= mag;
    iy /= mag;
    mag = 1;
  }
  if (c.stun > 0) {
    c.stun--;
    ix = 0;
    iy = 0;
    mag = 0;
  }
  if (c.cd > 0) c.cd--;
  if (live && input.pressed & DASH && c.cd === 0 && c.stun === 0) {
    c.dash = DASH_FRAMES;
    c.cd = DASH_COOLDOWN;
    c.st.dashes++;
    ctx.ev.push({ k: "dash", c: c.slot });
    if (mag > 0.2) {
      c.fx = ix / mag;
      c.fy = iy / mag;
    }
  }
  const onIce = under?.ice ?? false;
  if (c.dash > 0) {
    c.dash--;
    c.vx = c.fx * DASH_SPEED;
    c.vy = c.fy * DASH_SPEED;
  } else {
    const tx = ix * SPEED;
    const ty = iy * SPEED;
    const a = (onIce ? ICE_ACCEL : ACCEL) * DT;
    let dvx = tx - c.vx;
    let dvy = ty - c.vy;
    const dv = Math.sqrt(dvx * dvx + dvy * dvy);
    if (dv > a) {
      dvx *= a / dv;
      dvy *= a / dv;
    }
    c.vx += dvx;
    c.vy += dvy;
  }
  // Le tangage, le vent
  const [hx, hy] = live ? hazardPush(k.def.hazard, serviceTime(w), c.team === 1) : [0, 0];
  c.vx += hx * DT;
  c.vy += hy * DT;
  c.x += c.vx * DT;
  c.y += c.vy * DT;
  // Il se tourne vers où il va
  if (mag > 0.2) {
    const dx = ix / mag;
    const dy = iy / mag;
    let nx = c.fx + (dx - c.fx) * 0.5;
    let ny = c.fy + (dy - c.fy) * 0.5;
    const l = Math.sqrt(nx * nx + ny * ny);
    if (l < 0.2) {
      nx = dx;
      ny = dy;
    } else {
      nx /= l;
      ny /= l;
    }
    c.fx = nx;
    c.fy = ny;
  }
  if ((c.act === ACT_CHOP || c.act === ACT_WASH) && mag > CANCEL_STICK) c.act = ACT_NONE;
  if (pushOut(k, off, c)) unstick(k, off, c);
  // Plus rien sous les pieds : à l'eau
  if (!supportAt(k, off, c.x, c.y)) fall(ctx, c);
}

/** Tombé (à l'eau, dans le vide) : il revient au départ un peu plus tard ; ce qu'il tenait est perdu ou revient */
function fall(ctx: Ctx, c: Chef) {
  c.out = Math.round(FALL_S * FPS);
  c.act = ACT_NONE;
  c.dash = 0;
  c.vx = 0;
  c.vy = 0;
  c.st.falls++;
  ctx.ev.push({ k: "fall", c: c.slot }, { k: "splash", x: c.x, y: c.y });
  if (c.held) lose(ctx, c.held, c.team);
  c.held = null;
}

/** Un objet perdu : un aliment disparaît, une assiette revient (au retour), un ustensile retrouve sa place */
function lose(ctx: Ctx, it: Item, team: number) {
  const { w, k } = ctx;
  if (it.k === "plate") {
    for (let n = 0; n < (it.n ?? 1); n++) w.returns.push({ at: w.frame + Math.round(RETURN_S * FPS), team });
    return;
  }
  if (it.k === "pot" || it.k === "pan" || it.k === "ext") {
    const fresh: Item = it.k === "ext" ? { id: it.id, k: "ext", home: it.home } : { id: it.id, k: it.k, c: [], p: 0, home: it.home };
    const home = it.home ?? -1;
    if (home >= 0 && !w.items[home]) {
      w.items[home] = fresh;
      return;
    }
    // Sa place est prise : le plan de travail libre le plus proche de chez lui
    const hx = home >= 0 ? home % k.W : k.W / 2;
    const hy = home >= 0 ? Math.floor(home / k.W) : k.H / 2;
    let best = -1;
    let bestD = Infinity;
    k.cells.forEach((cell, i) => {
      if (cell !== Cell.Counter || w.items[i] || k.team[i] !== team) return;
      const d = ((i % k.W) - hx) ** 2 + (Math.floor(i / k.W) - hy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) w.items[best] = fresh;
  }
}

/** Les chefs ne se marchent pas dessus : ils se poussent */
function separate(ctx: Ctx) {
  const cs = ctx.w.chefs;
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i]!;
    if (a.out > 0) continue;
    for (let j = i + 1; j < cs.length; j++) {
      const b = cs[j]!;
      if (b.out > 0) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = CHEF_R * 2;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-6) {
        dx = 1;
        dy = 0;
        d = 1e-6;
      } else {
        dx /= d;
        dy /= d;
      }
      const push = (min - d) / 2;
      // Celui qui fonce (élan) pousse l'autre davantage
      const wa = a.dash > 0 && b.dash === 0 ? 0.2 : b.dash > 0 && a.dash === 0 ? 1.8 : 1;
      a.x -= dx * push * wa;
      a.y -= dy * push * wa;
      b.x += dx * push * (2 - wa);
      b.y += dy * push * (2 - wa);
      if (a.dash > 0 || b.dash > 0) {
        const hitter = a.dash > 0 ? a : b;
        const other = hitter === a ? b : a;
        const sx = hitter === a ? dx : -dx;
        const sy = hitter === a ? dy : -dy;
        other.vx += sx * 5;
        other.vy += sy * 5;
        hitter.dash = 0;
        ctx.ev.push({ k: "bump", c: other.slot, v: hitter.slot });
      }
    }
  }
  // Repoussés contre une case : ils en ressortent
  for (const c of cs) if (c.out === 0 && pushOut(ctx.k, ctx.off, c)) unstick(ctx.k, ctx.off, c);
}

// ---------------------------------------------------------------------------
// Prendre, poser, se servir des postes
// ---------------------------------------------------------------------------

function act(ctx: Ctx, c: Chef, input: Input) {
  const { k, w, off } = ctx;
  if (c.out > 0) return;
  // L'extincteur : tant qu'on tient Utiliser
  if (c.held?.k === "ext" && input.held & USE && c.stun === 0) c.act = ACT_SPRAY;
  else if (c.act === ACT_SPRAY) c.act = ACT_NONE;
  if (c.stun > 0) return;
  if (input.pressed & GRAB) {
    if (c.act === ACT_CHOP || c.act === ACT_WASH) c.act = ACT_NONE;
    grab(ctx, c);
  } else if (input.pressed & USE) {
    use(ctx, c);
  }
  // Ce qu'on fait sans bouger : couper, laver
  if (c.act === ACT_CHOP) {
    const it = w.items[c.cell];
    const info = it?.k === "food" && it.f ? CHOP[it.f] : undefined;
    if (!it || !info || w.fire[c.cell]! > 0 || !near(k, off, c, c.cell)) {
      c.act = ACT_NONE;
      return;
    }
    it.p = (it.p ?? 0) + 1 / (info.s * FPS);
    if (it.p >= 1) {
      if (info.base) w.items[c.cell] = { id: it.id, k: "base", b: info.to as BaseKind, c: [], p: 0 };
      else {
        it.f = info.to as FoodId;
        it.p = 0;
      }
      c.act = ACT_NONE;
      c.st.chopped++;
      ctx.ev.push({ k: "chopped", c: c.slot, cell: c.cell });
    }
  } else if (c.act === ACT_WASH) {
    if (w.stack[c.cell]! <= 0 || !near(k, off, c, c.cell)) {
      c.act = ACT_NONE;
      return;
    }
    w.wash[c.cell] = w.wash[c.cell]! + 1 / (WASH_S * FPS);
    if (w.wash[c.cell]! >= 1) {
      w.wash[c.cell] = 0;
      w.stack[c.cell] = w.stack[c.cell]! - 1;
      w.stack[rackFor(k, c.cell)] = w.stack[rackFor(k, c.cell)]! + 1;
      c.st.washed++;
      ctx.ev.push({ k: "washed", c: c.slot, cell: c.cell });
      if (w.stack[c.cell]! <= 0) c.act = ACT_NONE;
    }
  }
}

/** Le chef est encore à portée de cette case (on ne coupe pas de loin) */
function near(k: Kitchen, off: [number, number][], c: Chef, cell: number): boolean {
  const [x0, y0] = cellCorner(k, cell, off);
  const qx = c.x < x0 ? x0 : c.x > x0 + 1 ? x0 + 1 : c.x;
  const qy = c.y < y0 ? y0 : c.y > y0 + 1 ? y0 + 1 : c.y;
  return (c.x - qx) * (c.x - qx) + (c.y - qy) * (c.y - qy) < 1.1 * 1.1;
}

/** L'égouttoir où vont les assiettes lavées à cet évier : le plus proche, dans la même cuisine */
export function rackFor(k: Kitchen, sink: number): number {
  let best = sink;
  let bestD = Infinity;
  k.cells.forEach((cell, i) => {
    if (cell !== Cell.Rack || k.team[i] !== k.team[sink]) return;
    const d = ((i % k.W) - (sink % k.W)) ** 2 + (Math.floor(i / k.W) - Math.floor(sink / k.W)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Le retour des assiettes d'une équipe */
export function returnFor(k: Kitchen, team: number): number {
  return k.cells.findIndex((cell, i) => cell === Cell.Return && k.team[i] === team);
}

function grab(ctx: Ctx, c: Chef) {
  const { k, w, off } = ctx;
  const cell = targetCell(k, off, c);
  if (!c.held) {
    if (cell >= 0) {
      const got = takeFrom(ctx, cell);
      if (got) {
        c.held = got;
        ctx.ev.push({ k: "take", c: c.slot, cell });
        return;
      }
    }
    const li = targetLoose(k, w, off, c);
    if (li >= 0) {
      c.held = w.loose[li]!.item;
      w.loose.splice(li, 1);
      ctx.ev.push({ k: "pickup", c: c.slot });
    }
    return;
  }
  if (cell >= 0) {
    const r = putInto(ctx, c, cell, c.held);
    if (r === false) {
      ctx.ev.push({ k: "refuse", c: c.slot });
      return;
    }
    if (r === "served") return;
    c.held = r;
    ctx.ev.push({ k: "put", c: c.slot, cell });
    return;
  }
  // Rien devant : par terre (si c'est du sol)
  const px = c.x + c.fx * 0.45;
  const py = c.y + c.fy * 0.45;
  const sup = supportAt(k, off, px, py);
  if (!sup || solidAt(k, off, px, py) >= 0) {
    ctx.ev.push({ k: "refuse", c: c.slot });
    return;
  }
  const o = off[sup.sec]!;
  w.loose.push({ item: c.held, x: px - o[0], y: py - o[1], sec: sup.sec });
  c.held = null;
  ctx.ev.push({ k: "drop", c: c.slot });
}

/** Ce qu'on prend (les mains vides) sur cette case, ou rien */
function takeFrom(ctx: Ctx, cell: number): Item | null {
  const { k, w } = ctx;
  if (w.fire[cell]! > 0) return null;
  const kind = k.cells[cell]!;
  const on = w.items[cell];
  if (kind === Cell.Rack) {
    if (on) {
      w.items[cell] = null;
      return on;
    }
    if (w.stack[cell]! > 0) {
      w.stack[cell] = w.stack[cell]! - 1;
      return { id: w.nextId++, k: "plate", c: [] };
    }
    return null;
  }
  if (kind === Cell.Return) {
    const n = w.stack[cell]!;
    if (n <= 0) return null;
    if (k.def.washing) {
      // Toute la pile d'un coup
      w.stack[cell] = 0;
      return { id: w.nextId++, k: "plate", c: [], dirty: true, n };
    }
    w.stack[cell] = n - 1;
    return { id: w.nextId++, k: "plate", c: [] };
  }
  if (kind === Cell.Sink || kind === Cell.Pass || kind === Cell.Trash) return null;
  if (on) {
    w.items[cell] = null;
    return on;
  }
  if (kind === Cell.Crate) {
    const good = k.crate[cell];
    if (!good) return null;
    const g = crateGood(good);
    return "base" in g ? { id: w.nextId++, k: "base", b: g.base, c: [], p: 0 } : { id: w.nextId++, k: "food", f: g.food, p: 0 };
  }
  return null;
}

/**
 * Ce qu'on tient, posé sur (ou versé dans) cette case : renvoie ce qu'on tient après (null : les mains vides),
 * "served" si le plat est parti, false si ça ne va pas.
 */
function putInto(ctx: Ctx, c: Chef, cell: number, held: Item): Item | null | false | "served" {
  const { k, w } = ctx;
  if (w.fire[cell]! > 0) return false;
  const kind = k.cells[cell]!;
  const on = w.items[cell];
  switch (kind) {
    case Cell.Trash: {
      ctx.ev.push({ k: "trash", c: c.slot, cell });
      if (held.k === "food" || held.k === "base") return null;
      if (held.k === "plate" && !held.dirty && (held.c ?? []).length > 0) return { ...held, c: [] };
      if ((held.k === "pot" || held.k === "pan") && (held.c ?? []).length > 0) return { ...held, c: [], p: 0 };
      ctx.ev.pop();
      return false;
    }
    case Cell.Pass: {
      if (held.k !== "plate" || held.dirty || (held.n ?? 1) > 1) return false;
      if (!serve(ctx, c, held)) return false;
      c.held = null;
      return "served";
    }
    case Cell.Sink: {
      if (held.k !== "plate" || !held.dirty) return false;
      w.stack[cell] = w.stack[cell]! + (held.n ?? 1);
      return null;
    }
    case Cell.Rack: {
      if (held.k !== "plate" || held.dirty || (held.c ?? []).length > 0) return false;
      w.stack[cell] = w.stack[cell]! + (held.n ?? 1);
      return null;
    }
    case Cell.Return:
      return false;
    case Cell.Stove: {
      if (!on) return held.k === "pot" || held.k === "pan" ? place(w, cell, held) : false;
      return combine(ctx, cell, on, held);
    }
    case Cell.Oven: {
      if (!on) return ovenable(held) ? place(w, cell, held) : false;
      return combine(ctx, cell, on, held);
    }
    case Cell.Fryer: {
      if (!on) return fryable(held) ? place(w, cell, held) : false;
      return combine(ctx, cell, on, held);
    }
    default: {
      if (!on) return place(w, cell, held);
      return combine(ctx, cell, on, held);
    }
  }
}

function place(w: World, cell: number, held: Item): null {
  w.items[cell] = held;
  return null;
}

/** On tient `held`, `on` est posé sur la case : ce qui se mélange (ou rien : false) */
function combine(ctx: Ctx, cell: number, on: Item, held: Item): Item | null | false {
  const { w, menu } = ctx;
  // Un aliment dans la main
  if (held.k === "food") {
    const f = held.f;
    if (on.k === "plate" && plateTakes(on, partOf(held), menu)) {
      on.c = [...(on.c ?? []), partOf(held)!];
      return null;
    }
    if (on.k === "pot" && potTakes(on, f)) {
      addToPot(on, f!);
      return null;
    }
    if (on.k === "pan" && panTakes(on, f)) {
      on.c = [f!];
      on.p = 0;
      return null;
    }
    if (on.k === "base" && baseTakes(on, f)) {
      on.c = [...(on.c ?? []), f!];
      return null;
    }
    return false;
  }
  // Une assiette dans la main : on y met ce qui est posé
  if (held.k === "plate") {
    if (held.dirty) {
      if (on.k === "plate" && on.dirty) {
        on.n = (on.n ?? 1) + (held.n ?? 1);
        return null;
      }
      return false;
    }
    const part = partOf(on);
    if (!plateTakes(held, part, menu)) return false;
    held.c = [...(held.c ?? []), part!];
    if (on.k === "pot" || on.k === "pan") {
      on.c = [];
      on.p = 0;
    } else w.items[cell] = null;
    return held;
  }
  // Une marmite dans la main : on verse dans l'assiette, ou on y ajoute ce qui est posé
  if (held.k === "pot") {
    if (on.k === "plate" && plateTakes(on, partOf(held), menu)) {
      on.c = [...(on.c ?? []), partOf(held)!];
      held.c = [];
      held.p = 0;
      return held;
    }
    if (on.k === "food" && potTakes(held, on.f)) {
      addToPot(held, on.f!);
      w.items[cell] = null;
      return held;
    }
    return false;
  }
  // Une poêle dans la main
  if (held.k === "pan") {
    if (on.k === "plate" && plateTakes(on, partOf(held), menu)) {
      on.c = [...(on.c ?? []), partOf(held)!];
      held.c = [];
      held.p = 0;
      return held;
    }
    if (on.k === "food" && panTakes(held, on.f)) {
      held.c = [on.f!];
      held.p = 0;
      w.items[cell] = null;
      return held;
    }
    return false;
  }
  // Un fond dans la main : on y pose la garniture posée là, ou (cuit) on le met sur l'assiette
  if (held.k === "base") {
    if (on.k === "food" && baseTakes(held, on.f)) {
      held.c = [...(held.c ?? []), on.f!];
      w.items[cell] = null;
      return held;
    }
    if (on.k === "plate" && plateTakes(on, partOf(held), menu)) {
      on.c = [...(on.c ?? []), partOf(held)!];
      return null;
    }
    return false;
  }
  return false;
}

function addToPot(pot: Item, f: FoodId) {
  const n = (pot.c ?? []).length;
  pot.p = Math.min(pot.p ?? 0, 1) * (n / (n + 1));
  pot.c = [...(pot.c ?? []), f];
}

function use(ctx: Ctx, c: Chef) {
  const { k, w, off } = ctx;
  const held = c.held;
  if (held?.k === "ext") return;
  if (held) {
    if (held.k === "food" && held.f && throwable(held.f)) throwItem(ctx, c);
    return;
  }
  const cell = targetCell(k, off, c);
  if (cell < 0 || w.fire[cell]! > 0) return;
  const kind = k.cells[cell]!;
  const on = w.items[cell];
  if (kind === Cell.Board && on?.k === "food" && on.f && CHOP[on.f]) {
    c.act = ACT_CHOP;
    c.cell = cell;
  } else if (kind === Cell.Sink && w.stack[cell]! > 0) {
    c.act = ACT_WASH;
    c.cell = cell;
  }
}

function throwItem(ctx: Ctx, c: Chef) {
  const it = c.held!;
  c.held = null;
  c.act = ACT_NONE;
  c.st.thrown++;
  ctx.w.flying.push({
    item: it,
    x: c.x + c.fx * 0.35,
    y: c.y + c.fy * 0.35,
    vx: c.fx * THROW_SPEED,
    vy: c.fy * THROW_SPEED,
    t: 0,
    by: c.slot,
  });
  ctx.ev.push({ k: "throw", c: c.slot });
}

// ---------------------------------------------------------------------------
// Ce qui cuit, ce qui brûle
// ---------------------------------------------------------------------------

function stations(ctx: Ctx) {
  const { k, w } = ctx;
  for (let i = 0; i < w.items.length; i++) {
    const it = w.items[i];
    if (!it) continue;
    const kind = k.cells[i]!;
    if (kind === Cell.Stove && (it.k === "pot" || it.k === "pan")) cookContainer(ctx, i, it);
    else if (kind === Cell.Fryer && it.k === "food") cookFried(ctx, i, it);
    else if (kind === Cell.Oven && it.k === "base") cookBaked(ctx, i, it);
  }
}

function cookContainer(ctx: Ctx, cell: number, it: Item) {
  const contents = it.c ?? [];
  if (contents.length === 0 || contents[0] === "charbon") return;
  const p = it.p ?? 0;
  let rate: number;
  if (it.k === "pot") {
    // Une marmite pas encore pleine mijote à feu doux : cuite, elle attend la suite sans brûler
    if (p >= 1 && contents.length < POT_FULL) return;
    rate = p < 1 ? 1 / (POT_S * contents.length * FPS) : 1 / (POT_BURN_S * FPS);
  } else {
    const f = contents[0] as FoodId;
    const info = PAN[f];
    if (p < 1 && !info) return;
    rate = p < 1 ? 1 / (info!.s * FPS) : 1 / (PAN_BURN_S * FPS);
  }
  const next = p + rate;
  if (p < 1 && next >= 1) {
    if (it.k === "pan") it.c = [PAN[contents[0] as FoodId]!.to];
    ctx.ev.push({ k: "cooked", cell });
  }
  it.p = next;
  if (next >= 2) burn(ctx, cell, it);
}

function cookFried(ctx: Ctx, cell: number, it: Item) {
  const f = it.f!;
  if (f === "charbon") return;
  const p = it.p ?? 0;
  const info = FRY[f];
  if (p < 1 && !info) return;
  const next = p + (p < 1 ? 1 / (info!.s * FPS) : 1 / (FRY_BURN_S * FPS));
  if (p < 1 && next >= 1) {
    it.f = info!.to;
    ctx.ev.push({ k: "cooked", cell });
  }
  it.p = next;
  if (next >= 2) burn(ctx, cell, it);
}

function cookBaked(ctx: Ctx, cell: number, it: Item) {
  const p = it.p ?? 0;
  const next = p + (p < 1 ? 1 / (OVEN[it.b!].s * FPS) : 1 / (OVEN_BURN_S * FPS));
  if (p < 1 && next >= 1) ctx.ev.push({ k: "cooked", cell });
  it.p = next;
  if (next >= 2) burn(ctx, cell, it);
}

/** C'est brûlé : du charbon, et le feu prend */
function burn(ctx: Ctx, cell: number, it: Item) {
  const { w } = ctx;
  if (it.k === "pot" || it.k === "pan") {
    it.c = ["charbon"];
    it.p = 2;
  } else w.items[cell] = { id: it.id, k: "food", f: "charbon", p: 2 };
  ctx.ev.push({ k: "burn", cell });
  ignite(ctx, cell);
}

function ignite(ctx: Ctx, cell: number) {
  const { w, k } = ctx;
  if (w.fire[cell]! > 0 || !flammable(k.cells[cell]!)) return;
  w.fire[cell] = 0.25;
  w.fireT[cell] = 0;
  ctx.ev.push({ k: "fire", cell });
}

function fires(ctx: Ctx) {
  const { k, w, off } = ctx;
  // L'extincteur d'abord
  for (const c of w.chefs) {
    if (c.act !== ACT_SPRAY || c.out > 0) continue;
    for (let i = 0; i < w.fire.length; i++) {
      if (w.fire[i]! <= 0) continue;
      const [x0, y0] = cellCorner(k, i, off);
      const dx = x0 + 0.5 - c.x;
      const dy = y0 + 0.5 - c.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > SPRAY_RANGE || (d > 0.6 && (dx * c.fx + dy * c.fy) / d < SPRAY_CONE)) continue;
      w.fire[i] = w.fire[i]! - 1 / (SPRAY_S * FPS);
      if (w.fire[i]! <= 0) {
        w.fire[i] = 0;
        w.fireT[i] = 0;
        c.st.fires++;
        ctx.ev.push({ k: "out", cell: i, c: c.slot });
      }
    }
  }
  const spread: number[] = [];
  for (let i = 0; i < w.fire.length; i++) {
    if (w.fire[i]! <= 0) continue;
    w.fire[i] = Math.min(1, w.fire[i]! + 1 / (FIRE_GROW_S * FPS));
    w.fireT[i] = w.fireT[i]! + 1;
    // Ce qui est posé dans le feu brûle
    const it = w.items[i];
    if (it && it.k === "food" && it.f !== "charbon") w.items[i] = { id: it.id, k: "food", f: "charbon", p: 2 };
    else if (it && (it.k === "pot" || it.k === "pan") && (it.c ?? []).length > 0 && it.c![0] !== "charbon") {
      it.c = ["charbon"];
      it.p = 2;
    } else if (it && it.k === "base") w.items[i] = { id: it.id, k: "food", f: "charbon", p: 2 };
    if (w.fire[i]! >= 1 && w.fireT[i]! >= FIRE_SPREAD_S * FPS) {
      w.fireT[i] = 0;
      spread.push(i);
    }
  }
  for (const i of spread) {
    const x = i % k.W;
    const y = Math.floor(i / k.W);
    const around = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]
      .filter(([xx, yy]) => xx! >= 0 && yy! >= 0 && xx! < k.W && yy! < k.H)
      .map(([xx, yy]) => yy! * k.W + xx!)
      .filter((j) => w.fire[j]! <= 0 && flammable(k.cells[j]!) && k.section[j] === k.section[i]);
    if (around.length === 0) continue;
    ignite(ctx, around[Math.floor(random(ctx.rng) * around.length)]!);
  }
}

// ---------------------------------------------------------------------------
// Ce qui vole, ce qui revient
// ---------------------------------------------------------------------------

function flight(ctx: Ctx) {
  const { k, w, off, menu } = ctx;
  for (let n = w.flying.length - 1; n >= 0; n--) {
    const fl = w.flying[n]!;
    const px = fl.x;
    const py = fl.y;
    fl.x += fl.vx * DT;
    fl.y += fl.vy * DT;
    fl.t++;
    // Rattrapé au vol par un chef les mains vides
    const catcher = w.chefs.find(
      (c) =>
        c.out === 0 && !c.held && (c.slot !== fl.by || fl.t > 8) && (c.x - fl.x) * (c.x - fl.x) + (c.y - fl.y) * (c.y - fl.y) < 0.5 * 0.5,
    );
    if (catcher) {
      catcher.held = fl.item;
      catcher.st.caught++;
      w.flying.splice(n, 1);
      ctx.ev.push({ k: "catch", c: catcher.slot });
      continue;
    }
    const hit = solidAt(k, off, fl.x, fl.y);
    if (hit >= 0) {
      w.flying.splice(n, 1);
      if (!landOn(ctx, hit, fl.item, menu)) drop(ctx, fl.item, px, py);
      continue;
    }
    if (fl.t >= THROW_FRAMES) {
      w.flying.splice(n, 1);
      drop(ctx, fl.item, fl.x, fl.y);
    }
  }
}

/** Un ingrédient lancé arrive sur une case : il s'y pose s'il y a la place (ou s'il va dans ce qui y est) */
function landOn(ctx: Ctx, cell: number, it: Item, menu: RecipeId[]): boolean {
  const { k, w } = ctx;
  const kind = k.cells[cell]!;
  if (w.fire[cell]! > 0 || !usable(kind)) return false;
  const on = w.items[cell];
  if (kind === Cell.Trash) {
    ctx.ev.push({ k: "trash", c: -1, cell });
    return true;
  }
  if (on) {
    if (on.k === "plate" && plateTakes(on, partOf(it), menu)) on.c = [...(on.c ?? []), partOf(it)!];
    else if (on.k === "pot" && potTakes(on, it.f)) addToPot(on, it.f!);
    else if (on.k === "pan" && panTakes(on, it.f)) {
      on.c = [it.f!];
      on.p = 0;
    } else if (on.k === "base" && baseTakes(on, it.f)) on.c = [...(on.c ?? []), it.f!];
    else return false;
    ctx.ev.push({ k: "put", c: -1, cell });
    return true;
  }
  if (kind === Cell.Counter || kind === Cell.Board || kind === Cell.Crate || (kind === Cell.Fryer && fryable(it))) {
    w.items[cell] = it;
    ctx.ev.push({ k: "put", c: -1, cell });
    return true;
  }
  return false;
}

/** Ça tombe par terre (ou dans l'eau) */
function drop(ctx: Ctx, it: Item, x: number, y: number) {
  const { k, w, off } = ctx;
  const sup = supportAt(k, off, x, y);
  if (!sup) {
    ctx.ev.push({ k: "splash", x, y });
    lose(ctx, it, k.team[Math.max(0, Math.min(k.W - 1, Math.floor(x)))] ?? 0);
    return;
  }
  const o = off[sup.sec]!;
  w.loose.push({ item: it, x: x - o[0], y: y - o[1], sec: sup.sec });
  ctx.ev.push({ k: "land", x, y });
}

function plateReturns(ctx: Ctx) {
  const { k, w } = ctx;
  for (let n = w.returns.length - 1; n >= 0; n--) {
    const r = w.returns[n]!;
    if (w.frame < r.at) continue;
    w.returns.splice(n, 1);
    const cell = returnFor(k, r.team);
    if (cell >= 0) w.stack[cell] = w.stack[cell]! + 1;
  }
}

// ---------------------------------------------------------------------------
// Les commandes
// ---------------------------------------------------------------------------

function pickRecipe(team: TeamState, kitchen: KitchenId): RecipeId {
  const menu = KITCHENS[kitchen].menu;
  const total = menu.reduce((s, m) => s + m.w, 0);
  const holder = { rng: team.rng };
  let r = random(holder) * total;
  team.rng = holder.rng;
  for (const m of menu) {
    r -= m.w;
    if (r < 0) return m.r;
  }
  return menu[menu.length - 1]!.r;
}

/** Au plus tant de commandes à la fois pour cette équipe */
export function maxOrders(w: World, team: number): number {
  const base = KITCHENS[w.kitchen].maxOrders;
  return w.teams[team]!.chefs >= 2.9 ? base + 1 : base;
}

function orders(ctx: Ctx) {
  const { w } = ctx;
  const def = KITCHENS[w.kitchen];
  w.teams.forEach((t, team) => {
    // Les commandes qui ont trop attendu
    for (let n = t.orders.length - 1; n >= 0; n--) {
      const o = t.orders[n]!;
      if (w.frame < o.until) continue;
      t.orders.splice(n, 1);
      t.score = Math.max(0, t.score - FAIL_COST);
      t.streak = 0;
      t.failed++;
      ctx.ev.push({ k: "fail", team, r: o.r });
      if (t.orders.length === 0) t.next = Math.min(t.next, w.frame + Math.round(1.5 * FPS));
    }
    if (w.frame < t.next) return;
    if (t.orders.length >= maxOrders(w, team)) {
      t.next = w.frame + FPS;
      return;
    }
    const r = pickRecipe(t, w.kitchen);
    const at = w.frame;
    t.orders.push({ id: w.nextId++, r, at, until: at + Math.round(RECIPES[r].time * FPS) });
    ctx.ev.push({ k: "order", team, r });
    // La première commande, puis la deuxième vite ; ensuite au rythme de la cuisine
    const first = t.orders.length === 1 && t.served + t.failed === 0;
    const holder = { rng: t.rng };
    const g = def.gap[0] + (def.gap[1] - def.gap[0]) * random(holder);
    t.rng = holder.rng;
    t.next = at + Math.round((first ? 5 : g * gapFactor(t.chefs)) * FPS);
  });
}

/** Le plat posé sur le passe : s'il répond à une commande, il part (et rapporte) */
function serve(ctx: Ctx, c: Chef, plate: Item): boolean {
  const { w, menu } = ctx;
  const dish = dishOf(plate.c ?? [], menu);
  if (!dish) return false;
  const t = w.teams[c.team]!;
  let pick = -1;
  t.orders.forEach((o, i) => {
    if (o.r === dish && (pick < 0 || o.until < t.orders[pick]!.until)) pick = i;
  });
  if (pick < 0) return false;
  const o = t.orders[pick]!;
  // Servie dans l'ordre (la plus ancienne d'abord) : l'enchaînement grimpe
  const oldest = t.orders.every((x) => x.at >= o.at);
  t.orders.splice(pick, 1);
  if (oldest) t.streak++;
  const mult = Math.max(1, Math.min(STREAK_MAX, t.streak));
  const frac = Math.max(0, Math.min(1, (o.until - w.frame) / Math.max(1, o.until - o.at)));
  const tip = Math.round(TIP_MAX * frac) * mult;
  const points = RECIPES[dish].value + tip;
  t.score += points;
  t.tips += tip;
  t.served++;
  t.best = Math.max(t.best, t.streak);
  c.st.served++;
  w.returns.push({ at: w.frame + Math.round(RETURN_S * FPS), team: c.team });
  ctx.ev.push({ k: "serve", team: c.team, r: dish, points, tip, mult, c: c.slot });
  if (t.orders.length === 0) t.next = Math.min(t.next, w.frame + Math.round(2 * FPS));
  return true;
}

// ---------------------------------------------------------------------------
// Les charrettes du marché
// ---------------------------------------------------------------------------

function carts(ctx: Ctx) {
  const { k, w } = ctx;
  const lane = k.def.lane ?? -1;
  if (lane < 0) return;
  const width = k.duel ? (k.W - 1) / 2 : k.W;
  const cr = cart(serviceTime(w), width);
  if (!cr.on) {
    w.hits = [];
    return;
  }
  for (const c of w.chefs) {
    if (c.out > 0 || w.hits.includes(c.slot)) continue;
    // En duel, la cuisine d'en face a sa charrette en miroir
    const x = c.team === 1 ? k.W - c.x : c.x;
    const inLane = c.y > lane - CHEF_R && c.y < lane + 1 + CHEF_R;
    if (!inLane || Math.abs(x - cr.x) > CART_LEN / 2 + CHEF_R) continue;
    w.hits.push(c.slot);
    // Bousculé hors de l'allée, du côté où il était, et ce qu'il tenait tombe par terre
    const up = c.y < lane + 0.5;
    c.vy = up ? -7 : 7;
    c.vx = (c.team === 1 ? -cr.dir : cr.dir) * 3;
    c.stun = CART_STUN;
    c.act = ACT_NONE;
    ctx.ev.push({ k: "hit", c: c.slot });
    if (c.held) {
      const it = c.held;
      c.held = null;
      // Ça tombe au bord de l'allée, sur le sol (ou à ses pieds si le bord est un étal)
      const y = up ? lane - 0.4 : lane + 1.4;
      drop(ctx, it, c.x, supportAt(k, ctx.off, c.x, y) ? y : c.y);
    }
  }
}

/** Pour l'écran : le tangage, la rafale, la charrette du moment */
export function hazardNow(w: World) {
  const t = serviceTime(w);
  const k = buildKitchen(w.kitchen, w.duel);
  return {
    tilt: k.def.hazard === "tangage" ? tangage(t).tilt : 0,
    gust: k.def.hazard === "vent" ? gust(t) : null,
    cart: k.def.hazard === "charrettes" ? cart(t, k.duel ? (k.W - 1) / 2 : k.W) : null,
  };
}
