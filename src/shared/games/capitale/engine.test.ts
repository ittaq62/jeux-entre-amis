import { describe, expect, it } from "vitest";
import { BANK_HOTELS, BANK_HOUSES, BUYABLE, DECKS, GROUPS, SQUARES } from "./board.ts";
import { botAction, botAnswer, botBid } from "./bot.ts";
import {
  actorOf,
  applyAction,
  auctionBidders,
  closeAuction,
  createGame,
  DEFAULT_SETTINGS,
  netWorth,
  rentFor,
  timeUp,
  type BotLevel,
  type CapitaleAction,
  type CapitaleSettings,
  type CapitaleState,
} from "./engine.ts";

const IDS = ["a", "b", "c", "d", "e", "f"];

function game(n = 2, settings: Partial<CapitaleSettings> = {}, seed = 1): CapitaleState {
  const { state } = createGame(IDS.slice(0, n), { ...DEFAULT_SETTINGS, end: "bankrupt", ...settings }, seed);
  state.turn = 0;
  return state;
}

function act(s: CapitaleState, id: string, action: CapitaleAction) {
  const r = applyAction(s, id, action);
  if (!r.ok) throw new Error(r.error);
  return r.events;
}

const rollAs = (s: CapitaleState, id: string, dice: [number, number]) => {
  s.rigged = [dice];
  return act(s, id, { type: "roll" });
};
const own = (s: CapitaleState, id: string, ...squares: number[]) => squares.forEach((i) => (s.deeds[i]!.owner = id));
const P = (s: CapitaleState, id: string) => s.players.find((p) => p.id === id)!;
/** Les autres joueurs hors jeu : le même joueur enchaîne ses tours */
const alone = (s: CapitaleState) => s.players.slice(1).forEach((p) => (p.bankrupt = true));
const cardIndex = (deck: "hasard" | "courrier", start: string) => DECKS[deck].findIndex((c) => c.text.startsWith(start));

describe("plateau", () => {
  it("a 40 cases, 28 titres, 8 groupes et deux paquets de 16 cartes", () => {
    expect(SQUARES).toHaveLength(40);
    expect(SQUARES.every((s, i) => s.index === i)).toBe(true);
    expect(BUYABLE).toHaveLength(28);
    expect(
      Object.values(GROUPS)
        .flatMap((g) => g.squares)
        .sort((x, y) => x - y),
    ).toEqual(SQUARES.filter((s) => s.kind === "property").map((s) => s.index));
    expect(DECKS.hasard).toHaveLength(16);
    expect(DECKS.courrier).toHaveLength(16);
    expect(SQUARES[39]!.name).toBe("Paris");
  });
});

describe("tour de jeu", () => {
  it("on avance et on touche 200 en passant par Départ, puis on peut acheter", () => {
    const s = game();
    P(s, "a").position = 36;
    rollAs(s, "a", [2, 3]);
    expect(P(s, "a").position).toBe(1);
    expect(P(s, "a").cash).toBe(1700);
    expect(s.step).toBe("buy");
    act(s, "a", { type: "buy" });
    expect(s.deeds[1]!.owner).toBe("a");
    expect(P(s, "a").cash).toBe(1640);
    expect(s.step).toBe("manage");
    act(s, "a", { type: "endTurn" });
    expect(s.players[s.turn]!.id).toBe("b");
  });

  it("le double salaire en tombant pile sur Départ (règle maison)", () => {
    const s = game(2, { doubleGo: true });
    P(s, "a").position = 33;
    rollAs(s, "a", [3, 4]);
    expect(P(s, "a").position).toBe(0);
    expect(P(s, "a").cash).toBe(1900);
  });

  it("un double fait rejouer, trois doubles envoient en prison", () => {
    const s = game();
    own(s, "a", ...BUYABLE);
    P(s, "a").position = 10;
    rollAs(s, "a", [1, 1]);
    expect(s.step).toBe("roll");
    rollAs(s, "a", [2, 2]);
    expect(s.step).toBe("roll");
    rollAs(s, "a", [3, 3]);
    expect(P(s, "a").inJail).toBe(true);
    expect(P(s, "a").position).toBe(10);
    expect(s.step).toBe("manage");
  });

  it("en prison : trois essais, puis on paie 50 et on avance", () => {
    const s = game();
    alone(s);
    Object.assign(P(s, "a"), { position: 10, inJail: true });
    rollAs(s, "a", [1, 2]);
    act(s, "a", { type: "endTurn" });
    rollAs(s, "a", [1, 3]);
    act(s, "a", { type: "endTurn" });
    expect(P(s, "a").inJail).toBe(true);
    rollAs(s, "a", [2, 3]);
    expect(P(s, "a").inJail).toBe(false);
    expect(P(s, "a").position).toBe(15);
    expect(P(s, "a").cash).toBe(1450);
  });

  it("un double en prison libère, sans rejouer", () => {
    const s = game();
    Object.assign(P(s, "a"), { position: 10, inJail: true });
    rollAs(s, "a", [4, 4]);
    expect(P(s, "a").inJail).toBe(false);
    expect(P(s, "a").position).toBe(18);
    expect(s.rollAgain).toBe(false);
  });

  it("on sort de prison en payant ou avec une carte, qui retourne dans son paquet", () => {
    const s = game();
    Object.assign(P(s, "a"), { position: 10, inJail: true });
    act(s, "a", { type: "payJail" });
    expect(P(s, "a").cash).toBe(1450);
    expect(s.step).toBe("roll");
    const t = game();
    const jailCard = DECKS.hasard.findIndex((c) => c.effect.kind === "jailFree");
    t.decks.hasard = t.decks.hasard.filter((i) => i !== jailCard);
    Object.assign(P(t, "a"), { position: 10, inJail: true, jailCards: ["hasard"] });
    act(t, "a", { type: "useJailCard" });
    expect(P(t, "a").inJail).toBe(false);
    expect(t.decks.hasard).toHaveLength(16);
  });

  it("refuser d'acheter lance une enchère : le plus offrant l'emporte", () => {
    const s = game(3);
    P(s, "a").position = 36;
    rollAs(s, "a", [2, 3]);
    act(s, "a", { type: "decline" });
    expect(s.step).toBe("auction");
    act(s, "b", { type: "bid", amount: 50 });
    act(s, "c", { type: "bid", amount: 70 });
    expect(applyAction(s, "b", { type: "bid", amount: 70 }).ok).toBe(false);
    act(s, "a", { type: "pass" });
    act(s, "b", { type: "pass" });
    expect(s.deeds[1]!.owner).toBe("c");
    expect(P(s, "c").cash).toBe(1430);
    expect(s.step).toBe("manage");
  });

  it("une enchère sans offre laisse le titre à la banque ; le chrono clôt l'enchère", () => {
    const s = game(2);
    P(s, "a").position = 36;
    rollAs(s, "a", [2, 3]);
    act(s, "a", { type: "decline" });
    act(s, "a", { type: "pass" });
    act(s, "b", { type: "pass" });
    expect(s.deeds[1]!.owner).toBeNull();
    const t = game(2);
    P(t, "a").position = 36;
    rollAs(t, "a", [2, 3]);
    act(t, "a", { type: "decline" });
    act(t, "b", { type: "bid", amount: 20 });
    closeAuction(t);
    expect(t.deeds[1]!.owner).toBe("b");
  });
});

describe("loyers", () => {
  it("terrain nu, doublé avec tout le groupe, puis maisons et hôtel", () => {
    const s = game();
    own(s, "b", 37);
    expect(rentFor(s, 37, { diceTotal: 7 })).toBe(35);
    own(s, "b", 39);
    expect(rentFor(s, 37, { diceTotal: 7 })).toBe(70);
    s.deeds[37]!.houses = 3;
    expect(rentFor(s, 37, { diceTotal: 7 })).toBe(1100);
    s.deeds[39]!.houses = 5;
    expect(rentFor(s, 39, { diceTotal: 7 })).toBe(2000);
    s.deeds[37]!.mortgaged = true;
    expect(rentFor(s, 37, { diceTotal: 7 })).toBe(0);
  });

  it("les gares selon leur nombre, les réseaux selon les dés", () => {
    const s = game();
    own(s, "b", 5);
    expect(rentFor(s, 5, { diceTotal: 7 })).toBe(25);
    own(s, "b", 15, 25, 35);
    expect(rentFor(s, 5, { diceTotal: 7 })).toBe(200);
    own(s, "b", 12);
    expect(rentFor(s, 12, { diceTotal: 7 })).toBe(28);
    own(s, "b", 28);
    expect(rentFor(s, 12, { diceTotal: 7 })).toBe(70);
  });

  it("pas de loyer pour un propriétaire en prison (règle maison)", () => {
    const s = game(2, { noRentInJail: true });
    own(s, "b", 1);
    P(s, "b").inJail = true;
    expect(rentFor(s, 1, { diceTotal: 7 })).toBe(0);
  });

  it("tomber chez un autre joueur fait payer le loyer", () => {
    const s = game();
    own(s, "b", 37, 39);
    s.deeds[39]!.houses = 1;
    P(s, "a").position = 33;
    rollAs(s, "a", [2, 4]);
    expect(P(s, "a").cash).toBe(1300);
    expect(P(s, "b").cash).toBe(1700);
    expect(P(s, "b").stats.rentEarned).toBe(200);
  });
});

describe("constructions et hypothèques", () => {
  it("il faut tout le groupe, et on construit de façon égale", () => {
    const s = game();
    own(s, "a", 1);
    expect(applyAction(s, "a", { type: "build", square: 1 }).ok).toBe(false);
    own(s, "a", 3);
    act(s, "a", { type: "build", square: 1 });
    expect(applyAction(s, "a", { type: "build", square: 1 }).ok).toBe(false);
    act(s, "a", { type: "build", square: 3 });
    act(s, "a", { type: "build", square: 1 });
    expect(s.deeds[1]!.houses).toBe(2);
    expect(s.bankHouses).toBe(BANK_HOUSES - 3);
    expect(P(s, "a").cash).toBe(1350);
  });

  it("l'hôtel rend quatre maisons à la banque ; la banque peut manquer de maisons", () => {
    const s = game();
    own(s, "a", 1, 3);
    s.deeds[1]!.houses = 4;
    s.deeds[3]!.houses = 4;
    s.bankHouses = BANK_HOUSES - 8;
    act(s, "a", { type: "build", square: 1 });
    expect(s.deeds[1]!.houses).toBe(5);
    expect(s.bankHotels).toBe(BANK_HOTELS - 1);
    expect(s.bankHouses).toBe(BANK_HOUSES - 4);
    const t = game();
    own(t, "a", 1, 3);
    t.bankHouses = 0;
    expect(applyAction(t, "a", { type: "build", square: 1 }).ok).toBe(false);
  });

  it("on vend de façon égale, à moitié prix", () => {
    const s = game();
    own(s, "a", 1, 3);
    s.deeds[1]!.houses = 2;
    s.deeds[3]!.houses = 1;
    s.bankHouses -= 3;
    expect(applyAction(s, "a", { type: "sell", square: 3 }).ok).toBe(false);
    act(s, "a", { type: "sell", square: 1 });
    expect(P(s, "a").cash).toBe(1525);
    expect(s.deeds[1]!.houses).toBe(1);
  });

  it("on n'hypothèque pas un groupe bâti ; on lève l'hypothèque à +10 %", () => {
    const s = game();
    own(s, "a", 1, 3);
    s.deeds[3]!.houses = 1;
    expect(applyAction(s, "a", { type: "mortgage", square: 1 }).ok).toBe(false);
    s.deeds[3]!.houses = 0;
    act(s, "a", { type: "mortgage", square: 1 });
    expect(P(s, "a").cash).toBe(1530);
    expect(applyAction(s, "a", { type: "build", square: 3 }).ok).toBe(false);
    act(s, "a", { type: "unmortgage", square: 1 });
    expect(P(s, "a").cash).toBe(1497);
  });

  it("on ne construit pas pendant le tour d'un autre", () => {
    const s = game();
    own(s, "b", 1, 3);
    expect(applyAction(s, "b", { type: "build", square: 1 }).ok).toBe(false);
  });
});

describe("dettes et faillite", () => {
  it("une dette se paie dès qu'on a hypothéqué de quoi la couvrir", () => {
    const s = game();
    own(s, "b", 37, 39);
    s.deeds[39]!.houses = 1;
    own(s, "a", 6);
    Object.assign(P(s, "a"), { position: 33, cash: 180 });
    rollAs(s, "a", [2, 4]);
    expect(s.step).toBe("debt");
    expect(actorOf(s)).toBe("a");
    expect(applyAction(s, "a", { type: "endTurn" }).ok).toBe(false);
    act(s, "a", { type: "mortgage", square: 6 });
    expect(s.step).toBe("manage");
    expect(P(s, "a").cash).toBe(30);
    expect(P(s, "b").cash).toBe(1700);
  });

  it("la faillite envers un joueur lui donne tout ; la partie s'arrête au dernier", () => {
    const s = game();
    own(s, "b", 37, 39);
    s.deeds[39]!.houses = 1;
    own(s, "a", 1, 6);
    Object.assign(P(s, "a"), { position: 33, cash: 100 });
    rollAs(s, "a", [2, 4]);
    act(s, "a", { type: "mortgage", square: 1 });
    act(s, "a", { type: "bankrupt" });
    expect(P(s, "a").bankrupt).toBe(true);
    expect(s.deeds[1]!.owner).toBe("b");
    expect(s.deeds[1]!.mortgaged).toBe(true);
    expect(s.deeds[6]!.owner).toBe("b");
    expect(P(s, "b").cash).toBe(1630);
    expect(s.step).toBe("over");
    expect(s.ranking).toEqual(["b", "a"]);
  });

  it("la faillite envers la banque rend les titres libres", () => {
    const s = game(3);
    own(s, "a", 1, 3);
    s.deeds[1]!.houses = 1;
    Object.assign(P(s, "a"), { position: 0, cash: 10 });
    rollAs(s, "a", [1, 3]);
    expect(s.step).toBe("debt");
    act(s, "a", { type: "bankrupt" });
    expect(s.deeds[1]!.owner).toBeNull();
    expect(s.deeds[1]!.houses).toBe(0);
    expect(s.step).toBe("roll");
    expect(s.players[s.turn]!.id).toBe("b");
  });
});

describe("échanges", () => {
  it("un échange de titres contre de l'argent, avec les intérêts d'un titre hypothéqué", () => {
    const s = game();
    own(s, "a", 1);
    s.deeds[1]!.mortgaged = true;
    act(s, "a", { type: "propose", to: "b", give: { cash: 0, squares: [1], jailCards: 0 }, get: { cash: 100, squares: [], jailCards: 0 } });
    const t = s.trades[0]!;
    act(s, "b", { type: "accept", trade: t.id });
    expect(s.deeds[1]!.owner).toBe("b");
    expect(P(s, "a").cash).toBe(1600);
    expect(P(s, "b").cash).toBe(1400 - 3);
    expect(P(s, "a").stats.trades).toBe(1);
  });

  it("pas d'échange d'un terrain dont le groupe est bâti", () => {
    const s = game();
    own(s, "a", 1, 3);
    s.deeds[3]!.houses = 1;
    expect(
      applyAction(s, "a", {
        type: "propose",
        to: "b",
        give: { cash: 0, squares: [1], jailCards: 0 },
        get: { cash: 50, squares: [], jailCards: 0 },
      }).ok,
    ).toBe(false);
  });

  it("une contre-proposition remplace l'offre reçue ; une seule offre à la fois par joueur", () => {
    const s = game(3);
    own(s, "a", 1);
    own(s, "b", 3);
    act(s, "a", { type: "propose", to: "b", give: { cash: 50, squares: [], jailCards: 0 }, get: { cash: 0, squares: [3], jailCards: 0 } });
    const first = s.trades[0]!;
    act(s, "b", {
      type: "propose",
      to: "a",
      give: { cash: 0, squares: [3], jailCards: 0 },
      get: { cash: 150, squares: [], jailCards: 0 },
      replaces: first.id,
    });
    expect(s.trades.map((t) => t.from)).toEqual(["b"]);
    act(s, "a", { type: "propose", to: "c", give: { cash: 10, squares: [], jailCards: 0 }, get: { cash: 0, squares: [], jailCards: 0 } });
    act(s, "a", { type: "propose", to: "c", give: { cash: 20, squares: [], jailCards: 0 }, get: { cash: 0, squares: [], jailCards: 0 } });
    expect(s.trades.filter((t) => t.from === "a")).toHaveLength(1);
  });
});

describe("cartes", () => {
  it("reculer de 3 cases peut mener aux impôts", () => {
    const s = game();
    s.decks.hasard = [
      cardIndex("hasard", "Vous avez oublié"),
      ...s.decks.hasard.filter((i) => i !== cardIndex("hasard", "Vous avez oublié")),
    ];
    rollAs(s, "a", [3, 4]);
    expect(P(s, "a").position).toBe(4);
    expect(P(s, "a").cash).toBe(1300);
  });

  it("l'anniversaire fait payer chaque joueur", () => {
    const s = game(3);
    const i = cardIndex("courrier", "C'est votre anniversaire");
    s.decks.courrier = [i, ...s.decks.courrier.filter((x) => x !== i)];
    rollAs(s, "a", [1, 1]);
    expect(P(s, "a").cash).toBe(1520);
    expect(P(s, "b").cash).toBe(1490);
  });

  it("les travaux se paient par maison et par hôtel", () => {
    const s = game();
    own(s, "a", 1, 3);
    s.deeds[1]!.houses = 2;
    s.deeds[3]!.houses = 5;
    const i = cardIndex("hasard", "Travaux");
    s.decks.hasard = [i, ...s.decks.hasard.filter((x) => x !== i)];
    rollAs(s, "a", [3, 4]);
    expect(P(s, "a").cash).toBe(1500 - 2 * 25 - 100);
  });

  it("le TGV le plus proche coûte le double du loyer", () => {
    const s = game();
    own(s, "b", 15);
    const i = cardIndex("hasard", "Prenez le TGV le plus proche");
    s.decks.hasard = [i, ...s.decks.hasard.filter((x) => x !== i)];
    rollAs(s, "a", [3, 4]);
    expect(P(s, "a").position).toBe(15);
    expect(P(s, "a").cash).toBe(1450);
  });
});

describe("fin de partie", () => {
  it("à l'heure, le tour se termine et le plus riche gagne", () => {
    const s = game(3, { end: "timed" });
    own(s, "c", 37, 39);
    expect(timeUp(s)).toEqual([{ type: "timeUp" }]);
    // Une simple visite à la prison : personne ne paie rien
    P(s, "a").position = 6;
    rollAs(s, "a", [1, 3]);
    act(s, "a", { type: "endTurn" });
    expect(s.step).toBe("over");
    expect(s.ranking![0]).toBe("c");
    expect(s.ranks!.a).toBe(s.ranks!.b);
    expect(netWorth(s, "c")).toBe(1500 + 750);
  });
});

// ---------------------------------------------------------------------------
// Parties jouées par les bots, du début à la fin
// ---------------------------------------------------------------------------

function checkInvariants(s: CapitaleState) {
  let houses = 0;
  let hotels = 0;
  for (const d of s.deeds) {
    if (!d) continue;
    if (d.houses === 5) hotels += 1;
    else houses += d.houses;
  }
  expect(houses + s.bankHouses).toBe(BANK_HOUSES);
  expect(hotels + s.bankHotels).toBe(BANK_HOTELS);
  for (const p of s.players) expect(p.cash).toBeGreaterThanOrEqual(0);
}

function simulate(levels: BotLevel[], seed: number, settings: Partial<CapitaleSettings> = {}) {
  const ids = levels.map((_, i) => `p${i}`);
  const { state: s } = createGame(ids, { ...DEFAULT_SETTINGS, end: "bankrupt", ...settings }, seed);
  const level = (id: string) => levels[ids.indexOf(id)]!;
  let tradedTurn = -1;
  let actions = 0;
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
    const a = botAction(s, actor, level(actor), { allowTrade: s.turnId !== tradedTurn });
    if (!a) throw new Error(`aucun coup pour ${actor} à l'étape ${s.step}`);
    if (a.type === "propose") tradedTurn = s.turnId;
    const r = applyAction(s, actor, a);
    if (!r.ok) throw new Error(`${a.type} à l'étape ${s.step} : ${r.error}`);
    actions += 1;
    checkInvariants(s);
  }
  return { s, actions };
}

describe("bots", () => {
  it("des parties entières entre bots vont au bout, sans coup refusé", () => {
    const mixes: BotLevel[][] = [
      ["facile", "moyen", "fort"],
      ["fort", "fort", "fort", "fort"],
      ["moyen", "facile", "moyen", "fort", "facile", "moyen"],
      ["facile", "facile"],
    ];
    let seed = 1;
    for (const mix of mixes) {
      for (let k = 0; k < 4; k++) {
        const { s } = simulate(mix, seed++, k % 2 ? { freeParking: true, quickStart: true } : {});
        expect(s.step).toBe("over");
        expect(s.ranking).toHaveLength(mix.length);
      }
    }
  }, 60_000);

  it("le bot Fort bat le bot Facile la plupart du temps", () => {
    let wins = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const levels: BotLevel[] = seed % 2 ? ["fort", "facile"] : ["facile", "fort"];
      const { s } = simulate(levels, 500 + seed);
      if (s.ranking![0] === `p${levels.indexOf("fort")}`) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(13);
  }, 60_000);

  it("le bot n'achète pas au-delà de ses moyens et paie ses dettes", () => {
    const s = game();
    Object.assign(P(s, "a"), { position: 0, cash: 30 });
    rollAs(s, "a", [2, 4]);
    expect(s.pendingBuy).toBe(6);
    expect(botAction(s, "a", "fort")).toEqual({ type: "decline" });
  });
});
