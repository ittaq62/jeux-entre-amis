// Une partie de bowling : chacun son tour, frame après frame. Le joueur dont c'est le tour a un temps pour lancer ; le
// serveur joue son lancer (la même physique que les écrans), le montre le temps qu'il faut (la boule, les quilles, un
// ralenti sur un strike, la réaction), puis le compte et passe à la boule ou au joueur suivant. Pendant ce temps, ceux qui
// regardent peuvent parier sur le résultat.
//
// Deux façons de jouer : la partie classique (10, 5 ou 3 frames) et le défi des spares (à chaque manche, tout le monde
// a les mêmes quilles à abattre en une seule boule).

import { RACK, rackOf, type PinSpot } from "./lane.ts";
import { DEFAULT_PHYS, HZ, type PhysConfig } from "./physics.ts";
import { isSalle, readySalles, type SalleId } from "./salles.ts";
import { frameDone, frameScores, freshRack, isSplit, type Rolls } from "./score.ts";
import { cleanThrow, MAX_STEPS, simulateThrow, type ThrowParams } from "./throw.ts";
import { pick, random, shuffle, type RngHolder } from "../../rng.ts";

export type BotLevel = "facile" | "moyen" | "fort";
export type Mode = "classique" | "spares";
export type Pace = "court" | "normal" | "long";

export interface BowlingConfig {
  mode: Mode;
  /** Le nombre de frames (partie classique) ou de manches (défi des spares) */
  frames: number;
  salle: SalleId | "hasard";
  teams: boolean;
  botLevel: BotLevel;
  pace: Pace;
  /** Ceux qui regardent parient sur chaque lancer */
  pronostics: boolean;
  // Les règles folles
  /** Des barrières le long des rigoles */
  bumpers: boolean;
  /** Une boule énorme */
  geante: boolean;
  /** La piste glisse d'un bout à l'autre : plus aucune boule ne courbe */
  glisse: boolean;
  /** La pesanteur de la lune : les quilles s'envolent et retombent lentement */
  lune: boolean;
}

export const DEFAULT_CONFIG: BowlingConfig = {
  mode: "classique",
  frames: 10,
  salle: "hasard",
  teams: false,
  botLevel: "moyen",
  pace: "normal",
  pronostics: true,
  bumpers: false,
  geante: false,
  glisse: false,
  lune: false,
};

export const FRAME_CHOICES = [3, 5, 10] as const;
export const ROUND_CHOICES = [5, 10] as const;
const RULES = ["teams", "pronostics", "bumpers", "geante", "glisse", "lune"] as const;

/** Des réglages valides, à partir de ceux d'avant et de ce qu'on change */
export function mergeConfig(base: BowlingConfig, patch: Partial<BowlingConfig> | null | undefined): BowlingConfig {
  const out: BowlingConfig = { ...DEFAULT_CONFIG, ...base };
  if (!patch || typeof patch !== "object") return out;
  if (patch.mode === "classique" || patch.mode === "spares") out.mode = patch.mode;
  if (typeof patch.frames === "number" && Number.isFinite(patch.frames)) out.frames = Math.round(patch.frames);
  if (patch.salle === "hasard" || isSalle(patch.salle)) out.salle = patch.salle;
  if (patch.botLevel === "facile" || patch.botLevel === "moyen" || patch.botLevel === "fort") out.botLevel = patch.botLevel;
  if (patch.pace === "court" || patch.pace === "normal" || patch.pace === "long") out.pace = patch.pace;
  for (const k of RULES) if (typeof patch[k] === "boolean") out[k] = patch[k];
  const choices: readonly number[] = out.mode === "spares" ? ROUND_CHOICES : FRAME_CHOICES;
  if (!choices.includes(out.frames))
    out.frames = choices.reduce((best, n) => (Math.abs(n - out.frames) < Math.abs(best - out.frames) ? n : best));
  return out;
}

/** La physique de la partie, selon les règles */
export function physOf(cfg: BowlingConfig): PhysConfig {
  const p: PhysConfig = { ...DEFAULT_PHYS, bumpers: cfg.bumpers };
  if (cfg.geante) {
    p.ballR = 0.165;
    p.ballMass = 11;
  }
  if (cfg.glisse) {
    p.oil = 0.012;
    p.dry = 0.012;
    p.deckFriction = 0.12;
  }
  if (cfg.lune) p.g = 1.62;
  return p;
}

/** Le temps pour lancer */
export const AIM_MS: Record<Pace, number> = { court: 20_000, normal: 30_000, long: 60_000 };
/** La présentation de la salle avant la première boule */
export const INTRO_MS = 4000;
/** Le ralenti d'un strike (ce qu'il ajoute au lancer) */
export const SLOWMO_MS = 1800;

export interface BowlingStats {
  throws: number;
  pins: number;
  strikes: number;
  spares: number;
  gutters: number;
  splits: number;
  /** Splits relevés en spare */
  splitsMade: number;
  /** La plus longue série de strikes */
  bestRun: number;
  run: number;
}

export interface BowlingPlayer {
  id: string;
  team: 0 | 1;
  /** Partie classique : les quilles de chaque boule, frame par frame */
  rolls: Rolls;
  /** Les boules qui ont laissé un split : [frame, boule] (la feuille les entoure) */
  splits: [number, number][];
  /** Défi des spares : les points de chaque manche */
  points: number[];
  stats: BowlingStats;
}

/** Un lancer joué : ce que le joueur a envoyé, les quilles avant, ce qui est tombé, et le temps de le montrer */
export interface ThrowRecord {
  /** Son numéro dans la partie */
  n: number;
  id: string;
  frame: number;
  ball: number;
  t: ThrowParams;
  rack: PinSpot[];
  down: number[];
  standing: PinSpot[];
  gutter: boolean;
  steps: number;
  firstHit: number;
  /** Le pas où le résultat est joué (on l'annonce, le lanceur réagit) */
  decided: number;
  /** L'heure du lâcher, et la fin de sa présentation */
  at: number;
  until: number;
  /** Un bot a lancé à sa place (temps écoulé, joueur parti) */
  auto: boolean;
}

/** Les paris : sur un jeu complet, strike, il en reste (1 à 3 quilles), la cata ; sur un spare à faire, spare ou raté */
export type PredPick = "strike" | "reste" | "cata" | "spare" | "rate";

export const PRED_POINTS: Record<PredPick, number> = { strike: 3, reste: 1, cata: 2, spare: 1, rate: 1 };

export interface Seer {
  points: number;
  right: number;
  tries: number;
}

export interface Match {
  cfg: BowlingConfig;
  salle: SalleId;
  players: BowlingPlayer[];
  /** Où on en est : la frame (ou la manche), le joueur dont c'est le tour, sa boule dans la frame */
  frame: number;
  turn: number;
  ball: number;
  /** Les quilles debout pour la boule qui vient */
  rack: PinSpot[];
  phase: "intro" | "aim" | "roll" | "over";
  phaseAt: number;
  /** Intro : sa fin ; tour : la fin du temps pour lancer ; lancer : la fin de sa présentation */
  deadline: number;
  last: ThrowRecord | null;
  throws: number;
  /** Défi des spares : les quilles de chaque manche */
  challenge: number[][] | null;
  /** Les paris sur le lancer qui vient (par siège, ou par spectateur) */
  preds: Record<string, PredPick>;
  /** Les points des devins */
  seers: Record<string, Seer>;
  /** Le résultat du dernier pari de chacun (pour l'annoncer) */
  lastPreds: Record<string, { pick: PredPick; right: boolean; points: number }>;
  rng: number;
  ranks?: number[];
}

const newStats = (): BowlingStats => ({
  throws: 0,
  pins: 0,
  strikes: 0,
  spares: 0,
  gutters: 0,
  splits: 0,
  splitsMade: 0,
  bestRun: 0,
  run: 0,
});

/** Les manches du défi des spares, de plus en plus difficiles */
const CHALLENGE: number[][][] = [
  // Faciles : une quille, ou des quilles qui se tiennent
  [[10], [7], [5], [2], [3], [6], [4], [9], [8], [1, 2, 4], [1, 3, 6], [2, 4, 5], [3, 5, 6]],
  // Moyennes
  [
    [3, 6, 10],
    [2, 4, 7],
    [1, 2, 8],
    [5, 7],
    [5, 10],
    [2, 8],
    [3, 9],
    [6, 10],
    [4, 7],
    [1, 3, 6, 10],
    [2, 4, 7, 8],
  ],
  // Difficiles : les splits
  [
    [4, 6],
    [7, 9],
    [8, 10],
    [6, 7],
    [4, 10],
    [2, 7],
    [3, 10],
    [4, 6, 7, 10],
    [4, 7, 10],
    [6, 7, 10],
    [7, 10],
    [4, 9],
    [6, 8],
  ],
];

function drawChallenge(rounds: number, rng: RngHolder): number[][] {
  const pools = CHALLENGE.map((p) => shuffle(rng, [...p]));
  const out: number[][] = [];
  for (let i = 0; i < rounds; i++) {
    const level = Math.min(2, Math.floor((i * 3) / rounds));
    out.push(pools[level]!.pop() ?? pick(rng, CHALLENGE[level]!));
  }
  return out;
}

export function createMatch(cfg: BowlingConfig, seats: { id: string; team: 0 | 1 }[], seed: number, now: number): Match {
  const rng = { rng: seed };
  const ready = readySalles();
  const salle = cfg.salle !== "hasard" && ready.includes(cfg.salle) ? cfg.salle : pick(rng, ready);
  // En équipes, on alterne les équipes ; sinon l'ordre de la table
  let order = seats;
  if (cfg.teams) {
    const a = seats.filter((s) => s.team === 0),
      b = seats.filter((s) => s.team === 1);
    order = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) order.push(a[i]!);
      if (b[i]) order.push(b[i]!);
    }
  }
  const challenge = cfg.mode === "spares" ? drawChallenge(cfg.frames, rng) : null;
  return {
    cfg,
    salle,
    players: order.map((s) => ({ id: s.id, team: cfg.teams ? s.team : 0, rolls: [], splits: [], points: [], stats: newStats() })),
    frame: 0,
    turn: 0,
    ball: 0,
    rack: challenge ? rackOf(challenge[0]!) : RACK.map((p) => ({ ...p })),
    phase: "intro",
    phaseAt: now,
    deadline: now + INTRO_MS,
    last: null,
    throws: 0,
    challenge,
    preds: {},
    seers: {},
    lastPreds: {},
    rng: rng.rng,
  };
}

/** Le joueur dont c'est le tour (null pendant un lancer ou après la partie) */
export function thrower(m: Match): BowlingPlayer | null {
  return m.phase === "aim" || m.phase === "intro" ? (m.players[m.turn] ?? null) : null;
}

/** Le temps de montrer un lancer : la boule et les quilles, le ralenti d'un strike, la réaction */
export function showMs(rec: {
  rack: readonly PinSpot[];
  down: readonly number[];
  gutter: boolean;
  steps: number;
  decided?: number;
}): number {
  const sim = (Math.min(rec.decided ?? rec.steps, MAX_STEPS) / HZ) * 1000;
  const cleared = rec.down.length === rec.rack.length && rec.rack.length > 0;
  const slow = cleared && rec.rack.length >= 6 ? SLOWMO_MS : 0;
  const react = cleared ? (rec.rack.length === 10 ? 2600 : 2200) : rec.gutter ? 1800 : 1400;
  return Math.round(sim + slow + react);
}

/** L'élan d'un bot (ou d'un joueur qu'un bot remplace) : les écrans le montrent avant que la boule parte */
export const WINDUP_MS = 1400;

/**
 * Un lancer du joueur dont c'est le tour ; renvoie le lancer joué, ou la raison du refus. `windup` : le temps de
 * l'élan avant le lâcher (un joueur a déjà fait le sien avant d'envoyer son lancer ; un bot le fait maintenant).
 */
export function throwBall(m: Match, id: string, raw: Partial<ThrowParams>, now: number, auto = false, windup = 0): ThrowRecord | string {
  if (m.phase !== "aim") return "Ce n'est pas le moment de lancer.";
  const p = m.players[m.turn];
  if (!p || p.id !== id) return "Ce n'est pas ton tour.";
  const t = cleanThrow(raw);
  if (!t) return "Lancer invalide.";
  const rack = m.rack.map((q) => ({ ...q }));
  const out = simulateThrow(rack, t, physOf(m.cfg));
  const rec: ThrowRecord = {
    n: ++m.throws,
    id,
    frame: m.frame,
    ball: m.ball,
    t,
    rack,
    down: out.down,
    standing: out.standing,
    gutter: out.gutter,
    steps: out.steps,
    firstHit: out.firstHit,
    decided: out.decided,
    at: now + windup,
    until: 0,
    auto,
  };
  rec.until = rec.at + showMs(rec);
  m.last = rec;
  m.phase = "roll";
  m.phaseAt = now;
  m.deadline = rec.until;
  return rec;
}

/** Les paris possibles sur le lancer qui vient */
export function predChoices(m: Match): PredPick[] {
  if (m.cfg.mode === "spares" || m.rack.length < 10) return ["spare", "rate"];
  return ["strike", "reste", "cata"];
}

/** Un pari : avant que la boule parte, une fois par lancer (on peut changer d'avis) */
export function predict(m: Match, who: string, choice: PredPick): string | null {
  if (!m.cfg.pronostics) return "Pas de pronostics à cette table.";
  if (m.phase !== "aim" && m.phase !== "intro") return "La boule est déjà partie.";
  if (m.players[m.turn]?.id === who) return "On ne parie pas sur son propre lancer.";
  if (!predChoices(m).includes(choice)) return "Pari invalide.";
  m.preds[who] = choice;
  return null;
}

/** Le bon pari pour ce résultat */
function rightPick(rec: ThrowRecord, mode: Mode): PredPick {
  const left = rec.rack.length - rec.down.length;
  if (mode === "spares" || rec.rack.length < 10) return left === 0 ? "spare" : "rate";
  return left === 0 ? "strike" : left <= 3 ? "reste" : "cata";
}

function settlePreds(m: Match, rec: ThrowRecord) {
  const right = rightPick(rec, m.cfg.mode);
  const splitBonus = rec.rack.length < 10 && isSplit(rec.rack.map((q) => q.n)) ? 2 : 0;
  m.lastPreds = {};
  for (const [who, choice] of Object.entries(m.preds)) {
    const s = (m.seers[who] ??= { points: 0, right: 0, tries: 0 });
    s.tries++;
    const ok = choice === right;
    const points = ok ? PRED_POINTS[choice] + (choice === "spare" ? splitBonus : 0) : 0;
    if (ok) s.right++;
    s.points += points;
    m.lastPreds[who] = { pick: choice, right: ok, points };
  }
  m.preds = {};
}

/** Le lancer a fini d'être montré : on le compte, puis la boule ou le joueur suivant */
function resolve(m: Match, now: number) {
  const rec = m.last!;
  const p = m.players.find((x) => x.id === rec.id)!;
  const knocked = rec.down.length;
  const cleared = knocked === rec.rack.length;
  const st = p.stats;
  st.throws++;
  st.pins += knocked;
  if (rec.gutter && knocked === 0) st.gutters++;
  settlePreds(m, rec);

  let nextPlayer = true;
  if (m.cfg.mode === "spares") {
    p.points[m.frame] = knocked + (cleared ? 5 : 0);
    if (cleared) {
      st.spares++;
      if (isSplit(rec.rack.map((q) => q.n))) st.splitsMade++;
    }
  } else {
    const last = m.frame === m.cfg.frames - 1;
    const fr = (p.rolls[m.frame] ??= []);
    const fresh = freshRack(fr, last);
    fr.push(knocked);
    if (fresh) {
      if (knocked === 10) {
        st.strikes++;
        st.run++;
        if (st.run > st.bestRun) st.bestRun = st.run;
      } else {
        st.run = 0;
        const left = rec.standing.map((q) => q.n);
        if (isSplit(left)) {
          st.splits++;
          p.splits.push([m.frame, fr.length - 1]);
        }
      }
    } else if (cleared) {
      st.spares++;
      if (isSplit(rec.rack.map((q) => q.n))) st.splitsMade++;
    }
    if (!frameDone(fr, last)) {
      nextPlayer = false;
      m.ball++;
      m.rack = freshRack(fr, last) ? RACK.map((q) => ({ ...q })) : rec.standing.map((q) => ({ ...q }));
    }
  }

  if (nextPlayer) {
    m.ball = 0;
    m.turn++;
    if (m.turn >= m.players.length) {
      m.turn = 0;
      m.frame++;
    }
    if (m.frame >= m.cfg.frames) return finish(m, now);
    m.rack = m.challenge ? rackOf(m.challenge[m.frame]!) : RACK.map((q) => ({ ...q }));
  }
  m.phase = "aim";
  m.phaseAt = now;
  m.deadline = now + AIM_MS[m.cfg.pace];
}

/** Le total d'un joueur : son score (partie classique) ou ses points (défi) */
export function totalOf(m: Match, p: BowlingPlayer): number {
  if (m.cfg.mode === "spares") return p.points.reduce((s, x) => s + (x ?? 0), 0);
  const s = frameScores(p.rolls, m.cfg.frames);
  let best = 0;
  for (const x of s) if (x !== null) best = x;
  return best;
}

export function totals(m: Match): number[] {
  return m.players.map((p) => totalOf(m, p));
}

function finish(m: Match, now: number) {
  m.phase = "over";
  m.phaseAt = now;
  m.deadline = now;
  const tot = totals(m);
  if (m.cfg.teams) {
    const team = [0, 0];
    m.players.forEach((p, i) => (team[p.team]! += tot[i]!));
    const rankOfTeam = (t: number) => (team[t]! >= team[1 - t]! ? 1 : 2);
    m.ranks = m.players.map((p) => rankOfTeam(p.team));
  } else {
    m.ranks = tot.map((x) => 1 + tot.filter((y) => y > x).length);
  }
}

/**
 * Le temps passe : la présentation de la salle finit, un lancer a fini d'être montré. Renvoie vrai si quelque chose a
 * changé. Le temps pour lancer écoulé, c'est la salle qui fait lancer un bot à la place du joueur (voir `timedOut`).
 */
export function tickMatch(m: Match, now: number): boolean {
  if (m.phase === "intro" && now >= m.deadline) {
    m.phase = "aim";
    m.phaseAt = now;
    m.deadline = now + AIM_MS[m.cfg.pace];
    return true;
  }
  if (m.phase === "roll" && now >= m.deadline) {
    resolve(m, now);
    return true;
  }
  return false;
}

/** Le temps pour lancer est écoulé : le joueur dont c'est le tour, sinon null */
export function timedOut(m: Match, now: number): BowlingPlayer | null {
  return m.phase === "aim" && now >= m.deadline ? (m.players[m.turn] ?? null) : null;
}

/** Le prochain moment où la partie change d'elle-même */
export function nextEvent(m: Match): number | null {
  return m.phase === "over" ? null : m.deadline;
}

/** Le hasard de la partie (pour les bots), sauvegardé avec elle */
export function matchRandom(m: Match): number {
  const h = { rng: m.rng };
  const r = random(h);
  m.rng = h.rng;
  return r;
}
