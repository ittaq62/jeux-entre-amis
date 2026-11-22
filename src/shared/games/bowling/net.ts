// Ce que se disent la table de bowling et les navigateurs : le salon, la partie, les lancers, la pose du lanceur (pour
// que les autres le voient se placer et prendre son élan), les paris.

import type { AchievementUnlock, ChatMessage, EloResult, RoomStatus, SeatView, SpectatorView, Visibility } from "../../protocol.ts";
import type { BowlingLook } from "./looks.ts";
import type { BowlingConfig, Match, PredPick } from "./match.ts";

export const BOWLING_MAX_PLAYERS = 8;

export interface BowlingRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  /** Rejoindre en cours de route (bowling : on regarde, et on joue la partie suivante) */
  lateJoin?: boolean;
  /** Règles au hasard : le tirage du serveur pour la partie qui vient ; absent ou null : règles au choix de l'hôte */
  randomRules?: string | null;
  bowling: BowlingConfig;
}

export interface BowlingSeatView extends SeatView {
  look: BowlingLook;
}

/** La partie telle que la voient les joueurs (le hasard des bots reste au serveur) */
export type BowlingView = Omit<Match, "rng">;

export interface BowlingRoomView {
  code: string;
  game: "bowling";
  status: RoomStatus;
  settings: BowlingRoomSettings;
  seats: BowlingSeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  teams: Record<string, 0 | 1>;
  bowling: BowlingView | null;
  serverNow: number;
  rematch: string[];
  results?: Record<string, EloResult> | null;
  quick: boolean;
  tour?: string | null;
  pickUntil?: number | null;
  ready?: string[];
}

/** La pose du lanceur : sa place, sa visée, où en est son élan (−1 bras en arrière, 1 bras en avant), en train d'élancer */
export interface BowlingPose {
  x: number;
  d: number;
  k: number;
  sw: boolean;
}

export type BowlingClientMessage =
  | {
      t: "settings";
      settings: Partial<BowlingConfig>;
      visibility?: Visibility;
      maxPlayers?: number;
      lateJoin?: boolean;
      randomRules?: boolean;
    }
  /** Un lancer : le numéro du lancer attendu (pour ne pas lancer deux fois), puis la place, la direction, la vitesse, l'effet */
  | { t: "throw"; n: number; x: number; d: number; v: number; s: number }
  | ({ t: "pose" } & BowlingPose)
  | { t: "predict"; pick: PredPick }
  | { t: "look"; look: BowlingLook }
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

export type BowlingServerMessage =
  | { t: "room"; room: BowlingRoomView }
  | ({ t: "pose"; id: string } & BowlingPose)
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  | { t: "replaced" };

/** Les stats d'une partie pour un joueur, gardées avec ses résultats */
export interface BowlingRecordStats {
  /** Son score (ou ses points au défi des spares) */
  score: number;
  /** Partie classique de 10 frames : son score compte pour le record */
  full: number;
  strikes: number;
  spares: number;
  gutters: number;
  splitsMade: number;
  bestRun: number;
  /** 300 en 10 frames */
  perfect: number;
  /** Ses points de devin */
  seer: number;
  won: number;
}
