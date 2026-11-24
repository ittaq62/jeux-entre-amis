// Une partie de billard : chacun son tour à la table. Le joueur dont c'est le tour a un temps pour jouer ; le serveur
// joue son coup (la même physique que les écrans), le montre le temps qu'il faut (les billes, un ralenti sur un beau
// coup), puis applique les règles : il rejoue s'il a rentré une bonne bille (ou marqué un point à la carambole), sinon
// la main passe. Une partie se joue en manches (pleines et rayées, la bille 9 : les premiers à N manches gagnées), aux
// vies (le Killer) ou aux points (la carambole).
//
// Les camps : en duel, chacun le sien ; en équipes, deux camps où l'on joue à tour de rôle ; à la bille 9 et au Killer
// sans équipes, chacun pour soi, dans l'ordre de la table.

import { pick, random, type RngHolder } from "../../rng.ts";
import { rack8, rack9, rackCarom, rackKiller, respot } from "./racks.ts";
import { CAROM_RED, CAROM_WHITE, CAROM_YELLOW, groupOf, judge, otherGroup, type Group, type Outcome, type Variant } from "./rules.ts";
import { isSalle, readySalles, type SalleId } from "./salles.ts";
import { cleanShot, rigOf, simulateShot, type BallSpot, type Rig, type ShotParams } from "./shot.ts";
import type { Table, TableKind } from "./table.ts";

export type BotLevel = "facile" | "moyen" | "fort";
export type Pace = "court" | "normal" | "long";
/** L'aide à la visée : la ligne jusqu'à la bille visée et la direction qu'elle prendra (longue), juste la bille fantôme (courte), rien */
export type Aide = "longue" | "courte" | "aucune";

export interface BillardConfig {
  variant: Variant;
  /** Pleines et rayées, la bille 9 : le nombre de manches à gagner */
  races: number;
  /** Le Killer : les vies de chacun */
  lives: number;
  /** La carambole : les points à atteindre, les bandes qu'il faut avant la seconde bille, les reprises au plus */
  points: number;
  bandes: number;
  innings: number;
  salle: SalleId | "hasard";
  teams: boolean;
  botLevel: BotLevel;
  pace: Pace;
  aide: Aide;
  // Les règles folles
  /** De grandes poches */
  larges: boolean;
  /** Un tapis qui glisse : les billes roulent deux fois plus loin */
  glisse: boolean;
  /** Des bandes qui rebondissent comme des ressorts */
  rebonds: boolean;
}

export const DEFAULT_CONFIG: BillardConfig = {
  variant: "huit",
  races: 1,
  lives: 3,
  points: 8,
  bandes: 0,
  innings: 20,
  salle: "hasard",
  teams: false,
  botLevel: "moyen",
  pace: "normal",
  aide: "longue",
  larges: false,
  glisse: false,
  rebonds: false,
};

export const RACE_CHOICES = [1, 2, 3, 5] as const;
export const LIVES_CHOICES = [2, 3, 5] as const;
export const POINTS_CHOICES = [5, 8, 12, 20] as const;
export const BANDES_CHOICES = [0, 1, 3] as const;
export const INNINGS_CHOICES = [10, 20, 40] as const;
const RULES = ["teams", "larges", "glisse", "rebonds"] as const;
const VARIANTS: readonly Variant[] = ["huit", "neuf", "killer", "carambole"];

export const VARIANT_NAMES: Record<Variant, string> = {
  huit: "Pleines et rayées",
  neuf: "La bille 9",
  killer: "Le Killer",
  carambole: "Trois billes",
};

/** Le nombre de joueurs possible dans chaque jeu */
export const VARIANT_SEATS: Record<Variant, { min: number; max: number }> = {
  huit: { min: 2, max: 8 },
  neuf: { min: 2, max: 8 },
  killer: { min: 2, max: 8 },
  carambole: { min: 2, max: 8 },
};

const nearest = (choices: readonly number[], v: number) => choices.reduce((best, n) => (Math.abs(n - v) < Math.abs(best - v) ? n : best));

/** Des réglages valides, à partir de ceux d'avant et de ce qu'on change */
export function mergeConfig(base: BillardConfig, patch: Partial<BillardConfig> | null | undefined): BillardConfig {
  const out: BillardConfig = { ...DEFAULT_CONFIG, ...base };
  if (patch && typeof patch === "object") {
    if (VARIANTS.includes(patch.variant as Variant)) out.variant = patch.variant!;
    for (const k of ["races", "lives", "points", "bandes", "innings"] as const)
      if (typeof patch[k] === "number" && Number.isFinite(patch[k])) out[k] = Math.round(patch[k]);
    if (patch.salle === "hasard" || isSalle(patch.salle)) out.salle = patch.salle;
    if (patch.botLevel === "facile" || patch.botLevel === "moyen" || patch.botLevel === "fort") out.botLevel = patch.botLevel;
    if (patch.pace === "court" || patch.pace === "normal" || patch.pace === "long") out.pace = patch.pace;
    if (patch.aide === "longue" || patch.aide === "courte" || patch.aide === "aucune") out.aide = patch.aide;
    for (const k of RULES) if (typeof patch[k] === "boolean") out[k] = patch[k];
  }
  out.races = nearest(RACE_CHOICES, out.races);
  out.lives = nearest(LIVES_CHOICES, out.lives);
  out.points = nearest(POINTS_CHOICES, out.points);
  out.bandes = nearest(BANDES_CHOICES, out.bandes);
  out.innings = nearest(INNINGS_CHOICES, out.innings);
  return out;
}

export const kindOf = (v: Variant): TableKind => (v === "carambole" ? "carambole" : "poches");

export function rigFor(cfg: BillardConfig): Rig {
  return rigOf(kindOf(cfg.variant), { larges: cfg.larges, glisse: cfg.glisse, rebonds: cfg.rebonds });
}

/** Le temps pour jouer un coup (plus long avec la bille en main) */
export const AIM_MS: Record<Pace, number> = { court: 25_000, normal: 40_000, long: 70_000 };
export const IN_HAND_MS = 10_000;
/** La présentation de la salle avant la casse */
export const INTRO_MS = 4500;
/** Le résultat de la manche, avant la suivante */
export const RACK_MS = 4500;
/** Après le coup, le temps de lire l'annonce */
export const REACT_MS = 1100;
/** Le ralenti d'un beau coup : la fenêtre revue (avant et après le moment clé), sa vitesse, et ce qu'il ajoute */
export const REPLAY_BEFORE_S = 1.3;
export const REPLAY_AFTER_S = 0.6;
export const REPLAY_RATE = 0.4;
export const REPLAY_MS = Math.round(((REPLAY_BEFORE_S + REPLAY_AFTER_S) / REPLAY_RATE) * 1000) + 900;
/** L'élan d'un bot (ou d'un joueur qu'un bot remplace) : les écrans le montrent viser avant que la queue frappe */
export const WINDUP_MS = 1600;

export interface BillardStats {
  shots: number;
  /** Billes rentrées (ou points à la carambole) */
  pots: number;
  fouls: number;
  /** La plus longue série dans une même visite (billes rentrées de suite, carambolages de suite) */
  bestRun: number;
  banks: number;
  /** Manches gagnées en jouant la dernière bille */
  racks: number;
  /** Manches gagnées d'une seule visite depuis la casse */
  breakRuns: number;
  /** La 9 à la casse */
  nineBreak: number;
  /** Carambolages à trois bandes ou plus */
  threeRails: number;
  /** Killer : vies gagnées avec la noire */
  blacks: number;
}

export interface BillardPlayer {
  id: string;
  team: 0 | 1;
  /** Son camp */
  side: number;
  /** Carambole : sa bille (0 la blanche, 1 la jaune) */
  ball: number;
  /** Killer : ses vies ; carambole : ses points */
  lives: number;
  points: number;
  out: boolean;
  /** Killer : éliminé en combientième (1 le premier) */
  outRank: number;
  stats: BillardStats;
}

export interface Side {
  /** Ses joueurs, dans l'ordre où ils jouent */
  ids: string[];
  /** Qui jouera la prochaine fois que le camp prendra la main */
  next: number;
  /** Pleines et rayées : sa famille (null : la table est ouverte) */
  group: Group | null;
  /** Les manches gagnées */
  racks: number;
}

/** Un coup joué : ce que le joueur a envoyé, les billes avant et après, ce qu'il vaut, et le temps de le montrer */
export interface ShotRecord {
  n: number;
  id: string;
  side: number;
  /** La bille jouée */
  cue: number;
  /** Où il a posé la bille en main (sinon null) */
  place: { x: number; y: number } | null;
  /** La poche annoncée pour la noire */
  call: number | null;
  shot: ShotParams;
  breakShot: boolean;
  start: BallSpot[];
  end: BallSpot[];
  pocketed: { id: number; pocket: number; s: number }[];
  steps: number;
  outcome: Outcome;
  /** L'heure de la frappe, et la fin de sa présentation */
  at: number;
  until: number;
  /** Un bot a joué à sa place (temps écoulé, joueur parti) */
  auto: boolean;
}

export interface Match {
  cfg: BillardConfig;
  salle: SalleId;
  /** Le tapis et le jeu de billes de la table (ceux de l'hôte au départ de la partie) */
  dress: { cloth: string; set: string };
  players: BillardPlayer[];
  sides: Side[];
  /** Le camp à la table, et qui joue */
  turn: number;
  shooter: string;
  balls: BallSpot[];
  /** Le joueur a la bille en main : derrière la ligne de tête, ou partout */
  inHand: "tete" | "partout" | null;
  breakShot: boolean;
  /** Le camp qui a cassé cette manche */
  breaker: number;
  rackNo: number;
  phase: "intro" | "aim" | "shot" | "rack" | "over";
  phaseAt: number;
  deadline: number;
  last: ShotRecord | null;
  shots: number;
  /** Le joueur à la table enchaîne : sa série dans cette visite */
  run: number;
  /** Personne n'a joué d'autre que le casseur depuis la casse (pour « casse et file ») */
  breakRun: boolean;
  /** Carambole : les reprises jouées (un tour de table complet) */
  innings: number;
  /** La manche qui vient d'être gagnée (pendant l'écran de fin de manche) */
  rackWon: { side: number; text: string } | null;
  /** Les camps gagnants de chaque manche */
  rackLog: number[];
  rng: number;
  ranks?: number[];
}

const newStats = (): BillardStats => ({
  shots: 0,
  pots: 0,
  fouls: 0,
  bestRun: 0,
  banks: 0,
  racks: 0,
  breakRuns: 0,
  nineBreak: 0,
  threeRails: 0,
  blacks: 0,
});

/** Les billes au début d'une manche (et la bille jouée de la casse, à sa place) */
function freshRack(m: Pick<Match, "cfg">, table: Table, rng: RngHolder, breakerBall: number): BallSpot[] {
  const v = m.cfg.variant;
  if (v === "carambole") return rackCarom(table, breakerBall === CAROM_YELLOW ? 1 : 0);
  const cue: BallSpot = { id: 0, x: table.head - 0.1, y: 0 };
  const objs = v === "huit" ? rack8(table, rng) : v === "neuf" ? rack9(table, rng) : rackKiller(table, rng);
  return [cue, ...objs];
}

/** Le camp de chacun : en équipes, deux camps (on y alterne) ; sinon chacun le sien ; pleines et rayées à plus de deux, on fait deux équipes */
export function createMatch(
  cfg: BillardConfig,
  seats: { id: string; team: 0 | 1 }[],
  seed: number,
  now: number,
  dress: { cloth: string; set: string } = { cloth: "vert", set: "classiques" },
): Match {
  const rng = { rng: seed };
  const ready = readySalles();
  const salle = cfg.salle !== "hasard" && ready.includes(cfg.salle) ? cfg.salle : pick(rng, ready);
  let teams = cfg.teams && seats.length > 2;
  // Pleines et rayées se joue à deux camps : à plus de deux, on fait des équipes (une place sur deux)
  let teamOf = (s: { team: 0 | 1 }, i: number): 0 | 1 => (teams ? s.team : ((i % 2) as 0 | 1));
  if (cfg.variant === "huit" && seats.length > 2 && !teams) {
    teams = true;
    teamOf = (_s, i) => (i % 2) as 0 | 1;
  }
  // Des équipes vides (tous du même côté) : on répartit une place sur deux
  if (teams) {
    const t0 = seats.filter((s, i) => teamOf(s, i) === 0).length;
    if (t0 === 0 || t0 === seats.length) teamOf = (_s, i) => (i % 2) as 0 | 1;
  }
  // L'ordre de jeu : en équipes, on alterne les équipes ; sinon l'ordre de la table
  let order = seats.map((s, i) => ({ ...s, team: teamOf(s, i) }));
  if (teams) {
    const a = order.filter((s) => s.team === 0),
      b = order.filter((s) => s.team === 1);
    order = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) order.push(a[i]!);
      if (b[i]) order.push(b[i]!);
    }
  }
  const sides: Side[] = teams
    ? [0, 1].map((t) => ({ ids: order.filter((s) => s.team === t).map((s) => s.id), next: 0, group: null, racks: 0 }))
    : order.map((s) => ({ ids: [s.id], next: 0, group: null, racks: 0 }));
  const players: BillardPlayer[] = order.map((s, i) => {
    const side = teams ? s.team : i;
    return {
      id: s.id,
      team: teams ? s.team : 0,
      side,
      ball: cfg.variant === "carambole" ? side % 2 : 0,
      lives: cfg.lives,
      points: 0,
      out: false,
      outRank: 0,
      stats: newStats(),
    };
  });
  const m: Match = {
    cfg: { ...cfg, teams },
    salle,
    dress: { ...dress },
    players,
    sides,
    turn: 0,
    shooter: "",
    balls: [],
    inHand: null,
    breakShot: true,
    breaker: 0,
    rackNo: 0,
    phase: "intro",
    phaseAt: now,
    deadline: now + INTRO_MS,
    last: null,
    shots: 0,
    run: 0,
    breakRun: true,
    innings: 0,
    rackWon: null,
    rackLog: [],
    rng: 0,
  };
  // Qui casse en premier : tiré au sort (à la carambole, toujours le premier de la table, qui a la blanche)
  m.breaker = cfg.variant === "carambole" ? 0 : Math.floor(random(rng) * sides.length);
  startRack(m, rng);
  m.rng = rng.rng;
  return m;
}

/** Une manche commence : les billes en place, le casseur à la table */
function startRack(m: Match, rng: RngHolder) {
  const rig = rigFor(m.cfg);
  const side = m.sides[m.breaker]!;
  const shooter = side.ids[side.next % side.ids.length]!;
  side.next++;
  const p = m.players.find((x) => x.id === shooter)!;
  m.balls = freshRack(m, rig.table, rng, p.ball);
  for (const s of m.sides) s.group = null;
  m.turn = m.breaker;
  m.shooter = shooter;
  m.inHand = m.cfg.variant === "carambole" ? null : "tete";
  m.breakShot = true;
  m.breakRun = true;
  m.run = 0;
}

/** Le joueur dont c'est le tour (null pendant un coup ou après la partie) */
export function shooterOf(m: Match): BillardPlayer | null {
  return m.phase === "aim" || m.phase === "intro" ? (m.players.find((p) => p.id === m.shooter) ?? null) : null;
}

/** La bille que joue ce joueur */
export function cueOf(m: Pick<Match, "cfg">, p: Pick<BillardPlayer, "ball">): number {
  return m.cfg.variant === "carambole" ? (p.ball === 1 ? CAROM_YELLOW : CAROM_WHITE) : 0;
}

/** Pleines et rayées : la famille du camp, et s'il en reste sur le tapis (sinon, il joue la noire) */
export function groupLeft(m: Pick<Match, "balls">, g: Group | null): number {
  if (!g) return 7;
  return m.balls.filter((b) => groupOf(b.id) === g).length;
}

/** Le joueur doit annoncer la poche de la noire */
export function mustCall(m: Match): boolean {
  if (m.cfg.variant !== "huit" || m.breakShot) return false;
  const g = m.sides[m.turn]?.group ?? null;
  return g !== null && groupLeft(m, g) === 0;
}

/** Les billes que le joueur doit viser (la première touchée doit en être), pour l'aide et les bots */
export function legalTargets(m: Match): number[] {
  const objs = m.balls.filter((b) => b.id !== 0).map((b) => b.id);
  const v = m.cfg.variant;
  if (v === "carambole") {
    const p = m.players.find((x) => x.id === m.shooter);
    const cue = p ? cueOf(m, p) : CAROM_WHITE;
    if (m.breakShot) return [CAROM_RED];
    return m.balls.filter((b) => b.id !== cue).map((b) => b.id);
  }
  if (v === "neuf") return objs.length ? [Math.min(...objs)] : [];
  if (v === "killer") return objs;
  if (m.breakShot) return objs;
  const g = m.sides[m.turn]?.group ?? null;
  if (g === null) return objs.filter((id) => id !== 8);
  const mine = objs.filter((id) => groupOf(id) === g);
  return mine.length > 0 ? mine : objs.filter((id) => id === 8);
}

/** La bille en main peut aller là (dans la zone permise, sur le tapis, sans toucher une autre bille) */
export function canPlace(m: Match, x: number, y: number): boolean {
  if (!m.inHand) return false;
  const t = rigFor(m.cfg).table;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (Math.abs(x) > t.lx - t.R || Math.abs(y) > t.ly - t.R) return false;
  if (m.inHand === "tete" && x > t.head) return false;
  const p = m.players.find((q) => q.id === m.shooter);
  const cue = p ? cueOf(m, p) : 0;
  return m.balls.every((b) => b.id === cue || (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) >= 4 * t.R * t.R * 1.0004);
}

export interface ShotInput {
  shot: Partial<ShotParams>;
  place?: { x: number; y: number } | null;
  call?: number | null;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * Un coup du joueur dont c'est le tour ; renvoie le coup joué, ou la raison du refus. `windup` : le temps de viser avant
 * la frappe (un joueur l'a déjà fait avant d'envoyer son coup ; un bot le fait maintenant).
 */
export function takeShot(m: Match, id: string, input: ShotInput, now: number, auto = false, windup = 0): ShotRecord | string {
  if (m.phase !== "aim") return "Ce n'est pas le moment de jouer.";
  if (m.shooter !== id) return "Ce n'est pas ton tour.";
  const p = m.players.find((x) => x.id === id)!;
  const shot = cleanShot(input.shot);
  if (!shot) return "Coup invalide.";
  const rig = rigFor(m.cfg);
  const cue = cueOf(m, p);
  let start = m.balls.map((b) => ({ ...b }));
  let place: ShotRecord["place"] = null;
  if (m.inHand && input.place) {
    const x = round6(Number(input.place.x)),
      y = round6(Number(input.place.y));
    if (!canPlace(m, x, y)) return "La bille ne peut pas aller là.";
    place = { x, y };
    start = start.map((b) => (b.id === cue ? { id: cue, x, y } : b));
  }
  let call: number | null = null;
  if (
    mustCall(m) &&
    typeof input.call === "number" &&
    Number.isInteger(input.call) &&
    input.call >= 0 &&
    input.call < rig.table.pockets.length
  )
    call = input.call;
  const sim = simulateShot(rig, start, cue, shot);
  const side = m.sides[m.turn]!;
  const outcome = judge(
    {
      variant: m.cfg.variant,
      breakShot: m.breakShot,
      cue,
      before: start,
      group: side.group,
      call,
      bandes: m.cfg.bandes,
    },
    sim.events,
  );
  const show = sim.showMs + REACT_MS + (outcome.highlight ? REPLAY_MS : 0);
  const rec: ShotRecord = {
    n: ++m.shots,
    id,
    side: m.turn,
    cue,
    place,
    call,
    shot,
    breakShot: m.breakShot,
    start,
    end: sim.balls,
    pocketed: sim.pocketed,
    steps: sim.steps,
    outcome,
    at: now + windup,
    until: now + windup + show,
    auto,
  };
  m.last = rec;
  m.phase = "shot";
  m.phaseAt = now;
  m.deadline = rec.until;
  return rec;
}

/** Les joueurs encore en jeu (le Killer) */
const alive = (m: Match) => m.players.filter((p) => !p.out);

/** Le camp suivant (qui a encore un joueur en jeu), et qui joue pour lui */
function passTurn(m: Match) {
  const n = m.sides.length;
  let t = m.turn;
  for (let k = 0; k < n; k++) {
    t = (t + 1) % n;
    const side = m.sides[t]!;
    if (side.ids.some((id) => !m.players.find((p) => p.id === id)!.out)) break;
  }
  // La carambole compte les reprises : un tour de table complet
  if (m.cfg.variant === "carambole" && t <= m.turn) m.innings++;
  const side = m.sides[t]!;
  let shooter = side.ids[side.next % side.ids.length]!;
  for (let k = 0; k < side.ids.length && m.players.find((p) => p.id === shooter)!.out; k++) {
    side.next++;
    shooter = side.ids[side.next % side.ids.length]!;
  }
  side.next++;
  m.turn = t;
  m.shooter = shooter;
  m.run = 0;
  m.breakRun = false;
}

/** Le coup a fini d'être montré : on applique les règles, puis on rejoue, on passe la main, ou la manche finit */
function resolve(m: Match, now: number) {
  const rec = m.last!;
  const o = rec.outcome;
  const rig = rigFor(m.cfg);
  const p = m.players.find((x) => x.id === rec.id)!;
  const side = m.sides[rec.side]!;
  const st = p.stats;
  st.shots++;
  if (o.foul) st.fouls++;
  st.pots += o.scored;
  st.banks += o.banked ? 1 : 0;
  if (o.keep) {
    m.run += Math.max(1, o.scored);
    if (m.run > st.bestRun) st.bestRun = m.run;
  }
  // Les billes : celles de la fin du coup, celles qui reviennent sur le point, la blanche tombée remise en tête
  const balls = rec.end.map((b) => ({ ...b }));
  for (const id of o.respot) balls.push(respot(rig.table, balls, id));
  if (m.cfg.variant !== "carambole" && !balls.some((b) => b.id === 0)) {
    balls.push(freeSpot(rig.table, balls, rig.table.head - 0.1, 0));
  }
  m.balls = balls;
  m.inHand = o.inHand;
  const v = m.cfg.variant;
  const wasBreak = m.breakShot;
  m.breakShot = false;

  if (v === "huit" && o.assign && side.group === null) {
    side.group = o.assign;
    for (const s of m.sides) if (s !== side) s.group = otherGroup(o.assign);
  }
  if (o.rack) {
    const winner = o.rack === "won" ? rec.side : (rec.side + 1) % m.sides.length;
    if (o.rack === "won") {
      st.racks++;
      if (m.breakRun && m.breaker === rec.side) st.breakRuns++;
      if (v === "neuf" && wasBreak) st.nineBreak++;
    }
    return endRack(m, winner, now, o.rack === "won" ? `${o.text} ${o.sub ?? ""}`.trim() : (o.sub ?? o.text));
  }
  if (v === "killer") {
    if (o.lives) p.lives = Math.min(m.cfg.lives + 2, p.lives + o.lives);
    if (o.lives && o.lives > 0) st.blacks++;
    if (p.lives <= 0 && !p.out) {
      p.out = true;
      p.outRank = m.players.filter((x) => x.out).length;
    }
    if (alive(m).length <= 1) return finish(m, now);
    // Plus de billes : on remet le triangle, et le suivant casse
    if (!m.balls.some((b) => b.id !== 0)) {
      const h = { rng: m.rng };
      const cue = m.balls.find((b) => b.id === 0) ?? { id: 0, x: rig.table.head - 0.1, y: 0 };
      m.balls = [{ ...cue, x: rig.table.head - 0.1, y: 0 }, ...rackKiller(rig.table, h)];
      m.rng = h.rng;
      m.breakShot = true;
      m.inHand = "tete";
    }
    passTurn(m);
    return startAim(m, now);
  }
  if (v === "carambole") {
    p.points += o.points ?? 0;
    if (o.highlight?.kind === "carambolage") st.threeRails++;
    if (p.points >= m.cfg.points) return finish(m, now);
    if (!o.keep) {
      passTurn(m);
      if (m.innings >= m.cfg.innings) return finish(m, now);
    }
    return startAim(m, now);
  }
  if (!o.keep) passTurn(m);
  return startAim(m, now);
}

function startAim(m: Match, now: number) {
  m.phase = "aim";
  m.phaseAt = now;
  m.deadline = now + AIM_MS[m.cfg.pace] + (m.inHand ? IN_HAND_MS : 0);
}

/** Une place libre pour la blanche, au plus près de (x, y) */
function freeSpot(t: Table, balls: readonly BallSpot[], x: number, y: number): BallSpot {
  const clear = (px: number, py: number) => balls.every((b) => (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py) >= 4.4 * t.R * t.R);
  for (let k = 0; k < 60; k++) {
    for (const s of [1, -1]) {
      const py = y + s * k * t.R * 0.5;
      if (Math.abs(py) <= t.ly - t.R && clear(x, py)) return { id: 0, x, y: py };
    }
  }
  return { id: 0, x, y };
}

function endRack(m: Match, winner: number, now: number, text: string) {
  m.sides[winner]!.racks++;
  m.rackLog.push(winner);
  m.rackWon = { side: winner, text };
  if (m.sides[winner]!.racks >= m.cfg.races) return finish(m, now);
  m.phase = "rack";
  m.phaseAt = now;
  m.deadline = now + RACK_MS;
}

/** Le total d'un joueur pour le classement : ses manches (celles de son camp), ses vies, ses points */
export function scoreOf(m: Match, p: BillardPlayer): number {
  const v = m.cfg.variant;
  if (v === "carambole") return p.points;
  if (v === "killer") return p.out ? 0 : p.lives;
  return m.sides[p.side]?.racks ?? 0;
}

export function totals(m: Match): number[] {
  return m.players.map((p) => scoreOf(m, p));
}

function finish(m: Match, now: number) {
  m.phase = "over";
  m.phaseAt = now;
  m.deadline = now;
  const v = m.cfg.variant;
  if (v === "killer") {
    const n = m.players.length;
    // Le dernier en vie est premier ; les autres, du dernier éliminé (deuxième) au premier éliminé (dernier)
    m.ranks = m.players.map((p) => (p.out ? 1 + (n - p.outRank) : 1));
    return;
  }
  const score = m.sides.map((s, i) =>
    v === "carambole" ? Math.max(...m.players.filter((p) => p.side === i).map((p) => p.points)) : s.racks,
  );
  if (v === "carambole" && m.cfg.teams) {
    // En équipes, les points de l'équipe : la somme
    for (let i = 0; i < m.sides.length; i++) score[i] = m.players.filter((p) => p.side === i).reduce((a, p) => a + p.points, 0);
  }
  const rankOfSide = (i: number) => 1 + score.filter((x) => x > score[i]!).length;
  m.ranks = m.players.map((p) => rankOfSide(p.side));
}

/**
 * Le temps passe : la présentation finit, un coup a fini d'être montré, la manche suivante commence. Renvoie vrai si
 * quelque chose a changé. Le temps pour jouer écoulé, c'est la salle qui fait jouer un bot à la place du joueur.
 */
export function tickMatch(m: Match, now: number): boolean {
  if (m.phase === "intro" && now >= m.deadline) {
    startAim(m, now);
    return true;
  }
  if (m.phase === "shot" && now >= m.deadline) {
    resolve(m, now);
    return true;
  }
  if (m.phase === "rack" && now >= m.deadline) {
    m.rackNo++;
    m.rackWon = null;
    // Le casseur suivant : chacun son tour
    m.breaker = (m.breaker + 1) % m.sides.length;
    const h = { rng: m.rng };
    startRack(m, h);
    m.rng = h.rng;
    m.phase = "intro";
    m.phaseAt = now;
    m.deadline = now + 1800;
    return true;
  }
  return false;
}

/** Le temps pour jouer est écoulé : le joueur dont c'est le tour, sinon null */
export function timedOut(m: Match, now: number): BillardPlayer | null {
  return m.phase === "aim" && now >= m.deadline ? (m.players.find((p) => p.id === m.shooter) ?? null) : null;
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

export { CAROM_RED };
