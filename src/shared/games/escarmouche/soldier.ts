// Un soldat et ses commandes : ce que le joueur demande à chaque pas (1/60 de seconde), et ce que ça donne. Le serveur
// fait autorité ; le téléphone (ou l'ordinateur) du joueur joue les mêmes pas en avance pour ne pas attendre le réseau,
// puis se recale sur ce que le serveur a vraiment retenu. Tout est donc calculé ici, de la même façon des deux côtés.

import { GRENADE, KNIFE, WEAPONS, type PrimaryId, type WeaponDef, type WeaponId } from "./weapons.ts";
import type { World } from "./world.ts";

/** Un pas de simulation */
export const DT = 1 / 60;

export const RADIUS = 0.3;
export const HEIGHT = 1.78;
export const CROUCH_HEIGHT = 1.2;
export const EYE = 1.62;
export const CROUCH_EYE = 1.05;
const STEP = 0.45;
const GRAVITY = 17;
const JUMP = 5.6;
const WALK = 4.8;
const RUN = 6.6;
const CROUCH_SPEED = 2.5;
const ACCEL = 48;
const AIR_ACCEL = 7;
const SWITCH_TIME = 0.45;
export const MAX_PITCH = 1.45;

/** Les boutons d'une commande */
export const B = {
  fire: 1,
  ads: 2,
  jump: 4,
  crouch: 8,
  sprint: 16,
  reload: 32,
  grenade: 64,
  melee: 128,
  swap: 256,
  slot1: 512,
  slot2: 1024,
} as const;

/** Ce que demande le joueur pour un pas */
export interface Cmd {
  /** Son numéro : le serveur renvoie le dernier qu'il a joué */
  s: number;
  /** Pas de côté et en avant, de -1 à 1 */
  mx: number;
  mz: number;
  /** Où il regarde (radians) : yaw 0 vers -z, pitch vers le haut */
  yaw: number;
  pitch: number;
  b: number;
  /** L'heure du serveur (ms) à laquelle il voyait les autres : c'est là que ses balles les cherchent */
  vt: number;
}

/** Une commande telle qu'elle voyage : des entiers, pour que les deux côtés jouent exactement la même chose */
export type CmdNet = [s: number, mx: number, mz: number, yaw: number, pitch: number, b: number, vt: number];

export function encodeCmd(c: Cmd): CmdNet {
  return [c.s, Math.round(c.mx * 100), Math.round(c.mz * 100), Math.round(c.yaw * 1000), Math.round(c.pitch * 1000), c.b, Math.round(c.vt)];
}

export function decodeCmd(n: unknown): Cmd | null {
  if (!Array.isArray(n) || n.length !== 7 || !n.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const [s, mx, mz, yaw, pitch, b, vt] = n as number[];
  const c = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    s: s!,
    mx: c(Math.round(mx!), -100, 100) / 100,
    mz: c(Math.round(mz!), -100, 100) / 100,
    yaw: Math.round(wrapAngle(Math.round(yaw!) / 1000) * 1000) / 1000,
    pitch: c(Math.round(pitch!) / 1000, -MAX_PITCH, MAX_PITCH),
    b: Math.round(b!) & 2047,
    vt: vt!,
  };
}

/** Une commande arrondie comme si elle avait voyagé : celle que le joueur joue chez lui */
export function quantizeCmd(c: Cmd): Cmd {
  return decodeCmd(encodeCmd(c))!;
}

export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  let r = a % t;
  if (r > Math.PI) r -= t;
  if (r < -Math.PI) r += t;
  return r;
}

/** Tout ce qui se joue en avance chez le joueur : sa position, son arme */
export interface Soldier {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  ground: boolean;
  crouch: boolean;
  /** Son horloge propre (s) : elle avance d'un pas à chaque commande jouée */
  clock: number;
  alive: boolean;
  /** 0 : l'arme principale ; 1 : le pistolet */
  slot: 0 | 1;
  primary: PrimaryId | "pistolet";
  mag: [number, number];
  res: [number, number];
  /** Fin du rechargement, du changement d'arme, du lancer, du coup de couteau (à son horloge), 0 si rien en cours */
  reloadEnd: number;
  switchEnd: number;
  throwEnd: number;
  meleeEnd: number;
  nextFire: number;
  /** Les coups tirés depuis son arrivée : ils décident de la dispersion, la même des deux côtés */
  shots: number;
  bloom: number;
  grenades: number;
  /** Les boutons du pas d'avant (un appui ne compte qu'une fois) */
  prevB: number;
  ads: boolean;
  sprint: boolean;
  /** Le dernier pas joué */
  seq: number;
  /** Pour le dessin : le dernier coup tiré, à son horloge */
  firedAt: number;
}

export function weaponOf(s: Soldier): WeaponDef {
  return WEAPONS[s.slot === 0 ? s.primary : "pistolet"];
}

export function heightOf(s: { crouch: boolean }): number {
  return s.crouch ? CROUCH_HEIGHT : HEIGHT;
}

export function eyeOf(s: { y: number; crouch: boolean }): number {
  return s.y + (s.crouch ? CROUCH_EYE : EYE);
}

export function newSoldier(
  x: number,
  y: number,
  z: number,
  yaw: number,
  primary: PrimaryId | "pistolet",
  grenades = GRENADE.count,
): Soldier {
  const p = WEAPONS[primary];
  const q = WEAPONS.pistolet;
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    pitch: 0,
    ground: true,
    crouch: false,
    clock: 0,
    alive: true,
    slot: 0,
    primary,
    mag: [p.mag, q.mag],
    res: [p.reserve, q.reserve],
    reloadEnd: 0,
    switchEnd: 0,
    throwEnd: 0,
    meleeEnd: 0,
    nextFire: 0,
    shots: 0,
    bloom: 0,
    grenades,
    prevB: 0,
    ads: false,
    sprint: false,
    seq: 0,
    firedAt: -10,
  };
}

/** Le regard en vecteur unitaire */
export function forward(yaw: number, pitch: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

/** Un petit nombre pseudo-aléatoire, toujours le même pour les mêmes entrées */
export function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Ce qu'un pas a déclenché : des balles (une par plomb), un lancer de grenade, un coup de couteau */
export interface Shot {
  weapon: WeaponId;
  ox: number;
  oy: number;
  oz: number;
  /** Une direction par plomb */
  dirs: [number, number, number][];
}

export interface StepOut {
  shots: Shot[];
  grenade: { x: number; y: number; z: number; vx: number; vy: number; vz: number } | null;
  melee: boolean;
  /** Le rechargement vient de commencer, l'arme de changer : pour les sons */
  reloaded: boolean;
  swapped: boolean;
  jumped: boolean;
  landed: number;
}

export function emptyOut(): StepOut {
  return { shots: [], grenade: null, melee: false, reloaded: false, swapped: false, jumped: false, landed: 0 };
}

/** La dispersion actuelle (degrés) : à la hanche ou en visant, en mouvement, accroupi, et ce que les rafales ajoutent */
export function spreadOf(s: Soldier): number {
  const w = weaponOf(s);
  const speed = Math.hypot(s.vx, s.vz);
  let base = s.ads ? w.ads : w.hip;
  if (s.crouch) base *= 0.75;
  const moving = Math.min(1, speed / WALK) * w.moving * (s.ads ? 0.5 : 1);
  const air = s.ground ? 0 : 2.5;
  return base + moving + air + s.bloom;
}

/**
 * Un pas : le joueur se déplace, et son arme fait ce qu'il demande. `world` arrête ses pas ; `free` dit s'il a le droit
 * d'agir (pendant le compte à rebours, il regarde seulement).
 */
export function stepSoldier(s: Soldier, cmd: Cmd, world: World, free = true, out: StepOut = emptyOut()): StepOut {
  s.seq = cmd.s;
  s.yaw = cmd.yaw;
  s.pitch = cmd.pitch;
  if (!s.alive) {
    s.prevB = cmd.b;
    return out;
  }
  s.clock += DT;
  const b = free ? cmd.b : 0;
  const pressed = b & ~s.prevB;
  s.prevB = b;
  const w0 = weaponOf(s);

  // Accroupi tant qu'on tient la touche ; on ne se relève que s'il y a la place
  if (b & B.crouch) s.crouch = true;
  else if (s.crouch && !world.overlaps(s.x - RADIUS, s.y + 0.05, s.z - RADIUS, s.x + RADIUS, s.y + HEIGHT, s.z + RADIUS)) s.crouch = false;

  const firing = (b & B.fire) !== 0;
  const busy = s.throwEnd > s.clock || s.meleeEnd > s.clock;
  s.sprint = (b & B.sprint) !== 0 && cmd.mz > 0.3 && !s.crouch && !firing && !(b & B.ads) && !busy;
  s.ads = (b & B.ads) !== 0 && !s.sprint && s.reloadEnd === 0 && !busy;

  // Le déplacement
  const mx = free ? cmd.mx : 0;
  const mz = free ? cmd.mz : 0;
  let wx = Math.cos(s.yaw) * mx - Math.sin(s.yaw) * mz;
  let wz = -Math.sin(s.yaw) * mx - Math.cos(s.yaw) * mz;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) {
    wx /= wl;
    wz /= wl;
  }
  let speed = s.crouch ? CROUCH_SPEED : s.sprint ? RUN : WALK;
  speed *= w0.move * (s.ads ? w0.adsMove : 1);
  const tx = wx * speed;
  const tz = wz * speed;
  const acc = (s.ground ? ACCEL : AIR_ACCEL) * DT;
  const dvx = tx - s.vx;
  const dvz = tz - s.vz;
  const dl = Math.hypot(dvx, dvz);
  if (dl <= acc) {
    s.vx = tx;
    s.vz = tz;
  } else if (s.ground || wl > 0.01) {
    s.vx += (dvx / dl) * acc;
    s.vz += (dvz / dl) * acc;
  }
  if (pressed & B.jump && s.ground && !s.crouch) {
    s.vy = JUMP;
    s.ground = false;
    out.jumped = true;
  }
  s.vy -= GRAVITY * DT;
  moveBody(s, world);

  // L'arme
  stepWeapon(s, b, pressed, out);
  return out;
}

/** Les pas d'un corps : glisser le long des murs, monter les marches, tomber */
function moveBody(s: Soldier, world: World) {
  const h = heightOf(s);
  const dx = s.vx * DT;
  const dz = s.vz * DT;
  const wasGround = s.ground;
  const start = { x: s.x, y: s.y, z: s.z };
  const plain = { ...start };
  world.moveAxis(plain, RADIUS, h, 0, dx);
  world.moveAxis(plain, RADIUS, h, 2, dz);
  let p = plain;
  const blocked = Math.abs(plain.x - start.x - dx) > 1e-6 || Math.abs(plain.z - start.z - dz) > 1e-6;
  if (blocked && wasGround) {
    // Une marche : on essaie le même pas un peu plus haut, puis on redescend
    const up = { ...start };
    const rose = world.moveAxis(up, RADIUS, h, 1, STEP);
    world.moveAxis(up, RADIUS, h, 0, dx);
    world.moveAxis(up, RADIUS, h, 2, dz);
    const fell = world.moveAxis(up, RADIUS, h, 1, -rose - 0.01);
    const landedOn = fell > -rose - 0.01 + 1e-6;
    const gainUp = Math.hypot(up.x - start.x, up.z - start.z);
    const gainPlain = Math.hypot(plain.x - start.x, plain.z - start.z);
    if (landedOn && gainUp > gainPlain + 1e-4) p = up;
  }
  // Les murs arrêtent la vitesse qui pousse contre eux
  if (p === plain) {
    if (Math.abs(plain.x - start.x - dx) > 1e-6) s.vx = 0;
    if (Math.abs(plain.z - start.z - dz) > 1e-6) s.vz = 0;
  }
  s.x = p.x;
  s.z = p.z;
  s.y = p.y;
  // La chute, ou la descente d'une marche quand on marchait au sol
  const want = s.vy * DT;
  const pos = { x: s.x, y: s.y, z: s.z };
  const moved = world.moveAxis(pos, RADIUS, h, 1, want);
  if (want < 0 && moved > want + 1e-6) {
    s.ground = true;
    s.vy = 0;
  } else if (want > 0 && moved < want - 1e-6) {
    s.vy = 0;
    s.ground = false;
  } else {
    s.ground = false;
    if (wasGround && s.vy <= 0) {
      // On colle au sol en descendant un escalier : s'il y a un sol juste en dessous, on y pose le pied
      const probe = { ...pos };
      const d = world.moveAxis(probe, RADIUS, h, 1, -STEP);
      if (d > -STEP + 1e-6) {
        pos.y = probe.y;
        s.ground = true;
        s.vy = 0;
      }
    }
  }
  s.y = pos.y;
  // Tombé hors du monde : on ne tombe pas indéfiniment
  if (s.y < -20) {
    s.y = -20;
    s.vy = 0;
  }
}

function stepWeapon(s: Soldier, b: number, pressed: number, out: StepOut) {
  const c = s.clock;
  // Fin du rechargement : le chargeur se remplit avec ce qui reste en réserve
  if (s.reloadEnd > 0 && c >= s.reloadEnd) {
    const w = weaponOf(s);
    const k = s.slot;
    const take = Math.min(w.mag - s.mag[k], s.res[k]);
    s.mag[k] += take;
    s.res[k] -= take;
    s.reloadEnd = 0;
  }
  const busy = s.throwEnd > c || s.meleeEnd > c;
  // Changer d'arme
  let want: 0 | 1 | null = null;
  if (pressed & B.swap) want = s.slot === 0 ? 1 : 0;
  if (pressed & B.slot1) want = 0;
  if (pressed & B.slot2) want = 1;
  if (want !== null && want !== s.slot && !busy) {
    s.slot = want;
    s.switchEnd = c + SWITCH_TIME;
    s.reloadEnd = 0;
    s.ads = false;
    out.swapped = true;
  }
  const w = weaponOf(s);
  const k = s.slot;
  const ready = c >= s.switchEnd && !busy;
  // Recharger : à la demande, ou tout seul en tirant à vide
  const wantsReload = (pressed & B.reload) !== 0 || ((b & B.fire) !== 0 && s.mag[k] === 0);
  if (wantsReload && ready && s.reloadEnd === 0 && s.mag[k] < w.mag && s.res[k] > 0) {
    s.reloadEnd = c + w.reload;
    s.ads = false;
    out.reloaded = true;
  }
  // Tirer
  const trigger = w.auto ? (b & B.fire) !== 0 : (pressed & B.fire) !== 0;
  if (trigger && ready && s.reloadEnd === 0 && s.mag[k] > 0 && c >= s.nextFire) {
    s.mag[k] -= 1;
    s.nextFire = c + w.interval;
    s.sprint = false;
    s.firedAt = c;
    const spread = spreadOf(s);
    const dirs: [number, number, number][] = [];
    for (let p = 0; p < w.pellets; p++) {
      const u = hash01(s.shots, p, 17);
      const v = hash01(s.shots, p, 91);
      const r = ((spread * Math.sqrt(u)) / 2) * (Math.PI / 180);
      const a = v * Math.PI * 2;
      dirs.push(forward(s.yaw + Math.cos(a) * r, s.pitch + Math.sin(a) * r));
    }
    s.shots += 1;
    s.bloom = Math.min(w.bloomMax, s.bloom + w.bloom);
    out.shots.push({ weapon: w.id, ox: s.x, oy: eyeOf(s), oz: s.z, dirs });
  } else if (!(b & B.fire)) {
    s.bloom = Math.max(0, s.bloom - w.bloomDecay * DT);
  }
  // Le couteau
  if (pressed & B.melee && !busy && c >= s.switchEnd) {
    s.meleeEnd = c + KNIFE.time;
    s.reloadEnd = 0;
    s.ads = false;
    out.melee = true;
  }
  // La grenade
  if (pressed & B.grenade && !busy && s.grenades > 0) {
    s.grenades -= 1;
    s.throwEnd = c + GRENADE.throwTime;
    s.reloadEnd = 0;
    s.ads = false;
    const [fx, fy, fz] = forward(s.yaw, Math.min(1.2, s.pitch + 0.12));
    const e = eyeOf(s);
    out.grenade = {
      x: s.x + fx * 0.5,
      y: e + fy * 0.5 - 0.1,
      z: s.z + fz * 0.5,
      vx: fx * GRENADE.speed + s.vx * 0.4,
      vy: fy * GRENADE.speed + 1.5,
      vz: fz * GRENADE.speed + s.vz * 0.4,
    };
  }
}

/** Le soldat prend une nouvelle vie : une autre arme, des chargeurs pleins */
export function respawnSoldier(s: Soldier, x: number, y: number, z: number, yaw: number, primary: PrimaryId | "pistolet") {
  const clock = s.clock;
  const seq = s.seq;
  const shots = s.shots;
  Object.assign(s, newSoldier(x, y, z, yaw, primary));
  s.clock = clock;
  s.seq = seq;
  s.shots = shots;
}

/** Ce qu'on garde d'un soldat pour le retrouver plus tard (le téléphone y revient avant de rejouer ses pas) */
export function copySoldier(s: Soldier): Soldier {
  return { ...s, mag: [s.mag[0], s.mag[1]], res: [s.res[0], s.res[1]] };
}
