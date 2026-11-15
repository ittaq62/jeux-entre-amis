// La série : les jours d'affilée où l'on ouvre l'accueil connecté (ils rapportent des points, sur un cycle de 7 jours),
// ceux où l'on termine une partie, et le défi de la semaine (jouer à chacun des jeux).
// Un jour, c'est une date à Paris, heure d'été comprise. Tout se décide et se verse sur le serveur.

import type { GameId } from "./protocol.ts";

/**
 * Ce que rapporte chaque jour du cycle de connexion. Une semaine complète vaut 80 points : à peu près quatre parties
 * ordinaires (une victoire contre trois bots en rapporte 45), les deux tiers d'un paquet de cartes (120).
 */
export const LOGIN_LADDER = [5, 5, 10, 10, 10, 15, 25] as const;
export const CYCLE_DAYS = LOGIN_LADDER.length;
/** Un joker se gagne au 7e jour d'un cycle ; jamais plus d'un en réserve */
export const MAX_JOKERS = 1;
/** Le défi de la semaine : 10 points par jeu ouvert à ce compte, s'il y en a au moins deux */
export const WEEK_POINTS_PER_GAME = 10;
export const WEEK_MIN_GAMES = 2;
/** Une partie plus courte ne compte pas (lancée puis abandonnée tout de suite) */
export const MIN_GAME_MS = 30_000;
/** Les jours de jeu gardés : de quoi vérifier cette semaine et la précédente */
export const PLAY_DAYS_KEPT = 56;

const DAY_MS = 86_400_000;
const PARIS = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** La date à Paris (AAAA-MM-JJ) d'un instant, heure d'été comprise */
export function parisDay(ts: number): string {
  const parts = PARIS.formatToParts(ts);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Le numéro d'un jour : deux jours qui se suivent ont deux numéros qui se suivent, quelle que soit l'heure d'été */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS);
}

export function addDays(day: string, n: number): string {
  return new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10);
}

/** Le lundi de la semaine d'un jour */
export function weekStart(day: string): string {
  const weekday = (new Date(dayNumber(day) * DAY_MS).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

// ---------------------------------------------------------------------------
// La série de connexion
// ---------------------------------------------------------------------------

export interface LoginState {
  /** Le dernier jour où l'accueil a été ouvert (et le jour payé) */
  day: string | null;
  streak: number;
  best: number;
  jokers: number;
}

export interface LoginClaim {
  state: LoginState;
  reward: number;
  /** La place de ce jour dans le cycle, de 1 à 7 */
  cycleDay: number;
  /** Un seul jour raté : le joker l'a couvert */
  jokerUsed: boolean;
  /** 7e jour : un joker de plus en réserve */
  jokerEarned: boolean;
  /** La série qui vient de s'arrêter (0 si elle continue) */
  lost: number;
}

export const cycleDayOf = (streak: number) => ((Math.max(1, streak) - 1) % CYCLE_DAYS) + 1;

/**
 * Ce que vaut l'ouverture de l'accueil aujourd'hui, ou null si ce jour est déjà compté. Le lendemain du dernier jour, la
 * série continue ; un seul jour raté, un joker la sauve (s'il y en a un) ; sinon elle repart à 1.
 */
export function claimLogin(prev: LoginState | null, today: string): LoginClaim | null {
  const p = prev ?? { day: null, streak: 0, best: 0, jokers: 0 };
  let streak = 1;
  let jokers = Math.max(0, Math.min(MAX_JOKERS, p.jokers));
  let jokerUsed = false;
  let lost = 0;
  if (p.day) {
    const gap = dayNumber(today) - dayNumber(p.day);
    // Déjà compté (ou une horloge qui recule) : rien de plus
    if (gap <= 0) return null;
    if (gap === 1) streak = p.streak + 1;
    else if (gap === 2 && jokers > 0) {
      streak = p.streak + 1;
      jokers -= 1;
      jokerUsed = true;
    } else lost = p.streak;
  }
  streak = Math.max(1, streak);
  const cycleDay = cycleDayOf(streak);
  const jokerEarned = cycleDay === CYCLE_DAYS && jokers < MAX_JOKERS;
  if (jokerEarned) jokers += 1;
  return {
    state: { day: today, streak, best: Math.max(p.best, streak), jokers },
    reward: LOGIN_LADDER[cycleDay - 1]!,
    cycleDay,
    jokerUsed,
    jokerEarned,
    lost,
  };
}

/** La série telle qu'elle est aujourd'hui : encore en vie (comptée aujourd'hui, hier, ou sauvable par un joker), ou 0 */
export function liveLogin(state: LoginState | null, today: string): number {
  if (!state?.day) return 0;
  const gap = dayNumber(today) - dayNumber(state.day);
  if (gap <= 1 || (gap === 2 && state.jokers > 0)) return state.streak;
  return 0;
}

// ---------------------------------------------------------------------------
// Les jours de jeu
// ---------------------------------------------------------------------------

export interface PlayState {
  day: string | null;
  streak: number;
  best: number;
}

/** Une partie terminée ce jour-là : la série de jeu après elle, ou null si ce jour est déjà compté */
export function nextPlay(prev: PlayState | null, day: string): PlayState | null {
  const p = prev ?? { day: null, streak: 0, best: 0 };
  let streak = 1;
  if (p.day) {
    const gap = dayNumber(day) - dayNumber(p.day);
    if (gap <= 0) return null;
    if (gap === 1) streak = Math.max(0, p.streak) + 1;
  }
  return { day, streak, best: Math.max(p.best, streak) };
}

/** La série de jeu aujourd'hui : en vie si la dernière partie comptée date d'aujourd'hui ou d'hier */
export function livePlay(state: PlayState | null, today: string): number {
  if (!state?.day) return 0;
  return dayNumber(today) - dayNumber(state.day) <= 1 ? state.streak : 0;
}

export interface StreakPlayer {
  userId: string | null;
  isBot: boolean;
  /** Plus à la table à la fin : parti, déconnecté ou absent, un bot jouait pour lui */
  absent?: boolean;
}

/** Une partie compte pour sa série : un humain avec un compte, encore là à la fin, après au moins 30 secondes de jeu */
export function countsForStreak(p: StreakPlayer, startedAt: number, endedAt: number): boolean {
  return p.userId !== null && p.userId !== "" && !p.isBot && !p.absent && endedAt - startedAt >= MIN_GAME_MS;
}

// ---------------------------------------------------------------------------
// Le défi de la semaine
// ---------------------------------------------------------------------------

/** Ce que rapporte le défi de la semaine (0 s'il n'y a pas assez de jeux ouverts pour en faire un) */
export function weekBonus(games: readonly GameId[]): number {
  return games.length >= WEEK_MIN_GAMES ? games.length * WEEK_POINTS_PER_GAME : 0;
}

/** Il a joué à chacun des jeux cette semaine-là */
export function weekDone(games: readonly GameId[], played: ReadonlySet<string>): boolean {
  return weekBonus(games) > 0 && games.every((g) => played.has(g));
}

// ---------------------------------------------------------------------------
// Ce qu'échangent le site et le serveur
// ---------------------------------------------------------------------------

export interface StreakStatus {
  /** Aujourd'hui, à Paris */
  today: string;
  login: {
    /** La série en cours (0 si elle s'est arrêtée) */
    streak: number;
    best: number;
    jokers: number;
    /** Aujourd'hui est déjà compté */
    claimedToday: boolean;
    /** La place d'aujourd'hui dans le cycle (celle qu'il aura en ouvrant l'accueil, s'il ne l'a pas encore fait) */
    cycleDay: number;
  };
  play: { streak: number; best: number; today: boolean };
  week: {
    /** Le lundi de la semaine */
    start: string;
    /** Les jeux du défi (ceux ouverts à ce compte) et ceux déjà joués cette semaine */
    games: GameId[];
    played: GameId[];
    bonus: number;
    paid: boolean;
  };
}

export interface StreakGain {
  day: Omit<LoginClaim, "state"> | null;
  /** Les défis de la semaine réussis et versés par cette requête (celui de la semaine dernière, s'il restait) */
  weeks: { start: string; bonus: number; current: boolean }[];
}

export interface StreakClaimResponse {
  status: StreakStatus;
  gained: StreakGain;
  balance: number;
}
