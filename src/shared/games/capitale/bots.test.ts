import { describe, expect, it } from "vitest";
import { GROUPS, SPECIALS } from "./board.ts";
import { botAction, botAnswer, botBid, botRescue, giftMove } from "./bot.ts";
import {
  actorOf,
  allies,
  applyAction,
  auctionBidders,
  closeAuction,
  createGame,
  DEFAULT_SETTINGS,
  teammates,
  type BotLevel,
  type CapitaleAction,
  type CapitaleSettings,
  type CapitaleState,
  type Trade,
} from "./engine.ts";

// Les bots en équipes et au Monopole : ils jouent pour leur camp, visent la victoire et la bloquent.

function game(teams: Record<string, number> | null, settings: Partial<CapitaleSettings> = {}, n = 4): CapitaleState {
  const ids = ["a", "b", "c", "d", "e", "f"].slice(0, teams ? Object.keys(teams).length : n);
  const { state } = createGame(ids, { ...DEFAULT_SETTINGS, end: "bankrupt", ...settings }, 5, teams);
  state.turn = 0;
  return state;
}
const TEAMS = { a: 0, b: 0, c: 1, d: 1 };
const own = (s: CapitaleState, id: string, ...squares: number[]) => squares.forEach((i) => (s.deeds[i]!.owner = id));
const P = (s: CapitaleState, id: string) => s.players.find((p) => p.id === id)!;
function act(s: CapitaleState, id: string, action: CapitaleAction) {
  const r = applyAction(s, id, action);
  if (!r.ok) throw new Error(r.error);
  return r.events;
}
const manageStep = (s: CapitaleState, id: string) => {
  s.turn = s.players.findIndex((p) => p.id === id);
  s.step = "manage";
  s.dice = [2, 3];
  s.turnId += 1;
};
const trade = (from: string, to: string, give: Partial<Trade["give"]>, get: Partial<Trade["get"]>): Trade => ({
  id: 99,
  from,
  to,
  give: { cash: 0, squares: [], jailCards: 0, ...give },
  get: { cash: 0, squares: [], jailCards: 0, ...get },
});

describe("les bots en équipes", () => {
  it("posent leurs nuisances chez un adversaire, jamais chez un coéquipier", () => {
    const s = game(TEAMS);
    own(s, "b", 39);
    s.deeds[39]!.level = 3;
    own(s, "c", 37);
    s.deeds[37]!.level = 1;
    manageStep(s, "a");
    P(s, "a").cash = 3000;
    const a = botAction(s, "a", "fort");
    expect(a).toMatchObject({ type: "special", square: 37 });
    expect(SPECIALS[(a as { kind: keyof typeof SPECIALS }).kind].nuisance).toBe(true);
  });

  it("ne surenchérissent pas sur un coéquipier", () => {
    const s = game(TEAMS);
    s.auction = { square: 39, high: { player: "b", amount: 100 }, out: [], bids: 1 };
    s.step = "auction";
    expect(botBid(s, "a", "fort")).toEqual({ type: "pass" });
    expect(botBid(s, "c", "fort")?.type).toBe("bid");
  });

  it("donnent à un coéquipier le titre qui complète son quartier, et leurs gares à celui qui en a le plus", () => {
    const s = game(TEAMS);
    own(s, "a", 39);
    own(s, "b", 37);
    expect(giftMove(s, "a")).toEqual({ type: "gift", to: "b", give: { cash: 0, squares: [39], jailCards: 0 } });
    // Seulement s'il le permet ; et pas à un adversaire
    expect(botAction((manageStep(s, "a"), s), "a", "moyen", { allowGift: false })?.type).not.toBe("gift");
    const t = game(TEAMS);
    own(t, "a", 5);
    own(t, "b", 15, 25);
    own(t, "c", 37);
    own(t, "a", 39);
    expect(giftMove(t, "a")).toEqual({ type: "gift", to: "b", give: { cash: 0, squares: [5], jailCards: 0 } });
    expect(giftMove(t, "b")).toBeNull();
    const off = game(TEAMS, { teamGifts: false });
    own(off, "a", 39);
    own(off, "b", 37);
    expect(giftMove(off, "a")).toBeNull();
  });

  it("donnent à un coéquipier en dette ce qui lui manque", () => {
    const s = game(TEAMS);
    own(s, "c", 39);
    s.deeds[39]!.level = 2;
    s.turn = 1;
    Object.assign(P(s, "b"), { position: 33, cash: 100 });
    s.rigged = [[2, 4]];
    act(s, "b", { type: "roll" });
    expect(s.step).toBe("debt");
    const help = botRescue(s, "a", "moyen");
    expect(help).toEqual({ type: "gift", to: "b", give: { cash: 500, squares: [], jailCards: 0 } });
    act(s, "a", help!);
    expect(s.step).toBe("manage");
    // Un adversaire n'aide pas
    expect(botRescue(s, "c", "moyen")).toBeNull();
  });

  it("acceptent ce que demande un coéquipier, sauf un titre d'un quartier qu'ils ont en entier", () => {
    const s = game(TEAMS);
    own(s, "a", 39, 1, 3);
    expect(botAnswer(s, "a", trade("b", "a", {}, { squares: [39] }), "fort").type).toBe("accept");
    expect(botAnswer(s, "a", trade("b", "a", {}, { squares: [1] }), "fort").type).toBe("reject");
    // Un adversaire n'obtient rien pour rien
    expect(botAnswer(s, "a", trade("c", "a", {}, { squares: [39] }), "facile").type).toBe("reject");
  });
});

describe("les bots au Monopole", () => {
  it("achètent le titre qui fait gagner leur camp, en hypothéquant s'il le faut", () => {
    const s = game(null, { monopoly: true }, 3);
    own(s, "a", 5, 15, 25, 1);
    s.turn = 0;
    Object.assign(P(s, "a"), { position: 32, cash: 120 });
    s.rigged = [[1, 2]];
    act(s, "a", { type: "roll" });
    expect(s.pendingBuy).toBe(35);
    // Facile aussi : 120 ne suffisent pas, il hypothèque d'abord (Guéret, puis une gare)
    let next = botAction(s, "a", "facile")!;
    const mortgaged: number[] = [];
    while (next.type === "mortgage" && mortgaged.length < 5) {
      mortgaged.push(next.square);
      act(s, "a", next);
      next = botAction(s, "a", "facile")!;
    }
    expect(mortgaged[0]).toBe(1);
    expect(mortgaged.length).toBe(2);
    expect(next).toEqual({ type: "buy" });
    act(s, "a", { type: "buy" });
    expect(s.step).toBe("over");
  });

  it("achètent ou enchérissent jusqu'au bout pour bloquer un adversaire", () => {
    const s = game(null, { monopoly: true }, 3);
    own(s, "b", 5, 15, 25);
    s.turn = 0;
    Object.assign(P(s, "a"), { position: 32, cash: 260 });
    s.rigged = [[1, 2]];
    act(s, "a", { type: "roll" });
    expect(botAction(s, "a", "moyen")).toEqual({ type: "buy" });
    act(s, "a", { type: "decline" });
    act(s, "b", { type: "bid", amount: 200 });
    expect(botBid(s, "a", "moyen")).toEqual({ type: "bid", amount: 220 });
    expect(botBid(s, "c", "fort")).toEqual({ type: "bid", amount: 220 });
  });

  it("refusent tout échange qui ferait gagner un adversaire, et proposent celui qui les ferait gagner", () => {
    const s = game(null, { monopoly: true }, 3);
    own(s, "b", 5, 15, 25);
    own(s, "a", 35);
    expect(botAnswer(s, "a", trade("b", "a", { cash: 1400 }, { squares: [35] }), "facile").type).toBe("reject");
    // Le bot b demande TGV Nord, en payant bien
    manageStep(s, "b");
    const offer = botAction(s, "b", "moyen", { allowTrade: true });
    expect(offer).toMatchObject({ type: "propose", to: "a", get: { squares: [35] } });
    expect((offer as { give: { cash: number } }).give.cash).toBeGreaterThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------
// Des parties entières entre bots, en équipes et au Monopole
// ---------------------------------------------------------------------------

function simulate(levels: BotLevel[], teams: Record<string, number> | null, seed: number, settings: Partial<CapitaleSettings> = {}) {
  const ids = levels.map((_, i) => `p${i}`);
  const { state: s } = createGame(ids, { ...DEFAULT_SETTINGS, end: "bankrupt", ...settings }, seed, teams);
  const level = (id: string) => levels[ids.indexOf(id)]!;
  let tradedTurn = -1;
  let gifts = 0;
  let rescues = 0;
  for (let guard = 0; guard < 80_000 && s.step !== "over"; guard++) {
    const t = s.trades[0];
    if (t && s.step !== "auction") {
      const r = applyAction(s, t.to, botAnswer(s, t.to, t, level(t.to)));
      if (!r.ok) throw new Error(`réponse : ${r.error}`);
      continue;
    }
    if (s.step === "auction") {
      let acted = false;
      for (const id of auctionBidders(s)) {
        const a = botBid(s, id, level(id));
        if (!a) continue;
        const r = applyAction(s, id, a);
        if (!r.ok) throw new Error(`enchère : ${r.error}`);
        acted = true;
        if (!s.auction) break;
      }
      if (!acted && s.auction) closeAuction(s);
      continue;
    }
    const actor = actorOf(s)!;
    // Une dette : les coéquipiers aident d'abord, comme le fait la salle
    if (s.step === "debt") {
      const help = teammates(s, actor)
        .map((m) => botRescue(s, m.id, level(m.id)))
        .find(Boolean);
      if (help) {
        const helper = teammates(s, actor).find((m) => botRescue(s, m.id, level(m.id)) !== null)!;
        const r = applyAction(s, helper.id, help);
        if (!r.ok) throw new Error(`aide : ${r.error}`);
        rescues += 1;
        continue;
      }
    }
    const a = botAction(s, actor, level(actor), { allowTrade: s.turnId !== tradedTurn, allowGift: true });
    if (!a) throw new Error(`aucun coup pour ${actor} à l'étape ${s.step}`);
    if (a.type === "propose") tradedTurn = s.turnId;
    if (a.type === "gift") gifts += 1;
    const r = applyAction(s, actor, a);
    if (!r.ok) throw new Error(`${a.type} à l'étape ${s.step} : ${r.error}`);
    // Jamais de nuisance chez un coéquipier, et personne en dessous de zéro
    for (const g of Object.values(GROUPS)) {
      for (const i of g.squares) {
        const sp = s.deeds[i]!.special;
        const owner = s.deeds[i]!.owner;
        if (sp && SPECIALS[sp.kind].nuisance && owner) expect(allies(s, sp.by, owner)).toBe(false);
      }
    }
    for (const p of s.players) expect(p.cash).toBeGreaterThanOrEqual(0);
  }
  return { s, gifts, rescues };
}

describe("parties entières entre bots", () => {
  it("en équipes (2 contre 2, 3 contre 3, trois équipes de deux), elles vont au bout sans coup refusé", () => {
    const setups: { levels: BotLevel[]; teams: Record<string, number> }[] = [
      { levels: ["moyen", "fort", "facile", "moyen"], teams: { p0: 0, p1: 1, p2: 0, p3: 1 } },
      { levels: ["fort", "fort", "fort", "fort", "fort", "fort"], teams: { p0: 0, p1: 1, p2: 0, p3: 1, p4: 0, p5: 1 } },
      { levels: ["moyen", "moyen", "moyen", "fort", "facile", "fort"], teams: { p0: 0, p1: 1, p2: 2, p3: 0, p4: 1, p5: 2 } },
    ];
    let seed = 40;
    let gifts = 0;
    let rescues = 0;
    for (const { levels, teams } of setups) {
      for (let k = 0; k < 3; k++) {
        const out = simulate(levels, teams, seed++, k === 1 ? { teamRent: "half", quickStart: true } : k === 2 ? { teamHeir: false } : {});
        expect(out.s.step).toBe("over");
        expect(out.s.outcome?.team).not.toBeUndefined();
        // Toute l'équipe gagnante partage la première place
        const winners = out.s.players.filter((p) => out.s.ranks![p.id] === 1);
        expect(new Set(winners.map((p) => teams[p.id])).size).toBe(1);
        gifts += out.gifts;
        rescues += out.rescues;
      }
    }
    expect(gifts).toBeGreaterThan(0);
    expect(rescues).toBeGreaterThan(0);
  }, 120_000);

  it("au Monopole, les parties vont au bout, souvent par une victoire Monopole, seul ou en équipe", () => {
    let monopolies = 0;
    let games = 0;
    for (let seed = 200; seed < 216; seed++) {
      const teams = seed % 2 ? { p0: 0, p1: 1, p2: 0, p3: 1 } : null;
      const levels: BotLevel[] = seed % 4 < 2 ? ["fort", "moyen", "moyen", "fort"] : ["facile", "fort", "moyen", "facile"];
      const { s } = simulate(levels, teams, seed, { monopoly: true });
      expect(s.step).toBe("over");
      games += 1;
      if (s.outcome?.reason === "monopoly") monopolies += 1;
    }
    // Les bots bloquent aussi : environ une partie sur deux s'arrête au Monopole, les autres par faillite
    expect(monopolies).toBeGreaterThanOrEqual(games / 3);
    expect(monopolies).toBeLessThan(games);
  }, 120_000);
});
