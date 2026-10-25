import { describe, expect, it } from "vitest";
import { random } from "./rng.ts";
import {
  drawGame,
  fitsGame,
  sanitizeEnd,
  teamScores,
  tourCapacity,
  tourOver,
  tourPoints,
  tourTitles,
  type TitleCandidate,
} from "./tour.ts";

describe("barème", () => {
  it("donne 10, 7, 5, 3, 2, 1 puis 1 point", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(tourPoints)).toEqual([10, 7, 5, 3, 2, 1, 1, 1]);
  });
});

describe("tirage", () => {
  const rng = { rng: 42 };
  const rand = () => random(rng);

  it("ne rejoue jamais deux fois de suite le même jeu quand il y a le choix", () => {
    let previous: ReturnType<typeof drawGame> = null;
    for (let i = 0; i < 300; i++) {
      const g = drawGame(["uno", "bricks", "naval"], 4, previous, rand);
      expect(g).not.toBeNull();
      expect(g).not.toBe(previous);
      previous = g;
    }
  });

  it("tire chaque jeu coché au fil des tirages", () => {
    const seen = new Set<string>();
    let previous: ReturnType<typeof drawGame> = null;
    for (let i = 0; i < 60; i++) {
      previous = drawGame(["uno", "bricks", "naval"], 3, previous, rand);
      seen.add(previous!);
    }
    expect([...seen].sort()).toEqual(["bricks", "naval", "uno"]);
  });

  it("garde le seul jeu coché, même deux fois de suite", () => {
    expect(drawGame(["bricks"], 2, "bricks", rand)).toBe("bricks");
  });

  it("écarte les jeux qui n'accueillent pas tout le monde", () => {
    for (let i = 0; i < 30; i++) expect(drawGame(["uno", "bricks", "naval"], 7, null, rand)).toBe("uno");
    expect(drawGame(["bricks", "naval"], 7, null, rand)).toBeNull();
    expect(fitsGame("naval", 6)).toBe(true);
    expect(fitsGame("naval", 7)).toBe(false);
    expect(tourCapacity(["bricks", "naval"])).toBe(6);
    expect(tourCapacity(["uno", "naval"])).toBe(8);
  });
});

describe("fin de la tournée", () => {
  const base = { played: 0, best: 0, startedAt: 0, now: 0 };
  it("après un nombre de jeux", () => {
    expect(tourOver({ kind: "games", count: 3 }, { ...base, played: 2 })).toBe(false);
    expect(tourOver({ kind: "games", count: 3 }, { ...base, played: 3 })).toBe(true);
  });
  it("dès qu'un score est atteint", () => {
    expect(tourOver({ kind: "score", target: 30 }, { ...base, best: 29 })).toBe(false);
    expect(tourOver({ kind: "score", target: 30 }, { ...base, best: 30 })).toBe(true);
  });
  it("au bout du temps", () => {
    expect(tourOver({ kind: "time", minutes: 30 }, { ...base, now: 29 * 60_000 })).toBe(false);
    expect(tourOver({ kind: "time", minutes: 30 }, { ...base, now: 30 * 60_000 })).toBe(true);
  });
  it("jamais toute seule sans fin", () => {
    expect(tourOver({ kind: "endless" }, { ...base, played: 99, best: 999, now: 1e9 })).toBe(false);
  });
  it("n'accepte que les valeurs proposées", () => {
    expect(sanitizeEnd({ kind: "games", count: 5 })).toEqual({ kind: "games", count: 5 });
    expect(sanitizeEnd({ kind: "games", count: 4 })).toBeNull();
    expect(sanitizeEnd({ kind: "score", target: 50 })).toEqual({ kind: "score", target: 50 });
    expect(sanitizeEnd({ kind: "time", minutes: 15 })).toBeNull();
    expect(sanitizeEnd({ kind: "endless" })).toEqual({ kind: "endless" });
    expect(sanitizeEnd("n'importe quoi")).toBeNull();
  });
});

describe("équipes", () => {
  it("additionne les points de chaque équipe", () => {
    expect(
      teamScores([
        { team: 0, points: 10 },
        { team: 1, points: 7 },
        { team: 0, points: 3 },
        { team: null, points: 50 },
      ]),
    ).toEqual([13, 7]);
  });
});

describe("titres", () => {
  const line = (game: TitleCandidate["lines"][number]["game"], rank: number, stats: Record<string, number> = {}, players = 4) => ({
    game,
    rank,
    players,
    stats,
  });

  it("donne chaque titre au meilleur, deux au plus par joueur", () => {
    const titles = tourTitles([
      {
        userId: "a",
        name: "Alice",
        lines: [line("uno", 1, { plusGiven: 6 }), line("bricks", 1, { lines: 30, sent: 12 }), line("naval", 1, { shots: 20, hits: 12 })],
      },
      {
        userId: "b",
        name: "Bob",
        lines: [line("uno", 2, { plusGiven: 5 }), line("bricks", 4, { lines: 12 }), line("naval", 4, { shots: 10, hits: 3 })],
      },
      { userId: "c", name: "Chloé", lines: [line("uno", 4), line("bricks", 4), line("naval", 4)] },
    ]);
    const by = Object.fromEntries(titles.map((t) => [t.id, t.name]));
    expect(by.collector).toBe("Alice");
    expect(by["plus-four"]).toBe("Alice");
    // Alice a déjà deux titres : le maçon revient au suivant
    expect(by.mason).toBe("Bob");
    expect(by.brave).toBe("Chloé");
    expect(titles.filter((t) => t.userId === "a").length).toBeLessThanOrEqual(2);
    expect(titles.length).toBeLessThanOrEqual(5);
  });

  it("ne donne rien sans exploit", () => {
    expect(tourTitles([{ userId: "a", name: "Alice", lines: [line("uno", 2)] }])).toEqual([]);
  });
});
