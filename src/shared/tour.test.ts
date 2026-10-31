import { describe, expect, it } from "vitest";
import { random } from "./rng.ts";
import { DEFAULT_SETTINGS as BRICKS_DEFAULTS } from "./games/bricks/engine.ts";
import { DEFAULT_SETTINGS as CAPITALE_DEFAULTS } from "./games/capitale/engine.ts";
import { DEFAULT_SETTINGS as NAVAL_DEFAULTS } from "./games/naval/engine.ts";
import { DEFAULT_SETTINGS as UNO_DEFAULTS } from "./games/uno/engine.ts";
import {
  adoptedVariant,
  baseVariant,
  drawGame,
  drawVariant,
  findVariant,
  fitsGame,
  gameVariants,
  resolveVariant,
  TOUR_GAMES,
  variantSettings,
  voteNeed,
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

  it("écarte les jeux déjà joués quand chaque jeu ne passe qu'une fois", () => {
    for (let i = 0; i < 30; i++) expect(drawGame(["uno", "bricks", "naval"], 4, "bricks", rand, ["uno", "bricks"])).toBe("naval");
    expect(drawGame(["uno", "bricks"], 4, "bricks", rand, ["uno", "bricks"])).toBeNull();
    // Le seul jeu restant passe, même s'il vient d'être joué ailleurs dans la liste
    expect(drawGame(["uno"], 3, null, rand, [])).toBe("uno");
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

describe("règles des jeux", () => {
  const rng = { rng: 7 };
  const rand = () => random(rng);
  const defaults = { uno: UNO_DEFAULTS, naval: NAVAL_DEFAULTS, bricks: BRICKS_DEFAULTS, capitale: CAPITALE_DEFAULTS };

  it("propose plusieurs variantes par jeu, la première étant celle de base, sans rien changer", () => {
    for (const game of TOUR_GAMES) {
      const all = gameVariants(game);
      expect(all.length).toBeGreaterThanOrEqual(3);
      expect(new Set(all.map((v) => v.id)).size).toBe(all.length);
      expect(baseVariant(game)).toBe(all[0]!.id);
      expect(variantSettings(game as "uno", baseVariant(game))).toEqual({});
    }
  });

  it("ne touche qu'à de vrais réglages du jeu, avec des valeurs du bon type", () => {
    for (const game of TOUR_GAMES) {
      const base = defaults[game] as unknown as Record<string, unknown>;
      for (const v of gameVariants(game)) {
        for (const [key, value] of Object.entries(variantSettings(game as "uno", v.id))) {
          expect(key in base, `${game}/${v.id}/${key}`).toBe(true);
          expect(typeof value).toBe(typeof base[key]);
        }
      }
    }
  });

  it("ne garde jamais les équipes, les bots ni le solo, réglés par la tournée", () => {
    for (const game of TOUR_GAMES) {
      for (const v of gameVariants(game)) {
        const keys = Object.keys(variantSettings(game as "uno", v.id));
        // La tournée règle aussi la durée de Capitale (20 minutes) : ses variantes n'y touchent pas
        const owned = ["teams", "botLevel", "sprint", "endMode", "turnSeconds", ...(game === "capitale" ? ["end", "minutes"] : [])];
        expect(keys.filter((k) => owned.includes(k))).toEqual([]);
      }
    }
  });

  it("ignore une variante inconnue", () => {
    expect(findVariant("uno", "n'importe quoi")).toBeNull();
    expect(variantSettings("naval", "n'importe quoi")).toEqual({});
    expect(findVariant("bricks", "chrono")?.name).toBe("K.O. au chrono");
  });

  it("tire toutes les variantes au hasard", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(drawVariant("naval", rand));
    expect(seen.size).toBe(gameVariants("naval").length);
  });

  it("adopte une variante dès la moitié des voix des joueurs présents", () => {
    expect(voteNeed(1)).toBe(1);
    expect(voteNeed(2)).toBe(1);
    expect(voteNeed(3)).toBe(2);
    expect(voteNeed(4)).toBe(2);
    expect(voteNeed(0)).toBe(1);
    const voters = ["a", "b", "c"];
    expect(adoptedVariant({ a: "salve" }, voters)).toBeNull();
    expect(adoptedVariant({ a: "salve", b: "salve" }, voters)).toBe("salve");
    // Les voix de ceux qui ne sont plus là ne comptent pas
    expect(adoptedVariant({ a: "salve", z: "salve" }, voters)).toBeNull();
    expect(adoptedVariant({ a: "salve", z: "salve" }, ["a", "b"])).toBe("salve");
  });

  it("au départ, prend la plus votée, ou celle de base sans voix", () => {
    expect(resolveVariant("uno", {}, ["a", "b"], rand)).toBe("classique");
    expect(resolveVariant("uno", { a: "no-mercy", b: "no-mercy", c: "pioche" }, ["a", "b", "c"], rand)).toBe("no-mercy");
    // Une voix inconnue est écartée
    expect(resolveVariant("uno", { a: "triche" }, ["a"], rand)).toBe("classique");
    // À égalité, l'une des ex aequo, jamais une autre
    for (let i = 0; i < 40; i++) {
      expect(["pioche", "sept-zero"]).toContain(resolveVariant("uno", { a: "pioche", b: "sept-zero" }, ["a", "b"], rand));
    }
  });
});
