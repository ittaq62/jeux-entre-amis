// Les cuisines de Toque ! : leur plan (une grille, une case par mètre), ce qui sort de leurs caisses, leur menu, ce qui
// les rend difficiles (le bateau qui tangue, les tables qui glissent, le vent sur les toits…) et les seuils des étoiles.
// Le plan se lit comme une carte vue de haut : la première ligne est le fond de la cuisine, la dernière le bord le plus
// proche de la caméra.
//
//   #  mur              .  sol                ,  sol verglacé          ~  vide (l'eau, le vide entre deux toits)
//   _  plan de travail  B  planche à découper S  feu (vide)           m  feu et sa marmite     n  feu et sa poêle
//   O  four             F  friteuse           W  évier                 R  égouttoir             P  passe (le service)
//   D  retour des assiettes                   T  poubelle              p  assiette propre posée e  extincteur posé
//   1…9  caisse (son aliment dans `crates`)   a b c d  sol où se tient un chef au départ

import { RECIPES, type BaseKind, type FoodId, type RawFood, type RecipeId } from "./food.ts";

export type KitchenId = "bistrot" | "creperie" | "cantine" | "pizzeria" | "brasserie" | "chalet" | "train" | "guinguette" | "banquet";

export const KITCHEN_IDS: KitchenId[] = [
  "bistrot",
  "creperie",
  "cantine",
  "pizzeria",
  "brasserie",
  "chalet",
  "train",
  "guinguette",
  "banquet",
];
export const isKitchenId = (v: unknown): v is KitchenId => typeof v === "string" && (KITCHEN_IDS as string[]).includes(v);

/** Ce qui rend la cuisine difficile, en plus des commandes */
export type HazardKind = "tangage" | "tables" | "vent" | "charrettes" | "verglas" | "wagons" | "radeau" | "banquet";

/**
 * Le mouvement d'un morceau de cuisine qui bouge : il reste en place, glisse en douceur jusqu'à la position suivante,
 * y reste, et ainsi de suite (en boucle). `at` : le départ de chaque glissade dans la boucle (secondes), `to` : où il va.
 */
export interface Motion {
  period: number;
  /** Sous le morceau, quand il s'est écarté : du sol (des tables qui glissent) ou le vide (un wagon, un radeau) */
  ground?: "floor" | "void";
  /** Les glissades : à tel moment de la boucle, en tant de secondes, jusqu'à ce décalage (en cases) */
  moves: { at: number; s: number; dx: number; dy: number }[];
}

/** Ce que sort une caisse : un aliment, ou un fond à garnir (le pain de mie du croque) */
export type CrateGood = RawFood | `base:${BaseKind}`;

export interface KitchenDef {
  id: KitchenId;
  name: string;
  /** Où elle est, en quelques mots */
  place: string;
  layout: string[];
  /** Les morceaux qui bougent : un chiffre par case (0 ou espace : immobile), et leur mouvement */
  sections?: string[];
  motions?: Record<number, Motion>;
  crates: Record<string, CrateGood>;
  /** Les plats du menu et leur poids dans le tirage des commandes */
  menu: { r: RecipeId; w: number }[];
  /** La durée du service, en secondes */
  duration: number;
  /** Le temps entre deux commandes, pour deux chefs (en secondes : au plus tôt, au plus tard) */
  gap: [number, number];
  /** Au plus tant de commandes à la fois, pour deux chefs */
  maxOrders: number;
  /** La vaisselle : les assiettes reviennent sales (évier, égouttoir) ; sinon elles reviennent propres au retour */
  washing: boolean;
  hazard?: HazardKind;
  /** L'allée où passent les charrettes (sa rangée dans le plan) */
  lane?: number;
  /** Les étoiles : les points pour une, deux, trois, pour deux chefs */
  stars: [number, number, number];
  /** Les couleurs de la cuisine (l'écran de chargement, la carte) */
  theme: { from: string; to: string; accent: string };
}

// ---------------------------------------------------------------------------
// Les neuf étapes de la roulotte
// ---------------------------------------------------------------------------

const BISTROT: KitchenDef = {
  id: "bistrot",
  name: "Le bistrot de Mémé",
  place: "Paris, au coin de la rue",
  layout: [
    "_1_2_3__mm_T_",
    "_...........P",
    "B..a.....b..P",
    "B...__p__...e",
    "_...__p__..._",
    "_..c.....d..D",
    "_..........._",
    "__B_B_____p__",
  ],
  crates: { "1": "laitue", "2": "tomate", "3": "oignon" },
  menu: [
    { r: "salade", w: 3 },
    { r: "soupeOignon", w: 2 },
  ],
  duration: 150,
  gap: [17, 23],
  maxOrders: 3,
  washing: false,
  stars: [100, 220, 320],
  theme: { from: "#e9a25a", to: "#5a2e1e", accent: "#ffd479" },
};

const CREPERIE: KitchenDef = {
  id: "creperie",
  name: "La crêperie du port",
  place: "À bord de la Marie-Galante, au port",
  layout: [
    "#_1__2_nnn_3_#",
    "#............#",
    "4.a...__...b.P",
    "B.....pp.....P",
    "B.....__.....e",
    "_..c......d..D",
    "#............#",
    "#__W_R__T__p_#",
  ],
  crates: { "1": "pateCrepe", "2": "sucre", "3": "jambon", "4": "fromage" },
  menu: [
    { r: "crepeSucre", w: 2 },
    { r: "crepeComplete", w: 3 },
  ],
  duration: 180,
  gap: [16, 22],
  maxOrders: 3,
  washing: true,
  hazard: "tangage",
  stars: [140, 300, 450],
  theme: { from: "#5fb4d8", to: "#173c5c", accent: "#ffe38a" },
};

const CANTINE: KitchenDef = {
  id: "cantine",
  name: "La cantine de l'école",
  place: "L'école Jules-Ferry, à midi",
  layout: [
    "_1_2_3__mmm_nn_",
    "_.............P",
    "B.a.........b.P",
    "B..__p_.......e",
    "_.............D",
    "_.............T",
    "_.......__p_.._",
    "_.c.........d._",
    "__W_R_BB__p____",
  ],
  sections: [
    "000000000000000",
    "000000000000000",
    "000000000000000",
    "000111100000000",
    "000000000000000",
    "000000000000000",
    "000000002222000",
    "000000000000000",
    "000000000000000",
  ],
  motions: {
    1: {
      period: 24,
      moves: [
        { at: 9, s: 3, dx: 6, dy: 0 },
        { at: 21, s: 3, dx: 0, dy: 0 },
      ],
    },
    2: {
      period: 24,
      moves: [
        { at: 9, s: 3, dx: -6, dy: 0 },
        { at: 21, s: 3, dx: 0, dy: 0 },
      ],
    },
  },
  crates: { "1": "patate", "2": "saucisse", "3": "tomate" },
  menu: [
    { r: "pureeSaucisse", w: 3 },
    { r: "soupeTomate", w: 2 },
  ],
  duration: 180,
  gap: [18, 24],
  maxOrders: 3,
  washing: true,
  hazard: "tables",
  stars: [100, 210, 320],
  theme: { from: "#f2c14e", to: "#7a3b1c", accent: "#fff2b8" },
};

const PIZZERIA: KitchenDef = {
  id: "pizzeria",
  name: "La pizzeria sur les toits",
  place: "Sur les toits du vieux Nice",
  layout: [
    "_1_2_3_~_OO_T__",
    "4......~......P",
    "B.a.....b.....P",
    "B..pp..~.._...e",
    "B..__..~.._...D",
    "B......~......_",
    "_..c.......d.._",
    "_......~......_",
    "__W_R__~__p_p__",
  ],
  crates: { "1": "patePizza", "2": "tomate", "3": "fromage", "4": "champi" },
  menu: [
    { r: "margherita", w: 3 },
    { r: "pizzaChampi", w: 2 },
  ],
  duration: 180,
  gap: [19, 25],
  maxOrders: 3,
  washing: true,
  hazard: "vent",
  stars: [120, 260, 400],
  theme: { from: "#f08a5d", to: "#3a2a5c", accent: "#ffd166" },
};

const BRASSERIE: KitchenDef = {
  id: "brasserie",
  name: "La brasserie du marché",
  place: "Lyon, un samedi de marché",
  layout: [
    "_1_2_nn_FF_O_T_",
    "p.............P",
    "B.a.......b...P",
    "B..____..____._",
    "#.............#",
    "_..____..____._",
    "3.c.......d...e",
    "4.............D",
    "_5W_R__BB_p_p__",
  ],
  crates: { "1": "steak", "2": "patate", "3": "base:croque", "4": "jambon", "5": "fromage" },
  menu: [
    { r: "steakFrites", w: 3 },
    { r: "croque", w: 2 },
  ],
  duration: 180,
  gap: [17, 23],
  maxOrders: 4,
  washing: true,
  hazard: "charrettes",
  lane: 4,
  stars: [110, 240, 370],
  theme: { from: "#d96c4a", to: "#3b2a24", accent: "#ffd38a" },
};

const CHALET: KitchenDef = {
  id: "chalet",
  name: "Le chalet sous la neige",
  place: "Un refuge, là-haut dans les Alpes",
  layout: [
    "_m_m_m_B_#_1_2_",
    "p........#,,,,3",
    "B.a......#,,,,_",
    "B....__..,,,,,_",
    "P....pp..,,b,,_",
    "P....__..,,,,,_",
    "e.c......#,,,,_",
    "D....d...#,,,,_",
    "__W_R_BT_#_____",
  ],
  crates: { "1": "fromage", "2": "pain", "3": "champi" },
  menu: [
    { r: "fondue", w: 3 },
    { r: "veloute", w: 2 },
  ],
  duration: 180,
  gap: [18, 24],
  maxOrders: 3,
  washing: true,
  hazard: "verglas",
  stars: [100, 210, 300],
  theme: { from: "#9cc7e8", to: "#23314f", accent: "#ffe7b0" },
};

const TRAIN: KitchenDef = {
  id: "train",
  name: "Le train de nuit",
  place: "La voiture-restaurant, quelque part vers le Sud",
  layout: ["_1_2_3_nn__mm_4e_", "_........B......P", "B.a.............P", "B......._..b....F", "_.c......_....d.F", "__W_R_pp____p_TD_"],
  sections: ["00000000011111111", "00000000011111111", "00000000011111111", "00000000011111111", "00000000011111111", "00000000011111111"],
  motions: {
    1: {
      period: 30,
      ground: "void",
      moves: [
        { at: 14, s: 2.5, dx: 1.6, dy: 0 },
        { at: 22, s: 2.5, dx: 0, dy: 0 },
      ],
    },
  },
  crates: { "1": "laitue", "2": "tomate", "3": "steak", "4": "patate" },
  menu: [
    { r: "salade", w: 2 },
    { r: "steakFrites", w: 3 },
    { r: "soupeTomate", w: 1 },
  ],
  duration: 180,
  gap: [16, 22],
  maxOrders: 4,
  washing: true,
  hazard: "wagons",
  stars: [80, 180, 280],
  theme: { from: "#5b6fb4", to: "#141a33", accent: "#ffcf73" },
};

const GUINGUETTE: KitchenDef = {
  id: "guinguette",
  name: "La guinguette au bord de l'eau",
  place: "Sur les bords de Marne, un dimanche",
  layout: [
    "_1_B__~~~~_FF_T_",
    "_.....~~~~.....P",
    "B.a...~~~~...b.P",
    "_.......~~.....e",
    "_..pp.._~~.._..D",
    "_.c...~~~~...d.B",
    "_.....~~~~.....3",
    "__W_R_~~~~_mm2p_",
  ],
  sections: [
    "0000000000000000",
    "0000000000000000",
    "0000000000000000",
    "0000001100000000",
    "0000001100000000",
    "0000000000000000",
    "0000000000000000",
    "0000000000000000",
  ],
  motions: {
    1: {
      period: 16,
      ground: "void",
      moves: [
        { at: 4, s: 3, dx: 2, dy: 0 },
        { at: 12, s: 3, dx: 0, dy: 0 },
      ],
    },
  },
  crates: { "1": "poisson", "2": "patate", "3": "moules" },
  menu: [
    { r: "poissonFrites", w: 3 },
    { r: "moulesFrites", w: 2 },
  ],
  duration: 180,
  gap: [18, 24],
  maxOrders: 3,
  washing: true,
  hazard: "radeau",
  stars: [80, 170, 260],
  theme: { from: "#7fc8a9", to: "#1e3b36", accent: "#fff0a8" },
};

const BANQUET: KitchenDef = {
  id: "banquet",
  name: "Le banquet de la fête",
  place: "La salle des fêtes du village de Mémé",
  layout: [
    "_1_2_3_4_nn_BB_OO_",
    "_................P",
    "B.a.........b....P",
    "B...__p_.........e",
    "7................D",
    "5....._p__.......T",
    "6.c.........d...._",
    "__W_R_BB_FF_p__p__",
  ],
  sections: [
    "000000000000000000",
    "000000000000000000",
    "000000000000000000",
    "000011110000000000",
    "000000000000000000",
    "000000222200000000",
    "000000000000000000",
    "000000000000000000",
  ],
  motions: {
    1: {
      period: 28,
      moves: [
        { at: 10, s: 3, dx: 7, dy: 0 },
        { at: 24, s: 3, dx: 0, dy: 0 },
      ],
    },
    2: {
      period: 28,
      moves: [
        { at: 10, s: 3, dx: -5, dy: 0 },
        { at: 24, s: 3, dx: 0, dy: 0 },
      ],
    },
  },
  crates: { "1": "laitue", "2": "tomate", "3": "steak", "4": "patate", "5": "pateTarte", "6": "pomme", "7": "sucre" },
  menu: [
    { r: "salade", w: 2 },
    { r: "steakFrites", w: 3 },
    { r: "tarte", w: 2 },
  ],
  duration: 240,
  gap: [15, 21],
  maxOrders: 4,
  washing: true,
  hazard: "banquet",
  stars: [180, 380, 560],
  theme: { from: "#e8735a", to: "#40203a", accent: "#ffe08a" },
};

export const KITCHENS: Record<KitchenId, KitchenDef> = {
  bistrot: BISTROT,
  creperie: CREPERIE,
  cantine: CANTINE,
  pizzeria: PIZZERIA,
  brasserie: BRASSERIE,
  chalet: CHALET,
  train: TRAIN,
  guinguette: GUINGUETTE,
  banquet: BANQUET,
};

/** Les plats du menu d'une cuisine */
export function menuOf(id: KitchenId): RecipeId[] {
  return KITCHENS[id].menu.map((m) => m.r);
}

/** Les plats du menu, pour l'écran : leur nom et ce qu'ils rapportent */
export function menuNames(id: KitchenId): string[] {
  return menuOf(id).map((r) => RECIPES[r].name);
}

// ---------------------------------------------------------------------------
// Le plan construit : ce que lisent la simulation, les bots et l'écran
// ---------------------------------------------------------------------------

/** Ce qu'est chaque case (un nombre : les plans se comparent vite) */
export const Cell = {
  Floor: 0,
  Ice: 1,
  Void: 2,
  Wall: 3,
  Counter: 4,
  Crate: 5,
  Board: 6,
  Stove: 7,
  Oven: 8,
  Fryer: 9,
  Sink: 10,
  Rack: 11,
  Pass: 12,
  Return: 13,
  Trash: 14,
} as const;
export type Cell = (typeof Cell)[keyof typeof Cell];

/** On marche dessus */
export const walkable = (c: Cell) => c === Cell.Floor || c === Cell.Ice;
/** On s'y cogne (et on peut y poser quelque chose, sauf un mur) */
export const solid = (c: Cell) => c >= Cell.Wall;
/** On peut s'en servir (tout ce qui est solide, sauf les murs) */
export const usable = (c: Cell) => c >= Cell.Counter;
/** Ce qui prend feu */
export const flammable = (c: Cell) => c >= Cell.Counter && c !== Cell.Sink;

/** Ce qui est posé au départ sur une case */
export type StartItem = "pot" | "pan" | "plate" | "ext";

export interface Kitchen {
  id: KitchenId;
  duel: boolean;
  W: number;
  H: number;
  cells: Cell[];
  /** Le morceau de cuisine de chaque case (0 : immobile) */
  section: number[];
  /** L'équipe de chaque case (en duel, la moitié gauche est à l'équipe 0, la droite à l'équipe 1) */
  team: number[];
  /** L'aliment de chaque caisse */
  crate: (CrateGood | null)[];
  /** Ce qui est posé au départ */
  start: { cell: number; item: StartItem }[];
  /** Où se tient chaque chef au départ, pour chaque équipe (en coordonnées du monde, le centre de la case) */
  spawns: [number, number][][];
  /** Les morceaux qui bougent */
  motions: Record<number, Motion>;
  /** Les cases de chaque morceau qui bouge */
  moving: number[][];
  /** Ce qu'il y a à chaque place quand on ne regarde que ce qui ne bouge pas */
  under: Cell[];
  def: KitchenDef;
}

const CELL_OF: Record<string, Cell> = {
  "#": Cell.Wall,
  ".": Cell.Floor,
  ",": Cell.Ice,
  "~": Cell.Void,
  _: Cell.Counter,
  B: Cell.Board,
  S: Cell.Stove,
  m: Cell.Stove,
  n: Cell.Stove,
  O: Cell.Oven,
  F: Cell.Fryer,
  W: Cell.Sink,
  R: Cell.Rack,
  P: Cell.Pass,
  D: Cell.Return,
  T: Cell.Trash,
  p: Cell.Counter,
  e: Cell.Counter,
  a: Cell.Floor,
  b: Cell.Floor,
  c: Cell.Floor,
  d: Cell.Floor,
};

const START_OF: Record<string, StartItem> = { m: "pot", n: "pan", p: "plate", e: "ext" };
const SPAWN_ORDER = ["a", "b", "c", "d"];

const cache = new Map<string, Kitchen>();

/**
 * Le plan d'une cuisine, prêt à servir. En duel, la cuisine est posée deux fois côte à côte, la seconde en miroir,
 * avec un mur entre les deux.
 */
export function buildKitchen(id: KitchenId, duel = false): Kitchen {
  const key = `${id}:${duel ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = KITCHENS[id];
  const w0 = def.layout[0]!.length;
  const h = def.layout.length;
  const W = duel ? w0 * 2 + 1 : w0;
  const cells: Cell[] = new Array(W * h).fill(Cell.Wall);
  const section: number[] = new Array(W * h).fill(0);
  const team: number[] = new Array(W * h).fill(0);
  const crate: (CrateGood | null)[] = new Array(W * h).fill(null);
  const start: Kitchen["start"] = [];
  const spawns: [number, number][][] = duel ? [[], []] : [[]];
  const motions: Record<number, Motion> = {};
  const sectionCount = Math.max(0, ...Object.keys(def.motions ?? {}).map(Number));
  const copies = duel ? 2 : 1;
  for (let side = 0; side < copies; side++) {
    const found: { order: number; x: number; y: number }[] = [];
    for (let y = 0; y < h; y++) {
      const row = def.layout[y]!;
      const secRow = def.sections?.[y] ?? "";
      for (let x0 = 0; x0 < w0; x0++) {
        const ch = row[x0]!;
        const x = side === 0 ? x0 : W - 1 - x0;
        const i = y * W + x;
        cells[i] = CELL_OF[ch] ?? (/[1-9]/.test(ch) ? Cell.Crate : Cell.Wall);
        team[i] = side;
        const sec = Number(secRow[x0] ?? "0") || 0;
        // En duel, les morceaux qui bougent de la seconde cuisine ont leur propre numéro (et un mouvement en miroir)
        section[i] = sec === 0 ? 0 : sec + side * sectionCount;
        if (/[1-9]/.test(ch)) crate[i] = def.crates[ch] ?? null;
        const s = START_OF[ch];
        if (s) start.push({ cell: i, item: s });
        const order = SPAWN_ORDER.indexOf(ch);
        if (order >= 0) found.push({ order, x: x + 0.5, y: y + 0.5 });
      }
    }
    found.sort((a, b) => a.order - b.order);
    spawns[side] = found.map((f) => [f.x, f.y]);
    for (const [k, m] of Object.entries(def.motions ?? {})) {
      const n = Number(k) + side * sectionCount;
      motions[n] = side === 0 ? m : { ...m, moves: m.moves.map((mv) => ({ ...mv, dx: -mv.dx })) };
    }
  }
  if (duel) for (let y = 0; y < h; y++) cells[y * W + w0] = Cell.Wall;
  const moving: number[][] = [];
  section.forEach((s, i) => {
    if (s > 0) (moving[s] ??= []).push(i);
  });
  // Ce qu'il y a sous chaque case quand rien ne bouge par-dessus : le plan lui-même, ou, sous un morceau qui bouge, le
  // sol (des tables qui glissent) ou le vide (un wagon, un radeau)
  const under = cells.map((c, i) => (section[i] === 0 ? c : motions[section[i]!]?.ground === "void" ? Cell.Void : Cell.Floor));
  const k: Kitchen = { id, duel, W, H: h, cells, section, team, crate, start, spawns, motions, moving, under, def };
  cache.set(key, k);
  return k;
}

/** Le décalage d'un morceau de cuisine qui bouge, à ce moment du service (en secondes depuis le début) */
export function motionOffset(m: Motion | undefined, t: number): [number, number] {
  if (!m || m.moves.length === 0) return [0, 0];
  const u = ((t % m.period) + m.period) % m.period;
  // La position de départ de la boucle : là où mène la dernière glissade
  const last = m.moves[m.moves.length - 1]!;
  let x = last.dx;
  let y = last.dy;
  for (const mv of m.moves) {
    if (u < mv.at) break;
    const k = mv.s <= 0 ? 1 : Math.min(1, (u - mv.at) / mv.s);
    // Une glissade en douceur (départ et arrivée lents) : seulement des produits, pas de trigonométrie
    const e = k * k * (3 - 2 * k);
    x = x + (mv.dx - x) * e;
    y = y + (mv.dy - y) * e;
  }
  return [x, y];
}

/** Ce que sort la caisse : un aliment, ou un fond à garnir */
export function crateGood(g: CrateGood): { food: FoodId } | { base: BaseKind } {
  return g.startsWith("base:") ? { base: g.slice(5) as BaseKind } : { food: g as FoodId };
}
