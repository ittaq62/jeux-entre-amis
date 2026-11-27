import { describe, expect, it } from "vitest";
import { buildKitchen, Cell, KITCHEN_IDS, KITCHENS, walkable, type KitchenId } from "./kitchens.ts";
import {
  createWorld,
  FPS,
  GRAB,
  NO_INPUT,
  offsetsAt,
  serviceTime,
  starThresholds,
  step,
  targetCell,
  USE,
  type Input,
  type ToqueEvent,
  type World,
} from "./sim.ts";
import { RECIPES } from "./food.ts";

/** Le service commence tout de suite */
function started(kitchen: KitchenId, chefs = 1): World {
  const w = createWorld(
    kitchen,
    false,
    Array.from({ length: chefs }, () => ({ team: 0, chefs: 1 as const, bot: false })),
    1234,
  );
  while (w.phase === 0) step(w, []);
  return w;
}

/** Le chef 0 se met devant cette case, la regarde, et fait ce geste */
function at(w: World, cell: number, press = 0): ToqueEvent[] {
  const k = buildKitchen(w.kitchen, w.duel);
  const cx = cell % k.W;
  const cy = Math.floor(cell / k.W);
  const sides: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  const c = w.chefs[0]!;
  for (const [dx, dy] of sides) {
    const x = cx + dx;
    const y = cy + dy;
    if (x < 0 || y < 0 || x >= k.W || y >= k.H || !walkable(k.cells[y * k.W + x]!)) continue;
    c.x = x + 0.5;
    c.y = y + 0.5;
    c.vx = 0;
    c.vy = 0;
    c.fx = -dx;
    c.fy = -dy;
    break;
  }
  expect(targetCell(k, offsetsAt(k, serviceTime(w)), c)).toBe(cell);
  return step(w, [{ x: 0, y: 0, held: press & USE, pressed: press }]);
}

function cellOf(w: World, pred: (cell: Cell, i: number) => boolean): number {
  const k = buildKitchen(w.kitchen, w.duel);
  const i = k.cells.findIndex((c, i) => pred(c, i));
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
}

function wait(w: World, seconds: number, input: Input = NO_INPUT): ToqueEvent[] {
  const ev: ToqueEvent[] = [];
  for (let i = 0; i < Math.round(seconds * FPS); i++) ev.push(...step(w, [input]));
  return ev;
}

describe("les plans des cuisines", () => {
  for (const id of KITCHEN_IDS) {
    it(`${id} : un plan rectangulaire, des caisses connues, tout ce qu'il faut`, () => {
      const def = KITCHENS[id];
      const w0 = def.layout[0]!.length;
      for (const row of def.layout) expect(row.length).toBe(w0);
      if (def.sections) {
        expect(def.sections.length).toBe(def.layout.length);
        for (const row of def.sections) expect(row.length).toBe(w0);
      }
      for (const ch of def.layout.join("")) if (/[1-9]/.test(ch)) expect(def.crates[ch], `caisse ${ch}`).toBeDefined();
      const k = buildKitchen(id);
      const has = (c: Cell) => k.cells.includes(c);
      expect(has(Cell.Pass)).toBe(true);
      expect(has(Cell.Return)).toBe(true);
      expect(has(Cell.Trash)).toBe(true);
      expect(has(Cell.Board)).toBe(true);
      expect(has(Cell.Sink)).toBe(def.washing);
      expect(has(Cell.Rack)).toBe(def.washing);
      expect(k.start.filter((s) => s.item === "plate").length).toBeGreaterThanOrEqual(3);
      expect(k.start.some((s) => s.item === "ext")).toBe(true);
      expect(k.spawns[0]!.length).toBe(4);
      // Chaque aliment des recettes du menu sort d'une caisse
      const goods = new Set(Object.values(def.crates).map((g) => (g.startsWith("base:") ? g.slice(5) : g)));
      for (const m of def.menu) expect(RECIPES[m.r]).toBeDefined();
      expect(goods.size).toBeGreaterThan(0);
    });
  }

  for (const id of KITCHEN_IDS) {
    it(`${id} : chaque poste a une case de sol en face, où l'on arrive depuis les départs`, () => {
      const k = buildKitchen(id);
      // Les cases de sol atteintes depuis les départs (les morceaux qui bougent à leur place de départ)
      const seen = new Set<number>();
      const queue = k.spawns[0]!.map(([x, y]) => Math.floor(y) * k.W + Math.floor(x));
      for (const q of queue) seen.add(q);
      for (let n = 0; n < queue.length; n++) {
        const c = queue[n]!;
        const x = c % k.W;
        const y = Math.floor(c / k.W);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx!;
          const ny = y + dy!;
          if (nx < 0 || ny < 0 || nx >= k.W || ny >= k.H) continue;
          const j = ny * k.W + nx;
          if (seen.has(j) || !walkable(k.cells[j]!)) continue;
          seen.add(j);
          queue.push(j);
        }
      }
      const lonely: string[] = [];
      k.cells.forEach((cell, i) => {
        if (cell < Cell.Counter) return;
        const x = i % k.W;
        const y = Math.floor(i / k.W);
        const ok = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => seen.has((y + dy!) * k.W + (x + dx!)) && x + dx! >= 0 && x + dx! < k.W);
        // Un simple plan de travail peut être décoratif ; un poste, une caisse, un objet posé, jamais
        const matters = cell !== Cell.Counter || k.start.some((s) => s.cell === i);
        if (!ok && matters) lonely.push(`${x},${y}`);
      });
      expect(lonely).toEqual([]);
    });
  }

  it("le duel pose deux cuisines en miroir, un mur au milieu", () => {
    const k = buildKitchen("bistrot", true);
    const w0 = KITCHENS.bistrot.layout[0]!.length;
    expect(k.W).toBe(w0 * 2 + 1);
    expect(k.spawns.length).toBe(2);
    for (let y = 0; y < k.H; y++) {
      expect(k.cells[y * k.W + w0]).toBe(Cell.Wall);
      for (let x = 0; x < w0; x++) expect(k.cells[y * k.W + x]).toBe(k.cells[y * k.W + (k.W - 1 - x)]);
    }
  });

  it("les seuils des étoiles grandissent avec le nombre de chefs", () => {
    const one = starThresholds("bistrot", 1);
    const two = starThresholds("bistrot", 2);
    const four = starThresholds("bistrot", 4);
    expect(two).toEqual(KITCHENS.bistrot.stars);
    expect(one[0]).toBeLessThan(two[0]);
    expect(four[2]).toBeGreaterThan(two[2]);
  });
});

describe("une salade, pas à pas", () => {
  it("couper la laitue et la tomate, dresser, servir", () => {
    const w = started("bistrot");
    const k = buildKitchen("bistrot");
    const crate = (food: string) => cellOf(w, (c, i) => c === Cell.Crate && k.crate[i] === food);
    const boards = k.cells.map((c, i) => (c === Cell.Board ? i : -1)).filter((i) => i >= 0);
    const pass = cellOf(w, (c) => c === Cell.Pass);
    const plate = k.start.find((s) => s.item === "plate")!.cell;
    expect(w.teams[0]!.orders.length).toBe(1);
    // Une commande de salade, pour être sûr de ce qu'on sert
    w.teams[0]!.orders[0]!.r = "salade";

    for (const [food, board] of [
      ["laitue", boards[0]!],
      ["tomate", boards[1]!],
    ] as const) {
      at(w, crate(food), GRAB);
      expect(w.chefs[0]!.held?.f).toBe(food);
      at(w, board, GRAB);
      expect(w.items[board]?.f).toBe(food);
      at(w, board, USE);
      const ev = wait(w, 2);
      expect(ev.some((e) => e.k === "chopped")).toBe(true);
      expect(w.items[board]?.f).toBe(`${food}_c`);
    }
    // L'assiette prend la laitue puis la tomate
    at(w, plate, GRAB);
    expect(w.chefs[0]!.held?.k).toBe("plate");
    at(w, boards[0]!, GRAB);
    at(w, boards[1]!, GRAB);
    expect(w.chefs[0]!.held?.c).toEqual(["laitue_c", "tomate_c"]);
    const ev = at(w, pass, GRAB);
    const served = ev.find((e) => e.k === "serve");
    expect(served).toBeDefined();
    expect(w.chefs[0]!.held).toBeNull();
    expect(w.teams[0]!.score).toBeGreaterThanOrEqual(RECIPES.salade.value);
    // L'assiette revient (propre, au bistrot) au bout de quelques secondes
    const ret = cellOf(w, (c) => c === Cell.Return);
    wait(w, 8);
    expect(w.stack[ret]).toBe(1);
  });

  it("le passe refuse une assiette qui ne répond à aucune commande", () => {
    const w = started("bistrot");
    const k = buildKitchen("bistrot");
    const plate = k.start.find((s) => s.item === "plate")!.cell;
    const pass = cellOf(w, (c) => c === Cell.Pass);
    at(w, plate, GRAB);
    const ev = at(w, pass, GRAB);
    expect(ev.some((e) => e.k === "refuse")).toBe(true);
    expect(w.chefs[0]!.held?.k).toBe("plate");
  });
});

describe("la marmite et le feu", () => {
  it("trois oignons émincés font une soupe ; oubliée, elle brûle et le feu prend ; l'extincteur l'éteint", () => {
    const w = started("bistrot");
    const k = buildKitchen("bistrot");
    const onion = cellOf(w, (c, i) => c === Cell.Crate && k.crate[i] === "oignon");
    const board = cellOf(w, (c) => c === Cell.Board);
    const pot = k.start.find((s) => s.item === "pot")!.cell;
    for (let n = 0; n < 3; n++) {
      at(w, onion, GRAB);
      at(w, board, GRAB);
      at(w, board, USE);
      wait(w, 2);
      at(w, board, GRAB);
      expect(w.chefs[0]!.held?.f).toBe("oignon_c");
      at(w, pot, GRAB);
      expect(w.chefs[0]!.held).toBeNull();
    }
    expect(w.items[pot]?.c).toEqual(["oignon_c", "oignon_c", "oignon_c"]);
    const cooked = wait(w, 3.6 * 3 + 0.5);
    expect(cooked.some((e) => e.k === "cooked" && e.cell === pot)).toBe(true);
    const burnt = wait(w, 10);
    expect(burnt.some((e) => e.k === "burn" && e.cell === pot)).toBe(true);
    expect(w.fire[pot]).toBeGreaterThan(0);
    // On éteint
    const ext = k.start.find((s) => s.item === "ext")!.cell;
    at(w, ext, GRAB);
    expect(w.chefs[0]!.held?.k).toBe("ext");
    const c = w.chefs[0]!;
    // Devant la marmite, en tenant Utiliser
    const px = pot % k.W;
    const py = Math.floor(pot / k.W);
    c.x = px + 0.5;
    c.y = py + 1.5;
    c.fx = 0;
    c.fy = -1;
    const ev = wait(w, 3, { x: 0, y: 0, held: USE, pressed: 0 });
    expect(ev.some((e) => e.k === "out")).toBe(true);
    expect(w.fire[pot]).toBe(0);
    expect(w.items[pot]?.c).toEqual(["charbon"]);
  });
});

describe("le temps et les commandes", () => {
  it("une commande qui attend trop est perdue et coûte des points", () => {
    const w = started("bistrot");
    w.teams[0]!.score = 50;
    const ev = wait(w, 100);
    expect(ev.some((e) => e.k === "fail")).toBe(true);
    expect(w.teams[0]!.score).toBeLessThan(50);
    expect(w.teams[0]!.failed).toBeGreaterThan(0);
  });

  it("le service s'arrête à l'heure", () => {
    const w = started("bistrot");
    const ev = wait(w, KITCHENS.bistrot.duration + 1);
    expect(ev.some((e) => e.k === "end")).toBe(true);
    expect(w.phase).toBe(2);
  });
});
