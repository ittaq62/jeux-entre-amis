// Les étoiles du minigolf et son aventure en solo.
// - Un trou joué donne de 0 à 3 étoiles : fini dans la limite de coups (1), au par (2), sous le par (3). On garde la
//   meilleure de chaque trou, d'une partie à l'autre.
// - Un parcours a de 0 à 3 étoiles : la plus petite de ses neuf trous (3 : tous les trous sous le par).
// - L'aventure : les huit parcours dans l'ordre ; le suivant s'ouvre quand chaque trou du précédent a été fini une fois.
//   Chaque trou a un défi (en un coup, sous le par, au par sans tomber dans l'eau…).
// Seule la salle les accorde : elle connaît les vrais coups de chacun (voir minigolfRoom.ts).

import { strokeLimit } from "./course.ts";
import { COURSE_IDS, courseOf, type CourseId } from "./courses.ts";
import type { MinigolfConfig } from "./match.ts";

export type Stars = 0 | 1 | 2 | 3;

/** Les étoiles d'un trou joué en `strokes` coups (au-delà de la limite : pas fini) */
export function holeStars(strokes: number, par: number): Stars {
  if (strokes > strokeLimit(par)) return 0;
  if (strokes < par) return 3;
  if (strokes === par) return 2;
  return 1;
}

/** Les étoiles d'un parcours : la plus petite de ses neuf trous (un trou jamais joué : 0) */
export function courseStars(holes: readonly number[]): Stars {
  let min = 3;
  for (let i = 0; i < 9; i++) min = Math.min(min, holes[i] ?? 0);
  return min as Stars;
}

/** Le total d'un parcours, sur 27 */
export function starTotal(holes: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < 9; i++) n += holes[i] ?? 0;
  return n;
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
// L'ordre de l'aventure
// ---------------------------------------------------------------------------

/** Les étoiles d'un joueur, trou par trou : parcours → neuf nombres de 0 à 3 */
export type StarBook = Partial<Record<CourseId, number[]>>;

/** Le parcours s'ouvre-t-il dans l'aventure ? Le premier toujours ; les autres quand le précédent a chaque trou fini */
export function courseOpen(book: StarBook, c: CourseId): boolean {
  const k = COURSE_IDS.indexOf(c);
  if (k <= 0) return true;
  return courseStars(book[COURSE_IDS[k - 1]!] ?? []) >= 1;
}

/** Ce que la partie a fait monter : les trous où il fait mieux qu'avant (sans jamais rien faire baisser) */
export function improvedHoles(
  before: StarBook,
  earned: { c: CourseId; i: number; stars: Stars }[],
): { c: CourseId; i: number; stars: Stars }[] {
  const best = new Map<string, Stars>();
  for (const e of earned) {
    const k = `${e.c}:${e.i}`;
    if (e.stars > (best.get(k) ?? 0)) best.set(k, e.stars);
  }
  const out: { c: CourseId; i: number; stars: Stars }[] = [];
  for (const [k, stars] of best) {
    const [c, i] = k.split(":") as [CourseId, string];
    if (stars > (before[c]?.[Number(i)] ?? 0)) out.push({ c, i: Number(i), stars });
  }
  return out;
}
