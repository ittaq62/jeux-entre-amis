// Frapper le ballon : choisir à qui on le donne, à quelle vitesse, et ce que coûte un geste précipité.

import { BALL_R, cloneBall, GRAVITY, groundSpeedFor, ROLL_DECEL, rollTime, stepBall, type Ball } from "./ball.ts";
import { attackDir, opponent, random, type KickKind, type KickOrder, type Match, type MatchEvent, type Player } from "./model.ts";
import { clamp, DT, GOAL_H, GOAL_HALF, HALF_L, HALF_W, lerp, onPitch } from "./pitch.ts";

/** Le temps que le pied arrive au ballon, selon le geste */
const WINDUP: Record<KickKind, number> = {
  pass: 0.07,
  through: 0.09,
  lob: 0.13,
  cross: 0.16,
  clear: 0.12,
  shot: 0.16,
  finesse: 0.18,
  chip: 0.16,
};

/** Passé ce moment, le frappeur ne peut plus retoucher le ballon tout de suite */
const KICK_LOCK = 0.32;

export function orderKick(p: Player, order: KickOrder) {
  p.order = order;
  p.act = "kick";
  p.actT = WINDUP[order.kind];
}

/** À quel point ce joueur est gêné par l'adversaire le plus proche, de 0 (seul) à 1 (au contact) */
export function pressureOn(m: Match, p: Player): number {
  let best = Infinity;
  for (const q of m.players) {
    if (q.team === p.team || q.off) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < best) best = d;
  }
  return clamp(1 - best / 5, 0, 1);
}

/** La distance du plus proche adversaire à ce point */
export function openness(m: Match, team: number, x: number, z: number): number {
  let best = Infinity;
  for (const q of m.players) {
    if (q.team === team || q.off || q.act === "down") continue;
    const d = Math.hypot(q.x - x, q.z - z);
    if (d < best) best = d;
  }
  return best;
}

/** La position du dernier défenseur de champ : au-delà, un attaquant est hors-jeu */
export function offsideLine(m: Match, team: 0 | 1): number {
  const dir = attackDir(m, team);
  const depths = m.players.filter((q) => q.team !== team && !q.off).map((q) => q.x * dir);
  depths.sort((a, b) => b - a);
  return Math.max(depths[1] ?? 0, 0);
}

/** Note qui est hors-jeu à l'instant où part la passe */
function markOffside(m: Match, p: Player, kind: "kick" | "free") {
  m.offside = [];
  if (!m.settings.offside || kind === "free") return;
  const dir = attackDir(m, p.team);
  const line = offsideLine(m, p.team);
  const ballAt = m.ball.x * dir;
  for (const q of m.players) {
    if (q.team !== p.team || q.off || q.i === p.i) continue;
    const at = q.x * dir;
    if (at > 0.3 && at > line + 0.25 && at > ballAt + 0.25) m.offside.push(q.i);
  }
}

/** Le coéquipier le mieux placé dans la direction demandée : l'angle compte le plus, puis la distance et l'espace autour de lui */
export function pickReceiver(m: Match, p: Player, ax: number, az: number, ahead = false): number {
  let dx = ax;
  let dz = az;
  if (Math.hypot(dx, dz) < 0.2) {
    dx = Math.cos(p.h);
    dz = Math.sin(p.h);
  }
  const l = Math.hypot(dx, dz);
  dx /= l;
  dz /= l;
  const dir = attackDir(m, p.team);
  let best = -1;
  let bestScore = -Infinity;
  for (const q of m.players) {
    if (q.team !== p.team || q.i === p.i || q.off || q.act === "down") continue;
    const rx = q.x - p.x;
    const rz = q.z - p.z;
    const d = Math.hypot(rx, rz);
    if (d < 2.5 || d > 62) continue;
    const c = (rx * dx + rz * dz) / d;
    if (c < 0.45) continue;
    if (q.role === "GK" && c < 0.93) continue;
    if (ahead && (q.x - p.x) * dir < -4) continue;
    const space = Math.min(openness(m, p.team, q.x, q.z), 9) / 9;
    const score = c * c * 3 - d / 45 + space * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = q.i;
    }
  }
  return best;
}

/** Trouve la vitesse d'un ballon en cloche pour qu'il retombe à `(tx, tz)` après `T` secondes, en tenant compte de l'air */
function solveLob(b: Ball, tx: number, tz: number, T: number, endY = BALL_R, curl = 0): [number, number, number] {
  let gx = tx;
  let gz = tz;
  let v: [number, number, number] = [0, 0, 0];
  for (let it = 0; it < 3; it++) {
    v = [(gx - b.x) / T, (endY - b.y + 0.5 * GRAVITY * T * T) / T, (gz - b.z) / T];
    const sim = cloneBall(b);
    sim.vx = v[0];
    sim.vy = v[1];
    sim.vz = v[2];
    sim.curl = curl;
    let t = 0;
    while (t < T - 1e-6) {
      stepBall(sim, DT / 2);
      t += DT / 2;
    }
    gx += tx - sim.x;
    gz += tz - sim.z;
  }
  return v;
}

function setBall(b: Ball, v: [number, number, number], curl = 0) {
  b.vx = v[0];
  b.vy = v[1];
  b.vz = v[2];
  b.curl = curl;
}

/** Tourne la direction d'un petit angle : c'est l'imprécision du geste */
function spin(x: number, z: number, angle: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - z * s, x * s + z * c];
}

/** La gêne d'un geste : le joueur serré, fatigué, ou qui frappe à l'opposé de sa course, est moins précis */
function clumsiness(m: Match, p: Player, dx: number, dz: number): number {
  const v = Math.hypot(p.vx, p.vz);
  const facing = v > 2 ? (p.vx * dx + p.vz * dz) / (v * Math.max(0.01, Math.hypot(dx, dz))) : 1;
  return 1 + pressureOn(m, p) * 0.9 + (1 - p.stam) * 0.5 + (facing < 0 ? 0.9 * -facing : 0);
}

const noise = (m: Match, amount: number) => (random(m) * 2 - 1) * amount;

function firePass(m: Match, p: Player, o: KickOrder) {
  const b = m.ball;
  const to = o.to >= 0 ? o.to : pickReceiver(m, p, o.ax, o.az);
  let tx: number;
  let tz: number;
  let v: number;
  const skill = p.stats.pas / 100;
  if (to >= 0) {
    const q = m.players[to]!;
    tx = q.x;
    tz = q.z;
    v = 12;
    // On vise là où il sera, pas là où il est
    for (let it = 0; it < 3; it++) {
      const d = Math.hypot(tx - b.x, tz - b.z);
      const arrive = clamp(11 + d * 0.28, 11, 22) * (0.8 + o.power * 0.45);
      v = groundSpeedFor(d, arrive);
      const t = Math.min(rollTime(v, d), 3);
      tx = q.x + q.vx * t * 0.8;
      tz = q.z + q.vz * t * 0.8;
    }
    m.pass = { from: p.i, to, x: tx, z: tz, until: m.t + Math.min(rollTime(v, Math.hypot(tx - b.x, tz - b.z)), 3) + 0.8 };
    // Il vient au-devant du ballon, pour l'avoir avant son défenseur
    const toBall = Math.max(0.1, Math.hypot(b.x - tx, b.z - tz));
    const step = Math.min(3, toBall * 0.3);
    q.runUntil = m.t + 0.8;
    q.runX = tx + ((b.x - tx) / toBall) * step;
    q.runZ = tz + ((b.z - tz) / toBall) * step;
  } else {
    // Personne dans cette direction : une passe dans l'espace
    const l = Math.hypot(o.ax, o.az) || 1;
    const dist = 8 + o.power * 24;
    const ax = l < 0.2 ? Math.cos(p.h) : o.ax / l;
    const az = l < 0.2 ? Math.sin(p.h) : o.az / l;
    tx = b.x + ax * dist;
    tz = b.z + az * dist;
    v = groundSpeedFor(dist, 5);
    m.pass = null;
  }
  const d = Math.max(0.1, Math.hypot(tx - b.x, tz - b.z));
  const err = (1.04 - skill) * 0.16 * clumsiness(m, p, tx - p.x, tz - p.z);
  const [dx, dz] = spin((tx - b.x) / d, (tz - b.z) / d, noise(m, err));
  setBall(b, [dx * v, 0, dz * v]);
  b.y = BALL_R;
  m.stats[p.team].passes++;
}

function fireThrough(m: Match, p: Player, o: KickOrder) {
  const b = m.ball;
  const dir = attackDir(m, p.team);
  const to = o.to >= 0 ? o.to : pickReceiver(m, p, o.ax, o.az, true);
  if (to < 0) return firePass(m, p, o);
  const q = m.players[to]!;
  const stick = Math.hypot(o.ax, o.az);
  // La course du receveur : vers l'avant, un peu vers la direction demandée
  let rx = dir + (stick > 0.2 ? (o.ax / stick) * 0.3 : 0);
  let rz = stick > 0.2 ? (o.az / stick) * 0.7 : -q.z * 0.02;
  const l = Math.hypot(rx, rz);
  rx /= l;
  rz /= l;
  const lead = 5 + o.power * 13;
  const [tx, tz] = o.px !== undefined && o.pz !== undefined ? [o.px, o.pz] : onPitch(q.x + rx * lead, q.z + rz * lead, 2);
  const d = Math.max(1, Math.hypot(tx - b.x, tz - b.z));
  const runT = Math.max(0.5, Math.hypot(tx - q.x, tz - q.z) / 7.5);
  const v = clamp(d / runT + (ROLL_DECEL * runT) / 2, 10, 27);
  const skill = p.stats.pas / 100;
  const err = (1.05 - skill) * 0.17 * clumsiness(m, p, tx - p.x, tz - p.z);
  const [dx, dz] = spin((tx - b.x) / d, (tz - b.z) / d, noise(m, err));
  setBall(b, [dx * v, 0, dz * v]);
  b.y = BALL_R;
  q.runUntil = m.t + runT + 0.4;
  q.runX = tx;
  q.runZ = tz;
  m.pass = { from: p.i, to, x: tx, z: tz, until: m.t + runT + 1 };
  m.stats[p.team].passes++;
}

function fireLob(m: Match, p: Player, o: KickOrder) {
  const b = m.ball;
  const stick = Math.hypot(o.ax, o.az);
  const to = o.to >= 0 ? o.to : pickReceiver(m, p, o.ax, o.az);
  let tx: number;
  let tz: number;
  if (o.px !== undefined && o.pz !== undefined) {
    tx = o.px;
    tz = o.pz;
  } else if (to >= 0) {
    const q = m.players[to]!;
    const d0 = Math.hypot(q.x - b.x, q.z - b.z);
    const t0 = 0.8 + d0 * 0.04;
    tx = q.x + q.vx * t0 * 0.9;
    tz = q.z + q.vz * t0 * 0.9;
  } else {
    const dist = 12 + o.power * 30;
    tx = b.x + (stick > 0.2 ? o.ax / stick : Math.cos(p.h)) * dist;
    tz = b.z + (stick > 0.2 ? o.az / stick : Math.sin(p.h)) * dist;
  }
  [tx, tz] = onPitch(tx, tz, 1.5);
  const d = Math.max(1, Math.hypot(tx - b.x, tz - b.z));
  const T = clamp(0.7 + d * 0.036, 0.75, 2.5) * (o.kind === "cross" ? 0.85 : 1);
  const skill = p.stats.pas / 100;
  const err = (1.05 - skill) * 2.4 * (d / 22) * clumsiness(m, p, tx - p.x, tz - p.z);
  setBall(b, solveLob(b, tx + noise(m, err), tz + noise(m, err), T, 1.0));
  if (to >= 0) {
    const q = m.players[to]!;
    q.runUntil = m.t + T + 0.3;
    q.runX = tx;
    q.runZ = tz;
    m.pass = { from: p.i, to, x: tx, z: tz, until: m.t + T + 0.9 };
  } else m.pass = null;
  m.stats[p.team].passes++;
}

function fireClear(m: Match, p: Player, o: KickOrder) {
  const b = m.ball;
  const dir = attackDir(m, p.team);
  const stick = Math.hypot(o.ax, o.az);
  let dx = stick > 0.2 ? o.ax / stick : dir;
  let dz = stick > 0.2 ? o.az / stick : Math.sign(p.z || 1) * 0.5;
  const l = Math.hypot(dx, dz);
  dx /= l;
  dz /= l;
  [dx, dz] = spin(dx, dz, noise(m, 0.18));
  const v = 21 + o.power * 9;
  setBall(b, [dx * v * 0.87, v * 0.5, dz * v * 0.87]);
  m.pass = null;
}

function fireShot(m: Match, p: Player, o: KickOrder, ev: MatchEvent[]) {
  const b = m.ball;
  const end = attackDir(m, p.team);
  const gx = end * HALF_L;
  const d = Math.hypot(gx - b.x, b.z);
  const sho = p.stats.sho / 100;
  // Vers quel côté du but : l'humain l'indique au stick, sinon on prend le poteau opposé
  const stick = Math.abs(o.az) > 0.25 ? Math.sign(o.az) : -Math.sign(p.z || 1);
  const corner = 0.62 + random(m) * 0.25;
  const aimZ = o.pz ?? stick * GOAL_HALF * corner;
  const clumsy = clumsiness(m, p, gx - p.x, aimZ - p.z);

  if (o.kind === "chip") {
    const T = clamp(0.85 + d * 0.03, 0.9, 1.7);
    const err = (1.05 - sho) * 2.2 * clumsy;
    setBall(b, solveLob(b, gx, aimZ * 0.6 + noise(m, err), T, 1.5 + noise(m, err * 0.5)));
  } else {
    const finesse = o.kind === "finesse";
    const speed = lerp(14, 20 + sho * 15, o.power) * (finesse ? 0.82 : 1);
    const t = d / speed;
    // Trop de force, et ça passe au-dessus : c'est là tout le jeu de la jauge
    const over = Math.max(0, o.power - 0.82) * (1.25 - sho) * 13;
    const low = lerp(0.35, 1.5, o.power * o.power);
    const spread = ((1.14 - sho) * 0.2 + Math.max(0, d - 16) * 0.0036) * clumsy * (finesse ? 0.8 : 1);
    const curl = finesse ? -end * stick * (5 + sho * 5) : 0;
    const yT = clamp(low + over + noise(m, spread * d * 0.55), 0.1, 9);
    const [dx, dz] = spin((gx - b.x) / d, (aimZ - b.z) / d, noise(m, spread));
    const vy = (yT - b.y + 0.5 * GRAVITY * t * t) / t;
    setBall(b, [dx * speed, vy, dz * speed], curl);
    if (finesse) b.vz -= curl * t * 0.42 * Math.sign(b.vx || 1);
  }
  // On regarde si elle cadre, pour les statistiques
  const sim = cloneBall(b);
  let guard = 0;
  while (sim.x * end < HALF_L && guard++ < 120) stepBall(sim, DT);
  const onTarget = sim.x * end >= HALF_L && Math.abs(sim.z) < GOAL_HALF && sim.y < GOAL_H;
  m.stats[p.team].shots++;
  if (onTarget) m.stats[p.team].onTarget++;
  m.shotAt = m.t;
  m.shotBy = p.i;
  m.pass = null;
  ev.push({ k: "shot", p: p.i, power: o.power });
}

/** Le pied arrive au ballon : on applique l'ordre. Le ballon quitte le joueur. */
export function releaseKick(m: Match, p: Player, ev: MatchEvent[], fromRestart = false) {
  const o = p.order;
  p.order = null;
  if (!o) return;
  m.owner = -1;
  markOffside(m, p, fromRestart && m.restart?.kind !== "free" ? "free" : "kick");
  m.assistBy = m.lastTouch !== p.i && m.players[m.lastTouch]?.team === p.team ? m.lastTouch : m.assistBy;
  m.lastTouch = p.i;
  m.kickAt = m.t;
  m.kickTeam = p.team;
  p.lockedUntil = m.t + KICK_LOCK;
  if (o.kind === "pass") firePass(m, p, o);
  else if (o.kind === "through") fireThrough(m, p, o);
  else if (o.kind === "lob" || o.kind === "cross") fireLob(m, p, o);
  else if (o.kind === "clear") fireClear(m, p, o);
  else fireShot(m, p, o, ev);
  ev.push({ k: "kick", p: p.i, power: o.power, kind: o.kind });
}

/** La passe en profondeur qui vaut la peine : d'autant plus intéressante que l'attaquant part seul */
export function runSpaceAhead(m: Match, q: Player): number {
  const dir = attackDir(m, q.team);
  const line = offsideLine(m, q.team);
  return clamp(HALF_L - Math.max(line, q.x * dir), 0, 40) * (Math.abs(q.z) < HALF_W - 4 ? 1 : 0.7);
}

export const opposite = opponent;
