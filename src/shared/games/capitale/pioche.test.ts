import { describe, expect, it } from "vitest";
import { cardTone, DECKS, isDisaster, SQUARES, type DeckId, type DisasterKind } from "./board.ts";
import {
  applyAction,
  createGame,
  DEFAULT_SETTINGS,
  drawCard,
  netWorth,
  type CapitaleEvent,
  type CapitaleSettings,
  type CapitaleState,
} from "./engine.ts";

// La pioche (mélangée, épuisée avant d'être remélangée), les nouvelles cartes et les catastrophes.

const IDS = ["a", "b", "c", "d"];
function game(n = 3, settings: Partial<CapitaleSettings> = {}, seed = 1, teams: Record<string, number> | null = null): CapitaleState {
  const { state } = createGame(IDS.slice(0, n), { ...DEFAULT_SETTINGS, end: "bankrupt", ...settings }, seed, teams);
  state.turn = 0;
  return state;
}
const P = (s: CapitaleState, id: string) => s.players.find((p) => p.id === id)!;
const own = (s: CapitaleState, id: string, ...squares: number[]) => squares.forEach((i) => (s.deeds[i]!.owner = id));
const lvl = (s: CapitaleState, square: number, level: number) => (s.deeds[square]!.level = level);
const find = (deck: DeckId, test: (text: string) => boolean) => DECKS[deck].findIndex((c) => test(c.text));
const disasterCard = (kind: DisasterKind) => {
  for (const deck of ["hasard", "courrier"] as const) {
    const i = DECKS[deck].findIndex((c) => c.effect.kind === "disaster" && c.effect.disaster === kind);
    if (i >= 0) return { deck, card: i };
  }
  throw new Error(kind);
};
/** Tirer une carte précise (posée sur le paquet) pour ce joueur */
function draw(s: CapitaleState, id: string, deck: DeckId, card: number): CapitaleEvent[] {
  s.decks[deck] = [card, ...s.decks[deck].filter((i) => i !== card)];
  const events: CapitaleEvent[] = [];
  drawCard(s, P(s, id), deck, events, 0);
  return events;
}
const drawDisaster = (s: CapitaleState, id: string, kind: DisasterKind) => {
  const { deck, card } = disasterCard(kind);
  return draw(s, id, deck, card);
};
const disasterOf = (events: CapitaleEvent[]) => events.find((e) => e.type === "disaster") as Extract<CapitaleEvent, { type: "disaster" }>;

describe("la pioche", () => {
  it("chaque carte sort une fois avant qu'on remélange, et jamais deux fois de suite", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = game(2, {}, seed);
      const a = P(s, "a");
      for (const deck of ["hasard", "courrier"] as const) {
        const size = s.decks[deck].length;
        expect(size).toBe(DECKS[deck].length);
        const drawn: number[] = [];
        let reshuffles = 0;
        for (let k = 0; k < size * 3; k++) {
          const events: CapitaleEvent[] = [];
          drawCard(s, a, deck, events, 9);
          reshuffles += events.filter((e) => e.type === "reshuffle").length;
          drawn.push(s.lastCard!.card);
          // La carte de prison gardée revient tout de suite : le paquet reste entier
          if (a.jailCards.length > 0) {
            a.jailCards = [];
            s.discards![deck].push(DECKS[deck].findIndex((c) => c.effect.kind === "jailFree"));
          }
          Object.assign(a, { inJail: false, position: 0 });
        }
        // Le premier tour du paquet : toutes les cartes, une fois chacune
        expect(new Set(drawn.slice(0, size)).size).toBe(size);
        expect(reshuffles).toBeGreaterThanOrEqual(2);
        for (let k = 1; k < drawn.length; k++) expect(drawn[k]).not.toBe(drawn[k - 1]);
      }
    }
  });

  it("le paquet change de partie en partie : 30 graines, 30 premières cartes différentes au moins une fois sur deux", () => {
    const tops = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) tops.add(game(2, {}, seed).decks.hasard[0]!);
    expect(tops.size).toBeGreaterThanOrEqual(15);
  });

  it("sans la règle des catastrophes, elles ne sont pas dans les paquets", () => {
    const s = game(2, { disasters: false });
    for (const deck of ["hasard", "courrier"] as const) {
      expect(s.decks[deck].some((i) => isDisaster(DECKS[deck][i]!))).toBe(false);
      expect(s.decks[deck].length).toBe(DECKS[deck].filter((c) => !isDisaster(c)).length);
    }
    expect(game(2).decks.hasard.length).toBe(38);
  });

  it("une partie d'avant la vraie pioche garde son paquet de 16 cartes, qui tourne comme avant", () => {
    const s = game(2);
    delete s.discards;
    s.decks.hasard = [3, 1, 4, 0, 2, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
    const order: number[] = [];
    for (let k = 0; k < 30; k++) {
      drawCard(s, P(s, "a"), "hasard", [], 9);
      order.push(s.lastCard!.card);
      Object.assign(P(s, "a"), { inJail: false, position: 0 });
    }
    expect(order.slice(15)).toEqual(order.slice(0, 15));
    expect(Math.max(...order)).toBeLessThan(16);
    // La carte de prison rendue repart sous le paquet
    P(s, "a").jailCards = ["hasard"];
    Object.assign(P(s, "a"), { inJail: true, position: 10 });
    expect(applyAction(s, "a", { type: "useJailCard" }).ok).toBe(true);
    expect(s.decks.hasard.at(-1)).toBe(8);
  });

  it("les cartes s'équilibrent : autant de coups durs que de coups de chance, et un gain moyen modeste", () => {
    const all = [...DECKS.hasard, ...DECKS.courrier];
    const tones = all.map((c) => cardTone(c.effect));
    const bad = tones.filter((t) => t === "malchance" || t === "catastrophe").length;
    const good = tones.filter((t) => t === "chance").length;
    expect(bad).toBeGreaterThanOrEqual(28);
    expect(Math.abs(bad - good)).toBeLessThanOrEqual(6);
    // L'argent des cartes « money » : un gain moyen entre 0 et 25 par carte
    const money = all.flatMap((c) => (c.effect.kind === "money" ? [c.effect.amount] : []));
    const mean = money.reduce((n, x) => n + x, 0) / all.length;
    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(25);
  });
});

describe("les nouvelles cartes", () => {
  it("une carte qui parle de niveaux a son texte pour le Builder, qui n'en a pas", () => {
    for (const card of [...DECKS.hasard, ...DECKS.courrier]) {
      if (!/niveau/.test(card.text)) continue;
      expect(card.builder, card.text).toBeDefined();
      expect(card.builder).not.toMatch(/niveau/);
    }
  });

  it("taxe foncière : tant par titre ; prime à la rénovation : tant par niveau et par monument", () => {
    const s = game();
    own(s, "a", 1, 3, 5, 12);
    draw(
      s,
      "a",
      "hasard",
      find("hasard", (t) => t.startsWith("Taxe foncière")),
    );
    expect(P(s, "a").cash).toBe(1500 - 4 * 15);
    lvl(s, 1, 2);
    lvl(s, 3, 5);
    draw(
      s,
      "a",
      "courrier",
      find("courrier", (t) => t.startsWith("Prime à la rénovation")),
    );
    expect(P(s, "a").cash).toBe(1440 + 2 * 20 + 50);
  });

  it("solidarité : le plus riche donne 100 au plus pauvre, quel que soit celui qui tire", () => {
    const s = game(3);
    P(s, "b").cash = 3000;
    P(s, "c").cash = 200;
    draw(
      s,
      "a",
      "hasard",
      find("hasard", (t) => t.startsWith("Esprit de solidarité")),
    );
    expect(P(s, "b").cash).toBe(2900);
    expect(P(s, "c").cash).toBe(300);
    expect(P(s, "a").cash).toBe(1500);
  });

  it("journées du patrimoine : le loyer de sa ville la plus rentable, 300 au plus", () => {
    const s = game();
    own(s, "a", 11);
    lvl(s, 11, 1);
    const card = find("hasard", (t) => t.startsWith("Journées du patrimoine"));
    draw(s, "a", "hasard", card);
    expect(P(s, "a").cash).toBe(1550);
    lvl(s, 11, 4);
    draw(s, "a", "hasard", card);
    expect(P(s, "a").cash).toBe(1850);
  });
});

describe("les catastrophes", () => {
  it("séisme : sa ville la plus haute perd un niveau ; sans construction, rien", () => {
    const s = game();
    own(s, "a", 1, 3, 39);
    lvl(s, 1, 2);
    lvl(s, 39, 2);
    lvl(s, 3, 1);
    const e = disasterOf(drawDisaster(s, "a", "seisme"));
    expect(e.hits).toEqual([{ square: 39, owner: "a", level: 1 }]);
    expect(s.deeds[39]!.level).toBe(1);
    const t = game();
    own(t, "a", 1);
    expect(disasterOf(drawDisaster(t, "a", "seisme")).hits).toEqual([]);
  });

  it("incendie : une de ses villes construites, au hasard ; les bâtiments spéciaux tiennent bon", () => {
    const s = game();
    own(s, "a", 1, 3, 6);
    lvl(s, 3, 1);
    s.deeds[3]!.special = { kind: "parc", by: "a" };
    const e = disasterOf(drawDisaster(s, "a", "incendie"));
    expect(e.hits).toEqual([{ square: 3, owner: "a", level: 0 }]);
    expect(s.deeds[3]!.special).toEqual({ kind: "parc", by: "a" });
  });

  it("tempête : la ville la plus haute de chaque joueur en jeu, coéquipiers compris", () => {
    const s = game(4, {}, 1, { a: 0, b: 0, c: 1, d: 1 });
    own(s, "a", 1);
    own(s, "b", 6, 8);
    own(s, "c", 39);
    lvl(s, 1, 1);
    lvl(s, 6, 3);
    lvl(s, 8, 2);
    lvl(s, 39, 5);
    P(s, "d").bankrupt = true;
    const e = disasterOf(drawDisaster(s, "a", "tempete"));
    expect(e.hits.map((h) => [h.square, h.level])).toEqual([
      [1, 0],
      [6, 2],
      [39, 4],
    ]);
  });

  it("crue : toutes les villes construites d'un quartier, quel que soit le propriétaire", () => {
    const s = game();
    own(s, "a", 11);
    own(s, "b", 13, 14);
    lvl(s, 11, 2);
    lvl(s, 13, 1);
    const e = disasterOf(drawDisaster(s, "c", "crue"));
    expect(e.hits.map((h) => h.square).sort()).toEqual([11, 13]);
    expect([s.deeds[11]!.level, s.deeds[13]!.level, s.deeds[14]!.level]).toEqual([1, 0, 0]);
  });

  it("arrêté de péril : la ville adverse au plus gros loyer, jamais un monument ni un coéquipier", () => {
    const s = game(4, {}, 1, { a: 0, b: 0, c: 1, d: 1 });
    own(s, "b", 39);
    own(s, "c", 37, 34);
    own(s, "d", 27);
    lvl(s, 39, 4);
    lvl(s, 37, 5);
    lvl(s, 34, 2);
    lvl(s, 27, 3);
    // 39 est à un coéquipier, 37 est un monument : c'est Strasbourg (800) plutôt que Bordeaux (450)
    const e = disasterOf(drawDisaster(s, "a", "peril"));
    expect(e.hits).toEqual([{ square: 27, owner: "d", level: 2 }]);
    expect(s.deeds[37]!.level).toBe(5);
  });

  it("expropriation : la banque reprend son titre le moins cher sans construction et le paie ; hypothéqué, la moitié", () => {
    const s = game();
    own(s, "a", 1, 3, 39);
    lvl(s, 1, 1);
    s.deeds[3]!.mortgaged = true;
    const events = drawDisaster(s, "a", "expropriation");
    expect(disasterOf(events)).toMatchObject({ kind: "expropriation", title: 3 });
    expect(s.deeds[3]).toEqual({ owner: null, mortgaged: false, level: 0, special: null });
    expect(P(s, "a").cash).toBe(1530);
    drawDisaster(s, "a", "expropriation");
    expect(s.deeds[39]!.owner).toBeNull();
    expect(P(s, "a").cash).toBe(1930);
    // Plus rien qui ne soit construit : rien
    expect(disasterOf(drawDisaster(s, "a", "expropriation")).title).toBeUndefined();
    expect(s.deeds[1]!.owner).toBe("a");
  });

  it("cession forcée : le titre le moins cher passe à l'adversaire le plus pauvre, pas à un coéquipier", () => {
    const s = game(4, {}, 1, { a: 0, b: 0, c: 1, d: 1 });
    own(s, "a", 5, 39);
    P(s, "b").cash = 10;
    P(s, "c").cash = 300;
    // Une nuisance posée par c sur la gare n'a pas de sens ; sur Paris, oui : elle disparaît quand Paris lui revient
    const e = disasterOf(drawDisaster(s, "a", "cession"));
    expect(e).toMatchObject({ kind: "cession", title: 5, to: "c" });
    expect(s.deeds[5]!.owner).toBe("c");
    s.deeds[39]!.special = { kind: "decharge", by: "c" };
    drawDisaster(s, "a", "cession");
    expect(s.deeds[39]!.owner).toBe("c");
    expect(s.deeds[39]!.special).toBeNull();
  });

  it("au Monopole, la cession évite le titre qui ferait gagner l'adversaire", () => {
    const s = game(2, { monopoly: true });
    own(s, "b", 5, 15, 25);
    own(s, "a", 35, 1);
    // La gare manquerait à b pour les quatre gares : c'est Guéret qui part
    expect(disasterOf(drawDisaster(s, "a", "cession"))).toMatchObject({ title: 1, to: "b" });
    expect(s.step).not.toBe("over");
  });

  it("au Monopole, une cession qui fait gagner l'adversaire termine la partie", () => {
    const s = game(2, { monopoly: true });
    own(s, "b", 5, 15, 25);
    own(s, "a", 35);
    const { deck, card } = disasterCard("cession");
    s.decks[deck] = [card, ...s.decks[deck].filter((i) => i !== card)];
    P(s, "a").position = deck === "courrier" ? 14 : 4;
    s.rigged = [[1, 2]];
    expect(applyAction(s, "a", { type: "roll" }).ok).toBe(true);
    expect(s.step).toBe("over");
    expect(s.outcome).toMatchObject({ reason: "monopoly", monopoly: { player: "b", kind: "stations" } });
  });

  it("une catastrophe tirée en jouant passe par le paquet, et se lit dans les événements", () => {
    const s = game();
    own(s, "a", 39);
    lvl(s, 39, 2);
    const card = disasterCard("seisme");
    s.decks[card.deck] = [card.card, ...s.decks[card.deck].filter((i) => i !== card.card)];
    P(s, "a").position = 4;
    s.rigged = [[1, 2]];
    const r = applyAction(s, "a", { type: "roll" });
    expect(r.ok && r.events.some((e) => e.type === "disaster")).toBe(true);
    expect(s.deeds[39]!.level).toBe(1);
    expect(SQUARES[7]!.deck).toBe("hasard");
  });

  it("la fortune suit : un niveau perdu ne se rembourse pas", () => {
    const s = game();
    own(s, "a", 39);
    lvl(s, 39, 3);
    const before = netWorth(s, "a");
    drawDisaster(s, "a", "seisme");
    expect(netWorth(s, "a")).toBe(before - 200);
  });
});
