import { create } from "zustand";
import type { ReportContext } from "../../shared/report.ts";

/**
 * La fenêtre « Signaler un problème » vit hors des tables : si la partie passe à la suite (une tournée qui
 * enchaîne, une revanche lancée par l'hôte), ce qu'on a commencé à écrire reste là.
 */
interface ReportState {
  context: ReportContext | null;
  open: (context: ReportContext) => void;
  close: () => void;
}

export const useReport = create<ReportState>((set) => ({
  context: null,
  open: (context) => set({ context }),
  close: () => set({ context: null }),
}));
