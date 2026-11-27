// Les jeux qui ont des étoiles, et leurs cartes. Chaque jeu décrit ses cartes dans son propre dossier
// (src/shared/games/<jeu>/stars.ts, un StarGame) et ajoute une ligne ici : rien d'autre à toucher pour que le serveur
// accorde les étoiles, que le profil les compte et que les succès d'étoiles existent.
//
//   import { BOLIDES_STARS } from "./games/bolides/stars.ts";
//   export const STAR_GAMES: readonly StarGame[] = [BOLIDES_STARS];

import { BOLIDES_STARS } from "./games/bolides/stars.ts";
import { COUR_STARS } from "./games/cour/stars.ts";
import { MINIGOLF_STARS } from "./games/minigolf/starCourses.ts";
import { TOQUE_STARS } from "./games/toque/stars.ts";
import type { StarGame, StarMap } from "./stars.ts";

export const STAR_GAMES: readonly StarGame[] = [MINIGOLF_STARS, BOLIDES_STARS, TOQUE_STARS, COUR_STARS];

export const STAR_GAME_BY_ID = new Map(STAR_GAMES.map((g) => [g.game, g]));

/** La carte d'un jeu à étoiles, undefined si le jeu ou la carte n'en ont pas */
export function starMap(game: string, map: string): StarMap | undefined {
  return STAR_GAME_BY_ID.get(game)?.maps.find((m) => m.id === map);
}

/** Toutes les étoiles qu'il y a à gagner dans un jeu */
export function maxStars(game: string): number {
  return (STAR_GAME_BY_ID.get(game)?.maps.length ?? 0) * 3;
}
