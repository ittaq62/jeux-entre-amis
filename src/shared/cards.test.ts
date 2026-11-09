import { describe, expect, it } from "vitest";
import {
  CARD_BY_ID,
  CARDS,
  drawPack,
  FAMILIES,
  familyBonus,
  PACK_PRICE,
  PACK_SLOTS,
  PITY_EPIC,
  PITY_LEGEND,
  RARITIES,
  RARITY,
  type Rarity,
} from "./cards.ts";

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rarityOf = (id: string): Rarity => CARD_BY_ID.get(id)!.rarity;
const fresh = { sinceEpic: 0, sinceLegend: 0 };

describe("le catalogue", () => {
  it("chaque carte a un identifiant à elle, un nom et une phrase", () => {
    expect(CARD_BY_ID.size).toBe(CARDS.length);
    for (const c of CARDS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.quote.length).toBeGreaterThan(0);
    }
  });

  it("chaque rareté existe, chaque famille a des cartes", () => {
    for (const r of RARITIES) expect(CARDS.some((c) => c.rarity === r)).toBe(true);
    for (const f of FAMILIES) expect(CARDS.some((c) => c.family === f.id)).toBe(true);
  });

  it("plus c'est rare, plus ça vaut cher, à la revente comme à l'achat", () => {
    for (let i = 1; i < RARITIES.length; i++) {
      expect(RARITY[RARITIES[i]!].sell).toBeGreaterThan(RARITY[RARITIES[i - 1]!].sell);
      expect(RARITY[RARITIES[i]!].craft).toBeGreaterThan(RARITY[RARITIES[i - 1]!].craft);
    }
  });

  it("une famille complétée rapporte quelque chose", () => {
    for (const f of FAMILIES) expect(familyBonus(f.id)).toBeGreaterThan(0);
  });
});

describe("les paquets", () => {
  it("cinq cartes, toutes différentes, dont une au moins peu commune et une au moins rare", () => {
    const rand = seeded(7);
    for (let i = 0; i < 2000; i++) {
      const { cards } = drawPack(fresh, new Set(), rand);
      expect(cards).toHaveLength(5);
      expect(new Set(cards).size).toBe(5);
      expect(RARITIES.indexOf(rarityOf(cards[3]!))).toBeGreaterThanOrEqual(1);
      expect(RARITIES.indexOf(rarityOf(cards[4]!))).toBeGreaterThanOrEqual(2);
    }
  });

  it("la garantie épique tombe au plus tard au paquet prévu, et c'est une carte qu'on n'a pas", () => {
    const owned = new Set(
      CARDS.filter((c) => c.rarity === "epique")
        .slice(0, 8)
        .map((c) => c.id),
    );
    const rand = seeded(11);
    for (let i = 0; i < 500; i++) {
      const { cards, next } = drawPack({ sinceEpic: PITY_EPIC - 1, sinceLegend: 0 }, owned, rand);
      // La garantie joue sur la dernière carte, sauf si le paquet en a déjà donné une
      const earlier = ["epique", "legendaire"].includes(rarityOf(cards[3]!));
      const last = cards[4]!;
      if (!earlier) expect(["epique", "legendaire"]).toContain(rarityOf(last));
      if (!earlier && rarityOf(last) === "epique") expect(owned.has(last)).toBe(false);
      expect(next.sinceEpic).toBe(0);
    }
  });

  it("la garantie légendaire tombe au plus tard au paquet prévu, et c'est une carte qu'on n'a pas", () => {
    const owned = new Set(
      CARDS.filter((c) => c.rarity === "legendaire")
        .slice(0, 3)
        .map((c) => c.id),
    );
    const rand = seeded(13);
    for (let i = 0; i < 500; i++) {
      const { cards, next } = drawPack({ sinceEpic: 0, sinceLegend: PITY_LEGEND - 1 }, owned, rand);
      expect(rarityOf(cards[4]!)).toBe("legendaire");
      expect(owned.has(cards[4]!)).toBe(false);
      expect(next.sinceLegend).toBe(0);
      expect(next.sinceEpic).toBe(0);
    }
  });

  it("sans carte épique, les compteurs avancent", () => {
    const rand = () => 0.01; // toujours la rareté la plus basse de chaque emplacement
    const { next } = drawPack({ sinceEpic: 2, sinceLegend: 5 }, new Set(), rand);
    expect(next).toEqual({ sinceEpic: 3, sinceLegend: 6 });
  });

  it("revendre un paquet entier de doubles ne rembourse jamais le paquet", () => {
    let worst = 0;
    for (const odds of PACK_SLOTS) {
      const total = RARITIES.reduce((n, r) => n + (odds[r] ?? 0), 0);
      worst += RARITIES.reduce((n, r) => n + ((odds[r] ?? 0) / total) * RARITY[r].sell, 0);
    }
    expect(worst).toBeLessThan(PACK_PRICE * 0.75);
  });

  it("le tirage réel respecte à peu près les chances annoncées", () => {
    const rand = seeded(99);
    const seen: Record<string, number> = {};
    const packs = 40000;
    for (let i = 0; i < packs; i++)
      for (const c of drawPack(fresh, new Set(), rand).cards) seen[rarityOf(c)] = (seen[rarityOf(c)] ?? 0) + 1;
    expect(seen.commune! / packs).toBeCloseTo(2.22, 1);
    expect(seen.legendaire! / packs).toBeCloseTo(0.04, 1);
  });
});
