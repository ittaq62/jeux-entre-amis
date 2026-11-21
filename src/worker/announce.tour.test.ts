// L'annonce avant un jeu de tournée, à la table : quand tout le monde est arrivé, quinze secondes pour lire le jeu, ses
// règles et les équipes (et choisir ses skins) ; la partie part plus tôt si tous les joueurs sont prêts. Les Briques,
// qui partaient tout de suite, y passent aussi.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

vi.mock("./tourLink.ts", async (actual) => {
  const real = await actual<typeof import("./tourLink.ts")>();
  return { ...real, reportToTour: vi.fn(async () => {}), abortToTour: vi.fn(async () => {}), tourChat: vi.fn(async () => {}) };
});

import { ANNOUNCE_MS } from "../shared/announce.ts";
import type { GameId, LobbyRoom } from "../shared/protocol.ts";
import { BricksRoom } from "./bricksRoom.ts";
import { GameRoom } from "./room.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type RoomLike } from "./roomHarness.ts";

installWorkerGlobals();

type RoomClass = new (state: never, env: never) => RoomLike & { init(opts: unknown): Promise<boolean>; alarm(): Promise<void> };

const GAMES: { game: GameId; Room: RoomClass; variant: string }[] = [
  { game: "bricks", Room: BricksRoom as unknown as RoomClass, variant: "survie" },
  { game: "uno", Room: GameRoom as unknown as RoomClass, variant: "classique" },
];

afterEach(() => {
  vi.useRealTimers();
});

describe.each(GAMES)("$game en tournée", ({ Room, variant }) => {
  /** Une table de tournée : Ana, Bob et un bot ; personne n'est encore arrivé */
  async function tourTable() {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const state = new FakeState();
    const room = new Room(state as never, fakeEnv() as never);
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
        bots: [{ id: "bot-1", name: "Gaston", avatar: user("x").avatar }],
        botLevel: "normal",
        teams: null,
        variant,
      },
    });
    const bench = new Bench(room, state);
    const status = () => bench.data<{ status: string }>().status;
    const pickUntil = () => bench.data<{ pickUntil?: number | null }>().pickUntil ?? null;
    return { bench, room, now, status, pickUntil };
  }

  it("tout le monde arrive : l'annonce s'ouvre au lieu de lancer la partie, et part à la fin du compte", async () => {
    const { bench, room, now, status, pickUntil } = await tourTable();
    const ana = (await bench.arrive(user("ana"))).ws;
    // Bob n'est pas encore là : pas de compte à rebours
    expect(pickUntil()).toBeNull();
    await bench.arrive(user("bob"));
    expect(status()).toBe("lobby");
    expect(pickUntil()).toBe(now + ANNOUNCE_MS);
    expect(ana.view<LobbyRoom & { pickUntil: number | null }>().pickUntil).toBe(now + ANNOUNCE_MS);
    vi.setSystemTime(now + ANNOUNCE_MS);
    await room.alarm();
    expect(status()).toBe("playing");
    expect(pickUntil()).toBeNull();
  });

  it("tous les joueurs prêts : la partie part sans attendre ; un seul ne suffit pas", async () => {
    const { bench, status } = await tourTable();
    const ana = (await bench.arrive(user("ana"))).ws;
    const bob = (await bench.arrive(user("bob"))).ws;
    await bench.send(ana, { t: "ready" });
    expect(status()).toBe("lobby");
    expect(bob.view<{ ready?: string[] }>().ready).toEqual(["ana"]);
    await bench.send(bob, { t: "ready" });
    expect(status()).toBe("playing");
  });
});
