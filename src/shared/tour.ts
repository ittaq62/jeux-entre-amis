// La tournée : la même bande enchaîne plusieurs jeux, tirés au hasard parmi ceux que l'hôte a cochés.
// La place à chaque jeu rapporte des points, cumulés jusqu'au podium.

import type { AvatarConfig } from "./avatar.ts";
import type { BotLevel as BolidesBotLevel } from "./games/bolides/bot.ts";
import type { BolidesSettings } from "./games/bolides/race.ts";
import type { BotLevel as BricksBotLevel, BricksSettings } from "./games/bricks/engine.ts";
import type { CramponsConfig } from "./games/crampons/view.ts";
import type { CulbuteConfig } from "./games/culbute/view.ts";
import type { MinigolfConfig } from "./games/minigolf/match.ts";
import type { BotLevel as EscarmoucheBotLevel, EscarmoucheSettings } from "./games/escarmouche/rules.ts";
import type { BotLevel as NavalBotLevel, NavalSettings } from "./games/naval/engine.ts";
import type { BotLevel as CapitaleBotLevel, CapitaleSettings, TeamRent } from "./games/capitale/engine.ts";
import type { BotLevel as MecheBotLevel, MecheSettings } from "./games/meche/engine.ts";
import type { UnoSettings } from "./games/uno/engine.ts";
import type { Looks } from "./looks.ts";
import type { AchievementUnlock, ChatMessage, GameId, PublicUser, Visibility } from "./protocol.ts";

/** Jeux qu'on peut mettre dans une tournée, dans l'ordre où l'hôte les voit */
export const TOUR_GAMES: GameId[] = [
  "uno",
  "bricks",
  "naval",
  "capitale",
  "meche",
  "bolides",
  "crampons",
  "escarmouche",
  "culbute",
  "minigolf",
];
/**
 * Capitale dure 20 minutes dans une tournée, Mèche, Bolides et Crampons se découvrent encore :
 * l'hôte les coche s'il veut, ils ne le sont pas d'office
 */
const DEFAULT_TOUR_GAMES: GameId[] = TOUR_GAMES.filter(
  (g) =>
    g !== "capitale" && g !== "meche" && g !== "bolides" && g !== "crampons" && g !== "culbute" && g !== "escarmouche" && g !== "minigolf",
);

/** Nombre de joueurs qu'accueille chaque jeu */
export const GAME_SEATS: Record<GameId, { min: number; max: number }> = {
  uno: { min: 2, max: 8 },
  naval: { min: 2, max: 6 },
  bricks: { min: 2, max: 6 },
  capitale: { min: 2, max: 6 },
  meche: { min: 2, max: 8 },
  bolides: { min: 2, max: 8 },
  crampons: { min: 2, max: 8 },
  culbute: { min: 2, max: 8 },
  minigolf: { min: 2, max: 8 },
  escarmouche: { min: 2, max: 8 },
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

export const TOUR_BOT_LEVELS: Record<
  TourBotLevel,
  {
    label: string;
    naval: NavalBotLevel;
    bricks: BricksBotLevel;
    capitale: CapitaleBotLevel;
    meche: MecheBotLevel;
    bolides: BolidesBotLevel;
    /** Crampons : le niveau de l'ordinateur, de 0 (Débutant) à 3 (Légende) */
    crampons: number;
    escarmouche: EscarmoucheBotLevel;
  }
> = {
  easy: {
    label: "Facile",
    naval: "mousse",
    bricks: "apprenti",
    capitale: "facile",
    meche: "facile",
    bolides: "facile",
    crampons: 0,
    escarmouche: "facile",
  },
  normal: {
    label: "Moyen",
    naval: "chasseur",
    bricks: "confirme",
    capitale: "moyen",
    meche: "moyen",
    bolides: "moyen",
    crampons: 1,
    escarmouche: "moyen",
  },
  hard: {
    label: "Fort",
    naval: "amiral",
    bricks: "expert",
    capitale: "fort",
    meche: "fort",
    bolides: "fort",
    crampons: 2,
    escarmouche: "fort",
  },
};

/** Comment se choisissent les règles de chaque jeu */
export type TourRulesMode = "base" | "random" | "vote";

export const RULES_MODES: Record<TourRulesMode, { label: string; hint: string }> = {
  base: { label: "De base", hint: "Chaque jeu se joue avec ses règles habituelles." },
  random: { label: "Au hasard", hint: "Les règles sont tirées au sort avec le jeu, et révélées juste après." },
  vote: { label: "Votées", hint: "À chaque entracte, on vote pour les règles du jeu tiré : adoptées dès la moitié des voix." },
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
  /**
   * Comment se choisissent les règles. UNO : « pas de UNO d'avance » en fait partie (une règle à part, tirée au sort
   * ou votée oui ou non) ; de base, on joue la règle habituelle.
   */
  rules: TourRulesMode;
  /**
   * Capitale en équipes : le loyer entre coéquipiers, les dons, l'héritage et la victoire d'équipe. Réglés à part par
   * l'hôte : jamais tirés ni votés avec les règles.
   */
  capitaleTeam: CapitaleTeamRules;
  /** Rejoindre en cours de route : qui arrive pendant la tournée peut la jouer dès le prochain jeu, ou la regarder ; sinon seuls les amis des joueurs la suivent */
  lateJoin?: boolean;
}

/** Les règles d'équipe de Capitale qu'une tournée confie à ses tables */
export type CapitaleTeamRules = Pick<CapitaleSettings, "teamRent" | "teamGifts" | "teamHeir" | "teamWin">;
export const DEFAULT_CAPITALE_TEAM: CapitaleTeamRules = { teamRent: "free", teamGifts: true, teamHeir: true, teamWin: true };

/** Les règles d'équipe de Capitale reçues de l'hôte, complétées et vérifiées */
export function cleanCapitaleTeam(raw: unknown, base: CapitaleTeamRules = DEFAULT_CAPITALE_TEAM): CapitaleTeamRules {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rents: TeamRent[] = ["free", "half", "full"];
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    teamRent: rents.includes(r.teamRent as TeamRent) ? (r.teamRent as TeamRent) : base.teamRent,
    teamGifts: bool(r.teamGifts, base.teamGifts),
    teamHeir: bool(r.teamHeir, base.teamHeir),
    teamWin: bool(r.teamWin, base.teamWin),
  };
}

export function defaultTourSettings(visibility: Visibility): TourSettings {
  return {
    visibility,
    maxPlayers: TOUR_MAX_PLAYERS,
    games: [...DEFAULT_TOUR_GAMES],
    end: { kind: "games", count: 5 },
    teams: false,
    once: false,
    botLevel: "normal",
    rules: "base",
    capitaleTeam: { ...DEFAULT_CAPITALE_TEAM },
  };
}

/** Les bots de la tournée : ils gardent leur nom d'un jeu à l'autre */
export const TOUR_BOT_NAMES = ["Gaston", "Ginette", "Marcel", "Josiane", "Raymond", "Huguette", "Lucien", "Simone"];

/** Les bots invités d'un seul jeu : ils ne sont pas membres de la tournée et n'y marquent aucun point */
export const TOUR_GUEST_PREFIX = "invite-";

/**
 * Bolides en règles tirées au sort : le nombre de bots aussi. Parfois aucun (s'il y a au moins deux joueurs), sinon
 * de un jusqu'à remplir la grille.
 */
export function drawBolidesBots(humans: number, maxSeats: number, random: () => number): number {
  const room = Math.max(0, maxSeats - humans);
  const least = humans >= 2 ? 0 : 1;
  if (room <= least) return Math.min(room, least);
  if (least === 0 && random() < 0.3) return 0;
  return 1 + Math.floor(random() * room);
}

export const TOUR_TEAMS = ["Rouges", "Bleus"] as const;
export const TOUR_TEAM_COLORS = ["#d4453c", "#3f7fd8"] as const;

/** L'entracte entre deux jeux, une fois la feuille de fin du jeu passée : le récap, le tirage, puis le départ */
export const INTERMISSION_MS = 20_000;
/** Avant le tout premier jeu, seulement le tirage */
export const FIRST_DRAW_MS = 9_000;
/**
 * La feuille de fin d'un jeu reste au plus tant à l'écran avant l'entracte (ou la fin de la tournée), le temps de lire le
 * résultat et de signaler un problème ; quand tous les joueurs du jeu appuient sur « Continuer », on passe tout de suite.
 */
export const GAME_END_HOLD_MS = 15_000;

/** La feuille de fin du dernier jeu : de quelle table, jusqu'à quand, et qui a déjà appuyé sur « Continuer » */
export interface TourEndHold {
  code: string;
  until: number;
  done: string[];
}
/** Règles votées : un peu plus de temps à l'entracte pour voter */
export const VOTE_EXTRA_MS = 12_000;

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
// Les règles de chaque jeu : quelques variantes nommées, la première est celle de base
// ---------------------------------------------------------------------------

interface VariantOf<S> {
  id: string;
  name: string;
  blurb: string;
  /** Ce qui change par rapport aux réglages habituels du jeu */
  settings: Partial<S>;
}

/** Un format du jeu : ils s'excluent entre eux (la taille de la grille, le paquet de cartes, le mode de partie…) */
interface Format<S> extends VariantOf<S> {
  /** Au hasard : son poids parmi les formats du jeu (1 sans rien) */
  weight?: number;
}

export interface TourVariant {
  id: string;
  name: string;
  blurb: string;
}

// Les règles d'un jeu se tirent en deux temps : un format (ils s'excluent : un seul), puis des règles à part, tirées
// chacune de leur côté et cumulables, jusqu'à un plafond par jeu pour que la partie reste jouable. Une règle à part peut
// ne se jouer qu'avec certains formats (`bases`), ou exclure les autres règles de son groupe (`group`). Les règles
// tirées s'écrivent « format+règle+règle », dans l'ordre du jeu : « grande+salve+arsenal ».

const UNO_VARIANTS: Format<UnoSettings>[] = [
  { id: "classique", name: "Classique", blurb: "108 cartes ; les +2 et les +4 se cumulent.", settings: {}, weight: 3 },
  {
    id: "no-mercy",
    name: "No Mercy",
    blurb: "168 cartes avec des +6, des +10 et la roulette ; on est éliminé à 25 cartes.",
    settings: { variant: "nomercy" },
  },
];

const NAVAL_VARIANTS: Format<NavalSettings>[] = [
  { id: "classique", name: "Classique", blurb: "La grille habituelle, 10 × 10.", settings: {}, weight: 2 },
  { id: "eclair", name: "Éclair", blurb: "Petite grille 8 × 8 : ça va très vite.", settings: { grid: 8 } },
  { id: "grande", name: "Grande grille", blurb: "Grille 12 × 12 : la flotte a de la place pour se cacher.", settings: { grid: 12 } },
];

/** Une règle à part qu'on annonce toujours, par oui ou par non : au UNO, « pas de UNO d'avance » */
interface AskedRule {
  /** La question du vote */
  question: string;
  /** Ce qui se joue quand elle n'est pas retenue : la règle habituelle */
  offName: string;
  offBlurb: string;
}

interface Modifier extends VariantOf<object> {
  /** Au hasard : sa chance d'être tirée */
  chance: number;
  /** Les formats avec lesquels elle se joue (tous sans rien) */
  bases?: string[];
  /** Pourquoi elle est écartée avec les autres formats (aux règles votées) */
  unfit?: string;
  /** Deux règles du même groupe ne se cumulent pas (Culbute : sans objets ou pluie d'objets) */
  group?: string;
  /** Annoncée toujours, retenue ou non, et tirée hors du plafond */
  asked?: AskedRule;
}

/** Les règles à part de chaque jeu, dans l'ordre où elles s'écrivent et s'annoncent */
const MODIFIERS: Partial<Record<GameId, Modifier[]>> = {
  uno: [
    {
      id: "sept-zero",
      name: "7-0",
      blurb: "Un 7 échange ta main avec celle de ton choix, un 0 fait tourner toutes les mains.",
      settings: { sevenZero: true } satisfies Partial<UnoSettings>,
      chance: 0.35,
      // En No Mercy, le 7-0 et la pioche sans fin sont déjà la règle
      bases: ["classique"],
      unfit: "déjà la règle en No Mercy",
    },
    {
      id: "interception",
      name: "interception",
      blurb: "Une carte strictement identique se joue hors de son tour.",
      settings: { jumpIn: true } satisfies Partial<UnoSettings>,
      chance: 0.35,
    },
    {
      id: "pioche",
      name: "pioche sans fin",
      blurb: "On pioche tant qu'aucune carte ne peut être posée.",
      settings: { drawUntilPlayable: true } satisfies Partial<UnoSettings>,
      chance: 0.3,
      bases: ["classique"],
      unfit: "déjà la règle en No Mercy",
    },
    {
      id: "sans-avance",
      name: "pas de UNO d'avance",
      blurb: "On crie UNO avec sa dernière carte seule en main, plus avec deux.",
      settings: { noEarlyUno: true } satisfies Partial<UnoSettings>,
      chance: 0.5,
      asked: {
        question: "Pas de UNO d'avance ?",
        offName: "UNO d'avance permis",
        offBlurb: "On peut crier UNO dès qu'il ne reste que deux cartes en main, comme d'habitude.",
      },
    },
  ],
  naval: [
    {
      id: "salve",
      name: "salve",
      blurb: "À chaque tour, autant de tirs que de navires encore à flot, au lieu de rejouer quand on touche.",
      settings: { shots: "salvo" } satisfies Partial<NavalSettings>,
      chance: 0.35,
    },
    {
      id: "arsenal",
      name: "arsenal",
      blurb: "Couler un navire rapporte une arme : radar, torpille ou barrage.",
      settings: { arsenal: true } satisfies Partial<NavalSettings>,
      chance: 0.35,
      // Sur la petite grille, les armes videraient la mer en trois tours
      bases: ["classique", "grande"],
      unfit: "pas sur la petite grille",
    },
    {
      id: "colles",
      name: "navires collés",
      blurb: "Les navires peuvent se toucher.",
      settings: { touching: true } satisfies Partial<NavalSettings>,
      chance: 0.45,
    },
  ],
  bricks: [
    {
      id: "vrac",
      name: "lignes en vrac",
      blurb: "Chaque ligne grise reçue a son propre trou : plus dur à déblayer.",
      settings: { messy: true } satisfies Partial<BricksSettings>,
      chance: 0.4,
    },
    {
      id: "ancienne",
      name: "à l'ancienne",
      blurb: "Pas de réserve, et une seule pièce annoncée à l'avance.",
      settings: { hold: false, previews: 1 } satisfies Partial<BricksSettings>,
      chance: 0.35,
    },
  ],
  capitale: [
    {
      id: "cagnotte",
      name: "cagnotte",
      blurb: "Taxes et amendes s'entassent sur l'Aire de repos, et tomber pile sur Départ double le salaire.",
      settings: { freeParking: true, doubleGo: true } satisfies Partial<CapitaleSettings>,
      chance: 0.35,
    },
    {
      id: "depart-rapide",
      name: "départ rapide",
      blurb: "Chacun commence avec deux titres tirés au sort.",
      settings: { quickStart: true } satisfies Partial<CapitaleSettings>,
      chance: 0.3,
    },
    {
      id: "monopole",
      name: "Monopole",
      blurb: "Trois quartiers complets, toutes les rues d'un côté ou les quatre gares\u00a0: la partie s'arrête net, victoire.",
      settings: { monopoly: true } satisfies Partial<CapitaleSettings>,
      chance: 0.3,
    },
    {
      id: "prison-sans-loyer",
      name: "prison sans loyer",
      blurb: "Un propriétaire en prison ne touche plus ses loyers.",
      settings: { noRentInJail: true } satisfies Partial<CapitaleSettings>,
      chance: 0.3,
    },
    {
      id: "batisseurs",
      name: "bâtisseurs libres",
      blurb:
        "L'ancienne façon de bâtir\u00a0: une rue seule monte jusqu'à l'immeuble, sans construction équilibrée, et pas de rachat des villes.",
      settings: { evenBuild: false, buyout: false } satisfies Partial<CapitaleSettings>,
      chance: 0.25,
      // Le Builder a sa propre façon de bâtir
      bases: ["classique"],
      unfit: "le Builder a sa propre façon de bâtir",
    },
    {
      id: "ciel-serein",
      name: "ciel serein",
      blurb: "Pas de catastrophes dans les paquets\u00a0: ni séisme, ni tempête, ni cession forcée.",
      settings: { disasters: false } satisfies Partial<CapitaleSettings>,
      chance: 0.3,
    },
  ],
  meche: [
    {
      id: "marabout",
      name: "marabout",
      blurb: "Les lettres à placer sont les deux dernières du mot d'avant : choisis bien comment tu finis.",
      settings: { source: "marabout" } satisfies Partial<MecheSettings>,
      chance: 0.35,
    },
    {
      id: "courte",
      name: "courte mèche",
      blurb: "La mèche brûle bien plus vite.",
      settings: { pace: "nerveux" } satisfies Partial<MecheSettings>,
      chance: 0.35,
    },
    {
      id: "corsee",
      name: "lettres corsées",
      blurb: "Des lettres difficiles dès la première mèche.",
      settings: { difficulty: "corse" } satisfies Partial<MecheSettings>,
      chance: 0.3,
    },
  ],
  bolides: [
    {
      id: "pure",
      name: "course pure",
      blurb: "Pas de caisses d'objets : rien que le pilotage.",
      settings: { items: false } satisfies Partial<BolidesSettings>,
      chance: 0.3,
    },
    {
      id: "vitesse",
      name: "grande vitesse",
      blurb: "Les karts vont bien plus vite.",
      settings: { speed: "bolide" } satisfies Partial<BolidesSettings>,
      chance: 0.35,
    },
    {
      id: "miroir",
      name: "circuit en miroir",
      blurb: "Le circuit à l'envers, gauche et droite échangées : tout est à réapprendre.",
      settings: { mirror: true } satisfies Partial<BolidesSettings>,
      chance: 0.3,
    },
  ],
  crampons: [
    {
      id: "tab",
      name: "pas de nul",
      blurb: "En cas d'égalité, une séance de tirs au but désigne le vainqueur.",
      settings: { draw: "penalties" } satisfies Partial<CramponsConfig>,
      chance: 0.4,
    },
  ],
  escarmouche: [
    {
      id: "sans-filet",
      name: "sans filet",
      blurb: "Pas de réticule, pas de santé qui revient, et des balles qui font plus mal.",
      settings: { hardcore: true } satisfies Partial<EscarmoucheSettings>,
      chance: 0.3,
    },
    {
      id: "nuit",
      name: "de nuit",
      blurb: "La lune et les lampadaires pour seule lumière ; les bots voient moins loin.",
      settings: { night: true } satisfies Partial<EscarmoucheSettings>,
      chance: 0.3,
    },
  ],
  culbute: [
    {
      id: "sans-objets",
      name: "sans objets",
      blurb: "Rien ne tombe du ciel : rien que les combattants.",
      settings: { items: "aucun" } satisfies Partial<CulbuteConfig>,
      chance: 0.25,
      group: "objets",
    },
    {
      id: "pluie",
      name: "pluie d'objets",
      blurb: "Il y a toujours quelque chose à ramasser.",
      settings: { items: "beaucoup" } satisfies Partial<CulbuteConfig>,
      chance: 0.3,
      group: "objets",
    },
    {
      id: "lune",
      name: "sur la lune",
      blurb: "On saute plus haut et on retombe lentement : les combats durent en l'air.",
      settings: { lune: true } satisfies Partial<CulbuteConfig>,
      chance: 0.3,
    },
  ],
  minigolf: [
    {
      id: "envers",
      name: "à l'envers",
      blurb: "Chaque trou se joue en miroir : la gauche devient la droite.",
      settings: { mirror: true } satisfies Partial<MinigolfConfig>,
      chance: 0.3,
    },
    {
      id: "lune",
      name: "sur la lune",
      blurb: "La pesanteur fond : les sauts durent, les pentes poussent à peine.",
      settings: { lune: true } satisfies Partial<MinigolfConfig>,
      chance: 0.25,
    },
    {
      id: "glace",
      name: "tout glisse",
      blurb: "Le gazon devient patinoire : la balle roule bien plus loin.",
      settings: { glace: true } satisfies Partial<MinigolfConfig>,
      chance: 0.2,
    },
    {
      id: "bonus",
      name: "bulles bonus",
      blurb: "Trois bulles par trou : en traverser une donne un pouvoir pour le coup suivant.",
      settings: { bonus: true } satisfies Partial<MinigolfConfig>,
      chance: 0.25,
    },
  ],
};

/**
 * Combien de règles à part au plus, en plus du format (les règles qu'on annonce toujours, comme « pas de UNO
 * d'avance », n'en font pas partie) : de quoi changer la partie sans la rendre méconnaissable
 */
const MAX_EXTRAS: Partial<Record<GameId, number>> = { capitale: 3, crampons: 1 };
const DEFAULT_MAX_EXTRAS = 2;

/** Le plus de règles à part qu'un tirage cumule pour ce jeu */
export function maxExtras(game: GameId): number {
  return MAX_EXTRAS[game] ?? DEFAULT_MAX_EXTRAS;
}

/**
 * Les anciennes variantes devenues des règles à part : une tournée commencée avant, un vote ou l'historique d'une
 * partie peuvent encore les nommer. « monopole » se lit « classique+monopole ».
 */
const LEGACY: Partial<Record<GameId, Record<string, string>>> = {
  uno: { "sept-zero": "classique+sept-zero+interception", pioche: "classique+pioche" },
  naval: { salve: "classique+salve", arsenal: "grande+arsenal" },
  bricks: { vrac: "survie+vrac", ancienne: "survie+ancienne" },
  capitale: {
    cagnotte: "classique+cagnotte",
    "depart-rapide": "classique+depart-rapide",
    monopole: "classique+monopole",
    "prison-sans-loyer": "classique+prison-sans-loyer",
    batisseurs: "classique+batisseurs",
    "ciel-serein": "classique+ciel-serein",
  },
  meche: { marabout: "classique+marabout", courte: "classique+courte", corsee: "classique+corsee" },
  bolides: { pure: "classique+pure", vitesse: "classique+vitesse" },
  crampons: { tab: "classique+tab" },
  escarmouche: { "sans-filet": "classique+sans-filet" },
  culbute: { "sans-objets": "classique+sans-objets", pluie: "classique+pluie", lune: "classique+lune" },
};

/** Les règles tirées, avec une ancienne variante remplacée par ce qu'elle est devenue */
function expandLegacy(game: GameId, id: string | null | undefined): string[] {
  const [head, ...mods] = (id ?? "").split("+");
  const legacy = LEGACY[game]?.[head!];
  return legacy ? [...legacy.split("+"), ...mods] : [head!, ...mods];
}

const fitsBase = (m: Modifier, base: string) => !m.bases || m.bases.includes(base);

/** Les règles à part d'un jeu, sans leurs réglages */
export function gameModifiers(game: GameId): TourVariant[] {
  return (MODIFIERS[game] ?? []).map(({ id, name, blurb }) => ({ id, name, blurb }));
}

/** Une règle à part qu'on vote oui ou non (règles votées) ; `bases` : les seuls formats avec lesquels elle se joue */
export interface TourAskedRule extends TourVariant, AskedRule {
  bases?: string[];
  unfit?: string;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Une règle à part telle qu'on la vote et l'annonce ; celles qu'on ne dit pas « toujours » ont des mots par défaut */
function asAsked(m: Modifier): TourAskedRule {
  return {
    id: m.id,
    name: m.name,
    blurb: m.blurb,
    question: m.asked?.question ?? `${capitalize(m.name)} ?`,
    offName: m.asked?.offName ?? `pas de « ${m.name} »`,
    offBlurb: m.asked?.offBlurb ?? "La règle habituelle.",
    ...(m.bases ? { bases: m.bases } : {}),
    ...(m.unfit ? { unfit: m.unfit } : {}),
  };
}

/** Les règles à part qu'on annonce toujours, retenues ou non : au UNO, « pas de UNO d'avance » */
export function askedRules(game: GameId): TourAskedRule[] {
  return (MODIFIERS[game] ?? []).filter((m) => m.asked).map(asAsked);
}

/** Règles votées : chaque règle à part du jeu se vote oui ou non */
export function votedRules(game: GameId): TourAskedRule[] {
  return (MODIFIERS[game] ?? []).map(asAsked);
}

/** Le nom d'une règle à part selon qu'elle est retenue ou non : « pas de UNO d'avance », « UNO d'avance permis » */
export function askedLabel(game: GameId, rule: string, on: boolean): string {
  const r = votedRules(game).find((a) => a.id === rule);
  return r ? (on ? r.name : r.offName) : rule;
}

/** Une règle à part se joue-t-elle avec ce format (une règle inconnue, non) */
export function ruleFitsBase(game: GameId, rule: string, base: string): boolean {
  const m = (MODIFIERS[game] ?? []).find((x) => x.id === rule);
  return Boolean(m && fitsBase(m, expandLegacy(game, base)[0]!));
}

/** Les règles à part que retient une variante (« no-mercy+sans-avance » : sans-avance) */
export function variantModifiers(id: string | null | undefined): string[] {
  return (id ?? "").split("+").slice(1);
}

/**
 * Le format et les règles à part retenues, écrits dans l'ordre du jeu (« no-mercy+sans-avance ») : les règles à part
 * inconnues, celles qui ne vont pas avec le format et la seconde d'un même groupe sont laissées de côté
 */
export function composeVariant(game: GameId, base: string, extras: string[]): string {
  const [head, ...fromBase] = expandLegacy(game, base);
  const wanted = new Set([...fromBase, ...extras]);
  const taken: Modifier[] = [];
  for (const m of MODIFIERS[game] ?? []) {
    if (!wanted.has(m.id) || !fitsBase(m, head!)) continue;
    if (m.group && taken.some((t) => t.group === m.group)) continue;
    taken.push(m);
  }
  return [head!, ...taken.map((m) => m.id)].join("+");
}

/**
 * Pour l'affichage : la variante sans les règles annoncées par oui ou non, et chacune de celles-ci, retenue ou non.
 * Au UNO : « No Mercy », puis « pas de UNO d'avance : oui ».
 */
export function splitAsked(
  game: GameId,
  id: string | null | undefined,
): { rest: string | null; asked: { rule: TourAskedRule; on: boolean }[] } {
  if (!findVariant(game, id)) return { rest: null, asked: [] };
  const asked = askedRules(game);
  const [head, ...mods] = expandLegacy(game, id);
  const rest = composeVariant(
    game,
    head!,
    mods.filter((m) => !asked.some((a) => a.id === m)),
  );
  return { rest, asked: asked.filter((rule) => ruleFitsBase(game, rule.id, head!)).map((rule) => ({ rule, on: mods.includes(rule.id) })) };
}

/** Une règle tirée, telle qu'on la montre : le format d'abord, puis chaque règle à part ; `off` : dite par la négative */
export interface RuleLine {
  id: string;
  name: string;
  blurb: string;
  kind: "base" | "extra" | "off";
}

/**
 * Les règles tirées, une par ligne, pour les annonces : le format, chaque règle à part retenue, puis les règles qu'on
 * annonce toujours quand elles ne sont pas retenues (« UNO d'avance permis »). Vide si l'id est inconnu.
 */
export function ruleLines(game: GameId, id: string | null | undefined): RuleLine[] {
  const { base, extra } = splitVariant(game, id);
  if (!base || !extra) return [];
  const taken = new Set(extra.map((m) => m.id));
  const off = (MODIFIERS[game] ?? []).filter((m) => m.asked && !taken.has(m.id) && fitsBase(m, base.id));
  return [
    { id: base.id, name: base.name, blurb: base.blurb, kind: "base" as const },
    ...extra.map((m) => ({ id: m.id, name: capitalize(m.name), blurb: m.blurb, kind: "extra" as const })),
    ...off.map((m) => ({ id: m.id, name: m.asked!.offName, blurb: m.asked!.offBlurb, kind: "off" as const })),
  ];
}

/**
 * Le format et ses règles à part : « grande+salve+arsenal ». Une ancienne variante se lit comme ce qu'elle est
 * devenue ; une règle inconnue, qui ne va pas avec le format, ou deux d'un même groupe rendent le tout inconnu.
 */
function splitVariant(game: GameId, id: string | null | undefined) {
  const [baseId, ...mods] = expandLegacy(game, id);
  const base = VARIANTS[game].find((v) => v.id === baseId);
  const extra = mods.map((m) => (MODIFIERS[game] ?? []).find((x) => x.id === m));
  const fine =
    base &&
    extra.every((m) => m && fitsBase(m, base.id)) &&
    new Set(mods).size === mods.length &&
    extra.every((m, i) => !m?.group || !extra.some((o, j) => j !== i && o?.group === m.group));
  return { base, extra: fine ? (extra as Modifier[]) : null };
}

const BRICKS_VARIANTS: Format<BricksSettings>[] = [
  { id: "survie", name: "Dernier debout", blurb: "Une seule vie ; après 3 minutes, la marée de lignes grises monte.", settings: {} },
  {
    id: "chrono",
    name: "K.O. au chrono",
    blurb: "2 minutes : une pile qui déborde repart de zéro, et le plus de K.O. gagne.",
    settings: { win: "ko", minutes: 2 },
  },
];

const CAPITALE_VARIANTS: Format<CapitaleSettings>[] = [
  {
    id: "classique",
    name: "Classique",
    blurb: "Le plateau des villes et ses bâtiments spéciaux, en 20 minutes\u00a0: le plus riche gagne.",
    settings: {},
    weight: 3,
  },
  {
    id: "builder",
    name: "Builder",
    blurb:
      "Chaque ville a son territoire en cases, au centre du plateau\u00a0: on y pose ses bâtiments où l'on veut, à tout moment, et on repousse ses frontières sur la réserve de son quartier.",
    settings: { builder: true },
  },
];

const MECHE_VARIANTS: Format<MecheSettings>[] = [
  {
    id: "classique",
    name: "Classique",
    blurb: "Une mèche neuve à chaque main, trois allumettes chacun, et un grand mot rapporte une passe.",
    settings: {},
    weight: 2,
  },
  {
    id: "rallonge",
    name: "Mèche à rallonge",
    blurb: "Chaque mot fait reculer la mèche, mais elle brûle de plus en plus vite.",
    settings: { mode: "rallonge" },
  },
  {
    id: "chacun",
    name: "Chacun sa mèche",
    blurb: "Chacun a la sienne, qui ne brûle que pendant son tour : le premier au bout perd une allumette.",
    settings: { mode: "chacun" },
  },
];

const BOLIDES_VARIANTS: Format<BolidesSettings>[] = [
  { id: "classique", name: "Classique", blurb: "Trois tours de circuit.", settings: {}, weight: 2 },
  { id: "sprint", name: "Sprint", blurb: "Deux tours seulement : pas le droit à l'erreur.", settings: { laps: 2 } },
];

const CRAMPONS_VARIANTS: Format<CramponsConfig>[] = [
  { id: "classique", name: "Match", blurb: "Onze contre onze, deux mi-temps de trois minutes.", settings: {} },
  {
    id: "eclair",
    name: "Match éclair",
    blurb: "Cinq contre cinq, deux mi-temps de deux minutes : ça va vite.",
    settings: { side: 5, halfMinutes: 2 },
  },
  { id: "sept", name: "À sept", blurb: "Sept contre sept, sur tout le terrain : de l'espace pour dribbler.", settings: { side: 7 } },
];

const ESCARMOUCHE_VARIANTS: Format<EscarmoucheSettings>[] = [
  { id: "classique", name: "Escarmouche", blurb: "Toutes les armes.", settings: {}, weight: 2 },
  {
    id: "precision",
    name: "Tireurs d'élite",
    blurb: "Tout le monde au fusil de précision : une balle à la tête suffit.",
    settings: { arsenal: "precision" },
  },
  {
    id: "pompe",
    name: "Corps à corps",
    blurb: "Fusils à pompe pour tout le monde : on se bat de près, dans les maisons.",
    settings: { arsenal: "pompe" },
  },
  {
    id: "pistolets",
    name: "Duel au pistolet",
    blurb: "Rien que des pistolets : la précision avant tout.",
    settings: { arsenal: "pistolet" },
  },
];

const CULBUTE_VARIANTS: Format<CulbuteConfig>[] = [
  // En tournée, une table de Culbute enchaîne trois combats (voir games/culbute/series.ts) ; à une table, un seul
  { id: "classique", name: "Aux vies", blurb: "Trois combats d'affilée, trois vies chacun à chaque combat.", settings: {}, weight: 2 },
  {
    id: "temps",
    name: "Au temps",
    blurb: "Trois minutes : un point par adversaire sorti, un de moins à chaque chute.",
    settings: { mode: "temps", minutes: 3 },
  },
  { id: "subite", name: "Mort subite", blurb: "Une seule vie, et tout le monde commence à 100 %.", settings: { mode: "subite" } },
];

const MINIGOLF_VARIANTS: Format<MinigolfConfig>[] = [
  // En tournée, une table de minigolf joue trois trous (six avec « Six trous ») ; à une table, neuf
  { id: "classique", name: "Le parcours", blurb: "Trois trous d'un parcours tiré au sort.", settings: {}, weight: 3 },
  { id: "six", name: "Six trous", blurb: "Six trous d'un parcours tiré au sort.", settings: { holes: 6 } },
  { id: "melange", name: "Trous mélangés", blurb: "Des trous pris dans tous les parcours.", settings: { course: "melange" } },
];

const VARIANTS: Record<GameId, Format<object>[]> = {
  uno: UNO_VARIANTS,
  naval: NAVAL_VARIANTS,
  bricks: BRICKS_VARIANTS,
  capitale: CAPITALE_VARIANTS,
  meche: MECHE_VARIANTS,
  bolides: BOLIDES_VARIANTS,
  crampons: CRAMPONS_VARIANTS,
  culbute: CULBUTE_VARIANTS,
  escarmouche: ESCARMOUCHE_VARIANTS,
  minigolf: MINIGOLF_VARIANTS,
};

/** Les formats d'un jeu (ils s'excluent), sans leurs réglages */
export function gameVariants(game: GameId): TourVariant[] {
  return VARIANTS[game].map(({ id, name, blurb }) => ({ id, name, blurb }));
}

export function baseVariant(game: GameId): string {
  return VARIANTS[game][0]!.id;
}

export function findVariant(game: GameId, id: string | null | undefined): TourVariant | null {
  const { base, extra } = splitVariant(game, id);
  if (!base || !extra) return null;
  return {
    id: id!,
    name: [base.name, ...extra.map((m) => m.name)].join(", "),
    blurb: [base.blurb, ...extra.map((m) => m.blurb)].join(" "),
  };
}

/**
 * Les réglages d'une table de UNO de la tournée : la variante retenue (de base, tirée ou votée), « pas de UNO d'avance »
 * compris (« classique+sans-avance ») ; sinon la règle habituelle. L'ancien réglage de l'hôte (`noEarlyUno` envoyé
 * à part par les tournées d'avant) est ignoré.
 */
export function tourUnoSettings(init: { variant: string | null | undefined }): Partial<UnoSettings> {
  return { noEarlyUno: false, ...variantSettings("uno", init.variant) };
}

/**
 * Les réglages d'une table de Capitale de la tournée : la variante retenue, puis les règles d'équipe telles que l'hôte
 * les a choisies (elles ne servent que si la partie se joue en équipes).
 */
export function tourCapitaleSettings(init: {
  variant: string | null | undefined;
  capitaleTeam?: CapitaleTeamRules;
}): Partial<CapitaleSettings> {
  return { ...variantSettings("capitale", init.variant), ...cleanCapitaleTeam(init.capitaleTeam) };
}

/** Les réglages à appliquer à la table pour cette variante (rien si elle est inconnue) */
export function variantSettings(game: "uno", id: string | null | undefined): Partial<UnoSettings>;
export function variantSettings(game: "naval", id: string | null | undefined): Partial<NavalSettings>;
export function variantSettings(game: "bricks", id: string | null | undefined): Partial<BricksSettings>;
export function variantSettings(game: "capitale", id: string | null | undefined): Partial<CapitaleSettings>;
export function variantSettings(game: "meche", id: string | null | undefined): Partial<MecheSettings>;
export function variantSettings(game: "bolides", id: string | null | undefined): Partial<BolidesSettings>;
export function variantSettings(game: "crampons", id: string | null | undefined): Partial<CramponsConfig>;
export function variantSettings(game: "culbute", id: string | null | undefined): Partial<CulbuteConfig>;
export function variantSettings(game: "minigolf", id: string | null | undefined): Partial<MinigolfConfig>;
export function variantSettings(game: "escarmouche", id: string | null | undefined): Partial<EscarmoucheSettings>;
export function variantSettings(game: GameId, id: string | null | undefined): object {
  const { base, extra } = splitVariant(game, id);
  if (!base || !extra) return {};
  return Object.assign({}, base.settings, ...extra.map((m) => m.settings));
}

/** Les réglages que touchent les formats d'un jeu et ses règles à part (« grid », « shots »…) */
export function variantKeys(game: GameId): string[] {
  const all = [...VARIANTS[game], ...(MODIFIERS[game] ?? [])];
  return [...new Set(all.flatMap((v) => Object.keys(v.settings)))];
}

/**
 * Des règles au hasard : un format (selon son poids), puis les règles à part, chacune avec sa chance, dans un ordre
 * tiré lui aussi au hasard pour que le plafond ne favorise aucune d'elles. Une règle qui ne va pas avec le format, ou
 * dont le groupe est déjà pris, est passée ; celles qu'on annonce toujours ne comptent pas dans le plafond.
 */
export function drawVariant(game: GameId, random: () => number): string {
  const all = VARIANTS[game];
  const total = all.reduce((n, v) => n + (v.weight ?? 1), 0);
  let r = random() * total;
  let base = all[all.length - 1]!.id;
  for (const v of all) {
    r -= v.weight ?? 1;
    if (r < 0) {
      base = v.id;
      break;
    }
  }
  const order = (MODIFIERS[game] ?? [])
    .filter((m) => fitsBase(m, base))
    .map((m) => ({ m, k: random() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.m);
  const cap = maxExtras(game);
  const taken: Modifier[] = [];
  for (const m of order) {
    if (random() >= m.chance) continue;
    if (m.group && taken.some((t) => t.group === m.group)) continue;
    if (!m.asked && taken.filter((t) => !t.asked).length >= cap) continue;
    taken.push(m);
  }
  return composeVariant(
    game,
    base,
    taken.map((m) => m.id),
  );
}

/** Voix nécessaires : la moitié des votants, au moins une */
export function voteNeed(voters: number): number {
  return Math.max(1, Math.ceil(voters / 2));
}

/** Les voix de chaque variante, en ne comptant que les votants présents */
export function tallyVotes(votes: Record<string, string>, voters: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of voters) {
    const v = votes[id];
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

/** La variante qui a déjà la moitié des voix, s'il y en a une */
export function adoptedVariant(votes: Record<string, string>, voters: string[]): string | null {
  const need = voteNeed(voters.length);
  for (const [v, n] of tallyVotes(votes, voters)) if (n >= need) return v;
  return null;
}

/** Au départ : la plus votée (au hasard entre les ex aequo), ou celle de base si personne n'a voté */
export function resolveVariant(game: GameId, votes: Record<string, string>, voters: string[], random: () => number): string {
  const counts = [...tallyVotes(votes, voters)].filter(([v]) => findVariant(game, v));
  if (counts.length === 0) return baseVariant(game);
  const best = Math.max(...counts.map(([, n]) => n));
  const top = counts.filter(([, n]) => n === best).map(([v]) => v);
  return top[Math.min(top.length - 1, Math.floor(random() * top.length))]!;
}

/** Une règle à part votée oui ou non : les voix de chacun, et la décision une fois prise (null : vote ouvert) */
export interface TourRuleVote {
  votes: Record<string, boolean>;
  value: boolean | null;
}

/** Les voix pour et contre une règle à part, en ne comptant que les votants présents */
export function tallyRule(votes: Record<string, boolean>, voters: string[]): { yes: number; no: number } {
  let yes = 0;
  let no = 0;
  for (const id of voters) {
    if (votes[id] === true) yes++;
    else if (votes[id] === false) no++;
  }
  return { yes, no };
}

/**
 * Comme pour les variantes : la réponse qui a déjà la moitié des voix est adoptée tout de suite. Si le oui et le non
 * l'ont tous les deux (des votants sont partis), rien n'est décidé avant le départ.
 */
export function adoptedRule(votes: Record<string, boolean>, voters: string[]): boolean | null {
  const need = voteNeed(voters.length);
  const { yes, no } = tallyRule(votes, voters);
  if (yes >= need && yes > no) return true;
  if (no >= need && no > yes) return false;
  return null;
}

/** Au départ : la règle à part si le oui l'emporte ; à égalité, ou sans aucune voix, la règle habituelle */
export function resolveRule(votes: Record<string, boolean>, voters: string[]): boolean {
  const { yes, no } = tallyRule(votes, voters);
  return yes > no;
}

/** Règles votées : les règles à part ouvertes au vote pour ce jeu, toutes (aucune voix, rien de décidé) */
export function openRuleVotes(game: GameId): Record<string, TourRuleVote> {
  return Object.fromEntries(votedRules(game).map((r) => [r.id, { votes: {}, value: null }]));
}

/**
 * Règles votées : une fois le format adopté, les règles à part qui ne vont pas avec lui sont écartées d'office (au UNO,
 * le 7-0 avec No Mercy, qui l'a déjà). Renvoie celles qui viennent d'être écartées.
 */
export function dropUnfitRules(next: Pick<TourNext, "game" | "base" | "extras">): string[] {
  if (!next.base || !next.extras) return [];
  const dropped: string[] = [];
  for (const [id, vote] of Object.entries(next.extras)) {
    if (vote.value === null && !ruleFitsBase(next.game, id, next.base)) {
      vote.value = false;
      dropped.push(id);
    }
  }
  return dropped;
}

/** Le jeu tiré pour la suite, tel que la tournée le garde et l'envoie aux écrans */
export interface TourNext {
  game: GameId;
  /** L'heure du départ (null : en pause) */
  at: number | null;
  /** Les règles retenues, règles à part comprises (« no-mercy+sans-avance ») ; null tant qu'un vote est ouvert */
  variant: string | null;
  /** Les voix de chacun pour une variante */
  votes: Record<string, string>;
  /** Règles votées : la variante déjà adoptée, pendant que les règles à part restent au vote (absente des tournées d'avant) */
  base?: string | null;
  /** Règles votées : chaque règle à part votée oui ou non (UNO : pas de UNO d'avance) ; absente des tournées d'avant */
  extras?: Record<string, TourRuleVote>;
}

/** Une des variantes proposées au vote (pas une variante déjà composée avec ses règles à part) */
export function isBaseVariant(game: GameId, id: unknown): id is string {
  return typeof id === "string" && VARIANTS[game].some((v) => v.id === id);
}

/** Règles votées : les règles retenues une fois tout décidé (la variante et chaque règle à part), sinon null */
export function settledVariant(next: Pick<TourNext, "game" | "base" | "extras">): string | null {
  if (!next.base) return null;
  const extras = Object.entries(next.extras ?? {});
  if (extras.some(([, e]) => e.value === null)) return null;
  return composeVariant(
    next.game,
    next.base,
    extras.filter(([, e]) => e.value).map(([id]) => id),
  );
}

/**
 * Règles votées, au départ : ce qui est déjà décidé reste ; sinon la variante la plus votée (au hasard entre les ex
 * aequo, celle de base sans voix), et chaque règle à part si le oui l'emporte (la règle habituelle à égalité)
 */
export function resolveVoted(next: TourNext, voters: string[], random: () => number): string {
  if (next.variant) return next.variant;
  const base = next.base ?? resolveVariant(next.game, next.votes, voters, random);
  const extras = Object.entries(next.extras ?? {})
    .filter(([, e]) => e.value ?? resolveRule(e.votes, voters))
    .map(([id]) => id);
  return composeVariant(next.game, base, extras);
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
  /** Le chiffre qui le vaut, en gros (« +6 », « 62 % ») et ce qu'il compte ; absents des anciennes tournées */
  stat?: string;
  unit?: string;
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
  /** La valeur qui départage, le chiffre affiché et ce qu'il compte ; null si le joueur n'y prétend pas */
  score: (c: TitleCandidate) => { value: number; stat: string; unit: string } | null;
}

const sum = (c: TitleCandidate, game: GameId, key: string) =>
  c.lines.filter((l) => l.game === game).reduce((n, l) => n + (l.stats[key] ?? 0), 0);

const TITLE_RULES: TitleRule[] = [
  {
    id: "collector",
    label: "Le collectionneur",
    score: (c) => {
      const wins = c.lines.filter((l) => l.rank === 1).length;
      return wins >= 2 ? { value: wins, stat: `${wins}`, unit: "jeux gagnés" } : null;
    },
  },
  {
    id: "plus-four",
    label: "Le roi du +4",
    score: (c) => {
      const n = sum(c, "uno", "plusGiven");
      return n >= 4 ? { value: n, stat: `+${n}`, unit: "cartes données à piocher" } : null;
    },
  },
  {
    id: "mason",
    label: "Le maçon",
    score: (c) => {
      const n = sum(c, "bricks", "lines");
      return n >= 10 ? { value: n, stat: `${n}`, unit: "lignes complétées" } : null;
    },
  },
  {
    id: "wrecker",
    label: "Le démolisseur",
    score: (c) => {
      const n = sum(c, "bricks", "sent");
      return n >= 6 ? { value: n, stat: `${n}`, unit: "lignes grises envoyées" } : null;
    },
  },
  {
    id: "tycoon",
    label: "Le magnat",
    score: (c) => {
      const n = sum(c, "capitale", "rentEarned");
      return n >= 300 ? { value: n, stat: `${n.toLocaleString("fr-FR")} ₣`, unit: "de loyers encaissés" } : null;
    },
  },
  {
    id: "builder",
    label: "Le promoteur",
    score: (c) => {
      const n = sum(c, "capitale", "houses");
      return n >= 6 ? { value: n, stat: `${n}`, unit: "étages bâtis en ville" } : null;
    },
  },
  {
    id: "wordsmith",
    label: "Le dico vivant",
    score: (c) => {
      const n = sum(c, "meche", "words");
      return n >= 12 ? { value: n, stat: `${n}`, unit: "mots trouvés sous la mèche" } : null;
    },
  },
  {
    id: "singed",
    label: "Le roussi",
    score: (c) => {
      const n = sum(c, "meche", "booms");
      return n >= 3 ? { value: n, stat: `${n}×`, unit: "la mèche lui a sauté au nez" } : null;
    },
  },
  {
    id: "striker",
    label: "Le buteur",
    score: (c) => {
      const n = sum(c, "crampons", "myGoals");
      return n >= 2 ? { value: n, stat: `${n}`, unit: "buts marqués sur le terrain" } : null;
    },
  },
  {
    id: "cogneur",
    label: "Le cogneur",
    score: (c) => {
      const n = sum(c, "culbute", "kos");
      return n >= 3 ? { value: n, stat: `${n}`, unit: "adversaires sortis de l'arène" } : null;
    },
  },
  {
    id: "sniper",
    label: "Le tireur d'élite",
    score: (c) => {
      const n = sum(c, "escarmouche", "headshots");
      return n >= 3 ? { value: n, stat: `${n}`, unit: "balles à la tête" } : null;
    },
  },
  {
    id: "grognard",
    label: "Le grognard",
    score: (c) => {
      const n = sum(c, "escarmouche", "kills");
      return n >= 8 ? { value: n, stat: `${n}`, unit: "adversaires éliminés au combat" } : null;
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
      return { value: pct, stat: `${pct} %`, unit: "de tirs au but" };
    },
  },
  {
    id: "metronome",
    label: "Le métronome",
    score: (c) => {
      if (c.lines.length < 3) return null;
      const worst = Math.max(...c.lines.map((l) => l.rank));
      // Toujours sur le podium ou presque : plus la pire place est haute, mieux c'est
      return worst <= 3 ? { value: 10 - worst, stat: worst === 1 ? "1er" : `${worst}e`, unit: "au pire, à chaque jeu" } : null;
    },
  },
  {
    id: "brave",
    label: "Le courageux",
    score: (c) => {
      const lasts = c.lines.filter((l) => l.players > 2 && l.rank === l.players).length;
      return lasts >= 2 ? { value: lasts, stat: `${lasts}×`, unit: "dernier, et toujours là" } : null;
    },
  },
];

/** Titres de la tournée : chaque titre va au meilleur, deux titres au plus par joueur, cinq en tout. */
export function tourTitles(candidates: TitleCandidate[]): TourTitle[] {
  const out: TourTitle[] = [];
  const count = new Map<string, number>();
  for (const rule of TITLE_RULES) {
    let best: { c: TitleCandidate; value: number; stat: string; unit: string } | null = null;
    for (const c of candidates) {
      if ((count.get(c.userId) ?? 0) >= 2) continue;
      const s = rule.score(c);
      if (s && (!best || s.value > best.value)) best = { c, ...s };
    }
    if (!best) continue;
    const { stat, unit } = best;
    out.push({ id: rule.id, label: rule.label, userId: best.c.userId, name: best.c.name, detail: `${stat} ${unit}`, stat, unit });
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
  /** Les règles jouées (id de variante) */
  variant: string;
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
  /**
   * Jeu tiré pour la suite et l'heure du départ (null : en pause). Les règles : la variante retenue, ou null
   * tant que le vote est ouvert ; les voix de chacun.
   */
  next: TourNext | null;
  /** Joueurs présents qui peuvent voter (bots et spectateurs exclus), et ceux qui sont prêts à lancer */
  voters: string[];
  ready: string[];
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
  /** La feuille de fin du dernier jeu, gardée à l'écran (null quand il n'y en a pas) */
  endHold: TourEndHold | null;
}

export type TourClientMessage =
  | {
      t: "settings";
      settings: Partial<Pick<TourSettings, "games" | "end" | "teams" | "once" | "botLevel" | "rules" | "capitaleTeam">>;
      visibility?: Visibility;
      maxPlayers?: number;
      lateJoin?: boolean;
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
  /** Un joueur est prêt à lancer (au salon ou à l'entracte) : à la moitié des joueurs, c'est parti */
  | { t: "ready"; ready: boolean }
  /** Règles votées : la voix d'un joueur pour une variante du jeu tiré */
  | { t: "vote"; variant: string }
  /** Hôte : choisir lui-même les règles du jeu tiré */
  | { t: "pickVariant"; variant: string }
  /** Règles votées : la voix d'un joueur, oui ou non, pour une règle à part (UNO : « sans-avance ») */
  | { t: "voteRule"; rule: string; on: boolean }
  /** Hôte : décider lui-même d'une règle à part */
  | { t: "pickRule"; rule: string; on: boolean }
  | { t: "pause" }
  | { t: "resume" }
  /** Un joueur du jeu qui vient de finir a lu sa feuille de fin : quand tous l'ont fait, l'entracte arrive */
  | { t: "continue" }
  /** Hôte : finir la tournée (à l'entracte), ou après le jeu en cours */
  | { t: "finish" }
  /** Hôte, une fois la tournée finie : en relancer une avec la même bande */
  | { t: "again" }
  /** Ses skins, choisis sur son appareil : la tournée les confie à chaque table où il joue */
  | { t: "looks"; looks: Looks }
  | { t: "leave" }
  | { t: "close" };

export type TourServerMessage =
  | { t: "tour"; tour: TourView }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  /** Le même compte vient de rejoindre la tournée depuis un autre appareil : c'est là-bas qu'il joue désormais */
  | { t: "replaced" };

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
  /** Les règles du jeu (id de variante, avec ses règles à part : « classique+sans-avance ») */
  variant: string;
  /** Les skins de chaque joueur (par compte), déjà vérifiés par la tournée ; absents des tournées plus anciennes */
  looks?: Record<string, Looks>;
  /** Capitale en équipes : les règles d'équipe choisies par l'hôte (absentes des tournées plus anciennes) */
  capitaleTeam?: CapitaleTeamRules;
}

/** Le nom de chaque titre, pour la feuille d'une tournée passée */
export const TITLE_LABELS: Record<string, string> = Object.fromEntries(TITLE_RULES.map((r) => [r.id, r.label]));
