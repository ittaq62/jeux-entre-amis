import { describe, expect, it } from "vitest";
import { botInput, newBotTable, newBrain } from "./bot.ts";
import { packWorld, unpackWorld } from "./net.ts";
import { createWorld, step, type Input, type World } from "./sim.ts";
import { KITCHEN_IDS } from "./kitchens.ts";
import { lockOf, isOpen, totalStars, frontier } from "./campaign.ts";
import { TOQUE_STARS } from "./stars.ts";
import { validRule } from "../../stars.ts";

describe("l'état serré", () => {
  for (const kitchen of ["bistrot", "train", "brasserie"] as const) {
    it(`${kitchen} : le monde reçu avance comme celui du serveur`, () => {
      const owners = [0, 1].map(() => ({ team: 0, chefs: 1 as const, bot: true }));
      const a = createWorld(kitchen, false, owners, 9);
      const table = newBotTable();
      const brains = a.chefs.map((c) => newBrain(c.slot, "moyen", 9 + c.slot));
      const inputsOf = (w: World): Input[] => w.chefs.map((c) => botInput(w, c.slot, brains[c.slot]!, table));
      while (a.frame < a.service + 40 * 30) step(a, inputsOf(a));
      const packed = JSON.parse(JSON.stringify(packWorld(a)));
      const b = unpackWorld(createWorld(kitchen, false, owners, 9), packed);
      // Les mêmes commandes pendant une seconde : les deux mondes restent d'accord (à l'arrondi près)
      for (let i = 0; i < 30; i++) {
        const inputs = inputsOf(a);
        step(a, inputs);
        step(b, inputs);
      }
      a.chefs.forEach((c, i) => {
        expect(Math.abs(c.x - b.chefs[i]!.x)).toBeLessThan(0.02);
        expect(Math.abs(c.y - b.chefs[i]!.y)).toBeLessThan(0.02);
        expect(b.chefs[i]!.held?.k).toBe(c.held?.k);
      });
      expect(b.items.map((x) => x?.k ?? null)).toEqual(a.items.map((x) => x?.k ?? null));
      expect(b.teams[0]!.score).toBe(a.teams[0]!.score);
      expect(JSON.stringify(packed).length).toBeLessThan(6000);
    });
  }
});

describe("la campagne", () => {
  it("on ouvre la suite avec une étoile à la précédente, et les portes demandent un total", () => {
    expect(isOpen("bistrot", {})).toBe(true);
    expect(isOpen("creperie", {})).toBe(false);
    expect(isOpen("creperie", { bistrot: 1 })).toBe(true);
    expect(lockOf("pizzeria", { bistrot: 1, creperie: 1, cantine: 1 })).toEqual({ previous: null, need: 5 });
    expect(isOpen("pizzeria", { bistrot: 3, creperie: 1, cantine: 1 })).toBe(true);
    expect(totalStars({ bistrot: 3, creperie: 2 })).toBe(5);
    expect(frontier({ bistrot: 2 })).toBe("creperie");
  });

  it("les étoiles déclarées : une carte par cuisine, des seuils dans l'ordre", () => {
    expect(TOQUE_STARS.maps.map((m) => m.id)).toEqual(KITCHEN_IDS);
    for (const m of TOQUE_STARS.maps) expect(validRule(m.rule)).toBe(true);
  });
});
