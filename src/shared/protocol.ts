import type { AvatarConfig } from "./avatar.ts";
import type { Active, BricksSettings, GarbageChunk, Placement as BrickPlacement, TargetStrategy } from "./games/bricks/engine.ts";
import type { BricksFx, BricksPlayerView, BricksSnapshot, BricksView } from "./games/bricks/view.ts";
import type { NavalAction, NavalEvent, NavalSettings } from "./games/naval/engine.ts";
import type { NavalView } from "./games/naval/view.ts";
import type { UnoAction, UnoEvent, UnoSettings } from "./games/uno/engine.ts";
import type { UnoView } from "./games/uno/view.ts";

export type GameId = "uno" | "naval" | "bricks";

export const GAME_NAMES: Record<GameId, string> = { uno: "UNO", naval: "Bataille navale", bricks: "Briques" };

/** Jeux en bêta tant que l'admin ne les a pas ouverts à tous */
export const BETA_GAMES = ["naval", "bricks"] as const satisfies readonly GameId[];

// ---------------------------------------------------------------------------
// Comptes
// ---------------------------------------------------------------------------

export interface PublicUser {
  id: string;
  pseudo: string;
  avatar: AvatarConfig;
  /** Version de la photo de profil, 0 = pas de photo */
  photo: number;
  /** Administrateur du site (absent sinon) */
  admin?: true;
}

export interface Me extends PublicUser {
  email: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export interface AdminUser {
  user: PublicUser;
  /** Pas encore choisi de pseudo */
  pending: boolean;
  email: string;
  createdAt: number;
  lastSeenAt: number;
  played: number;
  won: number;
  points: number;
  banned: { at: number; reason: string | null } | null;
  online: boolean;
}

export interface AdminGame {
  id: string;
  game: GameId;
  variant: string;
  endedAt: number;
  rounds: number;
  players: { name: string; rank: number; bot: boolean }[];
}

export interface AdminRoom extends RoomSummary {
  updatedAt: number;
}

export interface AdminOverview {
  accounts: number;
  newThisWeek: number;
  banned: number;
  games: number;
  gamesToday: number;
  online: number;
  rooms: AdminRoom[];
  recentGames: AdminGame[];
  announcement: Announcement | null;
  /** Jeux encore en bêta : visibles seulement des admins et de leurs invités */
  betaGames: GameId[];
}

export type AdminUserAction =
  | { action: "rename"; pseudo: string }
  | { action: "removePhoto" }
  | { action: "resetStats" }
  | { action: "setAdmin"; on: boolean }
  | { action: "ban"; reason?: string }
  | { action: "unban" };

export const ANNOUNCE_MAX = 280;
export const BAN_REASON_MAX = 200;

export interface Announcement {
  id: number;
  text: string;
  from: string;
  at: number;
  /** Plus montrée aux nouveaux arrivants après cette date */
  until: number;
}

export interface MeResponse {
  user: Me | null;
  /** Connecte mais pas encore de pseudo */
  pending: { email: string } | null;
  /** Jeux que ce compte voit dans ses menus (les jeux en bêta n'y sont que pour les admins) */
  games?: GameId[];
  /** Parmi eux, ceux encore en bêta (renseigné pour les admins) */
  beta?: GameId[];
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
  /** Pourquoi : déconnecté (« away ») ou plus de réponse pendant ses tours (« afk ») */
  autoplayReason?: "away" | "afk";
  /** Déconnecté en pleine partie : heure (du serveur) à laquelle un bot prendra sa place, sauf retour d'ici là */
  awayAt?: number | null;
  isHost: boolean;
  /** Administrateur du site */
  admin: boolean;
  /** Bataille navale en équipes : 0 bâbord, 1 tribord */
  team?: 0 | 1;
}

export interface SpectatorView {
  userId: string;
  name: string;
}

/** Elo après une partie et ce qu'elle a fait gagner ou perdre */
export interface EloResult {
  elo: number;
  delta: number;
}

export interface RoomView {
  code: string;
  game: "uno";
  status: RoomStatus;
  settings: RoomSettings;
  seats: SeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  uno: UnoView | null;
  turnDeadline: number | null;
  nextRoundAt: number | null;
  serverNow: number;
  rematch: string[];
  /** Elo de chaque joueur (par id utilisateur) après la partie qui vient de finir */
  results?: Record<string, EloResult> | null;
  quick: boolean;
}

export interface ChatMessage {
  id: number;
  userId: string | null;
  name: string;
  text: string;
  at: number;
  system?: boolean;
  /** Message de l'administrateur du site */
  admin?: boolean;
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
  | { t: "leave" }
  | { t: "close" };

/** Ce que tous les salons ont en commun, quel que soit le jeu : sert au salon d'attente partagé. */
export interface LobbyRoom {
  code: string;
  game: GameId;
  status: RoomStatus;
  settings: { visibility: Visibility; maxPlayers: number };
  seats: SeatView[];
  spectators: SpectatorView[];
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
}

export interface NavalRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  naval: NavalSettings;
}

export const NAVAL_MAX_PLAYERS = 6;

export interface NavalRoomView {
  code: string;
  game: "naval";
  status: RoomStatus;
  settings: NavalRoomSettings;
  seats: SeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  naval: NavalView | null;
  /** Fin du chrono du tir en cours */
  turnDeadline: number | null;
  /** Fin du temps de placement des navires */
  placementDeadline: number | null;
  serverNow: number;
  rematch: string[];
  /** Elo de chaque joueur (par id utilisateur) après la partie qui vient de finir */
  results?: Record<string, EloResult> | null;
  quick: boolean;
}

/** Messages communs à tous les salons (le salon d'attente partagé n'envoie que ceux-là) */
export type LobbyClientMessage =
  | { t: "settings"; settings: Record<string, never>; visibility?: Visibility; maxPlayers?: number }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "kick"; userId: string }
  | { t: "start" }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "sit" }
  | { t: "leave" }
  | { t: "close" };

export type NavalClientMessage =
  | { t: "settings"; settings: Partial<NavalSettings>; visibility?: Visibility; maxPlayers?: number }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "kick"; userId: string }
  | { t: "start" }
  /** Changer d'équipe : soi-même, ou n'importe qui pour l'hôte */
  | { t: "team"; seatId: string; team: 0 | 1 }
  | { t: "action"; action: NavalAction }
  | { t: "takeBack" }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "rematch" }
  | { t: "sit" }
  | { t: "leave" }
  | { t: "close" };

export interface BricksRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  bricks: BricksSettings;
}

export const BRICKS_MAX_PLAYERS = 6;

export interface BricksRoomView {
  code: string;
  game: "bricks";
  status: RoomStatus;
  settings: BricksRoomSettings;
  seats: SeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  bricks: BricksView | null;
  serverNow: number;
  rematch: string[];
  results?: Record<string, EloResult> | null;
  quick: boolean;
}

export type BricksClientMessage =
  | { t: "settings"; settings: Partial<BricksSettings>; visibility?: Visibility; maxPlayers?: number }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "kick"; userId: string }
  | { t: "start" }
  | { t: "team"; seatId: string; team: 0 | 1 }
  /** Une pièce posée : `seq` est le nombre de poses déjà faites, `ack` le dernier paquet de lignes grises vu */
  | { t: "place"; seq: number; p: BrickPlacement; ack: number }
  /** La pièce en vol, pour l'afficher chez les autres */
  | { t: "live"; piece: Active | null }
  | { t: "strategy"; strategy: TargetStrategy; target?: string | null }
  /** L'écran demande l'état exact de son plateau */
  | { t: "resync" }
  | { t: "takeBack" }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "rematch" }
  | { t: "sit" }
  | { t: "leave" }
  | { t: "close" };

export type BricksServerMessage =
  | { t: "room"; room: BricksRoomView }
  /** Le plateau d'un joueur après une pose, et ce qu'elle a déclenché */
  | { t: "board"; player: BricksPlayerView; fx: BricksFx[] }
  | { t: "self"; snapshot: BricksSnapshot }
  | { t: "garbage"; chunk: GarbageChunk }
  | { t: "live"; id: string; piece: Active | null }
  | { t: "fx"; fx: BricksFx[] }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string };

export type NavalServerMessage =
  | { t: "room"; room: NavalRoomView; events: NavalEvent[] }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string };

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
  /** UNO : classic ou nomercy ; bataille navale : duel, melee ou teams */
  variant: string;
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
  | { t: "invite"; from: PublicUser; code: string; game: GameId }
  | { t: "announce"; announcement: Announcement }
  | { t: "signedOut"; reason: string };

export type HubClientMessage = { t: "watchLobby"; on: boolean } | { t: "invite"; to: string; code: string };
