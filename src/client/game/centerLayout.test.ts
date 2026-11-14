import { describe, expect, it } from "vitest";
import { arcSeats, placeCenter, rowSeats, type CenterLayoutInput } from "./centerLayout.ts";

// Relevé sur la vraie table, au PC en 1366 × 625, à 6 joueurs : le siège du haut touchait la pioche
const pc625: CenterLayoutInput = {
  areaH: 363,
  base: 181.5,
  cx: 683,
  block: { w: 208, h: 118 },
  below: 30,
  seats: [
    { x: 110, y: 147 },
    { x: 329, y: 91 },
    { x: 683, y: 70 },
    { x: 1036, y: 91 },
    { x: 1254, y: 147 },
  ],
  seat: { w: 100, h: 126 },
  margin: 4,
};

describe("la pioche et la défausse", () => {
  it("restent au milieu quand aucun siège ne les gêne", () => {
    expect(placeCenter({ ...pc625, areaH: 500, base: 250 })).toBe(250);
  });

  it("descendent juste assez pour ne plus toucher le siège du haut", () => {
    const y = placeCenter(pc625);
    expect(y).toBeGreaterThan(pc625.base);
    // Le haut des piles passe sous le bas du siège du haut, et l'étiquette tient encore sur le tapis
    expect(y - pc625.block.h / 2).toBeGreaterThanOrEqual(70 + 126 / 2 + 4);
    expect(y + pc625.block.h / 2 + pc625.below).toBeLessThanOrEqual(pc625.areaH);
  });

  it("remontent un peu sur un tapis bas, pour que l'étiquette de couleur ne déborde pas", () => {
    const low = { ...pc625, areaH: 140, base: 70, block: { w: 142, h: 88 }, seats: [] };
    const y = placeCenter(low);
    expect(y + low.block.h / 2 + low.below).toBeLessThanOrEqual(low.areaH - 4);
    expect(y - low.block.h / 2).toBeGreaterThanOrEqual(0);
  });

  it("ne sortent jamais du tapis, même quand la place manque", () => {
    const cramped = { ...pc625, areaH: 220, base: 110 };
    const y = placeCenter(cramped);
    // Le chevauchement ne peut pas disparaître : elles descendent au mieux, sans que l'étiquette quitte le tapis
    expect(y).toBeGreaterThan(cramped.base);
    expect(y + cramped.block.h / 2 + cramped.below).toBeLessThanOrEqual(cramped.areaH - 4);
    const roomy = { ...pc625, areaH: 300, base: 150 };
    const y2 = placeCenter(roomy);
    expect(y2 + roomy.block.h / 2 + roomy.below).toBeLessThanOrEqual(roomy.areaH - 4);
  });
});

describe("les sièges en paysage sur un écran bas", () => {
  it("se rangent de part et d'autre des piles sans se toucher ni les toucher, tant qu'il y a la place", () => {
    const seatW = 76;
    const blockW = 142;
    for (const areaW of [640, 740, 844, 932]) {
      const side = areaW / 2 - blockW / 2 - 6;
      for (let n = 1; n <= 7; n++) {
        const seats = rowSeats(n, areaW, 67, blockW);
        expect(seats).toHaveLength(n);
        if (Math.ceil(n / 2) * seatW > side) continue;
        const xs = seats.map((s) => s.x);
        for (let i = 1; i < n; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(seatW - 0.001);
        for (const x of xs) {
          expect(x - seatW / 2).toBeGreaterThanOrEqual(-0.001);
          expect(x + seatW / 2).toBeLessThanOrEqual(areaW + 0.001);
          expect(Math.abs(x - areaW / 2)).toBeGreaterThanOrEqual(blockW / 2 + seatW / 2 - 0.001);
        }
      }
    }
  });

  it("le suivant est tout à gauche, le dernier tout à droite", () => {
    const seats = rowSeats(5, 844, 67, 142);
    const xs = seats.map((s) => s.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe("l'arc des sièges", () => {
  const seat = { w: 76, h: 108 };
  const touching = (seats: { x: number; y: number }[]) =>
    seats.some((a, i) => seats.some((b, j) => j > i && Math.abs(a.x - b.x) < seat.w && Math.abs(a.y - b.y) < seat.h));

  it("au téléphone tenu droit, à 6 sous les mains des coéquipiers, s'ouvre jusqu'à ce qu'aucun siège n'en touche un autre", () => {
    // Relevé sur la vraie table en 360 × 640 : 299 px de tapis sous les mains des coéquipiers
    const seats = arcSeats(5, { w: 360, h: 299 }, { x: 46, y: 62 }, true, seat);
    expect(touching(seats)).toBe(false);
    for (const s of seats) {
      expect(s.y - seat.h / 2).toBeGreaterThanOrEqual(0);
      expect(s.y + seat.h / 2).toBeLessThanOrEqual(299);
    }
  });

  it("garde l'arc habituel quand il y a la place", () => {
    const roomy = arcSeats(3, { w: 390, h: 520 }, { x: 46, y: 62 }, true, seat);
    const usual = arcSeats(3, { w: 390, h: 520 }, { x: 46, y: 62 }, true, { w: 1, h: 1 });
    expect(roomy).toEqual(usual);
    // Le suivant à gauche, le dernier à droite
    expect(roomy[0]!.x).toBeLessThan(roomy[2]!.x);
  });
});
