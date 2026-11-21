// Culbute dans une tournée : la table enchaîne trois combats sur des arènes différentes, et n'envoie à la tournée qu'un
// seul classement, celui des points cumulés, une fois la dernière manche finie.
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

import type { Fight } from "../shared/games/culbute/engine.ts";
import type { CulbuteSeries } from "../shared/games/culbute/series.ts";
import { CulbuteRoom } from "./culbuteRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";
import { reportToTour } from "./tourLink.ts";

installWorkerGlobals();

type Inside = {
  data: { status: string; fight: Fight | null; series: CulbuteSeries | null; seats: { id: string; userId: string | null }[] };
  stopLoop(): void;
  startTourGame(now: number): Promise<void>;
  finishGame(now: number): Promise<void>;
  nextRound(now: number): Promise<void>;
};

const rooms: Inside[] = [];
afterEach(() => {
  for (const r of rooms.splice(0)) r.stopLoop();
});

/** Fin de manche : ces places, dans l'ordre des sièges (le joueur, puis le bot) */
async function endRound(inside: Inside, places: number[]) {
  const f = inside.data.fight!;
  f.phase = "over";
  f.clock = 0;
  for (const ft of f.fighters) {
    const i = inside.data.seats.findIndex((s) => s.id === ft.id);
    ft.rank = places[i]!;
    ft.stats.kos = places[i] === 1 ? 2 : 0;
  }
  f.winners = f.fighters.filter((ft) => ft.rank === 1).map((ft) => ft.slot);
  await inside.finishGame(Date.now());
}

describe("Culbute en tournée", () => {
  it("trois combats d'affilée, une arène différente à chaque fois, et un seul classement aux points pour la tournée", async () => {
    vi.mocked(reportToTour).mockClear();
    const state = new FakeState();
    const room = new CulbuteRoom(state as never, fakeEnv() as never);
    const inside = room as unknown as Inside;
    rooms.push(inside);
    await state.ready;
    await room.init({
      code: "ABCD",
      host: user("ana"),
      visibility: "private",
      quick: false,
      tour: {
        code: "TOUR",
        index: 3,
        players: [user("ana")],
        bots: [{ id: "bot-1", name: "Gaston", avatar: user("x").avatar }],
        botLevel: "normal",
        teams: null,
        variant: "classique",
      },
    });
    const bench = new Bench(room, state);
    await bench.arrive(user("ana"));
    await inside.startTourGame(Date.now());
    inside.stopLoop();
    expect(inside.data.status).toBe("playing");
    expect(inside.data.series).toMatchObject({ round: 1, rounds: 3 });

    // Manche 1 : Ana gagne ; on regarde les scores, la tournée n'est pas prévenue
    const arenas = [inside.data.fight!.arena];
    await endRound(inside, [1, 2]);
    expect(inside.data.status).toBe("playing");
    expect(inside.data.series!.nextAt).toBeGreaterThan(Date.now());
    expect(inside.data.series!.points).toEqual({ [inside.data.seats[0]!.id]: 10, "bot-1": 7 });
    expect(reportToTour).not.toHaveBeenCalled();

    // Manches 2 et 3 : le bot gagne les deux
    for (const round of [2, 3]) {
      await inside.nextRound(Date.now());
      inside.stopLoop();
      expect(inside.data.series!.round).toBe(round);
      expect(inside.data.series!.nextAt).toBeNull();
      expect(arenas).not.toContain(inside.data.fight!.arena);
      arenas.push(inside.data.fight!.arena);
      await endRound(inside, [2, 1]);
    }
    expect(inside.data.status).toBe("finished");
    // Ana : 10 + 7 + 7 = 24 ; Gaston : 7 + 10 + 10 = 27
    expect(inside.data.series!.final).toEqual({ [inside.data.seats[0]!.id]: 2, "bot-1": 1 });
    await vi.waitFor(() => expect(reportToTour).toHaveBeenCalledTimes(1));
    const report = vi.mocked(reportToTour).mock.calls[0]![2];
    expect(report.index).toBe(3);
    expect(report.players).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: "ana", rank: 2 }), expect.objectContaining({ userId: "bot-1", rank: 1 })]),
    );
    const ana = report.players.find((p) => p.userId === "ana")!;
    expect((ana.stats as { won: number; kos: number }).won).toBe(1);
    expect((ana.stats as { won: number; kos: number }).kos).toBe(2);
  });

  it("hors tournée, un seul combat comme avant", async () => {
    const state = new FakeState();
    const room = new CulbuteRoom(state as never, fakeEnv() as never);
    const inside = room as unknown as Inside;
    rooms.push(inside);
    await state.ready;
    await room.init({ code: "ABCD", host: user("ana"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("ana"))).ws;
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "start" });
    inside.stopLoop();
    expect(inside.data.series ?? null).toBeNull();
    await endRound(inside, [1, 2]);
    expect(inside.data.status).toBe("finished");
  });
});
