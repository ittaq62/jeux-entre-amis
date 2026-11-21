import { describe, expect, it } from "vitest";
import { navDist, navOf, planShot, type BotLevel } from "./bot.ts";
import { BALL_R, strokeLimit, tileAt } from "./course.ts";
import { COURSES, courseOf, readyCourses, type HoleRef } from "./courses.ts";
import { inRings } from "./geom.ts";
import { DEFAULT_PHYS, simulateShot, type PhysOpts } from "./physics.ts";

const refs: HoleRef[] = readyCourses().flatMap((c) => COURSES[c].holes.map((_, i) => ({ c, i, m: false })));

function physOf(ref: HoleRef): PhysOpts {
  return { ...DEFAULT_PHYS, g: COURSES[ref.c].g };
}

/** Un bot joue le trou seul ; renvoie ses coups (pénalités comprises), ou la limite + 1 */
function botPlays(ref: HoleRef, level: BotLevel, seed: number): number {
  const c = courseOf(ref);
  const phys = physOf(ref);
  const rng = { rng: seed };
  let ball = { x: c.tee.x, y: c.tee.y, z: c.tee.z };
  let strokes = 0;
  let tick = 0;
  const limit = strokeLimit(c.def.par);
  while (strokes < limit) {
    const plan = planShot(c, ball, tick, phys, level, rng);
    tick += plan.wait;
    const r = simulateShot(c, ball, plan.a, plan.p, tick, phys);
    strokes++;
    tick = r.end + 240;
    if (r.outcome === "in") return strokes;
    if (r.outcome === "lost") strokes++;
    else ball = { x: r.x, y: r.y, z: r.z };
  }
  return limit + 1;
}

describe("minigolf : les trous des parcours", () => {
  it.each(refs.map((r) => [`${r.c} ${r.i + 1}`, r] as const))("%s est bien formé", (_, ref) => {
    const c = courseOf(ref);
    // Les morceaux ne se chevauchent pas
    for (let x = c.box.x0 + 0.0137; x < c.box.x1; x += 0.093) {
      for (let z = c.box.z0 + 0.0071; z < c.box.z1; z += 0.093) {
        let n = 0;
        for (const t of c.tiles) if (inRings(x, z, t.rings)) n++;
        expect(n, `deux morceaux en (${x.toFixed(2)}, ${z.toFixed(2)})`).toBeLessThanOrEqual(1);
      }
    }
    // Le départ et les trous sont sur du sol jouable, loin des murs
    for (const p of [[c.tee.x, c.tee.z], ...c.cups.map((k) => [k.x, k.z])] as [number, number][]) {
      const t = tileAt(c, p[0], p[1]);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(c.tiles[t]!.phys.hazard).toBeFalsy();
    }
    // Le départ mène au trou
    expect(navDist(navOf(c), c.tee.x, c.tee.z)).toBeLessThan(Infinity);
    // Une balle posée au départ ne bouge pas
    const still = simulateShot(c, { x: c.tee.x, y: c.tee.y, z: c.tee.z }, c.tee.aim, 0, 0, physOf(ref));
    expect(Math.hypot(still.x - c.tee.x, still.z - c.tee.z)).toBeLessThan(0.5);
    expect(c.tee.y).toBeGreaterThan(BALL_R - 1);
  });

  it.each(refs.map((r) => [`${r.c} ${r.i + 1}`, r] as const))("%s se joue : un bot fort finit près du par", (_, ref) => {
    const c = courseOf(ref);
    const scores = [1, 2, 3].map((s) => botPlays(ref, "fort", s * 7919 + ref.i));
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(Math.max(...scores), `coups : ${scores.join(", ")}`).toBeLessThanOrEqual(strokeLimit(c.def.par));
    expect(avg, `coups : ${scores.join(", ")}`).toBeLessThanOrEqual(c.def.par + 1.5);
  });
});
