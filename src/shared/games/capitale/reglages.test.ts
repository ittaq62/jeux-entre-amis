import { describe, expect, it } from "vitest";
import { applyDrawnRules } from "../../randomRules.ts";
import { gameVariants, tourCapitaleSettings, variantSettings } from "../../tour.ts";
import { DECKS, isDisaster } from "./board.ts";
import { createGame, DEFAULT_SETTINGS, newRules } from "./engine.ts";

// Les nouvelles règles de Capitale dans les réglages : de base partout, deux variantes pour s'en passer.

describe("les réglages des nouvelles règles", () => {
  it("rachat, catastrophes et construction équilibrée sont de la partie par défaut, tournée comprise", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ buyout: true, disasters: true, evenBuild: true });
    const tour = { ...DEFAULT_SETTINGS, ...tourCapitaleSettings({ variant: "classique" }) };
    expect(newRules({ settings: tour })).toEqual({ buyout: true, disasters: true, evenBuild: true });
  });

  it("deux variantes de tournée s'en passent : « Bâtisseurs libres » et « Ciel serein »", () => {
    const ids = gameVariants("capitale").map((v) => v.id);
    expect(ids).toContain("batisseurs");
    expect(ids).toContain("ciel-serein");
    expect(variantSettings("capitale", "batisseurs")).toEqual({ evenBuild: false, buyout: false });
    expect(variantSettings("capitale", "ciel-serein")).toEqual({ disasters: false });
    const { state } = createGame(["a", "b"], { ...DEFAULT_SETTINGS, ...variantSettings("capitale", "ciel-serein") }, 1);
    expect(state.decks.hasard.some((i) => isDisaster(DECKS.hasard[i]!))).toBe(false);
  });

  it("aux règles au hasard, une autre variante tirée remet ces règles à leur valeur habituelle", () => {
    const host = { ...DEFAULT_SETTINGS, evenBuild: false, buyout: false, disasters: false };
    expect(applyDrawnRules("capitale", host, DEFAULT_SETTINGS, "monopole")).toMatchObject({
      evenBuild: true,
      buyout: true,
      disasters: true,
      monopoly: true,
    });
    expect(applyDrawnRules("capitale", DEFAULT_SETTINGS, DEFAULT_SETTINGS, "batisseurs")).toMatchObject({
      evenBuild: false,
      buyout: false,
      disasters: true,
    });
  });
});
