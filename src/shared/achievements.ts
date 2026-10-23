import type { PlayerStats } from "./games/uno/engine.ts";

export type ChipTone = "red" | "blue" | "green" | "black" | "ivory";

export interface AchievementDef {
  id: string;
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
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

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
