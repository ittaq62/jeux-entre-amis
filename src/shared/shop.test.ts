import { describe, expect, it } from "vitest";
import { canUse, kartItem, navalItem, SHOP_BY_ID, SHOP_ITEMS, tokenItem, unoItem, vehicleItem } from "./shop.ts";

// La migration, lue sur le disque : le dossier src/shared ne connaît pas les types de Node, d'où l'import par une variable
const fsModule = "node:fs";
const { readFileSync } = (await import(fsModule)) as { readFileSync: (path: string, encoding: "utf8") => string };
const migration = readFileSync("migrations/0008_boutique.sql", "utf8");

describe("la boutique", () => {
  it("chaque article a un identifiant à lui et un prix entier", () => {
    expect(SHOP_BY_ID.size).toBe(SHOP_ITEMS.length);
    for (const item of SHOP_ITEMS) {
      expect(Number.isInteger(item.price)).toBe(true);
      expect(item.price).toBeGreaterThanOrEqual(0);
    }
  });

  it("chaque catégorie garde de quoi jouer sans rien acheter, et a quelque chose à vendre", () => {
    for (const kind of ["naval", "token", "vehicle", "kart", "uno"] as const) {
      const items = SHOP_ITEMS.filter((i) => i.kind === kind);
      expect(items.some((i) => i.price === 0)).toBe(true);
      expect(items.some((i) => i.price > 0)).toBe(true);
    }
  });

  it("ce qui est offert s'utilise sans l'avoir acheté, le reste seulement une fois acheté", () => {
    const none = new Set<string>();
    expect(canUse(navalItem("marine"), none)).toBe(true);
    expect(canUse(tokenItem("pion"), none)).toBe(true);
    expect(canUse(vehicleItem("moto"), none)).toBe(true);
    expect(canUse(kartItem("usine"), none)).toBe(true);
    expect(canUse(unoItem("classique"), none)).toBe(true);
    expect(canUse(unoItem("or"), none)).toBe(false);
    expect(canUse(navalItem("lave"), none)).toBe(false);
    expect(canUse(navalItem("lave"), new Set([navalItem("lave")]))).toBe(true);
    expect(canUse("naval:inconnu", new Set())).toBe(false);
  });

  it("on peut acheter directement le plus cher : aucun article n'en réclame un autre", () => {
    const most = SHOP_ITEMS.filter((i) => i.kind === "naval").sort((a, b) => b.price - a.price)[0]!;
    expect(canUse(most.id, new Set([most.id]))).toBe(true);
  });

  it("la migration garde acquis chaque article payant de l'ancien système", () => {
    // Les dos de cartes UNO sont arrivés après : l'ancien système ne les connaissait pas
    for (const item of SHOP_ITEMS.filter((i) => i.price > 0 && i.kind !== "uno")) expect(migration).toContain(`'${item.id}'`);
  });
});
