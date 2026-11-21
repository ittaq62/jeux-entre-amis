// La salle de Culbute et les commandes des joueurs : une revanche repart d'une file propre, et un joueur dont plus rien
// n'arrive (onglet caché, connexion morte) ne continue pas à courir avec la dernière commande reçue.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

// Le bot qui joue : on garde le vrai, en notant le niveau qu'on lui demande
vi.mock("../shared/games/culbute/bot.ts", async (actual) => {
  const real = await actual<typeof import("../shared/games/culbute/bot.ts")>();
  return { ...real, botInput: vi.fn(real.botInput) };
});

import { botInput } from "../shared/games/culbute/bot.ts";
import type { Fight } from "../shared/games/culbute/engine.ts";
import type { Input } from "../shared/games/culbute/model.ts";
import { CulbuteRoom } from "./culbuteRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";

installWorkerGlobals();

/** Ce que les tests lisent ou font tourner à la main dans la salle */
type Inside = {
  data: { status: string; fight: Fight | null };
  queues: Map<string, { samples: { seq: number; input: Input }[] }>;
  stopLoop(): void;
  finishGame(now: number): Promise<void>;
  inputs(f: Fight): Input[];
};

const rooms: Inside[] = [];
afterEach(() => {
  for (const r of rooms.splice(0)) r.stopLoop();
});

async function table() {
  const state = new FakeState();
  const room = new CulbuteRoom(state as never, fakeEnv() as never);
  const inside = room as unknown as Inside;
  rooms.push(inside);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  await bench.send(host, { t: "addBot" });
  await bench.send(host, { t: "start" });
  inside.stopLoop();
  const mine = () =>
    inside.data.fight!.fighters.findIndex(
      (f) => f.id === bench.data<{ seats: { id: string; kind: string }[] }>().seats.find((s) => s.kind === "human")!.id,
    );
  return { bench, host, inside, mine };
}

describe("Culbute : les commandes des joueurs", () => {
  it("après une revanche, un paquet en retard de l'écran d'avant ne fait pas ignorer les commandes du nouveau combat", async () => {
    const { bench, host, inside, mine } = await table();
    await inside.finishGame(Date.now());
    expect(inside.data.status).toBe("finished");
    // La revanche ouvre l'annonce ; prêt, le combat repart
    await bench.send(host, { t: "rematch" });
    await bench.send(host, { t: "ready" });
    inside.stopLoop();
    expect(inside.data.status).toBe("playing");
    // L'ancien écran avait compté loin ; son dernier paquet arrive après le début du nouveau combat
    await bench.send(host, { t: "in", s: 9000, d: [0, 0, 0, 0], c: 1 });
    // Le nouvel écran recompte depuis 1 : le stick à droite
    await bench.send(host, { t: "in", s: 1, d: [1, 0, 0, 0, 1, 0, 0, 0], c: 2 });
    const f = inside.data.fight!;
    const seen = Array.from({ length: 3 }, () => inside.inputs(f)[mine()]!.x);
    expect(seen).toContain(1);
  });

  it("plus rien n'arrive d'un joueur : au bout d'une demi-seconde, son combattant lâche le stick et les boutons", async () => {
    const { bench, host, inside, mine } = await table();
    await bench.send(host, { t: "in", s: 1, d: [1, 0, 8, 0], c: 1 });
    const f = inside.data.fight!;
    const first = inside.inputs(f)[mine()]!;
    expect(first).toMatchObject({ x: 1, held: 8 });
    // Un trou court (le réseau hoquette) : la commande tenue continue
    for (let k = 0; k < 10; k++) expect(inside.inputs(f)[mine()]!.x).toBe(1);
    // Dix secondes sans rien : plus de commande tenue
    let last: Input | undefined;
    for (let k = 0; k < 600; k++) last = inside.inputs(f)[mine()];
    expect(last).toMatchObject({ x: 0, y: 0, held: 0 });
    // Il revient : ses commandes reprennent
    await bench.send(host, { t: "in", s: 2, d: [-1, 0, 0, 0], c: 2 });
    expect(inside.inputs(f)[mine()]!.x).toBe(-1);
  });
});

describe("Culbute : choisir son combattant", () => {
  it("le combat se lance pendant qu'on vérifie la tenue : le combattant ne change plus, celui de la table est celui qui se bat", async () => {
    // La boutique répond quand on le décide : le temps que la vérification se fasse, l'hôte lance le combat
    let answer!: () => void;
    const env = fakeEnv();
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql: string) => {
      const st = prepare(sql);
      if (!sql.includes("user_items")) return st;
      return {
        ...st,
        bind: () => ({
          all: () =>
            new Promise((resolve) => {
              answer = () => resolve({ results: [{ item: "tenue:marcel:nuit" }] } as never);
            }),
        }),
      } as typeof st;
    };
    const state = new FakeState();
    const room = new CulbuteRoom(state as never, env as never);
    const inside = room as unknown as Inside & { data: { seats: { id: string; kind: string; fighter: unknown }[] } };
    rooms.push(inside);
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    await bench.send(host, { t: "addBot" });
    const me = inside.data.seats.find((s) => s.kind === "human")!;
    const before = me.fighter;
    const picking = bench.send(host, { t: "pick", fighter: { who: "marcel", tenue: "nuit" } });
    await bench.send(host, { t: "start" });
    inside.stopLoop();
    answer();
    await picking;
    expect(me.fighter).toEqual(before);
    const fought = inside.data.fight!.fighters.find((f) => f.id === me.id)!;
    expect(fought.style).toBe("ginette");

    // Hors combat, la même tenue achetée se choisit bien (le délai entre deux choix passé)
    await inside.finishGame(Date.now());
    (room as unknown as { lastMessageAt: Map<string, number> }).lastMessageAt.clear();
    const again = bench.send(host, { t: "pick", fighter: { who: "marcel", tenue: "nuit" } });
    answer();
    await again;
    expect(me.fighter).toEqual({ who: "marcel", tenue: "nuit" });
  });
});

describe("Culbute : le bot qui remplace un joueur parti", () => {
  it("joue au niveau de la table, comme les autres bots", async () => {
    const state = new FakeState();
    const room = new CulbuteRoom(state as never, fakeEnv() as never);
    const inside = room as unknown as Inside & { data: { seats: { id: string; kind: string; autoplay: unknown }[] } };
    rooms.push(inside);
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    await bench.send(host, { t: "settings", settings: { botLevel: "facile" } });
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "start" });
    inside.stopLoop();
    const me = inside.data.seats.find((s) => s.kind === "human")!;
    me.autoplay = "away";
    const f = inside.data.fight!;
    const slot = f.fighters.findIndex((ft) => ft.id === me.id);
    vi.mocked(botInput).mockClear();
    inside.inputs(f);
    const asked = vi.mocked(botInput).mock.calls.map((c) => [c[1], c[3]]);
    expect(asked).toContainEqual([slot, "facile"]);
    expect(asked.every(([, level]) => level === "facile")).toBe(true);
  });
});
