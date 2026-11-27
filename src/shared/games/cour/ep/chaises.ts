// Les Chaises musicales : la foule tourne autour d'un cercle de chaises tant que joue la musique. Elle s'arrête d'un
// coup (le serveur seul sait quand) : chacun fonce vers la chaise libre la plus proche, le premier arrivé s'assoit.
// Ceux qui restent debout tombent par la trappe dans la piscine à balles. Une chaise de moins (ou plusieurs), et on
// recommence, jusqu'à ce qu'il ne reste que le nombre voulu. Qui s'élance en pleine musique se fait siffler : il
// repartira en retard.
//
// Le temps de réaction d'un vrai joueur se compte depuis le moment où son écran a entendu la musique s'arrêter (son
// écran le mesure) : celui qui a une connexion lente n'est pas puni de sa lenteur.

import { random } from "../../../rng.ts";
import { between, byLevel, clamp, gauss, OUT, PLAYING, SAFE, type EpCtx } from "./common.ts";

const DASH_SPEED = 4.2;
const WALK_SPEED = 1.25;
/** Les chaises sont posées sur ce cercle (rayon selon leur nombre), la foule tourne un peu plus loin */
export const WALK_GAP = 1.25;
/** Assis : la place devant la chaise (elle regarde vers l'extérieur) */
export const SEAT_GAP = 0.42;
const FALSE_START_MS = 750;
const STOP_WAIT_MS = 4000;
const TRAP_S = 2.8;
const PAUSE_S = 2.2;
const MAX_ROUNDS = 7;

export interface ChaisesState {
  kind: "chaises";
  stage: "tour" | "course" | "trappe" | "pause" | "fin";
  stageAt: number;
  until: number;
  ids: string[];
  st: number[];
  round: number;
  /** Ceux qui jouent cette manche */
  inRound: number[];
  R: number;
  chairAng: number[];
  /** La chaise prise par qui (-1 : libre) */
  taken: number[];
  /** Où chacun en est sur le cercle de marche (radians) */
  ang: number[];
  /** La musique : quand elle s'arrêtera (secret), quand elle s'est arrêtée (0 : elle joue) */
  stopAt: number;
  stopped: number;
  /** Le moment où il s'élance (0 : pas encore), la chaise visée, son point de départ, le moment où il arrive */
  go: number[];
  tgt: number[];
  from: [number, number][];
  arrive: number[];
  /** Assis sur quelle chaise (-1 : debout) */
  sat: number[];
  /** Le moment de son faux départ (0 : aucun) */
  faux: number[];
  /** Ses temps de réaction (somme en secondes, nombre de manches) */
  rsum: number[];
  rn: number[];
  bot: { react: number[] };
}

export const ringRadius = (chairs: number) => Math.max(2.3, (chairs * 1.08) / (2 * Math.PI));

export function chairPos(s: { R: number; chairAng: number[] }, c: number, gap = SEAT_GAP): [number, number] {
  const a = s.chairAng[c]!;
  return [Math.cos(a) * (s.R + gap), Math.sin(a) * (s.R + gap)];
}

export function walkPos(s: { R: number }, ang: number): [number, number] {
  return [Math.cos(ang) * (s.R + WALK_GAP), Math.sin(ang) * (s.R + WALK_GAP)];
}

export function chaisesStart(ids: string[], now: number, ctx: EpCtx): ChaisesState {
  const s: ChaisesState = {
    kind: "chaises",
    stage: "tour",
    stageAt: now,
    until: now,
    ids,
    st: ids.map(() => 0),
    round: 0,
    inRound: [],
    R: 3,
    chairAng: [],
    taken: [],
    ang: ids.map(() => 0),
    stopAt: 0,
    stopped: 0,
    go: ids.map(() => 0),
    tgt: ids.map(() => -1),
    from: ids.map(() => [0, 0] as [number, number]),
    arrive: ids.map(() => 0),
    sat: ids.map(() => -1),
    faux: ids.map(() => 0),
    rsum: ids.map(() => 0),
    rn: ids.map(() => 0),
    bot: { react: ids.map(() => 0) },
  };
  newRound(s, now + 1500, ctx);
  return s;
}

function newRound(s: ChaisesState, now: number, ctx: EpCtx) {
  const live = s.ids.map((_, i) => i).filter((i) => s.st[i] === PLAYING || s.st[i] === SAFE);
  for (const i of live) s.st[i] = PLAYING;
  const roundsLeft = Math.max(1, Math.min(3, MAX_ROUNDS - s.round));
  const k = clamp(Math.ceil((live.length - ctx.keep) / roundsLeft), 1, live.length - 1);
  const chairs = live.length - k;
  s.round++;
  s.inRound = live;
  s.R = ringRadius(chairs);
  s.chairAng = Array.from({ length: chairs }, (_, c) => (c / chairs) * Math.PI * 2 + 0.2);
  s.taken = s.chairAng.map(() => -1);
  // Les candidats répartis sur le cercle de marche, dans un ordre mélangé
  live.forEach((i, k2) => (s.ang[i] = (k2 / live.length) * Math.PI * 2 + between(ctx.rng, -0.06, 0.06)));
  for (const i of live) {
    s.go[i] = 0;
    s.tgt[i] = -1;
    s.arrive[i] = 0;
    s.sat[i] = -1;
    s.faux[i] = 0;
    const lv = ctx.level(s.ids[i]!);
    s.bot.react[i] = Math.max(0.12, byLevel(lv, [0.56, 0.38, 0.26]) + gauss(ctx.rng) * byLevel(lv, [0.14, 0.09, 0.05]));
  }
  s.stage = "tour";
  s.stageAt = now;
  s.stopped = 0;
  // La musique joue entre cinq et treize secondes, parfois à peine trois
  s.stopAt = now + (random(ctx.rng) < 0.15 ? between(ctx.rng, 3000, 4200) : between(ctx.rng, 5500, 13000)) * (ctx.eclair ? 0.65 : 1);
  s.until = s.stopAt;
  ctx.fx("musique", { a: s.round, b: chairs });
}

/** Il veut s'asseoir ; `react` : le temps écoulé sur son écran depuis qu'il a entendu la musique s'arrêter (ms) */
export function chaisesSit(s: ChaisesState, id: string, react: number, ctx: EpCtx) {
  const i = s.ids.indexOf(id);
  if (i < 0 || s.st[i] !== PLAYING || !s.inRound.includes(i) || s.go[i]! > 0) return;
  if (s.stage === "tour" && !s.stopped) {
    // Faux départ : sifflé, il repartira en retard
    if (!s.faux[i]) {
      s.faux[i] = ctx.now;
      ctx.fx("siffle", { id });
    }
    return;
  }
  if (s.stage !== "course") return;
  const r = typeof react === "number" && Number.isFinite(react) ? react : ctx.now - s.stopped;
  const eff = s.stopped + clamp(r, 140, ctx.now - s.stopped) + (s.faux[i] ? FALSE_START_MS : 0);
  launch(s, i, eff, ctx);
}

function launch(s: ChaisesState, i: number, at: number, ctx: EpCtx) {
  s.go[i] = at;
  s.rsum[i] = s.rsum[i]! + (at - s.stopped) / 1000;
  s.rn[i] = s.rn[i]! + 1;
  s.from[i] = walkPos(s, s.ang[i]!);
  aim(s, i, at, ctx);
}

/** La chaise libre la plus proche de là où il est, et son heure d'arrivée */
function aim(s: ChaisesState, i: number, from: number, ctx: EpCtx) {
  const [x, z] = s.from[i]!;
  let best = -1;
  let bd = Infinity;
  for (let c = 0; c < s.chairAng.length; c++) {
    if (s.taken[c]! >= 0) continue;
    const [cx, cz] = chairPos(s, c);
    // Un petit défaut de jugement chez les bots
    const d = Math.hypot(cx - x, cz - z) * (ctx.auto(s.ids[i]!) ? between(ctx.rng, 1, 1.12) : 1);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  s.tgt[i] = best;
  if (best >= 0) {
    const [cx, cz] = chairPos(s, best);
    s.arrive[i] = from + (Math.hypot(cx - x, cz - z) / DASH_SPEED) * 1000;
  }
}

/** Où il est en ce moment pendant sa course */
export function dashPos(
  s: Pick<ChaisesState, "tgt" | "go" | "ang" | "from" | "arrive" | "R" | "chairAng">,
  i: number,
  now: number,
): [number, number] {
  const c = s.tgt[i]!;
  if (c < 0 || !s.go[i]) return walkPos(s, s.ang[i]!);
  const [x, z] = s.from[i]!;
  const [cx, cz] = chairPos(s, c);
  const total = s.arrive[i]! - s.go[i]!;
  const k = total > 0 ? clamp((now - s.go[i]!) / total, 0, 1) : 1;
  return [x + (cx - x) * k, z + (cz - z) * k];
}

export function chaisesTick(s: ChaisesState, ctx: EpCtx) {
  const now = ctx.now;
  if (s.stage === "fin") return;
  if (s.stage === "tour") {
    if (now < s.stageAt) return;
    for (const i of s.inRound) s.ang[i] = s.ang[i]! + (WALK_SPEED / (s.R + WALK_GAP)) * ctx.dt;
    if (now < s.stopAt) return;
    s.stopped = s.stopAt;
    s.stage = "course";
    s.until = s.stopped + STOP_WAIT_MS;
    ctx.fx("stop");
    return;
  }
  if (s.stage === "course") {
    // Les bots s'élancent après leur temps de réaction
    for (const i of s.inRound) {
      if (s.go[i] || s.st[i] !== PLAYING || !ctx.auto(s.ids[i]!)) continue;
      const at = s.stopped + s.bot.react[i]! * 1000 + (s.faux[i] ? FALSE_START_MS : 0);
      if (now >= at) launch(s, i, at, ctx);
    }
    // Les arrivées, dans l'ordre : le premier prend la chaise, les autres repartent vers une autre
    const coming = s.inRound.filter((i) => s.go[i]! > 0 && s.sat[i]! < 0 && s.tgt[i]! >= 0).sort((a, b) => s.arrive[a]! - s.arrive[b]!);
    for (const i of coming) {
      const c = s.tgt[i]!;
      if (s.taken[c]! >= 0 && s.taken[c] !== i) {
        s.from[i] = dashPos(s, i, now);
        s.go[i] = now;
        aim(s, i, now, ctx);
        continue;
      }
      if (now < s.arrive[i]!) continue;
      s.taken[c] = i;
      s.sat[i] = c;
      ctx.fx("assis", { id: s.ids[i], a: c });
    }
    const free = s.taken.filter((t) => t < 0).length;
    if (free > 0 && now < s.until) return;
    // Plus de chaise libre (ou plus de temps) : la trappe s'ouvre sous ceux qui sont debout
    for (const i of s.inRound) {
      if (s.sat[i]! >= 0) {
        s.st[i] = SAFE;
        continue;
      }
      if (s.st[i] !== PLAYING) continue;
      s.st[i] = OUT;
      s.from[i] = dashPos(s, i, now);
      s.go[i] = 0;
      s.tgt[i] = -1;
      ctx.out(s.ids[i]!, "trappe");
      ctx.fx("trappe", { id: s.ids[i] });
    }
    s.stage = "trappe";
    s.stageAt = now;
    s.until = now + TRAP_S * 1000;
    return;
  }
  if (now < s.until) return;
  if (s.stage === "trappe") {
    const left = s.st.filter((v) => v === SAFE || v === PLAYING).length;
    if (left <= ctx.keep || left <= 1 || s.round >= MAX_ROUNDS) {
      s.stage = "fin";
      return;
    }
    s.stage = "pause";
    s.stageAt = now;
    s.until = now + PAUSE_S * 1000;
    ctx.fx("debout");
    return;
  }
  newRound(s, now, ctx);
}

export const chaisesOver = (s: ChaisesState) => s.stage === "fin";

export function chaisesPerf(s: ChaisesState, i: number): number {
  const sec = s.go[i] && s.stopped ? (s.go[i]! - s.stopped) / 1000 : 9;
  return s.round * 10 + (s.st[i] !== OUT ? 50 : 0) - sec;
}

export function chaisesView(s: ChaisesState) {
  const { stopAt: _s, bot: _b, ...rest } = s;
  void _s;
  void _b;
  return rest;
}
export type ChaisesView = ReturnType<typeof chaisesView>;
