import { describe, expect, it } from "vitest";
import { DRAW_REVEAL_PAUSE, drawDuration, drawSchedule } from "./drawTiming.ts";

/** L'ancien tirage : 70 ms, puis chaque pas 13 % plus long, trois tours complets avant de chercher le jeu tiré */
function oldDoneAt(count: number, target: number): number {
  let at = 0;
  let gap = 70;
  for (let k = 0; k < count * 3 + target + 1; k++) {
    at += gap;
    gap *= 1.13;
  }
  return at + 260;
}

describe("tirage du prochain jeu", () => {
  it("s'arrête toujours sur le jeu tiré, après avoir éclairé chaque affiche au moins une fois", () => {
    for (let count = 2; count <= 12; count++) {
      for (let target = 0; target < count; target++) {
        const { steps } = drawSchedule(count, target);
        expect(steps.at(-1)!.pos).toBe(target);
        expect(new Set(steps.map((s) => s.pos)).size).toBe(count);
        // La lumière avance d'une affiche à chaque pas
        steps.forEach((s, k) => expect(s.pos).toBe((k + 1) % count));
      }
    }
  });

  it("dure le temps prévu, quel que soit le jeu tiré", () => {
    for (let count = 2; count <= 12; count++) {
      for (let target = 0; target < count; target++) {
        const { steps, doneAt } = drawSchedule(count, target);
        expect(Math.abs(steps.at(-1)!.at - drawDuration(count))).toBeLessThanOrEqual(1);
        expect(doneAt).toBe(steps.at(-1)!.at + DRAW_REVEAL_PAUSE);
      }
    }
  });

  it("est un peu plus long avec peu de jeux, un peu plus court avec beaucoup, et reste entre 4 et 5,3 secondes", () => {
    for (let count = 3; count <= 12; count++) expect(drawDuration(count)).toBeLessThanOrEqual(drawDuration(count - 1));
    expect(drawDuration(2)).toBeGreaterThan(drawDuration(7));
    for (let count = 2; count <= 12; count++) {
      for (let target = 0; target < count; target++) {
        const { doneAt } = drawSchedule(count, target);
        expect(doneAt).toBeGreaterThanOrEqual(4000);
        expect(doneAt).toBeLessThanOrEqual(5300);
      }
    }
  });

  it("ralentit régulièrement : la lumière file au début et hésite à la fin", () => {
    for (let count = 2; count <= 12; count++) {
      for (let target = 0; target < count; target++) {
        const { steps } = drawSchedule(count, target);
        const gaps = steps.map((s, k) => s.at - (k === 0 ? 0 : steps[k - 1]!.at));
        for (let k = 1; k < gaps.length; k++) expect(gaps[k]!).toBeGreaterThanOrEqual(gaps[k - 1]!);
        // Assez lent au départ pour qu'on voie la lumière passer, jamais plus d'une seconde par pas à la fin
        expect(gaps[0]!).toBeGreaterThanOrEqual(35);
        expect(gaps.at(-1)!).toBeGreaterThanOrEqual(350);
        expect(gaps.at(-1)!).toBeLessThanOrEqual(1000);
      }
    }
  });

  it("raccourcit nettement le tirage à sept jeux, et allonge celui à deux jeux", () => {
    for (let target = 0; target < 7; target++) expect(drawSchedule(7, target).doneAt).toBeLessThan(oldDoneAt(7, target));
    // Avant : de 7,6 à 16,2 secondes à sept jeux, moins d'une seconde à deux
    expect(oldDoneAt(7, 6)).toBeGreaterThan(16_000);
    expect(oldDoneAt(2, 0)).toBeLessThan(1000);
    for (let target = 0; target < 2; target++) expect(drawSchedule(2, target).doneAt).toBeGreaterThan(oldDoneAt(2, target) * 4);
  });

  it("ne tire rien quand il n'y a qu'un jeu", () => {
    expect(drawSchedule(1, 0)).toEqual({ steps: [], doneAt: 0 });
    expect(drawSchedule(0, 0)).toEqual({ steps: [], doneAt: 0 });
  });
});
