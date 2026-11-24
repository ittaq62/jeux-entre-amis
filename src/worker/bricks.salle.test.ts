import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { dropped, spawn, type PlayerBoard } from "../shared/games/bricks/engine.ts";
import { BricksRoom } from "./bricksRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";

installWorkerGlobals();

interface Player {
  id: string;
  team: number | null;
  alive: boolean;
  roundWins: number;
  lastPlacedAt: number;
  board: PlayerBoard;
}
interface Data {
  status: string;
  seats: { id: string; kind: string; userId: string | null; autoplay: false | string }[];
  match: {
    matchOver: boolean;
    round: { phase: string; index: number; startAt: number; winners: string[] | null };
    players: Player[];
  } | null;
}
type Internals = {
  checkRoundEnd(now: number): void;
  runTimer(t: { at: number; kind: string; round?: number }, now: number): Promise<boolean>;
  addGarbage(p: Player, lines: number, from: string | null): void;
  onPlace(seat: unknown, msg: unknown, now: number): boolean;
  stopBot(id: string): void;
};

afterEach(() => vi.useRealTimers());

async function table(settings: Record<string, unknown>, bots: number) {
  const state = new FakeState();
  const room = new BricksRoom(state as never, fakeEnv() as never);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  await bench.send(host, { t: "settings", settings: {}, maxPlayers: bots + 1 });
  await bench.send(host, { t: "settings", settings });
  for (let i = 0; i < bots; i++) await bench.send(host, { t: "addBot" });
  await bench.send(host, { t: "start" });
  const d = bench.data<Data>();
  const inner = room as unknown as Internals;
  // Pas de bots qui jouent pendant le test : on mène la partie à la main
  for (const p of d.match!.players) inner.stopBot(p.id);
  return { room, inner, bench, host, d };
}

describe("Briques en 2 contre 2, dernier debout", () => {
  it("la manche va à tout le camp du dernier debout, et la série se gagne ensemble", async () => {
    const { inner, d } = await table({ teams: true, win: "survival", series: 2, sprint: false }, 3);
    const m = d.match!;
    m.round.phase = "playing";
    const camp = (t: number) => m.players.filter((p) => p.team === t);
    expect(camp(0)).toHaveLength(2);
    // Manche 1 : un rouge tombe, puis les deux bleus ; le rouge resté debout fait gagner son coéquipier aussi
    const [r1, r2] = camp(0);
    r2!.alive = false;
    for (const b of camp(1)) b.alive = false;
    inner.checkRoundEnd(Date.now());
    expect(m.round.winners!.sort()).toEqual([r1!.id, r2!.id].sort());
    expect(r1!.roundWins).toBe(1);
    expect(r2!.roundWins).toBe(1);
    // Manche 2, gagnée cette fois par l'autre rouge : les rouges ont leurs deux manches, le match est fini
    m.round.phase = "playing";
    for (const p of m.players) p.alive = true;
    r1!.alive = false;
    for (const b of camp(1)) b.alive = false;
    inner.checkRoundEnd(Date.now());
    expect(m.matchOver).toBe(true);
  });
});

describe("Briques, l'absence", () => {
  it("laisser tomber sa première pièce toute seule n'est pas une absence", async () => {
    vi.useFakeTimers();
    const start = 1_800_000_000_000;
    vi.setSystemTime(start);
    const { inner, d } = await table({ sprint: false, win: "survival", speedUp: true }, 1);
    const m = d.match!;
    m.round.phase = "playing";
    const me = d.seats.find((s) => s.kind === "human")!;
    // 21 s sans poser : la pièce tombe encore (une case par seconde au début)
    const now = m.round.startAt + 21_000;
    vi.setSystemTime(now);
    await inner.runTimer({ at: now, kind: "tick" }, now);
    expect(me.autoplay).toBe(false);
    // Bien plus tard, sans rien poser du tout : là, on ne joue plus
    const later = m.round.startAt + 40_000;
    vi.setSystemTime(later);
    await inner.runTimer({ at: later, kind: "tick" }, later);
    expect(me.autoplay).toBe("afk");
  });
});

describe("Briques, les lignes grises", () => {
  it("des lignes grises reçues depuis un moment montent même si l'écran ne les a jamais confirmées", async () => {
    const { inner, d } = await table({ sprint: false, win: "survival" }, 1);
    const m = d.match!;
    m.round.phase = "playing";
    const seat = d.seats.find((s) => s.kind === "human")!;
    const me = m.players.find((p) => p.id === seat.id)!;
    inner.addGarbage(me, 2, null);
    const chunk = me.board.pending[0]!;
    // L'écran trafiqué dit n'avoir rien vu (ack 0) ; la pièce tombe tout droit, sans faire de ligne
    const place = (now: number) => {
      const a = dropped(me.board.grid, spawn(me.board.current));
      const seq = me.board.seq;
      inner.onPlace(
        seat,
        { t: "place", seq, ack: 0, p: { type: a.type, x: a.x, y: a.y, rot: a.rot, hold: false, lastRotation: false, kick: 0 } },
        now,
      );
      expect(me.board.seq).toBe(seq + 1);
    };
    // Juste après l'envoi, elles attendent encore
    place(chunk.at! + 100);
    expect(me.board.pending).toHaveLength(1);
    // Plus tard, elles montent quand même
    place(chunk.at! + 10_000);
    expect(me.board.pending).toHaveLength(0);
  });
});
