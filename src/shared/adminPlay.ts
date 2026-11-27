// « À quoi on joue » : ce que la page Admin montre des parties terminées, jeu par jeu, sur les huit dernières semaines.

import type { TableGame } from "./protocol.ts";

/** Les semaines comptées à rebours : la semaine 0, ce sont les sept derniers jours */
export const PLAY_WEEKS = 8;
const WEEK_MS = 7 * 24 * 3600_000;

export interface AdminPlayGame {
  game: TableGame;
  /** Parties terminées par semaine, de la plus ancienne (index 0) à celle des sept derniers jours */
  weeks: number[];
  total: number;
  /** Durée moyenne d'une partie, en secondes */
  avgSeconds: number;
  /** Joueurs moyens par partie, et parmi eux les vrais joueurs */
  avgPlayers: number;
  avgHumans: number;
}

export interface AdminPlay {
  since: number;
  games: AdminPlayGame[];
}

/** Une ligne de la requête : un jeu, une semaine à rebours (0 = les sept derniers jours) */
export interface PlayRow {
  game: TableGame;
  week: number;
  n: number;
  duration: number;
  players: number;
  humans: number;
}

/** Le début de la fenêtre : huit semaines avant maintenant */
export function playSince(now: number): number {
  return now - PLAY_WEEKS * WEEK_MS;
}

/** La semaine à rebours d'une partie finie à `endedAt` */
export function weekBack(now: number, endedAt: number): number {
  return Math.min(PLAY_WEEKS - 1, Math.max(0, Math.floor((now - endedAt) / WEEK_MS)));
}

/** Les lignes regroupées par jeu, les jeux les plus joués d'abord */
export function summarizePlay(rows: PlayRow[], since: number): AdminPlay {
  const byGame = new Map<TableGame, { weeks: number[]; n: number; dur: number; players: number; humans: number }>();
  for (const r of rows) {
    const g = byGame.get(r.game) ?? { weeks: Array<number>(PLAY_WEEKS).fill(0), n: 0, dur: 0, players: 0, humans: 0 };
    const week = Math.min(PLAY_WEEKS - 1, Math.max(0, r.week));
    g.weeks[PLAY_WEEKS - 1 - week] += r.n;
    g.n += r.n;
    g.dur += r.duration * r.n;
    g.players += r.players * r.n;
    g.humans += r.humans * r.n;
    byGame.set(r.game, g);
  }
  const games = [...byGame.entries()]
    .map(([game, g]) => ({
      game,
      weeks: g.weeks,
      total: g.n,
      avgSeconds: g.n ? Math.round(g.dur / g.n / 1000) : 0,
      avgPlayers: g.n ? Math.round((g.players / g.n) * 10) / 10 : 0,
      avgHumans: g.n ? Math.round((g.humans / g.n) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);
  return { since, games };
}
