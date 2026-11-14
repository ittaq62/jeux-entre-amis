import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { CLOSED_TABLE } from "../shared/lateJoin.ts";
import type { RoomView } from "../shared/protocol.ts";
import { GameRoom } from "./room.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user } from "./roomHarness.ts";

installWorkerGlobals();

/** Une table de UNO : l'hôte et un bot */
async function table(friends: [string, string][] = []) {
  const state = new FakeState();
  const room = new GameRoom(state as never, fakeEnv(friends) as never);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  await bench.send(host, { t: "addBot" });
  return { bench, host, room };
}

const seated = (v: RoomView) => v.you.seatId !== null;
const names = (v: RoomView) => v.seats.map((s) => s.name);

describe("UNO : « Regarder » ne fait jamais asseoir", () => {
  it("au salon, on regarde et la place reste libre", async () => {
    const { bench } = await table();
    const { ws } = await bench.arrive(user("ami"), "?regarder");
    expect(seated(ws.view())).toBe(false);
    expect(names(ws.view())).toEqual(["Hote", "Gaston"]);
  });

  it("pendant la partie puis à la fin, même en revenant, et le bot garde sa place", async () => {
    const { bench, host } = await table([["hote", "ami"]]);
    await bench.send(host, { t: "settings", settings: {}, maxPlayers: 2 });
    await bench.send(host, { t: "start" });
    const first = await bench.arrive(user("ami"), "?regarder");
    expect(seated(first.ws.view())).toBe(false);
    bench.data<{ status: string }>().status = "finished";
    await bench.drop(first.ws);
    // La page revient sans rien dire de plus (écran rallumé, réseau retrouvé)
    const again = await bench.arrive(user("ami"));
    expect(seated(again.ws.view())).toBe(false);
    expect(names(again.ws.view())).toEqual(["Hote", "Gaston"]);
  });

  it("le spectateur arrivé en pleine partie par un simple lien n'est pas assis d'office quand elle finit", async () => {
    const { bench, host } = await table([["hote", "ami"]]);
    await bench.send(host, { t: "settings", settings: {}, maxPlayers: 2 });
    await bench.send(host, { t: "start" });
    const first = await bench.arrive(user("ami"));
    expect(seated(first.ws.view())).toBe(false);
    bench.data<{ status: string }>().status = "finished";
    await bench.drop(first.ws);
    const again = await bench.arrive(user("ami"));
    expect(seated(again.ws.view())).toBe(false);
    // Il prend une place lui-même s'il le veut, entre deux parties
    await bench.send(again.ws, { t: "sit" });
    expect(seated(again.ws.view())).toBe(true);
  });

  it("un lien (une invitation) au salon assoit, comme avant", async () => {
    const { bench } = await table();
    const { ws } = await bench.arrive(user("ami"));
    expect(seated(ws.view())).toBe(true);
  });
});

describe("UNO : rejoindre en cours de route", () => {
  it("par défaut fermé : un inconnu reste à la porte, un ami regarde, le joueur retrouve sa place", async () => {
    const { bench, host, room } = await table([["hote", "ami"]]);
    expect(host.view<RoomView>().settings.lateJoin).toBe(false);
    await bench.send(host, { t: "start" });
    const stranger = await bench.arrive(user("inconnu"), "?regarder");
    expect(stranger.refused?.inbox).toEqual([{ t: "closed", reason: CLOSED_TABLE }]);
    expect(stranger.refused?.closedWith).toBe(4004);
    expect(await room.refusal(user("inconnu"))).toBe(CLOSED_TABLE);
    // Rien de la partie ne lui parvient
    expect(stranger.ws.inbox).toEqual([]);
    const friend = await bench.arrive(user("ami"));
    expect(friend.refused).toBeNull();
    expect(seated(friend.ws.view())).toBe(false);
    expect(await room.refusal(user("ami"))).toBeNull();
    await bench.drop(host);
    const back = await bench.arrive(user("hote"));
    expect(back.ws.view<RoomView>().you.seatId).toBe("hote");
  });

  it("l'administrateur du site peut regarder une table fermée", async () => {
    const { bench, host } = await table();
    await bench.send(host, { t: "start" });
    const admin = await bench.arrive(user("admin", true), "?regarder");
    expect(admin.refused).toBeNull();
    expect(seated(admin.ws.view())).toBe(false);
  });

  it("qui était là avant le départ continue de regarder", async () => {
    const { bench, host } = await table();
    const early = await bench.arrive(user("passant"), "?regarder");
    await bench.send(host, { t: "start" });
    await bench.drop(early.ws);
    const again = await bench.arrive(user("passant"));
    expect(again.refused).toBeNull();
    expect(seated(again.ws.view())).toBe(false);
  });

  it("ouvert : un inconnu regarde, mais une partie de UNO lancée ne se rejoint pas", async () => {
    const { bench, host } = await table();
    await bench.send(host, { t: "settings", settings: {}, lateJoin: true });
    expect(host.view<RoomView>().settings.lateJoin).toBe(true);
    await bench.send(host, { t: "start" });
    const stranger = await bench.arrive(user("inconnu"), "?jouer");
    expect(stranger.refused).toBeNull();
    expect(seated(stranger.ws.view())).toBe(false);
    await bench.send(stranger.ws, { t: "sit" });
    expect(seated(stranger.ws.view())).toBe(false);
  });

  it("l'hôte ouvre ou ferme la porte en pleine partie, le chat l'annonce", async () => {
    const { bench, host } = await table();
    await bench.send(host, { t: "start" });
    await bench.send(host, { t: "settings", settings: {}, lateJoin: true });
    expect(host.view<RoomView>().settings.lateJoin).toBe(true);
    expect(host.errors()).toEqual([]);
    const chat = host.inbox.filter((m) => m.t === "chat").flatMap((m) => (m.messages as { text: string }[]).map((x) => x.text));
    expect(chat.at(-1)).toMatch(/s'ouvre en cours de route/);
    const stranger = await bench.arrive(user("inconnu"));
    expect(stranger.refused).toBeNull();
  });
});
