// Le minigolf en tournée : une petite table joue chacun son tour, une grande tous en même temps (chacun son tour, un
// trou y durerait plusieurs minutes et la tournée attendrait cette table).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { MinigolfRoom } from "./minigolfRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";

installWorkerGlobals();

afterEach(() => {
  vi.useRealTimers();
});

/** Une table de tournée : Ana, Bob et des bots ; tout le monde arrive et se dit prêt */
async function tourTable(bots: number) {
  vi.useFakeTimers();
  vi.setSystemTime(Date.now());
  const state = new FakeState();
  // La tournée elle-même : elle reçoit les messages de la table et n'en dit rien
  const tour = { tableChat: async () => {}, tableFinished: async () => {}, tableAborted: async () => {} };
  const env = { ...(fakeEnv() as object), TOURS: { idFromName: () => "tour", get: () => tour } };
  const room = new MinigolfRoom(state as never, env as never);
  await state.ready;
  await room.init({
    code: "ABCD",
    host: user("ana"),
    visibility: "private",
    quick: false,
    tour: {
      code: "TOUR",
      index: 1,
      players: [user("ana"), user("bob")],
      bots: Array.from({ length: bots }, (_, i) => ({ id: `bot-${i + 1}`, name: `Bot ${i + 1}`, avatar: user("x").avatar })),
      botLevel: "normal",
      teams: null,
      variant: "classique",
    },
  });
  const bench = new Bench(room, state);
  const ana = (await bench.arrive(user("ana"))).ws;
  const bob = (await bench.arrive(user("bob"))).ws;
  await bench.send(ana, { t: "ready" });
  await bench.send(bob, { t: "ready" });
  (room as unknown as { stopLoop(): void }).stopLoop();
  return bench.data<{ status: string; seats: unknown[]; match: { cfg: { turns: boolean } } }>();
}

describe("le minigolf en tournée", () => {
  it("à quatre, la table joue chacun son tour", async () => {
    const d = await tourTable(2);
    expect(d.status).toBe("playing");
    expect(d.seats).toHaveLength(4);
    expect(d.match.cfg.turns).toBe(true);
  });

  it("à cinq ou plus, tous en même temps", async () => {
    const d = await tourTable(4);
    expect(d.seats).toHaveLength(6);
    expect(d.match.cfg.turns).toBe(false);
  });
});
