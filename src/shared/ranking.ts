// Points de classement : ils s'additionnent partie après partie et ne baissent jamais.
// Le bonus de victoire et la valeur de chaque adversaire sont repris tels quels dans
// migrations/0002_points.sql pour recalculer l'historique : garder les deux en accord.

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

/** Points rapportés par une partie à `me` (un des joueurs de `players`). */
export function rankingPoints(players: RankedPlayer[], me: RankedPlayer): number {
  if (me.rank < 1) return 0;
  let points = me.rank === 1 ? RANKING_POINTS.win : 0;
  for (const p of players) {
    if (p !== me && p.rank > me.rank) points += p.isBot ? RANKING_POINTS.bot : RANKING_POINTS.human;
  }
  return points;
}
