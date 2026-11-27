// Ce qui bouscule les chefs, selon la cuisine : le bateau qui tangue, le vent sur les toits, les charrettes du marché.
// Tout se calcule d'après le temps du service (en secondes), avec des polynômes seulement (pas de trigonométrie) : le
// serveur et les téléphones trouvent exactement les mêmes forces au même moment.

import type { HazardKind } from "./kitchens.ts";

/** Une montée en douceur de 0 à 1 */
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

// ---------------------------------------------------------------------------
// Le tangage : une vague toutes les TANGAGE_EVERY secondes, d'un bord puis de l'autre
// ---------------------------------------------------------------------------

export const TANGAGE_EVERY = 11;
const TANGAGE_FIRST = 6;
const TANGAGE_RISE = 1.3;
const TANGAGE_HOLD = 2.2;
/** La pente qui fait glisser les chefs, en cases par seconde² */
const TANGAGE_PUSH = 5.2;

/** Le bateau penche : de −1 (vers la gauche) à 1 (vers la droite), et le numéro de la vague */
export function tangage(t: number): { tilt: number; wave: number } {
  if (t < TANGAGE_FIRST) return { tilt: 0, wave: -1 };
  const u = t - TANGAGE_FIRST;
  const wave = Math.floor(u / TANGAGE_EVERY);
  const v = u - wave * TANGAGE_EVERY;
  const side = wave % 2 === 0 ? 1 : -1;
  let k = 0;
  if (v < TANGAGE_RISE) k = smooth(v / TANGAGE_RISE);
  else if (v < TANGAGE_RISE + TANGAGE_HOLD) k = 1;
  else if (v < TANGAGE_RISE * 2 + TANGAGE_HOLD) k = 1 - smooth((v - TANGAGE_RISE - TANGAGE_HOLD) / TANGAGE_RISE);
  // Entre deux vagues, une houle légère
  const swell = 0.12 * (1 - k) * (v / TANGAGE_EVERY - 0.5);
  return { tilt: side * k + swell, wave };
}

// ---------------------------------------------------------------------------
// Le vent : une rafale annoncée (le drapeau claque), puis elle souffle
// ---------------------------------------------------------------------------

export const GUST_EVERY = 13;
const GUST_FIRST = 8;
export const GUST_WARN = 2;
const GUST_BLOW = 3.2;
const GUST_PUSH = 7.5;
/** Le sens des rafales, l'une après l'autre : vers le bas de l'écran, le haut, la droite, le bas, la gauche, le haut */
const GUST_DIRS: [number, number][] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** La rafale en cours : sa direction, sa force (0 à 1), et si elle n'est encore qu'annoncée */
export function gust(t: number): { dx: number; dy: number; k: number; warn: boolean; n: number } {
  if (t < GUST_FIRST) return { dx: 0, dy: 0, k: 0, warn: false, n: -1 };
  const u = t - GUST_FIRST;
  const n = Math.floor(u / GUST_EVERY);
  const v = u - n * GUST_EVERY;
  const [dx, dy] = GUST_DIRS[n % GUST_DIRS.length]!;
  if (v < GUST_WARN) return { dx, dy, k: 0, warn: true, n };
  const w = v - GUST_WARN;
  if (w > GUST_BLOW) return { dx, dy, k: 0, warn: false, n };
  const k = w < 0.4 ? smooth(w / 0.4) : w > GUST_BLOW - 0.6 ? 1 - smooth((w - GUST_BLOW + 0.6) / 0.6) : 1;
  return { dx, dy, k, warn: false, n };
}

// ---------------------------------------------------------------------------
// Les charrettes du marché : elles traversent l'allée, d'un côté puis de l'autre
// ---------------------------------------------------------------------------

export const CART_EVERY = 10;
const CART_FIRST = 7;
export const CART_WARN = 1.6;
export const CART_SPEED = 6.5;
export const CART_LEN = 2.2;

/** La charrette dans l'allée : où est son milieu (en cases), son sens, et si on l'entend seulement arriver */
export function cart(t: number, width: number): { x: number; dir: 1 | -1; warn: boolean; on: boolean; n: number } {
  if (t < CART_FIRST) return { x: -99, dir: 1, warn: false, on: false, n: -1 };
  const u = t - CART_FIRST;
  const n = Math.floor(u / CART_EVERY);
  const v = u - n * CART_EVERY;
  const dir: 1 | -1 = n % 2 === 0 ? 1 : -1;
  if (v < CART_WARN) return { x: dir > 0 ? -CART_LEN : width + CART_LEN, dir, warn: true, on: false, n };
  const run = (v - CART_WARN) * CART_SPEED - CART_LEN;
  const span = width + CART_LEN * 2;
  if (run > span) return { x: -99, dir, warn: false, on: false, n };
  return { x: dir > 0 ? run : width - run, dir, warn: false, on: true, n };
}

/** La force qui pousse tous les chefs d'une cuisine (en cases par seconde²) ; `mirror` pour la cuisine d'en face en duel */
export function hazardPush(kind: HazardKind | undefined, t: number, mirror: boolean): [number, number] {
  const sx = mirror ? -1 : 1;
  if (kind === "tangage") return [sx * tangage(t).tilt * TANGAGE_PUSH, 0];
  if (kind === "vent") {
    const g = gust(t);
    return [sx * g.dx * g.k * GUST_PUSH, g.dy * g.k * GUST_PUSH];
  }
  return [0, 0];
}
