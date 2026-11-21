import { describe, expect, it } from "vitest";
import { planShot } from "./bot.ts";
import { strokeLimit } from "./course.ts";
import { courseOf } from "./courses.ts";
import {
  createMatch,
  currentRef,
  DEFAULT_CONFIG,
  drawHoles,
  HURRY_MS,
  INTRO_MS,
  mergeConfig,
  nowTick,
  physOf,
  readyToShoot,
  shoot,
  tickMatch,
  totals,
  type Match,
} from "./match.ts";
import { STEPS_PER_S } from "./physics.ts";

const T0 = 1_000_000;

function cfg(patch: Partial<typeof DEFAULT_CONFIG> = {}) {
  return mergeConfig(DEFAULT_CONFIG, { course: "jardin", ...patch });
}

/** Fait jouer des bots jusqu'à la fin (ceux de `idle` ne jouent jamais) ; renvoie l'heure de fin */
function playOut(m: Match, idle: string[] = [], step = 200): number {
  let now = T0;
  const rng = { rng: 42 };
  for (let guard = 0; guard < 200_000 && m.phase !== "over"; guard++) {
    now += step;
    tickMatch(m, now);
    for (const p of readyToShoot(m, now)) {
      if (idle.includes(p.id)) continue;
      const c = courseOf(currentRef(m));
      const plan = planShot(c, { x: p.ball[0], y: p.ball[1], z: p.ball[2] }, nowTick(m, now), physOf(m.cfg, currentRef(m)), "fort", rng);
      const r = shoot(m, p.id, plan.a, plan.p, nowTick(m, now), now);
      expect(typeof r).not.toBe("string");
    }
  }
  return now;
}

describe("minigolf : la partie", () => {
  it("tire les trous : un parcours dans l'ordre, ou quelques-uns", () => {
    expect(drawHoles(cfg(), { rng: 1 }).map((h) => h.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const three = drawHoles(cfg({ holes: 3 }), { rng: 5 });
    expect(three).toHaveLength(3);
    expect(new Set(three.map((h) => h.i)).size).toBe(3);
    expect([...three.map((h) => h.i)].sort((a, b) => a - b)).toEqual(three.map((h) => h.i));
    // Dix-huit trous : deux parcours différents à la suite
    const eighteen = drawHoles(cfg({ holes: 18 }), { rng: 1 });
    expect(eighteen).toHaveLength(18);
    expect(eighteen.slice(0, 9).every((h) => h.c === "jardin")).toBe(true);
    expect(eighteen.slice(9).every((h) => h.c !== "jardin" && !h.m)).toBe(true);
  });

  it("refuse un coup pendant la présentation, puis quand la balle roule encore", () => {
    const m = createMatch(cfg({ holes: 3 }), [{ id: "a", team: 0 }], 7, T0);
    expect(typeof shoot(m, "a", -Math.PI / 2, 0.5, 0, T0 + 100)).toBe("string");
    expect(tickMatch(m, T0 + INTRO_MS)).toBe(true);
    expect(m.phase).toBe("play");
    const now = T0 + INTRO_MS + 1000;
    const s = shoot(m, "a", -Math.PI / 2, 0.45, nowTick(m, now), now);
    expect(typeof s).toBe("object");
    expect(shoot(m, "a", -Math.PI / 2, 0.45, nowTick(m, now + 100), now + 100)).toBe("Ta balle roule encore.");
  });

  it("un coup ne peut pas partir plus tôt que le retard permis", () => {
    const m = createMatch(cfg({ holes: 3 }), [{ id: "a", team: 0 }], 7, T0);
    const now = T0 + INTRO_MS + 10_000;
    tickMatch(m, now);
    const s = shoot(m, "a", -Math.PI / 2, 0.3, 0, now);
    expect(typeof s === "object" && s.at).toBe(nowTick(m, now) - Math.round(0.35 * STEPS_PER_S));
  });

  it("se joue jusqu'au bout avec des bots, et classe les joueurs", () => {
    const m = createMatch(
      cfg({ holes: 3 }),
      [
        { id: "a", team: 0 },
        { id: "b", team: 1 },
        { id: "c", team: 0 },
      ],
      3,
      T0,
    );
    playOut(m);
    expect(m.phase).toBe("over");
    expect(m.ranks).toHaveLength(3);
    for (const p of m.players) {
      expect(p.scores.every((s) => s !== null && s >= 1)).toBe(true);
      expect(p.stats.holes).toBe(3);
    }
    const tot = totals(m);
    const best = Math.min(...tot);
    // Les premiers ont le meilleur total, et quelqu'un est premier
    expect(m.ranks!.some((r) => r === 1)).toBe(true);
    m.ranks!.forEach((r, i) => r === 1 && expect(tot[i]).toBe(best));
  });

  it("presse les retardataires quand la moitié a fini, et donne la limite à qui n'a pas joué", () => {
    const m = createMatch(
      cfg({ holes: 3 }),
      [
        { id: "a", team: 0 },
        { id: "b", team: 1 },
      ],
      9,
      T0,
    );
    let now = T0;
    const rng = { rng: 3 };
    let hurriedAt = 0;
    while (m.hole === 0 && m.phase !== "scores") {
      now += 200;
      tickMatch(m, now);
      if (m.hurry && !hurriedAt) hurriedAt = now;
      for (const p of readyToShoot(m, now)) {
        if (p.id === "b") continue;
        const c = courseOf(currentRef(m));
        const plan = planShot(c, { x: p.ball[0], y: p.ball[1], z: p.ball[2] }, nowTick(m, now), physOf(m.cfg, currentRef(m)), "fort", rng);
        shoot(m, p.id, plan.a, plan.p, nowTick(m, now), now);
      }
    }
    expect(hurriedAt).toBeGreaterThan(0);
    expect(now - hurriedAt).toBeGreaterThanOrEqual(HURRY_MS - 400);
    expect(now - hurriedAt).toBeLessThan(HURRY_MS + 3000);
    const par = courseOf(m.holes[0]!).def.par;
    expect(m.players[1]!.scores[0]).toBe(strokeLimit(par) + 1);
  });

  it("une balle à l'eau coûte un coup de plus et revient d'où elle est partie", () => {
    const m = createMatch(cfg({ holes: 9 }), [{ id: "a", team: 0 }], 1, T0);
    // Au troisième trou (la fontaine) : on passe les deux premiers
    m.hole = 1;
    m.phase = "scores";
    m.phaseAt = T0;
    tickMatch(m, T0 + 10_000);
    tickMatch(m, T0 + 10_000 + INTRO_MS);
    expect(m.hole).toBe(2);
    const p = m.players[0]!;
    const start = [...p.ball];
    const now = T0 + 10_000 + INTRO_MS + 500;
    // Droit dans le bassin, à côté du pont
    const s = shoot(m, "a", -Math.PI / 2 + 0.12, 0.5, nowTick(m, now), now);
    expect(typeof s === "object" && s.out).toBe("lost");
    expect(p.cur).toBe(2);
    expect(p.ball).toEqual(start);
  });

  it("en équipes, la meilleure balle de l'équipe compte", () => {
    const m = createMatch(
      cfg({ holes: 3, teams: true }),
      [
        { id: "a", team: 0 },
        { id: "b", team: 0 },
        { id: "c", team: 1 },
      ],
      1,
      T0,
    );
    m.players[0]!.scores = [5, 2, 4];
    m.players[1]!.scores = [3, 4, 4];
    m.players[2]!.scores = [3, 3, 3];
    expect(totals(m)).toEqual([3 + 2 + 4, 3 + 2 + 4, 9]);
  });
});
