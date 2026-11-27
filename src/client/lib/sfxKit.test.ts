import { describe, expect, it } from "vitest";
import { roomImpulse, vary } from "./sfxKit.ts";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("la boîte à sons commune", () => {
  it("une petite pièce : la réverbération s'éteint d'environ 60 dB en rt60, et la gauche n'est pas la droite", () => {
    const sr = 48000;
    const [l, r] = roomImpulse(sr, 0.4, seeded(7));
    const energy = (a: Float32Array, from: number, to: number) => {
      let e = 0;
      for (let i = Math.floor(from * sr); i < Math.floor(to * sr); i++) e += a[i]! ** 2;
      return e / ((to - from) * sr);
    };
    const early = energy(l!, 0.02, 0.06);
    const late = energy(l!, 0.4, 0.44);
    const dropDb = 10 * Math.log10(early / late);
    expect(dropDb).toBeGreaterThan(40);
    expect(dropDb).toBeLessThan(75);
    let diff = 0;
    for (let i = 0; i < l!.length; i++) diff += Math.abs(l![i]! - r![i]!);
    expect(diff).toBeGreaterThan(1);
  });

  it("chaque coup varie un peu, autour de sa valeur", () => {
    for (let k = 0; k < 200; k++) {
      const x = vary(100, 0.06);
      expect(x).toBeGreaterThanOrEqual(94);
      expect(x).toBeLessThanOrEqual(106);
    }
  });
});
