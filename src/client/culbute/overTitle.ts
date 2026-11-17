// Le titre de l'écran de fin de Culbute : qui gagne, quelle équipe, ou l'égalité.

import type { CulbuteView } from "../../shared/games/culbute/view.ts";

/** Les places de 1 (gagnants) à n, et le titre qui va avec ; `nameOf` donne le nom d'un combattant */
export function overTitle(view: Pick<CulbuteView, "config" | "fighters" | "ranks">, nameOf: (slot: number) => string | undefined): string {
  const ranks = view.ranks ?? [];
  const winners = view.fighters.map((f) => f.slot).filter((i) => ranks[i] === 1);
  if (winners.length === 0) return "Fin du combat";
  if (view.config.teams) {
    const teams = new Set(winners.map((i) => view.fighters[i]!.team));
    // Deux équipes à égalité (au temps, souvent 0 à 0) : pas de vainqueur
    if (teams.size > 1) return "Égalité";
    return `Victoire des ${view.fighters[winners[0]!]!.team === 0 ? "Rouges" : "Bleus"}`;
  }
  return winners.length === 1 ? `${nameOf(winners[0]!) ?? "?"} gagne !` : "Égalité en tête";
}
