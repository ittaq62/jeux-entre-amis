// Briques, « Symboles de couleur » : chaque type de pièce a son propre motif.
import { describe, expect, it } from "vitest";
import { PIECES, colorOf } from "../../shared/games/bricks/engine.ts";
import { setBrickSymbols, SYMBOL_OF } from "./draw.ts";
import * as draw from "./draw.ts";

describe("Briques, les symboles des pièces", () => {
  it("les sept pièces ont chacune un motif différent ; les lignes grises n'en ont pas", () => {
    const marks = PIECES.map((p) => SYMBOL_OF[colorOf(p)]);
    expect(marks.every(Boolean)).toBe(true);
    expect(new Set(marks).size).toBe(7);
    expect(SYMBOL_OF[8]).toBeUndefined();
  });

  it("changer le réglage fait redessiner les plateaux, le redire ne change rien", () => {
    setBrickSymbols(false);
    const before = draw.symbolsVersion;
    setBrickSymbols(true);
    expect(draw.symbolsVersion).toBe(before + 1);
    setBrickSymbols(true);
    expect(draw.symbolsVersion).toBe(before + 1);
    setBrickSymbols(false);
    expect(draw.symbolsVersion).toBe(before + 2);
  });
});
