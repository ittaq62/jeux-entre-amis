// Les règles au hasard et les équipes, vues des salles : le tirage du serveur, ce qu'il verrouille, le lancement,
// et le tirage suivant à la fin de la partie.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import type { GameId, LobbyRoom, RoomView } from "../shared/protocol.ts";
import { drawnKeys } from "../shared/randomRules.ts";
import { findVariant, variantSettings } from "../shared/tour.ts";
import { BolidesRoom } from "./bolidesRoom.ts";
import { BricksRoom } from "./bricksRoom.ts";
import { CapitaleRoom } from "./capitaleRoom.ts";
import { CramponsRoom } from "./cramponsRoom.ts";
import { CulbuteRoom } from "./culbuteRoom.ts";
import { MinigolfRoom } from "./minigolfRoom.ts";
import { BowlingRoom } from "./bowlingRoom.ts";
import { BillardRoom } from "./billardRoom.ts";
import { EscarmoucheRoom } from "./escarmoucheRoom.ts";
import { MecheRoom } from "./mecheRoom.ts";
import { NavalRoom } from "./navalRoom.ts";
import { GameRoom } from "./room.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type FakeSocket, type RoomLike } from "./roomHarness.ts";

installWorkerGlobals();

type RoomClass = new (state: never, env: never) => RoomLike & { init(opts: unknown): Promise<boolean> };

const GAMES: { game: GameId; Room: RoomClass; bots: boolean }[] = [
  { game: "uno", Room: GameRoom as unknown as RoomClass, bots: true },
  { game: "naval", Room: NavalRoom as unknown as RoomClass, bots: true },
  { game: "bricks", Room: BricksRoom as unknown as RoomClass, bots: true },
  { game: "capitale", Room: CapitaleRoom as unknown as RoomClass, bots: true },
  { game: "meche", Room: MecheRoom as unknown as RoomClass, bots: true },
  { game: "bolides", Room: BolidesRoom as unknown as RoomClass, bots: true },
  { game: "crampons", Room: CramponsRoom as unknown as RoomClass, bots: false },
  { game: "culbute", Room: CulbuteRoom as unknown as RoomClass, bots: true },
  { game: "escarmouche", Room: EscarmoucheRoom as unknown as RoomClass, bots: true },
  { game: "minigolf", Room: MinigolfRoom as unknown as RoomClass, bots: true },
  { game: "bowling", Room: BowlingRoom as unknown as RoomClass, bots: true },
  { game: "billard", Room: BillardRoom as unknown as RoomClass, bots: true },
];

/** Pour chaque jeu, une règle que le tirage décide et qui accepte une autre valeur (un oui/non, ou la fin d'un nul) */
const DRAWN_TOGGLE: Record<GameId, string> = {
  uno: "stacking",
  naval: "touching",
  bricks: "messy",
  capitale: "freeParking",
  meche: "passes",
  bolides: "items",
  crampons: "draw",
  culbute: "lune",
  escarmouche: "hardcore",
  minigolf: "lune",
  bowling: "lune",
  billard: "rebonds",
};

const open: { stopLoop?: () => void }[] = [];
afterEach(() => {
  for (const room of open.splice(0)) room.stopLoop?.();
});

async function table(Room: RoomClass, bots: boolean) {
  const state = new FakeState();
  const room = new Room(state as never, fakeEnv() as never);
  open.push(room as unknown as { stopLoop?: () => void });
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  if (bots) await bench.send(host, { t: "addBot" });
  return { bench, host, room };
}

const chat = (ws: FakeSocket) =>
  ws.inbox.filter((m) => m.t === "chat").flatMap((m) => (m.messages as { text: string }[]).map((x) => x.text));

describe.each(GAMES)("$game : règles au hasard", ({ game, Room, bots }) => {
  it("l'hôte demande le hasard : le serveur tire des règles de la tournée, lisibles par toute la table", async () => {
    const { bench, host } = await table(Room, bots);
    expect(host.view<LobbyRoom>().settings.randomRules ?? null).toBeNull();
    await bench.send(host, { t: "settings", settings: {}, randomRules: true });
    const draw = host.view<LobbyRoom>().settings.randomRules;
    expect(findVariant(game, draw)).not.toBeNull();
    const { ws: friend } = await bench.arrive(user("ami"), "?regarder");
    expect(friend.view<LobbyRoom>().settings.randomRules).toBe(draw);
    expect(chat(host).some((t) => t.startsWith("Règles tirées au sort : "))).toBe(true);
  });

  it("un autre que l'hôte ne peut pas tirer", async () => {
    const { bench, host } = await table(Room, bots);
    const { ws } = await bench.arrive(user("ami"));
    await bench.send(ws, { t: "settings", settings: {}, randomRules: true });
    expect(host.view<LobbyRoom>().settings.randomRules ?? null).toBeNull();
  });

  it("au lancement, la partie se joue avec les règles tirées ; l'hôte ne les change pas à la main", async () => {
    const { bench, host } = await table(Room, bots);
    await bench.send(host, { t: "settings", settings: {}, randomRules: true });
    const draw = host.view<LobbyRoom>().settings.randomRules!;
    // Un réglage que le tirage décide, avec une valeur permise : refusé tant que les règles sont au hasard
    const key = DRAWN_TOGGLE[game];
    expect(drawnKeys(game)).toContain(key);
    const before = bench.data<{ settings: Record<string, Record<string, unknown>> }>().settings[game]![key];
    const other = typeof before === "boolean" ? !before : before === "penalties" ? "extra" : "penalties";
    await bench.send(host, { t: "settings", settings: { [key]: other } });
    expect(bench.data<{ settings: Record<string, Record<string, unknown>> }>().settings[game]![key]).toEqual(before);
    await bench.send(host, { t: "start" });
    expect(host.view<LobbyRoom>().status).toBe("playing");
    const played = bench.data<{ settings: Record<string, Record<string, unknown>> }>().settings[game]!;
    for (const [k, v] of Object.entries(variantSettings(game as "uno", draw))) expect(played[k]).toEqual(v);
    expect(chat(host).some((t) => t.startsWith("Règles tirées au sort pour cette partie"))).toBe(true);
  });

  it("sans tirage, rien ne change : l'hôte règle ces réglages comme avant", async () => {
    const { bench, host } = await table(Room, bots);
    const key = DRAWN_TOGGLE[game];
    const before = bench.data<{ settings: Record<string, Record<string, unknown>> }>().settings[game]![key];
    const other = typeof before === "boolean" ? !before : before === "penalties" ? "extra" : "penalties";
    await bench.send(host, { t: "settings", settings: { [key]: other } });
    expect(bench.data<{ settings: Record<string, Record<string, unknown>> }>().settings[game]![key]).toEqual(other);
  });

  it("revenir aux règles au choix garde celles qui étaient tirées", async () => {
    const { bench, host } = await table(Room, bots);
    await bench.send(host, { t: "settings", settings: {}, randomRules: true });
    const draw = host.view<LobbyRoom>().settings.randomRules!;
    await bench.send(host, { t: "settings", settings: {}, randomRules: false });
    expect(host.view<LobbyRoom>().settings.randomRules ?? null).toBeNull();
    const kept = bench.data<{ settings: Record<string, Record<string, unknown>> }>().settings[game]!;
    for (const [k, v] of Object.entries(variantSettings(game as "uno", draw))) expect(kept[k]).toEqual(v);
  });
});

/** La partie lancée se termine, par le chemin de fin de chaque salle */
const FINISH: Record<GameId, (room: Record<string, (...a: unknown[]) => unknown>, d: Record<string, Record<string, unknown>>) => unknown> =
  {
    uno: (room, d) => (Object.assign(d.uno!, { phase: "gameOver", ranking: [], teamRanks: null }), room.afterChange!([], Date.now())),
    naval: (room, d) => (Object.assign(d.naval!, { phase: "gameOver", ranking: [], ranks: {} }), room.afterChange!([], Date.now())),
    bricks: (room) => room.finishMatch!(Date.now()),
    capitale: (room, d) => (Object.assign(d.capitale!, { step: "over" }), room.afterChange!([], Date.now())),
    meche: (room) => room.finishGame!(Date.now()),
    bolides: (room) => room.finishGame!(Date.now()),
    crampons: (room) => room.finishGame!(Date.now()),
    culbute: (room) => room.finishGame!(Date.now()),
    escarmouche: (room) => room.finishGame!(Date.now()),
    minigolf: (room) => room.finishGame!(Date.now()),
    bowling: (room) => room.finishGame!(Date.now()),
    billard: (room) => room.finishGame!(Date.now()),
  };

describe.each(GAMES)("$game : à la fin de la partie", ({ game, Room, bots }) => {
  it("de nouvelles règles sont tirées pour la suivante, et annoncées", async () => {
    const { bench, host, room } = await table(Room, bots);
    await bench.send(host, { t: "settings", settings: {}, randomRules: true });
    const first = host.view<LobbyRoom>().settings.randomRules;
    await bench.send(host, { t: "start" });
    expect(host.view<LobbyRoom>().status).toBe("playing");
    await FINISH[game](room as never, bench.data());
    const d = bench.data<{ status: string; settings: { randomRules: string } }>();
    expect(d.status).toBe("finished");
    expect(findVariant(game, d.settings.randomRules)).not.toBeNull();
    expect(d.settings.randomRules).not.toBe(first);
    expect(chat(host).some((t) => t.startsWith("Pour la prochaine partie, règles tirées au sort"))).toBe(true);
  });

  it("sans règles au hasard, la fin de partie ne tire rien", async () => {
    const { bench, host, room } = await table(Room, bots);
    await bench.send(host, { t: "start" });
    await FINISH[game](room as never, bench.data());
    expect(bench.data<{ settings: { randomRules?: string | null } }>().settings.randomRules ?? null).toBeNull();
    expect(chat(host).some((t) => t.includes("tirées au sort"))).toBe(false);
  });
});

describe("UNO en équipes à une table", () => {
  async function teamTable() {
    const { bench, host } = await table(GameRoom as unknown as RoomClass, true);
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "settings", settings: { teamCount: 2 } });
    return { bench, host };
  }

  it("deux équipes de deux, réparties à tour de rôle ; le jeu alterne les équipes et l'on gagne ensemble", async () => {
    const { bench, host } = await teamTable();
    const v = host.view<RoomView>();
    expect(v.settings.maxPlayers % 2).toBe(0);
    expect(v.seats.map((s) => s.team)).toEqual([0, 1, 0, 1]);
    await bench.send(host, { t: "start" });
    const g = bench.data<{ uno: { players: { id: string }[]; teams: Record<string, number>; teamWin: boolean } }>().uno;
    expect(g.teamWin).toBe(true);
    const order = g.players.map((p) => g.teams[p.id]);
    expect(order).toEqual([0, 1, 0, 1]);
    // Chacun voit la main de son coéquipier
    expect(host.view<RoomView>().uno!.partners).toHaveLength(1);
  });

  it("des équipes inégales ne partent pas", async () => {
    const { bench, host } = await teamTable();
    const bot = host.view<RoomView>().seats.find((s) => s.team === 1)!;
    await bench.send(host, { t: "team", seatId: bot.id, team: 0 });
    await bench.send(host, { t: "start" });
    expect(host.view<RoomView>().status).toBe("lobby");
    expect(host.errors().at(-1)).toContain("3 contre 1");
  });

  it("à la fin d'une partie aux règles tirées, de nouvelles règles sont tirées pour la suivante", async () => {
    const { bench, host } = await teamTable();
    await bench.send(host, { t: "settings", settings: {}, randomRules: true });
    const first = host.view<RoomView>().settings.randomRules;
    await bench.send(host, { t: "start" });
    // La partie se termine : la carte qui vide la main de l'hôte
    const d = bench.data<{ uno: { phase: string; ranking: string[]; teamRanks: Record<string, number> | null } }>();
    const ids = host.view<RoomView>().seats.map((s) => s.id);
    Object.assign(d.uno, { phase: "gameOver", ranking: ids, teamRanks: { [ids[0]!]: 1, [ids[2]!]: 1, [ids[1]!]: 3, [ids[3]!]: 3 } });
    await (bench.room as unknown as { afterChange(e: unknown[], now: number): Promise<void> }).afterChange([], Date.now());
    const v = host.view<RoomView>();
    expect(v.status).toBe("finished");
    expect(findVariant("uno", v.settings.randomRules)).not.toBeNull();
    expect(v.settings.randomRules).not.toBe(first);
    const lines = chat(host);
    expect(lines.some((t) => t.startsWith("Les Rouges remportent la partie"))).toBe(true);
    expect(lines.some((t) => t.startsWith("Pour la prochaine partie, règles tirées au sort"))).toBe(true);
  });
});
