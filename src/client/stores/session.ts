import { create } from "zustand";
import { api } from "../lib/api.ts";
import type { Me, MeResponse } from "../../shared/protocol.ts";

interface SessionState {
  loaded: boolean;
  user: Me | null;
  pending: { email: string } | null;
  load: () => Promise<void>;
  apply: (res: MeResponse) => void;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  loaded: false,
  user: null,
  pending: null,
  load: async () => {
    try {
      const res = await api.get<MeResponse>("/me");
      set({ loaded: true, user: res.user, pending: res.pending });
    } catch {
      set({ loaded: true, user: null, pending: null });
    }
  },
  apply: (res) => set({ user: res.user, pending: res.pending, loaded: true }),
  logout: async () => {
    await api.post("/auth/logout").catch(() => {});
    set({ user: null, pending: null });
  },
}));
