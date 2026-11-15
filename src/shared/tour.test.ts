import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./games/crampons/view.ts";
import { DEFAULT_SETTINGS as BOLIDES_DEFAULTS } from "./games/bolides/race.ts";
import { DEFAULT_SETTINGS as MECHE_DEFAULTS } from "./games/meche/engine.ts";
import { random } from "./rng.ts";
import { DEFAULT_SETTINGS as BRICKS_DEFAULTS } from "./games/bricks/engine.ts";
import { DEFAULT_SETTINGS as CAPITALE_DEFAULTS } from "./games/capitale/engine.ts";
import { DEFAULT_SETTINGS as NAVAL_DEFAULTS } from "./games/naval/engine.ts";
import { DEFAULT_SETTINGS as UNO_DEFAULTS } from "./games/uno/engine.ts";
import {
  adoptedRule,
  adoptedVariant,
  askedLabel,
  askedRules,
  baseVariant,
  composeVariant,
  defaultTourSettings,
  gameModifiers,
  isBaseVariant,
  openRuleVotes,
  resolveRule,
  resolveVoted,
  settledVariant,
  splitAsked,
  type TourNext,
  drawGame,
  drawVariant,
  findVariant,
  fitsGame,
  gameVariants,
  resolveVariant,
  cleanCapitaleTeam,
  DEFAULT_CAPITALE_TEAM,
  TOUR_GAMES,
  tourCapitaleSettings,
  variantSettings,
  voteNeed,
  sanitizeEnd,
  teamScores,
  tourCapacity,
  tourOver,
  tourPoints,
  tourUnoSettings,
  tourTitles,
  type TitleCandidate,
  drawBolidesBots,
} from "./tour.ts";

describe("barème", () => {
  it("donne 10, 7, 5, 3, 2, 1 puis 1 point", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(tourPoints)).toEqual([10, 7, 5, 3, 2, 1, 1, 1]);
  });
});

describe("tirage", () => {
  const rng = { rng: 42 };
  const rand = () => random(rng);

  it("ne rejoue jamais deux fois de suite le même jeu quand il y a le choix", () => {
    let previous: ReturnType<typeof drawGame> = null;
    for (let i = 0; i < 300; i++) {
      const g = drawGame(["uno", "bricks", "naval"], 4, previous, rand);
      expect(g).not.toBeNull();
      expect(g).not.toBe(previous);
      previous = g;
    }
  });

  it("tire chaque jeu coché au fil des tirages", () => {
    const seen = new Set<string>();
    let previous: ReturnType<typeof drawGame> = null;
    for (let i = 0; i < 60; i++) {
      previous = drawGame(["uno", "bricks", "naval"], 3, previous, rand);
      seen.add(previous!);
    }
    expect([...seen].sort()).toEqual(["bricks", "naval", "uno"]);
  });

  it("écarte les jeux déjà joués quand chaque jeu ne passe qu'une fois", () => {
    for (let i = 0; i < 30; i++) expect(drawGame(["uno", "bricks", "naval"], 4, "bricks", rand, ["uno", "bricks"])).toBe("naval");
    expect(drawGame(["uno", "bricks"], 4, "bricks", rand, ["uno", "bricks"])).toBeNull();
    // Le seul jeu restant passe, même s'il vient d'être joué ailleurs dans la liste
    expect(drawGame(["uno"], 3, null, rand, [])).toBe("uno");
  });

  it("garde le seul jeu coché, même deux fois de suite", () => {
    expect(drawGame(["bricks"], 2, "bricks", rand)).toBe("bricks");
  });

  it("écarte les jeux qui n'accueillent pas tout le monde", () => {
    for (let i = 0; i < 30; i++) expect(drawGame(["uno", "bricks", "naval"], 7, null, rand)).toBe("uno");
    expect(drawGame(["bricks", "naval"], 7, null, rand)).toBeNull();
    expect(fitsGame("naval", 6)).toBe(true);
    expect(fitsGame("naval", 7)).toBe(false);
    expect(tourCapacity(["bricks", "naval"])).toBe(6);
    expect(tourCapacity(["uno", "naval"])).toBe(8);
  });
});

describe("fin de la tournée", () => {
  const base = { played: 0, best: 0, startedAt: 0, now: 0 };
  it("après un nombre de jeux", () => {
    expect(tourOver({ kind: "games", count: 3 }, { ...base, played: 2 })).toBe(false);
    expect(tourOver({ kind: "games", count: 3 }, { ...base, played: 3 })).toBe(true);
  });
  it("dès qu'un score est atteint", () => {
    expect(tourOver({ kind: "score", target: 30 }, { ...base, best: 29 })).toBe(false);
    expect(tourOver({ kind: "score", target: 30 }, { ...base, best: 30 })).toBe(true);
  });
  it("au bout du temps", () => {
    expect(tourOver({ kind: "time", minutes: 30 }, { ...base, now: 29 * 60_000 })).toBe(false);
    expect(tourOver({ kind: "time", minutes: 30 }, { ...base, now: 30 * 60_000 })).toBe(true);
  });
  it("jamais toute seule sans fin", () => {
    expect(tourOver({ kind: "endless" }, { ...base, played: 99, best: 999, now: 1e9 })).toBe(false);
  });
  it("n'accepte que les valeurs proposées", () => {
    expect(sanitizeEnd({ kind: "games", count: 5 })).toEqual({ kind: "games", count: 5 });
    expect(sanitizeEnd({ kind: "games", count: 4 })).toBeNull();
    expect(sanitizeEnd({ kind: "score", target: 50 })).toEqual({ kind: "score", target: 50 });
    expect(sanitizeEnd({ kind: "time", minutes: 15 })).toBeNull();
    expect(sanitizeEnd({ kind: "endless" })).toEqual({ kind: "endless" });
    expect(sanitizeEnd("n'importe quoi")).toBeNull();
  });
});

describe("équipes", () => {
  it("additionne les points de chaque équipe", () => {
    expect(
      teamScores([
        { team: 0, points: 10 },
        { team: 1, points: 7 },
        { team: 0, points: 3 },
        { team: null, points: 50 },
      ]),
    ).toEqual([13, 7]);
  });
});

describe("titres", () => {
  const line = (game: TitleCandidate["lines"][number]["game"], rank: number, stats: Record<string, number> = {}, players = 4) => ({
    game,
    rank,
    players,
    stats,
  });

  it("donne chaque titre au meilleur, deux au plus par joueur", () => {
    const titles = tourTitles([
      {
        userId: "a",
        name: "Alice",
        lines: [line("uno", 1, { plusGiven: 6 }), line("bricks", 1, { lines: 30, sent: 12 }), line("naval", 1, { shots: 20, hits: 12 })],
      },
      {
        userId: "b",
        name: "Bob",
        lines: [line("uno", 2, { plusGiven: 5 }), line("bricks", 4, { lines: 12 }), line("naval", 4, { shots: 10, hits: 3 })],
      },
      { userId: "c", name: "Chloé", lines: [line("uno", 4), line("bricks", 4), line("naval", 4)] },
    ]);
    const by = Object.fromEntries(titles.map((t) => [t.id, t.name]));
    expect(by.collector).toBe("Alice");
    expect(by["plus-four"]).toBe("Alice");
    // Alice a déjà deux titres : le maçon revient au suivant
    expect(by.mason).toBe("Bob");
    expect(by.brave).toBe("Chloé");
    expect(titles.filter((t) => t.userId === "a").length).toBeLessThanOrEqual(2);
    expect(titles.length).toBeLessThanOrEqual(5);
  });

  it("affiche le chiffre à part, et récompense aussi Capitale", () => {
    const titles = tourTitles([
      { userId: "a", name: "Alice", lines: [line("uno", 2, { plusGiven: 6 }), line("capitale", 1, { rentEarned: 1250, houses: 9 })] },
    ]);
    const by = Object.fromEntries(titles.map((t) => [t.id, t]));
    expect(by["plus-four"]).toMatchObject({ stat: "+6", unit: "cartes données à piocher", detail: "+6 cartes données à piocher" });
    expect(by.tycoon?.stat?.replace(/\s/g, " ")).toBe("1 250 ₣");
    // Deux titres au plus par joueur : le promoteur passe son tour
    expect(by.builder).toBeUndefined();
  });

  it("ne donne rien sans exploit", () => {
    expect(tourTitles([{ userId: "a", name: "Alice", lines: [line("uno", 2)] }])).toEqual([]);
  });
});

describe("règles des jeux", () => {
  const rng = { rng: 7 };
  const rand = () => random(rng);
  const defaults = {
    uno: UNO_DEFAULTS,
    naval: NAVAL_DEFAULTS,
    bricks: BRICKS_DEFAULTS,
    capitale: CAPITALE_DEFAULTS,
    meche: MECHE_DEFAULTS,
    bolides: BOLIDES_DEFAULTS,
    crampons: DEFAULT_CONFIG,
  };

  it("propose plusieurs variantes par jeu, la première étant celle de base, sans rien changer", () => {
    for (const game of TOUR_GAMES) {
      const all = gameVariants(game);
      expect(all.length).toBeGreaterThanOrEqual(3);
      expect(new Set(all.map((v) => v.id)).size).toBe(all.length);
      expect(baseVariant(game)).toBe(all[0]!.id);
      expect(variantSettings(game as "uno", baseVariant(game))).toEqual({});
    }
  });

  it("ne touche qu'à de vrais réglages du jeu, avec des valeurs du bon type", () => {
    for (const game of TOUR_GAMES) {
      const base = defaults[game] as unknown as Record<string, unknown>;
      for (const v of gameVariants(game)) {
        for (const [key, value] of Object.entries(variantSettings(game as "uno", v.id))) {
          expect(key in base, `${game}/${v.id}/${key}`).toBe(true);
          expect(typeof value).toBe(typeof base[key]);
        }
      }
    }
  });

  it("ne garde jamais les équipes, les bots ni le solo, réglés par la tournée", () => {
    for (const game of TOUR_GAMES) {
      for (const v of gameVariants(game)) {
        const keys = Object.keys(variantSettings(game as "uno", v.id));
        // La tournée règle aussi la durée de Capitale (20 minutes) : ses variantes n'y touchent pas
        const owned = ["teams", "botLevel", "sprint", "endMode", "turnSeconds", ...(game === "capitale" ? ["end", "minutes"] : [])];
        expect(keys.filter((k) => owned.includes(k))).toEqual([]);
      }
    }
  });

  it("ignore une variante inconnue", () => {
    expect(findVariant("uno", "n'importe quoi")).toBeNull();
    expect(variantSettings("naval", "n'importe quoi")).toEqual({});
    expect(findVariant("bricks", "chrono")?.name).toBe("K.O. au chrono");
  });

  it("tire toutes les variantes au hasard, et les navires collés à part", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(drawVariant("naval", rand));
    // Chaque variante, avec ou sans navires collés
    expect(seen.size).toBe(gameVariants("naval").length * 2);
    expect(findVariant("naval", "salve+colles")?.name).toBe("Salve, navires collés");
    expect(variantSettings("naval", "eclair+colles")).toEqual({ grid: 8, touching: true });
    expect(variantSettings("naval", "eclair")).toEqual({ grid: 8 });
    expect(findVariant("naval", "salve+inconnue")).toBeNull();
    // Les autres jeux n'ont pas de règle à part (sauf le UNO, plus bas)
    for (const game of ["bricks", "capitale", "meche", "bolides", "crampons"] as const) {
      expect(gameModifiers(game)).toEqual([]);
      for (let i = 0; i < 30; i++) expect(drawVariant(game, rand)).not.toContain("+");
    }
  });

  it("UNO : « pas de UNO d'avance » est tiré au sort à part, avec chaque variante, Classique comme No Mercy", () => {
    const holder = { rng: 11 };
    const rand = () => random(holder);
    // Aucune variante ne le règle d'elle-même : c'est une règle à part, comme les navires collés
    for (const v of gameVariants("uno")) expect(variantSettings("uno", v.id)).not.toHaveProperty("noEarlyUno");
    const seen = new Map<string, number>();
    for (let i = 0; i < 600; i++) {
      const variant = drawVariant("uno", rand);
      seen.set(variant, (seen.get(variant) ?? 0) + 1);
      const s = tourUnoSettings({ variant });
      expect(s.noEarlyUno).toBe(variant.endsWith("+sans-avance"));
      // La variante tirée garde ses propres règles : No Mercy reste No Mercy, avec ou sans
      expect(s).toMatchObject(variantSettings("uno", variant.split("+")[0]));
    }
    // Chaque variante, avec et sans : une fois sur deux à peu près
    expect(seen.size).toBe(gameVariants("uno").length * 2);
    const on = [...seen].filter(([v]) => v.endsWith("+sans-avance")).reduce((n, [, k]) => n + k, 0);
    expect(on).toBeGreaterThan(600 * 0.35);
    expect(on).toBeLessThan(600 * 0.65);
    expect(findVariant("uno", "no-mercy+sans-avance")?.name).toBe("No Mercy, pas de UNO d'avance");
    expect(tourUnoSettings({ variant: "no-mercy+sans-avance" })).toEqual({ variant: "nomercy", noEarlyUno: true });
    expect(tourUnoSettings({ variant: "classique+sans-avance" })).toEqual({ noEarlyUno: true });
    expect(tourUnoSettings({ variant: "no-mercy" })).toEqual({ variant: "nomercy", noEarlyUno: false });
  });

  it("UNO : l'ancien réglage de l'hôte n'existe plus, et la table ignore celui qu'une ancienne tournée enverrait encore", () => {
    expect(defaultTourSettings("private")).not.toHaveProperty("noEarlyUno");
    const old = { variant: "classique", noEarlyUno: true } as { variant: string };
    expect(tourUnoSettings(old)).toEqual({ noEarlyUno: false });
    // … et une variante inconnue (d'une version plus récente) retombe sur la règle habituelle
    expect(tourUnoSettings({ variant: "classique+inconnue" })).toEqual({ noEarlyUno: false });
  });

  it("Capitale : les règles d'équipe de l'hôte s'ajoutent à la variante, Monopole compris, jamais tirées avec elle", () => {
    for (const v of gameVariants("capitale")) {
      expect(variantSettings("capitale", v.id)).not.toHaveProperty("teamRent");
      expect(variantSettings("capitale", v.id)).not.toHaveProperty("teamWin");
    }
    expect(variantSettings("capitale", "monopole")).toEqual({ monopoly: true });
    const rules = { teamRent: "half" as const, teamGifts: false, teamHeir: true, teamWin: false };
    expect(tourCapitaleSettings({ variant: "monopole", capitaleTeam: rules })).toEqual({ monopoly: true, ...rules });
    // Tournées plus anciennes : les règles d'équipe par défaut
    expect(tourCapitaleSettings({ variant: "classique" })).toEqual(DEFAULT_CAPITALE_TEAM);
    // Ce qui arrive du salon est vérifié, le reste garde sa valeur
    expect(cleanCapitaleTeam({ teamRent: "tout", teamGifts: "oui", teamWin: false })).toEqual({ ...DEFAULT_CAPITALE_TEAM, teamWin: false });
  });

  it("adopte une variante dès la moitié des voix des joueurs présents", () => {
    expect(voteNeed(1)).toBe(1);
    expect(voteNeed(2)).toBe(1);
    expect(voteNeed(3)).toBe(2);
    expect(voteNeed(4)).toBe(2);
    expect(voteNeed(0)).toBe(1);
    const voters = ["a", "b", "c"];
    expect(adoptedVariant({ a: "salve" }, voters)).toBeNull();
    expect(adoptedVariant({ a: "salve", b: "salve" }, voters)).toBe("salve");
    // Les voix de ceux qui ne sont plus là ne comptent pas
    expect(adoptedVariant({ a: "salve", z: "salve" }, voters)).toBeNull();
    expect(adoptedVariant({ a: "salve", z: "salve" }, ["a", "b"])).toBe("salve");
  });

  it("au départ, prend la plus votée, ou celle de base sans voix", () => {
    expect(resolveVariant("uno", {}, ["a", "b"], rand)).toBe("classique");
    expect(resolveVariant("uno", { a: "no-mercy", b: "no-mercy", c: "pioche" }, ["a", "b", "c"], rand)).toBe("no-mercy");
    // Une voix inconnue est écartée
    expect(resolveVariant("uno", { a: "triche" }, ["a"], rand)).toBe("classique");
    // À égalité, l'une des ex aequo, jamais une autre
    for (let i = 0; i < 40; i++) {
      expect(["pioche", "sept-zero"]).toContain(resolveVariant("uno", { a: "pioche", b: "sept-zero" }, ["a", "b"], rand));
    }
  });
});

describe("règles à part votées oui ou non", () => {
  const rng = { rng: 5 };
  const rand = () => random(rng);
  const next = (over: Partial<TourNext> = {}): TourNext => ({
    game: "uno",
    at: 0,
    variant: null,
    votes: {},
    base: null,
    extras: openRuleVotes("uno"),
    ...over,
  });

  it("au UNO, seulement « pas de UNO d'avance » ; les navires collés ne se votent pas", () => {
    expect(askedRules("uno").map((r) => r.id)).toEqual(["sans-avance"]);
    expect(askedRules("uno")[0]!.question).toBe("Pas de UNO d'avance ?");
    expect(askedRules("naval")).toEqual([]);
    expect(openRuleVotes("uno")).toEqual({ "sans-avance": { votes: {}, value: null } });
    expect(openRuleVotes("naval")).toEqual({});
    expect(askedLabel("uno", "sans-avance", true)).toBe("pas de UNO d'avance");
    expect(askedLabel("uno", "sans-avance", false)).toBe("UNO d'avance permis");
  });

  it("écrit la variante et ses règles à part dans l'ordre du jeu, et les sépare pour l'affichage", () => {
    expect(composeVariant("uno", "no-mercy", ["sans-avance"])).toBe("no-mercy+sans-avance");
    expect(composeVariant("uno", "no-mercy", [])).toBe("no-mercy");
    expect(composeVariant("uno", "pioche+sans-avance", ["inconnue"])).toBe("pioche");
    expect(composeVariant("naval", "salve", ["colles"])).toBe("salve+colles");
    expect(splitAsked("uno", "no-mercy+sans-avance")).toMatchObject({ rest: "no-mercy", asked: [{ on: true }] });
    expect(splitAsked("uno", "classique")).toMatchObject({ rest: "classique", asked: [{ on: false }] });
    // Les navires collés ne se disent pas à part : ils restent dans le nom
    expect(splitAsked("naval", "salve+colles")).toEqual({ rest: "salve+colles", asked: [] });
    expect(splitAsked("uno", "triche")).toEqual({ rest: null, asked: [] });
    // Au vote des variantes, seulement celles proposées
    expect(isBaseVariant("uno", "no-mercy")).toBe(true);
    expect(isBaseVariant("uno", "no-mercy+sans-avance")).toBe(false);
    expect(isBaseVariant("uno", 3)).toBe(false);
  });

  it("adopte le oui ou le non dès la moitié des voix des joueurs présents, jamais à égalité", () => {
    // Deux joueurs : une voix suffit, comme pour les variantes
    expect(adoptedRule({ a: true }, ["a", "b"])).toBe(true);
    expect(adoptedRule({ a: false }, ["a", "b"])).toBe(false);
    expect(adoptedRule({}, ["a", "b"])).toBeNull();
    // Quatre joueurs : deux voix
    expect(adoptedRule({ a: true }, ["a", "b", "c", "d"])).toBeNull();
    expect(adoptedRule({ a: true, b: true }, ["a", "b", "c", "d"])).toBe(true);
    expect(adoptedRule({ a: true, b: false }, ["a", "b", "c", "d"])).toBeNull();
    // Les voix d'un absent (déconnecté, parti) ou d'un spectateur ne comptent pas
    expect(adoptedRule({ a: true, z: true }, ["a", "b", "c"])).toBeNull();
    // Des votants partis : le oui et le non ont tous les deux la moitié, rien n'est décidé avant le départ
    expect(adoptedRule({ a: true, b: false }, ["a", "b"])).toBeNull();
  });

  it("au départ : le oui s'il l'emporte ; à égalité ou sans voix, la règle habituelle", () => {
    expect(resolveRule({}, ["a", "b"])).toBe(false);
    expect(resolveRule({ a: true, b: false }, ["a", "b", "c"])).toBe(false);
    expect(resolveRule({ a: true, b: true, c: false }, ["a", "b", "c"])).toBe(true);
    expect(resolveRule({ a: false }, ["a", "b"])).toBe(false);
    // Le oui d'un absent ne compte pas
    expect(resolveRule({ z: true }, ["a"])).toBe(false);
  });

  it("les règles sont connues quand la variante et chaque règle à part sont décidées", () => {
    expect(settledVariant(next())).toBeNull();
    expect(settledVariant(next({ base: "no-mercy" }))).toBeNull();
    expect(settledVariant(next({ extras: { "sans-avance": { votes: {}, value: true } } }))).toBeNull();
    expect(settledVariant(next({ base: "no-mercy", extras: { "sans-avance": { votes: {}, value: true } } }))).toBe("no-mercy+sans-avance");
    expect(settledVariant(next({ base: "pioche", extras: { "sans-avance": { votes: {}, value: false } } }))).toBe("pioche");
    // Un jeu sans règle à part votée : la variante suffit
    expect(settledVariant({ game: "naval", base: "salve", extras: {} })).toBe("salve");
    // Tournée d'avant : pas de règles à part en jeu
    expect(settledVariant({ game: "uno", base: "pioche" })).toBe("pioche");
  });

  it("au départ, garde ce qui est décidé et tranche le reste avec les voix des présents", () => {
    const voters = ["a", "b", "c"];
    // Tout décidé : rien ne change
    expect(resolveVoted(next({ variant: "sept-zero+sans-avance" }), voters, rand)).toBe("sept-zero+sans-avance");
    // Variante adoptée, le oui l'emporte au départ
    const yes = { "sans-avance": { votes: { a: true, b: true, c: false }, value: null } };
    expect(resolveVoted(next({ base: "pioche", extras: yes }), voters, rand)).toBe("pioche+sans-avance");
    // Égalité (le troisième n'a pas voté) : la règle habituelle
    const tie = { "sans-avance": { votes: { a: true, b: false }, value: null } };
    expect(resolveVoted(next({ votes: { a: "no-mercy", b: "no-mercy" }, extras: tie }), voters, rand)).toBe("no-mercy");
    // Personne n'a voté : celles de base, sans la règle à part
    expect(resolveVoted(next(), voters, rand)).toBe("classique");
    // Le oui d'un joueur parti entre-temps ne compte plus
    const gone = { "sans-avance": { votes: { z: true }, value: null } };
    expect(resolveVoted(next({ extras: gone }), voters, rand)).toBe("classique");
    // Décidé par l'hôte : reste, quelles que soient les voix
    const imposed = { "sans-avance": { votes: { a: false, b: false }, value: true } };
    expect(resolveVoted(next({ extras: imposed }), voters, rand)).toBe("classique+sans-avance");
  });
});

describe("Bolides en règles tirées au sort", () => {
  const seq = (...v: number[]) => {
    let i = 0;
    return () => v[i++ % v.length]!;
  };

  it("ne dépasse jamais la grille, et laisse parfois la course sans bot", () => {
    for (let humans = 1; humans <= 8; humans++) {
      const seen = new Set<number>();
      for (let k = 0; k < 400; k++) {
        const n = drawBolidesBots(humans, 8, Math.random);
        expect(n).toBeGreaterThanOrEqual(humans >= 2 ? 0 : 1);
        expect(humans + n).toBeLessThanOrEqual(8);
        seen.add(n);
      }
      if (humans >= 2 && humans < 8) expect(seen.has(0)).toBe(true);
      if (humans <= 5) expect(seen.size).toBeGreaterThan(2);
    }
  });

  it("un joueur seul a toujours au moins un adversaire", () => {
    expect(drawBolidesBots(1, 8, seq(0))).toBe(1);
    expect(drawBolidesBots(1, 8, seq(0.999))).toBe(7);
  });

  it("une grille déjà pleine n'en prend aucun", () => {
    expect(drawBolidesBots(8, 8, seq(0.5))).toBe(0);
  });
});
