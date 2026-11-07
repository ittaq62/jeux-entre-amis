// Mèche : une mèche allumée passe de joueur en joueur à chaque mot trouvé, et saute chez celui qui la tient.
// Tout se décide ici, sans réseau ni horloge : l'heure est passée en paramètre, le hasard vient de la partie.

import { random } from "../../rng.ts";
import { LETTRES } from "./lettres.ts";
import { normalizeWord } from "./words.ts";

export type BotLevel = "facile" | "moyen" | "fort";
export type Pace = "pose" | "normal" | "nerveux";
export type Difficulty = "simple" | "normal" | "corse";
/** D'où viennent les lettres à placer : du hasard, ou de la fin du mot d'avant */
export type LetterSource = "hasard" | "marabout";

export interface MecheSettings {
  /** Allumettes de chaque joueur au départ */
  lives: number;
  pace: Pace;
  difficulty: Difficulty;
  source: LetterSource;
  /** Un grand mot rapporte une passe */
  passes: boolean;
  botLevel: BotLevel;
}

export const DEFAULT_SETTINGS: MecheSettings = {
  lives: 3,
  pace: "normal",
  difficulty: "normal",
  source: "hasard",
  passes: true,
  botLevel: "moyen",
};

export const LIVES_CHOICES = [1, 2, 3, 5] as const;
/** Le plus court mot accepté */
export const MIN_LETTERS = 3;
/** Un grand mot : il rapporte une passe */
export const LONG_WORD = 10;
export const MAX_PASSES = 2;
/** Le temps de s'installer avant la toute première mèche */
export const START_MS = 4500;
/** Le temps de voir l'explosion avant la mèche suivante */
export const BREAK_MS = 3200;
/** Personne ne saute sans avoir eu le temps de lire ses lettres : le sursis raccourcit à chaque fois, pour que la mèche finisse par sauter */
export const MIN_TURN_MS = 3000;
const MIN_TURN_STEP_MS = 400;
const MIN_TURN_FLOOR_MS = 1000;

const PACE: Record<Pace, number> = { pose: 1.4, normal: 1, nerveux: 0.7 };

/**
 * Combien de temps brûle la mèche : jamais avant `safe` (la partie claire de la corde), au plus tard à `max`
 * (le bout de la zone rouge). Chaque mèche est un peu plus courte que la précédente.
 */
export function fuseTimes(pace: Pace, index: number): { safe: number; max: number } {
  return {
    safe: Math.round(Math.max(7000, 14000 - 600 * index) * PACE[pace]),
    max: Math.round(Math.max(13000, 26000 - 1200 * index) * PACE[pace]),
  };
}

type Band = keyof typeof LETTRES;

const GROUPS = Object.fromEntries(Object.entries(LETTRES).map(([band, list]) => [band, list.split(" ")])) as Record<Band, string[]>;
const KNOWN = new Set(Object.values(GROUPS).flat());
/** Les fins de mot qui embêtent le voisin, au Marabout */
export const HARD_TAILS = new Set([...GROUPS.corse, ...GROUPS.dur].filter((g) => g.length === 2));

// La part de chaque difficulté de lettres, de la première mèche aux dernières
type Mix = Partial<Record<Band, number>>;
const STAGES: Record<Difficulty, Mix[]> = {
  simple: [{ facile: 1 }, { facile: 0.8, moyen: 0.2 }, { facile: 0.5, moyen: 0.5 }, { facile: 0.25, moyen: 0.65, corse: 0.1 }],
  normal: [
    { facile: 0.7, moyen: 0.3 },
    { facile: 0.3, moyen: 0.6, corse: 0.1 },
    { moyen: 0.6, corse: 0.35, dur: 0.05 },
    { moyen: 0.35, corse: 0.5, dur: 0.15 },
  ],
  corse: [
    { facile: 0.2, moyen: 0.6, corse: 0.2 },
    { moyen: 0.5, corse: 0.45, dur: 0.05 },
    { moyen: 0.3, corse: 0.55, dur: 0.15 },
    { moyen: 0.15, corse: 0.6, dur: 0.25 },
  ],
};
const stageOf = (fuse: number) => (fuse <= 2 ? 0 : fuse <= 5 ? 1 : fuse <= 9 ? 2 : 3);

export interface MecheStats {
  words: number;
  letters: number;
  longest: number;
  passesEarned: number;
  passesUsed: number;
  refused: number;
  booms: number;
  /** Le mot le plus rapide, en millisecondes (0 : aucun) */
  fastest: number;
  /** Allumettes qui restaient à la fin */
  livesLeft: number;
}

export function emptyStats(): MecheStats {
  return { words: 0, letters: 0, longest: 0, passesEarned: 0, passesUsed: 0, refused: 0, booms: 0, fastest: 0, livesLeft: 0 };
}

export interface MechePlayer {
  id: string;
  lives: number;
  passes: number;
  /** Sa place finale, dès qu'elle est connue */
  place: number | null;
  /** Son plus long mot, tel qu'il l'a écrit */
  best: string;
  stats: MecheStats;
}

export interface MecheGame {
  settings: MecheSettings;
  players: MechePlayer[];
  /** Celui qui tient la mèche (ou qui la recevra à la prochaine) */
  holder: number;
  /** Les lettres à placer ; vides entre deux mèches */
  letters: string;
  /** Change à chaque passage de main : un message en retard ne vise plus personne */
  turn: number;
  /** Mèches déjà allumées */
  fuse: number;
  phase: "break" | "lit" | "over";
  breakUntil: number;
  litAt: number;
  safeUntil: number;
  maxUntil: number;
  /** L'heure de l'explosion : jamais envoyée aux joueurs */
  boomAt: number;
  /** Depuis quand le joueur actuel tient la mèche */
  heldSince: number;
  /** Sursis déjà accordés à cette mèche */
  graces: number;
  used: string[];
  /** Les derniers mots joués, et comment ils ont été écrits (accents compris) */
  log: { word: string; by: string; shown?: string }[];
  /** Les groupes de lettres déjà sortis récemment */
  recent: string[];
  lastWord: string | null;
  ranking: string[] | null;
  ranks: Record<string, number> | null;
  rng: number;
}

export type MecheEvent =
  | { type: "lit"; fuse: number; holder: string; letters: string }
  | { type: "word"; id: string; word: string; shown: string; long: boolean; earned: boolean; next: string; ms: number }
  | { type: "pass"; id: string; next: string }
  | { type: "boom"; id: string; lives: number; place: number | null }
  | { type: "over"; winner: string };

export type Refusal = "court" | "lettres" | "grille" | "inconnu";

export const REFUSALS: Record<Refusal, string> = {
  court: "Trop court",
  lettres: "Il manque les lettres",
  grille: "Déjà joué",
  inconnu: "Pas dans le dictionnaire",
};

export function newGame(ids: string[], settings: MecheSettings, now: number, seed: number): MecheGame {
  const g: MecheGame = {
    settings: { ...settings },
    players: ids.map((id) => ({ id, lives: settings.lives, passes: 0, place: null, best: "", stats: emptyStats() })),
    holder: 0,
    letters: "",
    turn: 0,
    fuse: 0,
    phase: "break",
    breakUntil: now + START_MS,
    litAt: 0,
    safeUntil: 0,
    maxUntil: 0,
    boomAt: 0,
    heldSince: now,
    graces: 0,
    used: [],
    log: [],
    recent: [],
    lastWord: null,
    ranking: null,
    ranks: null,
    rng: seed,
  };
  g.holder = Math.floor(random(g) * ids.length);
  return g;
}

export const holderOf = (g: MecheGame): MechePlayer => g.players[g.holder]!;
export const isAlive = (p: MechePlayer) => p.lives > 0;

/** Le joueur suivant encore en jeu, dans le sens de la table */
function nextAlive(g: MecheGame, from: number): number {
  for (let k = 1; k <= g.players.length; k++) {
    const i = (from + k) % g.players.length;
    if (isAlive(g.players[i]!)) return i;
  }
  return from;
}

/** Les lettres de la prochaine main */
function drawLetters(g: MecheGame): string {
  // Au Marabout, la fin du mot d'avant, si elle laisse assez de mots possibles
  if (g.settings.source === "marabout" && g.lastWord) {
    const tail = g.lastWord.slice(-2);
    if (KNOWN.has(tail)) return tail;
  }
  const mix = STAGES[g.settings.difficulty][stageOf(g.fuse)]!;
  let roll = random(g);
  let band: Band = "moyen";
  for (const [name, share] of Object.entries(mix) as [Band, number][]) {
    band = name;
    roll -= share;
    if (roll < 0) break;
  }
  const list = GROUPS[band];
  let pick = list[Math.floor(random(g) * list.length)]!;
  for (let tries = 0; tries < 12 && g.recent.includes(pick); tries++) pick = list[Math.floor(random(g) * list.length)]!;
  g.recent.push(pick);
  if (g.recent.length > 40) g.recent.shift();
  return pick;
}

/** La mèche suivante s'allume */
export function lightFuse(g: MecheGame, now: number): MecheEvent[] {
  if (g.phase !== "break") return [];
  const { safe, max } = fuseTimes(g.settings.pace, g.fuse);
  g.phase = "lit";
  g.letters = drawLetters(g);
  g.fuse += 1;
  g.turn += 1;
  g.litAt = now;
  g.safeUntil = now + safe;
  g.maxUntil = now + max;
  g.boomAt = now + safe + Math.floor(random(g) * (max - safe));
  g.heldSince = now;
  g.graces = 0;
  return [{ type: "lit", fuse: g.fuse, holder: holderOf(g).id, letters: g.letters }];
}

/**
 * Ce qui ne va pas dans ce mot, ou null s'il est bon (`known` dit s'il est au dictionnaire).
 * Les lettres seules comptent si elles font un mot : « nié » pour NIE.
 */
export function checkWord(g: MecheGame, word: string, known: (word: string) => boolean): Refusal | null {
  if (!word.includes(g.letters)) return "lettres";
  if (word.length < MIN_LETTERS) return "court";
  if (g.used.includes(word)) return "grille";
  return known(word) ? null : "inconnu";
}

/** La mèche passe au suivant. Il aura toujours le temps de lire ses lettres, quitte à accorder un sursis. */
function handOver(g: MecheGame, now: number, letters: string | null) {
  g.holder = nextAlive(g, g.holder);
  g.letters = letters ?? drawLetters(g);
  g.turn += 1;
  g.heldSince = now;
  const least = now + Math.max(MIN_TURN_FLOOR_MS, MIN_TURN_MS - g.graces * MIN_TURN_STEP_MS);
  if (g.boomAt < least) {
    g.boomAt = least;
    g.graces += 1;
  }
  g.maxUntil = Math.max(g.maxUntil, g.boomAt);
}

/** Un mot bon (vérifié par `checkWord`, déjà réduit à ses lettres) ; `shown` : comment il a été écrit */
export function playWord(g: MecheGame, word: string, now: number, shown = word): MecheEvent[] {
  const p = holderOf(g);
  const ms = now - g.heldSince;
  const long = word.length >= LONG_WORD;
  const earned = long && g.settings.passes && p.passes < MAX_PASSES;
  p.stats.words += 1;
  p.stats.letters += word.length;
  p.stats.longest = Math.max(p.stats.longest, word.length);
  if (p.stats.fastest === 0 || ms < p.stats.fastest) p.stats.fastest = ms;
  if (word.length > normalizeWord(p.best).length) p.best = shown;
  if (earned) {
    p.passes += 1;
    p.stats.passesEarned += 1;
  }
  g.used.push(word);
  g.log.push({ word, by: p.id, shown });
  if (g.log.length > 24) g.log.shift();
  g.lastWord = word;
  handOver(g, now, null);
  return [{ type: "word", id: p.id, word, shown, long, earned, next: holderOf(g).id, ms }];
}

/** Une passe : la mèche va au suivant sans mot, avec les mêmes lettres */
export function usePass(g: MecheGame, now: number): MecheEvent[] {
  const p = holderOf(g);
  if (g.phase !== "lit" || p.passes <= 0) return [];
  p.passes -= 1;
  p.stats.passesUsed += 1;
  handOver(g, now, g.letters);
  return [{ type: "pass", id: p.id, next: holderOf(g).id }];
}

/** Boum : le joueur qui tient la mèche perd une allumette */
export function explode(g: MecheGame, now: number): MecheEvent[] {
  if (g.phase !== "lit") return [];
  const p = holderOf(g);
  p.lives -= 1;
  p.stats.booms += 1;
  const left = g.players.filter(isAlive);
  if (p.lives === 0) p.place = left.length + 1;
  const events: MecheEvent[] = [{ type: "boom", id: p.id, lives: p.lives, place: p.place }];
  g.letters = "";
  g.lastWord = null;
  if (left.length === 1) {
    finish(g, left[0]!);
    events.push({ type: "over", winner: left[0]!.id });
    return events;
  }
  g.holder = nextAlive(g, g.holder);
  g.phase = "break";
  g.breakUntil = now + BREAK_MS;
  return events;
}

function finish(g: MecheGame, winner: MechePlayer) {
  winner.place = 1;
  g.phase = "over";
  for (const p of g.players) p.stats.livesLeft = p.lives;
  const ordered = [...g.players].sort((a, b) => a.place! - b.place!);
  g.ranking = ordered.map((p) => p.id);
  g.ranks = Object.fromEntries(ordered.map((p) => [p.id, p.place!]));
}
