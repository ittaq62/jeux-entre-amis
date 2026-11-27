import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrefs } from "../stores/prefs.ts";
import { vibrate } from "./sound.ts";

afterEach(() => {
  usePrefs.setState({ haptics: true });
  vi.unstubAllGlobals();
});

describe("les vibrations du site", () => {
  it("rien avant le premier geste du joueur (le navigateur la refuserait, avec une erreur dans la console)", () => {
    const calls: unknown[] = [];
    const vib = (p: unknown) => (calls.push(p), true);
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: false }, vibrate: vib });
    vibrate(40);
    expect(calls).toHaveLength(0);
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: true }, vibrate: vib });
    vibrate(40);
    expect(calls).toEqual([40]);
  });

  it("le réglage « Vibrations » coupé : rien, même après un geste", () => {
    const calls: unknown[] = [];
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: true }, vibrate: (p: unknown) => (calls.push(p), true) });
    usePrefs.setState({ haptics: false });
    vibrate([60, 40, 90]);
    expect(calls).toHaveLength(0);
  });

  it("un navigateur sans userActivation ni vibration (iPhone) : pas d'erreur", () => {
    vi.stubGlobal("navigator", {});
    expect(() => vibrate(40)).not.toThrow();
  });
});
