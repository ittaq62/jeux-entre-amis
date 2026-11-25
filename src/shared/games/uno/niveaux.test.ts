// UNO : les niveaux des bots. Le facile dénonce rarement et oublie UNO, le fort dénonce vite et presque toujours.
import { describe, expect, it } from "vitest";
import type { Card, CardKind, Color } from "./cards.ts";
import { createGame, DEFAULT_SETTINGS, type UnoBotLevel } from "./engine.ts";
import { botCatchDelay, botTurn, botUnoDelay } from "./bot.ts";

let nextId = 8000;
const c = (kind: CardKind, color: Color | null = null, value?: number): Card => ({
  id: nextId++,
  kind,
  color,
  ...(value !== undefined ? { value } : {}),
});

const rate = (f: (h: { rng: number }) => unknown) => {
  let n = 0;
  for (let k = 0; k < 2000; k++) if (f({ rng: k * 7919 + 17 }) !== null) n++;
  return n / 2000;
};

describe("UNO, les niveaux des bots", () => {
  it("dénoncer un oubli : rarement et lentement en facile, presque toujours et vite en fort", () => {
    const facile = rate((h) => botCatchDelay(h, "facile"));
    const moyen = rate((h) => botCatchDelay(h, "moyen"));
    const fort = rate((h) => botCatchDelay(h, "fort"));
    expect(facile).toBeLessThan(moyen);
    expect(moyen).toBeLessThan(fort);
    expect(fort).toBeGreaterThan(0.85);
    const delays = Array.from({ length: 200 }, (_, k) => botCatchDelay({ rng: k + 1 }, "fort")).filter((d) => d !== null) as number[];
    expect(Math.max(...delays)).toBeLessThan(2000);
    // Sans niveau (parties plus anciennes) : le moyen
    expect(rate((h) => botCatchDelay(h))).toBeCloseTo(moyen, 5);
  });

  it("crier UNO après un oubli : le fort se rattrape bien plus souvent que le facile", () => {
    const { state } = createGame(["a", "b"], { ...DEFAULT_SETTINGS }, 1);
    expect(rate((h) => botUnoDelay(state, h, "fort"))).toBeGreaterThan(rate((h) => botUnoDelay(state, h, "facile")) + 0.3);
  });

  it("le facile pose souvent une carte au hasard ; le moyen joue toujours sa couleur la plus fournie", () => {
    // Le dessus : 5 rouge ; en main, un 5 bleu (change de couleur) et trois rouges
    const hand = [c("number", "blue", 5), c("number", "red", 1), c("number", "red", 2), c("number", "red", 3)];
    const picks = (level: UnoBotLevel) => {
      const seen = new Set<number>();
      for (let k = 0; k < 60; k++) {
        const { state: s } = createGame(["a", "b"], { ...DEFAULT_SETTINGS }, 2);
        s.players[0]!.hand = hand.slice();
        s.players[1]!.hand = [c("number", "green", 9), c("number", "green", 8), c("number", "green", 7)];
        s.discard = [c("number", "red", 5)];
        s.color = "red";
        s.turn = 0;
        s.pendingDraw = 0;
        const [a] = botTurn(s, "a", { rng: k * 104729 + 7 }, new Set(), level);
        if (a?.type === "play") seen.add(a.cardId);
      }
      return seen;
    };
    expect(picks("facile").has(hand[0]!.id)).toBe(true);
    expect(picks("moyen").has(hand[0]!.id)).toBe(false);
  });
});
