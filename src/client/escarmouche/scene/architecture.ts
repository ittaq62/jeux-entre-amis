// L'habillage des bâtiments et des wagons, pour l'œil seulement (rien de tout ça ne gêne le jeu) : l'encadrement de
// pierre des fenêtres et des portes, leurs appuis, les volets ouverts contre la façade, les portes ouvertes contre le
// mur, les grandes portes de grange rabattues dehors ; les pierres d'angle, le soubassement, la corniche ; sur les
// bâtiments où l'on n'entre pas, des fenêtres aux volets clos. Les wagons ont leur châssis, leurs roues, leurs portes
// coulissantes, leurs tampons, leur échelle et leur toit bombé.

import * as THREE from "three";
import type { Decor } from "../../../shared/games/escarmouche/maps.ts";
import type { Mat } from "../../../shared/games/escarmouche/world.ts";
import { addBox, type Bucket } from "./geom.ts";

/** Ce qu'on peint : une matière de la carte, ou une pièce d'habillage */
export type Paint = Mat | "taille" | "fer" | `volet:${string}`;

export interface Ctx {
  bucket(k: Paint): Bucket;
  /** Des pièces répétées (roues, tampons), dessinées d'un coup à la fin */
  instance(kind: "wheel" | "buffer", m: THREE.Matrix4): void;
  group: THREE.Group;
  low: boolean;
}

type HouseDecor = Extract<Decor, { k: "house" }>;
type WagonDecor = Extract<Decor, { k: "wagon" }>;

const SHUTTERS = ["#4f6b4a", "#5d7789", "#7b3d2f", "#8a8b82", "#3f5a6b", "#6f7a3c"];
const DOORS = ["#5b3b25", "#3f5a6b", "#6b2f27", "#4f6b4a"];

function hash(a: number, b: number) {
  const h = Math.sin(a * 91.17 + b * 37.31) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Une boîte posée sur une façade : le long du mur de p à q, de y0 à y1, et en profondeur de d0 à d1 depuis le
 * parement (positif : vers l'extérieur)
 */
function fbox(
  b: Bucket,
  axis: "x" | "z",
  face: number,
  out: 1 | -1,
  p: number,
  q: number,
  y0: number,
  y1: number,
  d0: number,
  d1: number,
  tint = 1,
  tile = 1,
) {
  const w0 = face + out * d0;
  const w1 = face + out * d1;
  const lo = Math.min(w0, w1);
  const hi = Math.max(w0, w1);
  if (axis === "x") addBox(b, Math.min(p, q), y0, lo, Math.max(p, q), y1, hi, tile, tint, y0 <= 0.001);
  else addBox(b, lo, y0, Math.min(p, q), hi, y1, Math.max(p, q), tile, tint, y0 <= 0.001);
}

const stoneLike = (m: Mat) => m === "pierre" || m === "crepi" || m === "crepi2";
const woodLike = (m: Mat) => m === "bois" || m === "planche";

export function addHouse(d: HouseDecor, ctx: Ctx) {
  const stone = stoneLike(d.wall);
  const wood = woodLike(d.wall);
  const frame: Paint = stone ? "taille" : wood ? "bois" : "fer";
  const shutter: Paint = `volet:${SHUTTERS[Math.floor(hash(d.x0, d.z0) * SHUTTERS.length)]!}`;
  const doorPaint: Paint = `volet:${DOORS[Math.floor(hash(d.z1, d.x1) * DOORS.length)]!}`;
  const wallTop = d.blind ? d.top : d.top - 0.25;
  const sides: { axis: "x" | "z"; face: number; out: 1 | -1; lo: number; hi: number; c: number }[] = [
    { axis: "x", face: d.z0, out: -1, lo: d.x0, hi: d.x1, c: d.z0 + 0.15 },
    { axis: "x", face: d.z1, out: 1, lo: d.x0, hi: d.x1, c: d.z1 - 0.15 },
    { axis: "z", face: d.x0, out: -1, lo: d.z0, hi: d.z1, c: d.x0 + 0.15 },
    { axis: "z", face: d.x1, out: 1, lo: d.z0, hi: d.z1, c: d.x1 - 0.15 },
  ];
  const sideOf = (axis: "x" | "z", c: number) => sides.find((s) => s.axis === axis && Math.abs(s.c - c) < 0.05);

  // Les ouvertures : celles où l'on passe, ou de fausses fenêtres closes sur un bâtiment plein
  const holes = d.blind ? blindHoles(d, sides) : d.open;
  for (const h of holes) {
    const side = d.blind ? sides.find((s) => s.axis === h.axis && s.face === h.c) : sideOf(h.axis, h.c);
    if (!side) continue;
    const f = side.face;
    const { axis, out } = side;
    const w = h.a1 - h.a0;
    const fr = ctx.bucket(frame);
    // L'encadrement : deux montants, un linteau, et l'appui sous les fenêtres
    fbox(fr, axis, f, out, h.a0 - 0.13, h.a0, h.y0, h.y1, -0.02, 0.05);
    fbox(fr, axis, f, out, h.a1, h.a1 + 0.13, h.y0, h.y1, -0.02, 0.05);
    fbox(fr, axis, f, out, h.a0 - 0.13, h.a1 + 0.13, h.y1, h.y1 + 0.17, -0.02, 0.07);
    if (h.kind === "win") fbox(fr, axis, f, out, h.a0 - 0.18, h.a1 + 0.18, h.y0 - 0.08, h.y0, -0.02, 0.11);
    else fbox(ctx.bucket("taille"), axis, f, out, h.a0 - 0.05, h.a1 + 0.05, 0, 0.07, -0.2, 0.18, 0.85);
    const fits = (p: number, q: number) => Math.min(p, q) >= side.lo + 0.05 && Math.max(p, q) <= side.hi - 0.05;
    if (d.blind) {
      // Close : deux volets (ou une porte) à fleur de l'encadrement
      const paint = h.kind === "win" ? shutter : doorPaint;
      fbox(ctx.bucket(paint), axis, f, out, h.a0, h.a1, h.y0, h.y1, -0.06, 0.02, 1, 2);
      fbox(ctx.bucket("fer"), axis, f, out, (h.a0 + h.a1) / 2 - 0.01, (h.a0 + h.a1) / 2 + 0.01, h.y0, h.y1, 0.02, 0.03, 0.7);
      continue;
    }
    if (h.kind === "win") {
      // Les volets, ouverts et rabattus contre la façade de part et d'autre
      for (const [p, q] of [
        [h.a0 - 0.13 - w / 2, h.a0 - 0.13],
        [h.a1 + 0.13, h.a1 + 0.13 + w / 2],
      ] as const) {
        if (!fits(p, q)) continue;
        fbox(ctx.bucket(shutter), axis, f, out, p, q, h.y0 + 0.02, h.y1 - 0.02, 0.04, 0.08, 1, 2);
        for (const y of [h.y0 + 0.2, h.y1 - 0.2])
          fbox(ctx.bucket("fer"), axis, f, out, p + 0.05, q - 0.05, y - 0.02, y + 0.02, 0.08, 0.095, 0.8);
      }
    } else if (h.kind === "door") {
      // La porte, grande ouverte contre le mur intérieur
      const inner = f - out * 0.3;
      const [p, q] = fits(h.a0 - w - 0.02, h.a0 - 0.02) ? [h.a0 - w - 0.02, h.a0 - 0.02] : [h.a1 + 0.02, h.a1 + w + 0.02];
      fbox(ctx.bucket(doorPaint), axis, inner, (out === 1 ? -1 : 1) as 1 | -1, p, q, h.y0 + 0.02, h.y1 - 0.05, 0.01, 0.06, 1, 2);
    } else {
      // Les grandes portes de grange ou de hangar, rabattues dehors contre la façade
      for (const [p, q] of [
        [h.a0 - 0.13 - w / 2, h.a0 - 0.13],
        [h.a1 + 0.13, h.a1 + 0.13 + w / 2],
      ] as const) {
        if (!fits(p, q)) continue;
        fbox(ctx.bucket(wood || stone ? doorPaint : "fer"), axis, f, out, p, q, h.y0 + 0.03, h.y1 - 0.05, 0.05, 0.11, 1, 2);
        if (wood || stone) {
          // La croix de Saint-André des portes de grange
          fbox(ctx.bucket("bois"), axis, f, out, p + 0.05, q - 0.05, (h.y0 + h.y1) / 2 - 0.08, (h.y0 + h.y1) / 2 + 0.08, 0.11, 0.14, 0.8);
        }
      }
    }
  }

  // Les angles en pierre de taille, en harpe (un bloc long, un bloc court)
  if (stone) {
    const b = ctx.bucket("taille");
    const corners: [number, number, number, number][] = [
      [d.x0, d.z0, 1, 1],
      [d.x1, d.z0, -1, 1],
      [d.x0, d.z1, 1, -1],
      [d.x1, d.z1, -1, -1],
    ];
    const stoneTop = wallTop - 0.25;
    for (const [cx, cz, dx, dz] of corners) {
      let k = 0;
      for (let y = d.wall === "pierre" ? 0.0 : 0.55; y + 0.3 <= stoneTop; y += 0.33, k++) {
        const la = k % 2 ? 0.28 : 0.48;
        const lb = k % 2 ? 0.48 : 0.28;
        // Sur la face nord ou sud (le long de x), puis sur la face est ou ouest (le long de z)
        addBox(
          b,
          Math.min(cx, cx + dx * la),
          y,
          Math.min(cz, cz - dz * 0.03),
          Math.max(cx, cx + dx * la),
          y + 0.3,
          Math.max(cz, cz - dz * 0.03),
          1,
          0.92 + (k % 3) * 0.04,
          y <= 0.001,
        );
        addBox(
          b,
          Math.min(cx, cx - dx * 0.03),
          y,
          Math.min(cz, cz + dz * lb),
          Math.max(cx, cx - dx * 0.03),
          y + 0.3,
          Math.max(cz, cz + dz * lb),
          1,
          0.92 + ((k + 1) % 3) * 0.04,
          y <= 0.001,
        );
      }
    }
    // La corniche sous le toit
    for (const s of sides) fbox(b, s.axis, s.face, s.out, s.lo - 0.08, s.hi + 0.08, wallTop - 0.22, wallTop - 0.02, 0, 0.09, 0.95);
  }
  // Le soubassement des maisons crépies, interrompu aux portes
  if (d.wall === "crepi" || d.wall === "crepi2") {
    const b = ctx.bucket("pierre");
    for (const s of sides) {
      const gaps = holes
        .filter((h) => h.y0 < 0.1 && h.axis === s.axis && Math.abs((d.blind ? h.c : (sideOf(h.axis, h.c)?.face ?? NaN)) - s.face) < 0.2)
        .map((h) => [h.a0 - 0.13, h.a1 + 0.13] as const)
        .sort((u, v) => u[0] - v[0]);
      let from = s.lo;
      for (const [g0, g1] of [...gaps, [s.hi, s.hi] as const]) {
        if (g0 > from + 0.05) fbox(b, s.axis, s.face, s.out, from, g0, 0, 0.55, 0, 0.035, 0.9);
        from = Math.max(from, g1);
      }
    }
  }
}

/** Les fenêtres closes d'un bâtiment plein : tous les trois mètres, à chaque étage ; une porte au rez-de-chaussée */
function blindHoles(d: HouseDecor, sides: { axis: "x" | "z"; face: number; out: 1 | -1; lo: number; hi: number }[]) {
  const holes: { axis: "x" | "z"; a0: number; a1: number; c: number; out: 1 | -1; y0: number; y1: number; kind: "door" | "win" | "big" }[] =
    [];
  const floors = Math.max(1, Math.floor((d.top - 0.6) / 3));
  const longest = sides.reduce((a, s) => (s.hi - s.lo > a.hi - a.lo ? s : a), sides[0]!);
  for (const s of sides) {
    const len = s.hi - s.lo;
    const n = Math.floor((len - 1.2) / 3);
    if (n < 1) continue;
    const step = len / n;
    for (let f = 0; f < floors; f++) {
      const y0 = 1.1 + f * 3;
      const y1 = y0 + 1.15;
      if (y1 > d.top - 0.5) continue;
      for (let i = 0; i < n; i++) {
        const mid = s.lo + step * (i + 0.5);
        const door = f === 0 && s === longest && i === Math.floor(n / 2);
        if (door) holes.push({ axis: s.axis, a0: mid - 0.6, a1: mid + 0.6, c: s.face, out: s.out, y0: 0, y1: 2.2, kind: "door" });
        else holes.push({ axis: s.axis, a0: mid - 0.5, a1: mid + 0.5, c: s.face, out: s.out, y0, y1, kind: "win" });
      }
    }
  }
  return holes;
}

const roofMat = new Map<string, THREE.Material>();
function wagonRoof(color: string): THREE.Material {
  let m = roofMat.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4 });
    roofMat.set(color, m);
  }
  return m;
}

export function addWagon(d: WagonDecor, ctx: Ctx) {
  const fer = ctx.bucket("fer");
  const len = d.x1 - d.x0;
  const zc = (d.z0 + d.z1) / 2;
  const m4 = new THREE.Matrix4();
  // Les roues : deux bogies de deux essieux, de chaque côté
  const axles = [d.x0 + 1.3, d.x0 + 2.5, d.x1 - 2.5, d.x1 - 1.3];
  for (const x of axles)
    for (const z of [d.z0 - 0.08, d.z1 + 0.08]) {
      m4.makeRotationX(Math.PI / 2).setPosition(x, 0.44, z);
      ctx.instance("wheel", m4);
    }
  for (const z of [d.z0, d.z1]) {
    const out = (z === d.z0 ? -1 : 1) as 1 | -1;
    // Le châssis et les bogies
    fbox(fer, "x", z, out, d.x0, d.x1, 0.62, 0.98, 0, 0.05, 0.75);
    fbox(fer, "x", z, out, d.x0 + 0.9, d.x0 + 2.9, 0.22, 0.66, 0.0, 0.17, 0.6);
    fbox(fer, "x", z, out, d.x1 - 2.9, d.x1 - 0.9, 0.22, 0.66, 0.0, 0.17, 0.6);
    if (d.h >= 2) {
      // La porte coulissante, ses rails, sa poignée ; des renforts verticaux
      const mid = (d.x0 + d.x1) / 2;
      fbox(ctx.bucket(d.m), "x", z, out, mid - 1.2, mid + 1.2, 1.0, 3.35, 0.03, 0.09, 0.82, 1.5);
      fbox(fer, "x", z, out, mid - 2.6, mid + 2.6, 3.35, 3.45, 0.02, 0.11, 0.7);
      fbox(fer, "x", z, out, mid - 2.6, mid + 2.6, 0.98, 1.04, 0.02, 0.11, 0.7);
      fbox(fer, "x", z, out, mid + 0.95, mid + 1.0, 1.9, 2.3, 0.09, 0.14, 0.6);
      for (let x = d.x0 + 0.6; x < d.x1 - 0.3; x += 1.5) {
        if (Math.abs(x - mid) < 1.5) continue;
        fbox(fer, "x", z, out, x - 0.05, x + 0.05, 1.0, d.h - 0.05, 0, 0.04, 0.65);
      }
    } else {
      // Un plat : des ranchers tout le long
      for (let x = d.x0 + 0.5; x < d.x1; x += 1.6) fbox(fer, "x", z, out, x - 0.05, x + 0.05, d.h, d.h + 0.7, -0.08, 0.02, 0.7);
    }
  }
  // Les tampons à chaque bout
  for (const [x, dir] of [
    [d.x0, -1],
    [d.x1, 1],
  ] as const) {
    for (const dz of [-0.85, 0.85]) {
      m4.makeRotationZ((-dir * Math.PI) / 2).setPosition(x + dir * 0.18, 1.0, zc + dz);
      ctx.instance("buffer", m4);
    }
    addBox(fer, Math.min(x, x + dir * 0.06), 0.7, d.z0 + 0.2, Math.max(x, x + dir * 0.06), 1.3, d.z1 - 0.2, 1, 0.6, false);
  }
  if (d.h >= 2) {
    // L'échelle au bout du wagon
    const xe = d.x1;
    for (const dz of [0.85, 1.25]) addBox(fer, xe, 1.0, d.z0 + dz - 0.025, xe + 0.07, d.h, d.z0 + dz + 0.025, 1, 0.6, false);
    for (let y = 1.3; y < d.h; y += 0.35) addBox(fer, xe + 0.02, y, d.z0 + 0.85, xe + 0.06, y + 0.04, d.z0 + 1.25, 1, 0.6, false);
    // Le toit bombé
    const r = (d.z1 - d.z0) / 2 + 0.06;
    const geo = new THREE.CylinderGeometry(r, r, len + 0.12, ctx.low ? 10 : 18, 1, false, -Math.PI / 2, Math.PI);
    geo.rotateZ(Math.PI / 2);
    geo.scale(1, 0.16, 1);
    const roof = new THREE.Mesh(geo, wagonRoof(d.m === "wagon" ? "#4d4a46" : "#545a5e"));
    roof.position.set((d.x0 + d.x1) / 2, d.h, zc);
    roof.castShadow = true;
    ctx.group.add(roof);
  }
}

/** Les pièces répétées des wagons */
export function instancedParts(list: Map<"wheel" | "buffer", THREE.Matrix4[]>, low: boolean, group: THREE.Group) {
  const iron = new THREE.MeshStandardMaterial({ color: "#2a2826", roughness: 0.55, metalness: 0.6 });
  const shapes: Record<"wheel" | "buffer", THREE.BufferGeometry> = {
    wheel: new THREE.CylinderGeometry(0.44, 0.44, 0.13, low ? 10 : 18),
    buffer: (() => {
      const g = new THREE.CylinderGeometry(0.1, 0.1, 0.36, 8);
      const plate = new THREE.CylinderGeometry(0.19, 0.19, 0.04, 12);
      plate.translate(0, 0.19, 0);
      const parts = [g.toNonIndexed(), plate.toNonIndexed()];
      const merged = new THREE.BufferGeometry();
      const pos = parts.flatMap((p) => Array.from(p.attributes.position!.array));
      const nor = parts.flatMap((p) => Array.from(p.attributes.normal!.array));
      merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      merged.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      return merged;
    })(),
  };
  for (const [kind, mats] of list) {
    if (mats.length === 0) continue;
    const mesh = new THREE.InstancedMesh(shapes[kind], iron, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    group.add(mesh);
  }
}
