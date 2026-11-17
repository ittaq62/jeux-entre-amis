import { describe, expect, it } from "vitest";
import type { CulbuteView } from "../../shared/games/culbute/view.ts";
import { overTitle } from "./overTitle.ts";

const fighters = [0, 1, 2, 3].map((slot) => ({ slot, id: `s${slot}`, team: slot % 2, style: "ginette" as const }));
const view = (teams: boolean, ranks: number[] | null) =>
  ({ config: { teams } as CulbuteView["config"], fighters, ranks }) as Pick<CulbuteView, "config" | "fighters" | "ranks">;
const names = (slot: number) => ["Ginette", "Marcel", "Huguette", "Raymond"][slot];

describe("Culbute : le titre de l'écran de fin", () => {
  it("chacun pour soi : le gagnant, ou l'égalité en tête", () => {
    expect(overTitle(view(false, [2, 1, 3, 4]), names)).toBe("Marcel gagne !");
    expect(overTitle(view(false, [1, 1, 3, 4]), names)).toBe("Égalité en tête");
    expect(overTitle(view(false, null), names)).toBe("Fin du combat");
  });

  it("en équipes : l'équipe qui gagne ; deux équipes à égalité, ce n'est pas une victoire des Rouges", () => {
    expect(overTitle(view(true, [2, 1, 2, 1]), names)).toBe("Victoire des Bleus");
    expect(overTitle(view(true, [1, 2, 1, 2]), names)).toBe("Victoire des Rouges");
    expect(overTitle(view(true, [1, 1, 1, 1]), names)).toBe("Égalité");
  });
});
