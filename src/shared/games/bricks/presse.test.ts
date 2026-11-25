// Briques : sous une chute très rapide, les bots ratent davantage leurs poses, comme un joueur pressé.
import { describe, expect, it } from "vitest";
import { botPlacement, rushOf } from "./bot.ts";
import { newBoard } from "./engine.ts";

describe("Briques, les bots pressés", () => {
  it("la pression monte quand la pièce tombe vite", () => {
    expect(rushOf(24_000)).toBe(0);
    expect(rushOf(3000)).toBe(0);
    expect(rushOf(1800)).toBeGreaterThan(0.5);
    expect(rushOf(800)).toBe(1);
  });

  it("pressé, l'expert s'écarte plus souvent de la pose qu'il aurait jouée au calme", () => {
    const board = newBoard(12345);
    // Même tirage au calme et pressé : seul le choix d'une pose ratée change
    let changed = 0;
    for (let k = 0; k < 600; k++) {
      const calm = JSON.stringify(botPlacement(board, "expert", true, { rng: k * 7919 + 3 }, 0));
      const rushed = JSON.stringify(botPlacement(board, "expert", true, { rng: k * 7919 + 3 }, 1));
      if (calm !== rushed) changed++;
    }
    expect(changed).toBeGreaterThan(40);
    expect(changed).toBeLessThan(200);
  });
});
