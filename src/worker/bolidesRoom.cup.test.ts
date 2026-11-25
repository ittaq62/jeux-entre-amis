// Le Grand Prix de Bolides, vu de la salle : il continue quand l'hôte ne touche qu'à la table (une place de plus, la
// table ouverte), recommence quand les règles de la course changent, et se gagne parmi ceux encore à la table.
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
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type FakeSocket } from "./roomHarness.ts";

installWorkerGlobals();

interface Cup {
  index: number;
  tracks: string[];
  points: Record<string, number>;
  last: Record<string, number>;
}
interface Data {
  status: string;
  cup: Cup | null;
  seats: { id: string; kind: string }[];
  race: { ranks: Record<string, number> | null; ranking: string[] | null } | null;
}

type Room = { finishGame(now: number): Promise<void>; startGame(now: number): Promise<void> };

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
  await bench.send(host, { t: "addBot" });
  await bench.send(host, { t: "settings", settings: { cup: true } });
  return { bench, host, room: room as unknown as Room };
}

/** Une course du Grand Prix, jouée : `order` du premier au dernier */
async function race(bench: Bench<never>, host: FakeSocket, room: Room, order: string[]) {
  await bench.send(host, { t: "start" });
  // Après une course, le départ passe par l'annonce : on ne l'attend pas
  if (bench.data<Data>().status !== "playing") await room.startGame(Date.now());
  const d = bench.data<Data>();
  d.race!.ranking = order;
  d.race!.ranks = Object.fromEntries(order.map((id, i) => [id, i + 1]));
  await room.finishGame(Date.now());
}

const chat = (ws: FakeSocket) =>
  ws.inbox.filter((m) => m.t === "chat").flatMap((m) => (m.messages as { text: string }[]).map((x) => x.text));

describe("Bolides : le Grand Prix", () => {
  it("une place de plus ou la table ouverte entre deux courses : le Grand Prix continue", async () => {
    const { bench, host, room } = await table();
    const [me, bot] = bench.data<Data>().seats.map((s) => s.id);
    await race(bench, host, room, [me!, bot!]);
    expect(bench.data<Data>().cup!.points[me!]).toBe(15);
    await bench.send(host, { t: "settings", settings: {}, maxPlayers: 7 });
    await bench.send(host, { t: "settings", settings: {}, visibility: "public" });
    await bench.send(host, { t: "settings", settings: {}, lateJoin: true });
    expect(bench.data<Data>().cup?.points[me!]).toBe(15);
    await race(bench, host, room, [bot!, me!]);
    const cup = bench.data<Data>().cup!;
    expect(cup.index).toBe(1);
    expect(cup.points[me!]).toBe(27);
  });

  it("d'autres règles de course : le prochain départ recommence un Grand Prix", async () => {
    const { bench, host, room } = await table();
    const [me, bot] = bench.data<Data>().seats.map((s) => s.id);
    await race(bench, host, room, [me!, bot!]);
    await bench.send(host, { t: "settings", settings: { laps: 5 } });
    expect(bench.data<Data>().cup).toBeNull();
  });

  it("le Grand Prix se gagne parmi ceux encore à la table, et à égalité, le mieux placé à la dernière course", async () => {
    const { bench, host, room } = await table();
    const [me, bot] = bench.data<Data>().seats.map((s) => s.id);
    await race(bench, host, room, [me!, bot!]);
    // Avant la dernière course : un pilote parti mène largement, et les deux restants sont à égalité
    const cup = bench.data<Data>().cup!;
    cup.index = cup.tracks.length - 2;
    cup.points = { parti: 99, [me!]: 30, [bot!]: 33 };
    await race(bench, host, room, [me!, bot!]);
    // 30 + 15 contre 33 + 12 : égalité, celui qui a gagné la dernière course l'emporte
    expect(chat(host)).toContain("Hote remporte le Grand Prix !");
    expect(chat(host).some((t) => t.startsWith("?"))).toBe(false);
  });
});
