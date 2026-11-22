// Le trou en 3D, tiré de sa forme compilée (la même que celle de la physique) : le sol de chaque morceau, maillé
// finement pour suivre les bosses et assombri au pied des murs, les bordures, les falaises, les murs, les poteaux, les
// trous et leurs drapeaux, l'eau, les tubes, les tremplins, les téléporteurs, et ce qui bouge. Le thème dit de quoi
// chaque chose a l'air.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BALL_R,
  CUP_R,
  RAIL_H,
  poseAt,
  posePoint,
  tileHeight,
  type CWall,
  type Course,
  type Mat,
  type MoverDef,
  type Part,
} from "../../../shared/games/minigolf/course.ts";
import { inRings, segClosest, type Pt } from "../../../shared/games/minigolf/geom.ts";

/** Ce que le thème fournit pour habiller un trou */
export interface ThemeKit {
  /** Le sol d'un morceau (uv en mètres) */
  ground(mat: Mat, look?: string): THREE.Material;
  /** Les flancs (falaises, bords sans bordure) */
  side(look?: string): THREE.Material;
  /** Les bordures du tour : leur matière, et combien elles dépassent en plus de leur hauteur de jeu */
  /** `bevel` : le rayon de l'arrondi du dessus (par défaut un petit arrondi ; 0 pour une arête vive) */
  rail(look?: string): { material: THREE.Material; extra: number; widen: number; round?: boolean; tube?: boolean; bevel?: number };
  wall(look?: string): THREE.Material;
  post(look: string | undefined, r: number, h: number): THREE.Object3D;
  /**
   * Un obstacle mobile (null : formes simples) ; dessiné dans sa pose de repos, origine du monde. Dans
   * `userData.onPose(move, t)` : de quoi animer l'intérieur d'après le déplacement de l'origine
   */
  mover(def: MoverDef, c: Course): THREE.Object3D | null;
  water(look?: string): THREE.Material;
  /** La couleur du drapeau */
  flag: number;
  /** Le tapis de départ et ses bornes, aux couleurs du parcours (par défaut : un tapis vert de jardin) */
  tee?: TeeLook;
}

/** Le tapis de départ : sa bordure, son fond (à carreaux : un torchon), le point de départ, les bornes et leur chapeau */
export interface TeeLook {
  rim: number;
  pad: number;
  spot: number;
  post: number;
  cap: number;
  /** Le fond à carreaux, avec cette seconde couleur */
  check?: number;
  /** Une plaque de métal plutôt qu'un tapis */
  metal?: boolean;
  /** Le point de départ luit (la lave) */
  glow?: boolean;
}

const GARDEN_TEE: TeeLook = { rim: 0x4d9a52, pad: 0x2e6f3a, spot: 0xf2efe4, post: 0xc89a62, cap: 0xc8392d };

/** Un fond à carreaux (un torchon de cuisine) */
function checkTexture(a: number, b: number): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const ca = `#${a.toString(16).padStart(6, "0")}`;
  const cb = `#${b.toString(16).padStart(6, "0")}`;
  g.fillStyle = cb;
  g.fillRect(0, 0, 64, 64);
  g.globalAlpha = 0.55;
  g.fillStyle = ca;
  g.fillRect(0, 0, 32, 64);
  g.fillRect(0, 0, 64, 32);
  g.globalAlpha = 1;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export interface HoleMeshes {
  root: THREE.Group;
  /** Ce qui bouge suit le temps du trou (secondes) */
  update(t: number, dt: number): void;
  /** Les drapeaux (se lèvent quand une balle approche) */
  flags: THREE.Object3D[];
  dispose(): void;
}

const STEP = 0.32;

/** Les sommets des autres morceaux posés sur les bords de celui-ci (pour que les sols se raccordent sans fente) */
function withJunctions(rings: Pt[][], all: Pt[]): Pt[][] {
  return rings.map((ring) => {
    const out: Pt[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      out.push(a);
      const cuts: { s: number; p: Pt }[] = [];
      for (const v of all) {
        if ((v[0] === a[0] && v[1] === a[1]) || (v[0] === b[0] && v[1] === b[1])) continue;
        const { d2, s } = segClosest(v[0], v[1], a[0], a[1], b[0], b[1]);
        if (d2 < 4e-8 && s > 1e-5 && s < 1 - 1e-5) cuts.push({ s, p: v });
      }
      cuts.sort((x, y) => x.s - y.s);
      for (const c of cuts) out.push(c.p);
    }
    return out;
  });
}

/** Chaque bord coupé en morceaux d'au plus `step` */
function densify(ring: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** L'ombre douce au pied des murs : un facteur de lumière (1 : rien autour) */
function contactShade(c: Course, x: number, z: number, h: number): number {
  let best = 1;
  const g = c.grid;
  const i = Math.floor((x - g.x0) / g.size);
  const j = Math.floor((z - g.z0) / g.size);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return 1;
  for (const wi of g.walls[j * g.nx + i]!) {
    const w = c.walls[wi]!;
    const { d2, s } = segClosest(x, z, w.ax, w.az, w.bx, w.bz);
    const top = w.a1 + (w.b1 - w.a1) * s;
    if (top < h + 0.01) continue;
    const d = Math.sqrt(d2) - w.t;
    const k = Math.min(1, Math.max(0, d / 0.26));
    best = Math.min(best, 0.62 + 0.38 * (k * k * (3 - 2 * k)));
  }
  for (const p of c.posts) {
    const d = Math.hypot(x - p.x, z - p.z) - p.r;
    const k = Math.min(1, Math.max(0, d / 0.3));
    best = Math.min(best, 0.6 + 0.4 * (k * k * (3 - 2 * k)));
  }
  return best;
}

/** Le sol d'un morceau : triangulé avec des points à l'intérieur, chaque sommet à sa hauteur */
function tileGeometry(c: Course, index_tile: number, all: Pt[]): THREE.BufferGeometry | null {
  const tile = c.tiles[index_tile]!;
  const rings = withJunctions(tile.rings, all).map((r) => densify(r, STEP));
  const contour = rings[0]!;
  const holes = rings.slice(1);
  // Les trous de golf de ce morceau
  for (const cup of c.cups) {
    if (!inRings(cup.x, cup.z, tile.rings)) continue;
    const ring: Pt[] = [];
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      ring.push([cup.x + Math.cos(a) * CUP_R, cup.z - Math.sin(a) * CUP_R]);
    }
    holes.push(ring);
  }
  // Le contour seul, triangulé, puis chaque triangle redécoupé tant qu'un côté est trop long : un côté se coupe
  // toujours en son milieu, quel que soit le triangle qui le porte, et deux triangles voisins restent soudés
  const v2 = (p: Pt) => new THREE.Vector2(p[0], p[1]);
  const flatPts: Pt[] = [...contour, ...holes.flat()];
  const tris = THREE.ShapeUtils.triangulateShape(
    contour.map(v2),
    holes.map((h) => h.map(v2)),
  );
  if (tris.length === 0) return null;
  const pts: Pt[] = [];
  const index = new Map<string, number>();
  const vid = (p: Pt) => {
    const k = `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`;
    let i = index.get(k);
    if (i === undefined) {
      i = pts.length;
      pts.push(p);
      index.set(k, i);
    }
    return i;
  };
  const idx: number[] = [];
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const long = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 > STEP * STEP;
  const emit = (a: Pt, b: Pt, c: Pt, depth: number) => {
    const ab = long(a, b);
    const bc = long(b, c);
    const ca = long(c, a);
    if (depth > 12 || (!ab && !bc && !ca)) {
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross > 0) idx.push(vid(a), vid(c), vid(b));
      else idx.push(vid(a), vid(b), vid(c));
      return;
    }
    const n = depth + 1;
    if (ab && bc && ca) {
      const m1 = mid(a, b);
      const m2 = mid(b, c);
      const m3 = mid(c, a);
      emit(a, m1, m3, n);
      emit(m1, b, m2, n);
      emit(m3, m2, c, n);
      emit(m1, m2, m3, n);
    } else if (ab && bc) {
      const m1 = mid(a, b);
      const m2 = mid(b, c);
      emit(m1, b, m2, n);
      emit(a, m1, m2, n);
      emit(a, m2, c, n);
    } else if (bc && ca) {
      emit(b, c, a, depth);
    } else if (ca && ab) {
      emit(c, a, b, depth);
    } else if (ab) {
      const m1 = mid(a, b);
      emit(a, m1, c, n);
      emit(m1, b, c, n);
    } else if (bc) {
      emit(b, c, a, depth);
    } else {
      emit(c, a, b, depth);
    }
  };
  for (const t of tris) emit(flatPts[t[0]!]!, flatPts[t[1]!]!, flatPts[t[2]!]!, 0);
  const pos = new Float32Array(pts.length * 3);
  const nor = new Float32Array(pts.length * 3);
  const uv = new Float32Array(pts.length * 2);
  const col = new Float32Array(pts.length * 3);
  const d = 0.01;
  pts.forEach((p, k) => {
    const h = tileHeight(c, index_tile, p[0], p[1]);
    pos.set([p[0], h, p[1]], k * 3);
    const gx = (tileHeight(c, index_tile, p[0] + d, p[1]) - tileHeight(c, index_tile, p[0] - d, p[1])) / (2 * d);
    const gz = (tileHeight(c, index_tile, p[0], p[1] + d) - tileHeight(c, index_tile, p[0], p[1] - d)) / (2 * d);
    const l = Math.hypot(gx, 1, gz);
    nor.set([-gx / l, 1 / l, -gz / l], k * 3);
    uv.set([p[0], p[1]], k * 2);
    const sh = contactShade(c, p[0], p[1], h);
    col.set([sh, sh, sh], k * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Un prisme droit entre deux bouts, chacun avec son bas et son haut : bordures, murs, falaises */
function prism(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  aBot: number,
  aTop: number,
  bBot: number,
  bTop: number,
  t: number,
  ext: number,
): THREE.BufferGeometry {
  const len = Math.hypot(bx - ax, bz - az) || 1;
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const nx = -uz * t;
  const nz = ux * t;
  const ex = ux * ext;
  const ez = uz * ext;
  const A = [ax - ex, az - ez];
  const B = [bx + ex, bz + ez];
  // 8 coins : bas/haut, gauche/droite, a/b
  const c = (p: number[], side: number, y: number) => [p[0]! + nx * side, y, p[1]! + nz * side];
  const faces: number[][][] = [
    // dessus
    [c(A, 1, aTop), c(B, 1, bTop), c(B, -1, bTop), c(A, -1, aTop)],
    // côtés
    [c(A, 1, aBot), c(B, 1, bBot), c(B, 1, bTop), c(A, 1, aTop)],
    [c(B, -1, bBot), c(A, -1, aBot), c(A, -1, aTop), c(B, -1, bTop)],
    // bouts
    [c(A, -1, aBot), c(A, 1, aBot), c(A, 1, aTop), c(A, -1, aTop)],
    [c(B, 1, bBot), c(B, -1, bBot), c(B, -1, bTop), c(B, 1, bTop)],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const along = (p: number[]) => (p[0]! - ax) * ux + (p[2]! - az) * uz;
  for (const f of faces) {
    const base = pos.length / 3;
    for (const p of f) {
      pos.push(p[0]!, p[1]!, p[2]!);
      uv.push(along(p) + (p[0]! + p[2]!) * 0.0, p[1]!);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  // Des uv en mètres selon le côté : le dessus en (x, z), les flancs en (longueur, hauteur)
  const P = flat.attributes.position as THREE.BufferAttribute;
  const N = flat.attributes.normal as THREE.BufferAttribute;
  const U = flat.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const nx = Math.abs(N.getX(i));
    const ny = Math.abs(N.getY(i));
    const nz = Math.abs(N.getZ(i));
    if (ny > 0.6) U.setXY(i, P.getX(i), P.getZ(i));
    else if (nx > nz) U.setXY(i, P.getZ(i), P.getY(i));
    else U.setXY(i, P.getX(i), P.getY(i));
  }
  g.dispose();
  return flat;
}

/**
 * Une bordure au dessus arrondi : son profil (un flanc, l'arrondi, le dessus, l'autre arrondi, l'autre flanc) tiré
 * de a à b, fermé aux deux bouts. Des normales lisses dans l'arrondi : la lumière y glisse, comme sur une vraie
 * bordure moulée ou une haie taillée.
 */
function railBody(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  aBot: number,
  aTop: number,
  bBot: number,
  bTop: number,
  t: number,
  ext: number,
  radius: number,
): THREE.BufferGeometry {
  const len = Math.hypot(bx - ax, bz - az) || 1;
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const nx = -uz;
  const nz = ux;
  const r = Math.max(0, Math.min(radius, t * 0.95, (Math.min(aTop - aBot, bTop - bBot) || 0.1) * 0.9));
  const k = r > 0.03 ? 5 : r > 0 ? 3 : 0;
  // Le profil : s (sur le côté), dy (sous le dessus ; null : au pied), la normale (côté, haut)
  const prof: { s: number; dy: number | null; ns: number; ny: number }[] = [{ s: -t, dy: null, ns: -1, ny: 0 }];
  const arc = (cs: number, a0: number, a1: number) => {
    for (let i = 0; i <= k; i++) {
      const a = a0 + ((a1 - a0) * i) / Math.max(1, k);
      prof.push({ s: cs + r * Math.cos(a), dy: -r + r * Math.sin(a), ns: Math.cos(a), ny: Math.sin(a) });
      if (k === 0) break;
    }
  };
  if (k === 0) {
    prof.push(
      { s: -t, dy: 0, ns: -1, ny: 0 },
      { s: -t, dy: 0, ns: 0, ny: 1 },
      { s: t, dy: 0, ns: 0, ny: 1 },
      { s: t, dy: 0, ns: 1, ny: 0 },
    );
  } else {
    arc(-t + r, Math.PI, Math.PI / 2);
    arc(t - r, Math.PI / 2, 0);
  }
  prof.push({ s: t, dy: null, ns: 1, ny: 0 });
  const ends = [
    { x: ax - ux * ext, z: az - uz * ext, bot: aBot, top: aTop, along: -ext },
    { x: bx + ux * ext, z: bz + uz * ext, bot: bBot, top: bTop, along: len + ext },
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const at = (e: (typeof ends)[number], p: (typeof prof)[number]) => [e.x + nx * p.s, p.dy === null ? e.bot : e.top + p.dy, e.z + nz * p.s];
  // La longueur du profil, pour un motif qui passe du flanc au dessus sans couture
  const run: number[] = [0];
  for (let i = 1; i < prof.length; i++) {
    const a = at(ends[0]!, prof[i - 1]!);
    const b = at(ends[0]!, prof[i]!);
    run.push(run[i - 1]! + Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!));
  }
  prof.forEach((p, i) => {
    for (const e of ends) {
      const q = at(e, p);
      pos.push(q[0]!, q[1]!, q[2]!);
      nor.push(nx * p.ns, p.ny, nz * p.ns);
      uv.push(e.along, run[i]! + aBot);
    }
  });
  for (let i = 0; i + 1 < prof.length; i++) {
    const a0 = i * 2;
    const b0 = a0 + 1;
    const a1 = a0 + 2;
    const b1 = a0 + 3;
    idx.push(a0, a1, b1, a0, b1, b0);
  }
  // Les deux bouts
  ends.forEach((e, j) => {
    const base = pos.length / 3;
    const sign = j === 0 ? -1 : 1;
    for (const p of prof) {
      const q = at(e, p);
      pos.push(q[0]!, q[1]!, q[2]!);
      nor.push(ux * sign, 0, uz * sign);
      uv.push(p.s, q[1]!);
    }
    for (let i = 1; i + 1 < prof.length; i++) {
      if (j === 1) idx.push(base, base + i, base + i + 1);
      else idx.push(base, base + i + 1, base + i);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Le dégradé d'une ombre de contact : sombre contre le bord, transparent à l'autre bout */
let contactTex: THREE.CanvasTexture | null = null;
function contactGradient(): THREE.CanvasTexture {
  if (contactTex) return contactTex;
  const cv = document.createElement("canvas");
  cv.width = 4;
  cv.height = 64;
  const g = cv.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  // L'alphaMap lit le vert : des gris, pas de la transparence
  grad.addColorStop(0, "rgb(255,255,255)");
  grad.addColorStop(0.25, "rgb(140,140,140)");
  grad.addColorStop(0.6, "rgb(38,38,38)");
  grad.addColorStop(1, "rgb(0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  contactTex = new THREE.CanvasTexture(cv);
  contactTex.wrapS = THREE.ClampToEdgeWrapping;
  contactTex.wrapT = THREE.ClampToEdgeWrapping;
  return contactTex;
}

/** Les bordures mises bout à bout (la fin de l'une est le début de la suivante) : des chaînes, ouvertes ou fermées */
function railChains(list: CWall[]): CWall[][] {
  const key = (x: number, z: number) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
  const byStart = new Map<string, CWall[]>();
  const byEnd = new Map<string, CWall[]>();
  for (const w of list) {
    const ks = key(w.ax, w.az);
    const ke = key(w.bx, w.bz);
    if (!byStart.has(ks)) byStart.set(ks, []);
    if (!byEnd.has(ke)) byEnd.set(ke, []);
    byStart.get(ks)!.push(w);
    byEnd.get(ke)!.push(w);
  }
  const used = new Set<CWall>();
  const out: CWall[][] = [];
  for (const w of list) {
    if (used.has(w)) continue;
    used.add(w);
    const chain = [w];
    for (;;) {
      const last = chain[chain.length - 1]!;
      const next = byStart.get(key(last.bx, last.bz))?.find((x) => !used.has(x));
      if (!next) break;
      used.add(next);
      chain.push(next);
    }
    for (;;) {
      const first = chain[0]!;
      const prev = byEnd.get(key(first.ax, first.az))?.find((x) => !used.has(x));
      if (!prev) break;
      used.add(prev);
      chain.unshift(prev);
    }
    out.push(chain);
  }
  return out;
}

/**
 * Un tube rond qui suit une chaîne de bordures, son dessus au haut de la bordure (plus `extra`). Il reste sur la ligne
 * des bordures et ne s'arrondit qu'au ras des coins.
 */
function railTube(chain: CWall[], r: number, extra: number): THREE.BufferGeometry {
  const first = chain[0]!;
  const last = chain[chain.length - 1]!;
  const closed = chain.length > 2 && Math.hypot(last.bx - first.ax, last.bz - first.az) < 1e-3;
  const pts: THREE.Vector3[] = [];
  const at = (x: number, y: number, z: number) => pts.push(new THREE.Vector3(x, y + extra - r, z));
  chain.forEach((w, i) => {
    const len = Math.hypot(w.bx - w.ax, w.bz - w.az);
    const k = Math.min(0.06, len * 0.3) / (len || 1);
    if (i === 0 && !closed) at(w.ax, w.a1, w.az);
    // Deux points près des bouts : la courbe reste droite entre eux
    at(w.ax + (w.bx - w.ax) * k, w.a1 + (w.b1 - w.a1) * k, w.az + (w.bz - w.az) * k);
    at(w.bx - (w.bx - w.ax) * k, w.b1 - (w.b1 - w.a1) * k, w.bz - (w.bz - w.az) * k);
    if (i === chain.length - 1 && !closed) at(w.bx, w.b1, w.bz);
  });
  const curve = new THREE.CatmullRomCurve3(pts, closed, "centripetal");
  const length = chain.reduce((s, w) => s + Math.hypot(w.bx - w.ax, w.bz - w.az), 0);
  const g = new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(length / 0.04)), r, 12, closed);
  // Des uv en mètres le long du tube
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * length, uv.getY(i) * Math.PI * 2 * r);
  if (!closed) {
    // Des bouchons ronds aux deux bouts
    const caps = [first, last].map((w, j) => {
      const s = new THREE.SphereGeometry(r, 12, 8);
      const x = j === 0 ? w.ax : w.bx;
      const z = j === 0 ? w.az : w.bz;
      const y = (j === 0 ? w.a1 : w.b1) + extra - r;
      s.translate(x, y, z);
      return s;
    });
    const all = mergeGeometries([g, ...caps].map((x) => x.toNonIndexed()))!;
    g.dispose();
    for (const c of caps) c.dispose();
    return all;
  }
  return g;
}

function merged(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (list.length === 0) return null;
  const g = mergeGeometries(
    list.map((x) => {
      const y = x.index ? x.toNonIndexed() : x;
      for (const name of Object.keys(y.attributes)) if (!["position", "normal", "uv", "color"].includes(name)) y.deleteAttribute(name);
      return y;
    }),
    false,
  );
  for (const x of list) x.dispose();
  return g;
}

function w0(list: CWall[]): CWall {
  return list[0]!;
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const l = m.get(k);
    if (l) l.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** La hampe et le drapeau d'un trou, le fond du trou et son liseré blanc */
function cupModel(color: number): { group: THREE.Group; flag: THREE.Object3D } {
  const group = new THREE.Group();
  const liner = new THREE.Mesh(
    new THREE.CylinderGeometry(CUP_R, CUP_R, 0.14, 28, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5, side: THREE.BackSide }),
  );
  liner.position.y = -0.07;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 28), new THREE.MeshStandardMaterial({ color: 0x1b1d1a, roughness: 1 }));
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.135;
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(CUP_R * 0.985, CUP_R * 0.985, 0.1, 28, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2a2c28, roughness: 1, side: THREE.BackSide }),
  );
  inner.position.y = -0.085;
  group.add(liner, inner, bottom);
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.011, 1.25, 10),
    new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.35, metalness: 0.1 }),
  );
  pole.position.y = 0.6;
  pole.castShadow = true;
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.22, 8, 4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }),
  );
  cloth.geometry.translate(0.17, 0, 0);
  cloth.position.set(0.012, 1.08, 0);
  cloth.castShadow = true;
  cloth.name = "cloth";
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.6, roughness: 0.3 }),
  );
  knob.position.y = 1.23;
  flag.add(pole, cloth, knob);
  group.add(flag);
  return { group, flag };
}

/** Une pièce d'obstacle en formes simples (quand le thème n'a rien de mieux) */
function partMesh(p: Part, mat: THREE.Material): THREE.Mesh {
  switch (p.k) {
    case "wall": {
      const g = prism(p.a[0], p.a[1], p.b[0], p.b[1], Math.max(p.y0, -0.3), p.y1, Math.max(p.y0, -0.3), p.y1, p.t, 0);
      return new THREE.Mesh(g, mat);
    }
    case "post": {
      const y0 = Math.max(p.y0, -0.3);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, p.y1 - y0, 16), mat);
      m.position.set(p.c[0], (p.y1 + y0) / 2, p.c[1]);
      return m;
    }
    case "cap": {
      const a = new THREE.Vector3(...p.a);
      const b = new THREE.Vector3(...p.b);
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(p.r, len, 4, 10), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      return m;
    }
  }
}

/**
 * Les bandes d'ombre de contact : le long de chaque bord extérieur de la piste (bordé ou non), une bande posée sur le
 * sol du décor, sombre contre la piste et qui s'efface en s'éloignant. Pas au-dessus d'un trou dans le sol.
 */
function contactStrips(c: Course, rails: CWall[]): THREE.BufferGeometry | null {
  const W = 0.42;
  const y = c.outY + 0.004;
  const pos: number[] = [];
  const uv: number[] = [];
  const outside = (x: number, z: number) => !c.tiles.some((u) => inRings(x, z, u.rings));
  const open = (x: number, z: number) => c.def.opens.some((o) => inRings(x, z, [o]));
  const strip = (ax: number, az: number, bx: number, bz: number, ox: number, oz: number, from: number) => {
    // (ox, oz) : la direction vers le dehors ; `from` : à quelle distance du bord la bande commence
    const p = (x: number, z: number, d: number) => [x + ox * d, z + oz * d];
    const a0 = p(ax, az, from);
    const b0 = p(bx, bz, from);
    const a1 = p(ax, az, from + W);
    const b1 = p(bx, bz, from + W);
    const quad = [a0, b0, b1, a0, b1, a1];
    const v = [0, 0, 1, 0, 1, 1];
    // L'ordre des sommets pour que la bande regarde vers le haut
    const cross = (b0[0]! - a0[0]!) * (a1[1]! - a0[1]!) - (b0[1]! - a0[1]!) * (a1[0]! - a0[0]!);
    const order = cross < 0 ? [0, 1, 2, 3, 4, 5] : [0, 2, 1, 3, 5, 4];
    for (const i of order) {
      pos.push(quad[i]![0]!, y, quad[i]![1]!);
      uv.push(0.5, 1 - v[i]!);
    }
  };
  for (const t of c.tiles) {
    if (t.phys.hazard) continue;
    for (const ring of t.rings) {
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k]!;
        const b = ring[(k + 1) % ring.length]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-4) continue;
        const mx = (a[0] + b[0]) / 2;
        const mz = (a[1] + b[1]) / 2;
        let ox = -(b[1] - a[1]) / len;
        let oz = (b[0] - a[0]) / len;
        // Le dehors est d'un côté et un seul
        const plus = outside(mx + ox * 0.03, mz + oz * 0.03);
        const minus = outside(mx - ox * 0.03, mz - oz * 0.03);
        if (plus === minus) continue;
        if (!plus) {
          ox = -ox;
          oz = -oz;
        }
        if (open(mx + ox * 0.3, mz + oz * 0.3)) continue;
        // Une bordure : la bande commence derrière elle
        const railed = rails.find((w) => segClosest(mx, mz, w.ax, w.az, w.bx, w.bz).d2 < 1e-6);
        strip(a[0], a[1], b[0], b[1], ox, oz, railed ? railed.t : 0);
      }
    }
  }
  if (pos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function buildHoleMeshes(c: Course, kit: ThemeKit): HoleMeshes {
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
  const all: Pt[] = c.tiles.flatMap((t) => t.rings.flat());

  // Le sol, morceau par morceau, rassemblé par matière
  const solids = c.tiles.map((t, i) => ({ t, i })).filter(({ t }) => !t.phys.hazard);
  for (const [key, list] of groupBy(solids, ({ t }) => `${t.mat}|${t.look ?? ""}`)) {
    const geo = merged(list.map(({ i }) => tileGeometry(c, i, all)).filter((g): g is THREE.BufferGeometry => g !== null));
    if (!geo) continue;
    const [mat, look] = key.split("|") as [Mat, string];
    const mesh = new THREE.Mesh(keep(geo), kit.ground(mat, look || undefined));
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // L'eau et la lave : la surface, et un fond sombre dessous
  for (const [key, list] of groupBy(
    c.tiles.map((t, i) => ({ t, i })).filter(({ t }) => t.phys.hazard),
    ({ t }) => t.look ?? t.mat,
  )) {
    const geo = merged(list.map(({ i }) => tileGeometry(c, i, all)).filter((g): g is THREE.BufferGeometry => g !== null));
    if (!geo) continue;
    const surface = new THREE.Mesh(keep(geo), kit.water(key));
    surface.renderOrder = 2;
    root.add(surface);
    const bed = new THREE.Mesh(
      geo,
      keep(new THREE.MeshStandardMaterial({ color: list[0]!.t.mat === "lava" ? 0x3a0d04 : 0x1d3a3a, roughness: 1 })),
    );
    bed.position.y = -0.22;
    root.add(bed);
  }

  // Les bordures, les murs, les falaises
  const rails = c.walls.filter((w) => w.kind === "rail");
  for (const [look, list] of groupBy(rails, (w) => w.look ?? "")) {
    const style = kit.rail(look || undefined);
    if (style.round && style.tube) {
      // Un tube continu (une rampe de laiton) : il suit les bordures bout à bout et se courbe avec elles
      const r = w0(list).t + style.widen;
      const tubes = merged(railChains(list).map((ch) => railTube(ch, r, style.extra)));
      if (tubes) {
        const mesh = new THREE.Mesh(keep(tubes), style.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
      }
    }
    if (style.round) {
      // Des rondins : un tronc couché le long de chaque bordure, sur un flanc jusqu'au sol du décor
      const r = w0(list).t + style.widen;
      const logs = style.tube
        ? null
        : merged(
            list.map((w) => {
              const len = Math.hypot(w.bx - w.ax, w.bz - w.az) + r * 1.6;
              const g = new THREE.CylinderGeometry(r, r, len, 12, 1);
              g.rotateZ(Math.PI / 2);
              g.rotateY(-Math.atan2(w.bz - w.az, w.bx - w.ax));
              const top = (w.a1 + w.b1) / 2 + style.extra;
              g.translate((w.ax + w.bx) / 2, top - r, (w.az + w.bz) / 2);
              return g;
            }),
          );
      if (logs) {
        const mesh = new THREE.Mesh(keep(logs), style.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
      }
      const skirt = merged(
        list.map((w) => prism(w.ax, w.az, w.bx, w.bz, c.outY - 0.02, w.a1 - RAIL_H, c.outY - 0.02, w.b1 - RAIL_H, w.t * 0.8, w.t * 0.8)),
      );
      if (skirt) {
        const mesh = new THREE.Mesh(keep(skirt), kit.side());
        mesh.receiveShadow = true;
        root.add(mesh);
      }
      continue;
    }
    const half = w0(list).t + style.widen;
    const bevel = style.bevel ?? Math.min(0.45 * half, 0.03);
    const geo = merged(
      list.map((w) =>
        railBody(
          w.ax,
          w.az,
          w.bx,
          w.bz,
          c.outY - 0.02,
          w.a1 + style.extra,
          c.outY - 0.02,
          w.b1 + style.extra,
          w.t + style.widen,
          w.t + style.widen,
          bevel,
        ),
      ),
    );
    if (!geo) continue;
    const mesh = new THREE.Mesh(keep(geo), style.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const walls = c.walls.filter((w) => w.kind === "wall");
  for (const [look, list] of groupBy(walls, (w) => w.look ?? "")) {
    const geo = merged(
      list.map((w) => railBody(w.ax, w.az, w.bx, w.bz, w.a1 - 0.6, w.a1, w.b1 - 0.6, w.b1, w.t, w.t, Math.min(0.45 * w.t, 0.03))),
    );
    if (!geo) continue;
    const mesh = new THREE.Mesh(keep(geo), kit.wall(look || undefined));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const cliffs = c.walls.filter((w) => w.kind === "cliff");
  for (const [look, list] of groupBy(cliffs, (w: CWall) => w.look ?? "")) {
    const geo = merged(list.map((w) => prism(w.ax, w.az, w.bx, w.bz, w.a0 + 3, w.a1, w.b0 + 3, w.b1, 0.004, 0.002)));
    if (!geo) continue;
    const mesh = new THREE.Mesh(keep(geo), kit.side(look || undefined));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    root.add(mesh);
  }
  // Les bords sans bordure (vers l'eau, un saut, le vide) : un flanc jusqu'au sol du décor
  const sideGeo: THREE.BufferGeometry[] = [];
  c.tiles.forEach((t, i) => {
    if (t.phys.hazard) return;
    for (const ring of t.rings) {
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k]!;
        const b = ring[(k + 1) % ring.length]!;
        const mx = (a[0] + b[0]) / 2;
        const mz = (a[1] + b[1]) / 2;
        // Un bord intérieur (un autre morceau de l'autre côté) ou déjà bordé : rien à faire
        const nx = -(b[1] - a[1]);
        const nz = b[0] - a[0];
        const l = Math.hypot(nx, nz) || 1;
        const ox = mx + (nx / l) * 0.02;
        const oz = mz + (nz / l) * 0.02;
        const ix = mx - (nx / l) * 0.02;
        const iz = mz - (nz / l) * 0.02;
        const outside = (x: number, z: number) => !c.tiles.some((u) => inRings(x, z, u.rings));
        if (!outside(ox, oz) && !outside(ix, iz)) continue;
        const railed = rails.some((w) => segClosest(mx, mz, w.ax, w.az, w.bx, w.bz).d2 < 1e-6);
        if (railed) continue;
        const ha = tileHeight(c, i, a[0], a[1]);
        const hb = tileHeight(c, i, b[0], b[1]);
        sideGeo.push(prism(a[0], a[1], b[0], b[1], c.outY - 0.02, ha - 0.003, c.outY - 0.02, hb - 0.003, 0.003, 0.001));
      }
    }
  });
  const sideMerged = merged(sideGeo);
  if (sideMerged) {
    const mesh = new THREE.Mesh(keep(sideMerged), kit.side());
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // L'ombre douce au pied de la piste, sur le sol du décor : la piste se pose sur le sol au lieu de flotter
  const contact = contactStrips(c, rails);
  if (contact) {
    const mesh = new THREE.Mesh(
      keep(contact),
      keep(
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          alphaMap: contactGradient(),
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      ),
    );
    mesh.renderOrder = 1;
    root.add(mesh);
  }

  // Les poteaux
  for (const p of c.posts) {
    const g = tileHeight(
      c,
      Math.max(
        0,
        c.tiles.findIndex((t) => inRings(p.x, p.z, t.rings)),
      ),
      p.x,
      p.z,
    );
    const obj = kit.post(p.look, p.r, p.y1 - g);
    obj.position.set(p.x, g, p.z);
    root.add(obj);
  }

  // Les trous et leurs drapeaux
  const flags: THREE.Object3D[] = [];
  for (const cup of c.cups) {
    const { group, flag } = cupModel(kit.flag);
    group.position.set(cup.x, cup.rim, cup.z);
    root.add(group);
    flags.push(flag);
  }

  // Le tapis de départ : un carré aux coins arrondis, une bordure plus claire, le point blanc où poser la balle ; de part
  // et d'autre, deux petites bornes de bois au chapeau rouge (pas des boules : on les prendrait pour des balles)
  const teeShape = (h: number, r: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(-h + r, -h);
    sh.lineTo(h - r, -h);
    sh.quadraticCurveTo(h, -h, h, -h + r);
    sh.lineTo(h, h - r);
    sh.quadraticCurveTo(h, h, h - r, h);
    sh.lineTo(-h + r, h);
    sh.quadraticCurveTo(-h, h, -h, h - r);
    sh.lineTo(-h, -h + r);
    sh.quadraticCurveTo(-h, -h, -h + r, -h);
    return sh;
  };
  const tl = kit.tee ?? GARDEN_TEE;
  const teeGroup = new THREE.Group();
  teeGroup.position.set(c.tee.x, c.tee.y - BALL_R, c.tee.z);
  teeGroup.rotation.y = -c.tee.aim;
  const rim = new THREE.Mesh(
    keep(new THREE.ExtrudeGeometry(teeShape(0.26, 0.06), { depth: 0.012, bevelEnabled: false, curveSegments: 6 })),
    keep(new THREE.MeshStandardMaterial({ color: tl.rim, roughness: tl.metal ? 0.4 : 0.9, metalness: tl.metal ? 0.6 : 0 })),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.001;
  rim.receiveShadow = true;
  const pad = new THREE.Mesh(
    keep(new THREE.ExtrudeGeometry(teeShape(0.225, 0.045), { depth: 0.004, bevelEnabled: false, curveSegments: 6 })),
    keep(
      new THREE.MeshStandardMaterial({
        color: tl.check !== undefined ? 0xffffff : tl.pad,
        map: tl.check !== undefined ? keep(checkTexture(tl.pad, tl.check)) : null,
        roughness: tl.metal ? 0.5 : 0.95,
        metalness: tl.metal ? 0.5 : 0,
      }),
    ),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.012;
  pad.receiveShadow = true;
  const spot = new THREE.Mesh(
    keep(new THREE.CircleGeometry(0.028, 20)),
    keep(
      new THREE.MeshStandardMaterial({
        color: tl.spot,
        roughness: 0.8,
        emissive: tl.glow ? tl.spot : 0x000000,
        emissiveIntensity: tl.glow ? 1.4 : 0,
      }),
    ),
  );
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.0175;
  teeGroup.add(rim, pad, spot);
  const post = keep(new THREE.CylinderGeometry(0.022, 0.026, 0.075, 12));
  const cap = keep(new THREE.SphereGeometry(0.03, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  const postMat = keep(new THREE.MeshStandardMaterial({ color: tl.post, roughness: tl.metal ? 0.35 : 0.7, metalness: tl.metal ? 0.7 : 0 }));
  const capMat = keep(
    new THREE.MeshStandardMaterial({
      color: tl.cap,
      roughness: 0.45,
      emissive: tl.glow ? tl.cap : 0x000000,
      emissiveIntensity: tl.glow ? 0.8 : 0,
    }),
  );
  for (const side of [-1, 1]) {
    const m = new THREE.Group();
    const body = new THREE.Mesh(post, postMat);
    body.position.y = 0.0375;
    const top = new THREE.Mesh(cap, capMat);
    top.scale.y = 0.7;
    top.position.y = 0.074;
    m.add(body, top);
    m.position.set(0, 0, side * 0.34);
    m.traverse((o) => (o.castShadow = true));
    teeGroup.add(m);
  }
  root.add(teeGroup);

  // Les tubes : un verre clair qui laisse voir la balle
  const glass = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0xcfeaff,
      roughness: 0.08,
      transmission: 0.0,
      transparent: true,
      opacity: 0.28,
      metalness: 0,
      clearcoat: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  for (const r of c.rails) {
    const curve = new THREE.CatmullRomCurve3(r.def.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const tube = new THREE.Mesh(
      keep(new THREE.TubeGeometry(curve, Math.max(24, Math.round(r.total * 12)), BALL_R * 1.7, 14, false)),
      glass,
    );
    tube.renderOrder = 3;
    root.add(tube);
    const ringMat = keep(new THREE.MeshStandardMaterial({ color: 0xc89b3c, metalness: 0.8, roughness: 0.3 }));
    for (const s of [0, 1]) {
      const p = curve.getPointAt(s);
      const tangent = curve.getTangentAt(s);
      const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(BALL_R * 1.75, 0.018, 8, 20)), ringMat);
      ring.position.copy(p);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      root.add(ring);
    }
  }

  // Tremplins, téléporteurs, accélérateurs : des disques et des flèches qui brillent
  const glow = (color: number) =>
    keep(
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.4, transparent: true, opacity: 0.9 }),
    );
  const disc = (x: number, z: number, r: number, color: number) => {
    const m = new THREE.Mesh(keep(new THREE.RingGeometry(r * 0.55, r, 32)), glow(color));
    const tile = c.tiles.findIndex((t) => inRings(x, z, t.rings));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, (tile >= 0 ? tileHeight(c, tile, x, z) : 0) + 0.004, z);
    root.add(m);
    return m;
  };
  const spinning: THREE.Object3D[] = [];
  for (const p of c.def.portals) {
    spinning.push(disc(p.a[0], p.a[1], p.r, 0x9b6cff));
    disc(p.b[0], p.b[1], p.r * 0.8, 0x6ce0ff);
  }
  for (const p of c.def.pads) disc(p.c[0], p.c[1], p.r, 0xff8a3a);
  for (const b of c.def.boosts) {
    const cx = b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length;
    const cz = b.ring.reduce((s, p) => s + p[1], 0) / b.ring.length;
    const arrow = new THREE.Shape();
    arrow.moveTo(0, 0.18);
    arrow.lineTo(0.16, -0.06);
    arrow.lineTo(0.06, -0.06);
    arrow.lineTo(0.06, -0.18);
    arrow.lineTo(-0.06, -0.18);
    arrow.lineTo(-0.06, -0.06);
    arrow.lineTo(-0.16, -0.06);
    const m = new THREE.Mesh(keep(new THREE.ShapeGeometry(arrow)), glow(0x3affb0));
    const tile = c.tiles.findIndex((t) => inRings(cx, cz, t.rings));
    m.rotation.set(-Math.PI / 2, 0, -b.dir - Math.PI / 2);
    m.position.set(cx, (tile >= 0 ? tileHeight(c, tile, cx, cz) : 0) + 0.005, cz);
    root.add(m);
  }

  // Ce qui bouge : chaque obstacle dans un groupe dont la matrice suit sa pose
  const moving: { obj: THREE.Object3D; def: MoverDef }[] = [];
  const plain = keep(new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.6 }));
  for (const m of c.def.movers) {
    let obj = kit.mover(m, c);
    if (!obj) {
      const g = new THREE.Group();
      for (const p of m.parts) {
        const mesh = partMesh(p, plain);
        mesh.castShadow = true;
        g.add(mesh);
      }
      obj = g;
    }
    obj.matrixAutoUpdate = false;
    root.add(obj);
    moving.push({ obj, def: m });
  }

  const tmp = new THREE.Matrix4();
  return {
    root,
    flags,
    update(t: number, dt: number) {
      for (const { obj, def } of moving) {
        const pose = poseAt(def.motion, t);
        const m = pose.m;
        // p' = R(p − pivot) + pivot + move
        const o = posePoint(pose, 0, 0, 0);
        tmp.set(m[0]!, m[1]!, m[2]!, o[0], m[3]!, m[4]!, m[5]!, o[1], m[6]!, m[7]!, m[8]!, o[2], 0, 0, 0, 1);
        obj.matrix.copy(tmp);
        obj.matrixWorldNeedsUpdate = true;
        // Le thème peut animer l'intérieur (un rocher qui roule) d'après le déplacement
        const onPose = obj.userData.onPose as ((move: readonly number[], t: number) => void) | undefined;
        onPose?.(o, t);
      }
      for (const s of spinning) s.rotation.z += dt * 2.4;
      for (const f of flags) {
        const cloth = f.getObjectByName("cloth");
        if (cloth) cloth.rotation.y = Math.sin(t * 2.1 + f.id) * 0.25;
      }
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const d of disposables) d.dispose();
    },
  };
}
