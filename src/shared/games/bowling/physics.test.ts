import { describe, expect, it } from "vitest";
import { HEAD_PIN, RACK, rackOf } from "./lane.ts";
import { DEFAULT_PHYS } from "./physics.ts";
import { cleanThrow, MAX_STEPS, simulateThrow, startThrow, type ThrowParams } from "./throw.ts";

/** Où la boule passe à la hauteur de la quille de tête, et sous quel angle (en degrés, positif vers la gauche) */
function arrival(t: ThrowParams, cfg = DEFAULT_PHYS) {
  const w = startThrow([], t, cfg);
  while (w.step < MAX_STEPS && -w.ball.pz < HEAD_PIN && !w.ball.gone) w.advance();
  return { x: w.ball.px, angle: (Math.atan2(-w.ball.vx, -w.ball.vz) * 180) / Math.PI, gutter: w.inGutter, step: w.step };
}

/** La direction qui amène la boule à cet endroit devant les quilles */
function aimFor(x: number, v: number, s: number, target: number, cfg = DEFAULT_PHYS): number {
  let d = 0;
  for (let i = 0; i < 5; i++) d += (target - arrival({ x, d, v, s }, cfg).x) / 18.5;
  return d;
}

describe("bowling : la boule sur la piste", () => {
  it("sans effet, elle file tout droit", () => {
    const a = arrival({ x: 0.2, d: 0, v: 8, s: 0 });
    expect(a.x).toBeCloseTo(0.2, 6);
    expect(a.gutter).toBe(false);
    // 18 m en un peu plus de deux secondes
    expect(a.step / 400).toBeGreaterThan(2);
    expect(a.step / 400).toBeLessThan(3);
  });

  it("avec effet, elle glisse dans l'huile puis courbe en fond de piste", () => {
    const w = startThrow([], { x: 0.3, d: 0, v: 8, s: 20 });
    let atOilEnd = 0;
    while (-w.ball.pz < HEAD_PIN) {
      w.advance();
      if (!atOilEnd && -w.ball.pz > 12) atOilEnd = w.ball.px;
    }
    const drift = 0.3 - atOilEnd;
    const hook = atOilEnd - w.ball.px;
    expect(drift).toBeGreaterThan(0);
    // L'essentiel de la courbe se fait sur les six derniers mètres
    expect(hook).toBeGreaterThan(drift * 1.5);
    expect(w.ball.px).toBeLessThan(0);
  });

  it("l'effet à gauche et l'effet à droite sont le miroir l'un de l'autre", () => {
    const left = arrival({ x: 0.3, d: -0.004, v: 7.5, s: 18 });
    const right = arrival({ x: -0.3, d: 0.004, v: 7.5, s: -18 });
    expect(right.x).toBeCloseTo(-left.x, 4);
    expect(right.angle).toBeCloseTo(-left.angle, 3);
  });

  it("plus elle va vite, moins elle a le temps de courber", () => {
    const slow = arrival({ x: 0.3, d: 0, v: 6, s: 15 });
    const fast = arrival({ x: 0.3, d: 0, v: 10, s: 15 });
    expect(0.3 - slow.x).toBeGreaterThan(0.3 - fast.x);
  });

  it("lancée vers le bord, elle tombe dans la rigole et ne touche aucune quille", () => {
    const r = simulateThrow(RACK, { x: 0.4, d: 0.012, v: 8, s: 0 });
    expect(r.gutter).toBe(true);
    expect(r.down).toEqual([]);
    expect(r.standing).toHaveLength(10);
    // Les quilles qu'on n'a pas touchées n'ont pas bougé d'un cheveu
    for (const p of r.standing) {
      const spot = RACK.find((q) => q.n === p.n)!;
      expect(p.x).toBeCloseTo(spot.x, 4);
      expect(p.z).toBeCloseTo(spot.z, 4);
    }
  });

  it("avec les barrières, la même boule rebondit et va aux quilles", () => {
    const r = simulateThrow(RACK, { x: 0.4, d: 0.012, v: 8, s: 0 }, { ...DEFAULT_PHYS, bumpers: true });
    expect(r.gutter).toBe(false);
    expect(r.down.length).toBeGreaterThan(0);
  });
});

describe("bowling : les quilles", () => {
  it("une boule dans la poche, avec de l'effet, fait tomber les dix quilles", () => {
    const x = 0.35,
      v = 8.2,
      s = 20;
    const r = simulateThrow(RACK, { x, d: aimFor(x, v, s, 0.06), v, s });
    expect(r.down).toHaveLength(10);
    expect(r.standing).toEqual([]);
  });

  it("une boule droite en pleine tête laisse souvent un split", () => {
    const r = simulateThrow(RACK, { x: 0, d: 0, v: 8, s: 0 });
    expect(r.down.length).toBeGreaterThanOrEqual(6);
    expect(r.down.length).toBeLessThan(10);
    expect(r.down).toContain(1);
  });

  it("le même lancer donne exactement le même résultat, jusqu'au dernier choc", () => {
    const t = { x: 0.31, d: -0.0062, v: 8.37, s: 17.5 };
    const a = simulateThrow(RACK, t);
    const b = simulateThrow(RACK, t);
    expect(b).toEqual(a);
    expect(a.events.length).toBeGreaterThan(10);
  });

  it("une boule très rapide ne traverse pas les quilles", () => {
    const r = simulateThrow(RACK, { x: 0, d: 0, v: 11.5, s: 0 });
    expect(r.down.length).toBeGreaterThanOrEqual(5);
    expect(r.firstHit).toBeGreaterThan(0);
  });

  it("les chocs s'entendent : la boule sur la piste, contre les quilles, les quilles entre elles", () => {
    const r = simulateThrow(RACK, { x: 0.35, d: aimFor(0.35, 8.2, 20, 0.06), v: 8.2, s: 20 });
    const kinds = new Set(r.events.map((e) => e.k));
    expect(kinds.has("drop")).toBe(true);
    expect(kinds.has("hit")).toBe(true);
    expect(kinds.has("clack")).toBe(true);
  });

  it("une quille seule, visée en plein, tombe ; la boule la manque d'un rien, elle reste", () => {
    const ten = rackOf([10]);
    const target = ten[0]!.x;
    const hit = simulateThrow(ten, { x: 0.3, d: aimFor(0.3, 8, 0, target), v: 8, s: 0 });
    expect(hit.down).toEqual([10]);
    const miss = simulateThrow(ten, { x: 0.3, d: aimFor(0.3, 8, 0, target - 0.2), v: 8, s: 0 });
    expect(miss.down).toEqual([]);
    expect(miss.standing).toEqual([{ n: 10, x: ten[0]!.x, z: ten[0]!.z }]);
  });

  it("les quilles restées debout se reposent là où elles sont, et le lancer suivant part de là", () => {
    const first = simulateThrow(RACK, { x: 0, d: 0, v: 8, s: 0 });
    expect(first.standing.length).toBeGreaterThan(0);
    const second = simulateThrow(first.standing, { x: 0.4, d: 0.012, v: 8, s: 0 });
    expect(second.gutter).toBe(true);
    expect(second.standing).toEqual(first.standing);
  });
});

describe("bowling : ce que le joueur envoie", () => {
  it("un lancer est borné et arrondi", () => {
    expect(cleanThrow({ x: 3, d: -1, v: 99, s: -99 })).toEqual({ x: 0.437, d: -0.075, v: 11.5, s: -30 });
    expect(cleanThrow({ x: 0.12345, d: 0.001234, v: 8.256, s: 12.345 })).toEqual({ x: 0.123, d: 0.0012, v: 8.26, s: 12.35 });
    expect(cleanThrow({ x: Number.NaN, d: 0, v: 8, s: 0 })).toBeNull();
    expect(cleanThrow(null)).toBeNull();
  });
});
