import { describe, expect, it } from "vitest";
import { botAction, planBotAim, randomShot } from "./bot.ts";
import {
  allowedTargets,
  applyAction,
  cellIndex,
  createGame,
  DEFAULT_SETTINGS,
  FLEETS,
  forceReady,
  GRID_SIZES,
  randomFleet,
  setAim,
  shipCells,
  validateFleet,
  type BotLevel,
  type NavalSettings,
  type NavalState,
  type Placement,
} from "./engine.ts";
import { eventsFor, viewFor } from "./view.ts";

const settings = (patch: Partial<NavalSettings> = {}): NavalSettings => ({ ...DEFAULT_SETTINGS, ...patch });

/** Flotte rangée en lignes espacées, en haut à gauche : facile à viser dans les tests. */
const ROWS: Placement[] = [
  { kind: "porte-avions", x: 0, y: 0, dir: "h" },
  { kind: "croiseur", x: 0, y: 2, dir: "h" },
  { kind: "contre-torpilleur", x: 0, y: 4, dir: "h" },
  { kind: "sous-marin", x: 0, y: 6, dir: "h" },
  { kind: "torpilleur", x: 0, y: 8, dir: "h" },
];

function cellsOf(fleet: Placement[], size = 10): number[] {
  return fleet.flatMap((p) => shipCells(size, p)!);
}

/** Une partie prête à tirer : toutes les flottes en ROWS, le premier joueur au tir. */
function battle(ids: string[], patch: Partial<NavalSettings> = {}): NavalState {
  const { state } = createGame(ids, settings(patch), 42);
  for (const id of ids) expect(applyAction(state, id, { type: "ready", ships: ROWS }).ok).toBe(true);
  expect(state.phase).toBe("battle");
  state.turn = 0;
  state.shotsLeft = patch.shots === "salvo" ? 5 : 1;
  return state;
}

const fire = (s: NavalState, by: string, target: string, cell: number) => applyAction(s, by, { type: "fire", target, cell });
const turnOf = (s: NavalState) => s.players[s.turn]!.id;

/** Une case d'eau encore jamais visée sur la flotte ROWS (les lignes impaires sont vides). */
function water(s: NavalState, target: string): number {
  const board = s.players.find((p) => p.id === target)!.board;
  const cell = [...Array(100).keys()].find((c) => Math.floor(c / 10) % 2 === 1 && !board.shots.includes(c));
  if (cell === undefined) throw new Error("Plus d'eau libre");
  return cell;
}

describe("flotte", () => {
  it("accepte une flotte complète et refuse les erreurs", () => {
    expect(validateFleet(10, ROWS, false)).toBeNull();
    expect(validateFleet(10, ROWS.slice(1), false)).toMatch(/complète/);
    expect(validateFleet(10, [{ ...ROWS[0]!, x: 7 }, ...ROWS.slice(1)], false)).toMatch(/dépasse/);
    expect(validateFleet(10, [ROWS[0]!, { ...ROWS[1]!, y: 0 }, ...ROWS.slice(2)], false)).toMatch(/chevauchent/);
    const glued = [ROWS[0]!, { ...ROWS[1]!, y: 1 }, ...ROWS.slice(2)];
    expect(validateFleet(10, glued, false)).toMatch(/toucher/);
    expect(validateFleet(10, glued, true)).toBeNull();
  });

  it("tire toujours une flotte valable au hasard, quelle que soit la grille", () => {
    for (const size of GRID_SIZES) {
      for (const touching of [false, true]) {
        for (let seed = 1; seed <= 40; seed++) {
          const fleet = randomFleet(size, touching, { rng: seed * 7919 });
          expect(validateFleet(size, fleet, touching)).toBeNull();
          expect(fleet.map((p) => p.kind).sort()).toEqual([...FLEETS[size]].sort());
        }
      }
    }
  });
});

describe("placement", () => {
  it("commence par une flotte tirée au hasard et lance la bataille quand tout le monde est prêt", () => {
    const { state } = createGame(["a", "b"], settings(), 7);
    expect(state.phase).toBe("placement");
    for (const p of state.players) expect(validateFleet(10, p.board.ships, false)).toBeNull();
    expect(forceReady(state, "a").map((e) => e.type)).toEqual(["ready"]);
    const events = forceReady(state, "b").map((e) => e.type);
    expect(events).toEqual(["ready", "battle", "turn"]);
    expect(state.phase).toBe("battle");
  });

  it("refuse une flotte invalide et une fois prêt", () => {
    const { state } = createGame(["a", "b"], settings(), 7);
    expect(applyAction(state, "a", { type: "ready", ships: ROWS.slice(1) }).ok).toBe(false);
    expect(applyAction(state, "a", { type: "ready", ships: ROWS }).ok).toBe(true);
    expect(applyAction(state, "a", { type: "place", ships: ROWS }).ok).toBe(false);
  });
});

describe("tirs", () => {
  it("à l'eau, la main passe ; touché, on rejoue (règle par défaut)", () => {
    const s = battle(["a", "b"]);
    expect(fire(s, "a", "b", cellIndex(10, 9, 9)).ok).toBe(true);
    expect(turnOf(s)).toBe("b");
    expect(fire(s, "b", "a", cellIndex(10, 0, 0)).ok).toBe(true);
    expect(turnOf(s)).toBe("b");
  });

  it("un tir chacun : la main passe même en touchant", () => {
    const s = battle(["a", "b"], { shots: "single" });
    fire(s, "a", "b", cellIndex(10, 0, 0));
    expect(turnOf(s)).toBe("b");
  });

  it("refuse de tirer hors de son tour, sur sa flotte ou deux fois au même endroit", () => {
    const s = battle(["a", "b"]);
    expect(fire(s, "b", "a", 0).ok).toBe(false);
    expect(fire(s, "a", "a", 0).ok).toBe(false);
    fire(s, "a", "b", 0);
    expect(fire(s, "a", "b", 0).ok).toBe(false);
  });

  it("salve : autant de tirs que de navires à flot", () => {
    const s = battle(["a", "b"], { shots: "salvo" });
    for (let i = 0; i < 4; i++) {
      fire(s, "a", "b", cellIndex(10, 9, i));
      expect(turnOf(s)).toBe("a");
    }
    fire(s, "a", "b", cellIndex(10, 9, 4));
    expect(turnOf(s)).toBe("b");
    expect(s.shotsLeft).toBe(5);
  });

  it("coule un navire, puis toute la flotte : la partie est finie", () => {
    const s = battle(["a", "b"]);
    const events = [0, 1].flatMap((x) => {
      const res = fire(s, "a", "b", cellIndex(10, x, 8));
      return res.ok ? res.events : [];
    });
    expect(events.find((e) => e.type === "shot" && e.result === "sunk")).toBeTruthy();
    for (const c of cellsOf(ROWS)) if (!s.players[1]!.board.shots.includes(c)) fire(s, "a", "b", c);
    expect(s.phase).toBe("gameOver");
    expect(s.ranking).toEqual(["a", "b"]);
    expect(s.ranks).toEqual({ a: 1, b: 2 });
    expect(s.players[0]!.stats).toMatchObject({ hits: 17, sunk: 5 });
  });
});

describe("à plusieurs", () => {
  it("mêlée : le dernier à flot gagne, puis l'ordre inverse des éliminations", () => {
    const s = battle(["a", "b", "c"], { shots: "single" });
    // a coule b en entier, en tirant à son tour ; b et c tirent à l'eau pendant ce temps
    const bCells = cellsOf(ROWS);
    let k = 0;
    while (s.phase === "battle" && !s.players[1]!.out) {
      const who = turnOf(s);
      const res = who === "a" ? fire(s, "a", "b", bCells[k++]!) : fire(s, who, "a", water(s, "a"));
      expect(res.ok).toBe(true);
    }
    expect(s.players[1]!.out).toBe(true);
    expect(s.eliminated).toEqual(["b"]);
    // b est sauté désormais
    for (let i = 0; i < 6 && s.phase === "battle"; i++) expect(turnOf(s)).not.toBe("b");
  });

  it("équipes : un joueur coulé ne tire plus, son coéquipier continue seul", () => {
    const s = battle(["a", "b", "c", "d"], { teams: true, shots: "single" });
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
    expect(fire(s, "a", "c", 50).ok).toBe(false);
    // Couler la flotte de b (équipe 1) sans toucher d
    const bCells = cellsOf(ROWS);
    let k = 0;
    while (!s.players[1]!.out) {
      const who = turnOf(s);
      const res = who === "a" || who === "c" ? fire(s, who, "b", bCells[k++]!) : fire(s, who, "a", water(s, "a"));
      expect(res.ok).toBe(true);
    }
    expect(s.eliminated).toEqual([]);
    expect(s.phase).toBe("battle");
    // b est sauté à chaque tour, d joue pour l'équipe
    let sawD = false;
    for (let i = 0; i < 8 && s.phase === "battle"; i++) {
      const who = turnOf(s);
      expect(who).not.toBe("b");
      if (who === "d") sawD = true;
      const target = who === "a" || who === "c" ? "d" : "a";
      expect(fire(s, who, target, water(s, target)).ok).toBe(true);
    }
    expect(sawD).toBe(true);
    expect(fire(s, "b", "a", water(s, "a")).ok).toBe(false);
  });

  it("équipes : le coéquipier coulé gagne quand même si son équipe l'emporte", () => {
    const s = battle(["a", "b", "c", "d"], { teams: true, shots: "single" });
    const cells = cellsOf(ROWS);
    const idx: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    // Équipe 0 (a, c) : a coule d'abord, puis l'équipe 1 (b, d) tombe entièrement
    const plan = (who: string) => {
      if (who === "b" || who === "d") return s.players[0]!.out ? "c" : "a";
      return s.players[1]!.out ? "d" : "b";
    };
    let guard = 0;
    while (s.phase === "battle" && guard++ < 800) {
      const who = turnOf(s);
      const target = plan(who);
      // b et d ne visent juste que tant que a flotte, ensuite ils tirent dans l'eau
      const aimed = who === "b" || who === "d" ? (target === "a" ? cells[idx.a!++]! : water(s, "c")) : cells[idx[target]!++]!;
      expect(fire(s, who, target, aimed).ok).toBe(true);
    }
    expect(s.players[0]!.out).toBe(true);
    expect(s.players[2]!.out).toBe(false);
    expect(s.ranks).toEqual({ a: 1, c: 1, b: 3, d: 3 });
  });

  it("équipes : les deux gagnants partagent la première place", () => {
    const s = battle(["a", "b", "c", "d"], { teams: true, shots: "single" });
    const order = ["b", "d"];
    const cells = cellsOf(ROWS);
    const idx: Record<string, number> = { b: 0, d: 0 };
    let guard = 0;
    while (s.phase === "battle" && guard++ < 500) {
      const who = turnOf(s);
      let res;
      if (who === "a" || who === "c") {
        const target = order.find((t) => !s.players.find((p) => p.id === t)!.out)!;
        res = fire(s, who, target, cells[idx[target]!++]!);
      } else {
        res = fire(s, who, "a", water(s, "a"));
      }
      expect(res.ok).toBe(true);
    }
    expect(s.ranks).toEqual({ a: 1, c: 1, b: 3, d: 3 });
  });
});

describe("arsenal", () => {
  it("couler un navire donne une arme, dans l'ordre radar, torpille, barrage", () => {
    const s = battle(["a", "b"], { arsenal: true });
    const res = [0, 1].map((x) => fire(s, "a", "b", cellIndex(10, x, 8)));
    const last = res[1]!;
    expect(last.ok && last.events.some((e) => e.type === "weapon" && e.weapon === "radar")).toBe(true);
    expect(s.players[0]!.arsenal).toEqual(["radar"]);
  });

  it("radar : révèle la présence sur 3×3 sans tirer, et seul le camp du tireur voit le résultat", () => {
    const s = battle(["a", "b"], { arsenal: true });
    s.players[0]!.arsenal = ["radar"];
    const res = applyAction(s, "a", { type: "weapon", weapon: "radar", target: "b", cell: cellIndex(10, 1, 1) });
    expect(res.ok).toBe(true);
    const scan = s.scans[0]!;
    expect(scan.cells).toHaveLength(9);
    expect(scan.found.sort((x, y) => x - y)).toEqual([0, 1, 2, 20, 21, 22]);
    expect(s.players[1]!.board.shots).toEqual([]);
    expect(turnOf(s)).toBe("b");
    expect(viewFor(s, "a").boards[1]!.scans).toHaveLength(1);
    expect(viewFor(s, "b").boards[1]!.scans).toHaveLength(0);
    const seenByB = eventsFor(s, res.ok ? res.events : [], "b").find((e) => e.type === "scan");
    expect(seenByB && seenByB.type === "scan" && seenByB.found).toBeNull();
  });

  it("torpille : file sur la ligne et frappe le premier navire, l'eau traversée est révélée", () => {
    const s = battle(["a", "b"], { arsenal: true });
    s.players[0]!.arsenal = ["torpedo"];
    // Ligne 1 vide (les navires sont sur les lignes paires) : la torpille traverse tout
    applyAction(s, "a", { type: "weapon", weapon: "torpedo", target: "b", cell: cellIndex(10, 5, 1), dir: "h" });
    expect(s.players[1]!.board.shots).toHaveLength(10);
    s.turn = 0;
    s.players[0]!.arsenal = ["torpedo"];
    // Colonne 3 : le premier navire est le porte-avions en (3,0)
    const res = applyAction(s, "a", { type: "weapon", weapon: "torpedo", target: "b", cell: cellIndex(10, 3, 5), dir: "v" });
    expect(res.ok && res.events.find((e) => e.type === "shot")).toMatchObject({ cell: cellIndex(10, 3, 0), result: "hit" });
  });

  it("barrage : une croix de cinq cases d'un coup", () => {
    const s = battle(["a", "b"], { arsenal: true });
    s.players[0]!.arsenal = ["barrage"];
    const res = applyAction(s, "a", { type: "weapon", weapon: "barrage", target: "b", cell: cellIndex(10, 1, 1) });
    expect(res.ok && res.events.filter((e) => e.type === "shot")).toHaveLength(5);
    expect(s.players[0]!.stats.hits).toBe(2);
  });
});

describe("ce que chacun voit", () => {
  it("cache la flotte adverse et révèle les épaves", () => {
    const s = battle(["a", "b"]);
    const view = viewFor(s, "a");
    expect(view.boards[0]!.ships).not.toBeNull();
    expect(view.boards[1]!.ships).toBeNull();
    fire(s, "a", "b", cellIndex(10, 0, 8));
    fire(s, "a", "b", cellIndex(10, 1, 8));
    const after = viewFor(s, "a").boards[1]!;
    expect(after.hits).toEqual([80, 81]);
    expect(after.sunk).toEqual([{ kind: "torpilleur", x: 0, y: 8, dir: "h" }]);
    expect(JSON.stringify(viewFor(s, "a").boards[1])).not.toContain('"y":6');
  });
});

describe("bots", () => {
  function play(ids: string[], levels: Record<string, BotLevel>, patch: Partial<NavalSettings>, seed: number): NavalState {
    const { state } = createGame(ids, settings(patch), seed);
    for (const id of ids) forceReady(state, id);
    let guard = 0;
    while (state.phase === "battle" && guard++ < 4000) {
      const who = turnOf(state);
      const action = botAction(state, who, levels[who]!) ?? randomShot(state, who);
      const res = applyAction(state, who, action!);
      if (!res.ok) throw new Error(`${levels[who]} : ${res.error}`);
    }
    expect(state.phase).toBe("gameOver");
    return state;
  }

  it("mènent toutes les variantes jusqu'au bout sans coup illégal", () => {
    const levels: BotLevel[] = ["mousse", "chasseur", "amiral"];
    let seed = 1;
    for (const shots of ["single", "replay", "salvo"] as const) {
      for (const arsenal of [false, true]) {
        for (const grid of GRID_SIZES) {
          const ids = ["a", "b", "c", "d"];
          const lv = Object.fromEntries(ids.map((id, i) => [id, levels[(i + seed) % 3]!]));
          play(["a", "b"], lv, { shots, arsenal, grid }, seed++);
          play(["a", "b", "c"], lv, { shots, arsenal, grid, touching: true }, seed++);
          play(ids, lv, { shots, arsenal, grid, teams: true }, seed++);
        }
      }
    }
  });

  it("l'amiral bat le mousse bien plus souvent qu'à son tour", () => {
    let wins = 0;
    for (let seed = 100; seed < 130; seed++) {
      const s = play(["amiral", "mousse"], { amiral: "amiral", mousse: "mousse" }, { shots: "single" }, seed);
      if (s.ranking![0] === "amiral") wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(24);
  });

  it("le chasseur bat le mousse plus souvent qu'à son tour", () => {
    let wins = 0;
    for (let seed = 200; seed < 230; seed++) {
      const s = play(["chasseur", "mousse"], { chasseur: "chasseur", mousse: "mousse" }, { shots: "single" }, seed);
      if (s.ranking![0] === "chasseur") wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(20);
  });
});

/** Une partie lancée normalement : c'est le tirage qui dit qui commence et qui il doit viser. */
function started(ids: string[], patch: Partial<NavalSettings> = {}, seed = 42): NavalState {
  const { state } = createGame(ids, settings(patch), seed);
  for (const id of ids) applyAction(state, id, { type: "ready", ships: ROWS });
  return state;
}

/** Coule directement des navires d'une flotte, sans passer par les tirs. */
function sink(s: NavalState, id: string, count: number) {
  const player = s.players.find((p) => p.id === id)!;
  for (const ship of player.board.ships.slice(0, count)) {
    ship.hits = shipCells(10, ship)!;
    ship.sunk = true;
    player.board.shots.push(...ship.hits);
  }
  if (player.board.ships.every((sh) => sh.sunk)) player.out = true;
}

const allowedIds = (s: NavalState) => allowedTargets(s, turnOf(s)).map((p) => p.id);
const SIX = ["a", "b", "c", "d", "e", "f"];
/** La première case d'un navire encore intacte sur la flotte ROWS */
function shipCell(s: NavalState, target: string): number {
  const board = s.players.find((p) => p.id === target)!.board;
  return cellsOf(ROWS).find((c) => !board.shots.includes(c))!;
}

describe("l'ordre des adversaires", () => {
  it("n'est pas le même pour tout le monde : personne n'est en tête de liste pour deux joueurs", () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (let n = 2; n <= 6; n++) {
        const ids = SIX.slice(0, n);
        const { orders } = createGame(ids, settings(), seed).state;
        expect(new Set(ids.map((id) => orders![id]![0])).size).toBe(n);
        for (const id of ids) expect([...orders![id]!].sort()).toEqual(ids.filter((x) => x !== id).sort());
      }
    }
  });

  it("en équipes, on ne voit que ses adversaires, et les deux équipiers n'ont pas le même en tête", () => {
    for (let seed = 1; seed <= 80; seed++) {
      const { orders, players } = createGame(["a", "b", "c", "d"], settings({ teams: true }), seed).state;
      for (const p of players) {
        expect([...orders![p.id]!].sort()).toEqual(
          players
            .filter((q) => q.team !== p.team)
            .map((q) => q.id)
            .sort(),
        );
      }
      expect(orders!.a![0]).not.toBe(orders!.c![0]);
      expect(orders!.b![0]).not.toBe(orders!.d![0]);
    }
  });

  it("change d'une partie à l'autre, et chacun ne reçoit que le sien", () => {
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) firsts.add(createGame(SIX, settings(), seed).state.orders!.a![0]!);
    expect(firsts.size).toBeGreaterThan(3);
    const s = started(SIX);
    expect(viewFor(s, "a").order).toEqual(s.orders!.a);
    expect(viewFor(s, "b").order).toEqual(s.orders!.b);
    expect(viewFor(s, null).order).toEqual([]);
  });

  it("ne change rien au déroulement de la partie", () => {
    const a = createGame(SIX, settings(), 7).state;
    const b = createGame(SIX, settings({ targeting: "random" }), 7).state;
    expect(a.players.map((p) => p.board.ships)).toEqual(b.players.map((p) => p.board.ships));
    expect(a.rng).toBe(b.rng);
  });
});

describe("cible au hasard", () => {
  it("impose une seule flotte à chaque tour et refuse les autres, pour les tirs comme pour les armes", () => {
    const s = started(SIX, { targeting: "random", arsenal: true });
    const shooter = turnOf(s);
    const allowed = allowedIds(s);
    expect(allowed).toHaveLength(1);
    expect(allowed[0]).not.toBe(shooter);
    const other = SIX.find((id) => id !== shooter && id !== allowed[0])!;
    const refused = fire(s, shooter, other, 0);
    expect(refused).toEqual({ ok: false, error: expect.stringMatching(/hasard/) });
    s.players.find((p) => p.id === shooter)!.arsenal.push("radar");
    expect(applyAction(s, shooter, { type: "weapon", weapon: "radar", target: other, cell: 11 }).ok).toBe(false);
    expect(applyAction(s, shooter, { type: "weapon", weapon: "radar", target: allowed[0]!, cell: 11 }).ok).toBe(true);
  });

  it("garde la même cible quand on rejoue, et en tire une autre si elle est coulée", () => {
    const s = started(SIX, { targeting: "random", shots: "replay" });
    const shooter = turnOf(s);
    const victim = allowedIds(s)[0]!;
    expect(fire(s, shooter, victim, shipCell(s, victim)).ok).toBe(true);
    expect(turnOf(s)).toBe(shooter);
    expect(allowedIds(s)).toEqual([victim]);
    sink(s, victim, 4);
    for (const c of [cellIndex(10, 0, 8), cellIndex(10, 1, 8)]) expect(fire(s, shooter, victim, c).ok).toBe(true);
    expect(s.players.find((p) => p.id === victim)!.out).toBe(true);
    expect(turnOf(s)).toBe(shooter);
    expect(allowedIds(s)).toHaveLength(1);
    expect(allowedIds(s)[0]).not.toBe(victim);
    expect(allowedIds(s)[0]).not.toBe(shooter);
  });

  it("tire au sort parmi toutes les flottes encore à flot, à chaque nouveau tour", () => {
    const s = started(SIX, { targeting: "random", shots: "single" });
    const seen = new Set<string>();
    for (let i = 0; i < 90; i++) {
      const shooter = turnOf(s);
      const victim = allowedIds(s)[0]!;
      if (shooter === "a") seen.add(victim);
      expect(victim).not.toBe(shooter);
      expect(fire(s, shooter, victim, water(s, victim)).ok).toBe(true);
    }
    expect([...seen].sort()).toEqual(["b", "c", "d", "e", "f"]);
  });

  it("garde la même cible pendant toute une salve", () => {
    const s = started(SIX, { targeting: "random", shots: "salvo" });
    const shooter = turnOf(s);
    const victim = allowedIds(s)[0]!;
    const left = s.shotsLeft;
    expect(left).toBeGreaterThan(1);
    expect(fire(s, shooter, victim, water(s, victim)).ok).toBe(true);
    expect(turnOf(s)).toBe(shooter);
    expect(s.shotsLeft).toBe(left - 1);
    expect(allowedIds(s)).toEqual([victim]);
  });

  it("à deux, il n'y a de toute façon qu'une flotte", () => {
    const s = started(["a", "b"], { targeting: "random" });
    expect(allowedIds(s)).toEqual([turnOf(s) === "a" ? "b" : "a"]);
  });
});

describe("priorité à la plus grosse flotte", () => {
  it("au départ tout le monde est à égalité : on choisit parmi tous", () => {
    const s = started(SIX, { targeting: "leader" });
    expect(allowedIds(s).sort()).toEqual(SIX.filter((id) => id !== turnOf(s)).sort());
  });

  it("n'autorise que les flottes qui ont le plus de navires à flot, ex æquo compris", () => {
    const s = started(SIX, { targeting: "leader" });
    const shooter = turnOf(s);
    const foes = SIX.filter((id) => id !== shooter);
    sink(s, foes[0]!, 1);
    sink(s, foes[1]!, 2);
    sink(s, foes[2]!, 3);
    expect(allowedIds(s).sort()).toEqual([foes[3]!, foes[4]!].sort());
    expect(fire(s, shooter, foes[0]!, 99)).toEqual({ ok: false, error: expect.stringMatching(/plus de navires/) });
    sink(s, foes[4]!, 1);
    expect(allowedIds(s)).toEqual([foes[3]]);
  });

  it("ne compte pas la flotte du tireur : la sienne peut être la plus grosse", () => {
    const s = started(["a", "b", "c"], { targeting: "leader" });
    const shooter = turnOf(s);
    const [x, y] = ["a", "b", "c"].filter((id) => id !== shooter);
    sink(s, x!, 2);
    expect(allowedIds(s)).toEqual([y]);
  });

  it("se recalcule quand on rejoue : le navire qu'on vient de couler peut changer la cible", () => {
    const s = started(["a", "b", "c"], { targeting: "leader", shots: "replay" });
    const shooter = turnOf(s);
    const [x, y] = ["a", "b", "c"].filter((id) => id !== shooter) as [string, string];
    // x n'a plus que son torpilleur en moins que y : le couler fait passer y devant
    const torpilleur = [cellIndex(10, 0, 8), cellIndex(10, 1, 8)];
    expect(allowedIds(s).sort()).toEqual([x, y].sort());
    for (const c of torpilleur) expect(fire(s, shooter, x, c).ok).toBe(true);
    expect(turnOf(s)).toBe(shooter);
    expect(allowedIds(s)).toEqual([y]);
    expect(fire(s, shooter, x, water(s, x)).ok).toBe(false);
  });
});

describe("la visée annoncée", () => {
  it("seul le tireur annonce, seulement une cible permise, et ce n'est pas un coup", () => {
    const s = started(SIX);
    const shooter = turnOf(s);
    const other = SIX.find((id) => id !== shooter)!;
    const turnId = s.turnId;
    expect(s.aim).toBeNull();
    expect(setAim(s, other, shooter)).toBe(false);
    expect(setAim(s, shooter, shooter)).toBe(false);
    expect(setAim(s, shooter, other)).toBe(true);
    expect(viewFor(s, "z").aim).toBe(other);
    expect(s.turnId).toBe(turnId);
    expect(turnOf(s)).toBe(shooter);
    expect(s.players.find((p) => p.id === shooter)!.stats.shots).toBe(0);
    expect(setAim(s, shooter, other)).toBe(false);
  });

  it("repart de zéro au tour suivant", () => {
    const s = started(SIX, { shots: "single" });
    const shooter = turnOf(s);
    const other = SIX.find((id) => id !== shooter)!;
    setAim(s, shooter, other);
    expect(fire(s, shooter, other, water(s, other)).ok).toBe(true);
    expect(s.aim).toBeNull();
  });

  it("reste la même quand on rejoue, sauf si la flotte visée vient de couler", () => {
    const s = started(SIX, { shots: "replay" });
    const shooter = turnOf(s);
    const victim = SIX.find((id) => id !== shooter)!;
    setAim(s, shooter, victim);
    expect(fire(s, shooter, victim, shipCell(s, victim)).ok).toBe(true);
    expect(s.aim).toBe(victim);
    sink(s, victim, 4);
    for (const c of [cellIndex(10, 0, 8), cellIndex(10, 1, 8)]) expect(fire(s, shooter, victim, c).ok).toBe(true);
    expect(s.aim).toBeNull();
  });

  it("se sait d'avance quand il n'y a qu'une flotte possible", () => {
    const duel = started(["a", "b"]);
    expect(duel.aim).toBe(turnOf(duel) === "a" ? "b" : "a");
    const random = started(SIX, { targeting: "random" });
    expect(random.aim).toBe(allowedIds(random)[0]);
  });

  it("n'accepte pas une flotte interdite par la règle", () => {
    const s = started(SIX, { targeting: "random" });
    const shooter = turnOf(s);
    const other = SIX.find((id) => id !== shooter && id !== allowedIds(s)[0])!;
    expect(setAim(s, shooter, other)).toBe(false);
  });
});

describe("les bots et les règles de cible", () => {
  for (const targeting of ["free", "random", "leader"] as const) {
    for (const level of ["mousse", "chasseur", "amiral"] as const satisfies readonly BotLevel[]) {
      it(`${targeting}, ${level} : jusqu'au bout sans coup illégal, et ils tirent sur la flotte annoncée`, () => {
        const ids = ["a", "b", "c", "d", "e"];
        const { state: s } = createGame(ids, settings({ targeting, grid: 8, arsenal: true }), 1234);
        for (const id of ids) forceReady(s, id);
        for (let i = 0; i < 4000 && s.phase === "battle"; i++) {
          const shooter = turnOf(s);
          planBotAim(s, shooter, level);
          const aimed = s.aim;
          expect(allowedIds(s)).toContain(aimed);
          const action = botAction(s, shooter, level)!;
          expect((action as { target: string }).target).toBe(aimed);
          const res = applyAction(s, shooter, action);
          expect(res).toMatchObject({ ok: true });
        }
        expect(s.phase).toBe("gameOver");
      });
    }
    it(`${targeting} : le tir de secours respecte la règle et part sur la flotte annoncée`, () => {
      for (let seed = 1; seed <= 30; seed++) {
        const s = started(SIX, { targeting }, seed);
        const shooter = turnOf(s);
        const action = randomShot(s, shooter) as { target: string };
        expect(allowedIds(s)).toContain(action.target);
        const aim = allowedIds(s)[0]!;
        setAim(s, shooter, aim);
        expect((randomShot(s, shooter) as { target: string }).target).toBe(aim);
      }
    });
  }
});

describe("une partie commencée avant ces règles", () => {
  it("continue au choix, sans ordre ni visée", () => {
    const s = started(SIX);
    delete s.settings.targeting;
    delete s.orders;
    delete s.forced;
    delete s.aim;
    const shooter = turnOf(s);
    expect(allowedIds(s)).toHaveLength(5);
    const view = viewFor(s, "a");
    expect(view.order).toEqual([]);
    expect(view.aim).toBeNull();
    expect(view.allowed).toHaveLength(5);
    const other = SIX.find((id) => id !== shooter)!;
    expect(fire(s, shooter, other, water(s, other)).ok).toBe(true);
  });
});
