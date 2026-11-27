// Les étoiles du minigolf : celles d'un trou, les défis de l'aventure, les parcours comme cartes du système commun.
import { describe, expect, it } from "vitest";
import { starsFor, validRule } from "../../stars.ts";
import { COURSE_IDS, COURSES } from "./courses.ts";
import { DEFAULT_CONFIG } from "./match.ts";
import { courseOpen, courseStars, holeMap, MINIGOLF_STARS, STAR_COURSES } from "./starCourses.ts";
import { challengeDone, challengeOf, countsForStars, holeStars, starItems } from "./stars.ts";

describe("les étoiles d'un trou", () => {
  it("fini, au par, sous le par ; au-delà de la limite, aucune", () => {
    expect(holeStars(1, 2)).toBe(3);
    expect(holeStars(2, 3)).toBe(3);
    expect(holeStars(3, 3)).toBe(2);
    expect(holeStars(4, 3)).toBe(1);
    expect(holeStars(8, 3)).toBe(1);
    expect(holeStars(9, 3)).toBe(0);
  });

  it("les seuils de la carte d'un trou disent la même chose", () => {
    const map = MINIGOLF_STARS.maps.find((m) => m.id === "volcan:5")!;
    expect(validRule(map.rule)).toBe(true);
    for (let s = 1; s <= 10; s++) expect(starsFor(s, map.rule)).toBe(holeStars(s, 4));
  });
});

describe("chaque trou, une carte du système commun", () => {
  it("les 72 trous, dans l'ordre des parcours, avec leur vrai par ; un groupe par parcours", () => {
    expect(STAR_COURSES.map((c) => c.id)).toEqual([...COURSE_IDS]);
    for (const c of STAR_COURSES) {
      expect(c.name).toBe(COURSES[c.id].name);
      expect([...c.pars]).toEqual(COURSES[c.id].holes.map((h) => h.par));
    }
    expect(MINIGOLF_STARS.maps).toHaveLength(72);
    expect(new Set(MINIGOLF_STARS.maps.map((m) => m.id)).size).toBe(72);
    for (const m of MINIGOLF_STARS.maps) expect(validRule(m.rule)).toBe(true);
    expect(MINIGOLF_STARS.groups!.find((g) => g.id === "volcan")).toMatchObject({
      name: "Le Volcan",
      maps: ["volcan:1", "volcan:2", "volcan:3", "volcan:4", "volcan:5", "volcan:6", "volcan:7", "volcan:8", "volcan:9"],
    });
  });

  it("une partie : chaque trou joué aux règles du parcours, pas ceux d'un bot, rien avec bonus, lune ou glace", () => {
    const holes = [
      { c: "jardin" as const, i: 2 },
      { c: "mer" as const, i: 0 },
      { c: "jardin" as const, i: 5 },
    ];
    expect(starItems(DEFAULT_CONFIG, holes, [3, 2, null])).toEqual([
      { map: "jardin:3", value: 3 },
      { map: "mer:1", value: 2 },
    ]);
    expect(starItems({ ...DEFAULT_CONFIG, mirror: true } as typeof DEFAULT_CONFIG, holes, [3, 2, 4], [1])).toEqual([
      { map: "jardin:3", value: 3 },
      { map: "jardin:6", value: 4 },
    ]);
    expect(starItems({ ...DEFAULT_CONFIG, bonus: true }, holes, [3, 2, 4])).toEqual([]);
    expect(countsForStars({ bonus: false, lune: true, glace: false })).toBe(false);
    expect(countsForStars({ bonus: false, lune: false, glace: true })).toBe(false);
  });

  it("un parcours : ses neuf trous, son total sur 27 et le plus petit", () => {
    const jardin = STAR_COURSES[0];
    const maps = Object.fromEntries([3, 2, 1, 1, 1, 1, 1, 1, 3].map((n, i) => [holeMap("jardin", i), { stars: n as 1 | 2 | 3, best: 2 }]));
    expect(courseStars({ maps, total: 14, max: 216 }, jardin)).toEqual({ holes: [3, 2, 1, 1, 1, 1, 1, 1, 3], total: 14, max: 27, min: 1 });
  });

  it("l'aventure : le premier parcours ouvert, le suivant quand chaque trou du précédent a une étoile", () => {
    expect(courseOpen(null, "jardin")).toBe(true);
    expect(courseOpen(null, "mer")).toBe(false);
    const eight = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [holeMap("jardin", i), { stars: 3 as const, best: 1 }]));
    expect(courseOpen({ maps: eight, total: 24, max: 216 }, "mer")).toBe(false);
    const nine = { ...eight, [holeMap("jardin", 8)]: { stars: 1 as const, best: 8 } };
    expect(courseOpen({ maps: nine, total: 25, max: 216 }, "mer")).toBe(true);
    expect(courseOpen({ maps: nine, total: 25, max: 216 }, "montagne")).toBe(false);
    expect(courseOpen(null, "inconnu")).toBe(false);
  });
});

describe("les défis", () => {
  it("chaque trou des huit parcours en a un, varié, et le meilleur coup possible le réussit", () => {
    const kinds = new Set<string>();
    for (const c of COURSE_IDS)
      for (let i = 0; i < COURSES[c].holes.length; i++) {
        const ch = challengeOf(c, i);
        kinds.add(ch.kind);
        expect(ch.text.length).toBeGreaterThan(3);
        const par = COURSES[c].holes[i]!.par;
        expect(challengeDone(ch, { strokes: 1, par, lost: 0, bank: true })).toBe(true);
      }
    expect([...kinds].sort()).toEqual(["ace", "bank", "dry", "under"]);
  });

  it("au par sans tomber : une balle perdue le manque, même au par", () => {
    const ch = { kind: "dry" as const, text: "" };
    expect(challengeDone(ch, { strokes: 3, par: 3, lost: 0, bank: false })).toBe(true);
    expect(challengeDone(ch, { strokes: 3, par: 3, lost: 1, bank: false })).toBe(false);
    expect(challengeDone(ch, { strokes: 4, par: 3, lost: 0, bank: false })).toBe(false);
  });

  it("après une bande : peu importe le nombre de coups, pourvu que le trou soit fini", () => {
    const ch = { kind: "bank" as const, text: "" };
    expect(challengeDone(ch, { strokes: 5, par: 3, lost: 0, bank: true })).toBe(true);
    expect(challengeDone(ch, { strokes: 2, par: 3, lost: 0, bank: false })).toBe(false);
    expect(challengeDone(ch, { strokes: 9, par: 3, lost: 0, bank: true })).toBe(false);
  });
});
