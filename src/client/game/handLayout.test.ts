import { describe, expect, it } from "vitest";
import { layoutHand } from "./handLayout.ts";

const RATIO = 1.5;
const cases: [number, number, number][] = [
  // largeur de la main, largeur d'une carte, rangées permises
  [316, 71, 3],
  [356, 80, 3],
  [386, 87, 3],
  [426, 90, 3],
  [840, 90, 2],
  [1100, 100, 2],
];

describe("la main de cartes", () => {
  for (const [width, card, maxRows] of cases) {
    it(`${width} px : toutes les cartes tiennent à l'écran, assez espacées pour les lire`, () => {
      const height = card * RATIO;
      for (let n = 1; n <= 60; n++) {
        const l = layoutHand(n, width, card, height, maxRows);
        expect(l.spots).toHaveLength(n);
        expect(l.rows).toBeLessThanOrEqual(maxRows);
        const limit = l.scroll ? l.innerWidth : width;
        for (const s of l.spots) {
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.x + card).toBeLessThanOrEqual(limit + 0.001);
        }
        // Deux voisines d'une même rangée ne se recouvrent jamais au point de cacher la valeur
        const rows = new Map<number, number[]>();
        for (const s of l.spots) {
          if (s.angle === 0 && l.rows === 1 && !l.scroll) continue;
          rows.set(Math.round(s.y), [...(rows.get(Math.round(s.y)) ?? []), s.x]);
        }
        for (const xs of rows.values())
          for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(Math.min(22, card * 0.3) - 0.001);
      }
    });
  }

  it("ne défile que si la main est vraiment démesurée", () => {
    for (const [width, card, maxRows] of cases.slice(0, 4)) {
      for (let n = 1; n <= 25; n++) expect(layoutHand(n, width, card, card * RATIO, maxRows).scroll).toBe(false);
    }
    expect(layoutHand(80, 386, 87, 130, 3).scroll).toBe(true);
  });

  it("garde l'éventail tant qu'il y a la place, puis passe à une ligne droite, puis à plusieurs rangées", () => {
    const at = (n: number) => layoutHand(n, 386, 87, 130, 3);
    expect(at(5).spots.some((s) => s.angle !== 0)).toBe(true);
    expect(at(5).rows).toBe(1);
    expect(at(10).spots.every((s) => s.angle === 0)).toBe(true);
    expect(at(10).rows).toBe(1);
    expect(at(14).rows).toBe(2);
    expect(at(25).rows).toBe(3);
    expect(at(14).extraHeight).toBeGreaterThan(0);
    expect(at(10).extraHeight).toBe(0);
  });

  it("répartit les cartes dans l'ordre, les rangées du haut d'abord, et centre chaque rangée", () => {
    const l = layoutHand(13, 386, 87, 130, 2);
    const rows = [...new Set(l.spots.map((s) => s.y))];
    expect(rows).toHaveLength(2);
    expect(l.spots.filter((s) => s.y === rows[0])).toHaveLength(7);
    expect(l.spots.filter((s) => s.y === rows[1])).toHaveLength(6);
    expect(l.spots.slice(0, 7).every((s) => s.y === rows[0])).toBe(true);
    const second = l.spots.filter((s) => s.y === rows[1]);
    expect(second[0]!.x + (second.at(-1)!.x + 87 - second[0]!.x) / 2).toBeCloseTo(386 / 2);
  });

  it("une main vide ne pose rien", () => {
    expect(layoutHand(0, 386, 87, 130, 3).spots).toEqual([]);
  });
});
