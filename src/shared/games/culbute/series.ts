// Une table de tournée enchaîne plusieurs combats, des manches : à chaque manche, chacun gagne des points selon sa
// place (le barème de la tournée), et c'est le total qui fait le classement envoyé à la tournée. Les sorties
// départagent, puis la place à la dernière manche jouée. En équipes, les coéquipiers partagent la place de leur équipe.

import { ARENA_IDS, type ArenaId } from "./arenas.ts";
import type { Fight, Fighter } from "./model.ts";
import type { CulbuteConfig, CulbuteRecordStats } from "./view.ts";

/** Trois combats d'affilée : de quoi tenir la comparaison avec les autres jeux de la tournée */
export const SERIES_ROUNDS = 3;
/** Le temps de regarder les scores entre deux manches */
export const SERIES_PAUSE_MS = 9000;

const POINTS = [10, 7, 5, 3, 2, 1];
/** Les points d'une place à une manche : 10, 7, 5, 3, 2, 1, puis 1 */
export const roundPoints = (rank: number): number => (rank >= 1 ? (POINTS[rank - 1] ?? 1) : 0);

export interface SeriesSeat {
  name: string;
  userId: string | null;
  bot: boolean;
  team: number;
}

export interface CulbuteSeries {
  /** La manche en cours, ou la dernière finie (à partir de 1), et combien il y en a */
  round: number;
  rounds: number;
  /** Chaque siège qui a commencé la série, même parti en cours de route */
  seats: Record<string, SeriesSeat>;
  points: Record<string, number>;
  /** Sa place à chaque manche finie (0 : il n'était plus là) */
  places: Record<string, number[]>;
  /** Ce qu'il a fait sur toute la série (ce qui part dans la tournée) */
  totals: Record<string, CulbuteRecordStats>;
  /** Les arènes déjà jouées : chaque manche en change */
  arenas: ArenaId[];
  /** Entre deux manches : l'heure (celle du serveur) où part la suivante */
  nextAt: number | null;
  /** Les manches déjà enregistrées (statistiques et Elo du combat) */
  recorded: number;
  /** Une fois la série finie : la place de chacun au total */
  final: Record<string, number> | null;
}

export function newSeries(seats: ({ id: string } & SeriesSeat)[], rounds = SERIES_ROUNDS): CulbuteSeries {
  const s: CulbuteSeries = {
    round: 1,
    rounds,
    seats: {},
    points: {},
    places: {},
    totals: {},
    arenas: [],
    nextAt: null,
    recorded: 0,
    final: null,
  };
  for (const { id, name, userId, bot, team } of seats) {
    s.seats[id] = { name, userId, bot, team };
    s.points[id] = 0;
    s.places[id] = [];
  }
  return s;
}

/** Ce qu'un combat laisse dans les statistiques d'un combattant */
export function recordStatsOf(f: Fight, ft: Fighter): CulbuteRecordStats {
  return {
    kos: ft.stats.kos,
    falls: ft.stats.falls,
    dealt: Math.round(ft.stats.dealt),
    taken: Math.round(ft.stats.taken),
    items: ft.stats.items,
    lowKo: ft.stats.lowKo >= 999 ? 0 : Math.round(ft.stats.lowKo),
    stocksLeft: f.settings.mode === "temps" ? 0 : Math.max(0, ft.stocks),
    lostStock: ft.stats.falls > 0 ? 1 : 0,
    won: ft.rank === 1 ? 1 : 0,
  };
}

function addStats(a: CulbuteRecordStats | undefined, b: CulbuteRecordStats): CulbuteRecordStats {
  if (!a) return { ...b };
  const low = [a.lowKo, b.lowKo].filter((v) => v > 0);
  return {
    kos: a.kos + b.kos,
    falls: a.falls + b.falls,
    dealt: a.dealt + b.dealt,
    taken: a.taken + b.taken,
    items: a.items + b.items,
    lowKo: low.length > 0 ? Math.min(...low) : 0,
    stocksLeft: a.stocksLeft + b.stocksLeft,
    lostStock: Math.max(a.lostStock, b.lostStock),
    won: a.won + b.won,
  };
}

/** Une manche finie : chacun marque les points de sa place, et ce qu'il a fait s'ajoute à son total */
export function addRound(s: CulbuteSeries, f: Fight) {
  const i = s.round - 1;
  for (const id of Object.keys(s.seats)) {
    const places = (s.places[id] ??= []);
    while (places.length < i) places.push(0);
    places[i] = 0;
  }
  for (const ft of f.fighters) {
    if (!s.seats[ft.id]) continue;
    s.points[ft.id] = (s.points[ft.id] ?? 0) + roundPoints(ft.rank);
    s.places[ft.id]![i] = ft.rank;
    s.totals[ft.id] = addStats(s.totals[ft.id], recordStatsOf(f, ft));
  }
  if (!s.arenas.includes(f.arena as ArenaId)) s.arenas.push(f.arena as ArenaId);
}

/** L'arène de la manche suivante : celle de la table si elle est fixée, sinon une qu'on n'a pas encore jouée */
export function seriesArena(cfg: Pick<CulbuteConfig, "arena">, s: CulbuteSeries, random: () => number): ArenaId {
  if (cfg.arena !== "hasard") return cfg.arena;
  const fresh = ARENA_IDS.filter((a) => !s.arenas.includes(a));
  const pool = fresh.length > 0 ? fresh : ARENA_IDS;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}

/** La place à la dernière manche à laquelle il a pris part (99 s'il n'en a joué aucune) */
function lastPlace(s: CulbuteSeries, id: string): number {
  const places = s.places[id] ?? [];
  for (let i = places.length - 1; i >= 0; i--) if (places[i]! > 0) return places[i]!;
  return 99;
}

/**
 * Le classement au total, de 1 à n (les ex aequo partagent leur place) : les points, puis les sorties, puis la place à
 * la dernière manche jouée. En équipes, c'est l'équipe qui est classée (points moyens de ses membres, sorties cumulées).
 */
export function seriesRanks(s: CulbuteSeries, teams: boolean): Record<string, number> {
  const ids = Object.keys(s.seats);
  const keyOf = (id: string) => (teams ? `e${s.seats[id]!.team}` : id);
  const groups = new Map<string, string[]>();
  for (const id of ids) groups.set(keyOf(id), [...(groups.get(keyOf(id)) ?? []), id]);
  const score = [...groups.entries()].map(([key, members]) => ({
    key,
    points: members.reduce((n, id) => n + (s.points[id] ?? 0), 0) / members.length,
    kos: members.reduce((n, id) => n + (s.totals[id]?.kos ?? 0), 0),
    last: Math.min(...members.map((id) => lastPlace(s, id))),
  }));
  const better = (a: (typeof score)[number], b: (typeof score)[number]) => b.points - a.points || b.kos - a.kos || a.last - b.last;
  score.sort(better);
  const rankOf = new Map<string, number>();
  score.forEach((g, i) => {
    const prev = score[i - 1];
    rankOf.set(g.key, prev && better(prev, g) === 0 ? rankOf.get(prev.key)! : i + 1);
  });
  return Object.fromEntries(ids.map((id) => [id, rankOf.get(keyOf(id))!]));
}
