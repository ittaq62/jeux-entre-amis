import { describe, expect, it } from "vitest";
import { AVATAR_PARTS, hasWear, randomAvatar, sanitizeAvatar, seededAvatar } from "./avatar.ts";
import { canUse, SHOP_ITEMS, unownedWear, usableWear, wearItem } from "./shop.ts";
import { cleanWear, WEAR, WEAR_BY_ID, WEAR_SLOTS, wearOf, wornItems } from "./wardrobe.ts";

const OLD = { bg: 4, skin: 2, hair: 3, hairColor: 1, eyes: 5, mouth: 2, hat: 3, extra: 2 };

describe("la garde-robe", () => {
  it("chaque chose a un identifiant à elle, un nom à elle et un prix entier", () => {
    expect(WEAR_BY_ID.size).toBe(WEAR.length);
    expect(new Set(WEAR.map((i) => i.name)).size).toBe(WEAR.length);
    for (const i of WEAR) {
      expect(Number.isInteger(i.price)).toBe(true);
      expect(i.price).toBeGreaterThanOrEqual(0);
      expect(i.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("chaque place a de quoi choisir, du moins cher au plus cher ; quelques choses offertes, la plupart à acheter", () => {
    for (const slot of WEAR_SLOTS) {
      const items = wearOf(slot);
      expect(items.length).toBeGreaterThan(0);
      const prices = items.map((i) => i.price);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    }
    const free = WEAR.filter((i) => i.price === 0).length;
    expect(free).toBeGreaterThan(0);
    expect(free).toBeLessThan(WEAR.length / 4);
  });

  it("tout est en vente à la boutique, au même prix", () => {
    for (const i of WEAR) {
      const item = SHOP_ITEMS.find((s) => s.id === wearItem(i.id));
      expect(item).toMatchObject({ kind: "perso", ref: i.id, name: i.name, price: i.price });
    }
  });

  it("ne garde que ce qui est connu et à sa place, sans jamais lever d'erreur", () => {
    expect(cleanWear(undefined)).toBeUndefined();
    expect(cleanWear(null)).toBeUndefined();
    expect(cleanWear("melon")).toBeUndefined();
    expect(cleanWear(["melon"])).toBeUndefined();
    expect(cleanWear({})).toBeUndefined();
    // Inconnu, à la mauvaise place, pas une chaîne, place inconnue : oublié
    expect(cleanWear({ hat: "chapeau-disparu", hair: "melon", bg: 3, cape: "cape", outfit: "cape" })).toEqual({ outfit: "cape" });
    expect(cleanWear({ hat: "melon", fx: "flammes", frame: "neon" })).toEqual({ hat: "melon", fx: "flammes", frame: "neon" });
    expect(wornItems({ hat: "melon", fx: "flammes" }).map((i) => i.id)).toEqual(["melon", "flammes"]);
  });
});

describe("l'avatar enregistré", () => {
  it("l'ancien format se lit à l'identique : rien de plus, rien de moins", () => {
    const read = sanitizeAvatar(JSON.parse(JSON.stringify(OLD)));
    expect(read).toEqual(OLD);
    expect(read).not.toHaveProperty("wear");
    // Réenregistré tel quel, il redonne le même texte en base
    expect(JSON.stringify(read)).toBe(JSON.stringify(OLD));
    expect(hasWear(read)).toBe(false);
  });

  it("ce qu'il porte s'ajoute ; ce qui est inconnu est oublié sans faire tomber le portrait", () => {
    expect(sanitizeAvatar({ ...OLD, wear: { hat: "melon", outfit: "cape" } })).toEqual({ ...OLD, wear: { hat: "melon", outfit: "cape" } });
    expect(sanitizeAvatar({ ...OLD, wear: { hat: "inconnu" } })).toEqual(OLD);
    expect(sanitizeAvatar({ ...OLD, wear: "n'importe quoi" })).toEqual(OLD);
    expect(sanitizeAvatar({ ...OLD, wear: { hat: "inconnu", fx: "aureole" } })).toEqual({ ...OLD, wear: { fx: "aureole" } });
  });

  it("un portrait de base faux ou incomplet reste refusé, même avec quelque chose à porter", () => {
    expect(sanitizeAvatar({})).toBeNull();
    expect(sanitizeAvatar({ wear: { hat: "melon" } })).toBeNull();
    expect(sanitizeAvatar({ ...OLD, hat: AVATAR_PARTS.hat, wear: { hat: "melon" } })).toBeNull();
    expect(sanitizeAvatar({ ...OLD, eyes: "1" })).toBeNull();
  });

  it("les bots et les comptes sans avatar gardent exactement leur personnage", () => {
    // Relevés avec le code d'avant la garde-robe
    expect(seededAvatar("Gaston-ABCD")).toEqual({ bg: 9, skin: 0, hair: 7, hairColor: 0, eyes: 6, mouth: 0, hat: 0, extra: 0 });
    expect(seededAvatar("Lulu-KXQZ")).toEqual({ bg: 6, skin: 2, hair: 1, hairColor: 3, eyes: 2, mouth: 4, hat: 0, extra: 0 });
    expect(seededAvatar("u_8f3k2m9qa")).toEqual({ bg: 8, skin: 2, hair: 4, hairColor: 2, eyes: 4, mouth: 4, hat: 2, extra: 0 });
    expect(seededAvatar("boutique")).toEqual({ bg: 10, skin: 0, hair: 7, hairColor: 2, eyes: 2, mouth: 6, hat: 0, extra: 3 });
    expect(seededAvatar("Mimi-ZZZZ-3")).toEqual({ bg: 0, skin: 0, hair: 1, hairColor: 4, eyes: 2, mouth: 7, hat: 0, extra: 0 });
    for (let i = 0; i < 200; i++) expect(hasWear(randomAvatar())).toBe(false);
  });
});

describe("ce qu'on a le droit de porter", () => {
  const none = new Set<string>();

  it("ce qui est offert se porte sans l'avoir acheté ; le reste seulement une fois acheté", () => {
    expect(canUse(wearItem("tshirt"), none)).toBe(true);
    expect(canUse(wearItem("lisere"), none)).toBe(true);
    expect(canUse(wearItem("flammes"), none)).toBe(false);
    expect(canUse(wearItem("flammes"), new Set([wearItem("flammes")]))).toBe(true);
  });

  it("le serveur retrouve la première chose portée sans l'avoir", () => {
    expect(unownedWear(undefined, none)).toBeNull();
    expect(unownedWear({ outfit: "tshirt", bg: "pois", frame: "lisere" }, none)).toBeNull();
    expect(unownedWear({ outfit: "tshirt", hat: "viking" }, none)?.id).toBe("viking");
    expect(unownedWear({ hat: "viking" }, new Set([wearItem("viking")]))).toBeNull();
    // Une chose achetée pour une place ne vaut pas pour une autre
    expect(unownedWear({ hat: "viking", fx: "flammes" }, new Set([wearItem("viking")]))?.id).toBe("flammes");
  });

  it("quand les achats s'effacent, il ne garde que ce qui est offert", () => {
    expect(usableWear({ hat: "viking", outfit: "tshirt" }, none)).toEqual({ outfit: "tshirt" });
    expect(usableWear({ hat: "viking" }, none)).toBeUndefined();
    expect(usableWear({ hat: "viking" }, new Set([wearItem("viking")]))).toEqual({ hat: "viking" });
    expect(usableWear({ hat: "melon-perdu" }, new Set([wearItem("melon-perdu")]))).toBeUndefined();
  });
});
