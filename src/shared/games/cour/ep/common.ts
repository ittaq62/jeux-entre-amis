// Ce que partagent toutes les épreuves : le contexte que leur passe la partie à chaque pas (l'heure, le hasard, qui est
// joué par l'ordinateur, combien de candidats il faut garder), les événements qu'elles racontent aux écrans (un
// éclaboussé, une chaise prise, un nénuphar qui coule…), et quelques outils.

import { random, type RngHolder } from "../../../rng.ts";
import type { BotLevel } from "../config.ts";

/** Comment on est éliminé : ce que les écrans montrent */
export type OutHow = "peinture" | "tarte" | "mousse" | "plouf" | "trappe" | "gelee" | "canon" | "plumes" | "chute" | "temps" | "jury";

/** Un événement de l'épreuve, pour les écrans (sons, effets, caméra) ; `n` les numérote dans toute la partie */
export interface Fx {
  n: number;
  at: number;
  k: string;
  id?: string;
  a?: number;
  b?: number;
  c?: number;
}

export interface EpCtx {
  now: number;
  /** Le pas de temps, en secondes */
  dt: number;
  rng: RngHolder;
  /** Ce candidat est joué par l'ordinateur (un bot, ou un joueur absent) */
  auto: (id: string) => boolean;
  level: (id: string) => BotLevel;
  /** Le nombre de candidats que la partie aimerait garder à la fin de l'épreuve */
  keep: number;
  /** Épreuves éclair : les chronos raccourcis */
  eclair: boolean;
  /** Élimine un candidat (une fois) */
  out: (id: string, how: OutHow) => void;
  fx: (k: string, data?: Omit<Fx, "n" | "at" | "k">) => void;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Arrondi au centième (ce qu'on envoie aux écrans) */
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Un tirage selon une loi normale (moyenne 0, écart 1) */
export function gauss(rng: RngHolder): number {
  const u = Math.max(1e-9, random(rng));
  const v = random(rng);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Entre deux bornes, au hasard */
export const between = (rng: RngHolder, lo: number, hi: number) => lo + (hi - lo) * random(rng);

/** Le niveau d'un bot en un nombre : 0 facile, 1 moyen, 2 fort */
export const skill = (level: BotLevel) => (level === "facile" ? 0 : level === "moyen" ? 1 : 2);
/** Une valeur selon le niveau */
export const byLevel = <T>(level: BotLevel, values: readonly [T, T, T]): T => values[skill(level)]!;

/**
 * Le metteur en scène : la part des candidats joués par l'ordinateur qu'il faut encore éliminer pour approcher le
 * nombre voulu, à répartir sur les occasions qui restent. Les vrais joueurs ne sont jamais poussés à la faute : seuls
 * les bots se trompent plus ou moins selon ce qu'il faut.
 */
export function pressure(alive: number, keep: number, bots: number, chances: number): number {
  if (bots <= 0 || chances <= 0) return 0;
  const wanted = Math.max(0, alive - keep);
  return clamp(wanted / bots / Math.max(1, chances), 0, 0.85);
}

/** Les indices des candidats encore en jeu dans une épreuve */
export const inPlay = (st: readonly number[]) => st.map((s, i) => (s === 0 ? i : -1)).filter((i) => i >= 0);

/** Les états d'un candidat dans une épreuve */
export const PLAYING = 0;
export const SAFE = 1;
export const OUT = 2;
