import { describe, expect, it } from "vitest";
import { ARENA_IDS } from "./arenas.ts";
import { createFight, DEFAULT_FIGHT_SETTINGS } from "./engine.ts";
import type { Fight } from "./model.ts";
import { addRound, newSeries, roundPoints, seriesArena, seriesRanks } from "./series.ts";

const seat = (id: string, team = 0) => ({ id, name: id.toUpperCase(), userId: id, bot: false, team });

/** Un combat fini où chacun a cette place et ce nombre de sorties */
function finished(result: Record<string, { rank: number; kos?: number }>, teams = false): Fight {
  const ids = Object.keys(result);
  const f = createFight(
    { ...DEFAULT_FIGHT_SETTINGS, teams },
    "place",
    ids.map((id, i) => ({ id, team: teams ? i % 2 : i, style: "ginette" })),
    1,
  );
  f.phase = "over";
  for (const ft of f.fighters) {
    ft.rank = result[ft.id]!.rank;
    ft.stats.kos = result[ft.id]!.kos ?? 0;
  }
  return f;
}

describe("Culbute en tournée : plusieurs combats d'affilée", () => {
  it("chaque manche rapporte les points de sa place, et le total fait le classement", () => {
    const s = newSeries([seat("a"), seat("b"), seat("c")]);
    addRound(s, finished({ a: { rank: 1 }, b: { rank: 2 }, c: { rank: 3 } }));
    s.round = 2;
    addRound(s, finished({ a: { rank: 3 }, b: { rank: 1 }, c: { rank: 2 } }));
    s.round = 3;
    addRound(s, finished({ a: { rank: 3 }, b: { rank: 2 }, c: { rank: 1 } }));
    expect(s.points).toEqual({ a: 10 + 5 + 5, b: 7 + 10 + 7, c: 5 + 7 + 10 });
    expect(s.places.a).toEqual([1, 3, 3]);
    expect(seriesRanks(s, false)).toEqual({ b: 1, c: 2, a: 3 });
  });

  it("à égalité de points, les sorties départagent, puis la place à la dernière manche ; sinon, ex aequo", () => {
    const s = newSeries([seat("a"), seat("b")]);
    addRound(s, finished({ a: { rank: 1, kos: 3 }, b: { rank: 2, kos: 2 } }));
    s.round = 2;
    addRound(s, finished({ a: { rank: 2, kos: 1 }, b: { rank: 1, kos: 3 } }));
    // 17 points chacun, 4 sorties contre 5
    expect(seriesRanks(s, false)).toEqual({ b: 1, a: 2 });
    const t = newSeries([seat("a"), seat("b")]);
    addRound(t, finished({ a: { rank: 1, kos: 1 }, b: { rank: 2, kos: 2 } }));
    t.round = 2;
    addRound(t, finished({ a: { rank: 2, kos: 2 }, b: { rank: 1, kos: 1 } }));
    // Même total, mêmes sorties : b a gagné la dernière manche
    expect(seriesRanks(t, false)).toEqual({ b: 1, a: 2 });
    const u = newSeries([seat("a"), seat("b")]);
    addRound(u, finished({ a: { rank: 1 }, b: { rank: 1 } }));
    expect(seriesRanks(u, false)).toEqual({ a: 1, b: 1 });
  });

  it("celui qui part en cours de route garde ses points, sans place aux manches suivantes", () => {
    const s = newSeries([seat("a"), seat("b"), seat("c")]);
    addRound(s, finished({ a: { rank: 1 }, b: { rank: 2 }, c: { rank: 3 } }));
    s.round = 2;
    addRound(s, finished({ b: { rank: 1 }, c: { rank: 2 } }));
    expect(s.places.a).toEqual([1, 0]);
    expect(s.points.a).toBe(10);
    // b : 7 + 10, c : 5 + 7, a : 10 (une seule manche)
    expect(seriesRanks(s, false)).toEqual({ b: 1, c: 2, a: 3 });
  });

  it("en équipes, les coéquipiers partagent la place de leur équipe", () => {
    const s = newSeries([seat("a", 0), seat("b", 1), seat("c", 0), seat("d", 1)]);
    addRound(s, finished({ a: { rank: 1, kos: 2 }, b: { rank: 2 }, c: { rank: 1 }, d: { rank: 2, kos: 3 } }, true));
    const ranks = seriesRanks(s, true);
    expect(ranks.a).toBe(1);
    expect(ranks.c).toBe(1);
    expect(ranks.b).toBe(2);
    expect(ranks.d).toBe(2);
  });

  it("les statistiques s'additionnent, et chaque manche change d'arène", () => {
    const s = newSeries([seat("a"), seat("b")]);
    addRound(s, finished({ a: { rank: 1, kos: 2 }, b: { rank: 2 } }));
    s.round = 2;
    addRound(s, finished({ a: { rank: 1, kos: 3 }, b: { rank: 2 } }));
    expect(s.totals.a!.kos).toBe(5);
    expect(s.totals.a!.won).toBe(2);
    const t = newSeries([seat("a"), seat("b")]);
    for (let i = 0; i < ARENA_IDS.length; i++) {
      const arena = seriesArena({ arena: "hasard" }, t, Math.random);
      expect(t.arenas).not.toContain(arena);
      t.arenas.push(arena);
    }
    expect(seriesArena({ arena: "bal" }, t, Math.random)).toBe("bal");
    expect(roundPoints(1)).toBe(10);
    expect(roundPoints(9)).toBe(1);
  });
});
