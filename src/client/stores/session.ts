import { create } from "zustand";
import { api } from "../lib/api.ts";
import type { GameId, Me, MeResponse } from "../../shared/protocol.ts";

interface SessionState {
  loaded: boolean;
  user: Me | null;
  pending: { email: string } | null;
  /** Jeux visibles dans les menus de ce compte */
  games: GameId[];
  /** Jeux encore en bêta (seulement pour les admins) */
  beta: GameId[];
  load: () => Promise<void>;
  apply: (res: MeResponse) => void;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  loaded: false,
  user: null,
  pending: null,
  games: ["uno"],
  beta: [],
  load: async () => {
    try {
      const res = await api.get<MeResponse>("/me");
      set({ loaded: true, user: res.user, pending: res.pending, games: res.games ?? ["uno"], beta: res.beta ?? [] });
    } catch {
      set({ loaded: true, user: null, pending: null });
    }
  },
  apply: (res) =>
    set((s) => ({ user: res.user, pending: res.pending, loaded: true, games: res.games ?? s.games, beta: res.beta ?? s.beta })),
  logout: async () => {
    await api.post("/auth/logout").catch(() => {});
    set({ user: null, pending: null, games: ["uno"], beta: [] });
  },
}));
