import { describe, expect, it } from "vitest";
import {
  CARD_RATIO,
  layoutPartners,
  partnerCardSpot,
  PARTNER_STEP_MAX,
  PARTNER_STEP_MIN,
  type PartnerLayoutInput,
} from "./partnerLayout.ts";

// Les écrans essayés : la place dans la barre du haut, la largeur d'une ligne, la carte, et si l'écran est bas
const screens: { name: string; inlineRoom: number; rowRoom: number; card: number; short: boolean; chrome: number }[] = [
  { name: "PC 1920", inlineRoom: 1440, rowRoom: 1900, card: 44, short: false, chrome: 96 },
  { name: "PC 1366", inlineRoom: 880, rowRoom: 1346, card: 40, short: false, chrome: 96 },
  { name: "téléphone 390", inlineRoom: 40, rowRoom: 370, card: 30, short: false, chrome: 76 },
  { name: "téléphone 360", inlineRoom: 20, rowRoom: 340, card: 30, short: false, chrome: 76 },
  { name: "téléphone en paysage", inlineRoom: 380, rowRoom: 824, card: 28, short: true, chrome: 76 },
];

function check(input: PartnerLayoutInput) {
  const l = layoutPartners(input);
  const room = l.inline ? input.inlineRoom : input.rowRoom;
  // Rien ne dépasse de sa place
  if (l.stacked) for (const h of l.hands) expect(input.chrome + h.width).toBeLessThanOrEqual(room + 0.001);
  else {
    const width = l.hands.reduce((sum, h) => sum + input.chrome + h.width, 0) + input.gap * (l.hands.length - 1);
    expect(width).toBeLessThanOrEqual(room + 0.001);
  }
  // Les cartes ne rapetissent jamais sous le minimum permis
  expect(l.card).toBeLessThanOrEqual(input.card);
  expect(l.card).toBeGreaterThanOrEqual(Math.min(input.card, input.minCard ?? input.card));
  // Chaque carte laisse voir son coin, et reste dans le cadre de sa main
  l.hands.forEach((h, k) => {
    const n = input.counts[k]!;
    if (n > 1 && h.perRow > 1) expect(h.step).toBeGreaterThanOrEqual(l.card * PARTNER_STEP_MIN - 0.001);
    for (let i = 0; i < n; i++) {
      const s = partnerCardSpot(h, i, l.card);
      expect(s.x + l.card).toBeLessThanOrEqual(h.width + 0.001);
      expect(s.y + l.card * CARD_RATIO).toBeLessThanOrEqual(h.height + 0.001);
    }
  });
  return l;
}

describe("les mains des coéquipiers", () => {
  for (const sc of screens) {
    it(`${sc.name} : chaque main tient à sa place, coins lisibles, de 1 à 3 coéquipiers et de 0 à 25 cartes`, () => {
      for (let partners = 1; partners <= 3; partners++) {
        for (let n = 0; n <= 25; n++) {
          const counts = Array.from({ length: partners }, (_, k) => Math.max(0, n - k * 3));
          for (const tall of [false, true]) {
            for (const minCard of [sc.card, 24]) {
              check({
                counts,
                card: sc.card,
                minCard,
                inlineRoom: sc.inlineRoom,
                rowRoom: sc.rowRoom,
                chrome: sc.chrome,
                gap: 8,
                short: sc.short,
                tall,
              });
            }
          }
        }
      }
    });
  }

  it("au PC, la main passe sur sa ligne sous la barre du haut, même s'il y aurait la place dans la barre, cartes bien espacées", () => {
    const l = check({ counts: [7], card: 48, inlineRoom: 1400, rowRoom: 1900, chrome: 96, gap: 8, short: false });
    expect(l.inline).toBe(false);
    expect(l.stacked).toBe(false);
    expect(l.hands[0]!.step).toBeCloseTo(48 * PARTNER_STEP_MAX);
  });

  it("au téléphone, les mains passent sur une ligne à elles", () => {
    const l = check({ counts: [7, 6], card: 30, inlineRoom: 40, rowRoom: 370, chrome: 76, gap: 8, short: false });
    expect(l.inline).toBe(false);
    expect(l.stacked).toBe(false);
  });

  it("au téléphone tenu droit, deux coéquipiers passent chacun sur sa ligne plutôt que de serrer leurs cartes", () => {
    const l = check({ counts: [7, 6], card: 30, inlineRoom: 40, rowRoom: 370, chrome: 76, gap: 8, short: false, tall: true });
    expect(l.stacked).toBe(true);
    for (const h of l.hands) expect(h.step).toBeCloseTo(30 * PARTNER_STEP_MAX);
  });

  it("sur un petit téléphone, deux mains de 7 cartes restent côte à côte, en cartes un peu plus petites, plutôt que de s'empiler", () => {
    const l = check({ counts: [7, 7], card: 30, minCard: 24, inlineRoom: 20, rowRoom: 340, chrome: 76, gap: 8, short: false });
    expect(l.stacked).toBe(false);
    expect(l.card).toBeLessThan(30);
    expect(l.card).toBeGreaterThanOrEqual(24);
  });

  it("en paysage, deux coéquipiers tiennent au milieu de la barre du haut", () => {
    const l = check({ counts: [7, 7], card: 28, minCard: 24, inlineRoom: 380, rowRoom: 824, chrome: 58, gap: 8, short: true });
    expect(l.inline).toBe(true);
  });

  it("une main énorme sur un petit écran se range sur plusieurs rangées plutôt que de déborder", () => {
    const l = check({ counts: [25], card: 30, inlineRoom: 20, rowRoom: 340, chrome: 76, gap: 8, short: false });
    expect(l.stacked).toBe(true);
    expect(l.hands[0]!.rows).toBeGreaterThan(1);
  });

  it("en paysage sur un écran bas, les mains restent au milieu de la barre tant qu'elles y tiennent serrées", () => {
    const l = check({ counts: [9], card: 28, inlineRoom: 380, rowRoom: 824, chrome: 76, gap: 8, short: true });
    expect(l.inline).toBe(true);
  });
});
