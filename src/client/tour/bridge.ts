import { createContext, useContext, type ReactNode } from "react";
import type { ChatMessage } from "../../shared/protocol.ts";

/**
 * Ce qu'une table de jeu emprunte à sa tournée quand elle en fait partie : le chat de la tournée (il ne repart
 * pas à zéro d'un jeu à l'autre), la sortie (on quitte la tournée, pas seulement la table) et l'écran montré
 * pendant que les joueurs arrivent à la table.
 */
export interface TourBridge {
  code: string;
  chat: ChatMessage[];
  sendChat: (text: string) => void;
  leave: () => void;
  waiting: ReactNode;
  /**
   * La feuille de fin de ce jeu, gardée à l'écran : jusqu'à quand (heure du serveur), qui a déjà continué, qui peut le
   * faire (les joueurs du jeu), et si la tournée s'arrête là. Null tant que la tournée n'a pas reçu le résultat.
   */
  endHold: { until: number; done: string[]; players: string[]; last: boolean } | null;
  youId: string;
  serverOffset: number;
  onContinue: () => void;
}

export const TourBridgeContext = createContext<TourBridge | null>(null);

export const useTourBridge = () => useContext(TourBridgeContext);
