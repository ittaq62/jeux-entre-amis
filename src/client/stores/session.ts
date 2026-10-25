import { create } from "zustand";
import { api } from "../lib/api.ts";
import type { GameId, Me, MeResponse, TableGame } from "../../shared/protocol.ts";

interface SessionState {
  loaded: boolean;
  user: Me | null;
  pending: { email: string } | null;
  /** Jeux visibles dans les menus de ce compte */
  games: GameId[];
  /** La tournée est ouverte à ce compte */
  tour: boolean;
  /** Jeux (et tournée) encore en bêta (seulement pour les admins) */
  beta: TableGame[];
  load: () => Promise<void>;
  apply: (res: MeResponse) => void;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  loaded: false,
  user: null,
  pending: null,
  games: ["uno"],
  tour: false,
  beta: [],
  load: async () => {
    try {
      const res = await api.get<MeResponse>("/me");
      set({
        loaded: true,
        user: res.user,
        pending: res.pending,
        games: res.games ?? ["uno"],
        tour: res.tour ?? false,
        beta: res.beta ?? [],
      });
    } catch {
      set({ loaded: true, user: null, pending: null });
    }
  },
  apply: (res) =>
    set((s) => ({
      user: res.user,
      pending: res.pending,
      loaded: true,
      games: res.games ?? s.games,
      tour: res.tour ?? s.tour,
      beta: res.beta ?? s.beta,
    })),
  logout: async () => {
    await api.post("/auth/logout").catch(() => {});
    set({ user: null, pending: null, games: ["uno"], tour: false, beta: [] });
  },
}));
