import { useEffect } from "react";
import { create } from "zustand";
import type { GameStars, StarAwardResult, StarsResponse } from "../../shared/stars.ts";
import { api } from "../lib/api.ts";

interface StarsState {
  loaded: boolean;
  games: Record<string, GameStars>;
  load: () => Promise<void>;
  /** Après une partie : la salle a annoncé de nouvelles étoiles, on les note sans attendre le serveur */
  apply: (result: StarAwardResult) => void;
}

export const useStarsStore = create<StarsState>((set, get) => ({
  loaded: false,
  games: {},
  load: async () => {
    try {
      const r = await api.get<StarsResponse>("/stars");
      set({ loaded: true, games: r.games });
    } catch {
      // Pas de réseau : on garde ce qu'on sait
    }
  },
  apply: (r) => {
    const g = get().games[r.game];
    if (!g) return;
    const before = g.maps[r.map]?.stars ?? 0;
    const maps = { ...g.maps, [r.map]: { stars: r.stars, best: r.best } };
    set({ games: { ...get().games, [r.game]: { ...g, maps, total: g.total + Math.max(0, r.stars - before) } } });
  },
}));

/** Les étoiles d'un jeu, relues quand le composant arrive à l'écran ; null tant qu'elles ne sont pas là */
export function useGameStars(game: string): GameStars | null {
  const games = useStarsStore((s) => s.games);
  const loaded = useStarsStore((s) => s.loaded);
  const load = useStarsStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  return loaded ? (games[game] ?? null) : null;
}
