// Après la partie, à toutes les tables : la revanche repart quand le dernier qui ne l'avait pas demandée s'en va, et la
// place d'un joueur parti pendant la partie se libère (avec la main d'hôte) au lieu de bloquer la table. Aux tables qui
// l'ont, la revanche passe par l'annonce : quinze secondes pour lire, moins si tous les joueurs sont prêts.
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
import { EscarmoucheRoom } from "./escarmoucheRoom.ts";
import { MecheRoom } from "./mecheRoom.ts";
import { NavalRoom } from "./navalRoom.ts";
import { GameRoom } from "./room.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type FakeSocket, type RoomLike } from "./roomHarness.ts";

installWorkerGlobals();

type RoomClass = new (state: never, env: never) => RoomLike & { init(opts: unknown): Promise<boolean>; alarm(): Promise<void> };

/** `announce` : la revanche passe par l'écran d'annonce avant de partir */
const GAMES: { game: string; Room: RoomClass; bots: boolean; announce: boolean }[] = [
  { game: "uno", Room: GameRoom as unknown as RoomClass, bots: true, announce: true },
  { game: "naval", Room: NavalRoom as unknown as RoomClass, bots: true, announce: true },
  { game: "bricks", Room: BricksRoom as unknown as RoomClass, bots: true, announce: true },
  { game: "capitale", Room: CapitaleRoom as unknown as RoomClass, bots: true, announce: true },
  { game: "meche", Room: MecheRoom as unknown as RoomClass, bots: true, announce: true },
  { game: "bolides", Room: BolidesRoom as unknown as RoomClass, bots: true, announce: true },
  { game: "crampons", Room: CramponsRoom as unknown as RoomClass, bots: false, announce: true },
  { game: "culbute", Room: CulbuteRoom as unknown as RoomClass, bots: true, announce: true },
  { game: "escarmouche", Room: EscarmoucheRoom as unknown as RoomClass, bots: true, announce: true },
  { game: "minigolf", Room: MinigolfRoom as unknown as RoomClass, bots: true, announce: true },
];

const open: { stopLoop?: () => void }[] = [];
afterEach(() => {
  for (const room of open.splice(0)) room.stopLoop?.();
  vi.useRealTimers();
});

describe.each(GAMES)("$game", ({ game, Room, bots, announce }) => {
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
  const pickUntil = (bench: Bench<RoomLike>) => bench.data<{ pickUntil?: number | null }>().pickUntil ?? null;
  /** La revanche est décidée : aux tables qui l'ont, l'annonce s'ouvre d'abord, et la partie part quand tous sont prêts */
  async function throughAnnounce(bench: Bench<RoomLike>, players: FakeSocket[]) {
    if (!announce) return;
    expect(status(bench)).toBe("finished");
    expect(pickUntil(bench)).toBeGreaterThan(Date.now());
    for (const ws of players) await bench.send(ws, { t: "ready" });
  }

  it("deux demandent la revanche, le troisième s'en va : la revanche part", async () => {
    const { bench, room, host, ana, bob } = await playing();
    await finish(bench, room);
    await bench.send(host, { t: "rematch" });
    await bench.send(ana, { t: "rematch" });
    expect(status(bench)).toBe("finished");
    await bench.send(bob, { t: "leave" });
    await throughAnnounce(bench, [host, ana]);
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
    if (announce) {
      // Personne ne se dit prêt : la partie part à la fin du compte à rebours
      expect(status(bench)).toBe("finished");
      expect(pickUntil(bench)).toBe(now + ANNOUNCE_MS);
      now += ANNOUNCE_MS;
      vi.setSystemTime(now);
      await room.alarm();
    }
    expect(status(bench)).toBe("playing");
    expect(pickUntil(bench)).toBeNull();
  });

  it.runIf(announce)("l'annonce de la revanche : un joueur prêt ne suffit pas, la partie part quand tous le sont", async () => {
    const { bench, room, host, ana, bob } = await playing();
    await finish(bench, room);
    // Hors de l'annonce, « prêt » ne fait rien
    await bench.send(host, { t: "ready" });
    expect(bench.data<{ ready?: string[] }>().ready ?? []).toEqual([]);
    for (const ws of [host, ana, bob]) await bench.send(ws, { t: "rematch" });
    expect(status(bench)).toBe("finished");
    expect(host.view<{ pickUntil?: number | null }>().pickUntil).toBe(pickUntil(bench));
    await bench.send(host, { t: "ready" });
    await bench.send(ana, { t: "ready" });
    expect(status(bench)).toBe("finished");
    expect(ana.view<{ ready?: string[] }>().ready).toEqual(["hote", "ana"]);
    await bench.send(bob, { t: "ready" });
    expect(status(bench)).toBe("playing");
    expect(host.view<{ pickUntil?: number | null; ready?: string[] }>()).toMatchObject({ pickUntil: null, ready: [] });
  });

  it.runIf(announce)("« Rejouer » de l'hôte passe aussi par l'annonce, et la partie part quand tous sont prêts", async () => {
    const { bench, room, host, ana, bob } = await playing();
    await finish(bench, room);
    await bench.send(host, { t: "start" });
    expect(status(bench)).toBe("finished");
    expect(pickUntil(bench)).toBeGreaterThan(Date.now());
    // Un second « Rejouer » ne relance pas l'annonce
    const until = pickUntil(bench);
    await bench.send(host, { t: "start" });
    expect(pickUntil(bench)).toBe(until);
    for (const ws of [host, ana, bob]) await bench.send(ws, { t: "ready" });
    expect(status(bench)).toBe("playing");
  });

  it.runIf(game === "uno")("l'annonce finie, la partie ne peut plus partir (tous partis) : la table dit pourquoi", async () => {
    vi.useFakeTimers();
    let now = Date.now();
    vi.setSystemTime(now);
    const { bench, room, host, ana, bob } = await playing();
    await finish(bench, room);
    await bench.send(host, { t: "start" });
    const bot = host.view<LobbyRoom>().seats.find((s) => s.kind === "bot")!;
    await bench.send(host, { t: "removeSeat", seatId: bot.id });
    await bench.send(ana, { t: "leave" });
    await bench.send(bob, { t: "leave" });
    now += ANNOUNCE_MS;
    vi.setSystemTime(now);
    await room.alarm();
    expect(status(bench)).toBe("finished");
    expect(pickUntil(bench)).toBeNull();
    const chat = bench.data<{ chat: { text: string }[] }>().chat.map((m) => m.text);
    expect(chat.at(-1)).toBe("La partie ne peut pas partir. Il faut au moins deux joueurs : ajoute un bot !");
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
