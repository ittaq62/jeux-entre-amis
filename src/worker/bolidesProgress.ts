// Ce que chacun a gagné en solo à Bolides (étoiles des coupes et des contre-la-montre, meilleurs temps). Seule la salle
// écrit, d'après ce qu'elle a vu de la course : le jeu d'un joueur ne fait que lire.
//
// Le stockage passe par cette interface. En attendant le système commun d'étoiles du site, la progression est gardée
// en mémoire par le serveur (elle tient tant qu'il tourne) ; l'interface ne changera pas quand elle ira en base.

import { EMPTY_PROGRESS, type BolidesProgress } from "../shared/games/bolides/campaign.ts";

export interface ProgressStore {
  load(userId: string): Promise<BolidesProgress>;
  /** Ne fait que monter : les étoiles gardent le plus grand nombre, le meilleur temps le plus petit */
  award(userId: string, key: string, stars: number, best?: number): Promise<BolidesProgress>;
}

/** Une progression en mémoire (le serveur de développement, les tests) */
export function memoryStore(): ProgressStore {
  const all = new Map<string, BolidesProgress>();
  const get = (userId: string) => all.get(userId) ?? { stars: {}, best: {} };
  return {
    async load(userId) {
      const p = get(userId);
      return { stars: { ...p.stars }, best: { ...p.best } };
    },
    async award(userId, key, stars, best) {
      const p = get(userId);
      p.stars[key] = Math.max(p.stars[key] ?? 0, Math.max(0, Math.min(3, Math.round(stars))));
      if (best !== undefined && Number.isFinite(best) && best > 0) p.best[key] = Math.min(p.best[key] ?? Infinity, Math.round(best));
      all.set(userId, p);
      return { stars: { ...p.stars }, best: { ...p.best } };
    },
  };
}

let store: ProgressStore = memoryStore();

/** Le stockage de la progression (remplacé par les tests, puis par le système commun d'étoiles) */
export function progressStore(): ProgressStore {
  return store;
}

export function useProgressStore(next: ProgressStore) {
  store = next;
}

export { EMPTY_PROGRESS };
