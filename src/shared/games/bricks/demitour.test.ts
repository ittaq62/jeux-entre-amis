// Briques : un demi-tour se range à part des quarts de tour, et son simple décalage ne fait pas un T-spin complet.
import { describe, expect, it } from "vitest";
import { COLS, emptyGrid, HALF_TURN_KICK, rotated, tSpin, type Active } from "./engine.ts";

describe("Briques, le demi-tour", () => {
  it("ses coups de pied ont leurs propres numéros", () => {
    const t: Active = { type: "T", rot: 0, x: 3, y: 10 };
    expect(rotated(emptyGrid(), t, 2)!.kick).toBe(HALF_TURN_KICK);
    expect(rotated(emptyGrid(), t, 1)!.kick).toBe(0);
  });

  it("trois coins pris sans les deux de devant : mini, même après le dernier décalage d'un demi-tour ; complet après le dernier coup de pied d'un quart de tour", () => {
    const g = emptyGrid();
    const a: Active = { type: "T", rot: 0, x: 3, y: 10 };
    // Coin avant gauche, et les deux coins arrière
    for (const [x, y] of [
      [a.x, a.y],
      [a.x + 2, a.y + 2],
      [a.x, a.y + 2],
    ])
      g[y! * COLS + x!] = 8;
    expect(tSpin(g, a, true, HALF_TURN_KICK + 4)).toBe("mini");
    expect(tSpin(g, a, true, 4)).toBe("full");
  });
});
