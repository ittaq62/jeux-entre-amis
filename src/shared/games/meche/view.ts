import { holderOf, isAlive, ropeLeft, type MecheGame, type MecheSettings, type MecheStats, type Rope } from "./engine.ts";

/**
 * La mèche telle que l'écran la dessine, quel que soit le mode : une corde qui brûle à vitesse croissante (ou pas),
 * et la part brûlée à partir de laquelle elle devient dangereuse (la zone rouge).
 */
export interface FuseView extends Rope {
  risk: number;
}

/** La part de la corde déjà brûlée à cet instant, de 0 à 1 */
export function fuseProgress(f: FuseView, now: number): number {
  return Math.max(0, Math.min(1, 1 - ropeLeft(f, now) / Math.max(1, f.length)));
}

export interface MechePlayerView {
  id: string;
  lives: number;
  passes: number;
  /** Chacun sa mèche : ce qui reste de la sienne (quand il l'a reçue, s'il la tient), et sa longueur */
  bank: number;
  bankMax: number;
  alive: boolean;
  place: number | null;
  best: string;
  stats: MecheStats;
}

/** Ce que voient les joueurs : tout, sauf l'heure de l'explosion */
export interface MecheView {
  settings: MecheSettings;
  players: MechePlayerView[];
  holder: string;
  letters: string;
  turn: number;
  fuse: number;
  phase: MecheGame["phase"];
  breakUntil: number;
  /** Depuis quand le joueur actuel tient la mèche */
  heldSince: number;
  /** La mèche qui brûle (null entre deux mèches) */
  burning: FuseView | null;
  log: MecheGame["log"];
  wordsPlayed: number;
  ranking: string[] | null;
  ranks: Record<string, number> | null;
}

/** La mèche à dessiner : à la mèche commune, l'heure de l'explosion reste secrète, seule la zone rouge se voit */
function burningView(g: MecheGame): FuseView | null {
  if (g.phase !== "lit") return null;
  if (g.settings.mode === "rallonge" && g.rope) return { ...g.rope, risk: 0.75 };
  if (g.settings.mode === "chacun") {
    const p = holderOf(g);
    return { at: g.heldSince, left: p.bank, length: p.bankMax, speed: 1, accel: 0, risk: 0.75 };
  }
  const length = Math.max(1, g.maxUntil - g.litAt);
  return { at: g.litAt, left: length, length, speed: 1, accel: 0, risk: (g.safeUntil - g.litAt) / length };
}

export function mecheView(g: MecheGame): MecheView {
  return {
    settings: g.settings,
    players: g.players.map((p) => ({
      id: p.id,
      lives: p.lives,
      passes: p.passes,
      bank: p.bank,
      bankMax: p.bankMax,
      alive: isAlive(p),
      place: p.place,
      best: p.best,
      stats: p.stats,
    })),
    holder: g.players[g.holder]!.id,
    letters: g.letters,
    turn: g.turn,
    fuse: g.fuse,
    phase: g.phase,
    breakUntil: g.breakUntil,
    heldSince: g.heldSince,
    burning: burningView(g),
    log: g.log,
    wordsPlayed: g.used.length,
    ranking: g.ranking,
    ranks: g.ranks,
  };
}
