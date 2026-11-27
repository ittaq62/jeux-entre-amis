// La Finale des Polochons : deux finalistes sur une poutre au-dessus du grand bassin de mousse, un polochon chacun. Un
// coup se prépare (on voit le polochon monter, ou descendre pour un coup bas), puis part ; parer du bon côté au bon
// moment le renvoie et laisse l'attaquant sonné un instant ; un coup reçu fait perdre l'équilibre. Frapper fatigue : il
// faut du souffle pour frapper. Le premier dont l'équilibre tombe à zéro plonge dans la mousse. Au bout du temps, la
// poutre bascule : celui qui tient le moins bien tombe.

import { random } from "../../../rng.ts";
import { between, byLevel, clamp, gauss, OUT, PLAYING, SAFE, type EpCtx } from "./common.ts";

export const WIND_MS = 480;
const RECOVER_MS = 360;
const PARRY_MS = 380;
const PARRY_COOLDOWN_MS = 460;
const STUN_MS = 720;
const HIT_HIGH = 13;
const HIT_LOW = 10.5;
const ATTACK_COST = 22;
const PARRY_COST = 7;
const STAMINA_REGEN = 30;
const LIMIT_S = 80;
const READY_S = 3.2;

export type Side = "h" | "b";
export type Act = "idle" | "wind" | "recover" | "parry" | "stun" | "fall";

export interface Fighter {
  bal: number;
  stam: number;
  act: Act;
  side: Side;
  /** Le début de l'action en cours */
  at: number;
  /** On ne pare pas de nouveau avant */
  parryReady: number;
  hits: number;
  parries: number;
}

export interface PolochonsState {
  kind: "polochons";
  stage: "pret" | "duel" | "fin";
  stageAt: number;
  until: number;
  ids: string[];
  st: number[];
  f: Fighter[];
  winner: number;
  /** Le temps d'armer un coup (ms) */
  wind: number;
  bot: { plan: number[]; next: number[]; lastSeen: number[] };
}

export function polochonsStart(ids: string[], now: number, ctx?: Pick<EpCtx, "eclair">): PolochonsState {
  const fighter = (): Fighter => ({ bal: 100, stam: 100, act: "idle", side: "h", at: now, parryReady: 0, hits: 0, parries: 0 });
  return {
    kind: "polochons",
    stage: "pret",
    stageAt: now,
    until: now + READY_S * 1000,
    ids,
    st: ids.map(() => 0),
    f: ids.map(fighter),
    wind: ctx?.eclair ? WIND_MS - 70 : WIND_MS,
    winner: -1,
    bot: { plan: ids.map(() => 0), next: ids.map(() => 0), lastSeen: ids.map(() => 0) },
  };
}

export type PolAction = "hh" | "hb" | "ph" | "pb";

export function polochonsAct(s: PolochonsState, id: string, a: PolAction, ctx: EpCtx) {
  const i = s.ids.indexOf(id);
  if (i < 0 || s.stage !== "duel") return;
  act(s, i, a, ctx);
}

const free = (f: Fighter) => f.act === "idle" || f.act === "parry";

function act(s: PolochonsState, i: number, a: PolAction, ctx: EpCtx) {
  const f = s.f[i]!;
  const now = ctx.now;
  if (a === "hh" || a === "hb") {
    if (!free(f) || f.stam < ATTACK_COST) return;
    f.act = "wind";
    f.side = a === "hh" ? "h" : "b";
    f.at = now;
    f.stam -= ATTACK_COST;
    ctx.fx("arme", { id: s.ids[i], a: f.side === "h" ? 1 : 0 });
  } else {
    if (f.act !== "idle" || now < f.parryReady || f.stam < PARRY_COST) return;
    f.act = "parry";
    f.side = a === "ph" ? "h" : "b";
    f.at = now;
    f.stam -= PARRY_COST;
    f.parryReady = now + PARRY_MS + PARRY_COOLDOWN_MS;
  }
}

function botThink(s: PolochonsState, i: number, ctx: EpCtx) {
  const now = ctx.now;
  const me = s.f[i]!;
  const o = 1 - i;
  const them = s.f[o]!;
  const lv = ctx.level(s.ids[i]!);
  // Il a vu l'autre armer : il pare après son temps de réaction, du côté qu'il a lu (pas toujours le bon)
  if (them.act === "wind" && s.bot.lastSeen[i] !== them.at) {
    s.bot.lastSeen[i] = them.at;
    const react = Math.max(110, byLevel(lv, [360, 265, 185]) + gauss(ctx.rng) * 50);
    const right = random(ctx.rng) < byLevel(lv, [0.6, 0.77, 0.9]);
    s.bot.plan[i] = (right ? (them.side === "h" ? 1 : 2) : them.side === "h" ? 2 : 1) * 10;
    s.bot.next[i] = them.at + react;
  }
  if (s.bot.plan[i]! >= 10 && now >= s.bot.next[i]!) {
    const side = s.bot.plan[i] === 10 ? "ph" : "pb";
    s.bot.plan[i] = 0;
    s.bot.next[i] = now + between(ctx.rng, 300, 700);
    if (them.act === "wind") act(s, i, side, ctx);
    return;
  }
  if (s.bot.plan[i] === 0 && now >= s.bot.next[i]! && me.act === "idle" && me.stam >= 40) {
    // Il attaque : souvent quand l'autre est sonné ou vient de frapper, sinon de temps en temps
    const opening = them.act === "stun" || them.act === "recover";
    if (opening || random(ctx.rng) < byLevel(lv, [0.35, 0.45, 0.55])) {
      const side: PolAction = them.act === "parry" ? (them.side === "h" ? "hb" : "hh") : random(ctx.rng) < 0.5 ? "hh" : "hb";
      act(s, i, side, ctx);
    }
    s.bot.next[i] = now + between(ctx.rng, byLevel(lv, [900, 700, 520]), byLevel(lv, [2000, 1600, 1250]));
  }
}

function fall(s: PolochonsState, i: number, ctx: EpCtx) {
  s.f[i]!.act = "fall";
  s.f[i]!.at = ctx.now;
  s.f[i]!.bal = 0;
  s.st[i] = OUT;
  s.st[1 - i] = SAFE;
  s.winner = 1 - i;
  ctx.out(s.ids[i]!, "mousse");
  ctx.fx("chute", { id: s.ids[i] });
  s.stage = "fin";
  s.stageAt = ctx.now;
}

export function polochonsTick(s: PolochonsState, ctx: EpCtx) {
  const now = ctx.now;
  if (s.stage === "fin") return;
  if (s.stage === "pret") {
    if (now < s.until) return;
    s.stage = "duel";
    s.stageAt = now;
    s.until = now + LIMIT_S * 1000;
    ctx.fx("gong");
    return;
  }
  for (let i = 0; i < 2; i++) if (ctx.auto(s.ids[i]!) && s.st[i] === PLAYING) botThink(s, i, ctx);
  for (let i = 0; i < 2; i++) {
    const f = s.f[i]!;
    const o = s.f[1 - i]!;
    f.stam = Math.min(100, f.stam + STAMINA_REGEN * ctx.dt);
    if (f.act === "idle") f.bal = Math.min(100, f.bal + 1.5 * ctx.dt);
    if (f.act === "parry" && now - f.at > PARRY_MS) f.act = "idle";
    if (f.act === "recover" && now - f.at > RECOVER_MS) f.act = "idle";
    if (f.act === "stun" && now - f.at > STUN_MS) f.act = "idle";
    if (f.act !== "wind" || now - f.at < s.wind) continue;
    // Le coup part
    const parried = o.act === "parry" && o.side === f.side;
    if (parried) {
      f.act = "stun";
      f.at = now;
      o.parries++;
      o.bal = Math.min(100, o.bal + 4);
      ctx.fx("pare", { id: s.ids[1 - i], a: f.side === "h" ? 1 : 0 });
      continue;
    }
    const dmg = (f.side === "h" ? HIT_HIGH : HIT_LOW) * (o.act === "stun" ? 1.5 : 1) * between(ctx.rng, 0.9, 1.1);
    o.bal -= dmg;
    f.hits++;
    f.act = "recover";
    f.at = now;
    // Celui qui armait son coup le perd
    if (o.act === "wind" || o.act === "parry") {
      o.act = "recover";
      o.at = now;
    }
    ctx.fx("touche", { id: s.ids[1 - i], a: f.side === "h" ? 1 : 0, b: Math.round(dmg) });
    if (o.bal <= 0) return fall(s, 1 - i, ctx);
  }
  if (now >= s.until) {
    ctx.fx("bascule");
    const a = s.f[0]!.bal;
    const b = s.f[1]!.bal;
    fall(s, a < b ? 0 : a > b ? 1 : random(ctx.rng) < 0.5 ? 0 : 1, ctx);
  }
}

export const polochonsOver = (s: PolochonsState) => s.stage === "fin";

export function polochonsPerf(s: PolochonsState, i: number): number {
  return s.winner === i ? 100 : clamp(s.f[i]!.hits * 3 + s.f[i]!.parries * 2, 0, 90);
}

export function polochonsView(s: PolochonsState) {
  const { bot: _b, ...rest } = s;
  void _b;
  return { ...rest, f: s.f.map((f) => ({ ...f, bal: Math.round(f.bal), stam: Math.round(f.stam) })) };
}
export type PolochonsView = ReturnType<typeof polochonsView>;
