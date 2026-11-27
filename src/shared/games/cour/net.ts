// Ce que se disent la salle de La Cour des Grands et les navigateurs : le salon (les vrais joueurs), la partie (la foule
// des candidats, l'épreuve en cours) et les gestes. La partie part plusieurs fois par seconde pendant une épreuve (les
// positions), le salon seulement quand il change.

import type { AchievementUnlock, ChatMessage, EloResult, RoomStatus, SeatView, SpectatorView, Visibility } from "../../protocol.ts";
import type { LoadGate } from "../../loadGate.ts";
import type { StarAwardResult } from "../../stars.ts";
import type { AvatarConfig } from "../../avatar.ts";
import type { CourConfig } from "./config.ts";
import type { CourLook } from "./looks.ts";
import type { EpInput, MatchView } from "./match.ts";

/** Les vrais joueurs à une table (la foule est faite de bots) */
export const COUR_MAX_PLAYERS = 8;

export interface CourRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  lateJoin?: boolean;
  randomRules?: string | null;
  cour: CourConfig;
}

export interface CourSeatView extends SeatView {
  look: CourLook;
}

/** Un candidat de la partie, tel que les écrans le dessinent */
export interface Candidate {
  id: string;
  name: string;
  avatar: AvatarConfig;
  photo: number;
  /** Le compte d'un vrai joueur (null : un bot de la foule) */
  userId: string | null;
  look: CourLook;
  /** Le rival de la campagne */
  rival?: true;
}

/** La campagne : le chapitre joué, et ce qu'il a donné */
export interface CampaignRun {
  chapter: string;
  /** Le score de l'épreuve (0 à 100), une fois finie */
  score: number | null;
  stars: StarAwardResult | null;
}

export interface CourRoomView {
  code: string;
  game: "cour";
  status: RoomStatus;
  settings: CourRoomSettings;
  seats: CourSeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  /** La foule de la partie (vrais joueurs et bots), figée au départ */
  roster: Candidate[] | null;
  match: MatchView | null;
  gate?: LoadGate | null;
  serverNow: number;
  rematch: string[];
  results?: Record<string, EloResult> | null;
  quick: boolean;
  tour?: string | null;
  pickUntil?: number | null;
  ready?: string[];
  campaign?: CampaignRun | null;
}

export type CourClientMessage =
  | {
      t: "settings";
      settings: Partial<CourConfig>;
      visibility?: Visibility;
      maxPlayers?: number;
      lateJoin?: boolean;
      randomRules?: boolean;
    }
  /** Un geste pendant l'épreuve */
  | { t: "in"; i: EpInput }
  /** Passer la cinématique en cours */
  | { t: "skip" }
  /** Jouer un chapitre de la campagne (l'hôte, seul à sa table) */
  | { t: "campagne"; chapter: string }
  | { t: "loaded"; gate: number }
  | { t: "look"; look: CourLook }
  /** Le salon commun sait demander un bot : ici la foule se complète d'elle-même, la salle l'ignore */
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

export type CourServerMessage =
  | { t: "room"; room: CourRoomView }
  /** La partie, à chaque pas pendant une épreuve ; `now` : l'heure du serveur à l'envoi */
  | { t: "match"; match: MatchView; now: number }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "stars"; result: StarAwardResult }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  | { t: "replaced" };

/** Les stats d'une partie pour un joueur, gardées avec ses résultats */
export interface CourRecordStats {
  /** Les épreuves passées (sans compter la finale) */
  survived: number;
  /** Il a joué la finale, il l'a gagnée */
  finalist: number;
  won: number;
  /** Repêché, éliminé par le jury */
  saved: number;
  /** Le nombre d'épreuves jouées dans la partie */
  played: number;
  /** Chaque épreuve jouée (1) ou non (0), pour « toute la récré » */
  soleil: number;
  biscuit: number;
  corde: number;
  nenuphars: number;
  chaises: number;
  billes: number;
  marelle: number;
  epervier: number;
}
