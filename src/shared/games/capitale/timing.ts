import { DECKS, type DeckId } from "./board.ts";
import type { CapitaleEvent } from "./engine.ts";

// Le rythme de ce qu'on voit à l'écran : le salon s'y cale pour ne pas faire rejouer un bot (ni partir un chrono)
// avant que tout le monde ait vu le coup précédent.

/** Les dés sont lancés et roulent, puis le pion avance case par case */
export const DICE_MS = 1400;
export const HOP_MS = 180;
export const JUMP_MS = 650;

/** Le temps de lire une carte avant qu'elle agisse : plus le texte est long, plus elle reste à l'écran */
export function cardReadMs(deck: DeckId, card: number): number {
  const length = DECKS[deck][card]?.text.length ?? 40;
  return Math.min(4200, Math.max(2600, 1500 + length * 22));
}

/** Le temps que prend un événement à l'écran */
function durationOf(e: CapitaleEvent): number {
  switch (e.type) {
    case "dice":
      return DICE_MS;
    case "move":
      return e.jump ? JUMP_MS : Math.abs(e.steps) * HOP_MS + 160;
    case "card":
      return cardReadMs(e.deck, e.card);
    case "money":
    case "teamFree":
      return 260;
    case "gift":
      return 320;
    case "monopoly":
      // Le temps de voir les titres de la victoire s'allumer avant le bilan
      return 1800;
    case "upgrade":
    case "special":
      return 520;
    case "buy":
    case "auctionEnd":
    case "sell":
    case "raze":
      return 320;
    default:
      return 0;
  }
}

/** Le moment (en ms depuis l'arrivée du lot) où chaque événement se voit à l'écran */
export function eventTimes(events: CapitaleEvent[]): number[] {
  let t = 0;
  return events.map((e) => {
    const at = t;
    t += durationOf(e);
    return at;
  });
}

/** La durée d'un lot à l'écran, jusqu'à la fin de son dernier événement */
export function batchMs(events: CapitaleEvent[]): number {
  return events.reduce((t, e) => t + durationOf(e), 0);
}
