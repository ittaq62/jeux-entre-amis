// La salle d'Escarmouche : la fin d'une partie et sa revanche, la place d'un bot prise en pleine partie, et ce que
// chacun reçoit des autres soldats pendant le combat.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

// L'historique : on tient la réponse de la base entre nos mains, pour faire passer des messages pendant qu'elle répond
vi.mock("./users.ts", async (original) => ({ ...(await original<typeof import("./users.ts")>()), recordGame: vi.fn() }));

import type { Match } from "../shared/games/escarmouche/match.ts";
import { PF, readFighter, type EscTick } from "../shared/games/escarmouche/view.ts";
import type { LobbyRoom } from "../shared/protocol.ts";
import { EscarmoucheRoom } from "./escarmoucheRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";
import { recordGame } from "./users.ts";

installWorkerGlobals();

const recorded = vi.mocked(recordGame);
const open: { stopLoop(): void }[] = [];
afterEach(() => {
  for (const room of open.splice(0)) room.stopLoop();
  recorded.mockReset();
  vi.useRealTimers();
});

interface RoomInside {
  stopLoop(): void;
  tick(): Promise<void>;
  finishGame(now: number): Promise<void>;
  queues: Map<string, unknown[]>;
  data: { match: Match; status: string; results: unknown; recorded: boolean };
}

/** Une promesse qu'on tient : `release` la fait aboutir */
function held<T>() {
  let release!: (v: T) => void;
  const promise = new Promise<T>((r) => (release = r));
  return { promise, release };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

/** Une table de deux amis (ou de l'hôte seul) et d'un bot, la partie lancée (la boucle arrêtée : on la fait tourner à la main) */
async function table(
  settings: Record<string, unknown> = { mode: "solo", map: "hameau" },
  extra: { maxPlayers?: number; alone?: boolean } = {},
) {
  const state = new FakeState();
  const env = fakeEnv();
  const room = new EscarmoucheRoom(state as never, env as never);
  open.push(room as unknown as RoomInside);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  await bench.send(host, { t: "settings", settings, maxPlayers: extra.maxPlayers ?? 4, lateJoin: true });
  const ana = extra.alone ? null : (await bench.arrive(user("ana"))).ws;
  await bench.send(host, { t: "addBot" });
  await bench.send(host, { t: "start" });
  const inside = room as unknown as RoomInside;
  inside.stopLoop();
  expect(inside.data.status).toBe("playing");
  return { bench, room, inside, state, env, host, ana };
}

describe("Escarmouche : une revanche lancée pendant l'enregistrement de la partie d'avant", () => {
  it("la partie d'avant part dans l'historique telle qu'elle a fini, et ses points d'Elo ne s'affichent pas sur la revanche", async () => {
    const { bench, inside, host, ana } = await table();
    const before = inside.data.match;
    before.fighters[0]!.stats.kills = 7;
    const base = held<Awaited<ReturnType<typeof recordGame>>>();
    recorded.mockReturnValue(base.promise);
    const end = inside.finishGame(Date.now());
    await settle();
    expect(recorded).toHaveBeenCalledTimes(1);
    // Pendant que la base répond, les deux amis demandent la revanche : elle part
    await bench.send(host, { t: "rematch" });
    await bench.send(ana!, { t: "rematch" });
    expect(inside.data.status).toBe("playing");
    expect(inside.data.match).not.toBe(before);
    inside.stopLoop();
    // La base répond enfin : les points d'Elo de la partie d'avant
    base.release({ unlocked: {}, elo: { hote: { before: 1000, after: 1016, delta: 16 } } as never });
    await end;
    await settle();
    // Ce qui est parti dans l'historique : la partie d'avant, avec ses 7 éliminations
    const rec = recorded.mock.calls[0]![1];
    expect(rec.players.find((p) => p.userId === "hote")!.stats).toMatchObject({ kills: 7 });
    // La revanche ne montre pas les points de la partie d'avant comme les siens
    expect(inside.data.results).toBeNull();
    expect(host.view<LobbyRoom & { results: unknown }>().results).toBeNull();
  });

  it("seul avec des bots, la revanche part pendant que le hub apprend la fin : la partie d'avant est quand même enregistrée", async () => {
    const { bench, inside, env, host } = await table({ mode: "solo", map: "hameau" }, { alone: true });
    const before = inside.data.match;
    before.fighters[0]!.stats.kills = 3;
    recorded.mockResolvedValue({ unlocked: {}, elo: {} });
    // Le hub met du temps à répondre à l'annonce de la fin (et seulement à celle-là)
    const hub = held<undefined>();
    const upsert = env.hub.upsertRoom;
    let calls = 0;
    env.hub.upsertRoom = (summary: { code: string; status?: string }) =>
      summary.status === "finished" && calls++ === 0 ? hub.promise : upsert(summary);
    const end = inside.finishGame(Date.now());
    await settle();
    // Un seul clic : la revanche part aussitôt
    await bench.send(host, { t: "rematch" });
    expect(inside.data.status).toBe("playing");
    expect(inside.data.match).not.toBe(before);
    inside.stopLoop();
    hub.release(undefined);
    await end;
    await settle();
    expect(recorded).toHaveBeenCalledTimes(1);
    const rec = recorded.mock.calls[0]![1];
    expect(rec.players.find((p) => p.userId === "hote")!.stats).toMatchObject({ kills: 3 });
    expect(rec.settings).toBe(before.settings);
  });
});

describe("Escarmouche : prendre la place d'un bot en pleine partie", () => {
  it("on reprend son soldat là où il est, mais pas son bilan ; le score de l'équipe ne bouge pas", async () => {
    const { bench, inside } = await table({ mode: "equipes", map: "gare" }, { maxPlayers: 3 });
    const m = inside.data.match;
    const k = m.fighters.findIndex((f) => f.bot);
    const bot = m.fighters[k]!;
    Object.assign(bot.stats, { kills: 6, deaths: 2, assists: 3, captures: 1 });
    bot.points = 80;
    bot.streak = 4;
    m.scores[bot.team === 1 ? 1 : 0] = 6;
    const where = { x: bot.s.x, z: bot.s.z, hp: bot.hp };
    const scores = [...m.scores];
    const player = await bench.arrive(user("joueur"), "?jouer");
    expect(player.ws.view<LobbyRoom>().you.seatId).toBe("joueur");
    const f = m.fighters[k]!;
    expect(f.id).toBe("joueur");
    expect(f.bot).toBe(false);
    expect({ x: f.s.x, z: f.s.z, hp: f.hp }).toEqual(where);
    expect(f.stats).toMatchObject({ kills: 0, deaths: 0, assists: 0, captures: 0 });
    expect(f.points).toBe(0);
    expect(f.streak).toBe(0);
    expect(m.scores).toEqual(scores);
  });
});

describe("Escarmouche : ce que la salle envoie des autres soldats", () => {
  /** Les positions reçues par cette connexion, au dernier envoi du combat */
  const lastTick = (ws: { inbox: Record<string, unknown>[] }) =>
    [...ws.inbox].reverse().find((msg) => msg.t === "tick") as (EscTick & { now: number }) | undefined;

  it("un adversaire derrière un mur n'arrive pas chez le joueur ; un spectateur voit tout, mais avec trois secondes de retard", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let now = Date.now();
    const { bench, inside, host, ana } = await table({ mode: "solo", map: "hameau" });
    const m = inside.data.match;
    const me = m.fighters.findIndex((f) => f.id === "hote");
    const her = m.fighters.findIndex((f) => f.id === "ana");
    const bot = m.fighters.findIndex((f) => f.bot);
    // Le bot est hors de combat pour longtemps ; l'hôte est dans l'avenue, Ana derrière la maison B
    Object.assign(m.fighters[bot]!, { respawnAt: 1e9 });
    Object.assign(m.fighters[bot]!.s, { alive: false, y: -50 });
    const watcher = (await bench.arrive(user("curieux"))).ws;
    expect(watcher.view<LobbyRoom>().you.seatId).toBeNull();
    const stand = () => {
      Object.assign(m.fighters[me]!.s, { x: -28, y: 0, z: -3, vx: 0, vz: 0, alive: true });
      Object.assign(m.fighters[her]!.s, { x: -17, y: 0, z: -11, vx: 0, vz: 0, alive: true, crouch: true });
    };
    (inside as unknown as { lastTick: number }).lastTick = now;
    for (let k = 0; k < 40; k++) {
      stand();
      now += 50;
      vi.setSystemTime(now);
      await inside.tick();
    }
    const mine = lastTick(host)!;
    expect(readFighter(mine.p, her).bits).toBe(PF.hidden);
    expect(readFighter(mine.p, me).x).toBe(-28);
    expect(readFighter(lastTick(ana!)!.p, me).bits).toBe(PF.hidden);
    // Le spectateur : rien pendant trois secondes, puis tout le monde, à sa vraie place
    expect(lastTick(watcher)).toBeUndefined();
    for (let k = 0; k < 30; k++) {
      stand();
      now += 50;
      vi.setSystemTime(now);
      await inside.tick();
    }
    const seen = lastTick(watcher)!;
    expect(seen.now).toBeLessThanOrEqual(now - 3000);
    expect(readFighter(seen.p, her)).toMatchObject({ x: -17, z: -11 });
    // Ana se montre dans l'avenue : l'hôte la reçoit aussitôt
    Object.assign(m.fighters[her]!.s, { x: -14, z: 1, crouch: false });
    now += 50;
    vi.setSystemTime(now);
    await inside.tick();
    expect(readFighter(lastTick(host)!.p, her)).toMatchObject({ x: -14, z: 1 });
  });
});
