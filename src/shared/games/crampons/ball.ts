// Le ballon : la gravité, l'air, les rebonds, le roulement sur l'herbe, l'effet, les poteaux et les filets.

import { GOAL_DEPTH, GOAL_H, GOAL_HALF, HALF_L } from "./pitch.ts";

/** Un peu plus gros qu'en vrai : à l'écran, il faut le suivre d'un coup d'œil */
export const BALL_R = 0.16;
export const GRAVITY = 13;
/** Sur l'herbe, il perd autant de vitesse à chaque seconde (m/s²), ce qui permet de calculer une passe exactement */
export const ROLL_DECEL = 3.6;
const AIR_DRAG = 0.009;
const BOUNCE = 0.56;
const BOUNCE_GRIP = 0.86;
/** En dessous de cette vitesse verticale, il ne rebondit plus : il roule */
const SETTLE_VY = 1.2;
const POST_R = 0.07;
const POST_BOUNCE = 0.62;
/** L'effet s'éteint au fil du vol */
const CURL_FADE = 0.75;

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** L'effet : pousse le ballon sur le côté en vol (m/s²), positif vers la gauche de sa trajectoire */
  curl: number;
}

export type BallHit = "post" | "bar" | "net";

export function makeBall(x = 0, z = 0): Ball {
  return { x, y: BALL_R, z, vx: 0, vy: 0, vz: 0, curl: 0 };
}

function hitCylinder(b: Ball, dx: number, dz: number, plane: "xz" | "xy"): boolean {
  const d = Math.hypot(dx, dz);
  const min = BALL_R + POST_R;
  if (d >= min || d === 0) return false;
  const nx = dx / d;
  const nz = dz / d;
  const vA = b.vx;
  const vB = plane === "xz" ? b.vz : b.vy;
  const vn = vA * nx + vB * nz;
  if (vn >= 0) return false;
  const a = vA - (1 + POST_BOUNCE) * vn * nx;
  const c = vB - (1 + POST_BOUNCE) * vn * nz;
  b.vx = a;
  b.x += nx * (min - d);
  if (plane === "xz") {
    b.vz = c;
    b.z += nz * (min - d);
  } else {
    b.vy = c;
    b.y += nz * (min - d);
  }
  return true;
}

/** Les montants et la barre du but situé du côté `end` */
function hitGoalFrame(b: Ball, end: number, hits: BallHit[]) {
  const line = end * HALF_L;
  if (b.y < GOAL_H + BALL_R) {
    for (const side of [-1, 1]) {
      if (hitCylinder(b, b.x - line, b.z - side * GOAL_HALF, "xz")) hits.push("post");
    }
  }
  if (Math.abs(b.z) < GOAL_HALF && hitCylinder(b, b.x - line, b.y - GOAL_H, "xy")) hits.push("bar");
}

/** Une fois dans le but, le ballon meurt dans les filets */
function hitNet(b: Ball, end: number, hits: BallHit[]) {
  const back = HALF_L + GOAL_DEPTH - BALL_R;
  let touched = false;
  if (b.x * end > back) {
    b.x = end * back;
    b.vx *= -0.12;
    b.vz *= 0.4;
    b.vy *= 0.5;
    touched = true;
  }
  if (Math.abs(b.z) > GOAL_HALF - BALL_R) {
    b.z = Math.sign(b.z) * (GOAL_HALF - BALL_R);
    b.vz *= -0.15;
    b.vx *= 0.6;
    touched = true;
  }
  if (b.y > GOAL_H - BALL_R) {
    b.y = GOAL_H - BALL_R;
    b.vy *= -0.15;
    b.vx *= 0.6;
    touched = true;
  }
  if (touched) hits.push("net");
}

function integrate(b: Ball, dt: number) {
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  const airborne = b.y > BALL_R + 0.001 || b.vy > 0;
  if (airborne) {
    const drag = Math.min(1, AIR_DRAG * speed * dt);
    b.vx -= b.vx * drag;
    b.vy -= b.vy * drag;
    b.vz -= b.vz * drag;
    b.vy -= GRAVITY * dt;
    const flat = Math.hypot(b.vx, b.vz);
    if (flat > 0.5 && b.curl !== 0) {
      b.vx += (-b.vz / flat) * b.curl * dt;
      b.vz += (b.vx / flat) * b.curl * dt;
    }
    b.curl *= Math.max(0, 1 - CURL_FADE * dt);
  } else {
    const flat = Math.hypot(b.vx, b.vz);
    if (flat > 0) {
      const next = Math.max(0, flat - ROLL_DECEL * dt);
      b.vx *= next / flat;
      b.vz *= next / flat;
    }
    b.curl = 0;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  if (b.y <= BALL_R) {
    b.y = BALL_R;
    if (b.vy < -SETTLE_VY) {
      b.vy = -b.vy * BOUNCE;
      b.vx *= BOUNCE_GRIP;
      b.vz *= BOUNCE_GRIP;
    } else {
      b.vy = 0;
    }
  }
}

/** Fait avancer le ballon libre de `dt` secondes. Près des buts, on découpe finement : une frappe n'y traverse rien. */
export function stepBall(b: Ball, dt: number): BallHit[] {
  const hits: BallHit[] = [];
  const near = Math.abs(b.x) > HALF_L - 3;
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  const n = near ? Math.max(1, Math.ceil((speed * dt) / 0.12)) : 1;
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const insideBefore = Math.abs(b.x) > HALF_L + BALL_R && Math.abs(b.z) < GOAL_HALF && b.y < GOAL_H;
    integrate(b, h);
    if (near) {
      const end = b.x > 0 ? 1 : -1;
      hitGoalFrame(b, end, hits);
      if (insideBefore) hitNet(b, end, hits);
    }
  }
  return hits;
}

/** Où sera le ballon dans `t` secondes s'il roule : la formule exacte du roulement */
export function rollingAt(b: Ball, t: number): [number, number] {
  const flat = Math.hypot(b.vx, b.vz);
  if (flat === 0) return [b.x, b.z];
  const stop = flat / ROLL_DECEL;
  const u = Math.min(t, stop);
  const d = flat * u - 0.5 * ROLL_DECEL * u * u;
  return [b.x + (b.vx / flat) * d, b.z + (b.vz / flat) * d];
}

/** La vitesse de départ d'une passe à terre de `d` mètres qui arrive à `arrive` m/s */
export const groundSpeedFor = (d: number, arrive: number) => Math.sqrt(arrive * arrive + 2 * ROLL_DECEL * d);

/** Combien de temps met une passe à terre partie à `v` pour faire `d` mètres (Infinity si elle s'arrête avant) */
export function rollTime(v: number, d: number): number {
  const delta = v * v - 2 * ROLL_DECEL * d;
  return delta < 0 ? Infinity : (v - Math.sqrt(delta)) / ROLL_DECEL;
}

/** Copie légère, pour prédire sa trajectoire sans toucher au vrai ballon */
export const cloneBall = (b: Ball): Ball => ({ ...b });
