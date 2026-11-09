import { describe, expect, it } from "vitest";
import { ITEM_KINDS, rouletteStrip } from "../../../shared/games/bolides/items.ts";
import { backOut, bombBlink, flatScale, giantScale, keyframes } from "./fxCurves.ts";

describe("les courbes des objets", () => {
  it("un rebond part de zéro, dépasse, et finit sur 1", () => {
    expect(backOut(0)).toBeCloseTo(0);
    expect(backOut(1)).toBeCloseTo(1);
    expect(backOut(0.7)).toBeGreaterThan(1);
    expect(backOut(-1)).toBeCloseTo(0);
    expect(backOut(9)).toBeCloseTo(1);
  });

  it("une suite de points s'interpole, et reste bornée aux extrémités", () => {
    const table = [
      [0, 1],
      [1, 3],
    ] as const;
    expect(keyframes(table, -5)).toBe(1);
    expect(keyframes(table, 0.5)).toBeCloseTo(2);
    expect(keyframes(table, 7)).toBe(3);
  });

  it("le géant grandit par à-coups jusqu'à sa taille, puis rétrécit jusqu'à sa taille normale", () => {
    expect(giantScale(true, 0)).toBe(1);
    expect(giantScale(true, 5)).toBeCloseTo(1.8);
    // Il grandit puis se tasse un peu : ce n'est pas une montée régulière
    expect(giantScale(true, 0.19)).toBeLessThan(giantScale(true, 0.09));
    expect(giantScale(false, 0)).toBeCloseTo(1.8);
    expect(giantScale(false, 5)).toBe(1);
  });

  it("le kart écrasé s'aplatit puis revient exactement à sa hauteur", () => {
    expect(flatScale(0.2)).toBeLessThan(0.3);
    expect(flatScale(3)).toBe(1);
  });

  it("la bombe clignote de plus en plus vite", () => {
    const flips = (from: number, to: number) => {
      let n = 0;
      let last = bombBlink(from);
      for (let t = from; t < to; t += 0.001) {
        const now = bombBlink(t);
        if (now !== last) n++;
        last = now;
      }
      return n;
    };
    expect(flips(0.75, 1)).toBeGreaterThan(flips(0, 0.25));
  });
});

describe("la roue des objets", () => {
  it("s'arrête toujours sur l'objet gagné, sans jamais montrer deux fois le même d'affilée", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed % 100000) / 100000;
    };
    for (const final of ITEM_KINDS) {
      for (let run = 0; run < 30; run++) {
        const strip = rouletteStrip(final, rand);
        expect(strip).toHaveLength(12);
        expect(strip.at(-1)).toBe(final);
        for (let i = 1; i < strip.length; i++) expect(strip[i]).not.toBe(strip[i - 1]);
      }
    }
  });
});
