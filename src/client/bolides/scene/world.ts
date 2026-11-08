// Le monde autour de la course : la route, ses vibreurs et ses murets, le terrain qui épouse le relief, l'arche
// d'arrivée, les accélérateurs, les tremplins, et le décor de chaque circuit (le port, les vignes, le col).

import * as THREE from "three";
import { RAMP_H, RAMP_LEN } from "../../../shared/games/bolides/physics.ts";
import { CURB, pointAt, STEP, type Track } from "../../../shared/games/bolides/track.ts";
import { buildDunes, buildLagon, buildVolcan, type BiomeContext, type BiomeUpdate } from "./biomes.ts";
import { addBendDressing, addFlags, addGrandstand, addWallBoards, type DecorContext } from "./decor.ts";
import { mergeDeep } from "./merge.ts";
import { buildScenery, PLACES } from "./scenery.ts";
import {
  addSurfaceLight,
  addGrass,
  addGroundShadows,
  addMountains,
  addRunoffs,
  addSkidMarks,
  cypressGeometry,
  fbm,
  foliageGeometry,
  gableGeometry,
  groundTint,
  lagoonMaterial,
  lavaMaterial,
  pineGeometry,
  pineSnowGeometry,
  seaMaterial,
} from "./nature.ts";
import { MOODS, Sky, type Mood } from "./sky.ts";
import * as TX from "./textures.ts";

/** Ce que le reste de la scène doit savoir du monde construit */
export interface World {
  group: THREE.Group;
  /** Le ciel, qui suit la caméra */
  dome: THREE.Group;
  /** La hauteur du sol à cet endroit */
  heightAt: (x: number, z: number) => number;
  /** À appeler à chaque image, une fois la caméra placée (l'eau, les accélérateurs, les drapeaux, le ciel) */
  update: (t: number, camera: THREE.Vector3, daylight: number) => void;
  /** L'ambiance du circuit (le soleil, la lumière) */
  mood: Mood;
  /** La couleur de l'horizon (le fond et le brouillard) */
  sky: THREE.Color;
  /** Les tunnels (de quelle à quelle distance du tour) : la lumière y baisse */
  tunnels: [number, number][];
  /** Les trois feux de départ sur l'arche (0 : éteints, 1 à 3 : autant de rouges, 4 : tous verts) */
  setLights: (n: number) => void;
  fog: THREE.Fog;
  dispose: () => void;
}

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
function ribbon(t: Track, d1: number, d2: number, lift: number, vScale: number, uSpan = 1, cuts: Track["gaps"] = []): THREE.BufferGeometry {
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
    // Pas de route au-dessus des trous
    if (cuts.some((c) => (i + 1) * step > c.from + 0.01 && i * step < c.to - 0.01)) continue;
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
    // La hauteur de l'image reste la même, même là où le muret descend au fond d'un trou
    uv.set([v, 1 - (top - y) / (height + 0.3), v, 1], i * 4);
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
  const w = t.half + CURB;
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

const WHITE = new THREE.Color(1, 1, 1);

/** Les feuillages : une facette par face, la lumière par sommet */
function foliage(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, vertexColors: true, flatShading: true });
}

/** Chaque arbre sa nuance */
function tintInstances(mesh: THREE.InstancedMesh, r: () => number, colors: number[]) {
  const c = new THREE.Color();
  (mesh.material as THREE.MeshLambertMaterial).color.setHex(0xffffff);
  for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, c.setHex(colors[Math.floor(r() * colors.length)]!));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

/** Le monde d'un circuit, construit par morceaux : `pause` rend la main entre deux (`share` : où on en est, de 0 à 1) */
export async function buildWorld(
  t: Track,
  opts: { phone: boolean; shadows: boolean; anisotropy: number },
  pause: (share: number) => Promise<void>,
): Promise<World> {
  const theme = t.def.theme;
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const mood = MOODS[theme];
  const sky = keep(new Sky(theme, opts.phone));
  const field = new Field(t, 170);
  const hilly = t.def.hills.some(([, y]) => y !== 0);

  // Sous chaque trou, le sol plonge
  const pits = t.gaps.map((g) => ({ ...pointAt(t, (g.from + g.to) / 2, 0), half: (g.to - g.from) / 2 + 4, glide: g.glide }));
  const pitAt = (x: number, z: number) =>
    pits.find((p) => {
      const along = (x - p.x) * p.tx + (z - p.z) * p.tz;
      const side = -(x - p.x) * p.tz + (z - p.z) * p.tx;
      return Math.abs(along) < p.half && Math.abs(side) < t.wall + 3;
    });

  // Le sol au loin : plat, ou des dunes, le fond de la mer et ses îles, la roche au-dessus de la lave. Il rejoint la
  // plaine (plainY) au bord du terrain, pour ne pas laisser de marche
  const plainY = theme === "lagon" ? -7 : theme === "volcan" ? -2.6 : 0;
  const farGround = (x: number, z: number, away: number): number => {
    const edge = Math.min(
      x - field.x0,
      field.x0 + (field.nx - 1) * field.cell - x,
      z - field.z0,
      field.z0 + (field.nz - 1) * field.cell - z,
    );
    const keepShape = Math.max(0, Math.min(1, edge / 70));
    let h = plainY;
    if (theme === "dunes") {
      const ramp = Math.min(1, away / 50);
      const ridge = 1 - Math.abs(2 * fbm(x / 34 + 9, z / 52 - 3, 2) - 1);
      h = ramp * (fbm(x / 62 + 3, z / 62 - 5, 3) * 12 + ridge * ridge * 8 - 8);
    } else if (theme === "lagon") {
      const land = fbm(x / 110 + 7, z / 110 + 2, 3);
      const rise = Math.max(0, Math.min(1, (land - 0.56) / 0.14));
      h = plainY + rise * rise * 12;
    } else if (theme === "volcan") {
      h = plainY + Math.max(0, fbm(x / 70 + 1, z / 70 + 4, 3) - 0.44) * 26;
    } else if (theme === "vignes" || theme === "col") {
      // Des collines douces, qui donnent de la profondeur au décor
      const ramp = Math.min(1, away / 70);
      h = ramp * (fbm(x / 80 + 5, z / 80 - 2, 3) - 0.34) * (theme === "col" ? 34 : 20);
    }
    return plainY + (h - plainY) * keepShape;
  };

  // Le sol : il épouse la route près d'elle, puis redescend doucement à plat
  const heightAt = (x: number, z: number): number => {
    const pit = pitAt(x, z);
    if (pit) return pit.y - (pit.glide ? 20 : 12);
    if (!hilly) return 0;
    const d = field.distAt(x, z);
    const road = field.roadAt(x, z);
    const near = t.wall + 2;
    if (d <= near) return road - (d < t.half ? 0.3 : 0.08);
    const f = Math.max(0, 1 - (d - near) / 80);
    const blend = f * f * (3 - 2 * f);
    return (road - 0.08) * blend + farGround(x, z, d - near) * (1 - blend);
  };

  const groundTex = keep(TX.groundTexture(theme));
  groundTex.repeat.set(1, 1);
  groundTex.anisotropy = opts.anisotropy;
  const groundMat = keep(new THREE.MeshLambertMaterial({ map: groundTex, vertexColors: true }));
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
    const tints = new Float32Array(p.count * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, heightAt(x, z) - 0.02);
      uv.setXY(i, x / 18, z / 18);
      groundTint(theme, x, z, tint);
      // Au bord du terrain, la teinte rejoint celle de la plaine
      const margin = Math.min(x - field.x0, field.x0 + w - x, z - field.z0, field.z0 + h - z);
      tint.lerp(WHITE, 1 - Math.max(0, Math.min(1, margin / 40)));
      tints.set([tint.r, tint.g, tint.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(tints, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, groundMat);
    mesh.receiveShadow = opts.shadows;
    group.add(mesh);
    // La plaine : tout autour du terrain, sans passer dessous (elle boucherait les trous)
    const x0 = field.x0;
    const z0 = field.z0;
    const x1 = x0 + w;
    const z1 = z0 + h;
    const R = 1500;
    const rects = [
      [-R, -R, R, z0],
      [-R, z1, R, R],
      [-R, z0, x0, z1],
      [x1, z0, R, z1],
    ] as const;
    const farPos: number[] = [];
    const farUv: number[] = [];
    const farIndex: number[] = [];
    rects.forEach(([ax, az, bx, bz], i) => {
      farPos.push(ax, plainY - 0.12, az, ax, plainY - 0.12, bz, bx, plainY - 0.12, bz, bx, plainY - 0.12, az);
      farUv.push(ax / 18, az / 18, ax / 18, bz / 18, bx / 18, bz / 18, bx / 18, az / 18);
      const v = i * 4;
      farIndex.push(v, v + 1, v + 2, v, v + 2, v + 3);
    });
    const far = keep(new THREE.BufferGeometry());
    far.setAttribute("position", new THREE.Float32BufferAttribute(farPos, 3));
    far.setAttribute("uv", new THREE.Float32BufferAttribute(farUv, 2));
    far.setAttribute("color", new THREE.Float32BufferAttribute(new Array((farPos.length / 3) * 3).fill(1), 3));
    far.setIndex(farIndex);
    far.computeVertexNormals();
    group.add(new THREE.Mesh(far, groundMat));
  }

  await pause(0.25);
  // La route, ses vibreurs, l'herbe du bord, le muret
  const roadTex = keep(TX.roadTexture(theme));
  roadTex.anisotropy = opts.anisotropy;
  // Sur ordinateur, le bitume accroche un peu la lumière du soleil
  const road = new THREE.Mesh(
    keep(ribbon(t, -t.half, t.half, 0.06, 8, 1, t.gaps)),
    keep(
      opts.phone
        ? lambert(0xffffff, roadTex)
        : new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.78, metalness: 0, envMapIntensity: 0.2 }),
    ),
  );
  road.receiveShadow = opts.shadows;
  group.add(road);
  const curbTex = keep(TX.curbTexture(theme));
  curbTex.anisotropy = opts.anisotropy;
  const curbMat = keep(lambert(0xffffff, curbTex));
  for (const side of [-1, 1]) {
    const a = side * t.half;
    const b = side * (t.half + 1.2);
    group.add(new THREE.Mesh(keep(ribbon(t, Math.min(a, b), Math.max(a, b), 0.075, 3, 1, t.gaps)), curbMat));
  }
  const wallHeight = theme === "col" ? 1.1 : 0.9;
  const capMat = keep(
    lambert(
      theme === "col"
        ? 0xf4f7fa
        : theme === "vignes"
          ? 0x6b4426
          : theme === "dunes"
            ? 0xdcb98a
            : theme === "lagon"
              ? 0xc9ab66
              : theme === "volcan"
                ? 0xff7a1f
                : 0xdad9d4,
    ),
  );
  const footShade = (toRight: boolean) => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 4;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(toRight ? 0 : 1, "rgba(0,0,0,0)");
    grad.addColorStop(toRight ? 1 : 0, "rgba(0,0,0,0.42)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 4);
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    return keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  };
  const footLeft = footShade(true);
  const footRight = footShade(false);
  const wallTex = keep(TX.wallTexture(theme));
  wallTex.wrapT = THREE.RepeatWrapping;
  const wallMat = keep(new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide }));
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(keep(wallRibbon(t, side * (t.wall + 0.4), wallHeight, heightAt)), wallMat);
    wall.castShadow = false;
    group.add(wall);
    // Le dessus du muret, pour qu'il ait de l'épaisseur
    const at = side * (t.wall + 0.4);
    group.add(new THREE.Mesh(keep(ribbon(t, at - 0.32, at + 0.32, wallHeight, 3, 1, t.gaps)), capMat));
    // Et l'ombre douce à son pied : le muret se pose vraiment sur le sol
    const inner = side > 0 ? at - 2.4 : at;
    const outer = side > 0 ? at : at + 2.4;
    group.add(new THREE.Mesh(keep(ribbon(t, inner, outer, 0.024, 3, 1, t.gaps)), side > 0 ? footLeft : footRight));
  }

  await pause(0.4);
  // La ligne d'arrivée : le damier au sol et l'arche
  const startLamps: THREE.MeshStandardMaterial[] = [];
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
    // Les feux de départ, sous la banderole, tournés vers la grille
    const housing = new THREE.Mesh(keep(new THREE.BoxGeometry(4.6, 1.3, 0.6)), postMat);
    housing.position.set(0, 4.45, 0.3);
    arch.add(housing);
    const lampGeo = keep(new THREE.SphereGeometry(0.42, 14, 10));
    for (let k = 0; k < 3; k++) {
      const mat = keep(new THREE.MeshStandardMaterial({ color: 0x3a1210, emissive: 0x000000, roughness: 0.3 }));
      const lamp = new THREE.Mesh(lampGeo, mat);
      lamp.position.set((k - 1) * 1.4, 4.45, 0.62);
      arch.add(lamp);
      startLamps.push(mat);
    }
    // En travers de la route : son axe x local suit la droite de la route (-cos h, sin h), la banderole fait face aux karts
    arch.position.set(p.x, p.y, p.z);
    arch.rotation.y = h + Math.PI;
    group.add(arch);
  }

  // Les accélérateurs : des chevrons qui défilent
  const boostTex = keep(TX.boostTexture());
  // Plus lumineux que le blanc : ils diffusent un halo
  const boostMat = keep(new THREE.MeshBasicMaterial({ map: boostTex, color: new THREE.Color(1.5, 1.5, 1.5) }));
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
    const glideTop = keep(lambert(0xffffff, keep(TX.rampTexture(true))));
    for (const lip of t.jumps) {
      // Le tremplin d'un grand vol se reconnaît à sa couleur
      group.add(rampMesh(t, lip, t.gaps.some((g) => g.glide && g.from === lip) ? glideTop : top, sideMat, keep));
    }
  }

  await pause(0.5);
  // Le décor
  const r = rng(t.n * 31 + t.def.width);
  // Au port, l'eau commence au quai, le long de la ligne droite ; et rien ne pousse à travers un tunnel ou un pont
  const quay = -t.wall - 9;
  const place0 = PLACES[theme];
  const keepOut: { x: number; z: number }[] = [];
  if (place0.tunnel[0] >= 0) for (let s = place0.tunnel[0] - 12; s <= place0.tunnel[1] + 12; s += 4) keepOut.push(pointAt(t, s, 0));
  for (let s = place0.bridge - 6; s <= place0.bridge + 6; s += 3) for (const d of [-1, 1]) keepOut.push(pointAt(t, s, d * (t.wall + 2)));
  const blocked = (x: number, z: number) => keepOut.some((p) => Math.hypot(p.x - x, p.z - z) < t.wall + 10);
  const free = (x: number, z: number, min: number) => field.distAt(x, z) > min && (theme !== "port" || z > quay + 5) && !blocked(x, z);
  const scatter = (count: number, min: number, max: number, test?: (x: number, z: number) => boolean) => {
    const out: [number, number][] = [];
    const w = (field.nx - 1) * field.cell;
    const h = (field.nz - 1) * field.cell;
    for (let tries = 0; tries < count * 12 && out.length < count; tries++) {
      const x = field.x0 + r() * w;
      const z = field.z0 + r() * h;
      const d = field.distAt(x, z);
      if (d < min || d > max) continue;
      if (blocked(x, z)) continue;
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
  await pause(0.6);
  // Le tunnel, le pont, les spectateurs, et ce qui bouge selon le lieu
  const scenery = buildScenery({ group, t, keep, heightAt, shadows, phone: opts.phone, free }, theme);
  await pause(0.75);

  // Les montagnes tout autour, pour l'horizon (au port, le large reste ouvert)
  {
    const w = (field.nx - 1) * field.cell;
    const h = (field.nz - 1) * field.cell;
    addMountains(group, keep, theme, field.x0 + w / 2, field.z0 + h / 2, Math.hypot(w, h) / 2 + 40, opts.phone);
  }
  // Les touffes d'herbe et les fleurs du bord de la route, les traces de pneus dans les virages
  addGrass(group, keep, t, theme, place0.tunnel, opts.phone);
  const open = (s: number) => s < place0.tunnel[0] - 4 || s > place0.tunnel[1] + 4;
  addRunoffs(group, keep, t, theme, open);
  addSkidMarks(group, keep, t, theme, open);
  await pause(0.88);

  let sea: THREE.ShaderMaterial | null = null;
  if (theme === "port") {
    // La mer, au-delà du quai qui longe la ligne droite
    sea = seaMaterial(keep, mood.dir, new THREE.Color(mood.horizon));
    const water = new THREE.Mesh(keep(new THREE.PlaneGeometry(3000, 1500)), sea);
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
    mergeDeep(crane, keep);
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
    const cone = keep(cypressGeometry());
    const ball = keep(foliageGeometry());
    const trunk = keep(new THREE.CylinderGeometry(0.25, 0.35, 1, 6));
    const cypress: THREE.Matrix4[] = [];
    const balls: THREE.Matrix4[] = [];
    const trunks: THREE.Matrix4[] = [];
    const blobs: [number, number, number, number][] = [];
    for (const [x, z] of scatter(Math.round(110 * few), t.wall + 3, 160)) {
      const y = heightAt(x, z);
      if (r() < 0.5) {
        const tall = 9 + r() * 4;
        cypress.push(place(x, y + tall / 2, z, r() * 3, 2.4, tall, 2.4));
        blobs.push([x, y, z, 2.2]);
      } else {
        const s = 2.4 + r() * 1.9;
        balls.push(place(x, y + 2.4 + s * 0.6, z, r() * 3, s, s * 0.92, s));
        trunks.push(place(x, y + 1.2, z, 0, 1, 2.4, 1));
        blobs.push([x, y, z, s * 1.25]);
      }
    }
    addGroundShadows(group, keep, blobs);
    group.add(instances(cone, keep(foliage(0x35622f)), cypress, shadows));
    const leaves = instances(ball, keep(foliage(0x6d9d42)), balls, shadows);
    tintInstances(leaves, r, [0x7aa848, 0x5e9238, 0x8cae4a, 0x6b9a3c]);
    group.add(leaves);
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
  } else if (theme === "col") {
    // Les sapins enneigés
    const cone = keep(pineGeometry());
    const cap = keep(pineSnowGeometry());
    const pines: THREE.Matrix4[] = [];
    const snow: THREE.Matrix4[] = [];
    const trunks: THREE.Matrix4[] = [];
    const blobs: [number, number, number, number][] = [];
    const trunk = keep(new THREE.CylinderGeometry(0.3, 0.4, 1, 6));
    for (const [x, z] of scatter(Math.round(200 * few), t.wall + 3, 170)) {
      const y = heightAt(x, z);
      const s = 2.2 + r() * 1.8;
      const h = s * 3.4;
      const rot = r() * 3;
      pines.push(place(x, y + 1.2 + h / 2, z, rot, s, h, s));
      snow.push(place(x, y + 1.2 + h / 2 + 0.02, z, rot, s, h, s));
      trunks.push(place(x, y + 0.6, z, 0, 1, 1.2, 1));
      blobs.push([x, y, z, s * 1.2]);
    }
    addGroundShadows(group, keep, blobs);
    const firs = instances(cone, keep(foliage(0x2e5f3a)), pines, shadows);
    tintInstances(firs, r, [0x2e5f3a, 0x265238, 0x356a40]);
    group.add(firs);
    group.add(instances(cap, keep(new THREE.MeshLambertMaterial({ color: 0xf6f9fc, flatShading: true })), snow, false));
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
    const snowmen = new THREE.Group();
    for (const [x, z] of scatter(Math.round(8 * few), t.wall + 3, t.wall + 12)) {
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
      snowmen.add(man);
    }
    mergeDeep(snowmen, keep);
    group.add(snowmen);
  }

  // Le décor des biomes lointains, et ce qui les recouvre : la mer du lagon, la lave du volcan
  const biomeCtx: BiomeContext = { group, t, keep, heightAt, shadows, phone: opts.phone, scatter, r, few };
  let biome: BiomeUpdate | null = null;
  if (theme === "dunes") biome = buildDunes(biomeCtx);
  else if (theme === "lagon") biome = buildLagon(biomeCtx);
  else if (theme === "volcan") biome = buildVolcan(biomeCtx);
  const caustic = { value: 0 };
  let liquid: THREE.ShaderMaterial | null = null;
  if (theme === "lagon" && t.water !== null) {
    // La profondeur de l'eau partout : une petite carte du relief, pour la couleur de la mer et l'écume des plages
    const w = field.nx;
    const h = field.nz;
    const data = new Uint8Array(w * h * 4);
    for (let gz = 0; gz < h; gz++) {
      for (let gx = 0; gx < w; gx++) {
        const y = heightAt(field.x0 + gx * field.cell, field.z0 + gz * field.cell);
        const v = Math.max(0, Math.min(255, Math.round(((y + 20) / 40) * 255)));
        data.set([v, v, v, 255], (gz * w + gx) * 4);
      }
    }
    const map = keep(new THREE.DataTexture(data, w, h));
    map.magFilter = map.minFilter = THREE.LinearFilter;
    map.needsUpdate = true;
    const sizeX = (w - 1) * field.cell;
    const sizeZ = (h - 1) * field.cell;
    liquid = lagoonMaterial(
      keep,
      mood.dir,
      new THREE.Color(mood.horizon),
      map,
      new THREE.Vector2(field.x0, field.z0),
      new THREE.Vector2(sizeX, sizeZ),
      t.water,
    );
    const sea = new THREE.Mesh(keep(new THREE.PlaneGeometry(3400, 3400)), liquid);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = t.water;
    sea.renderOrder = 2;
    group.add(sea);
  } else if (theme === "volcan") {
    liquid = lavaMaterial(keep);
    const lava = new THREE.Mesh(keep(new THREE.PlaneGeometry(3400, 3400)), liquid);
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = -1.2;
    group.add(lava);
  }

  // L'ombre des nuages sur le sol et la route, les reflets de lumière au fond de l'eau
  const surface = { water: t.water ?? undefined, clouds: !mood.stars };
  if (surface.clouds || surface.water !== undefined) {
    for (const m of [groundMat, road.material as THREE.Material, curbMat]) addSurfaceLight(m, surface, caustic);
  }

  const horizon = mood.horizon;
  return {
    group,
    dome: sky.group,
    mood,
    heightAt,
    sky: new THREE.Color(horizon),
    tunnels: scenery.tunnels,
    setLights(n: number) {
      startLamps.forEach((m, k) => {
        const on = n === 4 || k < n;
        m.color.setHex(n === 4 ? 0x1f8f3a : on ? 0xd8352a : 0x3a1210);
        m.emissive.setHex(n === 4 ? 0x36ff6a : on ? 0xff2a1a : 0x000000);
        m.emissiveIntensity = on ? 1.6 : 0;
      });
    },
    fog: new THREE.Fog(horizon, mood.fog[0], mood.fog[1]),
    update(time: number, camera: THREE.Vector3, daylight: number) {
      boostTex.offset.y = -((time * 1.6) % 1);
      if (sea) sea.uniforms.uTime!.value = time;
      if (liquid) liquid.uniforms.uTime!.value = time;
      caustic.value = time;
      biome?.(time, camera);
      waveFlags(time);
      sky.update(camera, time);
      scenery.update(time, camera, daylight);
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
  const roof = keep(gableGeometry());
  const byWall = walls.map(() => [] as THREE.Matrix4[]);
  const roofs: THREE.Matrix4[] = [];
  for (const [x, z] of spots) {
    const y = heightAt(x, z);
    const w = 6 + r() * 5;
    const d = 6 + r() * 5;
    const h = 4 + r() * 5;
    const rot = r() * Math.PI;
    byWall[Math.floor(r() * walls.length)]!.push(place(x, y + h / 2, z, rot, w, h, d));
    roofs.push(place(x, y + h, z, rot, w * 1.14, 2.6 + w * 0.12, d * 1.1));
  }
  byWall.forEach((s, i) => group.add(instances(box, keep(lambert(walls[i]!, facade)), s, shadows)));
  group.add(instances(roof, keep(new THREE.MeshLambertMaterial({ color: roofColor, vertexColors: true })), roofs, shadows));
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
  mergeDeep(g, keep);
  g.position.set(x, y, z);
  group.add(g);
}
