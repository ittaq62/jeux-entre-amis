// La physique de la balle, pas à pas (240 pas par seconde) : elle roule en suivant le sol (pentes, bosses, tapis
// roulants, plateaux tournants), décolle au bout d'un tremplin, retombe et rebondit, cogne les bordures, les murs, les
// poteaux et ce qui bouge, entre dans les tubes, passe par les téléporteurs, et tombe dans le trou seulement si elle
// passe assez lentement au-dessus. Les balles se heurtent : celle qu'on frappe peut pousser les autres. Tout est
// déterministe : le serveur et les appareils trouvent la même chose.

import {
  BALL_R,
  CUP_FALL,
  cellOf,
  motionPeriod,
  poseAt,
  poseDir,
  posePoint,
  tileAt,
  tileHeight,
  tileSlope,
  unposePoint,
  type Course,
  type Mat,
  type MoverDef,
  type Part,
  type WallKind,
} from "./course.ts";
import { inBox, inRings, segClosest } from "./geom.ts";

export const STEPS_PER_S = 240;
export const DT = 1 / STEPS_PER_S;
export const GRAVITY = 9.81;
/** Une balle qui roule n'accélère dans une pente qu'aux 5/7 de ce que ferait un objet qui glisse */
const ROLL_K = 5 / 7;
/** Sous cette vitesse, assez longtemps, la balle s'arrête */
const V_REST = 0.045;
const REST_STEPS = 16;
/** En retombant, sous cette vitesse de rebond, elle reste au sol */
const V_STICK = 0.42;
/** La balle descend de tant sous le bord du trou : elle y est */
export const DROP_CAPTURE = 0.14;
/** Un coup dure au plus tant de secondes */
export const MAX_SHOT_S = 30;
/** La vitesse de départ, du plus petit au plus grand coup */
export const V_MIN = 0.3;
export const V_MAX = 7.4;

/** Ce qu'un bonus change au coup */
export interface ShotMods {
  /** Plus de puissance */
  power?: boolean;
  /** Ne rebondit presque pas, freine plus */
  sticky?: boolean;
  /** Rebondit beaucoup */
  bouncy?: boolean;
  /** Traverse les murs et les obstacles (pas les bordures) */
  ghost?: boolean;
  /** Le trou l'attire */
  magnet?: boolean;
  /** Le sol glisse comme de la glace */
  ice?: boolean;
}

export interface PhysOpts {
  /** La pesanteur */
  g: number;
  /** Le freinage du sol (1 : normal) */
  roll: number;
  mods?: ShotMods;
}

export const DEFAULT_PHYS: PhysOpts = { g: GRAVITY, roll: 1 };

export type Mode = "roll" | "air" | "rail" | "rest" | "in" | "lost";
export type LostWhy = "water" | "lava" | "out";

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mode: Mode;
  /** Le morceau de sol d'avant */
  tile: number;
  /** Le trou au-dessus duquel elle passe (-1 : aucun) */
  cup: number;
  rail: number;
  s: number;
  sv: number;
  /** Les pas lents d'affilée */
  still: number;
  /** Les pas depuis le coup */
  steps: number;
  /** Perdue : pourquoi */
  lost: LostWhy | null;
  /** Les bulles de bonus touchées pendant ce coup (un bit par bulle) */
  items: number;
}

export type PhysEvent =
  | { k: "wall"; v: number; kind: WallKind | "post" | "mover" | "bumper"; look?: string }
  | { k: "land"; v: number; mat: Mat }
  | { k: "cup"; cup: number }
  | { k: "lip"; cup: number; v: number }
  | { k: "lost"; why: LostWhy }
  | { k: "portal"; i: number }
  | { k: "pad"; i: number }
  | { k: "rail"; i: number; out: boolean }
  | { k: "item"; i: number }
  /** Une autre balle heurtée */
  | { k: "ball"; v: number }
  | { k: "rest" };

export type Emit = (e: PhysEvent, b: Ball) => void;

/** La vitesse de départ pour une force de 0 à 1 (une courbe : les petits coups se dosent finement) */
export function shotSpeed(power: number, mods?: ShotMods): number {
  const p = Math.max(0, Math.min(1, power));
  const v = V_MIN + (V_MAX - V_MIN) * Math.pow(p, 1.55);
  return mods?.power ? v * 1.35 : v;
}

/** Une balle posée là, immobile */
export function restingBall(c: Course, x: number, y: number, z: number): Ball {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    mode: "rest",
    tile: tileAt(c, x, z),
    cup: -1,
    rail: -1,
    s: 0,
    sv: 0,
    still: 0,
    steps: 0,
    lost: null,
    items: 0,
  };
}

/** La balle frappée : angle (direction (cos a, sin a) vue de dessus) et force de 0 à 1 */
export function strike(c: Course, b: Ball, angle: number, power: number, mods?: ShotMods) {
  const v = shotSpeed(power, mods);
  b.vx = Math.cos(angle) * v;
  b.vz = Math.sin(angle) * v;
  b.vy = 0;
  b.tile = tileAt(c, b.x, b.z, b.tile);
  b.mode = b.tile >= 0 ? "roll" : "air";
  b.still = 0;
  b.steps = 0;
  b.cup = -1;
  b.lost = null;
  b.items = 0;
}

export function moving(b: Ball): boolean {
  return b.mode === "roll" || b.mode === "air" || b.mode === "rail";
}

// ---------------------------------------------------------------------------
// Le pas
// ---------------------------------------------------------------------------

const slope = { gx: 0, gz: 0 };

/** Fait avancer la balle d'un pas. `tick` : le numéro du pas depuis le début du trou (pour ce qui bouge) */
export function stepBall(c: Course, b: Ball, tick: number, o: PhysOpts, emit?: Emit) {
  if (!moving(b)) return;
  b.steps++;
  const t = tick * DT;
  if (b.mode === "rail") {
    railStep(c, b, o, emit);
  } else {
    const px = b.x;
    const pz = b.z;
    if (b.mode === "roll") rollForces(c, b, t, o, emit);
    if (b.mode === "air") {
      b.vy -= o.g * DT;
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      b.z += b.vz * DT;
    }
    if (!moving(b)) return;
    collide(c, b, t, o, emit);
    zones(c, b, t, o, emit);
    if (b.mode === "roll") followGround(c, b, o, px, pz);
    else if (b.mode === "air") airContact(c, b, o, emit);
  }
  if (moving(b) && b.steps >= MAX_SHOT_S * STEPS_PER_S) {
    // Trop long (coincée contre quelque chose qui bouge, sur un plateau qui tourne) : elle s'arrête là si elle est au sol
    if (b.mode === "roll") settle(c, b, emit);
    else lose(b, "out", emit);
  }
}

function settle(c: Course, b: Ball, emit?: Emit) {
  b.vx = b.vy = b.vz = 0;
  b.mode = "rest";
  if (b.tile >= 0) {
    tileSlope(c, b.tile, b.x, b.z, slope);
    b.y = tileHeight(c, b.tile, b.x, b.z) + BALL_R * Math.sqrt(1 + slope.gx * slope.gx + slope.gz * slope.gz);
  }
  emit?.({ k: "rest" }, b);
}

function lose(b: Ball, why: LostWhy, emit?: Emit) {
  b.mode = "lost";
  b.lost = why;
  b.vx = b.vy = b.vz = 0;
  emit?.({ k: "lost", why }, b);
}

function holed(c: Course, b: Ball, cup: number, emit?: Emit) {
  const k = c.cups[cup]!;
  b.mode = "in";
  b.cup = cup;
  b.x = k.x;
  b.z = k.z;
  b.y = k.rim - 0.06;
  b.vx = b.vy = b.vz = 0;
  emit?.({ k: "cup", cup }, b);
}

/** Le trou dont la balle survole la zone de chute (-1 : aucun) */
function cupUnder(c: Course, x: number, z: number): number {
  for (let i = 0; i < c.cups.length; i++) {
    const k = c.cups[i]!;
    const dx = x - k.x;
    const dz = z - k.z;
    if (dx * dx + dz * dz < CUP_FALL * CUP_FALL) return i;
  }
  return -1;
}

function rollForces(c: Course, b: Ball, t: number, o: PhysOpts, emit?: Emit) {
  const cup = cupUnder(c, b.x, b.z);
  const tile = cup >= 0 ? -1 : tileAt(c, b.x, b.z, b.tile);
  if (tile < 0 || c.tiles[tile]!.phys.hazard) {
    // Plus rien dessous : elle tombe (dans le trou, dans l'eau, dans le vide)
    if (cup >= 0) b.cup = cup;
    b.mode = "air";
    return;
  }
  b.tile = tile;
  const T = c.tiles[tile]!;
  tileSlope(c, tile, b.x, b.z, slope);
  const L = Math.sqrt(1 + slope.gx * slope.gx + slope.gz * slope.gz);
  const nx = -slope.gx / L;
  const ny = 1 / L;
  const nz = -slope.gz / L;
  // La vitesse reste le long du sol
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  b.vx -= vn * nx;
  b.vy -= vn * ny;
  b.vz -= vn * nz;
  // La pente
  const gn = -o.g * ny;
  const ax = ROLL_K * -gn * nx;
  const ay = ROLL_K * (-o.g - gn * ny);
  const az = ROLL_K * -gn * nz;
  b.vx += ax * DT;
  b.vy += ay * DT;
  b.vz += az * DT;
  // L'aimant : le trou le plus proche tire la balle
  if (o.mods?.magnet) magnetPull(c, b);
  // Le sol qui bouge, et le freinage par rapport à lui
  let ux = 0;
  let uz = 0;
  if (T.flow) {
    if (T.flow.k === "belt") {
      ux = T.flow.v[0];
      uz = T.flow.v[1];
    } else {
      // Un plateau qui tourne (même sens que les obstacles « spin ») : la vitesse du sol sous la balle
      ux = -T.flow.w * (b.z - T.flow.c[1]);
      uz = T.flow.w * (b.x - T.flow.c[0]);
    }
  }
  let roll = T.phys.roll * o.roll;
  if (o.mods?.ice) roll *= 0.2;
  if (o.mods?.sticky) roll *= 2.2;
  // Un tapis entraîne la balle bien plus fort qu'il ne la freine
  const grip = T.flow ? Math.max(roll, 2.4) : roll;
  const fr = grip * ny;
  let rx = b.vx - ux;
  let ry = b.vy;
  let rz = b.vz - uz;
  const sp = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const dv = fr * DT;
  if (sp > dv) {
    const k = 1 - dv / sp;
    rx *= k;
    ry *= k;
    rz *= k;
  } else {
    rx = ry = rz = 0;
  }
  b.vx = rx + ux;
  b.vy = ry;
  b.vz = rz + uz;
  // Arrêt : lente, sur un sol immobile, dans une pente trop douce pour la faire repartir, hors de portée de ce qui bouge
  const pull = Math.sqrt(ax * ax + ay * ay + az * az);
  const flowing = ux !== 0 || uz !== 0;
  if (!flowing && sp < V_REST && pull < roll * ny * 0.98) b.still++;
  else if (b.still > 0) b.still = 0;
  if (b.still >= REST_STEPS) {
    // Arrêtée sur le passage d'un obstacle mobile : elle attend qu'il la pousse (on regarde de nouveau dans une demi-seconde)
    if (moverThreat(c, b, t)) b.still = -STEPS_PER_S / 2;
    else {
      settle(c, b, emit);
      return;
    }
  }
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.z += b.vz * DT;
}

function magnetPull(c: Course, b: Ball) {
  let best = -1;
  let bd = 1.3 * 1.3;
  for (let i = 0; i < c.cups.length; i++) {
    const k = c.cups[i]!;
    const d2 = (b.x - k.x) ** 2 + (b.z - k.z) ** 2;
    if (d2 < bd) {
      bd = d2;
      best = i;
    }
  }
  if (best < 0) return;
  const k = c.cups[best]!;
  const d = Math.sqrt(bd) || 1;
  const a = 2.6 * (1 - d / 1.3) + 0.6;
  b.vx += ((k.x - b.x) / d) * a * DT;
  b.vz += ((k.z - b.z) / d) * a * DT;
}

/** Après le mouvement : la balle qui roule reste collée au sol, ou décolle s'il se dérobe sous elle */
function followGround(c: Course, b: Ball, o: PhysOpts, px: number, pz: number) {
  const cup = cupUnder(c, b.x, b.z);
  if (cup >= 0) {
    b.cup = cup;
    b.mode = "air";
    return;
  }
  const tile = tileAt(c, b.x, b.z, b.tile);
  if (tile < 0 || c.tiles[tile]!.phys.hazard) {
    b.mode = "air";
    return;
  }
  tileSlope(c, tile, b.x, b.z, slope);
  const L = Math.sqrt(1 + slope.gx * slope.gx + slope.gz * slope.gz);
  const yg = tileHeight(c, tile, b.x, b.z) + BALL_R * L;
  const gap = b.y - yg;
  if (gap > 0.5 * o.g * DT * DT + 6e-5) {
    // Le sol se dérobe plus vite que la balle ne tombe : elle décolle
    b.tile = tile;
    b.mode = "air";
    return;
  }
  if (-gap > 0.09) {
    // Une marche que rien ne borde (ça ne devrait pas arriver : les falaises sont des murs) : on reste en bas
    b.x = px;
    b.z = pz;
    b.vx *= -0.3;
    b.vz *= -0.3;
    return;
  }
  b.y = yg;
  b.tile = tile;
}

/** En l'air : le trou, l'eau, le vide, ou le sol où elle retombe */
function airContact(c: Course, b: Ball, o: PhysOpts, emit?: Emit) {
  const cup = cupUnder(c, b.x, b.z);
  if (cup >= 0) {
    b.cup = cup;
    if (b.y < c.cups[cup]!.rim + BALL_R - DROP_CAPTURE) holed(c, b, cup, emit);
    return;
  }
  if (b.cup >= 0) {
    // Elle vient de passer au-dessus du trou : assez descendue, elle bute sur le bord d'en face et tombe ; sinon elle
    // ressort par-dessus le bord, ralentie et un peu déviée
    const k = c.cups[b.cup]!;
    const drop = k.rim + BALL_R - b.y;
    const which = b.cup;
    b.cup = -1;
    if (drop > DROP_CAPTURE * 0.6) {
      holed(c, b, which, emit);
      return;
    }
    if (drop > 0) {
      const sp = Math.hypot(b.vx, b.vz);
      const f = drop / DROP_CAPTURE;
      const rx = b.x - k.x;
      const rz = b.z - k.z;
      const rl = Math.hypot(rx, rz) || 1;
      const radial = (b.vx * rx + b.vz * rz) / rl;
      b.vx -= (rx / rl) * radial * f * 0.8;
      b.vz -= (rz / rl) * radial * f * 0.8;
      b.vx *= 1 - 0.55 * f;
      b.vz *= 1 - 0.55 * f;
      b.vy = 0;
      b.y = k.rim + BALL_R;
      emit?.({ k: "lip", cup: which, v: sp }, b);
    }
  }
  const tile = tileAt(c, b.x, b.z, b.tile);
  if (tile < 0) {
    if (b.y - BALL_R <= c.outY || b.y < c.killY) lose(b, "out", emit);
    return;
  }
  const T = c.tiles[tile]!;
  const h = tileHeight(c, tile, b.x, b.z);
  if (T.phys.hazard) {
    if (b.y - BALL_R * 0.4 <= h) lose(b, T.mat === "lava" ? "lava" : "water", emit);
    return;
  }
  tileSlope(c, tile, b.x, b.z, slope);
  const L = Math.sqrt(1 + slope.gx * slope.gx + slope.gz * slope.gz);
  const yg = h + BALL_R * L;
  if (b.y > yg) return;
  // Elle retombe
  const nx = -slope.gx / L;
  const ny = 1 / L;
  const nz = -slope.gz / L;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  b.y = yg;
  b.tile = tile;
  if (vn >= 0) return;
  let e = T.phys.bounce;
  if (o.mods?.bouncy) e = Math.max(e, 0.75);
  if (o.mods?.sticky) e *= 0.2;
  emit?.({ k: "land", v: -vn, mat: T.mat }, b);
  if (-vn * e < V_STICK) {
    // Elle reste au sol, freinée un peu par le choc
    b.vx -= vn * nx;
    b.vy -= vn * ny;
    b.vz -= vn * nz;
    const keep = 1 - Math.min(0.35, -vn * 0.05) * (T.mat === "sand" || T.mat === "snow" ? 3 : 1);
    b.vx *= Math.max(0, keep);
    b.vy *= Math.max(0, keep);
    b.vz *= Math.max(0, keep);
    b.mode = "roll";
  } else {
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    b.vz -= (1 + e) * vn * nz;
    b.vx *= 0.93;
    b.vz *= 0.93;
  }
}

// ---------------------------------------------------------------------------
// Les chocs
// ---------------------------------------------------------------------------

function collide(c: Course, b: Ball, t: number, o: PhysOpts, emit?: Emit) {
  const ghost = Boolean(o.mods?.ghost);
  const bouncy = Boolean(o.mods?.bouncy);
  const sticky = Boolean(o.mods?.sticky);
  const eOf = (e: number) => (bouncy ? Math.max(e, 0.95) : sticky ? e * 0.35 : e);
  const cell = cellOf(c, b.x, b.z);
  if (cell >= 0) {
    for (const wi of c.grid.walls[cell]!) {
      const w = c.walls[wi]!;
      if (ghost && w.kind === "wall") continue;
      const { d2, s } = segClosest(b.x, b.z, w.ax, w.az, w.bx, w.bz);
      const lim = BALL_R + w.t;
      if (d2 >= lim * lim) continue;
      const bot = w.a0 + (w.b0 - w.a0) * s;
      const top = w.a1 + (w.b1 - w.a1) * s;
      if (b.y + BALL_R <= bot) continue;
      const qx = w.ax + (w.bx - w.ax) * s;
      const qz = w.az + (w.bz - w.az) * s;
      contact(b, qx, top, qz, d2, lim, w.bx - w.ax, w.bz - w.az, eOf(w.e), 0, 0, 0, 0, emit, w.kind, w.look);
    }
  }
  if (!ghost) {
    for (const p of c.posts) {
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const lim = BALL_R + p.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= lim * lim || b.y + BALL_R <= p.y0 || b.y - BALL_R >= p.y1) continue;
      postContact(b, p.x, p.z, p.r, p.y1, eOf(p.e), p.kick, emit, p.kick > 0 ? "bumper" : "post", p.look);
    }
    for (const m of c.movers) {
      if (!inBox(b.x, b.z, m.sweep) || b.y - BALL_R > m.top) continue;
      moverContact(b, m.def, t, eOf(m.def.e ?? 0.6), emit);
    }
  }
}

/**
 * Le choc contre un mur droit dont le point le plus proche est (qx, qz), à hauteur `top` en haut : de côté, la balle
 * repart à l'horizontale ; au-dessus du haut, elle touche l'arête (et peut passer par-dessus).
 */
function contact(
  b: Ball,
  qx: number,
  top: number,
  qz: number,
  d2: number,
  lim: number,
  sx: number,
  sz: number,
  e: number,
  wx: number,
  wy: number,
  wz: number,
  kick: number,
  emit: Emit | undefined,
  kind: WallKind | "post" | "mover" | "bumper",
  look?: string,
) {
  let nx: number;
  let ny = 0;
  let nz: number;
  let pen: number;
  if (b.y <= top) {
    const d = Math.sqrt(d2);
    if (d < 1e-7) {
      // Pile sur la ligne du mur : on la renvoie du côté d'où elle vient
      const l = Math.hypot(sx, sz) || 1;
      nx = -sz / l;
      nz = sx / l;
      if (nx * b.vx + nz * b.vz > 0) {
        nx = -nx;
        nz = -nz;
      }
    } else {
      nx = (b.x - qx) / d;
      nz = (b.z - qz) / d;
    }
    pen = lim - d;
  } else {
    const dy = b.y - top;
    const d3 = Math.sqrt(d2 + dy * dy);
    if (d3 >= lim || d3 < 1e-7) return;
    nx = (b.x - qx) / d3;
    ny = dy / d3;
    nz = (b.z - qz) / d3;
    pen = lim - d3;
  }
  resolve(b, nx, ny, nz, pen, e, wx, wy, wz, kick, emit, kind, look);
}

function postContact(
  b: Ball,
  cx: number,
  cz: number,
  r: number,
  top: number,
  e: number,
  kick: number,
  emit: Emit | undefined,
  kind: "post" | "mover" | "bumper",
  look?: string,
  wx = 0,
  wy = 0,
  wz = 0,
) {
  const dx = b.x - cx;
  const dz = b.z - cz;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (b.y > top && d < r) {
    // Sur le dessus
    const pen = top + BALL_R - b.y;
    if (pen > 0) resolve(b, 0, 1, 0, pen, e * 0.6, wx, wy, wz, 0, emit, kind, look);
    return;
  }
  const ux = d > 1e-7 ? dx / d : 1;
  const uz = d > 1e-7 ? dz / d : 0;
  if (b.y <= top) {
    // De côté : la balle repart à l'horizontale, même si elle est déjà un peu entrée
    resolve(b, ux, 0, uz, r + BALL_R - d, e, wx, wy, wz, kick, emit, kind, look);
    return;
  }
  // Au-dessus du haut : l'arête ronde du dessus
  const ex = d - r;
  const ey = b.y - top;
  const d3 = Math.sqrt(ex * ex + ey * ey);
  if (d3 >= BALL_R || d3 < 1e-7) return;
  resolve(b, (ux * ex) / d3, ey / d3, (uz * ex) / d3, BALL_R - d3, e, wx, wy, wz, kick, emit, kind, look);
}

function resolve(
  b: Ball,
  nx: number,
  ny: number,
  nz: number,
  pen: number,
  e: number,
  wx: number,
  wy: number,
  wz: number,
  kick: number,
  emit: Emit | undefined,
  kind: WallKind | "post" | "mover" | "bumper",
  look?: string,
) {
  if (pen <= 0) return;
  b.x += nx * pen;
  b.y += ny * pen;
  b.z += nz * pen;
  let rx = b.vx - wx;
  let ry = b.vy - wy;
  let rz = b.vz - wz;
  const vn = rx * nx + ry * ny + rz * nz;
  if (vn >= 0) return;
  rx -= (1 + e) * vn * nx;
  ry -= (1 + e) * vn * ny;
  rz -= (1 + e) * vn * nz;
  // Un peu de frottement le long du mur
  const out = rx * nx + ry * ny + rz * nz;
  const tx = rx - out * nx;
  const ty = ry - out * ny;
  const tz = rz - out * nz;
  rx -= tx * 0.05;
  ry -= ty * 0.05;
  rz -= tz * 0.05;
  if (kick > 0) {
    // Un champignon : il renvoie au moins à cette vitesse
    const now = rx * nx + ry * ny + rz * nz;
    if (now < kick) {
      rx += (kick - now) * nx;
      ry += (kick - now) * ny;
      rz += (kick - now) * nz;
    }
  }
  b.vx = rx + wx;
  b.vy = ry + wy;
  b.vz = rz + wz;
  if (-vn > 0.12) emit?.({ k: "wall", v: -vn, kind, look }, b);
}

const MOVER_DT = 1e-3;

function moverContact(b: Ball, m: MoverDef, t: number, e: number, emit?: Emit) {
  const pose = poseAt(m.motion, t);
  const next = poseAt(m.motion, t + MOVER_DT);
  const local = unposePoint(pose, b.x, b.y, b.z);
  // La vitesse de l'obstacle là où est la balle
  const later = posePoint(next, local[0], local[1], local[2]);
  const wx = (later[0] - b.x) / MOVER_DT;
  const wy = (later[1] - b.y) / MOVER_DT;
  const wz = (later[2] - b.z) / MOVER_DT;
  for (const part of m.parts) {
    const hit = partHit(part, local[0], local[1], local[2]);
    if (!hit || hit.pen <= 0) continue;
    const n = poseDir(pose, hit.n[0], hit.n[1], hit.n[2]);
    resolve(b, n[0], n[1], n[2], hit.pen, e, wx, wy, wz, 0, emit, "mover", m.look);
  }
}

/** Le contact entre la balle (centre en x, y, z, dans le repère de la pièce) et une pièce : sa normale et l'enfoncement */
function partHit(part: Part, x: number, y: number, z: number): { n: [number, number, number]; pen: number } | null {
  if (part.k === "cap") {
    // Un cylindre arrondi : la distance au segment, dans l'espace
    const ax = part.a[0];
    const ay = part.a[1];
    const az = part.a[2];
    const sx = part.b[0] - ax;
    const sy = part.b[1] - ay;
    const sz = part.b[2] - az;
    const l2 = sx * sx + sy * sy + sz * sz;
    let s = l2 > 0 ? ((x - ax) * sx + (y - ay) * sy + (z - az) * sz) / l2 : 0;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    const ex = x - (ax + sx * s);
    const ey = y - (ay + sy * s);
    const ez = z - (az + sz * s);
    const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (d < 1e-7) return null;
    return { n: [ex / d, ey / d, ez / d], pen: BALL_R + part.r - d };
  }
  if (y + BALL_R <= part.y0) return null;
  // Mur ou poteau : la distance horizontale à son axe, et son épaisseur
  let ux: number;
  let uz: number;
  let d: number;
  let thick: number;
  if (part.k === "wall") {
    const { d2, s } = segClosest(x, z, part.a[0], part.a[1], part.b[0], part.b[1]);
    d = Math.sqrt(d2);
    thick = part.t;
    if (d < 1e-7) {
      const l = Math.hypot(part.b[0] - part.a[0], part.b[1] - part.a[1]) || 1;
      ux = -(part.b[1] - part.a[1]) / l;
      uz = (part.b[0] - part.a[0]) / l;
    } else {
      ux = (x - (part.a[0] + (part.b[0] - part.a[0]) * s)) / d;
      uz = (z - (part.a[1] + (part.b[1] - part.a[1]) * s)) / d;
    }
  } else {
    const dx = x - part.c[0];
    const dz = z - part.c[1];
    d = Math.hypot(dx, dz);
    thick = part.r;
    ux = d > 1e-7 ? dx / d : 1;
    uz = d > 1e-7 ? dz / d : 0;
  }
  if (y <= part.y1) return { n: [ux, 0, uz], pen: BALL_R + thick - d };
  // Au-dessus : l'arête du haut (ou le dessus, pour un poteau large)
  const ex = d - thick;
  const ey = y - part.y1;
  if (ex <= 0) return { n: [0, 1, 0], pen: BALL_R - ey };
  const d3 = Math.sqrt(ex * ex + ey * ey);
  if (d3 < 1e-7) return null;
  return { n: [(ux * ex) / d3, ey / d3, (uz * ex) / d3], pen: BALL_R - d3 };
}

/**
 * Une balle presque arrêtée là où passe un obstacle mobile : s'arrête-t-elle pour de bon ? Seulement si, pendant tout
 * un tour de l'obstacle, rien ne viendrait la toucher (sinon on continue, et l'obstacle la poussera).
 */
function moverThreat(c: Course, b: Ball, t: number): boolean {
  for (const m of c.movers) {
    if (!inBox(b.x, b.z, m.sweep) || b.y - BALL_R > m.top) continue;
    const period = motionPeriod(m.def.motion);
    const n = Math.max(48, Math.ceil(period * 24));
    for (let i = 0; i <= n; i++) {
      const pose = poseAt(m.def.motion, t + (period * i) / n);
      const local = unposePoint(pose, b.x, b.y, b.z);
      for (const part of m.def.parts) {
        const hit = partHit(part, local[0], local[1], local[2]);
        if (hit && hit.pen > -0.03) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Les zones : téléporteurs, tremplins, accélérateurs, vent, tubes, bonus
// ---------------------------------------------------------------------------

function zones(c: Course, b: Ball, t: number, _o: PhysOpts, emit?: Emit) {
  const d = c.def;
  for (let i = 0; i < d.items.length; i++) {
    if (b.items & (1 << i)) continue;
    const it = d.items[i]!;
    if ((b.x - it[0]) ** 2 + (b.z - it[1]) ** 2 < 0.24 * 0.24) {
      b.items |= 1 << i;
      emit?.({ k: "item", i }, b);
    }
  }
  if (b.mode === "roll") {
    for (let i = 0; i < d.portals.length; i++) {
      const p = d.portals[i]!;
      if ((b.x - p.a[0]) ** 2 + (b.z - p.a[1]) ** 2 >= p.r * p.r) continue;
      const sp = Math.max(Math.hypot(b.vx, b.vz), 0.6);
      b.x = p.b[0] + Math.cos(p.dir) * (p.r + 0.02);
      b.z = p.b[1] + Math.sin(p.dir) * (p.r + 0.02);
      b.vx = Math.cos(p.dir) * sp;
      b.vz = Math.sin(p.dir) * sp;
      b.vy = 0;
      b.tile = tileAt(c, b.x, b.z);
      if (b.tile >= 0) b.y = tileHeight(c, b.tile, b.x, b.z) + BALL_R;
      emit?.({ k: "portal", i }, b);
      return;
    }
    for (let i = 0; i < d.pads.length; i++) {
      const p = d.pads[i]!;
      if ((b.x - p.c[0]) ** 2 + (b.z - p.c[1]) ** 2 >= p.r * p.r) continue;
      if (p.period) {
        const ph = t / p.period + (p.a0 ?? 0);
        if (ph - Math.floor(ph) > (p.on ?? 0.5)) continue;
      }
      b.vy = p.vy;
      if (p.push) {
        b.vx += p.push[0];
        b.vz += p.push[1];
      }
      b.mode = "air";
      emit?.({ k: "pad", i }, b);
      return;
    }
    for (const bo of d.boosts) {
      if (!inRings(b.x, b.z, [bo.ring])) continue;
      const dx = Math.cos(bo.dir);
      const dz = Math.sin(bo.dir);
      const along = b.vx * dx + b.vz * dz;
      if (along < bo.speed) {
        const k = Math.min(14 * DT, bo.speed - along);
        b.vx += dx * k;
        b.vz += dz * k;
      }
      // Il redresse aussi la balle dans son sens
      const side = -b.vx * dz + b.vz * dx;
      b.vx -= -dz * side * 4 * DT;
      b.vz -= dx * side * 4 * DT;
    }
  }
  for (const w of d.winds) {
    if (!inRings(b.x, b.z, [w.ring])) continue;
    if (w.period) {
      const ph = t / w.period;
      if (ph - Math.floor(ph) > (w.on ?? 0.5)) continue;
    }
    b.vx += w.acc[0] * DT;
    b.vz += w.acc[1] * DT;
  }
  if (b.mode === "roll" || b.mode === "air") {
    for (let i = 0; i < c.rails.length; i++) {
      const r = c.rails[i]!;
      const p0 = r.def.pts[0]!;
      const p1 = r.def.pts[1]!;
      if ((b.x - p0[0]) ** 2 + (b.z - p0[2]) ** 2 >= r.def.r * r.def.r || Math.abs(b.y - p0[1]) > 0.3) continue;
      const tx = p1[0] - p0[0];
      const tz = p1[2] - p0[2];
      if (b.vx * tx + b.vz * tz <= 0.05 * Math.hypot(tx, tz)) continue;
      b.mode = "rail";
      b.rail = i;
      b.s = 0;
      b.sv = Math.max(0.3, Math.hypot(b.vx, b.vy, b.vz));
      b.cup = -1;
      emit?.({ k: "rail", i, out: false }, b);
      return;
    }
  }
}

function railStep(c: Course, b: Ball, o: PhysOpts, emit?: Emit) {
  const r = c.rails[b.rail]!;
  const pts = r.def.pts;
  let i = 1;
  while (i < r.len.length - 1 && r.len[i]! < b.s) i++;
  const a = pts[i - 1]!;
  const z = pts[i]!;
  const seg = r.len[i]! - r.len[i - 1]! || 1;
  const ty = (z[1] - a[1]) / seg;
  b.sv -= ROLL_K * o.g * ty * DT;
  b.sv -= Math.sign(b.sv) * 0.35 * DT;
  b.s += b.sv * DT;
  if (b.s >= r.total || b.s <= 0) {
    const end = b.s >= r.total;
    const p = end ? pts[pts.length - 1]! : pts[0]!;
    const q = end ? pts[pts.length - 2]! : pts[1]!;
    const l = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) || 1;
    // La direction de sortie : vers l'extérieur du tube
    const dx = (p[0] - q[0]) / l;
    const dy = (p[1] - q[1]) / l;
    const dz = (p[2] - q[2]) / l;
    const sp = Math.abs(b.sv);
    b.x = p[0] + dx * 0.02;
    b.y = p[1] + dy * 0.02;
    b.z = p[2] + dz * 0.02;
    b.vx = dx * sp;
    b.vy = dy * sp;
    b.vz = dz * sp;
    b.mode = "air";
    b.tile = tileAt(c, b.x, b.z);
    emit?.({ k: "rail", i: b.rail, out: true }, b);
    b.rail = -1;
    return;
  }
  // La position le long du chemin
  let k = 1;
  while (k < r.len.length - 1 && r.len[k]! < b.s) k++;
  const p = pts[k - 1]!;
  const q = pts[k]!;
  const u = (b.s - r.len[k - 1]!) / (r.len[k]! - r.len[k - 1]! || 1);
  b.x = p[0] + (q[0] - p[0]) * u;
  b.y = p[1] + (q[1] - p[1]) * u;
  b.z = p[2] + (q[2] - p[2]) * u;
  const l = r.len[k]! - r.len[k - 1]! || 1;
  b.vx = ((q[0] - p[0]) / l) * b.sv;
  b.vy = ((q[1] - p[1]) / l) * b.sv;
  b.vz = ((q[2] - p[2]) / l) * b.sv;
}

// ---------------------------------------------------------------------------
// Un coup entier
// ---------------------------------------------------------------------------

export interface ShotResult {
  x: number;
  y: number;
  z: number;
  /** Le pas (depuis le début du trou) où la balle s'arrête */
  end: number;
  outcome: "rest" | "in" | "lost";
  cup: number;
  lost: LostWhy | null;
  items: number;
}

// ---------------------------------------------------------------------------
// Plusieurs balles : elles se heurtent
// ---------------------------------------------------------------------------

/** Le rebond entre deux balles (presque sans perte) */
const E_BALLS = 0.9;

/** Peut-elle être heurtée (sur le parcours, pas dans un tube, pas tombée ni perdue) ? */
function hittable(b: Ball): boolean {
  return b.mode === "roll" || b.mode === "air" || b.mode === "rest";
}

/** Une balle arrêtée qu'une autre vient de toucher : elle se remet à rouler */
function wake(c: Course, b: Ball) {
  if (b.mode !== "rest") return;
  b.tile = tileAt(c, b.x, b.z, b.tile);
  b.mode = b.tile >= 0 ? "roll" : "air";
  b.still = 0;
  b.steps = 0;
}

/**
 * Les chocs entre balles, après un pas de chacune : deux balles qui se touchent en se rapprochant échangent leur
 * vitesse le long de la ligne qui les joint (de même masse, un rebond presque parfait). Au sol, le choc est à
 * l'horizontale (l'une ne soulève pas l'autre). `solid[i]` : la balle i peut-elle en heurter d'autres
 */
export function collideBalls(c: Course, balls: Ball[], solid: readonly boolean[], emit?: (i: number, e: PhysEvent, b: Ball) => void) {
  const lim = 2 * BALL_R;
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i]!;
    if (!solid[i] || !hittable(a)) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j]!;
      if (!solid[j] || !hittable(b) || (a.mode === "rest" && b.mode === "rest")) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dz = b.z - a.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= lim * lim) continue;
      if (a.mode !== "air" && b.mode !== "air") dy = 0;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-9) continue;
      dx /= d;
      dy /= d;
      dz /= d;
      const vn = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy + (b.vz - a.vz) * dz;
      if (vn >= 0) continue;
      // Écartées l'une de l'autre, puis le choc
      const pen = (lim - Math.sqrt(d2)) / 2;
      wake(c, a);
      wake(c, b);
      a.x -= dx * pen;
      a.y -= dy * pen;
      a.z -= dz * pen;
      b.x += dx * pen;
      b.y += dy * pen;
      b.z += dz * pen;
      const jn = (-(1 + E_BALLS) * vn) / 2;
      a.vx -= jn * dx;
      a.vy -= jn * dy;
      a.vz -= jn * dz;
      b.vx += jn * dx;
      b.vy += jn * dy;
      b.vz += jn * dz;
      emit?.(i, { k: "ball", v: -vn }, a);
      emit?.(j, { k: "ball", v: -vn }, b);
    }
  }
}

/** Un pas pour toutes les balles qui bougent, puis leurs chocs. `opts[i]` : la physique de la balle i */
export function stepWorld(
  c: Course,
  balls: Ball[],
  tick: number,
  opts: readonly PhysOpts[],
  solid: readonly boolean[],
  emit?: (i: number, e: PhysEvent, b: Ball) => void,
) {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i]!;
    if (moving(b)) stepBall(c, b, tick, opts[i]!, emit ? (e, bb) => emit(i, e, bb) : undefined);
  }
  if (balls.length > 1) collideBalls(c, balls, solid, emit);
}

/** Les balles d'un coup : celle qu'on frappe (la première) et les autres, posées là où elles sont */
export function worldBalls(
  c: Course,
  from: { x: number; y: number; z: number },
  others: readonly { x: number; y: number; z: number }[],
): Ball[] {
  return [restingBall(c, from.x, from.y, from.z), ...others.map((p) => restingBall(c, p.x, p.y, p.z))];
}

/** Qui peut heurter qui : la balle frappée ne heurte personne si elle traverse tout (le pouvoir « fantôme ») */
export function solidOf(n: number, o: PhysOpts): boolean[] {
  return Array.from({ length: n }, (_, i) => i > 0 || !o.mods?.ghost);
}

export interface WorldResult {
  /** La balle frappée */
  shot: ShotResult;
  /** Les autres, dans l'ordre donné : où elles finissent (`moved` : elles ont été poussées) */
  others: (ShotResult & { moved: boolean })[];
}

/**
 * Joue un coup jusqu'au bout avec les autres balles sur le parcours : la balle frappée (physique `o`, avec son pouvoir)
 * peut les pousser, elles roulent à leur tour (physique `plain`), et tout continue jusqu'à ce que plus rien ne bouge.
 * Sans autre balle, exactement `simulateShot`
 */
export function simulateWorld(
  c: Course,
  from: { x: number; y: number; z: number },
  angle: number,
  power: number,
  tick: number,
  o: PhysOpts,
  others: readonly { x: number; y: number; z: number }[],
  plain: PhysOpts,
): WorldResult {
  if (others.length === 0) return { shot: simulateShot(c, from, angle, power, tick, o), others: [] };
  const balls = worldBalls(c, from, others);
  strike(c, balls[0]!, angle, power, o.mods);
  const opts = balls.map((_, i) => (i === 0 ? o : plain));
  const solid = solidOf(balls.length, o);
  const ends = balls.map(() => tick);
  let k = tick;
  while (balls.some(moving)) {
    k++;
    const was = balls.map(moving);
    stepWorld(c, balls, k, opts, solid);
    for (let i = 0; i < balls.length; i++) if (was[i]) ends[i] = k;
  }
  const result = (b: Ball, end: number): ShotResult => ({
    x: b.x,
    y: b.y,
    z: b.z,
    end,
    outcome: b.mode === "in" ? "in" : b.mode === "lost" ? "lost" : "rest",
    cup: b.mode === "in" ? b.cup : -1,
    lost: b.lost,
    items: b.items,
  });
  return {
    shot: result(balls[0]!, ends[0]!),
    others: balls.slice(1).map((b, i) => {
      const p = others[i]!;
      return { ...result(b, ends[i + 1]!), moved: b.mode !== "rest" || b.x !== p.x || b.z !== p.z || ends[i + 1]! !== tick };
    }),
  };
}

/** Joue un coup jusqu'au bout, depuis la balle posée en (x, y, z), frappée au pas `tick` */
export function simulateShot(
  c: Course,
  from: { x: number; y: number; z: number },
  angle: number,
  power: number,
  tick: number,
  o: PhysOpts,
  emit?: Emit,
): ShotResult {
  const b = restingBall(c, from.x, from.y, from.z);
  strike(c, b, angle, power, o.mods);
  let k = tick;
  while (moving(b)) stepBall(c, b, ++k, o, emit);
  return {
    x: b.x,
    y: b.y,
    z: b.z,
    end: k,
    outcome: b.mode === "in" ? "in" : b.mode === "lost" ? "lost" : "rest",
    cup: b.mode === "in" ? b.cup : -1,
    lost: b.lost,
    items: b.items,
  };
}
