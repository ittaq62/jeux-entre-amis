// L'Épervier : au coup de sifflet, toute la foule traverse la cour d'un camp à l'autre ; au milieu, les éperviers
// attrapent ceux qu'ils touchent. Qui est attrapé (ou n'est pas de l'autre côté à temps) est éliminé, mais il devient
// épervier à son tour pour les traversées suivantes, comme dans la cour de récré. Les vrais joueurs éliminés plus tôt
// dans la partie reviennent aussi en éperviers : tout le monde rejoue.
//
// On court avec une manette (un vecteur), et on a un bond (une esquive pour les candidats, un plongeon pour les
// éperviers), qui revient au bout de quelques secondes.

import { random } from "../../../rng.ts";
import { between, byLevel, clamp, OUT, PLAYING, pressure, r2, SAFE, type EpCtx } from "./common.ts";

export const FIELD = { w: 15, d: 9, safe: 11.5, hawk: 7 };
const CAND_SPEED = 5.1;
const HAWK_SPEED = 4.85;
const ACCEL = 14;
const DASH_SPEED = 9.2;
const DASH_S = 0.24;
export const DASH_COOLDOWN = 2.6;
const CATCH = 0.56;
/** Le temps qu'un épervier tient celui qu'il vient d'attraper (ms) */
const HOLD_MS = 1400;
const READY_S = 3;
const RUN_S = 11;
const PAUSE_S = 3.2;
const MAX_CROSSINGS = 4;

export interface Runner {
  id: string;
  /** Candidat (c) ou épervier (h) */
  role: "c" | "h";
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** La manette (un vrai joueur), de longueur au plus 1 */
  ix: number;
  iz: number;
  /** Le bond : quand il a commencé, quand il revient */
  dashAt: number;
  dashReady: number;
  /** Attrapé à cette heure (0 : libre) */
  caught: number;
  /** L'épervier qui vient d'attraper quelqu'un le tient un instant : il n'attrape plus personne avant cette heure */
  busy: number;
}

export interface EpervierState {
  kind: "epervier";
  stage: "pret" | "course" | "pause" | "fin";
  stageAt: number;
  until: number;
  ids: string[];
  st: number[];
  /** Tout ce qui court : les candidats encore en jeu et les éperviers */
  run: Runner[];
  crossing: number;
  /** Le sens de la traversée : vers +x (1) ou vers −x (-1) */
  dir: 1 | -1;
  /** Le nombre d'éperviers qui ne sont pas d'anciens candidats (les mascottes de la cour) */
  mascots: number;
}

export function epervierStart(ids: string[], now: number, _ctx: EpCtx, humanHawks: string[]): EpervierState {
  const run: Runner[] = [];
  const n = ids.length;
  ids.forEach((id, k) => {
    const z = -FIELD.d + 0.8 + ((2 * FIELD.d - 1.6) * (k + 0.5)) / n;
    run.push(runner(id, "c", -FIELD.w + 1.2 + (k % 3) * 0.7, z));
  });
  const wanted = clamp(Math.round(n / 6), 2, 6);
  const hawks = humanHawks.slice(0, Math.max(wanted, Math.floor(n / 2)));
  const mascots = Math.max(0, wanted - hawks.length);
  const all = [...hawks, ...Array.from({ length: mascots }, (_, k) => `epervier-${k + 1}`)];
  all.forEach((id, k) => {
    const z = -FIELD.d + 1.5 + ((2 * FIELD.d - 3) * (k + 0.5)) / all.length;
    run.push(runner(id, "h", 0, z));
  });
  return {
    kind: "epervier",
    stage: "pret",
    stageAt: now,
    until: now + READY_S * 1000,
    ids,
    st: ids.map(() => 0),
    run,
    crossing: 0,
    dir: 1,
    mascots,
  };
}

function runner(id: string, role: "c" | "h", x: number, z: number): Runner {
  return { id, role, x, z, vx: 0, vz: 0, ix: 0, iz: 0, dashAt: 0, dashReady: 0, caught: 0, busy: 0 };
}

/** La manette d'un vrai joueur (candidat ou épervier) */
export function epervierMove(s: EpervierState, id: string, x: number, z: number) {
  const r = s.run.find((q) => q.id === id);
  if (!r || r.caught || !Number.isFinite(x) || !Number.isFinite(z)) return;
  const len = Math.sqrt(x * x + z * z);
  const k = len > 1 ? 1 / len : 1;
  r.ix = x * k;
  r.iz = z * k;
}

export function epervierDash(s: EpervierState, id: string, ctx: EpCtx) {
  const r = s.run.find((q) => q.id === id);
  if (!r || r.caught || s.stage !== "course" || ctx.now < r.dashReady) return;
  dash(r, ctx);
}

function dash(r: Runner, ctx: EpCtx) {
  r.dashAt = ctx.now;
  r.dashReady = ctx.now + DASH_COOLDOWN * 1000;
  ctx.fx("bond", { id: r.id });
}

/** Le temps de réaction d'un bot au coup de sifflet (ms), toujours le même pour une traversée */
const waitOf = (id: string, crossing: number) => {
  let h = crossing * 7919;
  for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) % 100003;
  return 200 + (h % 1400);
};

const goalReached = (s: EpervierState, r: Runner) => (s.dir === 1 ? r.x >= FIELD.safe : r.x <= -FIELD.safe);

function botCandidate(s: EpervierState, r: Runner, ctx: EpCtx, p: number, wait: number) {
  const lv = ctx.level(r.id);
  if (goalReached(s, r) || ctx.now < s.stageAt + wait) {
    r.ix = 0;
    r.iz = 0;
    return;
  }
  const hurry = clamp((ctx.now - s.stageAt) / (RUN_S * 1000), 0, 1);
  // Le passage le plus large entre les éperviers qui sont devant lui, pas trop loin de sa route
  const ahead = s.run.filter((h) => h.role === "h" && !h.caught && (h.x - r.x) * s.dir > -1.5);
  const zs = [-FIELD.d, ...ahead.map((h) => h.z).sort((a, b) => a - b), FIELD.d];
  let tz = r.z;
  let best = -Infinity;
  for (let k = 0; k + 1 < zs.length; k++) {
    const mid = (zs[k]! + zs[k + 1]!) / 2;
    const score = zs[k + 1]! - zs[k]! - Math.abs(mid - r.z) * 0.45;
    if (score > best) {
      best = score;
      tz = mid;
    }
  }
  let dx = s.dir;
  let dz = clamp((tz - r.z) * 0.5, -1.2, 1.2);
  let danger = Infinity;
  for (const h of ahead) {
    const ex = r.x - h.x;
    const ez = r.z - h.z;
    const d = Math.sqrt(ex * ex + ez * ez);
    danger = Math.min(danger, d);
    if (d > 3.2 || d < 1e-3) continue;
    // De côté surtout : reculer devant l'épervier ne mène nulle part
    const w = (byLevel(lv, [1.1, 1.6, 2.1]) * (3.2 - d)) / (3.2 * d);
    dz += ez * w * 1.8;
    if (ex * s.dir > 0) dx += ex * w * 0.5;
  }
  // Encore à l'abri, un épervier qui guette juste devant : il attend son moment (tant qu'il a le temps)
  const inSafe = s.dir === 1 ? r.x <= -FIELD.safe : r.x >= FIELD.safe;
  if (inSafe && hurry < 0.45 && danger < 3.4 && random(ctx.rng) < byLevel(lv, [0.4, 0.7, 0.85])) dx *= 0.15;
  if (r.z > FIELD.d - 1) dz -= 1;
  if (r.z < -FIELD.d + 1) dz += 1;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  // Le metteur en scène : sous pression, certains bots hésitent un instant
  const slow = random(ctx.rng) < p * 0.05 ? 0.4 : 1;
  r.ix = (dx / len) * slow * byLevel(lv, [0.92, 0.97, 1]);
  r.iz = (dz / len) * slow;
  if (danger < byLevel(lv, [1.0, 1.35, 1.7]) && ctx.now >= r.dashReady && random(ctx.rng) < byLevel(lv, [0.2, 0.4, 0.65])) dash(r, ctx);
}

function botHawk(s: EpervierState, r: Runner, ctx: EpCtx, taken: Set<string>) {
  // La cible : le candidat libre le plus intéressant (proche, dans la zone des éperviers), pas déjà chassé par un autre
  let best: Runner | null = null;
  let bs = Infinity;
  for (const c of s.run) {
    if (c.role !== "c" || c.caught || goalReached(s, c) || Math.abs(c.x) > FIELD.hawk + 1.2) continue;
    const d = Math.sqrt((c.x - r.x) ** 2 + (c.z - r.z) ** 2);
    const score = d + (taken.has(c.id) ? 4 : 0) + (Math.abs(c.x) > FIELD.hawk + 1 ? 3 : 0);
    if (score < bs) {
      bs = score;
      best = c;
    }
  }
  if (!best) {
    // Personne dans sa zone : il garde le milieu, un peu du côté d'où ils viennent
    const px = -s.dir * 2.5;
    const ex = px - r.x;
    r.ix = clamp(ex * 0.4, -0.6, 0.6);
    r.iz = 0;
    return;
  }
  taken.add(best.id);
  const d = Math.sqrt((best.x - r.x) ** 2 + (best.z - r.z) ** 2);
  const lead = clamp(d / HAWK_SPEED, 0, 1) * 0.7;
  const tx = clamp(best.x + best.vx * lead, -FIELD.hawk, FIELD.hawk);
  const tz = best.z + best.vz * lead;
  const ex = tx - r.x;
  const ez = tz - r.z;
  const len = Math.sqrt(ex * ex + ez * ez) || 1;
  r.ix = ex / len;
  r.iz = ez / len;
  if (d < 1.7 && ctx.now >= r.dashReady && random(ctx.rng) < 0.07) dash(r, ctx);
}

export function epervierTick(s: EpervierState, ctx: EpCtx, live: (id: string) => boolean) {
  const now = ctx.now;
  const dt = ctx.dt;
  if (s.stage === "fin") return;
  if (s.stage === "pret" || s.stage === "pause") {
    // Les éperviers reprennent leur place au milieu
    for (const r of s.run) {
      r.vx = 0;
      r.vz = 0;
      if (r.role === "h") r.x += (clamp(r.x, -2, 2) - r.x) * clamp(dt * 3, 0, 1);
    }
    if (now < s.until) return;
    s.stage = "course";
    s.stageAt = now;
    s.until = now + (ctx.eclair ? RUN_S * 0.8 : RUN_S) * 1000;
    s.crossing++;
    ctx.fx("sifflet", { a: s.crossing });
    return;
  }
  const playing = s.ids.filter((_, i) => s.st[i] === PLAYING);
  const bots = playing.filter((id) => ctx.auto(id));
  const p = pressure(playing.length, ctx.keep, bots.length, Math.max(1, MAX_CROSSINGS - s.crossing + 1));
  const taken = new Set<string>();
  for (const r of s.run) {
    if (r.caught) continue;
    const isBot = r.role === "c" ? ctx.auto(r.id) : !live(r.id);
    if (isBot) {
      if (r.role === "c") botCandidate(s, r, ctx, p, waitOf(r.id, s.crossing));
      else botHawk(s, r, ctx, taken);
    }
    const max = (r.role === "c" ? CAND_SPEED : HAWK_SPEED) * (r.role === "h" ? (now < r.busy ? 0.35 : 1 + p * 0.06) : 1);
    const dashing = now - r.dashAt < DASH_S * 1000;
    let tvx = r.ix * max;
    let tvz = r.iz * max;
    if (dashing) {
      const len = Math.sqrt(r.vx * r.vx + r.vz * r.vz) || 1;
      const ux = len > 0.3 ? r.vx / len : r.ix;
      const uz = len > 0.3 ? r.vz / len : r.iz;
      tvx = ux * DASH_SPEED;
      tvz = uz * DASH_SPEED;
    }
    const k = clamp((dashing ? 30 : ACCEL) * dt, 0, 1);
    r.vx += (tvx - r.vx) * k;
    r.vz += (tvz - r.vz) * k;
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    r.z = clamp(r.z, -FIELD.d + 0.3, FIELD.d - 0.3);
    r.x = clamp(r.x, -FIELD.w + 0.3, FIELD.w - 0.3);
    if (r.role === "h") r.x = clamp(r.x, -FIELD.hawk, FIELD.hawk);
  }
  // Les candidats ne se marchent pas dessus
  const cs = s.run.filter((r) => r.role === "c" && !r.caught);
  for (let a = 0; a < cs.length; a++)
    for (let b = a + 1; b < cs.length; b++) {
      const A = cs[a]!;
      const B = cs[b]!;
      const dx = B.x - A.x;
      const dz = B.z - A.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= 0.5 * 0.5 || d2 <= 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (0.5 - d) / 2;
      A.x -= (dx / d) * push;
      A.z -= (dz / d) * push;
      B.x += (dx / d) * push;
      B.z += (dz / d) * push;
    }
  // Les prises
  for (const h of s.run) {
    if (h.role !== "h" || h.caught || now < h.busy) continue;
    for (const c of cs) {
      if (c.caught || goalReached(s, c)) continue;
      const d2 = (c.x - h.x) ** 2 + (c.z - h.z) ** 2;
      if (d2 > CATCH * CATCH) continue;
      catchOne(s, c, ctx, h.id);
      h.busy = now + HOLD_MS;
      break;
    }
  }
  const allSafe = cs.every((c) => c.caught || goalReached(s, c));
  if (!allSafe && now < s.until) return;
  // Le temps est fini : ceux qui ne sont pas arrivés sont pris
  for (const c of cs) if (!c.caught && !goalReached(s, c)) catchOne(s, c, ctx, null);
  const left = s.st.filter((v) => v === PLAYING).length;
  if (left <= ctx.keep || left <= 1 || s.crossing >= MAX_CROSSINGS) {
    for (let i = 0; i < s.ids.length; i++) if (s.st[i] === PLAYING) s.st[i] = SAFE;
    s.stage = "fin";
    s.stageAt = now;
    return;
  }
  // Les attrapés deviennent éperviers ; on repart dans l'autre sens
  for (const r of s.run) {
    if (r.role === "c" && r.caught) {
      r.role = "h";
      r.caught = 0;
      r.x = clamp(r.x, -FIELD.hawk, FIELD.hawk);
    }
    r.ix = 0;
    r.iz = 0;
  }
  s.dir = s.dir === 1 ? -1 : 1;
  s.stage = "pause";
  s.stageAt = now;
  s.until = now + PAUSE_S * 1000;
  ctx.fx("repos", { a: s.crossing });
}

function catchOne(s: EpervierState, c: Runner, ctx: EpCtx, by: string | null) {
  const i = s.ids.indexOf(c.id);
  c.caught = ctx.now;
  c.ix = 0;
  c.iz = 0;
  if (i >= 0 && s.st[i] === PLAYING) {
    s.st[i] = OUT;
    ctx.out(c.id, "plumes");
  }
  ctx.fx("pris", { id: c.id, a: by ? 1 : 0 });
}

export const epervierOver = (s: EpervierState) => s.stage === "fin";

export function epervierPerf(s: EpervierState, i: number): number {
  const r = s.run.find((q) => q.id === s.ids[i]);
  return s.st[i] === SAFE ? 100 : s.crossing * 10 + (r ? (r.x * s.dir + FIELD.w) / 3 : 0);
}

export function epervierView(s: EpervierState) {
  return {
    ...s,
    run: s.run.map((r) => ({
      id: r.id,
      role: r.role,
      x: r2(r.x),
      z: r2(r.z),
      vx: r2(r.vx),
      vz: r2(r.vz),
      dashAt: r.dashAt,
      dashReady: r.dashReady,
      caught: r.caught,
      busy: r.busy,
    })),
  };
}
export type EpervierView = ReturnType<typeof epervierView>;

/** Un épervier de la cour (pas un ancien candidat) */
export const isMascot = (id: string) => id.startsWith("epervier-");

/** Pour les essais : un départ décalé au hasard */
export const jitter = (rng: { rng: number }) => between(rng, -0.2, 0.2);
