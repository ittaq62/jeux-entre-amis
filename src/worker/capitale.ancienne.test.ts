// Une partie de Capitale en cours au moment de la mise en ligne : l'état enregistré a l'ancienne forme (pas de défausse,
// pas de rachat, pas de nouveaux réglages). La salle le recharge et la partie continue, avec ses anciennes règles.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import type { CapitaleState } from "../shared/games/capitale/engine.ts";
import { CapitaleRoom } from "./capitaleRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";

installWorkerGlobals();

afterEach(() => vi.useRealTimers());

describe("Capitale : une partie enregistrée avant la revue", () => {
  it("se recharge et se joue jusqu'au bout, sans rachat ni catastrophe, son vieux paquet tournant comme avant", async () => {
    vi.useFakeTimers();
    let now = Date.now();
    vi.setSystemTime(now);
    const state = new FakeState();
    const env = fakeEnv();
    const first = new CapitaleRoom(state as never, env as never);
    await state.ready;
    await first.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(first, state);
    const host = (await bench.arrive(user("hote"))).ws;
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "settings", settings: { end: "bankrupt", turnSeconds: 30 } });
    await bench.send(host, { t: "start" });
    // L'état tel qu'une version d'avant l'aurait enregistré
    const saved = state.stored.get("room") as { capitale: CapitaleState & Record<string, unknown> };
    const g = saved.capitale;
    for (const k of ["buyout", "disasters", "evenBuild"]) delete (g.settings as unknown as Record<string, unknown>)[k];
    delete g.discards;
    delete g.pendingBuyout;
    g.decks = {
      hasard: [3, 1, 4, 0, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      courrier: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    };
    // La mise en ligne : une nouvelle salle relit le stockage
    const room = new CapitaleRoom(state as never, env as never);
    await state.ready;
    const loaded = (room as unknown as { data: { capitale: CapitaleState } }).data.capitale;
    expect(loaded.discards).toBeUndefined();
    // On joue : les bots jouent quand le temps passe, et le joueur, absent, est remplacé à la fin de son temps
    const bench2 = new Bench(room, state);
    await bench2.arrive(user("hote"));
    const steps = new Set<string>();
    const draws = new Set<string>();
    const current = () => (room as unknown as { data: { capitale: CapitaleState } }).data.capitale;
    for (let k = 0; k < 1500 && current().step !== "over"; k++) {
      const g2 = current();
      steps.add(g2.step);
      if (g2.lastCard) draws.add(`${g2.lastCard.deck}${g2.lastCard.card}`);
      now += 5_000;
      vi.setSystemTime(now);
      await room.alarm();
    }
    const end = current();
    expect(end.turnId).toBeGreaterThan(40);
    expect(draws.size).toBeGreaterThan(3);
    expect(steps.has("buyout")).toBe(false);
    expect(end.discards).toBeUndefined();
    // Aucune carte d'après la revue n'est sortie de ce vieux paquet
    expect(Math.max(...end.decks.hasard, ...end.decks.courrier)).toBeLessThan(16);
    expect(end.deeds.every((d) => !d || (d.level ?? 0) <= 5)).toBe(true);
  }, 30_000);

  it("une nouvelle partie, avec rachat et catastrophes, ne se bloque jamais : un rachat laissé en suspens se refuse au bout du temps", async () => {
    vi.useFakeTimers();
    let now = Date.now();
    vi.setSystemTime(now);
    const state = new FakeState();
    const room = new CapitaleRoom(state as never, fakeEnv() as never);
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    for (let k = 0; k < 3; k++) await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "settings", settings: { end: "bankrupt", turnSeconds: 30, quickStart: true } });
    await bench.send(host, { t: "start" });
    const current = () => (room as unknown as { data: { capitale: CapitaleState } }).data.capitale;
    const steps = new Set<string>();
    const events = new Set<string>();
    for (let k = 0; k < 2500 && current().step !== "over"; k++) {
      steps.add(current().step);
      for (const m of host.inbox.splice(0)) for (const e of (m.events as { type: string }[] | undefined) ?? []) events.add(e.type);
      now += 5_000;
      vi.setSystemTime(now);
      await room.alarm();
    }
    expect(current().turnId).toBeGreaterThan(60);
    expect(current().discards).toBeDefined();
    expect(events.has("card")).toBe(true);
  }, 60_000);
});
