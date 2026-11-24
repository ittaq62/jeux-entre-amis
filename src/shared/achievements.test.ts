import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, earnedTourAchievements, type TourOutcome } from "./achievements.ts";

const tour = (o: Partial<TourOutcome>): TourOutcome => ({
  won: true,
  players: 4,
  games: 3,
  wins: 3,
  tourGames: 3,
  titles: 0,
  played: 1,
  ...o,
});

describe("succès de tournée", () => {
  it("le grand chelem : tous les jeux de la tournée gagnés", () => {
    expect(earnedTourAchievements(tour({}))).toContain("tour-sweep");
  });

  it("un retardataire qui n'a joué que les derniers jeux n'a pas gagné tous ceux de la tournée", () => {
    expect(earnedTourAchievements(tour({ games: 3, wins: 3, tourGames: 5 }))).not.toContain("tour-sweep");
  });

  it("pas de grand chelem sans la tournée", () => {
    expect(earnedTourAchievements(tour({ won: false }))).not.toContain("tour-sweep");
  });
});

describe("la liste des succès", () => {
  it("chaque id est unique", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
