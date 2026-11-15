import { describe, expect, it } from "vitest";
import { alternateTeams, dealTeams, emptierTeam, oneTeamLeft, teamProblem, teamRanks, teamsByBest, teamTableSize } from "./teams.ts";

describe("les équipes d'une table", () => {
  it("répartit à tour de rôle et assoit l'arrivant dans l'équipe la moins remplie", () => {
    const seats: { team?: number }[] = [{}, {}, {}, {}, {}];
    dealTeams(seats, 2);
    expect(seats.map((s) => s.team)).toEqual([0, 1, 0, 1, 0]);
    expect(emptierTeam(seats, 2)).toBe(1);
    dealTeams(seats, 0);
    expect(seats.every((s) => s.team === undefined)).toBe(true);
  });

  it("refuse les équipes inégales ou d'un seul joueur", () => {
    expect(teamProblem([{ team: 0 }, { team: 1 }, { team: 0 }, { team: 1 }], 2)).toBeNull();
    expect(teamProblem([{ team: 0 }, { team: 0 }, { team: 0 }, { team: 1 }], 2)).toContain("3 contre 1");
    expect(teamProblem([{ team: 0 }, { team: 1 }, { team: 2 }], 3)).toContain("au moins deux");
    expect(teamProblem([{}, {}], 0)).toBeNull();
  });

  it("alterne les équipes dans l'ordre du jeu", () => {
    const teams = { a: 0, b: 0, c: 1, d: 1, e: 2, f: 2 };
    expect(alternateTeams(["a", "b", "c", "d", "e", "f"], teams)).toEqual(["a", "c", "e", "b", "d", "f"]);
    expect(alternateTeams(["a", "b"], null)).toEqual(["a", "b"]);
  });

  it("donne à chacun la place de son équipe", () => {
    const teams = { a: 0, b: 1, c: 0, d: 1 };
    expect(teamsByBest(["b", "a", "d", "c"], teams)).toEqual([1, 0]);
    expect(teamRanks([1, 0], teams)).toEqual({ b: 1, d: 1, a: 3, c: 3 });
    const three = { a: 0, b: 0, c: 1, d: 1, e: 2, f: 2 };
    expect(teamRanks([2, 0, 1], three)).toEqual({ e: 1, f: 1, a: 3, b: 3, c: 5, d: 5 });
  });

  it("ajuste les places aux équipes : un nombre pair d'au moins quatre, six à trois équipes", () => {
    expect(teamTableSize(3, 2, 8)).toBe(4);
    expect(teamTableSize(5, 2, 8)).toBe(6);
    expect(teamTableSize(8, 2, 8)).toBe(8);
    expect(teamTableSize(4, 3, 8)).toBe(6);
    expect(teamTableSize(5, 0, 8)).toBe(5);
  });

  it("une seule équipe en jeu : la suite ne changerait plus rien", () => {
    expect(oneTeamLeft({ a: 0, b: 1, c: 0 }, ["a", "c"])).toBe(true);
    expect(oneTeamLeft({ a: 0, b: 1, c: 0 }, ["a", "b"])).toBe(false);
    expect(oneTeamLeft(null, ["a", "b"])).toBe(false);
  });
});
