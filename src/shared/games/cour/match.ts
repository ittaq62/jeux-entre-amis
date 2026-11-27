// Le grand jeu : l'arrivée des candidats, puis les épreuves l'une après l'autre (chacune révélée, jouée, puis ses
// éliminés montrés), et la finale des polochons entre les deux derniers. Le serveur fait tourner tout ça ; les écrans
// reçoivent l'état et le montrent.
//
// Le programme tire les épreuves dans celles que l'hôte a gardées, la dernière avant la finale étant une épreuve « en
// manches » (qui sait s'arrêter au nombre voulu). Chaque épreuve vise un nombre de survivants, pour arriver à deux
// finalistes : les bots se trompent plus ou moins selon ce qu'il faut ; les vrais joueurs, jamais exprès. S'il reste
// moins de deux candidats, les meilleurs éliminés de l'épreuve sont repêchés ; avant la finale, s'il en reste plus de
// deux, le jury garde les deux meilleurs de l'épreuve.
//
// Quand plus aucun vrai joueur n'est en lice, la suite (sauf la finale) se joue en accéléré.

import { random, shuffle, type RngHolder } from "../../rng.ts";
import { DUREE_ROUNDS, type BotLevel, type CourConfig } from "./config.ts";
import { EPREUVE_INFO, type EpreuveId } from "./epreuves.ts";
import { billesOver, billesPerf, billesStart, billesThrow, billesTick, billesView, type BillesState } from "./ep/billes.ts";
import {
  biscuitChoose,
  biscuitOver,
  biscuitPerf,
  biscuitStart,
  biscuitTick,
  biscuitTrace,
  biscuitView,
  type BiscuitState,
} from "./ep/biscuit.ts";
import { chaisesOver, chaisesPerf, chaisesSit, chaisesStart, chaisesTick, chaisesView, type ChaisesState } from "./ep/chaises.ts";
import type { EpCtx, Fx, OutHow } from "./ep/common.ts";
import { cordeOver, cordePerf, cordeStart, cordeTap, cordeTick, cordeView, type CordeState } from "./ep/corde.ts";
import {
  epervierDash,
  epervierMove,
  epervierOver,
  epervierPerf,
  epervierStart,
  epervierTick,
  epervierView,
  type EpervierState,
} from "./ep/epervier.ts";
import { marelleHop, marelleOver, marellePerf, marelleStart, marelleTick, marelleView, type MarelleState } from "./ep/marelle.ts";
import {
  nenupharsJump,
  nenupharsOver,
  nenupharsPerf,
  nenupharsPick,
  nenupharsStart,
  nenupharsTick,
  nenupharsView,
  type NenupharsState,
} from "./ep/nenuphars.ts";
import {
  polochonsAct,
  polochonsOver,
  polochonsPerf,
  polochonsStart,
  polochonsTick,
  polochonsView,
  type PolAction,
  type PolochonsState,
} from "./ep/polochons.ts";
import { soleilInput, soleilOver, soleilPerf, soleilStart, soleilTick, soleilView, type SoleilState } from "./ep/soleil.ts";

export type EpState =
  SoleilState | BiscuitState | CordeState | NenupharsState | ChaisesState | BillesState | MarelleState | EpervierState | PolochonsState;

export type Phase = "intro" | "reveal" | "play" | "results" | "ff" | "podium" | "over";

export interface Cand {
  id: string;
  /** Un vrai joueur (son siège a le même identifiant) */
  human: boolean;
  level: BotLevel;
  alive: boolean;
  /** L'épreuve où il est sorti (son rang dans le programme), comment, quand */
  outRound: number;
  outHow: OutHow | null;
  outAt: number;
  /** Sa performance à chaque épreuve jouée */
  perf: number[];
  /** Repêché à cette épreuve */
  saved?: number;
}

export interface RoundRecord {
  ep: EpreuveId;
  /** Ceux qui y sont entrés, ceux qui en sont sortis, les repêchés, ceux que le jury n'a pas gardés */
  count: number;
  out: string[];
  saved: string[];
  cut: string[];
  /** Joué en accéléré */
  fast?: boolean;
}

export interface Match {
  cfg: CourConfig;
  rng: number;
  cands: Cand[];
  program: EpreuveId[];
  round: number;
  phase: Phase;
  phaseAt: number;
  until: number;
  /** Ceux qui ont passé la cinématique en cours */
  skips: string[];
  /** Le nombre de survivants voulu à la fin de l'épreuve en cours */
  keep: number;
  ep: EpState | null;
  history: RoundRecord[];
  fx: Fx[];
  fxN: number;
  ranks: Record<string, number> | null;
  winner: string | null;
}

export const INTRO_MS = 12_000;
export const SHORT_INTRO_MS = 4_500;
export const REVEAL_MS = 8_500;
export const SHORT_REVEAL_MS = 4_500;
export const RESULTS_MS = 7_000;
export const FF_MS = 9_000;
export const PODIUM_MS = 15_000;
/** On ne passe pas une cinématique avant ce temps (le temps de voir ce qu'on passe) */
const MIN_SKIP_MS = 1_200;

export interface NewCand {
  id: string;
  human: boolean;
  level: BotLevel;
}

export interface MatchOptions {
  /** Le nombre de survivants voulu, pour une épreuve seule (la campagne, la tournée) */
  keep?: number;
  /** Le programme imposé (les essais) */
  program?: EpreuveId[];
}

/** L'ordre naturel des épreuves : la cour d'abord, les duels et les manches ensuite */
const ORDER: Record<EpreuveId, number> = {
  soleil: 0,
  biscuit: 1,
  corde: 1.4,
  nenuphars: 2,
  billes: 2.3,
  epervier: 2.6,
  chaises: 3,
  marelle: 3,
  polochons: 9,
};

export function buildProgram(cfg: CourConfig, rng: RngHolder): EpreuveId[] {
  if (cfg.only) return [cfg.only];
  const pool = [...cfg.pool];
  const k = Math.min(DUREE_ROUNDS[cfg.duree], pool.length);
  const chosen = shuffle(rng, pool).slice(0, k);
  // Le tournesol ouvre volontiers le bal ; le reste dans l'ordre naturel, un peu bousculé
  const weight = new Map(chosen.map((e) => [e, ORDER[e] + random(rng) * 1.6 - (e === "soleil" ? 2 : 0)]));
  chosen.sort((a, b) => weight.get(a)! - weight.get(b)!);
  // La dernière avant la finale : une épreuve en manches (on en prend une dans la réserve s'il n'y en a pas)
  if (!chosen.some((e) => EPREUVE_INFO[e].elastic)) {
    const spare = pool.filter((e) => EPREUVE_INFO[e].elastic && !chosen.includes(e));
    if (spare.length) chosen[chosen.length - 1] = spare[Math.floor(random(rng) * spare.length)]!;
  }
  const lastElastic = chosen.map((e) => EPREUVE_INFO[e].elastic).lastIndexOf(true);
  if (lastElastic >= 0 && lastElastic !== chosen.length - 1) chosen.push(chosen.splice(lastElastic, 1)[0]!);
  return [...chosen, "polochons"];
}

/** Les survivants voulus après chaque épreuve (avant la finale) pour arriver à deux */
export function keepPlan(n: number, rounds: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < rounds; i++) out.push(Math.max(2, Math.round(2 * (n / 2) ** ((rounds - 1 - i) / rounds))));
  return out;
}

export function createMatch(cfg: CourConfig, cands: NewCand[], seed: number, now: number, opts: MatchOptions = {}): Match {
  const holder = { rng: seed };
  const program = opts.program ?? buildProgram(cfg, holder);
  const m: Match = {
    cfg,
    rng: holder.rng,
    cands: cands.map((c) => ({ ...c, alive: true, outRound: -1, outHow: null, outAt: 0, perf: [] })),
    program,
    round: -1,
    phase: "intro",
    phaseAt: now,
    until: now + (cfg.cinema ? INTRO_MS : SHORT_INTRO_MS),
    skips: [],
    keep: cands.length,
    ep: null,
    history: [],
    fx: [],
    fxN: 0,
    ranks: null,
    winner: null,
  };
  // Une épreuve seule : on en garde à peu près six sur dix, sauf avis contraire
  if (cfg.only) m.keep = Math.max(1, Math.ceil(cands.length * 0.6));
  if (opts.keep) m.keep = opts.keep;
  return m;
}

/** Un candidat, par son identifiant */
const candOf = (m: Match, id: string) => m.cands.find((c) => c.id === id);
export const aliveCands = (m: Match) => m.cands.filter((c) => c.alive);
export const isFinal = (m: Match) => m.program[m.round] === "polochons";
/** L'épreuve qui se joue (ou qui va être révélée) */
export const currentEp = (m: Match): EpreuveId | null => m.program[m.round] ?? null;

export interface Hooks {
  /** Ce candidat est joué par l'ordinateur (un bot, ou un vrai joueur absent) */
  auto: (id: string) => boolean;
  /** Ce vrai joueur est là et joue lui-même (connecté, pas remplacé) */
  live: (id: string) => boolean;
}

function pushFx(m: Match, now: number, k: string, data: Omit<Fx, "n" | "at" | "k"> = {}) {
  m.fx.push({ n: ++m.fxN, at: now, k, ...data });
  if (m.fx.length > 90) m.fx.splice(0, m.fx.length - 90);
}

function ctxFor(m: Match, now: number, dt: number, hooks: Hooks): EpCtx & { rngHolder: RngHolder } {
  const holder = { rng: m.rng };
  const ctx = {
    now,
    dt,
    rng: holder,
    rngHolder: holder,
    auto: (id: string) => {
      const c = candOf(m, id);
      return !c || !c.human || hooks.auto(id);
    },
    level: (id: string) => candOf(m, id)?.level ?? m.cfg.botLevel,
    keep: m.keep,
    eclair: Boolean(m.cfg.eclair),
    out: (id: string, how: OutHow) => {
      const c = candOf(m, id);
      if (!c || !c.alive) return;
      c.alive = false;
      c.outRound = m.round;
      c.outHow = how;
      c.outAt = now;
      pushFx(m, now, "out", { id });
    },
    fx: (k: string, data?: Omit<Fx, "n" | "at" | "k">) => pushFx(m, now, k, data),
  };
  return ctx;
}

function startEp(m: Match, ep: EpreuveId, now: number, ctx: EpCtx, hooks: Hooks): EpState {
  const ids = aliveCands(m).map((c) => c.id);
  switch (ep) {
    case "soleil":
      return soleilStart(ids, now, ctx);
    case "biscuit":
      return biscuitStart(ids, now, ctx);
    case "corde":
      return cordeStart(ids, now, ctx);
    case "nenuphars":
      return nenupharsStart(ids, now, ctx);
    case "chaises":
      return chaisesStart(ids, now, ctx);
    case "billes":
      return billesStart(ids, now, ctx);
    case "marelle":
      return marelleStart(ids, now, ctx);
    case "epervier": {
      // Les vrais joueurs déjà éliminés (et présents) reviennent en éperviers
      const back = m.cands.filter((c) => c.human && !c.alive && hooks.live(c.id)).map((c) => c.id);
      return epervierStart(ids, now, ctx, back);
    }
    case "polochons":
      return polochonsStart(ids.slice(0, 2), now, ctx);
  }
}

function tickEp(s: EpState, ctx: EpCtx, hooks: Hooks) {
  switch (s.kind) {
    case "soleil":
      return soleilTick(s, ctx);
    case "biscuit":
      return biscuitTick(s, ctx);
    case "corde":
      return cordeTick(s, ctx);
    case "nenuphars":
      return nenupharsTick(s, ctx);
    case "chaises":
      return chaisesTick(s, ctx);
    case "billes":
      return billesTick(s, ctx);
    case "marelle":
      return marelleTick(s, ctx);
    case "epervier":
      return epervierTick(s, ctx, hooks.live);
    case "polochons":
      return polochonsTick(s, ctx);
  }
}

export function epOver(s: EpState): boolean {
  switch (s.kind) {
    case "soleil":
      return soleilOver(s);
    case "biscuit":
      return biscuitOver(s);
    case "corde":
      return cordeOver(s);
    case "nenuphars":
      return nenupharsOver(s);
    case "chaises":
      return chaisesOver(s);
    case "billes":
      return billesOver(s);
    case "marelle":
      return marelleOver(s);
    case "epervier":
      return epervierOver(s);
    case "polochons":
      return polochonsOver(s);
  }
}

/** La performance d'un candidat dans l'épreuve (pour départager, repêcher, et les étoiles) */
export function epPerf(s: EpState, i: number): number {
  switch (s.kind) {
    case "soleil":
      return soleilPerf(s, i);
    case "biscuit":
      return biscuitPerf(s, i);
    case "corde":
      return cordePerf(s, i);
    case "nenuphars":
      return nenupharsPerf(s, i);
    case "chaises":
      return chaisesPerf(s, i);
    case "billes":
      return billesPerf(s, i);
    case "marelle":
      return marellePerf(s, i);
    case "epervier":
      return epervierPerf(s, i);
    case "polochons":
      return polochonsPerf(s, i);
  }
}

export function epView(s: EpState, now: number) {
  switch (s.kind) {
    case "soleil":
      return soleilView(s);
    case "biscuit":
      return biscuitView(s);
    case "corde":
      return cordeView(s);
    case "nenuphars":
      return nenupharsView(s, now);
    case "chaises":
      return chaisesView(s);
    case "billes":
      return billesView(s);
    case "marelle":
      return marelleView(s, now);
    case "epervier":
      return epervierView(s);
    case "polochons":
      return polochonsView(s);
  }
}
export type EpView = ReturnType<typeof epView>;

/** Ce que les joueurs envoient pendant une épreuve */
export type EpInput =
  | { k: "run"; on: boolean }
  | { k: "box"; box: number }
  | { k: "trace"; pts: [number, number, number][] }
  | { k: "tap"; at: number }
  | { k: "num"; n: number }
  | { k: "jump"; side: number }
  | { k: "sit"; react: number }
  | { k: "throw"; angle: number; power: number }
  | { k: "hop"; c: number; j: number }
  | { k: "move"; x: number; z: number }
  | { k: "dash" }
  | { k: "pol"; a: PolAction };

/** Un geste d'un joueur pendant l'épreuve ; rend vrai si quelque chose a changé */
export function matchInput(m: Match, id: string, input: EpInput, now: number, hooks: Hooks): boolean {
  const s = m.ep;
  if (!s || m.phase !== "play" || !input || typeof input !== "object") return false;
  const ctx = ctxFor(m, now, 0, hooks);
  const before = m.fxN;
  switch (input.k) {
    case "run":
      if (s.kind === "soleil") soleilInput(s, id, Boolean(input.on));
      break;
    case "box":
      if (s.kind === "biscuit") biscuitChoose(s, id, Number(input.box));
      break;
    case "trace":
      if (s.kind === "biscuit") biscuitTrace(s, id, input.pts, ctx);
      break;
    case "tap":
      if (s.kind === "corde") cordeTap(s, id, Number(input.at), ctx);
      break;
    case "num":
      if (s.kind === "nenuphars") nenupharsPick(s, id, Number(input.n));
      break;
    case "jump":
      if (s.kind === "nenuphars") nenupharsJump(s, id, Number(input.side), ctx);
      break;
    case "sit":
      if (s.kind === "chaises") chaisesSit(s, id, Number(input.react), ctx);
      break;
    case "throw":
      if (s.kind === "billes") billesThrow(s, id, Number(input.angle), Number(input.power), ctx);
      break;
    case "hop":
      if (s.kind === "marelle") marelleHop(s, id, Number(input.c), Number(input.j), ctx);
      break;
    case "move":
      if (s.kind === "epervier") epervierMove(s, id, Number(input.x), Number(input.z));
      break;
    case "dash":
      if (s.kind === "epervier") epervierDash(s, id, ctx);
      break;
    case "pol":
      if (s.kind === "polochons" && ["hh", "hb", "ph", "pb"].includes(input.a)) polochonsAct(s, id, input.a, ctx);
      break;
  }
  m.rng = ctx.rngHolder.rng;
  return m.fxN !== before || input.k !== "trace";
}

/** Un joueur passe la cinématique en cours */
export function skipCinematic(m: Match, id: string) {
  if (m.phase === "play" || m.phase === "over" || m.skips.includes(id)) return false;
  m.skips.push(id);
  return true;
}

function setPhase(m: Match, phase: Phase, now: number, ms: number) {
  m.phase = phase;
  m.phaseAt = now;
  m.until = now + ms;
  m.skips = [];
}

/** La prochaine épreuve qui peut se jouer avec ceux qui restent (on saute celles qui demandent plus de monde) */
function nextPlayable(m: Match, from: number): number {
  const alive = aliveCands(m).length;
  for (let r = from; r < m.program.length; r++) {
    const ep = m.program[r]!;
    if (ep === "polochons" || m.cfg.only) return r;
    // Deux candidats ou moins : directement la finale
    if (alive <= 2) continue;
    if (alive >= EPREUVE_INFO[ep].min) return r;
  }
  return m.program.length - 1;
}

function beginRound(m: Match, r: number, now: number) {
  m.round = r;
  const ep = m.program[r]!;
  const rounds = m.program.filter((e) => e !== "polochons").length;
  if (!m.cfg.only && ep !== "polochons") {
    const plan = keepPlan(m.cands.length, rounds);
    // L'objectif d'ici à la finale, recalculé avec ceux qui restent
    const left = m.program.slice(r).filter((e) => e !== "polochons").length;
    const alive = aliveCands(m).length;
    const want = Math.max(2, Math.round(2 * (alive / 2) ** ((left - 1) / left)));
    m.keep = Math.min(alive - (alive > 2 ? 1 : 0), Math.max(2, Math.round((want + (plan[r] ?? want)) / 2)));
  }
  m.ep = null;
  pushFx(m, now, "revele", { a: r });
  setPhase(m, "reveal", now, m.cfg.cinema ? REVEAL_MS : SHORT_REVEAL_MS);
}

/** Les vrais joueurs encore en lice */
const humansAlive = (m: Match) => m.cands.some((c) => c.alive && c.human);

/** L'épreuve finie : repêchage, jury, et ce qu'on en retient */
function endRound(m: Match, now: number) {
  const s = m.ep!;
  const ids = s.ids;
  ids.forEach((id, i) => candOf(m, id)?.perf.push(epPerf(s, i)));
  const rec: RoundRecord = { ep: s.kind, count: ids.length, out: [], saved: [], cut: [] };
  const perfOf = (id: string) => epPerf(s, ids.indexOf(id));
  if (!m.cfg.only) {
    const alive = () => aliveCands(m);
    // Moins de deux : on repêche les meilleurs éliminés de l'épreuve
    if (alive().length < 2 && s.kind !== "polochons") {
      const outs = ids.filter((id) => !candOf(m, id)!.alive).sort((a, b) => perfOf(b) - perfOf(a));
      for (const id of outs) {
        if (alive().length >= 2) break;
        const c = candOf(m, id)!;
        c.alive = true;
        c.outRound = -1;
        c.outHow = null;
        c.saved = m.round;
        rec.saved.push(id);
        pushFx(m, now, "repeche", { id });
      }
    }
    // Avant la finale : deux finalistes, les meilleurs de l'épreuve
    const next = nextPlayable(m, m.round + 1);
    if (m.program[next] === "polochons" && s.kind !== "polochons" && alive().length > 2) {
      const keep = alive()
        .map((c) => c.id)
        .sort((a, b) => perfOf(b) - perfOf(a))
        .slice(0, 2);
      for (const c of alive()) {
        if (keep.includes(c.id)) continue;
        c.alive = false;
        c.outRound = m.round;
        c.outHow = "jury";
        c.outAt = now;
        rec.cut.push(c.id);
      }
    }
  }
  rec.out = ids.filter((id) => !candOf(m, id)!.alive);
  m.history.push(rec);
  if (s.kind === "polochons") m.winner = s.winner >= 0 ? s.ids[s.winner]! : (aliveCands(m)[0]?.id ?? null);
  pushFx(m, now, "bilan", { a: m.round, b: rec.out.length });
  setPhase(m, "results", now, RESULTS_MS);
}

/** La suite jouée en accéléré, entre bots : chaque épreuve simulée jusqu'au bout */
function fastForward(m: Match, now: number, hooks: Hooks) {
  const offline: Hooks = { auto: () => true, live: () => false };
  let r = nextPlayable(m, m.round + 1);
  while (m.program[r] !== "polochons" && r < m.program.length - 1) {
    beginRound(m, r, now);
    let t = now;
    const ctx0 = ctxFor(m, t, 0.05, offline);
    m.ep = startEp(m, m.program[r]!, t, ctx0, offline);
    m.rng = ctx0.rngHolder.rng;
    for (let k = 0; k < 20 * 600 && !epOver(m.ep); k++) {
      t += 50;
      const ctx = ctxFor(m, t, 0.05, offline);
      tickEp(m.ep, ctx, offline);
      m.rng = ctx.rngHolder.rng;
    }
    // Une épreuve qui ne finit pas (ne devrait pas arriver) : tous ceux qui jouent encore passent
    endRound(m, now);
    m.history[m.history.length - 1]!.fast = true;
    r = nextPlayable(m, m.round + 1);
  }
  void hooks;
  m.ep = null;
  // On garde les effets visibles pour le récapitulatif, pas ceux du détail des épreuves
  m.fx = m.fx.filter((f) => f.k === "bilan" || f.k === "repeche");
  pushFx(m, now, "accelere");
  setPhase(m, "ff", now, FF_MS);
  m.round = r - 1;
}

/** Le classement final : le gagnant, le finaliste, puis les éliminés du plus tard au plus tôt, départagés par l'épreuve */
export function computeRanks(m: Match): Record<string, number> {
  const key = (c: Cand) => {
    if (c.id === m.winner) return [1e9, 0];
    const round = c.alive ? m.program.length : c.outRound;
    return [round, c.perf[c.perf.length - 1] ?? 0];
  };
  const sorted = [...m.cands].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return kb[0]! - ka[0]! || kb[1]! - ka[1]!;
  });
  const ranks: Record<string, number> = {};
  sorted.forEach((c, k) => {
    const prev = sorted[k - 1];
    const same = prev && key(prev)[0] === key(c)[0] && key(prev)[1] === key(c)[1];
    ranks[c.id] = same ? ranks[prev.id]! : k + 1;
  });
  return ranks;
}

function finish(m: Match, now: number) {
  if (!m.winner) {
    // Une épreuve seule : le meilleur survivant
    const alive = aliveCands(m);
    const s = m.ep;
    const best = s ? [...alive].sort((a, b) => epPerf(s, s.ids.indexOf(b.id)) - epPerf(s, s.ids.indexOf(a.id)))[0] : alive[0];
    m.winner = best?.id ?? null;
  }
  m.ranks = computeRanks(m);
  pushFx(m, now, "podium", { id: m.winner ?? undefined });
  setPhase(m, "podium", now, m.cfg.only ? 6_000 : PODIUM_MS);
}

/**
 * Le temps qui passe : la cinématique en cours, l'épreuve. `here` : les vrais joueurs présents (pour savoir si tout le
 * monde a passé la cinématique). Rend vrai si quelque chose a changé.
 */
export function tickMatch(m: Match, now: number, dt: number, hooks: Hooks, here: string[]): boolean {
  if (m.phase === "over") return false;
  const watchers = here.filter((id) => hooks.live(id) || !candOf(m, id));
  const allSkipped = watchers.length > 0 && watchers.every((id) => m.skips.includes(id)) && now - m.phaseAt >= MIN_SKIP_MS;
  if (m.phase !== "play") {
    if (now < m.until && !allSkipped) return false;
    switch (m.phase) {
      case "intro":
        beginRound(m, nextPlayable(m, 0), now);
        return true;
      case "reveal": {
        const ctx = ctxFor(m, now, dt, hooks);
        m.ep = startEp(m, m.program[m.round]!, now, ctx, hooks);
        m.rng = ctx.rngHolder.rng;
        setPhase(m, "play", now, 0);
        pushFx(m, now, "go", { a: m.round });
        return true;
      }
      case "results": {
        if (m.cfg.only || isFinal(m)) {
          finish(m, now);
          return true;
        }
        // Plus aucun vrai joueur en lice : la suite en accéléré (sauf la finale, qu'on regarde)
        if (!humansAlive(m) && m.program[nextPlayable(m, m.round + 1)] !== "polochons") {
          fastForward(m, now, hooks);
          return true;
        }
        beginRound(m, nextPlayable(m, m.round + 1), now);
        return true;
      }
      case "ff":
        beginRound(m, nextPlayable(m, m.round + 1), now);
        return true;
      case "podium":
        m.phase = "over";
        m.phaseAt = now;
        return true;
    }
    return false;
  }
  const s = m.ep;
  if (!s) return false;
  const ctx = ctxFor(m, now, dt, hooks);
  const before = m.fxN;
  tickEp(s, ctx, hooks);
  m.rng = ctx.rngHolder.rng;
  if (epOver(s)) {
    endRound(m, now);
    return true;
  }
  void before;
  return true;
}

/** Ce que voient les écrans (le hasard reste au serveur) */
export function matchView(m: Match, now: number) {
  const { rng: _r, ep, cands, ...rest } = m;
  void _r;
  return {
    ...rest,
    cands: cands.map((c) => ({
      id: c.id,
      human: c.human,
      alive: c.alive,
      outRound: c.outRound,
      outHow: c.outHow,
      outAt: c.outAt,
      ...(c.saved !== undefined ? { saved: c.saved } : {}),
    })),
    ep: ep ? epView(ep, now) : null,
  };
}
export type MatchView = ReturnType<typeof matchView>;
export type CandView = MatchView["cands"][number];

/** Le prochain moment où il se passera quelque chose sans geste de personne (pour l'alarme de garde) */
export function nextWake(m: Match): number | null {
  if (m.phase === "over") return null;
  if (m.phase !== "play") return m.until;
  return null;
}
