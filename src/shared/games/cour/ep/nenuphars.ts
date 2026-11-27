// Les Nénuphars : chacun tire son numéro de passage, puis on traverse l'étang dans cet ordre, de rangée en rangée. À
// chaque rangée, deux nénuphars : un seul porte, l'autre plonge (et son candidat avec, dans l'eau pleine de mousse). Qui
// passe en premier devine ; ceux qui suivent profitent de ce qu'ont appris les autres. Une libellule se pose parfois un
// instant sur le bon : encore faut-il la voir. On a quelques secondes pour sauter, et l'étang ne reste pas ouvert
// éternellement.

import { random, randomInt, shuffle } from "../../../rng.ts";
import { between, byLevel, clamp, OUT, PLAYING, SAFE, type EpCtx } from "./common.ts";

const NUMBERS_S = 9;
const LIMIT_S = 170;
/** Le temps pour sauter quand on est devant une rangée inconnue */
export const DECIDE_S = 7;
/** Un saut d'une rangée connue à la suivante (le premier de file court plus vite pour rejoindre le front) */
const HOP_MS = 520;
const RUN_MS = 300;
/** Après une chute, le temps que le suivant comprenne et s'élance */
const AFTER_FALL_MS = 1600;

export interface NenupharsState {
  kind: "nenuphars";
  stage: "numeros" | "jeu" | "fin";
  stageAt: number;
  until: number;
  ids: string[];
  st: number[];
  /** Le numéro de passage de chacun (0 : pas encore choisi) */
  order: number[];
  rows: number;
  /** Le bon côté de chaque rangée (secret), et ce qu'on en sait (-1 : rien) */
  good: number[];
  known: number[];
  /** Les rangées où une libellule viendra se poser (secret) */
  fly: number[];
  /** Celui qui est devant, sa rangée (-1 : la berge), quand il doit avoir sauté, et son prochain pas */
  leader: number;
  pos: number[];
  decideBy: number;
  /** La rangée inconnue devant laquelle il se tient (-1 : il avance encore sur ce qui est connu) */
  facing: number;
  nextHop: number;
  /** La libellule de la rangée en cours : quand elle se pose (0 : pas de libellule) */
  hintAt: number;
  /** Le dernier saut : qui, vers quelle rangée, de quel côté, s'il a tenu */
  last: { i: number; row: number; side: number; ok: boolean; at: number } | null;
  /** Ce que prévoit le bot devant la rangée : quand il saute */
  botAt: number;
  /** Les rangées que chacun a devinées lui-même */
  guess: number[];
}

export function nenupharsStart(ids: string[], now: number, ctx: EpCtx): NenupharsState {
  const n = ids.length;
  const rows = clamp(Math.round((n - ctx.keep) * 2), 4, 16);
  const good: number[] = [];
  const fly: number[] = [];
  for (let r = 0; r < rows; r++) {
    good.push(randomInt(ctx.rng, 2));
    fly.push(random(ctx.rng) < 0.34 ? 1 : 0);
  }
  return {
    kind: "nenuphars",
    stage: "numeros",
    stageAt: now,
    until: now + NUMBERS_S * 1000,
    ids,
    st: ids.map(() => 0),
    order: ids.map(() => 0),
    rows,
    good,
    known: good.map(() => -1),
    fly,
    leader: -1,
    pos: ids.map(() => -1),
    decideBy: 0,
    facing: -1,
    nextHop: 0,
    hintAt: 0,
    last: null,
    botAt: 0,
    guess: ids.map(() => 0),
  };
}

/** Il prend un numéro de passage encore libre */
export function nenupharsPick(s: NenupharsState, id: string, num: number) {
  const i = s.ids.indexOf(id);
  if (i < 0 || s.stage !== "numeros" || s.order[i] !== 0) return;
  if (!Number.isInteger(num) || num < 1 || num > s.ids.length || s.order.includes(num)) return;
  s.order[i] = num;
}

/** Il saute à gauche (0) ou à droite (1) */
export function nenupharsJump(s: NenupharsState, id: string, side: number, ctx: EpCtx) {
  const i = s.ids.indexOf(id);
  if (i < 0 || i !== s.leader || s.stage !== "jeu" || (side !== 0 && side !== 1)) return;
  if (!atFront(s, i) || ctx.now < s.nextHop) return;
  jump(s, i, side, ctx);
}

/** Il est devant une rangée inconnue */
export const atFront = (s: { pos: number[]; known: number[]; rows: number }, i: number) => {
  const next = s.pos[i]! + 1;
  return next < s.rows && s.known[next] === -1;
};

function jump(s: NenupharsState, i: number, side: number, ctx: EpCtx) {
  const row = s.pos[i]! + 1;
  const ok = s.good[row] === side;
  s.last = { i, row, side, ok, at: ctx.now };
  s.hintAt = 0;
  s.facing = -1;
  if (ok) {
    s.guess[i] = s.guess[i]! + 1;
    s.known[row] = side;
    s.pos[i] = row;
    s.nextHop = ctx.now + HOP_MS;
    ctx.fx("tient", { id: s.ids[i], a: row, b: side });
  } else {
    s.known[row] = 1 - side;
    s.st[i] = OUT;
    ctx.out(s.ids[i]!, "plouf");
    ctx.fx("coule", { id: s.ids[i], a: row, b: side });
    s.leader = -1;
    s.nextHop = ctx.now + AFTER_FALL_MS;
  }
}

/** Le suivant dans l'ordre des numéros */
const nextLeader = (s: NenupharsState) => {
  let best = -1;
  for (let i = 0; i < s.ids.length; i++) if (s.st[i] === PLAYING && (best < 0 || s.order[i]! < s.order[best]!)) best = i;
  return best;
};

function faceRow(s: NenupharsState, now: number, ctx: EpCtx) {
  const i = s.leader;
  s.decideBy = now + (ctx.eclair ? DECIDE_S * 0.62 : DECIDE_S) * 1000;
  const row = s.pos[i]! + 1;
  s.facing = row;
  s.hintAt = s.fly[row] ? now + between(ctx.rng, 1300, 4200) : 0;
  // Le bot saute après avoir hésité un peu (il attend parfois la libellule)
  const lv = ctx.level(s.ids[i]!);
  s.botAt = now + between(ctx.rng, 800, byLevel(lv, [2300, 3200, 4000]));
  ctx.fx("hesite", { id: s.ids[i], a: row });
}

export function nenupharsTick(s: NenupharsState, ctx: EpCtx) {
  const now = ctx.now;
  if (s.stage === "fin") return;
  if (s.stage === "numeros") {
    // Les bots prennent leur numéro au fil du temps ; à la fin, chacun en a un
    const free = () => s.ids.map((_, k) => k + 1).filter((k) => !s.order.includes(k));
    for (let i = 0; i < s.ids.length; i++) {
      if (s.order[i] !== 0) continue;
      if (now >= s.until || (ctx.auto(s.ids[i]!) && random(ctx.rng) < 0.05)) {
        const f = free();
        s.order[i] = f[randomInt(ctx.rng, f.length)]!;
      }
    }
    if (now < s.until) return;
    s.stage = "jeu";
    s.stageAt = now;
    s.until = now + LIMIT_S * 1000;
    s.nextHop = now + 1200;
    ctx.fx("depart");
    return;
  }
  if (now >= s.until) {
    ctx.fx("tous");
    for (let i = 0; i < s.ids.length; i++) {
      if (s.st[i] !== PLAYING) continue;
      s.st[i] = OUT;
      ctx.out(s.ids[i]!, "plouf");
    }
    s.stage = "fin";
    return;
  }
  if (s.leader < 0) {
    if (now < s.nextHop) return;
    s.leader = nextLeader(s);
    if (s.leader < 0) {
      s.stage = "fin";
      return;
    }
    s.nextHop = now + RUN_MS;
    s.facing = -1;
    ctx.fx("elance", { id: s.ids[s.leader] });
    return;
  }
  const i = s.leader;
  if (now < s.nextHop) return;
  // Il avance sur ce qui est connu
  if (!atFront(s, i)) {
    if (s.pos[i]! + 1 >= s.rows) {
      // Arrivé sur l'autre berge : tous les nénuphars sont connus, les autres passent sans risque
      for (let k = 0; k < s.ids.length; k++) if (s.st[k] === PLAYING) s.st[k] = SAFE;
      ctx.fx("traverse", { id: s.ids[i] });
      s.stage = "fin";
      s.stageAt = now;
      return;
    }
    s.pos[i] = s.pos[i]! + 1;
    s.nextHop = now + RUN_MS;
    if (atFront(s, i)) faceRow(s, now, ctx);
    return;
  }
  if (s.facing !== s.pos[i]! + 1) faceRow(s, now, ctx);
  // Devant l'inconnu : l'ordinateur joue pour lui, ou il a trop attendu
  const auto = ctx.auto(s.ids[i]!);
  if (now >= s.decideBy) {
    ctx.fx("pousse", { id: s.ids[i] });
    jump(s, i, randomInt(ctx.rng, 2), ctx);
  } else if (auto && now >= s.botAt) {
    const lv = ctx.level(s.ids[i]!);
    const row = s.pos[i]! + 1;
    const sawFly = s.hintAt > 0 && now >= s.hintAt && random(ctx.rng) < byLevel(lv, [0.2, 0.5, 0.8]);
    jump(s, i, sawFly ? s.good[row]! : randomInt(ctx.rng, 2), ctx);
  }
  if (s.stage === "jeu" && s.leader >= 0 && s.st[s.leader] !== PLAYING) s.leader = -1;
}

export const nenupharsOver = (s: NenupharsState) => s.stage === "fin";

export function nenupharsPerf(s: NenupharsState, i: number): number {
  return s.st[i] === SAFE ? 100 + (s.ids.length - s.order[i]!) : s.pos[i]! + 2;
}

export function nenupharsView(s: NenupharsState, now: number) {
  const { good: _g, fly: _f, botAt: _b, ...rest } = s;
  void _g;
  void _f;
  void _b;
  const row = s.leader >= 0 ? s.pos[s.leader]! + 1 : -1;
  // La libellule ne se montre qu'une fois posée, et seulement le temps qu'elle reste
  const hint = s.hintAt > 0 && now >= s.hintAt && now < s.hintAt + 1100 && row >= 0 && row < s.rows ? { row, side: s.good[row]! } : null;
  return { ...rest, hint };
}
export type NenupharsView = ReturnType<typeof nenupharsView>;

/** Pour les essais : un ordre au hasard */
export const shuffledOrder = (n: number, rng: { rng: number }) =>
  shuffle(
    rng,
    Array.from({ length: n }, (_, k) => k + 1),
  );
