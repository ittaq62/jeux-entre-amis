import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import type { Card, Color } from "../shared/games/uno/cards.ts";
import type { UnoState } from "../shared/games/uno/engine.ts";
import { GameRoom } from "./room.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";

installWorkerGlobals();

let nextId = 9000;
const n = (color: Color, value: number): Card => ({ id: nextId++, kind: "number", color, value });

interface Seat {
  id: string;
  kind: string;
  missed: number;
  autoplay: false | string;
}
interface Data {
  uno: UnoState;
  seats: Seat[];
  scheduledTurnId: number;
  timers: { at: number; kind: string; seatId?: string; target?: string; since?: number }[];
}

let now = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  now = 1_800_000_000_000;
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

/** Une table de UNO en route : l'hôte (humain, 15 s pour jouer) et un bot */
async function partie() {
  const state = new FakeState();
  const room = new GameRoom(state as never, fakeEnv() as never);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  await bench.send(host, { t: "addBot" });
  await bench.send(host, { t: "settings", settings: { turnSeconds: 15 } });
  await bench.send(host, { t: "start" });
  const d = bench.data<Data>();
  const me = d.seats.find((s) => s.kind === "human")!;
  const meIndex = d.uno.players.findIndex((p) => p.id === me.id);
  return { room, bench, host, d, me, meIndex };
}

/** Remet la partie au tour du joueur avec cette main, et relance les minuteurs */
async function auTourDe(room: GameRoom, d: Data, index: number, hand: Card[], drawPile: Card[]) {
  const g = d.uno;
  g.turn = index;
  g.players[index]!.hand = hand;
  g.discard = [n("red", 5)];
  g.color = "red";
  g.pendingDraw = 0;
  g.hasDrawn = false;
  g.drawnCardId = null;
  g.drawPile = drawPile;
  g.turnId += 1;
  d.scheduledTurnId = -1;
  await (room as unknown as { afterChange(e: unknown[], now: number): Promise<void> }).afterChange([], now);
}

describe("UNO, le chrono", () => {
  it("un tour laissé filer ne compte qu'une fois, même si la carte piochée par le chrono va", async () => {
    const { room, d, me, meIndex } = await partie();
    // Rien ne va dans la main ; la carte du dessus de la pioche (la dernière) va
    await auTourDe(room, d, meIndex, [n("blue", 1), n("blue", 2)], [n("green", 3), n("red", 7)]);
    now += 16_000;
    vi.setSystemTime(now);
    await room.alarm();
    const g = d.uno;
    // Le chrono a pioché puis gardé la carte : le tour est passé d'un coup, sans second chrono
    expect(g.players[meIndex]!.hand).toHaveLength(3);
    expect(g.turn).not.toBe(meIndex);
    expect(me.missed).toBe(1);
    expect(me.autoplay).toBe(false);
  });
});

describe("UNO, la dénonciation d'un bot", () => {
  it("un bot programmé pour une ancienne fenêtre ne frappe pas la suivante", async () => {
    const { room, d, me, meIndex } = await partie();
    const bot = d.seats.find((s) => s.kind === "bot")!;
    const g = d.uno;
    g.players[meIndex]!.hand = [n("red", 1)];
    g.players[meIndex]!.declaredUno = false;
    g.unoWindow = { player: meIndex, since: now, nextActed: false };
    // Le minuteur visait la fenêtre ouverte une seconde plus tôt
    d.timers.push({ at: now, kind: "catch", seatId: bot.id, target: me.id, since: now - 1000 });
    now += 100;
    vi.setSystemTime(now);
    await room.alarm();
    expect(g.players[meIndex]!.hand).toHaveLength(1);
    // Le même minuteur pour la bonne fenêtre, lui, dénonce
    d.timers.push({ at: now, kind: "catch", seatId: bot.id, target: me.id, since: g.unoWindow!.since });
    now += 100;
    vi.setSystemTime(now);
    await room.alarm();
    expect(g.players[meIndex]!.hand).toHaveLength(3);
  });
});

describe("UNO sans limite de temps", () => {
  it("un joueur resté là sans jouer trois minutes à son tour laisse la main à un bot, pas avant", async () => {
    const state = new FakeState();
    const room = new GameRoom(state as never, fakeEnv() as never);
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "settings", settings: { turnSeconds: 0 } });
    await bench.send(host, { t: "start" });
    const d = bench.data<Data>();
    const me = d.seats.find((s) => s.kind === "human")!;
    const meIndex = d.uno.players.findIndex((p) => p.id === me.id);
    await auTourDe(room, d, meIndex, [n("blue", 1), n("blue", 2)], [n("green", 3)]);
    now += 2 * 60_000;
    vi.setSystemTime(now);
    await room.alarm();
    expect(me.autoplay).toBe(false);
    now += 61_000;
    vi.setSystemTime(now);
    await room.alarm();
    expect(me.autoplay).toBe("afk");
  });
});
