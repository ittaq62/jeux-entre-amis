// Un coup : ce que le joueur envoie (la direction de la queue, la force, le point de frappe sur la blanche), le monde prêt
// à le jouer, et le coup entier simulé jusqu'à ce que plus rien ne bouge. Les nombres sont arrondis avant tout : le
// serveur et tous les écrans partent exactement des mêmes.

import { CAROM_PHYS, DT, HZ, MAX_STEPS, POOL_PHYS, TIP_REACH, World, type PhysConfig, type PhysEvent } from "./physics.ts";
import { tableOf, type Table, type TableKind } from "./table.ts";

export interface ShotParams {
  /** La direction de la queue, vue de dessus (on la ramène à la longueur 1) */
  dx: number;
  dy: number;
  /** La force, de 0 à 1 (la queue reculée à fond : 1) */
  p: number;
  /** Le point de frappe dans le disque de rayon 1 : a de côté (positif : à droite), b en hauteur (positif : haut) */
  a: number;
  b: number;
}

/** Une bille sur le tapis */
export interface BallSpot {
  id: number;
  x: number;
  y: number;
}

export const SPEED_MIN = 0.1;
export const SPEED_MAX: Record<TableKind, number> = { poches: 8.8, carambole: 6.8 };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const round = (v: number, k: number) => Math.round(v * k) / k;

/** La vitesse donnée à la bille pour cette force (la course de la queue compte au carré : plus fin dans les petits coups) */
export function speedOf(kind: TableKind, p: number): number {
  return SPEED_MIN + (SPEED_MAX[kind] - SPEED_MIN) * p * p;
}

/** La force qu'il faut pour cette vitesse */
export function powerFor(kind: TableKind, v: number): number {
  return Math.sqrt(clamp((v - SPEED_MIN) / (SPEED_MAX[kind] - SPEED_MIN), 0, 1));
}

/** Un coup valide, arrondi, ou null */
export function cleanShot(s: Partial<ShotParams> | null | undefined): ShotParams | null {
  if (!s) return null;
  const { dx, dy, p, a, b } = s;
  if (![dx, dy, p, a, b].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const l = Math.sqrt(dx! * dx! + dy! * dy!);
  if (!(l > 1e-6)) return null;
  // Le point de frappe reste dans le disque
  let ta = clamp(a!, -1, 1),
    tb = clamp(b!, -1, 1);
  const r = Math.sqrt(ta * ta + tb * tb);
  if (r > 1) {
    ta /= r;
    tb /= r;
  }
  return {
    dx: round(dx! / l, 1e6),
    dy: round(dy! / l, 1e6),
    p: round(clamp(p!, 0, 1), 1e4),
    a: round(ta, 1000),
    b: round(tb, 1000),
  };
}

/** La table et son tapis : de quoi jouer un coup */
export interface Rig {
  kind: TableKind;
  table: Table;
  phys: PhysConfig;
}

/** Les règles folles qui changent la table : de grandes poches, un tapis qui glisse, des bandes qui rebondissent */
export interface RigOptions {
  larges?: boolean;
  glisse?: boolean;
  rebonds?: boolean;
}

export function rigOf(kind: TableKind, o: RigOptions = {}): Rig {
  const phys: PhysConfig = { ...(kind === "carambole" ? CAROM_PHYS : POOL_PHYS) };
  if (o.glisse) {
    phys.roll *= 0.45;
    phys.slide *= 0.6;
  }
  if (o.rebonds) phys.cushionE = 0.97;
  return { kind, table: tableOf(kind, Boolean(o.larges) && kind === "poches"), phys };
}

/** Le monde prêt à jouer ce coup : les billes à leur place, la bille jouée frappée */
export function startShot(rig: Rig, balls: readonly BallSpot[], cue: number, s: ShotParams): World {
  const w = new World(rig.table, rig.phys, balls);
  w.strike(cue, { dx: s.dx, dy: s.dy, v: speedOf(rig.kind, s.p), a: s.a, b: s.b });
  return w;
}

/**
 * La vitesse à laquelle les écrans montrent le coup, selon la bille la plus rapide : à vitesse réelle tant que ça bouge
 * franchement, puis plus vite quand il ne reste que des billes qui finissent de rouler (pas de temps mort).
 */
export function playbackRate(maxSpeed: number): number {
  if (maxSpeed >= 0.3) return 1;
  if (maxSpeed <= 0.06) return 2.6;
  return 1 + ((0.3 - maxSpeed) / 0.24) * 1.6;
}

export function maxSpeed(w: World): number {
  let m = 0;
  for (const b of w.balls) {
    if (!b.on) continue;
    const v = b.vx * b.vx + b.vy * b.vy;
    if (v > m) m = v;
  }
  return Math.sqrt(m);
}

export interface ShotResult {
  /** Les billes à la fin (celles tombées n'y sont plus) */
  balls: BallSpot[];
  /** Les billes tombées, dans l'ordre, avec leur poche (−1 : sortie de la table) */
  pocketed: { id: number; pocket: number; s: number }[];
  events: PhysEvent[];
  steps: number;
  /** Le temps de le montrer à l'écran (ms), accéléré à la fin */
  showMs: number;
}

/** Le coup entier, jusqu'à ce que plus rien ne bouge */
export function simulateShot(rig: Rig, balls: readonly BallSpot[], cue: number, s: ShotParams, maxSteps = MAX_STEPS): ShotResult {
  const w = startShot(rig, balls, cue, s);
  let shown = 0;
  while (w.moving && w.step < maxSteps) {
    w.advance();
    shown += DT / playbackRate(maxSpeed(w));
  }
  if (w.moving) w.freeze();
  return resultOf(w, shown);
}

export function resultOf(w: World, shownSeconds: number): ShotResult {
  return {
    balls: w.balls.filter((b) => b.on).map((b) => ({ id: b.id, x: b.x, y: b.y })),
    pocketed: w.events
      .filter((e) => e.k === "poche" || e.k === "sortie")
      .map((e) => ({ id: e.a, pocket: e.k === "poche" ? e.b : -1, s: e.s })),
    events: w.events,
    steps: w.step,
    showMs: Math.round(shownSeconds * 1000),
  };
}

export { HZ, TIP_REACH };
export type { Table };
