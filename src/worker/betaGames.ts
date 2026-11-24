// Les jeux encore en bêta ne sont visibles que des administrateurs (et de ceux qu'ils invitent), tant que la page Admin ne
// les a pas ouverts à tous : le réglage « <jeu>_public » vaut alors 1.

import { BETA_GAMES, type TableGame } from "../shared/protocol.ts";

/** Les jeux (et la tournée) en bêta que l'administrateur a ouverts à tous */
export async function openGames(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT key FROM site_settings WHERE substr(key, -7) = '_public' AND value = '1'")
    .all<{ key: string }>();
  return new Set(results.map((r) => r.key.slice(0, -"_public".length)));
}

/** Ce jeu est-il ouvert à ce compte : sorti de la bêta, ou le compte est administrateur */
export function gameOpenTo(game: TableGame, open: Set<string>, admin: boolean): boolean {
  return admin || !(BETA_GAMES as readonly string[]).includes(game) || open.has(game);
}
