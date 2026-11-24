import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  earnedEscarmoucheAchievements,
  earnedTourAchievements,
  type EscarmoucheOutcome,
  type TourOutcome,
} from "./achievements.ts";

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

const skirmish = (o: Partial<EscarmoucheOutcome>, stats: Partial<EscarmoucheOutcome["stats"]> = {}): EscarmoucheOutcome => ({
  won: false,
  played: 1,
  mode: "drapeau",
  ...o,
  stats: { kills: 0, deaths: 1, headshots: 0, best: 0, knives: 0, captures: 0, ...stats },
});

describe("succès d'Escarmouche", () => {
  it("porte-drapeau : un drapeau rapporté en capture du drapeau", () => {
    expect(earnedEscarmoucheAchievements(skirmish({}, { captures: 1 }))).toContain("escarmouche-flag");
  });

  it("prendre des points en Conquête ne rapporte pas de drapeau", () => {
    expect(earnedEscarmoucheAchievements(skirmish({ mode: "conquete" }, { captures: 3 }))).not.toContain("escarmouche-flag");
  });
});

describe("la liste des succès", () => {
  it("chaque id est unique", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chaque titre est unique : deux succès ne portent pas le même nom", () => {
    const titles = ACHIEVEMENTS.map((a) => a.title);
    expect(titles.filter((t, i) => titles.indexOf(t) !== i)).toEqual([]);
  });
});
