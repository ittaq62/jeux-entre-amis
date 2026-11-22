// Capitale aux règles tirées au sort : le Builder et le plateau classique sortent tous les deux, et le format tiré est
// celui qui se joue. En tournée, de la tournée qui tire jusqu'à la partie de la table qu'elle ouvre ; à une table
// « règles au hasard », du tirage du salon jusqu'à la partie, quel que soit le format que l'hôte avait choisi.
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

vi.mock("./tourLink.ts", async (actual) => {
  const real = await actual<typeof import("./tourLink.ts")>();
  return { ...real, reportToTour: vi.fn(async () => {}), abortToTour: vi.fn(async () => {}), tourChat: vi.fn(async () => {}) };
});

import { DEFAULT_SETTINGS, type CapitaleSettings, type CapitaleState } from "../shared/games/capitale/engine.ts";
import type { LobbyRoom, PublicUser } from "../shared/protocol.ts";
import { applyDrawnRules } from "../shared/randomRules.ts";
import { findVariant, type TourInit, type TourView } from "../shared/tour.ts";
import { CapitaleRoom } from "./capitaleRoom.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type FakeSocket } from "./roomHarness.ts";
import { TourRoom } from "./tourRoom.ts";

installWorkerGlobals();

type Init = { code: string; host: PublicUser; visibility: "private" | "public"; quick: boolean; tour: TourInit };
type CapitaleLobby = LobbyRoom & { settings: LobbyRoom["settings"] & { capitale: CapitaleSettings } };

const chat = (ws: FakeSocket) =>
  ws.inbox.filter((m) => m.t === "chat").flatMap((m) => (m.messages as { text: string }[]).map((x) => x.text));

const isBuilder = (variant: string) => variant.split("+")[0] === "builder";

/** Une tournée de Capitale seulement, aux règles au hasard : l'hôte et un bot, jusqu'au départ du premier jeu */
async function capitaleTour() {
  const state = new FakeState();
  const inits: Init[] = [];
  const env = {
    ...fakeEnv(),
    CAPITALE: {
      idFromName: (code: string) => code,
      get: () => ({
        init: async (o: Init) => {
          inits.push(o);
          return true;
        },
      }),
    },
  };
  const room = new TourRoom(state as never, env as never);
  await state.ready;
  await room.init({ code: "TOUR", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  await bench.send(host, { t: "addBot" });
  await bench.send(host, { t: "settings", settings: { games: ["capitale"], rules: "random" } });
  await bench.send(host, { t: "start" });
  expect(host.view<TourView>().status).toBe("intermission");
  return { bench, host, inits };
}

/** La table de Capitale que la tournée a ouverte, avec ce qu'elle lui a confié ; l'hôte arrive et se dit prêt */
async function tourTable(init: Init) {
  const state = new FakeState();
  const room = new CapitaleRoom(state as never, fakeEnv() as never);
  await state.ready;
  await room.init(init);
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  const lobby = host.view<CapitaleLobby>();
  await bench.send(host, { t: "ready" });
  return { bench, host, lobby };
}

describe("Capitale en tournée, règles au hasard", () => {
  it("le Builder et le plateau classique sortent tous les deux, et la table joue le format tiré", async () => {
    const seen = { builder: 0, classique: 0 };
    for (let k = 0; k < 24; k++) {
      const { bench, host, inits } = await capitaleTour();
      // Le tirage se lit avant la partie, dans la vue de la tournée
      const variant = host.view<TourView>().next!.variant!;
      expect(findVariant("capitale", variant), variant).not.toBeNull();
      const builder = isBuilder(variant);
      seen[builder ? "builder" : "classique"]++;
      await bench.send(host, { t: "launch" });
      expect(inits).toHaveLength(1);
      expect(inits[0]!.tour.variant).toBe(variant);
      // L'annonce du jeu dans la discussion de la tournée dit le format
      const launched = chat(host).find((t) => t.startsWith("Jeu 1 : Capitale, règles « "))!;
      expect(launched.startsWith(`Jeu 1 : Capitale, règles « ${builder ? "Builder" : "Classique"}`), launched).toBe(true);
      // La table ouverte par la tournée : son salon, puis la partie, dans ce format
      const table = await tourTable(inits[0]!);
      expect(table.lobby.settings.capitale.builder === true).toBe(builder);
      expect(table.host.view<LobbyRoom>().status).toBe("playing");
      expect(table.bench.data<{ capitale: CapitaleState }>().capitale.settings.builder === true).toBe(builder);
      expect(table.host.view<{ capitale: CapitaleState }>().capitale.settings.builder === true).toBe(builder);
    }
    expect(seen.builder).toBeGreaterThan(0);
    expect(seen.classique).toBeGreaterThan(0);
  }, 30_000);
});

describe("Capitale à une table, règles au hasard", () => {
  /** Une table hors tournée, l'hôte et un bot, avec le format que l'hôte a choisi au salon */
  async function table(builder: boolean) {
    const state = new FakeState();
    const room = new CapitaleRoom(state as never, fakeEnv() as never);
    await state.ready;
    await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
    const bench = new Bench(room, state);
    const host = (await bench.arrive(user("hote"))).ws;
    await bench.send(host, { t: "addBot" });
    await bench.send(host, { t: "settings", settings: { builder } });
    return { bench, host };
  }

  it("le tirage du salon tombe sur l'un ou l'autre format, et la partie se joue dans celui tiré, pas dans celui de l'hôte", async () => {
    for (const wanted of [true, false]) {
      // L'hôte avait choisi l'autre format
      const { bench, host } = await table(!wanted);
      let draw = "";
      for (let k = 0; k < 60 && (!draw || isBuilder(draw) !== wanted); k++) {
        await bench.send(host, { t: "settings", settings: {}, randomRules: true });
        draw = host.view<LobbyRoom>().settings.randomRules!;
      }
      expect(isBuilder(draw), draw).toBe(wanted);
      // Le salon montre le format tiré : il le lit comme la page, réglages de l'hôte puis tirage par-dessus
      const shown = host.view<CapitaleLobby>().settings;
      expect(applyDrawnRules("capitale", shown.capitale, DEFAULT_SETTINGS, shown.randomRules).builder === true).toBe(wanted);
      await bench.send(host, { t: "start" });
      expect(host.view<LobbyRoom>().status).toBe("playing");
      expect(bench.data<{ capitale: CapitaleState }>().capitale.settings.builder === true).toBe(wanted);
    }
  });
});
