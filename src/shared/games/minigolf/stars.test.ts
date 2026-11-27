// Les étoiles du minigolf, ses défis et l'ordre de l'aventure.
import { describe, expect, it } from "vitest";
import { COURSE_IDS, COURSES } from "./courses.ts";
import { challengeDone, challengeOf, countsForStars, courseOpen, courseStars, holeStars, improvedHoles, starTotal } from "./stars.ts";

describe("les étoiles d'un trou", () => {
  it("fini, au par, sous le par ; au-delà de la limite, aucune", () => {
    expect(holeStars(1, 2)).toBe(3);
    expect(holeStars(2, 3)).toBe(3);
    expect(holeStars(3, 3)).toBe(2);
    expect(holeStars(4, 3)).toBe(1);
    expect(holeStars(8, 3)).toBe(1);
    expect(holeStars(9, 3)).toBe(0);
  });
});

describe("les étoiles d'un parcours", () => {
  it("la plus petite de ses neuf trous ; un trou jamais joué compte 0", () => {
    expect(courseStars([3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(3);
    expect(courseStars([3, 3, 2, 3, 3, 3, 3, 3, 3])).toBe(2);
    expect(courseStars([3, 3, 3, 3, 3, 3, 3, 3])).toBe(0);
    expect(starTotal([3, 2, 1])).toBe(6);
  });

  it("comptent avec les règles du parcours, à l'envers aussi, pas avec les bonus, la lune ou la glace", () => {
    expect(countsForStars({ bonus: false, lune: false, glace: false })).toBe(true);
    expect(countsForStars({ bonus: true, lune: false, glace: false })).toBe(false);
    expect(countsForStars({ bonus: false, lune: true, glace: false })).toBe(false);
    expect(countsForStars({ bonus: false, lune: false, glace: true })).toBe(false);
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

describe("l'ordre de l'aventure", () => {
  it("le premier parcours est ouvert ; le suivant quand chaque trou du précédent a été fini", () => {
    expect(courseOpen({}, "jardin")).toBe(true);
    expect(courseOpen({}, "mer")).toBe(false);
    expect(courseOpen({ jardin: [1, 2, 3, 1, 1, 1, 1, 1] }, "mer")).toBe(false);
    expect(courseOpen({ jardin: [1, 2, 3, 1, 1, 1, 1, 1, 1] }, "mer")).toBe(true);
    expect(courseOpen({ jardin: [3, 3, 3, 3, 3, 3, 3, 3, 3] }, "montagne")).toBe(false);
  });

  it("une partie ne fait jamais baisser une étoile, et ne garde que le mieux de chaque trou", () => {
    const up = improvedHoles({ jardin: [2, 1] }, [
      { c: "jardin", i: 0, stars: 1 },
      { c: "jardin", i: 1, stars: 2 },
      { c: "jardin", i: 1, stars: 3 },
      { c: "mer", i: 4, stars: 1 },
    ]);
    expect(up).toEqual([
      { c: "jardin", i: 1, stars: 3 },
      { c: "mer", i: 4, stars: 1 },
    ]);
  });
});
