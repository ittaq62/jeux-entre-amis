import { describe, expect, it } from "vitest";
import { aimDirection, planThrow, spareTarget } from "./bot.ts";
import { HEAD_PIN, rackOf } from "./lane.ts";
import {
  AIM_MS,
  createMatch,
  DEFAULT_CONFIG,
  INTRO_MS,
  mergeConfig,
  physOf,
  predChoices,
  predict,
  throwBall,
  thrower,
  tickMatch,
  timedOut,
  totalOf,
  type BowlingConfig,
  type Match,
} from "./match.ts";
import { frameScores } from "./score.ts";

const GUTTER = { x: 0.4, d: 0.012, v: 8, s: 0 };
const POCKET = { x: 0.35, d: aimDirection(0.35, 8.2, 20, 0.06, HEAD_PIN, physOf(DEFAULT_CONFIG)), v: 8.2, s: 20 };

function start(cfg: Partial<BowlingConfig>, ids: string[], teams?: (0 | 1)[]): Match {
  const m = createMatch(
    mergeConfig(DEFAULT_CONFIG, cfg),
    ids.map((id, i) => ({ id, team: teams?.[i] ?? 0 })),
    42,
    0,
  );
  expect(m.phase).toBe("intro");
  tickMatch(m, INTRO_MS);
  expect(m.phase).toBe("aim");
  return m;
}

/** Le joueur dont c'est le tour lance, puis on attend la fin de la présentation */
function play(m: Match, t: typeof GUTTER) {
  const who = thrower(m)!.id;
  const r = throwBall(m, who, t, m.phaseAt + 1000);
  if (typeof r === "string") throw new Error(r);
  expect(m.phase).toBe("roll");
  tickMatch(m, r.until);
  return r;
}

describe("bowling : la partie", () => {
  it("chacun son tour : deux boules par frame, puis le joueur suivant ; un strike passe la main tout de suite", () => {
    const m = start({ frames: 3 }, ["a", "b"]);
    expect(thrower(m)!.id).toBe("a");
    play(m, GUTTER);
    expect(thrower(m)!.id).toBe("a");
    expect(m.ball).toBe(1);
    play(m, GUTTER);
    expect(thrower(m)!.id).toBe("b");
    const strike = play(m, POCKET);
    expect(strike.down).toHaveLength(10);
    expect(thrower(m)!.id).toBe("a");
    expect(m.frame).toBe(1);
    expect(m.players[1]!.rolls[0]).toEqual([10]);
    expect(m.players[1]!.stats.strikes).toBe(1);
  });

  it("la deuxième boule part des quilles restées debout", () => {
    const m = start({ frames: 3 }, ["a"]);
    const first = play(m, { x: 0, d: 0, v: 8, s: 0 });
    expect(first.standing.length).toBeGreaterThan(0);
    expect(m.rack).toEqual(first.standing);
  });

  it("la dernière frame donne deux boules de plus après un strike, et la partie se termine", () => {
    const m = start({ frames: 3 }, ["a"]);
    play(m, POCKET);
    play(m, POCKET);
    play(m, POCKET);
    expect(m.phase).toBe("aim");
    expect(m.rack).toHaveLength(10);
    play(m, POCKET);
    play(m, GUTTER);
    expect(m.phase).toBe("over");
    expect(m.players[0]!.rolls).toEqual([[10], [10], [10, 10, 0]]);
    expect(totalOf(m, m.players[0]!)).toBe(frameScores(m.players[0]!.rolls, 3)[2]);
    expect(totalOf(m, m.players[0]!)).toBe(80);
    expect(m.ranks).toEqual([1]);
  });

  it("on ne lance pas à la place d'un autre, ni pendant qu'une boule roule", () => {
    const m = start({ frames: 3 }, ["a", "b"]);
    expect(typeof throwBall(m, "b", GUTTER, 5000)).toBe("string");
    const r = throwBall(m, "a", GUTTER, 5000);
    expect(typeof r).toBe("object");
    expect(typeof throwBall(m, "a", GUTTER, 5100)).toBe("string");
    expect(typeof throwBall(m, "a", { x: Number.NaN, d: 0, v: 8, s: 0 }, 5100)).toBe("string");
  });

  it("le temps pour lancer se compte", () => {
    const m = start({ frames: 3, pace: "court" }, ["a"]);
    expect(timedOut(m, m.phaseAt + AIM_MS.court - 1)).toBeNull();
    expect(timedOut(m, m.phaseAt + AIM_MS.court)!.id).toBe("a");
  });

  it("une partie entière de bots se joue jusqu'au bout, avec un classement", () => {
    const m = start({ frames: 5 }, ["a", "b", "c"]);
    const rng = { rng: 3 };
    let guard = 0;
    while (m.phase !== "over" && guard++ < 200) {
      const p = thrower(m)!;
      play(m, planThrow(m, p.id === "a" ? "fort" : p.id === "b" ? "moyen" : "facile", p.id === "c", rng));
    }
    expect(m.phase).toBe("over");
    for (const p of m.players) {
      expect(p.rolls).toHaveLength(5);
      expect(frameScores(p.rolls, 5).every((x) => x !== null)).toBe(true);
    }
    const tot = m.players.map((p) => totalOf(m, p));
    const best = Math.max(...tot);
    expect(m.ranks![tot.indexOf(best)]).toBe(1);
  });

  it("en équipes, on alterne les équipes, et l'équipe au plus gros total gagne", () => {
    const m = start({ frames: 3, teams: true }, ["a1", "a2", "b1"], [0, 0, 1]);
    expect(m.players.map((p) => p.id)).toEqual(["a1", "b1", "a2"]);
    let guard = 0;
    while (m.phase !== "over" && guard++ < 50) play(m, thrower(m)!.team === 0 ? POCKET : GUTTER);
    expect(m.ranks).toEqual([1, 2, 1]);
  });
});

describe("bowling : le défi des spares", () => {
  it("une boule par manche, les mêmes quilles pour tout le monde, un bonus quand tout tombe", () => {
    const m = start({ mode: "spares", frames: 5 }, ["a", "b"]);
    expect(m.challenge).toHaveLength(5);
    const rack = m.rack.map((p) => p.n);
    expect(rack).toEqual(m.challenge![0]);
    play(m, GUTTER);
    expect(thrower(m)!.id).toBe("b");
    expect(m.rack.map((p) => p.n)).toEqual(rack);
    expect(m.players[0]!.points[0]).toBe(0);
    let guard = 0;
    while (m.phase !== "over" && guard++ < 20) play(m, GUTTER);
    expect(m.phase).toBe("over");
    expect(m.players[0]!.points).toHaveLength(5);
  });

  it("la première manche est facile, la dernière est un split", () => {
    const m = start({ mode: "spares", frames: 10 }, ["a"]);
    expect(m.challenge![0]!.length).toBeLessThanOrEqual(3);
    expect(m.challenge![9]!.includes(1)).toBe(false);
  });
});

describe("bowling : les pronostics", () => {
  it("ceux qui regardent parient avant la boule ; un strike bien vu rapporte plus", () => {
    const m = start({ frames: 3 }, ["a", "b"]);
    expect(predChoices(m)).toEqual(["strike", "reste", "cata"]);
    expect(predict(m, "a", "strike")).not.toBeNull();
    expect(predict(m, "b", "strike")).toBeNull();
    expect(predict(m, "w:spectateur", "cata")).toBeNull();
    expect(predict(m, "b", "spare")).not.toBeNull();
    play(m, POCKET);
    expect(m.seers.b).toEqual({ points: 3, right: 1, tries: 1 });
    expect(m.seers["w:spectateur"]).toEqual({ points: 0, right: 0, tries: 1 });
    expect(m.lastPreds.b).toEqual({ pick: "strike", right: true, points: 3 });
    // Après le lancer, les paris repartent de zéro, et on ne parie plus pendant que la boule roule
    expect(m.preds).toEqual({});
    throwBall(m, "b", GUTTER, m.phaseAt + 100);
    expect(predict(m, "a", "strike")).not.toBeNull();
  });

  it("pas de pronostics si la table n'en veut pas", () => {
    const m = start({ frames: 3, pronostics: false }, ["a", "b"]);
    expect(predict(m, "b", "strike")).not.toBeNull();
  });
});

describe("bowling : les réglages", () => {
  it("le nombre de frames se cale sur les choix possibles", () => {
    expect(mergeConfig(DEFAULT_CONFIG, { frames: 7 }).frames).toBe(5);
    expect(mergeConfig(DEFAULT_CONFIG, { mode: "spares", frames: 3 }).frames).toBe(5);
    expect(mergeConfig(DEFAULT_CONFIG, { salle: "nulle-part" as never }).salle).toBe("hasard");
    expect(mergeConfig(DEFAULT_CONFIG, { bumpers: true, lune: "oui" as never })).toMatchObject({ bumpers: true, lune: false });
  });

  it("les bots visent la quille de devant d'un spare, du côté des autres", () => {
    const t = spareTarget(rackOf([3, 6, 10]));
    expect(t.x).toBeGreaterThan(0.15);
    expect(t.x).toBeLessThan(0.23);
  });
});
