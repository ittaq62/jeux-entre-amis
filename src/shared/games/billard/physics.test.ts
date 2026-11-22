import { describe, expect, it } from "vitest";
import { rack8, rack9, rackKiller } from "./racks.ts";
import { rigOf, simulateShot, speedOf, startShot, type BallSpot } from "./shot.ts";

const pool = rigOf("poches");
const T = pool.table;
const R = T.R;
const at = (r: { balls: BallSpot[] }, id: number) => r.balls.find((b) => b.id === id);

describe("la physique du billard", () => {
  it("une bille roule, ralentit et s'arrête, sans sortir de la table", () => {
    const r = simulateShot(pool, [{ id: 0, x: -1, y: 0 }], 0, { dx: 1, dy: 0, p: 0.2, a: 0, b: 0 });
    const c = at(r, 0)!;
    expect(c.x).toBeGreaterThan(-0.8);
    expect(c.x).toBeLessThan(T.lx - R);
    expect(r.pocketed).toEqual([]);
    expect(r.steps).toBeLessThan(30 * 400);
  });

  it("frappée au centre de près, la blanche s'arrête sur la bille visée (le coup sec)", () => {
    // De très près, la blanche glisse encore au choc : elle donne tout à l'autre
    const r = simulateShot(
      pool,
      [
        { id: 0, x: -0.1, y: 0 },
        { id: 1, x: 0, y: 0 },
      ],
      0,
      { dx: 1, dy: 0, p: 0.3, a: 0, b: 0 },
    );
    expect(Math.abs(at(r, 0)!.x - -2 * R)).toBeLessThan(0.03);
    expect(at(r, 1)!.x).toBeGreaterThan(0.3);
  });

  it("le rétro fait revenir la blanche, le coulé la fait suivre", () => {
    // Une seconde et demie après la frappe (avant que la bille visée revienne de la bande du fond)
    const shot = (b: number) =>
      simulateShot(
        pool,
        [
          { id: 0, x: -0.3, y: 0 },
          { id: 1, x: 0, y: 0 },
        ],
        0,
        { dx: 1, dy: 0, p: 0.5, a: 0, b },
        600,
      );
    expect(at(shot(-0.9), 0)!.x).toBeLessThan(-0.15);
    expect(at(shot(0.9), 0)!.x).toBeGreaterThan(0.15);
  });

  it("à demi-bille, la blanche (sans effet) et la bille visée partent presque à angle droit", () => {
    // La blanche frappe la bille visée à 30° ; on regarde les deux directions juste après le choc
    const y = R; // l'écart d'un rayon : demi-bille
    const r = simulateShot(
      pool,
      [
        { id: 0, x: -0.05, y },
        { id: 1, x: 0, y: 0 },
      ],
      0,
      { dx: 1, dy: 0, p: 0.3, a: 0, b: 0 },
      40,
    );
    const hit = r.events.find((e) => e.k === "bille")!;
    expect(hit).toBeTruthy();
    const c = at(r, 0)!,
      o = at(r, 1)!;
    // La bille visée part vers le bas-droite (à l'opposé du point de contact), la blanche vers le haut-droite
    expect(o.y).toBeLessThan(0);
    expect(c.y).toBeGreaterThan(y);
  });

  it("une bille envoyée dans un coin tombe, une bille le long d'une bande passe devant la poche du milieu", () => {
    const diag = simulateShot(pool, [{ id: 0, x: 0.6, y: 0 }], 0, { dx: 0.52, dy: 0.56, p: 0.3, a: 0, b: 0 });
    expect(diag.pocketed.map((p) => p.pocket)).toEqual([0]);
    const rail = simulateShot(pool, [{ id: 0, x: 0.3, y: T.ly - R - 0.0005 }], 0, { dx: 1, dy: 0, p: 0.3, a: 0, b: 0 });
    expect(rail.pocketed.length).toBe(1);
    const past = simulateShot(pool, [{ id: 0, x: -0.6, y: T.ly - R - 0.0005 }], 0, { dx: 1, dy: 0, p: 0.25, a: 0, b: 0 });
    expect(past.pocketed).toEqual([]);
    const side = simulateShot(pool, [{ id: 0, x: 0, y: 0 }], 0, { dx: 0, dy: 1, p: 0.3, a: 0, b: 0 });
    expect(side.pocketed.length).toBe(1);
    expect(T.pockets[side.pocketed[0]!.pocket]!.corner).toBe(false);
  });

  it("l'effet de côté change l'angle du rebond sur la bande : il l'ouvre d'un côté, le ferme de l'autre", () => {
    // L'angle de la blanche juste après la première bande (arrivée à 45°)
    const angle = (a: number) => {
      const w = startShot(pool, [{ id: 0, x: 0.2, y: 0.3 }], 0, { dx: 1, dy: 1, p: 0.45, a, b: 0 });
      while (!w.events.some((e) => e.k === "bande") && w.step < 800) w.advance();
      const b = w.balls[0]!;
      return (Math.atan2(-b.vy, b.vx) * 180) / Math.PI;
    };
    const left = angle(-1),
      none = angle(0),
      right = angle(1);
    expect(none).toBeGreaterThan(45);
    expect(left).toBeGreaterThan(none + 6);
    expect(right).toBeLessThan(none - 6);
  });

  it("la casse : rien ne se chevauche, rien ne sort, tout s'arrête, et le même coup donne les mêmes billes au bit près", () => {
    for (const make of [rack8, rack9, rackKiller]) {
      for (let seed = 1; seed <= 6; seed++) {
        const balls: BallSpot[] = [{ id: 0, x: T.head - 0.05, y: (seed - 3) * 0.04 }, ...make(T, { rng: seed * 31 })];
        const apex = balls.slice(1).reduce((a, b) => (b.x < a.x ? b : a));
        const shot = { dx: apex.x - balls[0]!.x, dy: apex.y - balls[0]!.y, p: 1, a: 0, b: -0.2 };
        const r = simulateShot(pool, balls, 0, shot);
        for (const a of r.balls) {
          // Sur le tapis, ou arrêtée dans l'embouchure d'une poche (au bord du trou)
          const inMouth = T.pockets.some((p) => Math.hypot(a.x - p.ox, a.y - p.oy) < p.mouth);
          if (!inMouth) {
            expect(Math.abs(a.x)).toBeLessThanOrEqual(T.lx - R + 1e-6);
            expect(Math.abs(a.y)).toBeLessThanOrEqual(T.ly - R + 1e-6);
          }
          for (const b of r.balls) if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * R - 1e-6);
        }
        expect(r.steps).toBeLessThan(30 * 400);
        const again = simulateShot(pool, balls, 0, shot);
        expect(again.balls).toEqual(r.balls);
        expect(again.events.length).toBe(r.events.length);
      }
    }
  });

  it("la casse fait tomber des billes de temps en temps (un triangle qui éclate vraiment)", () => {
    let pots = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const balls: BallSpot[] = [{ id: 0, x: T.head - 0.05, y: ((seed % 7) - 3) * 0.03 }, ...rack8(T, { rng: seed * 977 })];
      const apex = balls.slice(1).reduce((a, b) => (b.x < a.x ? b : a));
      const r = simulateShot(pool, balls, 0, { dx: apex.x - balls[0]!.x, dy: apex.y - balls[0]!.y, p: 1, a: 0, b: -0.15 });
      pots += r.pocketed.filter((p) => p.id !== 0).length;
    }
    expect(pots / 30).toBeGreaterThan(0.4);
  });

  it("les forces : du toucher au plus fort", () => {
    expect(speedOf("poches", 0)).toBeCloseTo(0.1);
    expect(speedOf("poches", 1)).toBeGreaterThan(8);
    expect(speedOf("poches", 0.5)).toBeLessThan(3);
  });

  it("à la carambole, la bille rebondit d'une bande à l'autre sans jamais sortir", () => {
    const carom = rigOf("carambole");
    const r = simulateShot(carom, [{ id: 0, x: 0, y: 0 }], 0, { dx: 0.8, dy: 0.6, p: 0.9, a: 0.6, b: 0 });
    expect(r.pocketed).toEqual([]);
    expect(r.events.filter((e) => e.k === "bande").length).toBeGreaterThan(3);
    const c = at(r, 0)!;
    expect(Math.abs(c.x)).toBeLessThanOrEqual(carom.table.lx);
  });
});
