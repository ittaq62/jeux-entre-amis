// Les étoiles d'un trou et les défis de l'aventure (chaque trou est une carte du système commun : starCourses.ts).
// - Un trou joué donne 1 étoile fini, 2 au par, 3 sous le par ; la salle garde la meilleure (starItems).
// - Chaque trou a un défi dans l'aventure (en un coup, sous le par, après une bande, au par sans tomber dans l'eau…).

import { strokeLimit } from "./course.ts";
import { courseOf, type CourseId } from "./courses.ts";
import { holeMap } from "./starCourses.ts";
import type { MinigolfConfig } from "./match.ts";

export type Stars = 0 | 1 | 2 | 3;

/** Les étoiles d'un trou joué en `strokes` coups (au-delà de la limite : pas fini) */
export function holeStars(strokes: number, par: number): Stars {
  if (strokes > strokeLimit(par)) return 0;
  if (strokes < par) return 3;
  if (strokes === par) return 2;
  return 1;
}

/**
 * Les règles où les étoiles comptent : celles du parcours tel qu'il est (à l'envers aussi, c'est le même trou). Les
 * bulles bonus, la lune et la glace changent trop la difficulté
 */
export function countsForStars(cfg: Pick<MinigolfConfig, "bonus" | "lune" | "glace">): boolean {
  return !cfg.bonus && !cfg.lune && !cfg.glace;
}

// ---------------------------------------------------------------------------
// Les défis de l'aventure
// ---------------------------------------------------------------------------

export type ChallengeKind = "ace" | "under" | "dry" | "bank";

export interface Challenge {
  kind: ChallengeKind;
  /** Ce qu'il faut faire, en quelques mots (« En un coup », « Au par sans tomber dans la lave ») */
  text: string;
}

/**
 * Le défi d'un trou, tiré de sa forme : un par 2 se joue en un coup ; sinon, d'un trou à l'autre, sous le par, la balle
 * rentrée après une bande et (s'il y a de l'eau ou de la lave) au par sans y tomber
 */
export function challengeOf(c: CourseId, i: number): Challenge {
  const course = courseOf({ c, i, m: false });
  const par = course.def.par;
  if (par === 2) return { kind: "ace", text: "En un coup" };
  const lava = course.tiles.some((t) => t.mat === "lava");
  const water = course.tiles.some((t) => t.mat === "water");
  const kinds: ChallengeKind[] = lava || water ? ["dry", "under", "bank"] : ["under", "bank"];
  const kind = kinds[i % kinds.length]!;
  if (kind === "dry") return { kind, text: `Au par sans tomber dans ${lava ? "la lave" : "l'eau"}` };
  if (kind === "bank") return { kind, text: "Rentrer la balle après une bande" };
  return { kind, text: `En ${par - 1} coups` };
}

/** Ce qu'il a fait sur le trou : ses coups, ses balles perdues, et si le coup qui l'a rentrée a touché une bande */
export interface HoleResult {
  strokes: number;
  par: number;
  lost: number;
  bank: boolean;
}

/** Le défi réussi (le trou fini dans la limite de coups, toujours) */
export function challengeDone(ch: Challenge, r: HoleResult): boolean {
  if (r.strokes > strokeLimit(r.par)) return false;
  if (ch.kind === "ace") return r.strokes === 1;
  if (ch.kind === "under") return r.strokes < r.par;
  if (ch.kind === "bank") return r.bank;
  return r.strokes <= r.par && r.lost === 0;
}

// ---------------------------------------------------------------------------
// Ce qui compte pour les étoiles (chaque trou est une carte : starCourses.ts)
// ---------------------------------------------------------------------------

/**
 * Les trous d'une partie qui comptent pour les étoiles d'un joueur : aux règles du parcours (à l'envers aussi), finis
 * ou non (un trou pas fini ne donne rien, mais ne retire rien), sauf ceux où un bot a joué sa balle
 */
export function starItems(
  cfg: Pick<MinigolfConfig, "bonus" | "lune" | "glace">,
  holes: readonly { c: CourseId; i: number }[],
  scores: readonly (number | null)[],
  helped: readonly number[] = [],
): { map: string; value: number }[] {
  if (!countsForStars(cfg)) return [];
  return holes.flatMap((ref, h) => {
    const s = scores[h];
    return s == null || helped.includes(h) ? [] : [{ map: holeMap(ref.c, ref.i), value: s }];
  });
}
