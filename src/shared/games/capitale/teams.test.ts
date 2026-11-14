import { describe, expect, it } from "vitest";
import { mortgageInterest, STADIUM_TICKET } from "./board.ts";
import {
  allies,
  applyAction,
  canPlaceSpecial,
  closeAuction,
  createGame,
  DEFAULT_SETTINGS,
  rentDue,
  teamPlay,
  timeUp,
  type CapitaleAction,
  type CapitaleSettings,
  type CapitaleState,
} from "./engine.ts";

// Les règles d'équipe : loyer entre coéquipiers, dons, héritage, victoire d'équipe.

const IDS = ["a", "b", "c", "d", "e", "f"];

/** Une partie en équipes ; par défaut a et b contre c et d */
function game(teams: Record<string, number> = { a: 0, b: 0, c: 1, d: 1 }, settings: Partial<CapitaleSettings> = {}): CapitaleState {
  const ids = IDS.filter((id) => id in teams);
  const { state } = createGame(ids, { ...DEFAULT_SETTINGS, end: "bankrupt", ...settings }, 7, teams);
  state.turn = 0;
  return state;
}

function act(s: CapitaleState, id: string, action: CapitaleAction) {
  const r = applyAction(s, id, action);
  if (!r.ok) throw new Error(r.error);
  return r.events;
}
const fails = (s: CapitaleState, id: string, action: CapitaleAction) => {
  const r = applyAction(s, id, action);
  return r.ok ? null : r.error;
};
const rollAs = (s: CapitaleState, id: string, dice: [number, number]) => {
  s.turn = s.players.findIndex((p) => p.id === id);
  s.step = "roll";
  s.dice = null;
  s.rigged = [dice];
  return act(s, id, { type: "roll" });
};
const own = (s: CapitaleState, id: string, ...squares: number[]) => squares.forEach((i) => (s.deeds[i]!.owner = id));
const P = (s: CapitaleState, id: string) => s.players.find((p) => p.id === id)!;
const gift = (to: string, cash = 0, squares: number[] = [], jailCards = 0): CapitaleAction => ({
  type: "gift",
  to,
  give: { cash, squares, jailCards },
});

describe("les équipes", () => {
  it("se reconnaissent : coéquipiers, adversaires, et pas d'équipes quand il n'y en a qu'une", () => {
    const s = game();
    expect(teamPlay(s)).toBe(true);
    expect(allies(s, "a", "b")).toBe(true);
    expect(allies(s, "a", "c")).toBe(false);
    expect(teamPlay(game({ a: 0, b: 0 }))).toBe(false);
    const { state } = createGame(["a", "b"], DEFAULT_SETTINGS, 1);
    expect(teamPlay(state)).toBe(false);
    expect(allies(state, "a", "b")).toBe(false);
  });

  it("loyer gratuit chez un coéquipier, plein chez un adversaire", () => {
    const s = game();
    own(s, "b", 37);
    P(s, "a").position = 33;
    const events = rollAs(s, "a", [1, 3]);
    expect(P(s, "a").cash).toBe(1500);
    expect(events).toContainEqual({ type: "teamFree", player: "a", owner: "b", square: 37, amount: 35 });
    P(s, "c").position = 33;
    rollAs(s, "c", [1, 3]);
    expect(P(s, "c").cash).toBe(1465);
    expect(P(s, "b").cash).toBe(1535);
  });

  it("loyer à moitié ou plein entre coéquipiers, selon le réglage", () => {
    const half = game(undefined, { teamRent: "half" });
    own(half, "b", 39);
    P(half, "a").position = 33;
    rollAs(half, "a", [2, 4]);
    expect(P(half, "a").cash).toBe(1475);
    expect(rentDue(half, 39, "a", { diceTotal: 7 })).toBe(25);
    expect(rentDue(half, 39, "c", { diceTotal: 7 })).toBe(50);
    const full = game(undefined, { teamRent: "full" });
    own(full, "b", 39);
    P(full, "a").position = 33;
    rollAs(full, "a", [2, 4]);
    expect(P(full, "a").cash).toBe(1450);
  });

  it("le stade d'un coéquipier ne fait pas payer de billet quand le loyer est gratuit", () => {
    const s = game();
    own(s, "b", 1);
    own(s, "c", 3);
    s.deeds[1]!.special = { kind: "stade", by: "b" };
    s.deeds[3]!.special = { kind: "stade", by: "c" };
    P(s, "a").position = 0;
    rollAs(s, "a", [2, 3]);
    // Le stade adverse fait payer, pas celui du coéquipier
    expect(P(s, "c").cash).toBe(1500 + STADIUM_TICKET);
    expect(P(s, "b").cash).toBe(1500);
  });

  it("pas de nuisance chez un coéquipier", () => {
    const s = game();
    own(s, "b", 39);
    own(s, "c", 37);
    expect(canPlaceSpecial(s, "a", 39, "decharge")).toBe("Pas de nuisance chez un coéquipier.");
    expect(canPlaceSpecial(s, "a", 37, "decharge")).toBeNull();
  });

  it("on donne de l'argent, des titres et une carte de prison à son coéquipier, sans contrepartie", () => {
    const s = game();
    own(s, "a", 1, 3);
    P(s, "a").jailCards = ["hasard"];
    // Pas pendant son tour seulement : à tout moment
    s.turn = 2;
    const events = act(s, "a", gift("b", 300, [1], 1));
    expect(events[0]).toEqual({ type: "gift", from: "a", to: "b", give: { cash: 300, squares: [1], jailCards: 1 } });
    expect(P(s, "a").cash).toBe(1200);
    expect(P(s, "b").cash).toBe(1800);
    expect(s.deeds[1]!.owner).toBe("b");
    expect(P(s, "b").jailCards).toEqual(["hasard"]);
  });

  it("un don qui couvre la dette d'un coéquipier la règle aussitôt", () => {
    const s = game();
    own(s, "c", 39);
    s.deeds[39]!.level = 3;
    Object.assign(P(s, "b"), { position: 33, cash: 100 });
    rollAs(s, "b", [2, 4]);
    expect(s.step).toBe("debt");
    expect(s.debts[0]).toMatchObject({ debtor: "b", amount: 1400 });
    act(s, "a", gift("b", 1300));
    expect(s.debts).toHaveLength(0);
    expect(P(s, "b").cash).toBe(0);
    expect(P(s, "c").cash).toBe(1500 + 1400);
    expect(s.step).toBe("manage");
  });

  it("les dons ont leurs limites", () => {
    const s = game();
    own(s, "a", 1);
    expect(fails(s, "a", gift("c", 100))).toBe("On ne donne qu'à un coéquipier encore en jeu.");
    expect(fails(s, "a", gift("a", 100))).toBe("On ne donne qu'à un coéquipier encore en jeu.");
    expect(fails(s, "a", gift("b"))).toBe("Le don est vide.");
    expect(fails(s, "a", gift("b", 5000))).toBe("5000 demandés, mais il n'y a que 1500 en caisse.");
    s.deeds[1]!.level = 1;
    expect(fails(s, "a", gift("b", 0, [1]))).toMatch(/revendre ses niveaux/);
    // Pas pendant une enchère, ni avec une dette à soi
    s.auction = { square: 3, high: null, out: [], bids: 0 };
    s.step = "auction";
    expect(fails(s, "a", gift("b", 100))).toBe("Pas de don pendant une enchère.");
    closeAuction(s);
    s.debts = [{ debtor: "a", creditor: "bank", amount: 2000, reason: "tax" }];
    s.step = "debt";
    expect(fails(s, "a", gift("b", 100))).toBe("Règle d'abord ta dette.");
    // Le réglage coupé, ou chacun pour soi
    const off = game(undefined, { teamGifts: false });
    expect(fails(off, "a", gift("b", 100))).toBe("Les dons entre coéquipiers ne sont pas de la partie.");
    const { state: alone } = createGame(["a", "b"], DEFAULT_SETTINGS, 3);
    expect(applyAction(alone, "a", gift("b", 100)).ok).toBe(false);
  });

  it("un titre hypothéqué donné coûte 10 % d'intérêts au coéquipier qui le reçoit", () => {
    const s = game();
    own(s, "a", 39);
    s.deeds[39]!.mortgaged = true;
    act(s, "a", gift("b", 0, [39]));
    expect(P(s, "b").cash).toBe(1500 - mortgageInterest(39));
    P(s, "b").cash = 10;
    own(s, "b", 37);
    s.deeds[37]!.mortgaged = true;
    own(s, "a", 37);
    expect(fails(s, "a", gift("b", 0, [37]))).toMatch(/intérêts/);
    // De quoi les payer avec l'argent donné en même temps
    expect(fails(s, "a", gift("b", 20, [37]))).toBeNull();
  });

  it("héritage : le coéquipier reprend les titres, le créancier adverse ne touche que l'argent", () => {
    const s = game();
    own(s, "c", 39);
    s.deeds[39]!.level = 5;
    own(s, "b", 1, 3, 5);
    s.deeds[1]!.level = 2;
    P(s, "b").jailCards = ["courrier"];
    Object.assign(P(s, "b"), { position: 33, cash: 100 });
    rollAs(s, "b", [2, 4]);
    const events = act(s, "b", { type: "bankrupt" });
    expect(events).toContainEqual({ type: "bankrupt", player: "b", to: "a", heir: true });
    expect([1, 3, 5].map((i) => s.deeds[i]!.owner)).toEqual(["a", "a", "a"]);
    // Les niveaux sont revendus à la banque (+50), l'argent part chez le créancier
    expect(s.deeds[1]!.level).toBe(0);
    expect(P(s, "c").cash).toBe(1500 + 150);
    expect(P(s, "c").stats.bankrupted).toBe(1);
    expect(P(s, "a").jailCards).toEqual(["courrier"]);
    expect(s.step).not.toBe("over");
  });

  it("sans héritage, le créancier prend tout comme d'habitude", () => {
    const s = game(undefined, { teamHeir: false });
    own(s, "c", 39);
    s.deeds[39]!.level = 5;
    own(s, "b", 3);
    Object.assign(P(s, "b"), { position: 33, cash: 100 });
    rollAs(s, "b", [2, 4]);
    act(s, "b", { type: "bankrupt" });
    expect(s.deeds[3]!.owner).toBe("c");
  });

  it("victoire d'équipe à l'heure : les fortunes s'additionnent, toute l'équipe gagne", () => {
    const s = game();
    // c est le plus riche, mais a et b ensemble le sont plus que c et d
    Object.assign(P(s, "a"), { cash: 1400 });
    Object.assign(P(s, "b"), { cash: 1400 });
    Object.assign(P(s, "c"), { cash: 2000 });
    Object.assign(P(s, "d"), { cash: 300 });
    timeUp(s);
    P(s, "a").position = 6;
    rollAs(s, "a", [1, 3]);
    act(s, "a", { type: "endTurn" });
    expect(s.step).toBe("over");
    expect(s.ranks).toEqual({ a: 1, b: 1, c: 3, d: 3 });
    expect(s.ranking!.slice(0, 2).sort()).toEqual(["a", "b"]);
    expect(s.outcome).toMatchObject({ reason: "time", team: 0, teamWorth: { 0: 2800, 1: 2300 } });
  });

  it("sans victoire d'équipe, chacun garde son classement", () => {
    const s = game(undefined, { teamWin: false });
    Object.assign(P(s, "c"), { cash: 2000 });
    Object.assign(P(s, "d"), { cash: 300 });
    timeUp(s);
    P(s, "a").position = 6;
    rollAs(s, "a", [1, 3]);
    act(s, "a", { type: "endTurn" });
    expect(s.ranking![0]).toBe("c");
    expect(s.ranks!.c).toBe(1);
    expect(s.ranks!.d).toBe(4);
  });

  it("à trois équipes : rangs 1, 3 et 5, et la partie s'arrête quand une seule reste en jeu", () => {
    const s = game({ a: 0, b: 0, c: 1, d: 1, e: 2, f: 2 });
    for (const id of ["c", "d"]) {
      P(s, id).bankrupt = true;
      s.eliminated.push(id);
    }
    own(s, "a", 39);
    s.deeds[39]!.level = 5;
    Object.assign(P(s, "e"), { position: 33, cash: 10 });
    Object.assign(P(s, "f"), { cash: 5000 });
    rollAs(s, "e", [2, 4]);
    act(s, "e", { type: "bankrupt" });
    // Il reste deux équipes en jeu (a et b, puis f) : la partie continue
    expect(s.step).not.toBe("over");
    Object.assign(P(s, "f"), { position: 33, cash: 10 });
    rollAs(s, "f", [2, 4]);
    act(s, "f", { type: "bankrupt" });
    expect(s.step).toBe("over");
    expect(s.ranks).toEqual({ a: 1, b: 1, e: 3, f: 3, c: 5, d: 5 });
    expect(s.outcome).toMatchObject({ reason: "bankrupt", team: 0 });
  });

  it("une partie commencée avant les règles d'équipe garde l'ancienne règle (loyer plein, pas de don)", () => {
    const s = game();
    const old = s.settings as Partial<CapitaleSettings>;
    delete old.teamRent;
    delete old.teamGifts;
    delete old.teamHeir;
    delete old.teamWin;
    own(s, "b", 39);
    P(s, "a").position = 33;
    rollAs(s, "a", [2, 4]);
    expect(P(s, "a").cash).toBe(1450);
    expect(fails(s, "a", gift("b", 10))).toBe("Les dons entre coéquipiers ne sont pas de la partie.");
  });
});
