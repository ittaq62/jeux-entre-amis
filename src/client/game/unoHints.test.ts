import { describe, expect, it } from "vitest";
import type { Card } from "../../shared/games/uno/cards.ts";
import { DEFAULT_SETTINGS, effectiveRules } from "../../shared/games/uno/engine.ts";
import type { UnoView } from "../../shared/games/uno/view.ts";
import { whyNot } from "./unoHints.ts";

const card = (kind: Card["kind"], color: Card["color"], value?: number): Card => ({
  id: 1,
  kind,
  color,
  ...(value !== undefined ? { value } : {}),
});
const view = (over: Partial<UnoView>): UnoView =>
  ({ rouletteVictim: null, drawnCardId: null, pendingDraw: 0, color: "red", top: card("number", "red", 5), ...over }) as UnoView;
const classic = effectiveRules({ ...DEFAULT_SETTINGS, stacking: true });

describe("UNO, pourquoi une carte ne part pas", () => {
  it("la couleur ou le chiffre", () => {
    expect(whyNot(card("number", "blue", 2), view({}), classic)).toBe("Il faut du rouge ou un 5.");
    expect(whyNot(card("number", "blue", 2), view({ top: card("skip", "red") }), classic)).toBe("Il faut du rouge.");
    expect(whyNot(card("skip", "blue"), view({}), classic)).toBe("Il faut du rouge ou le même symbole.");
  });

  it("la carte piochée, seule à pouvoir partir", () => {
    expect(whyNot(card("number", "red", 2), view({ drawnCardId: 7 }), classic)).toMatch(/piocher/);
  });

  it("le cumul : sans, sur un +4, sur un +2, et en No Mercy sur la dernière carte « + »", () => {
    const noStack = effectiveRules({ ...DEFAULT_SETTINGS, stacking: false });
    expect(whyNot(card("draw2", "red"), view({ pendingDraw: 2, top: card("draw2", "red") }), noStack)).toBe(
      "Pas de cumul à cette table : encaisse les +2.",
    );
    expect(whyNot(card("draw2", "red"), view({ pendingDraw: 4, top: card("wild4", null) }), classic)).toBe(
      "Sur un +4, seul un autre +4 se cumule.",
    );
    expect(whyNot(card("number", "red", 1), view({ pendingDraw: 2, top: card("draw2", "red") }), classic)).toBe(
      "Sur un +2, seul un +2 ou un +4 se cumule.",
    );
    const nm = effectiveRules({ ...DEFAULT_SETTINGS, variant: "nomercy" });
    // +4 puis +6 : 10 à piocher, mais on répond au +6
    expect(whyNot(card("draw4", "red"), view({ pendingDraw: 10, top: card("wild6", null) }), nm)).toBe(
      "Sous un +6, seule une carte « + » au moins aussi forte se cumule.",
    );
  });
});
