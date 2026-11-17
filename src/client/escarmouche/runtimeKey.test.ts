import { describe, expect, it } from "vitest";
import type { EscarmoucheView } from "../../shared/games/escarmouche/view.ts";
import { runtimeKey } from "./runtimeKey.ts";

const view = (map: "hameau" | "gare") => ({ map, liveAt: 4 }) as EscarmoucheView;

describe("Escarmouche : quand refaire le moteur du combat", () => {
  it("une revanche sur la même carte est une nouvelle partie ; la même partie garde son moteur", () => {
    const first = runtimeKey({ code: "ABCD", escarmouche: view("hameau"), startedAt: 1000 });
    expect(runtimeKey({ code: "ABCD", escarmouche: view("hameau"), startedAt: 1000 })).toBe(first);
    expect(runtimeKey({ code: "ABCD", escarmouche: view("hameau"), startedAt: 90_000 })).not.toBe(first);
    expect(runtimeKey({ code: "ABCD", escarmouche: view("gare"), startedAt: 1000 })).not.toBe(first);
  });
});
