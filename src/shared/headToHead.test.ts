import { describe, expect, it } from "vitest";
import { headToHead, type VersusRow } from "./headToHead.ts";

const row = (game: VersusRow["game"], mine: number, theirs: number, endedAt = 0): VersusRow => ({ game, mine, theirs, endedAt });

describe("headToHead", () => {
  it("rien joué ensemble", () => {
    expect(headToHead([])).toEqual({ played: 0, won: 0, lost: 0, tied: 0, byGame: [], streak: null, last: null });
  });

  it("compte qui a fini devant l'autre, jeu par jeu", () => {
    const h = headToHead([row("uno", 1, 3, 30), row("uno", 2, 1, 20), row("naval", 1, 2, 10), row("uno", 2, 2, 5)]);
    expect([h.played, h.won, h.lost, h.tied]).toEqual([4, 2, 1, 1]);
    expect(h.byGame).toEqual([
      { game: "uno", played: 3, won: 1, lost: 1, tied: 1 },
      { game: "naval", played: 1, won: 1, lost: 0, tied: 0 },
    ]);
    expect(h.last).toEqual({ game: "uno", endedAt: 30, result: "won" });
  });

  it("la série en cours ne compte pas les places égales, et commence à deux", () => {
    expect(headToHead([row("uno", 1, 2), row("uno", 3, 3), row("bricks", 1, 2), row("uno", 2, 1)]).streak).toEqual({ who: "me", count: 2 });
    expect(headToHead([row("uno", 2, 1), row("uno", 3, 1), row("uno", 2, 1), row("uno", 1, 2)]).streak).toEqual({ who: "them", count: 3 });
    expect(headToHead([row("uno", 1, 2), row("uno", 2, 1)]).streak).toBeNull();
  });
});
