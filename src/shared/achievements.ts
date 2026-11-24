import type { RacerStats } from "./games/bolides/race.ts";
import type { BricksMode } from "./games/bricks/engine.ts";
import type { BricksStats } from "./games/bricks/view.ts";
import type { CapitaleStats } from "./games/capitale/engine.ts";
import type { MecheStats } from "./games/meche/engine.ts";
import type { NavalMode, NavalStats } from "./games/naval/engine.ts";
import type { PlayerStats } from "./games/uno/engine.ts";
import type { TableGame } from "./protocol.ts";

export type ChipTone = "red" | "blue" | "green" | "black" | "ivory";

export interface AchievementDef {
  id: string;
  /** Jeu concerne (ou la tournée), UNO si absent */
  game?: TableGame;
  /** Inscription du jeton (un chiffre lie a la regle du succes) */
  chip: string;
  tone: ChipTone;
  title: string;
  description: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-win", chip: "1re", tone: "red", title: "Première victoire", description: "Gagner une partie de UNO." },
  { id: "regular", chip: "25", tone: "blue", title: "Pilier de comptoir", description: "Jouer 25 parties." },
  { id: "veteran", chip: "100", tone: "blue", title: "Increvable", description: "Jouer 100 parties." },
  { id: "streak-3", chip: "×3", tone: "red", title: "En feu", description: "Gagner 3 parties d'affilée." },
  { id: "merciless", chip: "+20", tone: "red", title: "Sans pitié", description: "Faire piocher 20 cartes ou plus en une partie." },
  { id: "hoarder", chip: "15", tone: "green", title: "Collectionneur", description: "Avoir 15 cartes en main en même temps." },
  { id: "phoenix", chip: "12", tone: "green", title: "Phénix", description: "Gagner après avoir eu 12 cartes ou plus en main." },
  { id: "lightning", chip: "0", tone: "green", title: "Éclair", description: "Gagner sans jamais piocher." },
  { id: "caught-red-handed", chip: "!", tone: "red", title: "Flagrant délit", description: "Dénoncer un joueur qui a oublié son UNO." },
  { id: "eagle-eye", chip: "3!", tone: "red", title: "Œil de lynx", description: "Dénoncer 3 oublis de UNO en une partie." },
  { id: "busted", chip: "+2", tone: "black", title: "La main dans le sac", description: "Se faire dénoncer pour un UNO oublié." },
  { id: "liar", chip: "+4", tone: "green", title: "Menteur !", description: "Démasquer un +4 joué en bluff." },
  { id: "overconfident", chip: "+6", tone: "black", title: "Trop confiant", description: "Contester un +4 parfaitement régulier." },
  { id: "pile-eater", chip: "+8", tone: "black", title: "Ramasse-tout", description: "Encaisser 8 cartes ou plus d'un coup." },
  { id: "pickpocket", chip: "7", tone: "blue", title: "Pickpocket", description: "Échanger sa main avec un 7." },
  { id: "sniper", chip: "=", tone: "blue", title: "Intercepteur", description: "Réussir une interception." },
  { id: "full-table", chip: "6+", tone: "ivory", title: "Maître de la table", description: "Gagner une partie à 6 joueurs ou plus." },
  { id: "survivor", chip: "168", tone: "ivory", title: "Survivant", description: "Gagner une partie No Mercy." },
  { id: "mercy", chip: "25", tone: "black", title: "Pitié refusée", description: "Être éliminé par la règle des 25 cartes." },

  // Bataille navale
  { id: "naval-first-win", game: "naval", chip: "1re", tone: "blue", title: "Amiral en herbe", description: "Gagner une bataille navale." },
  { id: "naval-regular", game: "naval", chip: "25", tone: "green", title: "Loup de mer", description: "Jouer 25 batailles navales." },
  { id: "naval-streak", game: "naval", chip: "×5", tone: "red", title: "Tireur d'élite", description: "Toucher 5 fois de suite." },
  {
    id: "naval-flawless",
    game: "naval",
    chip: "0",
    tone: "ivory",
    title: "Coque intacte",
    description: "Gagner sans perdre un seul navire.",
  },
  {
    id: "naval-close",
    game: "naval",
    chip: "1",
    tone: "black",
    title: "Sur le fil",
    description: "Gagner avec un seul navire encore à flot.",
  },
  {
    id: "naval-hawk",
    game: "naval",
    chip: "70",
    tone: "green",
    title: "Œil de faucon",
    description: "Gagner avec au moins 70 % de tirs au but.",
  },
  {
    id: "naval-melee",
    game: "naval",
    chip: "3+",
    tone: "red",
    title: "Maître des mers",
    description: "Gagner une mêlée à 3 joueurs ou plus.",
  },
  { id: "naval-team", game: "naval", chip: "2v2", tone: "blue", title: "Frères d'armes", description: "Gagner une partie en équipes." },
  {
    id: "naval-arsenal",
    game: "naval",
    chip: "3",
    tone: "black",
    title: "Artificier",
    description: "Utiliser 3 armes spéciales en une partie.",
  },
  { id: "naval-sunk", game: "naval", chip: "×", tone: "black", title: "Par le fond", description: "Voir toute sa flotte coulée." },

  // Briques
  { id: "bricks-first-win", game: "bricks", chip: "1re", tone: "red", title: "Premier mur", description: "Gagner une partie de Briques." },
  {
    id: "bricks-regular",
    game: "bricks",
    chip: "25",
    tone: "blue",
    title: "Compagnon bâtisseur",
    description: "Jouer 25 parties de Briques.",
  },
  {
    id: "bricks-tetra",
    game: "bricks",
    chip: "4",
    tone: "green",
    title: "Quatre d'un coup",
    description: "Faire quatre lignes d'une seule pièce.",
  },
  { id: "bricks-tspin", game: "bricks", chip: "T", tone: "red", title: "Coup tordu", description: "Réussir un T-spin." },
  { id: "bricks-combo", game: "bricks", chip: "×6", tone: "red", title: "Enchaîneur", description: "Faire des lignes 6 poses de suite." },
  { id: "bricks-clean", game: "bricks", chip: "0", tone: "ivory", title: "Table rase", description: "Vider entièrement son plateau." },
  {
    id: "bricks-ko",
    game: "bricks",
    chip: "K.O.",
    tone: "black",
    title: "Démolisseur",
    description: "Mettre 3 adversaires K.O. dans une même partie.",
  },
  {
    id: "bricks-melee",
    game: "bricks",
    chip: "3+",
    tone: "ivory",
    title: "Roi du chantier",
    description: "Gagner une mêlée à 3 joueurs ou plus.",
  },
  { id: "bricks-team", game: "bricks", chip: "2v2", tone: "blue", title: "Maçons associés", description: "Gagner une partie en équipes." },
  {
    id: "bricks-sprint",
    game: "bricks",
    chip: "40",
    tone: "green",
    title: "Coup de truelle",
    description: "Finir le solo 40 lignes en moins de 90 secondes.",
  },

  // Capitale
  {
    id: "capitale-first-win",
    game: "capitale",
    chip: "1re",
    tone: "green",
    title: "Premier capital",
    description: "Gagner une partie de Capitale.",
  },
  {
    id: "capitale-regular",
    game: "capitale",
    chip: "25",
    tone: "blue",
    title: "Agent immobilier",
    description: "Jouer 25 parties de Capitale.",
  },
  {
    id: "capitale-hotel",
    game: "capitale",
    chip: "G",
    tone: "red",
    title: "Monument",
    description: "Élever le monument d'une ville (son dernier niveau).",
  },
  {
    id: "capitale-builder",
    game: "capitale",
    chip: "10",
    tone: "green",
    title: "Promoteur",
    description: "Bâtir 10 étages dans une même partie.",
  },
  {
    id: "capitale-landlord",
    game: "capitale",
    chip: "3",
    tone: "ivory",
    title: "Seigneur des terres",
    description: "Réunir 3 groupes de couleur dans une même partie.",
  },
  {
    id: "capitale-trader",
    game: "capitale",
    chip: "×3",
    tone: "blue",
    title: "Marchand de tapis",
    description: "Conclure 3 échanges dans une même partie.",
  },
  {
    id: "capitale-rentier",
    game: "capitale",
    chip: "2k",
    tone: "green",
    title: "Rentier",
    description: "Toucher 2 000 de loyers dans une même partie.",
  },
  {
    id: "capitale-tycoon",
    game: "capitale",
    chip: "5k",
    tone: "ivory",
    title: "Magnat",
    description: "Finir une partie avec une fortune de 5 000.",
  },
  {
    id: "capitale-jailbird",
    game: "capitale",
    chip: "×3",
    tone: "black",
    title: "Habitué du parloir",
    description: "Aller 3 fois en prison dans une même partie.",
  },
  { id: "capitale-ruin", game: "capitale", chip: "0", tone: "black", title: "Sur la paille", description: "Faire faillite." },

  // Tournée
  // Crampons
  {
    id: "crampons-first-win",
    game: "crampons",
    chip: "1re",
    tone: "red",
    title: "Première victoire",
    description: "Gagner un match de Crampons.",
  },
  {
    id: "crampons-regular",
    game: "crampons",
    chip: "25",
    tone: "blue",
    title: "Abonné au stade",
    description: "Jouer 25 matchs de Crampons.",
  },
  {
    id: "crampons-clean",
    game: "crampons",
    chip: "0",
    tone: "green",
    title: "Cage inviolée",
    description: "Gagner un match sans encaisser de but.",
  },
  {
    id: "crampons-hat-trick",
    game: "crampons",
    chip: "x3",
    tone: "red",
    title: "Coup du chapeau",
    description: "Marquer trois buts dans un match avec le joueur que tu diriges.",
  },
  {
    id: "crampons-rout",
    game: "crampons",
    chip: "+5",
    tone: "green",
    title: "Festival offensif",
    description: "Gagner un match avec cinq buts d'écart ou plus.",
  },
  // Escarmouche
  {
    id: "escarmouche-first-win",
    game: "escarmouche",
    chip: "1re",
    tone: "red",
    title: "Baptême du feu",
    description: "Gagner une partie d'Escarmouche.",
  },
  {
    id: "escarmouche-regular",
    game: "escarmouche",
    chip: "25",
    tone: "blue",
    title: "Vieux briscard",
    description: "Jouer 25 parties d'Escarmouche.",
  },
  {
    id: "escarmouche-ace",
    game: "escarmouche",
    chip: "10",
    tone: "red",
    title: "As de la gâchette",
    description: "Éliminer dix adversaires dans une même partie.",
  },
  {
    id: "escarmouche-sharp",
    game: "escarmouche",
    chip: "×5",
    tone: "black",
    title: "Œil de lynx",
    description: "Cinq éliminations d'une balle à la tête dans une même partie.",
  },
  {
    id: "escarmouche-streak",
    game: "escarmouche",
    chip: "5",
    tone: "black",
    title: "Série noire",
    description: "Éliminer cinq adversaires d'affilée sans tomber.",
  },
  {
    id: "escarmouche-knife",
    game: "escarmouche",
    chip: "1",
    tone: "ivory",
    title: "Sans un bruit",
    description: "Éliminer un adversaire au couteau.",
  },
  {
    id: "escarmouche-flag",
    game: "escarmouche",
    chip: "1",
    tone: "green",
    title: "Porte-drapeau",
    description: "Rapporter le drapeau adverse chez soi.",
  },
  {
    id: "escarmouche-untouchable",
    game: "escarmouche",
    chip: "0",
    tone: "green",
    title: "Intouchable",
    description: "Gagner une partie sans être éliminé une seule fois.",
  },
  // Culbute
  {
    id: "culbute-first-win",
    game: "culbute",
    chip: "1re",
    tone: "red",
    title: "Premier vol plané",
    description: "Gagner un combat de Culbute.",
  },
  {
    id: "culbute-regular",
    game: "culbute",
    chip: "25",
    tone: "blue",
    title: "Pilier de la place",
    description: "Jouer 25 combats de Culbute.",
  },
  {
    id: "culbute-flawless",
    game: "culbute",
    chip: "0",
    tone: "green",
    title: "Sans une égratignure",
    description: "Gagner un combat aux vies (trois vies ou plus) sans en perdre une seule.",
  },
  {
    id: "culbute-early",
    game: "culbute",
    chip: "<50",
    tone: "black",
    title: "Coup de maître",
    description: "Sortir un adversaire qui avait moins de 50 %.",
  },
  {
    id: "culbute-triple",
    game: "culbute",
    chip: "x3",
    tone: "red",
    title: "Jeu de quilles",
    description: "Sortir trois adversaires ou plus dans un même combat.",
  },
  // Minigolf
  {
    id: "minigolf-first-win",
    game: "minigolf",
    chip: "1re",
    tone: "red",
    title: "Premier drapeau",
    description: "Gagner une partie de minigolf.",
  },
  {
    id: "minigolf-regular",
    game: "minigolf",
    chip: "25",
    tone: "blue",
    title: "Habitué du green",
    description: "Jouer 25 parties de minigolf.",
  },
  {
    id: "minigolf-ace",
    game: "minigolf",
    chip: "1",
    tone: "green",
    title: "Trou en un",
    description: "Mettre la balle dans le trou du premier coup.",
  },
  {
    id: "minigolf-under",
    game: "minigolf",
    chip: "−1",
    tone: "black",
    title: "Sous le par",
    description: "Finir une partie de neuf trous ou plus sous le par.",
  },
  {
    id: "minigolf-dry",
    game: "minigolf",
    chip: "0",
    tone: "ivory",
    title: "Pieds au sec",
    description: "Finir une partie de neuf trous ou plus sans perdre une seule balle.",
  },
  // Bowling
  {
    id: "bowling-first-win",
    game: "bowling",
    chip: "1re",
    tone: "red",
    title: "Roi de la piste",
    description: "Gagner une partie de bowling.",
  },
  {
    id: "bowling-regular",
    game: "bowling",
    chip: "25",
    tone: "blue",
    title: "Chaussures de location",
    description: "Jouer 25 parties de bowling.",
  },
  {
    id: "bowling-strike",
    game: "bowling",
    chip: "X",
    tone: "red",
    title: "Strike !",
    description: "Faire tomber les dix quilles d'une seule boule.",
  },
  {
    id: "bowling-turkey",
    game: "bowling",
    chip: "XXX",
    tone: "black",
    title: "La dinde",
    description: "Faire trois strikes de suite.",
  },
  {
    id: "bowling-split",
    game: "bowling",
    chip: "7-10",
    tone: "green",
    title: "Le grand écart",
    description: "Relever un split en spare.",
  },
  {
    id: "bowling-200",
    game: "bowling",
    chip: "200",
    tone: "ivory",
    title: "La barre des 200",
    description: "Dépasser 200 dans une partie de dix frames.",
  },
  {
    id: "bowling-perfect",
    game: "bowling",
    chip: "300",
    tone: "black",
    title: "La partie parfaite",
    description: "Faire 300 : douze strikes de suite, sans en rater un.",
  },
  {
    id: "bowling-seer",
    game: "bowling",
    chip: "?",
    tone: "blue",
    title: "Devin",
    description: "Marquer 10 points de pronostics dans une même partie.",
  },
  // Billard
  {
    id: "billard-first-win",
    game: "billard",
    chip: "1re",
    tone: "green",
    title: "Maître du tapis",
    description: "Gagner une partie de billard.",
  },
  {
    id: "billard-regular",
    game: "billard",
    chip: "25",
    tone: "blue",
    title: "Pilier de salle",
    description: "Jouer 25 parties de billard.",
  },
  {
    id: "billard-run5",
    game: "billard",
    chip: "5",
    tone: "red",
    title: "La série",
    description: "Rentrer cinq billes d'affilée sans rendre la main.",
  },
  {
    id: "billard-break-run",
    game: "billard",
    chip: "C+F",
    tone: "black",
    title: "Casse et file",
    description: "Gagner une manche depuis sa casse, sans laisser l'adversaire toucher la queue.",
  },
  {
    id: "billard-nine-break",
    game: "billard",
    chip: "9",
    tone: "ivory",
    title: "La 9 à la casse",
    description: "Rentrer la 9 sur la casse.",
  },
  {
    id: "billard-bank",
    game: "billard",
    chip: "∠",
    tone: "green",
    title: "Par la bande",
    description: "Rentrer une bille qui a d'abord touché une bande.",
  },
  {
    id: "billard-three-rails",
    game: "billard",
    chip: "3",
    tone: "red",
    title: "Trois bandes",
    description: "Réussir un carambolage après trois bandes ou plus.",
  },
  {
    id: "billard-survivor",
    game: "billard",
    chip: "♥",
    tone: "red",
    title: "Le survivant",
    description: "Gagner une partie de Killer.",
  },
  {
    id: "billard-all",
    game: "billard",
    chip: "4",
    tone: "blue",
    title: "Touche-à-tout",
    description: "Jouer aux quatre jeux du billard : pleines et rayées, la bille 9, le Killer et les trois billes.",
  },
  // Bolides
  {
    id: "bolides-first-win",
    game: "bolides",
    chip: "1er",
    tone: "red",
    title: "Premier sur la ligne",
    description: "Gagner une course de Bolides.",
  },
  {
    id: "bolides-regular",
    game: "bolides",
    chip: "25",
    tone: "blue",
    title: "Pilote du dimanche",
    description: "Courir 25 courses de Bolides.",
  },
  {
    id: "bolides-clean",
    game: "bolides",
    chip: "0",
    tone: "green",
    title: "Sans une égratignure",
    description: "Gagner une course avec objets sans jamais être touché.",
  },
  {
    id: "bolides-sniper",
    game: "bolides",
    chip: "3",
    tone: "red",
    title: "Fine gâchette",
    description: "Toucher 3 karts ou plus dans une même course.",
  },
  {
    id: "bolides-drifter",
    game: "bolides",
    chip: "15",
    tone: "blue",
    title: "Roi du dérapage",
    description: "Gagner 15 mini-turbos ou plus en dérapant dans une même course.",
  },
  {
    id: "bolides-pure",
    game: "bolides",
    chip: "∅",
    tone: "ivory",
    title: "Pilotage pur",
    description: "Gagner une course sans objets.",
  },
  {
    id: "bolides-wall",
    game: "bolides",
    chip: "10",
    tone: "black",
    title: "Auto-tamponneuse",
    description: "Taper 10 fois le mur dans une même course.",
  },
  // Mèche
  { id: "meche-first-win", game: "meche", chip: "1re", tone: "red", title: "Artificier", description: "Gagner une partie de Mèche." },
  { id: "meche-regular", game: "meche", chip: "25", tone: "blue", title: "Sent la poudre", description: "Jouer 25 parties de Mèche." },
  {
    id: "meche-flawless",
    game: "meche",
    chip: "3",
    tone: "green",
    title: "Sans une brûlure",
    description: "Gagner sans perdre une allumette, en partant d'au moins trois.",
  },
  {
    id: "meche-close",
    game: "meche",
    chip: "1",
    tone: "black",
    title: "Dernière allumette",
    description: "Gagner avec une seule allumette, en partant d'au moins trois.",
  },
  {
    id: "meche-long",
    game: "meche",
    chip: "15",
    tone: "ivory",
    title: "Grand format",
    description: "Placer un mot de 15 lettres ou plus.",
  },
  {
    id: "meche-words",
    game: "meche",
    chip: "30",
    tone: "blue",
    title: "Dictionnaire ambulant",
    description: "Trouver 30 mots en une partie.",
  },
  {
    id: "meche-quick",
    game: "meche",
    chip: "1s",
    tone: "green",
    title: "Du tac au tac",
    description: "Placer un mot en moins d'une seconde.",
  },
  {
    id: "meche-dud",
    game: "meche",
    chip: "0",
    tone: "black",
    title: "Pétard mouillé",
    description: "Finir une partie sans avoir placé un seul mot.",
  },

  { id: "tour-first", game: "tour", chip: "1re", tone: "ivory", title: "Premier acte", description: "Terminer une tournée." },
  { id: "tour-win", game: "tour", chip: "1er", tone: "red", title: "Tête d'affiche", description: "Gagner une tournée." },
  {
    id: "tour-sweep",
    game: "tour",
    chip: "100",
    tone: "green",
    title: "Grand chelem",
    description: "Gagner tous les jeux d'une tournée d'au moins 3 jeux.",
  },
  {
    id: "tour-underdog",
    game: "tour",
    chip: "0",
    tone: "black",
    title: "L'outsider",
    description: "Gagner une tournée sans gagner un seul de ses jeux.",
  },
  {
    id: "tour-titled",
    game: "tour",
    chip: "T",
    tone: "blue",
    title: "Dans les titres",
    description: "Recevoir un titre en fin de tournée.",
  },
  {
    id: "tour-full",
    game: "tour",
    chip: "6+",
    tone: "ivory",
    title: "Salle comble",
    description: "Terminer une tournée à 6 joueurs ou plus.",
  },
  { id: "tour-regular", game: "tour", chip: "10", tone: "blue", title: "Saltimbanque", description: "Terminer 10 tournées." },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export interface CapitaleOutcome {
  won: boolean;
  played: number;
  bankrupt: boolean;
  stats: CapitaleStats;
}

export interface CramponsOutcome {
  won: boolean;
  played: number;
  stats: { goals: number; conceded: number; myGoals: number };
}

export function earnedCramponsAchievements(o: CramponsOutcome): string[] {
  const out: string[] = [];
  const add = (id: string, on: boolean) => on && out.push(id);
  add("crampons-first-win", o.won);
  add("crampons-regular", o.played >= 25);
  add("crampons-clean", o.won && o.stats.conceded === 0);
  add("crampons-hat-trick", o.stats.myGoals >= 3);
  add("crampons-rout", o.won && o.stats.goals - o.stats.conceded >= 5);
  return out;
}

export interface EscarmoucheOutcome {
  won: boolean;
  played: number;
  stats: { kills: number; deaths: number; headshots: number; best: number; knives: number; captures: number };
}

export function earnedEscarmoucheAchievements(o: EscarmoucheOutcome): string[] {
  const out: string[] = [];
  const add = (id: string, on: boolean) => on && out.push(id);
  add("escarmouche-first-win", o.won);
  add("escarmouche-regular", o.played >= 25);
  add("escarmouche-ace", o.stats.kills >= 10);
  add("escarmouche-sharp", o.stats.headshots >= 5);
  add("escarmouche-streak", o.stats.best >= 5);
  add("escarmouche-knife", o.stats.knives >= 1);
  add("escarmouche-flag", o.stats.captures >= 1);
  add("escarmouche-untouchable", o.won && o.stats.deaths === 0);
  return out;
}

export interface MinigolfOutcome {
  won: boolean;
  played: number;
  stats: { aces: number; holes: number; toPar: number; lost: number };
}

export function earnedMinigolfAchievements(o: MinigolfOutcome): string[] {
  const out: string[] = [];
  const add = (id: string, on: boolean) => on && out.push(id);
  add("minigolf-first-win", o.won);
  add("minigolf-regular", o.played >= 25);
  add("minigolf-ace", o.stats.aces >= 1);
  add("minigolf-under", o.stats.holes >= 9 && o.stats.toPar < 0);
  add("minigolf-dry", o.stats.holes >= 9 && o.stats.lost === 0);
  return out;
}

export interface BowlingOutcome {
  won: boolean;
  played: number;
  stats: { strikes: number; bestRun: number; splitsMade: number; full: number; perfect: number; seer: number };
}

export function earnedBowlingAchievements(o: BowlingOutcome): string[] {
  const out: string[] = [];
  const add = (id: string, on: boolean) => on && out.push(id);
  add("bowling-first-win", o.won);
  add("bowling-regular", o.played >= 25);
  add("bowling-strike", o.stats.strikes >= 1);
  add("bowling-turkey", o.stats.bestRun >= 3);
  add("bowling-split", o.stats.splitsMade >= 1);
  add("bowling-200", o.stats.full > 200);
  add("bowling-perfect", o.stats.perfect >= 1);
  add("bowling-seer", o.stats.seer >= 10);
  return out;
}

export interface BillardOutcome {
  won: boolean;
  played: number;
  stats: { bestRun: number; breakRuns: number; nineBreak: number; banks: number; threeRails: number; killer: number };
  /** Ses parties de chaque jeu, cumulées (celle-ci comprise) */
  totals: Record<string, number>;
}

export function earnedBillardAchievements(o: BillardOutcome): string[] {
  const out: string[] = [];
  const add = (id: string, on: boolean) => on && out.push(id);
  add("billard-first-win", o.won);
  add("billard-regular", o.played >= 25);
  add("billard-run5", o.stats.bestRun >= 5);
  add("billard-break-run", o.stats.breakRuns >= 1);
  add("billard-nine-break", o.stats.nineBreak >= 1);
  add("billard-bank", o.stats.banks >= 1);
  add("billard-three-rails", o.stats.threeRails >= 1);
  add("billard-survivor", o.won && o.stats.killer >= 1);
  add(
    "billard-all",
    ["huit", "neuf", "killer", "carambole"].every((k) => (o.totals[k] ?? 0) >= 1),
  );
  return out;
}

export interface CulbuteOutcome {
  won: boolean;
  played: number;
  mode: string;
  stocks: number;
  stats: { kos: number; lowKo: number; lostStock: number };
}

export function earnedCulbuteAchievements(o: CulbuteOutcome): string[] {
  const out: string[] = [];
  const add = (id: string, on: boolean) => on && out.push(id);
  add("culbute-first-win", o.won);
  add("culbute-regular", o.played >= 25);
  add("culbute-flawless", o.won && o.mode === "vies" && o.stocks >= 3 && o.stats.lostStock === 0);
  add("culbute-early", o.stats.kos > 0 && o.stats.lowKo > 0 && o.stats.lowKo < 50);
  add("culbute-triple", o.stats.kos >= 3);
  return out;
}

export interface BolidesOutcome {
  won: boolean;
  played: number;
  /** Les caisses d'objets étaient sur la route */
  items: boolean;
  stats: RacerStats;
}

export function earnedBolidesAchievements(o: BolidesOutcome): string[] {
  const out: string[] = [];
  const add = (id: string, on: boolean) => on && out.push(id);
  const s = o.stats;
  add("bolides-first-win", o.won);
  add("bolides-regular", o.played >= 25);
  add("bolides-clean", o.won && o.items && s.hitsTaken === 0);
  add("bolides-sniper", s.hitsGiven >= 3);
  add("bolides-drifter", s.turbos >= 15);
  add("bolides-pure", o.won && !o.items);
  add("bolides-wall", s.walls >= 10);
  return out;
}

export interface MecheOutcome {
  won: boolean;
  played: number;
  /** Allumettes au départ de la partie */
  lives: number;
  stats: MecheStats;
}

export function earnedMecheAchievements(o: MecheOutcome): string[] {
  const out: string[] = [];
  const add = (id: string, on: boolean) => on && out.push(id);
  const s = o.stats;
  add("meche-first-win", o.won);
  add("meche-regular", o.played >= 25);
  add("meche-flawless", o.won && o.lives >= 3 && s.booms === 0);
  add("meche-close", o.won && o.lives >= 3 && s.livesLeft === 1);
  add("meche-long", s.longest >= 15);
  add("meche-words", s.words >= 30);
  add("meche-quick", s.fastest > 0 && s.fastest < 1000);
  add("meche-dud", s.words === 0);
  return out;
}

export function earnedCapitaleAchievements(o: CapitaleOutcome): string[] {
  const s = o.stats;
  const out: string[] = [];
  const add = (id: string, cond: boolean) => cond && out.push(id);
  add("capitale-first-win", o.won);
  add("capitale-regular", o.played >= 25);
  add("capitale-hotel", s.hotels >= 1);
  add("capitale-builder", s.houses >= 10);
  add("capitale-landlord", s.monopolies >= 3);
  add("capitale-trader", s.trades >= 3);
  add("capitale-rentier", s.rentEarned >= 2000);
  add("capitale-tycoon", !o.bankrupt && s.netWorth >= 5000);
  add("capitale-jailbird", s.jail >= 3);
  add("capitale-ruin", o.bankrupt);
  return out;
}

export interface TourOutcome {
  won: boolean;
  /** Joueurs classés à la fin */
  players: number;
  /** Jeux joués par ce joueur, et ceux qu'il a gagnés */
  games: number;
  wins: number;
  /** Jeux de la tournée (un retardataire en a joué moins) */
  tourGames: number;
  titles: number;
  /** Tournées terminées, celle-ci comprise */
  played: number;
}

export function earnedTourAchievements(o: TourOutcome): string[] {
  const out: string[] = [];
  const add = (id: string, cond: boolean) => cond && out.push(id);
  add("tour-first", true);
  add("tour-win", o.won);
  add("tour-sweep", o.won && o.tourGames >= 3 && o.wins === o.tourGames);
  add("tour-underdog", o.won && o.wins === 0 && o.games > 0);
  add("tour-titled", o.titles > 0);
  add("tour-full", o.players >= 6);
  add("tour-regular", o.played >= 10);
  return out;
}

export interface GameOutcome {
  won: boolean;
  players: number;
  variant: "classic" | "nomercy";
  eliminated: boolean;
  stats: PlayerStats;
  /** Totaux apres prise en compte de cette partie */
  played: number;
  streak: number;
}

export function earnedAchievements(o: GameOutcome): string[] {
  const s = o.stats;
  const out: string[] = [];
  const add = (id: string, cond: boolean) => cond && out.push(id);
  add("first-win", o.won);
  add("regular", o.played >= 25);
  add("veteran", o.played >= 100);
  add("streak-3", o.streak >= 3);
  add("merciless", s.plusGiven >= 20);
  add("hoarder", s.maxHand >= 15);
  add("phoenix", o.won && s.maxHand >= 12);
  add("lightning", o.won && s.drawn === 0);
  add("caught-red-handed", s.caughtOthers >= 1);
  add("eagle-eye", s.caughtOthers >= 3);
  add("busted", s.gotCaught >= 1);
  add("liar", s.challengesWon >= 1);
  add("overconfident", s.challengesLost >= 1);
  add("pile-eater", s.biggestStackTaken >= 8);
  add("pickpocket", s.swaps >= 1);
  add("sniper", s.jumpIns >= 1);
  add("full-table", o.won && o.players >= 6);
  add("survivor", o.won && o.variant === "nomercy");
  add("mercy", o.eliminated);
  return out;
}

export interface NavalOutcome {
  won: boolean;
  mode: NavalMode;
  /** Navires encore à flot à la fin */
  afloat: number;
  out: boolean;
  stats: NavalStats;
  played: number;
}

export function earnedNavalAchievements(o: NavalOutcome): string[] {
  const s = o.stats;
  const out: string[] = [];
  const add = (id: string, cond: boolean) => cond && out.push(id);
  add("naval-first-win", o.won);
  add("naval-regular", o.played >= 25);
  add("naval-streak", s.bestStreak >= 5);
  add("naval-flawless", o.won && s.lost === 0);
  add("naval-close", o.won && o.afloat === 1);
  add("naval-hawk", o.won && s.shots >= 10 && s.hits / s.shots >= 0.7);
  add("naval-melee", o.won && o.mode === "melee");
  add("naval-team", o.won && o.mode === "teams");
  add("naval-arsenal", s.weapons >= 3);
  add("naval-sunk", o.out);
  return out;
}

export interface BricksOutcome {
  won: boolean;
  mode: BricksMode;
  stats: BricksStats;
  played: number;
  /** Solo 40 lignes : temps en millisecondes, null s'il n'a pas été fini */
  sprintTime?: number | null;
}

export function earnedBricksAchievements(o: BricksOutcome): string[] {
  const s = o.stats;
  const out: string[] = [];
  const add = (id: string, cond: boolean) => cond && out.push(id);
  if (o.mode !== "sprint") {
    add("bricks-first-win", o.won);
    add("bricks-regular", o.played >= 25);
    add("bricks-ko", s.kos >= 3);
    add("bricks-melee", o.won && o.mode === "melee");
    add("bricks-team", o.won && o.mode === "teams");
  }
  add("bricks-tetra", s.tetrises >= 1);
  add("bricks-tspin", s.tspins >= 1);
  add("bricks-combo", s.maxCombo >= 5);
  add("bricks-clean", s.allClears >= 1);
  add("bricks-sprint", o.sprintTime !== undefined && o.sprintTime !== null && o.sprintTime < 90_000);
  return out;
}
