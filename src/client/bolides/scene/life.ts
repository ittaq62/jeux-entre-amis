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
  type RollThing,
  type Theme,
  type Track,
  type ZoneKind,
} from "../../../shared/games/bolides/track.ts";
import { mergeDeep } from "./merge.ts";
import { HOOP_RADIUS } from "../../../shared/games/bolides/physics.ts";
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
/** Ce qui traverse sans sortir d'une porte dans le muret */
const NO_DOOR = new Set<RollThing>(["parapluie", "ballon", "canard", "coccinelle", "escargot", "herisson", "rondin"]);
const CONTAINER = { w: 2.8, h: 2.6, l: 7.2 };
/** Le haut de la peluche de la fête, couchée sur la route (là où la pince la tient) */
const BEAR_TOP = 2.1;

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

/** Les bords de la piscine à balles : des planches peintes en rouge, une bande jaune et des étoiles en haut */
function fairBankTexture(keep: Keep): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#b8322a";
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(x, 0, 2, 256);
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(x + 2, 0, 3, 256);
  }
  g.fillStyle = "#f2c230";
  g.fillRect(0, 0, 256, 40);
  g.fillStyle = "#b8322a";
  for (let x = 16; x < 256; x += 48) {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = k % 2 === 0 ? 13 : 5.5;
      g.lineTo(x + Math.cos(a) * rad, 20 + Math.sin(a) * rad);
    }
    g.fill();
  }
  const grad = g.createLinearGradient(0, 60, 0, 256);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = grad;
  g.fillRect(0, 40, 256, 216);
  return texture(c, keep, true);
}

/** Les bords de la mare du potager : des planches sombres, de la mousse en haut, des traînées d'humidité */
function gardenBankTexture(keep: Keep): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(41);
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = `hsl(${26 + r() * 6}, 36%, ${24 + r() * 8}%)`;
    g.fillRect(x, 0, 32, 256);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(x, 0, 2, 256);
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${70 + r() * 40},${120 + r() * 50},${50 + r() * 20},0.8)`;
    g.beginPath();
    g.arc(r() * 256, r() * 34, 6 + r() * 10, 0, Math.PI * 2);
    g.fill();
  }
  const wet = g.createLinearGradient(0, 80, 0, 256);
  wet.addColorStop(0, "rgba(10,20,10,0)");
  wet.addColorStop(1, "rgba(10,20,10,0.55)");
  g.fillStyle = wet;
  g.fillRect(0, 40, 256, 216);
  return texture(c, keep, true);
}

/** Des balles de couleur serrées les unes contre les autres, chacune son reflet */
function ballPitTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#3a2a40";
  g.fillRect(0, 0, 256, 256);
  const colors = ["#e8413a", "#f7c531", "#2f7fe0", "#3fb86a", "#ee6fb0", "#ff8a2a"];
  const r = rng(29);
  for (let i = 0; i < 520; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const rad = 8 + r() * 3;
    const color = colors[Math.floor(r() * colors.length)]!;
    for (const [ox, oy] of [
      [0, 0],
      [256, 0],
      [-256, 0],
      [0, 256],
      [0, -256],
    ]) {
      const grad = g.createRadialGradient(x + ox! - rad * 0.35, y + oy! - rad * 0.35, 1, x + ox!, y + oy!, rad);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.25, color);
      grad.addColorStop(1, "rgba(0,0,0,0.6)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x + ox!, y + oy!, rad, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
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

const SIGN_ICONS: Record<"gap" | "drop" | RollThing, (g: CanvasRenderingContext2D) => void> = {
  virevoltant: (g) => {
    g.lineWidth = 3;
    for (const [dx, dy, r] of [
      [0, 0, 19],
      [-5, 4, 12],
      [6, -3, 10],
    ] as const) {
      g.beginPath();
      g.arc(64 + dx, 78 + dy, r, 0, Math.PI * 2);
      g.stroke();
    }
  },
  crabe: (g) => {
    g.beginPath();
    g.ellipse(64, 80, 20, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 4;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(64 + s * 18, 76);
      g.lineTo(64 + s * 30, 62);
      g.stroke();
      g.beginPath();
      g.arc(64 + s * 31, 58, 5, 0, Math.PI * 2);
      g.fill();
    }
  },
  meduse: (g) => {
    g.beginPath();
    g.arc(64, 74, 19, Math.PI, 0);
    g.closePath();
    g.fill();
    g.lineWidth = 3;
    for (const x of [50, 58, 66, 74]) {
      g.beginPath();
      g.moveTo(x, 74);
      g.quadraticCurveTo(x + 5, 86, x - 1, 98);
      g.stroke();
    }
  },
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
  poubelle: (g) => {
    // Une poubelle couchée qui roule : son corps, son couvercle, des traits de vitesse
    g.save();
    g.translate(66, 80);
    g.rotate(-0.5);
    g.fillRect(-12, -16, 24, 30);
    g.fillRect(-15, -21, 30, 5);
    g.restore();
    g.lineWidth = 3;
    for (const y of [72, 82, 92]) {
      g.beginPath();
      g.moveTo(30, y);
      g.lineTo(42, y);
      g.stroke();
    }
  },
  ballon: (g) => {
    // Un ballon de plage qui rebondit : ses quartiers, et l'arc pointillé de son rebond
    g.beginPath();
    g.arc(76, 84, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.ellipse(76, 84, 6, 16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#222";
    g.lineWidth = 3;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(34, 98);
    g.quadraticCurveTo(46, 52, 62, 72);
    g.stroke();
    g.setLineDash([]);
  },
  canard: (g) => {
    // Un canard en plastique, de profil : son corps, sa tête, son bec
    g.beginPath();
    g.ellipse(60, 86, 22, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(74, 66, 10, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(82, 64);
    g.lineTo(96, 68);
    g.lineTo(82, 72);
    g.fill();
    g.beginPath();
    g.moveTo(38, 82);
    g.lineTo(32, 70);
    g.lineTo(46, 78);
    g.fill();
  },
  coccinelle: (g) => {
    // Une coccinelle vue de dessus : sa carapace ronde, ses points, sa tête
    g.beginPath();
    g.arc(64, 82, 18, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(64, 58, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.fillRect(63, 66, 2, 34);
    for (const [x, y] of [
      [56, 76],
      [72, 76],
      [55, 90],
      [73, 90],
    ] as const) {
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  },
  escargot: (g) => {
    // Un escargot de profil : sa coquille en spirale, son corps, ses cornes
    g.fillRect(36, 92, 62, 8);
    g.lineWidth = 4;
    g.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.2) {
      const r = 3 + a * 1.25;
      const x = 62 + Math.cos(a) * r;
      const y = 76 + Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(92, 92);
    g.lineTo(98, 74);
    g.moveTo(88, 92);
    g.lineTo(90, 76);
    g.stroke();
  },
  herisson: (g) => {
    // Un hérisson de profil : son dos hérissé de piquants, son museau pointu
    g.beginPath();
    g.moveTo(34, 96);
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI + (k / 10) * Math.PI;
      const r = k % 2 === 0 ? 26 : 19;
      g.lineTo(62 + Math.cos(a) * r, 96 + Math.sin(a) * r);
    }
    g.lineTo(98, 96);
    g.lineTo(86, 88);
    g.closePath();
    g.fill();
  },
  rondin: (g) => {
    // Un rondin qui roule : ses cernes, des traits de vitesse
    g.lineWidth = 4;
    g.beginPath();
    g.arc(70, 80, 18, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(70, 80, 9, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    for (const y of [70, 80, 90]) {
      g.beginPath();
      g.moveTo(30, y);
      g.lineTo(44, y);
      g.stroke();
    }
  },
  parapluie: (g) => {
    // Un parapluie que le vent emporte, renversé
    g.save();
    g.translate(64, 78);
    g.rotate(0.6);
    g.beginPath();
    g.arc(0, 0, 20, Math.PI, 0);
    g.closePath();
    g.fill();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, 22);
    g.arc(-4, 22, 4, 0, Math.PI);
    g.stroke();
    g.restore();
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
  /** Au volcan : la bombe de lave qui remplace le conteneur ; au potager, une pomme (qui ne s'enfonce pas : elle fond) */
  rock?: THREE.Group;
  apple?: boolean;
  /** À la fête : la pince qui tient la peluche, et ses trois doigts (qu'elle ouvre pour la lâcher) */
  claw?: { group: THREE.Group; fingers: THREE.Object3D[] };
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
  private hoops: THREE.Mesh[] = [];
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
    this.buildHoops();
  }

  /** Les anneaux à traverser en vol */
  private buildHoops() {
    const { t, keep } = this.ctx;
    if (t.hoops.length === 0) return;
    const geo = keep(new THREE.TorusGeometry(HOOP_RADIUS - 0.25, 0.16, 10, 44));
    const mat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.12, 0.3) }));
    for (const h of t.hoops) {
      const p = pointAt(t, h.s, h.d);
      const ring = new THREE.Mesh(geo, mat);
      ring.position.set(p.x, p.y + h.h, p.z);
      ring.rotation.y = Math.atan2(p.tx, p.tz);
      this.group.add(ring);
      this.hoops.push(ring);
    }
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
    const fair = theme === "foire";
    const garden = theme === "potager" || theme === "foret";
    const bank = fair ? fairBankTexture(keep) : garden ? gardenBankTexture(keep) : bankTexture(keep);
    const bankMat = keep(new THREE.MeshLambertMaterial({ map: bank }));
    const groundTex = keep(TX.groundTexture(theme));
    const grass = keep(new THREE.MeshLambertMaterial({ map: groundTex }));
    const rockMat = keep(
      new THREE.MeshLambertMaterial({
        color:
          theme === "col"
            ? 0xc7d4e0
            : theme === "dunes"
              ? 0xb97a4a
              : theme === "volcan"
                ? 0x241f21
                : theme === "ville"
                  ? 0x4a4640
                  : theme === "potager" || theme === "foret"
                    ? 0x7d8a68
                    : 0x6f7276,
        flatShading: true,
      }),
    );
    const rockGeo = keep(new THREE.DodecahedronGeometry(1, 0));
    const tint =
      theme === "col"
        ? 0xcdeeff
        : theme === "vignes"
          ? 0x9ed6ae
          : theme === "dunes"
            ? 0x7fe0d0
            : theme === "ville"
              ? 0x5a6a80
              : theme === "potager"
                ? 0x7fbf8a
                : theme === "foret"
                  ? 0x4a6a8a
                  : 0xffffff;
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
      if (fair) {
        // À la fête, une piscine à balles : ses deux autres bords, et des milliers de balles de couleur
        const len = far - g.from + 1.2;
        for (const side of [-1, 1]) {
          const p = pointAt(t, (g.from + far) / 2, side * (wide / 2 - 0.6));
          const wall = new THREE.Mesh(keep(new THREE.BoxGeometry(1.2, tall, len)), bankMat);
          wall.position.set(p.x, p.y + 0.03 - tall / 2, p.z);
          wall.rotation.y = h;
          this.group.add(wall);
        }
        const balls = keep(ballPitTexture());
        balls.repeat.set(wide / 6, len / 6);
        const surface = new THREE.Mesh(keep(new THREE.PlaneGeometry(wide, len)), keep(new THREE.MeshLambertMaterial({ map: balls })));
        surface.rotation.set(-Math.PI / 2, 0, h + Math.PI);
        surface.position.set(mid.x, mid.y - WATER_DEPTH, mid.z);
        this.group.add(surface);
        // Des balles par-dessus, à moitié enfoncées : la surface a du relief
        const n = this.ctx.phone ? 70 : 190;
        const ball = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.42, 10, 8)), keep(new THREE.MeshLambertMaterial()), n);
        const colors = [0xe8413a, 0xf7c531, 0x2f7fe0, 0x3fb86a, 0xee6fb0, 0xff8a2a];
        const color = new THREE.Color();
        for (let i = 0; i < n; i++) {
          const along = (r() - 0.5) * (len - 1.6);
          const side = (r() - 0.5) * (wide - 2);
          const q = pointAt(t, (g.from + far) / 2 + along, side);
          this.m4.compose(this.p.set(q.x, mid.y - WATER_DEPTH + 0.12, q.z), this.q.identity(), this.s.setScalar(0.85 + r() * 0.3));
          ball.setMatrixAt(i, this.m4);
          ball.setColorAt(i, color.setHex(colors[i % colors.length]!));
        }
        ball.instanceMatrix.needsUpdate = true;
        if (ball.instanceColor) ball.instanceColor.needsUpdate = true;
        this.group.add(ball);
      }
      // L'eau, à mi-hauteur du trou
      // (au lagon, c'est la mer ; au volcan, de la lave)
      if (t.water === null && !fair) {
        const tex = keep(TX.waterTexture());
        tex.repeat.set(3, 1.4);
        this.water.push(tex);
        const water = new THREE.Mesh(
          keep(new THREE.PlaneGeometry(wide, far - g.from + 1)),
          keep(
            theme === "volcan"
              ? new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.4, 0.75, 0.15) })
              : new THREE.MeshLambertMaterial({ map: tex, color: tint }),
          ),
        );
        water.rotation.set(-Math.PI / 2, 0, h + Math.PI);
        water.position.set(mid.x, mid.y - WATER_DEPTH, mid.z);
        this.group.add(water);
      }
      const surface = t.water ?? mid.y - WATER_DEPTH;
      // (en ville, le canal n'a pas de rochers)
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, theme === "ville" || fair ? 0 : 9);
      for (let i = 0; i < rocks.count; i++) {
        const along = (r() - 0.5) * (far - g.from - 2);
        const side = (r() < 0.5 ? -1 : 1) * (t.half * 0.7 + r() * (t.wall - t.half * 0.7));
        const p = pointAt(t, (g.from + far) / 2 + along, side);
        const sz = 0.9 + r() * 1.5;
        this.m4.compose(
          this.p.set(p.x, surface + sz * 0.2, p.z),
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
      const label = keep(
        new THREE.MeshLambertMaterial({
          map: keep(
            g.glide
              ? TX.bannerTexture("ENVOL !", "#0f6fa8", "#ffffff")
              : theme === "ville"
                ? TX.bannerTexture("PONT-LEVANT", "#1c2740", "#ffd23a")
                : fair
                  ? TX.bannerTexture("CERCEAU DE FEU", "#b8322a", "#ffd23a")
                  : theme === "potager"
                    ? TX.bannerTexture("LA MARE", "#2f6a2a", "#fff6d0")
                    : TX.bannerTexture("GRAND SAUT", "#1c2740", "#ffd23a"),
          ),
        }),
      );
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
    if (t.def.theme === "foire") {
      this.buildClaw(m, base, h);
      return;
    }
    if (t.def.theme === "potager") {
      // Au potager, une grosse pomme tombe du pommier qui surplombe la route ; elle reste un moment, puis disparaît
      const apple = new THREE.Group();
      const red = keep(new THREE.MeshStandardMaterial({ color: 0xd42a20, roughness: 0.35 }));
      const body = new THREE.Mesh(keep(new THREE.SphereGeometry(2.1, 24, 18).scale(1.05, 0.95, 1.05)), red);
      body.position.y = 2;
      body.castShadow = shadows;
      apple.add(body);
      const stem = new THREE.Mesh(
        keep(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 6)),
        keep(new THREE.MeshLambertMaterial({ color: 0x5a3a20 })),
      );
      stem.position.y = 4.2;
      stem.rotation.z = 0.25;
      apple.add(stem);
      const leaf = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.5, 10, 6).scale(1.4, 0.15, 0.7)),
        keep(new THREE.MeshLambertMaterial({ color: 0x4a9a32 })),
      );
      leaf.position.set(0.55, 4.25, 0);
      leaf.rotation.z = -0.4;
      apple.add(leaf);
      apple.visible = false;
      apple.rotation.y = h;
      this.group.add(apple);
      const warnMat = keep(
        new THREE.MeshBasicMaterial({
          color: 0xff4a1a,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          fog: false,
          side: THREE.DoubleSide,
        }),
      );
      const warn = new THREE.Mesh(keep(new THREE.RingGeometry(1.8, 3.8, 32).rotateX(-Math.PI / 2)), warnMat);
      this.group.add(warn);
      this.drops.push({
        m,
        trolley: new THREE.Group(),
        box: apple,
        cable: new THREE.Mesh(),
        warn,
        warnMat,
        lamps: keep(new THREE.MeshStandardMaterial()),
        phase: "none",
        rock: apple,
        apple: true,
      });
      return;
    }
    if (t.def.theme === "volcan") {
      // Au volcan, pas de grue : une bombe de lave tombe du ciel, reste fumante un moment, puis s'enfonce
      const rock = new THREE.Group();
      const body = new THREE.Mesh(
        keep(new THREE.DodecahedronGeometry(2.6, 1)),
        keep(new THREE.MeshLambertMaterial({ color: 0x2c2422, emissive: 0xc2380a, emissiveIntensity: 0.75, flatShading: true })),
      );
      body.scale.set(1, 0.85, 1.35);
      body.position.y = 2;
      body.castShadow = shadows;
      rock.add(body);
      rock.visible = false;
      this.group.add(rock);
      const warnMat = keep(
        new THREE.MeshBasicMaterial({
          color: 0xff4a1a,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          fog: false,
          side: THREE.DoubleSide,
        }),
      );
      const warn = new THREE.Mesh(keep(new THREE.RingGeometry(1.8, 3.8, 32).rotateX(-Math.PI / 2)), warnMat);
      this.group.add(warn);
      this.drops.push({
        m,
        trolley: new THREE.Group(),
        box: rock,
        cable: new THREE.Mesh(),
        warn,
        warnMat,
        lamps: keep(new THREE.MeshStandardMaterial()),
        phase: "none",
        rock,
      });
      return;
    }
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

  /**
   * À la fête, la grue est une pince à peluches géante : un portique rouge et or tout illuminé, son enseigne, un chariot
   * doré, la pince à trois doigts au bout du câble, et une peluche (un ours couché sur le dos) qu'elle lâche sur la route
   */
  private buildClaw(m: DropMover, base: ReturnType<typeof pointAt>, h: number) {
    const { t, keep, shadows } = this.ctx;
    const red = keep(std(0xc8302b, 0.45, 0.15));
    const gold = keep(std(0xe8b530, 0.3, 0.6));
    const frame = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent = frame) => {
      const mesh = new THREE.Mesh(keep(geo), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadows;
      parent.add(mesh);
      return mesh;
    };
    const span = t.wall + 2;
    for (const side of [-1, 1]) {
      for (const along of [-3, 3]) {
        add(new THREE.BoxGeometry(0.8, BEAM_Y + 0.5, 0.8), red, side * span, (BEAM_Y + 0.5) / 2, along);
        // Des bagues dorées le long des piliers
        for (const y of [3, 7, 11]) add(new THREE.BoxGeometry(0.95, 0.25, 0.95), gold, side * span, y, along);
      }
      add(new THREE.BoxGeometry(0.4, 0.4, 6), gold, side * span, 5, 0);
      add(new THREE.BoxGeometry(0.4, 0.4, 6), gold, side * span, 10, 0);
      add(new THREE.BoxGeometry(1.4, 0.8, 8), red, side * span, 0.4, 0);
    }
    for (const along of [-1.3, 1.3]) add(new THREE.BoxGeometry(span * 2 + 3, 1.1, 0.8), red, 0, BEAM_Y, along);
    add(new THREE.BoxGeometry(span * 2 + 3.4, 0.2, 3.4), gold, 0, BEAM_Y + 0.65, 0);
    frame.position.set(base.x, base.y, base.z);
    frame.rotation.y = h;
    frame.updateMatrixWorld(true);
    mergeDeep(frame, keep);
    this.group.add(frame);
    // L'enseigne, des deux côtés de la poutre, et les ampoules qui courent tout le long
    const sign = new THREE.Group();
    const [c, g] = canvas(512, 96);
    g.fillStyle = "#7a1a16";
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = "#ffd23a";
    g.lineWidth = 6;
    g.strokeRect(6, 6, 500, 84);
    g.fillStyle = "#fff2c4";
    g.font = "bold 50px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("PINCE À PELUCHES", 256, 50);
    const signMat = keep(new THREE.MeshBasicMaterial({ map: texture(c, keep), color: new THREE.Color(1.25, 1.2, 1.1) }));
    for (const z of [-1.75, 1.75]) {
      const board = new THREE.Mesh(keep(new THREE.PlaneGeometry(13, 2.4)), signMat);
      board.position.set(0, BEAM_Y + 2.1, z);
      // Celle de devant regarde ceux qui arrivent (vers -z), l'autre ceux qui sont passés
      board.rotation.y = z < 0 ? Math.PI : 0;
      sign.add(board);
    }
    add(new THREE.BoxGeometry(13.4, 2.8, 0.25), red, 0, BEAM_Y + 2.1, 0, sign);
    const bulbs: THREE.Matrix4[] = [];
    for (let x = -span - 1.2; x <= span + 1.2; x += 1.1)
      for (const z of [-1.72, 1.72]) bulbs.push(new THREE.Matrix4().makeTranslation(x, BEAM_Y - 0.35, z));
    const bulbMesh = new THREE.InstancedMesh(
      keep(new THREE.SphereGeometry(0.13, 8, 6)),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 1.1) })),
      bulbs.length,
    );
    bulbs.forEach((mm, i) => bulbMesh.setMatrixAt(i, mm));
    sign.add(bulbMesh);
    sign.position.set(base.x, base.y, base.z);
    sign.rotation.y = h;
    this.group.add(sign);
    // Le chariot doré, ses deux feux qui clignotent avant la chute
    const trolley = new THREE.Group();
    const cart = new THREE.Mesh(keep(new THREE.BoxGeometry(3, 1.2, 3.8)), gold);
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
    const cable = new THREE.Mesh(keep(new THREE.BoxGeometry(0.12, 1, 0.12)), keep(std(0x3a3d42, 0.5, 0.6)));
    this.group.add(cable);
    // La pince : un moyeu doré, trois doigts articulés (chacun tourne autour de sa charnière pour s'ouvrir)
    const claw = new THREE.Group();
    const chrome = keep(std(0xd6dade, 0.25, 0.85));
    add(new THREE.CylinderGeometry(0.55, 0.7, 0.9, 14), gold, 0, -0.45, 0, claw);
    const fingers: THREE.Object3D[] = [];
    for (let k = 0; k < 3; k++) {
      const turn = new THREE.Group();
      turn.rotation.y = (k / 3) * Math.PI * 2;
      const hinge = new THREE.Group();
      hinge.position.set(0, -0.85, 0.5);
      // Le doigt descend, s'écarte, puis se recourbe vers l'intérieur
      const upper = add(new THREE.BoxGeometry(0.2, 1.5, 0.2), chrome, 0, -0.7, 0.26, hinge);
      upper.rotation.x = -0.35;
      const lower = add(new THREE.BoxGeometry(0.18, 1.1, 0.18), chrome, 0, -1.9, 0.27, hinge);
      lower.rotation.x = 0.45;
      add(new THREE.SphereGeometry(0.16, 8, 6), gold, 0, -0.0, 0, hinge);
      turn.add(hinge);
      claw.add(turn);
      fingers.push(hinge);
    }
    claw.rotation.y = h;
    // Assez petite pour tenir sous le chariot quand la peluche est tout en haut
    claw.scale.setScalar(0.72);
    this.group.add(claw);
    // La peluche : un ours couché sur le dos, la tête vers l'avant (son empreinte au sol est celle du conteneur)
    const bear = new THREE.Group();
    const fur = keep(new THREE.MeshStandardMaterial({ color: 0xc98a4a, roughness: 0.95 }));
    const light = keep(new THREE.MeshStandardMaterial({ color: 0xf1d4a2, roughness: 0.95 }));
    const dark = keep(new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.4 }));
    const ribbon = keep(new THREE.MeshStandardMaterial({ color: 0xd8352a, roughness: 0.6 }));
    const blob = (r: number, sx: number, sy: number, sz: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = add(new THREE.SphereGeometry(r, 16, 12), mat, x, y, z, bear);
      mesh.scale.set(sx, sy, sz);
      return mesh;
    };
    blob(1, 1.25, 0.85, 1.55, fur, 0, 0.88, -0.35);
    blob(1, 0.85, 0.4, 1.05, light, 0, 1.45, -0.35);
    blob(0.92, 1, 0.95, 1, fur, 0, 0.95, 1.5);
    blob(0.42, 1, 0.75, 1, light, 0, 1.72, 1.72);
    blob(0.16, 1.2, 0.8, 1, dark, 0, 2.02, 1.82);
    for (const s of [-1, 1]) {
      blob(0.36, 1, 1, 0.6, fur, s * 0.72, 1.3, 2.25);
      blob(0.2, 1, 1, 0.5, light, s * 0.72, 1.32, 2.4);
      blob(0.09, 1, 1, 1, dark, s * 0.3, 1.78, 2.15);
      blob(0.5, 0.95, 0.85, 1.5, fur, s * 1.35, 0.72, 0.35);
      blob(0.58, 1, 0.9, 1.25, fur, s * 0.72, 0.7, -2.0);
      blob(0.36, 0.9, 1, 0.35, light, s * 0.72, 0.75, -2.62);
    }
    // Le nœud rouge au cou
    blob(0.34, 1.4, 0.7, 0.8, ribbon, -0.42, 1.6, 0.72);
    blob(0.34, 1.4, 0.7, 0.8, ribbon, 0.42, 1.6, 0.72);
    blob(0.2, 1, 1, 1, ribbon, 0, 1.62, 0.72);
    bear.rotation.y = h;
    this.group.add(bear);
    // Là où elle va tomber : un rectangle rouge et jaune qui clignote
    const warnMat = keep(
      new THREE.MeshBasicMaterial({ map: hatch(keep, "#ff3b2a", "#ffd23a"), transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    (warnMat.map as THREE.Texture).repeat.set(2, 3);
    const warn = new THREE.Mesh(keep(new THREE.PlaneGeometry(CONTAINER.w + 0.9, CONTAINER.l + 1)), warnMat);
    warn.rotation.set(-Math.PI / 2, 0, h + Math.PI);
    this.group.add(warn);
    this.drops.push({ m, trolley, box: bear, cable, warn, warnMat, lamps, phase: "none", claw: { group: claw, fingers } });
  }

  /** Les bandes peintes en travers de la route (des rayures blanches pour les moutons), et les trappes dans les murets */
  private addCrossing(m: RollMover) {
    const { t, keep, heightAt, shadows } = this.ctx;
    const p = pointAt(t, m.s, 0);
    const h = Math.atan2(p.tx, p.tz);
    const width = (t.half + CURB) * 2;
    let map: THREE.CanvasTexture;
    if (m.thing === "mouton" || t.def.theme === "ville") {
      // Des rayures blanches : pour les moutons, ou un passage piéton en ville
      const [c, g] = canvas(128, 64);
      g.fillStyle = "#3c3f45";
      g.fillRect(0, 0, 128, 64);
      g.fillStyle = "#f4f2ea";
      for (let x = 0; x < 128; x += 32) g.fillRect(x + 6, 0, 18, 64);
      map = texture(c, keep, true);
    } else if (t.def.theme === "foire") map = hatch(keep, "#f4efe6", "#d8352a");
    else map = hatch(keep);
    map.repeat.set(width / 4, 1);
    const mark = new THREE.Mesh(keep(new THREE.PlaneGeometry(width, 3.8)), keep(new THREE.MeshLambertMaterial({ map })));
    mark.rotation.set(-Math.PI / 2, 0, h + Math.PI);
    mark.position.set(p.x, p.y + 0.085, p.z);
    this.group.add(mark);
    for (const side of [-1, 1]) {
      const at = pointAt(t, m.s, side * (t.wall + 0.1));
      const y = heightAt(at.x, at.z);
      // Le vent emporte les parapluies depuis les quais ; les ballons passent par-dessus les barrières, les canards
      // sortent de la mare : ils n'ont pas de porte d'où sortir
      // (les coccinelles et les escargots sortent des massifs du potager, les hérissons et les rondins du sous-bois)
      if (NO_DOOR.has(m.thing)) continue;
      if (m.thing !== "tonneau" && m.thing !== "mouton" && m.thing !== "poubelle") {
        // Un gros tas (de neige, de sable, de roche) : ils en sortent, et s'y perdent de l'autre côté
        const moundColor = m.thing === "boule" ? 0xf6f9fc : m.thing === "meduse" ? 0x5f7f88 : 0xd9b67c;
        const mound = new THREE.Mesh(
          keep(new THREE.SphereGeometry(4.2, 16, 10)),
          keep(new THREE.MeshLambertMaterial({ color: moundColor })),
        );
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
    } else if (m.thing === "poubelle") {
      // Une poubelle de rue couchée, vert sombre, son couvercle, ses cerclages : elle roule de côté comme un tonneau
      const [c, g] = canvas(256, 128);
      g.fillStyle = "#2f5a3c";
      g.fillRect(0, 0, 256, 128);
      for (let x = 0; x < 256; x += 16) {
        g.fillStyle = "rgba(0,0,0,0.18)";
        g.fillRect(x, 0, 3, 128);
      }
      g.fillStyle = "#c9cfd4";
      g.fillRect(0, 10, 256, 8);
      g.fillRect(0, 110, 256, 8);
      g.fillStyle = "#f2efe6";
      g.font = "bold 30px sans-serif";
      g.textAlign = "center";
      g.fillText("PROPRETÉ", 128, 76);
      const lid = keep(new THREE.MeshLambertMaterial({ color: 0x1f3a28 }));
      geo = keep(new THREE.CylinderGeometry(m.radius * 0.9, m.radius * 0.8, m.radius * 2.2, 18));
      geo.rotateX(Math.PI / 2);
      mat = [keep(new THREE.MeshLambertMaterial({ map: texture(c, keep) })), lid, lid];
    } else if (m.thing === "parapluie") {
      // Un parapluie ouvert que le vent fait culbuter : sa toile en huit pans, son manche à crosse
      const canopy = keep(new THREE.ConeGeometry(m.radius * 1.15, m.radius * 0.7, 8, 1, true).translate(0, m.radius * 0.35, 0));
      const handle = keep(
        BufferMerge([
          new THREE.CylinderGeometry(0.05, 0.05, m.radius * 1.5, 6).translate(0, -m.radius * 0.4, 0),
          new THREE.TorusGeometry(0.16, 0.05, 6, 10, Math.PI).rotateZ(Math.PI).translate(0.16, -m.radius * 1.15, 0),
        ]),
      );
      const colors = [0xd8352a, 0x2f6fd0, 0x1c1c22, 0xf2c94c];
      const stick = keep(new THREE.MeshLambertMaterial({ color: 0x2a2420 }));
      const parts: RollItem["parts"] = [];
      for (let i = 0; i < m.count; i++) {
        const group = new THREE.Group();
        const cloth = keep(
          new THREE.MeshLambertMaterial({ color: colors[(i + Math.floor(m.s)) % colors.length]!, side: THREE.DoubleSide }),
        );
        const spin = new THREE.Mesh(canopy, cloth);
        spin.castShadow = shadows;
        spin.add(new THREE.Mesh(handle, stick));
        group.add(spin);
        group.visible = false;
        this.group.add(group);
        parts.push({ group, spin });
      }
      this.rolls.push({ m, parts });
      return;
    } else if (m.thing === "ballon") {
      // Un ballon de plage géant : six quartiers de couleur, ses deux pôles blancs
      const [c, g] = canvas(256, 128);
      const gores = ["#e8413a", "#ffffff", "#2f7fe0", "#f7c531", "#ffffff", "#3fb86a"];
      gores.forEach((color, k) => {
        g.fillStyle = color;
        g.fillRect((k * 256) / 6, 0, 256 / 6 + 1, 128);
      });
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 256, 12);
      g.fillRect(0, 116, 256, 12);
      geo = keep(new THREE.SphereGeometry(m.radius, 24, 16));
      mat = keep(new THREE.MeshStandardMaterial({ map: texture(c, keep), roughness: 0.35 }));
    } else if (m.thing === "canard") {
      // Un canard en plastique géant, qui traverse en se dandinant : il regarde vers la droite de la route, où il va
      const R = m.radius;
      const body = BufferMerge([
        new THREE.SphereGeometry(R, 16, 12).scale(0.95, 0.72, 1.25).translate(0, -0.2 * R, 0),
        new THREE.SphereGeometry(R * 0.4, 10, 8).scale(1, 0.8, 1).translate(0, 0.25 * R, -1.05 * R),
        new THREE.SphereGeometry(R * 0.55, 14, 10).translate(0, 0.72 * R, 0.55 * R),
      ]);
      const beak = BufferMerge([new THREE.SphereGeometry(R * 0.3, 10, 8).scale(1.1, 0.42, 1.2).translate(0, 0.64 * R, 1.1 * R)]);
      const eyes = BufferMerge([
        new THREE.SphereGeometry(R * 0.09, 8, 6).translate(-0.27 * R, 0.86 * R, 0.98 * R),
        new THREE.SphereGeometry(R * 0.09, 8, 6).translate(0.27 * R, 0.86 * R, 0.98 * R),
      ]);
      const bodyGeo = keep(body);
      const beakGeo = keep(beak);
      const eyeGeo = keep(eyes);
      const yellow = keep(new THREE.MeshStandardMaterial({ color: 0xffd21f, roughness: 0.3 }));
      const orange = keep(new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.35 }));
      const black = keep(new THREE.MeshBasicMaterial({ color: 0x15120f }));
      const parts: RollItem["parts"] = [];
      for (let i = 0; i < m.count; i++) {
        const group = new THREE.Group();
        const facing = new THREE.Group();
        facing.rotation.y = -Math.PI / 2;
        const spin = new THREE.Mesh(bodyGeo, yellow);
        spin.castShadow = shadows;
        spin.add(new THREE.Mesh(beakGeo, orange), new THREE.Mesh(eyeGeo, black));
        facing.add(spin);
        group.add(facing);
        group.visible = false;
        this.group.add(group);
        parts.push({ group, spin });
      }
      this.rolls.push({ m, parts });
      return;
    } else if (m.thing === "rondin") {
      // Un rondin : l'écorce sombre et crevassée, ses cernes clairs aux deux bouts
      const [c, g] = canvas(256, 128);
      g.fillStyle = "#4a3624";
      g.fillRect(0, 0, 256, 128);
      for (let x = 0; x < 256; x += 6) {
        g.fillStyle = (x / 6) % 3 === 0 ? "#2e2016" : "#5a4430";
        g.fillRect(x, 0, 3, 128);
      }
      g.fillStyle = "rgba(90,140,60,0.6)";
      g.fillRect(0, 0, 256, 18);
      const [ec, eg] = canvas(64, 64);
      eg.fillStyle = "#c8a070";
      eg.fillRect(0, 0, 64, 64);
      eg.strokeStyle = "#8a6440";
      eg.lineWidth = 2;
      for (let rad = 4; rad < 32; rad += 5) {
        eg.beginPath();
        eg.arc(32, 32, rad, 0, Math.PI * 2);
        eg.stroke();
      }
      const ends = keep(new THREE.MeshLambertMaterial({ map: texture(ec, keep) }));
      geo = keep(new THREE.CylinderGeometry(m.radius, m.radius * 1.05, m.radius * 2.4, 14));
      geo.rotateX(Math.PI / 2);
      mat = [keep(new THREE.MeshLambertMaterial({ map: texture(c, keep) })), ends, ends];
    } else if (m.thing === "herisson") {
      // Un hérisson : le dos couvert de piquants, le museau clair, le nez noir ; il regarde vers où il va
      const R = m.radius;
      const spikes: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 36; k++) {
        const a = (k / 36) * Math.PI * 2 * 5.3;
        const up = 0.25 + (k / 36) * 1.1;
        const dir = new THREE.Vector3(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up) * 1.2 - 0.25).normalize();
        const cone = new THREE.ConeGeometry(0.12 * R, 0.7 * R, 4).translate(0, 0.35 * R, 0);
        cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
        cone.translate(dir.x * 0.75 * R, dir.y * 0.6 * R - 0.55 * R, dir.z * 0.85 * R);
        spikes.push(cone);
      }
      const back = BufferMerge([
        new THREE.SphereGeometry(R, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.85, 0.75, 1.05).translate(0, -0.55 * R, 0),
        ...spikes,
      ]);
      const face = BufferMerge([
        new THREE.ConeGeometry(0.4 * R, 0.9 * R, 10).rotateX(Math.PI / 2).translate(0, -0.6 * R, 1.1 * R),
        ...[-1, 1].flatMap((s) =>
          [-0.5, 0.5].map((z) => new THREE.CylinderGeometry(0.08 * R, 0.08 * R, 0.4 * R, 5).translate(s * 0.45 * R, -0.85 * R, z * R)),
        ),
      ]);
      const nose = BufferMerge([
        new THREE.SphereGeometry(0.1 * R, 8, 6).translate(0, -0.6 * R, 1.55 * R),
        new THREE.SphereGeometry(0.06 * R, 6, 5).translate(-0.18 * R, -0.42 * R, 1.08 * R),
        new THREE.SphereGeometry(0.06 * R, 6, 5).translate(0.18 * R, -0.42 * R, 1.08 * R),
      ]);
      const backGeo = keep(back);
      const faceGeo = keep(face);
      const noseGeo = keep(nose);
      const brown = keep(new THREE.MeshLambertMaterial({ color: 0x5a4430, flatShading: true }));
      const tan = keep(new THREE.MeshLambertMaterial({ color: 0xc8a682 }));
      const black = keep(new THREE.MeshBasicMaterial({ color: 0x120e0c }));
      const parts: RollItem["parts"] = [];
      for (let i = 0; i < m.count; i++) {
        const group = new THREE.Group();
        const facing = new THREE.Group();
        facing.rotation.y = -Math.PI / 2;
        const spin = new THREE.Mesh(backGeo, brown);
        spin.castShadow = shadows;
        spin.add(new THREE.Mesh(faceGeo, tan), new THREE.Mesh(noseGeo, black));
        facing.add(spin);
        group.add(facing);
        group.visible = false;
        this.group.add(group);
        parts.push({ group, spin });
      }
      this.rolls.push({ m, parts });
      return;
    } else if (m.thing === "coccinelle" || m.thing === "escargot") {
      // Les bêtes du potager, à la taille des légumes : elles traversent vers la droite de la route
      const R = m.radius;
      let parts3: { geo: THREE.BufferGeometry; mat: THREE.Material }[];
      if (m.thing === "coccinelle") {
        const [c, g] = canvas(256, 128);
        g.fillStyle = "#d8231c";
        g.fillRect(0, 0, 256, 128);
        g.fillStyle = "#151210";
        for (const [x, y, r] of [
          [40, 30, 14],
          [100, 22, 12],
          [168, 30, 14],
          [228, 22, 12],
          [70, 52, 10],
          [196, 52, 10],
        ] as const) {
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        }
        g.fillRect(126, 0, 4, 64);
        g.fillRect(0, 0, 4, 64);
        parts3 = [
          {
            geo: new THREE.SphereGeometry(R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 0.7, 1.15).translate(0, -0.72 * R, 0),
            mat: new THREE.MeshStandardMaterial({ map: texture(c, keep), roughness: 0.25 }),
          },
          {
            geo: BufferMerge([
              new THREE.SphereGeometry(R * 0.42, 12, 8).scale(1, 0.8, 0.9).translate(0, -0.6 * R, 1.08 * R),
              new THREE.CylinderGeometry(0.03 * R, 0.03 * R, 0.6 * R, 4).rotateX(-0.6).translate(-0.18 * R, -0.25 * R, 1.35 * R),
              new THREE.CylinderGeometry(0.03 * R, 0.03 * R, 0.6 * R, 4).rotateX(-0.6).translate(0.18 * R, -0.25 * R, 1.35 * R),
              ...[-1, 1].flatMap((s) =>
                [-0.5, 0, 0.5].map((z) =>
                  new THREE.BoxGeometry(0.5 * R, 0.06 * R, 0.08 * R).rotateZ(s * 0.6).translate(s * 0.95 * R, -0.85 * R, z * R),
                ),
              ),
            ]),
            mat: new THREE.MeshLambertMaterial({ color: 0x151210 }),
          },
        ];
      } else {
        // L'escargot : sa coquille en spirale, son corps luisant, ses deux cornes et leurs yeux
        const [c, g] = canvas(256, 128);
        g.fillStyle = "#b8783a";
        g.fillRect(0, 0, 256, 128);
        for (let y = 0; y < 128; y += 16) {
          g.fillStyle = (y / 16) % 2 === 0 ? "#8a5226" : "#d89a54";
          g.fillRect(0, y, 256, 8);
        }
        parts3 = [
          {
            geo: new THREE.SphereGeometry(R * 0.85, 18, 14).scale(0.75, 1, 1).translate(0, 0.05 * R, -0.15 * R),
            mat: new THREE.MeshStandardMaterial({ map: texture(c, keep), roughness: 0.4 }),
          },
          {
            geo: BufferMerge([
              new THREE.CapsuleGeometry(0.38 * R, 1.6 * R, 4, 10).rotateX(Math.PI / 2).translate(0, -0.72 * R, 0.25 * R),
              new THREE.CylinderGeometry(0.06 * R, 0.09 * R, 0.8 * R, 6).rotateX(-0.4).translate(-0.15 * R, -0.1 * R, 1.25 * R),
              new THREE.CylinderGeometry(0.06 * R, 0.09 * R, 0.8 * R, 6).rotateX(-0.4).translate(0.15 * R, -0.1 * R, 1.25 * R),
              new THREE.SphereGeometry(0.1 * R, 8, 6).translate(-0.15 * R, 0.28 * R, 1.42 * R),
              new THREE.SphereGeometry(0.1 * R, 8, 6).translate(0.15 * R, 0.28 * R, 1.42 * R),
            ]),
            mat: new THREE.MeshStandardMaterial({ color: 0xb8ac90, roughness: 0.2 }),
          },
        ];
      }
      const meshes = parts3.map((q) => ({ geo: keep(q.geo), mat: keep(q.mat) }));
      const parts: RollItem["parts"] = [];
      for (let i = 0; i < m.count; i++) {
        const group = new THREE.Group();
        const facing = new THREE.Group();
        facing.rotation.y = -Math.PI / 2;
        const spin = new THREE.Mesh(meshes[0]!.geo, meshes[0]!.mat);
        spin.castShadow = shadows;
        for (const extra of meshes.slice(1)) spin.add(new THREE.Mesh(extra.geo, extra.mat));
        facing.add(spin);
        group.add(facing);
        group.visible = false;
        this.group.add(group);
        parts.push({ group, spin });
      }
      this.rolls.push({ m, parts });
      return;
    } else if (m.thing === "virevoltant") {
      // Une boule de branches sèches : on voit à travers
      const outer = keep(new THREE.IcosahedronGeometry(m.radius, 1));
      const inner = keep(new THREE.IcosahedronGeometry(m.radius * 0.66, 1));
      const twigs = keep(new THREE.MeshBasicMaterial({ color: 0x9c7a4c, wireframe: true }));
      const parts: RollItem["parts"] = [];
      for (let i = 0; i < m.count; i++) {
        const group = new THREE.Group();
        const spin = new THREE.Mesh(outer, twigs);
        const core = new THREE.Mesh(inner, twigs);
        core.rotation.set(0.7, 0.4, 0.2);
        spin.add(core);
        group.add(spin);
        group.visible = false;
        this.group.add(group);
        parts.push({ group, spin });
      }
      this.rolls.push({ m, parts });
      return;
    } else if (m.thing === "crabe") {
      const shell = BufferMerge([
        new THREE.SphereGeometry(0.62, 12, 8).scale(1.15, 0.6, 0.9),
        new THREE.SphereGeometry(0.2, 8, 6).translate(-0.86, 0.1, 0.25),
        new THREE.SphereGeometry(0.2, 8, 6).translate(0.86, 0.1, 0.25),
      ]);
      const legs = BufferMerge([
        ...[-1, 1].flatMap((side) =>
          [0.3, 0, -0.3].map((z) => new THREE.BoxGeometry(0.62, 0.07, 0.07).rotateZ(side * 0.7).translate(side * 0.74, -0.32, z)),
        ),
        new THREE.SphereGeometry(0.075, 6, 5).translate(-0.17, 0.42, 0.42),
        new THREE.SphereGeometry(0.075, 6, 5).translate(0.17, 0.42, 0.42),
      ]);
      const shellGeo = keep(shell);
      const legGeo = keep(legs);
      const red = keep(new THREE.MeshLambertMaterial({ color: 0xe5533a, flatShading: true }));
      const dark = keep(new THREE.MeshLambertMaterial({ color: 0x3a1a14 }));
      const parts: RollItem["parts"] = [];
      for (let i = 0; i < m.count; i++) {
        const group = new THREE.Group();
        const spin = new THREE.Mesh(shellGeo, red);
        spin.castShadow = shadows;
        spin.add(new THREE.Mesh(legGeo, dark));
        group.add(spin);
        group.visible = false;
        this.group.add(group);
        parts.push({ group, spin });
      }
      this.rolls.push({ m, parts });
      return;
    } else if (m.thing === "meduse") {
      const bell = keep(new THREE.SphereGeometry(m.radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
      const strands = keep(
        BufferMerge(
          [0, 1, 2, 3, 4, 5, 6].map((k) => {
            const a = (k / 7) * Math.PI * 2;
            return new THREE.CylinderGeometry(0.03, 0.06, 1.5, 4).translate(
              Math.cos(a) * m.radius * 0.55,
              -0.72,
              Math.sin(a) * m.radius * 0.55,
            );
          }),
        ),
      );
      const pink = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.35, 0.6, 1.5), transparent: true, opacity: 0.85 }));
      const parts: RollItem["parts"] = [];
      for (let i = 0; i < m.count; i++) {
        const group = new THREE.Group();
        const spin = new THREE.Mesh(bell, pink);
        spin.add(new THREE.Mesh(strands, pink));
        group.add(spin);
        group.visible = false;
        this.group.add(group);
        parts.push({ group, spin });
      }
      this.rolls.push({ m, parts });
      return;
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
    const city = t.def.theme === "ville";
    const fair = t.def.theme === "foire";
    const garden = t.def.theme === "potager";
    const woods = t.def.theme === "foret";
    const [c, g] = canvas(128, 128);
    g.fillStyle = city ? "#2b2e33" : fair ? "#1f4fa8" : garden ? "#f6f2e4" : woods ? "#c8231c" : "#ffcf33";
    g.beginPath();
    g.arc(64, 64, 64, 0, Math.PI * 2);
    g.fill();
    if (city) {
      // Une plaque d'égout en fonte, son quadrillage, et deux chevrons orange qui disent qu'elle fait sauter
      g.strokeStyle = "#45494f";
      g.lineWidth = 3;
      for (let k = 18; k < 128; k += 14) {
        g.beginPath();
        g.moveTo(k, 8);
        g.lineTo(k, 120);
        g.moveTo(8, k);
        g.lineTo(120, k);
        g.stroke();
      }
      g.lineWidth = 8;
      g.strokeStyle = "#1c1e22";
      g.beginPath();
      g.arc(64, 64, 58, 0, Math.PI * 2);
      g.stroke();
    }
    if (woods) {
      // Le chapeau d'un champignon : rouge, ses pois blancs
      g.fillStyle = "#fff6ea";
      for (const [x, y, rad] of [
        [30, 40, 9],
        [92, 34, 8],
        [100, 92, 10],
        [34, 96, 8],
        [64, 18, 6],
        [64, 112, 6],
      ] as const) {
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (garden) {
      // Une marguerite : ses pétales blancs, son cœur jaune (les chevrons sont dessus)
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        g.fillStyle = k % 2 === 0 ? "#ffffff" : "#ecebe2";
        g.beginPath();
        g.ellipse(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, 22, 8, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#f2c230";
      g.beginPath();
      g.arc(64, 64, 34, 0, Math.PI * 2);
      g.fill();
    }
    if (fair) {
      // La toile d'un trampoline : son rond central, ses coutures
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 2;
      for (const rad of [20, 38, 54]) {
        g.beginPath();
        g.arc(64, 64, rad, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.fillStyle = city ? "#ff8a2a" : fair ? "#ffd23a" : garden ? "#e07a12" : woods ? "#fff2c4" : "#d8352a";
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
    const top = keep(
      new THREE.MeshStandardMaterial({
        map: texture(c, keep),
        emissive: city ? 0xff6a10 : fair ? 0x2a3a6a : garden ? 0x4a4020 : woods ? 0x8a1a10 : 0x6a4a00,
        emissiveIntensity: city ? 0.35 : 0.5,
        roughness: 0.4,
      }),
    );
    const steel = keep(std(0x42464e, 0.45, 0.6));
    const baseGeo = keep(new THREE.CylinderGeometry(SPRING_RADIUS, SPRING_RADIUS + 0.15, 0.14, 28));
    const coilGeo = keep(new THREE.TorusGeometry(1.45, 0.11, 8, 28).rotateX(Math.PI / 2));
    const plateGeo = keep(new THREE.CylinderGeometry(SPRING_RADIUS - 0.2, SPRING_RADIUS - 0.1, 0.16, 28));
    const side = keep(std(city ? 0xff7a1f : fair ? 0xe2322a : garden ? 0x4a8a3a : woods ? 0xf2ead8 : 0xd8352a, 0.5));
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

  private zoneTexture(kind: ZoneKind, seed: number): THREE.CanvasTexture {
    const { keep } = this.ctx;
    const [c, g] = canvas(256, 512);
    const r = rng(seed + 11);
    if (kind === "sable" || kind === "cendre" || kind === "algues" || kind === "sciure") {
      // Du sable qui tourbillonne, des cendres, un tapis d'algues ou la sciure de la piste : des taches douces, puis ce
      // qui les dessine
      const tones =
        kind === "sable"
          ? ["176,132,78", "150,108,60"]
          : kind === "cendre"
            ? ["68,62,62", "44,40,42"]
            : kind === "sciure"
              ? ["222,188,132", "200,162,106", "234,206,156"]
              : ["44,120,74", "28,92,60"];
      for (let i = 0; i < 150; i++) {
        const x = 26 + r() * 204;
        const y = 26 + r() * 460;
        const rad = 18 + r() * 34;
        const grad = g.createRadialGradient(x, y, 1, x, y, rad);
        const tone = tones[Math.floor(r() * tones.length)]!;
        grad.addColorStop(0, `rgba(${tone},0.95)`);
        grad.addColorStop(0.72, `rgba(${tone},0.82)`);
        grad.addColorStop(1, `rgba(${tone},0)`);
        g.fillStyle = grad;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      g.lineWidth = 3;
      g.strokeStyle =
        kind === "sable"
          ? "rgba(96,66,34,0.45)"
          : kind === "cendre"
            ? "rgba(255,120,40,0.4)"
            : kind === "sciure"
              ? "rgba(140,96,48,0.55)"
              : "rgba(120,220,150,0.5)";
      for (let i = 0; i < (kind === "algues" ? 60 : kind === "sciure" ? 120 : 22); i++) {
        const x = 40 + r() * 176;
        const y = 40 + r() * 432;
        g.beginPath();
        // Les copeaux : de petites boucles
        if (kind === "sciure") g.arc(x, y, 2 + r() * 5, r() * 6, r() * 6 + 4);
        else if (kind === "sable") g.arc(x, y, 8 + r() * 22, r() * 6, r() * 6 + 3.6);
        else {
          g.moveTo(x, y);
          g.quadraticCurveTo(x + (r() - 0.5) * 30, y + 20, x + (r() - 0.5) * 20, y + 44);
        }
        g.stroke();
      }
    } else if (kind === "feuilles") {
      // Un tas de feuilles mortes : rousses, jaunes, brunes, serrées et en désordre
      const colors = ["#c8641e", "#e09a2a", "#8a4a1c", "#b8401a", "#d8b040", "#6a4020"];
      for (let i = 0; i < 520; i++) {
        const x = 20 + r() * 216;
        const y = 20 + r() * 472;
        g.save();
        g.translate(x, y);
        g.rotate(r() * Math.PI * 2);
        g.fillStyle = colors[Math.floor(r() * colors.length)]!;
        g.globalAlpha = 0.85;
        g.beginPath();
        g.ellipse(0, 0, 9 + r() * 6, 4 + r() * 3, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(60,30,10,0.6)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(-10, 0);
        g.lineTo(10, 0);
        g.stroke();
        g.restore();
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "destination-in";
      const fade = g.createLinearGradient(0, 0, 0, 512);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(0.08, "rgba(0,0,0,1)");
      fade.addColorStop(0.92, "rgba(0,0,0,1)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = fade;
      g.fillRect(0, 0, 256, 512);
      g.globalCompositeOperation = "source-over";
    } else if (kind === "flaque") {
      // De l'eau sombre qui reflète, ses bords irréguliers, et les ronds des gouttes de pluie
      for (let i = 0; i < 70; i++) {
        const x = 30 + r() * 196;
        const y = 30 + r() * 452;
        const rad = 26 + r() * 40;
        const grad = g.createRadialGradient(x, y, 1, x, y, rad);
        grad.addColorStop(0, "rgba(24,30,40,0.92)");
        grad.addColorStop(0.75, "rgba(30,38,52,0.85)");
        grad.addColorStop(1, "rgba(30,38,52,0)");
        g.fillStyle = grad;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      g.lineWidth = 1.5;
      for (let i = 0; i < 70; i++) {
        g.strokeStyle = `rgba(200,215,235,${0.12 + r() * 0.2})`;
        g.beginPath();
        g.ellipse(40 + r() * 176, 40 + r() * 432, 3 + r() * 9, 2 + r() * 6, 0, 0, Math.PI * 2);
        g.stroke();
      }
    } else if (kind === "boue") {
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
          roughness: z.kind === "glace" ? 0.14 : z.kind === "flaque" ? 0.05 : 0.42,
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
        const rolls =
          m.thing === "tonneau" ||
          m.thing === "boule" ||
          m.thing === "virevoltant" ||
          m.thing === "poubelle" ||
          m.thing === "ballon" ||
          m.thing === "rondin";
        const swim =
          m.thing === "meduse"
            ? 0.25 + Math.sin(time * 2 + i * 1.7) * 0.32
            : m.thing === "crabe"
              ? -0.1 + Math.abs(Math.sin(time * 11 + i)) * 0.09
              : m.thing === "parapluie"
                ? Math.abs(Math.sin(time * 5.5 + i * 2.1)) * 1.1
                : m.thing === "ballon"
                  ? Math.abs(Math.sin(time * 4.2 + i * 1.9)) * 0.9
                  : m.thing === "canard"
                    ? Math.abs(Math.sin(time * 8 + i * 1.3)) * 0.12
                    : 0;
        part.group.position.set(p.x, p.y + 0.06 + m.radius * grow + swim, p.z);
        part.group.rotation.y = h;
        part.group.scale.setScalar(grow);
        if (rolls) part.spin.rotation.z = d / m.radius;
        else if (m.thing === "parapluie") part.spin.rotation.set(Math.sin(time * 3 + i) * 0.5, 0, d / (m.radius * 1.6));
        else if (m.thing === "meduse") part.spin.scale.set(1, 1 + Math.sin(time * 3.2 + i) * 0.16, 1);
        else if (m.thing === "canard") part.spin.rotation.z = Math.sin(time * 8 + i * 1.3) * 0.16;
        else if (m.thing === "coccinelle") part.spin.rotation.z = Math.sin(time * 14 + i) * 0.05;
        else if (m.thing === "herisson") part.spin.rotation.z = Math.sin(time * 16 + i) * 0.06;
        // L'escargot s'étire et se tasse en avançant
        else if (m.thing === "escargot") part.spin.scale.set(1, 1, 1 + Math.sin(time * 3 + i) * 0.06);
        else part.spin.rotation.z = Math.sin(time * 11 + i) * 0.07;
        if (
          rolls &&
          m.thing !== "poubelle" &&
          m.thing !== "ballon" &&
          this.tick === 0 &&
          grow === 1 &&
          Math.hypot(p.x - camera.x, p.z - camera.z) < 90
        )
          this.events.push({ kind: "trail", x: p.x, y: p.y, z: p.z, thing: m.thing === "boule" ? "boule" : "tonneau" });
      });
    }
    for (const it of this.sheep) this.updateSheep(it, time, camera);
    this.hoops.forEach((ring, i) => {
      const beat = 1 + Math.sin(time * 4 + i) * 0.05;
      ring.scale.set(beat, beat, 1);
    });
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
    if (it.rock) {
      // La bombe de lave : elle tombe, reste, puis s'enfonce sur place
      it.rock.visible = st.phase === "fall" || st.phase === "stay" || st.phase === "lift";
      const sink = st.phase === "lift" ? (st.u - DROP_WARN - DROP_FALL - DROP_STAY) / DROP_LIFT : 0;
      it.rock.position.set(at.x, at.y + (st.phase === "fall" ? st.height * 2.2 : 0) - (it.apple ? 0 : sink * 4.2), at.z);
      // La pomme ne s'enfonce pas : elle rapetisse et disparaît
      if (it.apple) it.rock.scale.setScalar(Math.max(0.01, 1 - sink));
      if (st.phase === "warn" || st.phase === "fall") {
        it.warn.visible = true;
        it.warn.position.set(at.x, at.y + 0.1, at.z);
        it.warnMat.opacity = st.phase === "fall" ? 0.95 : 0.3 + 0.6 * Math.abs(Math.sin(st.u * (7 + (st.u / DROP_WARN) * 11)));
      } else it.warn.visible = false;
      if (it.phase === "fall" && st.phase === "stay") this.events.push({ kind: "clang", x: at.x, y: at.y, z: at.z });
      it.phase = st.phase;
      return;
    }
    it.trolley.position.set(at.x, at.y, at.z);
    it.box.position.set(at.x, at.y + 0.06 + st.height, at.z);
    // Le câble : tendu sauf pendant la chute ; il redescend chercher le conteneur juste avant de le remonter
    const top = at.y + BEAM_Y + 0.6;
    let bottom = at.y + 0.06 + st.height + (it.claw ? BEAR_TOP : CONTAINER.h);
    let shown = st.phase !== "fall";
    if (st.phase === "stay") {
      const left = DROP_WARN + DROP_FALL + DROP_STAY - st.u;
      if (left > 1.2) shown = false;
      else bottom = top - (top - bottom) * Math.min(1, (1.2 - left) / 1.0);
    }
    if (it.claw) {
      // La pince reste au bout du câble ; quand il n'y a plus de câble (la peluche tombe), elle est remontée sous le
      // chariot. Elle tient la peluche fermée, et s'ouvre pour la lâcher ou pour venir la reprendre.
      const clawTop = shown ? bottom + 2.3 : top - 0.4;
      bottom = clawTop;
      shown = true;
      const holding = st.phase === "none" || st.phase === "warn" || st.phase === "lift";
      it.claw.group.position.set(at.x, clawTop, at.z);
      const open = holding ? 0.05 : 0.6;
      for (const f of it.claw.fingers) f.rotation.x += (-open - f.rotation.x) * 0.25;
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
