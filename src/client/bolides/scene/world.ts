// Le monde autour de la course : la route, ses vibreurs et ses murets, le terrain qui épouse le relief, l'arche
// d'arrivée, les accélérateurs, les tremplins, et le décor de chaque circuit (le port, les vignes, le col).

import * as THREE from "three";
import { RAMP_H, RAMP_LEN } from "../../../shared/games/bolides/physics.ts";
import { pointAt, STEP, type Track } from "../../../shared/games/bolides/track.ts";
import { addBendDressing, addFlags, addGrandstand, addWallBoards, type DecorContext } from "./decor.ts";
import { Sky, SKY_COLORS } from "./sky.ts";
import * as TX from "./textures.ts";

/** Ce que le reste de la scène doit savoir du monde construit */
export interface World {
  group: THREE.Group;
  /** Le ciel, qui suit la caméra */
  dome: THREE.Group;
  /** La hauteur du sol à cet endroit */
  heightAt: (x: number, z: number) => number;
  /** À appeler à chaque image, une fois la caméra placée (l'eau, les accélérateurs, les drapeaux, le ciel) */
  update: (t: number, camera: THREE.Vector3) => void;
  /** La couleur de l'horizon (le fond et le brouillard) */
  sky: THREE.Color;
  fog: THREE.Fog;
  dispose: () => void;
}

/** D'où vient la lumière du soleil (la scène place sa lumière ainsi) */
export const SUN_DIR = new THREE.Vector3(50, 110, 30).normalize();

/** Un hasard qui donne toujours le même décor */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1000003) / 1000003;
  };
}

/**
 * Une grille au sol, une case tous les 4 m : la distance au milieu de la route la plus proche et la hauteur de la
 * route à cet endroit. Chaque échantillon de route marque les cases autour de lui, c'est rapide.
 */
class Field {
  readonly cell = 4;
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  readonly dist: Float32Array;
  readonly road: Float32Array;

  constructor(t: Track, margin: number) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < t.n; i++) {
      minX = Math.min(minX, t.x[i]!);
      maxX = Math.max(maxX, t.x[i]!);
      minZ = Math.min(minZ, t.z[i]!);
      maxZ = Math.max(maxZ, t.z[i]!);
    }
    this.x0 = minX - margin;
    this.z0 = minZ - margin;
    this.nx = Math.ceil((maxX - minX + 2 * margin) / this.cell) + 1;
    this.nz = Math.ceil((maxZ - minZ + 2 * margin) / this.cell) + 1;
    this.dist = new Float32Array(this.nx * this.nz).fill(1e9);
    this.road = new Float32Array(this.nx * this.nz);
    const reach = 110;
    const r = Math.ceil(reach / this.cell);
    for (let i = 0; i < t.n; i++) {
      const cx = Math.round((t.x[i]! - this.x0) / this.cell);
      const cz = Math.round((t.z[i]! - this.z0) / this.cell);
      for (let dz = -r; dz <= r; dz++) {
        const gz = cz + dz;
        if (gz < 0 || gz >= this.nz) continue;
        for (let dx = -r; dx <= r; dx++) {
          const gx = cx + dx;
          if (gx < 0 || gx >= this.nx) continue;
          const px = this.x0 + gx * this.cell;
          const pz = this.z0 + gz * this.cell;
          const d = Math.hypot(px - t.x[i]!, pz - t.z[i]!);
          const k = gz * this.nx + gx;
          if (d < this.dist[k]!) {
            this.dist[k] = d;
            this.road[k] = t.y[i]!;
          }
        }
      }
    }
  }

  private sample(arr: Float32Array, x: number, z: number, fallback: number): number {
    const fx = (x - this.x0) / this.cell;
    const fz = (z - this.z0) / this.cell;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= this.nx - 1 || iz >= this.nz - 1) return fallback;
    const u = fx - ix;
    const v = fz - iz;
    const a = arr[iz * this.nx + ix]!;
    const b = arr[iz * this.nx + ix + 1]!;
    const c = arr[(iz + 1) * this.nx + ix]!;
    const d = arr[(iz + 1) * this.nx + ix + 1]!;
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  distAt(x: number, z: number): number {
    return this.sample(this.dist, x, z, 1e9);
  }

  roadAt(x: number, z: number): number {
    return this.sample(this.road, x, z, 0);
  }
}

/** Un ruban le long de la route, entre deux écarts au milieu (d1 < d2), à une hauteur au-dessus de la route */
function ribbon(t: Track, d1: number, d2: number, lift: number, vScale: number, uSpan = 1): THREE.BufferGeometry {
  const n = t.n;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const uv = new Float32Array((n + 1) * 2 * 2);
  const step = t.length / n;
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const rx = -t.tz[k]!;
    const rz = t.tx[k]!;
    const y = t.y[k]! + lift;
    pos.set([t.x[k]! + rx * d1, y, t.z[k]! + rz * d1, t.x[k]! + rx * d2, y, t.z[k]! + rz * d2], i * 6);
    uv.set([0, (i * step) / vScale, uSpan, (i * step) / vScale], i * 4);
  }
  // Dans ce sens, les triangles regardent vers le ciel (la droite de la route est du côté des x négatifs)
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Un muret debout le long de la route, à l'écart d, de la hauteur donnée */
function wallRibbon(t: Track, d: number, height: number, ground: (x: number, z: number) => number): THREE.BufferGeometry {
  const n = t.n;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const uv = new Float32Array((n + 1) * 2 * 2);
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const x = t.x[k]! - t.tz[k]! * d;
    const z = t.z[k]! + t.tx[k]! * d;
    const y = Math.min(t.y[k]!, ground(x, z)) - 0.3;
    const top = Math.max(t.y[k]!, ground(x, z)) + height;
    pos.set([x, y, z, x, top, z], i * 6);
    const v = (i * (t.length / n)) / 6;
    uv.set([v, 0, v, 1], i * 4);
  }
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * Un tremplin : le dessus en pente de `RAMP_LEN` m, de la route jusqu'à `RAMP_H` m au bord (comme la conduite le
 * calcule), avec ses deux flancs et sa face avant
 */
function rampMesh(t: Track, lip: number, top: THREE.Material, side: THREE.Material, keep: Keep): THREE.Group {
  const g = new THREE.Group();
  const lift = 0.07;
  const w = t.half + 0.3;
  // Les points du bas et du haut, au début et au bord de la rampe, à gauche et à droite
  const at = (s: number, d: number, up: number) => {
    const p = pointAt(t, s, d);
    return new THREE.Vector3(p.x, p.y + lift + up, p.z);
  };
  const s0 = lip - RAMP_LEN;
  const a = at(s0, -w, 0);
  const b = at(s0, w, 0);
  const c = at(lip, -w, RAMP_H);
  const d = at(lip, w, RAMP_H);
  const cb = at(lip, -w, 0);
  const db = at(lip, w, 0);
  const tri = (pts: THREE.Vector3[], uvs: number[], mat: THREE.Material) => {
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        pts.flatMap((v) => [v.x, v.y, v.z]),
        3,
      ),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  // Le dessus : deux triangles qui regardent vers le ciel (la gauche de la route est du côté d négatif). Le haut de
  // la toile (v = 1) est au bord.
  const up = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(b, a)).y > 0;
  tri(up ? [a, c, b, b, c, d] : [a, b, c, b, d, c], up ? [0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1] : [0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1], top);
  // Les flancs et la face avant (une matière vue des deux côtés, sans texture)
  const noUv = new Array(12).fill(0);
  tri([a, cb, c, b, db, d], noUv, side);
  tri([cb, db, c, db, d, c], noUv, side);
  return g;
}

function lambert(color: number | string, map?: THREE.Texture): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, map: map ?? null });
}

/** Plusieurs exemplaires d'un même objet (arbres, rangs de vigne…), posés d'un coup */
function instances(geo: THREE.BufferGeometry, mat: THREE.Material, spots: THREE.Matrix4[], shadows: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  spots.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = spots.length;
  mesh.castShadow = shadows;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function place(x: number, y: number, z: number, rot = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
    new THREE.Vector3(sx, sy, sz),
  );
  return m;
}

export function buildWorld(t: Track, opts: { phone: boolean; shadows: boolean }): World {
  const theme = t.def.theme;
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const sky = keep(new Sky(theme, SUN_DIR, opts.phone));
  const field = new Field(t, 170);
  const hilly = t.def.hills.some(([, y]) => y !== 0);

  // Le sol : il épouse la route près d'elle, puis redescend doucement à plat
  const heightAt = (x: number, z: number): number => {
    if (!hilly) return 0;
    const d = field.distAt(x, z);
    const road = field.roadAt(x, z);
    const near = t.wall + 2;
    if (d <= near) return road - (d < t.half ? 0.3 : 0.08);
    const f = Math.max(0, 1 - (d - near) / 80);
    return (road - 0.08) * f * f * (3 - 2 * f);
  };

  const groundTex = keep(TX.groundTexture(theme));
  groundTex.repeat.set(1, 1);
  const groundMat = keep(lambert(0xffffff, groundTex));
  // Le terrain proche, en relief, puis une grande plaine jusqu'à l'horizon
  {
    const w = (field.nx - 1) * field.cell;
    const h = (field.nz - 1) * field.cell;
    const seg = opts.phone ? 2 : 1;
    const geo = keep(new THREE.PlaneGeometry(w, h, Math.floor((field.nx - 1) / seg), Math.floor((field.nz - 1) / seg)));
    geo.rotateX(-Math.PI / 2);
    geo.translate(field.x0 + w / 2, 0, field.z0 + h / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, heightAt(x, z) - 0.02);
      uv.setXY(i, x / 18, z / 18);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, groundMat);
    mesh.receiveShadow = opts.shadows;
    group.add(mesh);
    const far = keep(new THREE.PlaneGeometry(3000, 3000));
    far.rotateX(-Math.PI / 2);
    const farUv = far.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < farUv.count; i++) farUv.setXY(i, farUv.getX(i) * 166, farUv.getY(i) * 166);
    const plain = new THREE.Mesh(far, groundMat);
    plain.position.y = -0.12;
    group.add(plain);
  }

  // La route, ses vibreurs, l'herbe du bord, le muret
  const roadTex = keep(TX.roadTexture(theme));
  const road = new THREE.Mesh(keep(ribbon(t, -t.half, t.half, 0.06, 8)), keep(lambert(0xffffff, roadTex)));
  road.receiveShadow = opts.shadows;
  group.add(road);
  const curbTex = keep(TX.curbTexture());
  const curbMat = keep(lambert(0xffffff, curbTex));
  for (const side of [-1, 1]) {
    const a = side * t.half;
    const b = side * (t.half + 1.2);
    group.add(new THREE.Mesh(keep(ribbon(t, Math.min(a, b), Math.max(a, b), 0.075, 3)), curbMat));
  }
  const wallTex = keep(TX.wallTexture(theme));
  const wallMat = keep(new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide }));
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(keep(wallRibbon(t, side * (t.wall + 0.4), theme === "col" ? 1.1 : 0.9, heightAt)), wallMat);
    wall.castShadow = false;
    group.add(wall);
  }

  // La ligne d'arrivée : le damier au sol et l'arche
  {
    const p = pointAt(t, 0, 0);
    const h = Math.atan2(p.tx, p.tz);
    const checker = keep(TX.checkerTexture());
    checker.repeat.set(t.def.width / 2, 1);
    const line = new THREE.Mesh(keep(new THREE.PlaneGeometry(t.def.width, 2)), keep(lambert(0xffffff, checker)));
    // Couché au sol, sa largeur en travers de la route
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = h + Math.PI;
    line.position.set(p.x, p.y + 0.08, p.z);
    group.add(line);
    const arch = new THREE.Group();
    const postMat = keep(lambert(0x2b2f36));
    const postGeo = keep(new THREE.BoxGeometry(0.7, 6.4, 0.7));
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(side * (t.half + 2), 3.2, 0);
      post.castShadow = opts.shadows;
      arch.add(post);
    }
    const banner = keep(TX.bannerTexture("BOLIDES", "#d8352a", "#fff6e2"));
    const bannerMat = keep(lambert(0xffffff, banner));
    const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(t.def.width + 4.7, 1.5, 0.5)), [
      postMat,
      postMat,
      postMat,
      postMat,
      bannerMat,
      bannerMat,
    ]);
    beam.position.y = 5.8;
    arch.add(beam);
    // En travers de la route : son axe x local suit la droite de la route (-cos h, sin h), la banderole fait face aux karts
    arch.position.set(p.x, p.y, p.z);
    arch.rotation.y = h + Math.PI;
    group.add(arch);
  }

  // Les accélérateurs : des chevrons qui défilent
  const boostTex = keep(TX.boostTexture());
  const boostMat = keep(new THREE.MeshBasicMaterial({ map: boostTex }));
  for (const pad of t.boosts) {
    const p = pointAt(t, pad.s + pad.length / 2, pad.d);
    const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(pad.halfWidth * 2, pad.length)), boostMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.atan2(p.tx, p.tz) + Math.PI;
    mesh.position.set(p.x, p.y + 0.09, p.z);
    group.add(mesh);
  }

  // Les tremplins : une rampe en planches sur toute la largeur de la route, qui monte jusqu'au bord
  {
    const top = keep(lambert(0xffffff, keep(TX.rampTexture())));
    const sideMat = keep(new THREE.MeshLambertMaterial({ color: 0x6b4a2e, side: THREE.DoubleSide }));
    for (const lip of t.jumps) {
      group.add(rampMesh(t, lip, top, sideMat, keep));
    }
  }

  // Le décor
  const r = rng(t.n * 31 + t.def.width);
  // Au port, l'eau commence au quai, le long de la ligne droite
  const quay = -t.wall - 9;
  const free = (x: number, z: number, min: number) => field.distAt(x, z) > min && (theme !== "port" || z > quay + 5);
  const scatter = (count: number, min: number, max: number, test?: (x: number, z: number) => boolean) => {
    const out: [number, number][] = [];
    const w = (field.nx - 1) * field.cell;
    const h = (field.nz - 1) * field.cell;
    for (let tries = 0; tries < count * 12 && out.length < count; tries++) {
      const x = field.x0 + r() * w;
      const z = field.z0 + r() * h;
      const d = field.distAt(x, z);
      if (d < min || d > max) continue;
      if (test && !test(x, z)) continue;
      out.push([x, z]);
    }
    return out;
  };
  const shadows = opts.shadows;
  const few = opts.phone ? 0.55 : 1;
  /** Ce qui flotte doucement dans le ciel (les montgolfières) */
  const floaters: THREE.Object3D[] = [];

  // L'habillage de la piste : panneaux de virage, pneus, panneaux, drapeaux, tribune, grille
  const ctx: DecorContext = { group, t, keep, heightAt, shadows, free };
  addBendDressing(ctx);
  addWallBoards(ctx);
  const waveFlags = addFlags(ctx);
  addGrandstand(ctx);

  // Des montagnes ou des collines tout autour, pour l'horizon
  {
    const cx = field.x0 + ((field.nx - 1) * field.cell) / 2;
    const cz = field.z0 + ((field.nz - 1) * field.cell) / 2;
    const geo = keep(new THREE.ConeGeometry(1, 1, 7, 1));
    const mat = keep(lambert(theme === "col" ? 0x8c98a8 : theme === "vignes" ? 0x7f9a62 : 0x6f8f6a));
    const capMat = keep(lambert(0xf5f8fb));
    const spots: THREE.Matrix4[] = [];
    const caps: THREE.Matrix4[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2;
      const dist = 520 + r() * 160;
      const hgt = (theme === "col" ? 140 : theme === "vignes" ? 50 : 40) * (0.6 + r() * 0.8);
      const wid = hgt * (theme === "col" ? 1.1 : 2.6) + 60;
      const x = cx + Math.cos(a) * dist;
      const z = cz + Math.sin(a) * dist;
      spots.push(place(x, hgt / 2 - 2, z, r() * 3, wid, hgt, wid));
      if (theme === "col") caps.push(place(x, hgt * 0.85 - 2, z, 0, wid * 0.32, hgt * 0.32, wid * 0.32));
    }
    group.add(instances(geo, mat, spots, false));
    if (caps.length > 0) {
      const cap = instances(geo, capMat, caps, false);
      group.add(cap);
    }
  }

  let waterTex: THREE.CanvasTexture | null = null;
  if (theme === "port") {
    // L'eau, au-delà du quai qui longe la ligne droite
    waterTex = keep(TX.waterTexture());
    waterTex.repeat.set(60, 30);
    const water = new THREE.Mesh(keep(new THREE.PlaneGeometry(3000, 1500)), keep(lambert(0xffffff, waterTex)));
    water.rotation.x = -Math.PI / 2;
    // Juste au-dessus du sol, qu'elle recouvre de ce côté du quai
    water.position.set(0, 0.04, quay - 750);
    group.add(water);
    const edge = new THREE.Mesh(keep(new THREE.BoxGeometry(3000, 1.2, 1.6)), keep(lambert(0x9a958c)));
    edge.position.set(0, -0.1, quay);
    group.add(edge);
    // Les bateaux sur l'eau : une coque pointue à l'avant, une bande de couleur, une cabine, un mât
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-0.5, -0.5);
    hullShape.lineTo(0.5, -0.5);
    hullShape.lineTo(0.5, 0.2);
    hullShape.quadraticCurveTo(0.45, 0.42, 0, 0.5);
    hullShape.quadraticCurveTo(-0.45, 0.42, -0.5, 0.2);
    hullShape.closePath();
    const hull = keep(new THREE.ExtrudeGeometry(hullShape, { depth: 1, bevelEnabled: false, curveSegments: 6 }));
    // Couchée : la forme dans le plan (x, z), la hauteur le long de y (de 0 à 1)
    hull.rotateX(Math.PI / 2);
    hull.translate(0, 1, 0);
    const boatBox = keep(new THREE.BoxGeometry(1, 1, 1));
    const mast = keep(new THREE.CylinderGeometry(0.06, 0.08, 1, 5));
    const hulls: THREE.Matrix4[] = [];
    const bands: THREE.Matrix4[] = [];
    const cabins: THREE.Matrix4[] = [];
    const masts: THREE.Matrix4[] = [];
    for (let i = 0; i < 14; i++) {
      const x = -260 + r() * 520;
      const z = quay - 14 - r() * 90;
      const len = 8 + r() * 14;
      const rot = r() * Math.PI * 2;
      hulls.push(place(x, -0.6, z, rot, len * 0.36, 1.9, len));
      bands.push(place(x, 0.95, z, rot, len * 0.365, 0.35, len * 1.005));
      const off = -len * 0.12;
      cabins.push(place(x + Math.sin(rot) * off, 1.9, z + Math.cos(rot) * off, rot, len * 0.24, 1.5, len * 0.3));
      if (i % 2 === 0) masts.push(place(x, 1.3 + len * 0.35, z, 0, 1, len * 0.7, 1));
    }
    group.add(instances(hull, keep(lambert(0xf2eee6)), hulls, false));
    group.add(instances(hull, keep(lambert(0x2f5d8a)), bands, false));
    group.add(instances(boatBox, keep(lambert(0xffffff)), cabins, false));
    group.add(instances(mast, keep(lambert(0xc9c2b4)), masts, false));
    // Les grues du quai
    const crane = new THREE.Group();
    const steel = keep(lambert(0xe0a32e));
    for (let i = 0; i < 4; i++) {
      const x = -90 + i * 70;
      const legGeo = keep(new THREE.BoxGeometry(0.8, 18, 0.8));
      for (const [dx, dz] of [
        [-3, -3],
        [3, -3],
        [-3, 3],
        [3, 3],
      ]) {
        const leg = new THREE.Mesh(legGeo, steel);
        leg.position.set(x + dx!, 9, quay + 2 + dz!);
        crane.add(leg);
      }
      const arm = new THREE.Mesh(keep(new THREE.BoxGeometry(1.2, 1.4, 34)), steel);
      arm.position.set(x, 18.5, quay - 6);
      crane.add(arm);
    }
    group.add(crane);
    // Les conteneurs empilés et les maisons du port, à l'intérieur du circuit
    const box = keep(new THREE.BoxGeometry(1, 1, 1));
    const containerTex = keep(TX.containerTexture());
    const colors = [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910, 0x7d3c98, 0x5d6d7e];
    const byColor = colors.map(() => [] as THREE.Matrix4[]);
    const pads: THREE.Matrix4[] = [];
    for (const [x, z] of scatter(Math.round(10 * few), t.wall + 14, 75, (_x, cz) => cz > quay + 10)) {
      // Un parc : des rangées de piles alignées, sur une dalle de béton
      const rot = Math.round(r() * 2) * (Math.PI / 2);
      const rows = 2 + Math.floor(r() * 2);
      const cols = 3 + Math.floor(r() * 4);
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
      let placed = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const lx = (col - (cols - 1) / 2) * 2.9;
          const lz = (row - (rows - 1) / 2) * 6.8;
          const ox = x + lx * ca + lz * sa;
          const oz = z - lx * sa + lz * ca;
          if (!free(ox, oz, t.wall + 6)) continue;
          placed++;
          const stack = 1 + Math.floor(r() * 3);
          for (let k = 0; k < stack; k++) byColor[Math.floor(r() * colors.length)]!.push(place(ox, 1.3 + k * 2.6, oz, rot, 2.4, 2.6, 6));
        }
      }
      if (placed > 0) pads.push(place(x, 0.03, z, rot, cols * 2.9 + 3, 0.1, rows * 6.8 + 3));
    }
    byColor.forEach((spots, i) => group.add(instances(box, keep(lambert(colors[i]!, containerTex)), spots, shadows)));
    group.add(instances(box, keep(lambert(0x9d9b94)), pads, false));
    addHouses(
      group,
      scatter(Math.round(26 * few), 30, 140, (_x, z) => z > quay + 10),
      r,
      keep,
      shadows,
      [0xf2e2c4, 0xe8c7a0, 0xd9e6f2, 0xf5d0c5],
    );
    // Le phare au bout de la jetée
    const tower = new THREE.Mesh(keep(new THREE.CylinderGeometry(2, 2.8, 22, 12)), keep(lambert(0xf4f1ea)));
    tower.position.set(170, 11, quay - 40);
    group.add(tower);
    const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(2.15, 2.45, 4, 12)), keep(lambert(0xd8352a)));
    band.position.set(170, 14, quay - 40);
    group.add(band);
    // Des réverbères le long de la ligne droite
    addLamps(group, t, keep, shadows);
  } else if (theme === "vignes") {
    // Les rangs de vigne, par parcelles
    const row = keep(new THREE.BoxGeometry(1, 1, 1));
    const rows: THREE.Matrix4[] = [];
    for (const [x, z] of scatter(Math.round(36 * few), t.wall + 8, 150)) {
      const rot = r() * Math.PI;
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
      for (let k = -4; k <= 4; k++) {
        const ox = x + ca * k * 3;
        const oz = z - sa * k * 3;
        if (!free(ox, oz, t.wall + 4)) continue;
        rows.push(place(ox, heightAt(ox, oz) + 0.7, oz, rot, 0.9, 1.4, 22));
      }
    }
    group.add(instances(row, keep(lambert(0x3f6b2a)), rows, shadows));
    // Les cyprès et les arbres ronds
    const cone = keep(new THREE.ConeGeometry(1, 1, 7));
    const ball = keep(new THREE.IcosahedronGeometry(1, 1));
    const trunk = keep(new THREE.CylinderGeometry(0.25, 0.35, 1, 6));
    const cypress: THREE.Matrix4[] = [];
    const balls: THREE.Matrix4[] = [];
    const trunks: THREE.Matrix4[] = [];
    for (const [x, z] of scatter(Math.round(90 * few), t.wall + 3, 160)) {
      const y = heightAt(x, z);
      if (r() < 0.5) cypress.push(place(x, y + 4.5, z, 0, 1.3, 9 + r() * 4, 1.3));
      else {
        const s = 2.2 + r() * 1.6;
        balls.push(place(x, y + 2.4 + s * 0.6, z, r() * 3, s, s * 0.9, s));
        trunks.push(place(x, y + 1.2, z, 0, 1, 2.4, 1));
      }
    }
    group.add(instances(cone, keep(lambert(0x2f5a2c)), cypress, shadows));
    group.add(instances(ball, keep(lambert(0x5a8a3a)), balls, shadows));
    group.add(instances(trunk, keep(lambert(0x6b4a2b)), trunks, false));
    // Le château, en haut de la colline
    let top = 0;
    for (let i = 1; i < t.n; i++) if (t.y[i]! > t.y[top]!) top = i;
    const side = pointAt(t, top * STEP, -t.wall - 26);
    addChateau(group, side.x, heightAt(side.x, side.z), side.z, keep, shadows);
    // Des tonneaux au bord de la route
    const barrel = keep(new THREE.CylinderGeometry(0.7, 0.7, 1.3, 10));
    const barrels: THREE.Matrix4[] = [];
    for (const [x, z] of scatter(Math.round(40 * few), t.wall + 1.5, t.wall + 6)) barrels.push(place(x, heightAt(x, z) + 0.65, z, r() * 3));
    group.add(instances(barrel, keep(lambert(0x7a4b28)), barrels, shadows));
    addHouses(group, scatter(Math.round(10 * few), 40, 160), r, keep, shadows, [0xf3e1c3, 0xe9d2a8], heightAt);
    // Des montgolfières qui dérivent au loin
    const stripes = [
      ["#d8352a", "#f2c94c"],
      ["#2f80ed", "#ffffff"],
      ["#27ae60", "#f2994a"],
    ];
    stripes.forEach(([a, b], i) => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 16;
      const g = c.getContext("2d")!;
      for (let k = 0; k < 8; k++) {
        g.fillStyle = k % 2 === 0 ? a! : b!;
        g.fillRect(k * 16, 0, 16, 16);
      }
      const tex = keep(new THREE.CanvasTexture(c));
      tex.colorSpace = THREE.SRGBColorSpace;
      const balloon = new THREE.Group();
      const env = new THREE.Mesh(keep(new THREE.SphereGeometry(7, 16, 12)), keep(lambert(0xffffff, tex)));
      env.scale.set(1, 1.2, 1);
      balloon.add(env);
      const basket = new THREE.Mesh(keep(new THREE.BoxGeometry(2.2, 1.6, 2.2)), keep(lambert(0x7a5230)));
      basket.position.y = -11.5;
      balloon.add(basket);
      const a0 = (i / 3) * Math.PI * 2 + 0.6;
      const cx = field.x0 + ((field.nx - 1) * field.cell) / 2;
      const cz = field.z0 + ((field.nz - 1) * field.cell) / 2;
      balloon.position.set(cx + Math.cos(a0) * (230 + i * 50), 70 + i * 22, cz + Math.sin(a0) * (230 + i * 50));
      balloon.userData.base = balloon.position.clone();
      group.add(balloon);
      floaters.push(balloon);
    });
  } else {
    // Les sapins enneigés
    const cone = keep(new THREE.ConeGeometry(1, 1, 7));
    const pines: THREE.Matrix4[] = [];
    const snow: THREE.Matrix4[] = [];
    const trunks: THREE.Matrix4[] = [];
    const trunk = keep(new THREE.CylinderGeometry(0.3, 0.4, 1, 6));
    for (const [x, z] of scatter(Math.round(180 * few), t.wall + 3, 170)) {
      const y = heightAt(x, z);
      const s = 2.2 + r() * 1.8;
      const h = s * 3.4;
      pines.push(place(x, y + 1.2 + h / 2, z, r() * 3, s, h, s));
      snow.push(place(x, y + 1.2 + h * 0.8, z, r() * 3, s * 0.5, h * 0.4, s * 0.5));
      trunks.push(place(x, y + 0.6, z, 0, 1, 1.2, 1));
    }
    group.add(instances(cone, keep(lambert(0x24502f)), pines, shadows));
    group.add(instances(cone, keep(lambert(0xf6f9fc)), snow, false));
    group.add(instances(trunk, keep(lambert(0x5b4030)), trunks, false));
    // Les rochers
    const rock = keep(new THREE.DodecahedronGeometry(1, 0));
    const rocks: THREE.Matrix4[] = [];
    for (const [x, z] of scatter(Math.round(50 * few), t.wall + 2, 120)) {
      const s = 1 + r() * 2.6;
      rocks.push(place(x, heightAt(x, z) + s * 0.4, z, r() * 3, s, s * 0.7, s * 1.2));
    }
    group.add(instances(rock, keep(lambert(0x8a8d93)), rocks, shadows));
    // Les chalets du village
    addHouses(group, scatter(Math.round(14 * few), 28, 120), r, keep, shadows, [0x8a5a33, 0x9c6a3f], heightAt, 0xf4f7fa);
    // Des bonshommes de neige au bord de la route, avec leur nez en carotte
    const snowBall = keep(new THREE.SphereGeometry(1, 12, 10));
    const snowMat = keep(lambert(0xffffff));
    const carrot = keep(new THREE.ConeGeometry(0.12, 0.6, 6));
    carrot.rotateX(Math.PI / 2);
    const carrotMat = keep(lambert(0xf2803a));
    const coal = keep(lambert(0x222428));
    for (const [x, z] of scatter(8, t.wall + 3, t.wall + 12)) {
      const y = heightAt(x, z);
      const man = new THREE.Group();
      for (const [ry, rr] of [
        [0.75, 0.8],
        [1.85, 0.58],
        [2.7, 0.42],
      ] as const) {
        const ball = new THREE.Mesh(snowBall, snowMat);
        ball.position.y = ry;
        ball.scale.setScalar(rr);
        ball.castShadow = shadows;
        man.add(ball);
      }
      const nose = new THREE.Mesh(carrot, carrotMat);
      nose.position.set(0, 2.72, 0.5);
      man.add(nose);
      for (const ex of [-0.15, 0.15]) {
        const eye = new THREE.Mesh(snowBall, coal);
        eye.scale.setScalar(0.06);
        eye.position.set(ex, 2.85, 0.37);
        man.add(eye);
      }
      man.rotation.y = r() * Math.PI * 2;
      man.position.set(x, y, z);
      group.add(man);
    }
  }

  const horizon = SKY_COLORS[theme].horizon;
  return {
    group,
    dome: sky.group,
    heightAt,
    sky: new THREE.Color(horizon),
    fog: new THREE.Fog(horizon, 230, 1050),
    update(time: number, camera: THREE.Vector3) {
      boostTex.offset.y = -((time * 1.6) % 1);
      if (waterTex) waterTex.offset.set((time * 0.01) % 1, (time * 0.02) % 1);
      waveFlags(time);
      sky.update(camera, time);
      floaters.forEach((f, i) => {
        const base = f.userData.base as THREE.Vector3;
        f.position.set(
          base.x + Math.sin(time * 0.05 + i) * 30,
          base.y + Math.sin(time * 0.3 + i * 2) * 3,
          base.z + Math.cos(time * 0.04 + i) * 30,
        );
      });
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

type Keep = <T extends { dispose: () => void }>(x: T) => T;

/** Des maisons simples : un cube et un toit en pente */
function addHouses(
  group: THREE.Group,
  spots: [number, number][],
  r: () => number,
  keep: Keep,
  shadows: boolean,
  walls: number[],
  heightAt: (x: number, z: number) => number = () => 0,
  roofColor = 0xb24a33,
) {
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const facade = keep(TX.houseTexture());
  const roof = keep(new THREE.ConeGeometry(0.75, 1, 4));
  roof.rotateY(Math.PI / 4);
  const byWall = walls.map(() => [] as THREE.Matrix4[]);
  const roofs: THREE.Matrix4[] = [];
  for (const [x, z] of spots) {
    const y = heightAt(x, z);
    const w = 6 + r() * 5;
    const d = 6 + r() * 5;
    const h = 4 + r() * 5;
    const rot = r() * Math.PI;
    byWall[Math.floor(r() * walls.length)]!.push(place(x, y + h / 2, z, rot, w, h, d));
    roofs.push(place(x, y + h + 1.6, z, rot, w * 1.25, 3.2, d * 1.25));
  }
  byWall.forEach((s, i) => group.add(instances(box, keep(lambert(walls[i]!, facade)), s, shadows)));
  group.add(instances(roof, keep(lambert(roofColor)), roofs, shadows));
}

/** Les réverbères le long de la ligne droite du port */
function addLamps(group: THREE.Group, t: Track, keep: Keep, shadows: boolean) {
  const pole = keep(new THREE.CylinderGeometry(0.12, 0.16, 6, 6));
  const head = keep(new THREE.BoxGeometry(0.6, 0.3, 1.4));
  const poles: THREE.Matrix4[] = [];
  const heads: THREE.Matrix4[] = [];
  for (let s = 10; s < 140; s += 22) {
    for (const side of [-1, 1]) {
      const p = pointAt(t, s, side * (t.wall - 1));
      poles.push(place(p.x, 3, p.z));
      const q = pointAt(t, s, side * (t.wall - 1.8));
      heads.push(place(q.x, 6, q.z, Math.atan2(p.tx, p.tz)));
    }
  }
  group.add(instances(pole, keep(lambert(0x3a3f47)), poles, shadows));
  group.add(instances(head, keep(lambert(0xfff2c2)), heads, false));
}

/** Le château des vignes : un corps de logis et deux tours */
function addChateau(group: THREE.Group, x: number, y: number, z: number, keep: Keep, shadows: boolean) {
  const stone = keep(lambert(0xe6d7b8));
  const slate = keep(lambert(0x4a5568));
  const g = new THREE.Group();
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(22, 10, 12)), stone);
  body.position.y = 5;
  g.add(body);
  const roof = new THREE.Mesh(keep(new THREE.ConeGeometry(14, 6, 4)), slate);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.1, 1, 0.62);
  roof.position.y = 13;
  g.add(roof);
  for (const dx of [-12, 12]) {
    const tower = new THREE.Mesh(keep(new THREE.CylinderGeometry(3, 3, 15, 12)), stone);
    tower.position.set(dx, 7.5, 0);
    g.add(tower);
    const cap = new THREE.Mesh(keep(new THREE.ConeGeometry(3.6, 6, 12)), slate);
    cap.position.set(dx, 18, 0);
    g.add(cap);
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = shadows;
  });
  g.position.set(x, y, z);
  group.add(g);
}
