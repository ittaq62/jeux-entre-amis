// Bolides, au départ : un joueur dont la connexion vient de tomber garde sa place ; un bot conduit pour lui, et il
// reprend son kart à son retour.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { BolidesRoom } from "./bolidesRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";

installWorkerGlobals();

interface Data {
  status: string;
  seats: { id: string; kind: string; userId: string | null; autoplay: false | "away" | string }[];
  race: { racers: { id: string; bot: boolean; handback?: number }[] } | null;
}

const open: { stopLoop?: () => void }[] = [];
afterEach(() => {
  for (const room of open.splice(0)) room.stopLoop?.();
});

async function table() {
  const state = new FakeState();
  const room = new BolidesRoom(state as never, fakeEnv() as never);
  open.push(room as unknown as { stopLoop?: () => void });
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room as never, state);
  const host = (await bench.arrive(user("hote"))).ws;
  const friend = (await bench.arrive(user("ami"))).ws;
  await bench.send(host, { t: "addBot" });
  return { bench, host, friend };
}

describe("Bolides : la connexion qui tombe au départ", () => {
  it("il garde sa place, un bot conduit pour lui, et il reprend son kart en revenant", async () => {
    const { bench, host, friend } = await table();
    await bench.drop(friend);
    await bench.send(host, { t: "start" });
    const d = bench.data<Data>();
    expect(d.status).toBe("playing");
    const seat = d.seats.find((s) => s.userId === "ami")!;
    expect(seat).toBeDefined();
    expect(seat.autoplay).toBe("away");
    expect(d.race!.racers.find((r) => r.id === seat.id)!.bot).toBe(true);
    // Il revient : son kart lui est rendu, là où le bot l'a mené
    await bench.arrive(user("ami"));
    const r = bench.data<Data>().race!.racers.find((x) => x.id === seat.id)!;
    expect(r.bot).toBe(false);
    expect(r.handback).toBeTypeOf("number");
  });

  it("parti depuis longtemps, ou personne d'autre à la table : on part sans lui", async () => {
    const { bench, host, friend } = await table();
    await bench.drop(friend);
    const seat = bench.data<Data>().seats.find((s) => s.userId === "ami")! as unknown as { disconnectedAt: number };
    seat.disconnectedAt = Date.now() - 60_000;
    await bench.send(host, { t: "start" });
    expect(bench.data<Data>().seats.some((s) => s.userId === "ami")).toBe(false);
  });
});
