// Les étoiles : un avancement « comme en solo », carte par carte. Chaque carte (un circuit, un parcours, un niveau)
// donne de 1 à 3 étoiles selon le résultat, d'après trois seuils que son jeu définit. On garde la meilleure à vie.
// Les jeux déclarent leurs cartes dans starMaps.ts ; le serveur accorde les étoiles (src/worker/stars.ts), jamais l'écran.

export const MAX_STARS = 3;

export type StarCount = 0 | 1 | 2 | 3;

/** Les points offerts pour chaque étoile gagnée la première fois (on ne les touche pas deux fois) */
export const STAR_POINTS = 10;

/** Comment une carte se mesure */
export interface StarRule {
  /** « lower » : un temps ou un nombre de coups, le plus petit gagne ; « higher » : un score, le plus grand gagne */
  better: "lower" | "higher";
  /** Les seuils de la 1re, de la 2e et de la 3e étoile, de la plus facile à la plus dure (atteindre le seuil suffit) */
  goals: readonly [number, number, number];
  /** Pour écrire la valeur : un temps en millisecondes, des coups, des points */
  unit: "time" | "strokes" | "points";
}

export interface StarMap {
  /** L'identifiant de la carte dans son jeu (celui que la salle connaît) */
  id: string;
  name: string;
  rule: StarRule;
}

/** Des cartes qui vont ensemble (un parcours de neuf trous, les coupes, un thème) : un succès pour toutes leurs étoiles */
export interface StarGroup {
  /** Unique dans son jeu : il fait partie de l'identifiant du succès */
  id: string;
  /** « Le Volcan » : le succès s'appelle « Minigolf, le Volcan : toutes les étoiles » */
  name: string;
  maps: readonly string[];
}

export interface StarGame {
  /** L'identifiant du jeu (GameId) */
  game: string;
  name: string;
  maps: readonly StarMap[];
  /** Facultatif : des groupes de cartes, chacun avec son succès « toutes les étoiles » */
  groups?: readonly StarGroup[];
  /** Facultatif : des paliers d'étoiles du jeu entier, chacun avec son succès (« Bolides : 30 étoiles ») */
  milestones?: readonly number[];
}

/** Les étoiles d'un groupe de cartes, d'après celles de chaque carte */
export function groupStars(
  group: StarGroup,
  maps: Readonly<Record<string, { stars: number } | number | undefined>>,
): {
  total: number;
  max: number;
} {
  let total = 0;
  for (const id of group.maps) {
    const m = maps[id];
    const n = typeof m === "number" ? m : (m?.stars ?? 0);
    total += Math.max(0, Math.min(MAX_STARS, n));
  }
  return { total, max: group.maps.length * MAX_STARS };
}

/** Ce que vaut un résultat sur cette carte : 0 à 3 étoiles */
export function starsFor(value: number, rule: StarRule): StarCount {
  if (!Number.isFinite(value)) return 0;
  let stars: StarCount = 0;
  rule.goals.forEach((goal, i) => {
    if (rule.better === "lower" ? value <= goal : value >= goal) stars = (i + 1) as StarCount;
  });
  return stars;
}

/** La prochaine étoile à aller chercher et son seuil ; null quand les trois sont là */
export function nextStar(stars: number, rule: StarRule): { stars: StarCount; goal: number } | null {
  if (stars >= MAX_STARS) return null;
  const next = Math.max(0, stars) + 1;
  return { stars: next as StarCount, goal: rule.goals[next - 1]! };
}

/** Des seuils qui ont un sens : de plus en plus durs, dans le bon sens */
export function validRule(rule: StarRule): boolean {
  const [a, b, c] = rule.goals;
  if (![a, b, c].every((g) => Number.isFinite(g) && g >= 0)) return false;
  return rule.better === "lower" ? a > b && b > c : a < b && b < c;
}

/** Une valeur telle qu'on la lit : 1:05,3 pour un temps, « 23 coups », « 1 200 points » */
export function formatStarValue(value: number, unit: StarRule["unit"]): string {
  if (unit === "time") {
    const tenths = Math.round(value / 100);
    const min = Math.floor(tenths / 600);
    const sec = Math.floor((tenths % 600) / 10);
    const t = tenths % 10;
    return min > 0 ? `${min}:${String(sec).padStart(2, "0")},${t}` : `${sec},${t} s`;
  }
  const n = Math.round(value);
  const word = unit === "strokes" ? "coup" : "point";
  return `${n.toLocaleString("fr-FR")} ${word}${n > 1 ? "s" : ""}`;
}

// Ce qu'échangent le site et le serveur

export interface MapStars {
  stars: StarCount;
  /** Le meilleur résultat sur la carte (dans l'unité de sa règle), null si le jeu a donné les étoiles directement */
  best: number | null;
}

export interface GameStars {
  /** Les cartes où le joueur a déjà au moins joué une fois avec une étoile en jeu */
  maps: Record<string, MapStars>;
  /** Les étoiles gagnées, et le nombre qu'il y a à gagner dans ce jeu */
  total: number;
  max: number;
}

export interface StarsResponse {
  games: Record<string, GameStars>;
}

/** Ce que la salle reçoit d'awardStars, pour l'annoncer au joueur */
export interface StarAwardResult {
  game: string;
  map: string;
  /** Les étoiles de la carte après cette partie (la meilleure à vie), et celles d'avant */
  stars: StarCount;
  previous: StarCount;
  /** Les étoiles de cette partie seulement (on peut faire moins bien que son record) */
  earned: StarCount;
  best: number | null;
  /** Les points offerts pour les nouvelles étoiles */
  points: number;
  /** Les succès débloqués par ces étoiles */
  unlocked: string[];
}
