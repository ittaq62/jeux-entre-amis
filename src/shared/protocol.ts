import type { AvatarConfig } from "./avatar.ts";
import type { UnoAction, UnoEvent, UnoSettings } from "./games/uno/engine.ts";
import type { UnoView } from "./games/uno/view.ts";

export type GameId = "uno";

// ---------------------------------------------------------------------------
// Comptes
// ---------------------------------------------------------------------------

export interface PublicUser {
  id: string;
  pseudo: string;
  avatar: AvatarConfig;
  /** Version de la photo de profil, 0 = pas de photo */
  photo: number;
}

export interface Me extends PublicUser {
  email: string;
  createdAt: number;
}

export interface MeResponse {
  user: Me | null;
  /** Connecte mais pas encore de pseudo */
  pending: { email: string } | null;
}

// ---------------------------------------------------------------------------
// Salons
// ---------------------------------------------------------------------------

export type Visibility = "private" | "public";
export type RoomStatus = "lobby" | "playing" | "finished";

export interface RoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  uno: UnoSettings;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export interface SeatView {
  /** Identifiant du siege dans la partie (id utilisateur ou « bot-N ») */
  id: string;
  kind: "human" | "bot";
  userId: string | null;
  name: string;
  avatar: AvatarConfig;
  photo: number;
  connected: boolean;
  /** Un bot joue a la place de ce joueur absent */
  autoplay: boolean;
  isHost: boolean;
}

export interface SpectatorView {
  userId: string;
  name: string;
}

export interface RoomView {
  code: string;
  game: GameId;
  status: RoomStatus;
  settings: RoomSettings;
  seats: SeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean };
  uno: UnoView | null;
  turnDeadline: number | null;
  nextRoundAt: number | null;
  serverNow: number;
  rematch: string[];
  quick: boolean;
}

export interface ChatMessage {
  id: number;
  userId: string | null;
  name: string;
  text: string;
  at: number;
  system?: boolean;
}

export const CHAT_MAX = 240;

export const REACTIONS = ["😂", "😡", "😱", "🔥", "👏", "😭", "🤡", "😎"] as const;
export const TAUNTS = [
  "Tu vas le regretter",
  "Trop facile",
  "Coup bas !",
  "Pitié…",
  "Bien joué",
  "Oups",
  "Je reviens de loin",
  "C'est personnel",
] as const;

export interface AchievementUnlock {
  userId: string;
  ids: string[];
}

export type RoomClientMessage =
  | { t: "settings"; settings: Partial<UnoSettings>; visibility?: Visibility; maxPlayers?: number }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "kick"; userId: string }
  | { t: "start" }
  | { t: "action"; action: UnoAction }
  | { t: "takeBack" }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "rematch" }
  | { t: "nextRound" }
  | { t: "sit" }
  | { t: "leave" };

export type RoomServerMessage =
  | { t: "room"; room: RoomView; events: UnoEvent[] }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string };

export interface RoomSummary {
  code: string;
  game: GameId;
  variant: UnoSettings["variant"];
  status: RoomStatus;
  visibility: Visibility;
  hostName: string;
  humans: number;
  bots: number;
  maxPlayers: number;
  names: string[];
  createdAt: number;
  quick: boolean;
}

// ---------------------------------------------------------------------------
// Presence, amis, lobby (connexion permanente au « hub »)
// ---------------------------------------------------------------------------

export interface PresenceRoom {
  code: string;
  game: GameId;
  status: RoomStatus;
}

export interface FriendEntry {
  user: PublicUser;
  status: "accepted" | "incoming" | "outgoing";
  online: boolean;
  room: PresenceRoom | null;
}

export type HubServerMessage =
  | { t: "presence"; online: Record<string, PresenceRoom | null> }
  | { t: "presenceUpdate"; userId: string; online: boolean; room: PresenceRoom | null }
  | { t: "lobby"; rooms: RoomSummary[] }
  | { t: "friendsChanged" }
  | { t: "invite"; from: PublicUser; code: string; game: GameId };

export type HubClientMessage = { t: "watchLobby"; on: boolean } | { t: "invite"; to: string; code: string };
