import { createContext, useContext, type ReactNode } from "react";
import type { ChatMessage } from "../../shared/protocol.ts";
import type { RuleLine } from "../../shared/tour.ts";

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
  /**
   * Pour l'annonce avant la partie : où en est la tournée (« Jeu 3 sur 6 »), et les règles jouées, une par ligne : le
   * format, puis chaque règle à part (aucune aux règles de base)
   */
  progress: string;
  rules: RuleLine[] | null;
  /**
   * La tournée se joue en équipes. Sans elles, l'annonce ne montre pas d'équipes, même quand le jeu range chaque place
   * d'un côté (la bataille navale et les briques le font aussi chacun pour soi)
   */
  teams: boolean;
}

export const TourBridgeContext = createContext<TourBridge | null>(null);

export const useTourBridge = () => useContext(TourBridgeContext);
