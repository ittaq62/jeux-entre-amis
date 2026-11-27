// Le face-à-face de deux joueurs : les parties qu'ils ont jouées à la même table, qui a fini devant l'autre, jeu par
// jeu, la série en cours et la dernière revanche. Une même place (coéquipiers, ex aequo) ne compte pour personne.

import type { GameId } from "./protocol.ts";

/** Une partie jouée ensemble : les places des deux joueurs (1 = premier) */
export interface VersusRow {
  game: GameId;
  endedAt: number;
  mine: number;
  theirs: number;
}

export type VersusResult = "won" | "lost" | "tied";

export interface HeadToHead {
  played: number;
  won: number;
  lost: number;
  tied: number;
  /** Jeu par jeu, le plus joué ensemble d'abord */
  byGame: { game: GameId; played: number; won: number; lost: number; tied: number }[];
  /** Qui a gagné les dernières parties d'affilée (sans compter les places égales), à partir de 2 */
  streak: { who: "me" | "them"; count: number } | null;
  last: { game: GameId; endedAt: number; result: VersusResult } | null;
}

export function versusResult(row: VersusRow): VersusResult {
  return row.mine < row.theirs ? "won" : row.mine > row.theirs ? "lost" : "tied";
}

/** `rows` : de la plus récente à la plus ancienne */
export function headToHead(rows: readonly VersusRow[]): HeadToHead {
  const games = new Map<GameId, { game: GameId; played: number; won: number; lost: number; tied: number }>();
  let won = 0;
  let lost = 0;
  let tied = 0;
  for (const row of rows) {
    const r = versusResult(row);
    const g = games.get(row.game) ?? { game: row.game, played: 0, won: 0, lost: 0, tied: 0 };
    g.played++;
    g[r]++;
    games.set(row.game, g);
    if (r === "won") won++;
    else if (r === "lost") lost++;
    else tied++;
  }
  // La série : les dernières parties décidées, gagnées par le même
  const decided = rows.map(versusResult).filter((r) => r !== "tied");
  let count = 0;
  while (count < decided.length && decided[count] === decided[0]) count++;
  const streak = count >= 2 ? { who: decided[0] === "won" ? ("me" as const) : ("them" as const), count } : null;
  const first = rows[0];
  return {
    played: rows.length,
    won,
    lost,
    tied,
    byGame: [...games.values()].sort((a, b) => b.played - a.played),
    streak,
    last: first ? { game: first.game, endedAt: first.endedAt, result: versusResult(first) } : null,
  };
}
