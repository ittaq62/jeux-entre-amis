import { describe, expect, it } from "vitest";
import { hazardPos, ITEM_KINDS, PETARD_SPEED, rouletteStrip, type Hazard } from "../../../shared/games/bolides/items.ts";
import { getTrack, pointAt } from "../../../shared/games/bolides/track.ts";
import { backOut, bombBlink, flatScale, giantScale, keyframes, launchGap, launchLeft } from "./fxCurves.ts";

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

describe("le départ d'un objet lancé", () => {
  const t = getTrack("port");
  /** Un kart montré à s, dans la voie d, qui roule à v le long de la route */
  const kartOn = (s: number, d: number) => {
    const p = pointAt(t, s, d);
    return { x: p.x, y: p.y, z: p.z, air: 0, h: Math.atan2(p.tx, p.tz) };
  };
  const petard = (s0: number, speed = PETARD_SPEED): Hazard => ({ id: 1, kind: "petard", s0, d: 2, speed, owner: "a", at: 10_000 });

  it("le pétard apparaît au nez du kart, reste toujours devant lui, puis rejoint sa course", () => {
    // Le serveur l'a fait partir 3 m devant la dernière position reçue (s = 300) ; le temps de l'aller-retour, le kart
    // montré chez le joueur a avancé de 4,5 m : sans rien faire, le pétard apparaîtrait dans le kart
    const hz = petard(303);
    const v = 30;
    const first = hazardPos(t, hz, hz.at)!;
    const gap = launchGap(hz, first, hz.at, kartOn(304.5, 2))!;
    expect(gap).not.toBeNull();
    for (let ms = 0; ms <= 1000; ms += 20) {
      const kart = kartOn(304.5 + (v * ms) / 1000, 2);
      const p = hazardPos(t, hz, hz.at + ms)!;
      const left = launchLeft(ms / 1000, gap.ease);
      const x = p.x + gap.x * left - kart.x;
      const z = p.z + gap.z * left - kart.z;
      // Devant le kart (au-delà de son nez), dans son axe
      const ahead = x * Math.sin(kart.h) + z * Math.cos(kart.h);
      expect(ahead).toBeGreaterThan(1.5);
      expect(Math.abs(x * Math.cos(kart.h) - z * Math.sin(kart.h))).toBeLessThan(0.5);
      // Rattrapé : il est exactement sur sa course
      if (ms / 1000 >= gap.ease) expect(left).toBe(0);
    }
  });

  it("lancé derrière soi, il part de l'arrière du kart", () => {
    const hz = petard(297, -PETARD_SPEED);
    const kart = kartOn(301, 2);
    const first = hazardPos(t, hz, hz.at)!;
    const gap = launchGap(hz, first, hz.at, kart)!;
    const x = first.x + gap.x - kart.x;
    const z = first.z + gap.z - kart.z;
    expect(x * Math.sin(kart.h) + z * Math.cos(kart.h)).toBeCloseTo(-1.6, 1);
  });

  it("rien à rattraper pour une flaque, un objet lancé depuis longtemps, ou sans savoir qui l'a lancé", () => {
    const hz = petard(303);
    const first = hazardPos(t, hz, hz.at)!;
    expect(launchGap(hz, first, hz.at + 2000, kartOn(304.5, 2))).toBeNull();
    expect(launchGap(hz, first, hz.at, undefined)).toBeNull();
    const oil: Hazard = { id: 2, kind: "huile", x: first.x, z: first.z, s: 300, d: 2, owner: "a", at: 10_000 };
    expect(launchGap(oil, first, oil.at, kartOn(320, 2))).toBeNull();
  });
});
