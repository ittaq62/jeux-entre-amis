import { describe, expect, it } from "vitest";
import { DECKS } from "../../shared/games/capitale/board.ts";
import { ARTS, DRAWINGS } from "./CardArt.tsx";

describe("les dessins des cartes", () => {
  it("chaque carte des deux paquets a son dessin", () => {
    for (const deck of ["hasard", "courrier"] as const) {
      expect(ARTS[deck]).toHaveLength(DECKS[deck].length);
      for (const key of ARTS[deck]) expect(DRAWINGS[key]).toBeDefined();
    }
  });
});
