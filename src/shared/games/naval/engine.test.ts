import { describe, expect, it } from "vitest";
import { botAction, randomShot } from "./bot.ts";
import {
  applyAction,
  cellIndex,
  createGame,
  DEFAULT_SETTINGS,
  FLEETS,
  forceReady,
  GRID_SIZES,
  randomFleet,
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

  it("équipes : un joueur coulé continue à tirer tant que son coéquipier tient", () => {
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
    // b peut encore jouer à son tour
    let sawB = false;
    for (let i = 0; i < 8 && s.phase === "battle"; i++) {
      const who = turnOf(s);
      if (who === "b") sawB = true;
      const target = who === "a" || who === "c" ? "d" : "a";
      expect(fire(s, who, target, water(s, target)).ok).toBe(true);
    }
    expect(sawB).toBe(true);
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
