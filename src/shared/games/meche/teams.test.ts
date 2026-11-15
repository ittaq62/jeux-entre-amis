// Mèche en équipes à une table : la dernière équipe qui a encore des allumettes gagne, ensemble
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, explode, lightFuse, newGame, START_MS } from "./engine.ts";
import { mecheView } from "./view.ts";

const NOW = 1_000_000;

function teamGame(teamWin: boolean) {
  const g = newGame(["p0", "p1", "p2", "p3"], DEFAULT_SETTINGS, NOW, 42);
  g.teams = { p0: 0, p1: 1, p2: 0, p3: 1 };
  g.teamWin = teamWin;
  g.holder = 0;
  lightFuse(g, NOW + START_MS);
  Object.assign(g.players[3]!, { lives: 0, place: 4 });
  g.players[1]!.lives = 1;
  g.players[2]!.lives = 3;
  g.players[0]!.lives = 2;
  g.holder = 1;
  explode(g, NOW + START_MS + 1000);
  return g;
}

describe("Mèche en équipes à une table", () => {
  it("l'équipe qui reste gagne : chacun de ses joueurs prend la première place", () => {
    const g = teamGame(true);
    expect(g.phase).toBe("over");
    expect(g.ranking).toEqual(["p2", "p0", "p1", "p3"]);
    expect(g.teamRanks).toEqual({ p0: 1, p2: 1, p1: 3, p3: 3 });
    const v = mecheView(g);
    expect(v.teams).toEqual({ p0: 0, p1: 1, p2: 0, p3: 1 });
    expect(v.teamRanks).toEqual(g.teamRanks);
  });

  it("en tournée, chacun garde sa place", () => {
    const g = teamGame(false);
    expect(g.ranks).toEqual({ p2: 1, p0: 2, p1: 3, p3: 4 });
    expect(g.teamRanks).toBeNull();
    expect(mecheView(g).teams).toBeNull();
  });
});
