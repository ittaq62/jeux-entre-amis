// Une couleur par balle dans la vraie salle de minigolf : deux joueurs qui préfèrent la même couleur n'ont pas la même
// balle ; un bot cède la sienne ; à l'arrivée, on n'est pas blanc si le blanc est pris.
import { describe, expect, it, vi } from "vitest";

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

interface Data {
  seats: { id: string; kind: string; userId: string | null; look: { color: string; pattern: string; trail: string } }[];
}

async function table() {
  const state = new FakeState();
  const room = new MinigolfRoom(state as never, fakeEnv() as never);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  const guest = (await bench.arrive(user("invite"))).ws;
  (room as unknown as { stopLoop(): void }).stopLoop();
  const d = () => bench.data<Data>();
  const colorOf = (userId: string) => d().seats.find((s) => s.userId === userId)!.look.color;
  return { bench, host, guest, d, colorOf };
}

describe("une couleur par balle (Minigolf)", () => {
  it("à l'arrivée, le blanc pris par l'hôte : l'invité a une autre couleur", async () => {
    const t = await table();
    expect(t.colorOf("hote")).toBe("blanche");
    expect(t.colorOf("invite")).not.toBe("blanche");
  });

  it("l'invité demande la couleur de l'hôte : il a la suivante de libre, son motif gardé", async () => {
    const t = await table();
    await t.bench.send(t.host, { t: "look", look: { color: "bleue", pattern: "unie", trail: "fil" } });
    await t.bench.send(t.guest, { t: "look", look: { color: "bleue", pattern: "rayure", trail: "fil" } });
    expect(t.colorOf("hote")).toBe("bleue");
    expect(t.colorOf("invite")).toBe("violette");
    expect(t.d().seats.find((s) => s.userId === "invite")!.look.pattern).toBe("rayure");
  });

  it("un bot cède sa couleur au joueur qui la veut", async () => {
    const t = await table();
    await t.bench.send(t.host, { t: "addBot" });
    const bot = () => t.d().seats.find((s) => s.kind === "bot")!;
    const botColor = bot().look.color;
    await t.bench.send(t.guest, { t: "look", look: { color: botColor, pattern: "unie", trail: "fil" } });
    expect(t.colorOf("invite")).toBe(botColor);
    expect(bot().look.color).not.toBe(botColor);
    expect(new Set(t.d().seats.map((s) => s.look.color)).size).toBe(3);
  });
});
