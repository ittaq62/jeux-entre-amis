// Ce qui anime le circuit : le grand trou après le tremplin (ses berges, l'eau au fond), la grue qui lâche des
// conteneurs, les tonneaux, les boules de neige et les moutons qui traversent, les trampolines, la boue et le verglas.
// Tout suit les horaires de la conduite : ce qu'on voit est exactement ce qui peut nous toucher.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  CURB,
  DROP_FALL,
  DROP_LIFT,
  DROP_STAY,
  DROP_WARN,
  dropAt,
  pointAt,
  rollAt,
  SPRING_RADIUS,
  type Mover,
  type Theme,
  type Track,
} from "../../../shared/games/bolides/track.ts";
import { mergeDeep } from "./merge.ts";
import * as TX from "./textures.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

export interface LifeContext {
  t: Track;
  keep: Keep;
  heightAt: (x: number, z: number) => number;
  shadows: boolean;
  phone: boolean;
}

/** Ce qui vient de se passer sur la route, pour les sons et les particules */
export type LifeEvent =
  | { kind: "clang"; x: number; y: number; z: number }
  | { kind: "trail"; x: number; y: number; z: number; thing: "tonneau" | "boule" }
  | { kind: "baa"; x: number; z: number };

/** La profondeur de l'eau sous la route */
export const WATER_DEPTH = 4.5;
const BEAM_Y = 15;
const CONTAINER = { w: 2.8, h: 2.6, l: 7.2 };

const std = (color: THREE.ColorRepresentation, roughness = 0.6, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement, keep: Keep, repeat = false): THREE.CanvasTexture {
  const t = keep(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Des bandes jaunes et noires en biais */
function hatch(keep: Keep, c0 = "#f2c230", c1 = "#222"): THREE.CanvasTexture {
  const [c, g] = canvas(128, 64);
  g.fillStyle = c0;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = c1;
  for (let x = -64; x < 160; x += 32) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 16, 64);
    g.lineTo(x + 48, 0);
    g.lineTo(x + 32, 0);
    g.fill();
  }
  return texture(c, keep, true);
}

/** La berge d'un trou : du béton taché, une bande de danger tout en haut */
function bankTexture(keep: Keep): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#8d8f90";
  g.fillRect(0, 0, 256, 256);
  const r = rng(77);
  for (let i = 0; i < 340; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)";
    g.fillRect(r() * 256, r() * 256, 1 + r() * 8, 1 + r() * 8);
  }
  for (let i = 0; i < 26; i++) {
    const x = r() * 256;
    const grad = g.createLinearGradient(0, 30, 0, 200);
    grad.addColorStop(0, "rgba(40,30,20,0.32)");
    grad.addColorStop(1, "rgba(40,30,20,0)");
    g.fillStyle = grad;
    g.fillRect(x, 30, 2 + r() * 8, 110 + r() * 110);
  }
  g.fillStyle = "#f2c230";
  g.fillRect(0, 0, 256, 34);
  g.fillStyle = "#1d1d1d";
  for (let x = -40; x < 300; x += 40) {
    g.beginPath();
    g.moveTo(x, 34);
    g.lineTo(x + 20, 34);
    g.lineTo(x + 54, 0);
    g.lineTo(x + 34, 0);
    g.fill();
  }
  return texture(c, keep, true);
}

/** Un panneau triangulaire, avec son dessin */
function signTexture(keep: Keep, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = "#d8352a";
  g.beginPath();
  g.moveTo(64, 6);
  g.lineTo(122, 116);
  g.lineTo(6, 116);
  g.closePath();
  g.fill();
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(64, 30);
  g.lineTo(104, 104);
  g.lineTo(24, 104);
  g.closePath();
  g.fill();
  g.fillStyle = "#222";
  g.strokeStyle = "#222";
  draw(g);
  return texture(c, keep);
}

const SIGN_ICONS: Record<"gap" | "drop" | "tonneau" | "boule" | "mouton", (g: CanvasRenderingContext2D) => void> = {
  gap: (g) => {
    // Deux bouts de route, et le vide entre les deux
    g.fillRect(36, 84, 20, 12);
    g.fillRect(72, 84, 20, 12);
    g.beginPath();
    g.moveTo(40, 80);
    g.quadraticCurveTo(64, 46, 88, 80);
    g.lineWidth = 5;
    g.stroke();
  },
  drop: (g) => {
    g.fillRect(48, 46, 32, 16);
    g.fillRect(61, 64, 6, 18);
    g.beginPath();
    g.moveTo(52, 80);
    g.lineTo(76, 80);
    g.lineTo(64, 98);
    g.fill();
  },
  tonneau: (g) => {
    g.lineWidth = 4;
    g.beginPath();
    g.arc(64, 78, 18, 0, Math.PI * 2);
    g.stroke();
    g.fillRect(46, 76, 36, 4);
    g.fillRect(62, 60, 4, 36);
  },
  boule: (g) => {
    g.beginPath();
    g.arc(64, 78, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(58, 72, 6, 0, Math.PI * 2);
    g.fill();
  },
  mouton: (g) => {
    g.beginPath();
    g.ellipse(62, 76, 20, 13, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(88, 68, 7, 9, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillRect(48, 86, 5, 14);
    g.fillRect(70, 86, 5, 14);
  },
};

/** Une bande de route, de s0 à s1 et de d1 à d2, juste au-dessus du sol */
function strip(t: Track, s0: number, s1: number, d1: number, d2: number, lift: number, world: boolean): THREE.BufferGeometry {
  const n = Math.max(1, Math.ceil((s1 - s0) / 2));
  const pos = new Float32Array((n + 1) * 6);
  const uv = new Float32Array((n + 1) * 4);
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const a = pointAt(t, s, d1);
    const b = pointAt(t, s, d2);
    pos.set([a.x, a.y + lift, a.z, b.x, b.y + lift, b.z], i * 6);
    if (world) uv.set([a.x / 18, a.z / 18, b.x / 18, b.z / 18], i * 4);
    else uv.set([0, i / n, 1, i / n], i * 4);
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

type DropMover = Extract<Mover, { kind: "drop" }>;
type RollMover = Extract<Mover, { kind: "roll" }>;

interface DropItem {
  m: DropMover;
  trolley: THREE.Group;
  box: THREE.Group;
  cable: THREE.Mesh;
  warn: THREE.Mesh;
  warnMat: THREE.MeshBasicMaterial;
  lamps: THREE.MeshStandardMaterial;
  phase: string;
}

interface RollItem {
  m: RollMover;
  /** Chaque objet : sa place (tourné dans le sens de la route) et ce qui roule dedans */
  parts: { group: THREE.Group; spin: THREE.Object3D }[];
}

interface SheepItem {
  m: RollMover;
  white: THREE.InstancedMesh;
  dark: THREE.InstancedMesh;
  head: number;
}

export class TrackLife {
  readonly group = new THREE.Group();
  private drops: DropItem[] = [];
  private rolls: RollItem[] = [];
  private sheep: SheepItem[] = [];
  private springs: { top: THREE.Object3D; i: number }[] = [];
  private water: THREE.CanvasTexture[] = [];
  private tick = 0;
  private baaAt = 0;
  private events: LifeEvent[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, "YXZ");
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(private ctx: LifeContext) {
    const { t } = ctx;
    const theme = t.def.theme;
    this.buildGaps(theme);
    const icons = new Map<string, THREE.CanvasTexture>();
    const signFor = (name: keyof typeof SIGN_ICONS) => {
      let tex = icons.get(name);
      if (!tex) {
        tex = signTexture(ctx.keep, SIGN_ICONS[name]);
        icons.set(name, tex);
      }
      return tex;
    };
    for (const g of t.gaps) this.addSigns(g.from - 44, signFor("gap"));
    for (const m of t.movers) {
      if (m.kind === "drop") {
        this.addSigns(m.s - 44, signFor("drop"));
        this.buildDrop(m);
      } else {
        this.addSigns(m.s - 40, signFor(m.thing));
        this.addCrossing(m);
        if (m.thing === "mouton") this.buildSheep(m);
        else this.buildRoll(m);
      }
    }
    this.buildSprings();
    this.buildZones();
  }

  /** Les panneaux qui préviennent, des deux côtés, tournés vers ceux qui arrivent */
  private addSigns(s: number, tex: THREE.CanvasTexture) {
    const { t, keep, heightAt } = this.ctx;
    const post = keep(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6));
    const board = keep(new THREE.PlaneGeometry(1.5, 1.5));
    const postMat = keep(new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
    const boardMat = keep(new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
    for (const side of [-1, 1]) {
      const at = pointAt(t, s, side * (t.half + 2.2));
      const back = pointAt(t, s - 30, 0);
      const y = heightAt(at.x, at.z);
      const pole = new THREE.Mesh(post, postMat);
      pole.position.set(at.x, y + 1.1, at.z);
      const sign = new THREE.Mesh(board, boardMat);
      sign.position.set(at.x, y + 2.4, at.z);
      sign.rotation.y = Math.atan2(back.x - at.x, back.z - at.z);
      this.group.add(pole, sign);
    }
  }

  /** Le trou : les deux berges en béton, l'eau au fond, des rochers, l'herbe des bords jusqu'au vide, l'arche qui l'annonce */
  private buildGaps(theme: Theme) {
    const { t, keep, shadows } = this.ctx;
    if (t.gaps.length === 0) return;
    const step = t.length / t.n;
    const bank = bankTexture(keep);
    const bankMat = keep(new THREE.MeshLambertMaterial({ map: bank }));
    const groundTex = keep(TX.groundTexture(theme));
    const grass = keep(new THREE.MeshLambertMaterial({ map: groundTex }));
    const rockMat = keep(new THREE.MeshLambertMaterial({ color: theme === "col" ? 0xc7d4e0 : 0x6f7276, flatShading: true }));
    const rockGeo = keep(new THREE.DodecahedronGeometry(1, 0));
    const tint = theme === "col" ? 0xcdeeff : theme === "vignes" ? 0x9ed6ae : 0xffffff;
    const r = rng(t.n);
    for (const g of t.gaps) {
      const far = Math.ceil((g.to - 0.01) / step) * step;
      const wide = (t.wall + 0.4) * 2;
      const mid = pointAt(t, (g.from + far) / 2, 0);
      const h = Math.atan2(mid.tx, mid.tz);
      const tall = 13;
      bank.repeat.set(wide / 9, 1);
      for (const [s, off] of [
        [g.from, -0.6],
        [far, 0.6],
      ] as const) {
        const p = pointAt(t, s + off, 0);
        const wall = new THREE.Mesh(keep(new THREE.BoxGeometry(wide, tall, 1.2)), bankMat);
        wall.position.set(p.x, p.y + 0.03 - tall / 2, p.z);
        wall.rotation.y = h;
        this.group.add(wall);
      }
      // L'eau, à mi-hauteur du trou
      const tex = keep(TX.waterTexture());
      tex.repeat.set(3, 1.4);
      this.water.push(tex);
      const water = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(wide, far - g.from + 1)),
        keep(new THREE.MeshLambertMaterial({ map: tex, color: tint })),
      );
      water.rotation.set(-Math.PI / 2, 0, h + Math.PI);
      water.position.set(mid.x, mid.y - WATER_DEPTH, mid.z);
      this.group.add(water);
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 9);
      for (let i = 0; i < 9; i++) {
        const along = (r() - 0.5) * (far - g.from - 2);
        const side = (r() < 0.5 ? -1 : 1) * (t.half * 0.7 + r() * (t.wall - t.half * 0.7));
        const p = pointAt(t, (g.from + far) / 2 + along, side);
        const sz = 0.9 + r() * 1.5;
        this.m4.compose(
          this.p.set(p.x, mid.y - WATER_DEPTH + sz * 0.2, p.z),
          this.q.setFromEuler(this.e.set(r() * 3, r() * 6, 0)),
          this.s.set(sz * 1.2, sz, sz),
        );
        rocks.setMatrixAt(i, this.m4);
      }
      this.group.add(rocks);
      // L'herbe des bords va jusqu'au vide (le terrain, lui, plonge un peu avant)
      for (const [a, b] of [
        [g.from - 16, g.from],
        [far, far + 16],
      ] as const) {
        for (const sd of [-1, 1]) {
          const d1 = sd * (t.half + CURB);
          const d2 = sd * (t.wall + 0.4);
          const patch = new THREE.Mesh(keep(strip(t, a, b, Math.min(d1, d2), Math.max(d1, d2), -0.03, true)), grass);
          patch.receiveShadow = shadows;
          this.group.add(patch);
        }
      }
      // L'arche qui annonce le saut
      const at = pointAt(t, g.from - 32, 0);
      const arch = new THREE.Group();
      const postGeo = keep(new THREE.BoxGeometry(0.5, 6.2, 0.5));
      const dark = keep(new THREE.MeshLambertMaterial({ color: 0x2b2f36 }));
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, dark);
        post.position.set(side * (t.half + 2), 3.1, 0);
        arch.add(post);
      }
      const label = keep(new THREE.MeshLambertMaterial({ map: keep(TX.bannerTexture("GRAND SAUT", "#1c2740", "#ffd23a")) }));
      const beam = new THREE.Mesh(keep(new THREE.BoxGeometry((t.half + 2) * 2 + 0.5, 1.4, 0.4)), [dark, dark, dark, dark, label, label]);
      beam.position.y = 5.6;
      arch.add(beam);
      arch.position.set(at.x, at.y, at.z);
      arch.rotation.y = Math.atan2(at.tx, at.tz) + Math.PI;
      this.group.add(arch);
    }
  }

  /** Le portique au-dessus de la route, son chariot, son câble, le conteneur, et le rectangle qui clignote au sol */
  private buildDrop(m: DropMover) {
    const { t, keep, shadows } = this.ctx;
    const base = pointAt(t, m.s, 0);
    const h = Math.atan2(base.tx, base.tz);
    const paint = keep(std(0xe8a92c, 0.5, 0.2));
    const dark = keep(std(0x34383f, 0.6, 0.3));
    const frame = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rz = 0, rx = 0) => {
      const mesh = new THREE.Mesh(keep(geo), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, 0, rz);
      mesh.castShadow = shadows;
      frame.add(mesh);
    };
    const span = t.wall + 2;
    for (const side of [-1, 1]) {
      for (const along of [-3, 3]) add(new THREE.BoxGeometry(0.8, BEAM_Y + 0.5, 0.8), paint, side * span, (BEAM_Y + 0.5) / 2, along);
      // Les traverses entre les deux pieds
      add(new THREE.BoxGeometry(0.4, 0.4, 6), dark, side * span, 5, 0);
      add(new THREE.BoxGeometry(0.4, 0.4, 6), dark, side * span, 10, 0);
      // La base sur rails
      add(new THREE.BoxGeometry(1.4, 0.8, 8), dark, side * span, 0.4, 0);
    }
    for (const along of [-1.3, 1.3]) add(new THREE.BoxGeometry(span * 2 + 3, 1.1, 0.8), paint, 0, BEAM_Y, along);
    frame.position.set(base.x, base.y, base.z);
    frame.rotation.y = h;
    frame.updateMatrixWorld(true);
    mergeDeep(frame, keep);
    this.group.add(frame);
    // Le chariot, qui roule sur le portique
    const trolley = new THREE.Group();
    const cart = new THREE.Mesh(keep(new THREE.BoxGeometry(3, 1.2, 3.8)), keep(std(0xd8352a, 0.5, 0.2)));
    cart.position.y = BEAM_Y + 1.1;
    cart.castShadow = shadows;
    trolley.add(cart);
    const lamps = keep(new THREE.MeshStandardMaterial({ color: 0xff8a00, emissive: 0xff7a00, emissiveIntensity: 0.2, roughness: 0.3 }));
    for (const x of [-1.5, 1.5]) {
      const lamp = new THREE.Mesh(keep(new THREE.SphereGeometry(0.24, 10, 8)), lamps);
      lamp.position.set(x, BEAM_Y + 1.85, 0);
      trolley.add(lamp);
    }
    trolley.rotation.y = h;
    this.group.add(trolley);
    const cable = new THREE.Mesh(keep(new THREE.BoxGeometry(0.16, 1, 0.16)), dark);
    this.group.add(cable);
    // Le conteneur
    const box = new THREE.Group();
    const tex = keep(TX.containerTexture());
    const colors = [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910];
    const body = new THREE.Mesh(
      keep(new THREE.BoxGeometry(CONTAINER.w, CONTAINER.h, CONTAINER.l)),
      keep(new THREE.MeshLambertMaterial({ map: tex, color: colors[Math.floor(m.s) % colors.length]! })),
    );
    body.position.y = CONTAINER.h / 2;
    body.castShadow = shadows;
    box.add(body);
    box.rotation.y = h;
    this.group.add(box);
    // Là où il va tomber : un rectangle rouge et jaune qui clignote
    const warnMat = keep(
      new THREE.MeshBasicMaterial({ map: hatch(keep, "#ff3b2a", "#ffd23a"), transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    (warnMat.map as THREE.Texture).repeat.set(2, 3);
    const warn = new THREE.Mesh(keep(new THREE.PlaneGeometry(CONTAINER.w + 0.9, CONTAINER.l + 1)), warnMat);
    warn.rotation.set(-Math.PI / 2, 0, h + Math.PI);
    this.group.add(warn);
    this.drops.push({ m, trolley, box, cable, warn, warnMat, lamps, phase: "none" });
  }

  /** Les bandes peintes en travers de la route (des rayures blanches pour les moutons), et les trappes dans les murets */
  private addCrossing(m: RollMover) {
    const { t, keep, heightAt, shadows } = this.ctx;
    const p = pointAt(t, m.s, 0);
    const h = Math.atan2(p.tx, p.tz);
    const width = (t.half + CURB) * 2;
    let map: THREE.CanvasTexture;
    if (m.thing === "mouton") {
      const [c, g] = canvas(128, 64);
      g.fillStyle = "#3c3f45";
      g.fillRect(0, 0, 128, 64);
      g.fillStyle = "#f4f2ea";
      for (let x = 0; x < 128; x += 32) g.fillRect(x + 6, 0, 18, 64);
      map = texture(c, keep, true);
    } else map = hatch(keep);
    map.repeat.set(width / 4, 1);
    const mark = new THREE.Mesh(keep(new THREE.PlaneGeometry(width, 3.8)), keep(new THREE.MeshLambertMaterial({ map })));
    mark.rotation.set(-Math.PI / 2, 0, h + Math.PI);
    mark.position.set(p.x, p.y + 0.085, p.z);
    this.group.add(mark);
    for (const side of [-1, 1]) {
      const at = pointAt(t, m.s, side * (t.wall + 0.1));
      const y = heightAt(at.x, at.z);
      if (m.thing === "boule") {
        // Un gros tas de neige : les boules en sortent, et s'y perdent de l'autre côté
        const mound = new THREE.Mesh(keep(new THREE.SphereGeometry(4.2, 16, 10)), keep(new THREE.MeshLambertMaterial({ color: 0xf6f9fc })));
        mound.scale.set(1, 0.72, 1.3);
        mound.position.set(at.x, y, at.z);
        mound.rotation.y = h;
        mound.castShadow = shadows;
        this.group.add(mound);
      } else {
        // Une porte ouverte dans le muret, sombre, avec son cadre de bois
        const [c, g] = canvas(64, 64);
        g.fillStyle = "#15120f";
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = "#8a5a33";
        g.fillRect(0, 0, 64, 8);
        g.fillRect(0, 0, 8, 64);
        g.fillRect(56, 0, 8, 64);
        const door = new THREE.Mesh(
          keep(new THREE.PlaneGeometry(3.6, 3.3)),
          keep(new THREE.MeshLambertMaterial({ map: texture(c, keep) })),
        );
        door.position.set(at.x, y + 1.6, at.z);
        door.rotation.y = h + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        this.group.add(door);
      }
    }
  }

  private buildRoll(m: RollMover) {
    const { keep, shadows, phone } = this.ctx;
    let geo: THREE.BufferGeometry;
    let mat: THREE.Material | THREE.Material[];
    if (m.thing === "tonneau") {
      // Allongé le long de la route : il roule de côté
      const [c, g] = canvas(256, 128);
      for (let x = 0; x < 256; x += 21) {
        g.fillStyle = x % 42 === 0 ? "#9a6236" : "#865229";
        g.fillRect(x, 0, 20, 128);
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(x + 20, 0, 2, 128);
      }
      g.fillStyle = "#3a3d44";
      g.fillRect(0, 18, 256, 12);
      g.fillRect(0, 98, 256, 12);
      const cap = keep(new THREE.MeshLambertMaterial({ color: 0x7a4b28 }));
      geo = keep(new THREE.CylinderGeometry(m.radius, m.radius, m.radius * 2.1, 16));
      geo.rotateX(Math.PI / 2);
      mat = [keep(new THREE.MeshLambertMaterial({ map: texture(c, keep) })), cap, cap];
    } else {
      // Une boule de neige bosselée : ses facettes montrent qu'elle roule
      const round = new THREE.IcosahedronGeometry(m.radius, phone ? 2 : 3);
      const p = round.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n =
          1 + 0.05 * Math.sin(v.x * 3.1 + v.y * 2.3) + 0.05 * Math.sin(v.z * 4.3 - v.x * 1.7) + 0.03 * Math.sin(v.y * 7.1 + v.z * 5.3);
        p.setXYZ(i, v.x * n, v.y * n, v.z * n);
      }
      round.computeVertexNormals();
      geo = keep(round);
      mat = keep(new THREE.MeshLambertMaterial({ color: 0xf8fbff, flatShading: true }));
    }
    const parts: RollItem["parts"] = [];
    for (let i = 0; i < m.count; i++) {
      const group = new THREE.Group();
      const spin = new THREE.Mesh(geo, mat);
      spin.castShadow = shadows;
      group.add(spin);
      group.visible = false;
      this.group.add(group);
      parts.push({ group, spin });
    }
    this.rolls.push({ m, parts });
  }

  private buildSheep(m: RollMover) {
    const { t, keep, shadows } = this.ctx;
    const bodyGeo = new THREE.IcosahedronGeometry(0.85, 1).scale(1, 0.85, 1.28).translate(0, 1.05, 0);
    const puff = new THREE.IcosahedronGeometry(0.46, 1).translate(0, 1.55, -0.45);
    const crown = new THREE.IcosahedronGeometry(0.3, 1).translate(0, 1.62, 1.0);
    const legs = [
      [-0.42, 0.72],
      [0.42, 0.72],
      [-0.42, -0.72],
      [0.42, -0.72],
    ].map(([x, z]) => new THREE.BoxGeometry(0.16, 0.7, 0.16).translate(x!, 0.35, z!));
    const head = new THREE.IcosahedronGeometry(0.34, 1).scale(0.85, 1, 1.25).translate(0, 1.32, 1.22);
    const earL = new THREE.BoxGeometry(0.34, 0.1, 0.16).translate(-0.34, 1.48, 1.08);
    const earR = new THREE.BoxGeometry(0.34, 0.1, 0.16).translate(0.34, 1.48, 1.08);
    const white = keep(BufferMerge([bodyGeo, puff, crown]));
    const dark = keep(BufferMerge([...legs, head, earL, earR]));
    const whiteMesh = new THREE.InstancedMesh(white, keep(new THREE.MeshLambertMaterial({ color: 0xf6f1e6, flatShading: true })), m.count);
    const darkMesh = new THREE.InstancedMesh(dark, keep(new THREE.MeshLambertMaterial({ color: 0x2a2624, flatShading: true })), m.count);
    whiteMesh.castShadow = darkMesh.castShadow = shadows;
    whiteMesh.frustumCulled = darkMesh.frustumCulled = false;
    this.group.add(whiteMesh, darkMesh);
    const p = pointAt(t, m.s, 0);
    // Ils marchent vers la droite de la route
    this.sheep.push({ m, white: whiteMesh, dark: darkMesh, head: Math.atan2(-p.tz, p.tx) });
  }

  private buildSprings() {
    const { t, keep } = this.ctx;
    if (t.springs.length === 0) return;
    const [c, g] = canvas(128, 128);
    g.fillStyle = "#ffcf33";
    g.beginPath();
    g.arc(64, 64, 64, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#d8352a";
    for (let k = 0; k < 2; k++) {
      const y = 34 + k * 34;
      g.beginPath();
      g.moveTo(20, y + 26);
      g.lineTo(64, y - 8);
      g.lineTo(108, y + 26);
      g.lineTo(108, y + 44);
      g.lineTo(64, y + 10);
      g.lineTo(20, y + 44);
      g.closePath();
      g.fill();
    }
    const top = keep(new THREE.MeshStandardMaterial({ map: texture(c, keep), emissive: 0x6a4a00, emissiveIntensity: 0.5, roughness: 0.4 }));
    const steel = keep(std(0x42464e, 0.45, 0.6));
    const baseGeo = keep(new THREE.CylinderGeometry(SPRING_RADIUS, SPRING_RADIUS + 0.15, 0.14, 28));
    const coilGeo = keep(new THREE.TorusGeometry(1.45, 0.11, 8, 28).rotateX(Math.PI / 2));
    const plateGeo = keep(new THREE.CylinderGeometry(SPRING_RADIUS - 0.2, SPRING_RADIUS - 0.1, 0.16, 28));
    const side = keep(std(0xd8352a, 0.5));
    t.springs.forEach((sp, i) => {
      const p = pointAt(t, sp.s, sp.d);
      const pad = new THREE.Group();
      pad.position.set(p.x, p.y + 0.06, p.z);
      pad.rotation.y = Math.atan2(p.tx, p.tz) + Math.PI;
      const base = new THREE.Mesh(baseGeo, steel);
      base.position.y = 0.07;
      pad.add(base);
      for (let k = 0; k < 2; k++) {
        const coil = new THREE.Mesh(coilGeo, steel);
        coil.position.y = 0.2 + k * 0.14;
        pad.add(coil);
      }
      const plate = new THREE.Mesh(plateGeo, [side, top, side]);
      plate.position.y = 0.45;
      pad.add(plate);
      this.group.add(pad);
      this.springs.push({ top: plate, i });
    });
  }

  private zoneTexture(kind: "boue" | "glace", seed: number): THREE.CanvasTexture {
    const { keep } = this.ctx;
    const [c, g] = canvas(256, 512);
    const r = rng(seed + 11);
    if (kind === "boue") {
      for (let i = 0; i < 150; i++) {
        const x = 26 + r() * 204;
        const y = 26 + r() * 460;
        const rad = 18 + r() * 34;
        const grad = g.createRadialGradient(x, y, 1, x, y, rad);
        const tone = r() < 0.5 ? "74,48,24" : "96,64,32";
        grad.addColorStop(0, `rgba(${tone},0.95)`);
        grad.addColorStop(0.72, `rgba(${tone},0.8)`);
        grad.addColorStop(1, `rgba(${tone},0)`);
        g.fillStyle = grad;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // Les ornières
      g.strokeStyle = "rgba(38,24,12,0.5)";
      g.lineWidth = 7;
      for (const x0 of [86, 170]) {
        g.beginPath();
        g.moveTo(x0, 16);
        for (let y = 16; y < 500; y += 24) g.lineTo(x0 + Math.sin(y * 0.03 + x0) * 7, y);
        g.stroke();
      }
    } else {
      g.fillStyle = "rgba(190,226,248,0.68)";
      g.fillRect(0, 0, 256, 512);
      for (let i = 0; i < 90; i++) {
        g.strokeStyle = `rgba(255,255,255,${0.2 + r() * 0.45})`;
        g.lineWidth = 1 + r() * 2;
        const x = r() * 256;
        const y = r() * 512;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 80, y + (r() - 0.5) * 80);
        g.stroke();
      }
      // Les bords s'effacent
      g.globalCompositeOperation = "destination-in";
      const fade = g.createLinearGradient(0, 0, 0, 512);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(0.08, "rgba(0,0,0,1)");
      fade.addColorStop(0.92, "rgba(0,0,0,1)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = fade;
      g.fillRect(0, 0, 256, 512);
      g.globalCompositeOperation = "source-over";
    }
    return texture(c, keep);
  }

  private buildZones() {
    const { t, keep, shadows } = this.ctx;
    t.zones.forEach((z, i) => {
      const mat = keep(
        new THREE.MeshStandardMaterial({
          map: this.zoneTexture(z.kind, i),
          transparent: true,
          depthWrite: false,
          roughness: z.kind === "glace" ? 0.14 : 0.42,
          metalness: 0,
        }),
      );
      const mesh = new THREE.Mesh(keep(strip(t, z.s, z.s + z.len, z.d1, z.d2, 0.088, false)), mat);
      mesh.receiveShadow = shadows;
      this.group.add(mesh);
    });
  }

  /** `time` : l'heure du serveur en secondes (les mêmes horaires que la conduite) */
  update(time: number, camera: THREE.Vector3): LifeEvent[] {
    const { t } = this.ctx;
    this.events.length = 0;
    this.tick = (this.tick + 1) % 4;
    for (const tex of this.water) tex.offset.set((time * 0.04) % 1, (time * 0.07) % 1);
    for (const it of this.drops) this.updateDrop(it, time);
    for (const it of this.rolls) {
      const { m } = it;
      const p0 = pointAt(t, m.s, 0);
      const h = Math.atan2(p0.tx, p0.tz);
      it.parts.forEach((part, i) => {
        const d = rollAt(m, i, time);
        part.group.visible = d !== null;
        if (d === null) return;
        const p = pointAt(t, m.s, d);
        const grow = Math.max(0.01, Math.min(1, (m.reach - Math.abs(d)) / 1));
        part.group.position.set(p.x, p.y + 0.06 + m.radius * grow, p.z);
        part.group.rotation.y = h;
        part.group.scale.setScalar(grow);
        part.spin.rotation.z = d / m.radius;
        if (this.tick === 0 && grow === 1 && Math.hypot(p.x - camera.x, p.z - camera.z) < 90)
          this.events.push({ kind: "trail", x: p.x, y: p.y, z: p.z, thing: m.thing === "boule" ? "boule" : "tonneau" });
      });
    }
    for (const it of this.sheep) this.updateSheep(it, time, camera);
    for (const sp of this.springs) {
      const u = Math.abs(Math.sin(time * 3.2 + sp.i));
      sp.top.position.y = 0.42 + u * u * 0.16;
    }
    return this.events;
  }

  private updateDrop(it: DropItem, time: number) {
    const { t } = this.ctx;
    const { m } = it;
    const st = dropAt(m, t.half, time);
    const up = DROP_WARN + DROP_FALL + DROP_STAY + DROP_LIFT;
    let d = st.d;
    if (st.phase === "none") {
      // Pendant qu'il est en haut, le chariot va au-dessus de la prochaine voie
      const next = dropAt(m, t.half, time + (m.period - st.u) + 0.02);
      const f = Math.max(0, Math.min(1, (st.u - up) / (m.period - up)));
      d = st.d + (next.d - st.d) * f * f * (3 - 2 * f);
    }
    const at = pointAt(t, m.s, d);
    it.trolley.position.set(at.x, at.y, at.z);
    it.box.position.set(at.x, at.y + 0.06 + st.height, at.z);
    // Le câble : tendu sauf pendant la chute ; il redescend chercher le conteneur juste avant de le remonter
    const top = at.y + BEAM_Y + 0.6;
    let bottom = at.y + 0.06 + st.height + CONTAINER.h;
    let shown = st.phase !== "fall";
    if (st.phase === "stay") {
      const left = DROP_WARN + DROP_FALL + DROP_STAY - st.u;
      if (left > 1.2) shown = false;
      else bottom = top - (top - bottom) * Math.min(1, (1.2 - left) / 1.0);
    }
    it.cable.visible = shown && top - bottom > 0.05;
    if (it.cable.visible) {
      it.cable.position.set(at.x, (top + bottom) / 2, at.z);
      it.cable.scale.y = top - bottom;
    }
    // Le rectangle au sol clignote de plus en plus vite
    if (st.phase === "warn" || st.phase === "fall") {
      it.warn.visible = true;
      it.warn.position.set(at.x, at.y + 0.1, at.z);
      const rate = 7 + (st.u / DROP_WARN) * 11;
      it.warnMat.opacity = st.phase === "fall" ? 0.95 : 0.35 + 0.55 * Math.abs(Math.sin(st.u * rate));
    } else it.warn.visible = false;
    it.lamps.emissiveIntensity = st.phase === "warn" || st.phase === "fall" ? (Math.sin(time * 16) > 0 ? 3 : 0.2) : 0.2;
    if (it.phase === "fall" && st.phase === "stay") this.events.push({ kind: "clang", x: at.x, y: at.y, z: at.z });
    it.phase = st.phase;
  }

  private updateSheep(it: SheepItem, time: number, camera: THREE.Vector3) {
    const { t } = this.ctx;
    const { m } = it;
    let on = false;
    for (let i = 0; i < m.count; i++) {
      const d = rollAt(m, i, time);
      let grow = 0.001;
      let hop = 0;
      let lat = 0;
      let x = 0;
      let y = -50;
      let z = 0;
      if (d !== null) {
        const p = pointAt(t, m.s, d);
        grow = Math.max(0.001, Math.min(1, (m.reach - Math.abs(d)) / 0.8));
        hop = Math.abs(Math.sin(time * 9 + i * 1.3)) * 0.14;
        lat = Math.sin(time * 9 + i * 1.3) * 0.08;
        // Ils ne marchent pas tout à fait en rang
        const off = pointAt(t, m.s + Math.sin(i * 2.3) * 1.2, d);
        x = off.x;
        y = p.y + 0.06 + hop;
        z = off.z;
        if (Math.hypot(x - camera.x, z - camera.z) < 60) on = true;
      }
      this.m4.compose(this.p.set(x, y, z), this.q.setFromEuler(this.e.set(0, it.head, lat)), this.s.setScalar(grow));
      it.white.setMatrixAt(i, this.m4);
      it.dark.setMatrixAt(i, this.m4);
    }
    it.white.instanceMatrix.needsUpdate = true;
    it.dark.instanceMatrix.needsUpdate = true;
    if (on && time > this.baaAt) {
      this.baaAt = time + 1.4 + Math.random() * 1.6;
      const p = pointAt(t, m.s, 0);
      this.events.push({ kind: "baa", x: p.x, z: p.z });
    }
  }
}

/** Plusieurs formes en une, avec les seuls attributs qu'elles ont toutes */
function BufferMerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false)!;
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  return merged;
}
