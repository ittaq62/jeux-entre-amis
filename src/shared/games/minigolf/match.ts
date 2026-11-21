// Le déroulé d'une partie de minigolf : les trous tirés, puis pour chacun la présentation, le jeu (tout le monde en
// même temps, chacun sa balle), le tableau des scores, et à la fin le classement. Le serveur joue chaque coup avec la
// physique partagée : les appareils refont le même calcul pour l'animer.

import { isBotLevel, type BotLevel } from "./bot.ts";
import { holeTime, strokeLimit } from "./course.ts";
import { COURSE_IDS, COURSES, courseOf, holeDef, isCourseId, readyCourses, type CourseId, type HoleRef } from "./courses.ts";
import { DEFAULT_PHYS, simulateShot, STEPS_PER_S, type LostWhy, type PhysOpts, type ShotMods } from "./physics.ts";
import { random, shuffle, type RngHolder } from "../../rng.ts";

export type Pace = "court" | "normal" | "long";
export const HOLE_CHOICES = [3, 6, 9, 18] as const;
export const PACE_FACTOR: Record<Pace, number> = { court: 0.7, normal: 1, long: 1.5 };

export interface MinigolfConfig {
  /** Un parcours, un au hasard, ou des trous de tous les parcours */
  course: CourseId | "hasard" | "melange";
  holes: number;
  /** Les trous à l'envers (gauche et droite échangées) */
  mirror: boolean;
  /** Pesanteur faible partout */
  lune: boolean;
  /** Tout glisse */
  glace: boolean;
  /** Les bulles de bonus */
  bonus: boolean;
  /** Deux équipes : sur chaque trou, la meilleure balle de l'équipe compte */
  teams: boolean;
  /** Le temps laissé pour chaque trou */
  pace: Pace;
  botLevel: BotLevel;
}

export const DEFAULT_CONFIG: MinigolfConfig = {
  course: "hasard",
  holes: 9,
  mirror: false,
  lune: false,
  glace: false,
  bonus: false,
  teams: false,
  pace: "normal",
  botLevel: "moyen",
};

/** Applique les réglages reçus, en refusant ce qui n'existe pas */
export function mergeConfig(current: MinigolfConfig, patch: Partial<MinigolfConfig>): MinigolfConfig {
  const next = { ...DEFAULT_CONFIG, ...current };
  if (patch.course === "hasard" || patch.course === "melange" || isCourseId(patch.course)) next.course = patch.course;
  if ((HOLE_CHOICES as readonly number[]).includes(patch.holes as number)) next.holes = patch.holes!;
  for (const k of ["mirror", "lune", "glace", "bonus", "teams"] as const) if (typeof patch[k] === "boolean") next[k] = patch[k];
  if (patch.pace === "court" || patch.pace === "normal" || patch.pace === "long") next.pace = patch.pace;
  if (isBotLevel(patch.botLevel)) next.botLevel = patch.botLevel;
  return next;
}

/** La présentation du trou, le temps que le survol se fasse */
export const INTRO_MS = 3500;
/** Le tableau des scores entre deux trous */
export const SCORES_MS = 9000;
/** Quand la moitié a fini : le temps laissé aux autres */
export const HURRY_MS = 20_000;
/** Le dernier arrivé dans le trou : on le voit tomber avant de passer aux scores */
const AFTER_DONE_MS = 1600;
/** Un coup peut partir un peu avant que le serveur ne le reçoive (le temps du voyage), pas plus */
export const MAX_LAG_TICKS = Math.round(0.35 * STEPS_PER_S);

export interface GolfShot {
  a: number;
  p: number;
  /** Le pas du trou où il part */
  at: number;
  from: [number, number, number];
  /** Le pas où la balle s'arrête */
  end: number;
  out: "rest" | "in" | "lost";
  to: [number, number, number];
  lost: LostWhy | null;
  /** Ses coups sur ce trou après celui-ci (pénalité comprise) */
  n: number;
  mods?: ShotMods;
}

export interface GolfStats {
  strokes: number;
  holes: number;
  /** Trous en un */
  aces: number;
  /** Trous sous le par */
  under: number;
  /** Balles perdues (eau, lave, hors limites) */
  lost: number;
  /** Son meilleur trou, par rapport au par */
  best: number;
}

export interface GolfPlayer {
  id: string;
  team: 0 | 1;
  ball: [number, number, number];
  /** Le pas où sa balle sera arrêtée (il peut rejouer à partir de là) */
  restAt: number;
  /** Ses coups sur ce trou */
  cur: number;
  done: boolean;
  /** Le pas où l'on voit qu'il a fini (la balle tombe dans le trou) */
  doneAt: number;
  /** Ses coups sur chaque trou (null : pas encore joué) */
  scores: (number | null)[];
  shot: GolfShot | null;
  stats: GolfStats;
}

export type Phase = "intro" | "play" | "scores" | "over";

export interface Match {
  cfg: MinigolfConfig;
  holes: HoleRef[];
  hole: number;
  phase: Phase;
  phaseAt: number;
  /** L'heure (serveur) du pas 0 du trou : le jeu commence là */
  holeStart: number;
  deadline: number;
  hurry: boolean;
  players: GolfPlayer[];
  /** À la fin : la place de chacun */
  ranks: number[] | null;
  rng: number;
}

/** Les trous de la partie */
export function drawHoles(cfg: MinigolfConfig, rng: RngHolder): HoleRef[] {
  const ready = readyCourses();
  if (ready.length === 0) throw new Error("Aucun parcours prêt");
  const any = (except?: CourseId) => {
    const pool = ready.filter((c) => c !== except);
    const list = pool.length > 0 ? pool : ready;
    return list[Math.floor(random(rng) * list.length)]!;
  };
  const m = cfg.mirror;
  if (cfg.course === "melange") {
    const all = ready.flatMap((c) => COURSES[c].holes.map((_, i) => ({ c, i, m })));
    const picked = shuffle(rng, all).slice(0, cfg.holes);
    // Dans l'ordre des parcours, puis des trous : on visite un thème après l'autre
    return picked.sort((a, b) => COURSE_IDS.indexOf(a.c) - COURSE_IDS.indexOf(b.c) || a.i - b.i);
  }
  const first = cfg.course !== "hasard" && ready.includes(cfg.course) ? cfg.course : any();
  const nine = (c: CourseId, mirror: boolean) => COURSES[c].holes.map((_, i) => ({ c, i, m: mirror }));
  if (cfg.holes >= 18) {
    const second = ready.length > 1 ? any(first) : first;
    // Un seul parcours prêt : le retour se joue à l'envers
    return [...nine(first, m), ...nine(second, second === first ? !m : m)];
  }
  if (cfg.holes >= 9) return nine(first, m);
  const idx = shuffle(rng, [...Array(9).keys()])
    .slice(0, cfg.holes)
    .sort((a, b) => a - b);
  return idx.map((i) => ({ c: first, i, m }));
}

export function createMatch(cfg: MinigolfConfig, seats: { id: string; team: 0 | 1 }[], seed: number, now: number): Match {
  const holder = { rng: seed >>> 0 };
  const holes = drawHoles(cfg, holder);
  const m: Match = {
    cfg,
    holes,
    hole: 0,
    phase: "intro",
    phaseAt: now,
    holeStart: now,
    deadline: now,
    hurry: false,
    players: seats.map((s) => ({
      id: s.id,
      team: s.team,
      ball: [0, 0, 0],
      restAt: 0,
      cur: 0,
      done: false,
      doneAt: 0,
      scores: holes.map(() => null),
      shot: null,
      stats: { strokes: 0, holes: 0, aces: 0, under: 0, lost: 0, best: 99 },
    })),
    ranks: null,
    rng: holder.rng,
  };
  startHole(m, 0, now);
  return m;
}

export function currentRef(m: Match): HoleRef {
  return m.holes[m.hole]!;
}

/** La physique de ce trou avec les règles de la table (pesanteur de la lune, glace) */
export function physOf(cfg: MinigolfConfig, ref: HoleRef, mods?: ShotMods): PhysOpts {
  const g = COURSES[ref.c].g * (cfg.lune ? 0.4 : 1);
  return { ...DEFAULT_PHYS, g, roll: cfg.glace ? 0.3 : 1, mods };
}

/** Le pas du trou à cette heure du serveur */
export function nowTick(m: Match, now: number): number {
  return Math.floor(((now - m.holeStart) * STEPS_PER_S) / 1000);
}

/** La durée du trou en cours (ms) */
export function holeDuration(m: Match): number {
  return Math.round(holeTime(holeDef(currentRef(m))) * PACE_FACTOR[m.cfg.pace] * 1000);
}

/** Commence le trou `index` (présentation, balles au départ) */
export function startHole(m: Match, index: number, now: number) {
  m.hole = index;
  m.phase = "intro";
  m.phaseAt = now;
  m.holeStart = now + INTRO_MS;
  m.deadline = m.holeStart + holeDuration(m);
  m.hurry = false;
  const c = courseOf(currentRef(m));
  for (const p of m.players) {
    p.ball = [c.tee.x, c.tee.y, c.tee.z];
    p.restAt = 0;
    p.cur = 0;
    p.done = false;
    p.doneAt = 0;
    p.shot = null;
  }
}

/** Un joueur frappe : le coup joué jusqu'au bout, ou pourquoi il est refusé */
export function shoot(m: Match, id: string, angle: number, power: number, at: number, now: number, mods?: ShotMods): GolfShot | string {
  if (m.phase !== "play") return m.phase === "intro" ? "Le trou n'a pas encore commencé." : "Le trou est fini.";
  const p = m.players.find((x) => x.id === id);
  if (!p) return "Tu ne joues pas cette partie.";
  if (p.done) return "Tu as fini ce trou.";
  if (!Number.isFinite(angle) || !Number.isFinite(power)) return "Coup invalide.";
  const nowT = nowTick(m, now);
  if (nowT < p.restAt) return "Ta balle roule encore.";
  const tick = Number.isFinite(at) ? Math.max(p.restAt, nowT - MAX_LAG_TICKS, Math.min(nowT, Math.round(at))) : nowT;
  const ref = currentRef(m);
  const c = courseOf(ref);
  const pw = Math.max(0, Math.min(1, power));
  const from = { x: p.ball[0], y: p.ball[1], z: p.ball[2] };
  const r = simulateShot(c, from, angle, pw, tick, physOf(m.cfg, ref, mods));
  p.cur += r.outcome === "lost" ? 2 : 1;
  if (r.outcome === "lost") p.stats.lost++;
  else p.ball = [r.x, r.y, r.z];
  p.restAt = r.end;
  const shot: GolfShot = {
    a: angle,
    p: pw,
    at: tick,
    from: [from.x, from.y, from.z],
    end: r.end,
    out: r.outcome,
    to: r.outcome === "lost" ? [from.x, from.y, from.z] : [r.x, r.y, r.z],
    lost: r.lost,
    n: p.cur,
    ...(mods ? { mods } : {}),
  };
  p.shot = shot;
  const limit = strokeLimit(c.def.par);
  if (r.outcome === "in") finishPlayer(p, m.hole, p.cur, r.end);
  else if (p.cur >= limit) finishPlayer(p, m.hole, limit + 1, r.end);
  return shot;
}

function finishPlayer(p: GolfPlayer, hole: number, score: number, at: number) {
  p.done = true;
  p.doneAt = at;
  p.scores[hole] = score;
}

/** Ceux qui peuvent jouer maintenant (leur balle est arrêtée, ils n'ont pas fini) */
export function readyToShoot(m: Match, now: number): GolfPlayer[] {
  if (m.phase !== "play") return [];
  const t = nowTick(m, now);
  return m.players.filter((p) => !p.done && t >= p.restAt);
}

/** Fait avancer la partie à cette heure ; vrai si quelque chose a changé */
export function tickMatch(m: Match, now: number): boolean {
  switch (m.phase) {
    case "intro":
      if (now < m.holeStart) return false;
      m.phase = "play";
      m.phaseAt = now;
      return true;
    case "play": {
      const t = nowTick(m, now);
      const n = m.players.length;
      let changed = false;
      const seen = m.players.filter((p) => p.done && p.doneAt <= t).length;
      if (!m.hurry && n > 1 && seen >= Math.ceil(n / 2) && seen < n) {
        m.hurry = true;
        m.deadline = Math.min(m.deadline, now + HURRY_MS);
        changed = true;
      }
      if (now >= m.deadline) {
        // Le temps est écoulé : ceux qui ne sont pas dans le trou prennent la limite + 1
        const limit = strokeLimit(holeDef(currentRef(m)).par);
        for (const p of m.players)
          if (!p.done) {
            finishPlayer(p, m.hole, limit + 1, t);
            changed = true;
          }
      }
      const last = Math.max(...m.players.map((p) => p.doneAt));
      if (m.players.every((p) => p.done) && t >= last + Math.round((AFTER_DONE_MS * STEPS_PER_S) / 1000)) {
        endHole(m, now);
        return true;
      }
      return changed;
    }
    case "scores":
      if (now < m.phaseAt + SCORES_MS) return false;
      if (m.hole < m.holes.length - 1) startHole(m, m.hole + 1, now);
      else finish(m, now);
      return true;
    case "over":
      return false;
  }
}

function endHole(m: Match, now: number) {
  const par = holeDef(currentRef(m)).par;
  for (const p of m.players) {
    const s = p.scores[m.hole] ?? strokeLimit(par) + 1;
    p.scores[m.hole] = s;
    p.stats.strokes += s;
    p.stats.holes += 1;
    if (s === 1) p.stats.aces += 1;
    if (s < par) p.stats.under += 1;
    p.stats.best = Math.min(p.stats.best, s - par);
  }
  m.phase = "scores";
  m.phaseAt = now;
}

/** Le score d'un joueur, ou de son équipe (la meilleure balle à chaque trou) */
export function totals(m: Match): number[] {
  if (!m.cfg.teams) return m.players.map((p) => p.scores.reduce<number>((s, x) => s + (x ?? 0), 0));
  const team = [0, 1].map((t) =>
    m.holes.reduce((sum, _, h) => {
      const list = m.players.filter((p) => p.team === t && p.scores[h] !== null).map((p) => p.scores[h]!);
      return sum + (list.length > 0 ? Math.min(...list) : 0);
    }, 0),
  );
  return m.players.map((p) => team[p.team]!);
}

/** Les places : le moins de coups devant ; à égalité, le plus de trous en un, puis de trous sous le par */
export function rankPlayers(m: Match): number[] {
  const tot = totals(m);
  const key = (i: number) => {
    const p = m.players[i]!;
    if (!m.cfg.teams) return [tot[i]!, -p.stats.aces, -p.stats.under];
    const mates = m.players.filter((q) => q.team === p.team);
    return [tot[i]!, -mates.reduce((s, q) => s + q.stats.aces, 0), -mates.reduce((s, q) => s + q.stats.under, 0)];
  };
  const cmp = (a: number, b: number) => {
    const ka = key(a);
    const kb = key(b);
    for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k]! - kb[k]!;
    return 0;
  };
  return m.players.map((_, i) => 1 + m.players.filter((__, j) => cmp(j, i) < 0).length);
}

function finish(m: Match, now: number) {
  m.phase = "over";
  m.phaseAt = now;
  m.ranks = rankPlayers(m);
}

/** Le prochain moment où la partie change d'elle-même (pour l'alarme du serveur) */
export function nextEvent(m: Match): number | null {
  switch (m.phase) {
    case "intro":
      return m.holeStart;
    case "play":
      return m.deadline;
    case "scores":
      return m.phaseAt + SCORES_MS;
    case "over":
      return null;
  }
}
