// Ce que se disent la table de minigolf et les navigateurs : le salon, la partie, les coups.

import type { AchievementUnlock, ChatMessage, EloResult, RoomStatus, SeatView, SpectatorView, Visibility } from "../../protocol.ts";
import type { LoadGate } from "../../loadGate.ts";
import type { StarAwardResult } from "../../stars.ts";
import type { CourseId } from "./courses.ts";
import type { BallLook } from "./looks.ts";
import type { Match, MinigolfConfig } from "./match.ts";

export const MINIGOLF_MAX_PLAYERS = 8;

export interface MinigolfRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  /** Rejoindre en cours de route (minigolf : on regarde, et on joue la partie suivante) */
  lateJoin?: boolean;
  /** Règles au hasard : le tirage du serveur pour la partie qui vient ; absent ou null : règles au choix de l'hôte */
  randomRules?: string | null;
  minigolf: MinigolfConfig;
}

export interface MinigolfSeatView extends SeatView {
  /** Le skin de sa balle */
  look: BallLook;
}

/** La partie telle que la voient les joueurs (le hasard des bots reste au serveur) */
export type MinigolfView = Omit<Match, "rng">;

/** Les étoiles d'une partie pour un joueur : chaque trou joué (sa carte), les points des nouvelles */
export interface MinigolfStarAward {
  results: StarAwardResult[];
  points: number;
}

export interface MinigolfRoomView {
  code: string;
  game: "minigolf";
  status: RoomStatus;
  settings: MinigolfRoomSettings;
  seats: MinigolfSeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  /** L'équipe de chaque siège */
  teams: Record<string, 0 | 1>;
  minigolf: MinigolfView | null;
  /** La partie retenue le temps que chacun charge le parcours (voir loadGate.ts) ; null : elle tourne */
  gate?: LoadGate | null;
  serverNow: number;
  rematch: string[];
  results?: Record<string, EloResult> | null;
  /** Les étoiles des trous de la partie, à la fin, par joueur (userId) : ce que chaque trou vaut maintenant ; voir starCourses.ts */
  stars?: Record<string, MinigolfStarAward> | null;
  quick: boolean;
  tour?: string | null;
  /** L'annonce avant la partie (tournée ou revanche), jusqu'à cette heure ; ceux qui sont prêts */
  pickUntil?: number | null;
  ready?: string[];
}

export type MinigolfClientMessage =
  | {
      t: "settings";
      settings: Partial<MinigolfConfig>;
      visibility?: Visibility;
      maxPlayers?: number;
      lateJoin?: boolean;
      randomRules?: boolean;
    }
  /** Un coup : le trou (son numéro dans la partie), l'angle, la force, et le pas du trou où il part */
  | { t: "shot"; h: number; a: number; p: number; at: number }
  /** Où il vise en ce moment (les autres voient sa flèche) ; null : il ne vise plus */
  | { t: "aim"; a: number; p: number }
  | { t: "look"; look: BallLook }
  | { t: "team"; team: 0 | 1 }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "kick"; userId: string }
  | { t: "start" }
  /** L'aventure en solo : l'hôte, seul à la table, part sur un parcours ouvert (voir starCourses.ts) */
  | { t: "adventure"; course: CourseId }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "rematch" }
  | { t: "sit" }
  | { t: "leave" }
  /** Un bot jouait sa balle (il laissait passer ses tours) : il reprend la main */
  | { t: "takeBack" }
  /** Son jeu a fini de charger le parcours (voir loadGate.ts) */
  | { t: "loaded"; gate: number }
  | { t: "ready" }
  | { t: "close" };

export type MinigolfServerMessage =
  | { t: "room"; room: MinigolfRoomView }
  /** Un joueur vise : sa direction et sa force, pour dessiner sa flèche */
  | { t: "aim"; id: string; a: number; p: number }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  | { t: "replaced" };

/** Les stats d'une partie pour un joueur, gardées avec ses résultats */
export interface MinigolfRecordStats {
  strokes: number;
  holes: number;
  aces: number;
  under: number;
  lost: number;
  /** Son meilleur trou par rapport au par (−2 : un eagle) */
  best: number;
  /** Sa partie par rapport au par */
  toPar: number;
  won: number;
}
