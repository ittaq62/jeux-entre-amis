// La Marelle : chacun devant sa marelle à la craie. Les cases s'allument une à une, chacune avec sa note ; puis il faut
// les sauter dans le même ordre, sans traîner. À chaque manche, une case de plus. Une erreur (ou trop de temps), et le
// canon à mousse s'en occupe. On joue jusqu'à ce qu'il ne reste que le nombre voulu.
//
// L'ordre n'est montré aux écrans qu'au fur et à mesure qu'il s'allume, et plus du tout pendant les sauts.

import { random, randomInt } from "../../../rng.ts";
import { between, clamp, OUT, PLAYING, pressure, SAFE, skill, type EpCtx } from "./common.ts";

/** Les cases de la marelle (la dernière, le Ciel), en mètres depuis le pied de la marelle */
export const MARELLE_CASES: readonly [number, number][] = [
  [0, 0],
  [0, 0.95],
  [0, 1.9],
  [-0.48, 2.85],
  [0.48, 2.85],
  [0, 3.8],
  [-0.48, 4.75],
  [0.48, 4.75],
  [0, 5.7],
  [0, 6.75],
];
export const CASE_NAMES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Ciel"];

const FIRST_LEN = 3;
const MAX_ROUNDS = 8;
const BILAN_S = 2.4;

export interface MarelleState {
  kind: "marelle";
  stage: "montre" | "saute" | "bilan" | "fin";
  stageAt: number;
  until: number;
  ids: string[];
  st: number[];
  round: number;
  /** L'ordre de la manche (secret : la vue n'en montre que ce qui s'est déjà allumé) */
  seq: number[];
  /** Le temps d'une case qui s'allume (ms) */
  step: number;
  /** Les cases déjà sautées par chacun dans cette manche, et le moment où il a fini */
  prog: number[];
  fin: number[];
  /** Les manches réussies par chacun */
  passed: number[];
  /** La case où il a raté (-1) */
  miss: number[];
  bot: { fail: number[]; next: number[] };
}

export function marelleStart(ids: string[], now: number, ctx: EpCtx): MarelleState {
  const zero = () => ids.map(() => 0);
  const s: MarelleState = {
    kind: "marelle",
    stage: "montre",
    stageAt: now,
    until: now,
    ids,
    st: zero(),
    round: 0,
    seq: [],
    step: 600,
    prog: zero(),
    fin: zero(),
    passed: zero(),
    miss: ids.map(() => -1),
    bot: { fail: ids.map(() => -1), next: zero() },
  };
  newRound(s, now + 1200, ctx);
  return s;
}

function newRound(s: MarelleState, now: number, ctx: EpCtx) {
  s.round++;
  const len = FIRST_LEN + s.round - 1;
  // L'ordre de la manche reprend celui d'avant et ajoute une case (jamais deux fois la même d'affilée)
  const seq = s.seq.slice(0, len - 1);
  while (seq.length < len) {
    let c = randomInt(ctx.rng, MARELLE_CASES.length);
    if (c === seq[seq.length - 1]) c = (c + 1 + randomInt(ctx.rng, MARELLE_CASES.length - 1)) % MARELLE_CASES.length;
    seq.push(c);
  }
  s.seq = seq;
  s.step = Math.max(ctx.eclair ? 300 : 380, (ctx.eclair ? 540 : 640) - s.round * 30);
  s.stage = "montre";
  s.stageAt = now;
  s.until = now + len * s.step + 500;
  const live = s.ids.map((_, i) => i).filter((i) => s.st[i] !== OUT);
  const bots = live.filter((i) => ctx.auto(s.ids[i]!));
  const p = pressure(live.length, ctx.keep, bots.length, 3);
  for (const i of live) {
    s.st[i] = PLAYING;
    s.prog[i] = 0;
    s.fin[i] = 0;
    s.miss[i] = -1;
    // Le bot retient d'autant moins que l'ordre est long ; parfois il se trompe exprès (le metteur en scène)
    const c = [3, 4, 5.2][skill(ctx.level(s.ids[i]!))]!;
    const fail = clamp(0.06 * Math.max(0, len - c) ** 1.3, 0, 0.9);
    s.bot.fail[i] = random(ctx.rng) < Math.max(fail, p * 0.6) ? randomInt(ctx.rng, len) : -1;
    s.bot.next[i] = 0;
  }
  ctx.fx("montre", { a: s.round, b: len });
}

/** Il saute sur une case ; `j` : la place qu'il croit remplir dans l'ordre (un doublon de message ne compte pas deux fois) */
export function marelleHop(s: MarelleState, id: string, c: number, j: number, ctx: EpCtx) {
  const i = s.ids.indexOf(id);
  if (i < 0 || s.stage !== "saute" || s.st[i] !== PLAYING || j !== s.prog[i]) return;
  if (!Number.isInteger(c) || c < 0 || c >= MARELLE_CASES.length) return;
  hop(s, i, c, ctx);
}

function hop(s: MarelleState, i: number, c: number, ctx: EpCtx) {
  const id = s.ids[i]!;
  if (s.seq[s.prog[i]!] !== c) {
    s.st[i] = OUT;
    s.miss[i] = c;
    ctx.out(id, "canon");
    ctx.fx("rate", { id, a: c });
    return;
  }
  s.prog[i] = s.prog[i]! + 1;
  ctx.fx("saut", { id, a: c, b: s.prog[i] });
  if (s.prog[i]! >= s.seq.length) {
    s.st[i] = SAFE;
    s.passed[i] = s.passed[i]! + 1;
    s.fin[i] = ctx.now - s.stageAt;
    ctx.fx("ciel", { id });
  }
}

export function marelleTick(s: MarelleState, ctx: EpCtx) {
  const now = ctx.now;
  if (s.stage === "fin" || now < s.stageAt) return;
  if (s.stage === "montre") {
    if (now < s.until) return;
    s.stage = "saute";
    s.stageAt = now;
    s.until = now + (s.seq.length * (ctx.eclair ? 0.75 : 0.95) + 2.6) * 1000;
    ctx.fx("saute");
    return;
  }
  if (s.stage === "saute") {
    for (let i = 0; i < s.ids.length; i++) {
      if (s.st[i] !== PLAYING || !ctx.auto(s.ids[i]!)) continue;
      if (!s.bot.next[i]) s.bot.next[i] = now + between(ctx.rng, 500, 1100);
      if (now < s.bot.next[i]!) continue;
      s.bot.next[i] = now + between(ctx.rng, 330, 620);
      const j = s.prog[i]!;
      const right = s.seq[j]!;
      const wrong = (right + 1 + randomInt(ctx.rng, MARELLE_CASES.length - 1)) % MARELLE_CASES.length;
      hop(s, i, s.bot.fail[i] === j ? wrong : right, ctx);
    }
    const done = !s.st.some((v) => v === PLAYING);
    if (!done && now < s.until) return;
    for (let i = 0; i < s.ids.length; i++) {
      if (s.st[i] !== PLAYING) continue;
      s.st[i] = OUT;
      ctx.out(s.ids[i]!, "canon");
      ctx.fx("rate", { id: s.ids[i], a: -1 });
    }
    s.stage = "bilan";
    s.stageAt = now;
    s.until = now + BILAN_S * 1000;
    return;
  }
  if (now < s.until) return;
  const left = s.st.filter((v) => v === SAFE).length;
  if (left <= ctx.keep || left <= 1 || s.round >= MAX_ROUNDS) {
    s.stage = "fin";
    return;
  }
  newRound(s, now, ctx);
}

export const marelleOver = (s: MarelleState) => s.stage === "fin";

export function marellePerf(s: MarelleState, i: number): number {
  return s.passed[i]! * 10 + s.prog[i]! - s.fin[i]! / 100000;
}

export function marelleView(s: MarelleState, now: number) {
  const { bot: _b, seq, ...rest } = s;
  void _b;
  // Pendant qu'elles s'allument : les cases déjà montrées ; pendant les sauts, rien ; au bilan, tout
  const shown = s.stage === "montre" ? Math.max(0, Math.min(seq.length, Math.floor((now - s.stageAt) / s.step) + 1)) : 0;
  return { ...rest, len: seq.length, seq: s.stage === "bilan" || s.stage === "fin" ? seq : seq.slice(0, shown) };
}
export type MarelleView = ReturnType<typeof marelleView>;
