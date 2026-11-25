// Points de classement : ils s'additionnent partie après partie et ne baissent jamais.
// Le bonus de victoire et la valeur de chaque adversaire ont été repris tels quels dans
// migrations/0002_points.sql pour recalculer l'historique de l'époque (sans le cas de l'égalité générale, venu après).

export const RANKING_POINTS = {
  /** Bonus pour avoir gagné la partie */
  win: 30,
  /** Chaque joueur humain terminé derrière soi */
  human: 10,
  /** Chaque bot terminé derrière soi */
  bot: 5,
} as const;

export interface RankedPlayer {
  /** Place finale, 1 pour le gagnant */
  rank: number;
  isBot: boolean;
}

/**
 * Une égalité générale : tous les joueurs classés finissent premiers (une partie en équipes à égalité, par exemple).
 * Personne ne l'a gagnée. Un joueur seul classé, lui, a bien gagné.
 */
export function isDraw(players: readonly { rank: number }[]): boolean {
  const ranked = players.filter((p) => p.rank >= 1);
  return ranked.length > 1 && ranked.every((p) => p.rank === 1);
}

/** `me` a gagné la partie : premier, et pas sur une égalité générale */
export function wonGame(players: readonly { rank: number }[], me: { rank: number }): boolean {
  return me.rank === 1 && !isDraw(players);
}

/** Points rapportés par une partie à `me` (un des joueurs de `players`). */
export function rankingPoints(players: RankedPlayer[], me: RankedPlayer): number {
  if (me.rank < 1) return 0;
  let points = wonGame(players, me) ? RANKING_POINTS.win : 0;
  for (const p of players) {
    if (p !== me && p.rank > me.rank) points += p.isBot ? RANKING_POINTS.bot : RANKING_POINTS.human;
  }
  return points;
}

/** La place de chaque ligne déjà triée : les ex aequo (mêmes valeurs selon `key`) partagent la même, la suivante saute */
export function sharedRanks<T>(rows: readonly T[], key: (row: T) => string): number[] {
  const ranks: number[] = [];
  rows.forEach((row, i) => {
    ranks.push(i > 0 && key(rows[i - 1]!) === key(row) ? ranks[i - 1]! : i + 1);
  });
  return ranks;
}

/**
 * Ce qu'une partie rapporte à un joueur. Un joueur parti avant la fin (un bot finissait pour lui) ne touche rien de ce que
 * le bot a gagné à sa place : ni victoire, ni points, ni succès, et sa série de victoires retombe. Il garde les pertes
 * d'Elo, pour qu'on ne fuie pas une défaite, mais pas les gains. La partie compte quand même comme jouée.
 */
export function gameCredit(
  players: RankedPlayer[],
  me: RankedPlayer & { absent?: boolean },
  eloDelta: number,
): { won: boolean; points: number; eloDelta: number; achievements: boolean } {
  if (me.absent) return { won: false, points: 0, eloDelta: Math.min(0, eloDelta), achievements: false };
  return { won: wonGame(players, me), points: rankingPoints(players, me), eloDelta, achievements: true };
}
