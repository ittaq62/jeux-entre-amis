// Elo : le niveau de chaque joueur, à côté des points de classement qui, eux, ne font que monter.
// Il grimpe quand on termine devant plus fort que soi et baisse quand on termine derrière.
// Une partie à plusieurs compte comme un match contre chaque adversaire, ramené à un seul match :
// gagner une table de huit ne rapporte pas sept fois plus qu'un duel.
// scripts/elo-history.ts rejoue tout l'historique avec ces mêmes règles : garder les deux en accord.

import type { GameId } from "./protocol.ts";

export const ELO_START = 1000;
export const ELO_FLOOR = 100;

/** Les premières parties comptent davantage, le temps que chacun trouve son niveau. */
export const ELO_K = { provisional: 40, settled: 24, provisionalGames: 10 } as const;

/** Les bots ont un niveau fixe : ils servent d'étalon et leur Elo ne bouge jamais. */
export const BOT_ELO = {
  uno: 1000,
  naval: { mousse: 800, chasseur: 1000, amiral: 1200 },
  bricks: { apprenti: 800, confirme: 1000, expert: 1200 },
} as const;

export function botElo(game: GameId, botLevel?: string): number {
  if (game === "naval") return BOT_ELO.naval[botLevel as keyof typeof BOT_ELO.naval] ?? BOT_ELO.naval.chasseur;
  if (game === "bricks") return BOT_ELO.bricks[botLevel as keyof typeof BOT_ELO.bricks] ?? BOT_ELO.bricks.confirme;
  return BOT_ELO.uno;
}

export interface EloEntry {
  id: string;
  /** Elo avant la partie (celui du bot pour un bot) */
  rating: number;
  /** Place finale, 1 pour le gagnant ; deux coéquipiers ont la même */
  rank: number;
  /** Équipe en 2 contre 2 : on ne joue pas contre son coéquipier */
  team: number | null;
  isBot: boolean;
  /** Parties déjà jouées à ce jeu avant celle-ci */
  played: number;
}

/** Variation d'Elo de chaque joueur humain de la partie (les bots ne sont pas dans le résultat). */
export function eloChanges(entries: EloEntry[]): Record<string, number> {
  const changes: Record<string, number> = {};
  for (const me of entries) {
    if (me.isBot || me.rank < 1) continue;
    const rivals = entries.filter((o) => o !== me && o.rank >= 1 && !(me.team !== null && o.team === me.team));
    if (rivals.length === 0) continue;
    let gap = 0;
    for (const o of rivals) {
      const expected = 1 / (1 + 10 ** ((o.rating - me.rating) / 400));
      const score = me.rank < o.rank ? 1 : me.rank > o.rank ? 0 : 0.5;
      gap += score - expected;
    }
    const k = me.played < ELO_K.provisionalGames ? ELO_K.provisional : ELO_K.settled;
    const next = Math.max(ELO_FLOOR, Math.round(me.rating + (k * gap) / rivals.length));
    changes[me.id] = next - me.rating;
  }
  return changes;
}
