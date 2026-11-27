import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrefs } from "../stores/prefs.ts";
import { buzz, HitStop, Shake } from "./feel.ts";

afterEach(() => {
  usePrefs.setState({ reducedEffects: false });
  vi.unstubAllGlobals();
});

describe("les sensations de jeu communes", () => {
  it("la secousse monte d'un coup, retombe en moins d'une seconde, et reste dans son amplitude", () => {
    const s = new Shake(0.03);
    const off = { x: 0, y: 0, z: 0 };
    expect(s.offset(0, off)).toBe(false);
    s.add(1);
    let max = 0;
    let t = 0;
    for (; t < 0.5; t += 1 / 60) {
      expect(s.offset(t, off)).toBe(true);
      max = Math.max(max, Math.abs(off.x), Math.abs(off.y), Math.abs(off.z));
    }
    expect(max).toBeGreaterThan(0.005);
    expect(max).toBeLessThanOrEqual(0.03);
    for (; t < 1; t += 1 / 60) s.offset(t, off);
    expect(s.offset(t, off)).toBe(false);
  });

  it("« Effets réduits » : ni secousse, ni arrêt sur impact", () => {
    usePrefs.setState({ reducedEffects: true });
    const s = new Shake(0.03);
    s.add(1);
    expect(s.offset(0.016, { x: 0, y: 0, z: 0 })).toBe(false);
    const h = new HitStop();
    h.hit(80, 1000);
    expect(h.frozen(1010)).toBe(false);
  });

  it("l'arrêt sur impact fige l'action le temps demandé, jamais plus de 120 ms", () => {
    const h = new HitStop();
    h.hit(60, 1000);
    expect(h.frozen(1030)).toBe(true);
    expect(h.frozen(1061)).toBe(false);
    h.hit(500, 2000);
    expect(h.frozen(2119)).toBe(true);
    expect(h.frozen(2121)).toBe(false);
  });

  it("pas de vibration avant le premier geste du joueur (le navigateur la refuserait, avec une erreur)", () => {
    const calls: unknown[] = [];
    const vibrate = (p: unknown) => (calls.push(p), true);
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: false }, vibrate });
    buzz("fort");
    expect(calls).toHaveLength(0);
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: true }, vibrate });
    buzz("fort");
    expect(calls).toHaveLength(1);
  });
});
