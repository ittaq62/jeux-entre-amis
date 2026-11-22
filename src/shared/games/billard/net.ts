// Ce que se disent la table de billard et les navigateurs : le salon, la partie, les coups, et la visée de celui qui joue
// (les autres voient sa queue tourner autour de la blanche, reculer, et la bille en main se poser).

import type { ChatMessage, EloResult, AchievementUnlock, RoomStatus, SeatView, SpectatorView, Visibility } from "../../protocol.ts";
import type { LoadGate } from "../../loadGate.ts";
import type { BillardLook } from "./looks.ts";
import type { BillardConfig, Match } from "./match.ts";

export const BILLARD_MAX_PLAYERS = 8;

export interface BillardRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  /** Rejoindre en cours de route (billard : on regarde, et on joue la partie suivante) */
  lateJoin?: boolean;
  /** Règles au hasard : le tirage du serveur pour la partie qui vient ; absent ou null : règles au choix de l'hôte */
  randomRules?: string | null;
  billard: BillardConfig;
}

export interface BillardSeatView extends SeatView {
  look: BillardLook;
}

/** La partie telle que la voient les joueurs (le hasard des bots reste au serveur) */
export type BillardView = Omit<Match, "rng">;

export interface BillardRoomView {
  code: string;
  game: "billard";
  status: RoomStatus;
  settings: BillardRoomSettings;
  seats: BillardSeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  teams: Record<string, 0 | 1>;
  billard: BillardView | null;
  /** La partie retenue le temps que chacun charge la salle (voir loadGate.ts) ; null : elle tourne */
  gate?: LoadGate | null;
  serverNow: number;
  rematch: string[];
  results?: Record<string, EloResult> | null;
  quick: boolean;
  tour?: string | null;
  pickUntil?: number | null;
  ready?: string[];
}

/** La visée de celui qui joue : la direction, le point de frappe, la queue reculée (0 à 1), la bille en main posée là */
export interface BillardAim {
  dx: number;
  dy: number;
  a: number;
  b: number;
  k: number;
  px?: number;
  py?: number;
}

export type BillardClientMessage =
  | {
      t: "settings";
      settings: Partial<BillardConfig>;
      visibility?: Visibility;
      maxPlayers?: number;
      lateJoin?: boolean;
      randomRules?: boolean;
    }
  /** Un coup : le numéro du coup attendu (pour ne pas jouer deux fois), la queue, la bille en main, la poche annoncée */
  | { t: "shot"; n: number; dx: number; dy: number; p: number; a: number; b: number; px?: number; py?: number; call?: number | null }
  /** Son jeu a fini de charger la salle (voir loadGate.ts) */
  | { t: "loaded"; gate: number }
  | ({ t: "aim" } & BillardAim)
  | { t: "look"; look: BillardLook }
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

export type BillardServerMessage =
  | { t: "room"; room: BillardRoomView }
  | ({ t: "aim"; id: string } & BillardAim)
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  | { t: "replaced" };

/** Les stats d'une partie pour un joueur, gardées avec ses résultats */
export interface BillardRecordStats {
  /** Ses manches (celles de son camp), ses vies restantes au Killer, ses points à la carambole */
  score: number;
  shots: number;
  pots: number;
  fouls: number;
  bestRun: number;
  banks: number;
  /** Manches gagnées en jouant la dernière bille */
  racks: number;
  breakRuns: number;
  nineBreak: number;
  threeRails: number;
  blacks: number;
  /** Il a gagné la partie (son camp) */
  won: number;
  /** Une partie de chaque jeu (pour les succès « a joué aux quatre ») */
  huit: number;
  neuf: number;
  killer: number;
  carambole: number;
}
