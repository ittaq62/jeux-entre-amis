import type { CapitaleState } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";

/** Les couleurs des pions, dans l'ordre des joueurs */
export const PAWN_COLORS = ["#e2453c", "#3f7fd8", "#2fa864", "#e8b12f", "#9b59d0", "#e07a3a"];

export function colorOf(g: CapitaleView, playerId: string | null | undefined): string {
  const i = g.players.findIndex((p) => p.id === playerId);
  return i >= 0 ? PAWN_COLORS[i % PAWN_COLORS.length]! : "transparent";
}

/** Les aides du moteur (construire, vendre…) lisent la vue comme l'état : elle en a tout ce qu'il faut */
export const asState = (g: CapitaleView) => g as unknown as CapitaleState;

/** Une somme en francs, le symbole collé au nombre (jamais seul en début de ligne) */
export const money = (n: number) => `${n.toLocaleString("fr-FR")} ₣`;
