import { describe, expect, it } from "vitest";
import { effectsLevel, musicLevel } from "./sound.ts";

describe("le son commun à tous les jeux", () => {
  it("effets et musique : sous le volume général, chacun le sien ; tout à 0 quand le son est coupé", () => {
    const p = { sound: true, volume: 0.5, sfxVolume: 0.4, musicVolume: 0.8 };
    expect(effectsLevel(p)).toBeCloseTo(0.2);
    expect(musicLevel(p)).toBeCloseTo(0.4);
    expect(effectsLevel({ ...p, sound: false })).toBe(0);
    expect(musicLevel({ ...p, sound: false })).toBe(0);
    expect(musicLevel({ ...p, musicVolume: 0 })).toBe(0);
  });
});
