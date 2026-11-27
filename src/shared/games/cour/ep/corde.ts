// Le Tir à la corde : les candidats tirés au sort en équipes, deux par deux de part et d'autre du grand bassin de mousse.
// On tire en rythme, sur le « hisse ! » de l'équipe : un coup pile sur le temps vaut beaucoup, un coup à côté presque
// rien, et tirer n'importe comment (plusieurs coups par temps) fait perdre son appui. La corde avance du côté de
// l'équipe qui tire le mieux ; l'équipe tirée jusqu'au bord du plongeoir finit dans la mousse.

import { random, shuffle } from "../../../rng.ts";
import { between, byLevel, clamp, gauss, OUT, PLAYING, r2, SAFE, type EpCtx } from "./common.ts";

/** La corde gagne à cette distance du milieu (mètres) */
export const ROPE_WIN = 2.6;
const TEAMS_S = 6;
const MATCH_S = 30;
const PAUSE_S = 4;
/** Le temps d'un « ho… hisse ! » (millisecondes) */
export const BEAT_MS = 860;

export interface CordeState {
  kind: "corde";
  stage: "equipes" | "match" | "pause" | "fin";
  stageAt: number;
  until: number;
  ids: string[];
  st: number[];
  /** L'équipe de chacun */
  team: number[];
  /** Les rencontres, dans l'ordre : les deux équipes */
  matches: [number, number][];
  cur: number;
  /** La corde : positive, elle avance vers la première équipe de la rencontre */
  rope: number;
  vel: number;
  /** Le premier temps de la rencontre (heure du serveur) */
  beat0: number;
  /** La qualité du dernier coup de chacun (0 à 1) et le temps où il l'a donné */
  q: number[];
  beat: number[];
  force: [number, number];
  /** Le gagnant de chaque rencontre jouée */
  winners: number[];
  /** Le dernier temps traité */
  seen: number;
  /** La somme et le nombre des coups de chacun (pour sa moyenne) */
  qs: number[];
  qn: number[];
}

export function cordeStart(ids: string[], now: number, ctx: EpCtx): CordeState {
  const n = ids.length;
  const count = n >= 12 ? 4 : 2;
  const order = shuffle(
    ctx.rng,
    ids.map((_, i) => i),
  );
  const team = ids.map(() => 0);
  order.forEach((i, k) => (team[i] = k % count));
  const matches: [number, number][] =
    count === 4
      ? [
          [0, 1],
          [2, 3],
        ]
      : [[0, 1]];
  return {
    kind: "corde",
    stage: "equipes",
    stageAt: now,
    until: now + TEAMS_S * 1000,
    ids,
    st: ids.map(() => 0),
    team,
    matches,
    cur: 0,
    rope: 0,
    vel: 0,
    beat0: 0,
    q: ids.map(() => 0),
    beat: ids.map(() => -1),
    force: [0, 0],
    winners: [],
    seen: -1,
    qs: ids.map(() => 0),
    qn: ids.map(() => 0),
  };
}

/** Le temps le plus proche de cette heure, et l'écart (ms) */
export function nearestBeat(beat0: number, at: number): { k: number; off: number } {
  const k = Math.round((at - beat0) / BEAT_MS);
  return { k, off: Math.abs(at - (beat0 + k * BEAT_MS)) };
}

/** La qualité d'un coup selon son écart au temps */
export const tapQuality = (off: number) => (off <= 75 ? 1 : off <= 150 ? 0.65 : off <= 240 ? 0.3 : 0.08);

/** Un coup sur la corde ; `at` : l'heure du serveur que l'écran a vue au moment du coup */
export function cordeTap(s: CordeState, id: string, at: number, ctx: EpCtx) {
  const i = s.ids.indexOf(id);
  if (i < 0 || s.stage !== "match" || s.st[i] !== PLAYING || !inMatch(s, i)) return;
  const when = typeof at === "number" && Math.abs(at - ctx.now) <= 350 ? at : ctx.now;
  if (when < s.beat0 - BEAT_MS / 2) return;
  const { k, off } = nearestBeat(s.beat0, when);
  if (k <= s.beat[i]!) {
    // Deux coups sur le même temps : il perd ses appuis
    s.q[i] = Math.max(0, s.q[i]! - 0.35);
    ctx.fx("glisse", { id });
    return;
  }
  s.beat[i] = k;
  s.q[i] = tapQuality(off);
  if (s.q[i] === 1) ctx.fx("parfait", { id });
}

const inMatch = (s: CordeState, i: number) => {
  const m = s.matches[s.cur];
  return Boolean(m && (s.team[i] === m[0] || s.team[i] === m[1]));
};

function startMatch(s: CordeState, now: number, ctx: EpCtx) {
  s.stage = "match";
  s.stageAt = now;
  s.until = now + (ctx.eclair ? MATCH_S * 0.66 : MATCH_S) * 1000 + 2400;
  s.rope = 0;
  s.vel = 0;
  // Trois temps pour se préparer (« À vos cordes… »), puis on tire
  s.beat0 = now + 2400;
  s.seen = -1;
  s.q = s.q.map(() => 0);
  s.beat = s.beat.map(() => -1);
  ctx.fx("pret", { a: s.cur });
}

export function cordeTick(s: CordeState, ctx: EpCtx) {
  const now = ctx.now;
  if (s.stage === "fin") return;
  if (s.stage === "equipes" || s.stage === "pause") {
    if (now >= s.until) startMatch(s, now, ctx);
    return;
  }
  const m = s.matches[s.cur]!;
  // Un nouveau temps : les bots donnent leur coup, ceux qui n'ont rien fait au temps d'avant perdent de la force
  const k = Math.floor((now - s.beat0 + BEAT_MS / 2) / BEAT_MS);
  if (now >= s.beat0 && k > s.seen) {
    s.seen = k;
    for (let i = 0; i < s.ids.length; i++) {
      if (s.st[i] !== PLAYING || !inMatch(s, i)) continue;
      // Le temps qui vient de passer compte dans sa moyenne
      if (k > 0) {
        s.qs[i] = s.qs[i]! + (s.beat[i] === k - 1 ? s.q[i]! : 0);
        s.qn[i] = s.qn[i]! + 1;
      }
      if (ctx.auto(s.ids[i]!)) {
        const lv = ctx.level(s.ids[i]!);
        const miss = random(ctx.rng) < byLevel(lv, [0.14, 0.07, 0.03]);
        s.q[i] = miss ? 0.05 : clamp(byLevel(lv, [0.5, 0.67, 0.84]) + gauss(ctx.rng) * byLevel(lv, [0.2, 0.14, 0.09]), 0.05, 1);
        s.beat[i] = k;
      } else if (s.beat[i]! < k - 1) s.q[i] = s.q[i]! * 0.55;
    }
    if (k % 2 === 0) ctx.fx("hisse", { a: k });
  }
  // La force des deux équipes : la moyenne de leurs coups, un rien de plus pour l'équipe la plus nombreuse
  const members = (t: number) => s.ids.map((_, i) => i).filter((i) => s.team[i] === t && s.st[i] === PLAYING);
  const a = members(m[0]);
  const b = members(m[1]);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((acc, i) => acc + s.q[i]!, 0) / xs.length : 0);
  const fa = mean(a) * (1 + 0.03 * (a.length - b.length));
  const fb = mean(b) * (1 + 0.03 * (b.length - a.length));
  s.force = [r2(fa), r2(fb)];
  if (now >= s.beat0) {
    // Celui qui recule perd ses appuis : la corde file d'autant plus vite
    const target = (fa - fb) * 3.2 + s.rope * 0.22 + gauss(ctx.rng) * 0.06;
    s.vel += (target - s.vel) * clamp(2.2 * ctx.dt, 0, 1);
    s.rope += s.vel * ctx.dt;
  }
  const over = Math.abs(s.rope) >= ROPE_WIN || now >= s.until;
  if (!over) return;
  // La rencontre est jouée : l'équipe vers qui la corde a avancé gagne (au bout du temps, celle qui mène)
  const win = s.rope > 0 ? m[0] : s.rope < 0 ? m[1] : random(ctx.rng) < 0.5 ? m[0] : m[1];
  const lose = win === m[0] ? m[1] : m[0];
  s.winners.push(win);
  ctx.fx("tombe", { a: lose, b: s.cur });
  for (let i = 0; i < s.ids.length; i++) {
    if (s.team[i] === lose && s.st[i] === PLAYING) {
      s.st[i] = OUT;
      ctx.out(s.ids[i]!, "mousse");
    } else if (s.team[i] === win && s.st[i] === PLAYING) s.st[i] = SAFE;
  }
  s.rope = clamp(s.rope, -ROPE_WIN - 0.6, ROPE_WIN + 0.6);
  if (s.cur + 1 < s.matches.length) {
    s.cur++;
    s.stage = "pause";
    s.stageAt = now;
    s.until = now + PAUSE_S * 1000;
  } else {
    s.stage = "fin";
    s.stageAt = now;
  }
}

export const cordeOver = (s: CordeState) => s.stage === "fin";

export function cordePerf(s: CordeState, i: number): number {
  const k = s.matches.findIndex((m) => m.includes(s.team[i]!));
  if (s.winners[k] === s.team[i]) return 100;
  return between({ rng: i + 1 }, 0, 1) + s.q[i]! * 10;
}

export function cordeView(s: CordeState) {
  const { seen: _s, ...rest } = s;
  void _s;
  return { ...rest, rope: r2(s.rope), vel: r2(s.vel), q: s.q.map(r2) };
}
export type CordeView = ReturnType<typeof cordeView>;
