// De quoi écrire un trou en quelques lignes : des morceaux de sol (et des îlots découpés dedans), des allées en
// plusieurs sections (plat, rampe, plat…) qui se raccordent exactement, des murs, des poteaux, des obstacles, des zones.

import { box as boxRing, dist, laneSides, pathLength, type P3, type Pt } from "./geom.ts";
import type { Ease, HeightSpec, Bump } from "./height.ts";
import type { DecoDef, Flow, HoleDef, Mat, MoverDef, PadDef, WallDef } from "./course.ts";

export interface TileOpts {
  bumps?: Bump[];
  flow?: Flow;
  noRail?: boolean;
  look?: string;
}

/** Une section d'allée : sa longueur, sa hauteur au début et à la fin (plate si une seule), sa matière */
export interface Section {
  len: number;
  h0?: number;
  h1?: number;
  e?: Ease;
  mat?: Mat;
  look?: string;
  bumps?: Bump[];
  flow?: Flow;
  noRail?: boolean;
}

export interface HoleOpts {
  time?: number;
  hint?: string;
  outY?: number;
}

// Les formes de hauteur, en raccourci
export const ramp = (a: Pt, b: Pt, ha: number, hb: number, e?: Ease): HeightSpec => ({ k: "ramp", a, b, ha, hb, e });
export const plane = (at: Pt, h: number, g: Pt): HeightSpec => ({ k: "plane", at, h, g });
export const radial = (c: Pt, r0: number, r1: number, h0: number, h1: number, e?: Ease): HeightSpec => ({
  k: "radial",
  c,
  r0,
  r1,
  h0,
  h1,
  e,
});
export const wave = (at: Pt, dir: Pt, len: number, amp: number, h = 0): HeightSpec => ({ k: "wave", at, dir, len, amp, h });

export class HoleBuilder {
  readonly def: HoleDef;

  constructor(name: string, par: number, opts: HoleOpts) {
    this.def = {
      name,
      par,
      tee: { at: [0, 0], aim: -Math.PI / 2 },
      cups: [],
      tiles: [],
      walls: [],
      posts: [],
      movers: [],
      portals: [],
      pads: [],
      boosts: [],
      winds: [],
      rails: [],
      items: [],
      decos: [],
      opens: [],
      outY: opts.outY ?? -0.03,
      time: opts.time,
      hint: opts.hint,
    };
  }

  /** Le départ, et vers où on vise d'abord (un angle, ou un point) */
  tee(x: number, z: number, aim: number | Pt): this {
    const a = typeof aim === "number" ? aim : Math.atan2(aim[1] - z, aim[0] - x);
    this.def.tee = { at: [x, z], aim: a };
    return this;
  }

  cup(x: number, z: number): this {
    this.def.cups.push([x, z]);
    return this;
  }

  /** Un morceau de sol ; renvoie son numéro */
  tile(rings: Pt[] | Pt[][], h: HeightSpec = 0, mat: Mat = "green", o: TileOpts = {}): number {
    const list = isRingList(rings) ? rings : [rings];
    this.def.tiles.push({ rings: list.map((r) => [...r]), h, mat, ...o });
    return this.def.tiles.length - 1;
  }

  /** Un îlot découpé dans un morceau : une fosse de sable, une mare, un plateau */
  inset(parent: number, ring: Pt[], h: HeightSpec = 0, mat: Mat = "green", o: TileOpts = {}): number {
    this.def.tiles[parent]!.rings.push([...ring]);
    return this.tile(ring, h, mat, o);
  }

  /**
   * Une allée de largeur w le long du chemin, en sections qui se raccordent exactement (même bord). Chaque section
   * garde la hauteur de fin de la précédente si elle n'en donne pas. Renvoie les numéros des morceaux.
   */
  strip(path: Pt[], w: number, sections: Section[]): number[] {
    const cuts: number[] = [];
    let acc = 0;
    for (const s of sections) {
      acc += s.len;
      cuts.push(acc);
    }
    const total = pathLength(path);
    // La dernière section va jusqu'au bout du chemin
    cuts[cuts.length - 1] = total;
    const { pts, at } = withCuts(densify(path, 0.25), cuts.slice(0, -1));
    const { left, right } = laneSides(pts, w);
    const ids: number[] = [];
    let start = 0;
    let h = sections[0]?.h0 ?? 0;
    sections.forEach((s, k) => {
      const end = k < at.length ? at[k]! : pts.length - 1;
      const h0 = s.h0 ?? h;
      const h1 = s.h1 ?? h0;
      const center = pts.slice(start, end + 1);
      const ring = [...left.slice(start, end + 1), ...right.slice(start, end + 1).reverse()];
      let spec: HeightSpec = h0;
      if (h1 !== h0) {
        const len = pathLength(center);
        let run = 0;
        const hs = center.map((p, i) => {
          if (i > 0) run += dist(center[i - 1]!, p);
          const u = len > 0 ? run / len : 0;
          return h0 + (h1 - h0) * easeOf(u, s.e);
        });
        spec = { k: "strip", left: left.slice(start, end + 1), right: right.slice(start, end + 1), hs };
      }
      ids.push(this.tile(ring, spec, s.mat ?? "green", { bumps: s.bumps, look: s.look, flow: s.flow, noRail: s.noRail }));
      h = h1;
      start = end;
    });
    return ids;
  }

  wall(pts: Pt[], h: number, o: Partial<WallDef> = {}): this {
    this.def.walls.push({ pts: [...pts], h, ...o });
    return this;
  }

  /** Un bloc fermé (son tour en murs) */
  block(ring: Pt[], h: number, o: Partial<WallDef> = {}): this {
    this.def.walls.push({ pts: [...ring], h, closed: true, ...o });
    return this;
  }

  /** Un bloc rectangulaire par ses coins */
  boxWall(x0: number, z0: number, x1: number, z1: number, h: number, o: Partial<WallDef> = {}): this {
    return this.block(boxRing(x0, z0, x1, z1), h, o);
  }

  post(c: Pt, r: number, h: number, o: { e?: number; look?: string } = {}): this {
    this.def.posts.push({ c, r, h, ...o });
    return this;
  }

  /** Un champignon qui renvoie la balle plus fort */
  bumper(c: Pt, r = 0.16, kick = 2.6, look = "bumper"): this {
    this.def.posts.push({ c, r, h: 0.22, e: 1, kick, look });
    return this;
  }

  mover(m: MoverDef): this {
    this.def.movers.push(m);
    return this;
  }

  portal(a: Pt, b: Pt, dir: number, r = 0.2, look?: string): this {
    this.def.portals.push({ a, b, dir, r, look });
    return this;
  }

  pad(c: Pt, r: number, vy: number, o: Partial<PadDef> = {}): this {
    this.def.pads.push({ c, r, vy, ...o });
    return this;
  }

  boost(ring: Pt[], dir: number, speed: number, look?: string): this {
    this.def.boosts.push({ ring, dir, speed, look });
    return this;
  }

  wind(ring: Pt[], acc: Pt, o: { period?: number; on?: number; look?: string } = {}): this {
    this.def.winds.push({ ring, acc, ...o });
    return this;
  }

  /** Un tube : les points sont ceux du centre de la balle */
  rail(pts: P3[], look: string, r = 0.22): this {
    this.def.rails.push({ pts, r, look });
    return this;
  }

  item(c: Pt): this {
    this.def.items.push(c);
    return this;
  }

  deco(k: string, x: number, z: number, o: Omit<DecoDef, "k" | "at"> = {}): this {
    this.def.decos.push({ k, at: [x, z], ...o });
    return this;
  }

  /** Pas de bordure ici (le bord d'un saut, un raccourci au-dessus du vide) */
  open(ring: Pt[]): this {
    this.def.opens.push(ring);
    return this;
  }
}

/** Un trou, écrit par la fonction `fn` */
export function hole(name: string, par: number, fn: (b: HoleBuilder) => void, opts: HoleOpts = {}): HoleDef {
  const b = new HoleBuilder(name, par, opts);
  fn(b);
  return b.def;
}

function isRingList(r: Pt[] | Pt[][]): r is Pt[][] {
  return Array.isArray(r[0]) && Array.isArray((r[0] as unknown[])[0]);
}

function easeOf(u: number, e: Ease | undefined): number {
  switch (e) {
    case "s":
      return u * u * (3 - 2 * u);
    case "in":
      return u * u;
    case "out":
      return 1 - (1 - u) * (1 - u);
    default:
      return u;
  }
}

/** Le chemin avec des points ajoutés pour qu'aucun morceau ne dépasse `step` (les rampes s'arrondissent mieux) */
function densify(path: Pt[], step: number): Pt[] {
  const out: Pt[] = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 1; k <= n; k++) out.push(k === n ? b : [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** Le chemin avec un point ajouté à chaque abscisse de coupe, et l'indice de ces points */
function withCuts(path: Pt[], cuts: number[]): { pts: Pt[]; at: number[] } {
  const pts: Pt[] = [path[0]!];
  const at: number[] = [];
  let acc = 0;
  let k = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const l = dist(a, b);
    while (k < cuts.length && cuts[k]! < acc + l - 1e-6) {
      const t = (cuts[k]! - acc) / l;
      if (t > 1e-6) {
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        at.push(pts.length - 1);
      } else at.push(pts.length - 1);
      k++;
    }
    acc += l;
    pts.push(b);
    while (k < cuts.length && Math.abs(cuts[k]! - acc) <= 1e-6) {
      at.push(pts.length - 1);
      k++;
    }
  }
  while (k < cuts.length) {
    at.push(pts.length - 1);
    k++;
  }
  return { pts, at };
}
