import { describe, expect, it } from "vitest";
import { hole, ramp } from "./build.ts";
import { BALL_R, compileHole, heightAt, MATS, RAIL_T, tileAt, type Course } from "./course.ts";
import { box, circle, inRings, rect } from "./geom.ts";
import { DEFAULT_PHYS, restingBall, shotSpeed, simulateShot, simulateWorld, stepBall, strike, type PhysEvent } from "./physics.ts";

/** Une allée droite de 2 m de large, de z = 0 à z = -L, le trou au bout */
function lane(L = 12, cupAt = -10) {
  return compileHole(
    hole("Allée", 2, (b) => {
      b.tile(box(-1, -L, 1, 0));
      b.tee(0, -0.5, -Math.PI / 2).cup(0, cupAt);
    }),
  );
}

const UP = -Math.PI / 2;

function teeBall(c: Course) {
  return { x: c.tee.x, y: c.tee.y, z: c.tee.z };
}

/** La vitesse pour parcourir d mètres sur du gazon à plat */
function powerFor(v: number): number {
  // Inverse de shotSpeed, par dichotomie
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (shotSpeed(m) < v) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

describe("minigolf : la balle qui roule", () => {
  it("s'arrête à la distance que donne le freinage du gazon", () => {
    const c = compileHole(
      hole("Long", 3, (b) => {
        b.tile(box(-1, -40, 1, 0));
        b.tee(0, -0.5, UP).cup(0, -39);
      }),
    );
    for (const v of [1, 2, 3.5]) {
      const r = simulateShot(c, teeBall(c), UP, powerFor(v), 0, DEFAULT_PHYS);
      expect(r.outcome).toBe("rest");
      const d = -0.5 - r.z;
      const expected = (v * v) / (2 * MATS.green.roll);
      expect(Math.abs(d - expected) / expected).toBeLessThan(0.06);
      expect(Math.abs(r.x)).toBeLessThan(1e-9);
      expect(r.y).toBeCloseTo(BALL_R, 4);
    }
  });

  it("donne exactement le même résultat deux fois", () => {
    const c = lane();
    const a = simulateShot(c, teeBall(c), UP + 0.3, 0.7, 120, DEFAULT_PHYS);
    const b = simulateShot(c, teeBall(c), UP + 0.3, 0.7, 120, DEFAULT_PHYS);
    expect(b).toEqual(a);
  });

  it("rebondit sur les bordures sans jamais sortir", () => {
    const c = lane(12, -11);
    const outer = [box(-1, -12, 1, 0)];
    for (let i = 0; i < 60; i++) {
      const angle = UP + (i / 60 - 0.5) * 2.8;
      const power = 0.35 + (i % 7) / 10;
      const b = restingBall(c, c.tee.x, c.tee.y, c.tee.z);
      strike(c, b, angle, power);
      let k = 0;
      while (b.mode !== "rest" && b.mode !== "in" && b.mode !== "lost") {
        stepBall(c, b, ++k, DEFAULT_PHYS);
        expect(inRings(b.x, b.z, outer)).toBe(true);
        // Jamais dans l'épaisseur d'une bordure
        expect(Math.abs(b.x)).toBeLessThanOrEqual(1 - RAIL_T - BALL_R + 1e-6);
      }
      expect(b.mode === "lost").toBe(false);
    }
  });

  it("perd de la vitesse en cognant une bordure", () => {
    const c = lane();
    const b = restingBall(c, 0, c.tee.y, -5);
    strike(c, b, 0, powerFor(3));
    let before = 0;
    let after = 0;
    let k = 0;
    const events: PhysEvent[] = [];
    while (b.mode === "roll") {
      before = Math.abs(b.vx);
      stepBall(c, b, ++k, DEFAULT_PHYS, (e) => events.push(e));
      if (b.vx < 0) {
        after = -b.vx;
        break;
      }
    }
    expect(events.some((e) => e.k === "wall" && e.kind === "rail")).toBe(true);
    expect(after / before).toBeGreaterThan(0.6);
    expect(after / before).toBeLessThan(0.8);
  });
});

describe("minigolf : le trou", () => {
  /** La balle lancée droit vers le trou depuis 1,5 m, qui y arrive à la vitesse v (décalée de `off` sur le côté) */
  function arriveAt(v: number, off = 0) {
    const c = lane(12, -10);
    const d = 1.5;
    const v0 = Math.sqrt(v * v + 2 * MATS.green.roll * d);
    const from = { x: off, y: heightAt(c, off, -10 + d) + BALL_R, z: -10 + d };
    return simulateShot(c, from, UP, powerFor(v0), 0, DEFAULT_PHYS);
  }

  it("avale une balle lente, recrache une balle rapide", () => {
    expect(arriveAt(0.6).outcome).toBe("in");
    expect(arriveAt(1.3).outcome).toBe("in");
    expect(arriveAt(3).outcome).toBe("rest");
  });

  it("est plus exigeant quand la balle passe sur le bord", () => {
    const fastest = (off: number) => {
      let best = 0;
      for (let v = 0.3; v <= 3; v += 0.05) if (arriveAt(v, off).outcome === "in") best = v;
      return best;
    };
    const center = fastest(0);
    const side = fastest(0.08);
    expect(center).toBeGreaterThan(1.4);
    expect(center).toBeLessThan(2.4);
    expect(side).toBeLessThan(center);
    expect(side).toBeGreaterThan(0.3);
  });

  it("fait tomber une balle qui s'arrête au bord dans la cuvette", () => {
    // Une balle qui arrive tout doucement à 15 cm du trou finit dedans (la cuvette l'y amène)
    const c = lane(12, -10);
    const r = simulateShot(c, { x: 0, y: heightAt(c, 0, -9.6) + BALL_R, z: -9.6 }, UP, powerFor(0.9), 0, DEFAULT_PHYS);
    expect(r.outcome).toBe("in");
  });
});

describe("minigolf : sauts, eau, pentes", () => {
  it("une rampe fait sauter par-dessus un fossé ; trop doucement, la balle redescend", () => {
    const c = compileHole(
      hole("Saut", 3, (b) => {
        b.tile(box(-1, -4, 1, 0));
        b.tile(box(-1, -6, 1, -4), ramp([0, -4], [0, -6], 0, 0.35, "in"));
        // Le fossé de -6 à -7.5 : rien
        b.tile(box(-1, -14, 1, -7.5), 0);
        b.open(box(-1.2, -7.7, 1.2, -5.8));
        b.tee(0, -0.5, UP).cup(0, -13);
      }),
    );
    const strong = simulateShot(c, teeBall(c), UP, 0.8, 0, DEFAULT_PHYS);
    expect(strong.outcome === "rest" || strong.outcome === "in").toBe(true);
    expect(strong.z).toBeLessThan(-7.5);
    const weak = simulateShot(c, teeBall(c), UP, 0.25, 0, DEFAULT_PHYS);
    expect(weak.outcome).toBe("rest");
    expect(weak.z).toBeGreaterThan(-6);
    // Entre les deux : tombe dans le fossé
    let fell = false;
    for (let p = 0.3; p < 0.8; p += 0.02) if (simulateShot(c, teeBall(c), UP, p, 0, DEFAULT_PHYS).outcome === "lost") fell = true;
    expect(fell).toBe(true);
  });

  it("perd la balle dans l'eau", () => {
    const c = compileHole(
      hole("Mare", 3, (b) => {
        const g = b.tile(box(-2, -10, 2, 0));
        b.inset(g, circle(0, -5, 1, 32), -0.12, "water");
        b.tee(0, -0.5, UP).cup(0, -9);
      }),
    );
    const r = simulateShot(c, teeBall(c), UP, powerFor(3.2), 0, DEFAULT_PHYS);
    expect(r.outcome).toBe("lost");
    expect(r.lost).toBe("water");
  });

  it("descend une pente assez raide et s'arrête sur une pente douce", () => {
    const steep = compileHole(
      hole("Pente", 2, (b) => {
        b.tile(box(-1, -10, 1, 0), ramp([0, 0], [0, -10], 1.5, 0));
        b.tee(0, -0.5, UP).cup(0, -9.5);
      }),
    );
    // Posée sans vitesse (un coup minuscule vers l'arrière), elle descend et file vers le trou
    const r = simulateShot(steep, teeBall(steep), UP, 0, 0, DEFAULT_PHYS);
    expect(r.z).toBeLessThan(-5);
    const gentle = compileHole(
      hole("Douce", 2, (b) => {
        b.tile(box(-1, -10, 1, 0), ramp([0, 0], [0, -10], 0.05, 0));
        b.tee(0, -0.5, UP).cup(0, -9.5);
      }),
    );
    const g = simulateShot(gentle, teeBall(gentle), UP, 0, 0, DEFAULT_PHYS);
    expect(g.outcome).toBe("rest");
    expect(g.z).toBeGreaterThan(-1);
  });

  it("bute contre un plateau surélevé (une falaise) et peut y monter par une rampe", () => {
    const c = compileHole(
      hole("Plateau", 3, (b) => {
        const g = b.tile(box(-2, -10, 2, 0));
        b.inset(g, box(-2 + 0.0, -8, 0, -6), 0.3, "stone");
        b.tee(-1, -0.5, UP).cup(1, -9);
      }),
    );
    expect(c.walls.some((w) => w.kind === "cliff")).toBe(true);
    const r = simulateShot(c, teeBall(c), UP, 0.55, 0, DEFAULT_PHYS);
    // Elle ne traverse pas le plateau : elle revient vers le départ
    expect(r.z).toBeGreaterThan(-6);
    expect(tileAt(c, r.x, r.z)).toBe(0);
  });
});

describe("minigolf : ce qui bouge, les tubes, les téléporteurs", () => {
  it("une barre qui tourne renvoie la balle ou la laisse passer, et la balle finit toujours", () => {
    const c = compileHole(
      hole("Moulinet", 3, (b) => {
        b.tile(box(-1, -10, 1, 0));
        b.mover({
          motion: { k: "spin", c: [0, -5], w: 1.6 },
          parts: [{ k: "wall", a: [-0.85, -5], b: [0.85, -5], y0: -1, y1: 0.2, t: 0.04 }],
          look: "barre",
        });
        b.tee(0, -0.5, UP).cup(0, -9);
      }),
    );
    let passed = 0;
    let blocked = 0;
    for (let t = 0; t < 240 * 4; t += 37) {
      const r = simulateShot(c, teeBall(c), UP, 0.62, t, DEFAULT_PHYS);
      expect(r.outcome).not.toBe("lost");
      expect(r.end - t).toBeLessThan(240 * 30);
      if (r.z < -5) passed++;
      else blocked++;
    }
    expect(passed).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThan(0);
  });

  it("le tube emmène la balle de l'entrée à la sortie ; trop lente, elle en ressort à l'entrée", () => {
    const y = BALL_R;
    const c = compileHole(
      hole("Tube", 3, (b) => {
        b.tile(box(-1, -4, 1, 0));
        b.tile(box(4, -10, 6, -6));
        // Une bosse : le tube monte à 0,5 m puis redescend
        b.rail(
          [
            [0, y, -3.5],
            [0, y + 0.25, -5],
            [1.5, y + 0.5, -7],
            [3.5, y + 0.25, -8],
            [4.5, y, -8],
          ],
          "tube",
        );
        b.tee(0, -0.5, UP).cup(5.5, -9.5);
      }),
    );
    const strong = simulateShot(c, teeBall(c), UP, 0.7, 0, DEFAULT_PHYS);
    expect(strong.x).toBeGreaterThan(4);
    const weak = simulateShot(c, teeBall(c), UP, 0.42, 0, DEFAULT_PHYS);
    expect(weak.x).toBeLessThan(1.1);
    expect(weak.outcome).toBe("rest");
  });

  it("le téléporteur fait ressortir la balle ailleurs, dans sa direction", () => {
    const c = compileHole(
      hole("Portes", 3, (b) => {
        b.tile(box(-1, -4, 1, 0));
        b.tile(box(4, -10, 8, -6));
        b.portal([0, -3], [5, -8], 0);
        b.tee(0, -0.5, UP).cup(7.5, -8);
      }),
    );
    const events: PhysEvent[] = [];
    const r = simulateShot(c, teeBall(c), UP, powerFor(2.2), 0, DEFAULT_PHYS, (e) => events.push(e));
    expect(events.some((e) => e.k === "portal")).toBe(true);
    expect(r.x).toBeGreaterThan(5);
    expect(r.z).toBeCloseTo(-8, 1);
  });
});

describe("minigolf : la construction d'un trou", () => {
  it("pas de bordure entre deux morceaux voisins, une bordure tout autour", () => {
    const c = compileHole(
      hole("Deux", 2, (b) => {
        b.tile(box(-1, -4, 1, 0));
        b.tile(box(-1, -8, 3, -4));
        b.tee(0, -0.5, UP).cup(2, -7);
      }),
    );
    const rails = c.walls.filter((w) => w.kind === "rail");
    // Aucune bordure sur la ligne z = -4 entre x = -1 et 1
    expect(rails.some((w) => w.az === -4 && w.bz === -4 && Math.max(w.ax, w.bx) <= 1 + 1e-9)).toBe(false);
    // Mais bien entre x = 1 et 3 (le bord du second morceau)
    expect(rails.some((w) => w.az === -4 && w.bz === -4 && Math.min(w.ax, w.bx) >= 1 - 1e-9)).toBe(true);
    const perimeter = rails.reduce((s, w) => s + Math.hypot(w.bx - w.ax, w.bz - w.az), 0);
    expect(perimeter).toBeCloseTo(24, 6);
  });

  it("une allée en sections se raccorde sans falaise", () => {
    const c = compileHole(
      hole("Sections", 3, (b) => {
        b.strip(
          [
            [0, 0],
            [0, -5],
            [3, -9],
          ],
          1.4,
          [{ len: 3, h0: 0 }, { len: 2, h1: 0.3, e: "s" }, { len: 99 }],
        );
        b.tee(0, -0.5, UP).cup(2.5, -8.3);
      }),
    );
    expect(c.tiles).toHaveLength(3);
    expect(c.walls.filter((w) => w.kind === "cliff")).toHaveLength(0);
    const r = simulateShot(c, teeBall(c), UP, 0.6, 0, DEFAULT_PHYS);
    expect(r.outcome).not.toBe("lost");
  });

  it("le trou reflété donne le coup reflété", () => {
    const def = hole("Biais", 3, (b) => {
      const g = b.tile(rect(1, -5, 4, 10, 0.2));
      b.inset(g, circle(1.5, -4, 0.5, 24), -0.05, "sand");
      b.tee(0.5, -0.5, UP).cup(1, -9);
    });
    const a = compileHole(def);
    const m = compileHole(def, true);
    const ra = simulateShot(a, teeBall(a), UP + 0.2, 0.55, 0, DEFAULT_PHYS);
    const rm = simulateShot(m, teeBall(m), Math.PI - (UP + 0.2), 0.55, 0, DEFAULT_PHYS);
    expect(rm.x).toBeCloseTo(-ra.x, 6);
    expect(rm.z).toBeCloseTo(ra.z, 6);
    expect(rm.outcome).toBe(ra.outcome);
  });
});

describe("minigolf : les balles se heurtent", () => {
  it("sans autre balle, le coup est exactement le même qu'avant", () => {
    const c = lane();
    const a = simulateShot(c, teeBall(c), UP + 0.2, 0.6, 30, DEFAULT_PHYS);
    const w = simulateWorld(c, teeBall(c), UP + 0.2, 0.6, 30, DEFAULT_PHYS, [], DEFAULT_PHYS);
    expect(w.shot).toEqual(a);
    expect(w.others).toEqual([]);
  });

  it("la balle frappée pousse celle qui est sur son chemin, et s'arrête plus tôt", () => {
    const c = lane(20, -19);
    const target = { x: 0, y: c.tee.y, z: -3 };
    const alone = simulateShot(c, teeBall(c), UP, powerFor(4), 0, DEFAULT_PHYS);
    const w = simulateWorld(c, teeBall(c), UP, powerFor(4), 0, DEFAULT_PHYS, [target], DEFAULT_PHYS);
    expect(w.others[0]!.moved).toBe(true);
    // Choc de face, de même masse : la balle poussée part loin devant, celle qui frappe repart à peine
    expect(w.others[0]!.z).toBeLessThan(-6);
    expect(w.shot.z).toBeGreaterThan(-3.2);
    expect(w.shot.z).toBeGreaterThan(alone.z);
    expect(Math.abs(w.others[0]!.x)).toBeLessThan(1e-6);
    // Et à l'identique d'une fois sur l'autre
    expect(simulateWorld(c, teeBall(c), UP, powerFor(4), 0, DEFAULT_PHYS, [target], DEFAULT_PHYS)).toEqual(w);
  });

  it("une balle à côté du chemin n'est pas touchée ; frappée de biais, elle part de biais", () => {
    const c = lane(20, -19);
    const aside = { x: 0.5, y: c.tee.y, z: -3 };
    const w = simulateWorld(c, teeBall(c), UP, powerFor(4), 0, DEFAULT_PHYS, [aside], DEFAULT_PHYS);
    expect(w.others[0]!.moved).toBe(false);
    // (sur un grand gazon, pour qu'elle ne revienne pas d'une bordure)
    const wide = compileHole(
      hole("Large", 3, (b) => {
        b.tile(box(-8, -20, 8, 0));
        b.tee(0, -0.5, UP).cup(0, -19);
      }),
    );
    const grazed = { x: 0.06, y: wide.tee.y, z: -3 };
    const g = simulateWorld(wide, teeBall(wide), UP, powerFor(4), 0, DEFAULT_PHYS, [grazed], DEFAULT_PHYS);
    expect(g.others[0]!.moved).toBe(true);
    expect(g.others[0]!.x).toBeGreaterThan(0.06);
  });

  it("poussée assez doucement au bord du trou, elle y tombe", () => {
    const c = lane(12, -6);
    const nearCup = { x: 0, y: c.tee.y, z: -5.75 };
    const w = simulateWorld(c, { x: 0, y: c.tee.y, z: -5.2 }, UP, powerFor(1.2), 0, DEFAULT_PHYS, [nearCup], DEFAULT_PHYS);
    expect(w.others[0]!.outcome).toBe("in");
  });

  it("le pouvoir « fantôme » traverse aussi les balles", () => {
    const c = lane(20, -19);
    const target = { x: 0, y: c.tee.y, z: -3 };
    const ghost = { ...DEFAULT_PHYS, mods: { ghost: true } };
    const w = simulateWorld(c, teeBall(c), UP, powerFor(4), 0, ghost, [target], DEFAULT_PHYS);
    expect(w.others[0]!.moved).toBe(false);
  });
});
