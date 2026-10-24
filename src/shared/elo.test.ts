import { describe, expect, it } from "vitest";
import { botElo, ELO_FLOOR, ELO_K, eloChanges, type EloEntry } from "./elo.ts";

const human = (id: string, rating: number, rank: number, played = 20, team: number | null = null): EloEntry => ({
  id,
  rating,
  rank,
  team,
  isBot: false,
  played,
});
const bot = (id: string, rating: number, rank: number, team: number | null = null): EloEntry => ({
  id,
  rating,
  rank,
  team,
  isBot: true,
  played: 0,
});

describe("elo", () => {
  it("duel à niveau égal : le gagnant prend ce que perd le perdant", () => {
    const d = eloChanges([human("a", 1000, 1), human("b", 1000, 2)]);
    expect(d).toEqual({ a: ELO_K.settled / 2, b: -ELO_K.settled / 2 });
  });

  it("battre plus fort que soi rapporte plus que battre plus faible", () => {
    const up = eloChanges([human("a", 1000, 1), human("b", 1200, 2)]).a!;
    const down = eloChanges([human("a", 1000, 1), human("b", 800, 2)]).a!;
    expect(up).toBeGreaterThan(down);
    expect(down).toBeGreaterThan(0);
  });

  it("les premières parties bougent plus vite", () => {
    const fresh = eloChanges([human("a", 1000, 1, 0), human("b", 1000, 2)]).a!;
    const settled = eloChanges([human("a", 1000, 1, 30), human("b", 1000, 2)]).a!;
    expect(fresh).toBe(ELO_K.provisional / 2);
    expect(fresh).toBeGreaterThan(settled);
  });

  it("les bots ne bougent pas et comptent à leur niveau", () => {
    const d = eloChanges([human("a", 1000, 1), bot("x", botElo("naval", "amiral"), 2)]);
    expect(Object.keys(d)).toEqual(["a"]);
    expect(d.a).toBeGreaterThan(ELO_K.settled / 2);
    expect(botElo("naval", "mousse")).toBeLessThan(botElo("naval", "amiral"));
    expect(botElo("uno")).toBe(1000);
  });

  it("à plusieurs, gagner ne vaut pas plus qu'un match : la place compte", () => {
    const table = [1, 2, 3, 4, 5, 6].map((r) => human(`p${r}`, 1000, r));
    const d = eloChanges(table);
    expect(d.p1).toBe(ELO_K.settled / 2);
    expect(d.p6).toBe(-ELO_K.settled / 2);
    // Du premier au dernier, chaque place rapporte moins que la précédente
    for (let r = 1; r < 6; r++) expect(d[`p${r}`]!).toBeGreaterThan(d[`p${r + 1}`]!);
  });

  it("en équipes, on ne se mesure pas à son coéquipier", () => {
    const d = eloChanges([human("a", 1000, 1, 20, 0), human("b", 1000, 3, 20, 1), human("c", 1400, 1, 20, 0), bot("d", 1000, 3, 1)]);
    // a et c ont battu les mêmes adversaires : c, plus fort, gagne moins
    expect(d.a).toBeGreaterThan(0);
    expect(d.c).toBeGreaterThan(0);
    expect(d.a!).toBeGreaterThan(d.c!);
    expect(d.b).toBeLessThan(0);
  });

  it("l'Elo ne descend pas sous le plancher", () => {
    const d = eloChanges([human("a", ELO_FLOOR, 2), human("b", 2000, 1)]);
    expect(d.a).toBe(0);
  });
});
