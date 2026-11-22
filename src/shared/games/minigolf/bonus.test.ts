import { describe, expect, it } from "vitest";
import { bonusCourse, bonusSpots, BONUS_KINDS } from "./bonus.ts";
import { tileAt } from "./course.ts";
import { COURSES, courseOf, readyCourses, type HoleRef } from "./courses.ts";
import { createMatch, DEFAULT_CONFIG, mergeConfig, nowTick, shoot, tickMatch } from "./match.ts";

const refs: HoleRef[] = readyCourses().flatMap((c) => COURSES[c].holes.flatMap((_, i) => [false, true].map((m) => ({ c, i, m }))));

describe("minigolf : les bulles bonus", () => {
  it("chaque trou a ses bulles, sur la piste, loin du départ et des trous", () => {
    let total = 0;
    for (const ref of refs) {
      const c = courseOf(ref);
      const spots = bonusSpots(ref);
      expect(spots.length, `${ref.c} ${ref.i + 1}`).toBeLessThanOrEqual(3);
      total += spots.length;
      for (const s of spots) {
        const t = tileAt(c, s.at[0], s.at[1]);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(c.tiles[t]!.phys.hazard).toBeFalsy();
        expect(Math.hypot(s.at[0] - c.tee.x, s.at[1] - c.tee.z)).toBeGreaterThan(1.1);
        for (const k of c.cups) expect(Math.hypot(s.at[0] - k.x, s.at[1] - k.z)).toBeGreaterThan(0.85);
        expect(BONUS_KINDS).toContain(s.kind);
      }
      // Toujours les mêmes
      expect(bonusSpots(ref)).toBe(spots);
    }
    // Presque tous les trous en ont trois
    expect(total).toBeGreaterThan(refs.length * 2.5);
  });

  it("le trou avec ses bulles ne change rien d'autre", () => {
    const ref: HoleRef = { c: "jardin", i: 0, m: false };
    const c = courseOf(ref);
    const b = bonusCourse(ref);
    expect(b.tiles).toBe(c.tiles);
    expect(b.def.items.length).toBe(bonusSpots(ref).length);
    expect(c.def.items.length).toBe(0);
  });

  it("une bulle traversée donne son pouvoir au coup suivant, une seule fois", () => {
    const T0 = 1_000_000;
    const cfg = mergeConfig(DEFAULT_CONFIG, { course: "jardin", holes: 9, bonus: true });
    const m = createMatch(cfg, [{ id: "a", team: 0 }], 3, T0);
    const now = m.holeStart + 10;
    tickMatch(m, now);
    const ref = m.holes[0]!;
    const c = courseOf(ref);
    const spot = bonusSpots(ref)[0]!;
    // Vers la première bulle, assez fort pour la traverser
    const a = Math.atan2(spot.at[1] - c.tee.z, spot.at[0] - c.tee.x);
    const s1 = shoot(m, "a", a, 0.55, nowTick(m, now), now);
    expect(typeof s1).toBe("object");
    if (typeof s1 !== "object") return;
    expect(s1.got).toBe(spot.kind);
    const p = m.players[0]!;
    expect(p.power).toBe(spot.kind);
    expect(p.picked & 1).toBe(1);
    // Le coup suivant emporte le pouvoir, et l'use
    const later = m.holeStart + Math.ceil(((s1.end + 10) * 1000) / 240);
    tickMatch(m, later);
    const s2 = shoot(m, "a", -a, 0.2, nowTick(m, later), later);
    expect(typeof s2).toBe("object");
    if (typeof s2 !== "object") return;
    expect(s2.mods).toEqual({ [spot.kind]: true });
    expect(p.power === null || s2.got !== undefined).toBe(true);
  });

  it("sans la règle, pas de bulles ni de pouvoir", () => {
    const T0 = 1_000_000;
    const m = createMatch(mergeConfig(DEFAULT_CONFIG, { course: "jardin", holes: 9 }), [{ id: "a", team: 0 }], 3, T0);
    const now = m.holeStart + 10;
    tickMatch(m, now);
    const s = shoot(m, "a", -Math.PI / 2, 0.55, nowTick(m, now), now);
    expect(typeof s).toBe("object");
    if (typeof s !== "object") return;
    expect(s.got).toBeUndefined();
    expect(s.mods).toBeUndefined();
    expect(m.players[0]!.power).toBeNull();
  });
});
