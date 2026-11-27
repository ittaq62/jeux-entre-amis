// La vie d'une table entre deux parties, à toutes les tables : jamais de partie de bots seuls quand plus aucun joueur
// n'est là (sinon celui qui revient trouve sa table commencée sans lui) ; exclure ou retirer celui qu'on attendait laisse
// partir la revanche ; un hôte qui regardait et s'en va laisse la main à un joueur présent.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { ANNOUNCE_MS } from "../shared/announce.ts";
import type { LobbyRoom } from "../shared/protocol.ts";
import { BolidesRoom } from "./bolidesRoom.ts";
import { BricksRoom } from "./bricksRoom.ts";
import { CapitaleRoom } from "./capitaleRoom.ts";
import { CramponsRoom } from "./cramponsRoom.ts";
import { CulbuteRoom } from "./culbuteRoom.ts";
import { MinigolfRoom } from "./minigolfRoom.ts";
import { BowlingRoom } from "./bowlingRoom.ts";
import { BillardRoom } from "./billardRoom.ts";
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
  { game: "minigolf", Room: MinigolfRoom as unknown as RoomClass, bots: true },
  { game: "bowling", Room: BowlingRoom as unknown as RoomClass, bots: true },
  { game: "billard", Room: BillardRoom as unknown as RoomClass, bots: true },
];

const open: { stopLoop?: () => void }[] = [];
afterEach(() => {
  for (const room of open.splice(0)) room.stopLoop?.();
  vi.useRealTimers();
});

describe.each(GAMES)("$game", ({ Room, bots }) => {
  async function table() {
    const state = new FakeState();
    const room = new Room(state as never, fakeEnv() as never);
    open.push(room as unknown as { stopLoop?: () => void });
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    return { room, bench: new Bench(room, state) };
  }
  /** L'hôte, deux amis et un bot (là où il y en a), la partie lancée */
  async function playing() {
    const { room, bench } = await table();
    const host = (await bench.arrive(user("hote"))).ws;
    await bench.send(host, { t: "settings", maxPlayers: 4 });
    const ana = (await bench.arrive(user("ana"))).ws;
    const bob = (await bench.arrive(user("bob"))).ws;
    if (bots) await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "start" });
    expect(host.view<LobbyRoom>().status).toBe("playing");
    return { bench, room, host, ana, bob };
  }
  async function finish(bench: Bench<RoomLike>, room: unknown) {
    bench.data<{ status: string }>().status = "finished";
    await (room as { afterChange(events: unknown[], now: number): Promise<void> }).afterChange([], Date.now());
  }
  const status = (bench: Bench<RoomLike>) => bench.data<{ status: string }>().status;
  const pickUntil = (bench: Bench<RoomLike>) => bench.data<{ pickUntil?: number | null }>().pickUntil ?? null;

  it("« Rejouer », puis plus personne n'est là à la fin de l'annonce : pas de partie sans eux", async () => {
    vi.useFakeTimers();
    let now = Date.now();
    vi.setSystemTime(now);
    const { bench, room, host, ana, bob } = await playing();
    await finish(bench, room);
    await bench.send(host, { t: "start" });
    expect(pickUntil(bench)).toBeGreaterThan(now);
    // La connexion de la maison tombe pour tout le monde pendant l'annonce
    for (const ws of [host, ana, bob]) await bench.drop(ws);
    now += ANNOUNCE_MS;
    vi.setSystemTime(now);
    await room.alarm();
    expect(status(bench)).toBe("finished");
    expect(pickUntil(bench)).toBeNull();
    // Ils reviennent : leur table les attend, ils sont toujours assis
    const back = (await bench.arrive(user("ana"))).ws;
    expect(back.view<LobbyRoom>().you.seatId).not.toBeNull();
  });

  it("un seul a demandé la revanche, puis tous s'en vont : leurs places se libèrent sans lancer de partie", async () => {
    vi.useFakeTimers();
    let now = Date.now();
    vi.setSystemTime(now);
    const { bench, room, host, ana, bob } = await playing();
    await finish(bench, room);
    await bench.send(host, { t: "rematch" });
    for (const ws of [host, ana, bob]) await bench.drop(ws);
    // Leurs places se libèrent (25 s) : aucune partie ne part
    now += 30_000;
    vi.setSystemTime(now);
    await room.alarm();
    expect(status(bench)).toBe("finished");
    expect(pickUntil(bench)).toBeNull();
    // Puis la table vide ferme (une minute)
    now += 31_000;
    vi.setSystemTime(now);
    await room.alarm();
    expect(bench.data()).toBeNull();
  });

  it("deux demandent la revanche, l'hôte exclut le troisième : la revanche part", async () => {
    const { bench, room, host, ana } = await playing();
    await finish(bench, room);
    await bench.send(host, { t: "rematch" });
    await bench.send(ana, { t: "rematch" });
    expect(pickUntil(bench)).toBeNull();
    await bench.send(host, { t: "kick", userId: "bob" });
    expect(pickUntil(bench)).toBeGreaterThan(Date.now() - 1);
    expect(bench.data<{ rematch: string[] }>().rematch).not.toContain("bob");
  });

  it("deux demandent la revanche, l'hôte retire la place du troisième : la revanche part", async () => {
    const { bench, room, host, ana } = await playing();
    await finish(bench, room);
    await bench.send(host, { t: "rematch" });
    await bench.send(ana, { t: "rematch" });
    const bobSeat = host.view<LobbyRoom>().seats.find((s) => s.userId === "bob")!;
    await bench.send(host, { t: "removeSeat", seatId: bobSeat.id });
    expect(pickUntil(bench)).toBeGreaterThan(Date.now() - 1);
  });

  it("l'hôte regardait et s'en va : un autre présent reprend la main, et la garde en s'asseyant", async () => {
    const { bench } = await table();
    const host = (await bench.arrive(user("hote"), "?regarder")).ws;
    expect(host.view<LobbyRoom>().you.seatId).toBeNull();
    const eve = (await bench.arrive(user("eve"), "?regarder")).ws;
    expect(eve.view<LobbyRoom>().you.isHost).toBe(false);
    await bench.drop(host);
    expect(eve.view<LobbyRoom>().you.isHost).toBe(true);
    await bench.send(eve, { t: "sit" });
    expect(eve.view<LobbyRoom>().you).toMatchObject({ isHost: true });
    expect(eve.view<LobbyRoom>().you.seatId).not.toBeNull();
  });
});
