// Un trou de minigolf : sa description (des morceaux de sol qui se touchent sans se chevaucher, des murs, des poteaux,
// des obstacles qui bougent, des tremplins, des téléporteurs, des tubes…), puis sa forme « compilée » pour la physique :
// les bordures posées d'office sur le tour du parcours, les falaises là où deux morceaux voisins n'ont pas la même
// hauteur, une grille pour trouver vite le sol et les murs proches de la balle.
//
// Les morceaux de sol forment une partition : deux morceaux voisins partagent exactement leur bord (les sommets de l'un
// peuvent tomber au milieu d'un bord de l'autre). Un morceau peut avoir des trous, où d'autres morceaux se posent (une
// fosse de sable dans un green). C'est ce qui permet de savoir, sans calcul de polygones, où passe le tour du parcours.

import { boxOf, clamp, inBox, inRings, mirrorPt, segClosest, type Box, type P3, type Pt } from "./geom.ts";
import { bumpsHeight, mirrorSpec, specHeight, type Bump, type HeightSpec } from "./height.ts";

// ---------------------------------------------------------------------------
// Les mesures
// ---------------------------------------------------------------------------

/** Rayon de la balle */
export const BALL_R = 0.055;
/** Rayon du trou */
export const CUP_R = 0.125;
/** Au-dessus de ce cercle, la balle n'est plus portée : elle tombe */
export const CUP_FALL = CUP_R - BALL_R * 0.4;
/** La cuvette douce autour du trou : rayon et profondeur */
export const FUNNEL_R = 0.42;
export const FUNNEL_D = 0.009;
/** Hauteur des bordures posées sur le tour du parcours */
export const RAIL_H = 0.1;
/** Épaisseur des bordures (de part et d'autre de leur ligne) */
export const RAIL_T = 0.035;
/** Au-delà de cet écart de hauteur entre deux morceaux voisins, leur bord est une falaise */
export const CLIFF_MIN = 0.015;
/** Les murs plus longs sont découpés, pour suivre le sol */
const WALL_PIECE = 0.5;

// ---------------------------------------------------------------------------
// Les matières du sol
// ---------------------------------------------------------------------------

export type Mat =
  | "green"
  | "fairway"
  | "carpet"
  | "sand"
  | "snow"
  | "ice"
  | "wood"
  | "stone"
  | "metal"
  | "rubber"
  | "dirt"
  | "glass"
  | "moon"
  | "water"
  | "lava";

export interface MatPhys {
  /** Freinage en roulant (m/s²) */
  roll: number;
  /** Rebond en retombant (0 : colle, 1 : rebondit tout) */
  bounce: number;
  /** L'eau, la lave : la balle y est perdue */
  hazard?: boolean;
}

export const MATS: Record<Mat, MatPhys> = {
  green: { roll: 0.52, bounce: 0.32 },
  fairway: { roll: 0.72, bounce: 0.28 },
  carpet: { roll: 0.62, bounce: 0.3 },
  sand: { roll: 4.2, bounce: 0.04 },
  snow: { roll: 2.3, bounce: 0.06 },
  ice: { roll: 0.11, bounce: 0.38 },
  wood: { roll: 0.62, bounce: 0.45 },
  stone: { roll: 0.7, bounce: 0.42 },
  metal: { roll: 0.55, bounce: 0.5 },
  rubber: { roll: 1.1, bounce: 0.78 },
  dirt: { roll: 1.35, bounce: 0.2 },
  glass: { roll: 0.42, bounce: 0.5 },
  moon: { roll: 0.6, bounce: 0.3 },
  water: { roll: 0, bounce: 0, hazard: true },
  lava: { roll: 0, bounce: 0, hazard: true },
};

// ---------------------------------------------------------------------------
// La description d'un trou
// ---------------------------------------------------------------------------

/** Ce qui fait glisser le sol sous la balle : un tapis roulant, un plateau tournant */
export type Flow = { k: "belt"; v: Pt } | { k: "spin"; c: Pt; w: number };

export interface TileDef {
  /** Le contour, puis les trous */
  rings: Pt[][];
  h: HeightSpec;
  bumps?: Bump[];
  mat: Mat;
  flow?: Flow;
  /** Pas de bordure sur ses bords qui donnent sur le vide */
  noRail?: boolean;
  /** L'allure (au choix du thème : « buis », « bois », « pierre »…) */
  look?: string;
}

export interface WallDef {
  pts: Pt[];
  /** Hauteur au-dessus du sol */
  h: number;
  /** Demi-épaisseur */
  t?: number;
  /** Fermé (le dernier point rejoint le premier) */
  closed?: boolean;
  /** Rebond (0,7 par défaut) */
  e?: number;
  look?: string;
}

export interface PostDef {
  c: Pt;
  r: number;
  h: number;
  /** Rebond ; au-dessus de 1, un champignon qui renvoie plus fort */
  e?: number;
  /** Vitesse minimale au départ d'un champignon */
  kick?: number;
  look?: string;
}

export type Motion =
  /** Rotation autour d'un axe vertical qui passe par c (w en radians par seconde) */
  | { k: "spin"; c: Pt; w: number; a0?: number }
  /** Rotation autour d'un axe horizontal (dans la direction axis) qui passe par c */
  | { k: "wheel"; c: P3; axis: Pt; w: number; a0?: number }
  /** Balancier autour d'un axe horizontal : angle = amp·sin(w·t + a0) */
  | { k: "swing"; c: P3; axis: Pt; amp: number; w: number; a0?: number }
  /** Va-et-vient de 0 à d puis retour, en `period` secondes ; « piston » : arrêt aux deux bouts */
  | { k: "slide"; d: P3; period: number; a0?: number; shape?: "sine" | "piston" };

export type Part =
  /** Un mur vertical (hauteurs absolues) */
  | { k: "wall"; a: Pt; b: Pt; y0: number; y1: number; t: number }
  /** Un poteau vertical */
  | { k: "post"; c: Pt; r: number; y0: number; y1: number }
  /** Un cylindre aux bouts arrondis, dans n'importe quelle direction (une pale, une bûche) */
  | { k: "cap"; a: P3; b: P3; r: number };

export interface MoverDef {
  motion: Motion;
  parts: Part[];
  look: string;
  e?: number;
}

export interface PortalDef {
  /** L'entrée */
  a: Pt;
  r: number;
  /** La sortie, et la direction où part la balle */
  b: Pt;
  dir: number;
  look?: string;
}

export interface PadDef {
  c: Pt;
  r: number;
  /** Vitesse vers le haut donnée à la balle */
  vy: number;
  /** Poussée horizontale ajoutée */
  push?: Pt;
  /** Un geyser : actif `on` (fraction) de chaque période */
  period?: number;
  on?: number;
  a0?: number;
  look?: string;
}

export interface BoostDef {
  ring: Pt[];
  /** Direction (radians) et vitesse visée */
  dir: number;
  speed: number;
  look?: string;
}

export interface WindDef {
  ring: Pt[];
  /** Accélération (m/s²) */
  acc: Pt;
  period?: number;
  on?: number;
  look?: string;
}

/** Un tube, une boucle, une goulotte : la balle qui entre au premier point suit le chemin jusqu'au dernier */
export interface RailDef {
  pts: P3[];
  /** Rayon de l'entrée */
  r: number;
  look: string;
}

/** Un décor (sans effet sur la balle) : un arbre, une statue… placé par le parcours, dessiné par le thème */
export interface DecoDef {
  k: string;
  at: Pt;
  y?: number;
  s?: number;
  r?: number;
  v?: number;
}

export interface HoleDef {
  name: string;
  par: number;
  tee: { at: Pt; aim: number };
  cups: Pt[];
  tiles: TileDef[];
  walls: WallDef[];
  posts: PostDef[];
  movers: MoverDef[];
  portals: PortalDef[];
  pads: PadDef[];
  boosts: BoostDef[];
  winds: WindDef[];
  rails: RailDef[];
  /** Les bulles de bonus */
  items: Pt[];
  decos: DecoDef[];
  /** Les zones où le tour du parcours reste sans bordure (un saut, un raccourci au-dessus du vide) */
  opens: Pt[][];
  /** Pour les bots : des passages que le sol ne montre pas (un saut au-dessus de l'eau), de `from` à `to` */
  links: { from: Pt; to: Pt }[];
  /** Le sol hors du parcours : la balle qui l'atteint est hors limites */
  outY: number;
  /** Durée du trou en secondes (sinon d'après le par) */
  time?: number;
  /** Une phrase pour le présenter */
  hint?: string;
}

// ---------------------------------------------------------------------------
// Le symétrique d'un trou (la droite et la gauche échangées) : autant de trous en plus
// ---------------------------------------------------------------------------

export function mirrorHole(def: HoleDef): HoleDef {
  const m = mirrorPt;
  const m3 = (p: P3): P3 => [-p[0], p[1], p[2]];
  // Un anneau reflété tourne dans l'autre sens : on le remet dans le même
  const ring = (r: Pt[]) => r.map(m).reverse();
  const dir = (a: number) => Math.PI - a;
  const motion = (mo: Motion): Motion => {
    switch (mo.k) {
      case "spin":
        return { ...mo, c: m(mo.c), w: -mo.w, a0: -(mo.a0 ?? 0) };
      case "wheel":
        return { ...mo, c: m3(mo.c), axis: [mo.axis[0], -mo.axis[1]], w: mo.w, a0: mo.a0 };
      case "swing":
        return { ...mo, c: m3(mo.c), axis: [mo.axis[0], -mo.axis[1]] };
      case "slide":
        return { ...mo, d: m3(mo.d) };
    }
  };
  const part = (p: Part): Part => {
    switch (p.k) {
      case "wall":
        return { ...p, a: m(p.b), b: m(p.a) };
      case "post":
        return { ...p, c: m(p.c) };
      case "cap":
        return { ...p, a: m3(p.a), b: m3(p.b) };
    }
  };
  return {
    ...def,
    tee: { at: m(def.tee.at), aim: dir(def.tee.aim) },
    cups: def.cups.map(m),
    tiles: def.tiles.map((t) => ({
      ...t,
      rings: t.rings.map(ring),
      h: mirrorSpec(t.h),
      bumps: t.bumps?.map((b) => ({ ...b, c: m(b.c) })),
      flow: t.flow
        ? t.flow.k === "belt"
          ? { k: "belt", v: [-t.flow.v[0], t.flow.v[1]] }
          : { k: "spin", c: m(t.flow.c), w: -t.flow.w }
        : undefined,
    })),
    walls: def.walls.map((w) => ({ ...w, pts: w.pts.map(m) })),
    posts: def.posts.map((p) => ({ ...p, c: m(p.c) })),
    movers: def.movers.map((mv) => ({ ...mv, motion: motion(mv.motion), parts: mv.parts.map(part) })),
    portals: def.portals.map((p) => ({ ...p, a: m(p.a), b: m(p.b), dir: dir(p.dir) })),
    pads: def.pads.map((p) => ({ ...p, c: m(p.c), push: p.push ? [-p.push[0], p.push[1]] : undefined })),
    boosts: def.boosts.map((b) => ({ ...b, ring: ring(b.ring), dir: dir(b.dir) })),
    winds: def.winds.map((w) => ({ ...w, ring: ring(w.ring), acc: [-w.acc[0], w.acc[1]] })),
    rails: def.rails.map((r) => ({ ...r, pts: r.pts.map(m3) })),
    items: def.items.map(m),
    decos: def.decos.map((d) => ({ ...d, at: m(d.at), r: d.r !== undefined ? -d.r : undefined })),
    opens: def.opens.map(ring),
    links: def.links.map((l) => ({ from: m(l.from), to: m(l.to) })),
  };
}

// ---------------------------------------------------------------------------
// La forme compilée
// ---------------------------------------------------------------------------

export interface CTile {
  rings: Pt[][];
  box: Box;
  h: HeightSpec;
  bumps: Bump[] | undefined;
  mat: Mat;
  phys: MatPhys;
  flow: Flow | undefined;
  look: string | undefined;
}

export type WallKind = "rail" | "cliff" | "wall";

/** Un mur droit : de a à b vu de dessus, avec son bas et son haut à chaque bout */
export interface CWall {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Bas et haut en a, puis en b */
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  /** Demi-épaisseur */
  t: number;
  e: number;
  kind: WallKind;
  look: string | undefined;
  /** Le morceau de sol qu'il borde (bordures et falaises : celui du côté haut), ou -1 */
  tile: number;
}

export interface CPost {
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
  e: number;
  kick: number;
  look: string | undefined;
}

export interface CMover {
  def: MoverDef;
  /** Tout l'espace balayé pendant un tour (agrandi du rayon de la balle) */
  sweep: Box;
  /** Le haut de ce qu'il balaie */
  top: number;
}

export interface CRail {
  def: RailDef;
  /** Les longueurs cumulées le long du chemin */
  len: number[];
  total: number;
}

export interface CCup {
  x: number;
  z: number;
  /** La hauteur du bord du trou */
  rim: number;
}

export interface Course {
  def: HoleDef;
  mirrored: boolean;
  tiles: CTile[];
  walls: CWall[];
  posts: CPost[];
  movers: CMover[];
  rails: CRail[];
  cups: CCup[];
  tee: { x: number; y: number; z: number; aim: number };
  /** Où la balle est perdue en tombant */
  killY: number;
  box: Box;
  /** Grilles : les morceaux de sol et les murs par case */
  grid: { x0: number; z0: number; size: number; nx: number; nz: number; tiles: number[][]; walls: number[][] };
}

const GRID = 0.75;

/** Prépare un trou pour la physique (et pour le dessin : les bordures et les falaises sont les mêmes) */
export function compileHole(source: HoleDef, mirror = false): Course {
  const def = mirror ? mirrorHole(source) : source;
  const tiles: CTile[] = def.tiles.map((t) => ({
    rings: t.rings,
    box: boxOf(t.rings[0]!),
    h: t.h,
    bumps: t.bumps,
    mat: t.mat,
    phys: MATS[t.mat],
    flow: t.flow,
    look: t.look,
  }));
  const all: Pt[] = tiles.flatMap((t) => t.rings[0]!);
  const box = boxOf(all, 1);
  const size = GRID;
  const nx = Math.max(1, Math.ceil((box.x1 - box.x0) / size));
  const nz = Math.max(1, Math.ceil((box.z1 - box.z0) / size));
  const grid = {
    x0: box.x0,
    z0: box.z0,
    size,
    nx,
    nz,
    tiles: Array.from({ length: nx * nz }, () => [] as number[]),
    walls: Array.from({ length: nx * nz }, () => [] as number[]),
  };
  tiles.forEach((t, i) => forCells(grid, t.box, 0.01, (cell) => grid.tiles[cell]!.push(i)));
  const course: Course = {
    def,
    mirrored: mirror,
    tiles,
    walls: [],
    posts: [],
    movers: [],
    rails: [],
    cups: [],
    tee: { x: def.tee.at[0], y: 0, z: def.tee.at[1], aim: def.tee.aim },
    killY: def.outY - 0.5,
    box,
    grid,
  };
  // Les trous d'abord : la cuvette autour d'eux change la hauteur du sol
  course.cups = def.cups.map((c) => ({ x: c[0], z: c[1], rim: 0 }));
  for (const cup of course.cups) {
    let s = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      s += heightAt(course, cup.x + Math.cos(a) * CUP_R, cup.z + Math.sin(a) * CUP_R);
    }
    cup.rim = s / 8;
  }
  course.tee.y = heightAt(course, course.tee.x, course.tee.z) + BALL_R;
  course.walls = buildEdges(course);
  for (const w of def.walls) addWall(course, w);
  course.posts = def.posts.map((p) => {
    const g = heightAt(course, p.c[0], p.c[1]);
    return { x: p.c[0], z: p.c[1], r: p.r, y0: g - 3, y1: g + p.h, e: p.e ?? 0.7, kick: p.kick ?? 0, look: p.look };
  });
  course.movers = def.movers.map((m) => ({ def: m, ...moverSweep(m) }));
  course.rails = def.rails.map((r) => {
    const len = [0];
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1]!;
      const b = r.pts[i]!;
      len.push(len[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    return { def: r, len, total: len[len.length - 1]! };
  });
  course.walls.forEach((w, i) => {
    const pad = w.t + BALL_R + 0.02;
    forCells(
      grid,
      { x0: Math.min(w.ax, w.bx), z0: Math.min(w.az, w.bz), x1: Math.max(w.ax, w.bx), z1: Math.max(w.az, w.bz) },
      pad,
      (cell) => grid.walls[cell]!.push(i),
    );
  });
  return course;
}

function forCells(grid: Course["grid"], b: Box, pad: number, fn: (cell: number) => void) {
  const i0 = clamp(Math.floor((b.x0 - pad - grid.x0) / grid.size), 0, grid.nx - 1);
  const i1 = clamp(Math.floor((b.x1 + pad - grid.x0) / grid.size), 0, grid.nx - 1);
  const j0 = clamp(Math.floor((b.z0 - pad - grid.z0) / grid.size), 0, grid.nz - 1);
  const j1 = clamp(Math.floor((b.z1 + pad - grid.z0) / grid.size), 0, grid.nz - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * grid.nx + i);
}

/** La case de la grille où tombe ce point (-1 hors de la grille) */
export function cellOf(c: Course, x: number, z: number): number {
  const g = c.grid;
  const i = Math.floor((x - g.x0) / g.size);
  const j = Math.floor((z - g.z0) / g.size);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return -1;
  return j * g.nx + i;
}

// ---------------------------------------------------------------------------
// Le sol
// ---------------------------------------------------------------------------

/** Le morceau de sol sous ce point (-1 : le vide). `hint` : celui d'avant, essayé en premier */
export function tileAt(c: Course, x: number, z: number, hint = -1): number {
  if (hint >= 0) {
    const t = c.tiles[hint]!;
    if (inBox(x, z, t.box) && inRings(x, z, t.rings)) return hint;
  }
  const cell = cellOf(c, x, z);
  if (cell < 0) return -1;
  for (const i of c.grid.tiles[cell]!) {
    if (i === hint) continue;
    const t = c.tiles[i]!;
    if (inBox(x, z, t.box) && inRings(x, z, t.rings)) return i;
  }
  return -1;
}

/** La hauteur d'un morceau de sol en ce point (même hors de lui : sa forme prolongée), cuvettes des trous comprises */
export function tileHeight(c: Course, tile: number, x: number, z: number): number {
  const t = c.tiles[tile]!;
  let h = specHeight(t.h, x, z) + bumpsHeight(t.bumps, x, z);
  for (const cup of c.cups) {
    const dx = x - cup.x;
    const dz = z - cup.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= FUNNEL_R * FUNNEL_R) continue;
    const k = Math.cos((Math.sqrt(d2) / FUNNEL_R) * (Math.PI / 2));
    h -= FUNNEL_D * k * k;
  }
  return h;
}

/** La hauteur du sol en ce point (celle du morceau qui le porte ; le sol hors parcours sinon) */
export function heightAt(c: Course, x: number, z: number): number {
  const t = tileAt(c, x, z);
  return t >= 0 ? tileHeight(c, t, x, z) : c.def.outY;
}

/** La pente d'un morceau en ce point : montée par mètre selon x et selon z */
export function tileSlope(c: Course, tile: number, x: number, z: number, out: { gx: number; gz: number }) {
  const d = 0.004;
  out.gx = (tileHeight(c, tile, x + d, z) - tileHeight(c, tile, x - d, z)) / (2 * d);
  out.gz = (tileHeight(c, tile, x, z + d) - tileHeight(c, tile, x, z - d)) / (2 * d);
}

// ---------------------------------------------------------------------------
// Les bordures et les falaises, d'après les bords des morceaux
// ---------------------------------------------------------------------------

interface Edge {
  tile: number;
  a: Pt;
  b: Pt;
}

const SNAP = 1e-4;

function buildEdges(c: Course): CWall[] {
  // 1. Les sommets proches se confondent
  const canon = new Map<string, Pt>();
  const keyOf = (x: number, z: number) => `${Math.round(x / SNAP)},${Math.round(z / SNAP)}`;
  const snap = (p: Pt): Pt => {
    const kx = Math.round(p[0] / SNAP);
    const kz = Math.round(p[1] / SNAP);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const found = canon.get(`${kx + dx},${kz + dz}`);
        if (found && Math.abs(found[0] - p[0]) <= SNAP * 1.5 && Math.abs(found[1] - p[1]) <= SNAP * 1.5) return found;
      }
    canon.set(keyOf(p[0], p[1]), p);
    return p;
  };
  const rings = c.tiles.map((t) => t.rings.map((r) => r.map(snap)));
  const verts = [...canon.values()];
  // 2. Chaque bord est coupé aux sommets des autres qui tombent dessus
  const edges: Edge[] = [];
  rings.forEach((tileRings, tile) => {
    for (const ring of tileRings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        if (a === b) continue;
        const cuts: { s: number; p: Pt }[] = [];
        const minX = Math.min(a[0], b[0]) - SNAP;
        const maxX = Math.max(a[0], b[0]) + SNAP;
        const minZ = Math.min(a[1], b[1]) - SNAP;
        const maxZ = Math.max(a[1], b[1]) + SNAP;
        for (const v of verts) {
          if (v === a || v === b || v[0] < minX || v[0] > maxX || v[1] < minZ || v[1] > maxZ) continue;
          const { d2, s } = segClosest(v[0], v[1], a[0], a[1], b[0], b[1]);
          if (d2 <= SNAP * SNAP * 4 && s > 1e-6 && s < 1 - 1e-6) cuts.push({ s, p: v });
        }
        cuts.sort((x, y) => x.s - y.s);
        let prev = a;
        for (const cut of cuts) {
          if (cut.p !== prev) edges.push({ tile, a: prev, b: cut.p });
          prev = cut.p;
        }
        if (prev !== b) edges.push({ tile, a: prev, b });
      }
    }
  });
  // 3. Un bord partagé par deux morceaux est intérieur ; seul, il est sur le tour du parcours
  const shared = new Map<string, Edge[]>();
  const pkey = (p: Pt) => keyOf(p[0], p[1]);
  for (const e of edges) {
    const ka = pkey(e.a);
    const kb = pkey(e.b);
    const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    const list = shared.get(k);
    if (list) list.push(e);
    else shared.set(k, [e]);
  }
  const walls: CWall[] = [];
  for (const list of shared.values()) {
    if (list.length === 1) {
      const e = list[0]!;
      const def = c.def.tiles[e.tile]!;
      if (def.noRail) continue;
      railPieces(c, e, walls);
    } else {
      // Deux morceaux (plus serait une erreur de dessin, que les tests attrapent) : une falaise s'ils ne sont pas à la même hauteur
      cliffPieces(c, list[0]!, list[1]!.tile, walls);
    }
  }
  return walls;
}

function railPieces(c: Course, e: Edge, out: CWall[]) {
  const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
  const n = Math.max(1, Math.ceil(len / WALL_PIECE));
  const look = c.def.tiles[e.tile]!.look;
  for (let i = 0; i < n; i++) {
    const ax = e.a[0] + ((e.b[0] - e.a[0]) * i) / n;
    const az = e.a[1] + ((e.b[1] - e.a[1]) * i) / n;
    const bx = e.a[0] + ((e.b[0] - e.a[0]) * (i + 1)) / n;
    const bz = e.a[1] + ((e.b[1] - e.a[1]) * (i + 1)) / n;
    // Pas de bordure dans une zone ouverte
    if (c.def.opens.some((o) => inRings((ax + bx) / 2, (az + bz) / 2, [o]))) continue;
    const ha = tileHeight(c, e.tile, ax, az);
    const hb = tileHeight(c, e.tile, bx, bz);
    out.push({
      ax,
      az,
      bx,
      bz,
      a0: ha - 3,
      a1: ha + RAIL_H,
      b0: hb - 3,
      b1: hb + RAIL_H,
      t: RAIL_T,
      e: 0.7,
      kind: "rail",
      look,
      tile: e.tile,
    });
  }
}

function cliffPieces(c: Course, e: Edge, other: number, out: CWall[]) {
  const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
  const n = Math.max(1, Math.ceil(len / 0.25));
  for (let i = 0; i < n; i++) {
    const ax = e.a[0] + ((e.b[0] - e.a[0]) * i) / n;
    const az = e.a[1] + ((e.b[1] - e.a[1]) * i) / n;
    const bx = e.a[0] + ((e.b[0] - e.a[0]) * (i + 1)) / n;
    const bz = e.a[1] + ((e.b[1] - e.a[1]) * (i + 1)) / n;
    const hA0 = tileHeight(c, e.tile, ax, az);
    const hA1 = tileHeight(c, e.tile, bx, bz);
    const hB0 = tileHeight(c, other, ax, az);
    const hB1 = tileHeight(c, other, bx, bz);
    const mid = Math.abs((hA0 + hA1) / 2 - (hB0 + hB1) / 2);
    if (Math.max(Math.abs(hA0 - hB0), Math.abs(hA1 - hB1), mid) <= CLIFF_MIN) continue;
    const high = (hA0 + hA1) / 2 >= (hB0 + hB1) / 2 ? e.tile : other;
    out.push({
      ax,
      az,
      bx,
      bz,
      a0: Math.min(hA0, hB0) - 3,
      a1: Math.max(hA0, hB0),
      b0: Math.min(hA1, hB1) - 3,
      b1: Math.max(hA1, hB1),
      t: 0.004,
      e: 0.55,
      kind: "cliff",
      look: c.def.tiles[high]!.look,
      tile: high,
    });
  }
}

function addWall(c: Course, w: WallDef) {
  const pts = w.closed ? [...w.pts, w.pts[0]!] : w.pts;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!;
    const b = pts[k]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / WALL_PIECE));
    for (let i = 0; i < n; i++) {
      const ax = a[0] + ((b[0] - a[0]) * i) / n;
      const az = a[1] + ((b[1] - a[1]) * i) / n;
      const bx = a[0] + ((b[0] - a[0]) * (i + 1)) / n;
      const bz = a[1] + ((b[1] - a[1]) * (i + 1)) / n;
      const ha = heightAt(c, ax, az);
      const hb = heightAt(c, bx, bz);
      c.walls.push({
        ax,
        az,
        bx,
        bz,
        a0: ha - 3,
        a1: ha + w.h,
        b0: hb - 3,
        b1: hb + w.h,
        t: w.t ?? 0.05,
        e: w.e ?? 0.7,
        kind: "wall",
        look: w.look,
        tile: -1,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Ce qui bouge
// ---------------------------------------------------------------------------

/** Une pose : p_monde = rot·(p − pivot) + pivot + move */
export interface Pose {
  /** Rotation, ligne par ligne */
  m: number[];
  pivot: P3;
  move: P3;
}

const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function axisRot(kx: number, ky: number, kz: number, a: number): number[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  return [
    c + kx * kx * t,
    kx * ky * t - kz * s,
    kx * kz * t + ky * s,
    ky * kx * t + kz * s,
    c + ky * ky * t,
    ky * kz * t - kx * s,
    kz * kx * t - ky * s,
    kz * ky * t + kx * s,
    c + kz * kz * t,
  ];
}

/** Où en est le va-et-vient (0 à 1) */
export function slideAmount(shape: "sine" | "piston" | undefined, phase: number): number {
  const p = phase - Math.floor(phase);
  if (shape === "piston") {
    // Arrêt 30 %, aller 20 %, arrêt 30 %, retour 20 %
    const s = (u: number) => u * u * (3 - 2 * u);
    if (p < 0.3) return 0;
    if (p < 0.5) return s((p - 0.3) / 0.2);
    if (p < 0.8) return 1;
    return 1 - s((p - 0.8) / 0.2);
  }
  return (1 - Math.cos(p * Math.PI * 2)) / 2;
}

/** La pose d'un obstacle mobile au temps t (secondes depuis le début du trou) */
export function poseAt(m: Motion, t: number): Pose {
  switch (m.k) {
    case "spin": {
      // Vu de dessus, x vers la droite et z vers le bas : un angle positif tourne de x vers z
      const a = (m.a0 ?? 0) + m.w * t;
      return { m: axisRot(0, -1, 0, a), pivot: [m.c[0], 0, m.c[1]], move: [0, 0, 0] };
    }
    case "wheel": {
      const l = Math.hypot(m.axis[0], m.axis[1]) || 1;
      const a = (m.a0 ?? 0) + m.w * t;
      return { m: axisRot(m.axis[0] / l, 0, m.axis[1] / l, a), pivot: m.c, move: [0, 0, 0] };
    }
    case "swing": {
      const l = Math.hypot(m.axis[0], m.axis[1]) || 1;
      const a = m.amp * Math.sin(m.w * t + (m.a0 ?? 0));
      return { m: axisRot(m.axis[0] / l, 0, m.axis[1] / l, a), pivot: m.c, move: [0, 0, 0] };
    }
    case "slide": {
      const k = slideAmount(m.shape, t / m.period + (m.a0 ?? 0));
      return { m: ID, pivot: [0, 0, 0], move: [m.d[0] * k, m.d[1] * k, m.d[2] * k] };
    }
  }
}

/** Un point posé selon la pose */
export function posePoint(p: Pose, x: number, y: number, z: number): P3 {
  const m = p.m;
  const lx = x - p.pivot[0];
  const ly = y - p.pivot[1];
  const lz = z - p.pivot[2];
  return [
    m[0]! * lx + m[1]! * ly + m[2]! * lz + p.pivot[0] + p.move[0],
    m[3]! * lx + m[4]! * ly + m[5]! * lz + p.pivot[1] + p.move[1],
    m[6]! * lx + m[7]! * ly + m[8]! * lz + p.pivot[2] + p.move[2],
  ];
}

/** Le point du monde ramené dans le repère de l'obstacle (l'inverse de posePoint) */
export function unposePoint(p: Pose, x: number, y: number, z: number): P3 {
  const m = p.m;
  const lx = x - p.pivot[0] - p.move[0];
  const ly = y - p.pivot[1] - p.move[1];
  const lz = z - p.pivot[2] - p.move[2];
  return [
    m[0]! * lx + m[3]! * ly + m[6]! * lz + p.pivot[0],
    m[1]! * lx + m[4]! * ly + m[7]! * lz + p.pivot[1],
    m[2]! * lx + m[5]! * ly + m[8]! * lz + p.pivot[2],
  ];
}

/** Une direction tournée selon la pose */
export function poseDir(p: Pose, x: number, y: number, z: number): P3 {
  const m = p.m;
  return [m[0]! * x + m[1]! * y + m[2]! * z, m[3]! * x + m[4]! * y + m[5]! * z, m[6]! * x + m[7]! * y + m[8]! * z];
}

/** La période d'un mouvement (pour en faire le tour) */
export function motionPeriod(m: Motion): number {
  switch (m.k) {
    case "spin":
    case "wheel":
    case "swing":
      return Math.abs(m.w) > 1e-6 ? (Math.PI * 2) / Math.abs(m.w) : 1;
    case "slide":
      return m.period;
  }
}

function partPoints(p: Part): { pts: P3[]; r: number } {
  switch (p.k) {
    case "wall":
      return {
        pts: [
          [p.a[0], p.y0, p.a[1]],
          [p.a[0], p.y1, p.a[1]],
          [p.b[0], p.y0, p.b[1]],
          [p.b[0], p.y1, p.b[1]],
        ],
        r: p.t,
      };
    case "post":
      return {
        pts: [
          [p.c[0], p.y0, p.c[1]],
          [p.c[0], p.y1, p.c[1]],
        ],
        r: p.r,
      };
    case "cap":
      return { pts: [p.a, p.b], r: p.r };
  }
}

function moverSweep(m: MoverDef): { sweep: Box; top: number } {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  let top = -Infinity;
  const period = motionPeriod(m.motion);
  for (let i = 0; i < 48; i++) {
    const pose = poseAt(m.motion, (period * i) / 48);
    for (const part of m.parts) {
      const { pts, r } = partPoints(part);
      for (const q of pts) {
        const w = posePoint(pose, q[0], q[1], q[2]);
        x0 = Math.min(x0, w[0] - r);
        x1 = Math.max(x1, w[0] + r);
        z0 = Math.min(z0, w[2] - r);
        z1 = Math.max(z1, w[2] + r);
        top = Math.max(top, w[1] + r);
      }
    }
  }
  // Une pale en rotation passe aussi entre les poses mesurées : un peu de marge
  const pad = BALL_R + 0.15;
  return { sweep: { x0: x0 - pad, z0: z0 - pad, x1: x1 + pad, z1: z1 + pad }, top };
}

/** La durée par défaut d'un trou, d'après son par */
export function holeTime(def: HoleDef): number {
  return def.time ?? 45 + def.par * 20;
}

/** Le nombre de coups au-delà duquel on ne joue plus le trou */
export function strokeLimit(par: number): number {
  return par + 5;
}
