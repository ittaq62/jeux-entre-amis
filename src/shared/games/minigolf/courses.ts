// Les parcours : huit thèmes de neuf trous. Un parcours n'est proposé que quand ses neuf trous sont prêts.

import { compileHole, type Course, type HoleDef } from "./course.ts";
import { GRAVITY } from "./physics.ts";
import { JARDIN } from "./holes/jardin.ts";
import { MER } from "./holes/mer.ts";

export const COURSE_IDS = ["jardin", "mer", "montagne", "cuisine", "jungle", "horloger", "lune", "volcan"] as const;
export type CourseId = (typeof COURSE_IDS)[number];

export interface CourseInfo {
  id: CourseId;
  name: string;
  blurb: string;
  holes: HoleDef[];
  /** La pesanteur (la Base lunaire est plus légère) */
  g: number;
}

export const COURSES: Record<CourseId, CourseInfo> = {
  jardin: {
    id: "jardin",
    name: "Jardin du château",
    blurb: "Buis taillés, fontaines, grilles qui pivotent et moulin, dans la lumière dorée de la fin d'après-midi.",
    holes: JARDIN,
    g: GRAVITY,
  },
  mer: {
    id: "mer",
    name: "Bord de mer",
    blurb: "Au coucher du soleil : la promenade de planches, la jetée, le phare, les cabines rayées, les crabes et la vague.",
    holes: MER,
    g: GRAVITY,
  },
  montagne: {
    id: "montagne",
    name: "Montagne enneigée",
    blurb: "Glace qui glisse, neige qui freine, tremplin et chalets.",
    holes: [],
    g: GRAVITY,
  },
  cuisine: { id: "cuisine", name: "Cuisine géante", blurb: "Une balle minuscule sur un plan de travail géant.", holes: [], g: GRAVITY },
  jungle: {
    id: "jungle",
    name: "Temple dans la jungle",
    blurb: "Ruines, cascades, ponts de lianes et disques de pierre.",
    holes: [],
    g: GRAVITY,
  },
  horloger: {
    id: "horloger",
    name: "Atelier d'horloger",
    blurb: "Engrenages, tapis roulants, pistons et balanciers.",
    holes: [],
    g: GRAVITY,
  },
  lune: { id: "lune", name: "Base lunaire", blurb: "Gravité faible, grands sauts, cratères et téléporteurs.", holes: [], g: 3.2 },
  volcan: { id: "volcan", name: "Volcan", blurb: "Lave, roche noire et geysers, sous les lueurs rouges.", holes: [], g: GRAVITY },
};

export function isCourseId(v: unknown): v is CourseId {
  return typeof v === "string" && (COURSE_IDS as readonly string[]).includes(v);
}

/** Les parcours jouables (leurs neuf trous sont prêts) */
export function readyCourses(): CourseId[] {
  return COURSE_IDS.filter((id) => COURSES[id].holes.length === 9);
}

/** Un trou d'une partie : le parcours, son numéro, et s'il se joue à l'envers */
export interface HoleRef {
  c: CourseId;
  i: number;
  m: boolean;
}

export function holeDef(ref: HoleRef): HoleDef {
  return COURSES[ref.c].holes[ref.i]!;
}

const cache = new Map<string, Course>();

/** Le trou prêt pour la physique (gardé en mémoire : il ne change jamais) */
export function courseOf(ref: HoleRef): Course {
  const key = `${ref.c}:${ref.i}:${ref.m ? 1 : 0}`;
  let c = cache.get(key);
  if (!c) {
    c = compileHole(holeDef(ref), ref.m);
    cache.set(key, c);
  }
  return c;
}
