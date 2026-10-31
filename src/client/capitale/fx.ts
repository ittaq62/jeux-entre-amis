import type { CapitaleEvent } from "../../shared/games/capitale/engine.ts";
import { play, type SoundName } from "../lib/sound.ts";

/** Le rythme des animations : les dés sont lancés et roulent, puis le pion avance case par case */
export const DICE_MS = 1400;
export const HOP_MS = 180;
export const JUMP_MS = 650;
export const CARD_MS = 900;

/** Les sons de la table, préchargés à l'arrivée */
export const CAPITALE_SOUNDS: SoundName[] = [
  "capDiceShake",
  "capDiceHit",
  "capHop",
  "capJump",
  "capBuild",
  "capBuildBig",
  "capGavel",
  "capBills",
  "capBuy",
  "capRent",
  "capCoins",
  "capJail",
  "capBigMoney",
  "tourFlip",
  "tourReveal",
  "tourVote",
  "tourRules",
  "tourThrow",
  "tourMusic",
  "cardSlide",
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
    else if (e.type === "move") t += e.jump ? JUMP_MS : Math.abs(e.steps) * HOP_MS + 160;
    else if (e.type === "card") t += CARD_MS;
    else if (e.type === "money") t += 260;
    else if (e.type === "buy" || e.type === "build" || e.type === "auctionEnd" || e.type === "special") t += 220;
    return at;
  });
}

/**
 * Les sons d'un lot d'événements, chacun à son moment. Les dés et les pas des pions sont joués par la scène 3D,
 * au rythme de ce qu'on voit (chaque choc de dé, chaque case).
 */
export function playCapitaleEvents(events: CapitaleEvent[], seat: string | null) {
  const times = eventTimes(events);
  events.forEach((e, i) => {
    const delay = times[i]!;
    switch (e.type) {
      case "move":
        if (e.jump) play("wild", { delay, volume: 0.45 });
        return;
      case "money": {
        const big = e.amount >= 500;
        if (e.reason === "rent") {
          play("capRent", { delay });
          play("capBills", { delay: delay + 60 });
          if (big) play("capBigMoney", { delay: delay + 200 });
        } else if (e.reason === "go") {
          play("capCoins", { delay });
        } else if (e.reason === "pot" || e.reason === "bankrupt") {
          play("capBigMoney", { delay });
          play("capCoins", { delay: delay + 120 });
        } else if (e.reason === "card") {
          play(e.to === "bank" || e.to === "pot" ? "capBills" : "capCoins", { delay });
        } else if (e.reason === "trade") {
          play("capBills", { delay });
        } else if (e.reason === "tax" || e.reason === "jail" || e.reason === "interest") {
          play("capBills", { delay, rate: 0.9 });
        } else if (e.reason === "sell" || e.reason === "mortgage") {
          play("capCoins", { delay, volume: 0.7 });
        } else if (e.reason === "unmortgage" || e.reason === "special") {
          play("capBills", { delay });
        } else if (e.reason === "ticket") {
          play("capCoins", { delay, rate: 1.1 });
        }
        return;
      }
      case "special":
        // Le chantier sonne quand le bâtiment sort de terre (la scène 3D) ; une nuisance s'annonce en plus
        if (e.kind === "centrale" || e.kind === "decharge") play("wild", { delay, volume: 0.5 });
        return;
      case "raze":
        if (e.how !== "bankrupt") play("cardSlide", { delay });
        return;
      case "buy":
        play("capBuy", { delay });
        return;
      case "card":
        play("tourFlip", { delay });
        return;
      case "jail":
        // Le saut vers la cellule est juste avant : la porte claque quand le pion arrive
        play("capJail", { delay });
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
        if (e.winner) play("capGavel", { delay });
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
