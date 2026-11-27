// Bolides en solo, vu de la salle : le championnat (une coupe contre Mistral et les bots, les étoiles, la coupe suivante
// qui s'ouvre) et le contre-la-montre (seul, sans objets, contre les fantômes). La salle compte elle-même les étoiles.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { ghostTargets, ghostRun } from "../shared/games/bolides/ghost.ts";
import type { BolidesRoomView } from "../shared/protocol.ts";
import { BolidesRoom } from "./bolidesRoom.ts";
import { memoryStore, useProgressStore, type ProgressStore } from "./bolidesProgress.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type FakeSocket } from "./roomHarness.ts";

installWorkerGlobals();

interface Data {
  status: string;
  seats: { id: string; kind: string; name: string; rival?: boolean }[];
  settings: { bolides: Record<string, unknown> };
  race: {
    track: string;
    settings: Record<string, unknown>;
    ranking: string[] | null;
    ranks: Record<string, number> | null;
    racers: { id: string; level?: string; finish: number | null; stats: { bestLap: number } }[];
  } | null;
  cup: { index: number; tracks: string[] } | null;
}
type Room = { finishGame(now: number): Promise<void>; startGame(now: number): Promise<void> };

const open: { stopLoop?: () => void }[] = [];
let store: ProgressStore;
beforeEach(() => {
  store = memoryStore();
  useProgressStore(store);
});
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
  // La progression se lit à l'arrivée : on la laisse arriver
  await new Promise((r) => setTimeout(r, 0));
  return { bench, host, room: room as unknown as Room };
}

const errors = (ws: FakeSocket) => ws.inbox.filter((m) => m.t === "error").map((m) => m.message as string);
const view = (ws: FakeSocket) => ws.view<BolidesRoomView>();

/** Une course de la coupe, jouée : le joueur à cette place */
async function cupRace(bench: Bench<never>, host: FakeSocket, room: Room, place: number) {
  await bench.send(host, { t: "start" });
  if (bench.data<Data>().status !== "playing") await room.startGame(Date.now());
  const d = bench.data<Data>();
  const me = d.seats.find((s) => s.kind === "human")!.id;
  const others = d.race!.racers.map((r) => r.id).filter((id) => id !== me);
  const order = [...others.slice(0, place - 1), me, ...others.slice(place - 1)];
  d.race!.ranking = order;
  d.race!.ranks = Object.fromEntries(order.map((id, i) => [id, i + 1]));
  await room.finishGame(Date.now());
}

describe("Bolides : le championnat", () => {
  it("la Coupe Galet : Mistral un cran au-dessus des bots, trois courses, trois étoiles, et la Coupe Lanterne s'ouvre", async () => {
    const { bench, host, room } = await table();
    await bench.send(host, { t: "settings", settings: { mode: "championnat", campaign: "galet" } });
    await cupRace(bench, host, room, 1);
    const d = bench.data<Data>();
    expect(d.seats).toHaveLength(6);
    const mistral = d.seats.find((s) => s.rival)!;
    expect(mistral.name).toBe("Mistral");
    expect(d.race!.settings.botLevel).toBe("facile");
    expect(d.race!.racers.find((r) => r.id === mistral.id)!.level).toBe("moyen");
    expect(d.race!.track).toBe("port");
    await cupRace(bench, host, room, 1);
    expect(bench.data<Data>().race!.track).toBe("vignes");
    // Les mêmes adversaires d'une course à l'autre
    expect(bench.data<Data>().seats.find((s) => s.rival)!.id).toBe(mistral.id);
    await cupRace(bench, host, room, 2);
    const solo = view(host).solo!;
    expect(solo.outcome).toMatchObject({ kind: "coupe", cup: "galet", rank: 1, stars: 3, before: 0, unlocked: "lanterne" });
    expect((await store.load("hote")).stars["coupe:galet"]).toBe(3);
    expect(solo.progress!.stars["coupe:galet"]).toBe(3);
    // La coupe suivante se choisit maintenant
    await bench.send(host, { t: "settings", settings: { campaign: "lanterne" } });
    expect(bench.data<Data>().settings.bolides.campaign).toBe("lanterne");
  });

  it("hors du podium : aucune étoile, la coupe suivante reste fermée", async () => {
    const { bench, host, room } = await table();
    await bench.send(host, { t: "settings", settings: { mode: "championnat", campaign: "galet" } });
    for (let i = 0; i < 3; i++) await cupRace(bench, host, room, 5);
    expect(view(host).solo!.outcome).toMatchObject({ kind: "coupe", stars: 0, unlocked: null });
    await bench.send(host, { t: "settings", settings: { campaign: "lanterne" } });
    expect(bench.data<Data>().settings.bolides.campaign).toBe("galet");
  });

  it("une coupe fermée ne se court pas, et le championnat se court seul", async () => {
    const { bench, host } = await table();
    await bench.send(host, { t: "settings", settings: { mode: "championnat", campaign: "comete" } });
    expect(bench.data<Data>().settings.bolides.campaign).toBe("galet");
    await bench.arrive(user("ami"));
    await bench.send(host, { t: "start" });
    expect(bench.data<Data>().status).not.toBe("playing");
    expect(errors(host).at(-1)).toContain("se court seul");
  });

  it("revenir à la course libre retire les bots du championnat", async () => {
    const { bench, host, room } = await table();
    await bench.send(host, { t: "settings", settings: { mode: "championnat" } });
    await cupRace(bench, host, room, 1);
    await bench.send(host, { t: "settings", settings: { mode: "course" } });
    expect(bench.data<Data>().seats.filter((s) => s.kind === "bot")).toHaveLength(0);
  });
});

describe("Bolides : le contre-la-montre", () => {
  async function chrono(ms: number, bestLap: number) {
    const { bench, host, room } = await table();
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "settings", settings: { mode: "chrono", track: "hasard" } });
    await bench.send(host, { t: "start" });
    expect(errors(host).at(-1)).toContain("Choisis un circuit");
    await bench.send(host, { t: "settings", settings: { track: "vignes" } });
    expect(view(host).solo!.targets).toEqual(ghostTargets("vignes", 3));
    await bench.send(host, { t: "start" });
    const d = bench.data<Data>();
    expect(d.status).toBe("playing");
    // Seul, sans objets
    expect(d.race!.racers).toHaveLength(1);
    expect(d.race!.settings.items).toBe(false);
    const me = d.race!.racers[0]!;
    me.finish = ms;
    me.stats.bestLap = bestLap;
    d.race!.ranking = [me.id];
    d.race!.ranks = { [me.id]: 1 };
    await room.finishGame(Date.now());
    return { host };
  }

  it("battre le fantôme d'argent sans battre l'or : deux étoiles, et le temps est gardé", async () => {
    const targets = ghostTargets("vignes", 3);
    const ms = Math.round((targets.argent + targets.or) / 2);
    const { host } = await chrono(ms, Math.round(ms / 3));
    expect(view(host).solo!.outcome).toMatchObject({ kind: "chrono", track: "vignes", ms, stars: 2, previous: null });
    const p = await store.load("hote");
    expect(p.stars["chrono:vignes"]).toBe(2);
    expect(p.best["chrono:vignes"]).toBe(ms);
  });

  it("un tour bien plus rapide que le fantôme d'or : le temps n'est pas retenu", async () => {
    const fastest = Math.min(...ghostRun("vignes", "or", 3).laps);
    const { host } = await chrono(fastest * 2, Math.round(fastest * 0.7));
    expect(view(host).solo!.outcome).toMatchObject({ kind: "chrono", stars: 0, refused: true });
    expect((await store.load("hote")).stars["chrono:vignes"]).toBeUndefined();
  });
});
