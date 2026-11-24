import { describe, expect, it } from "vitest";
import { planShot } from "./bot.ts";
import {
  createMatch,
  DEFAULT_CONFIG,
  legalTargets,
  mergeConfig,
  mustCall,
  takeShot,
  tickMatch,
  type BillardConfig,
  type BotLevel,
  type Match,
} from "./match.ts";
import type { PhysEvent } from "./physics.ts";
import { judge, type RulesState } from "./rules.ts";
import type { BallSpot } from "./shot.ts";

const ev = (k: PhysEvent["k"], a: number, b: number, s = 10, v = 1): PhysEvent => ({ s, k, a, b, v, x: 0, y: 0 });
const balls = (ids: number[]): BallSpot[] => ids.map((id, i) => ({ id, x: i * 0.1 - 0.5, y: 0 }));

const huit = (over: Partial<RulesState> = {}): RulesState => ({
  variant: "huit",
  breakShot: false,
  cue: 0,
  before: balls([0, 1, 2, 3, 8, 9, 10]),
  group: null,
  call: null,
  bandes: 0,
  ...over,
});

describe("les règles du billard", () => {
  it("pleines et rayées : la table ouverte donne sa famille à la première bille rentrée", () => {
    const o = judge(huit(), [ev("bille", 0, 9), ev("poche", 9, 2, 30)]);
    expect(o.foul).toBeNull();
    expect(o.assign).toBe("rayees");
    expect(o.keep).toBe(true);
  });

  it("pleines et rayées : la mauvaise bille d'abord, la blanche dans un trou, rien de touché, aucune bande : faute", () => {
    expect(judge(huit({ group: "pleines" }), [ev("bille", 0, 9), ev("bande", 9, 1, 20)]).foul).toBe("mauvaise");
    expect(judge(huit({ group: "pleines" }), [ev("bille", 0, 1), ev("poche", 0, 3, 20)]).foul).toBe("blanche");
    expect(judge(huit(), [ev("bande", 0, 2)]).foul).toBe("rien");
    expect(judge(huit({ group: "pleines" }), [ev("bille", 0, 1)]).foul).toBe("bande");
    const f = judge(huit({ group: "pleines" }), [ev("bille", 0, 1), ev("poche", 0, 3, 20)]);
    expect(f.inHand).toBe("partout");
    expect(f.keep).toBe(false);
  });

  it("pleines et rayées : la noire trop tôt perd la manche, la noire à la casse revient, la noire annoncée gagne", () => {
    expect(judge(huit({ group: "pleines" }), [ev("bille", 0, 1), ev("bille", 1, 8, 12), ev("poche", 8, 0, 30)]).rack).toBe("lost");
    const brk = judge(huit({ breakShot: true }), [ev("bille", 0, 1), ev("poche", 8, 0, 30)]);
    expect(brk.rack).toBeUndefined();
    expect(brk.respot).toEqual([8]);
    const end = huit({ group: "pleines", before: balls([0, 8, 9, 10]), call: 4 });
    expect(judge(end, [ev("bille", 0, 8), ev("poche", 8, 4, 30)]).rack).toBe("won");
    expect(judge(end, [ev("bille", 0, 8), ev("poche", 8, 1, 30)]).rack).toBe("lost");
    expect(judge(end, [ev("bille", 0, 8), ev("poche", 8, 4, 30), ev("poche", 0, 2, 40)]).rack).toBe("lost");
  });

  it("la bille 9 : la plus petite d'abord, la 9 gagne même à la casse, la 9 tombée sur une faute revient", () => {
    const st: RulesState = { ...huit(), variant: "neuf", before: balls([0, 3, 5, 9]) };
    expect(judge(st, [ev("bille", 0, 5), ev("bande", 5, 1, 20)]).foul).toBe("mauvaise");
    expect(judge({ ...st, breakShot: true }, [ev("bille", 0, 3), ev("bille", 3, 9, 12), ev("poche", 9, 2, 30)]).rack).toBe("won");
    const f = judge(st, [ev("bille", 0, 5), ev("bille", 5, 9, 12), ev("poche", 9, 2, 30)]);
    expect(f.foul).toBe("mauvaise");
    expect(f.respot).toEqual([9]);
  });

  it("le Killer : rien rentré coûte une vie (pas à la casse), la noire en rapporte une, une faute en coûte une", () => {
    const st: RulesState = { ...huit(), variant: "killer" };
    expect(judge(st, [ev("bille", 0, 3), ev("bande", 3, 1, 20)]).lives).toBe(-1);
    expect(judge({ ...st, breakShot: true }, [ev("bille", 0, 3), ev("bande", 3, 1, 20)]).lives).toBe(0);
    expect(judge(st, [ev("bille", 0, 8), ev("poche", 8, 1, 20)]).lives).toBe(1);
    expect(judge(st, [ev("bille", 0, 3), ev("poche", 3, 1, 20)]).lives).toBe(0);
    expect(judge(st, [ev("bille", 0, 3), ev("poche", 0, 1, 20)]).lives).toBe(-1);
  });

  it("trois billes : un point quand la bille jouée touche les deux autres, avec les bandes qu'il faut", () => {
    const st: RulesState = { ...huit(), variant: "carambole", before: balls([0, 1, 2]) };
    expect(judge(st, [ev("bille", 0, 2), ev("bande", 0, 1, 20), ev("bille", 0, 1, 30)]).points).toBe(1);
    expect(judge(st, [ev("bille", 0, 2), ev("bande", 2, 1, 20)]).points).toBe(0);
    const three = { ...st, bandes: 3 };
    expect(judge(three, [ev("bille", 0, 2), ev("bande", 0, 1, 20), ev("bille", 0, 1, 30)]).points).toBe(0);
    const ok = judge(three, [
      ev("bille", 0, 2),
      ev("bande", 0, 1, 20),
      ev("bande", 0, 2, 25),
      ev("bande", 0, 3, 28),
      ev("bille", 0, 1, 30),
    ]);
    expect(ok.points).toBe(1);
    expect(ok.highlight?.kind).toBe("carambolage");
  });

  it("par la bande : compté même quand le ralenti montre autre chose (la noire qui gagne), pas sur une faute", () => {
    const end = huit({ group: "pleines", before: balls([0, 8, 9, 10]), call: 4 });
    const win = judge(end, [ev("bille", 0, 8), ev("bande", 8, 1, 20), ev("poche", 8, 4, 30)]);
    expect(win.rack).toBe("won");
    expect(win.highlight?.kind).toBe("victoire");
    expect(win.banked).toBe(true);
    const plain = huit({ group: "pleines" });
    expect(judge(plain, [ev("bille", 0, 1), ev("bande", 1, 2, 20), ev("poche", 1, 3, 30)]).banked).toBe(true);
    expect(judge(plain, [ev("bille", 0, 1), ev("poche", 1, 3, 30)]).banked).toBeUndefined();
    const scratch = [ev("bille", 0, 1), ev("bande", 1, 2, 20), ev("poche", 1, 3, 30), ev("poche", 0, 0, 40)];
    expect(judge(plain, scratch).banked).toBeUndefined();
  });
});

/** Une partie entière entre bots ; renvoie la partie finie */
function botGame(cfg: Partial<BillardConfig>, levels: BotLevel[], seed: number): Match {
  const m = createMatch(
    mergeConfig(DEFAULT_CONFIG, cfg),
    levels.map((_, i) => ({ id: `p${i}`, team: (i % 2) as 0 | 1 })),
    seed,
    0,
  );
  const rng = { rng: seed * 7 + 1 };
  let now = 0;
  for (let guard = 0; guard < 1500 && m.phase !== "over"; guard++) {
    if (m.phase === "aim") {
      const i = Number(m.shooter.slice(1));
      expect(legalTargets(m).length).toBeGreaterThan(0);
      const r = takeShot(m, m.shooter, planShot(m, levels[i]!, rng), now);
      expect(typeof r).not.toBe("string");
    }
    now = m.deadline;
    tickMatch(m, now);
  }
  return m;
}

describe("des parties entre bots", () => {
  it("pleines et rayées en duel, puis à quatre en deux équipes : la partie va au bout", () => {
    const duel = botGame({ variant: "huit" }, ["fort", "moyen"], 11);
    expect(duel.phase).toBe("over");
    expect([...duel.ranks!].sort()).toEqual([1, 2]);
    const teams = botGame({ variant: "huit", races: 2 }, ["moyen", "facile", "moyen", "facile"], 12);
    expect(teams.phase).toBe("over");
    expect(teams.sides.length).toBe(2);
    expect(Math.max(...teams.sides.map((s) => s.racks))).toBe(2);
  });

  it("la bille 9 à trois, chacun pour soi", () => {
    const m = botGame({ variant: "neuf", races: 2 }, ["fort", "moyen", "facile"], 21);
    expect(m.phase).toBe("over");
    expect(m.sides.length).toBe(3);
    expect(m.ranks!.filter((r) => r === 1).length).toBe(1);
  });

  it("le Killer à cinq : un seul survivant, les autres classés dans l'ordre inverse de leur sortie", () => {
    const m = botGame({ variant: "killer", lives: 2 }, ["moyen", "moyen", "facile", "fort", "facile"], 31);
    expect(m.phase).toBe("over");
    expect(m.players.filter((p) => !p.out).length).toBe(1);
    expect([...m.ranks!].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("la carambole : aux points, ou au bout des reprises", () => {
    const m = botGame({ variant: "carambole", points: 5 }, ["fort", "moyen"], 41);
    expect(m.phase).toBe("over");
    const short = botGame({ variant: "carambole", points: 20, innings: 10, bandes: 3 }, ["facile", "facile", "facile"], 42);
    expect(short.phase).toBe("over");
    expect(short.innings).toBeGreaterThanOrEqual(10);
  });

  it("annoncer la poche de la noire, une fois sa famille rentrée", () => {
    const m = createMatch(
      mergeConfig(DEFAULT_CONFIG, {}),
      [
        { id: "a", team: 0 },
        { id: "b", team: 1 },
      ],
      5,
      0,
    );
    m.phase = "aim";
    m.breakShot = false;
    m.sides[m.turn]!.group = "pleines";
    m.balls = m.balls.filter((b) => !(b.id >= 1 && b.id <= 7));
    expect(mustCall(m)).toBe(true);
    expect(legalTargets(m)).toEqual([8]);
  });
});

describe("une bille qui pend au bord d'un trou", () => {
  it("les bots la poussent dedans (avant, ils la croyaient derrière la bande et tiraient à côté sans fin)", () => {
    const m = createMatch(
      mergeConfig(DEFAULT_CONFIG, { variant: "neuf" }),
      [
        { id: "p0", team: 0 },
        { id: "p1", team: 1 },
      ],
      1024,
      0,
    );
    // La position de la partie de bots qui ne finissait pas : la 5 arrêtée dans la gueule de la poche du milieu
    m.phase = "aim";
    m.breakShot = false;
    m.inHand = "partout";
    m.balls = [
      { id: 0, x: -0.5, y: -0.351 },
      { id: 5, x: -0.005, y: -0.59 },
      { id: 6, x: 0.257, y: 0.138 },
      { id: 9, x: 0.668, y: -0.002 },
    ];
    expect(legalTargets(m)).toEqual([5]);
    for (const level of ["facile", "moyen", "fort"] as BotLevel[]) {
      const copy = structuredClone(m);
      const r = takeShot(copy, copy.shooter, planShot(copy, level, { rng: 7 }), 0);
      if (typeof r === "string") throw new Error(r);
      expect(r.outcome.foul).toBeNull();
      expect(r.pocketed.map((p) => p.id)).toContain(5);
    }
  });
});
