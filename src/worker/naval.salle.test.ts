import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import type { NavalState } from "../shared/games/naval/engine.ts";
import { NavalRoom } from "./navalRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";

installWorkerGlobals();

interface Data {
  naval: NavalState | null;
  status: string;
  settings: { maxPlayers: number; naval: { teams: boolean } };
  seats: { id: string; kind: string; userId: string | null; team?: number }[];
}

async function table() {
  const state = new FakeState();
  const room = new NavalRoom(state as never, fakeEnv([["hote", "ami"]]) as never);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  return { room, bench, host, d: () => bench.data<Data>() };
}

describe("Bataille navale, la salle", () => {
  it("le 2 contre 2 se décoche quand la table n'a plus quatre places : la partie se joue en mêlée, comme le salon l'affiche", async () => {
    const { bench, host, d } = await table();
    await bench.send(host, { t: "settings", settings: {}, maxPlayers: 4 });
    await bench.send(host, { t: "settings", settings: { teams: true } });
    expect(d().settings.naval.teams).toBe(true);
    await bench.send(host, { t: "settings", settings: {}, maxPlayers: 5 });
    expect(d().settings.naval.teams).toBe(false);
    for (let i = 0; i < 3; i++) await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "start" });
    expect(d().naval?.players.every((p) => p.team === null)).toBe(true);
  });

  it("en 2 contre 2, un marin parti au salon empêche le départ au lieu de basculer en mêlée", async () => {
    const { bench, host, d } = await table();
    await bench.send(host, { t: "settings", settings: {}, maxPlayers: 4 });
    await bench.send(host, { t: "settings", settings: { teams: true } });
    const ami = (await bench.arrive(user("ami"))).ws;
    for (let i = 0; i < 2; i++) await bench.send(host, { t: "addBot" });
    expect(d().seats).toHaveLength(4);
    await bench.drop(ami);
    await bench.send(host, { t: "start" });
    expect(d().status).toBe("lobby");
    expect(host.errors().at(-1)).toMatch(/2 contre 2 se joue à quatre/);
  });

  it("un joueur qui quitte pendant le placement n'est pas attendu : sa flotte (la dernière rangée) est prête", async () => {
    const { bench, host, d } = await table();
    const ami = (await bench.arrive(user("ami"))).ws;
    await bench.send(host, { t: "start" });
    expect(d().naval?.phase).toBe("placement");
    await bench.send(ami, { t: "leave" });
    const g = d().naval!;
    const amiSeat = d().seats.find((s) => s.userId === "ami")!;
    expect(g.players.find((p) => p.id === amiSeat.id)?.ready).toBe(true);
    // L'hôte se dit prêt : la bataille part tout de suite
    await bench.send(host, { t: "action", action: { type: "ready" } });
    expect(d().naval?.phase).toBe("battle");
  });
});

describe("Bataille navale sans limite de temps", () => {
  it("un joueur resté là sans tirer trois minutes à son tour laisse la barre à un bot", async () => {
    vi.useFakeTimers();
    let now = 1_800_000_000_000;
    vi.setSystemTime(now);
    const { room, bench, host, d } = await table();
    await bench.send(host, { t: "settings", settings: { turnSeconds: 0 } });
    const ami = (await bench.arrive(user("ami"))).ws;
    await bench.send(host, { t: "start" });
    await bench.send(host, { t: "action", action: { type: "ready" } });
    await bench.send(ami, { t: "action", action: { type: "ready" } });
    const g = d().naval!;
    expect(g.phase).toBe("battle");
    const shooter = d().seats.find((s) => s.id === g.players[g.turn]!.id)!;
    now += 3 * 60_000 + 1000;
    vi.setSystemTime(now);
    await (room as unknown as { alarm(): Promise<void> }).alarm();
    expect((shooter as unknown as { autoplay: unknown }).autoplay).toBe("afk");
    vi.useRealTimers();
  });
});
