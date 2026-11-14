// Les équipes, vues des jeux où chacun joue pour soi : les points de chacun s'additionnent par équipe.
// La tournée en fait deux (0 et 1) ; Capitale en accepte jusqu'à trois à ses propres tables.

/** L'équipe de chaque joueur (0, 1, 2…), ou null hors équipes */
export type Teams = Record<string, number> | null;

/**
 * Il ne reste en jeu que des joueurs d'une même équipe : la suite ne changerait plus rien au score des équipes,
 * la partie peut s'arrêter. Il en faut au moins deux (un seul joueur restant, c'est la fin ordinaire).
 */
export function oneTeamLeft(teams: Teams | undefined, ids: readonly string[]): boolean {
  if (!teams || ids.length < 2) return false;
  const first = teams[ids[0]!];
  return first !== undefined && ids.every((id) => teams[id] === first);
}
