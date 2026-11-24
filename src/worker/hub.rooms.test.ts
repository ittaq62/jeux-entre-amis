// Les tables ouvertes de l'accueil : une table publique que tout le monde a quittée (l'hôte reparti du salon, des bots
// seuls) n'y apparaît plus pendant les dix minutes qu'elle met à s'effacer.
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import type { RoomSummary } from "../shared/protocol.ts";
import { Hub } from "./hub.ts";
import { FakeState, fakeEnv, installWorkerGlobals } from "./roomHarness.ts";

installWorkerGlobals();

function summary(code: string, humans: number, extra: Partial<RoomSummary> = {}): RoomSummary {
  return {
    code,
    game: "uno",
    variant: "classique",
    status: "lobby",
    visibility: "public",
    hostName: "Ana",
    humans,
    bots: 1,
    maxPlayers: 6,
    names: humans > 0 ? ["Ana"] : [],
    createdAt: Date.now(),
    quick: false,
    lateJoin: false,
    ...extra,
  };
}

describe("hub : les tables ouvertes", () => {
  it("ne montre que les tables publiques, pas finies, où quelqu'un attend", async () => {
    const state = new FakeState();
    const hub = new Hub(state as never, fakeEnv() as never);
    await state.ready;
    await hub.upsertRoom(summary("AAAA", 1));
    await hub.upsertRoom(summary("BBBB", 0));
    await hub.upsertRoom(summary("CCCC", 2, { visibility: "private" }));
    await hub.upsertRoom(summary("DDDD", 2, { status: "finished" }));
    await hub.upsertRoom(summary("EEEE", 2, { status: "playing" }));
    const listed = (hub as unknown as { publicRooms(): RoomSummary[] }).publicRooms().map((r) => r.code);
    expect(listed).toEqual(["AAAA", "EEEE"]);
  });
});
