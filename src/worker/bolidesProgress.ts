// Ce que chacun a gagné en solo à Bolides (étoiles des coupes et des contre-la-montre, meilleurs temps), gardé par le
// système commun d'étoiles du site (src/worker/stars.ts). Seule la salle écrit, d'après ce qu'elle a vu de la course :
// le jeu d'un joueur ne fait que lire.

import { EMPTY_PROGRESS, type BolidesProgress } from "../shared/games/bolides/campaign.ts";
import type { StarAwardResult } from "../shared/stars.ts";
import { awardStars, starsOf } from "./stars.ts";

export interface ProgressStore {
  load(userId: string): Promise<BolidesProgress>;
  /**
   * Une coupe (`stars` : décidées par la salle) ou un contre-la-montre (`best` : le temps, d'où le serveur tire les
   * étoiles). Ne fait que monter : les étoiles gardent le plus grand nombre, le meilleur temps le plus petit.
   */
  award(userId: string, key: string, stars: number, best?: number): Promise<{ progress: BolidesProgress; result: StarAwardResult | null }>;
}

/** Les étoiles de Bolides dans la base du site */
export function d1Store(db: D1Database): ProgressStore {
  const load = async (userId: string): Promise<BolidesProgress> => {
    const game = (await starsOf(db, userId)).games.bolides;
    if (!game) return { stars: {}, best: {} };
    const progress: BolidesProgress = { stars: {}, best: {} };
    for (const [key, m] of Object.entries(game.maps)) {
      progress.stars[key] = m.stars;
      if (m.best !== null) progress.best[key] = m.best;
    }
    return progress;
  };
  return {
    load,
    async award(userId, key, stars, best) {
      const result = await awardStars(db, { userId, game: "bolides", map: key, ...(best !== undefined ? { value: best } : { stars }) });
      return { progress: await load(userId), result };
    },
  };
}

/** Une progression en mémoire (les tests) */
export function memoryStore(): ProgressStore {
  const all = new Map<string, BolidesProgress>();
  const get = (userId: string) => all.get(userId) ?? { stars: {}, best: {} };
  const copy = (p: BolidesProgress) => ({ stars: { ...p.stars }, best: { ...p.best } });
  return {
    async load(userId) {
      return copy(get(userId));
    },
    async award(userId, key, stars, best) {
      const p = get(userId);
      p.stars[key] = Math.max(p.stars[key] ?? 0, Math.max(0, Math.min(3, Math.round(stars))));
      if (best !== undefined && Number.isFinite(best) && best > 0) p.best[key] = Math.min(p.best[key] ?? Infinity, Math.round(best));
      all.set(userId, p);
      return { progress: copy(p), result: null };
    },
  };
}

let override: ProgressStore | null = null;

/** Le stockage de la progression : la base du site, sauf dans les tests */
export function progressStore(env: Env): ProgressStore {
  return override ?? d1Store(env.DB);
}

export function useProgressStore(next: ProgressStore | null) {
  override = next;
}

export { EMPTY_PROGRESS };
