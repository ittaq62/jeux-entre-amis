import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GROUP_ORDER, GROUPS, SQUARES } from "../../../shared/games/capitale/board.ts";
import { BUILDS, footprint, type BuildKind, type Placed } from "../../../shared/games/capitale/builder.ts";
import {
  BLOCK,
  baseCells,
  CELLS,
  cellIndex,
  cellX,
  cellZ,
  boxOf,
  DISTRICT_CELLS,
  LOTS,
  MAP,
  MAP_CITIES,
  neighbors,
  onMap,
  parcelNumber,
  rectCells,
  sideOfSquare,
  type Lot,
  type Rect,
} from "../../../shared/games/capitale/builderMap.ts";
import type { Deed } from "../../../shared/games/capitale/engine.ts";
import * as B from "./buildings.ts";
import { CITY_HALF } from "./city.ts";
import * as LM from "./landmarks.ts";
import * as S from "./streets.ts";
import { makeCanvas, mix, signTexture } from "./textures.ts";

// Capitale Builder : la carte du centre du plateau en 3D, dessinée comme le plan d'une ville. Le fleuve et ses ponts,
// ses bateaux ; l'avenue et ses voitures ; les squares arborés ; chaque quartier dans son liseré lumineux, ses
// parcelles numérotées et sa réserve hachurée. Les frontières de chaque ville à la couleur de son propriétaire, ses
// bâtiments posés là où il les a mis, et l'aperçu de ce qu'on s'apprête à poser (cases vertes ou rouges, zone d'une
// nuisance). Les bâtiments d'une ville sont fondus en quelques maillages (un par matière) ; celui qui vient d'être posé
// reste à part le temps de sortir de terre.

/** Le côté d'une case, dans le monde */
export const CELL = (2 * CITY_HALF) / MAP;

export interface WRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Le milieu d'une case, dans le monde */
export function cellCenter(cell: number): { x: number; z: number } {
  return { x: -CITY_HALF + (cellX(cell) + 0.5) * CELL, z: -CITY_HALF + (cellZ(cell) + 0.5) * CELL };
}

/** Un rectangle de cases, dans le monde */
export function rectWorld(r: Rect): WRect {
  return { x: -CITY_HALF + r.x * CELL, z: -CITY_HALF + r.z * CELL, w: r.w * CELL, d: r.d * CELL };
}

/** La case sous un point du monde, ou null hors de la carte */
export function cellAt(x: number, z: number): number | null {
  const cx = Math.floor((x + CITY_HALF) / CELL);
  const cz = Math.floor((z + CITY_HALF) / CELL);
  return cx >= 0 && cz >= 0 && cx < MAP && cz < MAP ? cellIndex(cx, cz) : null;
}

/** La case d'une liste la plus proche d'un point (en cases) */
function nearestCell(list: number[], x: number, z: number): number {
  let best = list[0]!;
  let gap = Infinity;
  for (const c of list) {
    const d = (cellX(c) - x) ** 2 + (cellZ(c) - z) ** 2;
    if (d < gap - 1e-9) [best, gap] = [c, d];
  }
  return best;
}

/** La case d'un ensemble la plus proche de son milieu */
export function middleCell(cells: Iterable<number>): number {
  const list = [...cells];
  const mx = list.reduce((n, c) => n + cellX(c), 0) / list.length;
  const mz = list.reduce((n, c) => n + cellZ(c), 0) / list.length;
  return nearestCell(list, mx, mz);
}

/** Le milieu (dans le monde) du bloc de 2 × 2 cases qui contient une case */
function blockCenter(cell: number): { x: number; z: number } {
  const bx = Math.floor(cellX(cell) / BLOCK) * BLOCK;
  const bz = Math.floor(cellZ(cell) / BLOCK) * BLOCK;
  return { x: -CITY_HALF + (bx + BLOCK / 2) * CELL, z: -CITY_HALF + (bz + BLOCK / 2) * CELL };
}

/**
 * Les deux places d'une parcelle : le bloc du milieu, où son numéro est peint au sol, et le bloc voisin le plus
 * central, où se plante le panneau « à vendre » (puis le drapeau du propriétaire)
 */
export function parcelSpots(square: number): { number: { x: number; z: number }; sign: { x: number; z: number } } {
  const cells = baseCells(square);
  const mx = cells.reduce((n, c) => n + cellX(c), 0) / cells.length;
  const mz = cells.reduce((n, c) => n + cellZ(c), 0) / cells.length;
  const mid = nearestCell(cells, mx, mz);
  const blockOf = (c: number) => `${Math.floor(cellX(c) / BLOCK)},${Math.floor(cellZ(c) / BLOCK)}`;
  const others = cells.filter((c) => blockOf(c) !== blockOf(mid));
  return { number: blockCenter(mid), sign: blockCenter(nearestCell(others.length > 0 ? others : cells, mx, mz)) };
}

/** Le quart de tour qui tourne les façades d'une ville vers sa case du plateau (rot 0) */
const FACING: Record<ReturnType<typeof sideOfSquare>, number> = { bottom: 0, right: 1, top: 2, left: 3 };

/** Le livrée des trains de chaque gare */
const LIVERIES: Record<number, string> = { 5: "#2f5bb8", 15: "#e07a2c", 25: "#8b97a3", 35: "#c0392b" };

// ---------------------------------------------------------------------------
// Les modèles
// ---------------------------------------------------------------------------

/** Un commerce : une petite maison de la ville, sa vitrine et son store à rayures */
function shop(index: number, accent: string): THREE.Group {
  const g = new THREE.Group();
  g.add(S.cityHouse(index, accent, 1));
  const awning = B.mat(accent, { rough: 0.55 });
  const white = B.mat("#f6f1e6", { rough: 0.6 });
  for (let k = 0; k < 5; k++) {
    const strip = B.box(0.062, 0.012, 0.09, k % 2 ? white : awning, -0.124 + k * 0.062, 0.15, 0.17);
    strip.rotation.x = 0.35;
    g.add(strip);
  }
  g.add(B.box(0.25, 0.08, 0.012, B.mat("#9fc4d6", { rough: 0.2, metal: 0.3 }), 0, 0.03, 0.146));
  return B.bake(B.shadowed(g));
}

/** Un immeuble de deux cases : deux bâtiments de la ville l'un derrière l'autre, de hauteurs différentes */
function doubleBlock(index: number, accent: string, id: number): THREE.Group {
  const g = new THREE.Group();
  const front = S.cityBlock(index, accent, id % 2 ? 1 : 0);
  const back = S.cityBlock(index, accent, id % 2 ? 2 : 1);
  fitInto(front, 1, 1, 0.92);
  fitInto(back, 1, 1, 0.92);
  front.position.z += 0.5;
  back.position.z -= 0.5;
  back.rotation.y = Math.PI;
  g.add(front, back);
  return g;
}

/** Ce qui vit dans un bâtiment : le jet d'eau du parc, les mouettes de la décharge, la vapeur de la centrale */
export interface Living {
  kind: "jet" | "birds" | "steam";
  obj: THREE.Object3D;
}

/** Le modèle d'un bâtiment, à sa taille de jouet (repère : le sol au centre, la façade vers +z) */
export function buildModel(kind: BuildKind, index: number, color: string, id = 0): { obj: THREE.Object3D; living: Living | null } {
  switch (kind) {
    case "maison":
      return { obj: S.cityHouse(index, color, id % 2), living: null };
    case "commerce":
      return { obj: shop(index, color), living: null };
    case "immeuble":
      return { obj: doubleBlock(index, color, id), living: null };
    case "tour":
      return { obj: LM.skyscraper(color), living: null };
    case "monument":
      return { obj: LM.landmark(index, color), living: null };
    case "stade":
      return { obj: B.stade(color), living: null };
    case "parc": {
      const p = B.parc();
      return { obj: p.group, living: { kind: "jet", obj: p.jet } };
    }
    case "decharge": {
      const p = B.decharge();
      return { obj: p.group, living: { kind: "birds", obj: p.birds } };
    }
    case "centrale": {
      const p = B.centrale();
      return { obj: p.group, living: { kind: "steam", obj: p.steam } };
    }
  }
}

/** Le terrain vague, pour l'album : de la terre sèche, des touffes, deux piquets et une corde, un panneau « À annexer » */
export function vacantLot(): THREE.Group {
  const g = new THREE.Group();
  const earth = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.31, 0.03, 40), B.mat("#c9b083", { rough: 1 }));
  earth.position.y = 0.006;
  g.add(earth);
  const tuft = B.mat("#7f9a4a", { flat: true, rough: 1 });
  const stone = B.mat("#a89a86", { flat: true, rough: 1 });
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4;
    const r = 0.08 + (k % 4) * 0.05;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(k % 3 ? 0.022 : 0.016, 0), k % 3 ? tuft : stone);
    m.position.set(Math.cos(a) * r, 0.026, Math.sin(a) * r);
    m.scale.y = k % 3 ? 1.4 : 0.7;
    g.add(m);
  }
  const wood = B.mat("#8a6236", { rough: 0.9 });
  for (const [x, z] of [
    [-0.2, 0.16],
    [0.2, 0.16],
    [0.2, -0.16],
  ] as const) {
    g.add(B.cyl(0.008, 0.009, 0.12, wood, 6, x, 0.02, z));
  }
  const rope = B.mat("#e8d9a6", { rough: 0.9 });
  g.add(B.box(0.4, 0.006, 0.006, rope, 0, 0.12, 0.16));
  g.add(B.box(0.006, 0.006, 0.32, rope, 0.2, 0.12, 0));
  // Le panneau
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.09, 0.008),
    new THREE.MeshStandardMaterial({
      map: signTexture("À ANNEXER", "#f6efe1", "#3a3226", 256, 116, '"Big Shoulders Display Variable", Impact, sans-serif', "#d9b24a"),
      roughness: 0.6,
    }),
  );
  sign.position.set(-0.04, 0.17, 0.02);
  sign.rotation.y = 0.25;
  g.add(sign, B.cyl(0.007, 0.007, 0.15, wood, 6, -0.04, 0.02, 0.012));
  return B.bake(B.shadowed(g));
}

/** Ajuste un modèle à une emprise de w × d (même unité que lui une fois mis à l'échelle), posé au sol, centré */
function fitInto(o: THREE.Object3D, w: number, d: number, margin = 0.88) {
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3());
  const s = Math.min((w * margin) / Math.max(1e-3, size.x), (d * margin) / Math.max(1e-3, size.z));
  const center = box.getCenter(new THREE.Vector3());
  o.scale.multiplyScalar(s);
  o.position.set(o.position.x - center.x * s, o.position.y - box.min.y * s, o.position.z - center.z * s);
}

/**
 * Un bâtiment posé, prêt à mettre dans la scène : son modèle ajusté à son emprise, tourné de son quart de tour, au
 * milieu de ses cases
 */
export function placedModel(b: Placed, index: number, color: string): { obj: THREE.Group; living: Living | null } {
  const info = BUILDS[b.kind];
  const { obj, living } = buildModel(b.kind, index, color, b.id);
  const quarter = (b.rot + FACING[sideOfSquare(index)]) & 3;
  // L'emprise dans le repère du modèle : un quart de tour (ou trois) échange largeur et profondeur
  const fp = footprint(b);
  const odd = (quarter & 1) === 1;
  const lw = (odd ? fp.d : fp.w) * CELL;
  const ld = (odd ? fp.w : fp.d) * CELL;
  const inner = new THREE.Group();
  if (b.kind === "immeuble") {
    // Le double immeuble est déjà en cases (1 × 2) : on le met à l'échelle d'une case, couché s'il le faut
    obj.scale.multiplyScalar(CELL);
    if (lw > ld) obj.rotation.y = Math.PI / 2;
    inner.add(obj);
  } else {
    inner.add(obj);
    fitInto(obj, lw, ld, info.w * info.d >= 4 ? 0.94 : 0.86);
  }
  const holder = new THREE.Group();
  holder.add(inner);
  holder.rotation.y = (quarter * Math.PI) / 2;
  const r = rectWorld(fp);
  holder.position.set(r.x + r.w / 2, 0, r.z + r.d / 2);
  holder.userData.square = index;
  return { obj: holder, living };
}

// ---------------------------------------------------------------------------
// Le fleuve, ses ponts, ses bateaux ; l'avenue et ses voitures
// ---------------------------------------------------------------------------

/** Les ponts : chacun dans le rectangle de ses cases */
function bridgeRects(): Rect[] {
  const seen = new Set<number>();
  const out: Rect[] = [];
  CELLS.forEach((cell, c) => {
    if (cell.kind !== "bridge" || seen.has(c)) return;
    const group = [c];
    seen.add(c);
    for (let q = 0; q < group.length; q++) {
      for (const n of neighbors(group[q]!)) {
        if (CELLS[n]!.kind !== "bridge" || seen.has(n)) continue;
        seen.add(n);
        group.push(n);
      }
    }
    out.push(boxOf(group));
  });
  return out;
}

/** Un pont de pierre qui enjambe le fleuve (du nord au sud), assez haut pour que les bateaux passent dessous */
function bridgeModel(r: WRect): THREE.Group {
  const g = new THREE.Group();
  const stone = B.mat("#d6ccb8", { rough: 0.85 });
  const deck = B.mat("#a8a196", { rough: 0.9 });
  const rail = B.mat("#efe8da", { rough: 0.7 });
  const w = r.w * 0.86;
  const top = 0.11;
  const th = 0.022;
  const ramp = CELL;
  const cx = r.x + r.w / 2;
  const z0 = r.z;
  const z1 = r.z + r.d;
  // Le tablier plat au-dessus de l'eau, ses parapets, sa pile au milieu
  const flat = z1 - z0 - 2 * ramp;
  g.add(B.box(w, th, flat, deck, cx, top - th, (z0 + z1) / 2));
  for (const side of [-1, 1]) g.add(B.box(0.014, 0.03, flat, rail, cx + (side * (w - 0.014)) / 2, top, (z0 + z1) / 2));
  g.add(B.box(w * 0.7, top - th, 0.04, stone, cx, 0, (z0 + z1) / 2));
  // Les deux rampes, depuis les quais
  const len = Math.hypot(ramp, top);
  const tilt = Math.atan2(top, ramp);
  for (const [z, dir] of [
    [z0, 1],
    [z1, -1],
  ] as const) {
    const part = new THREE.Group();
    part.position.set(cx, 0.004, z);
    part.rotation.x = -tilt * dir;
    part.add(B.box(w, th, len, deck, 0, -th, (dir * len) / 2));
    for (const side of [-1, 1]) part.add(B.box(0.014, 0.03, len, rail, (side * (w - 0.014)) / 2, 0, (dir * len) / 2));
    g.add(part);
  }
  // Un réverbère à chaque coin du tablier
  for (const z of [z0 + ramp, z1 - ramp]) {
    for (const side of [-1, 1]) {
      const l = B.lamp();
      l.scale.setScalar(0.7);
      l.position.set(cx + (side * (w - 0.014)) / 2, top + 0.03, z);
      g.add(l);
    }
  }
  return B.shadowed(g);
}

/** Une péniche : la coque sombre, sa cargaison de sable, la timonerie à l'arrière (l'avant vers +x) */
function barge(hull: string, cargo: string): THREE.Group {
  const g = new THREE.Group();
  const hullMat = B.mat(hull, { rough: 0.6 });
  g.add(B.box(0.28, 0.024, 0.075, hullMat));
  g.add(B.box(0.272, 0.004, 0.067, B.mat("#5b4a3a"), 0, 0.024));
  g.add(B.box(0.15, 0.018, 0.055, B.mat(cargo, { rough: 1 }), 0.025, 0.028));
  g.add(B.box(0.055, 0.032, 0.055, B.mat("#f3efe5"), -0.1, 0.028));
  g.add(B.box(0.057, 0.01, 0.057, B.mat("#3d5566", { rough: 0.2, metal: 0.3 }), -0.1, 0.044));
  g.add(B.box(0.062, 0.006, 0.062, hullMat, -0.1, 0.06));
  return B.bake(B.shadowed(g));
}

/** Un bateau de promenade : une coque blanche, une cabine vitrée, un toit plat */
function tourBoat(): THREE.Group {
  const g = new THREE.Group();
  const white = B.mat("#f6f3ec", { rough: 0.5 });
  g.add(B.box(0.26, 0.022, 0.07, white));
  g.add(B.box(0.262, 0.006, 0.072, B.mat("#c0392b"), 0, 0.012));
  g.add(B.box(0.19, 0.026, 0.058, B.mat("#9fc4d6", { rough: 0.15, metal: 0.3 }), -0.01, 0.022));
  g.add(B.box(0.2, 0.005, 0.062, white, -0.01, 0.048));
  return B.bake(B.shadowed(g));
}

/** Un petit bateau à moteur, son pare-brise */
function motorBoat(): THREE.Group {
  const g = new THREE.Group();
  g.add(B.box(0.12, 0.018, 0.048, B.mat("#f6f3ec", { rough: 0.5 })));
  g.add(B.box(0.122, 0.005, 0.05, B.mat("#2f6fb8"), 0, 0.01));
  g.add(B.box(0.04, 0.012, 0.036, B.mat("#8a6236"), -0.03, 0.018));
  const shield = B.box(0.006, 0.018, 0.04, B.mat("#9fc4d6", { rough: 0.15, metal: 0.3 }), 0.012, 0.018);
  g.add(shield);
  return B.bake(B.shadowed(g));
}

/** Une boucle de circulation : deux voies droites (de a0 à a1, de part et d'autre de c) et deux demi-tours de rayon r */
interface Loop {
  a0: number;
  a1: number;
  c: number;
  r: number;
  /** Le long de z (l'avenue) plutôt que de x (le fleuve) */
  vertical: boolean;
}

/** Un point d'une boucle, à une distance s du départ, et sa direction */
function loopPoint(l: Loop, s: number): { x: number; z: number; dx: number; dz: number } {
  const straight = l.a1 - l.a0;
  const turn = Math.PI * l.r;
  let u = ((s % (2 * straight + 2 * turn)) + 2 * straight + 2 * turn) % (2 * straight + 2 * turn);
  let a: number, b: number, da: number, db: number;
  if (u < straight) [a, b, da, db] = [l.a0 + u, l.c - l.r, 1, 0];
  else if ((u -= straight) < turn) {
    const t = u / l.r;
    [a, b, da, db] = [l.a1 + l.r * Math.sin(t), l.c - l.r * Math.cos(t), Math.cos(t), Math.sin(t)];
  } else if ((u -= turn) < straight) [a, b, da, db] = [l.a1 - u, l.c + l.r, -1, 0];
  else {
    const t = (u - straight) / l.r;
    [a, b, da, db] = [l.a0 - l.r * Math.sin(t), l.c + l.r * Math.cos(t), -Math.cos(t), -Math.sin(t)];
  }
  return l.vertical ? { x: b, z: a, dx: db, dz: da } : { x: a, z: b, dx: da, dz: db };
}

/** Une coordonnée en cases, dans le monde */
const world = (v: number) => -CITY_HALF + v * CELL;

// ---------------------------------------------------------------------------
// Le sol
// ---------------------------------------------------------------------------

const GRASS = "#88ad5e";
const ASPHALT = "#6e7277";
const SIDEWALK = "#d4ccbb";
const PAVING = "#e7decb";
const WATER = "#3d84b6";
const QUAY = "#c3baa8";
const FLOWERS = ["#f2c94c", "#e2453c", "#f6f2e8", "#d36fa8"];

/** Un nombre entre 0 et 1, toujours le même pour une case et un sel */
const noise = (cell: number, salt: number) => {
  const v = Math.sin(cell * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** De l'eau : le fleuve, sous ses ponts, et le lac du barrage */
const isWater = (cell: number) => {
  const c = CELLS[cell];
  return c !== undefined && (c.kind === "river" || c.kind === "bridge" || (c.kind === "lot" && c.square === 12));
};

/** Les quatre côtés d'une case : la voisine, et le bord à tracer (en cases) */
const SIDES = [
  { dx: 0, dz: -1, edge: (x: number, z: number) => [x, z, x + 1, z] as const },
  { dx: 0, dz: 1, edge: (x: number, z: number) => [x, z + 1, x + 1, z + 1] as const },
  { dx: -1, dz: 0, edge: (x: number, z: number) => [x, z, x, z + 1] as const },
  { dx: 1, dz: 0, edge: (x: number, z: number) => [x + 1, z, x + 1, z + 1] as const },
];

/** Le chemin d'un ensemble de cases, pour y découper le dessin (clip) */
function cellsPath(ctx: CanvasRenderingContext2D, cells: Iterable<number>, k: number) {
  ctx.beginPath();
  for (const c of cells) ctx.rect(cellX(c) * k, cellZ(c) * k, k, k);
}

function drawGround(): HTMLCanvasElement {
  const size = 2048;
  const [canvas, ctx] = makeCanvas(size, size);
  const k = size / MAP;
  const cellOf = (x: number, z: number) => (onMap(x, z) ? cellIndex(x, z) : -1);
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, size, size);
  // Le fond de chaque case
  CELLS.forEach((cell, c) => {
    const x = cellX(c) * k;
    const y = cellZ(c) * k;
    if (isWater(c)) ctx.fillStyle = WATER;
    else if (cell.kind === "avenue") ctx.fillStyle = ASPHALT;
    else if (cell.kind === "city") ctx.fillStyle = mix(GROUPS[cell.group!].color, PAVING, 0.7);
    else if (cell.kind === "reserve") ctx.fillStyle = mix(GROUPS[cell.group!].color, PAVING, 0.86);
    else if (cell.kind === "lot") ctx.fillStyle = cell.square < 0 ? PAVING : "#d9d0bc";
    else ctx.fillStyle = GRASS;
    // Sur des pixels entiers, bord à bord : pas de couture claire entre deux cases de même couleur
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    ctx.fillRect(x0, y0, Math.round(x + k) - x0, Math.round(y + k) - y0);
    if (cell.kind === "park") {
      // Les squares : de l'herbe plus ou moins drue, et des fleurs çà et là
      for (let n = 0; n < 3; n++) {
        const flower = n === 0 && noise(c, 40) > 0.75;
        ctx.fillStyle = flower ? FLOWERS[Math.floor(noise(c, 41) * FLOWERS.length)]! : "rgba(70, 110, 45, 0.28)";
        ctx.beginPath();
        ctx.arc(
          x + (0.15 + noise(c, 10 + n) * 0.7) * k,
          y + (0.15 + noise(c, 20 + n) * 0.7) * k,
          k * (0.04 + noise(c, 30 + n) * 0.06),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  });
  // L'herbe (les squares et les bords) et l'eau : des taches douces posées n'importe où, pas case par case, pour que la
  // carte se lise comme un plan et non comme un damier
  const green = CELLS.flatMap((cell, c) => (cell.kind === "park" ? [c] : []));
  const water = CELLS.flatMap((_, c) => (isWater(c) ? [c] : []));
  /** Des taches rondes et floues, d'une teinte (« r, g, b ») et d'une opacité au centre, transparentes au bord */
  const blobs = (cells: number[], salt: number, count: number, colors: [string, number][], size: [number, number]) => {
    ctx.save();
    cellsPath(ctx, cells, k);
    ctx.clip();
    for (let n = 0; n < count; n++) {
      const home = cells[Math.floor(noise(n, salt) * cells.length)]!;
      const x = (cellX(home) + noise(n, salt + 1) * 1.6 - 0.3) * k;
      const y = (cellZ(home) + noise(n, salt + 2) * 1.6 - 0.3) * k;
      const r = (size[0] + noise(n, salt + 3) * (size[1] - size[0])) * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const [rgb, alpha] = colors[n % colors.length]!;
      g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  };
  blobs(
    green,
    7,
    green.length * 2,
    [
      ["96, 140, 62", 0.35],
      ["170, 200, 112", 0.3],
      ["110, 150, 70", 0.25],
    ],
    [0.7, 1.8],
  );
  blobs(
    water,
    13,
    water.length,
    [
      ["95, 160, 205", 0.35],
      ["40, 105, 160", 0.3],
    ],
    [0.8, 2.2],
  );
  // Le fleuve : des reflets épars, et les quais de pierre là où il touche la terre
  ctx.save();
  cellsPath(ctx, water, k);
  ctx.clip();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = k * 0.035;
  for (let n = 0; n < water.length * 1.4; n++) {
    const home = water[Math.floor(noise(n, 50) * water.length)]!;
    const px = (cellX(home) + noise(n, 51)) * k;
    const py = (cellZ(home) + noise(n, 52)) * k;
    const len = k * (0.2 + noise(n, 53) * 0.3);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + len / 2, py - k * 0.05, px + len, py);
    ctx.stroke();
  }
  ctx.restore();
  CELLS.forEach((_, c) => {
    if (!isWater(c)) return;
    const cx = cellX(c);
    const cz = cellZ(c);
    for (const s of SIDES) {
      const n = cellOf(cx + s.dx, cz + s.dz);
      if (n < 0 || isWater(n)) continue;
      const t = k * 0.16;
      ctx.fillStyle = QUAY;
      const x = cx * k + (s.dx === 1 ? k - t : 0);
      const y = cz * k + (s.dz === 1 ? k - t : 0);
      ctx.fillRect(x, y, s.dx === 0 ? k : t, s.dz === 0 ? k : t);
      ctx.fillStyle = "rgba(60, 55, 45, 0.35)";
      const lx = cx * k + (s.dx === 1 ? k - t : s.dx === -1 ? t - k * 0.03 : 0);
      const ly = cz * k + (s.dz === 1 ? k - t : s.dz === -1 ? t - k * 0.03 : 0);
      ctx.fillRect(lx, ly, s.dx === 0 ? k : k * 0.03, s.dz === 0 ? k : k * 0.03);
    }
  });
  // L'avenue : ses trottoirs, sa ligne blanche au milieu, ses passages piétons au bord de la place
  CELLS.forEach((cell, c) => {
    if (cell.kind !== "avenue") return;
    const cx = cellX(c);
    const cz = cellZ(c);
    for (const s of SIDES) {
      const n = cellOf(cx + s.dx, cz + s.dz);
      if (s.dz !== 0 || (n >= 0 && CELLS[n]!.kind === "avenue")) continue;
      const t = k * 0.2;
      ctx.fillStyle = SIDEWALK;
      ctx.fillRect(cx * k + (s.dx === 1 ? k - t : 0), cz * k, t, k);
    }
    const n = cellOf(cx, cz + 1);
    const p = cellOf(cx, cz - 1);
    for (const end of [n, p]) {
      if (end < 0 || CELLS[end]!.kind !== "lot") continue;
      // Les bandes blanches du passage piéton, sur la dernière case avant la place
      ctx.fillStyle = "rgba(250, 250, 245, 0.85)";
      const y = cz * k + (end === n ? k * 0.55 : k * 0.15);
      for (let b = 0; b < 4; b++) ctx.fillRect(cx * k + k * 0.08 + b * k * 0.24, y, k * 0.13, k * 0.3);
    }
  });
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = k * 0.06;
  ctx.setLineDash([k * 0.35, k * 0.3]);
  for (let x = 0; x + 1 < MAP; x++) {
    let start = -1;
    for (let z = 0; z <= MAP; z++) {
      const both = z < MAP && CELLS[cellIndex(x, z)]!.kind === "avenue" && CELLS[cellIndex(x + 1, z)]!.kind === "avenue";
      if (both && start < 0) start = z;
      if (both || start < 0) continue;
      ctx.beginPath();
      ctx.moveTo((x + 1) * k, (start + 0.5) * k);
      ctx.lineTo((x + 1) * k, (z - 0.5) * k);
      ctx.stroke();
      start = -1;
    }
  }
  ctx.setLineDash([]);
  // La réserve de chaque quartier, hachurée à sa couleur
  for (const g of GROUP_ORDER) {
    const reserve = DISTRICT_CELLS[g].filter((c) => CELLS[c]!.kind === "reserve");
    ctx.save();
    cellsPath(ctx, reserve, k);
    ctx.clip();
    ctx.strokeStyle = mix(GROUPS[g].color, "#ffffff", 0.15);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = k * 0.06;
    ctx.beginPath();
    for (let d = -size; d < size; d += k * 0.3) {
      ctx.moveTo(d, 0);
      ctx.lineTo(d + size, size);
    }
    ctx.stroke();
    ctx.restore();
  }
  // Pas de quadrillage sur la carte au repos : il apparaît sur sa ville quand on y bâtit (l'aperçu, plus bas)
  // Les limites des parcelles : un trait blanc entre deux villes, un trait fin de couleur au bord de la réserve
  CELLS.forEach((cell, c) => {
    if (cell.kind !== "city") return;
    const cx = cellX(c);
    const cz = cellZ(c);
    for (const s of SIDES) {
      const n = cellOf(cx + s.dx, cz + s.dz);
      if (n < 0) continue;
      const other = CELLS[n]!;
      if (other.group !== cell.group || (other.kind === "city" && other.square === cell.square)) continue;
      const [x0, z0, x1, z1] = s.edge(cx, cz);
      ctx.strokeStyle = other.kind === "city" ? "rgba(255, 255, 255, 0.95)" : mix(GROUPS[cell.group!].color, "#000000", 0.2);
      ctx.lineWidth = other.kind === "city" ? k * 0.09 : k * 0.045;
      ctx.beginPath();
      ctx.moveTo(x0 * k, z0 * k);
      ctx.lineTo(x1 * k, z1 * k);
      ctx.stroke();
    }
  });
  // Le liseré de chaque quartier, à sa couleur, avec un halo vers l'intérieur
  for (const g of GROUP_ORDER) {
    const cells = new Set(DISTRICT_CELLS[g]);
    const color = GROUPS[g].color;
    ctx.save();
    cellsPath(ctx, cells, k);
    ctx.clip();
    ctx.beginPath();
    for (const c of cells) {
      const cx = cellX(c);
      const cz = cellZ(c);
      for (const s of SIDES) {
        const n = cellOf(cx + s.dx, cz + s.dz);
        if (n >= 0 && cells.has(n)) continue;
        const [x0, z0, x1, z1] = s.edge(cx, cz);
        ctx.moveTo(x0 * k, z0 * k);
        ctx.lineTo(x1 * k, z1 * k);
      }
    }
    ctx.lineCap = "square";
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = k * 1.1;
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = k * 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = k * 0.26;
    ctx.stroke();
    ctx.restore();
  }
  // Le numéro de chaque parcelle (1, 2, 3), comme sur sa case du plateau
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const sq of MAP_CITIES) {
    const p = parcelSpots(sq).number;
    const x = ((p.x + CITY_HALF) / CELL) * k;
    const y = ((p.z + CITY_HALF) / CELL) * k;
    const color = GROUPS[SQUARES[sq]!.group!].color;
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.beginPath();
    ctx.arc(x + k * 0.05, y + k * 0.07, k * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mix(color, "#000000", 0.12);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = k * 0.12;
    ctx.beginPath();
    ctx.arc(x, y, k * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.round(k * 0.78)}px "Big Shoulders Display Variable", Impact, sans-serif`;
    ctx.fillText(String(parcelNumber(sq)), x, y + k * 0.04);
  }
  // Les lots (gares, réseaux, impôts, péage, banque) : un dallage bordé
  ctx.strokeStyle = "rgba(120, 105, 80, 0.45)";
  ctx.lineWidth = k * 0.06;
  for (const l of LOTS) {
    if (l.kind === "plaza" || l.square === 12) continue;
    ctx.strokeRect(l.x * k + k * 0.08, l.z * k + k * 0.08, l.w * k - k * 0.16, l.d * k - k * 0.16);
  }
  // La place : un dallage en couronne autour du milieu, posée sur le fleuve
  const plaza = LOTS.find((l) => l.kind === "plaza")!;
  const pc = { x: (plaza.x + plaza.w / 2) * k, y: (plaza.z + plaza.d / 2) * k };
  ctx.strokeStyle = "rgba(150, 120, 80, 0.35)";
  ctx.lineWidth = k * 0.08;
  for (const r of [0.42, 0.3]) {
    ctx.beginPath();
    ctx.arc(pc.x, pc.y, plaza.w * k * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(120, 100, 70, 0.5)";
  ctx.lineWidth = k * 0.1;
  ctx.strokeRect(plaza.x * k + k * 0.05, plaza.z * k + k * 0.05, plaza.w * k - k * 0.1, plaza.d * k - k * 0.1);
  return canvas;
}

// ---------------------------------------------------------------------------
// La ville
// ---------------------------------------------------------------------------

/** Ce que la scène prête à la carte : ses animations et ses sons */
export interface BuilderHooks {
  rise: (o: THREE.Object3D, dur: number, delay?: number, sound?: boolean) => void;
  popIn: (o: THREE.Object3D) => void;
  remove: (o: THREE.Object3D, animate: boolean) => void;
  dust: (parent: THREE.Object3D, x: number, z: number, size: number) => void;
  lookAt: (p: THREE.Vector3) => void;
  flag: (cloth: THREE.Object3D) => void;
  dirty: () => void;
  /** L'heure de la scène, en secondes */
  now: () => number;
}

/** L'aperçu de ce qu'on fait sur la carte : un bâtiment à poser, des cases à colorer, un bâtiment choisi */
export interface BuilderPreview {
  /** Les cases à colorer : où le bâtiment tiendrait (ok), où il déborde (bad), ce qu'on peut annexer, la zone d'une nuisance */
  cells: { cell: number; tone: "ok" | "bad" | "annex" | "reach" | "area" }[];
  /** Le bâtiment fantôme, à sa place */
  ghost: (Placed & { square: number; ok: boolean; color: string }) | null;
  /** Le bâtiment choisi (pour le déplacer, le tourner, le démolir) : un cadre autour */
  selected: Rect | null;
  /** Les cases où l'on bâtit (la ville, et ce qu'on peut annexer) : leur quadrillage, absent de la carte au repos */
  grid?: number[];
}

interface CityObj {
  square: number;
  /** Les bâtiments fondus ensemble, et ce qu'ils représentent */
  baked: THREE.Group | null;
  bakedKey: string;
  /** Les bâtiments posés à part : ceux qui vivent (parc, nuisances), ceux qui sortent de terre */
  loose: Map<number, { obj: THREE.Group; key: string; living: Living | null; until: number }>;
  /** Ce que la ville montre de son propriétaire : le voile de ses cases, sa frontière, son drapeau */
  owned: THREE.Group | null;
  ownedKey: string;
  sale: THREE.Object3D | null;
  fence: THREE.Object3D | null;
  shown: Placed[];
}

let mortgageTex: THREE.CanvasTexture | null = null;

const TONES: Record<BuilderPreview["cells"][number]["tone"], [string, number]> = {
  ok: ["#43c463", 0.55],
  bad: ["#e5483d", 0.6],
  annex: ["#ffc23a", 0.5],
  reach: ["#ff7a1a", 0.42],
  area: ["#ffffff", 0.22],
};

/** Le dessin de la carte de Builder, et ce qui y est bâti */
export class BuilderCity {
  readonly root = new THREE.Group();
  /** Les objets qu'on peut viser (le sol de la carte) */
  readonly pickable: THREE.Mesh;
  /** Le décor qui ne bouge pas : la scène le fond avec le sien */
  readonly decor = new THREE.Group();
  readonly living: Living[] = [];
  /** Ce qui tourne (les éoliennes) et l'eau du barrage */
  readonly rotors: { obj: THREE.Object3D; speed: number }[] = [];
  water: THREE.Mesh | null = null;
  /** Les bateaux sur le fleuve, les voitures sur l'avenue : chacun sur sa boucle */
  private boats: { obj: THREE.Object3D; loop: Loop; s0: number; speed: number }[] = [];
  private cars: { loop: Loop; s0: number; speed: number }[] = [];
  private fleet: B.CarFleet | null = null;
  /** Les gares et les réseaux : un repère à leur place, pour le drapeau et la palissade de leur propriétaire */
  readonly lotRoots = new Map<number, THREE.Group>();
  private hooks: BuilderHooks;
  private cities = new Map<number, CityObj>();
  private overlay: THREE.Mesh | null = null;
  private ghost: { key: string; obj: THREE.Group } | null = null;
  private selectFrame: THREE.Mesh | null = null;
  /** Le quadrillage de la ville où l'on bâtit (la carte au repos n'en a pas) */
  private gridLines: THREE.LineSegments | null = null;
  private ghostMats = new Map<string, THREE.Material>();
  private stationFlags = new Map<number, { key: string; obj: THREE.Object3D | null; fence: THREE.Object3D | null }>();

  constructor(hooks: BuilderHooks) {
    this.hooks = hooks;
    const tex = new THREE.CanvasTexture(drawGround());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * CITY_HALF, 2 * CITY_HALF),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.004;
    ground.receiveShadow = true;
    ground.name = "builder-ground";
    this.pickable = ground;
    this.root.add(ground);
    this.addRiver();
    this.addLots();
    this.addParks();
    this.addDistricts();
    this.addTraffic();
    for (const sq of MAP_CITIES) {
      const obj: CityObj = {
        square: sq,
        baked: null,
        bakedKey: "",
        loose: new Map(),
        owned: null,
        ownedKey: "",
        sale: null,
        fence: null,
        shown: [],
      };
      // Le panneau « à vendre », sur sa parcelle, à côté de son numéro
      const spot = parcelSpots(sq).sign;
      const sale = B.forSale();
      sale.scale.setScalar(0.62);
      sale.position.set(spot.x, 0, spot.z);
      this.root.add(sale);
      obj.sale = sale;
      this.cities.set(sq, obj);
    }
  }

  /** Les gares, les réseaux, les impôts, le péage, la banque et le kiosque, chacun sur son lot */
  private addLots() {
    for (const l of LOTS) {
      const r = rectWorld(l);
      const g = new THREE.Group();
      g.position.set(r.x + r.w / 2, 0, r.z + r.d / 2);
      const fit = (o: THREE.Object3D, margin = 0.9) => {
        const holder = new THREE.Group();
        holder.add(o);
        fitInto(o, r.w, r.d, margin);
        g.add(holder);
        return holder;
      };
      // Les gares et le péage regardent la rue la plus proche ; les autres, la place
      switch (l.kind) {
        case "station": {
          const s = B.station(LIVERIES[l.square] ?? "#2f5bb8");
          if (r.d > r.w) s.rotation.y = Math.PI / 2;
          fit(s);
          break;
        }
        case "utility":
          if (l.square === 12) {
            // Le barrage tient la tête du fleuve : son lac, c'est le fleuve lui-même
            const dam = B.dam();
            dam.water.visible = false;
            dam.group.rotation.y = Math.PI / 2;
            fit(dam.group);
          } else {
            for (const [x, z, h] of [
              [-0.3, 0.25, 0.85],
              [0.28, -0.1, 1],
              [-0.05, -0.32, 0.75],
            ] as const) {
              const t = B.turbine(h);
              t.group.scale.setScalar(0.62);
              t.group.position.set(x * r.w, 0, z * r.d);
              g.add(t.group);
              this.rotors.push({ obj: t.rotor, speed: 1.4 + h * 0.6 });
            }
          }
          break;
        case "tax":
          fit(B.taxOffice());
          break;
        case "toll":
          fit(B.tollBooth(), 0.8);
          break;
        case "bank":
          fit(B.bank(), 0.95);
          break;
        case "kiosk": {
          const k = fit(B.kiosk(), 0.7);
          k.position.z = -r.d * 0.18;
          break;
        }
        case "plaza": {
          // Des réverbères et des arbres au bord de la place : le milieu reste aux dés
          const spots: { x: number; z: number; s: number; kind: number }[] = [];
          for (let n = 0; n < 8; n++) {
            const a = (n / 8) * Math.PI * 2 + Math.PI / 8;
            const x = Math.cos(a) * r.w * 0.44;
            const z = Math.sin(a) * r.d * 0.44;
            if (n % 2) spots.push({ x, z, s: 0.75, kind: 0 });
            else {
              const lamp = B.lamp();
              lamp.position.set(x, 0, z);
              g.add(lamp);
            }
          }
          g.add(B.trees(spots));
          break;
        }
      }
      if (l.kind === "station" || l.kind === "utility") {
        // Le drapeau et la palissade du propriétaire vont sur un repère à part : le décor, lui, est fondu
        const mark = new THREE.Group();
        mark.position.copy(g.position);
        mark.userData.square = l.square;
        this.root.add(mark);
        this.lotRoots.set(l.square, mark);
        g.userData.square = l.square;
      }
      // Le décor qui ne bouge pas est fondu ; ce qui tourne (les éoliennes) reste à part
      if (l.square === 28) this.root.add(g);
      else this.decor.add(g);
    }
  }

  /** Le fleuve : une eau qui brille sur ses cases (le lac du barrage compris), et ses ponts */
  private addRiver() {
    const cells = CELLS.flatMap((_, c) => (isWater(c) ? [c] : []));
    const geo = BuilderCity.veil(cells, 0.008);
    if (geo) {
      const water = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: "#3f8fc4",
          roughness: 0.08,
          metalness: 0.35,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        }),
      );
      water.receiveShadow = true;
      water.renderOrder = 1;
      this.root.add(water);
      this.water = water;
    }
    for (const r of bridgeRects()) this.decor.add(bridgeModel(rectWorld(r)));
  }

  /** Les squares : des arbres, plus ou moins serrés ; l'avenue bordée d'arbres d'alignement */
  private addParks() {
    const spots: { x: number; z: number; s: number; kind: number }[] = [];
    CELLS.forEach((cell, c) => {
      if (cell.kind !== "park" || noise(c, 5) > 0.55) return;
      const p = cellCenter(c);
      spots.push({
        x: p.x + (noise(c, 6) - 0.5) * CELL * 0.45,
        z: p.z + (noise(c, 7) - 0.5) * CELL * 0.45,
        s: 0.5 + noise(c, 8) * 0.35,
        kind: noise(c, 9) > 0.72 ? 1 : 0,
      });
    });
    CELLS.forEach((cell, c) => {
      if (cell.kind !== "avenue" || cellZ(c) % 2 !== 0) return;
      const x = cellX(c);
      const outer = onMap(x - 1, cellZ(c)) && CELLS[cellIndex(x - 1, cellZ(c))]!.kind === "avenue" ? 1 : -1;
      const p = cellCenter(c);
      spots.push({ x: p.x + outer * CELL * 0.4, z: p.z + CELL * 0.5, s: 0.34, kind: 0 });
    });
    this.decor.add(B.trees(spots));
  }

  /** Le liseré lumineux de chaque quartier, à sa couleur, tout autour de ses parcelles et de sa réserve */
  private addDistricts() {
    for (const g of GROUP_ORDER) {
      const geo = BuilderCity.border(new Set(DISTRICT_CELLS[g]), 0.026, 0.006);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: mix(GROUPS[g].color, "#ffffff", 0.2) }));
      m.position.y = 0.004;
      this.decor.add(m);
    }
  }

  /** Les bateaux qui font des ronds sur le fleuve (de part et d'autre de la place), les voitures sur l'avenue */
  private addTraffic() {
    const river = (a0: number, a1: number): Loop => ({ a0: world(a0), a1: world(a1), c: world(20), r: 0.75 * CELL, vertical: false });
    const west = river(3.1, 12.9);
    const east = river(25.1, 36.9);
    const fleet: [THREE.Group, Loop, number, number][] = [
      [barge("#3b3a3f", "#d8b872"), west, 0, 0.11],
      [motorBoat(), west, 2.6, 0.16],
      [tourBoat(), east, 0, 0.12],
      [barge("#7a2f2a", "#8d8a84"), east, 3.1, 0.1],
    ];
    for (const [obj, loop, s0, speed] of fleet) {
      this.root.add(obj);
      this.boats.push({ obj, loop, s0, speed });
    }
    // L'avenue : deux tronçons, de la place au bord de la carte, quatre voitures chacun (on roule à droite)
    const avenue = (a0: number, a1: number): Loop => ({ a0: world(a0), a1: world(a1), c: world(19), r: 0.4 * CELL, vertical: true });
    const colors = ["#d6433a", "#f2f2ee", "#2f5bb8", "#e8b12f", "#3c3f44", "#2fa864", "#e07a3a", "#9fb4c4"];
    [avenue(0.8, 13.2), avenue(24.8, 37.2)].forEach((loop, n) => {
      const length = 2 * (loop.a1 - loop.a0) + 2 * Math.PI * loop.r;
      for (let k = 0; k < 4; k++) this.cars.push({ loop, s0: (k / 4) * length + n * 0.3, speed: 0.3 + ((k * 7 + n * 3) % 5) * 0.02 });
    });
    this.fleet = new B.CarFleet(colors);
    this.root.add(...this.fleet.meshes);
    this.animate(0);
  }

  /** À chaque image (sauf mouvements réduits) : les bateaux sur le fleuve, les voitures sur l'avenue */
  animate(time: number) {
    for (const b of this.boats) {
      const p = loopPoint(b.loop, b.s0 + time * b.speed);
      b.obj.position.set(p.x, 0.007 + Math.sin(time * 1.8 + b.s0) * 0.0015, p.z);
      b.obj.rotation.y = Math.atan2(-p.dz, p.dx);
    }
    if (!this.fleet) return;
    this.cars.forEach((c, k) => {
      const p = loopPoint(c.loop, c.s0 + time * c.speed);
      this.fleet!.place(k, p.x, p.z, Math.atan2(p.dx, p.dz));
    });
    this.fleet.commit();
  }

  /** Où sont les cartes, la banque : pour la scène */
  lotCenter(kind: Lot["kind"]): THREE.Vector3 {
    const l = LOTS.find((x) => x.kind === kind)!;
    const r = rectWorld(l);
    return new THREE.Vector3(r.x + r.w / 2, 0, r.z + r.d / 2);
  }

  /** Le rectangle qui englobe le territoire d'une ville (avec ce qu'elle a annexé) */
  areaBox(square: number, deed: Deed | null | undefined): WRect {
    const cells = [...baseCells(square), ...(deed?.annexed ?? [])];
    const xs = cells.map(cellX);
    const zs = cells.map(cellZ);
    const x0 = Math.min(...xs);
    const z0 = Math.min(...zs);
    return rectWorld({ x: x0, z: z0, w: Math.max(...xs) - x0 + 1, d: Math.max(...zs) - z0 + 1 });
  }

  /** Le milieu d'une ville (avec ce qu'elle a annexé) : la case la plus centrale, dans le monde */
  areaCenter(square: number, deed: Deed | null | undefined): THREE.Vector3 {
    const p = cellCenter(middleCell([...baseCells(square), ...(deed?.annexed ?? [])]));
    return new THREE.Vector3(p.x, 0, p.z);
  }

  /**
   * La frontière d'un ensemble de cases : des baguettes de largeur t le long des bords qui ne touchent pas une autre case
   * de l'ensemble, à « inset » du bord, qui se rejoignent dans les coins, saillants comme rentrants
   */
  static border(cells: Set<number>, t: number, h: number, inset = 0): THREE.BufferGeometry | null {
    const geos: THREE.BufferGeometry[] = [];
    const inside = (x: number, z: number) => onMap(x, z) && cells.has(cellIndex(x, z));
    for (const c of cells) {
      const p = cellCenter(c);
      const x = cellX(c);
      const z = cellZ(c);
      for (const [dx, dz] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ] as const) {
        if (inside(x + dx, z + dz)) continue;
        // Le bord court le long de (ex, ez) ; à chaque bout, il continue tout droit, tourne (coin saillant) ou rentre
        const ex = dz !== 0 ? 1 : 0;
        const ez = dx !== 0 ? 1 : 0;
        const reach = (sign: number) => {
          const nx = x + ex * sign;
          const nz = z + ez * sign;
          if (!inside(nx, nz)) return -inset;
          return inside(nx + dx, nz + dz) ? inset + t : 0;
        };
        const lo = -CELL / 2 - reach(-1);
        const hi = CELL / 2 + reach(1);
        const off = CELL / 2 - inset - t / 2;
        const geo = new THREE.BoxGeometry(ex ? hi - lo : t, h, ez ? hi - lo : t);
        geo.translate(p.x + dx * off + (ex * (lo + hi)) / 2, h / 2, p.z + dz * off + (ez * (lo + hi)) / 2);
        geos.push(geo);
      }
    }
    if (geos.length === 0) return null;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }

  /** Une palissade de chantier qui suit la frontière d'une ville (elle est hypothéquée), et son panneau */
  static fenceAlong(cells: Set<number>, spot: { x: number; z: number }): THREE.Group {
    const g = new THREE.Group();
    const panels = BuilderCity.border(cells, 0.01, 0.08, 0.012);
    const stripe = BuilderCity.border(cells, 0.013, 0.014, 0.0105);
    if (panels) g.add(new THREE.Mesh(panels, B.mat("#f1eee6", { rough: 0.7 })));
    if (stripe) {
      const m = new THREE.Mesh(stripe, B.mat("#e07b2c"));
      m.position.y = 0.045;
      g.add(m);
    }
    mortgageTex ??= signTexture("HYPOTHÉQUÉ", "#f2c230", "#2b2418", 320, 80);
    const post = B.mat("#8a6a48");
    const face = new THREE.MeshStandardMaterial({ map: mortgageTex, roughness: 0.6 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.075, 0.01), [post, post, post, post, face, face]);
    board.position.set(spot.x, 0.07, spot.z + 0.07);
    g.add(
      board,
      B.box(0.012, 0.07, 0.012, post, spot.x - 0.12, 0, spot.z + 0.07),
      B.box(0.012, 0.07, 0.012, post, spot.x + 0.12, 0, spot.z + 0.07),
    );
    return B.shadowed(g, false, false);
  }

  /** Un voile à plat sur des cases */
  static veil(cells: Iterable<number>, y: number): THREE.BufferGeometry | null {
    const geos: THREE.BufferGeometry[] = [];
    for (const c of cells) {
      const p = cellCenter(c);
      const geo = new THREE.PlaneGeometry(CELL, CELL);
      geo.rotateX(-Math.PI / 2);
      geo.translate(p.x, y, p.z);
      geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }

  // -------------------------------------------------------------------------
  // L'état
  // -------------------------------------------------------------------------

  sync(
    deeds: Record<number, { owner: string | null; mortgaged: boolean; lot?: Placed[]; annexed?: number[] }>,
    colorOf: (id: string | null) => string,
    animate: boolean,
  ) {
    for (const [sq, o] of this.cities) this.syncCity(o, deeds[sq] ?? null, colorOf, animate);
    for (const [sq, g] of this.lotRoots) {
      const d = deeds[sq];
      if (!d) continue;
      const key = `${d.owner}|${d.mortgaged}`;
      const prev = this.stationFlags.get(sq);
      if (prev?.key === key) continue;
      if (prev?.obj) this.hooks.remove(prev.obj, animate);
      if (prev?.fence) this.hooks.remove(prev.fence, animate);
      const entry = { key, obj: null as THREE.Object3D | null, fence: null as THREE.Object3D | null };
      const l = LOTS.find((x) => x.square === sq)!;
      const r = rectWorld(l);
      if (d.owner) {
        const flag = B.flag(colorOf(d.owner));
        flag.scale.setScalar(0.7);
        flag.position.set(r.w * 0.42, 0, -r.d * 0.42);
        g.add(flag);
        this.hooks.flag(flag.getObjectByName("cloth")!);
        if (animate) this.hooks.popIn(flag);
        entry.obj = flag;
      }
      if (d.mortgaged) {
        const fence = B.fence(r.w * 1.05, r.d * 1.05);
        g.add(fence);
        if (animate) this.hooks.popIn(fence);
        entry.fence = fence;
      }
      this.stationFlags.set(sq, entry);
    }
  }

  private syncCity(
    o: CityObj,
    d: { owner: string | null; mortgaged: boolean; lot?: Placed[]; annexed?: number[] } | null,
    colorOf: (id: string | null) => string,
    animate: boolean,
  ) {
    const owner = d?.owner ?? null;
    const color = colorOf(owner);
    const area = new Set([...baseCells(o.square), ...(d?.annexed ?? [])]);
    // Le propriétaire : ses cases voilées de sa couleur, sa frontière, son drapeau
    const ownedKey = owner ? `${owner}|${color}|${[...area].sort((a, b) => a - b).join(",")}` : "";
    if (ownedKey !== o.ownedKey) {
      const grew = owner !== null && o.ownedKey.startsWith(`${owner}|`) && area.size > o.ownedKey.split(",").length;
      o.ownedKey = ownedKey;
      if (o.owned) {
        // Par la scène : le drapeau quitte aussi la liste de ceux qu'elle anime (et les géométries sont libérées)
        const veil = o.owned.children.find((c) => c.userData.ownerVeil) as THREE.Mesh | undefined;
        (veil?.material as THREE.Material | undefined)?.dispose();
        this.hooks.remove(o.owned, false);
      }
      o.owned = null;
      if (owner) {
        const g = new THREE.Group();
        const veil = BuilderCity.veil(area, 0.006);
        if (veil) {
          const m = new THREE.Mesh(veil, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false }));
          m.renderOrder = 1;
          m.userData.ownerVeil = true;
          g.add(m);
        }
        const line = BuilderCity.border(area, 0.03, 0.018, 0.026);
        if (line) {
          const m = new THREE.Mesh(line, B.mat(color, { rough: 0.5 }));
          m.receiveShadow = true;
          g.add(m);
        }
        // Le drapeau, à la place du panneau « à vendre »
        const spot = parcelSpots(o.square).sign;
        const flag = B.flag(color);
        flag.scale.setScalar(0.62);
        flag.position.set(spot.x, 0, spot.z);
        g.add(flag);
        this.hooks.flag(flag.getObjectByName("cloth")!);
        this.root.add(g);
        o.owned = g;
        if (animate && !grew) {
          this.hooks.popIn(flag);
          this.hooks.lookAt(new THREE.Vector3(spot.x, 0, spot.z));
        }
      }
      if (o.sale) o.sale.visible = owner === null;
    }
    // Hypothèque : une palissade autour du territoire
    const mortgaged = Boolean(d?.mortgaged);
    if (mortgaged !== Boolean(o.fence)) {
      if (o.fence) this.hooks.remove(o.fence, animate);
      o.fence = null;
      if (mortgaged) {
        const fence = BuilderCity.fenceAlong(area, parcelSpots(o.square).sign);
        this.root.add(fence);
        if (animate) this.hooks.popIn(fence);
        o.fence = fence;
      }
    }
    this.syncBuildings(o, owner ? (d?.lot ?? []) : [], color, animate);
  }

  private syncBuildings(o: CityObj, lot: Placed[], color: string, animate: boolean) {
    const keyOf = (b: Placed) => `${b.id}:${b.kind}:${b.x}:${b.z}:${b.rot & 3}`;
    const before = new Map(o.shown.map((b) => [b.id, keyOf(b)]));
    const now = new Map(lot.map((b) => [b.id, keyOf(b)]));
    const t = this.hooks.now();
    // Ce qui est parti : un nuage de poussière là où il était
    for (const b of o.shown) {
      if (now.get(b.id) === keyOf(b)) continue;
      const loose = o.loose.get(b.id);
      if (loose) {
        this.dropLiving(loose.living);
        this.hooks.remove(loose.obj, animate && !now.has(b.id));
        o.loose.delete(b.id);
      }
      if (animate && !now.has(b.id)) {
        const r = rectWorld(footprint(b));
        this.hooks.dust(this.root, r.x + r.w / 2, r.z + r.d / 2, Math.max(r.w, r.d) * 0.7);
      }
    }
    // Ce qui arrive : à part, le temps de sortir de terre ; ce qui vit (parc, nuisances) reste à part
    for (const b of lot) {
      if (before.get(b.id) === keyOf(b) && (o.loose.has(b.id) || o.bakedKey.includes(`|${keyOf(b)}|`))) continue;
      const fresh = !before.has(b.id);
      if (!animate && !BUILDS[b.kind].nuisance && b.kind !== "parc") continue;
      const { obj, living } = placedModel(b, o.square, color);
      this.root.add(obj);
      if (living) this.living.push(living);
      const stays = living !== null;
      o.loose.set(b.id, { obj, key: keyOf(b), living, until: stays ? Infinity : t + (fresh && animate ? 1.2 : 0) });
      if (animate && fresh) {
        this.hooks.rise(obj, b.kind === "monument" ? 1.1 : 0.55, 0, true);
        const r = rectWorld(footprint(b));
        this.hooks.dust(this.root, r.x + r.w / 2, r.z + r.d / 2, Math.max(r.w, r.d) * 0.7);
        this.hooks.lookAt(new THREE.Vector3(r.x + r.w / 2, 0, r.z + r.d / 2));
      } else if (animate) this.hooks.popIn(obj);
    }
    o.shown = lot.map((b) => ({ ...b }));
    // Les bâtiments fondus : refaits quand la ville change (sans ceux qui sont encore à part)
    if (o.shown.length !== before.size || [...now].some(([id, k]) => before.get(id) !== k) || o.bakedKey.split("|")[0] !== color) {
      this.rebake(o, color, false);
    }
  }

  /** Refond les bâtiments d'une ville : tous, sauf ceux qui vivent et ceux qui sortent encore de terre */
  private rebake(o: CityObj, color: string, settle: boolean) {
    const t = this.hooks.now();
    if (settle) {
      for (const [id, l] of o.loose) {
        if (l.until > t) continue;
        this.root.remove(l.obj);
        l.obj.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
        o.loose.delete(id);
      }
    }
    const still = new Set(o.loose.keys());
    const keyOf = (b: Placed) => `${b.id}:${b.kind}:${b.x}:${b.z}:${b.rot & 3}`;
    const bakedList = o.shown.filter((b) => !still.has(b.id));
    const key = `${color}|${bakedList.map(keyOf).join("|")}|`;
    if (key === o.bakedKey) return;
    o.bakedKey = key;
    if (o.baked) {
      this.root.remove(o.baked);
      o.baked.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
    }
    o.baked = null;
    if (bakedList.length === 0) return;
    const group = new THREE.Group();
    for (const b of bakedList) group.add(placedModel(b, o.square, color).obj);
    o.baked = B.bake(group);
    o.baked.userData.square = o.square;
    this.root.add(o.baked);
    this.hooks.dirty();
  }

  private dropLiving(l: Living | null) {
    if (!l) return;
    const k = this.living.indexOf(l);
    if (k >= 0) this.living.splice(k, 1);
  }

  /** À chaque image : ce qui a fini de sortir de terre rejoint les bâtiments fondus de sa ville */
  update() {
    const t = this.hooks.now();
    for (const o of this.cities.values()) {
      let due = false;
      for (const l of o.loose.values()) if (l.until <= t) due = true;
      if (due) this.rebake(o, o.bakedKey.split("|")[0] || "#ffffff", true);
    }
  }

  /** Les bâtiments d'une ville tremblent (une catastrophe) */
  shake(square: number): THREE.Object3D[] {
    const o = this.cities.get(square);
    if (!o) return [];
    return [...(o.baked ? [o.baked] : []), ...[...o.loose.values()].map((l) => l.obj)];
  }

  /** Les objets d'une ville, pour le filtre des villes (les autres passent en maquette) */
  cityObjects(square: number): THREE.Object3D[] {
    const o = this.cities.get(square);
    if (!o) return [];
    return [...(o.baked ? [o.baked] : []), ...[...o.loose.values()].map((l) => l.obj), ...(o.owned ? [o.owned] : [])];
  }

  // -------------------------------------------------------------------------
  // L'aperçu
  // -------------------------------------------------------------------------

  setPreview(p: BuilderPreview | null) {
    this.hooks.dirty();
    if (this.overlay) {
      this.root.remove(this.overlay);
      this.overlay.geometry.dispose();
      (this.overlay.material as THREE.Material).dispose();
      this.overlay = null;
    }
    if (this.selectFrame) {
      this.root.remove(this.selectFrame);
      this.selectFrame.geometry.dispose();
      (this.selectFrame.material as THREE.Material).dispose();
      this.selectFrame = null;
    }
    if (this.gridLines) {
      this.root.remove(this.gridLines);
      this.gridLines.geometry.dispose();
      (this.gridLines.material as THREE.Material).dispose();
      this.gridLines = null;
    }
    if (p?.grid && p.grid.length > 0) {
      // Chaque côté de case une seule fois, juste au-dessus du sol
      const seen = new Set<string>();
      const pts: number[] = [];
      const y = 0.0105;
      const at = (x: number, z: number) => [x * CELL - CITY_HALF, y, z * CELL - CITY_HALF];
      for (const c of p.grid) {
        const x = cellX(c);
        const z = cellZ(c);
        for (const s of SIDES) {
          const [x0, z0, x1, z1] = s.edge(x, z);
          const key = `${x0},${z0},${x1},${z1}`;
          if (seen.has(key)) continue;
          seen.add(key);
          pts.push(...at(x0, z0), ...at(x1, z1));
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      this.gridLines = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color: "#46371f", transparent: true, opacity: 0.32, depthWrite: false }),
      );
      this.gridLines.renderOrder = 2;
      this.root.add(this.gridLines);
    }
    if (p && p.cells.length > 0) {
      const geos: THREE.BufferGeometry[] = [];
      for (const { cell, tone } of p.cells) {
        const [hex, alpha] = TONES[tone];
        const c = new THREE.Color(hex);
        const pt = cellCenter(cell);
        const inset = tone === "reach" || tone === "area" ? 0 : CELL * 0.06;
        const geo = new THREE.PlaneGeometry(CELL - inset * 2, CELL - inset * 2);
        geo.rotateX(-Math.PI / 2);
        geo.translate(pt.x, tone === "reach" ? 0.009 : 0.012, pt.z);
        const n = geo.attributes.position!.count;
        const colors = new Float32Array(n * 4);
        for (let k = 0; k < n; k++) colors.set([c.r, c.g, c.b, alpha], k * 4);
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 4));
        geos.push(geo);
      }
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (merged) {
        this.overlay = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
        this.overlay.renderOrder = 3;
        this.root.add(this.overlay);
      }
    }
    if (p?.selected) {
      const cells = new Set(rectCells(p.selected));
      const geo = BuilderCity.border(cells, 0.04, 0.05);
      if (geo) {
        this.selectFrame = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#ffb000" }));
        this.root.add(this.selectFrame);
      }
    }
    const g = p?.ghost ?? null;
    const key = g ? `${g.kind}|${g.square}|${g.color}|${g.ok}|${g.rot & 3}|${g.x}|${g.z}` : "";
    if (this.ghost && this.ghost.key !== key) {
      // Un modèle neuf à chaque case visée : l'ancien est libéré (ses matières, des copies gardées, restent pour le suivant)
      this.root.remove(this.ghost.obj);
      this.ghost.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.ghost = null;
    }
    if (g && !this.ghost) {
      // Quelques modèles font une matière neuve à chaque fois (fanions, jets d'eau) : leurs copies fantômes ne
      // s'entassent pas sans fin (aucune n'est montrée à cet instant : l'ancien fantôme vient de partir)
      if (this.ghostMats.size >= 400) {
        for (const m of this.ghostMats.values()) m.dispose();
        this.ghostMats.clear();
      }
      const { obj } = placedModel({ ...g, id: 1 }, g.square, g.color);
      obj.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const ghosts = mats.map((mt) => this.ghostOf(mt, g.ok));
        mesh.material = Array.isArray(mesh.material) ? ghosts : ghosts[0]!;
      });
      obj.position.y = 0.02;
      this.root.add(obj);
      this.ghost = { key, obj };
    }
  }

  /** La matière d'un bâtiment fantôme : la même, à moitié transparente, teintée de rouge s'il ne tient pas */
  private ghostOf(m: THREE.Material, ok: boolean): THREE.Material {
    const key = `${m.uuid}|${ok}`;
    let g = this.ghostMats.get(key);
    if (!g) {
      const c = m.clone() as THREE.MeshStandardMaterial;
      c.transparent = true;
      c.opacity = ok ? 0.72 : 0.55;
      c.depthWrite = false;
      if (!ok && c.color) c.color.lerp(new THREE.Color("#ff3b30"), 0.65);
      g = c;
      this.ghostMats.set(key, g);
    }
    return g;
  }

  dispose() {
    for (const m of this.ghostMats.values()) m.dispose();
    this.ghostMats.clear();
  }
}
