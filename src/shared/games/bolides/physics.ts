// La conduite des karts, la même partout : chez le joueur pour son propre kart, sur le serveur pour les bots.
// Un modèle d'arcade : une vitesse le long du kart, un glissement de côté qui grandit dans les virages (surtout en
// dérapage), l'herbe qui freine, les murs qui renvoient. Le pas de temps est fixe (1/60 s) pour que tout le monde
// conduise pareil.

import { deltaS, locate, wrapAngle, type Track } from "./track.ts";

export type SpeedClass = "balade" | "normal" | "bolide";
export const SPEED_CLASSES: SpeedClass[] = ["balade", "normal", "bolide"];
/** La vitesse de pointe selon la cylindrée choisie */
export const CLASS_SPEED: Record<SpeedClass, number> = { balade: 0.82, normal: 1, bolide: 1.16 };

/** Le pas de la simulation */
export const DT = 1 / 60;
/** La vitesse de pointe (m/s, environ 97 km/h) en cylindrée normale */
export const TOP_SPEED = 27;
export const KART_RADIUS = 1.15;
const ACCEL = 11;
const BRAKE = 28;
const COAST = 5;
const REVERSE = 7;
/** Le cap gagné par seconde, braquage à fond */
const TURN = 2.2;
/** Un accélérateur ou un turbo : la vitesse de pointe en plus */
const BOOST_SPEED = 1.32;
/** Dans l'herbe, ce qu'il reste de la vitesse de pointe */
const GRASS = 0.55;
/** Le dérapage : le temps qu'il faut tenir pour chaque niveau de mini-turbo, et ce que dure le turbo gagné */
export const DRIFT_LEVELS = [0.7, 1.4, 2.2] as const;
const DRIFT_BOOST = [0.7, 1.1, 1.6] as const;
/** Les tremplins : la longueur et la hauteur de la rampe, la pesanteur, et le turbo d'une figure réussie en l'air */
export const RAMP_LEN = 7;
export const RAMP_H = 1;
const GRAVITY = 24;
const TRICK_BOOST = 0.8;
/** Le temps où le kart tourne sur lui-même après un coup */
export const SPIN_TIME = 1.1;

export interface Kart {
  x: number;
  z: number;
  /** Le cap : le kart regarde vers (sin h, cos h) */
  h: number;
  /** La vitesse vers l'avant (négative en marche arrière) et le glissement vers la droite, en m/s */
  v: number;
  slip: number;
  /** Le dérapage en cours : vers la droite (1), la gauche (-1), ou pas (0), et depuis combien de temps */
  drift: -1 | 0 | 1;
  charge: number;
  /** Ce qui reste du turbo en cours, et du tête-à-queue après un coup, en secondes */
  boost: number;
  spin: number;
  /** Le petit saut au début d'un dérapage (pour le dessin) */
  hop: number;
  /** Où il est sur la route : l'échantillon proche, la distance depuis la ligne, l'écart au milieu, la hauteur */
  i: number;
  s: number;
  d: number;
  y: number;
  /** La distance parcourue depuis le départ, le long de la route (négative derrière la ligne, au départ) */
  dist: number;
  offroad: boolean;
  /** La hauteur au-dessus de la route (sur une rampe ou en l'air) et la vitesse verticale (0 quand on roule) */
  air: number;
  vy: number;
  /** Une figure faite pendant ce saut : un turbo à l'atterrissage */
  trick: boolean;
  /** Le bouton de dérapage était tenu au pas d'avant (pour savoir quand on l'enfonce) */
  held: boolean;
}

export interface Input {
  /** Le volant, de -1 (à gauche) à 1 (à droite) */
  steer: number;
  gas: boolean;
  brake: boolean;
  /** Le bouton de dérapage, tenu */
  drift: boolean;
}

export const NO_INPUT: Input = { steer: 0, gas: false, brake: false, drift: false };

export interface StepMods {
  /** La vitesse de pointe, en part de TOP_SPEED (cylindrée, niveau du bot…) */
  top: number;
}

/** Ce qui s'est passé pendant le pas, pour les sons et les effets */
export type KartEvent =
  | "wall"
  | "pad"
  | "drift"
  /** Un palier de mini-turbo atteint pendant le dérapage (les étincelles changent de couleur) */
  | "spark1"
  | "spark2"
  | "spark3"
  | "turbo1"
  | "turbo2"
  | "turbo3"
  | "grass"
  | "jump"
  | "trick"
  | "land"
  /** Un choc contre un autre kart */
  | "bump";

export function newKart(t: Track, x: number, z: number, h: number): Kart {
  const at = locate(t, x, z);
  // Derrière la ligne : la distance parcourue part en dessous de zéro
  const behind = at.s > t.length / 2 ? at.s - t.length : at.s;
  return {
    x,
    z,
    h,
    v: 0,
    slip: 0,
    drift: 0,
    charge: 0,
    boost: 0,
    spin: 0,
    hop: 0,
    i: at.i,
    s: at.s,
    d: at.d,
    y: at.y,
    dist: behind,
    offroad: false,
    air: 0,
    vy: 0,
    trick: false,
    held: false,
  };
}

/** Le niveau de mini-turbo atteint par un dérapage tenu `charge` secondes (0 : aucun) */
export function driftLevel(charge: number): 0 | 1 | 2 | 3 {
  return charge >= DRIFT_LEVELS[2] ? 3 : charge >= DRIFT_LEVELS[1] ? 2 : charge >= DRIFT_LEVELS[0] ? 1 : 0;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Un pas de conduite : le kart avance d'un DT selon ce qu'on lui demande */
export function step(k: Kart, input: Input, t: Track, mods: StepMods, events?: KartEvent[]): void {
  const dt = DT;
  const top = TOP_SPEED * mods.top;
  let ctl = input;
  if (k.spin > 0) {
    // Un tête-à-queue : plus de commandes, le kart perd sa vitesse
    k.spin = Math.max(0, k.spin - dt);
    ctl = NO_INPUT;
    k.v *= Math.exp(-2.8 * dt);
    k.drift = 0;
    k.charge = 0;
  }
  if (k.hop > 0) k.hop = Math.max(0, k.hop - dt);
  const flying = k.vy !== 0;
  const pressed = ctl.drift && !k.held;
  k.held = ctl.drift;
  const wasOff = k.offroad;
  k.offroad = Math.abs(k.d) > t.roadEdge && !flying;
  if (k.offroad && !wasOff && k.v > 8) events?.push("grass");

  // La vitesse visée : moins dans l'herbe, plus avec un turbo
  let max = top * (k.offroad ? GRASS : 1);
  if (k.boost > 0) {
    max = top * BOOST_SPEED * (k.offroad ? 0.85 : 1);
    k.boost = Math.max(0, k.boost - dt);
  }
  const push = ctl.gas || k.boost > 0;
  if (ctl.brake && k.v > 0.5) k.v -= BRAKE * dt;
  else if (ctl.brake) k.v = Math.max(-REVERSE, k.v - ACCEL * 0.6 * dt);
  else if (push && k.v < max) {
    const ratio = clamp(k.v / max, 0, 1);
    k.v += ACCEL * (k.boost > 0 ? 2.2 : 1) * (1 - ratio * ratio) * dt + (k.v < 0 ? BRAKE * dt : 0);
  } else if (!push) k.v -= Math.sign(k.v) * Math.min(Math.abs(k.v), COAST * dt);
  // Au-dessus de la vitesse visée (fin de turbo, herbe), le kart ralentit vite mais sans à-coup
  if (k.v > max) k.v = Math.max(max, k.v - (k.v - max) * 2.4 * dt - 2 * dt);

  // Le dérapage : un petit saut quand on enfonce le bouton ; il commence dès qu'on braque un peu, bouton tenu, il
  // charge un mini-turbo, et il le lâche quand on relâche le bouton
  if (pressed && !flying && k.spin === 0) k.hop = Math.max(k.hop, 0.22);
  if (k.drift === 0 && ctl.drift && Math.abs(ctl.steer) > 0.15 && k.v > 9 && !k.offroad && k.spin === 0 && !flying) {
    k.drift = ctl.steer > 0 ? 1 : -1;
    k.charge = 0;
    k.hop = Math.max(k.hop, 0.15);
    events?.push("drift");
  } else if (k.drift !== 0 && (!ctl.drift || k.v < 7 || k.offroad)) {
    const level = driftLevel(k.charge);
    if (level > 0 && !k.offroad) {
      k.boost = Math.max(k.boost, DRIFT_BOOST[level - 1]!);
      events?.push(level === 3 ? "turbo3" : level === 2 ? "turbo2" : "turbo1");
    }
    k.drift = 0;
    k.charge = 0;
  }

  // Le braquage : nul à l'arrêt, un peu moins fort à pleine vitesse, inversé en marche arrière, à peine en l'air
  const speedF = clamp(Math.abs(k.v) / 6, 0, 1) * (1 - 0.3 * clamp(k.v / top, 0, 1.3)) * (flying ? 0.3 : 1);
  let yaw: number;
  if (k.drift !== 0) {
    // En dérapage, le kart tourne toujours du côté du dérapage : braquer dedans serre, braquer dehors élargit
    // Au neutre, un arc moyen (44 m à pleine vitesse, la taille des grands virages) ; braquer dedans le serre (27 m,
    // les épingles), dehors l'élargit (73 m) sans jamais aller tout droit : au clavier comme au doigt, on suit un
    // virage en restant presque toujours sur une seule touche
    const into = clamp(ctl.steer * k.drift, -1, 1);
    yaw = -k.drift * TURN * (0.4 + (into >= 0 ? 0.26 : 0.16) * into) * speedF;
    if (!flying) {
      const before = driftLevel(k.charge);
      // Serrer charge plus vite, élargir plus lentement
      k.charge += dt * (1 + 0.5 * into);
      const after = driftLevel(k.charge);
      if (after > before) events?.push(after === 3 ? "spark3" : after === 2 ? "spark2" : "spark1");
    }
  } else {
    yaw = -ctl.steer * TURN * speedF * Math.sign(k.v || 1);
  }
  k.h = wrapAngle(k.h + yaw * dt);

  // Le glissement : le kart part vers l'extérieur du virage, beaucoup plus en dérapage
  const slideTarget = yaw * k.v * (k.drift !== 0 ? 0.2 : 0.045);
  const grip = k.drift !== 0 ? 2.6 : k.offroad ? 5 : 9;
  k.slip += (slideTarget - k.slip) * Math.min(1, grip * dt);

  const fx = Math.sin(k.h);
  const fz = Math.cos(k.h);
  const rx = -fz;
  const rz = fx;
  k.x += (fx * k.v + rx * k.slip) * dt;
  k.z += (fz * k.v + rz * k.slip) * dt;

  const oldS = k.s;
  let at = locate(t, k.x, k.z, k.i);
  // Le mur : on revient en deçà, la vitesse qui allait dans le mur repart dans l'autre sens, amortie
  if (Math.abs(at.d) > t.wall) {
    const side = Math.sign(at.d);
    const over = Math.abs(at.d) - t.wall + 0.02;
    const nx = -t.tz[at.i]! * side;
    const nz = t.tx[at.i]! * side;
    k.x -= nx * over;
    k.z -= nz * over;
    const vx = fx * k.v + rx * k.slip;
    const vz = fz * k.v + rz * k.slip;
    const into = vx * nx + vz * nz;
    if (into > 0) {
      const bx = vx - nx * into * 1.45;
      const bz = vz - nz * into * 1.45;
      k.v = (bx * fx + bz * fz) * 0.9;
      k.slip = (bx * rx + bz * rz) * 0.5;
      if (into > 3) events?.push("wall");
      if (k.drift !== 0) {
        k.drift = 0;
        k.charge = 0;
      }
    }
    at = locate(t, k.x, k.z, at.i);
  }
  k.i = at.i;
  k.s = at.s;
  k.d = at.d;
  k.y = at.y;
  k.dist += deltaS(t, oldS, at.s);

  // Les tremplins : on monte la rampe, on décolle au bord ; une figure en l'air donne un turbo à l'atterrissage
  let ramp = -1;
  if (k.vy === 0 && Math.abs(k.d) <= t.half) {
    for (const lip of t.jumps) {
      const along = deltaS(t, lip, k.s);
      if (along >= -RAMP_LEN && along < 0) ramp = RAMP_H * (1 + along / RAMP_LEN);
      else if (along >= 0 && along < 4 && deltaS(t, lip, oldS) < 0 && k.air > RAMP_H * 0.5 && k.v > 6) {
        k.vy = 3 + k.v * 0.22;
        k.trick = false;
        events?.push("jump");
      }
    }
  }
  if (k.vy !== 0 || (k.air > 0 && ramp < 0)) {
    // En l'air (ou tombé du côté de la rampe) : la pesanteur, jusqu'à retoucher la route
    if (k.vy === 0) k.vy = -0.01;
    k.vy -= GRAVITY * dt;
    k.air += k.vy * dt;
    if (pressed && !k.trick && k.air > 0.3 && k.spin === 0) {
      k.trick = true;
      events?.push("trick");
    }
    if (k.air <= 0) {
      k.air = 0;
      k.vy = 0;
      events?.push("land");
      if (k.trick && k.spin === 0) k.boost = Math.max(k.boost, TRICK_BOOST);
      k.trick = false;
    }
  } else k.air = Math.max(0, ramp);

  // Les accélérateurs au sol (pas en l'air)
  if (k.air > 0.2) return;
  for (const pad of t.boosts) {
    const along = deltaS(t, pad.s, k.s);
    if (along >= 0 && along <= pad.length && Math.abs(k.d - pad.d) <= pad.halfWidth) {
      if (k.boost < 0.5) events?.push("pad");
      k.boost = Math.max(k.boost, 1);
    }
  }
}

/**
 * Deux karts qui se touchent s'écartent l'un de l'autre et échangent un peu de leur élan. `moveA` / `moveB` :
 * ceux dont on a le droit de changer la position (un joueur ne pousse que son propre kart, chez lui).
 * Renvoie la force du choc (0 s'ils ne se touchaient pas).
 */
export function bump(a: Kart, b: Kart, moveA: boolean, moveB: boolean): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const min = KART_RADIUS * 2;
  if (dist >= min || dist < 1e-6 || (!moveA && !moveB)) return 0;
  const nx = dx / dist;
  const nz = dz / dist;
  const over = min - dist;
  const share = moveA && moveB ? 0.5 : 1;
  if (moveA) {
    a.x -= nx * over * share;
    a.z -= nz * over * share;
  }
  if (moveB) {
    b.x += nx * over * share;
    b.z += nz * over * share;
  }
  // Ce qui allait de l'un vers l'autre : le plus lent est poussé, le plus rapide freiné
  const va = Math.sin(a.h) * a.v * nx + Math.cos(a.h) * a.v * nz;
  const vb = Math.sin(b.h) * b.v * nx + Math.cos(b.h) * b.v * nz;
  const closing = va - vb;
  if (closing <= 0) return over;
  if (moveA) {
    a.v -= closing * 0.35 * (Math.sin(a.h) * nx + Math.cos(a.h) * nz);
    a.slip -= closing * 0.35 * (-Math.cos(a.h) * nx + Math.sin(a.h) * nz);
  }
  if (moveB) {
    b.v += closing * 0.35 * (Math.sin(b.h) * nx + Math.cos(b.h) * nz);
    b.slip += closing * 0.35 * (-Math.cos(b.h) * nx + Math.sin(b.h) * nz);
  }
  return closing;
}

/** Le tour en cours (1 au départ) et le nombre de tours bouclés */
export function lapOf(t: Track, dist: number): { lap: number; done: number } {
  const done = Math.max(0, Math.floor(dist / t.length));
  return { lap: done + 1, done };
}
