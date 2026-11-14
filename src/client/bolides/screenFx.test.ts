import { describe, expect, it } from "vitest";
import type { ScreenBurst } from "./runtime.ts";
import { screenLayers } from "./screenFx.ts";

const BURSTS: ScreenBurst[] = ["oil", "bang", "blast", "shield", "horn"];

describe("les calques plein écran de la course", () => {
  it("l'éclair et le choc n'ont jamais la même clé, même quand leurs numéros se rejoignent", () => {
    // Touché par la foudre, puis par une flaque : les deux compteurs valent 1 (c'est là que le choc restait à l'écran)
    for (let n = 1; n <= 30; n++) {
      for (const kind of BURSTS) {
        const keys = screenLayers({ pie: true, flash: n, aura: "shield", burst: { key: n, kind } }, false).map((l) => l.key);
        expect(keys).toHaveLength(4);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it("un choc garde sa clé d'un rafraîchissement à l'autre (son animation ne repart pas), et un nouveau choc en change", () => {
    const hud = { pie: false, flash: 2, aura: null, burst: { key: 2, kind: "oil" as const } };
    const first = screenLayers(hud, false).map((l) => l.key);
    expect(screenLayers({ ...hud }, false).map((l) => l.key)).toEqual(first);
    const next = screenLayers({ ...hud, burst: { key: 3, kind: "bang" } }, false);
    expect(next.map((l) => l.key)).not.toEqual(first);
    expect(next.at(-1)).toMatchObject({ className: "hud-burst is-bang", oil: false });
  });

  it("les taches d'huile ne vont qu'avec le choc de l'huile", () => {
    const layers = screenLayers({ pie: false, flash: 0, aura: null, burst: { key: 1, kind: "oil" } }, false);
    expect(layers.filter((l) => l.oil).map((l) => l.className)).toEqual(["hud-burst is-oil"]);
    // Pas encore d'éclair : pas de calque d'éclair
    expect(layers.some((l) => l.className === "hud-flash")).toBe(false);
  });

  it("avec les effets réduits, seule la crème reste (elle cache vraiment l'écran)", () => {
    const layers = screenLayers({ pie: true, flash: 4, aura: "star", burst: { key: 4, kind: "blast" } }, true);
    expect(layers).toEqual([{ key: "pie", className: "hud-pie is-on", oil: false }]);
  });
});
