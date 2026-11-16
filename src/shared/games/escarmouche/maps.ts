// Les cartes d'Escarmouche : Le Hameau (un village de pierre), La Gare de triage (wagons, quais, hangar), Le Port
// (conteneurs, portique) et Le Col (un col enneigé : chalet, scierie, chapelle en ruine).
// Chaque carte est symétrique par un demi-tour autour de son centre : ce que voit une équipe depuis sa base, l'autre le
// voit depuis la sienne. Une base de chaque côté, la zone au centre : les quatre modes s'y jouent.
//
// Tout ce qui arrête un pas ou une balle est une boîte. Le reste (toits, rails, feuillages…) n'est que du décor.

import type { Box, Mat } from "./world.ts";

export type MapId = "hameau" | "gare" | "port" | "col";
export const MAP_IDS: MapId[] = ["hameau", "gare", "port", "col"];

export interface Spawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export type Decor =
  /** Un toit à deux pans, le faîte le long de `axis` (ses pignons dans la matière des murs) */
  | { k: "roof"; x0: number; z0: number; x1: number; z1: number; y: number; h: number; axis: "x" | "z"; m: Mat; wall?: Mat }
  /**
   * Une maison, pour l'habiller : ses ouvertures (encadrements, volets, portes ouvertes), ses angles, son soubassement,
   * sa corniche. `blind` : un bâtiment où l'on n'entre pas, aux fenêtres closes.
   */
  | { k: "house"; x0: number; z0: number; x1: number; z1: number; top: number; wall: Mat; open: Hole[]; blind?: boolean }
  /** Un wagon (ou un plat, s'il est bas) : roues, bogies, portes, tampons, échelle */
  | { k: "wagon"; x0: number; x1: number; z0: number; z1: number; h: number; m: Mat }
  /** Un conteneur maritime : sa couleur, et le bout où sont ses portes */
  | {
      k: "container";
      x0: number;
      z0: number;
      x1: number;
      z1: number;
      y0: number;
      y1: number;
      color: string;
      door: "x0" | "x1" | "z0" | "z1";
    }
  /** Le portique de déchargement : ses pieds, sa poutre, sa cabine, un conteneur pendu à ses câbles */
  | { k: "crane"; x: number; z: number; w: number; d: number; h: number }
  /** Le mur du quai, au-dessus de l'eau */
  | { k: "quay"; x0: number; x1: number; z: number; y0: number; y1: number }
  /** Un toit en pointe (clocher, beffroi) */
  | { k: "spire"; x0: number; z0: number; x1: number; z1: number; y: number; h: number; m: Mat }
  | { k: "tree"; x: number; z: number; h: number; r: number }
  /** Un sapin sous la neige */
  | { k: "pine"; x: number; z: number; h: number; r: number }
  /** Une voie ferrée le long de x */
  | { k: "rail"; x0: number; x1: number; z: number }
  | { k: "lamp"; x: number; z: number; h: number }
  /** Une tache au sol (herbe, ballast) : rien que l'image */
  | { k: "patch"; x0: number; z0: number; x1: number; z1: number; m: Mat }
  | { k: "water"; x0: number; z0: number; x1: number; z1: number; y: number }
  /** Une citerne couchée le long de x */
  | { k: "tank"; x0: number; x1: number; z: number; y: number; r: number }
  /** Un réservoir d'eau sur pieds */
  | { k: "tower"; x: number; z: number; y: number; r: number; h: number }
  /** Des barbelés */
  | { k: "wire"; x0: number; z0: number; x1: number; z1: number }
  /** Une horloge sur une façade : centre, direction vers où elle regarde */
  | { k: "clock"; x: number; y: number; z: number; nx: number; nz: number };

/** Une ouverture dans un mur : le long de `axis` de a0 à a1, le mur centré en `c`, l'extérieur du côté `out` */
export interface Hole {
  axis: "x" | "z";
  a0: number;
  a1: number;
  c: number;
  out: 1 | -1;
  y0: number;
  y1: number;
  kind: "door" | "win" | "big";
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface GameMap {
  id: MapId;
  name: string;
  blurb: string;
  boxes: Box[];
  decor: Decor[];
  bounds: { x0: number; z0: number; x1: number; z1: number };
  /** Les points d'apparition de chaque équipe (0 à l'ouest, 1 à l'est), et ceux du chacun pour soi */
  spawns: [Spawn[], Spawn[]];
  ffa: Spawn[];
  /** Le drapeau de chaque équipe, chez elle */
  flags: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
  zone: { x: number; z: number; r: number };
  /** Les trois drapeaux de la conquête : A du côté ouest, B au centre, C du côté est */
  points: [Point3, Point3, Point3];
  /** L'heure et le temps qu'il fait : seulement pour l'image */
  light: "soir" | "gris" | "aube" | "neige";
  /** La mer, au nord, au-delà du quai (seulement pour l'image) */
  sea?: boolean;
}

export const MAP_NAMES: Record<MapId, { name: string; blurb: string }> = {
  hameau: {
    name: "Le Hameau",
    blurb: "Un village de pierre : la halle au centre, des ruelles, et des maisons à étage pour tirer d'en haut.",
  },
  gare: { name: "La Gare de triage", blurb: "Des wagons garés, un hangar, une passerelle au-dessus des voies : de longues lignes de tir." },
  col: {
    name: "Le Col",
    blurb: "Un col sous la neige : le chalet à étage, la scierie et ses grumes, la chapelle en ruine au milieu, des rochers et des sapins.",
  },
  port: {
    name: "Le Port",
    blurb: "Des rangées de conteneurs, un entrepôt, la capitainerie et le grand portique au milieu : on grimpe, on contourne, on surprend.",
  },
};

/** Le regard (yaw) vers une direction : yaw 0 regarde vers -z */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

type Side = "n" | "s" | "e" | "w";
interface Opening {
  side: Side;
  /** Où commence l'ouverture le long du mur (x pour n et s, z pour e et w) */
  at: number;
  w: number;
  kind: "door" | "win" | "big";
  floor?: 0 | 1;
}

const WALL = 0.3;
/** Un étage : plancher du premier à 3 m, épais de 20 cm */
const STORY = 3;
const SLAB = 0.2;
const RISE = 0.29;
const RUN = 0.32;

class Builder {
  boxes: Box[] = [];
  decor: Decor[] = [];
  /** 1 : tel qu'écrit ; -1 : le demi-tour, pour l'autre moitié de la carte */
  s = 1;

  private tx(x: number) {
    return this.s * x;
  }
  private tz(z: number) {
    return this.s * z;
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: Mat) {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    const a = this.tx(x0);
    const b = this.tx(x1);
    const c = this.tz(z0);
    const d = this.tz(z1);
    this.boxes.push({ x0: Math.min(a, b), y0, z0: Math.min(c, d), x1: Math.max(a, b), y1, z1: Math.max(c, d), m });
  }

  /** Un décor : ses coordonnées passent par le même demi-tour */
  add(d: Decor) {
    const s = this.s;
    if (s === 1) {
      this.decor.push(d);
      return;
    }
    const sx = (x: number) => -x;
    switch (d.k) {
      case "roof":
      case "spire":
      case "patch":
      case "water":
      case "wire":
        this.decor.push({ ...d, x0: sx(d.x1), x1: sx(d.x0), z0: sx(d.z1), z1: sx(d.z0) });
        return;
      case "tree":
      case "pine":
      case "lamp":
      case "tower":
        this.decor.push({ ...d, x: -d.x, z: -d.z });
        return;
      case "rail":
        this.decor.push({ ...d, x0: -d.x1, x1: -d.x0, z: -d.z });
        return;
      case "tank":
        this.decor.push({ ...d, x0: -d.x1, x1: -d.x0, z: -d.z });
        return;
      case "clock":
        this.decor.push({ ...d, x: -d.x, z: -d.z, nx: -d.nx, nz: -d.nz });
        return;
      case "house":
        this.decor.push({
          ...d,
          x0: sx(d.x1),
          x1: sx(d.x0),
          z0: sx(d.z1),
          z1: sx(d.z0),
          open: d.open.map((h) => ({ ...h, a0: -h.a1, a1: -h.a0, c: -h.c, out: h.out === 1 ? -1 : 1 })),
        });
        return;
      case "wagon":
        this.decor.push({ ...d, x0: sx(d.x1), x1: sx(d.x0), z0: sx(d.z1), z1: sx(d.z0) });
        return;
      case "container": {
        const flip = { x0: "x1", x1: "x0", z0: "z1", z1: "z0" } as const;
        this.decor.push({ ...d, x0: sx(d.x1), x1: sx(d.x0), z0: sx(d.z1), z1: sx(d.z0), door: flip[d.door] });
        return;
      }
      case "crane":
        this.decor.push({ ...d, x: -d.x, z: -d.z });
        return;
      case "quay":
        this.decor.push({ ...d, x0: sx(d.x1), x1: sx(d.x0), z: -d.z });
        return;
    }
  }

  spawn(x: number, z: number, lookX: number, lookZ: number, y = 0): Spawn {
    const X = this.tx(x);
    const Z = this.tz(z);
    return { x: X, y, z: Z, yaw: yawToward(this.tx(lookX) - X, this.tz(lookZ) - Z) };
  }

  /**
   * Un mur le long de x (de x0 à x1, centré sur z) ou de z, percé de trous (portes, fenêtres). Le mur est coupé en
   * bandes verticales aux bords des trous ; chaque bande garde ce qui n'est pas troué.
   */
  wall(
    axis: "x" | "z",
    a0: number,
    a1: number,
    c: number,
    t: number,
    y0: number,
    y1: number,
    holes: { a: number; b: number; y0: number; y1: number }[],
    m: Mat,
  ) {
    const cuts = [...new Set([a0, a1, ...holes.flatMap((h) => [h.a, h.b])])].filter((v) => v >= a0 && v <= a1).sort((p, q) => p - q);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const p = cuts[k]!;
      const q = cuts[k + 1]!;
      const mid = (p + q) / 2;
      const over = holes.filter((h) => h.a <= mid && h.b >= mid).sort((u, v) => u.y0 - v.y0);
      let y = y0;
      for (const h of over) {
        if (h.y0 > y) this.wallPiece(axis, p, q, c, t, y, Math.min(h.y0, y1), m);
        y = Math.max(y, h.y1);
      }
      if (y < y1) this.wallPiece(axis, p, q, c, t, y, y1, m);
    }
  }

  private wallPiece(axis: "x" | "z", p: number, q: number, c: number, t: number, y0: number, y1: number, m: Mat) {
    if (axis === "x") this.box(p, y0, c - t / 2, q, y1, c + t / 2, m);
    else this.box(c - t / 2, y0, p, c + t / 2, y1, q, m);
  }

  /** Une dalle percée d'un trou rectangulaire (la cage d'escalier) */
  slab(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, hole: [number, number, number, number] | null, m: Mat) {
    if (!hole) return this.box(x0, y0, z0, x1, y1, z1, m);
    const [hx0, hz0, hx1, hz1] = hole;
    this.box(x0, y0, z0, hx0, y1, z1, m);
    this.box(hx1, y0, z0, x1, y1, z1, m);
    this.box(hx0, y0, z0, hx1, y1, hz0, m);
    this.box(hx0, y0, hz1, hx1, y1, z1, m);
  }

  /**
   * Un escalier plein : `axis` le sens de la montée, depuis `start` dans le sens `dir`, de y0 à y1, entre `c0` et `c1`
   * sur l'autre axe. Renvoie le rectangle qu'il occupe (x0, z0, x1, z1).
   */
  stairs(
    axis: "x" | "z",
    start: number,
    dir: 1 | -1,
    c0: number,
    c1: number,
    y0: number,
    y1: number,
    m: Mat,
  ): [number, number, number, number] {
    const n = Math.max(1, Math.round((y1 - y0) / RISE));
    const rise = (y1 - y0) / n;
    const end = start + dir * n * RUN;
    for (let i = 0; i < n; i++) {
      const from = start + dir * i * RUN;
      const lo = Math.min(from, end);
      const hi = Math.max(from, end);
      if (axis === "z") this.box(c0, y0, lo, c1, y0 + (i + 1) * rise, hi, m);
      else this.box(lo, y0, c0, hi, y0 + (i + 1) * rise, c1, m);
    }
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    return axis === "z" ? [c0, lo, c1, hi] : [lo, c0, hi, c1];
  }

  /**
   * Une maison où l'on entre : quatre murs percés de portes et de fenêtres, un étage (avec son escalier) si `floors`
   * vaut 2, un plafond et un toit.
   */
  house(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    o: {
      floors: 1 | 2;
      open: Opening[];
      /** L'escalier : le long de quel mur, d'où il part, dans quel sens il monte */
      stairs?: { axis: "x" | "z"; start: number; dir: 1 | -1; c0: number; c1: number };
      wall: Mat;
      roof: Mat;
      roofAxis: "x" | "z";
      height?: number;
      floorMat?: Mat;
    },
  ) {
    const top = o.height ?? (o.floors === 2 ? STORY * 2 + SLAB : 3.4);
    const holesFor = (side: Side) =>
      o.open
        .filter((p) => p.side === side)
        .map((p) => {
          const base = (p.floor ?? 0) === 1 ? STORY + SLAB : 0;
          const [lo, hi] = p.kind === "door" ? [0, 2.3] : p.kind === "big" ? [0, 3.6] : [1.05, 2.2];
          return { a: p.at, b: p.at + p.w, y0: base + lo, y1: base + hi };
        });
    // Les murs nord et sud couvrent toute la largeur, ceux de l'est et de l'ouest se glissent entre eux
    this.wall("x", x0, x1, z0 + WALL / 2, WALL, 0, top, holesFor("s"), o.wall);
    this.wall("x", x0, x1, z1 - WALL / 2, WALL, 0, top, holesFor("n"), o.wall);
    this.wall("z", z0 + WALL, z1 - WALL, x0 + WALL / 2, WALL, 0, top, holesFor("w"), o.wall);
    this.wall("z", z0 + WALL, z1 - WALL, x1 - WALL / 2, WALL, 0, top, holesFor("e"), o.wall);
    if (o.floors === 2 && o.stairs) {
      const st = o.stairs;
      const r = this.stairs(st.axis, st.start, st.dir, st.c0, st.c1, 0, STORY + SLAB, o.floorMat ?? "planche");
      // La cage d'escalier : tout le dessus de l'escalier, et un peu plus au pied pour la tête
      const pad = 0.4;
      const hole: [number, number, number, number] =
        st.axis === "z"
          ? [r[0], st.dir === 1 ? r[1] - pad : r[1], r[2], st.dir === 1 ? r[3] : r[3] + pad]
          : [st.dir === 1 ? r[0] - pad : r[0], r[1], st.dir === 1 ? r[2] : r[2] + pad, r[3]];
      this.slab(x0 + WALL, z0 + WALL, x1 - WALL, z1 - WALL, STORY, STORY + SLAB, hole, o.floorMat ?? "planche");
    }
    this.box(x0 - 0.1, top, z0 - 0.1, x1 + 0.1, top + 0.25, z1 + 0.1, o.roof);
    const span = o.roofAxis === "x" ? z1 - z0 : x1 - x0;
    this.add({
      k: "roof",
      x0: x0 - 0.35,
      z0: z0 - 0.35,
      x1: x1 + 0.35,
      z1: z1 + 0.35,
      y: top + 0.25,
      h: span * 0.42,
      axis: o.roofAxis,
      m: o.roof,
      wall: o.wall,
    });
    // L'habillage : chaque ouverture, du côté où elle donne
    const where: Record<Side, { axis: "x" | "z"; c: number; out: 1 | -1 }> = {
      s: { axis: "x", c: z0 + WALL / 2, out: -1 },
      n: { axis: "x", c: z1 - WALL / 2, out: 1 },
      w: { axis: "z", c: x0 + WALL / 2, out: -1 },
      e: { axis: "z", c: x1 - WALL / 2, out: 1 },
    };
    const open: Hole[] = (["n", "s", "e", "w"] as Side[]).flatMap((side) =>
      holesFor(side).map((h, i) => {
        const p = o.open.filter((q) => q.side === side)[i]!;
        return { ...where[side], a0: h.a, a1: h.b, y0: h.y0, y1: h.y1, kind: p.kind };
      }),
    );
    this.add({ k: "house", x0, z0, x1, z1, top: top + 0.25, wall: o.wall, open });
  }

  /** Un bâtiment plein, où l'on n'entre pas */
  block(x0: number, z0: number, x1: number, z1: number, h: number, m: Mat, roof?: { m: Mat; axis: "x" | "z" }) {
    this.box(x0, 0, z0, x1, h, z1, m);
    if (roof) {
      const span = roof.axis === "x" ? z1 - z0 : x1 - x0;
      this.add({
        k: "roof",
        x0: x0 - 0.35,
        z0: z0 - 0.35,
        x1: x1 + 0.35,
        z1: z1 + 0.35,
        y: h,
        h: span * 0.42,
        axis: roof.axis,
        m: roof.m,
        wall: m,
      });
      // Un bâtiment où l'on n'entre pas : ses fenêtres sont closes, on les dessine quand même
      this.add({ k: "house", x0, z0, x1, z1, top: h, wall: m, open: [], blind: true });
    }
  }

  crate(x: number, z: number, size = 1.2, h = size, y = 0) {
    this.box(x - size / 2, y, z - size / 2, x + size / 2, y + h, z + size / 2, "caisse");
  }

  sandbags(x0: number, z0: number, x1: number, z1: number, h = 1.1) {
    this.box(x0, 0, z0, x1, h, z1, "sacs");
  }

  /**
   * Un conteneur maritime de six mètres, couché le long de `axis`, à partir de (x, z), posé à `y` (sur un autre, on
   * en fait une pile) ; ses portes au bout le plus loin
   */
  container(x: number, z: number, axis: "x" | "z", color: string, y = 0) {
    const L = 6.06;
    const W = 2.44;
    const H = 2.59;
    const [x0, x1, z0, z1] = axis === "x" ? [x, x + L, z, z + W] : [x, x + W, z, z + L];
    this.box(x0, y, z0, x1, y + H, z1, "conteneur");
    this.add({ k: "container", x0, z0, x1, z1, y0: y, y1: y + H, color, door: axis === "x" ? "x1" : "z1" });
  }

  /** Un bidon d'essence, debout : il explose quand on tire dessus */
  barrel(x: number, z: number) {
    this.box(x - 0.3, 0, z - 0.3, x + 0.3, 0.95, z + 0.3, "bidon");
  }

  /** Un sapin : son tronc arrête les balles, ses branches ne sont que du décor */
  pine(x: number, z: number, h = 8, r = 2.2) {
    this.box(x - 0.25, 0, z - 0.25, x + 0.25, h * 0.6, z + 0.25, "bois");
    this.add({ k: "pine", x, z, h, r });
  }

  tree(x: number, z: number, h = 7, r = 2.6) {
    this.box(x - 0.25, 0, z - 0.25, x + 0.25, h * 0.55, z + 0.25, "bois");
    this.add({ k: "tree", x, z, h, r });
  }
}

/** Les murs invisibles du bord de la carte */
function fence(b: Builder, x0: number, z0: number, x1: number, z1: number) {
  b.box(x0 - 2, -1, z0 - 2, x0, 30, z1 + 2, "invisible");
  b.box(x1, -1, z0 - 2, x1 + 2, 30, z1 + 2, "invisible");
  b.box(x0, -1, z0 - 2, x1, 30, z0, "invisible");
  b.box(x0, -1, z1, x1, 30, z1 + 2, "invisible");
}

// ---------------------------------------------------------------------------
// Le Hameau
// ---------------------------------------------------------------------------

function hameauSide(b: Builder) {
  const west = b.s === 1;
  const crepi: Mat = west ? "crepi" : "crepi2";

  // La ferme, à la base : la grange, des bottes de foin, le puits, un muret
  b.house(-46, 8, -38, 18, {
    floors: 1,
    height: 5.2,
    open: [
      { side: "e", at: 11, w: 4, kind: "big" },
      { side: "s", at: -43, w: 1.4, kind: "door" },
    ],
    wall: "bois",
    roof: "tuile",
    roofAxis: "z",
  });
  b.box(-45.6, 0, 15.6, -43.2, 1.2, 17.6, "foin");
  b.box(-45.6, 1.2, 16.4, -44.4, 2.4, 17.6, "foin");
  b.block(-46, -30, -36, -21, 6.5, crepi, { m: "tuile", axis: "x" });
  b.box(-37, 0, -6.2, -35.8, 1.2, -3.8, "foin");
  b.box(-34.2, 0, 3.6, -33, 1.2, 6, "foin");
  b.box(-34.2, 1.2, 4.8, -33, 2.4, 6, "foin");
  b.box(-40.8, 0, -9.8, -39.2, 0.9, -8.2, "pierre");
  b.add({ k: "spire", x0: -41.1, z0: -10.1, x1: -38.9, z1: -7.9, y: 2.2, h: 1, m: "tuile" });
  b.box(-31.6, 0, -12, -31, 1.1, -3, "pierre");
  b.box(-31.6, 0, 3, -31, 1.1, 12, "pierre");
  b.add({ k: "patch", x0: -46, z0: -21, x1: -31, z1: 8, m: "herbe" });
  b.tree(-44, -15, 7.5, 2.8);

  // Les façades du bord : on n'y entre pas
  b.block(-31, 22, -20, 30, 7, crepi, { m: "tuile", axis: "x" });
  b.block(-20, 23, -8, 30, 8, "pierre", { m: "tuile", axis: "x" });
  b.block(-36, 18, -31, 30, 6, "pierre", { m: "tuile", axis: "z" });
  b.block(-46, 18, -36, 30, 5.5, "pierre", { m: "tuile", axis: "x" });
  b.block(-36, -30, -26, -23, 6, crepi, { m: "tuile", axis: "x" });
  b.block(-7, -30, -1, -26, 3.2, "pierre", { m: "tuile", axis: "x" });

  // L'église (de l'autre côté, la mairie et son beffroi, sur le même plan)
  b.block(-26, -30, -12, -22, 9, west ? "pierre" : "crepi2", { m: west ? "tuile" : "metal", axis: "x" });
  b.box(-12, 0, -30, -7, 15, -24.5, west ? "pierre" : "crepi2");
  b.add({ k: "spire", x0: -12.3, z0: -30.3, x1: -6.7, z1: -24.2, y: 15, h: west ? 7 : 3.2, m: west ? "metal" : "tuile" });
  b.add({ k: "clock", x: -9.5, y: 12.5, z: -24.45, nx: 0, nz: 1 });

  // Maison A, entre la rue haute et l'avenue : deux portes, des fenêtres à l'étage sur les deux rues et sur la place
  b.house(-28, 6, -18, 14, {
    floors: 2,
    open: [
      { side: "s", at: -25, w: 1.4, kind: "door" },
      { side: "n", at: -22, w: 1.4, kind: "door" },
      { side: "s", at: -21.5, w: 1.3, kind: "win" },
      { side: "s", at: -26.5, w: 1.3, kind: "win", floor: 1 },
      { side: "s", at: -22, w: 1.3, kind: "win", floor: 1 },
      { side: "n", at: -26, w: 1.3, kind: "win", floor: 1 },
      { side: "n", at: -21.6, w: 1.3, kind: "win", floor: 1 },
      { side: "e", at: 9.3, w: 1.3, kind: "win", floor: 1 },
    ],
    stairs: { axis: "z", start: 9.6, dir: 1, c0: -27.7, c1: -26.2 },
    wall: crepi,
    roof: "tuile",
    roofAxis: "x",
  });
  b.block(-18, 8.5, -12.5, 14, 3.6, "pierre");
  b.box(-18.1, 3.6, 8.4, -12.4, 3.85, 14.1, "tuile");

  // Maison B, entre l'avenue et la rue basse, et son jardin clos
  b.house(-22, -14, -12, -6, {
    floors: 2,
    open: [
      { side: "n", at: -16, w: 1.4, kind: "door" },
      { side: "s", at: -15, w: 1.4, kind: "door" },
      { side: "e", at: -11, w: 1.4, kind: "door" },
      { side: "n", at: -20.5, w: 1.3, kind: "win", floor: 1 },
      { side: "n", at: -15.5, w: 1.3, kind: "win", floor: 1 },
      { side: "s", at: -16, w: 1.3, kind: "win", floor: 1 },
      { side: "e", at: -10.6, w: 1.3, kind: "win", floor: 1 },
      { side: "w", at: -10.6, w: 1.3, kind: "win", floor: 1 },
    ],
    stairs: { axis: "x", start: -21.6, dir: 1, c0: -13.7, c1: -12.2 },
    wall: "pierre",
    roof: "tuile",
    roofAxis: "x",
  });
  b.box(-28, 0, -14, -27.6, 1.1, -6, "pierre");
  b.box(-27.6, 0, -6.4, -24.6, 1.1, -6, "pierre");
  b.box(-27.6, 0, -14, -22, 1.1, -13.6, "pierre");
  b.add({ k: "patch", x0: -27.6, z0: -13.6, x1: -22, z1: -6.4, m: "herbe" });
  b.tree(-25, -10, 6.5, 2.4);

  // L'avenue : une charrette, des caisses
  b.box(-26, 0, -1.5, -23, 1.3, 0.3, "bois");
  b.crate(-17.6, 2.6);
  b.crate(-17.6, 3.8, 1.2, 2.4);
  b.sandbags(-21, -4.6, -18.6, -4);
  // Des bidons d'essence, à ne pas laisser près de soi
  b.barrel(-19.6, -5.4);
  b.barrel(-36.4, -2.6);
  b.barrel(-16.2, 5.6);

  // La rue haute : des tonneaux, une charrette ; la rue basse : un camion abandonné, des sacs de sable
  b.box(-24.35, 0, 17.65, -23.65, 1, 18.35, "bois");
  b.box(-23.5, 0, 18.3, -22.8, 1, 19, "bois");
  b.box(-16, 0, 19, -13, 1.4, 20.5, "bois");
  b.box(-28, 0, -21, -22.5, 2.7, -18.6, "rouille");
  b.box(-22.5, 0, -20.8, -20.6, 2.1, -18.8, "metal");
  b.sandbags(-18, -18.8, -15.6, -18.2);
  b.add({ k: "wire", x0: -12, z0: -19.6, x1: -9, z1: -19 });

  // La place : le monument (de l'autre côté, une fontaine), un arbre, une fontaine devant la halle
  b.box(-5, 0, 14, -3, 2.6, 16, "pierre");
  b.tree(-9, 18, 8, 3);
  b.box(-11, 0, -1.3, -8.6, 0.8, 1.3, "pierre");
  b.add({ k: "water", x0: -10.8, z0: -1.1, x1: -8.8, z1: 1.1, y: 0.62 });
  b.add({ k: "lamp", x: -7, z: 10, h: 4.2 });
  b.add({ k: "lamp", x: -12, z: -16, h: 4.2 });
  b.add({ k: "patch", x0: -12, z0: 10, x1: -6, z1: 22, m: "terre" });
}

function hameau(): GameMap {
  const b = new Builder();
  b.box(-46, -1, -30, 46, 0, 30, "pave");
  fence(b, -46, -30, 46, 30);
  // La halle au centre : ses piliers, son toit, deux étals dessous
  for (const x of [-6, -2, 2, 6]) {
    for (const z of [-4.5, 4.5]) {
      const cx = x === -6 ? -5.75 : x === 6 ? 5.75 : x;
      const cz = z < 0 ? -4.25 : 4.25;
      b.box(cx - 0.25, 0, cz - 0.25, cx + 0.25, 4, cz + 0.25, "bois");
    }
  }
  b.box(-6.5, 4, -5, 6.5, 4.35, 5, "bois");
  b.add({ k: "roof", x0: -6.9, z0: -5.4, x1: 6.9, z1: 5.4, y: 4.35, h: 2.4, axis: "x", m: "tuile" });
  b.box(-4.5, 0, -1, -2.5, 0.9, 1, "bois");
  b.box(2.5, 0, -1, 4.5, 0.9, 1, "bois");

  const spawns: [Spawn[], Spawn[]] = [[], []];
  const ffa: Spawn[] = [];
  for (const s of [1, -1] as const) {
    b.s = s;
    hameauSide(b);
    const team = s === 1 ? 0 : 1;
    spawns[team] = [
      b.spawn(-44, -3, 0, -3),
      b.spawn(-44, 3, 0, 3),
      b.spawn(-41, -6, 0, -6),
      b.spawn(-41, 6, 0, 6),
      b.spawn(-36, -10, 0, -10),
      b.spawn(-36, 10, 0, 10),
      b.spawn(-39, -15, 0, -10),
    ];
    ffa.push(b.spawn(-43, 0, 0, 0), b.spawn(-25, 18, 0, 18), b.spawn(-25, -2, 0, 0), b.spawn(-16, -20, 0, -20), b.spawn(-24, 9, -24, 0));
    ffa.push(b.spawn(-17, -10, 0, -10), b.spawn(-35, 15, 0, 15));
  }
  b.s = 1;
  return {
    id: "hameau",
    ...MAP_NAMES.hameau,
    boxes: b.boxes,
    decor: b.decor,
    bounds: { x0: -46, z0: -30, x1: 46, z1: 30 },
    spawns,
    ffa,
    flags: [
      { x: -41, y: 0, z: 0 },
      { x: 41, y: 0, z: 0 },
    ],
    zone: { x: 0, z: 0, r: 6 },
    points: [
      { x: -22, y: 0, z: 16.5 },
      { x: 0, y: 0, z: 0 },
      { x: 22, y: 0, z: -16.5 },
    ],
    light: "soir",
  };
}

// ---------------------------------------------------------------------------
// La Gare de triage
// ---------------------------------------------------------------------------

/** Un wagon couvert garé sur sa voie (centre z), de x0 à x1 */
function boxcar(b: Builder, x0: number, x1: number, z: number, m: Mat = "wagon") {
  b.box(x0, 0, z - 1.5, x1, 3.8, z + 1.5, m);
  b.add({ k: "wagon", x0, x1, z0: z - 1.5, z1: z + 1.5, h: 3.8, m });
}

function gareSide(b: Builder) {
  const west = b.s === 1;
  // Le dépôt de la base, ouvert vers les voies : le drapeau y est à l'abri
  b.box(-50, 0, -10.3, -42, 6, -10, "beton");
  b.box(-50, 0, 10, -42, 6, 10.3, "beton");
  b.box(-50.2, 6, -10.6, -41.6, 6.3, 10.6, "metal");
  b.add({ k: "roof", x0: -50.4, z0: -10.8, x1: -41.4, z1: 10.8, y: 6.3, h: 1.4, axis: "z", m: "metal" });
  b.crate(-48.6, -8.4);
  b.crate(-48.6, -7.1, 1.2, 2.4);
  b.crate(-48.6, 8.4);
  b.crate(-43, 8.6, 1.3, 1.3);
  b.box(-50.4, 0, -30, -50, 3.4, 30, "beton");
  b.box(-50.3, 3.4, -10.3, -50, 6, 10.3, "beton");
  b.sandbags(-40.5, -3.2, -39.9, 3.2);

  // Le poste d'aiguillage : un étage tout vitré, au-dessus de la cour
  b.house(-36, 14, -30, 20, {
    floors: 2,
    open: [
      { side: "e", at: 14.7, w: 1.4, kind: "door" },
      { side: "s", at: -35.4, w: 1.6, kind: "win", floor: 1 },
      { side: "s", at: -32.6, w: 2, kind: "win", floor: 1 },
      { side: "e", at: 14.7, w: 1.6, kind: "win", floor: 1 },
      { side: "e", at: 17.3, w: 1.6, kind: "win", floor: 1 },
      { side: "w", at: 15.6, w: 2.6, kind: "win", floor: 1 },
      { side: "n", at: -34.6, w: 3, kind: "win", floor: 1 },
    ],
    stairs: { axis: "x", start: -35.7, dir: 1, c0: 18.2, c1: 19.7 },
    wall: west ? "pierre" : "crepi2",
    roof: "tuile",
    roofAxis: "x",
  });

  // Le hangar d'entretien : de grandes portes sur les voies, une locomotive dedans
  b.house(-30, -30, -14, -17, {
    floors: 1,
    height: 7,
    open: [
      { side: "n", at: -28, w: 4.4, kind: "big" },
      { side: "n", at: -20.4, w: 4.4, kind: "big" },
      { side: "e", at: -23.6, w: 1.4, kind: "door" },
      { side: "e", at: -27.5, w: 2.2, kind: "win" },
      { side: "w", at: -22, w: 1.4, kind: "door" },
    ],
    wall: "metal",
    roof: "metal",
    roofAxis: "x",
  });
  b.box(-27.4, 0, -25.2, -18.6, 3.6, -22.6, "rouille");
  b.crate(-16, -28.4);
  b.crate(-16, -27.1, 1.2, 2.4);
  b.crate(-28.4, -28.4, 1.2, 1.2);

  // Les wagons sur les voies
  boxcar(b, -30, -18, -6);
  b.box(-26, 0, 4.8, -14, 1.3, 7.2, "wagon2");
  b.add({ k: "wagon", x0: -26, x1: -14, z0: 4.8, z1: 7.2, h: 1.3, m: "wagon2" });
  b.crate(-20, 6, 1.4, 1.4, 1.3);
  boxcar(b, -38, -26, 12, "wagon2");
  b.box(-36, 0, -13.4, -24, 3.2, -10.6, "metal");
  b.add({ k: "tank", x0: -35.6, x1: -24.4, z: -12, y: 2, r: 1.45 });
  boxcar(b, -20, -8, 19);
  boxcar(b, -46, -38, 24, "wagon2");

  // Le château d'eau, des sacs de sable entre les voies, des barbelés
  b.box(-42.6, 0, -24.6, -41.4, 7, -23.4, "rouille");
  b.add({ k: "tower", x: -42, z: -24, y: 7, r: 2.2, h: 3.2 });
  b.sandbags(-12, -9.4, -9, -8.8);
  b.sandbags(-11, 8.8, -8, 9.4);
  b.add({ k: "wire", x0: -36, z0: 1.6, x1: -32, z1: 2.2 });
  b.crate(-34, -1.5, 1.3, 1.3);
  b.crate(-9, 15.6, 1.2, 1.2);
  b.crate(-9, 22.4, 1.2, 2.2);
  // Des bidons d'essence : au dépôt, près de la citerne, entre les wagons
  b.barrel(-37.5, 4);
  b.barrel(-30, -14.4);
  b.barrel(-10.2, 14.4);

  // L'escalier de la passerelle (l'autre est son demi-tour)
  b.stairs("z", 26, -1, -1.5, 1.5, 0, 5.3, "metal");
  // Le mur du fond et la palissade du bord
  b.box(-50, 0, 29.6, 50, 3.4, 30, "beton");
  // Les voies : celles qui s'arrêtent au milieu continuent de l'autre côté (leur demi-tour)
  for (const [z, x0, x1] of [
    [-12, -50, 0],
    [-6, -50, 0],
    [6, -50, 0],
    [12, -50, 0],
    [19, -28, 0],
    [-19, -14, 0],
    [-24, -30, -14],
    [24, -50, -30],
  ] as const)
    b.add({ k: "rail", x0, x1, z });
  b.add({ k: "lamp", x: -38, z: -3.5, h: 6 });
  b.add({ k: "lamp", x: -14, z: 9.5, h: 6 });
  b.add({ k: "patch", x0: -50, z0: -16, x1: -42, z1: 16, m: "beton" });
}

function gare(): GameMap {
  const b = new Builder();
  b.box(-50, -1, -30, 50, 0, 30, "gravier");
  fence(b, -50, -30, 50, 30);
  // Le quai central sous son abri, et la passerelle qui enjambe les voies
  b.box(-9, 0, -2.5, 9, 0.4, 2.5, "beton");
  for (const x of [-7, 7]) b.box(x - 0.15, 0.4, -0.15, x + 0.15, 3.6, 0.15, "metal");
  b.box(-8, 3.6, -1.8, 8, 3.8, 1.8, "metal");
  b.box(-4.5, 0.4, -0.3, -2.5, 0.9, 0.3, "bois");
  b.box(2.5, 0.4, -0.3, 4.5, 0.9, 0.3, "bois");
  b.box(-1.5, 5, -20.4, 1.5, 5.3, 20.4, "metal");
  b.box(-1.5, 5.3, -20.4, -1.35, 6.4, 20.4, "metal");
  b.box(1.35, 5.3, -20.4, 1.5, 6.4, 20.4, "metal");
  for (const z of [-16, -8, 8, 16]) b.box(-0.3, 0, z - 0.3, 0.3, 5, z + 0.3, "metal");

  const spawns: [Spawn[], Spawn[]] = [[], []];
  const ffa: Spawn[] = [];
  for (const s of [1, -1] as const) {
    b.s = s;
    gareSide(b);
    const team = s === 1 ? 0 : 1;
    spawns[team] = [
      b.spawn(-47, -5, 0, -5),
      b.spawn(-47, 5, 0, 5),
      b.spawn(-44, -7, 0, -7),
      b.spawn(-44, 7, 0, 7),
      b.spawn(-40, -8, 0, -8),
      b.spawn(-40, 8, 0, 8),
      b.spawn(-45, 0, 0, 0),
    ];
    ffa.push(b.spawn(-46, 0, 0, 0), b.spawn(-33, 16, 0, 16), b.spawn(-22, -22, -22, 0), b.spawn(-24, 9, 0, 9), b.spawn(-12, -3, 0, -3));
    ffa.push(b.spawn(-30, -9, 0, -9), b.spawn(-14, 26, 0, 26));
  }
  b.s = 1;
  return {
    id: "gare",
    ...MAP_NAMES.gare,
    boxes: b.boxes,
    decor: b.decor,
    bounds: { x0: -50, z0: -30, x1: 50, z1: 30 },
    spawns,
    ffa,
    flags: [
      { x: -46, y: 0, z: 0 },
      { x: 46, y: 0, z: 0 },
    ],
    zone: { x: 0, z: 0, r: 6 },
    points: [
      { x: -20, y: 0, z: 12.5 },
      { x: 0, y: 0.4, z: 0 },
      { x: 20, y: 0, z: -12.5 },
    ],
    light: "gris",
  };
}

// ---------------------------------------------------------------------------
// Le Port
// ---------------------------------------------------------------------------

const RED = "#9c3326";
const BLUE = "#2c5a8a";
const GREEN = "#3f6b3a";
const ORANGE = "#c4682a";
const GREY = "#7d8186";
const SAND = "#b39257";

function portSide(b: Builder) {
  // La base : un hangar ouvert vers les quais, ses caisses, des sacs de sable devant
  b.box(-48, 0, -10.3, -40, 6, -10, "beton");
  b.box(-48, 0, 10, -40, 6, 10.3, "beton");
  b.box(-48.2, 6, -10.6, -39.6, 6.3, 10.6, "metal");
  b.add({ k: "roof", x0: -48.4, z0: -10.8, x1: -39.4, z1: 10.8, y: 6.3, h: 1.4, axis: "z", m: "metal" });
  b.crate(-47, -8.6);
  b.crate(-47, -7.3, 1.2, 2.4);
  b.crate(-47, 8.6);
  b.crate(-41.4, 8.8, 1.3, 1.3);
  b.sandbags(-37.6, -3.5, -37, 3.5);

  // La capitainerie : un étage vitré au-dessus des quais, l'escalier à l'intérieur
  b.house(-30, 16, -24, 22, {
    floors: 2,
    open: [
      { side: "e", at: 16.7, w: 1.4, kind: "door" },
      { side: "s", at: -29.4, w: 1.6, kind: "win", floor: 1 },
      { side: "s", at: -26.6, w: 2, kind: "win", floor: 1 },
      { side: "e", at: 16.7, w: 1.6, kind: "win", floor: 1 },
      { side: "e", at: 19.3, w: 1.6, kind: "win", floor: 1 },
      { side: "w", at: 17.6, w: 2.6, kind: "win", floor: 1 },
      { side: "n", at: -28.6, w: 3, kind: "win", floor: 1 },
    ],
    stairs: { axis: "x", start: -29.7, dir: 1, c0: 20.2, c1: 21.7 },
    wall: "beton",
    roof: "metal",
    roofAxis: "x",
  });

  // L'entrepôt : deux grandes portes vers les conteneurs, une porte de chaque côté
  b.house(-30, -26, -16, -17, {
    floors: 1,
    height: 7,
    open: [
      { side: "n", at: -28, w: 4.4, kind: "big" },
      { side: "n", at: -21, w: 4.4, kind: "big" },
      { side: "e", at: -22.6, w: 1.4, kind: "door" },
      { side: "w", at: -21, w: 1.4, kind: "door" },
      { side: "s", at: -24, w: 2.2, kind: "win" },
    ],
    wall: "metal",
    roof: "metal",
    roofAxis: "x",
  });
  b.crate(-27.6, -24.2);
  b.crate(-27.6, -22.9, 1.2, 2.4);
  b.crate(-18.4, -24.2, 1.3, 1.3);
  b.box(-24.6, 0, -24.6, -20.6, 1.4, -22.8, "bois");

  // Les conteneurs : des rangées, des piles, quelques caisses pour grimper dessus
  b.container(-36, 6, "x", RED);
  b.container(-22, 9, "x", BLUE);
  b.container(-22, 9, "x", ORANGE, 2.59);
  b.container(-14, 13, "z", GREEN);
  b.container(-34, -11, "x", GREY);
  b.crate(-27.2, -9.8);
  b.container(-20, -8, "x", SAND);
  b.crate(-13.2, -6.8);
  b.container(-40, -24, "z", BLUE);
  b.container(-8.5, 20, "x", RED);
  b.container(-36.5, 13, "x", GREEN);
  b.container(-36.5, 13, "x", GREY, 2.59);

  // Le quai au nord : sa bordure, ses bittes d'amarrage
  b.box(-48, 0, 29.4, 0, 0.25, 30, "beton");
  for (const x of [-44, -34, -24, -14, -4]) b.box(x - 0.2, 0, 28.6, x + 0.2, 0.6, 29, "metal");

  // Des bidons, des sacs de sable, des caisses, des projecteurs
  b.barrel(-26, 4.6);
  b.barrel(-10.5, -12);
  b.barrel(-33, -14.5);
  b.sandbags(-12, 2.4, -9.6, 3);
  b.crate(-24, 12.6);
  b.crate(-16, 1.4, 1.3, 1.3);
  b.add({ k: "lamp", x: -34, z: 0.6, h: 8 });
  b.add({ k: "lamp", x: -12, z: 8.4, h: 8 });
}

function port(): GameMap {
  const b = new Builder();
  b.box(-48, -1, -30, 48, 0, 30, "beton");
  fence(b, -48, -30, 48, 30);
  // Le grand portique au milieu : quatre pieds, deux poutres, ses rails ; deux caisses dans la zone
  for (const [x, z] of [
    [-7, -5],
    [7, -5],
    [-7, 5],
    [7, 5],
  ] as const)
    b.box(x - 0.45, 0, z - 0.45, x + 0.45, 16, z + 0.45, "metal");
  b.box(-8, 16, -5.6, 8, 17, -4.4, "metal");
  b.box(-8, 16, 4.4, 8, 17, 5.6, "metal");
  b.add({ k: "crane", x: 0, z: 0, w: 14, d: 10, h: 16 });
  b.add({ k: "rail", x0: -26, x1: 26, z: -5 });
  b.add({ k: "rail", x0: -26, x1: 26, z: 5 });
  b.crate(-3, 2.5);
  b.crate(3, -2.5);
  // La mer au nord, au pied du mur du quai
  b.add({ k: "water", x0: -300, z0: 30, x1: 300, z1: 320, y: -1.3 });
  b.add({ k: "quay", x0: -48, x1: 48, z: 30, y0: -2.5, y1: 0 });

  const spawns: [Spawn[], Spawn[]] = [[], []];
  const ffa: Spawn[] = [];
  for (const s of [1, -1] as const) {
    b.s = s;
    portSide(b);
    const team = s === 1 ? 0 : 1;
    spawns[team] = [
      b.spawn(-46, -4, 0, -4),
      b.spawn(-46, 4, 0, 4),
      b.spawn(-43, -7, 0, -7),
      b.spawn(-43, 7, 0, 7),
      b.spawn(-41, -3, 0, -3),
      b.spawn(-41, 3, 0, 3),
      b.spawn(-45, 0, 0, 0),
    ];
    ffa.push(b.spawn(-44, 0, 0, 0), b.spawn(-26, 26, 0, 26), b.spawn(-23, -14, 0, -14), b.spawn(-8, -20, 0, -20), b.spawn(-20, 2, 0, 0));
    ffa.push(b.spawn(-35, -18, 0, -18), b.spawn(-6, 15, 0, 15));
  }
  b.s = 1;
  return {
    id: "port",
    ...MAP_NAMES.port,
    boxes: b.boxes,
    decor: b.decor,
    bounds: { x0: -48, z0: -30, x1: 48, z1: 30 },
    spawns,
    ffa,
    flags: [
      { x: -44, y: 0, z: 0 },
      { x: 44, y: 0, z: 0 },
    ],
    zone: { x: 0, z: 0, r: 6 },
    points: [
      { x: -25, y: 0, z: -2 },
      { x: 0, y: 0, z: 0 },
      { x: 25, y: 0, z: 2 },
    ],
    light: "aube",
    sea: true,
  };
}

// ---------------------------------------------------------------------------
// Le Col
// ---------------------------------------------------------------------------

function colSide(b: Builder) {
  // La base : une cabane de rondins fermée, une palissade, des sacs de sable et une congère devant
  b.block(-47.5, -15.5, -41.5, -11, 3.2, "bois", { m: "neige", axis: "x" });
  b.box(-47.7, 0, 11.5, -40.5, 1.6, 11.8, "bois");
  b.crate(-46.8, 9.6);
  b.crate(-45.4, 9.7, 1.2, 2.4);
  b.sandbags(-37.6, -3.5, -37, 3.5);
  b.box(-36.4, 0, 6.5, -33.4, 0.9, 7.6, "neige");
  b.add({ k: "lamp", x: -38.5, z: -7, h: 5 });

  // Le chalet : deux niveaux de rondins, l'escalier le long du mur nord, des fenêtres sur la vallée
  b.house(-31, 14, -23, 21, {
    floors: 2,
    open: [
      { side: "s", at: -28.6, w: 1.4, kind: "door" },
      { side: "e", at: 15.6, w: 1.3, kind: "door" },
      { side: "s", at: -25.6, w: 1.4, kind: "win" },
      { side: "w", at: 15.4, w: 1.4, kind: "win" },
      { side: "s", at: -29.8, w: 1.5, kind: "win", floor: 1 },
      { side: "s", at: -26.4, w: 1.6, kind: "win", floor: 1 },
      { side: "e", at: 16.2, w: 1.6, kind: "win", floor: 1 },
      { side: "w", at: 16.4, w: 1.6, kind: "win", floor: 1 },
    ],
    stairs: { axis: "x", start: -30.6, dir: 1, c0: 19.2, c1: 20.7 },
    wall: "bois",
    roof: "neige",
    roofAxis: "x",
  });

  // La scierie : un toit sur poteaux, les grumes empilées, la scie, des caisses
  for (const [x, z] of [
    [-30, -24],
    [-18.3, -24],
    [-30, -17.3],
    [-18.3, -17.3],
  ] as const)
    b.box(x, 0, z, x + 0.3, 4, z + 0.3, "bois");
  b.box(-30.3, 4, -24.3, -18, 4.2, -17, "planche");
  b.add({ k: "roof", x0: -30.6, z0: -24.6, x1: -17.7, z1: -16.7, y: 4.2, h: 1.6, axis: "x", m: "neige" });
  b.box(-28, 0, -23.2, -22, 0.9, -21.6, "bois");
  b.box(-27.4, 0.9, -23.1, -23, 1.7, -22, "bois");
  b.box(-25.4, 0, -19.6, -21.2, 0.9, -18.7, "metal");
  b.crate(-20, -22.6);
  b.crate(-19.4, -20.4, 1.2, 2.4);
  // Des grumes dehors, sur le chemin : un abri bas
  b.box(-14, 0, -12.2, -9.2, 1.1, -10.8, "bois");

  // La chapelle : le clocher, plein, et son toit en pointe
  b.block(-7, 20, -2.6, 24.4, 8, "pierre");
  b.add({ k: "spire", x0: -7.3, z0: 19.7, x1: -2.3, z1: 24.7, y: 8, h: 4, m: "neige" });

  // Le milieu : les murs bas d'une chapelle en ruine, ouverts de chaque côté (l'autre moitié par le demi-tour)
  b.box(-5, 0, -4.5, -4.6, 2.4, -1.2, "pierre");
  b.box(-5, 0, 1.2, -4.6, 1.4, 4.5, "pierre");
  b.box(-4.6, 0, -4.5, -1.4, 1.8, -4.1, "pierre");
  b.box(1.6, 0, -4.5, 4.6, 1.1, -4.1, "pierre");

  // Des rochers, des congères, des barrières de bois : de quoi se mettre à l'abri
  b.box(-20, 0, 2, -17.5, 1.6, 4.2, "pierre");
  b.box(-19.2, 1.6, 2.5, -18, 2.3, 3.6, "pierre");
  b.box(-36, 0, 18, -33, 1.3, 21, "pierre");
  b.box(-10, 0, -24, -6.5, 2, -21, "pierre");
  b.box(-26, 0, 2, -23, 0.9, 3, "neige");
  b.box(-9, 0, 6, -6, 1, 7, "neige");
  b.box(-33, 0, -6, -30.5, 0.85, -5, "neige");
  b.box(-40, 0, 16, -33, 0.9, 16.2, "bois");
  b.box(-22, 0, -8, -16, 0.9, -7.8, "bois");

  // Les sapins, l'étang gelé, les bidons, une caisse, un lampadaire
  for (const [x, z, h] of [
    [-37, -21, 9],
    [-41, 24, 8],
    [-17, 23, 10],
    [-13, -4, 7],
    [-23.5, -12.5, 8],
    [-44, 19, 7],
    [-27, 27, 9],
    [-34, -27, 8],
  ] as const)
    b.pine(x, z, h);
  b.add({ k: "patch", x0: -20, z0: 8, x1: -12, z1: 13, m: "glace" });
  b.barrel(-26, 7);
  b.barrel(-13.5, -14.6);
  b.barrel(-34, 10);
  b.crate(-16, 4.6);
  b.add({ k: "lamp", x: -14, z: 9.6, h: 5 });
}

function col(): GameMap {
  const b = new Builder();
  b.box(-48, -1, -30, 48, 0, 30, "neige");
  fence(b, -48, -30, 48, 30);
  const spawns: [Spawn[], Spawn[]] = [[], []];
  const ffa: Spawn[] = [];
  for (const s of [1, -1] as const) {
    b.s = s;
    colSide(b);
    const team = s === 1 ? 0 : 1;
    spawns[team] = [
      b.spawn(-46, -4, 0, -4),
      b.spawn(-46, 4, 0, 4),
      b.spawn(-43, -7, 0, -7),
      b.spawn(-43, 7, 0, 7),
      b.spawn(-41, -3, 0, -3),
      b.spawn(-41, 3, 0, 3),
      b.spawn(-45, 0, 0, 0),
    ];
    ffa.push(
      b.spawn(-44, 0, 0, 0),
      b.spawn(-21.5, 9.5, 0, 9.5),
      b.spawn(-22, -14, 0, -14),
      b.spawn(-9, -18, 0, -18),
      b.spawn(-12, 2, 0, 0),
    );
    ffa.push(b.spawn(-35, -14, 0, -14), b.spawn(-6, 15, 0, 15));
  }
  b.s = 1;
  return {
    id: "col",
    ...MAP_NAMES.col,
    boxes: b.boxes,
    decor: b.decor,
    bounds: { x0: -48, z0: -30, x1: 48, z1: 30 },
    spawns,
    ffa,
    flags: [
      { x: -44, y: 0, z: 0 },
      { x: 44, y: 0, z: 0 },
    ],
    zone: { x: 0, z: 0, r: 6 },
    points: [
      { x: -24, y: 0, z: -4 },
      { x: 0, y: 0, z: 0 },
      { x: 24, y: 0, z: 4 },
    ],
    light: "neige",
  };
}

const cache = new Map<MapId, GameMap>();

/** Une carte, construite une fois pour toutes */
export function getMap(id: MapId): GameMap {
  let m = cache.get(id);
  if (!m) {
    m = id === "gare" ? gare() : id === "port" ? port() : id === "col" ? col() : hameau();
    cache.set(id, m);
  }
  return m;
}

export function isMapId(v: unknown): v is MapId {
  return v === "hameau" || v === "gare" || v === "port" || v === "col";
}
