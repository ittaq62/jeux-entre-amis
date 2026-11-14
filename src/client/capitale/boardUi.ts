import { teamPlay, type CapitaleState } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import { pawnColor } from "./teamsUi.tsx";

/** Les couleurs des pions, dans l'ordre des joueurs (en équipes, des teintes de la couleur de l'équipe) */
export const PAWN_COLORS = ["#e2453c", "#3f7fd8", "#2fa864", "#e8b12f", "#9b59d0", "#e07a3a"];

export function colorOf(g: CapitaleView, playerId: string | null | undefined): string {
  if (!playerId || !g.players.some((p) => p.id === playerId)) return "transparent";
  return pawnColor(
    g.players.map((p) => p.id),
    teamPlay(g) ? g.teams : null,
    playerId,
  );
}

/** Les aides du moteur (construire, vendre…) lisent la vue comme l'état : elle en a tout ce qu'il faut */
export const asState = (g: CapitaleView) => g as unknown as CapitaleState;

/** Une somme en francs, le symbole collé au nombre (jamais seul en début de ligne) */
export const money = (n: number) => `${n.toLocaleString("fr-FR")} ₣`;

/** Ce qu'un joueur peut faire de ses titres maintenant : tout pendant son tour, vendre et hypothéquer pendant sa dette */
export function manageRights(g: CapitaleView, me: string | null): "full" | "raise" | null {
  if (!me || g.step === "over" || g.step === "auction") return null;
  if (g.debts.length > 0) return g.debts[0]!.debtor === me ? "raise" : null;
  if (g.players[g.turn]?.id !== me) return null;
  return g.step === "roll" || g.step === "buy" || g.step === "manage" ? "full" : null;
}
