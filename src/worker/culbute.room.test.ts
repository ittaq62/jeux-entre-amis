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
    await bench.send(host, { t: "rematch" });
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
