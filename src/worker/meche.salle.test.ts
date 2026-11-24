import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { MecheRoom } from "./mecheRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";

installWorkerGlobals();

describe("Mèche, le départ", () => {
  it("deux « Lancer » coup sur coup, pendant que le dictionnaire se charge, ne lancent qu'une partie", async () => {
    const state = new FakeState();
    const room = new MecheRoom(state as never, fakeEnv() as never);
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    await bench.send(host, { t: "addBot" });
    await Promise.all([bench.send(host, { t: "start" }), bench.send(host, { t: "start" })]);
    const starts = host.inbox
      .filter((m) => m.t === "chat")
      .flatMap((m) => (m.messages as { text: string }[]) ?? [])
      .filter((c) => c.text.startsWith("La partie commence"));
    expect(starts).toHaveLength(1);
    expect(bench.data<{ status: string }>().status).toBe("playing");
    (room as unknown as { stopBot(): void }).stopBot();
  });
});
