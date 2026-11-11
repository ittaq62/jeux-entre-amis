import { describe, expect, it } from "vitest";
import { BUYABLE, DECKS, GROUPS, SQUARES, type SpecialKind } from "./board.ts";
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
/** Poser directement un bâtiment sur une case de parcelle */
/** Mettre directement une rue à un niveau, ou y poser un bâtiment spécial */
const lvl = (s: CapitaleState, square: number, level: number) => (s.deeds[square]!.level = level);
const spec = (s: CapitaleState, square: number, kind: SpecialKind, by: string) => (s.deeds[square]!.special = { kind, by });
/** Un nouveau tour pour ce joueur : le chantier repart de zéro */
const newTurn = (s: CapitaleState, id: string) => {
  s.turn = s.players.findIndex((p) => p.id === id);
  s.turnId += 1;
};
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
  it("terrain nu, doublé avec tout le quartier, puis les niveaux jusqu'au gratte-ciel", () => {
    const s = game();
    own(s, "b", 37);
    expect(rentFor(s, 37, { diceTotal: 7 })).toBe(35);
    own(s, "b", 39);
    expect(rentFor(s, 37, { diceTotal: 7 })).toBe(70);
    lvl(s, 37, 3);
    expect(rentFor(s, 37, { diceTotal: 7 })).toBe(1100);
    lvl(s, 39, 5);
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
    lvl(s, 39, 1);
    P(s, "a").position = 33;
    rollAs(s, "a", [2, 4]);
    expect(P(s, "a").cash).toBe(1300);
    expect(P(s, "b").cash).toBe(1700);
    expect(P(s, "b").stats.rentEarned).toBe(200);
  });
});

describe("la ville : améliorer ses rues, les bâtiments spéciaux", () => {
  it("une amélioration par rue et par tour ; au-delà du niveau 3, il faut tout le quartier", () => {
    const s = game();
    own(s, "a", 1);
    act(s, "a", { type: "upgrade", square: 1 });
    expect(s.deeds[1]!.level).toBe(1);
    expect(P(s, "a").cash).toBe(1450);
    expect(applyAction(s, "a", { type: "upgrade", square: 1 }).ok).toBe(false);
    newTurn(s, "a");
    act(s, "a", { type: "upgrade", square: 1 });
    newTurn(s, "a");
    act(s, "a", { type: "upgrade", square: 1 });
    newTurn(s, "a");
    expect(applyAction(s, "a", { type: "upgrade", square: 1 }).ok).toBe(false);
    own(s, "a", 3);
    act(s, "a", { type: "upgrade", square: 1 });
    act(s, "a", { type: "upgrade", square: 3 });
    expect(s.deeds[1]!.level).toBe(4);
    expect(P(s, "a").cash).toBe(1500 - 5 * 50);
    expect(rentFor(s, 1, { diceTotal: 7 })).toBe(160);
    expect(P(s, "a").stats.houses).toBe(5);
  });

  it("le monument demande tout le quartier et double ses loyers ; un bâtiment spécial par tour", () => {
    const s = game();
    own(s, "a", 1, 3);
    expect(rentFor(s, 1, { diceTotal: 7 })).toBe(4);
    act(s, "a", { type: "special", square: 3, kind: "monument" });
    expect(P(s, "a").cash).toBe(1300);
    expect(rentFor(s, 1, { diceTotal: 7 })).toBe(8);
    expect(rentFor(s, 3, { diceTotal: 7 })).toBe(16);
    expect(applyAction(s, "a", { type: "special", square: 1, kind: "parc" }).ok).toBe(false);
    newTurn(s, "a");
    expect(applyAction(s, "a", { type: "special", square: 1, kind: "monument" }).ok).toBe(false);
    act(s, "a", { type: "special", square: 1, kind: "parc" });
  });

  it("les nuisances se posent chez un adversaire, se font raser, et un parc protège le quartier", () => {
    const s = game();
    own(s, "b", 37, 39);
    lvl(s, 39, 4);
    expect(rentFor(s, 39, { diceTotal: 7 })).toBe(1700);
    expect(applyAction(s, "a", { type: "special", square: 1, kind: "decharge" }).ok).toBe(false);
    act(s, "a", { type: "special", square: 39, kind: "decharge" });
    expect(rentFor(s, 39, { diceTotal: 7 })).toBe(850);
    newTurn(s, "a");
    expect(applyAction(s, "a", { type: "special", square: 39, kind: "centrale" }).ok).toBe(false);
    act(s, "a", { type: "special", square: 37, kind: "centrale" });
    expect(P(s, "a").cash).toBe(1200);
    // Chez b : la décharge se fait raser à ses frais, puis le parc protège le quartier
    newTurn(s, "b");
    act(s, "b", { type: "raze", square: 39 });
    expect(rentFor(s, 39, { diceTotal: 7 })).toBe(1700);
    expect(applyAction(s, "b", { type: "special", square: 39, kind: "parc" }).ok).toBe(false);
    act(s, "b", { type: "raze", square: 37 });
    act(s, "b", { type: "special", square: 39, kind: "parc" });
    expect(P(s, "b").cash).toBe(1500 - 100 - 200 - 100);
    newTurn(s, "a");
    expect(applyAction(s, "a", { type: "special", square: 37, kind: "decharge" }).ok).toBe(false);
  });

  it("le stade fait payer un billet à chaque adversaire qui passe sur la case", () => {
    const s = game();
    own(s, "b", 6);
    spec(s, 6, "stade", "b");
    P(s, "a").position = 3;
    rollAs(s, "a", [2, 3]);
    expect(P(s, "a").position).toBe(8);
    expect(P(s, "a").cash).toBe(1450);
    expect(P(s, "b").cash).toBe(1550);
    const t = game(2, { specials: false });
    own(t, "b", 6);
    spec(t, 6, "stade", "b");
    P(t, "a").position = 3;
    rollAs(t, "a", [2, 3]);
    expect(P(t, "a").cash).toBe(1500);
    expect(applyAction(t, "a", { type: "special", square: 6, kind: "decharge" }).ok).toBe(false);
  });

  it("on revend un niveau à moitié prix ; on n'hypothèque pas une rue construite ; on lève l'hypothèque à +10 %", () => {
    const s = game();
    own(s, "a", 1, 3);
    lvl(s, 1, 1);
    expect(applyAction(s, "a", { type: "mortgage", square: 1 }).ok).toBe(false);
    act(s, "a", { type: "mortgage", square: 3 });
    expect(applyAction(s, "a", { type: "upgrade", square: 3 }).ok).toBe(false);
    act(s, "a", { type: "sell", square: 1 });
    expect(s.deeds[1]!.level).toBe(0);
    act(s, "a", { type: "mortgage", square: 1 });
    act(s, "a", { type: "unmortgage", square: 1 });
    expect(P(s, "a").cash).toBe(1500 + 30 + 25 + 30 - 33);
  });

  it("on n'améliore pas pendant le tour d'un autre", () => {
    const s = game();
    own(s, "b", 1, 3);
    expect(applyAction(s, "b", { type: "upgrade", square: 1 }).ok).toBe(false);
  });
});

describe("dettes et faillite", () => {
  it("une dette se paie dès qu'on a hypothéqué de quoi la couvrir", () => {
    const s = game();
    own(s, "b", 37, 39);
    lvl(s, 39, 1);
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
    lvl(s, 39, 1);
    own(s, "a", 1, 6);
    spec(s, 37, "decharge", "a");
    Object.assign(P(s, "a"), { position: 33, cash: 100 });
    rollAs(s, "a", [2, 4]);
    act(s, "a", { type: "mortgage", square: 1 });
    act(s, "a", { type: "bankrupt" });
    expect(P(s, "a").bankrupt).toBe(true);
    expect(s.deeds[1]!.owner).toBe("b");
    expect(s.deeds[1]!.mortgaged).toBe(true);
    expect(s.deeds[6]!.owner).toBe("b");
    expect(s.deeds[37]!.special).toBeNull();
    expect(P(s, "b").cash).toBe(1630);
    expect(s.step).toBe("over");
    expect(s.ranking).toEqual(["b", "a"]);
  });

  it("en tournée par équipes, la partie s'arrête quand il ne reste qu'une équipe", () => {
    const s = game(3);
    s.teams = { a: 0, b: 1, c: 1 };
    own(s, "a", 1, 3);
    lvl(s, 1, 1);
    Object.assign(P(s, "a"), { position: 0, cash: 10 });
    Object.assign(P(s, "c"), { cash: 2000 });
    own(s, "b", 39);
    rollAs(s, "a", [1, 3]);
    act(s, "a", { type: "bankrupt" });
    expect(s.step).toBe("over");
    expect(s.ranking![2]).toBe("a");
    expect(s.ranking!.slice(0, 2).sort()).toEqual(["b", "c"]);
  });

  it("la faillite envers la banque rend les titres libres", () => {
    const s = game(3);
    own(s, "a", 1, 3);
    lvl(s, 1, 1);
    spec(s, 1, "decharge", "b");
    Object.assign(P(s, "a"), { position: 0, cash: 10 });
    rollAs(s, "a", [1, 3]);
    expect(s.step).toBe("debt");
    act(s, "a", { type: "bankrupt" });
    expect(s.deeds[1]!.owner).toBeNull();
    expect(s.deeds[1]).toEqual({ owner: null, mortgaged: false, level: 0, special: null });
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

  it("pas d'échange d'une rue construite, ni d'un quartier qui a son monument", () => {
    const s = game();
    own(s, "a", 1, 3);
    lvl(s, 3, 1);
    const offer = (sq: number): CapitaleAction => ({
      type: "propose",
      to: "b",
      give: { cash: 0, squares: [sq], jailCards: 0 },
      get: { cash: 50, squares: [], jailCards: 0 },
    });
    expect(applyAction(s, "a", offer(3)).ok).toBe(false);
    expect(applyAction(s, "a", offer(1)).ok).toBe(true);
    lvl(s, 3, 0);
    spec(s, 3, "monument", "a");
    expect(applyAction(s, "a", offer(1)).ok).toBe(false);
  });

  it("une nuisance disparaît quand celui qui l'a posée reçoit la rue", () => {
    const s = game();
    own(s, "b", 39);
    spec(s, 39, "decharge", "a");
    act(s, "a", {
      type: "propose",
      to: "b",
      give: { cash: 500, squares: [], jailCards: 0 },
      get: { cash: 0, squares: [39], jailCards: 0 },
    });
    act(s, "b", { type: "accept", trade: s.trades[0]!.id });
    expect(s.deeds[39]!.owner).toBe("a");
    expect(s.deeds[39]!.special).toBeNull();
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

  it("les travaux se paient par niveau et par gratte-ciel", () => {
    const s = game();
    own(s, "a", 1, 3);
    lvl(s, 1, 3);
    lvl(s, 3, 5);
    spec(s, 3, "decharge", "b");
    const i = cardIndex("hasard", "Travaux");
    s.decks.hasard = [i, ...s.decks.hasard.filter((x) => x !== i)];
    rollAs(s, "a", [3, 4]);
    expect(P(s, "a").cash).toBe(1500 - 3 * 25 - 100);
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

/** Ce que la ville doit toujours respecter : chacun bâtit chez soi, les nuisances viennent des autres */
function checkInvariants(s: CapitaleState, seen: Set<string>) {
  for (const g of Object.values(GROUPS)) {
    const kinds: string[] = [];
    for (const i of g.squares) {
      const d = s.deeds[i]!;
      const level = d.level ?? 0;
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(5);
      if (level === 5) seen.add("gratte-ciel");
      if (!d.owner) {
        expect(level).toBe(0);
        expect(d.special ?? null).toBeNull();
      }
      const sp = d.special;
      if (sp) {
        seen.add(sp.kind);
        kinds.push(sp.kind);
        if (sp.kind === "decharge" || sp.kind === "centrale") expect(sp.by).not.toBe(d.owner);
        else expect(sp.by).toBe(d.owner);
      }
    }
    expect(kinds.filter((k) => k === "monument").length).toBeLessThanOrEqual(1);
    expect(kinds.filter((k) => k === "parc").length).toBeLessThanOrEqual(1);
  }
  for (const p of s.players) expect(p.cash).toBeGreaterThanOrEqual(0);
}

function simulate(levels: BotLevel[], seed: number, settings: Partial<CapitaleSettings> = {}) {
  const ids = levels.map((_, i) => `p${i}`);
  const { state: s } = createGame(ids, { ...DEFAULT_SETTINGS, end: "bankrupt", ...settings }, seed);
  const level = (id: string) => levels[ids.indexOf(id)]!;
  let tradedTurn = -1;
  let actions = 0;
  const seen = new Set<string>();
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
    checkInvariants(s, seen);
  }
  return { s, actions, seen };
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
    const built = new Set<string>();
    for (const mix of mixes) {
      for (let k = 0; k < 4; k++) {
        const { s, seen } = simulate(mix, seed++, k % 2 ? { freeParking: true, quickStart: true } : {});
        expect(s.step).toBe("over");
        expect(s.ranking).toHaveLength(mix.length);
        seen.forEach((kind) => built.add(kind));
      }
    }
    // Les bots se servent de toute la ville
    expect([...built].sort()).toEqual(["centrale", "decharge", "gratte-ciel", "monument", "parc", "stade"]);
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
