// Ce que les joueurs reçoivent d'un match : l'état d'ensemble à chaque changement, et, plusieurs fois par seconde,
// la position de tout le monde, serrée en un petit tableau de nombres.

import { CLUB_BY_ID, CLUBS, FORMATION_NAMES, KEEPER_KITS, matchKits, type FormationId, type KitColors, type TeamSetup } from "./clubs.ts";
import type { Act, GoalRecord, Match, MatchEvent, MatchSettings, Phase, RestartKind, Role, Shootout, Team, TeamStats } from "./model.ts";

export type Ambience = "jour" | "soir" | "nuit";
export type WeatherId = "clair" | "pluie" | "neige";

/** Tout ce que l'hôte règle avant le match */
export interface CramponsConfig extends MatchSettings {
  clubs: [string, string];
  /** Le dispositif de chaque équipe */
  formations: [FormationId, FormationId];
  ambience: Ambience;
  weather: WeatherId;
}

export const HALF_CHOICES = [2, 3, 4, 6, 8] as const;
export const SIDE_CHOICES = [5, 7, 11] as const;
export const LEVEL_NAMES = ["Débutant", "Amateur", "Pro", "Légende"] as const;

export const DEFAULT_CONFIG: CramponsConfig = {
  halfMinutes: 3,
  side: 11,
  level: 1,
  offside: true,
  fouls: true,
  draw: "none",
  clubs: [CLUBS[0]!.id, CLUBS[2]!.id],
  formations: [CLUBS[0]!.formation, CLUBS[2]!.formation],
  ambience: "soir",
  weather: "clair",
};

/** Applique les réglages reçus, en refusant tout ce qui n'existe pas */
export function mergeConfig(current: CramponsConfig, patch: Partial<CramponsConfig>): CramponsConfig {
  const next = { ...DEFAULT_CONFIG, ...current };
  if ((HALF_CHOICES as readonly number[]).includes(patch.halfMinutes as number)) next.halfMinutes = patch.halfMinutes!;
  if ((SIDE_CHOICES as readonly number[]).includes(patch.side as number)) next.side = patch.side!;
  if (typeof patch.level === "number" && patch.level >= 0 && patch.level < LEVEL_NAMES.length) next.level = Math.floor(patch.level);
  if (typeof patch.offside === "boolean") next.offside = patch.offside;
  if (typeof patch.fouls === "boolean") next.fouls = patch.fouls;
  if (patch.draw === "none" || patch.draw === "penalties" || patch.draw === "extra") next.draw = patch.draw;
  if (patch.ambience === "jour" || patch.ambience === "soir" || patch.ambience === "nuit") next.ambience = patch.ambience;
  if (patch.weather === "clair" || patch.weather === "pluie" || patch.weather === "neige") next.weather = patch.weather;
  if (Array.isArray(patch.clubs) && patch.clubs.length === 2 && patch.clubs.every((c) => CLUB_BY_ID.has(c))) {
    next.clubs = [patch.clubs[0]!, patch.clubs[1]!];
  }
  if (Array.isArray(patch.formations) && patch.formations.length === 2 && patch.formations.every((f) => f in FORMATION_NAMES)) {
    next.formations = [patch.formations[0]!, patch.formations[1]!];
  }
  return next;
}

export function teamsFor(cfg: CramponsConfig): [TeamSetup, TeamSetup] {
  const setup = (t: Team): TeamSetup => {
    const c = CLUB_BY_ID.get(cfg.clubs[t])!;
    return { name: c.name, rating: c.rating, formation: cfg.formations[t] };
  };
  return [setup(0), setup(1)];
}

export interface TeamInfo {
  name: string;
  short: string;
  kit: KitColors;
  keeper: KitColors;
}

export interface PlayerInfo {
  i: number;
  team: Team;
  shirt: number;
  name: string;
  role: Role;
  /** Ce qu'il faut au téléphone pour faire courir son joueur à la bonne vitesse */
  pac: number;
  dri: number;
  phy: number;
}

/** L'état d'ensemble du match : il change rarement */
export interface CramponsView {
  config: CramponsConfig;
  teams: [TeamInfo, TeamInfo];
  players: PlayerInfo[];
  humans: { id: string; team: Team }[];
  phase: Phase;
  period: number;
  flipped: boolean;
  score: [number, number];
  goals: GoalRecord[];
  stats: [TeamStats, TeamStats];
  restart: { kind: RestartKind; team: Team; taker: number; ready: boolean } | null;
  shootout: Shootout | null;
  winner: Team | null;
  /** Les joueurs expulsés et ceux qui ont un carton */
  cards: { i: number; yellow: number; off: boolean }[];
  cuts: number;
}

export function cramponsView(m: Match, cfg: CramponsConfig): CramponsView {
  const a = CLUB_BY_ID.get(cfg.clubs[0])!;
  const b = CLUB_BY_ID.get(cfg.clubs[1])!;
  const [kitA, kitB] = matchKits(a, b);
  return {
    config: cfg,
    teams: [
      { name: a.name, short: a.short, kit: kitA, keeper: KEEPER_KITS[0] },
      { name: b.name, short: b.short, kit: kitB, keeper: KEEPER_KITS[1] },
    ],
    players: m.players.map((p) => ({
      i: p.i,
      team: p.team,
      shirt: p.shirt,
      name: p.name,
      role: p.role,
      pac: p.stats.pac,
      dri: p.stats.dri,
      phy: p.stats.phy,
    })),
    humans: m.humans.map((h) => ({ id: h.id, team: h.team })),
    phase: m.phase,
    period: m.period,
    flipped: m.flipped,
    score: m.score,
    goals: m.goals,
    stats: m.stats,
    restart: m.restart ? { kind: m.restart.kind, team: m.restart.team, taker: m.restart.taker, ready: m.restart.ready } : null,
    shootout: m.shootout,
    winner: m.winner,
    cards: m.players.filter((p) => p.yellow > 0 || p.off).map((p) => ({ i: p.i, yellow: p.yellow, off: p.off })),
    cuts: m.cuts,
  };
}

/** Ce qui change sans arrêt, dans le désordre : serré au maximum */
export interface CramponsTick {
  /** L'heure du match, en secondes : c'est elle qui date les positions, car le match avance par pas réguliers */
  s: number;
  /** Pour chaque humain : l'heure de sa dernière commande reçue, qu'il retrouve ainsi pour mesurer son temps de trajet */
  k: number[];
  /** Pour chaque joueur : x, z, cap, vitesse, geste, énergie (de 0 à 100) */
  p: number[];
  /** Le ballon : x, y, z, vx, vz */
  b: number[];
  /** Son porteur, ou -1 */
  o: number;
  /** Le chronomètre, en secondes de match */
  c: number;
  /** Le joueur dirigé par chaque humain, dans l'ordre de `humans` */
  a: number[];
  /** Le joueur à qui une passe est en route, ou -1 : il va seul au ballon, ses touches ne comptent pas encore */
  r: number;
  /** Ce qui vient d'arriver */
  e: MatchEvent[];
}

export const ACTS: Act[] = ["none", "kick", "tackle", "slide", "down", "dive", "header", "hold", "throw"];
const ACT_CODE = new Map(ACTS.map((a, i) => [a, i]));
export const TICK_STRIDE = 6;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function encodeTick(m: Match, events: MatchEvent[], stamps: ReadonlyMap<string, number> = new Map()): CramponsTick {
  const p: number[] = [];
  for (const q of m.players) {
    // Une touche se joue les bras en l'air
    const act = m.restart?.ready && m.restart.kind === "throw" && m.restart.taker === q.i ? "throw" : q.act;
    p.push(r2(q.x), r2(q.z), r3(q.h), r2(Math.hypot(q.vx, q.vz)), ACT_CODE.get(act) ?? 0, Math.round(q.stam * 100));
  }
  const b = m.ball;
  return {
    s: r3(m.t),
    k: m.humans.map((h) => stamps.get(h.id) ?? 0),
    p,
    b: [r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vz)],
    o: m.owner,
    c: Math.round(m.clock),
    a: m.humans.map((h) => h.active),
    r: m.pass?.to ?? -1,
    e: events,
  };
}

/** Ce qui justifie d'envoyer à tous l'état complet : un changement de phase, un but, une remise en jeu, un carton */
export function stateKey(m: Match): string {
  return [
    m.phase,
    m.period,
    m.score.join("-"),
    m.flipped,
    m.restart?.kind ?? "",
    m.restart?.team ?? "",
    m.restart?.ready ?? "",
    m.restart?.taker ?? "",
    m.players.filter((p) => p.yellow > 0 || p.off).length,
    m.humans.map((h) => h.id).join(","),
    m.shootout?.kicks.map((k) => k.length).join("-") ?? "",
    m.cuts,
  ].join("|");
}
