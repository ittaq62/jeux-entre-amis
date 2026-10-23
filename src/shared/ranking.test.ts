import { describe, expect, it } from "vitest";
import { rankingPoints, type RankedPlayer } from "./ranking.ts";

const table = (...kinds: ("h" | "b")[]): RankedPlayer[] => kinds.map((k, i) => ({ rank: i + 1, isBot: k === "b" }));

describe("points de classement", () => {
  it("le gagnant touche le bonus plus chaque adversaire battu", () => {
    const players = table("h", "h", "b", "b");
    expect(rankingPoints(players, players[0]!)).toBe(30 + 10 + 5 + 5);
  });

  it("un deuxième marque seulement ceux qu'il devance", () => {
    const players = table("h", "h", "h", "b");
    expect(rankingPoints(players, players[1]!)).toBe(10 + 5);
  });

  it("le dernier ne gagne rien mais ne perd rien", () => {
    const players = table("b", "h", "h");
    expect(rankingPoints(players, players[2]!)).toBe(0);
  });

  it("une victoire contre des amis vaut plus qu'une victoire contre des bots", () => {
    const amis = table("h", "h", "h");
    const bots = table("h", "b", "b");
    expect(rankingPoints(amis, amis[0]!)).toBeGreaterThan(rankingPoints(bots, bots[0]!));
  });

  it("un joueur sans place connue ne marque rien", () => {
    const players = [{ rank: 0, isBot: false }, ...table("b", "b")];
    expect(rankingPoints(players, players[0]!)).toBe(0);
  });
});
