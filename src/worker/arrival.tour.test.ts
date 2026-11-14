import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { CLOSED_TOUR } from "../shared/lateJoin.ts";
import type { TourView } from "../shared/tour.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";
import { TourRoom } from "./tourRoom.ts";

installWorkerGlobals();

/** Une tournée : l'hôte et un bot, lancée (premier tirage) si on le demande */
async function tour({
  friends = [],
  quick = false,
  started = true,
}: { friends?: [string, string][]; quick?: boolean; started?: boolean } = {}) {
  const state = new FakeState();
  const room = new TourRoom(state as never, fakeEnv(friends) as never);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  await bench.send(host, { t: "addBot" });
  if (started) {
    await bench.send(host, { t: "start" });
    expect(host.view<TourView>().status).toBe("intermission");
  }
  return { bench, host, room };
}

const roleOf = (v: TourView, id: string) => v.members.find((m) => m.userId === id)?.role ?? null;
const players = (v: TourView) => v.members.filter((m) => m.role === "player" && !m.left).map((m) => m.name);

describe("tournée : « Regarder » ne fait jamais jouer", () => {
  it("le bouton « Regarder » à côté d'un ami en tournée : on la suit en spectateur, le bot garde sa place", async () => {
    const { bench } = await tour({ friends: [["hote", "ami"]] });
    const { ws } = await bench.arrive(user("ami"), "?regarder");
    expect(ws.view<TourView>().you.role).toBe("spectator");
    expect(players(ws.view())).toEqual(["Hote", "Gaston"]);
    expect(ws.view<TourView>().voters).not.toContain("ami");
    // Il revient plus tard sans rien dire : toujours spectateur
    await bench.drop(ws);
    const again = await bench.arrive(user("ami"));
    expect(again.ws.view<TourView>().you.role).toBe("spectator");
  });

  it("au salon aussi, « Regarder » laisse la place ; un lien fait jouer, comme avant", async () => {
    const { bench } = await tour({ started: false });
    const watcher = await bench.arrive(user("curieux"), "?regarder");
    expect(roleOf(watcher.ws.view(), "curieux")).toBe("spectator");
    const player = await bench.arrive(user("ami"));
    expect(roleOf(player.ws.view(), "ami")).toBe("player");
  });
});

describe("tournée : rejoindre en cours de route", () => {
  it("fermée par défaut : un inconnu reste à la porte, un ami la suit sans pouvoir y entrer", async () => {
    const { bench, host, room } = await tour({ friends: [["hote", "ami"]] });
    expect(host.view<TourView>().settings.lateJoin).toBe(false);
    const stranger = await bench.arrive(user("inconnu"), "?jouer");
    expect(stranger.refused?.inbox).toEqual([{ t: "closed", reason: CLOSED_TOUR }]);
    expect(await room.refusal(user("inconnu"))).toBe(CLOSED_TOUR);
    const friend = await bench.arrive(user("ami"), "?jouer");
    expect(friend.refused).toBeNull();
    expect(friend.ws.view<TourView>().you.role).toBe("spectator");
    await bench.send(friend.ws, { t: "sit" });
    expect(friend.ws.view<TourView>().you.role).toBe("spectator");
    expect(friend.ws.errors().at(-1)).toMatch(/n'accepte plus de joueurs en cours de route/);
  });

  it("un joueur parti revient toujours à sa place, même porte fermée", async () => {
    const { bench, host } = await tour();
    await bench.send(host, { t: "leave" });
    const back = await bench.arrive(user("hote"));
    expect(back.refused).toBeNull();
    expect(back.ws.view<TourView>().you.role).toBe("player");
    expect(players(back.ws.view())).toContain("Hote");
  });

  it("ouverte : qui arrive choisit ; spectateur d'abord, il entre s'il le demande (ici ou par « Rejoindre »)", async () => {
    const { bench, host } = await tour();
    await bench.send(host, { t: "settings", settings: {}, lateJoin: true });
    expect(host.view<TourView>().settings.lateJoin).toBe(true);
    const link = await bench.arrive(user("passant"));
    expect(link.ws.view<TourView>().you.role).toBe("spectator");
    await bench.send(link.ws, { t: "sit" });
    expect(link.ws.view<TourView>().you.role).toBe("player");
    const join = await bench.arrive(user("joueur"), "?jouer");
    expect(join.ws.view<TourView>().you.role).toBe("player");
  });

  it("une partie rapide reste ouverte : la partie rapide y entre comme joueur, à la place d'un bot si c'est plein", async () => {
    const { bench, host } = await tour({ quick: true, started: false });
    expect(host.view<TourView>().settings.lateJoin).toBe(true);
    await bench.send(host, { t: "settings", settings: {}, maxPlayers: 2 });
    await bench.send(host, { t: "start" });
    const join = await bench.arrive(user("joueur"), "?jouer");
    expect(join.ws.view<TourView>().you.role).toBe("player");
    expect(players(join.ws.view())).toEqual(["Hote", "Joueur"]);
  });

  it("l'hôte ferme la porte à l'entracte, le chat l'annonce", async () => {
    const { bench, host } = await tour({ quick: true });
    await bench.send(host, { t: "settings", settings: {}, lateJoin: false });
    expect(host.errors()).toEqual([]);
    expect(host.view<TourView>().settings.lateJoin).toBe(false);
    const stranger = await bench.arrive(user("inconnu"));
    expect(stranger.refused).not.toBeNull();
  });
});
