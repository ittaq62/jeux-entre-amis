// Les jeux en temps réel tournent dans une boucle en mémoire. Si l'objet redémarre (une mise en ligne) et que plus
// personne n'est connecté pour le rappeler, seule une alarme le réveille : pendant la partie, il en garde toujours une.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { BolidesRoom } from "./bolidesRoom.ts";
import { CramponsRoom } from "./cramponsRoom.ts";
import { CulbuteRoom } from "./culbuteRoom.ts";
import { MinigolfRoom } from "./minigolfRoom.ts";
import { EscarmoucheRoom } from "./escarmoucheRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type RoomLike } from "./roomHarness.ts";

installWorkerGlobals();

type RoomClass = new (
  state: never,
  env: never,
) => RoomLike & { init(opts: unknown): Promise<boolean>; alarm(): Promise<void>; stopLoop(): void };

const GAMES: { game: string; Room: RoomClass; bots: boolean }[] = [
  { game: "bolides", Room: BolidesRoom as unknown as RoomClass, bots: true },
  { game: "crampons", Room: CramponsRoom as unknown as RoomClass, bots: false },
  { game: "culbute", Room: CulbuteRoom as unknown as RoomClass, bots: true },
  { game: "escarmouche", Room: EscarmoucheRoom as unknown as RoomClass, bots: true },
  { game: "minigolf", Room: MinigolfRoom as unknown as RoomClass, bots: true },
];

const open: { stopLoop(): void }[] = [];
afterEach(() => {
  for (const room of open.splice(0)) room.stopLoop();
});

describe.each(GAMES)("$game", ({ Room, bots }) => {
  it("pendant la partie, une alarme reste posée ; l'objet redémarré relance sa boucle quand elle sonne", async () => {
    const state = new FakeState();
    let alarm: number | null = null;
    Object.assign(state.storage, {
      setAlarm: async (at: number) => void (alarm = at),
      deleteAlarm: async () => void (alarm = null),
    });
    const room = new Room(state as never, fakeEnv() as never);
    open.push(room);
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    if (bots) await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "start" });
    expect(bench.data<{ status: string }>().status).toBe("playing");
    // Tout le monde est là, aucun minuteur en cours : il reste quand même une alarme, proche
    expect(alarm).not.toBeNull();
    expect(alarm!).toBeLessThanOrEqual(Date.now() + 120_000);
    // L'objet redémarre : la nouvelle instance, réveillée par l'alarme, relance la partie et repose son alarme
    room.stopLoop();
    alarm = null;
    const again = new Room(state as never, fakeEnv() as never);
    open.push(again);
    await state.ready;
    await again.alarm();
    expect((again as unknown as { loop: unknown }).loop).toBeTruthy();
    expect(alarm).not.toBeNull();
  });
});
