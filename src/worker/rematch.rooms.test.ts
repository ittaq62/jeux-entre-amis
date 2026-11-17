// Après la partie, à toutes les tables : la revanche repart quand le dernier qui ne l'avait pas demandée s'en va, et la
// place d'un joueur parti pendant la partie se libère (avec la main d'hôte) au lieu de bloquer la table.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import type { LobbyRoom } from "../shared/protocol.ts";
import { BolidesRoom } from "./bolidesRoom.ts";
import { BricksRoom } from "./bricksRoom.ts";
import { CapitaleRoom } from "./capitaleRoom.ts";
import { CramponsRoom } from "./cramponsRoom.ts";
import { CulbuteRoom } from "./culbuteRoom.ts";
import { EscarmoucheRoom } from "./escarmoucheRoom.ts";
import { MecheRoom } from "./mecheRoom.ts";
import { NavalRoom } from "./navalRoom.ts";
import { GameRoom } from "./room.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type RoomLike } from "./roomHarness.ts";

installWorkerGlobals();

type RoomClass = new (state: never, env: never) => RoomLike & { init(opts: unknown): Promise<boolean>; alarm(): Promise<void> };

const GAMES: { game: string; Room: RoomClass; bots: boolean }[] = [
  { game: "uno", Room: GameRoom as unknown as RoomClass, bots: true },
  { game: "naval", Room: NavalRoom as unknown as RoomClass, bots: true },
  { game: "bricks", Room: BricksRoom as unknown as RoomClass, bots: true },
  { game: "capitale", Room: CapitaleRoom as unknown as RoomClass, bots: true },
  { game: "meche", Room: MecheRoom as unknown as RoomClass, bots: true },
  { game: "bolides", Room: BolidesRoom as unknown as RoomClass, bots: true },
  { game: "crampons", Room: CramponsRoom as unknown as RoomClass, bots: false },
  { game: "culbute", Room: CulbuteRoom as unknown as RoomClass, bots: true },
  { game: "escarmouche", Room: EscarmoucheRoom as unknown as RoomClass, bots: true },
];

const open: { stopLoop?: () => void }[] = [];
afterEach(() => {
  for (const room of open.splice(0)) room.stopLoop?.();
  vi.useRealTimers();
});

describe.each(GAMES)("$game", ({ Room, bots }) => {
  /** L'hôte, deux amis assis par le lien, et un bot là où il y en a ; la partie lancée */
  async function playing() {
    const state = new FakeState();
    const room = new Room(state as never, fakeEnv() as never);
    open.push(room as unknown as { stopLoop?: () => void });
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    // La bataille navale et les Briques se jouent à deux par défaut : de la place pour trois
    await bench.send(host, { t: "settings", maxPlayers: 4 });
    const ana = (await bench.arrive(user("ana"))).ws;
    const bob = (await bench.arrive(user("bob"))).ws;
    if (bots) await bench.send(host, { t: "addBot" });
    expect(bob.view<LobbyRoom>().you.seatId).not.toBeNull();
    await bench.send(host, { t: "start" });
    expect(host.view<LobbyRoom>().status).toBe("playing");
    return { bench, room, host, ana, bob };
  }
  /** La partie se termine : la salle fait ce qu'elle fait après le dernier coup */
  async function finish(bench: Bench<RoomLike>, room: unknown) {
    bench.data<{ status: string }>().status = "finished";
    await (room as { afterChange(events: unknown[], now: number): Promise<void> }).afterChange([], Date.now());
  }
  const status = (bench: Bench<RoomLike>) => bench.data<{ status: string }>().status;

  it("deux demandent la revanche, le troisième s'en va : la revanche part", async () => {
    const { bench, room, host, ana, bob } = await playing();
    await finish(bench, room);
    await bench.send(host, { t: "rematch" });
    await bench.send(ana, { t: "rematch" });
    expect(status(bench)).toBe("finished");
    await bench.send(bob, { t: "leave" });
    expect(status(bench)).toBe("playing");
  });

  it("deux demandent la revanche, le troisième ferme son onglet : la revanche part quand sa place se libère", async () => {
    vi.useFakeTimers();
    let now = Date.now();
    vi.setSystemTime(now);
    const { bench, room, host, ana, bob } = await playing();
    await finish(bench, room);
    await bench.send(host, { t: "rematch" });
    await bench.send(ana, { t: "rematch" });
    await bench.drop(bob);
    now += 60_000;
    vi.setSystemTime(now);
    await room.alarm();
    expect(status(bench)).toBe("playing");
  });

  it("l'hôte est parti pendant la partie : après, sa place se libère et un autre reprend la main", async () => {
    vi.useFakeTimers();
    let now = Date.now();
    vi.setSystemTime(now);
    const { bench, room, host, ana } = await playing();
    await bench.drop(host);
    now += 120_000;
    vi.setSystemTime(now);
    await finish(bench, room);
    now += 60_000;
    vi.setSystemTime(now);
    await room.alarm();
    const view = ana.view<LobbyRoom>();
    expect(view.seats.map((s) => s.name)).not.toContain("hote");
    expect(view.you.isHost).toBe(true);
  });
});
