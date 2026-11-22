// Le chargement de tous avant le départ (shared/loadGate.ts), dans de vraies salles (Crampons, Capitale, Bowling) : le départ attend que chaque
// joueur ait dit « chargé », au plus LOAD_MAX_MS, puis un court compte à rebours ; un joueur parti n'est plus attendu.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { LOAD_COUNTDOWN_MS, LOAD_MAX_MS, type LoadGate } from "../shared/loadGate.ts";
import type { CapitaleState } from "../shared/games/capitale/engine.ts";
import { INTRO_MS } from "../shared/games/bowling/match.ts";
import { BowlingRoom } from "./bowlingRoom.ts";
import { CapitaleRoom } from "./capitaleRoom.ts";
import { CramponsRoom } from "./cramponsRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type FakeSocket, type RoomLike } from "./roomHarness.ts";

installWorkerGlobals();

interface Data {
  status: string;
  gate?: LoadGate | null;
  match: { t: number } | null;
  seats: { id: string; userId: string | null }[];
}
type Room = RoomLike & { init(opts: unknown): Promise<boolean>; tick(): Promise<void>; stopLoop(): void };

let clock = 1_000_000;
let room: Room | null = null;
beforeEach(() => {
  clock = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});
afterEach(() => {
  room?.stopLoop();
  room = null;
  vi.restoreAllMocks();
});

/** Une table de deux joueurs, le match lancé (la boucle arrêtée : on la fait tourner à la main) */
async function twoPlayers(watcher = false) {
  const state = new FakeState();
  const r = new CramponsRoom(state as never, fakeEnv() as never) as unknown as Room;
  room = r;
  await state.ready;
  await r.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(r, state);
  const host = (await bench.arrive(user("hote"))).ws;
  const guest = (await bench.arrive(user("invite"))).ws;
  // Quelqu'un qui regarde, venu au salon avant le coup d'envoi
  const viewer = watcher ? (await bench.arrive(user("curieux"), "?regarder")).ws : null;
  await bench.send(host, { t: "start" });
  r.stopLoop();
  const d = bench.data<Data>();
  const seatOf = (id: string) => d.seats.find((s) => s.userId === id)!.id;
  const loaded = (ws: FakeSocket) => bench.send(ws, { t: "loaded", gate: bench.data<Data>().gate!.id });
  const tick = async (ms: number) => {
    clock += ms;
    await r.tick();
  };
  return { bench, host, guest, viewer, d: () => bench.data<Data>(), seatOf, loaded, tick };
}

describe("le coup d'envoi attend le chargement de chacun (Crampons)", () => {
  it("rien ne bouge avant que tous aient chargé, puis un compte à rebours, puis le match tourne", async () => {
    const t = await twoPlayers();
    expect(t.d().status).toBe("playing");
    expect([...t.d().gate!.waiting].sort()).toEqual([t.seatOf("hote"), t.seatOf("invite")].sort());
    // On voit qui charge encore
    expect(t.host.view<{ gate: LoadGate }>().gate.loaded).toEqual([]);
    await t.tick(2000);
    expect(t.d().match!.t).toBe(0);
    await t.loaded(t.host);
    await t.tick(2000);
    expect(t.d().gate!.goAt).toBeNull();
    expect(t.guest.view<{ gate: LoadGate }>().gate.loaded).toEqual([t.seatOf("hote")]);
    expect(t.d().match!.t).toBe(0);
    await t.loaded(t.guest);
    expect(t.d().gate!.goAt).toBe(clock + LOAD_COUNTDOWN_MS);
    // Le compte à rebours : toujours rien
    await t.tick(LOAD_COUNTDOWN_MS - 100);
    expect(t.d().match!.t).toBe(0);
    // Le départ, puis le match avance
    await t.tick(100);
    expect(t.d().gate).toBeNull();
    expect(t.host.view<{ gate: LoadGate | null }>().gate).toBeNull();
    await t.tick(200);
    expect(t.d().match!.t).toBeGreaterThan(0);
  });

  it("un joueur lent ne bloque pas les autres au-delà du délai maximum", async () => {
    const t = await twoPlayers();
    await t.loaded(t.host);
    await t.tick(LOAD_MAX_MS - 1000);
    expect(t.d().gate!.goAt).toBeNull();
    await t.tick(1000);
    expect(t.d().gate!.goAt).toBe(clock + LOAD_COUNTDOWN_MS);
    await t.tick(LOAD_COUNTDOWN_MS);
    await t.tick(200);
    expect(t.d().gate).toBeNull();
    expect(t.d().match!.t).toBeGreaterThan(0);
  });

  it("un joueur déconnecté pendant le chargement n'est plus attendu", async () => {
    const t = await twoPlayers();
    await t.loaded(t.host);
    await t.bench.drop(t.guest);
    expect(t.d().gate!.waiting).toEqual([t.seatOf("hote")]);
    expect(t.d().gate!.goAt).toBe(clock + LOAD_COUNTDOWN_MS);
  });

  it("un « chargé » d'un départ passé ou d'un spectateur ne compte pas", async () => {
    const t = await twoPlayers(true);
    expect(t.d().seats.some((s) => s.userId === "curieux")).toBe(false);
    expect(t.d().gate!.waiting).toHaveLength(2);
    await t.bench.send(t.host, { t: "loaded", gate: t.d().gate!.id - 1 });
    expect(t.d().gate!.loaded).toEqual([]);
    await t.bench.send(t.viewer!, { t: "loaded", gate: t.d().gate!.id });
    expect(t.d().gate!.loaded).toEqual([]);
    // Il voit le chargement des autres
    expect(t.viewer!.view<{ gate: LoadGate }>().gate.waiting).toHaveLength(2);
  });

  it("la revanche ouvre un nouveau chargement", async () => {
    const t = await twoPlayers();
    const first = t.d().gate!.id;
    await t.loaded(t.host);
    await t.loaded(t.guest);
    await t.tick(LOAD_COUNTDOWN_MS);
    expect(t.d().gate).toBeNull();
    // Le match est fini : les deux demandent la revanche, l'annonce passe, un nouveau départ retenu
    const d = t.d() as Data & { status: string };
    d.status = "finished";
    await t.bench.send(t.host, { t: "rematch" });
    await t.bench.send(t.guest, { t: "rematch" });
    await t.bench.send(t.host, { t: "ready" });
    await t.bench.send(t.guest, { t: "ready" });
    room!.stopLoop();
    expect(t.d().status).toBe("playing");
    expect(t.d().gate!.id).not.toBe(first);
    expect(t.d().gate!.loaded).toEqual([]);
  });
});

describe("le premier coup attend le chargement de chacun (Capitale)", () => {
  interface CapData {
    status: string;
    gate?: LoadGate | null;
    capitale: CapitaleState;
    seats: { id: string; kind: string; userId: string | null }[];
    timers: { at: number; kind: string }[];
    endsAt: number | null;
  }

  async function capitaleTable(settings: Record<string, unknown> = {}) {
    const state = new FakeState();
    const r = new CapitaleRoom(state as never, fakeEnv() as never) as unknown as RoomLike & { init(o: unknown): Promise<boolean> };
    await state.ready;
    await r.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(r, state);
    const host = (await bench.arrive(user("hote"))).ws;
    await bench.send(host, { t: "addBot" });
    if (Object.keys(settings).length > 0) await bench.send(host, { t: "settings", settings });
    await bench.send(host, { t: "start" });
    const d = () => bench.data<CapData>();
    const me = d().seats.find((s) => s.kind === "human")!.id;
    return { room: r, bench, host, d, me };
  }

  it("ni coup, ni bot, ni chrono avant le départ commun ; puis la partie part", async () => {
    const t = await capitaleTable();
    expect(t.d().gate!.waiting).toEqual([t.me]);
    // Les bots et le chrono attendent au moins la fin de l'attente des retardataires et le compte à rebours
    const gateEnd = t.d().gate!.until + LOAD_COUNTDOWN_MS;
    const firstBefore = Math.min(
      ...t
        .d()
        .timers.filter((x) => x.kind === "bot" || x.kind === "timeout")
        .map((x) => x.at),
    );
    expect(firstBefore).toBeGreaterThanOrEqual(gateEnd);
    // Un coup trop tôt est ignoré
    const g = t.d().capitale;
    g.turn = g.players.findIndex((p) => p.id === t.me);
    g.step = "roll";
    await t.bench.send(t.host, { t: "action", action: { type: "roll" } });
    expect(t.d().capitale.step).toBe("roll");
    // Chargé : le départ dans 3 s, les bots et le chrono s'y recalent
    await t.bench.send(t.host, { t: "loaded", gate: t.d().gate!.id });
    const goAt = t.d().gate!.goAt!;
    expect(goAt).toBe(clock + LOAD_COUNTDOWN_MS);
    const next = Math.min(
      ...t
        .d()
        .timers.filter((x) => x.kind === "bot" || x.kind === "timeout")
        .map((x) => x.at),
    );
    expect(next).toBeGreaterThanOrEqual(goAt);
    // Après le départ, le coup passe
    clock = goAt + 200;
    await t.bench.send(t.host, { t: "action", action: { type: "roll" } });
    expect(t.d().capitale.step).not.toBe("roll");
  });

  it("une partie en temps limité commence au départ commun", async () => {
    const t = await capitaleTable({ end: "timed", minutes: 30 });
    await t.bench.send(t.host, { t: "loaded", gate: t.d().gate!.id });
    expect(t.d().endsAt).toBe(t.d().gate!.goAt! + 30 * 60_000);
  });

  it("un joueur qui ne charge jamais ne bloque pas la partie : une alarme la réveille à la fin de l'attente", async () => {
    const t = await capitaleTable();
    expect(t.d().timers.some((x) => x.kind === "gate" && x.at === t.d().gate!.until)).toBe(true);
    clock = t.d().gate!.until;
    await (t.room as unknown as { alarm(): Promise<void> }).alarm();
    expect(t.d().gate!.goAt).toBe(clock + LOAD_COUNTDOWN_MS);
    expect(t.d().timers.some((x) => x.kind === "gate")).toBe(false);
  });

  it("le joueur parti pendant le chargement n'est plus attendu", async () => {
    const t = await capitaleTable();
    await t.bench.drop(t.host);
    expect(t.d().gate!.goAt).toBe(clock + LOAD_COUNTDOWN_MS);
  });
});

describe("l'introduction de la salle attend le chargement de chacun (Bowling)", () => {
  interface BwData {
    status: string;
    gate?: LoadGate | null;
    match: { phase: string; phaseAt: number; deadline: number };
    seats: { id: string; kind: string; userId: string | null }[];
  }
  type BwRoom = RoomLike & { init(o: unknown): Promise<boolean>; tick(): Promise<void>; stopLoop(): void };

  async function lane() {
    const state = new FakeState();
    const r = new BowlingRoom(state as never, fakeEnv() as never) as unknown as BwRoom;
    await state.ready;
    await r.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(r, state);
    const host = (await bench.arrive(user("hote"))).ws;
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "start" });
    r.stopLoop();
    const d = () => bench.data<BwData>();
    const tick = async (ms: number) => {
      clock += ms;
      await r.tick();
    };
    return { r, bench, host, d, tick };
  }

  it("l'introduction ne court pas pendant le chargement, puis part pour tous au départ, sans décompte de plus", async () => {
    const t = await lane();
    expect(t.d().match.phase).toBe("intro");
    expect(t.d().gate!.countdown).toBe(0);
    await t.tick(10_000);
    // Toujours l'introduction : elle n'a pas couru pendant l'attente
    expect(t.d().match.phase).toBe("intro");
    await t.bench.send(t.host, { t: "loaded", gate: t.d().gate!.id });
    expect(t.d().gate!.goAt).toBe(clock);
    await t.tick(50);
    expect(t.d().gate).toBeNull();
    expect(t.d().match.phaseAt).toBe(clock);
    expect(t.d().match.deadline).toBe(clock + INTRO_MS);
    t.r.stopLoop();
  });

  it("au-delà du délai maximum, la partie part sans le retardataire", async () => {
    const t = await lane();
    await t.tick(LOAD_MAX_MS - 50);
    expect(t.d().gate).not.toBeNull();
    // Sans décompte de plus : le départ et l'introduction au même tic
    await t.tick(50);
    expect(t.d().gate).toBeNull();
    expect(t.d().match.deadline).toBe(clock + INTRO_MS);
    t.r.stopLoop();
  });
});
