import { DECKS, type DeckId } from "../../shared/games/capitale/board.ts";
import type { CapitaleEvent } from "../../shared/games/capitale/engine.ts";
import { eventTimes } from "../../shared/games/capitale/timing.ts";
import { play, type SoundName } from "../lib/sound.ts";
import { cardArt, type CardArtKey } from "./CardArt.tsx";

export { cardReadMs, DICE_MS, eventTimes, HOP_MS, JUMP_MS } from "../../shared/games/capitale/timing.ts";

type Cue = { name: SoundName; rate?: number; volume?: number; at?: number };

/**
 * Ce que raconte chaque carte, en son, au moment où elle se retourne. L'argent gagné ou payé sonne ensuite de
 * lui-même, quand il bouge ; ici, c'est l'histoire : la fête, le dentiste, les travaux, le train qui part.
 */
const CARD_CUES: Partial<Record<CardArtKey, Cue[]>> = {
  party: [{ name: "tourApplause", volume: 0.85 }],
  gift: [{ name: "tourApplause", volume: 0.6 }],
  mayor: [{ name: "tourApplause", volume: 0.7 }],
  tooth: [{ name: "capLose" }],
  cross: [{ name: "capLose" }],
  gradcap: [{ name: "capLose" }],
  speed: [{ name: "capLose" }],
  police: [{ name: "buzzer", volume: 0.55 }],
  tools: [{ name: "capBuildBig" }],
  bulb: [{ name: "buzzer", rate: 0.7, volume: 0.4 }],
  boules: [
    { name: "capDiceHit", rate: 0.72 },
    { name: "capDiceHit", rate: 0.8, at: 190 },
  ],
  train: [{ name: "wild", volume: 0.5 }],
  start: [{ name: "wild", volume: 0.45 }],
  heart: [{ name: "wild", volume: 0.4 }],
  pin: [{ name: "wild", volume: 0.4 }],
  chart: [{ name: "capBigMoney", volume: 0.7 }],
  bank: [{ name: "capBigMoney", volume: 0.7 }],
  chest: [{ name: "capBigMoney", volume: 0.7 }],
  umbrella: [{ name: "capBigMoney", volume: 0.6 }],
};

function cardCues(deck: DeckId, card: number): Cue[] {
  const art = cardArt(deck, card);
  // La clé : sortie de prison gardée (bonne nouvelle), ou clés oubliées (on recule)
  if (art === "key") return DECKS[deck][card]?.effect.kind === "jailFree" ? [{ name: "capDeal" }] : [{ name: "capLose" }];
  return CARD_CUES[art] ?? [];
}

/** La carte apparaît, se retourne : on entend son histoire à ce moment-là */
const CARD_FLIP_MS = 1100;

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
  "capAuction",
  "capDeal",
  "capTurn",
  "capBankrupt",
  "capLose",
  "tourFlip",
  "tourVote",
  "tourThrow",
  "tourMusic",
  "tourApplause",
  "cardSlide",
  "wild",
  "pop",
  "tick",
  "buzzer",
];

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
        } else if (e.reason === "trade" || e.reason === "gift") {
          play("capBills", { delay });
        } else if (e.reason === "tax" || e.reason === "jail" || e.reason === "interest") {
          play("capBills", { delay, rate: 0.9 });
        } else if (e.reason === "sell" || e.reason === "mortgage") {
          play("capCoins", { delay, volume: 0.7 });
        } else if (e.reason === "unmortgage") {
          play("capBills", { delay });
        }
        return;
      }
      case "buy":
        play("capBuy", { delay });
        return;
      case "card":
        play("tourFlip", { delay });
        for (const c of cardCues(e.deck, e.card))
          play(c.name, { delay: delay + CARD_FLIP_MS + (c.at ?? 0), rate: c.rate, volume: c.volume });
        return;
      case "jail":
        // Le saut vers la cellule est juste avant : la porte claque quand le pion arrive
        play("capJail", { delay });
        return;
      case "leaveJail":
        play("tourVote", { delay });
        return;
      case "auction":
        play("capAuction", { delay, volume: 0.8 });
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
        else if (e.status === "accepted") play("capDeal", { delay });
        return;
      case "bankrupt":
        play("capBankrupt", { delay });
        return;
      case "timeUp":
        play("tick", { delay, volume: 0.8 });
        return;
      case "gift":
        play("capDeal", { delay, volume: 0.8 });
        return;
      case "monopoly":
        // Monopole : la partie s'arrête net, le gong des enchères puis les applaudissements
        play("capGavel", { delay });
        play("tourApplause", { delay: delay + 400 });
        return;
      default:
        return;
    }
  });
}
