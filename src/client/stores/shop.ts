import { useEffect } from "react";
import { create } from "zustand";
import { canUse, type ShopResponse } from "../../shared/shop.ts";
import { api } from "../lib/api.ts";

interface ShopState {
  /** Les points qu'il reste à dépenser */
  balance: number;
  owned: ReadonlySet<string>;
  load: () => Promise<void>;
  /** Lève une erreur si l'achat est refusé */
  buy: (item: string) => Promise<void>;
}

const applied = (r: ShopResponse) => ({ balance: r.balance, owned: new Set(r.owned) });

export const useShop = create<ShopState>((set) => ({
  balance: 0,
  owned: new Set<string>(),
  load: async () => {
    try {
      set(applied(await api.get<ShopResponse>("/shop")));
    } catch {
      // Pas de réseau : on garde ce qu'on sait
    }
  },
  buy: async (item) => {
    set(applied(await api.post<ShopResponse>("/shop/buy", { item })));
  },
}));

/** Le solde et ce que possède le joueur, relus quand le composant arrive à l'écran */
export function useMyItems() {
  const balance = useShop((s) => s.balance);
  const owned = useShop((s) => s.owned);
  const load = useShop((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  return { balance, has: (item: string) => canUse(item, owned) };
}
