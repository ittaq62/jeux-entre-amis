import { describe, expect, it } from "vitest";
import { BALLS, FETES } from "./games/crampons/boutique.ts";
import { CLUBS, deClub, isLegend } from "./games/crampons/clubs.ts";
import { DEFAULT_CONFIG } from "./games/crampons/view.ts";
import { BOMBS, DEFAULT_BOMB } from "./games/meche/bombs.ts";
import {
  ballItem,
  bombItem,
  canUse,
  clubItem,
  feteItem,
  kartItem,
  navalItem,
  SHOP_BY_ID,
  SHOP_ITEMS,
  tokenItem,
  unoItem,
  vehicleItem,
} from "./shop.ts";

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
    for (const kind of ["naval", "token", "vehicle", "kart", "uno", "club", "ballon", "fete", "bombe"] as const) {
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
    // Crampons : les clubs de tous les jours, le ballon classique et sa propre façon de fêter sont à tout le monde
    expect(canUse(clubItem("saint-ballon"), none)).toBe(true);
    expect(canUse(clubItem("meteore"), none)).toBe(false);
    expect(canUse(clubItem("meteore"), new Set([clubItem("meteore")]))).toBe(true);
    expect(canUse(ballItem("classique"), none)).toBe(true);
    expect(canUse(ballItem("or"), none)).toBe(false);
    expect(canUse(feteItem("maison"), none)).toBe(true);
    expect(canUse(feteItem("genoux"), none)).toBe(false);
    expect(canUse(clubItem("inconnu"), none)).toBe(false);
    // Mèche : la dynamite est à tout le monde
    expect(canUse(bombItem("dynamite"), none)).toBe(true);
    expect(canUse(bombItem("gaz"), none)).toBe(false);
    expect(canUse(bombItem("gaz"), new Set([bombItem("gaz")]))).toBe(true);
  });

  it("on peut acheter directement le plus cher : aucun article n'en réclame un autre", () => {
    const most = SHOP_ITEMS.filter((i) => i.kind === "naval").sort((a, b) => b.price - a.price)[0]!;
    expect(canUse(most.id, new Set([most.id]))).toBe(true);
  });

  it("la migration garde acquis chaque article payant de l'ancien système", () => {
    // Les dos de cartes UNO et tout Crampons sont arrivés après : l'ancien système ne les connaissait pas
    const later = new Set(["uno", "club", "ballon", "fete", "bombe"]);
    for (const item of SHOP_ITEMS.filter((i) => i.price > 0 && !later.has(i.kind))) expect(migration).toContain(`'${item.id}'`);
  });
});

describe("Crampons à la boutique", () => {
  it("les clubs de légende ferment la liste : les tables déjà réglées gardent leurs clubs", () => {
    const first = CLUBS.findIndex(isLegend);
    expect(first).toBeGreaterThan(0);
    expect(CLUBS.slice(first).every(isLegend)).toBe(true);
    for (const id of DEFAULT_CONFIG.clubs) expect(isLegend(CLUBS.find((c) => c.id === id)!)).toBe(false);
  });

  it("chaque club a ses trois lettres à lui, et un club de légende vaut mieux que ceux de tous les jours", () => {
    expect(new Set(CLUBS.map((c) => c.short)).size).toBe(CLUBS.length);
    const best = Math.max(...CLUBS.filter((c) => !isLegend(c)).map((c) => c.rating));
    for (const c of CLUBS.filter(isLegend)) expect(c.rating).toBeGreaterThan(best);
  });

  it("le commentateur dit le nom des clubs de légende avec le bon article", () => {
    expect(deClub("Étoile de Minuit")).toBe("de l'Étoile de Minuit");
    expect(deClub("Dynamo Pétanque")).toBe("du Dynamo Pétanque");
    expect(deClub("Sporting Croissant")).toBe("du Sporting Croissant");
    expect(deClub("Union des Volcans")).toBe("de l'Union des Volcans");
    expect(deClub("Météore FC")).toBe("du Météore FC");
  });

  it("le ballon classique et sa propre façon de fêter sont offerts ; chaque célébration a son geste à elle", () => {
    expect(BALLS[0]).toMatchObject({ id: "classique", price: 0 });
    expect(FETES[0]).toMatchObject({ id: "maison", price: 0, pose: null });
    const poses = FETES.slice(1).map((f) => f.pose);
    expect(new Set(poses).size).toBe(poses.length);
    // Les gestes de chaque joueur vont de 0 à 3 : ceux de la boutique commencent après (footballers.ts)
    for (const pose of poses) expect(pose).toBeGreaterThanOrEqual(4);
  });
});

describe("Mèche à la boutique", () => {
  it("la dynamite est offerte et vient en premier ; les autres coûtent de plus en plus cher", () => {
    expect(BOMBS[0]).toMatchObject({ id: DEFAULT_BOMB, price: 0 });
    const prices = BOMBS.slice(1).map((b) => b.price);
    for (const price of prices) expect(price).toBeGreaterThan(0);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it("chaque bombe a son nom, sa fin en quelques mots, et son cri à elle", () => {
    expect(new Set(BOMBS.map((b) => b.name)).size).toBe(BOMBS.length);
    expect(new Set(BOMBS.map((b) => b.word)).size).toBe(BOMBS.length);
    for (const b of BOMBS) {
      expect(b.blurb.length).toBeGreaterThan(20);
      // Le cri tient au milieu de la table, même sur téléphone
      expect(b.word.length).toBeLessThanOrEqual(10);
      expect(b.word).toMatch(/ !$/);
    }
  });
});
