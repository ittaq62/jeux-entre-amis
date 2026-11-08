// Les biomes : le décor propre à chaque circuit lointain. Les dunes (palmiers, cactus, mesas, ruines, oasis, vent de
// sable), le lagon (paillotes, palmiers, coraux, poissons, épave, rayons de lumière sous l'eau) et le volcan (roche
// noire, braises qui montent, cratère fumant, lampadaires).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CURB, pointAt, type Track } from "../../../shared/games/bolides/track.ts";
import { fbm } from "./nature.ts";
import * as TX from "./textures.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

export interface BiomeContext {
  group: THREE.Group;
  t: Track;
  keep: Keep;
  heightAt: (x: number, z: number) => number;
  shadows: boolean;
  phone: boolean;
  /** Des emplacements au hasard, à une distance de la route comprise entre min et max */
  scatter: (count: number, min: number, max: number, test?: (x: number, z: number) => boolean) => [number, number][];
  r: () => number;
  few: number;
}

export type BiomeUpdate = (time: number, camera: THREE.Vector3) => void;

function place(x: number, y: number, z: number, rot = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
    new THREE.Vector3(sx, sy, sz),
  );
}

function instances(geo: THREE.BufferGeometry, mat: THREE.Material, spots: THREE.Matrix4[], shadows: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  spots.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = spots.length;
  mesh.castShadow = shadows;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Une forme d'une seule couleur par sommet */
function tinted(g: THREE.BufferGeometry, color: number, light = 1): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  const p = flat.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Color(color).multiplyScalar(light);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) col.set([c.r, c.g, c.b], i * 3);
  flat.setAttribute("color", new THREE.BufferAttribute(col, 3));
  flat.deleteAttribute("uv");
  return flat;
}

const fused = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts, false)!;
const painted = (keep: Keep) => keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));

/** Un palmier : haut de 1, le tronc qui s'incline, et sa couronne de palmes retombantes */
function palmGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.018, 0.034, 1, 6, 7, true).translate(0, 0.5, 0);
  const tp = trunk.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + tp.getY(i) ** 2 * 0.2);
  trunk.computeVertexNormals();
  const parts = [tinted(trunk, 0x8a6a44)];
  const leaves = 8;
  for (let l = 0; l < leaves; l++) {
    const a = (l / leaves) * Math.PI * 2 + (l % 2) * 0.2;
    const pos: number[] = [];
    const n = 6;
    const len = 0.46 + (l % 3) * 0.05;
    for (let k = 0; k < n; k++) {
      const u0 = k / n;
      const u1 = (k + 1) / n;
      const w = (u: number) => 0.075 * Math.sin(Math.PI * Math.min(1, u + 0.12));
      const at = (u: number, side: number): [number, number, number] => {
        const out = u * len;
        const y = 1 + 0.08 * Math.sin(u * 2.2) - u * u * 0.42;
        const lat = side * w(u);
        return [0.2 + Math.cos(a) * out - Math.sin(a) * lat, y, Math.sin(a) * out + Math.cos(a) * lat];
      };
      const a0 = at(u0, -1);
      const b0 = at(u0, 1);
      const a1 = at(u1, -1);
      const b1 = at(u1, 1);
      pos.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
    }
    const leaf = new THREE.BufferGeometry();
    leaf.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    leaf.computeVertexNormals();
    parts.push(tinted(leaf, l % 2 ? 0x4f9a3c : 0x3f8a36));
  }
  return fused(parts);
}

/** Un cactus : haut de 1, avec ses deux bras */
function cactusGeometry(): THREE.BufferGeometry {
  const body = new THREE.CapsuleGeometry(0.09, 0.82, 3, 8).translate(0, 0.5, 0);
  const armA = new THREE.CapsuleGeometry(0.055, 0.26, 3, 6).translate(0.24, 0.62, 0);
  const elbowA = new THREE.CapsuleGeometry(0.055, 0.2, 3, 6).rotateZ(Math.PI / 2).translate(0.13, 0.46, 0);
  const armB = new THREE.CapsuleGeometry(0.05, 0.2, 3, 6).translate(-0.21, 0.74, 0);
  const elbowB = new THREE.CapsuleGeometry(0.05, 0.16, 3, 6).rotateZ(Math.PI / 2).translate(-0.12, 0.6, 0);
  return fused([body, armA, elbowA, armB, elbowB].map((g) => tinted(g, 0x4e8a4a)));
}

/** Une mesa : un gros bloc de roche à flancs raides, en couches de couleurs, de rayon 1 et de hauteur 1 */
function mesaGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.72, 1, 1, 11, 6).translate(0, 0.5, 0);
  const flat = g.toNonIndexed();
  const p = flat.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const n = 1 + 0.12 * Math.sin(a * 5 + y * 8) + 0.06 * Math.sin(a * 11 - y * 14);
    p.setXYZ(i, x * n, y, z * n);
  }
  const col = new Float32Array(p.count * 3);
  const bands = [0xb65a34, 0xc9743f, 0xa24a2e, 0xd68a4e, 0xbb6438, 0xe0a060];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    c.setHex(bands[Math.min(bands.length - 1, Math.floor(y * bands.length))]!);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  flat.setAttribute("color", new THREE.BufferAttribute(col, 3));
  flat.deleteAttribute("uv");
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}

/** Une paillote : plancher sur pilotis, murs de bambou, grand toit de paille ; un cube de 1 de côté, pieds à y = 0 */
function hutGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z] of [
    [-0.42, -0.42],
    [0.42, -0.42],
    [-0.42, 0.42],
    [0.42, 0.42],
  ] as const) {
    parts.push(tinted(new THREE.CylinderGeometry(0.03, 0.035, 0.42, 5).translate(x, 0.21, z), 0x7a5a38));
  }
  parts.push(tinted(new THREE.BoxGeometry(1.05, 0.05, 1.05).translate(0, 0.44, 0), 0xa98155));
  parts.push(tinted(new THREE.BoxGeometry(0.72, 0.42, 0.72).translate(0, 0.68, 0), 0xc7a26e));
  parts.push(tinted(new THREE.BoxGeometry(0.2, 0.3, 0.02).translate(0, 0.64, 0.37), 0x4f3a24));
  parts.push(tinted(new THREE.ConeGeometry(0.86, 0.5, 4).rotateY(Math.PI / 4).translate(0, 1.14, 0), 0xd8b873));
  return fused(parts);
}

/** Un parasol et sa serviette : haut de 1 */
function umbrellaGeometry(): THREE.BufferGeometry {
  return fused([
    tinted(new THREE.CylinderGeometry(0.015, 0.015, 1, 5).translate(0, 0.5, 0), 0xe8e2d4),
    tinted(new THREE.ConeGeometry(0.5, 0.2, 8).translate(0, 1, 0), 0xffffff),
  ]);
}

/** Du vent, des braises, des bulles : des points qui filent autour de la caméra */
function drifting(
  ctx: BiomeContext,
  opts: {
    count: number;
    color: number;
    size: number;
    opacity: number;
    box: [number, number, number];
    vx: number;
    vy: number;
    additive?: boolean;
  },
): BiomeUpdate {
  const { group, keep, phone } = ctx;
  const n = Math.round(opts.count * (phone ? 0.45 : 1));
  const [bx, by, bz] = opts.box;
  const pos = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * bx, Math.random() * by, (Math.random() - 0.5) * bz], i * 3);
    seeds[i] = Math.random() * 6.28;
  }
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = keep(
    new THREE.PointsMaterial({
      color: opts.color,
      size: opts.size,
      map: keep(TX.sparkTexture()),
      transparent: true,
      depthWrite: false,
      opacity: opts.opacity,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  );
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  group.add(pts);
  let last = 0;
  return (time, camera) => {
    const dt = Math.min(0.05, Math.max(0, time - last));
    last = time;
    const arr = geo.attributes.position!.array as Float32Array;
    for (let i = 0; i < n; i++) {
      let x = arr[i * 3]! + (opts.vx + Math.sin(time + seeds[i]!) * 1.2) * dt;
      let y = arr[i * 3 + 1]! + (opts.vy + Math.cos(time * 1.4 + seeds[i]!) * 0.6) * dt;
      let z = arr[i * 3 + 2]! + Math.sin(time * 0.7 + seeds[i]!) * 0.8 * dt;
      if (x - camera.x > bx / 2) x -= bx;
      else if (x - camera.x < -bx / 2) x += bx;
      if (z - camera.z > bz / 2) z -= bz;
      else if (z - camera.z < -bz / 2) z += bz;
      if (y - camera.y > by * 0.7) y -= by;
      else if (y - camera.y < -by * 0.3) y += by;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    geo.attributes.position!.needsUpdate = true;
  };
}

/** Une boîte de décor posée le long de la route, à côté (ni sur elle, ni dans le mur) */
function roadside(ctx: BiomeContext, s: number, side: number, away: number) {
  const p = pointAt(ctx.t, s, side * (ctx.t.wall + away));
  return { x: p.x, z: p.z, y: ctx.heightAt(p.x, p.z), rot: Math.atan2(p.tx, p.tz) };
}

// -------------------------------------------------------------------------------------------------------------------
// Les dunes
// -------------------------------------------------------------------------------------------------------------------

export function buildDunes(ctx: BiomeContext): BiomeUpdate {
  const { group, keep, heightAt, shadows, scatter, r, few, t } = ctx;
  const palm = keep(palmGeometry());
  const cactus = keep(cactusGeometry());
  const mesa = keep(mesaGeometry());
  const mat = painted(keep);
  const palms: THREE.Matrix4[] = [];
  const cacti: THREE.Matrix4[] = [];
  const rocks: THREE.Matrix4[] = [];
  // Les grands blocs de roche, un peu partout au loin
  for (const [x, z] of scatter(Math.round(26 * few), t.wall + 26, 165)) {
    const w = 10 + r() * 18;
    rocks.push(place(x, heightAt(x, z) - 1, z, r() * 6, w, 12 + r() * 24, w * (0.7 + r() * 0.5)));
  }
  group.add(instances(mesa, mat, rocks, shadows));
  // Les cactus, près de la route
  for (const [x, z] of scatter(Math.round(120 * few), t.wall + 2, 95))
    cacti.push(place(x, heightAt(x, z) - 0.2, z, r() * 6, 3 + r() * 3.5));
  group.add(instances(cactus, mat, cacti, shadows));
  // Les oasis : un bassin, et ses palmiers tout autour
  const waterTex = keep(TX.waterTexture());
  waterTex.repeat.set(2, 2);
  const pond = keep(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2));
  const pondMat = keep(new THREE.MeshLambertMaterial({ map: waterTex, color: 0x9fe3e0 }));
  const bank = keep(new THREE.MeshLambertMaterial({ color: 0x7d9a4a }));
  for (const [x, z] of scatter(Math.round(5 * Math.max(0.6, few)), t.wall + 16, 70)) {
    const y = heightAt(x, z);
    const size = 9 + r() * 7;
    const grass = new THREE.Mesh(pond, bank);
    grass.position.set(x, y + 0.05, z);
    grass.scale.setScalar(size * 1.5);
    const water = new THREE.Mesh(pond, pondMat);
    water.position.set(x, y + 0.12, z);
    water.scale.setScalar(size);
    group.add(grass, water);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + r();
      const d = size * (1.05 + r() * 0.35);
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      palms.push(place(px, heightAt(px, pz) - 0.2, pz, r() * 6, 8 + r() * 5));
    }
  }
  group.add(instances(palm, mat, palms, shadows));
  // Des ruines le long de la route : colonnes debout ou brisées, et des arches
  const stone = keep(new THREE.MeshLambertMaterial({ color: 0xe3cfa3, flatShading: true }));
  const column = keep(new THREE.CylinderGeometry(0.72, 0.85, 1, 10));
  const capital = keep(new THREE.BoxGeometry(2.1, 0.5, 2.1));
  const columns: THREE.Matrix4[] = [];
  const capitals: THREE.Matrix4[] = [];
  for (let s = 40; s < t.length; s += 92) {
    const side = Math.round(s / 92) % 2 ? 1 : -1;
    for (let k = 0; k < 4; k++) {
      const c = roadside(ctx, s + k * 6, side, 3.5 + (k % 2) * 1.2);
      if (t.gaps.some((g) => s + k * 6 > g.from - 12 && s + k * 6 < g.to + 12)) continue;
      const h = k === 2 ? 2.4 + r() * 2 : 6 + r() * 2.5;
      columns.push(place(c.x, c.y + h / 2, c.z, r() * 6, 1, h, 1));
      if (k !== 2) capitals.push(place(c.x, c.y + h + 0.25, c.z, c.rot));
    }
  }
  group.add(instances(column, stone, columns, shadows), instances(capital, stone, capitals, shadows));
  // Les tentes des marchands, à côté de la ligne d'arrivée
  const tent = keep(new THREE.ConeGeometry(1, 1, 8));
  const tents: THREE.Matrix4[] = [];
  const colors = [0xd8352a, 0x2f80ed, 0xf2c94c, 0x9b51e0, 0x27ae60];
  for (let k = 0; k < 12; k++) {
    const c = roadside(ctx, -60 + k * 24, k % 2 ? 1 : -1, 6 + (k % 3) * 2.5);
    tents.push(place(c.x, c.y + 1.9, c.z, r() * 6, 3.4, 3.8, 3.4));
  }
  const tentMesh = instances(tent, keep(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })), tents, shadows);
  const col = new THREE.Color();
  tents.forEach((_, i) => tentMesh.setColorAt(i, col.setHex(colors[i % colors.length]!)));
  if (tentMesh.instanceColor) tentMesh.instanceColor.needsUpdate = true;
  group.add(tentMesh);
  // Le vent de sable, au ras du sol
  return drifting(ctx, { count: 520, color: 0xe8c896, size: 0.2, opacity: 0.55, box: [80, 12, 80], vx: 11, vy: 0.1 });
}

// -------------------------------------------------------------------------------------------------------------------
// Le lagon
// -------------------------------------------------------------------------------------------------------------------

/** Un corail : des boules bosselées, ou des branches */
function coralBlobGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, y, z, s] of [
    [0, 0.5, 0, 0.62],
    [0.45, 0.3, 0.2, 0.42],
    [-0.4, 0.28, -0.25, 0.4],
    [0.1, 0.95, -0.15, 0.34],
  ] as const) {
    parts.push(new THREE.IcosahedronGeometry(s, 1).translate(x, y, z));
  }
  return fused(parts.map((g) => tinted(g, 0xffffff)));
}

function coralBranchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4;
    const tilt = 0.25 + (k % 3) * 0.2;
    const h = 0.7 + (k % 2) * 0.35;
    const g = new THREE.CylinderGeometry(0.03, 0.09, h, 5)
      .translate(0, h / 2, 0)
      .rotateZ(tilt)
      .rotateY(a);
    parts.push(tinted(g, 0xffffff));
  }
  return fused(parts);
}

/** Une algue : une bande haute et ondulée */
function kelpGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = 8;
  for (let k = 0; k < n; k++) {
    const y0 = k / n;
    const y1 = (k + 1) / n;
    const w = 0.07 * (1 - y0 * 0.6);
    const x = (y: number) => Math.sin(y * 7) * 0.09;
    pos.push(x(y0) - w, y0, 0, x(y0) + w, y0, 0, x(y1) - w * 0.8, y1, 0, x(y0) + w, y0, 0, x(y1) + w * 0.8, y1, 0, x(y1) - w * 0.8, y1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return tinted(g, 0x2f8a55);
}

export function buildLagon(ctx: BiomeContext): BiomeUpdate {
  const { group, keep, heightAt, shadows, scatter, r, few, t, phone } = ctx;
  const water = t.water ?? 0;
  const mat = painted(keep);
  const dry = (x: number, z: number) => heightAt(x, z) > water + 0.7;
  // Les palmiers, les paillotes, les parasols : là où il y a du sable
  const palm = keep(palmGeometry());
  const palms: THREE.Matrix4[] = [];
  for (const [x, z] of scatter(Math.round(150 * few), t.wall + 2, 150, dry))
    palms.push(place(x, heightAt(x, z) - 0.2, z, r() * 6, 8 + r() * 6));
  group.add(instances(palm, mat, palms, shadows));
  const hut = keep(hutGeometry());
  const huts: THREE.Matrix4[] = [];
  for (const [x, z] of scatter(Math.round(22 * few), t.wall + 8, 130, dry)) huts.push(place(x, heightAt(x, z), z, r() * 6, 8 + r() * 4));
  group.add(instances(hut, mat, huts, shadows));
  const umb = keep(umbrellaGeometry());
  const umbs: THREE.Matrix4[] = [];
  for (const [x, z] of scatter(Math.round(46 * few), t.wall + 1.5, 26, dry)) umbs.push(place(x, heightAt(x, z), z, r() * 6, 3));
  const umbMesh = instances(umb, keep(new THREE.MeshLambertMaterial({ vertexColors: true })), umbs, shadows);
  const c = new THREE.Color();
  const beach = [0xff5a4f, 0x2fb7d4, 0xffd23a, 0xff8ae2, 0x7fe08a];
  umbs.forEach((_, i) => umbMesh.setColorAt(i, c.setHex(beach[i % beach.length]!)));
  if (umbMesh.instanceColor) umbMesh.instanceColor.needsUpdate = true;
  group.add(umbMesh);
  // Sous la mer : ce qui pousse le long de la route immergée
  const blob = keep(coralBlobGeometry());
  const branch = keep(coralBranchGeometry());
  const kelp = keep(kelpGeometry());
  const blobs: THREE.Matrix4[] = [];
  const branches: THREE.Matrix4[] = [];
  const kelps: THREE.Matrix4[] = [];
  const step = phone ? 7 : 3.5;
  let deepest = 0;
  let deepS = 0;
  for (let s = 0; s < t.length; s += step) {
    const mid = pointAt(t, s, 0);
    if (mid.y < deepest) {
      deepest = mid.y;
      deepS = s;
    }
    if (mid.y > water - 1) continue;
    for (const side of [-1, 1]) {
      const d = t.half + CURB + 0.8 + r() * r() * 34;
      const p = pointAt(t, s, side * d);
      const y = heightAt(p.x, p.z);
      if (y > water - 1) continue;
      const roll = r();
      const m = place(p.x, y - 0.1, p.z, r() * 6, 1.2 + r() * 2.2);
      if (roll < 0.34) blobs.push(m);
      else if (roll < 0.68) branches.push(m);
      else kelps.push(place(p.x, y - 0.1, p.z, r() * 3, 3.5, 5 + r() * 7, 3.5));
    }
  }
  const coralMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const reef = [0xff6b8a, 0xffa23a, 0xc77dff, 0xff4f6e, 0x5ad1c8, 0xffe066];
  const blobMesh = instances(blob, coralMat, blobs, false);
  const branchMesh = instances(branch, coralMat, branches, false);
  blobs.forEach((_, i) => blobMesh.setColorAt(i, c.setHex(reef[i % reef.length]!)));
  branches.forEach((_, i) => branchMesh.setColorAt(i, c.setHex(reef[(i * 3 + 1) % reef.length]!)));
  for (const m of [blobMesh, branchMesh]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  group.add(blobMesh, branchMesh);
  group.add(instances(kelp, keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })), kelps, false));

  // Une épave couchée sur le fond, près du point le plus bas
  {
    const wreck = new THREE.Group();
    const wood = keep(new THREE.MeshLambertMaterial({ color: 0x5b4632, flatShading: true }));
    const shape = new THREE.Shape();
    shape.moveTo(-3, -11);
    shape.quadraticCurveTo(-4, 0, 0, 12);
    shape.quadraticCurveTo(4, 0, 3, -11);
    shape.closePath();
    const hull = new THREE.Mesh(keep(new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: false, curveSegments: 5 })), wood);
    hull.rotation.x = Math.PI / 2;
    hull.position.y = 5;
    wreck.add(hull);
    for (const z of [-5, 3]) {
      const mast = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.3, 13, 6)), wood);
      mast.position.set(0, 10, z);
      mast.rotation.z = 0.25;
      wreck.add(mast);
    }
    const spot = pointAt(t, deepS, t.wall + 18);
    wreck.position.set(spot.x, heightAt(spot.x, spot.z) - 1, spot.z);
    wreck.rotation.set(0.1, 1.1, 0.22);
    group.add(wreck);
  }

  // Les rayons de lumière qui descendent dans l'eau
  const shaftMat = keep(
    new THREE.MeshBasicMaterial({
      color: 0xbff0ff,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  const shaftGeo = keep(new THREE.CylinderGeometry(2.2, 5.5, 22, 8, 1, true));
  const shafts: THREE.Mesh[] = [];
  for (let s = 0, k = 0; s < t.length && k < (phone ? 7 : 14); s += 13) {
    const p = pointAt(t, s, (r() - 0.5) * 20);
    if (p.y > water - 5) continue;
    const m = new THREE.Mesh(shaftGeo, shaftMat);
    m.position.set(p.x, water - 11, p.z);
    m.rotation.set(0.12, 0, 0.1);
    group.add(m);
    shafts.push(m);
    k++;
  }

  // Les bancs de poissons, qui tournent au-dessus des coraux
  const fishGeo = keep(
    fused([
      tinted(new THREE.OctahedronGeometry(0.42, 0).scale(0.45, 0.8, 1.4), 0xffffff),
      tinted(new THREE.ConeGeometry(0.3, 0.5, 3).rotateX(Math.PI / 2).translate(0, 0, -0.75), 0xffffff),
    ]),
  );
  const fishCount = phone ? 28 : 64;
  const fish = new THREE.InstancedMesh(fishGeo, keep(new THREE.MeshLambertMaterial({ vertexColors: true })), fishCount);
  fish.frustumCulled = false;
  const fishColors = [0xffb347, 0x5ad1ff, 0xff6b8a, 0xfff06b, 0xbfeaff];
  for (let i = 0; i < fishCount; i++) fish.setColorAt(i, c.setHex(fishColors[i % fishColors.length]!));
  if (fish.instanceColor) fish.instanceColor.needsUpdate = true;
  group.add(fish);
  const schools: { x: number; y: number; z: number; r: number }[] = [];
  for (let s = 0; s < t.length && schools.length < 6; s += 37) {
    const side = schools.length % 2 ? 1 : -1;
    const p = pointAt(t, s, side * (t.wall + 6));
    if (p.y > water - 5) continue;
    schools.push({ x: p.x, y: p.y + 3.5, z: p.z, r: 6 + schools.length * 1.5 });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const bubbles = drifting(ctx, { count: 120, color: 0xdff6ff, size: 0.18, opacity: 0.6, box: [60, 16, 60], vx: 0, vy: 1.6 });
  return (time, camera) => {
    const below = camera.y < water;
    if (below) bubbles(time, camera);
    fish.visible = schools.length > 0;
    if (schools.length > 0) {
      for (let i = 0; i < fishCount; i++) {
        const school = schools[i % schools.length]!;
        const a = time * 0.55 + (i / fishCount) * 18 + (i % 3) * 0.3;
        const rr = school.r + Math.sin(i * 1.7) * 2.4;
        v.set(school.x + Math.cos(a) * rr, school.y + Math.sin(i * 2.3 + time) * 1.2, school.z + Math.sin(a) * rr);
        q.setFromEuler(e.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), Math.sin(time * 6 + i) * 0.2));
        fish.setMatrixAt(i, m4.compose(v, q, one));
      }
      fish.instanceMatrix.needsUpdate = true;
    }
    shaftMat.opacity = below ? 0.09 + Math.sin(time * 0.7) * 0.03 : 0.02;
    for (const s of shafts) s.rotation.y = Math.sin(time * 0.2) * 0.2;
  };
}

// -------------------------------------------------------------------------------------------------------------------
// Le volcan
// -------------------------------------------------------------------------------------------------------------------

/** Des colonnes de fumée : de grosses bouffées qui montent lentement */
function smokeColumn(ctx: BiomeContext, x: number, y: number, z: number, size: number): BiomeUpdate {
  const { group, keep } = ctx;
  const tex = keep(TX.cloudTexture(13));
  const puffs: THREE.Sprite[] = [];
  const n = ctx.phone ? 5 : 9;
  for (let i = 0; i < n; i++) {
    const mat = keep(new THREE.SpriteMaterial({ map: tex, color: 0x3a3238, transparent: true, depthWrite: false, opacity: 0.8 }));
    const s = new THREE.Sprite(mat);
    group.add(s);
    puffs.push(s);
  }
  return (time) => {
    puffs.forEach((s, i) => {
      const u = (time * 0.05 + i / n) % 1;
      s.position.set(x + Math.sin(u * 5 + i) * size * 0.4, y + u * size * 3.4, z + Math.cos(u * 4 + i) * size * 0.3);
      s.scale.setScalar(size * (0.7 + u * 1.5));
      s.material.opacity = 0.75 * Math.sin(Math.PI * u) ** 0.7;
    });
  };
}

export function buildVolcan(ctx: BiomeContext): BiomeUpdate {
  const { group, keep, heightAt, shadows, scatter, r, few, t } = ctx;
  // Les aiguilles de roche noire
  const rock = keep(new THREE.DodecahedronGeometry(1, 0));
  const rockMat = keep(new THREE.MeshLambertMaterial({ color: 0x2b2729, flatShading: true }));
  const rocks: THREE.Matrix4[] = [];
  for (const [x, z] of scatter(Math.round(150 * few), t.wall + 2, 160, (x, z) => heightAt(x, z) > -1)) {
    const s = 1.4 + r() * 4.5;
    rocks.push(place(x, heightAt(x, z) + s * 0.35, z, r() * 6, s, s * (0.9 + r() * 2.2), s * 1.1));
  }
  group.add(instances(rock, rockMat, rocks, shadows));
  // Des lampes le long de la route : on y voit, et elles rythment la vitesse
  const pole = keep(new THREE.CylinderGeometry(0.12, 0.16, 5.5, 6));
  const head = keep(new THREE.SphereGeometry(0.42, 10, 8));
  const poles: THREE.Matrix4[] = [];
  const heads: THREE.Matrix4[] = [];
  for (let s = 6; s < t.length; s += 34) {
    if (t.gaps.some((g) => s > g.from - 10 && s < g.to + 10)) continue;
    const side = Math.round(s / 34) % 2 ? 1 : -1;
    const p = pointAt(t, s, side * (t.wall - 0.8));
    poles.push(place(p.x, p.y + 2.75, p.z));
    heads.push(place(p.x, p.y + 5.7, p.z));
  }
  group.add(instances(pole, keep(new THREE.MeshLambertMaterial({ color: 0x3a3438 })), poles, false));
  group.add(instances(head, keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.35, 0.55) })), heads, false));
  // Le grand cratère, à l'horizon, et sa lueur
  const crater = new THREE.Group();
  const cone = new THREE.ConeGeometry(1, 1, 22, 8, true);
  const p = cone.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const cc = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.5;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const n = fbm(Math.cos(a) * 3 + y * 3, Math.sin(a) * 3 + y * 2, 3);
    const k = 1 + (n - 0.5) * 0.3;
    p.setXYZ(
      i,
      p.getX(i) * k + (y > 0.9 ? p.getX(i) * 0.5 : 0),
      Math.min(0.42, p.getY(i)),
      p.getZ(i) * k + (y > 0.9 ? p.getZ(i) * 0.5 : 0),
    );
    // Les coulées de lave descendent depuis le sommet
    const flow = Math.pow(Math.max(0, Math.sin(a * 7 + n * 4)), 8) * y * y;
    cc.setRGB(0.09 + flow * 2.6, 0.075 + flow * 0.8, 0.08 + flow * 0.1);
    colors.set([cc.r, cc.g, cc.b], i * 3);
  }
  cone.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  cone.computeVertexNormals();
  keep(cone);
  const craterMesh = new THREE.Mesh(cone, keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  crater.add(craterMesh);
  // Le centre du circuit
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < t.n; i++) {
    cx += t.x[i]!;
    cz += t.z[i]!;
  }
  cx /= t.n;
  cz /= t.n;
  const far = 720;
  const px = cx + 0.55 * far;
  const pz = cz + 0.83 * far;
  craterMesh.scale.set(290, 320, 290);
  craterMesh.position.set(px, 140, pz);
  group.add(crater);
  const glow = new THREE.Sprite(
    keep(
      new THREE.SpriteMaterial({
        map: keep(TX.sparkTexture()),
        color: new THREE.Color(2.4, 0.8, 0.25),
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  glow.position.set(px, 290, pz);
  glow.scale.setScalar(150);
  group.add(glow);
  const smoke = smokeColumn(ctx, px, 300, pz, 110);
  const embers = drifting(ctx, {
    count: 360,
    color: 0xff8a3a,
    size: 0.2,
    opacity: 0.95,
    box: [70, 26, 70],
    vx: 1.2,
    vy: 2.6,
    additive: true,
  });
  return (time, camera) => {
    embers(time, camera);
    smoke(time, camera);
    (glow.material as THREE.SpriteMaterial).opacity = 0.5 + Math.sin(time * 1.3) * 0.15;
  };
}
