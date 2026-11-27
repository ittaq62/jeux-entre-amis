// Les étoiles de Toque ! dans le système commun (starMaps.ts) : une carte par cuisine de la campagne. Les seuils
// déclarés sont ceux d'une brigade de quatre, les plus durs : la salle calcule elle-même les étoiles selon le nombre
// de chefs (starsOf de sim.ts) et les passe telles quelles ; le score sert au record.

import type { StarGame } from "../../stars.ts";
import { KITCHEN_IDS, KITCHENS } from "./kitchens.ts";
import { starThresholds } from "./sim.ts";

export const TOQUE_STARS: StarGame = {
  game: "toque",
  name: "Toque !",
  maps: KITCHEN_IDS.map((id) => ({
    id,
    name: KITCHENS[id].name,
    rule: { better: "higher", goals: starThresholds(id, 4), unit: "points" },
  })),
  milestones: [9, 18, 27],
};
