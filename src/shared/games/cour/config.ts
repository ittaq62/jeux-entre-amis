// Ce que règle l'hôte avant le grand jeu : combien de candidats (les vrais joueurs, complétés par des bots), combien
// d'épreuves avant la finale, lesquelles peuvent tomber, et le niveau des bots.

import { EPREUVES, isEpreuve, type EpreuveId } from "./epreuves.ts";

export type BotLevel = "facile" | "moyen" | "fort";
/** Le nombre d'épreuves avant la finale : trois, cinq, ou toutes */
export type Duree = "courte" | "normale" | "longue";

export const CANDIDATE_CHOICES = [16, 24, 32, 40] as const;
export const DUREE_ROUNDS: Record<Duree, number> = { courte: 3, normale: 5, longue: 8 };
export const DUREE_NAMES: Record<Duree, string> = { courte: "Courte", normale: "Normale", longue: "Toutes les épreuves" };
export const LEVEL_NAMES: Record<BotLevel, string> = { facile: "Facile", moyen: "Moyen", fort: "Fort" };

export interface CourConfig {
  /** Les candidats au départ, vrais joueurs compris */
  candidates: number;
  duree: Duree;
  /** Les épreuves qui peuvent tomber (au moins une) ; le programme en tire dans cet ensemble */
  pool: Exclude<EpreuveId, "polochons">[];
  botLevel: BotLevel;
  /** Les cinématiques au complet (sinon, juste le titre de chaque épreuve) */
  cinema: boolean;
  /** Épreuves éclair : tous les chronos raccourcis (une règle à part, que le hasard peut tirer) */
  eclair: boolean;
  /** Une seule épreuve imposée (la tournée, la campagne, la page de travail) : pas de finale ensuite ; "" : le grand jeu */
  only: EpreuveId | "";
}

export const DEFAULT_CONFIG: CourConfig = {
  candidates: 32,
  duree: "normale",
  pool: [...EPREUVES],
  botLevel: "moyen",
  cinema: true,
  eclair: false,
  only: "",
};

/** Applique les réglages reçus, en refusant tout ce qui n'existe pas */
export function mergeConfig(current: CourConfig, patch: Partial<CourConfig>): CourConfig {
  const next: CourConfig = { ...DEFAULT_CONFIG, ...current, pool: [...(current.pool ?? DEFAULT_CONFIG.pool)] };
  if ((CANDIDATE_CHOICES as readonly number[]).includes(patch.candidates as number)) next.candidates = patch.candidates!;
  if (patch.duree === "courte" || patch.duree === "normale" || patch.duree === "longue") next.duree = patch.duree;
  if (patch.botLevel === "facile" || patch.botLevel === "moyen" || patch.botLevel === "fort") next.botLevel = patch.botLevel;
  if (typeof patch.cinema === "boolean") next.cinema = patch.cinema;
  if (typeof patch.eclair === "boolean") next.eclair = patch.eclair;
  if (Array.isArray(patch.pool)) {
    const pool = EPREUVES.filter((e) => patch.pool!.includes(e));
    if (pool.length > 0) next.pool = pool;
  }
  if (patch.only === "" || patch.only === "polochons" || isEpreuve(patch.only)) next.only = patch.only;
  return next;
}
