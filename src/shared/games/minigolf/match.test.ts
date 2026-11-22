import { describe, expect, it } from "vitest";
import { planShot } from "./bot.ts";
import { BALL_R, heightAt, strokeLimit } from "./course.ts";
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
  SETTLE_MS,
  activePlayer,
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

  it("refuse un coup pendant la présentation, puis quand la balle roule encore (tous en même temps)", () => {
    const m = createMatch(cfg({ holes: 3, turns: false }), [{ id: "a", team: 0 }], 7, T0);
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

  it("chacun son tour : un seul joueur a la main, les autres attendent ; le suivant après l'arrêt de la balle", () => {
    const m = createMatch(
      cfg({ holes: 3 }),
      [
        { id: "a", team: 0 },
        { id: "b", team: 1 },
      ],
      7,
      T0,
    );
    expect(m.cfg.turns).toBe(true);
    let now = T0 + INTRO_MS;
    tickMatch(m, now);
    expect(m.phase).toBe("play");
    expect(activePlayer(m)?.id).toBe("a");
    expect(readyToShoot(m, now).map((p) => p.id)).toEqual(["a"]);
    expect(shoot(m, "b", -Math.PI / 2, 0.4, nowTick(m, now), now)).toBe("Ce n'est pas ton tour.");
    const s = shoot(m, "a", -Math.PI / 2, 0.35, nowTick(m, now), now);
    expect(typeof s).toBe("object");
    expect(shoot(m, "a", -Math.PI / 2, 0.35, nowTick(m, now), now)).toBe("Tu as déjà joué ce coup.");
    // Tant que sa balle roule, c'est encore son tour
    tickMatch(m, now + 200);
    expect(activePlayer(m)?.id).toBe("a");
    expect(readyToShoot(m, now + 200)).toEqual([]);
    // Elle s'arrête : un instant, puis c'est à b
    if (typeof s !== "object") return;
    now = m.holeStart + Math.ceil((s.end * 1000) / STEPS_PER_S) + SETTLE_MS + 50;
    tickMatch(m, now);
    expect(m.players[0]!.done || activePlayer(m)?.id === "b").toBe(true);
  });

  it("chacun son tour : le temps écoulé coûte un coup, et la main passe", () => {
    const m = createMatch(
      cfg({ holes: 3 }),
      [
        { id: "a", team: 0 },
        { id: "b", team: 1 },
      ],
      7,
      T0,
    );
    let now = T0 + INTRO_MS;
    tickMatch(m, now);
    now = m.turnEnd + 10;
    tickMatch(m, now);
    expect(m.players[0]!.cur).toBe(1);
    expect(m.players[0]!.shot?.skip).toBe(true);
    now += SETTLE_MS + 200;
    tickMatch(m, now);
    expect(activePlayer(m)?.id).toBe("b");
  });

  it("chacun son tour : au trou suivant, le meilleur du trou d'avant commence", () => {
    const m = createMatch(
      cfg({ holes: 3 }),
      [
        { id: "a", team: 0 },
        { id: "b", team: 1 },
      ],
      7,
      T0,
    );
    // a ne joue jamais (il prend la limite) ; b joue : b commence le trou 2
    let now = T0;
    const rng = { rng: 5 };
    while (m.hole === 0) {
      now += 200;
      tickMatch(m, now);
      for (const p of readyToShoot(m, now)) {
        if (p.id === "a") continue;
        const c = courseOf(currentRef(m));
        const plan = planShot(c, { x: p.ball[0], y: p.ball[1], z: p.ball[2] }, nowTick(m, now), physOf(m.cfg, currentRef(m)), "fort", rng);
        shoot(m, p.id, plan.a, plan.p, nowTick(m, now), now);
      }
    }
    expect(m.players[1]!.scores[0]!).toBeLessThan(m.players[0]!.scores[0]!);
    expect(m.order).toEqual([1, 0]);
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

  it("presse les retardataires quand la moitié a fini, et donne la limite à qui n'a pas joué (tous en même temps)", () => {
    const m = createMatch(
      cfg({ holes: 3, turns: false }),
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

describe("minigolf : les balles se poussent (chacun son tour)", () => {
  /** Deux joueurs, a joue ; la balle de b est déjà sur le parcours */
  function setup() {
    const m = createMatch(
      cfg({ holes: 3 }),
      [
        { id: "a", team: 0 },
        { id: "b", team: 0 },
      ],
      3,
      T0,
    );
    const now = T0 + INTRO_MS + 50;
    tickMatch(m, now);
    expect(activePlayer(m)?.id).toBe("a");
    const c = courseOf(currentRef(m));
    const put = (id: string, x: number, z: number) => {
      const p = m.players.find((q) => q.id === id)!;
      p.cur = 1;
      p.ball = [x, heightAt(c, x, z) + BALL_R, z];
    };
    return { m, now, c, put };
  }

  it("le coup pousse la balle de l'autre : elle change de place, le tour attend qu'elle s'arrête", () => {
    const { m, now, c, put } = setup();
    const dx = Math.cos(c.tee.aim);
    const dz = Math.sin(c.tee.aim);
    put("b", c.tee.x + dx * 0.9, c.tee.z + dz * 0.9);
    const before = [...m.players[1]!.ball];
    const shot = shoot(m, "a", c.tee.aim, 0.4, nowTick(m, now), now);
    if (typeof shot === "string") throw new Error(shot);
    expect(shot.hits?.[0]?.id).toBe("b");
    expect(shot.hits![0]!.from).toEqual(before);
    expect(m.players[1]!.ball).not.toEqual(before);
    expect(m.players[0]!.restAt).toBeGreaterThanOrEqual(shot.hits![0]!.end);
  });

  it("poussée dans le trou, elle compte pour son joueur, sans coup de plus", () => {
    // Une force qui fait tomber la balle de b : on la cherche (le gazon et la pente changent d'un trou à l'autre)
    let found = false;
    for (let k = 4; k <= 40 && !found; k++) {
      const { m, now, c, put } = setup();
      const cup = c.cups[0]!;
      const a = Math.atan2(cup.z - c.tee.z, cup.x - c.tee.x);
      put("b", cup.x - Math.cos(a) * 0.22, cup.z - Math.sin(a) * 0.22);
      put("a", cup.x - Math.cos(a) * 0.6, cup.z - Math.sin(a) * 0.6);
      const shot = shoot(m, "a", a, k / 100, nowTick(m, now), now);
      if (typeof shot === "string") throw new Error(shot);
      const hit = shot.hits?.find((h) => h.id === "b");
      if (hit?.out !== "in") continue;
      found = true;
      const b = m.players[1]!;
      expect(b.done).toBe(true);
      expect(b.scores[m.hole]).toBe(1);
      expect(b.doneAt).toBe(hit.end);
    }
    expect(found).toBe(true);
  });

  it("tous en même temps, les balles se traversent", () => {
    const m = createMatch(
      cfg({ holes: 3, turns: false }),
      [
        { id: "a", team: 0 },
        { id: "b", team: 0 },
      ],
      3,
      T0,
    );
    const now = T0 + INTRO_MS + 50;
    tickMatch(m, now);
    const c = courseOf(currentRef(m));
    const b = m.players[1]!;
    b.cur = 1;
    b.ball = [c.tee.x + Math.cos(c.tee.aim) * 0.9, c.tee.y, c.tee.z + Math.sin(c.tee.aim) * 0.9];
    const shot = shoot(m, "a", c.tee.aim, 0.4, nowTick(m, now), now);
    if (typeof shot === "string") throw new Error(shot);
    expect(shot.hits).toBeUndefined();
  });
});
