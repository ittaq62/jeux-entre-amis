// Un message qui n'est pas un objet (« null », un nombre, une chaîne) est ignoré par toutes les salles, sans exception.
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { BolidesRoom } from "./bolidesRoom.ts";
import { BricksRoom } from "./bricksRoom.ts";
import { CapitaleRoom } from "./capitaleRoom.ts";
import { CramponsRoom } from "./cramponsRoom.ts";
import { CulbuteRoom } from "./culbuteRoom.ts";
import { MinigolfRoom } from "./minigolfRoom.ts";
import { BowlingRoom } from "./bowlingRoom.ts";
import { BillardRoom } from "./billardRoom.ts";
import { CourRoom } from "./courRoom.ts";
import { ToqueRoom } from "./toqueRoom.ts";
import { EscarmoucheRoom } from "./escarmoucheRoom.ts";
import { MecheRoom } from "./mecheRoom.ts";
import { NavalRoom } from "./navalRoom.ts";
import { GameRoom } from "./room.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type RoomLike } from "./roomHarness.ts";
import { TourRoom } from "./tourRoom.ts";

installWorkerGlobals();

type RoomClass = new (state: never, env: never) => RoomLike & { init(opts: unknown): Promise<boolean>; stopLoop?: () => void };

const ROOMS: { name: string; Room: RoomClass }[] = [
  { name: "uno", Room: GameRoom as unknown as RoomClass },
  { name: "naval", Room: NavalRoom as unknown as RoomClass },
  { name: "bricks", Room: BricksRoom as unknown as RoomClass },
  { name: "capitale", Room: CapitaleRoom as unknown as RoomClass },
  { name: "meche", Room: MecheRoom as unknown as RoomClass },
  { name: "bolides", Room: BolidesRoom as unknown as RoomClass },
  { name: "crampons", Room: CramponsRoom as unknown as RoomClass },
  { name: "culbute", Room: CulbuteRoom as unknown as RoomClass },
  { name: "escarmouche", Room: EscarmoucheRoom as unknown as RoomClass },
  { name: "minigolf", Room: MinigolfRoom as unknown as RoomClass },
  { name: "bowling", Room: BowlingRoom as unknown as RoomClass },
  { name: "billard", Room: BillardRoom as unknown as RoomClass },
  { name: "cour", Room: CourRoom as unknown as RoomClass },
  { name: "toque", Room: ToqueRoom as unknown as RoomClass },
  { name: "tournée", Room: TourRoom as unknown as RoomClass },
];

describe.each(ROOMS)("$name", ({ Room }) => {
  it("« null », un nombre ou une chaîne : ignorés sans erreur", async () => {
    const state = new FakeState();
    const room = new Room(state as never, fakeEnv() as never);
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    for (const raw of ["null", "42", '"bonjour"', "true", "[]"]) {
      await expect(room.webSocketMessage(host as unknown as WebSocket, raw)).resolves.toBeUndefined();
    }
    room.stopLoop?.();
  });
});

describe.each([
  { name: "culbute", Room: CulbuteRoom as unknown as RoomClass },
  { name: "escarmouche", Room: EscarmoucheRoom as unknown as RoomClass },
  { name: "minigolf", Room: MinigolfRoom as unknown as RoomClass },
  { name: "bowling", Room: BowlingRoom as unknown as RoomClass },
  { name: "billard", Room: BillardRoom as unknown as RoomClass },
  { name: "cour", Room: CourRoom as unknown as RoomClass },
  { name: "toque", Room: ToqueRoom as unknown as RoomClass },
])("$name", ({ Room }) => {
  it("changer d'équipe en rafale au salon : pas une écriture par message", async () => {
    const state = new FakeState();
    const room = new Room(state as never, fakeEnv() as never);
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    let writes = 0;
    const put = state.storage.put;
    state.storage.put = async (key: string, value: unknown) => {
      writes++;
      return put(key, value);
    };
    for (let k = 0; k < 50; k++) await bench.send(host, { t: "team", team: k % 2 });
    expect(writes).toBeLessThanOrEqual(2);
  });
});
