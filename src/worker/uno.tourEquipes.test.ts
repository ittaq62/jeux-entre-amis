import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import type { UnoState } from "../shared/games/uno/engine.ts";
import { GameRoom } from "./room.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";
import { TOUR_JOIN_MS } from "./tourLink.ts";

installWorkerGlobals();

afterEach(() => vi.useRealTimers());

/** Une table de UNO en tournée 2 contre 2 : Ana et Cleo (rouges) contre Bob et Gaston, un bot (bleus) */
async function tourTable() {
  vi.useFakeTimers();
  const now = 1_800_000_000_000;
  vi.setSystemTime(now);
  const state = new FakeState();
  // La tournée reçoit les messages de la table : ici, elle les ignore
  const tour = { tableChat: async () => {}, tableFinished: async () => {}, tableAborted: async () => {} };
  const env = { ...fakeEnv(), TOURS: { idFromName: () => "tour", get: () => tour } };
  const room = new GameRoom(state as never, env as never);
  await state.ready;
  await room.init({
    code: "ABCD",
    host: user("ana"),
    visibility: "private",
    quick: false,
    tour: {
      code: "TOUR",
      index: 1,
      players: [user("ana"), user("bob"), user("cleo")],
      bots: [{ id: "bot-1", name: "Gaston", avatar: user("x").avatar }],
      botLevel: "normal",
      teams: { ana: 0, cleo: 0, bob: 1, "bot-1": 1 },
      variant: "classique",
    },
  });
  return { room, bench: new Bench(room, state), now };
}

const data = (bench: { data<T>(): T }) => bench.data<{ status: string; uno: UnoState | null; seats: { id: string; team?: number }[] }>();

describe("UNO en tournée par équipes", () => {
  it("tout le monde est là : on joue en équipes", async () => {
    const { room, bench, now } = await tourTable();
    for (const u of ["ana", "bob", "cleo"]) await bench.arrive(user(u));
    vi.setSystemTime(now + 60_000);
    await room.alarm();
    expect(data(bench).status).toBe("playing");
    expect(data(bench).uno?.teams).toEqual({ ana: 0, cleo: 0, bob: 1, "bot-1": 1 });
  });

  it("un absent au départ : pas de 1 contre 2 qui finirait tout de suite, chacun joue pour soi", async () => {
    const { room, bench, now } = await tourTable();
    // Cleo n'arrive pas
    for (const u of ["ana", "bob"]) await bench.arrive(user(u));
    vi.setSystemTime(now + TOUR_JOIN_MS + 1);
    await room.alarm();
    const d = data(bench);
    expect(d.status).toBe("playing");
    expect(d.uno?.players.map((p) => p.id).sort()).toEqual(["ana", "bob", "bot-1"]);
    expect(d.uno?.teams ?? null).toBeNull();
    expect(d.seats.every((s) => s.team === undefined)).toBe(true);
  });
});
