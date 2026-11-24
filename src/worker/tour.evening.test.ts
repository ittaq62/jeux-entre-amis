// Une soirée de tournée qui ne doit jamais rester coincée : un joueur absent au départ, un résultat de table perdu, une
// table fermée, un hôte qui s'en va sans personne pour le remplacer, plus d'amis que n'en accueillent les jeux, une
// équipe qui garde les points de qui regarde un moment, la fermeture par l'administrateur, et les jeux en bêta.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { BETA_GAMES } from "../shared/protocol.ts";
import { teamScores, type TableReport, type TourView } from "../shared/tour.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type FakeSocket } from "./roomHarness.ts";
import { TourRoom } from "./tourRoom.ts";

installWorkerGlobals();

afterEach(() => {
  vi.useRealTimers();
});

/** Une tournée et la table de jeu qu'elle crée (la même pour tous les jeux) : ce que la table répond quand on la regarde */
async function tour({ open }: { open?: string[] } = {}) {
  vi.useFakeTimers();
  let now = Date.now();
  vi.setSystemTime(now);
  const table = {
    summary: { status: "playing" } as { status: string } | null,
    init: vi.fn(async () => true),
    adminClose: vi.fn(async () => true),
    adminKick: vi.fn(async () => {}),
  };
  const stub = { init: table.init, summary: async () => table.summary, adminClose: table.adminClose, adminKick: table.adminKick };
  const ns = { idFromName: (code: string) => code, get: () => stub };
  const env = { ...fakeEnv([], open ? { open } : {}), ROOMS: ns, NAVAL: ns, MINIGOLF: ns };
  const state = new FakeState();
  const room = new TourRoom(state as never, env as never);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  const view = (ws: FakeSocket = host) => ws.view<TourView>();
  const later = async (ms: number) => {
    now += ms;
    vi.setSystemTime(now);
    await room.alarm();
  };
  /** La table du jeu en cours donne son résultat, dans l'ordre des joueurs donné */
  const finish = (order: string[]) => {
    const c = view().current!;
    const report: TableReport = {
      code: c.code,
      index: c.index,
      game: c.game,
      seats: order.length,
      players: order.map((userId, i) => ({ userId, rank: i + 1, stats: {} })),
    };
    return room.tableFinished(report);
  };
  const chat = () => bench.data<{ chat: { text: string }[] }>().chat.map((m) => m.text);
  return { bench, room, host, view, later, finish, chat, table, now: () => now };
}

describe("tournée : une soirée qui ne reste pas coincée", () => {
  it("un joueur déconnecté au moment du départ reste joueur, et joue le jeu suivant dès son retour", async () => {
    const { bench, host, view, finish } = await tour();
    await bench.arrive(user("ana"));
    const bob = (await bench.arrive(user("bob"))).ws;
    await bench.send(host, { t: "settings", settings: { games: ["uno"] } });
    await bench.drop(bob);
    await bench.send(host, { t: "start" });
    expect(view().members.find((m) => m.userId === "bob")!.role).toBe("player");
    await bench.send(host, { t: "launch" });
    expect(view().games[0]!.players).toEqual(["hote", "ana"]);
    // Il revient (porte fermée en cours de route, par défaut) : il est toujours joueur
    const back = (await bench.arrive(user("bob"))).ws;
    expect(view(back).you.role).toBe("player");
    await finish(["ana", "hote"]);
    await bench.send(host, { t: "launch" });
    expect(view().games[1]!.players).toEqual(["hote", "ana", "bob"]);
  });

  it("la table du jeu a été fermée : le jeu ne compte pas et la tournée continue, sans attendre trois quarts d'heure", async () => {
    const { bench, host, view, later, chat, table } = await tour();
    await bench.arrive(user("ana"));
    await bench.send(host, { t: "settings", settings: { games: ["uno"] } });
    await bench.send(host, { t: "start" });
    await bench.send(host, { t: "launch" });
    // Tant que la table joue, rien ne bouge
    await later(60_000);
    await later(60_000);
    expect(view().status).toBe("playing");
    table.summary = null;
    await later(60_000);
    expect(view().status).toBe("intermission");
    expect(view().games[0]!.aborted).toBe(true);
    expect(view().next).not.toBeNull();
    expect(chat().at(-1)).toContain("a été fermée");
  });

  it("la table a fini mais son résultat s'est perdu : au regard suivant, le jeu ne compte pas et la tournée continue", async () => {
    const { bench, host, view, later, chat, table } = await tour();
    await bench.arrive(user("ana"));
    await bench.send(host, { t: "settings", settings: { games: ["uno"] } });
    await bench.send(host, { t: "start" });
    await bench.send(host, { t: "launch" });
    table.summary = { status: "finished" };
    // Le premier regard la voit finie : on laisse à son résultat le temps d'arriver
    await later(60_000);
    expect(view().status).toBe("playing");
    await later(60_000);
    expect(view().status).toBe("intermission");
    expect(chat().some((t) => t.includes("s'est perdu"))).toBe(true);
  });

  it("une table qui n'a pas pu commencer, alors que l'hôte a demandé d'arrêter après ce jeu : la tournée s'arrête", async () => {
    const { bench, room, host, view, finish } = await tour();
    await bench.arrive(user("ana"));
    await bench.send(host, { t: "settings", settings: { games: ["uno"] } });
    await bench.send(host, { t: "start" });
    await bench.send(host, { t: "launch" });
    await finish(["hote", "ana"]);
    await bench.send(host, { t: "launch" });
    await bench.send(host, { t: "finish" });
    expect(view().finishAfterCurrent).toBe(true);
    await room.tableAborted(view().current!.code);
    expect(view().status).toBe("finished");
  });

  it("l'hôte part quand personne d'autre n'est là : au retour d'un autre joueur, la main passe à lui", async () => {
    const { bench, host, view, later } = await tour();
    const ana = (await bench.arrive(user("ana"))).ws;
    await bench.send(host, { t: "settings", settings: { games: ["uno"] } });
    await bench.send(host, { t: "start" });
    await bench.send(host, { t: "launch" });
    await bench.drop(ana);
    await bench.drop(host);
    // Le délai de l'hôte passe sans personne à qui donner la main
    await later(25_000);
    expect(bench.data<{ hostId: string }>().hostId).toBe("hote");
    const back = (await bench.arrive(user("ana"))).ws;
    await later(25_000);
    expect(view(back).you.isHost).toBe(true);
  });

  it("plus d'amis que n'en accueille le seul jeu du programme : la tournée continue, chacun son tour sur la touche", async () => {
    const { bench, host, view, finish } = await tour();
    await bench.send(host, { t: "settings", lateJoin: true, settings: { games: ["naval"] } });
    for (let i = 0; i < 5; i++) await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "start" });
    await bench.send(host, { t: "launch" });
    const first = view().games[0]!.players;
    expect(first).toHaveLength(6);
    // Une septième, arrivée pendant le jeu, demande à jouer
    const zoe = (await bench.arrive(user("zoe"), "?jouer")).ws;
    expect(view(zoe).you.role).toBe("player");
    await finish(first);
    // Avant : « Aucun des jeux cochés n'accueille 7 joueurs : la tournée est en pause »
    expect(view().next?.game).toBe("naval");
    await bench.send(host, { t: "launch" });
    const second = view().games[1]!.players;
    expect(second).toHaveLength(6);
    expect(second).toContain("zoe");
    expect(second).toContain("hote");
    // Le bot resté sur la touche joue le jeu d'après, en priorité
    const benched = first.find((id) => !second.includes(id))!;
    expect(benched.startsWith("bot-")).toBe(true);
    await finish(second);
    await bench.send(host, { t: "launch" });
    expect(view().games[2]!.players).toContain(benched);
  });

  it("en équipes, qui regarde un moment garde ses points à son équipe, et la retrouve quand il rejoue", async () => {
    const { bench, host, view, finish } = await tour();
    const ana = (await bench.arrive(user("ana"))).ws;
    await bench.arrive(user("bob"));
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "settings", settings: { games: ["uno"], teams: true } });
    await bench.send(host, { t: "start" });
    await bench.send(host, { t: "launch" });
    const players = view().games[0]!.players;
    await finish(players);
    const team = view().members.find((m) => m.userId === "ana")!.team;
    const before = teamScores(view().members);
    await bench.send(ana, { t: "watch" });
    expect(view().members.find((m) => m.userId === "ana")!.team).toBe(team);
    expect(teamScores(view().members)).toEqual(before);
    // La porte est fermée en cours de route, mais elle a déjà joué cette tournée : elle reprend sa place
    await bench.send(ana, { t: "sit" });
    const back = view().members.find((m) => m.userId === "ana")!;
    expect(back.role).toBe("player");
    expect(back.team).toBe(team);
  });

  it("l'administrateur ferme la tournée pendant un jeu : la table du jeu ferme aussi", async () => {
    const { bench, room, host, table } = await tour();
    await bench.arrive(user("ana"));
    await bench.send(host, { t: "settings", settings: { games: ["uno"] } });
    await bench.send(host, { t: "start" });
    await bench.send(host, { t: "launch" });
    await room.adminClose();
    expect(table.adminClose).toHaveBeenCalledTimes(1);
  });

  it("un hôte ordinaire ne met pas au programme un jeu encore en bêta ; l'administrateur du site, si", async () => {
    const open = BETA_GAMES.filter((g) => g !== "minigolf");
    const { bench, host, view } = await tour({ open });
    await bench.send(host, { t: "settings", settings: { games: ["uno", "minigolf"] } });
    expect(view().settings.games).toEqual(["uno"]);
    const admin = await tour({ open });
    const boss = (await admin.bench.arrive(user("chef", true))).ws;
    // L'administrateur prend la main de cette tournée (l'hôte s'en va), puis coche le minigolf
    await admin.bench.send(admin.host, { t: "leave" });
    expect(admin.view(boss).you.isHost).toBe(true);
    await admin.bench.send(boss, { t: "settings", settings: { games: ["uno", "minigolf"] } });
    expect(admin.view(boss).settings.games).toEqual(["uno", "minigolf"]);
  });
});
