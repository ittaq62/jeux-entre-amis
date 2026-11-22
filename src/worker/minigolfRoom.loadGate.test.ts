// Le chargement de tous avant le départ (shared/loadGate.ts), dans la vraie salle de minigolf : le survol du premier
// trou ne part qu'une fois que chaque joueur présent a chargé le parcours (au plus LOAD_MAX_MS) ; personne ne joue,
// aucun bot ne tire, aucun tour ne court avant ; un joueur parti n'est plus attendu.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { LOAD_MAX_MS, type LoadGate } from "../shared/loadGate.ts";
import { INTRO_MS } from "../shared/games/minigolf/match.ts";
import { MinigolfRoom } from "./minigolfRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type RoomLike } from "./roomHarness.ts";

installWorkerGlobals();

interface Data {
  status: string;
  gate?: LoadGate | null;
  match: { phase: string; holeStart: number; turn: number; players: { id: string; cur: number }[] };
  seats: { id: string; kind: string; userId: string | null }[];
}
type Room = RoomLike & { init(o: unknown): Promise<boolean>; tick(): Promise<void>; stopLoop(): void };

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

/** Une table : deux joueurs et un bot, la partie lancée (la boucle arrêtée : on la fait tourner à la main) */
async function table() {
  const state = new FakeState();
  const r = new MinigolfRoom(state as never, fakeEnv() as never) as unknown as Room;
  room = r;
  await state.ready;
  await r.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(r, state);
  const host = (await bench.arrive(user("hote"))).ws;
  const guest = (await bench.arrive(user("invite"))).ws;
  await bench.send(host, { t: "addBot" });
  await bench.send(host, { t: "start" });
  r.stopLoop();
  const d = () => bench.data<Data>();
  const seatOf = (id: string) => d().seats.find((s) => s.userId === id)!.id;
  const tick = async (ms: number) => {
    clock += ms;
    await r.tick();
  };
  return { r, bench, host, guest, d, seatOf, tick };
}

describe("le premier trou attend le chargement de chacun (Minigolf)", () => {
  it("rien ne bouge pendant le chargement : ni survol, ni tour, ni bot ; puis tout part pour tous au départ commun", async () => {
    const t = await table();
    expect(t.d().gate!.waiting.sort()).toEqual([t.seatOf("hote"), t.seatOf("invite")].sort());
    expect(t.d().gate!.countdown).toBe(0);
    // Dix secondes à attendre : le survol ne court pas, personne n'a la main, le bot ne tire pas
    for (let k = 0; k < 20; k++) await t.tick(500);
    expect(t.d().match.phase).toBe("intro");
    expect(t.d().match.turn).toBe(-1);
    expect(t.d().match.players.every((p) => p.cur === 0)).toBe(true);
    await t.bench.send(t.host, { t: "loaded", gate: t.d().gate!.id });
    expect(t.d().gate).not.toBeNull();
    await t.bench.send(t.guest, { t: "loaded", gate: t.d().gate!.id });
    await t.tick(50);
    // Le départ : le survol du premier trou part maintenant, pour tout le monde
    expect(t.d().gate).toBeNull();
    expect(t.d().match.holeStart).toBe(clock + INTRO_MS);
    await t.tick(INTRO_MS + 100);
    expect(t.d().match.phase).toBe("play");
    expect(t.d().match.turn).toBeGreaterThanOrEqual(0);
  });

  it("au-delà du délai maximum, la partie part sans le retardataire", async () => {
    const t = await table();
    await t.bench.send(t.host, { t: "loaded", gate: t.d().gate!.id });
    await t.tick(LOAD_MAX_MS - 50);
    expect(t.d().gate).not.toBeNull();
    await t.tick(60);
    expect(t.d().gate).toBeNull();
    expect(t.d().match.holeStart).toBe(clock + INTRO_MS);
  });

  it("le joueur parti pendant le chargement n'est plus attendu", async () => {
    const t = await table();
    await t.bench.send(t.host, { t: "loaded", gate: t.d().gate!.id });
    await t.bench.send(t.guest, { t: "leave" });
    await t.tick(50);
    expect(t.d().gate).toBeNull();
  });

  it("un « chargé » d'un départ passé ne compte pas", async () => {
    const t = await table();
    const id = t.d().gate!.id;
    await t.bench.send(t.host, { t: "loaded", gate: id - 1 });
    await t.bench.send(t.guest, { t: "loaded", gate: id });
    await t.tick(50);
    expect(t.d().gate).not.toBeNull();
    expect(t.d().gate!.loaded).toEqual([t.seatOf("invite")]);
  });
});
