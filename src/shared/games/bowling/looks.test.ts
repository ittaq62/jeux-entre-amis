import { describe, expect, it } from "vitest";
import { BALL_COLORS, freeColor } from "./looks.ts";

describe("bowling : la boule de départ", () => {
  it("chacun reçoit une couleur libre à la table, le premier la cerise", () => {
    expect(freeColor([])).toBe("cerise");
    const a = freeColor(["cerise"]);
    expect(a).not.toBe("cerise");
    expect(freeColor(["cerise", a])).not.toBe(a);
  });

  it("quand toutes les couleurs sont prises, on en partage une", () => {
    expect(BALL_COLORS.map((c) => c.id)).toContain(freeColor(BALL_COLORS.map((c) => c.id)));
  });
});
