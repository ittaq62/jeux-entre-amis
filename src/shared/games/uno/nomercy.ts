import { COLORS, type Card, type CardKind } from "./cards.ts";

/** Regle de pitie : a partir de ce nombre de cartes en main, on est elimine. */
export const MERCY_LIMIT = 25;

/** Jeu No Mercy (168 cartes). */
export function buildNoMercyDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (const color of COLORS) {
    for (let value = 0; value <= 9; value++) {
      cards.push({ id: id++, kind: "number", color, value });
      cards.push({ id: id++, kind: "number", color, value });
    }
    const actions: [CardKind, number][] = [
      ["skip", 3],
      ["reverse", 3],
      ["draw2", 2],
      ["draw4", 2],
      ["skipAll", 2],
      ["discardAll", 3],
    ];
    for (const [kind, count] of actions) {
      for (let i = 0; i < count; i++) cards.push({ id: id++, kind, color });
    }
  }
  const wilds: [CardKind, number][] = [
    ["wildReverse4", 8],
    ["wild6", 4],
    ["wild10", 4],
    ["wildRoulette", 8],
  ];
  for (const [kind, count] of wilds) {
    for (let i = 0; i < count; i++) cards.push({ id: id++, kind, color: null });
  }
  return cards;
}
