import type { CapitaleEvent } from "./engine.ts";

// Le rythme de ce qu'on voit à l'écran : le salon s'y cale pour ne pas faire rejouer un bot (ni partir un chrono)
// avant que tout le monde ait vu le coup précédent.

/** Les dés sont lancés et roulent, puis le pion avance case par case */
export const DICE_MS = 1400;
export const HOP_MS = 180;
export const JUMP_MS = 650;
export const CARD_MS = 900;

/** Le temps que prend un événement à l'écran */
function durationOf(e: CapitaleEvent): number {
  switch (e.type) {
    case "dice":
      return DICE_MS;
    case "move":
      return e.jump ? JUMP_MS : Math.abs(e.steps) * HOP_MS + 160;
    case "card":
      return CARD_MS;
    case "money":
      return 260;
    case "build":
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
