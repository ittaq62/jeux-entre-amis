// Quand l'hôte s'en va, à toutes les tables : plus de table « active dans le vide ». L'hôte qui quitte (ou qu'un bot
// remplace après une coupure) laisse la main à un joueur présent ; une table où il ne reste personne ferme vite et
// disparaît partout (le hub, le stockage, la boucle de jeu), au lieu de laisser ses bots jouer seuls dix ou vingt minutes.
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
import { EMPTY_LOBBY_MS, EMPTY_PLAYING_MS, LEFT_EMPTY_MS } from "./tableLife.ts";

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
  { game: "cour", Room: CourRoom as unknown as RoomClass, bots: false },
  { game: "toque", Room: ToqueRoom as unknown as RoomClass, bots: true },
];

const open: { stopLoop?: () => void }[] = [];
afterEach(() => {
  for (const room of open.splice(0)) room.stopLoop?.();
  vi.useRealTimers();
});

describe.each(GAMES)("$game", ({ Room, bots }) => {
  /** Une table, l'heure qu'on avance à la main, et ce que le hub apprend de sa fermeture */
  async function table() {
    vi.useFakeTimers();
    let now = Date.now();
    vi.setSystemTime(now);
    const state = new FakeState();
    const env = fakeEnv();
    const removed = vi.fn(async (_code: string) => {});
    (env.hub as { removeRoom: unknown }).removeRoom = removed;
    const room = new Room(state as never, env as never);
    open.push(room as unknown as { stopLoop?: () => void });
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "public", quick: false });
    const bench = new Bench(room, state);
    const later = async (ms: number) => {
      now += ms;
      vi.setSystemTime(now);
      await room.alarm();
    };
    /** La table a fermé : plus rien de gardé, plus de boucle de jeu, le hub l'a retirée de partout */
    const closed = () => {
      expect(bench.data()).toBeNull();
      expect(state.stored.size).toBe(0);
      expect((room as unknown as { loop?: unknown }).loop ?? null).toBeNull();
      expect(removed).toHaveBeenCalledWith("ABCD");
    };
    return { room, bench, state, later, closed, removed };
  }

  /** La partie lancée : l'hôte, ceux qu'on demande, un bot là où il y en a */
  async function playing(others: string[]) {
    const t = await table();
    const host = (await t.bench.arrive(user("hote"))).ws;
    await t.bench.send(host, { t: "settings", maxPlayers: 4 });
    const friends = [];
    for (const id of others) friends.push((await t.bench.arrive(user(id))).ws);
    if (bots) await t.bench.send(host, { t: "addBot" });
    await t.bench.send(host, { t: "start" });
    expect(host.view<LobbyRoom>().status).toBe("playing");
    return { ...t, host, friends };
  }

  it("seul (avec un bot), l'hôte quitte en pleine partie : la table ferme aussitôt, ses bots ne jouent plus seuls", async () => {
    const { bench, host, later, closed } = await playing([]);
    await bench.send(host, { t: "leave" });
    expect(bench.data()).not.toBeNull();
    await later(LEFT_EMPTY_MS + 1);
    closed();
  });

  it("seul au salon, l'hôte ferme l'onglet : la table ferme au bout d'une minute, pas de dix", async () => {
    const { bench, later, closed } = await table();
    const host = (await bench.arrive(user("hote"))).ws;
    if (bots) await bench.send(host, { t: "addBot" });
    await bench.drop(host);
    await later(EMPTY_LOBBY_MS / 2);
    expect(bench.data()).not.toBeNull();
    await later(EMPTY_LOBBY_MS / 2 + 1);
    closed();
  });

  it("en pleine partie, tout le monde perd la connexion : trois minutes pour revenir, puis la table ferme", async () => {
    const { bench, host, friends, later, closed } = await playing(["ana"]);
    await bench.drop(host);
    await bench.drop(friends[0]!);
    await later(EMPTY_PLAYING_MS - 20_000);
    expect(bench.data()).not.toBeNull();
    await later(20_001);
    closed();
  });

  it("en pleine partie, quelqu'un revient avant la fin du délai : la table reste ouverte", async () => {
    const { bench, host, friends, later } = await playing(["ana"]);
    await bench.drop(host);
    await bench.drop(friends[0]!);
    await later(EMPTY_PLAYING_MS - 20_000);
    await bench.arrive(user("ana"));
    await later(40_000);
    expect(bench.data()).not.toBeNull();
  });

  it("l'hôte quitte en pleine partie, une amie est là : elle reprend la main tout de suite", async () => {
    const { bench, host, friends } = await playing(["ana"]);
    expect(friends[0]!.view<LobbyRoom>().you.isHost).toBe(false);
    await bench.send(host, { t: "leave" });
    expect(friends[0]!.view<LobbyRoom>().you.isHost).toBe(true);
    expect(bench.data()).not.toBeNull();
  });

  it("l'hôte perd la connexion en pleine partie : quand un bot le remplace, la main passe à l'amie ; revenu avant, il la garde", async () => {
    const { bench, host, friends, later } = await playing(["ana"]);
    await bench.drop(host);
    await later(3_000);
    expect(friends[0]!.view<LobbyRoom>().you.isHost).toBe(false);
    const back = (await bench.arrive(user("hote"))).ws;
    expect(back.view<LobbyRoom>().you.isHost).toBe(true);
    await bench.drop(back);
    await later(11_000);
    expect(friends[0]!.view<LobbyRoom>().you.isHost).toBe(true);
  });
});
