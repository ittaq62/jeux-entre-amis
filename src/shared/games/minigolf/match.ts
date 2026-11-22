// Le déroulé d'une partie de minigolf : les trous tirés, puis pour chacun la présentation, le jeu, le tableau des
// scores, et à la fin le classement. Le jeu se joue chacun son tour (par défaut) : un coup chacun, dans l'ordre décidé
// au trou d'avant (le meilleur commence, comme au golf), pendant que les autres regardent sa balle ; ou tous en même
// temps. Le serveur joue chaque coup avec la physique partagée : les appareils refont le même calcul pour l'animer.

import { isBotLevel, type BotLevel } from "./bot.ts";
import { bonusCourse, bonusMods, bonusSpots, lastBubble, type BonusKind } from "./bonus.ts";
import { holeTime, strokeLimit } from "./course.ts";
import { COURSE_IDS, COURSES, courseOf, holeDef, isCourseId, readyCourses, type CourseId, type HoleRef } from "./courses.ts";
import { DEFAULT_PHYS, simulateWorld, STEPS_PER_S, type LostWhy, type PhysOpts, type ShotMods } from "./physics.ts";
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
  /** Le temps laissé pour chaque trou (ou pour chaque coup, chacun son tour) */
  pace: Pace;
  botLevel: BotLevel;
  /** Chacun son tour (vrai, par défaut) ; faux : tout le monde joue en même temps */
  turns: boolean;
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
  turns: true,
};

/** Applique les réglages reçus, en refusant ce qui n'existe pas */
export function mergeConfig(current: MinigolfConfig, patch: Partial<MinigolfConfig>): MinigolfConfig {
  const next = { ...DEFAULT_CONFIG, ...current };
  if (patch.course === "hasard" || patch.course === "melange" || isCourseId(patch.course)) next.course = patch.course;
  if ((HOLE_CHOICES as readonly number[]).includes(patch.holes as number)) next.holes = patch.holes!;
  for (const k of ["mirror", "lune", "glace", "bonus", "teams", "turns"] as const) if (typeof patch[k] === "boolean") next[k] = patch[k];
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
/** Chacun son tour : le temps pour jouer son coup (au rythme normal) */
export const TURN_MS = 30_000;
/** Chacun son tour : une fois la balle arrêtée, le petit moment avant le joueur suivant */
export const SETTLE_MS = 900;

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
  /** Chacun son tour : le temps est écoulé sans qu'il tire (le coup compte, la balle ne bouge pas) */
  skip?: true;
  mods?: ShotMods;
  /** Le pouvoir gagné en traversant une bulle pendant ce coup (règle des bulles bonus) */
  got?: BonusKind;
  /**
   * Chacun son tour : les balles des autres que ce coup a poussées, dans l'ordre où la physique les a reçues (de quoi
   * rejouer le coup à l'identique), d'où elles partent, où elles finissent, et quand
   */
  hits?: GolfHit[];
}

/** Une balle poussée par le coup d'un autre */
export interface GolfHit {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  /** Arrêtée là, poussée dans le trou (elle compte : son joueur a fini le trou), ou perdue (elle revient d'où elle était) */
  out: "rest" | "in" | "lost";
  end: number;
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
  /** Les bulles bonus déjà prises sur ce trou (un bit par bulle) */
  picked: number;
  /** Le pouvoir gardé pour son prochain coup */
  power: BonusKind | null;
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
  /** Chacun son tour : l'ordre de jeu sur ce trou (des places dans `players`) */
  order: number[];
  /** Celui qui joue (sa place dans `players`), ou -1 (personne : avant le jeu, ou tous en même temps) */
  turn: number;
  /** Son tour a commencé à cette heure ; s'il n'a pas tiré à `turnEnd`, le coup compte quand même */
  turnAt: number;
  turnEnd: number;
  /** Il a tiré pendant ce tour : on attend que sa balle s'arrête pour passer au suivant */
  turnShot: boolean;
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
      picked: 0,
      power: null,
    })),
    ranks: null,
    rng: holder.rng,
    order: seats.map((_, i) => i),
    turn: -1,
    turnAt: now,
    turnEnd: now,
    turnShot: false,
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

/** Chacun son tour : le temps pour un coup, selon le rythme choisi */
export function turnDuration(m: Match): number {
  return Math.round(TURN_MS * PACE_FACTOR[m.cfg.pace]);
}

/**
 * L'ordre de jeu du trou `index` : au premier, celui des places ; ensuite, le meilleur score du trou d'avant commence,
 * puis les suivants (à égalité, l'ordre d'avant)
 */
export function holeOrder(m: Match, index: number): number[] {
  if (index === 0) return m.players.map((_, i) => i);
  // (une partie gardée d'avant le jeu chacun son tour n'a pas d'ordre)
  const before = m.order?.length === m.players.length ? m.order : m.players.map((_, i) => i);
  const score = (i: number) => m.players[i]!.scores[index - 1] ?? 99;
  return [...before].sort((a, b) => score(a) - score(b) || before.indexOf(a) - before.indexOf(b));
}

/** Commence le trou `index` (présentation, balles au départ) */
export function startHole(m: Match, index: number, now: number) {
  m.order = holeOrder(m, index);
  m.hole = index;
  m.phase = "intro";
  m.phaseAt = now;
  m.holeStart = now + INTRO_MS;
  // Chacun son tour : pas de temps pour le trou entier (chaque coup a le sien), juste une limite de sûreté
  m.deadline = m.holeStart + (m.cfg.turns ? 3_600_000 : holeDuration(m));
  m.hurry = false;
  m.turn = -1;
  m.turnShot = false;
  const c = courseOf(currentRef(m));
  for (const p of m.players) {
    p.ball = [c.tee.x, c.tee.y, c.tee.z];
    p.restAt = 0;
    p.cur = 0;
    p.done = false;
    p.doneAt = 0;
    p.shot = null;
    p.picked = 0;
    p.power = null;
  }
}

/** Le pouvoir que ce joueur emporte dans son prochain coup (règle des bulles bonus) */
export function powerOf(m: Match, p: GolfPlayer): ShotMods | undefined {
  return m.cfg.bonus ? bonusMods(p.power) : undefined;
}

/**
 * Les balles des autres sur le parcours, que ce coup peut heurter : chacun son tour, celles des joueurs qui ont déjà
 * joué sur ce trou et n'ont pas fini (les autres attendent dans leur poche) ; tous en même temps, aucune (les balles se
 * traversent, sinon chacun dérangerait le coup des autres en plein vol)
 */
export function ballsInPlay(m: Match, id: string): GolfPlayer[] {
  if (!m.cfg.turns) return [];
  return m.players.filter((q) => q.id !== id && !q.done && q.cur > 0);
}

/** Un joueur frappe : le coup joué jusqu'au bout, ou pourquoi il est refusé */
export function shoot(m: Match, id: string, angle: number, power: number, at: number, now: number): GolfShot | string {
  if (m.phase !== "play") return m.phase === "intro" ? "Le trou n'a pas encore commencé." : "Le trou est fini.";
  const p = m.players.find((x) => x.id === id);
  if (!p) return "Tu ne joues pas cette partie.";
  if (p.done) return "Tu as fini ce trou.";
  if (m.cfg.turns && (m.turn < 0 || m.players[m.turn] !== p)) return "Ce n'est pas ton tour.";
  if (m.cfg.turns && m.turnShot) return "Tu as déjà joué ce coup.";
  if (!Number.isFinite(angle) || !Number.isFinite(power)) return "Coup invalide.";
  const nowT = nowTick(m, now);
  if (nowT < p.restAt) return "Ta balle roule encore.";
  const tick = Number.isFinite(at) ? Math.max(p.restAt, nowT - MAX_LAG_TICKS, Math.min(nowT, Math.round(at))) : nowT;
  const ref = currentRef(m);
  const c = courseOf(ref);
  const pw = Math.max(0, Math.min(1, power));
  const from = { x: p.ball[0], y: p.ball[1], z: p.ball[2] };
  // Le pouvoir gardé part avec ce coup, et s'use
  const mods = powerOf(m, p);
  if (m.cfg.bonus) p.power = null;
  const others = ballsInPlay(m, p.id);
  const world = simulateWorld(
    m.cfg.bonus ? bonusCourse(ref) : c,
    from,
    angle,
    pw,
    tick,
    physOf(m.cfg, ref, mods),
    others.map((q) => ({ x: q.ball[0], y: q.ball[1], z: q.ball[2] })),
    physOf(m.cfg, ref),
  );
  const r = world.shot;
  p.cur += r.outcome === "lost" ? 2 : 1;
  if (r.outcome === "lost") p.stats.lost++;
  else p.ball = [r.x, r.y, r.z];
  // Les balles poussées : là où elles s'arrêtent ; dans le trou, leur joueur a fini (sans coup de plus) ; perdues, elles
  // reviennent d'où elles étaient, sans pénalité (ce n'est pas leur faute)
  const hits: GolfHit[] = [];
  let end = r.end;
  world.others.forEach((o, i) => {
    if (!o.moved) return;
    const q = others[i]!;
    const was: [number, number, number] = [...q.ball];
    hits.push({ id: q.id, from: was, to: o.outcome === "lost" ? was : [o.x, o.y, o.z], out: o.outcome, end: o.end });
    if (o.outcome === "rest") q.ball = [o.x, o.y, o.z];
    q.restAt = Math.max(q.restAt, o.end);
    if (o.outcome === "in") {
      q.ball = [o.x, o.y, o.z];
      finishPlayer(q, m.hole, q.cur, o.end);
    }
    end = Math.max(end, o.end);
  });
  // Le tour ne passe qu'une fois tout arrêté
  p.restAt = end;
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
    ...(hits.length ? { hits } : {}),
  };
  // Une bulle traversée pour la première fois : son pouvoir, pour le coup d'après
  if (m.cfg.bonus && r.outcome !== "in") {
    const fresh = r.items & ~p.picked;
    p.picked |= r.items;
    const kind = bonusSpots(ref)[lastBubble(fresh)]?.kind;
    if (kind) {
      p.power = kind;
      shot.got = kind;
    }
  }
  p.shot = shot;
  if (m.cfg.turns) m.turnShot = true;
  const limit = strokeLimit(c.def.par);
  if (r.outcome === "in") finishPlayer(p, m.hole, p.cur, r.end);
  else if (p.cur >= limit) finishPlayer(p, m.hole, limit + 1, r.end);
  return shot;
}

/** Chacun son tour : le joueur qui doit jouer (null : personne pour l'instant) */
export function activePlayer(m: Match): GolfPlayer | null {
  return m.cfg.turns && m.turn >= 0 ? (m.players[m.turn] ?? null) : null;
}

/** Chacun son tour : donne la main au joueur `index` */
function beginTurn(m: Match, index: number, now: number) {
  m.turn = index;
  m.turnAt = now;
  m.turnEnd = now + turnDuration(m);
  m.turnShot = false;
}

/** Chacun son tour : le suivant dans l'ordre qui n'a pas fini (en partant après `from`), ou -1 */
function nextInOrder(m: Match, from: number): number {
  const n = m.order.length;
  const at = m.order.indexOf(from);
  for (let k = 1; k <= n; k++) {
    const i = m.order[(at + k + n) % n]!;
    if (!m.players[i]!.done) return i;
  }
  return -1;
}

/** Chacun son tour : le temps est écoulé sans qu'il tire ; le coup compte, sa balle reste où elle est */
function missTurn(m: Match, p: GolfPlayer, now: number) {
  const t = Math.max(p.restAt, nowTick(m, now));
  p.cur += 1;
  p.restAt = t;
  p.shot = { a: 0, p: 0, at: t, from: [...p.ball], end: t, out: "rest", to: [...p.ball], lost: null, n: p.cur, skip: true };
  m.turnShot = true;
  const limit = strokeLimit(holeDef(currentRef(m)).par);
  if (p.cur >= limit) finishPlayer(p, m.hole, limit + 1, t);
}

function finishPlayer(p: GolfPlayer, hole: number, score: number, at: number) {
  p.done = true;
  p.doneAt = at;
  p.scores[hole] = score;
}

/** Ceux qui peuvent jouer maintenant (leur balle est arrêtée, ils n'ont pas fini ; chacun son tour : celui dont c'est le tour) */
export function readyToShoot(m: Match, now: number): GolfPlayer[] {
  if (m.phase !== "play") return [];
  const t = nowTick(m, now);
  if (m.cfg.turns) {
    const p = activePlayer(m);
    return p && !m.turnShot && !p.done && t >= p.restAt ? [p] : [];
  }
  return m.players.filter((p) => !p.done && t >= p.restAt);
}

/** Fait avancer la partie à cette heure ; vrai si quelque chose a changé */
export function tickMatch(m: Match, now: number): boolean {
  switch (m.phase) {
    case "intro":
      if (now < m.holeStart) return false;
      m.phase = "play";
      m.phaseAt = now;
      if (m.cfg.turns) beginTurn(m, m.order.find((i) => !m.players[i]!.done) ?? -1, now);
      return true;
    case "play": {
      const t = nowTick(m, now);
      const n = m.players.length;
      let changed = false;
      if (m.cfg.turns) {
        // Personne n'a la main alors qu'il reste des joueurs (ne devrait pas arriver) : au suivant
        if (!activePlayer(m) && !m.players.every((q) => q.done)) {
          beginTurn(m, nextInOrder(m, -1), now);
          changed = true;
        }
        const p = activePlayer(m);
        if (p && !m.turnShot && !p.done && now >= m.turnEnd) {
          missTurn(m, p, now);
          changed = true;
        }
        // Sa balle est arrêtée (ou il a fini) : un instant, puis le suivant
        if (p && m.turnShot && t >= p.restAt + Math.round((SETTLE_MS * STEPS_PER_S) / 1000)) {
          const next = nextInOrder(m, m.turn);
          if (next >= 0) beginTurn(m, next, now);
          else m.turn = -1;
          changed = true;
        }
        const last = Math.max(...m.players.map((q) => q.doneAt));
        if (m.players.every((q) => q.done) && t >= last + Math.round((AFTER_DONE_MS * STEPS_PER_S) / 1000)) {
          endHole(m, now);
          return true;
        }
        return changed;
      }
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
  m.turn = -1;
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
    case "play": {
      if (!m.cfg.turns) return m.deadline;
      const p = activePlayer(m);
      if (!p) return m.phaseAt + 1000;
      if (!m.turnShot) return m.turnEnd;
      return m.holeStart + Math.ceil((p.restAt * 1000) / STEPS_PER_S + SETTLE_MS + AFTER_DONE_MS);
    }
    case "scores":
      return m.phaseAt + SCORES_MS;
    case "over":
      return null;
  }
}
