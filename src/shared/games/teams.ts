// Les équipes, vues des jeux où chacun joue pour soi : les points de chacun s'additionnent par équipe.
// La tournée en fait deux (0 et 1) ; Capitale, UNO et Mèche en acceptent jusqu'à trois à leurs propres tables.

/** L'équipe de chaque joueur (0, 1, 2…), ou null hors équipes */
export type Teams = Record<string, number> | null;

/** Les équipes des tables : les deux premières sont celles de la tournée (mêmes noms, mêmes couleurs) */
export const TABLE_TEAMS = [
  { name: "Rouges", color: "#d4453c" },
  { name: "Bleus", color: "#3f7fd8" },
  { name: "Verts", color: "#2e9d59" },
] as const;

/** À une table : chacun pour soi (0), ou deux ou trois équipes */
export const TABLE_TEAM_COUNTS = [0, 2, 3] as const;
export type TableTeamCount = (typeof TABLE_TEAM_COUNTS)[number];

export const tableTeamName = (team: number) => TABLE_TEAMS[team]?.name ?? `Équipe ${team + 1}`;

/**
 * Il ne reste en jeu que des joueurs d'une même équipe : la suite ne changerait plus rien au score des équipes,
 * la partie peut s'arrêter. Il en faut au moins deux (un seul joueur restant, c'est la fin ordinaire).
 */
export function oneTeamLeft(teams: Teams | undefined, ids: readonly string[]): boolean {
  if (!teams || ids.length < 2) return false;
  const first = teams[ids[0]!];
  return first !== undefined && ids.every((id) => teams[id] === first);
}

/** L'ordre du tour : les équipes à tour de rôle (le premier de chaque, puis le deuxième…), chacun dans l'ordre des sièges */
export function alternateTeams(ids: readonly string[], teams: Teams | undefined): string[] {
  if (!teams) return [...ids];
  const order = [...new Set(ids.map((id) => teams[id] ?? -1))];
  const crews = order.map((t) => ids.filter((id) => (teams[id] ?? -1) === t));
  const out: string[] = [];
  for (let k = 0; out.length < ids.length; k++) for (const c of crews) if (c[k]) out.push(c[k]!);
  return out;
}

/** L'équipe la moins remplie (la première à égalité), pour qui s'assoit */
export function emptierTeam(seats: readonly { team?: number }[], count: number): number {
  const sizes = Array.from({ length: count }, (_, t) => seats.filter((s) => s.team === t).length);
  return sizes.indexOf(Math.min(...sizes));
}

/** Les équipes réparties à tour de rôle, dans l'ordre des sièges (au changement du nombre d'équipes) */
export function dealTeams(seats: { team?: number }[], count: number) {
  seats.forEach((s, i) => {
    if (count) s.team = i % count;
    else delete s.team;
  });
}

/** Pourquoi les équipes ne permettent pas encore de jouer (tailles inégales, moins de deux par équipe), ou null */
export function teamProblem(seats: readonly { team?: number }[], count: number): string | null {
  if (!count) return null;
  const sizes = Array.from({ length: count }, (_, t) => seats.filter((s) => s.team === t).length);
  if (sizes.every((n) => n === sizes[0]) && sizes[0]! >= 2) return null;
  return `En équipes, il faut au moins deux joueurs par équipe, autant dans chacune : c'est ${sizes.join(" contre ")} pour l'instant.`;
}

/** Les équipes dans l'ordre où leur meilleur joueur apparaît au classement */
export function teamsByBest(ranking: readonly string[], teams: Record<string, number>): number[] {
  return [...new Set(ranking.map((id) => teams[id]).filter((t): t is number => t !== undefined))];
}

/**
 * Le rang de chacun quand on gagne ensemble : toute l'équipe a la place de l'équipe, et les suivantes viennent
 * après tous ses joueurs (1, 1, 3, 3 à deux contre deux ; 1, 1, 3, 3, 5, 5 à trois équipes de deux).
 */
export function teamRanks(order: readonly number[], teams: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let place = 1;
  for (const t of order) {
    const crew = Object.keys(teams).filter((id) => teams[id] === t);
    for (const id of crew) out[id] = place;
    place += crew.length;
  }
  return out;
}

/** Les places qui vont avec les équipes : un nombre pair (au moins quatre) à deux équipes, six à trois */
export function teamTableSize(max: number, count: number, cap: number): number {
  if (count === 2) return Math.min(cap, Math.max(4, max % 2 === 1 ? max + 1 : max));
  if (count === 3) return Math.min(cap, 6);
  return max;
}
