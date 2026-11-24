// La salle de Culbute et les commandes des joueurs : une revanche repart d'une file propre, et un joueur dont plus rien
// n'arrive (onglet caché, connexion morte) ne continue pas à courir avec la dernière commande reçue.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { INTRO_FRAMES, type Fight } from "../shared/games/culbute/engine.ts";
import { LOAD_MAX_MS, type LoadGate } from "../shared/loadGate.ts";
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

  it("un paquet arrivé en retard avec dix commandes : elles sont toutes jouées, une par image, dans l'ordre", async () => {
    const { bench, host, inside, mine } = await table();
    // Chaque commande porte son numéro dans le stick, pour savoir laquelle est jouée
    const d = Array.from({ length: 10 }, (_, i) => [(i + 1) / 100, 0, 0, 0]).flat();
    await bench.send(host, { t: "in", s: 1, d, c: 1 });
    const f = inside.data.fight!;
    const seen = Array.from({ length: 10 }, () => inside.inputs(f)[mine()]!.x);
    expect(seen).toEqual([0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1]);
  });

  it("une marge qui ne sert pas se résorbe d'une commande en deux secondes, sans perdre l'appui qu'elle portait", async () => {
    const { bench, host, inside, mine } = await table();
    const f = inside.data.fight!;
    // Cinq commandes d'avance, puis une nouvelle à chaque image : la file ne descend jamais sous 4
    const one = (seq: number) => [seq / 1000, 0, 0, seq === 240 ? 16 : 0];
    await bench.send(host, { t: "in", s: 1, d: [1, 2, 3, 4, 5].flatMap(one), c: 1 });
    const seen: Input[] = [];
    for (let k = 1; k <= 240; k++) {
      await bench.send(host, { t: "in", s: 5 + k, d: one(5 + k), c: 1 + k });
      seen.push(inside.inputs(f)[mine()]!);
    }
    // Les 239 premières images jouent les commandes une à une ; la 240e en saute une, et garde son appui
    expect(seen.slice(0, 239).map((i) => Math.round(i.x * 1000))).toEqual(Array.from({ length: 239 }, (_, i) => i + 1));
    expect(Math.round(seen[239]!.x * 1000)).toBe(241);
    expect(seen[239]!.pressed & 16).toBe(16);
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

describe("Culbute : le combat attend le chargement de chacun", () => {
  type Gated = Inside & {
    data: { status: string; fight: Fight | null; gate?: LoadGate | null; seats: { id: string; kind: string; userId: string | null }[] };
    tick(): Promise<void>;
  };
  let clock = 1_000_000;
  beforeEach(() => {
    clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.mocked(Date.now).mockRestore();
  });

  async function gated() {
    const t = await table();
    const inside = t.inside as Gated;
    const tick = async (ms: number) => {
      clock += ms;
      await inside.tick();
      inside.stopLoop();
    };
    const loaded = () => t.bench.send(t.host, { t: "loaded", gate: inside.data.gate!.id });
    return { ...t, inside, tick, loaded };
  }

  it("ni le compte à rebours ni le bot ne courent pendant le chargement ; il part au départ commun, sans décompte de plus", async () => {
    const t = await gated();
    const gate = t.inside.data.gate!;
    expect(gate.countdown).toBe(0);
    expect(gate.waiting).toEqual([t.inside.data.seats.find((s) => s.kind === "human")!.id]);
    // On voit qui charge encore
    expect(t.host.view<{ gate: LoadGate }>().gate.loaded).toEqual([]);
    await t.tick(2000);
    await t.tick(2000);
    expect(t.inside.data.fight!.frame).toBe(0);
    await t.loaded();
    expect(t.inside.data.gate!.goAt).toBe(clock);
    await t.tick(50);
    expect(t.inside.data.gate).toBeNull();
    await t.tick(100);
    // Le compte à rebours du combat a commencé : il en tient lieu
    expect(t.inside.data.fight!.frame).toBeGreaterThan(0);
    expect(t.inside.data.fight!.frame).toBeLessThan(INTRO_FRAMES);
    expect(t.inside.data.fight!.phase).toBe("intro");
  });

  it("les commandes envoyées pendant le chargement ne comptent pas (un clic donné en attendant ne part pas en coup)", async () => {
    const t = await gated();
    await t.bench.send(t.host, { t: "in", s: 1, d: [1, 0, 1, 1], c: 1 });
    await t.tick(500);
    await t.loaded();
    await t.tick(50);
    expect(t.inside.data.gate).toBeNull();
    const seen = t.inside.inputs(t.inside.data.fight!)[t.mine()]!;
    expect(seen).toMatchObject({ x: 0, held: 0, pressed: 0 });
  });

  it("au-delà du délai maximum, le combat part sans le retardataire ; le joueur parti n'est plus attendu", async () => {
    const t = await gated();
    await t.tick(LOAD_MAX_MS - 50);
    expect(t.inside.data.gate).not.toBeNull();
    await t.tick(50);
    expect(t.inside.data.gate).toBeNull();
    const u = await gated();
    await u.bench.drop(u.host);
    expect(u.inside.data.gate!.goAt).toBe(clock);
  });

  it("deux joueurs, l'un lent à charger : l'autre l'attend (et voit qu'il charge), puis le combat part pour les deux", async () => {
    const state = new FakeState();
    const room = new CulbuteRoom(state as never, fakeEnv() as never);
    const inside = room as unknown as Gated;
    rooms.push(inside);
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    const guest = (await bench.arrive(user("invite"))).ws;
    await bench.send(host, { t: "start" });
    inside.stopLoop();
    const tick = async (ms: number) => {
      clock += ms;
      await inside.tick();
      inside.stopLoop();
    };
    const seatOf = (id: string) => inside.data.seats.find((s) => s.userId === id)!.id;
    expect([...inside.data.gate!.waiting].sort()).toEqual([seatOf("hote"), seatOf("invite")].sort());
    // L'hôte est prêt tout de suite ; l'invité, huit secondes plus tard
    await bench.send(host, { t: "loaded", gate: inside.data.gate!.id });
    await tick(4000);
    await tick(4000);
    expect(inside.data.fight!.frame).toBe(0);
    expect(inside.data.gate!.goAt).toBeNull();
    // Ce que l'hôte voit : lui a chargé, l'invité non
    const seen = host.view<{ gate: LoadGate }>().gate;
    expect(seen.loaded).toEqual([seatOf("hote")]);
    await bench.send(guest, { t: "loaded", gate: inside.data.gate!.id });
    expect(inside.data.gate!.goAt).toBe(clock);
    await tick(50);
    expect(inside.data.gate).toBeNull();
    await tick(100);
    expect(inside.data.fight!.frame).toBeGreaterThan(0);
  });

  it("à la revanche, un nouveau chargement (un « chargé » du combat d'avant ne compte pas)", async () => {
    const t = await gated();
    const first = t.inside.data.gate!.id;
    await t.loaded();
    await t.tick(50);
    await t.inside.finishGame(clock);
    await t.bench.send(t.host, { t: "rematch" });
    await t.bench.send(t.host, { t: "ready" });
    t.inside.stopLoop();
    expect(t.inside.data.status).toBe("playing");
    const second = t.inside.data.gate!;
    expect(second.id).not.toBe(first);
    await t.bench.send(t.host, { t: "loaded", gate: first });
    expect(t.inside.data.gate!.loaded).toEqual([]);
  });
});
