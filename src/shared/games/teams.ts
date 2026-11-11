// Les équipes de la tournée, vues des jeux où chacun joue pour soi : les points de chacun s'additionnent par équipe.

/** L'équipe de chaque joueur, ou null hors équipes */
export type Teams = Record<string, 0 | 1> | null;

/**
 * Il ne reste en jeu que des joueurs d'une même équipe : la suite ne changerait plus rien au score des équipes,
 * la partie peut s'arrêter. Il en faut au moins deux (un seul joueur restant, c'est la fin ordinaire).
 */
export function oneTeamLeft(teams: Teams | undefined, ids: readonly string[]): boolean {
  if (!teams || ids.length < 2) return false;
  const first = teams[ids[0]!];
  return first !== undefined && ids.every((id) => teams[id] === first);
}
