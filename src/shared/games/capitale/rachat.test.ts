import { describe, expect, it } from "vitest";
import { botAction, wantsBuyout } from "./bot.ts";
import {
  applyAction,
  buyoutPrice,
  buyoutShield,
  canUpgrade,
  createGame,
  DEFAULT_SETTINGS,
  type CapitaleAction,
  type CapitaleSettings,
  type CapitaleState,
} from "./engine.ts";

// Le rachat d'une ville adverse, la construction équilibrée, et les parties commencées avant ces règles.

const IDS = ["a", "b", "c", "d"];
function game(n = 2, settings: Partial<CapitaleSettings> = {}, teams: Record<string, number> | null = null): CapitaleState {
  const { state } = createGame(IDS.slice(0, n), { ...DEFAULT_SETTINGS, end: "bankrupt", ...settings }, 3, teams);
  state.turn = 0;
  return state;
}
const P = (s: CapitaleState, id: string) => s.players.find((p) => p.id === id)!;
const own = (s: CapitaleState, id: string, ...squares: number[]) => squares.forEach((i) => (s.deeds[i]!.owner = id));
const lvl = (s: CapitaleState, square: number, level: number) => (s.deeds[square]!.level = level);
function act(s: CapitaleState, id: string, action: CapitaleAction) {
  const r = applyAction(s, id, action);
  if (!r.ok) throw new Error(r.error);
  return r.events;
}
/** a s'arrête sur Paris (de la case 33, 2 + 4) */
const landOnParis = (s: CapitaleState, dice: [number, number] = [2, 4]) => {
  P(s, "a").position = 39 - dice[0] - dice[1];
  s.rigged = [dice];
  return act(s, "a", { type: "roll" });
};

describe("le rachat", () => {
  it("le loyer payé, on peut racheter la ville : sa valeur majorée de moitié, payée au propriétaire", () => {
    const s = game();
    own(s, "b", 39);
    lvl(s, 39, 1);
    expect(buyoutPrice(s, 39)).toBe(900);
    landOnParis(s);
    expect(s.step).toBe("buyout");
    expect(s.pendingBuyout).toBe(39);
    const events = act(s, "a", { type: "buyout" });
    expect(events).toContainEqual({ type: "buyout", player: "a", from: "b", square: 39, price: 900 });
    expect(s.deeds[39]).toMatchObject({ owner: "a", level: 1 });
    expect(P(s, "a").cash).toBe(1500 - 200 - 900);
    expect(P(s, "b").cash).toBe(1500 + 200 + 900);
    expect(P(s, "a").stats.buyouts).toBe(1);
    expect(s.step).toBe("manage");
    // Il peut encore bâtir sa nouvelle ville ce tour-ci
    expect(canUpgrade(s, "a", 39)).toBeNull();
  });

  it("on peut la laisser ; un double fait rejouer après", () => {
    const s = game();
    own(s, "b", 39);
    landOnParis(s, [3, 3]);
    expect(s.step).toBe("buyout");
    act(s, "a", { type: "skipBuyout" });
    expect(s.step).toBe("roll");
    expect(s.deeds[39]!.owner).toBe("b");
  });

  it("pas assez d'argent : rien n'est proposé", () => {
    const s = game();
    own(s, "b", 39);
    lvl(s, 39, 2);
    P(s, "a").cash = 1200;
    landOnParis(s);
    expect(s.step).toBe("manage");
    expect(s.pendingBuyout).toBeNull();
    expect(applyAction(s, "a", { type: "buyout" }).ok).toBe(false);
  });

  it("protégées : un monument, une ville hypothéquée, le quartier d'un obélisque, et pas de second stade", () => {
    const s = game();
    own(s, "b", 37, 39);
    lvl(s, 39, 5);
    expect(buyoutShield(s, "a", 39)).toBe("Un monument ne se rachète pas.");
    lvl(s, 39, 4);
    s.deeds[37]!.special = { kind: "monument", by: "b" };
    expect(buyoutShield(s, "a", 39)).toBe("L'obélisque protège tout son quartier du rachat.");
    s.deeds[37]!.special = null;
    s.deeds[39]!.mortgaged = true;
    expect(buyoutShield(s, "a", 39)).toBe("Une ville hypothéquée ne se rachète pas.");
    s.deeds[39]!.mortgaged = false;
    s.deeds[39]!.special = { kind: "stade", by: "b" };
    own(s, "a", 1);
    s.deeds[1]!.special = { kind: "stade", by: "a" };
    expect(buyoutShield(s, "a", 39)).toBe("Tu as déjà un stade : pas de second.");
    expect(buyoutShield(s, "a", 5)).toBe("On ne rachète que les villes.");
    expect(buyoutShield(s, "b", 39)).toBe("Cette ville n'est pas à un adversaire.");
    // Un monument au niveau 5 : arrêté dessus, on paie et rien n'est proposé
    lvl(s, 39, 5);
    s.deeds[39]!.special = null;
    P(s, "a").cash = 5000;
    landOnParis(s);
    expect(s.step).toBe("manage");
  });

  it("pas de rachat entre coéquipiers", () => {
    const s = game(4, { teamRent: "full" }, { a: 0, b: 0, c: 1, d: 1 });
    own(s, "b", 39);
    expect(buyoutShield(s, "a", 39)).toMatch(/coéquipiers/);
    landOnParis(s);
    expect(s.step).toBe("manage");
    own(s, "c", 37);
    expect(buyoutShield(s, "a", 37)).toBeNull();
  });

  it("le parc et le stade suivent la ville, et sont dans le prix ; la nuisance du racheteur disparaît", () => {
    const s = game();
    own(s, "b", 39, 37);
    s.deeds[39]!.special = { kind: "parc", by: "b" };
    expect(buyoutPrice(s, 39)).toBe(Math.round((400 + 100) * 1.5));
    landOnParis(s);
    act(s, "a", { type: "buyout" });
    expect(s.deeds[39]!.special).toEqual({ kind: "parc", by: "a" });
    const t = game();
    own(t, "b", 39);
    t.deeds[39]!.special = { kind: "decharge", by: "a" };
    landOnParis(t);
    act(t, "a", { type: "buyout" });
    expect(t.deeds[39]!.special).toBeNull();
  });

  it("un rachat qui complète trois quartiers fait gagner au Monopole", () => {
    const s = game(2, { monopoly: true });
    own(s, "a", 1, 3, 11, 13, 14, 37);
    own(s, "b", 39);
    landOnParis(s);
    expect(s.step).toBe("buyout");
    act(s, "a", { type: "buyout" });
    expect(s.step).toBe("over");
    expect(s.outcome).toMatchObject({ reason: "monopoly", monopoly: { player: "a" } });
  });

  it("une dette d'abord : le rachat n'est proposé qu'une fois la dette réglée, s'il reste de quoi", () => {
    const s = game();
    own(s, "b", 39);
    lvl(s, 39, 1);
    own(s, "a", 1, 3, 37);
    P(s, "a").cash = 100;
    landOnParis(s);
    expect(s.step).toBe("debt");
    act(s, "a", { type: "mortgage", square: 37 });
    expect(s.step).toBe("manage");
    expect(s.pendingBuyout).toBeNull();
  });

  it("sans la règle, rien n'est proposé", () => {
    const s = game(2, { buyout: false });
    own(s, "b", 39);
    landOnParis(s);
    expect(s.step).toBe("manage");
  });
});

describe("la construction équilibrée", () => {
  it("sans tout le quartier, deux maisons au plus", () => {
    const s = game();
    own(s, "a", 39);
    act(s, "a", { type: "upgrade", square: 39 });
    s.turnId += 1;
    act(s, "a", { type: "upgrade", square: 39 });
    s.turnId += 1;
    expect(canUpgrade(s, "a", 39)).toBe("Pour monter plus haut, il faut tout le quartier bleu.");
  });

  it("dans un quartier complet, aucune rue ne prend plus d'un niveau d'avance", () => {
    const s = game();
    own(s, "a", 37, 39);
    act(s, "a", { type: "upgrade", square: 39 });
    s.turnId += 1;
    expect(canUpgrade(s, "a", 39)).toBe("Construction équilibrée : monte d'abord Lyon.");
    act(s, "a", { type: "upgrade", square: 37 });
    act(s, "a", { type: "upgrade", square: 39 });
    expect([s.deeds[37]!.level, s.deeds[39]!.level]).toEqual([1, 2]);
    // Une rue hypothéquée du quartier bloque les autres au-dessus du premier niveau
    const t = game();
    own(t, "a", 11, 13, 14);
    t.deeds[11]!.mortgaged = true;
    act(t, "a", { type: "upgrade", square: 13 });
    expect(canUpgrade(t, "a", 14)).toBeNull();
    act(t, "a", { type: "upgrade", square: 14 });
    t.turnId += 1;
    expect(canUpgrade(t, "a", 13)).toMatch(/Périgueux/);
  });

  it("les niveaux déjà là restent quand le quartier se défait (rachat, échange)", () => {
    const s = game();
    own(s, "b", 37, 39);
    lvl(s, 37, 3);
    lvl(s, 39, 3);
    P(s, "a").cash = 5000;
    landOnParis(s);
    act(s, "a", { type: "buyout" });
    expect(s.deeds[39]!.level).toBe(3);
    expect(s.deeds[37]!.level).toBe(3);
    s.turnId += 1;
    expect(canUpgrade(s, "a", 39)).toMatch(/tout le quartier/);
  });
});

describe("les bots et le rachat", () => {
  it("rachètent la ville qui complète leur quartier, pas une ville chère qui les laisserait sans réserve", () => {
    const s = game();
    own(s, "a", 37);
    own(s, "b", 39);
    P(s, "a").cash = 1500;
    s.pendingBuyout = 39;
    s.step = "buyout";
    expect(wantsBuyout(s, "a", 39, "moyen")).toBe(true);
    expect(botAction(s, "a", "fort")).toEqual({ type: "buyout" });
    // Le remplaçant d'un absent ne rachète rien à sa place
    expect(botAction(s, "a", "fort", { allowAttack: false })).toEqual({ type: "skipBuyout" });
    P(s, "a").cash = 620;
    expect(wantsBuyout(s, "a", 39, "moyen")).toBe(false);
    const t = game();
    own(t, "b", 1);
    t.pendingBuyout = 1;
    t.step = "buyout";
    // Guéret seule, sans rien autour : pas pour Facile
    expect(wantsBuyout(t, "a", 1, "facile")).toBe(false);
  });

  it("au Monopole, ils rachètent le titre qui les fait gagner", () => {
    const s = game(2, { monopoly: true });
    own(s, "a", 1, 3, 11, 13, 14, 37);
    own(s, "b", 39);
    lvl(s, 39, 2);
    P(s, "a").cash = 1300;
    s.pendingBuyout = 39;
    s.step = "buyout";
    expect(wantsBuyout(s, "a", 39, "facile")).toBe(true);
  });
});

describe("une partie commencée avant ces règles", () => {
  it("garde l'ancienne règle : pas de rachat, trois niveaux sans le quartier, pas de catastrophe", () => {
    const s = game();
    const old = s.settings as Partial<CapitaleSettings>;
    delete old.buyout;
    delete old.disasters;
    delete old.evenBuild;
    delete s.pendingBuyout;
    own(s, "b", 39);
    landOnParis(s);
    expect(s.step).toBe("manage");
    own(s, "a", 1);
    lvl(s, 1, 2);
    expect(canUpgrade(s, "a", 1)).toBeNull();
  });
});
