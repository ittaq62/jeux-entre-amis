import { create } from "zustand";
import type { StreakClaimResponse, StreakGain, StreakStatus } from "../../shared/streak.ts";
import { api } from "../lib/api.ts";
import { useShop } from "./shop.ts";

/** Revenir sur l'accueil tout de suite après n'interroge pas le serveur de nouveau */
const CLAIM_EVERY_MS = 15_000;

interface StreakState {
  /** Le compte à qui appartient ce qu'on sait (on oublie tout en changeant de compte) */
  userId: string | null;
  status: StreakStatus | null;
  /** Ce que la dernière ouverture de l'accueil vient de rapporter, pour l'animation (null : on regarde, sans plus) */
  gained: StreakGain | null;
  /** Le solde juste avant ce versement */
  balanceBefore: number;
  open: boolean;
  failed: boolean;
  /** L'accueil vient de s'ouvrir : le serveur compte le jour ; la fenêtre s'ouvre si quelque chose vient d'être versé */
  claim: (userId: string, force?: boolean) => Promise<void>;
  show: () => void;
  close: () => void;
}

let lastClaim = 0;
let inFlight: Promise<void> | null = null;

export const useStreak = create<StreakState>((set, get) => ({
  userId: null,
  status: null,
  gained: null,
  balanceBefore: 0,
  open: false,
  failed: false,
  claim: (userId, force = false) => {
    if (get().userId !== userId) {
      set({ userId, status: null, gained: null, open: false, failed: false });
      lastClaim = 0;
    }
    if (inFlight) return inFlight;
    if (!force && get().status && Date.now() - lastClaim < CLAIM_EVERY_MS) return Promise.resolve();
    lastClaim = Date.now();
    inFlight = (async () => {
      try {
        const res = await api.post<StreakClaimResponse>("/streak/claim");
        if (get().userId !== userId) return;
        const paid = (res.gained.day?.reward ?? 0) + res.gained.weeks.reduce((sum, w) => sum + w.bonus, 0);
        useShop.setState({ balance: res.balance });
        const fresh = res.gained.day !== null || res.gained.weeks.length > 0;
        set({
          status: res.status,
          failed: false,
          ...(fresh ? { gained: res.gained, balanceBefore: Math.max(0, res.balance - paid), open: true } : {}),
        });
        // Le solde lu par l'en-tête au même moment peut dater d'avant le versement : on le relit
        if (fresh) void useShop.getState().load();
      } catch {
        // Pas de réseau, trop de passages, ou la série n'est pas encore en place : l'accueil reste tel quel
        if (get().userId === userId) set({ failed: true });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },
  show: () => set({ open: true, gained: null }),
  close: () => set({ open: false }),
}));
