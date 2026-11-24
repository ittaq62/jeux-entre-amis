// UNO : ce que l'écran dit d'une carte qu'on ne peut pas poser, à la place d'un « clic » muet.
import { COLOR_LABELS, drawValue, type Card } from "../../shared/games/uno/cards.ts";
import type { effectiveRules } from "../../shared/games/uno/engine.ts";
import type { UnoView } from "../../shared/games/uno/view.ts";

/** Pourquoi cette carte ne peut pas être posée maintenant (à son tour) : ce qu'on lit à la place du « clic » muet */
export function whyNot(card: Card, g: UnoView, rules: ReturnType<typeof effectiveRules>): string | null {
  if (g.rouletteVictim) return "Choisis d'abord la couleur de la roulette.";
  if (g.drawnCardId !== null) return "Seule la carte que tu viens de piocher peut partir.";
  if (g.pendingDraw > 0) {
    if (!rules.stacking) return `Pas de cumul à cette table : encaisse les +${g.pendingDraw}.`;
    // No Mercy : on répond à la dernière carte « + » posée (celle du dessus), pas au total accumulé
    if (rules.noMercy) return `Sous un +${drawValue(g.top)}, seule une carte « + » au moins aussi forte se cumule.`;
    if (g.top.kind === "wild4") return "Sur un +4, seul un autre +4 se cumule.";
    return "Sur un +2, seul un +2 ou un +4 se cumule.";
  }
  const color = COLOR_LABELS[g.color].toLowerCase();
  if (card.kind === "number") return g.top.kind === "number" ? `Il faut du ${color} ou un ${g.top.value}.` : `Il faut du ${color}.`;
  return `Il faut du ${color} ou le même symbole.`;
}
