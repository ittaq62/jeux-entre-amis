// Le chargement de tous avant le départ (shared/loadGate.ts), dans une vraie salle : le coup d'envoi attend que chaque
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
