// Les étoiles et l'aventure du minigolf, vues de la salle : l'aventure se joue seul, sur un parcours ouvert ; chaque trou
// joué donne ses étoiles d'après ses coups (la salle les compte elle-même), pas ceux où un bot a joué la balle, rien avec
// les bulles bonus.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

const award = vi.fn();
let book: Record<string, { stars: 0 | 1 | 2 | 3; best: number | null }> = {};
vi.mock("./stars.ts", () => ({
  awardStarsMany: (_db: unknown, userId: string, game: string, items: { map: string; value: number }[]) => {
    award({ userId, game, items });
    const results = items.map((i) => ({ game, map: i.map, stars: 2, previous: 0, earned: 2, best: i.value, points: 20, unlocked: [] }));
    return Promise.resolve({ results, points: 20 * items.length, unlocked: [] });
  },
  starsOf: () => Promise.resolve({ games: { minigolf: { maps: book, total: 0, max: 216 } } }),
}));

import { MinigolfRoom } from "./minigolfRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type FakeSocket } from "./roomHarness.ts";

installWorkerGlobals();

interface Data {
  status: string;
  seats: { id: string; kind: string; userId: string | null }[];
  helped?: Record<string, number[]>;
  stars?: Record<string, { results: { map: string }[]; points: number }> | null;
  match: {
    cfg: { course: string; holes: number; adventure?: boolean; bonus: boolean };
    holes: { c: string }[];
    players: { id: string; scores: (number | null)[] }[];
  } | null;
}
type Room = { recordResults(now: number): Promise<void>; stopLoop(): void };

const open: Room[] = [];
beforeEach(() => {
  award.mockClear();
  book = {};
});
afterEach(() => {
  for (const r of open.splice(0)) r.stopLoop();
});

async function table() {
  const state = new FakeState();
  const room = new MinigolfRoom(state as never, fakeEnv() as never);
  open.push(room as unknown as Room);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room as never, state);
  const host = (await bench.arrive(user("hote"))).ws;
  const d = () => bench.data<Data>();
  return { bench, host, d, room: room as unknown as Room };
}

const errors = (ws: FakeSocket) => ws.inbox.filter((m) => m.t === "error").map((m) => m.message as string);

/** La partie jouée : ses coups sur chaque trou, puis la salle enregistre */
async function finish(t: Awaited<ReturnType<typeof table>>, scores: number[]) {
  for (const p of t.d().match!.players) p.scores = [...scores];
  await t.room.recordResults(Date.now());
}

const items = () => award.mock.calls[0]![0].items as { map: string; value: number }[];

describe("l'aventure du minigolf", () => {
  it("le premier parcours, seul : les bots s'en vont, neuf trous du parcours, le drapeau de l'aventure", async () => {
    const t = await table();
    await t.bench.send(t.host, { t: "addBot" });
    await t.bench.send(t.host, { t: "adventure", course: "jardin" });
    const d = t.d();
    expect(d.status).toBe("playing");
    expect(d.seats.map((s) => s.kind)).toEqual(["human"]);
    expect(d.match!.cfg).toMatchObject({ course: "jardin", holes: 9, adventure: true, bonus: false });
    expect(d.match!.holes.every((h) => h.c === "jardin")).toBe(true);
  });

  it("un parcours fermé (un trou du précédent sans étoile) ne part pas ; ouvert, il part", async () => {
    const t = await table();
    book = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`jardin:${i + 1}`, { stars: 3 as const, best: 1 }]));
    await t.bench.send(t.host, { t: "adventure", course: "mer" });
    expect(t.d().status).toBe("lobby");
    expect(errors(t.host).at(-1)).toMatch(/parcours d'avant/);
    book["jardin:9"] = { stars: 1, best: 8 };
    await t.bench.send(t.host, { t: "adventure", course: "mer" });
    expect(t.d().status).toBe("playing");
  });

  it("avec un autre joueur assis, elle ne part pas", async () => {
    const t = await table();
    await t.bench.arrive(user("invite"));
    await t.bench.send(t.host, { t: "adventure", course: "jardin" });
    expect(t.d().status).toBe("lobby");
    expect(errors(t.host).at(-1)).toMatch(/se joue seul/);
  });
});

describe("les étoiles des trous", () => {
  it("à la fin, chaque trou joué, ses coups, pour sa carte", async () => {
    const t = await table();
    await t.bench.send(t.host, { t: "adventure", course: "jardin" });
    await finish(t, [1, 3, 3, 3, 3, 3, 3, 3, 4]);
    expect(items()).toHaveLength(9);
    expect(items()[0]).toEqual({ map: "jardin:1", value: 1 });
    expect(items()[8]).toEqual({ map: "jardin:9", value: 4 });
    expect(t.d().stars!.hote!.results).toHaveLength(9);
  });

  it("pas d'étoiles pour le trou où un bot a joué sa balle (les autres comptent)", async () => {
    const t = await table();
    await t.bench.send(t.host, { t: "adventure", course: "jardin" });
    const d = t.d();
    d.helped = { [d.seats[0]!.id]: [4] };
    await finish(t, [3, 3, 3, 3, 3, 3, 3, 3, 3]);
    const maps = items().map((i) => i.map);
    expect(maps).toHaveLength(8);
    expect(maps).not.toContain("jardin:5");
  });

  it("pas d'étoiles avec les bulles bonus", async () => {
    const t = await table();
    await t.bench.send(t.host, { t: "settings", settings: { course: "jardin", holes: 9, bonus: true } });
    await t.bench.send(t.host, { t: "start" });
    await finish(t, [3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(award).not.toHaveBeenCalled();
  });
});
