// La conduite des karts, la même partout : chez le joueur pour son propre kart, sur le serveur pour les bots.
// Un modèle d'arcade : une vitesse le long du kart, un glissement de côté qui grandit dans les virages (surtout en
// dérapage), l'herbe qui freine, les murs qui renvoient. Le pas de temps est fixe (1/60 s) pour que tout le monde
// conduise pareil.

import type { VehicleStats } from "./garage.ts";
import {
  CROSSER_HALF,
  CROSSER_RADIUS,
  crosserAt,
  CURB,
  deltaS,
  DROP_HALF,
  DROP_RADIUS,
  dropAt,
  locate,
  pointAt,
  rollAt,
  SPRING_RADIUS,
  wrapAngle,
  wrapS,
  type Track,
  type ZoneKind,
} from "./track.ts";

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
/** La chute dans un trou : combien de temps, et à quelle vitesse on repart sur l'autre rive */
export const FALL_TIME = 1;
const RESPAWN_SPEED = 13;
const RESPAWN_DROP = 2.4;
/** L'élan minimal au décollage d'un tremplin (assez pour franchir le trou), et la poussée d'un trampoline */
const RAMP_MIN_SPEED = 21;
const SPRING_VY = 10;
/** Dans la boue, ce qu'il reste de la vitesse ; sur le verglas, ce qu'il reste d'adhérence (le dérapage y charge plus vite) */
const MUD = 0.7;
const ICE_GRIP = 0.3;
const ICE_CHARGE = 1.3;
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
  /** En train de tomber dans un trou : le temps qu'il reste (on repart ensuite sur l'autre rive) */
  fall: number;
  /** L'aspiration, de 0 à 1 (négative : le temps à attendre avant de pouvoir recommencer) */
  draft: number;
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
  /** La vitesse de pointe, en part de TOP_SPEED (cylindrée, niveau du bot, pièces…) */
  top: number;
  /** L'heure du serveur, en secondes (pour les engins qui traversent la route) ; sans elle, pas d'engins */
  time?: number;
  /** L'arc-en-ciel : l'herbe ne freine pas */
  star?: boolean;
  /** Le véhicule : son accélération, son braquage, sa tenue dans l'herbe, la charge de ses dérapages (kart par défaut) */
  vehicle?: Pick<VehicleStats, "accel" | "turn" | "grass" | "charge">;
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
  /** Un choc contre un autre kart, ou contre un engin qui traverse (en douceur, ou fort : un tête-à-queue) */
  | "bump"
  | "crash"
  /** Tombé dans un trou, et revenu sur la route */
  | "fall"
  | "respawn"
  /** Sur un trampoline */
  | "spring"
  /** L'aspiration d'un kart devant vient de nous lancer */
  | "draft";

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
    fall: 0,
    draft: 0,
  };
}

/** Rester dans le sillage d'un kart : le temps qu'il faut, la distance, la largeur, le coup de turbo, et le repos après */
export const DRAFT_TIME = 1.1;
const DRAFT_NEAR = 2.5;
const DRAFT_FAR = 17;
const DRAFT_SIDE = 1.8;
export const DRAFT_BOOST = 0.85;
const DRAFT_REST = 2.5;

/** L'aspiration : qui reste juste derrière un kart assez longtemps est lancé en avant */
export function draftStep(k: Kart, others: readonly Kart[], dt: number, events?: KartEvent[]): void {
  if (k.draft < 0) {
    k.draft = Math.min(0, k.draft + dt);
    return;
  }
  let behind = false;
  if (k.v > 15 && k.air === 0 && !k.offroad && k.spin === 0 && k.boost === 0 && k.fall === 0) {
    const fx = Math.sin(k.h);
    const fz = Math.cos(k.h);
    for (const o of others) {
      if (o === k || o.v < 12 || o.air > 0.5) continue;
      const dx = o.x - k.x;
      const dz = o.z - k.z;
      const along = dx * fx + dz * fz;
      if (along < DRAFT_NEAR || along > DRAFT_FAR || Math.abs(dx * fz - dz * fx) > DRAFT_SIDE) continue;
      behind = true;
      break;
    }
  }
  if (!behind) {
    k.draft = Math.max(0, k.draft - dt * 1.3);
    return;
  }
  k.draft += dt / DRAFT_TIME;
  if (k.draft >= 1) {
    k.draft = -DRAFT_REST;
    k.boost = Math.max(k.boost, DRAFT_BOOST);
    events?.push("draft");
  }
}

/** La conduite assistée : un petit coup de volant pour ne pas sortir de la route (ni rater un tremplin) */
export function assistSteer(t: Track, k: Kart, steer: number): number {
  if (k.air > 0.1 || k.spin > 0 || k.v < 8 || k.fall > 0) return steer;
  const rx = -t.tz[k.i]!;
  const rz = t.tx[k.i]!;
  const vd = Math.sin(k.h) * k.v * rx + Math.cos(k.h) * k.v * rz;
  const future = k.d + vd * 0.7;
  const nearGap = t.jumps.some((lip) => {
    const ahead = deltaS(t, k.s, lip);
    return ahead > 0 && ahead < 45;
  });
  const limit = nearGap ? t.half - 1.2 : t.half + 0.3;
  if (Math.abs(future) <= limit) return steer;
  return clamp(steer - Math.sign(future) * Math.min(1, (Math.abs(future) - limit) * 0.35), -1, 1);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Un choc contre un obstacle rond posé à (s, d), qui se déplace de côté à la vitesse `vd` : on rebondit, et un gros choc fait tourner */
function hitBlock(
  k: Kart,
  t: Track,
  at: ReturnType<typeof locate>,
  s: number,
  d: number,
  radius: number,
  vd: number,
  events: KartEvent[] | undefined,
  fx: number,
  fz: number,
  rx: number,
  rz: number,
): ReturnType<typeof locate> {
  const p = pointAt(t, s, d);
  const dx = k.x - p.x;
  const dz = k.z - p.z;
  const dist = Math.hypot(dx, dz);
  const min = radius + KART_RADIUS;
  if (dist >= min || dist < 1e-6) return at;
  const nx = dx / dist;
  const nz = dz / dist;
  k.x += nx * (min - dist);
  k.z += nz * (min - dist);
  const kvx = fx * k.v + rx * k.slip;
  const kvz = fz * k.v + rz * k.slip;
  const closing = -((kvx + p.tz * vd) * nx + (kvz - p.tx * vd) * nz);
  if (closing > 0) {
    const bx = kvx + nx * closing * 1.5;
    const bz = kvz + nz * closing * 1.5;
    k.v = (bx * fx + bz * fz) * 0.85;
    k.slip = (bx * rx + bz * rz) * 0.5;
    if (closing > 9 && k.spin === 0) {
      k.spin = SPIN_TIME * 0.6;
      k.drift = 0;
      k.charge = 0;
      k.boost = 0;
      events?.push("crash");
    } else if (closing > 2) events?.push("bump");
  }
  return locate(t, k.x, k.z, at.i);
}

/** Le niveau de mini-turbo atteint par un dérapage tenu `charge` secondes (0 : aucun) */
export function driftLevel(charge: number): 0 | 1 | 2 | 3 {
  return charge >= DRIFT_LEVELS[2] ? 3 : charge >= DRIFT_LEVELS[1] ? 2 : charge >= DRIFT_LEVELS[0] ? 1 : 0;
}

/** Un pas de conduite : le kart avance d'un DT selon ce qu'on lui demande */
export function step(k: Kart, input: Input, t: Track, mods: StepMods, events?: KartEvent[]): void {
  const dt = DT;
  // Dans un trou : on tombe, plus de commandes ; puis on repart sur l'autre rive, au milieu de la route
  if (k.fall > 0) {
    k.fall = Math.max(0, k.fall - dt);
    const f = 1 - k.fall / FALL_TIME;
    k.air = -6 * f * f;
    k.v *= Math.exp(-2.5 * dt);
    if (k.fall === 0) {
      const gap = t.gaps.find((g) => deltaS(t, g.from, k.s) > -3 && deltaS(t, g.to, k.s) < 3) ?? t.gaps[0];
      const s = wrapS(t, (gap?.to ?? k.s) + 4);
      const p = pointAt(t, s, 0);
      k.dist += deltaS(t, k.s, s);
      k.x = p.x;
      k.z = p.z;
      k.h = Math.atan2(p.tx, p.tz);
      k.v = RESPAWN_SPEED;
      k.slip = 0;
      // On le repose d'un peu haut, sur l'autre rive
      k.air = RESPAWN_DROP;
      k.vy = 0;
      const at = locate(t, k.x, k.z);
      k.i = at.i;
      k.s = at.s;
      k.d = at.d;
      k.y = at.y;
      events?.push("respawn");
    }
    return;
  }
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

  // La vitesse visée : moins dans l'herbe (sauf sous l'arc-en-ciel), plus avec un turbo
  const grass = k.offroad && !mods.star;
  const grassLeft = mods.vehicle?.grass ?? GRASS;
  const accel = ACCEL * (mods.vehicle?.accel ?? 1);
  // Les sols spéciaux : la boue freine, le verglas fait glisser
  let surface: ZoneKind | null = null;
  if (k.air <= 0.2) {
    for (const z of t.zones) {
      const along = deltaS(t, z.s, k.s);
      if (along >= 0 && along <= z.len && k.d >= z.d1 && k.d <= z.d2) surface = z.kind;
    }
  }
  let max = top * (grass ? grassLeft : 1) * (surface === "boue" && !mods.star ? MUD : 1);
  if (k.boost > 0) {
    max = top * BOOST_SPEED * (grass ? Math.max(0.85, grassLeft) : 1);
    k.boost = Math.max(0, k.boost - dt);
  }
  const push = ctl.gas || k.boost > 0;
  if (ctl.brake && k.v > 0.5) k.v -= BRAKE * dt;
  else if (ctl.brake) k.v = Math.max(-REVERSE, k.v - ACCEL * 0.6 * dt);
  else if (push && k.v < max) {
    const ratio = clamp(k.v / max, 0, 1);
    k.v += accel * (k.boost > 0 ? 2.2 : 1) * (1 - ratio * ratio) * dt + (k.v < 0 ? BRAKE * dt : 0);
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
  const turn = TURN * (mods.vehicle?.turn ?? 1);
  let yaw: number;
  if (k.drift !== 0) {
    // En dérapage, le kart tourne toujours du côté du dérapage : braquer dedans serre, braquer dehors élargit
    // Au neutre, un arc moyen (44 m à pleine vitesse, la taille des grands virages) ; braquer dedans le serre (27 m,
    // les épingles), dehors l'élargit (73 m) sans jamais aller tout droit : au clavier comme au doigt, on suit un
    // virage en restant presque toujours sur une seule touche
    const into = clamp(ctl.steer * k.drift, -1, 1);
    yaw = -k.drift * turn * (0.4 + (into >= 0 ? 0.26 : 0.16) * into) * speedF;
    if (!flying) {
      const before = driftLevel(k.charge);
      // Serrer charge plus vite, élargir plus lentement
      k.charge += dt * (1 + 0.5 * into) * (mods.vehicle?.charge ?? 1) * (surface === "glace" ? ICE_CHARGE : 1);
      const after = driftLevel(k.charge);
      if (after > before) events?.push(after === 3 ? "spark3" : after === 2 ? "spark2" : "spark1");
    }
  } else {
    yaw = -ctl.steer * turn * speedF * Math.sign(k.v || 1);
  }
  k.h = wrapAngle(k.h + yaw * dt);

  // Le glissement : le kart part vers l'extérieur du virage, beaucoup plus en dérapage
  const slideTarget = yaw * k.v * (k.drift !== 0 ? 0.2 : 0.045);
  const grip = (k.drift !== 0 ? 2.6 : k.offroad ? 5 : 9) * (surface === "glace" ? ICE_GRIP : 1);
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
  // Ce qui tombe ou dévale sur la route : même chose que les engins, avec leurs horaires
  if (mods.time !== undefined && k.air < 1) {
    for (const m of t.movers) {
      if (Math.abs(deltaS(t, m.s, at.s)) > 9) continue;
      if (m.kind === "drop") {
        const st = dropAt(m, t.half, mods.time);
        if (!st.solid) continue;
        // Le conteneur est couché le long de la route : on cherche son point le plus proche
        const along = Math.max(-DROP_HALF, Math.min(DROP_HALF, deltaS(t, m.s, at.s)));
        at = hitBlock(k, t, at, m.s + along, st.d, DROP_RADIUS, 0, events, fx, fz, rx, rz);
      } else {
        for (let i = 0; i < m.count; i++) {
          const d = rollAt(m, i, mods.time);
          if (d === null) continue;
          at = hitBlock(k, t, at, m.s, d, m.radius, m.speed, events, fx, fz, rx, rz);
        }
      }
    }
  }
  // Les engins qui traversent la route : un obstacle qui bouge ; on rebondit dessus, et trop vite c'est le tête-à-queue
  if (mods.time !== undefined && k.air < 1) {
    for (const c of t.crossers) {
      if (Math.abs(deltaS(t, c.s, at.s)) > 7) continue;
      const pos = crosserAt(c, mods.time);
      // Le cercle de l'engin le plus proche du kart (l'avant ou l'arrière)
      const near = Math.max(pos.d - CROSSER_HALF, Math.min(pos.d + CROSSER_HALF, at.d));
      const p = pointAt(t, c.s, near);
      const dx = k.x - p.x;
      const dz = k.z - p.z;
      const dist = Math.hypot(dx, dz);
      const min = CROSSER_RADIUS + KART_RADIUS;
      if (dist >= min || dist < 1e-6) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      k.x += nx * (min - dist);
      k.z += nz * (min - dist);
      // Les vitesses : celle du kart, et celle de l'engin (de côté, le long de la droite de la route)
      const vx = fx * k.v + rx * k.slip - -p.tz * pos.vd;
      const vz = fz * k.v + rz * k.slip - p.tx * pos.vd;
      const closing = -(vx * nx + vz * nz);
      if (closing > 0) {
        const bx = fx * k.v + rx * k.slip + nx * closing * 1.5;
        const bz = fz * k.v + rz * k.slip + nz * closing * 1.5;
        k.v = (bx * fx + bz * fz) * 0.85;
        k.slip = (bx * rx + bz * rz) * 0.5;
        if (closing > 9 && k.spin === 0) {
          k.spin = SPIN_TIME * 0.6;
          k.drift = 0;
          k.charge = 0;
          k.boost = 0;
          events?.push("crash");
        } else if (closing > 2) events?.push("bump");
      }
      at = locate(t, k.x, k.z, at.i);
    }
  }
  k.i = at.i;
  k.s = at.s;
  k.d = at.d;
  k.y = at.y;
  k.dist += deltaS(t, oldS, at.s);

  // Les tremplins : on monte la rampe, on décolle au bord ; une figure en l'air donne un turbo à l'atterrissage
  let ramp = -1;
  if (k.vy === 0 && Math.abs(k.d) <= t.half + CURB) {
    for (const lip of t.jumps) {
      const along = deltaS(t, lip, k.s);
      if (along >= -RAMP_LEN && along < 0) ramp = RAMP_H * (1 + along / RAMP_LEN);
      else if (along >= 0 && along < 4 && deltaS(t, lip, oldS) < 0 && k.air > RAMP_H * 0.5 && k.v > 6) {
        k.v = Math.max(k.v, RAMP_MIN_SPEED);
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

  // Au sol dans un trou : on tombe
  if (k.air <= 0 && k.vy === 0) {
    for (const g of t.gaps) {
      const along = deltaS(t, g.from, k.s);
      if (along >= 0 && along < g.to - g.from) {
        k.fall = FALL_TIME;
        k.drift = 0;
        k.charge = 0;
        k.boost = 0;
        k.spin = 0;
        events?.push("fall");
        return;
      }
    }
  }

  // Les accélérateurs au sol (pas en l'air)
  if (k.air > 0.2) return;
  // Les trampolines : on rebondit
  for (const p of t.springs) {
    if (k.vy !== 0 || Math.abs(deltaS(t, p.s, k.s)) > SPRING_RADIUS || Math.abs(k.d - p.d) > SPRING_RADIUS) continue;
    k.vy = SPRING_VY;
    k.air = Math.max(k.air, 0.05);
    k.trick = false;
    events?.push("spring");
    return;
  }
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
export function bump(a: Kart, b: Kart, moveA: boolean, moveB: boolean, weightA = 1, weightB = 1): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const min = KART_RADIUS * 2;
  if (dist >= min || dist < 1e-6 || (!moveA && !moveB) || a.fall > 0 || b.fall > 0) return 0;
  const nx = dx / dist;
  const nz = dz / dist;
  const over = min - dist;
  // Le plus lourd bouge moins (et s'il est seul à bouger, il ne se laisse pas repousser autant)
  const shareA = weightB / (weightA + weightB);
  const shareB = weightA / (weightA + weightB);
  const pushA = moveA && moveB ? shareA : 2 * shareA;
  const pushB = moveA && moveB ? shareB : 2 * shareB;
  if (moveA) {
    a.x -= nx * over * Math.min(1, pushA);
    a.z -= nz * over * Math.min(1, pushA);
  }
  if (moveB) {
    b.x += nx * over * Math.min(1, pushB);
    b.z += nz * over * Math.min(1, pushB);
  }
  // Ce qui allait de l'un vers l'autre : le plus lent est poussé, le plus rapide freiné
  const va = Math.sin(a.h) * a.v * nx + Math.cos(a.h) * a.v * nz;
  const vb = Math.sin(b.h) * b.v * nx + Math.cos(b.h) * b.v * nz;
  const closing = va - vb;
  if (closing <= 0) return over;
  if (moveA) {
    a.v -= closing * 0.7 * shareA * (Math.sin(a.h) * nx + Math.cos(a.h) * nz);
    a.slip -= closing * 0.7 * shareA * (-Math.cos(a.h) * nx + Math.sin(a.h) * nz);
  }
  if (moveB) {
    b.v += closing * 0.7 * shareB * (Math.sin(b.h) * nx + Math.cos(b.h) * nz);
    b.slip += closing * 0.7 * shareB * (-Math.cos(b.h) * nx + Math.sin(b.h) * nz);
  }
  return closing;
}

/** Le tour en cours (1 au départ) et le nombre de tours bouclés */
export function lapOf(t: Track, dist: number): { lap: number; done: number } {
  const done = Math.max(0, Math.floor(dist / t.length));
  return { lap: done + 1, done };
}
