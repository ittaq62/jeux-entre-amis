// Capitale Builder à la table : le réglage passe du salon à la partie, les bots bâtissent jusqu'au bout, et un joueur
// bâtit chez lui pendant le tour d'un autre sans le faire attendre.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { actorOf, type CapitaleState } from "../shared/games/capitale/engine.ts";
import { CapitaleRoom } from "./capitaleRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";

installWorkerGlobals();

afterEach(() => vi.useRealTimers());

async function table(settings: Record<string, unknown>, bots = 3) {
  const state = new FakeState();
  const room = new CapitaleRoom(state as never, fakeEnv() as never);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  for (let k = 0; k < bots; k++) await bench.send(host, { t: "addBot" });
  await bench.send(host, { t: "settings", settings });
  return { room, bench, host };
}

describe("Capitale Builder à la table", () => {
  it("une table neuve est en classique ; l'hôte choisit Builder au salon", async () => {
    const { bench, host } = await table({});
    const d = bench.data<{ settings: { capitale: { builder?: boolean } } }>();
    expect(d.settings.capitale.builder).toBe(false);
    await bench.send(host, { t: "settings", settings: { builder: true } });
    expect(d.settings.capitale.builder).toBe(true);
    // Une valeur qui n'est pas un booléen est ignorée
    await bench.send(host, { t: "settings", settings: { builder: "oui" } });
    expect(d.settings.capitale.builder).toBe(true);
  });

  it("les bots bâtissent sur la carte, et la partie va au bout", async () => {
    vi.useFakeTimers();
    let now = Date.now();
    vi.setSystemTime(now);
    const { room, bench, host } = await table({ builder: true, end: "bankrupt", turnSeconds: 30, quickStart: true });
    await bench.send(host, { t: "start" });
    const current = () => bench.data<{ capitale: CapitaleState }>().capitale;
    expect(current().settings.builder).toBe(true);
    const events = new Set<string>();
    for (let k = 0; k < 3000 && current().step !== "over"; k++) {
      for (const m of host.inbox.splice(0)) for (const e of (m.events as { type: string }[] | undefined) ?? []) events.add(e.type);
      now += 5_000;
      vi.setSystemTime(now);
      await room.alarm();
    }
    expect(current().turnId).toBeGreaterThan(60);
    expect(events.has("build")).toBe(true);
    // Aucune ville n'a été améliorée « à l'ancienne »
    expect(current().deeds.every((d) => !d || !d.level)).toBe(true);
  }, 60_000);

  it("on bâtit chez soi pendant le tour d'un bot : accepté, sans faire attendre le bot", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const { bench, host } = await table({ builder: true, end: "bankrupt" }, 2);
    await bench.send(host, { t: "start" });
    const d = bench.data<{ capitale: CapitaleState; actionSeq: number; seats: { id: string; kind: string }[] }>();
    const g = d.capitale;
    const me = d.seats.find((s) => s.kind === "human")!.id;
    // C'est au tour d'un bot
    g.turn = g.players.findIndex((p) => p.id !== me);
    g.step = "roll";
    g.deeds[39]!.owner = me;
    expect(actorOf(g)).not.toBe(me);
    const seq = d.actionSeq;
    host.inbox.splice(0);
    await bench.send(host, { t: "action", action: { type: "build", square: 39, kind: "maison", x: 30, z: 30, rot: 0 } });
    expect(g.deeds[39]!.lot).toEqual([{ id: 1, kind: "maison", x: 30, z: 30, rot: 0 }]);
    expect(d.actionSeq).toBe(seq);
    expect(host.inbox.some((m) => m.t === "error")).toBe(false);
    // Un bâtiment hors des frontières est refusé, avec la raison (un peu plus tard : les coups trop rapprochés sont ignorés)
    vi.setSystemTime(now + 500);
    await bench.send(host, { t: "action", action: { type: "build", square: 39, kind: "maison", x: 0, z: 0, rot: 0 } });
    expect(host.inbox.some((m) => m.t === "error" && m.message === "Hors des frontières de la ville.")).toBe(true);
  });

  it("tourner ses bâtiments sans arrêt pendant le tour d'un bot ne repousse pas son coup", async () => {
    vi.useFakeTimers();
    let now = Date.now();
    vi.setSystemTime(now);
    const { bench, host } = await table({ builder: true, end: "bankrupt" }, 2);
    await bench.send(host, { t: "start" });
    const d = bench.data<{ capitale: CapitaleState; animUntil: number; seats: { id: string; kind: string }[] }>();
    const g = d.capitale;
    const me = d.seats.find((s) => s.kind === "human")!.id;
    g.turn = g.players.findIndex((p) => p.id !== me);
    g.step = "roll";
    g.deeds[39]!.owner = me;
    now += 5_000;
    vi.setSystemTime(now);
    await bench.send(host, { t: "action", action: { type: "build", square: 39, kind: "immeuble", x: 30, z: 30, rot: 0 } });
    const before = d.animUntil;
    for (let k = 0; k < 20; k++) {
      now += 130;
      vi.setSystemTime(now);
      await bench.send(host, { t: "action", action: { type: "relocate", square: 39, id: 1, x: 30, z: 30, rot: k % 2 } });
    }
    expect(g.deeds[39]!.lot![0]!.rot).toBe(1);
    expect(d.animUntil).toBe(before);
  });
});
