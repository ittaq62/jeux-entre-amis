import { COLORS, type Card, type CardKind } from "./cards.ts";

/** Regle de pitie : a partir de ce nombre de cartes en main, on est elimine. */
export const MERCY_LIMIT = 25;

/** Bonus de points par joueur elimine pendant la manche. */
export const MERCY_BONUS = 250;
export const NO_MERCY_TARGET = 1000;

/**
 * Jeu No Mercy (168 cartes) : par couleur 20 chiffres (deux de chaque, 0 compris),
 * 3 passe, 3 inversion, 3 +2, 3 defausse tout, 2 +4, 2 passe pour tous ;
 * 8 jokers inversion +4, 8 roulettes, 4 jokers +6, 4 jokers +10. Pas de joker simple.
 */
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
      ["draw2", 3],
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
