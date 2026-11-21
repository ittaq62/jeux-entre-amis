// La fête foraine au soleil couchant : l'allée des stands sous les guirlandes d'ampoules, la grande roue au bord de la
// grande courbe, le manège de chevaux de bois au milieu de la route, les autos tamponneuses, le grand huit qui passe
// deux fois au-dessus de la route, le cerceau de feu au-dessus de la piscine à balles, le chapiteau du cirque qu'on
// traverse, les chaises volantes, la tour de chute, la mare aux canards, l'arche de l'entrée, les caravanes des forains.
// Tout est posé par rapport au circuit : en miroir, la fête est retournée avec lui.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pointAt, wrapS, type Track } from "../../../shared/games/bolides/track.ts";
import { mergeDeep, mergeStatic } from "./merge.ts";
import { Crowd } from "./scenery.ts";
import {
  AWNING_KINDS,
  awningTexture,
  carouselTexture,
  flameTexture,
  marqueeTexture,
  STALL_COLS,
  STALL_COUNT,
  STALL_ROWS,
  STALL_SIGN,
  STALL_TRIMS,
  stallTextures,
  tentTexture,
  valanceTexture,
} from "./foireTextures.ts";
import { glowTexture } from "./villeTextures.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

export interface FoireContext {
  group: THREE.Group;
  t: Track;
  keep: Keep;
  /** Le sol à cet endroit */
  heightAt: (x: number, z: number) => number;
  /** La distance au milieu de la route la plus proche */
  distAt: (x: number, z: number) => number;
  shadows: boolean;
  phone: boolean;
  r: () => number;
  /** Le chapiteau (le tunnel), en mètres depuis la ligne */
  tunnel: [number, number];
}

export interface Foire {
  update: (time: number, camera: THREE.Vector3, daylight: number) => void;
}

type Update = (time: number) => void;

/** Ce que partagent toutes les parties de la fête pendant qu'on la construit */
interface Fair {
  ctx: FoireContext;
  /** -1 sur le circuit en miroir : les grandes pièces posées par leurs coordonnées sont retournées (x → -x) */
  fx: number;
  /** Les grandes pièces déjà posées : rien d'autre ne vient dessus */
  taken: { x: number; z: number; r: number }[];
  crowd: Crowd;
  seed: number;
  /** Les ampoules immobiles de toute la fête, en une seule forme */
  bulbs: { pos: number[]; col: number[] };
  glow: THREE.Texture;
  updates: Update[];
  /** Ce qui doit rester libre au bord de la route, à cette distance du départ */
  clearAt: (s: number) => boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Les couleurs des ampoules : blanc chaud, rouge, jaune, bleu, vert, rose (plus fortes que le blanc : elles brillent) */
const BULB = [
  new THREE.Color(1.1, 0.86, 0.52),
  new THREE.Color(1.1, 0.3, 0.2),
  new THREE.Color(1.1, 0.82, 0.22),
  new THREE.Color(0.42, 0.62, 1.15),
  new THREE.Color(0.42, 1.1, 0.5),
  new THREE.Color(1.1, 0.45, 0.85),
];

const PAINT = [0xd8352a, 0xf2c230, 0x2f7fe0, 0x3fb86a, 0xee6fb0, 0xff8a2a, 0x9a5ce0, 0x2fc4c4];

function place(x: number, y: number, z: number, rot = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(v3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, rot), v3(sx, sy, sz));
}

function instances(geo: THREE.BufferGeometry, mat: THREE.Material, spots: THREE.Matrix4[], shadows: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  spots.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = spots.length;
  mesh.castShadow = shadows;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Plusieurs formes en une (avec seulement la position, la normale et les coordonnées d'image) */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(n.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") n.deleteAttribute(name);
    if (!n.attributes.uv) n.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position!.count * 2), 2));
    return n;
  });
  const out = mergeGeometries(flat, false)!;
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  return out;
}

/** Une poutre ronde de a à b */
function beam(a: THREE.Vector3, b: THREE.Vector3, r: number, sides = 6): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, sides);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Des faces collées les unes aux autres, avec leurs coordonnées d'image et leur couleur, en une seule forme */
class Faces {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  /** Un quadrilatère a, b, c, d (dans l'ordre du tour), tourné vers `out` */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uvs: number[], color: THREE.Color, out: THREE.Vector3) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const order = n.dot(out) < 0 ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3];
    const v = [a, b, c, d];
    for (const k of order) {
      this.pos.push(v[k]!.x, v[k]!.y, v[k]!.z);
      this.uv.push(uvs[k * 2]!, uvs[k * 2 + 1]!);
      this.col.push(color.r, color.g, color.b);
    }
  }
  geometry(keep: Keep): THREE.BufferGeometry {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}
const NO_UV = [0, 0, 1, 0, 1, 1, 0, 1];

/** Des ampoules : des points qui brillent, chacun sa couleur */
function bulbPoints(f: Fair, pos: number[], col: number[], size: number): THREE.Points {
  const geo = f.ctx.keep(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const mat = f.ctx.keep(
    new THREE.PointsMaterial({
      map: f.glow,
      size,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  return new THREE.Points(geo, mat);
}

const lambert = (keep: Keep, color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  keep(new THREE.MeshLambertMaterial({ color, ...extra }));
const shiny = (keep: Keep, color: number, metal = 0.6) =>
  keep(new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: metal }));

function free(f: Fair, x: number, z: number, r: number): boolean {
  return f.taken.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);
}
function take(f: Fair, x: number, z: number, r: number) {
  f.taken.push({ x, z, r });
}
function bulb(f: Fair, p: THREE.Vector3, c: THREE.Color) {
  f.bulbs.pos.push(p.x, p.y, p.z);
  f.bulbs.col.push(c.r, c.g, c.b);
}
/** Un visiteur, tourné vers (tx, tz) */
function visitor(f: Fair, x: number, y: number, z: number, tx: number, tz: number) {
  f.crowd.add(x, y, z, Math.atan2(tx - x, tz - z), f.seed++);
}

/** Une enseigne lumineuse à plat (son image, et ce qui en brille) */
function marquee(f: Fair, text: string, bg: string, fg: string, w: number, h: number, width = 1024): THREE.Mesh {
  const { keep } = f.ctx;
  const tex = marqueeTexture(text, bg, fg, width);
  keep(tex.color);
  keep(tex.lit);
  return new THREE.Mesh(
    keep(new THREE.PlaneGeometry(w, h)),
    keep(new THREE.MeshLambertMaterial({ map: tex.color, emissiveMap: tex.lit, emissive: 0xffffff, emissiveIntensity: 1.35 })),
  );
}

/**
 * La grande roue, au bout de l'allée de départ, à l'extérieur de la grande courbe : on la voit de face tout le long de
 * la ligne droite. Ses deux jantes illuminées, ses nacelles qui restent droites.
 */
function addWheel(f: Fair) {
  const { group, keep, heightAt, shadows, phone } = f.ctx;
  const cx = 205 * f.fx;
  const cz = -12;
  const y0 = heightAt(cx, cz);
  const R = 22;
  const axle = R + 4.5;
  take(f, cx, cz, 27);
  const root = new THREE.Group();
  root.position.set(cx, y0, cz);
  group.add(root);
  const white = lambert(keep, 0xf2ede3);
  const red = lambert(keep, 0xc23028);
  const gold = shiny(keep, 0xe8b530);
  // Les pieds : deux chevalets en A, de chaque côté, et leurs entretoises
  const legs: THREE.BufferGeometry[] = [];
  for (const x of [-6.5, 6.5]) {
    const top = v3(Math.sign(x) * 1.9, axle, 0);
    for (const z of [-13, 13]) legs.push(beam(v3(x, 0.8, z), top, 0.42, 8));
    for (const k of [0.3, 0.62]) {
      const ax = x + (top.x - x) * k;
      const y = 0.8 + (axle - 0.8) * k;
      const z = 13 * (1 - k);
      legs.push(beam(v3(ax, y, -z), v3(ax, y, z), 0.2));
    }
  }
  const legMesh = new THREE.Mesh(keep(merge(legs)), white);
  legMesh.castShadow = shadows;
  root.add(legMesh);
  const deck = new THREE.Mesh(keep(new THREE.BoxGeometry(17, 0.8, 32)), red);
  deck.position.y = 0.4;
  deck.receiveShadow = shadows;
  root.add(deck);
  // La roue : deux jantes, leurs rayons, les traverses où pendent les nacelles
  const spin = new THREE.Group();
  spin.position.y = axle;
  root.add(spin);
  const frame: THREE.BufferGeometry[] = [];
  for (const xs of [-1.4, 1.4]) {
    frame.push(new THREE.TorusGeometry(R, 0.3, 6, 120).rotateY(Math.PI / 2).translate(xs, 0, 0));
    frame.push(new THREE.TorusGeometry(R * 0.45, 0.18, 6, 60).rotateY(Math.PI / 2).translate(xs, 0, 0));
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const b = a + Math.PI / 16;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const xs of [-1.4, 1.4]) {
      frame.push(beam(v3(xs * 0.6, c * 1.4, s * 1.4), v3(xs, c * R, s * R), 0.09, 5));
      frame.push(beam(v3(xs, c * R * 0.45, s * R * 0.45), v3(xs, Math.cos(b) * R, Math.sin(b) * R), 0.06, 4));
    }
    frame.push(beam(v3(-1.4, c * R, s * R), v3(1.4, c * R, s * R), 0.12, 5));
  }
  const frameMesh = new THREE.Mesh(keep(merge(frame)), white);
  frameMesh.castShadow = shadows;
  spin.add(frameMesh);
  spin.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(1.6, 1.6, 3.8, 18).rotateZ(Math.PI / 2)), gold));
  // Les ampoules : le long des deux jantes, et sur les rayons
  const pos: number[] = [];
  const col: number[] = [];
  const nRim = phone ? 64 : 120;
  const perSpoke = phone ? 3 : 6;
  for (const xs of [-1.55, 1.55]) {
    for (let k = 0; k < nRim; k++) {
      const a = (k / nRim) * Math.PI * 2;
      pos.push(xs, Math.cos(a) * R, Math.sin(a) * R);
      const c = BULB[k % 2 === 0 ? 0 : 1 + (Math.floor(k / 2) % 5)]!;
      col.push(c.r, c.g, c.b);
    }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (let j = 1; j <= perSpoke; j++) {
        const u = 0.1 + (j / perSpoke) * 0.86;
        pos.push(xs, Math.cos(a) * R * u, Math.sin(a) * R * u);
        const c = BULB[1 + (k % 5)]!;
        col.push(c.r, c.g, c.b);
      }
    }
  }
  spin.add(bulbPoints(f, pos, col, 1.6));
  // Les nacelles : toujours droites, elles se balancent un peu
  const n = 16;
  const body = new THREE.InstancedMesh(
    keep(new THREE.CylinderGeometry(1.25, 1.0, 1.7, 10).translate(0, -2.35, 0)),
    keep(new THREE.MeshLambertMaterial()),
    n,
  );
  const roofs = new THREE.InstancedMesh(
    keep(
      merge([
        new THREE.ConeGeometry(1.5, 0.8, 10).translate(0, -1.1, 0),
        new THREE.CylinderGeometry(0.07, 0.07, 1.2, 5).translate(0, -0.6, 0),
        new THREE.CylinderGeometry(1.3, 1.3, 0.12, 10).translate(0, -3.25, 0),
      ]),
    ),
    white,
    n,
  );
  const color = new THREE.Color();
  for (let i = 0; i < n; i++) body.setColorAt(i, color.setHex(PAINT[i % PAINT.length]!));
  if (body.instanceColor) body.instanceColor.needsUpdate = true;
  for (const m of [body, roofs]) {
    m.frustumCulled = false;
    m.castShadow = shadows;
    root.add(m);
  }
  // Ceux qui attendent leur tour, au pied de la roue
  for (let k = 0; k < (phone ? 4 : 9); k++) {
    const x = cx + (k % 2 === 0 ? -8.2 : 8.2);
    const z = cz - 10 + k * 2.2;
    visitor(f, x, y0 + 0.8, z, cx, cz);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  f.updates.push((time) => {
    const turn = time * 0.07;
    spin.rotation.x = turn;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + turn;
      p.set(0, axle + Math.cos(a) * R, Math.sin(a) * R);
      q.setFromEuler(e.set(Math.sin(time * 1.1 + i) * 0.06, 0, 0));
      m4.compose(p, q, one);
      body.setMatrixAt(i, m4);
      roofs.setMatrixAt(i, m4);
    }
    body.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
  });
}

/** Un cheval de bois au galop, le nez vers +z, la barre qui le porte passe en son milieu */
function horseGeometry(): THREE.BufferGeometry {
  return merge([
    new THREE.CapsuleGeometry(0.3, 0.72, 4, 10).rotateX(Math.PI / 2),
    new THREE.BoxGeometry(0.24, 0.62, 0.3).rotateX(-0.55).translate(0, 0.38, 0.52),
    new THREE.BoxGeometry(0.22, 0.24, 0.52).rotateX(0.3).translate(0, 0.66, 0.8),
    new THREE.BoxGeometry(0.06, 0.16, 0.06).translate(-0.07, 0.84, 0.66),
    new THREE.BoxGeometry(0.06, 0.16, 0.06).translate(0.07, 0.84, 0.66),
    new THREE.BoxGeometry(0.1, 0.55, 0.1).rotateX(-1.0).translate(-0.13, -0.2, 0.62),
    new THREE.BoxGeometry(0.1, 0.55, 0.1).rotateX(-1.0).translate(0.13, -0.2, 0.62),
    new THREE.BoxGeometry(0.1, 0.62, 0.1).rotateX(0.45).translate(-0.13, -0.42, -0.42),
    new THREE.BoxGeometry(0.1, 0.62, 0.1).rotateX(0.45).translate(0.13, -0.42, -0.42),
    new THREE.BoxGeometry(0.08, 0.55, 0.1).rotateX(0.8).translate(0, 0.02, -0.66),
  ]);
}

/** Le manège de chevaux de bois, sur l'îlot au milieu de la ligne droite : il tourne, ses chevaux montent et descendent */
function addCarousel(f: Fair) {
  const { t, group, keep, shadows, phone } = f.ctx;
  for (const isl of t.islands) {
    const c = pointAt(t, isl.s + isl.len / 2, isl.d);
    const R = isl.half - 0.2;
    const root = new THREE.Group();
    root.position.set(c.x, c.y + 0.06, c.z);
    group.add(root);
    const red = keep(new THREE.MeshStandardMaterial({ color: 0xb8262a, roughness: 0.45 }));
    const gold = shiny(keep, 0xe8b530, 0.65);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, parent: THREE.Object3D = root) => {
      const m = new THREE.Mesh(keep(geo), mat);
      m.position.y = y;
      m.castShadow = shadows;
      parent.add(m);
      return m;
    };
    // Le socle fixe, rouge, sa frise dorée
    add(new THREE.CylinderGeometry(R + 0.05, R + 0.2, 0.42, 36), red, 0.21);
    add(new THREE.CylinderGeometry(R + 0.22, R + 0.22, 0.08, 36), gold, 0.4);
    const spin = new THREE.Group();
    root.add(spin);
    add(new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.22, 36), lambert(keep, 0x9a6a3a), 0.55, spin);
    // La colonne du milieu, couverte de miroirs
    const mirror = keep(new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.15, metalness: 0.7, emissive: 0x2a3a50 }));
    add(new THREE.CylinderGeometry(0.85, 0.85, 3.7, 12), mirror, 0.66 + 1.85, spin);
    add(new THREE.CylinderGeometry(1.0, 1.0, 0.25, 16), gold, 0.75, spin);
    add(new THREE.CylinderGeometry(1.0, 1.0, 0.25, 16), gold, 4.35, spin);
    // Le toit : une toile rayée en pointe, son lambrequin festonné, son plafond éclairé, la boule dorée au sommet
    const roofTex = keep(tentTexture());
    roofTex.repeat.set(3, 1);
    add(
      new THREE.ConeGeometry(R + 0.6, 1.9, 32, 1, true),
      lambert(keep, 0xffffff, { map: roofTex, side: THREE.DoubleSide }),
      4.55 + 0.95,
      spin,
    );
    const valTex = keep(carouselTexture());
    valTex.repeat.set(5, 1);
    add(
      new THREE.CylinderGeometry(R + 0.6, R + 0.6, 0.8, 40, 1, true),
      lambert(keep, 0xffffff, { map: valTex, alphaTest: 0.5, side: THREE.DoubleSide }),
      4.15,
      spin,
    );
    const ceiling = add(
      new THREE.CircleGeometry(R + 0.55, 32).rotateX(Math.PI / 2),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 0.85, 0.55) })),
      4.5,
      spin,
    );
    ceiling.castShadow = false;
    add(new THREE.SphereGeometry(0.38, 12, 10), gold, 6.7, spin);
    add(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), gold, 7.3, spin);
    // Les barres dorées, et les chevaux qu'elles portent
    const rp = R - 1.0;
    const n = 8;
    const poles: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      poles.push(new THREE.CylinderGeometry(0.06, 0.06, 3.9, 6).translate(Math.cos(a) * rp, 0.66 + 1.95, Math.sin(a) * rp));
    }
    add(merge(poles), gold, 0, spin);
    const horses = new THREE.InstancedMesh(keep(horseGeometry()), keep(new THREE.MeshLambertMaterial()), n);
    const saddles = new THREE.InstancedMesh(
      keep(
        merge([
          new THREE.BoxGeometry(0.66, 0.34, 0.4).translate(0, 0.12, -0.05),
          new THREE.BoxGeometry(0.42, 0.1, 0.46).translate(0, 0.33, -0.05),
        ]),
      ),
      keep(new THREE.MeshStandardMaterial({ color: 0xc8302b, roughness: 0.5 })),
      n,
    );
    const coats = [0xf4efe6, 0x2a2420, 0xb8743a, 0xd8d4cc];
    const color = new THREE.Color();
    for (let i = 0; i < n; i++) horses.setColorAt(i, color.setHex(coats[i % coats.length]!));
    if (horses.instanceColor) horses.instanceColor.needsUpdate = true;
    horses.castShadow = shadows;
    spin.add(horses, saddles);
    // Les ampoules : sous le lambrequin, et le long des baleines du toit
    const pos: number[] = [];
    const col: number[] = [];
    const nb = phone ? 24 : 40;
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * Math.PI * 2;
      pos.push(Math.cos(a) * (R + 0.62), 3.78, Math.sin(a) * (R + 0.62));
      const b = BULB[k % 2 === 0 ? 0 : 2]!;
      col.push(b.r, b.g, b.b);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      for (let j = 1; j <= 4; j++) {
        const u = j / 5;
        const rad = (R + 0.6) * (1 - u) + 0.4 * u;
        pos.push(Math.cos(a) * rad, 4.6 + 1.9 * u, Math.sin(a) * rad);
        const b = BULB[1 + (k % 5)]!;
        col.push(b.r, b.g, b.b);
      }
    }
    spin.add(bulbPoints(f, pos, col, 1.1));
    mergeStatic(root, keep);
    mergeStatic(spin, keep);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    f.updates.push((time) => {
      spin.rotation.y = time * 0.5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        p.set(Math.cos(a) * rp, 1.75 + Math.sin(time * 2.4 + i * Math.PI * 0.5) * 0.32, Math.sin(a) * rp);
        // Le nez dans le sens où il tourne
        q.setFromAxisAngle(UP, Math.PI - a);
        m4.compose(p, q, one);
        horses.setMatrixAt(i, m4);
        saddles.setMatrixAt(i, m4);
      }
      horses.instanceMatrix.needsUpdate = true;
      saddles.instanceMatrix.needsUpdate = true;
    });
  }
}

/**
 * Le chapiteau du cirque, que la route traverse : un mur de toile rayée ouvert aux deux bouts, le toit en pente douce
 * jusqu'au mât, le lambrequin festonné, la piste ronde de sciure, les gradins pleins de monde, les projecteurs qui
 * balaient la piste, les enseignes « CIRQUE » au-dessus des deux entrées
 */
function addTent(f: Fair) {
  const { t, group, keep, shadows, phone, r } = f.ctx;
  const [s1, s2] = f.ctx.tunnel;
  if (s1 < 0) return;
  const mid = (s1 + s2) / 2;
  const RT = (s2 - s1) / 2;
  const c = pointAt(t, mid, 0);
  take(f, c.x, c.z, RT + 6);
  const root = new THREE.Group();
  root.position.set(c.x, c.y, c.z);
  root.rotation.y = Math.atan2(c.tx, c.tz);
  group.add(root);
  root.updateMatrixWorld(true);
  const world = (x: number, y: number, z: number) => v3(x, y, z).applyMatrix4(root.matrixWorld);
  const W = t.wall + 1;
  const wallH = 7;
  const peak = 25;
  // Le mur de toile, ouvert là où passe la route (le repère du cylindre : x = ρ sin θ, z = ρ cos θ, la route suit z)
  const alpha = Math.asin(Math.min(0.95, W / RT));
  const wallTex = keep(tentTexture());
  wallTex.repeat.set(6, 1);
  const wallMat = lambert(keep, 0xffffff, { map: wallTex, side: THREE.DoubleSide });
  for (const start of [alpha, Math.PI + alpha]) {
    const wall = new THREE.Mesh(keep(new THREE.CylinderGeometry(RT, RT, wallH + 0.4, 40, 1, true, start, Math.PI - 2 * alpha)), wallMat);
    wall.position.y = wallH / 2 - 0.2;
    wall.castShadow = shadows;
    root.add(wall);
  }
  // Le toit : creusé comme une vraie toile tendue, du bord du mur jusqu'au mât
  const roofH = (rho: number) => wallH + (peak - wallH) * Math.pow(Math.max(0, 1 - (rho - 0.8) / (RT + 0.4)), 1.7);
  const prof: THREE.Vector2[] = [];
  for (let k = 0; k <= 14; k++) {
    const rho = 0.8 + (RT + 1.2 - 0.8) * (k / 14);
    prof.push(new THREE.Vector2(rho, roofH(rho)));
  }
  const roofTex = keep(tentTexture());
  roofTex.repeat.set(7, 1);
  const roof = new THREE.Mesh(keep(new THREE.LatheGeometry(prof, 56)), lambert(keep, 0xffffff, { map: roofTex, side: THREE.DoubleSide }));
  roof.castShadow = shadows;
  root.add(roof);
  const valTex = keep(valanceTexture());
  valTex.repeat.set(18, 1);
  const valance = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(RT + 1.3, RT + 1.3, 1.5, 72, 1, true)),
    lambert(keep, 0xffffff, { map: valTex, alphaTest: 0.5, side: THREE.DoubleSide }),
  );
  valance.position.y = wallH - 0.6;
  root.add(valance);
  for (let k = 0; k < (phone ? 60 : 110); k++) {
    const a = (k / (phone ? 60 : 110)) * Math.PI * 2;
    bulb(f, world(Math.sin(a) * (RT + 1.35), wallH + 0.2, Math.cos(a) * (RT + 1.35)), BULB[k % 3 === 0 ? 0 : 2]!);
  }
  // Le mât au sommet et son fanion
  const gold = shiny(keep, 0xe8b530);
  const red = lambert(keep, 0xb8262a);
  const mast = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.28, 5, 8)), gold);
  mast.position.y = peak + 2;
  root.add(mast);
  const flag = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(3, 1.6).translate(1.5, 0, 0)),
    lambert(keep, 0xd8352a, { side: THREE.DoubleSide }),
  );
  flag.position.y = peak + 3.7;
  root.add(flag);
  // Les deux grands mâts, de chaque côté de la route, jusqu'à la toile
  for (const sx of [-1, 1]) {
    const x = sx * (W + 0.9);
    const h = roofH(Math.abs(x));
    const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.32, 0.4, h, 10)), red);
    pole.position.set(x, h / 2, 0);
    root.add(pole);
  }
  // La piste : un rond de sciure (sous la route), et sa bordure rouge, de part et d'autre de la route
  const ringR = 15;
  const sawdust = new THREE.Mesh(
    keep(new THREE.CircleGeometry(ringR, 48).rotateX(-Math.PI / 2)),
    lambert(keep, 0xd2ac74, { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
  );
  root.add(sawdust);
  const edge = Math.asin(Math.min(1, (t.half + 1.3) / ringR));
  for (const start of [edge, Math.PI + edge]) {
    const curb = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(ringR, ringR, 0.5, 24, 1, true, start, Math.PI - 2 * edge)),
      lambert(keep, 0xc8302b, { side: THREE.DoubleSide }),
    );
    curb.position.y = 0.2;
    root.add(curb);
  }
  // Les gradins, de part et d'autre de la route, tournés vers la piste ; du monde dessus
  const stands = new Faces();
  const wood = new THREE.Color(0x7a5a3a);
  const paint = new THREE.Color(0x9e2a24);
  const at = (rho: number, th: number, y: number) => v3(rho * Math.sin(th), y, rho * Math.cos(th));
  const center = world(0, 0, 0);
  for (const side of [1, -1]) {
    for (let k = 0; k < 6; k++) {
      const r0 = W + 2.8 + k * 2.5;
      const r1 = r0 + 2.5;
      const y1 = 0.55 + k * 0.85;
      const th0 = Math.asin(Math.min(1, (W + 1.6) / r0));
      const a0 = side > 0 ? th0 : Math.PI + th0;
      const a1 = side > 0 ? Math.PI - th0 : 2 * Math.PI - th0;
      const steps = Math.max(4, Math.round(((a1 - a0) * r1) / 3));
      for (let i = 0; i < steps; i++) {
        const ta = a0 + ((a1 - a0) * i) / steps;
        const tb = a0 + ((a1 - a0) * (i + 1)) / steps;
        const inward = v3(-Math.sin((ta + tb) / 2), 0, -Math.cos((ta + tb) / 2));
        stands.quad(at(r0, ta, y1), at(r0, tb, y1), at(r1, tb, y1), at(r1, ta, y1), NO_UV, wood, UP);
        stands.quad(
          at(r0, ta, k === 0 ? -0.1 : y1 - 0.85),
          at(r0, tb, k === 0 ? -0.1 : y1 - 0.85),
          at(r0, tb, y1),
          at(r0, ta, y1),
          NO_UV,
          paint,
          inward,
        );
        if (k === 5) stands.quad(at(r1, ta, y1), at(r1, tb, y1), at(r1, tb, y1 + 1.1), at(r1, ta, y1 + 1.1), NO_UV, paint, inward);
      }
      // Les bouts des gradins, côté route
      for (const th of [a0, a1]) {
        const tan = v3(Math.cos(th), 0, -Math.sin(th)).multiplyScalar(th === a0 ? -1 : 1);
        stands.quad(at(r0, th, -0.1), at(r1, th, -0.1), at(r1, th, y1), at(r0, th, y1), NO_UV, paint, tan);
      }
      // Les spectateurs, assis au bord de chaque gradin
      for (let th = a0 + 0.04; th < a1 - 0.04; th += 2.3 / (r0 + 1)) {
        if (r() > (phone ? 0.3 : 0.62)) continue;
        const p = at(r0 + 0.9, th, y1).applyMatrix4(root.matrixWorld);
        visitor(f, p.x, p.y, p.z, center.x, center.z);
      }
    }
  }
  const standMesh = new THREE.Mesh(
    stands.geometry(keep),
    keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })),
  );
  standMesh.receiveShadow = shadows;
  root.add(standMesh);
  // Les enseignes au-dessus des deux entrées, sur leurs poteaux
  const cirque = marquee(f, "CIRQUE", "#7a1a16", "#ffe9a8", 20, 3.2);
  for (const zs of [-1, 1]) {
    const sign = zs < 0 ? cirque : new THREE.Mesh(cirque.geometry, cirque.material);
    sign.position.set(0, 9.4, zs * (RT + 1.6));
    sign.rotation.y = zs > 0 ? 0 : Math.PI;
    root.add(sign);
    const back = new THREE.Mesh(keep(new THREE.BoxGeometry(20.4, 3.5, 0.2)), red);
    back.position.set(0, 9.4, zs * (RT + 1.45));
    root.add(back);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.28, 0.32, 11, 8)), gold);
      post.position.set(sx * 10.6, 5.5, zs * (RT + 1.5));
      root.add(post);
    }
  }
  // Les haubans et leurs piquets, tout autour (sauf devant les entrées)
  const ropes: number[] = [];
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2 + 0.04;
    if (Math.abs(Math.sin(a)) * RT < W + 2) continue;
    const top = world(Math.sin(a) * RT, wallH, Math.cos(a) * RT);
    const foot = world(Math.sin(a) * (RT + 6), 0, Math.cos(a) * (RT + 6));
    foot.y = f.ctx.heightAt(foot.x, foot.z);
    ropes.push(top.x, top.y, top.z, foot.x, foot.y, foot.z);
  }
  const ropeGeo = keep(new THREE.BufferGeometry());
  ropeGeo.setAttribute("position", new THREE.Float32BufferAttribute(ropes, 3));
  group.add(new THREE.LineSegments(ropeGeo, keep(new THREE.LineBasicMaterial({ color: 0x5a4a3a }))));
  // Les projecteurs : des faisceaux qui partent du haut des grands mâts et balaient la piste
  const beamGeo = keep(new THREE.ConeGeometry(3.2, 1, 20, 1, true).translate(0, -0.5, 0));
  const beamMat = keep(
    new THREE.MeshBasicMaterial({
      color: 0xfff0c8,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const spots: { mesh: THREE.Mesh; from: THREE.Vector3; k: number }[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const from = v3(sx * (W + 0.9), roofH(W + 0.9) - 1.2, sz * 1.2);
      const mesh = new THREE.Mesh(beamGeo, beamMat);
      mesh.position.copy(from);
      root.add(mesh);
      spots.push({ mesh, from, k: spots.length });
    }
  }
  mergeStatic(root, keep, [flag, ...spots.map((s) => s.mesh)]);
  const dir = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  f.updates.push((time) => {
    flag.rotation.y = Math.sin(time * 2.2) * 0.35;
    for (const s of spots) {
      dir.set(Math.sin(time * 0.6 + s.k * 1.7) * 7, 0, Math.cos(time * 0.45 + s.k * 2.3) * 7).sub(s.from);
      const len = dir.length();
      s.mesh.quaternion.setFromUnitVectors(down, dir.normalize());
      s.mesh.scale.set(1, len, 1);
    }
  });
}

/** Le cerceau de feu, au-dessus de la piscine à balles : un grand anneau rayé, des flammes tout autour */
function addHoop(f: Fair) {
  const { t, group, keep, phone } = f.ctx;
  const flame = keep(flameTexture());
  for (const g of t.gaps) {
    if (g.glide) continue;
    const c = pointAt(t, (g.from + g.to) / 2, 0);
    const root = new THREE.Group();
    root.position.set(c.x, c.y, c.z);
    root.rotation.y = Math.atan2(c.tx, c.tz);
    group.add(root);
    const Rh = t.half + 2.2;
    const cy = 2.4;
    const stripes = keep(tentTexture());
    stripes.repeat.set(10, 1);
    const ring = new THREE.Mesh(
      keep(new THREE.TorusGeometry(Rh, 0.45, 10, 80)),
      lambert(keep, 0xffffff, { map: stripes, emissive: 0x401000 }),
    );
    ring.position.y = cy;
    root.add(ring);
    // Ses deux montants, plantés dans la piscine à balles
    const gold = shiny(keep, 0xe8b530);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, cy + 4.6, 0.5)), gold);
      post.position.set(sx * (Rh + 0.6), (cy - 4.6) / 2, 0);
      root.add(post);
      const clamp = new THREE.Mesh(keep(new THREE.BoxGeometry(1.3, 0.4, 0.7)), gold);
      clamp.position.set(sx * (Rh + 0.2), cy, 0);
      root.add(clamp);
    }
    // Les flammes : sur le dessus de l'anneau, au-dessus des balles
    const n = phone ? 48 : 96;
    const base: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const y = cy + Math.sin(a) * Rh;
      if (y < -4) continue;
      base.push(a);
    }
    const pos = new Float32Array(base.length * 3);
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = keep(
      new THREE.PointsMaterial({
        map: flame,
        size: 2.6,
        color: new THREE.Color(1.6, 1.1, 0.7),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const flames = new THREE.Points(geo, mat);
    flames.frustumCulled = false;
    root.add(flames);
    mergeStatic(root, keep);
    f.updates.push((time) => {
      base.forEach((a, k) => {
        const lick = Math.sin(time * 9 + k * 1.7) * 0.18 + Math.sin(time * 15 + k * 0.6) * 0.1;
        const rad = Rh + 0.55 + lick;
        pos[k * 3] = Math.cos(a) * rad;
        pos[k * 3 + 1] = cy + Math.sin(a) * rad + 0.35 + Math.abs(lick);
        pos[k * 3 + 2] = Math.sin(time * 7 + k) * 0.12;
      });
      geo.attributes.position!.needsUpdate = true;
      mat.size = 2.4 + Math.sin(time * 11) * 0.25;
    });
  }
}

/**
 * Le grand huit : il part de sa gare, monte la grande pente, plonge, passe au-dessus du sommet de la butte, redescend
 * entre les virages, repasse au-dessus de la montée, et revient en gare. Ses rails rouges sur des piliers blancs, des
 * ampoules tout du long, et son train de quatre wagons, lent dans la montée, rapide dans les descentes.
 */
function addCoaster(f: Fair) {
  const { t, group, keep, heightAt, distAt, phone } = f.ctx;
  const ctrl: [number, number, number][] = [
    [146, 214, 3],
    [142, 248, 9],
    [140, 292, 30],
    [124, 322, 31],
    [92, 330, 12],
    [62, 326, 15],
    [40, 310, 18],
    [36, 280, 15],
    [44, 252, 12],
    [64, 236, 9],
    [90, 238, 13],
    [114, 236, 10],
    [150, 236, 8],
    [166, 216, 6],
    [164, 198, 5],
    [154, 192, 4],
  ];
  const pts = ctrl.map(([x, z, h]) => {
    const X = x * f.fx;
    return v3(X, heightAt(X, z) + h, z);
  });
  const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
  const N = Math.round(curve.getLength());
  const P = curve.getSpacedPoints(N).slice(0, N);
  const T = P.map((_, i) =>
    P[(i + 1) % N]!.clone()
      .sub(P[(i - 1 + N) % N]!)
      .normalize(),
  );
  const side = T.map((tan) => new THREE.Vector3().crossVectors(tan, UP).normalize());
  const up = T.map((tan, i) => new THREE.Vector3().crossVectors(tan, side[i]!));
  // Les rails et la poutre qui les porte
  const tube = (off: (i: number) => THREE.Vector3, r: number) =>
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        P.map((p, i) => p.clone().add(off(i))),
        true,
      ),
      N,
      r,
      5,
      true,
    );
  const red = lambert(keep, 0xc8302b);
  const rails = new THREE.Mesh(
    keep(
      merge([
        tube((i) => side[i]!.clone().multiplyScalar(0.55), 0.1),
        tube((i) => side[i]!.clone().multiplyScalar(-0.55), 0.1),
        tube(() => v3(0, -0.55, 0), 0.24),
      ]),
    ),
    red,
  );
  group.add(rails);
  const basis = (i: number, p: THREE.Vector3, m = new THREE.Matrix4()) => m.makeBasis(side[i]!, up[i]!, T[i]!).setPosition(p);
  // Les traverses
  const ties: THREE.Matrix4[] = [];
  for (let i = 0; i < N; i += 2) ties.push(basis(i, P[i]!.clone().addScaledVector(up[i]!, -0.12)));
  group.add(instances(keep(new THREE.BoxGeometry(1.4, 0.1, 0.24)), lambert(keep, 0x3a3d42), ties, false));
  // Les piliers (jamais sur la route : au-dessus, une poutre-caisson franchit la route d'un seul tenant)
  const pillars: THREE.Matrix4[] = [];
  const girder: THREE.Matrix4[] = [];
  for (let i = 0; i < N; i++) {
    const p = P[i]!;
    const onRoad = distAt(p.x, p.z) < t.wall + 2.5;
    if (onRoad) {
      girder.push(basis(i, p.clone().add(v3(0, -1.25, 0))));
      continue;
    }
    if (i % 6 !== 0) continue;
    take(f, p.x, p.z, 3);
    const g = heightAt(p.x, p.z);
    const h = p.y - 0.7 - g;
    if (h > 0.6) pillars.push(new THREE.Matrix4().compose(v3(p.x, g, p.z), new THREE.Quaternion(), v3(1, h, 1)));
  }
  group.add(
    instances(keep(new THREE.CylinderGeometry(0.24, 0.32, 1, 6).translate(0, 0.5, 0)), lambert(keep, 0xeae6dc), pillars, f.ctx.shadows),
  );
  group.add(instances(keep(new THREE.BoxGeometry(1.0, 1.4, 1.05)), red, girder, false));
  // Les ampoules le long des rails
  for (let i = 0; i < N; i += phone ? 7 : 4) {
    for (const s of [-0.62, 0.62])
      bulb(
        f,
        P[i]!.clone()
          .addScaledVector(side[i]!, s)
          .add(v3(0, 0.15, 0)),
        BULB[(i / 4) % 3 === 0 ? 0 : 1 + ((i / 4) % 3)]!,
      );
  }
  // La gare, son quai, son toit, son enseigne tournée vers la route
  const near = (target: THREE.Vector3) => {
    let best = 0;
    for (let i = 1; i < N; i++) if (P[i]!.distanceTo(target) < P[best]!.distanceTo(target)) best = i;
    return best;
  };
  const iA = near(pts[0]!);
  const iC = near(pts[2]!);
  {
    const a = P[iA]!;
    const s = side[iA]!.clone().multiplyScalar(-f.fx);
    const c = a.clone().addScaledVector(s, 3.2);
    const g = heightAt(c.x, c.z);
    take(f, c.x, c.z, 9);
    const station = new THREE.Group();
    station.position.set(c.x, g, c.z);
    station.rotation.y = Math.atan2(T[iA]!.x, T[iA]!.z);
    const top = a.y - g - 0.4;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(keep(geo), mat);
      m.position.set(x, y, z);
      station.add(m);
    };
    add(new THREE.BoxGeometry(3.6, top, 14), lambert(keep, 0x8a6a4a), 0, top / 2, 0);
    for (const [x, z] of [
      [-1.6, -6.5],
      [-1.6, 6.5],
      [1.6, -6.5],
      [1.6, 6.5],
    ] as const)
      add(new THREE.BoxGeometry(0.3, 3.6, 0.3), lambert(keep, 0xeae6dc), x, top + 1.8, z);
    add(new THREE.BoxGeometry(7, 0.4, 16), red, -1.6, top + 3.7, 0);
    group.add(station);
    mergeDeep(station, keep);
    const road = pointAt(t, t.crossers[0]?.s ?? 0, 0);
    const sign = marquee(f, "LE GRAND HUIT", "#1a2440", "#ffd23a", 12, 2);
    sign.position.set(c.x, g + top + 5.1, c.z);
    sign.rotation.y = Math.atan2(road.x - c.x, road.z - c.z);
    group.add(sign);
    for (let k = 0; k < 5; k++) {
      const p = c.clone().addScaledVector(T[iA]!, -5 + k * 2.4);
      visitor(f, p.x, g + top, p.z, a.x, a.z);
    }
  }
  // Le train : quatre wagons, leurs passagers. Lent dans la montée, il prend de la vitesse dans les descentes, freine
  // avant la gare et y attend un peu
  const top = Math.max(...P.map((p) => p.y)) + 0.6;
  const liftLen = (iC - iA + N) % N;
  const speed = (i: number) => {
    const from = (i - iA + N) % N;
    if (from <= liftLen) return 4.2;
    let v = Math.max(5, Math.sqrt(2 * 9.81 * 0.82 * Math.max(0, top - P[i]!.y)));
    const left = (iA - i + N) % N;
    if (left < 30) v = Math.min(v, 2.5 + left * 0.6);
    return v;
  };
  const tc = new Float64Array(N + 1);
  for (let k = 0; k < N; k++) tc[k + 1] = tc[k]! + 1 / speed((iA + k) % N);
  const dwell = 6;
  const cycle = tc[N]! + dwell;
  const cars = 4;
  const bodyGeo = keep(new RoundedBoxGeometry(1.6, 0.85, 2.3, 2, 0.22).translate(0, 0.55, 0));
  const body = new THREE.InstancedMesh(bodyGeo, keep(new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 })), cars);
  const heads = new THREE.InstancedMesh(
    keep(
      merge(
        [
          [-0.38, 0.45],
          [0.38, 0.45],
          [-0.38, -0.5],
          [0.38, -0.5],
        ].map(([x, z]) => new THREE.SphereGeometry(0.2, 8, 6).translate(x!, 1.35, z!)),
      ),
    ),
    lambert(keep, 0xe8b88a),
    cars,
  );
  const color = new THREE.Color();
  for (let k = 0; k < cars; k++) body.setColorAt(k, color.setHex([0xf2c230, 0xd8352a, 0x2f7fe0, 0x3fb86a][k]!));
  if (body.instanceColor) body.instanceColor.needsUpdate = true;
  for (const m of [body, heads]) {
    m.frustumCulled = false;
    group.add(m);
  }
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  f.updates.push((time) => {
    const u = ((time % cycle) + cycle) % cycle;
    let k = 0;
    if (u > dwell) {
      const target = u - dwell;
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (tc[m]! <= target) lo = m;
        else hi = m;
      }
      k = lo + (target - tc[lo]!) / Math.max(1e-6, tc[lo + 1]! - tc[lo]!);
    }
    for (let c = 0; c < cars; c++) {
      const at = (((iA + k - c * 2.8) % N) + N) % N;
      const i = Math.floor(at);
      p.lerpVectors(P[i]!, P[(i + 1) % N]!, at - i);
      basis(i, p, m4);
      body.setMatrixAt(c, m4);
      heads.setMatrixAt(c, m4);
    }
    body.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  });
}

/** Une auto tamponneuse (pour la piste du pavillon) : sa coque, son boudin de caoutchouc, sa perche */
function bumperCar(): { shell: THREE.BufferGeometry; rubber: THREE.BufferGeometry; pole: THREE.BufferGeometry } {
  return {
    shell: merge([
      new RoundedBoxGeometry(1.8, 0.7, 2.3, 2, 0.28).translate(0, 0.7, 0),
      new RoundedBoxGeometry(1.2, 0.7, 0.4, 2, 0.12).translate(0, 1.3, -0.65),
    ]),
    rubber: new THREE.TorusGeometry(0.95, 0.22, 6, 20)
      .rotateX(Math.PI / 2)
      .scale(1, 1, 1.25)
      .translate(0, 0.32, 0),
    pole: new THREE.CylinderGeometry(0.04, 0.05, 2.6, 5).translate(0, 2.2, -0.9),
  };
}

/**
 * Le pavillon des autos tamponneuses, au bord de la route, là où l'une d'elles s'échappe et traverse : sa piste
 * sombre et lisse, ses rambardes de caoutchouc, son toit sur ses poteaux, son enseigne, et des autos qui se cognent
 */
function addPavilion(f: Fair) {
  const { t, group, keep, heightAt, shadows, phone } = f.ctx;
  for (const cr of t.crossers) {
    const side = f.fx;
    const off = t.wall + 15.5;
    const c = pointAt(t, cr.s, side * off);
    const y0 = heightAt(c.x, c.z);
    take(f, c.x, c.z, 17);
    const root = new THREE.Group();
    root.position.set(c.x, y0, c.z);
    root.rotation.y = Math.atan2(c.tx, c.tz);
    group.add(root);
    // Dans ce repère, la route est du côté des x de signe `toward`
    const toward = side;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = false) => {
      const m = new THREE.Mesh(keep(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = cast && shadows;
      m.receiveShadow = shadows;
      root.add(m);
      return m;
    };
    const floor = keep(new THREE.MeshStandardMaterial({ color: 0x3a3d48, roughness: 0.25, metalness: 0.3 }));
    const black = lambert(keep, 0x1c1c1f);
    const red = lambert(keep, 0xc8302b);
    const gold = shiny(keep, 0xe8b530);
    add(new THREE.BoxGeometry(16, 0.3, 26), floor, 0, 0.15, 0);
    // Le passage jusqu'à la route : une rampe douce entre la piste et l'ouverture des barrières
    {
      const edge = pointAt(t, cr.s, side * (t.wall + 0.4));
      const dy = edge.y + 0.07 - y0;
      const ramp = new Faces();
      const x0 = toward * 8;
      const x1 = toward * (off - t.wall - 0.4);
      ramp.quad(v3(x0, 0.3, -5), v3(x1, dy, -5), v3(x1, dy, 5), v3(x0, 0.3, 5), NO_UV, new THREE.Color(0x3a3d48), UP);
      root.add(new THREE.Mesh(ramp.geometry(keep), keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }))));
    }
    // Les rambardes de caoutchouc, ouvertes côté route
    for (const [x, z, w, d] of [
      [-8 * toward, 0, 0.4, 26],
      [0, -13, 16, 0.4],
      [0, 13, 16, 0.4],
      [8 * toward, -9, 0.4, 8],
      [8 * toward, 9, 0.4, 8],
    ] as const)
      add(new THREE.BoxGeometry(w, 0.6, d), black, x, 0.6, z);
    // Les poteaux, le toit, son plafond sombre
    for (const x of [-7.8, 7.8]) for (const z of [-12.8, 0, 12.8]) add(new THREE.CylinderGeometry(0.18, 0.2, 5.4, 8), gold, x, 2.9, z);
    add(new THREE.BoxGeometry(17, 0.5, 27), red, 0, 5.85, 0, true);
    add(new THREE.BoxGeometry(16.6, 0.05, 26.6), lambert(keep, 0x2a2d33), 0, 5.58, 0);
    mergeStatic(root, keep);
    const sign = marquee(f, "AUTOS TAMPONNEUSES", "#1a2440", "#ffd23a", 22, 3.2);
    sign.position.set(toward * 8.6, 7.7, 0);
    sign.rotation.y = toward > 0 ? Math.PI / 2 : -Math.PI / 2;
    root.add(sign);
    // Les autos qui tournent et se cognent sur la piste
    const n = phone ? 4 : 6;
    const geos = bumperCar();
    const shell = new THREE.InstancedMesh(keep(geos.shell), keep(new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.35 })), n);
    const rubber = new THREE.InstancedMesh(keep(geos.rubber), black, n);
    const pole = new THREE.InstancedMesh(keep(geos.pole), gold, n);
    const color = new THREE.Color();
    for (let i = 0; i < n; i++) shell.setColorAt(i, color.setHex(PAINT[(i * 3) % PAINT.length]!));
    if (shell.instanceColor) shell.instanceColor.needsUpdate = true;
    for (const m of [shell, rubber, pole]) {
      m.frustumCulled = false;
      root.add(m);
    }
    // Quelques curieux contre la rambarde
    root.updateMatrixWorld(true);
    for (let k = 0; k < (phone ? 3 : 6); k++) {
      const q = v3(-toward * 8.8, 0.3, -10 + k * 4).applyMatrix4(root.matrixWorld);
      const look = v3(0, 0, -10 + k * 4).applyMatrix4(root.matrixWorld);
      visitor(f, q.x, q.y, q.z, look.x, look.z);
    }
    // La caisse, de l'autre côté de la route
    {
      const o = pointAt(t, cr.s + 9, -side * (t.wall + 4));
      take(f, o.x, o.z, 4);
      const booth = new THREE.Group();
      booth.position.set(o.x, heightAt(o.x, o.z), o.z);
      booth.rotation.y = Math.atan2(o.tx, o.tz);
      const b = new THREE.Mesh(keep(new THREE.BoxGeometry(2.4, 2.6, 2.4)), lambert(keep, 0xf2e6cc));
      b.position.y = 1.3;
      booth.add(b);
      const roof = new THREE.Mesh(keep(new THREE.ConeGeometry(2.1, 1.3, 4).rotateY(Math.PI / 4)), red);
      roof.position.y = 3.25;
      booth.add(roof);
      group.add(booth);
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    f.updates.push((time) => {
      for (let i = 0; i < n; i++) {
        const a = time * 0.55 + i * 1.3;
        const b = time * 0.41 + i * 2.1;
        p.set(Math.sin(a) * 5.4, 0.3, Math.sin(b) * 10.4);
        q.setFromAxisAngle(UP, Math.atan2(Math.cos(a) * 0.55 * 5.4, Math.cos(b) * 0.41 * 10.4));
        m4.compose(p, q, one);
        shell.setMatrixAt(i, m4);
        rubber.setMatrixAt(i, m4);
        pole.setMatrixAt(i, m4);
      }
      shell.instanceMatrix.needsUpdate = true;
      rubber.instanceMatrix.needsUpdate = true;
      pole.instanceMatrix.needsUpdate = true;
    });
  }
}

/** Les chaises volantes : une tour, une couronne qui tourne, et seize sièges qui s'écartent avec la vitesse */
function addSwings(f: Fair) {
  const { group, keep, heightAt, shadows, phone } = f.ctx;
  const x = -115 * f.fx;
  const z = 190;
  const y0 = heightAt(x, z);
  take(f, x, z, 15);
  const root = new THREE.Group();
  root.position.set(x, y0, z);
  group.add(root);
  const red = lambert(keep, 0xc23028);
  const gold = shiny(keep, 0xe8b530);
  const tower = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.7, 1.1, 13, 12)), lambert(keep, 0xf2ede3));
  tower.position.y = 6.5;
  tower.castShadow = shadows;
  root.add(tower);
  const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(4, 4.4, 0.6, 24)), red);
  base.position.y = 0.3;
  root.add(base);
  const crown = new THREE.Group();
  crown.position.y = 13;
  root.add(crown);
  const disc = new THREE.Mesh(keep(new THREE.CylinderGeometry(5.2, 5.2, 0.5, 24)), red);
  crown.add(disc);
  const roofTex = keep(tentTexture());
  roofTex.repeat.set(3, 1);
  const roof = new THREE.Mesh(
    keep(new THREE.ConeGeometry(5.6, 2.4, 24, 1, true)),
    lambert(keep, 0xffffff, { map: roofTex, side: THREE.DoubleSide }),
  );
  roof.position.y = 1.45;
  crown.add(roof);
  const valTex = keep(carouselTexture());
  valTex.repeat.set(5, 1);
  const val = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(5.6, 5.6, 0.8, 32, 1, true)),
    lambert(keep, 0xffffff, { map: valTex, alphaTest: 0.5, side: THREE.DoubleSide }),
  );
  val.position.y = -0.1;
  crown.add(val);
  const pos: number[] = [];
  const col: number[] = [];
  for (let k = 0; k < (phone ? 20 : 36); k++) {
    const a = (k / (phone ? 20 : 36)) * Math.PI * 2;
    pos.push(Math.cos(a) * 5.65, -0.45, Math.sin(a) * 5.65);
    const b = BULB[k % 2 === 0 ? 0 : 3]!;
    col.push(b.r, b.g, b.b);
  }
  crown.add(bulbPoints(f, pos, col, 1.3));
  const n = 16;
  const seats = new THREE.InstancedMesh(
    keep(merge([new THREE.BoxGeometry(0.7, 0.12, 0.6), new THREE.BoxGeometry(0.7, 0.6, 0.1).translate(0, 0.3, -0.28)])),
    gold,
    n,
  );
  const chains = new THREE.InstancedMesh(
    keep(new THREE.CylinderGeometry(0.03, 0.03, 1, 4).translate(0, -0.5, 0)),
    lambert(keep, 0x6a6e74),
    n,
  );
  const riders = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.2, 8, 6).translate(0, 0.75, -0.05)), lambert(keep, 0xe8b88a), n);
  for (const m of [seats, chains, riders]) {
    m.frustumCulled = false;
    root.add(m);
  }
  let angle = 0;
  let last = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const len = 6;
  const stretch = new THREE.Vector3(1, len, 1);
  f.updates.push((time) => {
    const dt = Math.min(0.1, Math.max(0, time - last));
    last = time;
    // Un tour de manège de 30 s : il démarre, file, ralentit, s'arrête
    const u = time % 30;
    const w = u < 4 ? u / 4 : u < 22 ? 1 : u < 27 ? 1 - (u - 22) / 5 : 0;
    angle += w * 1.1 * dt;
    crown.rotation.y = angle;
    const tilt = 0.8 * w * w;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + angle;
      const rx = Math.cos(a);
      const rz = -Math.sin(a);
      // Le haut de la chaîne, sous le bord de la couronne ; le siège, écarté vers l'extérieur
      p.set(rx * 4.9, 12.7, rz * 4.9);
      // La chaîne penche vers l'extérieur (autour de l'axe tangent)
      q.setFromAxisAngle(axis.set(-rz, 0, rx), tilt);
      m4.compose(p, q, stretch);
      chains.setMatrixAt(i, m4);
      const seatPos = p.clone().add(v3(rx * Math.sin(tilt) * len, -Math.cos(tilt) * len, rz * Math.sin(tilt) * len));
      // Le siège regarde dans le sens où il file
      m4.compose(seatPos, new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-rz, rx)), one);
      seats.setMatrixAt(i, m4);
      riders.setMatrixAt(i, m4);
    }
    seats.instanceMatrix.needsUpdate = true;
    chains.instanceMatrix.needsUpdate = true;
    riders.instanceMatrix.needsUpdate = true;
  });
}

/** La tour de chute : une haute colonne illuminée, la nacelle qui monte lentement puis tombe d'un coup */
function addDropTower(f: Fair) {
  const { group, keep, heightAt, shadows } = f.ctx;
  const x = -128 * f.fx;
  const z = 248;
  const y0 = heightAt(x, z);
  take(f, x, z, 8);
  const H = 46;
  const root = new THREE.Group();
  root.position.set(x, y0, z);
  group.add(root);
  const column = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.3, 1.7, H, 12)), lambert(keep, 0xf2ede3));
  column.position.y = H / 2;
  column.castShadow = shadows;
  root.add(column);
  const red = lambert(keep, 0xc23028);
  for (let y = 4; y < H; y += 6) {
    const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.42, 1.42, 0.8, 12)), red);
    band.position.y = y;
    root.add(band);
  }
  const head = new THREE.Mesh(keep(new THREE.CylinderGeometry(2.4, 2.0, 2.4, 12)), red);
  head.position.y = H + 1.2;
  root.add(head);
  const beacon = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.5, 10, 8)),
    keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.4, 0.3) })),
  );
  beacon.position.y = H + 2.8;
  root.add(beacon);
  for (let y = 2; y < H; y += 2)
    for (let k = 0; k < 4; k++)
      bulb(
        f,
        v3(x + Math.cos((k * Math.PI) / 2 + 0.4) * 1.75, y0 + y, z + Math.sin((k * Math.PI) / 2 + 0.4) * 1.75),
        BULB[(y / 2) % 2 === 0 ? 2 : 1]!,
      );
  mergeStatic(root, keep, [beacon]);
  const ring = new THREE.Group();
  const seat = new THREE.Mesh(keep(new THREE.TorusGeometry(2.7, 0.55, 8, 24).rotateX(Math.PI / 2)), shiny(keep, 0xf2c230, 0.3));
  ring.add(seat);
  const riders = new THREE.Mesh(
    keep(
      merge(
        Array.from({ length: 10 }, (_, k) =>
          new THREE.SphereGeometry(0.22, 8, 6).translate(
            Math.cos((k / 10) * Math.PI * 2) * 3.2,
            0.5,
            Math.sin((k / 10) * Math.PI * 2) * 3.2,
          ),
        ),
      ),
    ),
    lambert(keep, 0xe8b88a),
  );
  ring.add(riders);
  root.add(ring);
  f.updates.push((time) => {
    // Un tour de 22 s : en bas, la montée, l'attente tout en haut, la chute, le freinage
    const u = time % 22;
    let y = 2;
    if (u < 3) y = 2;
    else if (u < 13) y = 2 + ((u - 3) / 10) * 38;
    else if (u < 15) y = 40;
    else if (u < 16.6) y = 40 - 0.5 * 12 * (u - 15) * (u - 15);
    else if (u < 18.5) y = 24.6 - (24.6 - 2) * Math.sin((((u - 16.6) / 1.9) * Math.PI) / 2);
    ring.position.y = y;
    beacon.visible = Math.sin(time * 6) > 0;
  });
}

/** La mare aux canards (d'où sortent les canards géants) et le stand de ballons (d'où partent les ballons) */
function addMoverHomes(f: Fair) {
  const { t, group, keep, heightAt, phone } = f.ctx;
  const water = lambert(keep, 0x3a8ad0, { emissive: 0x0a2a4a });
  const white = lambert(keep, 0xf2ede3);
  for (const m of t.movers) {
    if (m.kind !== "roll") continue;
    if (m.thing === "canard") {
      // Ils sortent toujours du côté gauche de la route (d < 0) et vont vers la droite
      for (const [d, rad] of [
        [-(t.wall + 9.5), 8],
        [t.wall + 6, 4.5],
      ] as const) {
        const c = pointAt(t, m.s, d);
        const y = heightAt(c.x, c.z);
        take(f, c.x, c.z, rad + 2);
        const pool = new THREE.Mesh(keep(new THREE.CircleGeometry(rad, 32).rotateX(-Math.PI / 2)), water);
        pool.position.set(c.x, y + 0.35, c.z);
        group.add(pool);
        const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(rad, 0.35, 6, 40).rotateX(Math.PI / 2)), white);
        rim.position.set(c.x, y + 0.4, c.z);
        group.add(rim);
        if (rad > 6) {
          // De petits canards qui tournent dans la mare, et l'enseigne de la pêche
          const ducks = new THREE.InstancedMesh(
            keep(
              merge([new THREE.SphereGeometry(0.35, 8, 6).scale(1, 0.7, 1.3), new THREE.SphereGeometry(0.2, 8, 6).translate(0, 0.3, 0.3)]),
            ),
            lambert(keep, 0xffd21f),
            phone ? 6 : 12,
          );
          ducks.frustumCulled = false;
          group.add(ducks);
          const m4 = new THREE.Matrix4();
          f.updates.push((time) => {
            for (let i = 0; i < ducks.count; i++) {
              const a = time * 0.3 + (i / ducks.count) * Math.PI * 2;
              const rr = rad * (0.45 + (i % 3) * 0.15);
              m4.compose(
                v3(c.x + Math.cos(a) * rr, y + 0.45 + Math.sin(time * 2 + i) * 0.04, c.z + Math.sin(a) * rr),
                new THREE.Quaternion().setFromAxisAngle(UP, -a),
                v3(1, 1, 1),
              );
              ducks.setMatrixAt(i, m4);
            }
            ducks.instanceMatrix.needsUpdate = true;
          });
          const sign = marquee(f, "PÊCHE AUX CANARDS", "#0f4a7a", "#fff6c4", 9, 1.5);
          const back = pointAt(t, m.s, d - rad - 1);
          sign.position.set(back.x, heightAt(back.x, back.z) + 3.4, back.z);
          sign.rotation.y = Math.atan2(c.x - back.x, c.z - back.z);
          group.add(sign);
        }
      }
    } else if (m.thing === "ballon") {
      // Un tas de ballons géants à gauche, le filet qui les attrape à droite
      const c = pointAt(t, m.s, -(t.wall + 6));
      const y = heightAt(c.x, c.z);
      take(f, c.x, c.z, 7);
      const spots: THREE.Matrix4[] = [];
      for (let k = 0; k < (phone ? 8 : 16); k++) {
        const a = k * 2.4;
        const rr = (k % 5) * 0.9;
        const sz = 0.9 + (k % 3) * 0.2;
        spots.push(place(c.x + Math.cos(a) * rr * 1.6, y + sz + Math.floor(k / 5) * 1.3, c.z + Math.sin(a) * rr * 1.6, a, sz));
      }
      const pile = instances(
        keep(new THREE.SphereGeometry(1, 16, 12)),
        keep(new THREE.MeshStandardMaterial({ roughness: 0.35 })),
        spots,
        false,
      );
      const color = new THREE.Color();
      spots.forEach((_, i) => pile.setColorAt(i, color.setHex(PAINT[i % 6]!)));
      if (pile.instanceColor) pile.instanceColor.needsUpdate = true;
      group.add(pile);
      const sign = marquee(f, "BALLONS GÉANTS", "#7a1a16", "#ffe9a8", 8, 1.4);
      const back = pointAt(t, m.s, -(t.wall + 12));
      sign.position.set(back.x, heightAt(back.x, back.z) + 4.6, back.z);
      sign.rotation.y = Math.atan2(c.x - back.x, c.z - back.z);
      group.add(sign);
      const net = pointAt(t, m.s, t.wall + 4.5);
      take(f, net.x, net.z, 6);
      const frame = new THREE.Group();
      frame.position.set(net.x, heightAt(net.x, net.z), net.z);
      frame.rotation.y = Math.atan2(net.tx, net.tz);
      for (const zz of [-6, 6]) {
        const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.12, 0.12, 6, 6)), white);
        post.position.set(0, 3, zz);
        frame.add(post);
      }
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const gg = cv.getContext("2d")!;
      gg.strokeStyle = "#f2ede3";
      gg.lineWidth = 3;
      for (let k = 0; k <= 64; k += 16) {
        gg.beginPath();
        gg.moveTo(k, 0);
        gg.lineTo(k, 64);
        gg.moveTo(0, k);
        gg.lineTo(64, k);
        gg.stroke();
      }
      const netTex = keep(new THREE.CanvasTexture(cv));
      netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
      netTex.repeat.set(12, 6);
      const mesh = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(12, 5.6)),
        lambert(keep, 0xffffff, { map: netTex, alphaTest: 0.5, side: THREE.DoubleSide }),
      );
      mesh.rotation.y = Math.PI / 2;
      mesh.position.y = 3;
      frame.add(mesh);
      group.add(frame);
    }
  }
}

/** L'arche de l'entrée, juste avant la ligne : deux tours à bulbes dorés et la grande enseigne « FÊTE FORAINE » */
function addEntrance(f: Fair, s: number) {
  const { t, group, keep, heightAt, shadows } = f.ctx;
  const c = pointAt(t, s, 0);
  const span = t.wall + 2.2;
  const root = new THREE.Group();
  root.position.set(c.x, c.y, c.z);
  root.rotation.y = Math.atan2(c.tx, c.tz);
  group.add(root);
  const red = lambert(keep, 0xb8262a);
  const gold = shiny(keep, 0xe8b530);
  for (const sx of [-1, 1]) {
    const p = pointAt(t, s, sx * span);
    take(f, p.x, p.z, 3);
    const ground = heightAt(p.x, p.z) - c.y;
    const tower = new THREE.Mesh(keep(new THREE.BoxGeometry(2.2, 11 - ground, 2.2)), red);
    tower.position.set(sx * span, ground + (11 - ground) / 2, 0);
    tower.castShadow = shadows;
    root.add(tower);
    const dome = new THREE.Mesh(keep(new THREE.SphereGeometry(1.5, 16, 12)), gold);
    dome.position.set(sx * span, 12, 0);
    root.add(dome);
    const spike = new THREE.Mesh(keep(new THREE.ConeGeometry(0.4, 2, 10)), gold);
    spike.position.set(sx * span, 14, 0);
    root.add(spike);
  }
  // Local +x est à gauche de la route : l'arche est symétrique, l'enseigne regarde ceux qui arrivent (vers -z)
  const sign = marquee(f, "FÊTE FORAINE", "#7a1a16", "#ffe9a8", span * 2 - 2.2, 3.6, 2048);
  sign.position.set(0, 9, -0.25);
  sign.rotation.y = Math.PI;
  root.add(sign);
  const board = new THREE.Mesh(keep(new THREE.BoxGeometry(span * 2 - 2, 3.9, 0.4)), red);
  board.position.set(0, 9, 0);
  root.add(board);
  mergeStatic(root, keep);
}

/**
 * Les guirlandes d'ampoules au-dessus de l'allée : des mâts de chaque côté, une guirlande en travers de la route et une
 * autre qui court d'un mât à l'autre. Les ampoules s'allument tour à tour, en chenillard.
 */
function addGarlands(f: Fair) {
  const { t, group, keep, heightAt } = f.ctx;
  const L = t.length;
  const sections: [number, number][] = [
    [L - 56, L + 140],
    [246, 312],
    [642, 672],
  ];
  const posts: THREE.Matrix4[] = [];
  const wires: number[] = [];
  const chase: { pos: number[]; col: number[] }[] = [0, 1, 2].map(() => ({ pos: [], col: [] }));
  let count = 0;
  const add = (p: THREE.Vector3, k: number) => {
    const g = chase[count++ % 3]!;
    g.pos.push(p.x, p.y, p.z);
    const c = BULB[k % BULB.length]!;
    g.col.push(c.r, c.g, c.b);
  };
  const sag = (a: THREE.Vector3, b: THREE.Vector3, n: number, drop: number, k0: number) => {
    let prev = a;
    for (let i = 1; i <= n; i++) {
      const u = i / (n + 1);
      const p = a.clone().lerp(b, u);
      p.y -= drop * 4 * u * (1 - u);
      add(p, k0 + i);
      wires.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
    wires.push(prev.x, prev.y, prev.z, b.x, b.y, b.z);
  };
  for (const [from, to] of sections) {
    let prevTops: [THREE.Vector3, THREE.Vector3] | null = null;
    for (let s0 = from; s0 <= to; s0 += 16) {
      const s = wrapS(t, s0);
      if (f.clearAt(s)) {
        prevTops = null;
        continue;
      }
      const tops = [-1, 1].map((side) => {
        const p = pointAt(t, s, side * (t.wall + 0.6));
        const y = heightAt(p.x, p.z);
        posts.push(place(p.x, y, p.z));
        return v3(p.x, y + 7.6, p.z);
      }) as [THREE.Vector3, THREE.Vector3];
      sag(tops[0], tops[1], 13, 1.4, Math.round(s0));
      if (prevTops) for (const k of [0, 1]) sag(prevTops[k]!, tops[k]!, 8, 0.9, k);
      prevTops = tops;
    }
  }
  const postGeo = keep(
    merge([new THREE.CylinderGeometry(0.09, 0.13, 7.8, 6).translate(0, 3.9, 0), new THREE.SphereGeometry(0.2, 8, 6).translate(0, 7.85, 0)]),
  );
  group.add(instances(postGeo, lambert(keep, 0x24302c), posts, false));
  const wireGeo = keep(new THREE.BufferGeometry());
  wireGeo.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
  group.add(new THREE.LineSegments(wireGeo, keep(new THREE.LineBasicMaterial({ color: 0x2a2a2a }))));
  const lights = chase.map((c) => {
    const pts = bulbPoints(f, c.pos, c.col, 1.45);
    group.add(pts);
    return pts.material as THREE.PointsMaterial;
  });
  f.updates.push((time) => {
    lights.forEach((m, k) => {
      m.opacity = 0.35 + 0.65 * Math.max(0, Math.cos(time * 3.2 - (k * Math.PI * 2) / 3));
    });
  });
}

/**
 * Les stands, serrés le long de la route derrière les barrières, avec un passage pour les visiteurs : leur devant et
 * leur enseigne (l'image des stands), leurs côtés peints, leur toit, leur store rayé au-dessus du comptoir. Des
 * visiteurs regardent passer la course dans l'allée.
 */
function addStalls(f: Fair) {
  const { t, group, keep, heightAt, distAt, shadows, r, phone } = f.ctx;
  const tex = stallTextures();
  keep(tex.color);
  keep(tex.lit);
  const awning = keep(awningTexture());
  const fronts = new Faces();
  const bodies = new Faces();
  const awnings = new Faces();
  const white = new THREE.Color(1, 1, 1);
  const allee = (s: number) => s > t.length - 60 || s < 145;
  const H = 3.4;
  for (const side of [-1, 1]) {
    let s = 2;
    while (s < t.length - 4) {
      const w = 6 + r() * 3;
      const depth = 4.2;
      if (f.clearAt(s) || f.clearAt(s + w / 2) || f.clearAt(s + w)) {
        s += 3;
        continue;
      }
      const front = side * (t.wall + 2.2);
      const mid = pointAt(t, s + w / 2, front);
      const rot = Math.atan2(mid.tx, mid.tz) + (side > 0 ? Math.PI : 0);
      const along = v3(Math.sin(rot), 0, Math.cos(rot));
      const away = v3(Math.cos(rot), 0, -Math.sin(rot));
      const at = (u: number, v: number) => v3(mid.x + along.x * u + away.x * v, 0, mid.z + along.z * u + away.z * v);
      let ok = true;
      let low = Infinity;
      for (const [u, v] of [
        [-w / 2, depth],
        [w / 2, depth],
        [0, depth],
        [-w / 2, 0],
        [w / 2, 0],
        [0, depth / 2],
      ] as const) {
        const p = at(u, v);
        if (distAt(p.x, p.z) < t.wall + 1.6 + v * 0.7 || !free(f, p.x, p.z, 1)) ok = false;
        low = Math.min(low, heightAt(p.x, p.z));
      }
      if (!ok) {
        s += 3;
        continue;
      }
      const kind = Math.floor(r() * STALL_COUNT);
      const y0 = heightAt(mid.x, mid.z);
      const base = Math.min(low, y0) - 0.3;
      const col = kind % STALL_COLS;
      const row = Math.floor(kind / STALL_COLS);
      const u0 = col / STALL_COLS;
      const u1 = (col + 1) / STALL_COLS;
      const vTop = 1 - row / STALL_ROWS;
      const vSign = vTop - STALL_SIGN / STALL_ROWS;
      const vBottom = 1 - (row + 1) / STALL_ROWS;
      const P = (u: number, v: number, y: number) => at(u, v).setY(y);
      const toRoad = away.clone().negate();
      fronts.quad(
        P(-w / 2, 0, y0),
        P(w / 2, 0, y0),
        P(w / 2, 0, y0 + H),
        P(-w / 2, 0, y0 + H),
        [u0, vBottom, u1, vBottom, u1, vSign, u0, vSign],
        white,
        toRoad,
      );
      fronts.quad(
        P(-w / 2, 0, y0 + H),
        P(w / 2, 0, y0 + H),
        P(w / 2, 0, y0 + H + 1.2),
        P(-w / 2, 0, y0 + H + 1.2),
        [u0, vSign, u1, vSign, u1, vTop, u0, vTop],
        white,
        toRoad,
      );
      const paint = new THREE.Color(STALL_TRIMS[kind]!).multiplyScalar(0.8);
      bodies.quad(P(-w / 2, 0, base), P(w / 2, 0, base), P(w / 2, 0, y0), P(-w / 2, 0, y0), NO_UV, paint, toRoad);
      bodies.quad(P(-w / 2, depth, base), P(w / 2, depth, base), P(w / 2, depth, y0 + H), P(-w / 2, depth, y0 + H), NO_UV, paint, away);
      for (const u of [-w / 2, w / 2]) {
        const out = along.clone().multiplyScalar(Math.sign(u));
        bodies.quad(P(u, 0, base), P(u, depth, base), P(u, depth, y0 + H), P(u, 0, y0 + H + 1.2), NO_UV, paint, out);
      }
      bodies.quad(
        P(-w / 2, 0, y0 + H),
        P(w / 2, 0, y0 + H),
        P(w / 2, depth, y0 + H),
        P(-w / 2, depth, y0 + H),
        NO_UV,
        new THREE.Color(0x5a5048),
        UP,
      );
      // Le store rayé, qui avance au-dessus du passage
      const a = Math.floor(r() * AWNING_KINDS);
      const aTop = 1 - (a * 64) / 256;
      const aBottom = 1 - (a * 64 + 62) / 256;
      awnings.quad(
        P(-w / 2, 0, y0 + 3.05),
        P(w / 2, 0, y0 + 3.05),
        P(w / 2, -1.7, y0 + 2.5),
        P(-w / 2, -1.7, y0 + 2.5),
        [0, aTop, w / 6.4, aTop, w / 6.4, aBottom, 0, aBottom],
        white,
        UP,
      );
      // Des visiteurs dans l'allée, qui regardent la course
      if (allee(s)) {
        for (let u = -w / 2 + 1; u < w / 2; u += 2.6) {
          if (r() > (phone ? 0.3 : 0.6)) continue;
          const p = pointAt(t, s + w / 2 + u, side * (t.wall + 1.1 + r() * 0.7));
          const look = pointAt(t, s + w / 2 + u + (r() - 0.5) * 20, 0);
          visitor(f, p.x, heightAt(p.x, p.z), p.z, look.x, look.z);
        }
      }
      s += w + (r() < 0.22 ? 4 + r() * 6 : 0.3);
    }
  }
  const front = new THREE.Mesh(
    fronts.geometry(keep),
    keep(new THREE.MeshLambertMaterial({ map: tex.color, emissiveMap: tex.lit, emissive: 0xffffff, emissiveIntensity: 1.15 })),
  );
  front.receiveShadow = shadows;
  group.add(front);
  const body = new THREE.Mesh(bodies.geometry(keep), keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
  body.castShadow = shadows;
  body.receiveShadow = shadows;
  group.add(body);
  group.add(
    new THREE.Mesh(awnings.geometry(keep), keep(new THREE.MeshLambertMaterial({ map: awning, alphaTest: 0.5, side: THREE.DoubleSide }))),
  );
}

/** Autour de la fête : des platanes, et les caravanes des forains garées en rangs */
function addOutskirts(f: Fair) {
  const { t, group, keep, heightAt, distAt, shadows, r, phone } = f.ctx;
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
  const trees: THREE.Matrix4[] = [];
  for (let k = 0; k < (phone ? 300 : 600) && trees.length < (phone ? 40 : 75); k++) {
    const x = minX - 120 + r() * (maxX - minX + 240);
    const z = minZ - 120 + r() * (maxZ - minZ + 240);
    const d = distAt(x, z);
    if (d < t.wall + 12 || d > 170 || !free(f, x, z, 4)) continue;
    take(f, x, z, 3);
    trees.push(place(x, heightAt(x, z), z, r() * 6, 0.9 + r() * 0.4));
  }
  const trunk = keep(new THREE.CylinderGeometry(0.25, 0.35, 5, 7).translate(0, 2.5, 0));
  const crown = keep(new THREE.IcosahedronGeometry(3.2, 1).translate(0, 7, 0));
  group.add(instances(trunk, lambert(keep, 0x5a4a3a), trees, shadows));
  const leaves = instances(crown, lambert(keep, 0xffffff, { flatShading: true }), trees, shadows);
  const color = new THREE.Color();
  trees.forEach((_, i) => leaves.setColorAt(i, color.setHex([0x4f6a2e, 0x5e7a34, 0x6b7a30, 0x46622a][i % 4]!)));
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  group.add(leaves);
  // Les caravanes, par petits groupes, loin de la route
  const bodies: THREE.Matrix4[] = [];
  const stripes: THREE.Matrix4[] = [];
  const windows: THREE.Matrix4[] = [];
  for (let k = 0; k < 400 && bodies.length < (phone ? 10 : 22); k++) {
    const x = minX - 90 + r() * (maxX - minX + 180);
    const z = minZ - 90 + r() * (maxZ - minZ + 180);
    const d = distAt(x, z);
    if (d < t.wall + 30 || d > 120 || !free(f, x, z, 6)) continue;
    const rot = r() * Math.PI;
    for (let j = 0; j < 3; j++) {
      const ox = x + Math.cos(rot) * j * 4;
      const oz = z - Math.sin(rot) * j * 4;
      if (!free(f, ox, oz, 4) || distAt(ox, oz) < t.wall + 25) continue;
      take(f, ox, oz, 4.2);
      const y = heightAt(ox, oz);
      bodies.push(place(ox, y + 1.55, oz, rot, 2.4, 2.6, 7));
      stripes.push(place(ox, y + 1.2, oz, rot, 2.44, 0.35, 7.04));
      windows.push(place(ox, y + 2.0, oz, rot, 2.46, 0.6, 5.2));
    }
  }
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  group.add(instances(box, lambert(keep, 0xf2ead8), bodies, shadows));
  group.add(instances(box, lambert(keep, 0x2f6fd0), stripes, false));
  group.add(instances(box, lambert(keep, 0x2a3440, { emissive: 0x3a2a10 }), windows, false));
}

/** Toute la fête */
export function buildFoire(ctx: FoireContext): Foire {
  const { t, group, keep, phone } = ctx;
  const L = t.length;
  const near = (s: number, x: number, gap: number) => Math.abs(((((s - x) % L) + L * 1.5) % L) - L / 2) < gap;
  const [s1, s2] = ctx.tunnel;
  const entrance = wrapS(t, -50);
  const f: Fair = {
    ctx,
    fx: t.def.id.endsWith("-miroir") ? -1 : 1,
    taken: [],
    crowd: new Crowd(keep, phone ? 130 : 240),
    seed: 3,
    bulbs: { pos: [], col: [] },
    glow: keep(glowTexture()),
    updates: [],
    clearAt: (s) =>
      t.crossers.some((c) => near(s, c.s, 13)) ||
      t.movers.some((m) => near(s, m.s, m.kind === "drop" ? 9 : 8)) ||
      t.gaps.some((g) => near(s, (g.from + g.to) / 2, (g.to - g.from) / 2 + 12)) ||
      (s1 >= 0 && near(s, (s1 + s2) / 2, (s2 - s1) / 2 + 5)) ||
      near(s, entrance, 5) ||
      near(s, 0, 7),
  };
  // Les grandes pièces d'abord ; les stands, les arbres et les caravanes se glissent entre elles
  addWheel(f);
  addCarousel(f);
  addTent(f);
  addHoop(f);
  addCoaster(f);
  addPavilion(f);
  addSwings(f);
  addDropTower(f);
  addMoverHomes(f);
  addEntrance(f, entrance);
  addGarlands(f);
  addStalls(f);
  addOutskirts(f);
  group.add(bulbPoints(f, f.bulbs.pos, f.bulbs.col, 1.3));
  f.crowd.done();
  group.add(f.crowd.bodies, f.crowd.heads);
  return {
    update(time) {
      f.crowd.update(time);
      for (const u of f.updates) u(time);
    },
  };
}
