// Les étoiles du minigolf, cartes du système commun (src/shared/stars.ts, déclarées dans starMaps.ts) : chaque trou est
// une carte (« volcan:3 »), qui donne 1 étoile fini dans la limite de coups, 2 au par, 3 sous le par. On garde la
// meilleure de chaque trou, d'une partie à l'autre ; la salle les accorde (minigolfRoom.ts), sur tout trou joué aux règles
// du parcours. Chaque parcours est un groupe : ses 27 étoiles, et le succès « Minigolf, le Volcan : toutes les étoiles »
// (tous ses trous sous le par).
// L'aventure ouvre les parcours dans cet ordre : le suivant quand chaque trou du précédent a une étoile.
// Ce fichier reste léger (le site entier le charge, par starMaps.ts) : le nom et le par des trous y sont recopiés, et un
// test vérifie qu'ils suivent les vrais parcours (courses.ts).

import { groupStars, type GameStars, type StarGame, type StarGroup } from "../../stars.ts";

export const STAR_COURSES = [
  { id: "jardin", name: "Jardin du château", the: "Le Jardin du château", pars: [2, 3, 3, 3, 3, 4, 3, 4, 3] },
  { id: "mer", name: "Bord de mer", the: "Le Bord de mer", pars: [2, 3, 3, 3, 3, 4, 3, 4, 3] },
  { id: "montagne", name: "Montagne enneigée", the: "La Montagne enneigée", pars: [2, 3, 3, 3, 3, 3, 3, 3, 4] },
  { id: "cuisine", name: "Cuisine géante", the: "La Cuisine géante", pars: [2, 3, 3, 3, 3, 3, 3, 3, 3] },
  { id: "jungle", name: "Temple dans la jungle", the: "Le Temple dans la jungle", pars: [2, 3, 3, 3, 4, 3, 3, 3, 4] },
  { id: "horloger", name: "Atelier d'horloger", the: "L'Atelier d'horloger", pars: [2, 3, 4, 3, 3, 3, 3, 3, 3] },
  { id: "lune", name: "Base lunaire", the: "La Base lunaire", pars: [2, 3, 3, 3, 3, 3, 3, 3, 4] },
  { id: "volcan", name: "Volcan", the: "Le Volcan", pars: [3, 3, 3, 3, 4, 3, 3, 3, 4] },
] as const;

export type StarCourse = (typeof STAR_COURSES)[number];

/** La carte d'un trou : « volcan:3 » (le trou compté de 1 à 9) */
export function holeMap(course: string, index: number): string {
  return `${course}:${index + 1}`;
}

/** Les trois seuils d'un trou, en coups : fini dans la limite (par + 5), au par, sous le par */
export function holeGoals(par: number): [number, number, number] {
  return [par + 5, par, par - 1];
}

/** Un parcours comme groupe de cartes : ses neuf trous */
export function courseGroup(c: StarCourse): StarGroup {
  return { id: c.id, name: c.the, maps: c.pars.map((_, i) => holeMap(c.id, i)) };
}

export const MINIGOLF_STARS: StarGame = {
  game: "minigolf",
  name: "Minigolf",
  maps: STAR_COURSES.flatMap((c) =>
    c.pars.map((par, i) => ({
      id: holeMap(c.id, i),
      name: `${c.name}, trou ${i + 1}`,
      rule: { better: "lower" as const, goals: holeGoals(par), unit: "strokes" as const },
    })),
  ),
  // Un succès par parcours (ses 27 étoiles : tous ses trous sous le par), et des paliers
  groups: STAR_COURSES.map(courseGroup),
  milestones: [27, 54, 162],
};

/** Les étoiles d'un parcours pour ce joueur : chaque trou (0 à 3), le total sur 27, la plus petite */
export function courseStars(
  stars: GameStars | null | undefined,
  c: StarCourse,
): { holes: number[]; total: number; max: number; min: number } {
  const holes = c.pars.map((_, i) => stars?.maps[holeMap(c.id, i)]?.stars ?? 0);
  const { total, max } = groupStars(courseGroup(c), stars?.maps ?? {});
  return { holes, total, max, min: Math.min(...holes) };
}

/** Le parcours s'ouvre-t-il dans l'aventure ? Le premier toujours ; les autres quand chaque trou du précédent a une étoile */
export function courseOpen(stars: GameStars | null | undefined, course: string): boolean {
  const k = STAR_COURSES.findIndex((c) => c.id === course);
  if (k <= 0) return k === 0;
  return courseStars(stars, STAR_COURSES[k - 1]!).min >= 1;
}
