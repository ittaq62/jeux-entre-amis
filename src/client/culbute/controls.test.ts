// Les commandes au doigt : Frapper relâché vite donne le coup simple, gardé il devient le coup fort ; la garde (Frapper
// et Spécial ensemble) ne laisse pas de coup derrière elle.
import { beforeAll, describe, expect, it } from "vitest";
import { ATK, FRT, SHD } from "../../shared/games/culbute/model.ts";
import { CHARGE_DECIDE } from "../../shared/games/culbute/moves.ts";
import { defaultSettings } from "./bindings.ts";

type Controls = import("./controls.ts").CulbuteControls;
let make: () => Controls;

beforeAll(async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.window ??= { addEventListener() {}, removeEventListener() {} };
  g.navigator ??= {};
  const { CulbuteControls } = await import("./controls.ts");
  make = () => new CulbuteControls(defaultSettings());
});

/** n lectures de suite : les boutons enfoncés à chacune */
const samples = (c: Controls, n: number) => Array.from({ length: n }, () => c.sample());

describe("Culbute, commandes au doigt", () => {
  it("Frapper relâché vite : le coup simple, au relâchement", () => {
    const c = make();
    c.touchButton("atk", true);
    expect(samples(c, 3).some((s) => s.pressed & (ATK | FRT))).toBe(false);
    c.touchButton("atk", false);
    expect(c.sample().pressed & ATK).toBe(ATK);
    expect(c.sample().pressed).toBe(0);
  });

  it("un appui si bref qu'il tient entre deux lectures compte quand même", () => {
    const c = make();
    c.touchButton("atk", true);
    c.touchButton("atk", false);
    expect(c.sample().pressed & ATK).toBe(ATK);
  });

  it("Frapper gardé : le coup fort, tenu tant que le doigt reste, et pas de coup simple au relâchement", () => {
    const c = make();
    c.touchButton("atk", true);
    const seen = samples(c, CHARGE_DECIDE + 10);
    expect(seen.filter((s) => s.pressed & FRT)).toHaveLength(1);
    expect(seen.at(-1)!.held & FRT).toBe(FRT);
    c.touchButton("atk", false);
    const after = c.sample();
    expect(after.pressed & ATK).toBe(0);
    expect(after.held & FRT).toBe(0);
  });

  it("la garde (Frapper et Spécial) ne laisse pas de coup quand on lève un doigt après l'autre", () => {
    const c = make();
    c.touchButton("atk", true);
    c.touchButton("spc", true);
    const guard = samples(c, 5);
    expect(guard.every((s) => s.held & SHD)).toBe(true);
    c.touchButton("spc", false);
    const rest = samples(c, CHARGE_DECIDE + 5);
    expect(rest.some((s) => s.pressed & (ATK | FRT))).toBe(false);
    c.touchButton("atk", false);
    expect(c.sample().pressed & (ATK | FRT)).toBe(0);
  });
});
