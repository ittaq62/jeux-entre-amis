import { describe, expect, it } from "vitest";
import { isDraw, rankingPoints, sharedRanks, wonGame, type RankedPlayer } from "./ranking.ts";

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

  it("une égalité générale ne rapporte pas le bonus de victoire", () => {
    // Deux équipes à égalité : tout le monde est classé premier
    const players: RankedPlayer[] = [
      { rank: 1, isBot: false },
      { rank: 1, isBot: false },
      { rank: 1, isBot: true },
      { rank: 1, isBot: true },
    ];
    expect(rankingPoints(players, players[0]!)).toBe(0);
  });

  it("deux premiers ex aequo devant d'autres gagnent tous les deux", () => {
    const players: RankedPlayer[] = [
      { rank: 1, isBot: false },
      { rank: 1, isBot: false },
      { rank: 3, isBot: true },
    ];
    expect(rankingPoints(players, players[1]!)).toBe(30 + 5);
  });
});

describe("victoire ou égalité", () => {
  it("tout le monde premier : une égalité, personne n'a gagné", () => {
    const players = [{ rank: 1 }, { rank: 1 }];
    expect(isDraw(players)).toBe(true);
    expect(wonGame(players, players[0]!)).toBe(false);
  });

  it("un seul premier a gagné", () => {
    const players = [{ rank: 1 }, { rank: 2 }];
    expect(isDraw(players)).toBe(false);
    expect(wonGame(players, players[0]!)).toBe(true);
    expect(wonGame(players, players[1]!)).toBe(false);
  });

  it("un joueur seul classé (les autres sans place) a bien gagné", () => {
    const players = [{ rank: 1 }, { rank: 0 }];
    expect(isDraw(players)).toBe(false);
    expect(wonGame(players, players[0]!)).toBe(true);
  });

  it("les joueurs sans place ne font pas une égalité", () => {
    const players = [{ rank: 1 }, { rank: 1 }, { rank: 0 }];
    expect(isDraw(players)).toBe(true);
  });
});

describe("les places du classement", () => {
  it("deux joueurs aux mêmes chiffres partagent la même place, le suivant saute", () => {
    const rows = [60, 60, 40, 30, 30, 30, 10];
    expect(sharedRanks(rows, String)).toEqual([1, 1, 3, 4, 4, 4, 7]);
  });

  it("des chiffres différents donnent des places qui se suivent", () => {
    expect(sharedRanks([5, 4, 3], String)).toEqual([1, 2, 3]);
    expect(sharedRanks([], String)).toEqual([]);
  });
});
