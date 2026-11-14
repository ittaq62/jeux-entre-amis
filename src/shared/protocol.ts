import type { AvatarConfig } from "./avatar.ts";
import type { SkinId as KartSkinId, VehicleId } from "./games/bolides/garage.ts";
import type { BolidesEvent, BolidesSettings } from "./games/bolides/race.ts";
import type { BolidesView, KartNet } from "./games/bolides/view.ts";
import type { MatchEvent } from "./games/crampons/model.ts";
import type { FeteId } from "./games/crampons/boutique.ts";
import type { CramponsConfig, CramponsTick, CramponsView } from "./games/crampons/view.ts";
import type { Active, BricksSettings, GarbageChunk, Placement as BrickPlacement, TargetStrategy } from "./games/bricks/engine.ts";
import type { BricksFx, BricksPlayerView, BricksSnapshot, BricksView } from "./games/bricks/view.ts";
import type { CapitaleAction, CapitaleEvent, CapitaleSettings } from "./games/capitale/engine.ts";
import type { TokenId } from "./games/capitale/tokens.ts";
import type { SkinId } from "./games/naval/skins.ts";
import type { BackId } from "./games/uno/backs.ts";
import type { CapitaleView } from "./games/capitale/view.ts";
import type { BombId } from "./games/meche/bombs.ts";
import type { MecheEvent, MecheSettings, Refusal } from "./games/meche/engine.ts";
import type { MecheView } from "./games/meche/view.ts";
import type { NavalAction, NavalEvent, NavalSettings } from "./games/naval/engine.ts";
import type { NavalView } from "./games/naval/view.ts";
import type { UnoAction, UnoEvent, UnoSettings } from "./games/uno/engine.ts";
import type { UnoView } from "./games/uno/view.ts";

export type GameId = "uno" | "naval" | "bricks" | "capitale" | "meche" | "bolides" | "crampons";

/** Ce qui se joue à un code : un jeu, ou une tournée qui enchaîne les jeux */
export type TableGame = GameId | "tour";

export const GAME_NAMES: Record<GameId, string> = {
  uno: "UNO",
  naval: "Bataille navale",
  bricks: "Briques",
  capitale: "Capitale",
  meche: "Mèche",
  bolides: "Bolides",
  crampons: "Crampons",
};
export const TABLE_NAMES: Record<TableGame, string> = { ...GAME_NAMES, tour: "La Tournée" };

/** Jeux (et tournée) en bêta tant que l'admin ne les a pas ouverts à tous */
export const BETA_GAMES = ["naval", "bricks", "tour", "capitale", "meche", "bolides", "crampons"] as const satisfies readonly TableGame[];

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
  /** Jeux (et tournée) encore en bêta : visibles seulement des admins et de leurs invités */
  betaGames: TableGame[];
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
  /** La tournée lui est ouverte */
  tour?: boolean;
  /** Parmi eux, ceux encore en bêta (renseigné pour les admins) */
  beta?: TableGame[];
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
  /** En équipes : 0 et 1 (bâbord et tribord à la bataille navale, Rouges et Bleus en tournée), 2 pour la troisième équipe de Capitale */
  team?: 0 | 1 | 2;
  /** Capitale : le pion choisi */
  token?: TokenId;
  /** Bataille navale : le thème de la flotte */
  skin?: SkinId;
  /** UNO : le dos de ses cartes (absent : le classique) */
  back?: BackId;
  /** Crampons : la célébration de ses buts (absent : chacun fête à sa façon) */
  fete?: FeteId;
  /** Mèche : la bombe qu'il allume (absent : la dynamite) */
  bomb?: BombId;
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
  /** Table d'une tournée : le code de la tournée */
  tour?: string | null;
  /** Tournée : la fenêtre de choix des skins avant la partie, jusqu'à cette heure ; ceux qui sont prêts */
  pickUntil?: number | null;
  ready?: string[];
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

/**
 * Un seul appareil par compte à une table : quand le compte s'y connecte ailleurs, l'ancienne connexion reçoit
 * « replaced » puis se ferme avec ce code, et le navigateur ne cherche pas à revenir tout seul.
 */
export const SOCKET_REPLACED = 4005;

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
  /** Le dos de ses cartes */
  | { t: "back"; back: string }
  | { t: "leave" }
  /** Tournée : prêt à jouer, sans attendre la fin de la fenêtre de choix des skins */
  | { t: "ready" }
  | { t: "close" };

/** Ce que tous les salons ont en commun, quel que soit le jeu : sert au salon d'attente partagé. */
export interface LobbyRoom {
  code: string;
  game: TableGame;
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
  /** Table d'une tournée : le code de la tournée */
  tour?: string | null;
  /** Tournée : la fenêtre de choix des skins avant la partie, jusqu'à cette heure ; ceux qui sont prêts */
  pickUntil?: number | null;
  ready?: string[];
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
  /** Le thème de sa flotte (seulement ceux qu'il possède), à tout moment */
  | { t: "skin"; skin: SkinId }
  | { t: "action"; action: NavalAction }
  /** La flotte qu'on vise pendant son tour : les autres regardent au bon endroit */
  | { t: "aim"; target: string }
  | { t: "takeBack" }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "rematch" }
  | { t: "sit" }
  | { t: "leave" }
  /** Tournée : prêt à jouer, sans attendre la fin de la fenêtre de choix des skins */
  | { t: "ready" }
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
  /** Table d'une tournée : le code de la tournée */
  tour?: string | null;
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
  /** La pièce suivante (ou celle de la réserve) ne peut plus apparaître : la pile a débordé */
  | { t: "blocked" }
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
  | { t: "closed"; reason: string }
  /** Le même compte vient de rejoindre la table depuis un autre appareil : c'est là-bas qu'il joue désormais */
  | { t: "replaced" };

export interface CapitaleRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  capitale: CapitaleSettings;
}

export const CAPITALE_MAX_PLAYERS = 6;

export interface CapitaleRoomView {
  code: string;
  game: "capitale";
  status: RoomStatus;
  settings: CapitaleRoomSettings;
  seats: SeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  capitale: CapitaleView | null;
  /** Fin du temps laissé à la décision en cours */
  deadline: number | null;
  /** Fin de l'enchère en cours (le chrono repart à chaque offre) */
  auctionDeadline: number | null;
  /** Tournée : le choix des pions avant la partie, jusqu'à cette heure ; ceux qui sont prêts */
  pickUntil?: number | null;
  ready?: string[];
  /** Partie à durée fixe : l'heure à laquelle le tour en cours devient le dernier */
  endsAt: number | null;
  serverNow: number;
  rematch: string[];
  results?: Record<string, EloResult> | null;
  quick: boolean;
  /** Table d'une tournée : le code de la tournée */
  tour?: string | null;
}

export type CapitaleClientMessage =
  | { t: "settings"; settings: Partial<CapitaleSettings>; visibility?: Visibility; maxPlayers?: number }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "kick"; userId: string }
  | { t: "start" }
  | { t: "action"; action: CapitaleAction }
  | { t: "takeBack" }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "rematch" }
  | { t: "sit" }
  | { t: "leave" }
  | { t: "close" }
  /** Choisir son pion, avant la partie (seulement ceux qu'il possède) */
  | { t: "token"; token: TokenId }
  /** Tournée : prêt à jouer, sans attendre la fin du choix des pions */
  | { t: "ready" }
  /** En équipes : changer d'équipe (soi-même, ou n'importe qui pour l'hôte) */
  | { t: "team"; seatId: string; team: number };

export type CapitaleServerMessage =
  | { t: "room"; room: CapitaleRoomView; events: CapitaleEvent[] }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  /** Le même compte vient de rejoindre la table depuis un autre appareil : c'est là-bas qu'il joue désormais */
  | { t: "replaced" };

export interface MecheRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  meche: MecheSettings;
}

export const MECHE_MAX_PLAYERS = 8;

export interface MecheRoomView {
  code: string;
  game: "meche";
  status: RoomStatus;
  settings: MecheRoomSettings;
  seats: SeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  meche: MecheView | null;
  /** La bombe de la mèche en cours, celle du joueur qui l'a allumée (entre deux mèches : celle qui vient de sauter) */
  bomb: BombId;
  serverNow: number;
  rematch: string[];
  results?: Record<string, EloResult> | null;
  quick: boolean;
  /** Table d'une tournée : le code de la tournée */
  tour?: string | null;
  /** Tournée : la fenêtre de choix des skins avant la partie, jusqu'à cette heure ; ceux qui sont prêts */
  pickUntil?: number | null;
  ready?: string[];
}

export type MecheClientMessage =
  | { t: "settings"; settings: Partial<MecheSettings>; visibility?: Visibility; maxPlayers?: number }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "kick"; userId: string }
  | { t: "start" }
  /** Ce que tape celui qui tient la mèche, au fil des lettres */
  | { t: "typing"; text: string; turn: number }
  | { t: "word"; word: string; turn: number }
  /** Se débarrasser de la mèche avec une passe */
  | { t: "pass"; turn: number }
  /** La bombe qu'il allume */
  | { t: "bomb"; bomb: BombId }
  /** Tournée : prêt à jouer, sans attendre la fin de la fenêtre de choix des skins */
  | { t: "ready" }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "rematch" }
  | { t: "sit" }
  | { t: "leave" }
  | { t: "close" };

export type MecheServerMessage =
  | { t: "room"; room: MecheRoomView; events: MecheEvent[] }
  /** Les lettres tapées par celui qui tient la mèche, jamais enregistrées */
  | { t: "typing"; id: string; text: string; turn: number }
  /** Un mot refusé : la table le voit passer */
  | { t: "refused"; id: string; word: string; reason: Refusal; turn: number }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  /** Le même compte vient de rejoindre la table depuis un autre appareil : c'est là-bas qu'il joue désormais */
  | { t: "replaced" };

export interface BolidesRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  bolides: BolidesSettings;
}

export const BOLIDES_MAX_PLAYERS = 8;

export interface BolidesRoomView {
  code: string;
  game: "bolides";
  status: RoomStatus;
  settings: BolidesRoomSettings;
  seats: SeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  bolides: BolidesView | null;
  /** Le Grand Prix en cours : la course où on en est, les circuits, les points de chacun et ceux de la dernière course */
  cup: { index: number; tracks: string[]; points: Record<string, number>; last: Record<string, number>; over: boolean } | null;
  serverNow: number;
  rematch: string[];
  results?: Record<string, EloResult> | null;
  quick: boolean;
  /** Table d'une tournée : le code de la tournée */
  tour?: string | null;
  /** Tournée : la fenêtre de choix des skins avant la partie, jusqu'à cette heure ; ceux qui sont prêts */
  pickUntil?: number | null;
  ready?: string[];
  /** Le véhicule et le skin de chaque pilote assis */
  garage: { choices: Record<string, { vehicle: VehicleId; skin: KartSkinId }> };
}

export type BolidesClientMessage =
  | { t: "settings"; settings: Partial<BolidesSettings>; visibility?: Visibility; maxPlayers?: number }
  /** Choisir son véhicule et son skin (s'il les possède) */
  | { t: "garage"; vehicle?: VehicleId; skin?: KartSkinId }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "kick"; userId: string }
  | { t: "start" }
  /** Son jeu a fini de charger cette course (`race` : son `createdAt`) */
  | { t: "loaded"; race: number }
  /** Où en est son kart, plusieurs fois par seconde, et ce qu'il a compté depuis le départ : mini-turbos, chocs contre le mur */
  | { t: "kart"; k: KartNet; n?: [number, number]; at?: number }
  /** Se servir de son objet */
  | { t: "use"; flip?: boolean }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "rematch" }
  | { t: "sit" }
  | { t: "leave" }
  /** Tournée : prêt à jouer, sans attendre la fin de la fenêtre de choix des skins */
  | { t: "ready" }
  | { t: "close" };

export type BolidesServerMessage =
  | { t: "room"; room: BolidesRoomView; events: BolidesEvent[] }
  /**
   * Tous les karts, plusieurs fois par seconde (dans l'ordre des pilotes de la course), à l'heure du serveur ; `a` :
   * l'âge de chaque position en millisecondes (elle date de `now - a[i]`) ; `c` : les pièces de chacun ; `ct` : les
   * pièces ramassées qui ne sont pas encore revenues
   */
  | { t: "tick"; now: number; k: KartNet[]; a?: number[]; c?: number[]; ct?: number[] }
  /** Ce qui arrive entre deux états complets (objets, coups, tours) */
  | { t: "fx"; events: BolidesEvent[]; now: number }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  /** Le même compte vient de rejoindre la table depuis un autre appareil : c'est là-bas qu'il joue désormais */
  | { t: "replaced" };

export interface CramponsRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  crampons: CramponsConfig;
}

export const CRAMPONS_MAX_PLAYERS = 8;

export interface CramponsRoomView {
  code: string;
  game: "crampons";
  status: RoomStatus;
  settings: CramponsRoomSettings;
  seats: SeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  /** Dans quelle équipe joue chaque siège */
  teams: Record<string, 0 | 1>;
  crampons: CramponsView | null;
  serverNow: number;
  rematch: string[];
  results?: Record<string, EloResult> | null;
  quick: boolean;
  tour?: string | null;
  /** Tournée : la fenêtre de choix des skins avant la partie, jusqu'à cette heure ; ceux qui sont prêts */
  pickUntil?: number | null;
  ready?: string[];
}

export type CramponsClientMessage =
  | { t: "settings"; settings: Partial<CramponsConfig>; visibility?: Visibility; maxPlayers?: number }
  /** Choisir son équipe */
  | { t: "team"; team: 0 | 1 }
  /** La célébration de ses buts, s'il l'a (les autres s'achètent à la boutique) */
  | { t: "fete"; fete: FeteId }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "kick"; userId: string }
  | { t: "start" }
  /** La direction du stick, le sprint et le pressing, plusieurs fois par seconde */
  | { t: "in"; x: number; z: number; s: boolean; p: boolean; c?: number }
  /** Un geste : passer, frapper, tacler, changer de joueur */
  | { t: "act"; k: string; p: number; x: number; z: number; to?: number }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "rematch" }
  | { t: "sit" }
  | { t: "leave" }
  /** Tournée : prêt à jouer, sans attendre la fin de la fenêtre de choix des skins */
  | { t: "ready" }
  | { t: "close" };

export type CramponsServerMessage =
  | { t: "room"; room: CramponsRoomView; events: MatchEvent[] }
  | ({ t: "tick"; now: number } & CramponsTick)
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  /** Le même compte vient de rejoindre la table depuis un autre appareil : c'est là-bas qu'il joue désormais */
  | { t: "replaced" };

export type NavalServerMessage =
  | { t: "room"; room: NavalRoomView; events: NavalEvent[] }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  /** Le même compte vient de rejoindre la table depuis un autre appareil : c'est là-bas qu'il joue désormais */
  | { t: "replaced" };

export type RoomServerMessage =
  | { t: "room"; room: RoomView; events: UnoEvent[] }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  /** Le même compte vient de rejoindre la table depuis un autre appareil : c'est là-bas qu'il joue désormais */
  | { t: "replaced" };

export interface RoomSummary {
  code: string;
  game: TableGame;
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
  game: TableGame;
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
  | { t: "invite"; from: PublicUser; code: string; game: TableGame }
  /** La réponse d'un ami à une invitation : il arrive, ou pas maintenant */
  | { t: "inviteReply"; from: PublicUser; code: string; accepted: boolean }
  | { t: "announce"; announcement: Announcement }
  | { t: "signedOut"; reason: string };

export type HubClientMessage =
  | { t: "watchLobby"; on: boolean }
  | { t: "invite"; to: string; code: string }
  | { t: "inviteReply"; to: string; code: string; accepted: boolean };
