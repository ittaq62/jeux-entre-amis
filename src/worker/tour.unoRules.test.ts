// UNO en tournée : « pas de UNO d'avance » n'est plus un réglage de l'hôte. Au hasard, le serveur le tire avec la
// variante ; votées, les joueurs le votent oui ou non à côté des variantes ; de base, la règle habituelle.
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { findVariant, tourUnoSettings, type TourInit, type TourRulesMode, type TourView } from "../shared/tour.ts";
import { Bench, FakeState, fakeEnv, installWorkerGlobals, user, type FakeSocket } from "./roomHarness.ts";
import { TourRoom } from "./tourRoom.ts";

installWorkerGlobals();

/** Une tournée de UNO seulement : l'hôte, les joueurs demandés, un bot ; lancée jusqu'au premier tirage */
async function unoTour(rules: TourRulesMode, others: string[] = [], extra: Record<string, unknown> = {}) {
  const state = new FakeState();
  // Les tables créées par la tournée : on garde ce qu'elle leur confie
  const inits: { tour: TourInit }[] = [];
  const env = {
    // Un ami de l'hôte peut suivre la tournée en spectateur
    ...fakeEnv([["hote", "curieux"]]),
    ROOMS: {
      idFromName: (code: string) => code,
      get: () => ({
        init: async (o: { tour: TourInit }) => {
          inits.push(o);
          return true;
        },
      }),
    },
  };
  const room = new TourRoom(state as never, env as never);
  await state.ready;
  await room.init({ code: "ABCD", host: user("hote"), visibility: "private", quick: false });
  const bench = new Bench(room, state);
  const host = (await bench.arrive(user("hote"))).ws;
  const players: Record<string, FakeSocket> = {};
  for (const id of others) players[id] = (await bench.arrive(user(id))).ws;
  await bench.send(host, { t: "addBot" });
  await bench.send(host, { t: "settings", settings: { games: ["uno"], rules, ...extra } });
  await bench.send(host, { t: "start" });
  expect(host.view<TourView>().status).toBe("intermission");
  return { bench, host, players, inits, state, env, room };
}

const chat = (ws: FakeSocket) =>
  ws.inbox.filter((m) => m.t === "chat").flatMap((m) => (m.messages as { text: string }[]).map((x) => x.text));

const next = (ws: FakeSocket) => ws.view<TourView>().next!;

describe("UNO en tournée : « pas de UNO d'avance » au hasard", () => {
  it("le serveur le tire avec la variante, une fois oui, une fois non, et la table de UNO le reçoit", async () => {
    const seen = new Set<boolean>();
    for (let k = 0; k < 24; k++) {
      const { bench, host, inits } = await unoTour("random");
      const variant = next(host).variant!;
      expect(findVariant("uno", variant)).not.toBeNull();
      // Tout le monde lit le tirage avant la partie : il est dans la vue de la tournée
      const on = variant.endsWith("+sans-avance");
      seen.add(on);
      await bench.send(host, { t: "launch" });
      expect(inits).toHaveLength(1);
      expect(inits[0]!.tour.variant).toBe(variant);
      expect(inits[0]!.tour).not.toHaveProperty("noEarlyUno");
      expect(tourUnoSettings(inits[0]!.tour).noEarlyUno).toBe(on);
      // Rappelé dans le chat de la tournée au lancement
      const launched = chat(host).find((t) => t.startsWith("Jeu 1 : UNO, règles « "))!;
      expect(launched.includes("pas de UNO d'avance")).toBe(on);
      expect(host.view<TourView>().games[0]!.variant).toBe(variant);
    }
    expect([...seen].sort()).toEqual([false, true]);
  });
});

describe("UNO en tournée : l'ancien réglage de l'hôte", () => {
  it("n'apparaît plus dans les réglages, et un vieil écran qui l'envoie n'y change rien", async () => {
    const { bench, host, inits } = await unoTour("base", [], { noEarlyUno: true });
    expect(host.view<TourView>().settings).not.toHaveProperty("noEarlyUno");
    expect(host.errors()).toEqual([]);
    // De base : la règle habituelle, le UNO d'avance permis
    expect(next(host).variant).toBe("classique");
    await bench.send(host, { t: "launch" });
    expect(inits[0]!.tour.variant).toBe("classique");
    expect(tourUnoSettings(inits[0]!.tour).noEarlyUno).toBe(false);
    expect(inits[0]!.tour).not.toHaveProperty("noEarlyUno");
  });

  it("une tournée ouverte avant garde son vote ouvert après un réveil, et l'ancien choix de l'hôte est oublié", async () => {
    const { state, env } = await unoTour("vote", ["ami"]);
    // Comme une tournée gardée par l'ancienne version : le réglage de l'hôte, un vote sans règles à part
    const stored = state.stored.get("tour") as { settings: Record<string, unknown>; next: Record<string, unknown> };
    stored.settings.noEarlyUno = true;
    delete stored.next.base;
    delete stored.next.extras;
    stored.next.votes = { ami: "pioche" };
    const again = new TourRoom(state as never, env as never);
    await state.ready;
    const d = new Bench(again, state).data<{ settings: Record<string, unknown>; next: Record<string, unknown> }>();
    expect(d.settings).not.toHaveProperty("noEarlyUno");
    // Le vote reste ouvert (il était clos en douce à chaque réveil), et « pas de UNO d'avance » s'y ajoute
    expect(d.next.variant).toBeNull();
    expect(d.next.votes).toEqual({ ami: "pioche" });
    expect(d.next.base).toBeNull();
    expect(d.next.extras).toEqual({ "sans-avance": { votes: {}, value: null } });
  });
});

describe("UNO en tournée : « pas de UNO d'avance » voté", () => {
  it("se vote oui ou non dans le même écran que les variantes, la moitié des voix suffit", async () => {
    const { bench, host, players, inits } = await unoTour("vote", ["ami"]);
    const ami = players.ami!;
    expect(next(host)).toMatchObject({ variant: null, base: null, extras: { "sans-avance": { votes: {}, value: null } } });
    // Deux joueurs (le bot ne vote pas) : une voix suffit
    expect(host.view<TourView>().voters.sort()).toEqual(["ami", "hote"]);
    await bench.send(host, { t: "vote", variant: "no-mercy" });
    // La variante est adoptée, la règle à part reste au vote : les règles ne sont pas encore connues
    expect(next(host)).toMatchObject({ base: "no-mercy", variant: null });
    expect(chat(host)).toContain("Règles adoptées : No Mercy !");
    // Une fois la variante adoptée, on ne revote plus pour elle
    await bench.send(ami, { t: "vote", variant: "pioche" });
    expect(next(host).base).toBe("no-mercy");
    await bench.send(ami, { t: "voteRule", rule: "sans-avance", on: true });
    expect(next(host).variant).toBe("no-mercy+sans-avance");
    expect(next(host).extras!["sans-avance"]).toEqual({ votes: { ami: true }, value: true });
    expect(chat(host)).toContain("Règle adoptée : pas de UNO d'avance !");
    await bench.send(host, { t: "launch" });
    expect(inits[0]!.tour.variant).toBe("no-mercy+sans-avance");
    expect(tourUnoSettings(inits[0]!.tour)).toEqual({ variant: "nomercy", noEarlyUno: true });
  });

  it("le non l'emporte aussi : la règle habituelle", async () => {
    const { bench, host, players, inits } = await unoTour("vote", ["ami"]);
    await bench.send(players.ami!, { t: "voteRule", rule: "sans-avance", on: false });
    expect(next(host).extras!["sans-avance"]!.value).toBe(false);
    expect(chat(host)).toContain("Règle adoptée : UNO d'avance permis !");
    await bench.send(host, { t: "vote", variant: "sept-zero" });
    expect(next(host).variant).toBe("sept-zero");
    await bench.send(host, { t: "launch" });
    expect(tourUnoSettings(inits[0]!.tour).noEarlyUno).toBe(false);
  });

  it("à égalité, la règle habituelle ; la voix d'un absent ne compte pas ; ni les bots ni les spectateurs ne votent", async () => {
    const { bench, host, players, inits } = await unoTour("vote", ["ami", "berthe", "zoe"]);
    // Quatre joueurs : deux voix pour adopter
    await bench.send(players.zoe!, { t: "voteRule", rule: "sans-avance", on: true });
    // Zoé s'en va (écran éteint) : sa voix ne compte plus, ni dans le total ni dans ce qu'il faut
    await bench.drop(players.zoe!);
    expect(host.view<TourView>().voters).not.toContain("zoe");
    expect(next(host).extras!["sans-avance"]!.votes).toEqual({});
    await bench.send(host, { t: "voteRule", rule: "sans-avance", on: true });
    // Trois présents, deux voix pour adopter : le oui de l'hôte seul ne suffit pas
    expect(next(host).extras!["sans-avance"]!.value).toBeNull();
    await bench.send(players.ami!, { t: "voteRule", rule: "sans-avance", on: false });
    expect(next(host).extras!["sans-avance"]!.value).toBeNull();
    // Un spectateur ne vote pas
    const watcher = (await bench.arrive(user("curieux"), "?regarder")).ws;
    expect(watcher.view<TourView>().you.role).toBe("spectator");
    await bench.send(watcher, { t: "voteRule", rule: "sans-avance", on: true });
    expect(next(host).extras!["sans-avance"]!.votes).toEqual({ hote: true, ami: false });
    // Une règle à part inconnue, ou une réponse qui n'est pas oui ou non, est ignorée
    await bench.send(players.berthe!, { t: "voteRule", rule: "colles", on: true });
    await bench.send(players.berthe!, { t: "voteRule", rule: "sans-avance", on: "oui" });
    expect(next(host).extras!["sans-avance"]!.votes).toEqual({ hote: true, ami: false });
    // Départ sur un oui contre un non : la règle habituelle (et les variantes de base, personne n'en a voté)
    await bench.send(host, { t: "launch" });
    expect(inits[0]!.tour.variant).toBe("classique");
    expect(chat(host).some((t) => t.startsWith("Jeu 1 : UNO, règles « Classique »"))).toBe(true);
  });

  it("au départ, le oui l'emporte s'il a plus de voix que le non, même sans la moitié", async () => {
    const { bench, host, players, inits } = await unoTour("vote", ["ami", "berthe", "zoe"]);
    await bench.send(host, { t: "voteRule", rule: "sans-avance", on: true });
    expect(next(host).extras!["sans-avance"]!.value).toBeNull();
    await bench.send(players.ami!, { t: "vote", variant: "pioche" });
    await bench.send(host, { t: "launch" });
    expect(inits[0]!.tour.variant).toBe("pioche+sans-avance");
  });

  it("l'hôte peut l'imposer, oui ou non, comme il impose une variante", async () => {
    const { bench, host, players, inits } = await unoTour("vote", ["ami", "berthe"]);
    // Un joueur qui n'est pas l'hôte ne l'impose pas
    await bench.send(players.ami!, { t: "pickRule", rule: "sans-avance", on: false });
    expect(next(host).extras!["sans-avance"]!.value).toBeNull();
    await bench.send(host, { t: "pickRule", rule: "sans-avance", on: true });
    expect(next(host).extras!["sans-avance"]!.value).toBe(true);
    expect(chat(host)).toContain("L'hôte décide : pas de UNO d'avance.");
    // Décidé : on ne vote plus
    await bench.send(players.ami!, { t: "voteRule", rule: "sans-avance", on: false });
    await bench.send(players.berthe!, { t: "voteRule", rule: "sans-avance", on: false });
    expect(next(host).extras!["sans-avance"]!.value).toBe(true);
    await bench.send(host, { t: "pickVariant", variant: "pioche" });
    expect(next(host).variant).toBe("pioche+sans-avance");
    await bench.send(host, { t: "launch" });
    expect(inits[0]!.tour.variant).toBe("pioche+sans-avance");
  });
});
