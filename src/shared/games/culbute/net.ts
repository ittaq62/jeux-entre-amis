// Ce que se disent la table de Culbute et les navigateurs : le salon, le combat, les commandes.

import type { AchievementUnlock, ChatMessage, EloResult, RoomStatus, SeatView, SpectatorView, Visibility } from "../../protocol.ts";
import type { FighterPick } from "./fighters.ts";
import type { FightEvent } from "./model.ts";
import type { CulbuteConfig, CulbuteTick, CulbuteView } from "./view.ts";

export const CULBUTE_MAX_PLAYERS = 8;

export interface CulbuteRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  /** Rejoindre en cours de route (Culbute : on regarde, et on joue le combat suivant) */
  lateJoin?: boolean;
  /** Règles au hasard : le tirage du serveur pour le combat qui vient ; absent ou null : règles au choix de l'hôte */
  randomRules?: string | null;
  culbute: CulbuteConfig;
}

export interface CulbuteSeatView extends SeatView {
  /** Son combattant */
  fighter: FighterPick;
}

export interface CulbuteRoomView {
  code: string;
  game: "culbute";
  status: RoomStatus;
  settings: CulbuteRoomSettings;
  seats: CulbuteSeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  /** L'équipe de chaque siège */
  teams: Record<string, 0 | 1>;
  culbute: CulbuteView | null;
  serverNow: number;
  rematch: string[];
  results?: Record<string, EloResult> | null;
  quick: boolean;
  tour?: string | null;
  /** Tournée : la fenêtre de choix du combattant avant le combat, jusqu'à cette heure ; ceux qui sont prêts */
  pickUntil?: number | null;
  ready?: string[];
}

export type CulbuteClientMessage =
  | {
      t: "settings";
      settings: Partial<CulbuteConfig>;
      visibility?: Visibility;
      maxPlayers?: number;
      lateJoin?: boolean;
      randomRules?: boolean;
    }
  /** Ses commandes : `s` le numéro de la première, puis par commande x, y, boutons tenus, boutons enfoncés ; `c` l'heure d'envoi */
  | { t: "in"; s: number; d: number[]; c: number }
  /** Son combattant */
  | { t: "pick"; fighter: FighterPick }
  | { t: "team"; team: 0 | 1 }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "kick"; userId: string }
  | { t: "start" }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "rematch" }
  | { t: "sit" }
  | { t: "leave" }
  | { t: "ready" }
  | { t: "close" };

export type CulbuteServerMessage =
  | { t: "room"; room: CulbuteRoomView; events: FightEvent[] }
  | ({ t: "tick"; now: number } & CulbuteTick)
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  | { t: "replaced" };

/** Une commande par image : le serveur les rejoue une à une, dans l'ordre */
export const SAMPLE_STRIDE = 4;
