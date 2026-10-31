import type { CapitaleEvent } from "../../shared/games/capitale/engine.ts";
import { play, type SoundName } from "../lib/sound.ts";

/** Le rythme des animations : les dés roulent, puis le pion avance case par case */
export const DICE_MS = 850;
export const HOP_MS = 150;
export const JUMP_MS = 450;
export const CARD_MS = 700;

/** Les sons de la table, préchargés à l'arrivée : tous viennent des autres jeux du site */
export const CAPITALE_SOUNDS: SoundName[] = [
  "tourShake",
  "tourThrow",
  "tourChip",
  "tourVote",
  "tourFlip",
  "tourRules",
  "tourReveal",
  "tourMusic",
  "brickLock",
  "cardSlide",
  "cardPlace",
  "caught",
  "eliminated",
  "yourTurn",
  "wild",
  "pop",
  "tick",
  "win",
  "lose",
  "buzzer",
];

/** Le moment (en ms depuis l'arrivée du lot) où chaque événement se voit à l'écran */
export function eventTimes(events: CapitaleEvent[]): number[] {
  let t = 0;
  return events.map((e) => {
    const at = t;
    if (e.type === "dice") t += DICE_MS;
    else if (e.type === "move") t += e.jump ? JUMP_MS : Math.abs(e.steps) * HOP_MS + 120;
    else if (e.type === "card") t += CARD_MS;
    else if (e.type === "money" || e.type === "buy" || e.type === "build" || e.type === "auctionEnd") t += 180;
    return at;
  });
}

/** Les sons d'un lot d'événements, chacun à son moment */
export function playCapitaleEvents(events: CapitaleEvent[], seat: string | null) {
  const times = eventTimes(events);
  events.forEach((e, i) => {
    const delay = times[i]!;
    switch (e.type) {
      case "dice":
        play("tourShake", { delay, volume: 0.8 });
        play("tourThrow", { delay: delay + 520 });
        return;
      case "move":
        if (e.jump) play("wild", { delay, volume: 0.6 });
        else play("cardPlace", { delay: delay + Math.abs(e.steps) * HOP_MS, volume: 0.7 });
        return;
      case "money":
        if (e.reason === "rent") {
          play("tourChip", { delay });
          play("tourChip", { delay: delay + 130, rate: 1.1 });
        } else if (e.reason === "go" || e.reason === "pot" || e.reason === "card" || e.reason === "trade" || e.reason === "bankrupt") {
          play("tourChip", { delay, volume: 0.8 });
        } else if (e.reason === "tax" || e.reason === "jail" || e.reason === "interest") {
          play("tourChip", { delay, rate: 0.85 });
        } else if (e.reason === "sell" || e.reason === "mortgage" || e.reason === "unmortgage") {
          play("cardSlide", { delay });
        }
        return;
      case "buy":
        play("tourRules", { delay });
        return;
      case "card":
        play("tourFlip", { delay });
        return;
      case "jail":
        play("caught", { delay, volume: 0.7 });
        return;
      case "leaveJail":
        play("tourVote", { delay });
        return;
      case "auction":
        play("tourReveal", { delay });
        return;
      case "bid":
        play("tourVote", { delay, rate: e.player === seat ? 1 : 1.12 });
        return;
      case "auctionEnd":
        if (e.winner) play("tourRules", { delay });
        return;
      case "build":
        play("brickLock", { delay, rate: e.houses === 5 ? 0.85 : 1 });
        return;
      case "sell":
        play("cardSlide", { delay });
        return;
      case "trade":
        if (e.status === "proposed") play("pop", { delay });
        else if (e.status === "accepted") play("tourRules", { delay });
        return;
      case "bankrupt":
        play("eliminated", { delay });
        return;
      case "timeUp":
        play("tick", { delay, volume: 0.8 });
        return;
      default:
        return;
    }
  });
}
