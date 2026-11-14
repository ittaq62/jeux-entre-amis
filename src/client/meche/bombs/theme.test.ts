import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOMBS } from "../../../shared/games/meche/bombs.ts";
import { BOMB_THEMES } from "./theme.ts";

// Les noms des sons et leurs fichiers, lus dans le module des sons (sans le charger : il a besoin du navigateur)
const soundModule = readFileSync("src/client/lib/sound.ts", "utf8");
const fileOf = (name: string) => soundModule.match(new RegExp(`\\n  ${name}: \\["([^"]+)"\\]`))?.[1];

describe("les bombes de Mèche à l'écran", () => {
  it("chaque bombe a ses couleurs, sa mèche et sa fin", () => {
    expect(Object.keys(BOMB_THEMES).sort()).toEqual(BOMBS.map((b) => b.id).sort());
    for (const t of Object.values(BOMB_THEMES)) {
      for (const color of [t.rope, t.ropeDark, t.spark, t.sparkHot, t.flash]) expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.debris.colors.length).toBeGreaterThan(0);
      // La trace reste au moins le temps de la fin, et la fin tient dans la pause entre deux mèches
      expect(t.markMs).toBeGreaterThanOrEqual(t.fxMs);
      expect(t.fxMs).toBeLessThanOrEqual(3200);
    }
  });

  it("chaque bombe a deux sons à elle, et leurs fichiers sont là", () => {
    const names = Object.values(BOMB_THEMES).flatMap((t) => [t.fuse, t.boom]);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      const file = fileOf(name);
      expect(file, name).toBeTruthy();
      expect(readFileSync(`public/sounds/${file}`).byteLength, file).toBeGreaterThan(1000);
    }
  });
});
