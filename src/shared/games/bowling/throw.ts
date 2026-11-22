// Un lancer : ce que le joueur envoie (où il lâche la boule, dans quelle direction, à quelle vitesse, avec quel effet),
// la boule posée sur la piste au moment du lâcher, puis tout le lancer simulé jusqu'à ce que les quilles ne bougent plus.
// Le résultat dit quelles quilles sont tombées et où se tiennent celles qui sont restées debout (la machine les reposera
// là, bien droites, pour la boule suivante).

import { DECK_END, LANE_HALF, rowOf, type PinSpot } from "./lane.ts";
import { DEFAULT_PHYS, HZ, World, type PhysConfig, type PhysEvent } from "./physics.ts";

/** Ce que le joueur décide en lançant */
export interface ThrowParams {
  /** Où il lâche la boule, en travers de la piste (m, 0 au milieu, positif à droite) */
  x: number;
  /** Sa direction : de combien elle s'écarte de côté pour un mètre parcouru (positif : vers la droite) */
  d: number;
  /** Sa vitesse au lâcher (m/s) */
  v: number;
  /** Son effet, la rotation sur le côté (rad/s) : positif, la boule tourne vers la gauche en mordant le fond de piste */
  s: number;
}

export const SPEED_MIN = 2.5;
export const SPEED_MAX = 11.5;
export const SPIN_MAX = 30;
export const DIR_MAX = 0.075;
/** Où on peut lâcher la boule (le bord de la piste, moins un peu) */
export const X_MAX = LANE_HALF - 0.09;
/** La part de roulement vers l'avant que la main donne au lâcher (le reste vient du frottement) */
const ROLL_AT_RELEASE = 0.3;
/** La boule part un peu au-delà de la ligne de faute, juste au-dessus de la piste */
const RELEASE_Z = -0.35;
const RELEASE_DROP = 0.025;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const round = (v: number, k: number) => Math.round(v * k) / k;

/** Un lancer valide, arrondi (tous les appareils et le serveur partent des mêmes nombres), ou null */
export function cleanThrow(t: Partial<ThrowParams> | null | undefined): ThrowParams | null {
  if (!t) return null;
  const { x, d, v, s } = t;
  if (![x, d, v, s].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return {
    x: round(clamp(x!, -X_MAX, X_MAX), 1000),
    d: round(clamp(d!, -DIR_MAX, DIR_MAX), 10000),
    v: round(clamp(v!, SPEED_MIN, SPEED_MAX), 100),
    s: round(clamp(s!, -SPIN_MAX, SPIN_MAX), 100),
  };
}

/** Le monde prêt à jouer ce lancer : les quilles debout, la boule lâchée */
export function startThrow(rack: readonly PinSpot[], t: ThrowParams, cfg: PhysConfig = DEFAULT_PHYS): World {
  const w = new World(cfg, rack);
  const r = cfg.ballR;
  // La direction, à la longueur 1 (seulement une racine carrée : le même nombre partout)
  const l = Math.sqrt(1 + t.d * t.d);
  const dx = t.d / l,
    dz = -1 / l;
  // Rouler vers l'avant : ω = (haut × direction)·roulement ; l'effet tourne autour de la direction (−s·direction :
  // positif, le point de contact glisse vers la droite et le frottement emmène la boule vers la gauche)
  const roll = (ROLL_AT_RELEASE * t.v) / r;
  w.launch([t.x, r + RELEASE_DROP, RELEASE_Z], [dx * t.v, -0.25, dz * t.v], [dz * roll - t.s * dx, 0, -dx * roll - t.s * dz]);
  return w;
}

/** Le lancer est fini : la boule est dans la fosse (ou arrêtée) et plus aucune quille ne bouge */
export function settled(w: World): boolean {
  const b = w.ball;
  const ballDone = b.gone || (b.vx * b.vx + b.vz * b.vz < 0.01 && w.step > HZ);
  if (!ballDone) return false;
  for (const p of w.pins) if (p.awake && !p.gone) return false;
  return true;
}

/** Au plus dix secondes : au-delà, on arrête tout (une quille qui roulerait encore compte comme elle est) */
export const MAX_STEPS = 10 * HZ;
/** Après le dernier mouvement, on attend encore un peu avant de compter (une quille peut encore vaciller) */
const SETTLE_STEPS = Math.round(0.35 * HZ);

/** Une quille est debout si elle est presque droite et posée sur le plateau */
export function standing(p: { gone: boolean; upY: number; baseX: () => number; baseY: () => number; baseZ: () => number }): boolean {
  if (p.gone || p.upY < 0.94) return false;
  const x = p.baseX(),
    y = p.baseY(),
    z = p.baseZ();
  return y > -0.01 && y < 0.02 && x > -LANE_HALF && x < LANE_HALF && z > -DECK_END;
}

export interface ThrowOutcome {
  /** Les quilles tombées pendant ce lancer (leurs numéros) */
  down: number[];
  /** Celles qui tiennent encore, là où elles sont (arrondi au dixième de millimètre) */
  standing: PinSpot[];
  /** La boule est partie dans la rigole avant de toucher une quille */
  gutter: boolean;
  /** Le nombre de pas simulés (la durée du lancer) */
  steps: number;
  /** Le pas où la boule touche la première quille (-1 : aucune) */
  firstHit: number;
  /** Le pas où le résultat est joué : plus aucune quille ne tombe ni ne se relève (on peut l'annoncer) */
  decided: number;
}

/** Le suivi d'un lancer pas à pas : le dernier moment où une quille a changé (debout ou tombée), et la boule partie */
export interface Watch {
  up: boolean[];
  lastChange: number;
  ballGone: number;
}

export function watchStart(w: World): Watch {
  return { up: w.pins.map((p) => standing(p)), lastChange: 0, ballGone: -1 };
}

/** À chaque pas : une quille qui tombe (ou qui vacille au point de compter tombée) repousse le moment du résultat */
export function watchStep(w: World, s: Watch) {
  for (let i = 0; i < w.pins.length; i++) {
    const up = standing(w.pins[i]!);
    if (up !== s.up[i]) {
      s.up[i] = up;
      s.lastChange = w.step;
    }
  }
  if (s.ballGone < 0 && (w.ball.gone || (w.inGutter && -w.ball.pz > DECK_END - 0.3))) s.ballGone = w.step;
}

/** Le pas où le résultat est joué : un peu après le dernier changement, jamais avant que la boule soit au bout */
export function decidedStep(w: World, s: Watch): number {
  let d = Math.max(s.lastChange + Math.round(0.45 * HZ), s.ballGone >= 0 ? s.ballGone + Math.round(0.2 * HZ) : 0);
  if (w.firstHit >= 0) d = Math.max(d, w.firstHit + Math.round(0.9 * HZ));
  return Math.min(w.step, d);
}

export function outcomeOf(w: World, decided = w.step): ThrowOutcome {
  const up: PinSpot[] = [];
  const down: number[] = [];
  for (const p of w.pins) {
    if (standing(p)) up.push({ n: p.id, x: round(p.baseX(), 10000), z: round(p.baseZ(), 10000) });
    else down.push(p.id);
  }
  return {
    down: down.sort((a, b) => a - b),
    standing: up.sort((a, b) => a.n - b.n),
    // Dans la rigole avant d'avoir touché la moindre quille
    gutter: w.inGutter && (w.firstHit < 0 || w.gutterAt < w.firstHit),
    steps: w.step,
    firstHit: w.firstHit,
    decided,
  };
}

/** Faire avancer un lancer jusqu'au bout ; renvoie le pas où le résultat a été joué */
export function runToEnd(w: World): number {
  let calm = 0;
  const watch = watchStart(w);
  while (w.step < MAX_STEPS) {
    w.advance();
    watchStep(w, watch);
    if (settled(w)) {
      if (++calm >= SETTLE_STEPS) break;
    } else calm = 0;
  }
  return decidedStep(w, watch);
}

/** Tout le lancer, d'un coup (le serveur, les bots, les tests) */
export function simulateThrow(
  rack: readonly PinSpot[],
  t: ThrowParams,
  cfg: PhysConfig = DEFAULT_PHYS,
): ThrowOutcome & { events: PhysEvent[] } {
  const w = startThrow(rack, t, cfg);
  const decided = runToEnd(w);
  return { ...outcomeOf(w, decided), events: w.events };
}

/** Les quilles debout d'un jeu, triées de l'avant vers le fond (pour viser la plus proche) */
export function frontPin(rack: readonly PinSpot[]): PinSpot | null {
  return [...rack].sort((a, b) => rowOf(a.n) - rowOf(b.n) || Math.abs(a.x) - Math.abs(b.x))[0] ?? null;
}
