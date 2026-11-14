// Arriver à une table : ce que veut celui qui arrive (jouer, regarder), ce que l'hôte permet une fois la partie
// lancée (« Rejoindre en cours de route : Oui / Non »), et ce qu'on en fait. Le serveur seul décide : chaque salle
// appelle `arrival` à chaque connexion, l'écran ne fait que proposer les choix et les expliquer.

import { GAME_NAMES, type GameId, type TableGame } from "./protocol.ts";

/** Ce que veut celui qui arrive : jouer, regarder ; null quand il ne l'a pas dit (un lien partagé, un code tapé) */
export type ArrivalIntent = "play" | "watch" | null;

/** Dans l'adresse de la page : /salon/ABCD?regarder, /salon/ABCD?jouer (et de même pour la connexion à la salle) */
export const WATCH_PARAM = "regarder";
export const PLAY_PARAM = "jouer";

export function intentFrom(search: string): ArrivalIntent {
  const q = new URLSearchParams(search);
  return q.has(WATCH_PARAM) ? "watch" : q.has(PLAY_PARAM) ? "play" : null;
}

export function intentQuery(intent: ArrivalIntent): string {
  return intent === "watch" ? `?${WATCH_PARAM}` : intent === "play" ? `?${PLAY_PARAM}` : "";
}

/**
 * Les jeux qui savent faire entrer quelqu'un dans une partie déjà lancée : la tournée (il joue dès le jeu suivant) et
 * Crampons (l'ordinateur lui confie un joueur de l'équipe qui a le moins de monde). Ailleurs, chacun a sa main, sa
 * flotte, sa fortune ou son kart depuis le départ : on regarde, et on s'assoit pour la partie suivante.
 */
export const JOINS_STARTED: Record<TableGame, boolean> = {
  tour: true,
  crampons: true,
  uno: false,
  naval: false,
  bricks: false,
  capitale: false,
  meche: false,
  bolides: false,
};

/**
 * Par défaut, plus personne n'entre une fois la partie lancée, et seuls les amis des joueurs la regardent : rien ne
 * change pour ceux qui jouent sans qu'ils l'aient voulu. Une partie rapide, faite pour réunir des inconnus, reste
 * ouverte comme avant (on y rejoint une tournée en cours entre deux jeux).
 */
export function defaultLateJoin(quick: boolean): boolean {
  return quick;
}

/** Le réglage d'une table (les tables ouvertes avant ce réglage prennent la valeur par défaut) */
export function lateJoinOf(settings: { lateJoin?: boolean }, quick: boolean): boolean {
  return typeof settings.lateJoin === "boolean" ? settings.lateJoin : defaultLateJoin(quick);
}

/** Tout ce qui compte quand quelqu'un arrive (ou revient) à une table */
export interface ArrivalCase {
  intent: ArrivalIntent;
  /** Il a déjà sa place (un siège, ou joueur de la tournée) : il la retrouve toujours */
  seated: boolean;
  /** La partie est lancée : jeu en cours à une table, tournée commencée */
  started: boolean;
  /** « Rejoindre en cours de route » */
  lateJoin: boolean;
  /** Le jeu sait faire entrer quelqu'un dans une partie lancée */
  midGame: boolean;
  /** Il regarde déjà cette table : arrivé pour regarder, ou avant le départ. Il n'est jamais assis sans le demander */
  watcher: boolean;
  /** Ami d'au moins un joueur de la table (ou administrateur du site) */
  friend: boolean;
  /** Une place libre, ou un bot qui peut céder la sienne */
  room: boolean;
}

export type Arrival = "seat" | "watch" | "deny";

/** Ce qu'on fait de celui qui arrive : sa place, une place de spectateur, ou la porte. */
export function arrival(c: ArrivalCase): Arrival {
  if (c.seated) return "seat";
  if (c.started && !c.lateJoin && !c.watcher && !c.friend) return "deny";
  if (c.intent === "watch" || !c.room) return "watch";
  // Avant la partie (ou entre deux parties d'une table) : on s'assoit, sauf si on était venu regarder
  if (!c.started) return c.watcher && c.intent !== "play" ? "watch" : "seat";
  // Partie lancée : seulement s'il le demande, que l'hôte l'accepte et que le jeu le permet
  return c.intent === "play" && c.lateJoin && c.midGame ? "seat" : "watch";
}

/** L'amitié ne compte que pour une porte fermée : on évite la base de données le reste du temps */
export function needsFriendCheck(c: ArrivalCase): boolean {
  return c.started && !c.lateJoin && !c.seated && !c.watcher;
}

/** Peut-on prendre une place maintenant (le bouton « Prendre une place », le message « sit ») */
export function maySit(c: Pick<ArrivalCase, "started" | "lateJoin" | "midGame">): boolean {
  return !c.started || (c.lateJoin && c.midGame);
}

/** Ceux qui regardent une table, gardés sans fin raisonnable */
export function rememberWatcher(list: string[] | undefined, userId: string): string[] {
  const rest = (list ?? []).filter((id) => id !== userId);
  return [...rest.slice(-79), userId];
}

export function forgetWatcher(list: string[] | undefined, userId: string): string[] {
  return (list ?? []).filter((id) => id !== userId);
}

/** Pourquoi on reste à la porte : rien sur la partie elle-même (ni qui joue, ni où on en est) */
export const CLOSED_TABLE =
  "Cette partie a déjà commencé, et la table n'accepte plus personne en cours de route. Seuls les amis des joueurs peuvent la regarder.";
export const CLOSED_TOUR =
  "Cette tournée a déjà commencé, et elle n'accepte plus personne en cours de route. Seuls les amis des joueurs peuvent la suivre.";

export const isClosedMessage = (message: string) => message === CLOSED_TABLE || message === CLOSED_TOUR;

/** Ce qu'annonce le chat quand l'hôte change d'avis */
export function lateJoinNotice(game: TableGame, on: boolean): string {
  if (game === "tour")
    return on
      ? "La tournée s'ouvre en cours de route : ceux qui arrivent pourront la jouer ou la regarder."
      : "La tournée se ferme en cours de route : plus personne n'y entre une fois lancée, seuls les amis des joueurs la suivent.";
  return on
    ? "La table s'ouvre en cours de route : ceux qui arrivent pendant la partie pourront la regarder."
    : "La table se ferme en cours de route : une fois la partie lancée, seuls les amis des joueurs pourront la regarder.";
}

/** Sous l'option, au salon : ce que vaut le réglage pour ce jeu */
export function lateJoinHint(game: TableGame, on: boolean): string {
  if (game === "tour")
    return on
      ? "Qui arrive pendant la tournée choisit : la jouer dès le prochain jeu, ou la regarder."
      : "Une fois la tournée lancée, plus personne n'y entre. Seuls les amis d'un joueur peuvent la suivre.";
  if (!on) return "Une fois la partie lancée, plus personne ne s'assoit. Seuls les amis d'un joueur peuvent la regarder.";
  if (JOINS_STARTED[game]) return "Qui arrive pendant le match choisit : entrer sur le terrain tout de suite, ou regarder.";
  return `On n'entre pas dans une partie de ${GAME_NAMES[game as GameId]} déjà lancée : qui arrive la regarde, et s'assoit à la suivante.`;
}
