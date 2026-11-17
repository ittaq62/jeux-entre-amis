import { describe, expect, it } from "vitest";
import { due, enqueue, QUEUE_CAP, STALE_MS } from "./eventQueue.ts";

describe("Escarmouche : la file des événements des autres", () => {
  it("chacun passe à son heure, dans l'ordre", () => {
    const q: { at: number; e: number }[] = [];
    enqueue(q, 100, 1);
    enqueue(q, 200, 2);
    expect(due(q, 150)).toEqual([1]);
    expect(due(q, 250)).toEqual([2]);
    expect(q).toEqual([]);
  });

  it("onglet caché une minute : la file reste petite, et au retour les vieux événements sont oubliés", () => {
    const q: { at: number; e: number }[] = [];
    for (let k = 0; k < 20 * 60; k++) enqueue(q, k * 50, k);
    expect(q.length).toBeLessThanOrEqual(QUEUE_CAP);
    const shown = due(q, 60_000);
    expect(shown.length).toBeLessThanOrEqual(STALE_MS / 50 + 1);
    expect(shown.at(-1)).toBe(20 * 60 - 1);
  });
});
