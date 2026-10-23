import { create } from "zustand";
import type { Card } from "../../shared/games/uno/cards.ts";

/**
 * Pendant qu'un message s'anime, l'etat affiche est encore l'ancien : on garde ici
 * les cartes deja posees sur la pile et celles qui ont quitte la main, jusqu'a l'application du nouvel etat.
 */
interface PileExtras {
  cards: Card[];
  hidden: Set<number>;
  push: (card: Card) => void;
  hide: (id: number) => void;
  reset: () => void;
}

export const usePileExtras = create<PileExtras>((set, get) => ({
  cards: [],
  hidden: new Set(),
  push: (card) => set({ cards: [...get().cards, card] }),
  hide: (id) => set({ hidden: new Set(get().hidden).add(id) }),
  reset: () => set({ cards: [], hidden: new Set() }),
}));
