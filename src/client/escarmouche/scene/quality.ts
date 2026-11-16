// La qualité de l'image d'Escarmouche : basse (téléphones modestes : matières simples, pas d'ombres), moyenne (relief
// des matières, ombres), haute (en plus : ombres fines, halo, étalonnage, lissage, plus d'arbres). « Auto » choisit
// selon l'appareil ; le jeu baisse encore la définition tout seul s'il peine.

export type Quality = "bas" | "moyen" | "haut";
export type QualityPref = "auto" | Quality;

export function pickQuality(pref: QualityPref, touch: boolean): Quality {
  if (pref !== "auto") return pref;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (touch) return memory <= 3 ? "bas" : "moyen";
  return memory <= 2 ? "moyen" : "haut";
}

export const QUALITY_NAMES: Record<QualityPref, string> = {
  auto: "Automatique",
  bas: "Basse",
  moyen: "Moyenne",
  haut: "Haute",
};
