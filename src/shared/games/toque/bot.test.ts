import { describe, expect, it } from "vitest";
import { KITCHEN_IDS } from "./kitchens.ts";
import { playService } from "./bench.ts";

describe("les commis", () => {
  for (const id of KITCHEN_IDS) {
    it(`${id} : deux commis servent au moins une commande, sans rester bloqués`, () => {
      const r = playService(id, 2, "moyen", 3);
      expect(r.served).toBeGreaterThan(0);
    });
  }
});
