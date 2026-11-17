import { describe, expect, it } from "vitest";
import { DECKS, GROUPS, SQUARES, upgradeCost } from "./board.ts";
import {
  annexable,
  annexCost,
  areaOf,
  buildCost,
  BUILDS,
  cityRent,
  footprint,
  knockable,
  lotOf,
  placeProblem,
  rentScale,
  type BuildKind,
} from "./builder.ts";
import { baseSize, CELLS, cellIndex, LOTS, MAP, maxAnnex, rectCells, STREETS, TERRITORIES } from "./builderMap.ts";
import { botAction, botAnswer, botBid } from "./bot.ts";
import {
  actorOf,
  applyAction,
  auctionBidders,
  buyoutPrice,
  buyoutShield,
  canMortgage,
  canUpgrade,
  closeAuction,
  createGame,
  DEFAULT_SETTINGS,
  drawCard,
  liquidity,
  netWorth,
  rentFor,
  tradeProblem,
  type BotLevel,
  type CapitaleAction,
  type CapitaleEvent,
  type CapitaleSettings,
  type CapitaleState,
} from "./engine.ts";

// Capitale Builder : la carte, les bâtiments posés librement, leurs loyers, et ce que deviennent les règles de la
// Capitale classique (rachat, catastrophes, échanges, faillite) quand on bâtit sur la carte.

const IDS = ["a", "b", "c", "d"];
function game(n = 2, settings: Partial<CapitaleSettings> = {}, teams: Record<string, number> | null = null): CapitaleState {
  const { state } = createGame(IDS.slice(0, n), { ...DEFAULT_SETTINGS, end: "bankrupt", builder: true, ...settings }, 3, teams);
  state.turn = 0;
  return state;
}
const P = (s: CapitaleState, id: string) => s.players.find((p) => p.id === id)!;
const own = (s: CapitaleState, id: string, ...squares: number[]) => squares.forEach((i) => (s.deeds[i]!.owner = id));
function act(s: CapitaleState, id: string, action: CapitaleAction): CapitaleEvent[] {
  const r = applyAction(s, id, action);
  if (!r.ok) throw new Error(r.error);
  return r.events;
}
const build = (s: CapitaleState, id: string, square: number, kind: BuildKind, x: number, z: number, rot = 0) =>
  act(s, id, { type: "build", square, kind, x, z, rot });
const fail = (s: CapitaleState, id: string, action: CapitaleAction) => {
  const r = applyAction(s, id, action);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error;
};
const rent = (s: CapitaleState, i: number) => rentFor(s, i, { diceTotal: 7 });
const PARIS = 39;
const LYON = 37;
const GUERET = 1;

describe("la carte", () => {
  it("chaque ville a son territoire, à la taille de son prix, sans chevauchement", () => {
    const sizeOf = (price: number) =>
      price <= 60 ? 9 : price <= 120 ? 12 : price <= 160 ? 16 : price <= 220 ? 20 : price <= 280 ? 25 : price <= 350 ? 30 : 36;
    const cities = SQUARES.filter((s) => s.kind === "property");
    expect(Object.keys(TERRITORIES).map(Number).sort()).toEqual(cities.map((s) => s.index).sort());
    for (const sq of cities) expect(baseSize(sq.index), sq.name).toBe(sizeOf(sq.price!));
    expect(baseSize(1)).toBe(9);
    expect(baseSize(PARIS)).toBe(36);
    const seen = new Set<number>();
    for (const r of [...Object.values(TERRITORIES), ...LOTS]) {
      for (const c of rectCells(r)) {
        expect(c).toBeLessThan(MAP * MAP);
        expect(seen.has(c)).toBe(false);
        seen.add(c);
      }
    }
    for (const r of STREETS) for (const c of rectCells(r)) expect(CELLS[c]!.kind === "city").toBe(false);
  });

  it("toute ville touche du terrain vague, de quoi s'agrandir de moitié", () => {
    const s = game();
    for (const i of Object.keys(TERRITORIES).map(Number)) {
      own(s, "a", i);
      expect(annexable(s, i).length, SQUARES[i]!.name).toBeGreaterThan(0);
      // Le terrain vague qu'elle atteint de proche en proche suffit à grandir de moitié
      const reach = new Set<number>();
      const area = areaOf(s, i);
      const queue = [...area];
      while (queue.length > 0) {
        const c = queue.pop()!;
        for (const n of [c + 1, c - 1, c + MAP, c - MAP]) {
          if (n < 0 || n >= MAP * MAP || reach.has(n) || area.has(n) || CELLS[n]!.kind !== "vague") continue;
          if (Math.abs((n % MAP) - (c % MAP)) > 1) continue;
          reach.add(n);
          queue.push(n);
        }
      }
      expect(reach.size, SQUARES[i]!.name).toBeGreaterThanOrEqual(maxAnnex(i));
    }
  });
});

describe("les prix", () => {
  it("à l'échelle de la ville : Paris plus cher que Guéret, le parc et les nuisances à prix fixe", () => {
    expect(rentScale(PARIS)).toBeCloseTo(2000 / (5.5 * 36));
    expect(buildCost("maison", PARIS)).toBe(50);
    expect(buildCost("maison", GUERET)).toBe(25);
    expect(buildCost("immeuble", PARIS)).toBe(110);
    expect(buildCost("tour", PARIS)).toBe(265);
    expect(buildCost("monument", PARIS)).toBe(445);
    expect(buildCost("parc", PARIS)).toBe(100);
    expect(buildCost("parc", GUERET)).toBe(100);
    expect(buildCost("stade", PARIS)).toBe(200);
    expect(annexCost(PARIS)).toBe(100);
    expect(annexCost(GUERET)).toBe(30);
    for (const g of Object.values(GROUPS)) expect(annexCost(g.squares[0]!)).toBe(Math.max(30, upgradeCost(g.squares[0]!) / 2));
  });
});

describe("poser ses bâtiments", () => {
  it("la Capitale classique ne change pas : pas de réglage Builder, on améliore toujours d'un bouton", () => {
    expect(DEFAULT_SETTINGS.builder).toBe(false);
    const { state } = createGame(["a", "b"], { ...DEFAULT_SETTINGS }, 3);
    state.turn = 0;
    state.step = "manage";
    state.dice = [1, 2];
    own(state, "a", PARIS);
    expect(canUpgrade(state, "a", PARIS)).toBeNull();
    expect(applyAction(state, "a", { type: "build", square: PARIS, kind: "maison", x: 30, z: 30, rot: 0 }).ok).toBe(false);
  });

  it("une maison dans sa ville : payée, posée, et le loyer monte", () => {
    const s = game();
    own(s, "a", PARIS);
    expect(rent(s, PARIS)).toBe(50);
    const events = build(s, "a", PARIS, "maison", 30, 30);
    expect(events).toContainEqual({
      type: "build",
      player: "a",
      square: PARIS,
      building: { id: 1, kind: "maison", x: 30, z: 30, rot: 0 },
      price: 50,
    });
    expect(P(s, "a").cash).toBe(1450);
    expect(P(s, "a").stats.houses).toBe(1);
    expect(rent(s, PARIS)).toBe(Math.round(50 + 2 * rentScale(PARIS)));
    // On n'améliore plus d'un bouton
    expect(canUpgrade(s, "a", PARIS)).not.toBeNull();
  });

  it("dans ses frontières seulement, sans chevaucher, et pas chez les autres", () => {
    const s = game();
    own(s, "a", PARIS);
    own(s, "b", LYON);
    build(s, "a", PARIS, "immeuble", 30, 30);
    expect(fail(s, "a", { type: "build", square: PARIS, kind: "maison", x: 30, z: 31, rot: 0 })).toBe("La place est déjà prise.");
    expect(fail(s, "a", { type: "build", square: PARIS, kind: "maison", x: 29, z: 30, rot: 0 })).toBe("Hors des frontières de la ville.");
    // Un immeuble couché dépasse du bord
    expect(fail(s, "a", { type: "build", square: PARIS, kind: "immeuble", x: 29, z: 33, rot: 1 })).toBe("Hors des frontières de la ville.");
    expect(fail(s, "a", { type: "build", square: LYON, kind: "maison", x: 30, z: 24, rot: 0 })).toBe("Cette ville n'est pas à toi.");
  });

  it("une position qui n'est pas un nombre est refusée : on ne bâtit pas hors de la carte, sans place", () => {
    const s = game();
    own(s, "a", PARIS);
    P(s, "a").cash = 100_000;
    for (const [x, z] of [
      [NaN, 30],
      [30, NaN],
      [Infinity, 30],
      [30, -Infinity],
    ] as const) {
      expect(fail(s, "a", { type: "build", square: PARIS, kind: "maison", x, z, rot: 0 })).toBe("Hors de la carte.");
    }
    expect(lotOf(s.deeds[PARIS])).toEqual([]);
    // Un bâtiment posé ne part pas hors de la carte non plus (sa place ne se libère pas)
    build(s, "a", PARIS, "immeuble", 30, 30);
    expect(fail(s, "a", { type: "relocate", square: PARIS, id: 1, x: NaN, z: 30, rot: 0 })).toBe("Hors de la carte.");
    expect(lotOf(s.deeds[PARIS])[0]).toMatchObject({ x: 30, z: 30 });
  });

  it("à tout moment, même pendant le tour d'un autre ; jamais pendant une enchère", () => {
    const s = game();
    own(s, "b", PARIS);
    expect(s.players[s.turn]!.id).toBe("a");
    build(s, "b", PARIS, "maison", 30, 30);
    expect(s.step).toBe("roll");
    s.auction = { square: 5, high: null, out: [], bids: 0 };
    s.step = "auction";
    expect(fail(s, "b", { type: "build", square: PARIS, kind: "maison", x: 31, z: 30, rot: 0 })).toBe(
      "Pas de travaux pendant une enchère.",
    );
  });

  it("en dette, on peut seulement démolir (la banque rend la moitié), et la dette se paie", () => {
    const s = game();
    own(s, "a", PARIS);
    build(s, "a", PARIS, "immeuble", 30, 30);
    P(s, "a").cash = 10;
    s.debts = [{ debtor: "a", creditor: "b", amount: 50, reason: "rent", square: 5 }];
    s.step = "debt";
    expect(fail(s, "a", { type: "build", square: PARIS, kind: "maison", x: 31, z: 30, rot: 0 })).toMatch(/dette/);
    act(s, "a", { type: "demolish", square: PARIS, id: 1 });
    expect(lotOf(s.deeds[PARIS])).toEqual([]);
    expect(P(s, "a").cash).toBe(10 + 55 - 50);
    expect(s.debts).toEqual([]);
  });

  it("la tour et le monument demandent le quartier ; un seul monument par ville, un seul stade par joueur", () => {
    const s = game();
    own(s, "a", PARIS);
    expect(fail(s, "a", { type: "build", square: PARIS, kind: "tour", x: 30, z: 30, rot: 0 })).toMatch(/tout le quartier bleu/);
    own(s, "a", LYON);
    build(s, "a", PARIS, "tour", 30, 30);
    build(s, "a", PARIS, "monument", 34, 34);
    expect(fail(s, "a", { type: "build", square: PARIS, kind: "monument", x: 32, z: 30, rot: 0 })).toBe("La ville a déjà le monument.");
    expect(P(s, "a").stats.hotels).toBe(1);
    build(s, "a", LYON, "stade", 30, 24);
    expect(fail(s, "a", { type: "build", square: PARIS, kind: "stade", x: 31, z: 32, rot: 0 })).toBe("Tu as déjà un stade.");
  });

  it("sans les bâtiments spéciaux, ni parc, ni stade, ni nuisance", () => {
    const s = game(2, { specials: false });
    own(s, "a", PARIS);
    expect(fail(s, "a", { type: "build", square: PARIS, kind: "parc", x: 30, z: 30, rot: 0 })).toMatch(/spéciaux/);
    build(s, "a", PARIS, "commerce", 30, 30);
  });

  it("déplacer et tourner un bâtiment : gratuit, dans la ville ; une nuisance ne se déplace pas", () => {
    const s = game();
    own(s, "a", PARIS);
    build(s, "a", PARIS, "immeuble", 30, 30);
    const cash = P(s, "a").cash;
    act(s, "a", { type: "relocate", square: PARIS, id: 1, x: 32, z: 32, rot: 1 });
    expect(lotOf(s.deeds[PARIS])[0]).toEqual({ id: 1, kind: "immeuble", x: 32, z: 32, rot: 1 });
    expect(footprint(lotOf(s.deeds[PARIS])[0]!)).toEqual({ x: 32, z: 32, w: 2, d: 1 });
    expect(P(s, "a").cash).toBe(cash);
    // Tourné à la place d'un autre, ou hors de la ville : refusé
    build(s, "a", PARIS, "maison", 34, 32);
    expect(fail(s, "a", { type: "relocate", square: PARIS, id: 1, x: 33, z: 32, rot: 1 })).toBe("La place est déjà prise.");
    build(s, "a", PARIS, "decharge", 30, 34);
    expect(fail(s, "a", { type: "relocate", square: PARIS, id: 3, x: 32, z: 34, rot: 0 })).toMatch(/ne se déplace pas/);
  });
});

describe("les voisinages", () => {
  it("le quartier complet double tout ; un parc fait gagner 30 % aux habitations qui le touchent", () => {
    const s = game();
    own(s, "a", PARIS);
    build(s, "a", PARIS, "maison", 30, 30);
    const alone = cityRent(s, PARIS).buildings[0]!.rent;
    own(s, "a", LYON);
    expect(cityRent(s, PARIS).buildings[0]!.rent).toBe(Math.round(alone * 2));
    build(s, "a", PARIS, "parc", 31, 30);
    const r = cityRent(s, PARIS);
    expect(r.buildings[0]).toMatchObject({ kind: "maison", parcs: 1 });
    expect(r.buildings[0]!.rent).toBe(Math.round(2 * rentScale(PARIS) * 2 * 1.3));
    // Le parc lui-même ne rapporte rien
    expect(r.buildings[1]!.rent).toBe(0);
  });

  it("un commerce rapporte un point de plus par habitation qui le touche", () => {
    const s = game();
    own(s, "a", PARIS);
    build(s, "a", PARIS, "commerce", 31, 31);
    expect(cityRent(s, PARIS).buildings[0]!.neighbors).toBe(0);
    build(s, "a", PARIS, "maison", 30, 31);
    build(s, "a", PARIS, "maison", 32, 31);
    build(s, "a", PARIS, "immeuble", 31, 32);
    // Une maison en diagonale ne compte pas
    build(s, "a", PARIS, "maison", 30, 30);
    const c = cityRent(s, PARIS).buildings[0]!;
    expect(c.neighbors).toBe(3);
    expect(c.rent).toBe(Math.round(4 * rentScale(PARIS)));
  });

  it("une nuisance fait perdre 30 % à deux cases, chez le voisin d'à côté comme chez soi, pas chez un coéquipier", () => {
    const s = game(3, {}, null);
    own(s, "a", PARIS);
    own(s, "b", LYON);
    build(s, "a", PARIS, "maison", 30, 30);
    const before = cityRent(s, PARIS).buildings[0]!.rent;
    // La décharge de b au bas de Lyon (rangées 27 et 28) : la maison de Paris (rangée 30) est à deux cases
    build(s, "b", LYON, "decharge", 30, 27);
    const hit = cityRent(s, PARIS).buildings[0]!;
    expect(hit.nuisances).toBe(1);
    expect(hit.rent).toBe(Math.round(2 * rentScale(PARIS) * 0.7));
    expect(before).toBeGreaterThan(hit.rent);
    // Et chez b aussi, à côté de sa décharge
    build(s, "b", LYON, "maison", 32, 27);
    expect(cityRent(s, LYON).buildings.find((b) => b.kind === "maison")!.nuisances).toBe(1);
    // Une maison plus loin, à trois cases : rien
    build(s, "a", PARIS, "maison", 30, 31);
    expect(cityRent(s, PARIS).buildings[1]!.nuisances).toBe(0);
  });

  it("en équipes, la nuisance épargne le coéquipier", () => {
    const s = game(4, { teamCount: 2 }, { a: 0, b: 0, c: 1, d: 1 });
    own(s, "a", PARIS);
    own(s, "b", LYON);
    own(s, "c", 34);
    build(s, "a", PARIS, "maison", 30, 30);
    build(s, "b", LYON, "decharge", 30, 27);
    expect(cityRent(s, PARIS).buildings[0]!.nuisances).toBe(0);
    // Bordeaux (rangées 18 à 22) n'est pas à portée
    build(s, "c", 34, "maison", 30, 22);
    expect(cityRent(s, 34).buildings[0]!.nuisances).toBe(0);
  });
});

describe("les frontières", () => {
  it("annexer une case de terrain vague qui touche la ville, à son prix ; elle s'ajoute au territoire", () => {
    const s = game();
    own(s, "a", PARIS);
    const cell = cellIndex(29, 30);
    expect(annexable(s, PARIS)).toContain(cell);
    // Pas une case loin des frontières, ni une rue
    expect(fail(s, "a", { type: "annex", square: PARIS, cell: cellIndex(28, 31) })).toMatch(/toucher les frontières/);
    expect(fail(s, "a", { type: "annex", square: PARIS, cell: cellIndex(27, 30) })).toMatch(/terrain vague/);
    act(s, "a", { type: "annex", square: PARIS, cell });
    expect(P(s, "a").cash).toBe(1400);
    expect(s.deeds[PARIS]!.annexed).toEqual([cell]);
    expect(areaOf(s, PARIS).has(cell)).toBe(true);
    // De proche en proche, et on peut y bâtir
    act(s, "a", { type: "annex", square: PARIS, cell: cellIndex(28, 30) });
    build(s, "a", PARIS, "immeuble", 28, 30, 1);
    expect(placeProblem(s, "a", PARIS, "maison", 28, 31, 0)).toBe("Hors des frontières de la ville.");
  });

  it("premier arrivé, premier servi : une case annexée par le voisin n'est plus libre", () => {
    const s = game();
    own(s, "a", PARIS);
    own(s, "b", LYON);
    const shared = cellIndex(31, 29);
    expect(annexable(s, PARIS)).toContain(shared);
    expect(annexable(s, LYON)).toContain(shared);
    act(s, "b", { type: "annex", square: LYON, cell: shared });
    expect(fail(s, "a", { type: "annex", square: PARIS, cell: shared })).toBe("Cette case est déjà annexée.");
    expect(annexable(s, PARIS)).not.toContain(shared);
  });

  it("une ville grandit au plus de moitié", () => {
    const s = game();
    own(s, "a", GUERET);
    P(s, "a").cash = 10_000;
    for (let k = 0; k < maxAnnex(GUERET); k++) act(s, "a", { type: "annex", square: GUERET, cell: annexable(s, GUERET)[0]! });
    expect(s.deeds[GUERET]!.annexed).toHaveLength(4);
    expect(fail(s, "a", { type: "annex", square: GUERET, cell: annexable(s, GUERET)[0] ?? cellIndex(25, 33) })).toMatch(
      /taille maximale|toucher/,
    );
  });
});

describe("les règles de la Capitale, en Builder", () => {
  it("une ville bâtie ne s'hypothèque pas et ne s'échange pas ; le terrain annexé suit le titre", () => {
    const s = game();
    own(s, "a", PARIS);
    build(s, "a", PARIS, "maison", 30, 30);
    expect(canMortgage(s, "a", PARIS)).toMatch(/Démolis/);
    expect(tradeProblem(s, "a", PARIS)).toMatch(/démolir/);
    act(s, "a", { type: "demolish", square: PARIS, id: 1 });
    act(s, "a", { type: "annex", square: PARIS, cell: cellIndex(29, 30) });
    expect(tradeProblem(s, "a", PARIS)).toBeNull();
  });

  it("le rachat paie les bâtiments et le terrain, majorés de moitié ; le monument protège la ville", () => {
    const s = game();
    own(s, "b", PARIS, LYON);
    build(s, "b", PARIS, "maison", 30, 30);
    act(s, "b", { type: "annex", square: PARIS, cell: cellIndex(29, 30) });
    expect(buyoutPrice(s, PARIS)).toBe(Math.round((400 + 50 + 100) * 1.5));
    build(s, "b", PARIS, "monument", 34, 34);
    expect(buyoutShield(s, "a", PARIS)).toBe("Un monument ne se rachète pas.");
  });

  it("pendant qu'un adversaire décide du rachat, le propriétaire ne bâtit ni n'annexe dans cette ville (ailleurs, si)", () => {
    const s = game();
    own(s, "b", PARIS, LYON);
    build(s, "b", PARIS, "maison", 30, 30);
    s.pendingBuyout = PARIS;
    s.step = "buyout";
    expect(actorOf(s)).toBe("a");
    expect(fail(s, "b", { type: "build", square: PARIS, kind: "monument", x: 34, z: 34, rot: 0 })).toMatch(/rachat/);
    expect(fail(s, "b", { type: "build", square: PARIS, kind: "maison", x: 31, z: 30, rot: 0 })).toMatch(/rachat/);
    expect(fail(s, "b", { type: "annex", square: PARIS, cell: cellIndex(29, 30) })).toMatch(/rachat/);
    build(s, "b", LYON, "maison", 30, 24);
    expect(s.step).toBe("buyout");
    expect(s.pendingBuyout).toBe(PARIS);
  });

  it("la fortune compte les bâtiments et le terrain ; la liquidité, la moitié des bâtiments", () => {
    const s = game();
    own(s, "a", PARIS);
    build(s, "a", PARIS, "immeuble", 30, 30);
    act(s, "a", { type: "annex", square: PARIS, cell: cellIndex(29, 30) });
    // Le titre (400), l'immeuble (110) et la case (100), au prix coûtant
    expect(netWorth(s, "a")).toBe(1290 + 400 + 110 + 100);
    expect(liquidity(s, "a")).toBe(1290 + 55 + 200);
  });

  it("une catastrophe abat le bâtiment le plus cher, jamais le monument", () => {
    const s = game();
    own(s, "a", PARIS, LYON);
    build(s, "a", PARIS, "monument", 34, 34);
    build(s, "a", PARIS, "maison", 30, 30);
    build(s, "a", PARIS, "tour", 31, 30);
    expect(knockable(s, PARIS).map((b) => b.kind)).toEqual(["tour", "maison"]);
    const card = DECKS.hasard.findIndex((c) => c.effect.kind === "disaster" && c.effect.disaster === "seisme");
    s.decks.hasard.unshift(card);
    const events: CapitaleEvent[] = [];
    drawCard(s, P(s, "a"), "hasard", events, 0);
    const d = events.find((e) => e.type === "disaster");
    expect(d).toMatchObject({ kind: "seisme", hits: [{ square: PARIS, owner: "a", level: 2, building: { kind: "tour" } }] });
    expect(
      lotOf(s.deeds[PARIS])
        .map((b) => b.kind)
        .sort(),
    ).toEqual(["maison", "monument"]);
  });

  it("le stade : chaque adversaire qui passe sur la case de la ville paie le billet", () => {
    const s = game();
    own(s, "b", GUERET);
    build(s, "b", GUERET, "stade", 26, 33);
    s.rigged = [[1, 2]];
    act(s, "a", { type: "roll" });
    expect(P(s, "b").cash).toBe(1500 - 200 + 50);
  });

  it("la faillite : les bâtiments sont démolis (moitié rendue), le terrain retourne en friche quand la banque reprend", () => {
    const s = game(3);
    own(s, "a", PARIS);
    build(s, "a", PARIS, "immeuble", 30, 30);
    act(s, "a", { type: "annex", square: PARIS, cell: cellIndex(29, 30) });
    P(s, "a").cash = 0;
    s.debts = [{ debtor: "a", creditor: "bank", amount: 5000, reason: "tax" }];
    s.step = "debt";
    const events = act(s, "a", { type: "bankrupt" });
    expect(events).toContainEqual(expect.objectContaining({ type: "demolish", square: PARIS, how: "auto" }));
    expect(s.deeds[PARIS]!.owner).toBeNull();
    expect(lotOf(s.deeds[PARIS])).toEqual([]);
    expect(s.deeds[PARIS]!.annexed ?? []).toEqual([]);
  });

  it("les cartes de travaux comptent ce qu'ont coûté les bâtiments, en niveaux du quartier", () => {
    const s = game();
    own(s, "a", PARIS, LYON);
    build(s, "a", PARIS, "tour", 30, 30);
    build(s, "a", PARIS, "monument", 34, 34);
    const card = DECKS.courrier.findIndex((c) => c.effect.kind === "repairs");
    const effect = DECKS.courrier[card]!.effect as { kind: "repairs"; level: number; tower: number };
    s.decks.courrier.unshift(card);
    const cash = P(s, "a").cash;
    const events: CapitaleEvent[] = [];
    drawCard(s, P(s, "a"), "courrier", events, 0);
    // La tour (265) vaut un niveau à Paris (200 le niveau), le monument compte comme celui de la Capitale classique
    expect(cash - P(s, "a").cash).toBe(effect.level * 1 + effect.tower * 1);
  });

  it("tous les bâtiments ont un nom, une taille et un effet", () => {
    for (const [kind, info] of Object.entries(BUILDS)) {
      expect(info.name, kind).toBeTruthy();
      expect(info.effect, kind).toBeTruthy();
      expect(info.w * info.d, kind).toBeGreaterThan(0);
    }
  });
});

function simulate(levels: BotLevel[], seed: number) {
  const ids = levels.map((_, i) => `p${i}`);
  const { state: s } = createGame(ids, { ...DEFAULT_SETTINGS, end: "bankrupt", builder: true }, seed);
  const level = (id: string) => levels[ids.indexOf(id)]!;
  let tradedTurn = -1;
  const kinds = new Set<string>();
  for (let guard = 0; guard < 120_000 && s.step !== "over"; guard++) {
    const t = s.trades[0];
    if (t && s.step !== "auction") {
      const r = applyAction(s, t.to, botAnswer(s, t.to, t, level(t.to)));
      if (!r.ok) throw new Error(`réponse : ${r.error}`);
      continue;
    }
    if (s.step === "auction") {
      let acted = false;
      for (const id of auctionBidders(s)) {
        const a = botBid(s, id, level(id));
        if (!a) continue;
        const r = applyAction(s, id, a);
        if (!r.ok) throw new Error(`enchère : ${r.error}`);
        acted = true;
        if (!s.auction) break;
      }
      if (!acted && s.auction) closeAuction(s);
      continue;
    }
    const actor = actorOf(s)!;
    const a = botAction(s, actor, level(actor), { allowTrade: s.turnId !== tradedTurn, allowGift: true });
    if (!a) throw new Error(`aucun coup pour ${actor} à l'étape ${s.step}`);
    if (a.type === "propose") tradedTurn = s.turnId;
    const r = applyAction(s, actor, a);
    if (!r.ok) throw new Error(`${a.type} à l'étape ${s.step} : ${r.error}`);
    for (const e of r.events) if (e.type === "build") kinds.add(e.building.kind);
    // Jamais deux bâtiments l'un sur l'autre, ni hors des frontières
    for (const i of Object.keys(TERRITORIES).map(Number)) {
      const area = areaOf(s, i);
      const seen = new Set<number>();
      for (const b of lotOf(s.deeds[i])) {
        for (const c of rectCells(footprint(b))) {
          expect(area.has(c)).toBe(true);
          expect(seen.has(c)).toBe(false);
          seen.add(c);
        }
      }
    }
  }
  return { s, kinds };
}

describe("les bots en Builder", () => {
  it("des parties entières entre bots vont au bout, sans coup refusé, avec toutes sortes de bâtiments", () => {
    const mixes: BotLevel[][] = [
      ["facile", "moyen", "fort"],
      ["fort", "fort", "fort", "fort"],
      ["moyen", "facile", "moyen", "fort"],
    ];
    let seed = 1;
    const kinds = new Set<string>();
    for (const mix of mixes) {
      for (let k = 0; k < 2; k++) {
        const { s, kinds: used } = simulate(mix, 200 + seed++);
        expect(s.step).toBe("over");
        expect(s.ranking).toHaveLength(mix.length);
        used.forEach((x) => kinds.add(x));
      }
    }
    for (const kind of ["maison", "commerce", "immeuble", "monument"]) expect(kinds.has(kind), kind).toBe(true);
  }, 60_000);

  it("bâtissent dans leur tour, le monument d'abord quand le quartier est complet", () => {
    const s = game();
    own(s, "a", PARIS, LYON);
    Object.assign(s, { step: "manage", dice: [1, 2] });
    P(s, "a").cash = 3000;
    expect(botAction(s, "a", "moyen")).toMatchObject({ type: "build", square: expect.any(Number), kind: "monument" });
  });

  it("en dette, démolissent ce qui coûte le moins de loyer", () => {
    const s = game();
    own(s, "a", PARIS);
    build(s, "a", PARIS, "maison", 30, 30);
    build(s, "a", PARIS, "immeuble", 32, 30);
    own(s, "a", 5);
    s.deeds[5]!.mortgaged = true;
    P(s, "a").cash = 0;
    s.debts = [{ debtor: "a", creditor: "b", amount: 20, reason: "rent", square: 15 }];
    s.step = "debt";
    expect(botAction(s, "a", "moyen")).toMatchObject({ type: "demolish", square: PARIS });
  });

  it("le remplaçant d'un absent ne pose pas de nuisance", () => {
    const s = game();
    own(s, "a", PARIS);
    own(s, "b", LYON);
    P(s, "a").cash = 5000;
    for (let x = 30; x < 36; x++) build(s, "b", LYON, "maison", x, 28);
    Object.assign(s, { step: "manage", dice: [1, 2] });
    for (let k = 0; k < 4; k++) {
      const a = botAction(s, "a", "fort", { allowAttack: false });
      if (a?.type !== "build") break;
      expect(BUILDS[a.kind].nuisance ?? false).toBe(false);
      act(s, "a", a);
    }
  });
});
