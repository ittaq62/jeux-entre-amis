// Le sel d'une soirée : à la fin d'une partie, une ligne tirée des chiffres pour chaque joueur, qui se lit en riant.
// « Basile te bat pour la 3e fois d'affilée », « Ta toute première victoire au Billard ! », « Ta 3e victoire de la
// soirée ». Rien quand il n'y a rien de remarquable : une ligne qui revient à chaque partie ne fait plus sourire.

/** Une partie jouée avec un même adversaire (la plus récente d'abord) : ma place et la sienne */
export interface Duel {
  mine: number;
  theirs: number;
}

export interface EveningInput {
  /** Le nom du jeu, pour « au Billard » */
  gameName: string;
  /** Ma place à la partie qui vient de finir (1 : gagné) */
  rank: number;
  /** Mes victoires à ce jeu depuis toujours, celle-ci comprise */
  winsInGame: number;
  /** Mes victoires de la soirée (les six dernières heures), tous jeux, celle-ci comprise */
  winsTonight: number;
  /** Pour chaque vrai joueur de cette partie : son nom et nos dernières parties de ce jeu ensemble, la plus récente d'abord */
  rivals: { name: string; duels: Duel[] }[];
}

/** À partir de quelle série contre un même ami on le dit */
export const STREAK_MIN = 3;

/** Combien de fois d'affilée, en partant de la plus récente, le même a fini devant l'autre */
export function streak(duels: Duel[]): { count: number; mine: boolean } {
  const first = duels[0];
  if (!first || first.mine === first.theirs) return { count: 0, mine: false };
  const mine = first.mine < first.theirs;
  let count = 0;
  for (const d of duels) {
    if (d.mine === d.theirs || d.mine < d.theirs !== mine) break;
    count += 1;
  }
  return { count, mine };
}

/** « au Billard », « à la bataille navale », « aux Briques », « à Culbute » : la bonne préposition devant le nom du jeu */
export function atGame(name: string): string {
  if (name === "Briques") return "aux Briques";
  if (name === "Bataille navale") return "à la bataille navale";
  if (name === "La Tournée") return "à la tournée";
  // Les noms propres des jeux du site, sans article
  if (/^(Capitale|Mèche|Culbute|Escarmouche|Bolides|Crampons)$/.test(name)) return `à ${name}`;
  return `au ${name}`;
}

/** La ligne du joueur, ou null s'il n'y a rien de remarquable */
export function eveningLine(input: EveningInput): string | null {
  // Une série contre un même ami, la plus longue
  let best: { name: string; count: number; mine: boolean } | null = null;
  for (const r of input.rivals) {
    const s = streak(r.duels);
    if (s.count >= STREAK_MIN && (!best || s.count > best.count)) best = { name: r.name, ...s };
  }
  if (best) {
    return best.mine
      ? `Tu bats ${best.name} pour la ${best.count}e fois d'affilée ${atGame(input.gameName)}.`
      : `${best.name} te bat pour la ${best.count}e fois d'affilée ${atGame(input.gameName)}.`;
  }
  if (input.rank === 1 && input.winsInGame === 1) return `Ta toute première victoire ${atGame(input.gameName)} !`;
  if (input.rank === 1 && input.winsTonight >= 2) return `Ta ${input.winsTonight}e victoire de la soirée.`;
  return null;
}
