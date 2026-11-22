import { describe, expect, it } from "vitest";
import { armAngle, release, spinName, type Sample } from "./gesture.ts";

const H = 800;

/** Un geste : on descend de `back` hauteurs d'écran en `tBack` ms, puis on remonte de `up` en `tUp` ms (pas de 10 ms) */
function swing(o: { back?: number; tBack?: number; up?: number; tUp?: number; drift?: number; flick?: number }): Sample[] {
  const { back = 0.25, tBack = 400, up = 0.5, tUp = 160, drift = 0, flick = 0 } = o;
  const out: Sample[] = [];
  let t = 0;
  for (let k = 0; k <= tBack; k += 10) out.push({ t: (t = k), x: 400, y: 500 + (k / tBack) * back * H });
  const y0 = 500 + back * H;
  for (let k = 10; k <= tUp; k += 10) {
    const u = k / tUp;
    // Le coup de poignet : sur les 60 dernières millisecondes, la main part de côté
    const late = Math.max(0, (k - (tUp - 60)) / 60);
    out.push({ t: t + k, x: 400 + u * drift * H + late * flick * H, y: y0 - u * up * H });
  }
  return out;
}

describe("bowling : le geste du lancer", () => {
  it("un geste franc et droit : une boule rapide, sans effet, sans écart", () => {
    const r = release(swing({}), H);
    expect(typeof r).toBe("object");
    if (typeof r !== "object") return;
    expect(r.v).toBeGreaterThan(6.5);
    expect(r.v).toBeLessThan(9.5);
    expect(Math.abs(r.s)).toBeLessThan(0.5);
    expect(Math.abs(r.dev)).toBeLessThan(1e-6);
  });

  it("plus le geste est vif, plus la boule va vite", () => {
    const calm = release(swing({ tUp: 260 }), H);
    const fast = release(swing({ tUp: 110 }), H);
    if (typeof calm !== "object" || typeof fast !== "object") throw new Error("pas de lancer");
    expect(fast.v).toBeGreaterThan(calm.v + 1);
  });

  it("un coup de poignet vers la gauche fait courber à gauche, vers la droite à droite", () => {
    const left = release(swing({ flick: -0.06 }), H);
    const right = release(swing({ flick: 0.06 }), H);
    if (typeof left !== "object" || typeof right !== "object") throw new Error("pas de lancer");
    expect(left.s).toBeGreaterThan(8);
    expect(right.s).toBeLessThan(-8);
    expect(spinName(left.s)).toMatch(/gauche/);
  });

  it("un geste qui penche fait dévier la boule, sans donner d'effet", () => {
    const r = release(swing({ drift: 0.15 }), H);
    if (typeof r !== "object") throw new Error("pas de lancer");
    expect(r.dev).toBeGreaterThan(0.001);
    expect(Math.abs(r.s)).toBeLessThan(2);
  });

  it("sans élan en arrière, ou en poussant trop mollement, la boule ne part pas", () => {
    expect(release(swing({ back: 0.01 }), H)).toBe("back");
    expect(release(swing({ up: 0.1, tUp: 400 }), H)).toBe("slow");
  });

  it("le bras suit la main : en arrière quand on descend, en avant quand on monte", () => {
    const s0 = { t: 0, x: 0, y: 400 };
    expect(armAngle(s0, { t: 1, x: 0, y: 600 }, H)).toBeLessThan(-1);
    expect(armAngle(s0, { t: 1, x: 0, y: 300 }, H)).toBeGreaterThan(0.5);
  });
});
