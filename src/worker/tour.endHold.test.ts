// La fin d'un jeu de tournée : la feuille de fin reste quinze secondes à l'écran (le résultat, « Signaler un problème »)
// avant l'entracte, et quand tous les joueurs du jeu appuient sur « Continuer », l'entracte arrive tout de suite.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { GAME_END_HOLD_MS, INTERMISSION_MS, type TourView } from "../shared/tour.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type FakeSocket } from "./roomHarness.ts";
import { TourRoom } from "./tourRoom.ts";

installWorkerGlobals();

afterEach(() => {
  vi.useRealTimers();
});

/** Une tournée de UNO : l'hôte, Ana, un bot ; le premier jeu lancé */
async function playing() {
  vi.useFakeTimers();
  const now = Date.now();
  vi.setSystemTime(now);
  const state = new FakeState();
  const env = { ...fakeEnv(), ROOMS: { idFromName: (code: string) => code, get: () => ({ init: async () => true }) } };
  const room = new TourRoom(state as never, env as never);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  const ana = (await bench.arrive(user("ana"))).ws;
  await bench.send(host, { t: "addBot" });
  await bench.send(host, { t: "settings", settings: { games: ["uno"] } });
  await bench.send(host, { t: "start" });
  await bench.send(host, { t: "launch" });
  const view = () => host.view<TourView>();
  expect(view().status).toBe("playing");
  const current = view().current!;
  const bot = view().members.find((m) => m.kind === "bot")!.userId;
  const finish = () =>
    room.tableFinished({
      code: current.code,
      index: current.index,
      game: current.game,
      seats: 3,
      players: [
        { userId: "hote", rank: 1, stats: {} },
        { userId: "ana", rank: 2, stats: {} },
        { userId: bot, rank: 3, stats: {} },
      ],
    });
  return { bench, host, ana, view, current, finish, now };
}

describe("tournée : la feuille de fin d'un jeu", () => {
  it("reste quinze secondes, puis l'entracte compte ses vingt secondes", async () => {
    const { view, current, finish, now } = await playing();
    await finish();
    const v = view();
    expect(v.status).toBe("intermission");
    expect(v.endHold).toEqual({ code: current.code, until: now + GAME_END_HOLD_MS, done: [] });
    expect(v.next!.at).toBe(now + GAME_END_HOLD_MS + INTERMISSION_MS);
  });

  it("tous les joueurs du jeu continuent : l'entracte arrive tout de suite ; un seul ne suffit pas", async () => {
    const { bench, host, ana, view, finish, now } = await playing();
    await finish();
    vi.setSystemTime(now + 3_000);
    await bench.send(host as FakeSocket, { t: "continue" });
    expect(view().endHold!.done).toEqual(["hote"]);
    expect(view().endHold!.until).toBe(now + GAME_END_HOLD_MS);
    await bench.send(ana as FakeSocket, { t: "continue" });
    expect(view().endHold!.until).toBe(now + 3_000);
    expect(view().next!.at).toBe(now + 3_000 + INTERMISSION_MS);
  });

  it("un joueur parti ne fait pas attendre les autres ; « Continuer » après la fin du délai ne change rien", async () => {
    const { bench, host, ana, view, finish, now } = await playing();
    await finish();
    await bench.drop(ana as FakeSocket);
    await bench.send(host as FakeSocket, { t: "continue" });
    expect(view().endHold!.until).toBe(now);
    const at = view().next!.at;
    vi.setSystemTime(now + GAME_END_HOLD_MS + 1_000);
    await bench.send(host as FakeSocket, { t: "continue" });
    expect(view().next!.at).toBe(at);
  });

  it("au dernier jeu, la feuille de fin reste aussi avant la fin de la tournée ; un nouveau jeu l'efface", async () => {
    const { bench, host, view, finish, now } = await playing();
    await finish();
    await bench.send(host as FakeSocket, { t: "launch" });
    expect(view().status).toBe("playing");
    expect(view().endHold).toBeNull();
    const second = view().current!;
    // L'hôte arrête la tournée après ce jeu
    await bench.send(host as FakeSocket, { t: "finish" });
    expect(view().finishAfterCurrent).toBe(true);
    const bot = view().members.find((m) => m.kind === "bot")!.userId;
    await (bench.room as unknown as TourRoom).tableFinished({
      code: second.code,
      index: second.index,
      game: second.game,
      seats: 3,
      players: [
        { userId: "ana", rank: 1, stats: {} },
        { userId: "hote", rank: 2, stats: {} },
        { userId: bot, rank: 3, stats: {} },
      ],
    });
    expect(view().status).toBe("finished");
    expect(view().endHold).toEqual({ code: second.code, until: now + GAME_END_HOLD_MS, done: [] });
  });
});
