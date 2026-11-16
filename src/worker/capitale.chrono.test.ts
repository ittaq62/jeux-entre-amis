// Le chrono d'un joueur qui ne joue pas : son temps passé, la salle lance les dés à sa place. Si c'est un double, il doit
// relancer : un nouveau chrono part, et la partie continue au lieu d'attendre ce joueur pour toujours.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { BUYABLE } from "../shared/games/capitale/board.ts";
import { actorOf, type CapitaleState } from "../shared/games/capitale/engine.ts";
import { CapitaleRoom } from "./capitaleRoom.ts";
import { Bench, FakeState, fakeEnv, fixedSeeds, installWorkerGlobals, user } from "./roomHarness.ts";

installWorkerGlobals();

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Data = { capitale: CapitaleState; deadline: number | null; timers: { kind: string }[] };

describe("Capitale : le chrono d'un joueur qui ne joue pas", () => {
  it("son temps passé, on lui fait un double : un nouveau chrono part pour sa relance, et la partie continue", async () => {
    fixedSeeds(1);
    vi.useFakeTimers();
    let now = Date.now();
    vi.setSystemTime(now);
    const state = new FakeState();
    const room = new CapitaleRoom(state as never, fakeEnv() as never);
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "settings", settings: { end: "bankrupt", turnSeconds: 30 } });
    await bench.send(host, { t: "start" });
    const d = () => bench.data<Data>();
    const g = d().capitale;
    const wait = async () => {
      now += 1_000;
      vi.setSystemTime(now);
      await room.alarm();
    };
    // Le bot joue son tour s'il commence ; puis c'est au joueur de lancer les dés
    for (let k = 0; k < 100 && !(actorOf(g) === "hote" && g.step === "roll"); k++) await wait();
    expect(actorOf(g)).toBe("hote");
    expect(g.step).toBe("roll");
    // Tout est à lui : ses dés ne l'arrêtent nulle part, un double le fait seulement relancer
    for (const i of BUYABLE) g.deeds[i]!.owner = "hote";
    g.players.find((p) => p.id === "hote")!.position = 10;
    g.rigged = [
      [1, 1],
      [1, 2],
    ];
    const turn = g.turnId;
    // Son temps passe : la salle lance pour lui, un double
    for (let k = 0; k < 40 && g.dice === null; k++) await wait();
    expect(g.dice).toEqual([1, 1]);
    expect(g.step).toBe("roll");
    expect(actorOf(g)).toBe("hote");
    expect(g.turnId).toBe(turn);
    // Un nouveau chrono pour sa relance, encore devant lui
    expect(d().deadline).toBeGreaterThan(now);
    expect(d().timers.some((t) => t.kind === "timeout")).toBe(true);
    // Son temps passe encore : la salle relance pour lui, puis le tour passe au bot
    for (let k = 0; k < 200 && g.turnId === turn; k++) await wait();
    expect(g.players.find((p) => p.id === "hote")!.position).toBe(15);
    expect(g.turnId).toBeGreaterThan(turn);
  });
});
