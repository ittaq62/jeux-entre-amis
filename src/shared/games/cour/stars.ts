// Les étoiles de La Cour des Grands : une carte par chapitre de la campagne, le score de l'épreuve (0 à 100) pour mesure.
// Les trophées en plus : toutes les étoiles de la saison, et des paliers.

import type { StarGame } from "../../stars.ts";
import { CHAPTER_GOALS, CHAPTERS } from "./campaign.ts";

export const COUR_STARS: StarGame = {
  game: "cour",
  name: "La Cour des Grands",
  maps: CHAPTERS.map((c) => ({ id: c.id, name: c.title, rule: { better: "higher", goals: CHAPTER_GOALS, unit: "points" } })),
  groups: [
    { id: "recre", name: "la récré", maps: ["soleil", "biscuit", "corde", "nenuphars"] },
    { id: "kermesse", name: "la kermesse", maps: ["chaises", "billes", "marelle", "epervier"] },
  ],
  milestones: [9, 18],
};
