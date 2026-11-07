import { isAlive, type MecheGame, type MecheSettings, type MecheStats } from "./engine.ts";

export interface MechePlayerView {
  id: string;
  lives: number;
  passes: number;
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
  litAt: number;
  safeUntil: number;
  maxUntil: number;
  log: MecheGame["log"];
  wordsPlayed: number;
  ranking: string[] | null;
  ranks: Record<string, number> | null;
}

export function mecheView(g: MecheGame): MecheView {
  return {
    settings: g.settings,
    players: g.players.map((p) => ({
      id: p.id,
      lives: p.lives,
      passes: p.passes,
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
    litAt: g.litAt,
    safeUntil: g.safeUntil,
    maxUntil: g.maxUntil,
    log: g.log,
    wordsPlayed: g.used.length,
    ranking: g.ranking,
    ranks: g.ranks,
  };
}
