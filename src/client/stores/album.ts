import { useEffect } from "react";
import { create } from "zustand";
import type { AlbumResponse, CardFamily, PackResponse } from "../../shared/cards.ts";
import { api } from "../lib/api.ts";
import { useShop } from "./shop.ts";

interface AlbumState {
  loaded: boolean;
  owned: Record<string, number>;
  packs: number;
  load: () => Promise<void>;
  /** Ces actions lèvent une erreur si le serveur refuse */
  openPack: () => Promise<PackResponse>;
  sell: (card: string | null) => Promise<void>;
  craft: (card: string) => Promise<CardFamily[]>;
}

const set2 = (r: AlbumResponse) => {
  useShop.setState({ balance: r.balance });
  return { loaded: true, owned: r.owned, packs: r.packs };
};

export const useAlbum = create<AlbumState>((set) => ({
  loaded: false,
  owned: {},
  packs: 0,
  load: async () => {
    try {
      set(set2(await api.get<AlbumResponse>("/cards")));
    } catch {
      // Pas de réseau : on garde ce qu'on sait
    }
  },
  openPack: async () => {
    const r = await api.post<PackResponse>("/cards/pack");
    set(set2(r));
    return r;
  },
  sell: async (card) => {
    set(set2(await api.post<AlbumResponse>("/cards/sell", { card })));
  },
  craft: async (card) => {
    const r = await api.post<AlbumResponse & { completed: CardFamily[] }>("/cards/craft", { card });
    set(set2(r));
    return r.completed;
  },
}));

/** L'album du joueur, relu quand le composant arrive à l'écran */
export function useMyAlbum() {
  const owned = useAlbum((s) => s.owned);
  const loaded = useAlbum((s) => s.loaded);
  const load = useAlbum((s) => s.load);
  const balance = useShop((s) => s.balance);
  useEffect(() => {
    void load();
  }, [load]);
  return { owned, loaded, balance };
}
