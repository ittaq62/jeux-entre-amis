import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { CLOSED_TABLE } from "../shared/lateJoin.ts";
import type { LobbyRoom } from "../shared/protocol.ts";
import { BolidesRoom } from "./bolidesRoom.ts";
import { BricksRoom } from "./bricksRoom.ts";
import { CapitaleRoom } from "./capitaleRoom.ts";
import { CramponsRoom } from "./cramponsRoom.ts";
import { MecheRoom } from "./mecheRoom.ts";
import { NavalRoom } from "./navalRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type FakeSocket, type RoomLike } from "./roomHarness.ts";

installWorkerGlobals();

type RoomClass = new (
  state: never,
  env: never,
) => RoomLike & {
  init(opts: unknown): Promise<boolean>;
  refusal(u: unknown): Promise<string | null>;
};

const GAMES: { game: string; Room: RoomClass; bots: boolean }[] = [
  { game: "naval", Room: NavalRoom as unknown as RoomClass, bots: true },
  { game: "bricks", Room: BricksRoom as unknown as RoomClass, bots: true },
  { game: "capitale", Room: CapitaleRoom as unknown as RoomClass, bots: true },
  { game: "meche", Room: MecheRoom as unknown as RoomClass, bots: true },
  { game: "bolides", Room: BolidesRoom as unknown as RoomClass, bots: true },
  { game: "crampons", Room: CramponsRoom as unknown as RoomClass, bots: false },
];

const open: { stopLoop?: () => void }[] = [];
afterEach(() => {
  // Bolides et Crampons font tourner leur course ou leur match : on arrête la boucle
  for (const room of open.splice(0)) room.stopLoop?.();
});

const seated = (v: LobbyRoom) => v.you.seatId !== null;
const names = (v: LobbyRoom) => v.seats.map((s) => s.name);

describe.each(GAMES)("$game", ({ game, Room, bots }) => {
  /** Une table : l'hôte, et un bot là où il y en a */
  async function table(friends: [string, string][] = []) {
    const state = new FakeState();
    const room = new Room(state as never, fakeEnv(friends) as never);
    open.push(room as unknown as { stopLoop?: () => void });
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    if (bots) await bench.send(host, { t: "addBot" });
    return { bench, host, room };
  }
  async function start(bench: Bench<RoomLike>, host: FakeSocket) {
    await bench.send(host, { t: "start" });
    expect(host.view<LobbyRoom>().status).toBe("playing");
  }
  const finish = (bench: Bench<RoomLike>) => void (bench.data<{ status: string }>().status = "finished");

  it("« Regarder » au salon : on regarde, la place reste libre", async () => {
    const { bench, host } = await table();
    const { ws } = await bench.arrive(user("ami"), "?regarder");
    expect(seated(ws.view())).toBe(false);
    expect(names(ws.view())).toEqual(names(host.view()));
  });

  it("« Regarder » pendant la partie puis à la fin, même en revenant : jamais assis", async () => {
    const { bench, host } = await table([["hote", "ami"]]);
    await start(bench, host);
    const before = names(host.view());
    const first = await bench.arrive(user("ami"), "?regarder");
    expect(seated(first.ws.view())).toBe(false);
    finish(bench);
    await bench.drop(first.ws);
    const again = await bench.arrive(user("ami"));
    expect(seated(again.ws.view())).toBe(false);
    expect(names(again.ws.view())).toEqual(before);
  });

  it("arrivé par un lien pendant la partie, il n'est pas assis d'office quand elle finit ; il s'assoit s'il le demande", async () => {
    const { bench, host } = await table([["hote", "ami"]]);
    await start(bench, host);
    const first = await bench.arrive(user("ami"));
    expect(seated(first.ws.view())).toBe(false);
    finish(bench);
    await bench.drop(first.ws);
    const again = await bench.arrive(user("ami"));
    expect(seated(again.ws.view())).toBe(false);
    await bench.send(again.ws, { t: "sit" });
    expect(seated(again.ws.view())).toBe(true);
  });

  it("un lien au salon assoit, comme avant", async () => {
    const { bench } = await table();
    const { ws } = await bench.arrive(user("ami"));
    expect(seated(ws.view())).toBe(true);
  });

  it("fermé par défaut : un inconnu reste à la porte, un ami regarde, le joueur retrouve sa place", async () => {
    const { bench, host, room } = await table([["hote", "ami"]]);
    expect(host.view<LobbyRoom>().settings.lateJoin).toBe(false);
    await start(bench, host);
    const stranger = await bench.arrive(user("inconnu"));
    expect(stranger.refused?.inbox).toEqual([{ t: "closed", reason: CLOSED_TABLE }]);
    expect(stranger.refused?.closedWith).toBe(4004);
    expect(await room.refusal(user("inconnu"))).toBe(CLOSED_TABLE);
    const friend = await bench.arrive(user("ami"), "?jouer");
    expect(friend.refused).toBeNull();
    expect(seated(friend.ws.view())).toBe(false);
    await bench.send(friend.ws, { t: "sit" });
    expect(seated(friend.ws.view())).toBe(false);
    await bench.drop(host);
    const back = await bench.arrive(user("hote"));
    expect(back.ws.view<LobbyRoom>().you.seatId).toBe("hote");
  });

  it("ouvert : qui arrive regarde, ou entre en plein match là où le jeu le permet", async () => {
    const { bench, host } = await table();
    await bench.send(host, { t: "settings", settings: {}, lateJoin: true });
    await start(bench, host);
    const watcher = await bench.arrive(user("inconnu"));
    expect(watcher.refused).toBeNull();
    expect(seated(watcher.ws.view())).toBe(false);
    const player = await bench.arrive(user("joueur"), "?jouer");
    expect(player.refused).toBeNull();
    if (game === "crampons") {
      // Crampons : l'ordinateur lui confie un joueur de son équipe, tout de suite
      expect(seated(player.ws.view())).toBe(true);
      expect(bench.data<{ match: { humans: { id: string }[] } }>().match.humans.map((h) => h.id)).toContain("joueur");
      await bench.send(watcher.ws, { t: "sit" });
      expect(seated(watcher.ws.view())).toBe(true);
    } else {
      expect(seated(player.ws.view())).toBe(false);
      await bench.send(player.ws, { t: "sit" });
      expect(seated(player.ws.view())).toBe(false);
    }
  });
});
