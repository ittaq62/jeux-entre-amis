// La tournée : la même bande enchaîne plusieurs jeux, tirés au hasard parmi ceux que l'hôte a cochés.
// La place à chaque jeu rapporte des points, cumulés jusqu'au podium.

import type { AvatarConfig } from "./avatar.ts";
import type { BotLevel as BricksBotLevel } from "./games/bricks/engine.ts";
import type { BotLevel as NavalBotLevel } from "./games/naval/engine.ts";
import type { AchievementUnlock, ChatMessage, GameId, PublicUser, Visibility } from "./protocol.ts";

/** Jeux qu'on peut mettre dans une tournée, dans l'ordre où l'hôte les voit */
export const TOUR_GAMES: GameId[] = ["uno", "bricks", "naval"];

/** Nombre de joueurs qu'accueille chaque jeu */
export const GAME_SEATS: Record<GameId, { min: number; max: number }> = {
  uno: { min: 2, max: 8 },
  naval: { min: 2, max: 6 },
  bricks: { min: 2, max: 6 },
};

export const TOUR_MIN_PLAYERS = 2;
export const TOUR_MAX_PLAYERS = 8;

/** Points selon la place : 10, 7, 5, 3, 2, 1, puis 1 point pour les places suivantes */
export const TOUR_POINTS = [10, 7, 5, 3, 2, 1] as const;

export function tourPoints(rank: number): number {
  return TOUR_POINTS[rank - 1] ?? 1;
}

export type TourEnd =
  { kind: "games"; count: number } | { kind: "score"; target: number } | { kind: "time"; minutes: number } | { kind: "endless" };

/** Les choix proposés à l'hôte pour chaque façon de finir */
export const END_CHOICES = { games: [3, 5, 7, 10], score: [30, 50, 100], time: [30, 60, 90] } as const;

/** Niveau des bots de la tournée, traduit pour chaque jeu */
export type TourBotLevel = "easy" | "normal" | "hard";

export const TOUR_BOT_LEVELS: Record<TourBotLevel, { label: string; naval: NavalBotLevel; bricks: BricksBotLevel }> = {
  easy: { label: "Facile", naval: "mousse", bricks: "apprenti" },
  normal: { label: "Moyen", naval: "chasseur", bricks: "confirme" },
  hard: { label: "Fort", naval: "amiral", bricks: "expert" },
};

export interface TourSettings {
  visibility: Visibility;
  maxPlayers: number;
  games: GameId[];
  end: TourEnd;
  /** Deux équipes fixes pour toute la tournée, sinon chacun pour soi */
  teams: boolean;
  /** Chaque jeu coché ne se joue qu'une fois : la tournée s'arrête quand ils sont tous passés */
  once: boolean;
  botLevel: TourBotLevel;
}

export function defaultTourSettings(visibility: Visibility): TourSettings {
  return {
    visibility,
    maxPlayers: TOUR_MAX_PLAYERS,
    games: [...TOUR_GAMES],
    end: { kind: "games", count: 5 },
    teams: false,
    once: false,
    botLevel: "normal",
  };
}

/** Les bots de la tournée : ils gardent leur nom d'un jeu à l'autre */
export const TOUR_BOT_NAMES = ["Gaston", "Ginette", "Marcel", "Josiane", "Raymond", "Huguette", "Lucien", "Simone"];

export const TOUR_TEAMS = ["Rouges", "Bleus"] as const;
export const TOUR_TEAM_COLORS = ["#d4453c", "#3f7fd8"] as const;

/** Délai entre deux jeux : le récap, le tirage, puis le départ */
export const INTERMISSION_MS = 25_000;
/** Avant le tout premier jeu, seulement le tirage */
export const FIRST_DRAW_MS = 9_000;
/** Temps laissé à la feuille de fin du jeu avant d'afficher l'entracte */
export const GAME_END_HOLD_MS = 5_000;

export function fitsGame(game: GameId, players: number): boolean {
  return players >= GAME_SEATS[game].min && players <= GAME_SEATS[game].max;
}

/** Jeu suivant : au hasard parmi les jeux cochés qui accueillent tout le monde, jamais deux fois de suite le même s'il y a le choix. */
export function drawGame(
  games: GameId[],
  players: number,
  previous: GameId | null,
  random: () => number,
  /** Jeux déjà joués, écartés quand chaque jeu ne se joue qu'une fois */
  exclude: GameId[] = [],
): GameId | null {
  const fit = [...new Set(games)].filter((g) => fitsGame(g, players) && !exclude.includes(g));
  if (fit.length === 0) return null;
  const pool = fit.length > 1 ? fit.filter((g) => g !== previous) : fit;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}

/** Le plus grand nombre de joueurs que peut accueillir au moins un des jeux cochés */
export function tourCapacity(games: GameId[]): number {
  return Math.max(TOUR_MIN_PLAYERS, ...games.map((g) => GAME_SEATS[g].max));
}

/** Score de chaque équipe : la somme des points de ses joueurs */
export function teamScores(members: { team: 0 | 1 | null; points: number }[]): [number, number] {
  const out: [number, number] = [0, 0];
  for (const m of members) if (m.team !== null) out[m.team] += m.points;
  return out;
}

export interface TourProgress {
  /** Jeux joués jusqu'au bout */
  played: number;
  /** Meilleur total : d'un joueur, ou d'une équipe en équipes */
  best: number;
  startedAt: number;
  now: number;
}

export function tourOver(end: TourEnd, o: TourProgress): boolean {
  switch (end.kind) {
    case "games":
      return o.played >= end.count;
    case "score":
      return o.best >= end.target;
    case "time":
      return o.now - o.startedAt >= end.minutes * 60_000;
    case "endless":
      return false;
  }
}

export function endLabel(end: TourEnd): string {
  switch (end.kind) {
    case "games":
      return `${end.count} jeux`;
    case "score":
      return `premier à ${end.target} points`;
    case "time":
      return `${end.minutes} minutes`;
    case "endless":
      return "sans fin";
  }
}

/** Le réglage de fin, nettoyé : seulement les valeurs proposées */
export function sanitizeEnd(raw: unknown): TourEnd | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  switch (o.kind) {
    case "games":
      return (END_CHOICES.games as readonly number[]).includes(o.count as number) ? { kind: "games", count: o.count as number } : null;
    case "score":
      return (END_CHOICES.score as readonly number[]).includes(o.target as number) ? { kind: "score", target: o.target as number } : null;
    case "time":
      return (END_CHOICES.time as readonly number[]).includes(o.minutes as number) ? { kind: "time", minutes: o.minutes as number } : null;
    case "endless":
      return { kind: "endless" };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Titres rigolos de fin de tournée
// ---------------------------------------------------------------------------

export interface TourTitle {
  id: string;
  label: string;
  userId: string;
  name: string;
  detail: string;
}

/** Ce qu'un joueur a fait à un jeu de la tournée */
export interface TourGameLine {
  game: GameId;
  rank: number;
  players: number;
  stats: Record<string, number>;
}

export interface TitleCandidate {
  userId: string;
  name: string;
  lines: TourGameLine[];
}

interface TitleRule {
  id: string;
  label: string;
  /** La valeur qui départage, et le texte qui l'explique ; null si le joueur n'y prétend pas */
  score: (c: TitleCandidate) => { value: number; detail: string } | null;
}

const sum = (c: TitleCandidate, game: GameId, key: string) =>
  c.lines.filter((l) => l.game === game).reduce((n, l) => n + (l.stats[key] ?? 0), 0);

const TITLE_RULES: TitleRule[] = [
  {
    id: "collector",
    label: "Le collectionneur",
    score: (c) => {
      const wins = c.lines.filter((l) => l.rank === 1).length;
      return wins >= 2 ? { value: wins, detail: `${wins} jeux gagnés` } : null;
    },
  },
  {
    id: "plus-four",
    label: "Le roi du +4",
    score: (c) => {
      const n = sum(c, "uno", "plusGiven");
      return n >= 4 ? { value: n, detail: `${n} cartes données à piocher` } : null;
    },
  },
  {
    id: "mason",
    label: "Le maçon",
    score: (c) => {
      const n = sum(c, "bricks", "lines");
      return n >= 10 ? { value: n, detail: `${n} lignes faites` } : null;
    },
  },
  {
    id: "wrecker",
    label: "Le démolisseur",
    score: (c) => {
      const n = sum(c, "bricks", "sent");
      return n >= 6 ? { value: n, detail: `${n} lignes grises envoyées` } : null;
    },
  },
  {
    id: "admiral",
    label: "L'amiral",
    score: (c) => {
      const shots = sum(c, "naval", "shots");
      const hits = sum(c, "naval", "hits");
      if (shots < 8) return null;
      const pct = Math.round((hits / shots) * 100);
      return { value: pct, detail: `${pct} % de tirs au but` };
    },
  },
  {
    id: "metronome",
    label: "Le métronome",
    score: (c) => {
      if (c.lines.length < 3) return null;
      const worst = Math.max(...c.lines.map((l) => l.rank));
      // Toujours sur le podium ou presque : plus la pire place est haute, mieux c'est
      return worst <= 3 ? { value: 10 - worst, detail: `jamais plus bas que ${worst === 1 ? "1er" : `${worst}e`}` } : null;
    },
  },
  {
    id: "brave",
    label: "Le courageux",
    score: (c) => {
      const lasts = c.lines.filter((l) => l.players > 2 && l.rank === l.players).length;
      return lasts >= 2 ? { value: lasts, detail: `${lasts} fois dernier, toujours là` } : null;
    },
  },
];

/** Titres de la tournée : chaque titre va au meilleur, deux titres au plus par joueur, cinq en tout. */
export function tourTitles(candidates: TitleCandidate[]): TourTitle[] {
  const out: TourTitle[] = [];
  const count = new Map<string, number>();
  for (const rule of TITLE_RULES) {
    let best: { c: TitleCandidate; value: number; detail: string } | null = null;
    for (const c of candidates) {
      if ((count.get(c.userId) ?? 0) >= 2) continue;
      const s = rule.score(c);
      if (s && (!best || s.value > best.value)) best = { c, ...s };
    }
    if (!best) continue;
    out.push({ id: rule.id, label: rule.label, userId: best.c.userId, name: best.c.name, detail: best.detail });
    count.set(best.c.userId, (count.get(best.c.userId) ?? 0) + 1);
    if (out.length >= 5) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ce que la tournée envoie aux écrans
// ---------------------------------------------------------------------------

export type TourStatus = "lobby" | "playing" | "intermission" | "finished";

export interface TourMemberView {
  /** Id du compte, ou du bot de la tournée */
  userId: string;
  kind: "human" | "bot";
  name: string;
  avatar: AvatarConfig;
  photo: number;
  admin: boolean;
  connected: boolean;
  /** Joue la tournée, ou la regarde seulement */
  role: "player" | "spectator";
  team: 0 | 1 | null;
  points: number;
  wins: number;
  /** Arrivé pendant un jeu : il entre au suivant */
  waiting: boolean;
  /** A quitté la tournée : ses points restent au classement */
  left: boolean;
  isHost: boolean;
}

export interface TourGameResult {
  userId: string;
  name: string;
  rank: number;
  points: number;
}

export interface TourGameView {
  index: number;
  game: GameId;
  code: string;
  startedAt: number;
  endedAt: number | null;
  /** Joueurs assis à ce jeu */
  players: string[];
  results: TourGameResult[] | null;
  /** Pas assez de monde au départ : le jeu ne compte pas */
  aborted: boolean;
}

export interface TourView {
  code: string;
  game: "tour";
  status: TourStatus;
  settings: TourSettings;
  hostId: string;
  members: TourMemberView[];
  /** Connectés qui passent sans faire partie de la tournée */
  spectators: { userId: string; name: string }[];
  you: { userId: string; isHost: boolean; isAdmin: boolean; member: boolean; role: "player" | "spectator" | null };
  games: TourGameView[];
  current: { index: number; game: GameId; code: string } | null;
  /** Jeu tiré pour la suite, et l'heure du départ (null : en pause) */
  next: { game: GameId; at: number | null } | null;
  startedAt: number | null;
  /** Tournée à durée fixe : l'heure à partir de laquelle le jeu en cours est le dernier */
  endsAt: number | null;
  /** L'hôte a demandé d'arrêter après le jeu en cours */
  finishAfterCurrent: boolean;
  titles: TourTitle[] | null;
  /** Pourquoi la tournée s'est mise en pause toute seule */
  notice: string | null;
  serverNow: number;
  quick: boolean;
}

export type TourClientMessage =
  | {
      t: "settings";
      settings: Partial<Pick<TourSettings, "games" | "end" | "teams" | "once" | "botLevel">>;
      visibility?: Visibility;
      maxPlayers?: number;
    }
  | { t: "start" }
  /** Jouer la tournée (plutôt que la regarder) */
  | { t: "sit" }
  /** Regarder seulement */
  | { t: "watch" }
  | { t: "team"; seatId: string; team: 0 | 1 }
  | { t: "kick"; userId: string }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  /** Hôte, à l'entracte : lancer le jeu tiré sans attendre */
  | { t: "launch" }
  | { t: "pause" }
  | { t: "resume" }
  /** Hôte : finir la tournée (à l'entracte), ou après le jeu en cours */
  | { t: "finish" }
  /** Hôte, une fois la tournée finie : en relancer une avec la même bande */
  | { t: "again" }
  | { t: "leave" }
  | { t: "close" };

export type TourServerMessage =
  | { t: "tour"; tour: TourView }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string };

/** Ce qu'une table de jeu de la tournée renvoie à la fin de sa partie */
export interface TableReport {
  code: string;
  index: number;
  game: GameId;
  /** Nombre de joueurs assis, bots compris */
  seats: number;
  /** Chaque joueur assis : le compte, ou le bot de la tournée (son id de siège) */
  players: { userId: string; rank: number; stats: Record<string, number> }[];
}

/** Ce que la tournée confie à une table de jeu en la créant */
export interface TourInit {
  code: string;
  index: number;
  players: PublicUser[];
  /** Les bots de la tournée assis à ce jeu, avec leur nom */
  bots: { id: string; name: string; avatar: AvatarConfig }[];
  botLevel: TourBotLevel;
  /** Équipe de chacun (comptes et bots) quand le jeu se joue en 2 contre 2 */
  teams: Record<string, 0 | 1> | null;
}

/** Le nom de chaque titre, pour la feuille d'une tournée passée */
export const TITLE_LABELS: Record<string, string> = Object.fromEntries(TITLE_RULES.map((r) => [r.id, r.label]));
