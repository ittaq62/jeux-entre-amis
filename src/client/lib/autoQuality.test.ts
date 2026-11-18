import { describe, expect, it } from "vitest";
import { AutoQuality } from "./autoQuality.ts";

/** Un appareil simulé : le temps d'une image dépend des crans pris (ce que chaque cran fait gagner, en ms) */
function device(levers: string[], frameMs: (on: readonly boolean[]) => number) {
  const applied: string[] = [];
  let hidden = false;
  const q = new AutoQuality({
    levers,
    apply: (on) => applied.push(on.map((x) => (x ? "1" : "0")).join("")),
    hidden: () => hidden,
  });
  let now = 0;
  const run = (seconds: number) => {
    const end = now + seconds * 1000;
    while (now < end) {
      q.tick(now);
      now += frameMs(q.on);
    }
  };
  return { q, run, applied, hide: (h: boolean) => (hidden = h), pause: (ms: number) => (now += ms) };
}

describe("la qualité automatique", () => {
  it("ne touche à rien sur un appareil à l'aise", () => {
    const d = device(["pixels", "pixels", "ombres"], () => 1000 / 60);
    d.run(60);
    expect(d.q.level).toBe(0);
    expect(d.applied).toEqual([]);
  });

  it("allège d'un cran quand l'appareil peine, et garde ce qui a servi", () => {
    // 30 images par seconde ; le premier cran de pixels suffit pour revenir à 60
    const d = device(["pixels", "pixels", "ombres"], (on) => (on[0] ? 1000 / 60 : 1000 / 30));
    d.run(30);
    expect(d.q.on).toEqual([true, false, false]);
  });

  it("défait un cran qui ne sert à rien et essaie le genre suivant (le processeur peine, pas la carte graphique)", () => {
    // Seules les ombres font gagner du temps
    const d = device(["pixels", "pixels", "ombres"], (on) => (on[2] ? 1000 / 58 : 1000 / 32));
    d.run(60);
    expect(d.q.on).toEqual([false, false, true]);
  });

  it("n'allège plus rien sur un appareil qui plafonne quoi qu'on fasse (économie d'énergie)", () => {
    const d = device(["pixels", "pixels", "ombres"], () => 1000 / 30);
    d.run(120);
    expect(d.q.level).toBe(0);
  });

  it("ne garde pas un cran sur la foi d'une seconde chanceuse (les images varient d'une seconde à l'autre)", () => {
    // Entre 39 et 49 images par seconde selon le moment, quoi qu'on fasse
    let t = 0;
    const d = device(["pixels", "pixels", "ombres"], () => {
      const ms = 1000 / (44 + 5 * Math.sin(t / 700));
      t += ms;
      return ms;
    });
    d.run(120);
    expect(d.q.level).toBe(0);
  });

  it("sur une carte graphique qui peine, prend vite chaque cran utile, même un petit gain à basse cadence", () => {
    // 20 images par seconde ; l'ombre des recoins fait gagner 15 %, chaque cran de pixels 30 %
    const gain = [1.15, 1.3, 1.3, 1.3, 1.1];
    const d = device(
      ["recoins", "pixels", "pixels", "pixels", "ombres"],
      (on) => 1000 / on.reduce((f, x, i) => (x ? f * gain[i]! : f), 20),
    );
    d.run(30);
    expect(d.q.on.slice(0, 4)).toEqual([true, true, true, true]);
  });

  it("remonte d'un cran quand tout redevient fluide", () => {
    let heavy = true;
    const d = device(["pixels", "ombres"], (on) => (heavy && !on[0] ? 1000 / 30 : 1000 / 60));
    d.run(9);
    expect(d.q.on[0]).toBe(true);
    // Le moment chargé est passé
    heavy = false;
    d.run(20);
    expect(d.q.level).toBe(0);
  });

  it("ne retente pas une remontée qui n'a pas tenu", () => {
    const d = device(["pixels", "ombres"], (on) => (on[0] ? 1000 / 56 : 1000 / 30));
    d.run(120);
    expect(d.q.on[0]).toBe(true);
    // Une seule remontée essayée, puis le cran reste pris
    const raises = d.applied.filter((s) => s === "00").length;
    expect(raises).toBeLessThanOrEqual(1);
  });

  it("ne compte ni l'onglet caché ni la reprise après une pause", () => {
    const d = device(["pixels"], () => 1000 / 60);
    d.run(5);
    d.hide(true);
    d.pause(30_000);
    d.run(5);
    d.hide(false);
    d.run(10);
    expect(d.applied).toEqual([]);
  });
});
