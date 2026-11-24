// UNO : les comptes justes (points en équipes, classement aux points, statistiques des succès), le 7 qui n'efface pas
// l'oubli d'un autre, et les bots qui choisissent mieux (roulette, 0 du 7-0).
import { describe, expect, it } from "vitest";
import type { Card, CardKind, Color } from "./cards.ts";
import { applyAction, createGame, DEFAULT_SETTINGS, startNextRound, timeoutActions, type UnoSettings, type UnoState } from "./engine.ts";
import { botTurn } from "./bot.ts";

let nextId = 7000;
const c = (kind: CardKind, color: Color | null = null, value?: number): Card => ({
  id: nextId++,
  kind,
  color,
  ...(value !== undefined ? { value } : {}),
});
const n = (color: Color, value: number) => c("number", color, value);

function rig(hands: Card[][], top: Card, settings: Partial<UnoSettings> = {}, drawPile?: Card[]): UnoState {
  const ids = hands.map((_, i) => `p${i}`);
  const { state } = createGame(ids, { ...DEFAULT_SETTINGS, stacking: false, ...settings }, 42);
  state.players.forEach((p, i) => (p.hand = hands[i]!.slice()));
  state.discard = [top];
  state.color = top.color ?? "red";
  state.turn = 0;
  state.direction = 1;
  state.pendingDraw = 0;
  state.lastDrawValue = 0;
  state.challenge = null;
  state.drawPile = drawPile ?? Array.from({ length: 30 }, (_, i) => n("blue", i % 10));
  return state;
}

function act(s: UnoState, who: number, action: Parameters<typeof applyAction>[2], now = 0) {
  const res = applyAction(s, `p${who}`, action, now);
  if (!res.ok) throw new Error(res.error);
  return res.events;
}

describe("UNO, le 7 et l'oubli d'un autre", () => {
  it("un 7 entre deux joueurs laisse dénonçable un troisième qui a oublié son UNO", () => {
    const seven = n("red", 7);
    const s = rig(
      [
        [seven, n("blue", 1), n("blue", 2)],
        [n("yellow", 1), n("yellow", 2)],
        [n("red", 3), n("green", 2)],
      ],
      n("red", 5),
      {
        sevenZero: true,
      },
    );
    s.turn = 2;
    act(s, 2, { type: "play", cardId: s.players[2]!.hand[0]!.id }, 1000);
    expect(s.unoWindow?.player).toBe(2);
    // p0 échange avec p1 : p2 n'est pas concerné, son oubli reste dénonçable et il n'a toujours pas crié UNO
    s.turn = 0;
    s.color = "red";
    act(s, 0, { type: "play", cardId: seven.id, target: "p1" }, 1500);
    expect(s.unoWindow?.player).toBe(2);
    expect(s.players[2]!.declaredUno).toBe(false);
    act(s, 1, { type: "catch", target: "p2" }, 1800);
    expect(s.players[2]!.hand).toHaveLength(3);
  });

  it("la plus grosse main se compte aussi après un échange", () => {
    const seven = n("red", 7);
    const big = Array.from({ length: 13 }, (_, i) => n("green", i % 10));
    const s = rig([[seven, n("blue", 1)], big], n("red", 5), { sevenZero: true });
    act(s, 0, { type: "play", cardId: seven.id, target: "p1" });
    expect(s.players[0]!.stats.maxHand).toBe(13);
  });
});

describe("UNO en équipes aux points", () => {
  it("le gagnant marque les cartes des adversaires, pas celles de son coéquipier", () => {
    const last = n("red", 3);
    const s = rig([[last], [n("blue", 9)], [n("green", 8), n("green", 7)], [n("yellow", 5)]], n("red", 1), {
      endMode: "points",
      targetScore: 500,
    });
    s.teams = { p0: 0, p1: 1, p2: 0, p3: 1 };
    s.teamWin = true;
    act(s, 0, { type: "play", cardId: last.id });
    expect(s.lastRound?.points).toBe(9 + 5);
  });

  it("No Mercy : l'élimination d'un coéquipier ne rapporte rien, celle d'un adversaire 250", () => {
    const last = n("red", 3);
    const s = rig([[last], [], [], [n("yellow", 3)]], n("red", 5), { variant: "nomercy", endMode: "points", targetScore: 5000 });
    s.teams = { p0: 0, p1: 1, p2: 0, p3: 1 };
    s.teamWin = true;
    // p1 (adversaire) et p2 (coéquipier) ont déjà sauté aux 25 cartes
    for (const i of [1, 2]) Object.assign(s.players[i]!, { out: true, eliminated: true, hand: [] });
    s.eliminationOrder.push(1, 2);
    act(s, 0, { type: "play", cardId: last.id });
    expect(s.lastRound?.winner).toBe("p0");
    expect(s.lastRound?.points).toBe(3 + 250);
  });
});

describe("UNO aux points, le classement final", () => {
  it("un joueur éliminé à la dernière manche garde la place de son total", () => {
    const ten = c("wild10");
    const s = rig([[ten, n("red", 1)], Array.from({ length: 16 }, () => n("green", 0)), [n("yellow", 3)]], n("red", 5), {
      variant: "nomercy",
      endMode: "points",
      targetScore: 1000,
    });
    s.players[0]!.score = 950;
    s.players[1]!.score = 900;
    s.players[2]!.score = 100;
    act(s, 0, { type: "play", cardId: ten.id, color: "red" });
    expect(s.players[1]!.eliminated).toBe(true);
    s.turn = 0;
    s.color = "red";
    act(s, 0, { type: "play", cardId: s.players[0]!.hand[0]!.id });
    expect(s.phase).toBe("gameOver");
    expect(s.ranking).toEqual(["p0", "p1", "p2"]);
  });

  it("l'élimination par les 25 cartes reste notée après la manche où elle a eu lieu", () => {
    const ten = c("wild10");
    const s = rig([[ten, n("red", 1)], Array.from({ length: 16 }, () => n("green", 0))], n("red", 5), {
      variant: "nomercy",
      endMode: "points",
      targetScore: 5000,
    });
    act(s, 0, { type: "play", cardId: ten.id, color: "red" });
    expect(s.phase).toBe("roundOver");
    startNextRound(s);
    expect(s.players[1]!.eliminated).toBe(false);
    expect(s.players[1]!.everEliminated).toBe(true);
  });
});

describe("UNO, les statistiques des succès", () => {
  it("un +4 démasqué ne compte pas dans les « + » donnés", () => {
    const wild4 = c("wild4");
    const s = rig([[wild4, n("red", 2), n("blue", 3)], [n("yellow", 1)]], n("red", 5));
    act(s, 0, { type: "play", cardId: wild4.id, color: "green" });
    expect(s.players[0]!.stats.plusGiven).toBe(4);
    act(s, 1, { type: "challenge" });
    expect(s.players[0]!.stats.plusGiven).toBe(0);
  });

  it("la roulette compte pour la plus grosse pile ramassée", () => {
    const roulette = c("wildRoulette");
    const pile = [n("blue", 4), ...Array.from({ length: 9 }, () => n("green", 1))];
    const s = rig([[roulette, n("red", 1)], [n("yellow", 1)], [n("green", 2)]], n("red", 5), { variant: "nomercy" }, pile);
    act(s, 0, { type: "play", cardId: roulette.id });
    act(s, 1, { type: "roulette", color: "blue" });
    expect(s.players[1]!.stats.biggestStackTaken).toBe(10);
  });
});

describe("UNO, les bots et le chrono", () => {
  it("à la roulette, on annonce la couleur qu'on a le moins (celle qui reste le plus dans la pioche)", () => {
    const roulette = c("wildRoulette");
    const hand = [n("red", 1), n("red", 2), n("red", 3), n("blue", 1), n("blue", 2), n("yellow", 4), n("yellow", 5)];
    for (let k = 0; k < 10; k++) {
      const s = rig([[roulette, n("green", 9)], hand], n("red", 5), { variant: "nomercy" });
      act(s, 0, { type: "play", cardId: roulette.id });
      const [a] = botTurn(s, "p1", { rng: k * 104729 + 3 });
      expect(a).toEqual({ type: "roulette", color: "green" });
      expect(timeoutActions(s)).toEqual([{ type: "roulette", color: "green" }]);
    }
  });

  it("7-0 : un bot ne pose pas un 0 qui donnerait sa petite main contre une grosse ; il pioche", () => {
    const zero = n("red", 0);
    const s = rig([[zero, n("blue", 7)], [n("yellow", 1)], Array.from({ length: 9 }, () => n("green", 3))], n("red", 5), {
      sevenZero: true,
    });
    // Le sens : p0 → p1 → p2 ; un 0 donnerait la main de p2 (9 cartes) à p0
    for (let k = 0; k < 10; k++) expect(botTurn(s, "p0", { rng: k * 7919 + 1 })).toEqual([{ type: "draw" }]);
  });

  it("7-0 : un 0 qui fait recevoir une main plus petite reste un bon coup", () => {
    const zero = n("red", 0);
    const s = rig(
      [[zero, n("blue", 7), n("blue", 8), n("blue", 9)], Array.from({ length: 5 }, () => n("yellow", 3)), [n("green", 3)]],
      n("red", 5),
      {
        sevenZero: true,
      },
    );
    const actions = botTurn(s, "p0", { rng: 99 });
    expect(actions.some((a) => a.type === "play" && a.cardId === zero.id)).toBe(true);
  });
});
