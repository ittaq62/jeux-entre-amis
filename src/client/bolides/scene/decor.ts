// L'habillage de la piste, le même sur tous les circuits : les panneaux à chevrons qui annoncent les virages, les
// piles de pneus à l'extérieur des courbes, les panneaux le long des murets, les drapeaux de la ligne droite, la
// tribune et son public au départ, et les cases de la grille peintes au sol.

import * as THREE from "three";
import { gridSlot, pointAt, type Track } from "../../../shared/games/bolides/track.ts";
import { KART_COLORS } from "./kart.ts";
import { mergeDeep } from "./merge.ts";
import * as TX from "./textures.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

export interface DecorContext {
  group: THREE.Group;
  t: Track;
  keep: Keep;
  heightAt: (x: number, z: number) => number;
  shadows: boolean;
  /** Ce coin est-il libre (assez loin de toute route, et pas dans l'eau) ? */
  free: (x: number, z: number, min: number) => boolean;
}

/** Un morceau de virage : où il commence et finit (en échantillons), et de quel côté il tourne (1 : à gauche) */
interface Bend {
  from: number;
  to: number;
  side: 1 | -1;
  /** L'angle total, en radians */
  turn: number;
}

/** Les virages du circuit : les suites d'échantillons qui tournent assez, du même côté */
export function findBends(t: Track, minCurve = 1 / 80): Bend[] {
  const out: Bend[] = [];
  const step = t.length / t.n;
  // On part d'une ligne droite pour ne pas couper un virage en deux
  let start = 0;
  while (start < t.n && Math.abs(t.bend[start]!) >= minCurve) start++;
  let cur: Bend | null = null;
  for (let k = 0; k <= t.n; k++) {
    const i = (start + k) % t.n;
    const b = t.bend[i]!;
    const side = b > 0 ? 1 : -1;
    const turning = Math.abs(b) >= minCurve && k < t.n;
    if (turning && cur && cur.side === side) {
      cur.to = i;
      cur.turn += Math.abs(b) * step;
    } else {
      if (cur && cur.turn > 0.6) out.push(cur);
      cur = turning ? { from: i, to: i, side, turn: Math.abs(b) * step } : null;
    }
  }
  return out;
}

const place = (x: number, y: number, z: number, rot = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
    new THREE.Vector3(sx, sy, sz),
  );

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, spots: THREE.Matrix4[], shadows: boolean) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  spots.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = spots.length;
  mesh.castShadow = shadows;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Les panneaux à chevrons, à l'extérieur des virages, tournés vers ceux qui arrivent ; et les piles de pneus */
export function addBendDressing(ctx: DecorContext) {
  const { group, t, keep, heightAt, shadows } = ctx;
  const step = t.length / t.n;
  const chevron = keep(TX.chevronTexture());
  const mirrored = keep(chevron.clone());
  mirrored.wrapS = THREE.RepeatWrapping;
  mirrored.repeat.x = -1;
  mirrored.offset.x = 1;
  const left = keep(new THREE.MeshLambertMaterial({ map: chevron }));
  const right = keep(new THREE.MeshLambertMaterial({ map: mirrored }));
  const boardGeo = keep(new THREE.PlaneGeometry(4.2, 1.05));
  const backGeo = keep(new THREE.BoxGeometry(4.3, 1.15, 0.12));
  const postGeo = keep(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6));
  const dark = keep(new THREE.MeshLambertMaterial({ color: 0x3a3d44 }));
  const posts: THREE.Matrix4[] = [];
  const backs: THREE.Matrix4[] = [];
  const faces: Record<1 | -1, THREE.Matrix4[]> = { 1: [], [-1]: [] };
  const dummy = new THREE.Object3D();
  const tyreSpots: THREE.Matrix4[] = [];
  const whiteSpots: THREE.Matrix4[] = [];
  for (const b of findBends(t)) {
    const len = (((b.to - b.from + t.n) % t.n) + 1) * step;
    // Les panneaux : au début du virage, à l'extérieur (un virage à gauche a son extérieur à droite, d > 0)
    const boards = len > 60 ? [0.08, 0.45] : [0.15];
    for (const f of boards) {
      const s = b.from * step + len * f;
      const p = pointAt(t, s, b.side * (t.wall + 2.6));
      const back = pointAt(t, s - 30, 0);
      const rot = Math.atan2(back.x - p.x, back.z - p.z);
      const y = heightAt(p.x, p.z) + 1.5;
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(0, rot, 0);
      dummy.translateZ(0.07);
      dummy.updateMatrix();
      faces[b.side].push(dummy.matrix.clone());
      backs.push(place(p.x, y, p.z, rot));
      for (const dx of [-1.6, 1.6]) {
        posts.push(place(p.x + Math.cos(rot) * dx, y - 0.9, p.z - Math.sin(rot) * dx));
      }
    }
    // Les pneus : une pile tous les 7 m le long de l'extérieur des virages serrés
    if (len / Math.max(1e-6, b.turn) > 60) continue;
    for (let s = b.from * step; s < b.from * step + len; s += 7) {
      const p = pointAt(t, s, b.side * (t.wall + 1.1));
      const y = heightAt(p.x, p.z);
      const stack = 2 + (Math.round(s / 7) % 2);
      for (let k = 0; k < stack; k++) {
        const m = place(p.x, y + 0.2 + k * 0.36, p.z, s);
        (k === stack - 1 && Math.round(s / 7) % 3 === 0 ? whiteSpots : tyreSpots).push(m);
      }
    }
  }
  group.add(instanced(boardGeo, left, faces[1], false));
  group.add(instanced(boardGeo, right, faces[-1], false));
  group.add(instanced(backGeo, dark, backs, false));
  group.add(instanced(postGeo, dark, posts, false));
  const tyre = keep(new THREE.TorusGeometry(0.42, 0.19, 6, 12));
  tyre.rotateX(Math.PI / 2);
  group.add(instanced(tyre, keep(new THREE.MeshLambertMaterial({ color: 0x1d1e21 })), tyreSpots, shadows));
  group.add(instanced(tyre, keep(new THREE.MeshLambertMaterial({ color: 0xf0ede6 })), whiteSpots, shadows));
}

/** Des panneaux aux couleurs vives derrière les murets des lignes droites, tournés vers la route */
export function addWallBoards(ctx: DecorContext) {
  const { group, t, keep, heightAt } = ctx;
  const step = t.length / t.n;
  const base = keep(TX.boardsTexture());
  const mats = [0, 1, 2, 3].map((i) => {
    const tex = keep(base.clone());
    tex.repeat.x = 0.25;
    tex.offset.x = i * 0.25;
    return keep(new THREE.MeshLambertMaterial({ map: tex }));
  });
  const geo = keep(new THREE.PlaneGeometry(6, 1.1));
  const spots = mats.map(() => [] as THREE.Matrix4[]);
  let n = 0;
  for (let i = 0; i < t.n; i += Math.round(9 / step)) {
    if (Math.abs(t.bend[i]!) > 0.004) continue;
    const s = i * step;
    // Pas sur la ligne d'arrivée (l'arche) ni sur un tremplin
    if (Math.abs(((s + t.length / 2) % t.length) - t.length / 2) < 14) continue;
    if (t.jumps.some((j) => Math.abs(s - j) < 16)) continue;
    const side = n % 2 === 0 ? 1 : -1;
    const p = pointAt(t, s, side * (t.wall + 0.9));
    if (!ctx.free(p.x, p.z, t.wall + 0.4)) continue;
    // Face à la route : la normale du panneau va de lui vers le milieu de la route
    const c = pointAt(t, s, 0);
    const rot = Math.atan2(c.x - p.x, c.z - p.z);
    spots[n % 4]!.push(place(p.x, heightAt(p.x, p.z) + 1.1, p.z, rot));
    n++;
  }
  mats.forEach((m, i) => group.add(instanced(geo, m, spots[i]!, false)));
}

/** Les drapeaux de la ligne droite du départ, aux couleurs des karts ; ils flottent */
export function addFlags(ctx: DecorContext): (time: number) => void {
  const { group, t, keep, heightAt, shadows } = ctx;
  const pole = keep(new THREE.CylinderGeometry(0.08, 0.1, 7, 6));
  const poleMat = keep(new THREE.MeshLambertMaterial({ color: 0xd9dde3 }));
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(1.8, -0.55);
  shape.lineTo(0, -1.1);
  shape.closePath();
  const flagGeo = keep(new THREE.ShapeGeometry(shape));
  const spots: { x: number; y: number; z: number; rot: number }[] = [];
  const poles: THREE.Matrix4[] = [];
  for (let s = -70; s <= 70; s += 14) {
    if (Math.abs(s) < 10) continue;
    for (const side of [-1, 1]) {
      const p = pointAt(t, s, side * (t.wall + 1.9));
      if (!ctx.free(p.x, p.z, t.wall + 1)) continue;
      const y = heightAt(p.x, p.z);
      poles.push(place(p.x, y + 3.5, p.z));
      // Le drapeau flotte vers l'arrière de la course (le vent de la course)
      spots.push({ x: p.x, y: y + 6.9, z: p.z, rot: Math.atan2(-p.tx, -p.tz) - Math.PI / 2 });
    }
  }
  group.add(instanced(pole, poleMat, poles, shadows));
  const flags = new THREE.InstancedMesh(
    flagGeo,
    keep(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })),
    Math.max(1, spots.length),
  );
  flags.count = spots.length;
  spots.forEach((_, i) => flags.setColorAt(i, new THREE.Color(KART_COLORS[i % KART_COLORS.length])));
  if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
  group.add(flags);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const at = new THREE.Vector3();
  return (time: number) => {
    spots.forEach((s, i) => {
      q.setFromAxisAngle(up, s.rot + Math.sin(time * 3 + i * 1.3) * 0.25);
      flags.setMatrixAt(i, m.compose(at.set(s.x, s.y, s.z), q, one));
    });
    flags.instanceMatrix.needsUpdate = true;
  };
}

/** La tribune du départ et son public, du côté libre de la ligne droite ; et les cases de la grille */
export function addGrandstand(ctx: DecorContext) {
  const { group, t, keep, heightAt, shadows } = ctx;
  const along = -12;
  let side = 0;
  for (const sd of [1, -1]) {
    const probe = pointAt(t, along, sd * (t.wall + 9));
    const ends = [pointAt(t, along - 20, sd * (t.wall + 9)), pointAt(t, along + 20, sd * (t.wall + 9))];
    if (ctx.free(probe.x, probe.z, t.wall + 4) && ends.every((e) => ctx.free(e.x, e.z, t.wall + 4))) {
      side = sd;
      break;
    }
  }
  if (side !== 0) {
    const p = pointAt(t, along, side * (t.wall + 9));
    const y = heightAt(p.x, p.z);
    const stand = new THREE.Group();
    const L = 38;
    // Les gradins : une pente couverte de monde, qui monte en s'éloignant de la route (z local > 0)
    const crowd = keep(TX.crowdTexture());
    crowd.repeat.set(3, 3);
    const slopeLen = Math.hypot(9, 5);
    const slope = new THREE.Mesh(keep(new THREE.PlaneGeometry(L, slopeLen)), keep(new THREE.MeshLambertMaterial({ map: crowd })));
    slope.rotation.x = -Math.PI / 2 + Math.atan2(5, 9);
    slope.position.set(0, 1 + 2.5, 4.5);
    stand.add(slope);
    const concrete = keep(new THREE.MeshLambertMaterial({ color: 0xb8b4ab }));
    const back = new THREE.Mesh(keep(new THREE.BoxGeometry(L, 6.5, 0.6)), concrete);
    back.position.set(0, 3.25, 9.3);
    back.castShadow = shadows;
    stand.add(back);
    const front = new THREE.Mesh(keep(new THREE.BoxGeometry(L, 1, 0.5)), concrete);
    front.position.set(0, 0.5, -0.2);
    stand.add(front);
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 6.5, 9.8)), concrete);
      wall.position.set((sx * L) / 2, 3.25, 4.6);
      stand.add(wall);
    }
    // Le toit rouge sur ses poteaux
    const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(L + 2, 0.35, 11)), keep(new THREE.MeshLambertMaterial({ color: 0xc9372c })));
    roof.position.set(0, 8.6, 4.4);
    roof.rotation.x = -0.08;
    roof.castShadow = shadows;
    stand.add(roof);
    const postGeo = keep(new THREE.CylinderGeometry(0.15, 0.15, 8.6, 8));
    for (let x = -L / 2 + 1; x <= L / 2 - 1; x += 9) {
      const post = new THREE.Mesh(postGeo, concrete);
      post.position.set(x, 4.3, 9);
      stand.add(post);
    }
    mergeDeep(stand, keep);
    // Tournée vers la route : son z local s'éloigne du milieu de la route
    const c = pointAt(t, along, 0);
    stand.rotation.y = Math.atan2(p.x - c.x, p.z - c.z);
    stand.position.set(p.x, y, p.z);
    group.add(stand);
  }
  // Les cases de la grille de départ, peintes au sol
  const markTex = keep(TX.gridMarkTexture());
  const markMat = keep(new THREE.MeshBasicMaterial({ map: markTex, transparent: true, depthWrite: false }));
  const markGeo = keep(new THREE.PlaneGeometry(2.8, 2.8));
  for (let place = 0; place < 8; place++) {
    const g = gridSlot(t, place);
    const at = pointAt(t, g.s + 1.6, 0);
    const m = new THREE.Mesh(markGeo, markMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = g.h + Math.PI;
    const fx = Math.sin(g.h);
    const fz = Math.cos(g.h);
    m.position.set(g.x + fx * 0.6, at.y + 0.085, g.z + fz * 0.6);
    group.add(m);
  }
}
