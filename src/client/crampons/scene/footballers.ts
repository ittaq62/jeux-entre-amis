// Les footballeurs : de petits personnages trapus, grosse tête et gros crampons, dessinés en un seul lot par morceau de
// corps pour rester fluides à vingt-deux. Courses, frappes, tacles, plongeons et célébrations sont calculés à chaque image.

import * as THREE from "three";
import type { Act, Team } from "../../../shared/games/crampons/model.ts";

export interface Kit {
  shirt: string;
  sleeves: string;
  shorts: string;
  socks: string;
}

export interface FootballerView {
  x: number;
  z: number;
  /** Là où il regarde, en radians (0 vers +x) */
  h: number;
  /** Sa vitesse */
  v: number;
  act: Act;
  team: Team;
  keeper: boolean;
  /** La direction d'un plongeon ou d'un tacle glissé */
  dirX: number;
  dirZ: number;
  /** Il vient de marquer ou il célèbre */
  cheer: boolean;
  off: boolean;
}

const SKINS = ["#f6cfa8", "#e8b48a", "#c58a5c", "#94603c", "#63402a"];
const HAIRS = ["#2a1c12", "#6b4423", "#c99a4e", "#1b1b22", "#8c3a22", "#e8e2d4", "#3a2a5a"];
const SCALE = 1.24;

interface Pose {
  lean: number;
  twist: number;
  drop: number;
  lift: number;
  legLa: number;
  legLb: number;
  legRa: number;
  legRb: number;
  armLa: number;
  armLb: number;
  armLs: number;
  armRa: number;
  armRb: number;
  armRs: number;
  pitch: number;
  roll: number;
}

const POSE_KEYS = Object.keys({
  lean: 0,
  twist: 0,
  drop: 0,
  lift: 0,
  legLa: 0,
  legLb: 0,
  legRa: 0,
  legRb: 0,
  armLa: 0,
  armLb: 0,
  armLs: 0,
  armRa: 0,
  armRb: 0,
  armRs: 0,
  pitch: 0,
  roll: 0,
}) as (keyof Pose)[];

const zeroPose = (): Pose => ({
  lean: 0,
  twist: 0,
  drop: 0,
  lift: 0,
  legLa: 0,
  legLb: 0.15,
  legRa: 0,
  legRb: 0.15,
  armLa: 0,
  armLb: 0.3,
  armLs: 0.2,
  armRa: 0,
  armRb: 0.3,
  armRs: 0.2,
  pitch: 0,
  roll: 0,
});

interface State {
  pose: Pose;
  phase: number;
  actAge: number;
  lastAct: Act;
  skin: THREE.Color;
  hair: THREE.Color;
  hairStyle: number;
  /** Sa façon à lui de célébrer */
  joy: number;
}

function poseFor(s: State, f: FootballerView, target: Pose, t: number) {
  Object.assign(target, zeroPose());
  const speed = Math.min(1.15, f.v / 8.5);
  const a = f.act;
  if (f.cheer) {
    const bob = Math.sin(t * 10 + s.hairStyle);
    if (s.joy === 0) {
      // Les bras au ciel, en sautant
      target.armLa = 3.05;
      target.armRa = 3.05;
      target.armLs = 0.3;
      target.armRs = 0.3;
      target.lift = Math.max(0, bob) * 0.34;
      target.legLb = 0.8;
      target.legRb = 0.8;
    } else if (s.joy === 1) {
      // L'avion
      target.armLs = 1.5;
      target.armRs = 1.5;
      target.armLb = 0.05;
      target.armRb = 0.05;
      target.roll = Math.sin(t * 5) * 0.2;
      target.lean = 0.25;
    } else {
      // Le poing levé
      target.armRa = 3.0;
      target.armRb = 1.1;
      target.armRs = 0.2;
      target.lift = Math.max(0, bob) * 0.18;
      target.twist = Math.sin(t * 8) * 0.25;
    }
    return;
  }
  if (a === "kick") {
    const p = Math.min(1, s.actAge / 0.2);
    const swing = p < 0.45 ? -1.1 * (p / 0.45) : -1.1 + 3.1 * ((p - 0.45) / 0.55);
    target.legRa = swing;
    target.legRb = p < 0.45 ? 1.3 : 0.12;
    target.legLa = -0.08;
    target.lean = -0.26;
    target.twist = p < 0.45 ? -0.35 : 0.5;
    target.armLa = 0.9;
    target.armLs = 0.9;
    target.armRa = -0.7;
    return;
  }
  if (a === "tackle") {
    target.legRa = 1.25;
    target.legRb = 0.1;
    target.legLa = -0.6;
    target.legLb = 1;
    target.drop = 0.12;
    target.lean = 0.25;
    target.armLs = 0.9;
    target.armRs = 0.9;
    return;
  }
  if (a === "slide") {
    target.pitch = -1.2;
    target.drop = 0.5;
    target.legRa = 1.55;
    target.legRb = 0;
    target.legLa = 1.0;
    target.legLb = 1.4;
    target.armLa = -0.7;
    target.armRa = 0.6;
    target.armLs = 1.1;
    target.armRs = 1.1;
    return;
  }
  if (a === "down") {
    target.pitch = -1.5;
    target.drop = 0.62;
    target.legRa = 0.25;
    target.legLa = 0.45;
    target.legLb = 0.6;
    target.armLs = 1;
    target.armRs = 1;
    return;
  }
  if (a === "dive") {
    // Le corps part à l'horizontale, du côté du plongeon, les bras tendus vers le ballon
    const facing = Math.cos(f.h) * f.dirZ - Math.sin(f.h) * f.dirX;
    target.roll = Math.sign(facing || 1) * 1.4;
    target.lift = 0.42;
    target.drop = 0.2;
    target.armLa = 3.05;
    target.armRa = 3.05;
    target.armLs = 0.12;
    target.armRs = 0.12;
    target.armLb = 0.05;
    target.armRb = 0.05;
    target.legLb = 0.5;
    target.legRb = 0.3;
    return;
  }
  if (a === "header") {
    target.lift = 0.5;
    target.lean = -0.3;
    target.armLa = -0.5;
    target.armRa = -0.5;
    target.armLs = 0.6;
    target.armRs = 0.6;
    target.legLb = 1;
    target.legRb = 1;
    return;
  }
  if (a === "hold") {
    target.armLa = 1.3;
    target.armRa = 1.3;
    target.armLb = 1.5;
    target.armRb = 1.5;
    target.armLs = 0.35;
    target.armRs = 0.35;
    return;
  }
  if (a === "throw") {
    target.armLa = 3.05;
    target.armRa = 3.05;
    target.armLs = 0.14;
    target.armRs = 0.14;
    target.armLb = 0.7;
    target.armRb = 0.7;
    target.lean = -0.2;
    return;
  }
  if (f.v > 0.35) {
    const amp = 0.5 + speed * 0.75;
    const sin = Math.sin(s.phase);
    const cos = Math.cos(s.phase);
    target.legLa = sin * amp;
    target.legRa = -sin * amp;
    target.legLb = 0.25 + Math.max(0, -cos) * (0.8 + speed * 0.9);
    target.legRb = 0.25 + Math.max(0, cos) * (0.8 + speed * 0.9);
    target.armLa = -sin * amp * 0.95;
    target.armRa = sin * amp * 0.95;
    target.armLb = 1.2 + speed * 0.4;
    target.armRb = 1.2 + speed * 0.4;
    target.armLs = 0.24;
    target.armRs = 0.24;
    target.lean = 0.08 + speed * 0.3;
    target.twist = sin * 0.22 * speed;
    target.lift = Math.abs(sin) * 0.07 * speed;
  } else {
    const breathe = Math.sin(t * 2.2 + s.hairStyle * 1.7) * 0.03;
    target.armLs = 0.2 + breathe;
    target.armRs = 0.2 + breathe;
    target.armLb = 0.3;
    target.armRb = 0.3;
    if (f.keeper) {
      target.armLs = 0.65;
      target.armRs = 0.65;
      target.armLa = 0.55;
      target.armRa = 0.55;
      target.drop = 0.08;
      target.legLb = 0.5;
      target.legRb = 0.5;
    }
  }
}

const HIP_Y = 0.64;
const SHOULDER_Y = 0.5;
const HEAD_Y = 0.92;
const THIGH = 0.27;
const SHIN = 0.27;
const UPPER = 0.22;
const FORE = 0.21;

const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Un os : une gélule dont le haut est à l'origine et qui descend d'une unité */
function boneGeometry(radius: number): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(radius, 1, 3, 10);
  g.translate(0, -0.5, 0);
  return g;
}

const HAIR_STYLES = 5;

function hairGeometry(style: number): THREE.BufferGeometry {
  if (style === 1) {
    // La crête : un arc du front à la nuque
    const g = new THREE.TorusGeometry(0.34, 0.075, 6, 16, Math.PI * 0.95);
    g.rotateY(Math.PI / 2);
    g.rotateX(-0.08);
    g.translate(0, 0.02, 0);
    return g;
  }
  if (style === 2) {
    // La tignasse, qui descend sur la nuque
    const g = new THREE.SphereGeometry(0.355, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.74);
    g.rotateX(-0.28);
    g.translate(0, 0.02, -0.03);
    return g;
  }
  if (style === 3) {
    // Le bandeau : une calotte fine et une raie
    const g = new THREE.SphereGeometry(0.345, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.3);
    g.translate(0, 0.02, -0.02);
    return g;
  }
  if (style === 4) {
    // Les cheveux en boule
    const g = new THREE.SphereGeometry(0.43, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
    g.translate(0, 0.02, -0.03);
    return g;
  }
  const g = new THREE.SphereGeometry(0.348, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.46);
  g.rotateX(-0.12);
  g.translate(0, 0.03, -0.015);
  return g;
}

/** Une couleur est-elle claire ? Le numéro prend alors la couleur inverse */
function isLight(hex: string): boolean {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.45;
}

const TILE_COLS = 6;
const TILE_ROWS = 4;

/** Une planche de maillots : un carreau par joueur, avec sa couleur, ses bandes et son numéro dans le dos */
function shirtAtlas(kits: Kit[], shirts: number[]): THREE.CanvasTexture {
  const tw = 170;
  const th = 128;
  const c = document.createElement("canvas");
  c.width = tw * TILE_COLS;
  c.height = th * TILE_ROWS;
  const g = c.getContext("2d")!;
  kits.forEach((k, i) => {
    const x = (i % TILE_COLS) * tw;
    const y = Math.floor(i / TILE_COLS) * th;
    g.fillStyle = k.shirt;
    g.fillRect(x, y, tw, th);
    // Les flancs, le col et le haut des épaules, dans la couleur des manches
    g.fillStyle = k.sleeves === k.shirt ? "rgba(255,255,255,0.28)" : k.sleeves;
    g.fillRect(x + tw * 0.22, y, tw * 0.05, th);
    g.fillRect(x + tw * 0.73, y, tw * 0.05, th);
    g.fillRect(x, y, tw, th * 0.13);
    // Le numéro, au milieu du dos
    g.fillStyle = isLight(k.shirt) ? "#16202c" : "#ffffff";
    g.font = `900 ${th * 0.56}px 'Arial Black', Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(shirts[i] ?? i + 1), x + tw / 2, y + th * 0.57);
    // Un petit écusson sur le cœur
    g.fillStyle = isLight(k.shirt) ? "#16202c" : "#ffffff";
    g.beginPath();
    g.arc(x + tw * 0.08, y + th * 0.34, th * 0.07, 0, Math.PI * 2);
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Footballers {
  private group = new THREE.Group();
  private states: State[] = [];
  private targetPose = zeroPose();
  private meshes: THREE.InstancedMesh[] = [];
  private head: THREE.InstancedMesh;
  private nose: THREE.InstancedMesh;
  private ears: THREE.InstancedMesh;
  private eyes: THREE.InstancedMesh;
  private pupils: THREE.InstancedMesh;
  private brows: THREE.InstancedMesh;
  private mouth: THREE.InstancedMesh;
  private torso: THREE.InstancedMesh;
  private shorts: THREE.InstancedMesh;
  private upperArms: THREE.InstancedMesh;
  private foreArms: THREE.InstancedMesh;
  private hands: THREE.InstancedMesh;
  private thighs: THREE.InstancedMesh;
  private shins: THREE.InstancedMesh;
  private boots: THREE.InstancedMesh;
  private hair: THREE.InstancedMesh[] = [];
  private shadows: THREE.InstancedMesh | null = null;
  private hairUsed: number[] = new Array(HAIR_STYLES).fill(0);
  private atlas: THREE.CanvasTexture;
  private colorsReady = false;
  private blob: THREE.Texture | null = null;

  constructor(
    scene: THREE.Scene,
    private count: number,
    private kits: [Kit, Kit],
    private gkKits: [Kit, Kit],
    private keeperFlags: boolean[],
    shirts: number[],
    castShadows: boolean,
    seed = 1,
  ) {
    const mat = (rough = 0.62) => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: rough, metalness: 0 });
    const add = (g: THREE.BufferGeometry, n: number, material: THREE.Material = mat(), shadow = true) => {
      const m = new THREE.InstancedMesh(g, material, n);
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = castShadows && shadow;
      this.group.add(m);
      this.meshes.push(m);
      return m;
    };
    const head = new THREE.SphereGeometry(0.34, 18, 14);
    head.scale(1, 0.98, 0.96);
    this.head = add(head, count, mat(0.55));
    this.nose = add(new THREE.SphereGeometry(0.06, 8, 6), count, mat(0.55), false);
    this.ears = add(new THREE.SphereGeometry(0.075, 8, 6), count * 2, mat(0.55), false);
    const eye = new THREE.SphereGeometry(0.068, 10, 8);
    eye.scale(0.9, 1.2, 0.34);
    this.eyes = add(eye, count * 2, new THREE.MeshBasicMaterial({ color: "#fdfdf7" }), false);
    const pupil = new THREE.SphereGeometry(0.046, 8, 6);
    pupil.scale(1, 1.3, 0.34);
    this.pupils = add(pupil, count * 2, new THREE.MeshBasicMaterial({ color: "#14141c" }), false);
    this.brows = add(new THREE.BoxGeometry(0.13, 0.03, 0.03), count * 2, mat(0.8), false);
    const smile = new THREE.TorusGeometry(0.075, 0.016, 6, 12, Math.PI);
    smile.rotateZ(Math.PI);
    this.mouth = add(smile, count, new THREE.MeshBasicMaterial({ color: "#6d2a22" }), false);

    const torso = new THREE.CapsuleGeometry(0.27, 0.22, 4, 18);
    torso.scale(1, 1, 0.8);
    const kitOf = keeperFlags.map((k, i) => (k ? gkKits[i < count / 2 ? 0 : 1] : kits[i < count / 2 ? 0 : 1]));
    this.atlas = shirtAtlas(kitOf, shirts);
    const tiles = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      tiles[i * 2] = (i % TILE_COLS) / TILE_COLS;
      tiles[i * 2 + 1] = 1 - (Math.floor(i / TILE_COLS) + 1) / TILE_ROWS;
    }
    torso.setAttribute("aTile", new THREE.InstancedBufferAttribute(tiles, 2));
    const torsoMat = new THREE.MeshStandardMaterial({ map: this.atlas, roughness: 0.68 });
    torsoMat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aTile;")
        .replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>\nvMapUv = uv * vec2(${(1 / TILE_COLS).toFixed(5)}, ${(1 / TILE_ROWS).toFixed(5)}) + aTile;`,
        );
    };
    this.torso = add(torso, count, torsoMat);

    const shorts = new THREE.CylinderGeometry(0.255, 0.3, 0.24, 14);
    shorts.scale(1, 1, 0.82);
    this.shorts = add(shorts, count);
    this.upperArms = add(boneGeometry(0.088), count * 2);
    this.foreArms = add(boneGeometry(0.076), count * 2, mat(0.55));
    this.hands = add(new THREE.SphereGeometry(0.098, 10, 8), count * 2, mat(0.55));
    this.thighs = add(boneGeometry(0.115), count * 2, mat(0.55));
    this.shins = add(boneGeometry(0.095), count * 2);
    const boot = new THREE.CapsuleGeometry(0.105, 0.2, 3, 10);
    boot.rotateX(Math.PI / 2);
    boot.scale(1, 0.74, 1);
    boot.translate(0, 0, 0.08);
    this.boots = add(boot, count * 2, mat(0.4));

    let rng = seed | 0;
    const rand = () => {
      rng = (rng + 0x6d2b79f5) | 0;
      let t = Math.imul(rng ^ (rng >>> 15), 1 | rng);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const style = Math.floor(rand() * HAIR_STYLES);
      this.hairUsed[style]!++;
      this.states.push({
        pose: zeroPose(),
        phase: rand() * 6,
        actAge: 0,
        lastAct: "none",
        skin: new THREE.Color(SKINS[Math.floor(rand() * SKINS.length)]!),
        hair: new THREE.Color(HAIRS[Math.floor(rand() * HAIRS.length)]!),
        hairStyle: style,
        joy: Math.floor(rand() * 3),
      });
    }
    for (let style = 0; style < HAIR_STYLES; style++)
      this.hair.push(add(hairGeometry(style), Math.max(1, this.hairUsed[style]!), mat(0.8)));

    if (!castShadows) {
      // Sans vraies ombres : une tache sombre au sol
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, "rgba(0,0,0,0.5)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.blob = new THREE.CanvasTexture(c);
      const geo = new THREE.PlaneGeometry(1.6, 1.6);
      geo.rotateX(-Math.PI / 2);
      this.shadows = add(geo, count, new THREE.MeshBasicMaterial({ map: this.blob, transparent: true, depthWrite: false }), false);
      this.shadows.renderOrder = 1;
    }
    scene.add(this.group);
  }

  private paint() {
    const c = new THREE.Color();
    const kitOf = (i: number, team: Team) => (this.keeperFlags[i] ? this.gkKits[team] : this.kits[team]);
    const hairCount = new Array(HAIR_STYLES).fill(0) as number[];
    for (let i = 0; i < this.count; i++) {
      const s = this.states[i]!;
      const team: Team = i < this.count / 2 ? 0 : 1;
      const kit = kitOf(i, team);
      this.head.setColorAt(i, s.skin);
      this.nose.setColorAt(i, c.copy(s.skin).multiplyScalar(0.92));
      this.shorts.setColorAt(i, c.set(kit.shorts));
      for (let k = 0; k < 2; k++) {
        const n = i * 2 + k;
        this.ears.setColorAt(n, s.skin);
        this.brows.setColorAt(n, c.copy(s.hair).multiplyScalar(0.7));
        this.upperArms.setColorAt(n, c.set(kit.sleeves));
        this.foreArms.setColorAt(n, this.keeperFlags[i] ? c.set(kit.sleeves) : s.skin);
        this.hands.setColorAt(n, this.keeperFlags[i] ? c.set("#f7f7ee") : s.skin);
        this.thighs.setColorAt(n, s.skin);
        this.shins.setColorAt(n, c.set(kit.socks));
        this.boots.setColorAt(n, c.set(team === 0 ? "#f6d14a" : "#39d0e0"));
      }
      const h = this.hair[s.hairStyle]!;
      h.setColorAt(hairCount[s.hairStyle]!, s.hair);
      hairCount[s.hairStyle]!++;
    }
    for (const m of this.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.colorsReady = true;
  }

  private setBone(mesh: THREE.InstancedMesh, n: number, root: THREE.Matrix4, from: THREE.Vector3, to: THREE.Vector3) {
    tmpV.copy(to).sub(from);
    const len = tmpV.length();
    tmpQ.setFromUnitVectors(DOWN, tmpV.divideScalar(len || 1));
    tmpS.set(1, len, 1);
    tmpM.compose(from, tmpQ, tmpS);
    tmpM2.multiplyMatrices(root, tmpM);
    mesh.setMatrixAt(n, tmpM2);
  }

  private setPart(mesh: THREE.InstancedMesh, n: number, root: THREE.Matrix4, pos: THREE.Vector3, q: THREE.Quaternion) {
    tmpM.compose(pos, q, ONE);
    tmpM2.multiplyMatrices(root, tmpM);
    mesh.setMatrixAt(n, tmpM2);
  }

  update(dt: number, t: number, views: FootballerView[]) {
    if (!this.colorsReady) this.paint();
    const blend = 1 - Math.exp(-dt * 18);
    const hairIndex = new Array(HAIR_STYLES).fill(0) as number[];
    const hip = new THREE.Vector3();
    const knee = new THREE.Vector3();
    const ankle = new THREE.Vector3();
    const shoulder = new THREE.Vector3();
    const elbow = new THREE.Vector3();
    const wrist = new THREE.Vector3();
    const root = new THREE.Matrix4();
    const rootQ = new THREE.Quaternion();
    const upperQ = new THREE.Quaternion();
    const rootPos = new THREE.Vector3();
    const headAt = new THREE.Vector3();
    const scale = new THREE.Vector3(SCALE, SCALE, SCALE);
    const hidden = new THREE.Vector3(0, -50, 0);
    const none = new THREE.Quaternion();
    const hideAll = (i: number, s: State) => {
      tmpM.compose(hidden, none, ONE);
      for (const m of [this.head, this.nose, this.mouth, this.torso, this.shorts]) m.setMatrixAt(i, tmpM);
      if (this.shadows) this.shadows.setMatrixAt(i, tmpM);
      for (const m of [
        this.ears,
        this.eyes,
        this.pupils,
        this.brows,
        this.upperArms,
        this.foreArms,
        this.hands,
        this.thighs,
        this.shins,
        this.boots,
      ]) {
        m.setMatrixAt(i * 2, tmpM);
        m.setMatrixAt(i * 2 + 1, tmpM);
      }
      this.hair[s.hairStyle]!.setMatrixAt(hairIndex[s.hairStyle]!, tmpM);
      hairIndex[s.hairStyle]!++;
    };

    for (let i = 0; i < this.count; i++) {
      const f = views[i]!;
      const s = this.states[i]!;
      if (f.off) {
        hideAll(i, s);
        continue;
      }
      if (f.act !== s.lastAct) {
        s.lastAct = f.act;
        s.actAge = 0;
      } else s.actAge += dt;
      s.phase += (f.v / 1.7) * Math.PI * dt;
      poseFor(s, f, this.targetPose, t);
      const fast = f.act === "kick" || f.act === "dive" ? 2.4 : 1;
      for (const k of POSE_KEYS) s.pose[k] += (this.targetPose[k] - s.pose[k]) * Math.min(1, blend * fast);
      const p = s.pose;

      const yaw = Math.PI / 2 - f.h;
      rootQ.setFromAxisAngle(Y_AXIS, yaw);
      tmpQ2.setFromAxisAngle(Z_AXIS, -p.roll);
      rootQ.multiply(tmpQ2);
      tmpQ2.setFromAxisAngle(X_AXIS, p.pitch);
      rootQ.multiply(tmpQ2);
      rootPos.set(f.x, Math.max(0, p.lift) * SCALE, f.z);
      root.compose(rootPos, rootQ, scale);

      hip.set(0, HIP_Y - p.drop, 0);
      upperQ.setFromAxisAngle(X_AXIS, p.lean);
      tmpQ2.setFromAxisAngle(Y_AXIS, p.twist);
      upperQ.multiply(tmpQ2);
      // Le tronc, penché vers l'avant et qui tourne avec la foulée
      tmpV2
        .set(0, SHOULDER_Y * 0.56, 0)
        .applyQuaternion(upperQ)
        .add(hip);
      this.setPart(this.torso, i, root, tmpV2, upperQ);
      tmpV2.set(0, 0.02, 0).add(hip);
      this.setPart(this.shorts, i, root, tmpV2, none);
      // La tête regarde devant elle
      headAt.set(0, HEAD_Y, 0.02).applyQuaternion(upperQ).add(hip);
      this.setPart(this.head, i, root, headAt, upperQ);
      this.setPart(this.hair[s.hairStyle]!, hairIndex[s.hairStyle]!, root, headAt, upperQ);
      hairIndex[s.hairStyle]!++;
      tmpV2.set(0, -0.03, 0.335).applyQuaternion(upperQ).add(headAt);
      this.setPart(this.nose, i, root, tmpV2, upperQ);
      tmpV2.set(0, -0.15, 0.3).applyQuaternion(upperQ).add(headAt);
      this.setPart(this.mouth, i, root, tmpV2, upperQ);
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        tmpV2
          .set(side * 0.335, -0.01, 0)
          .applyQuaternion(upperQ)
          .add(headAt);
        this.setPart(this.ears, i * 2 + k, root, tmpV2, none);
        tmpV2
          .set(side * 0.125, 0.05, 0.292)
          .applyQuaternion(upperQ)
          .add(headAt);
        this.setPart(this.eyes, i * 2 + k, root, tmpV2, upperQ);
        tmpV2
          .set(side * 0.125, 0.043, 0.312)
          .applyQuaternion(upperQ)
          .add(headAt);
        this.setPart(this.pupils, i * 2 + k, root, tmpV2, upperQ);
        tmpV2
          .set(side * 0.13, 0.18, 0.3)
          .applyQuaternion(upperQ)
          .add(headAt);
        this.setPart(this.brows, i * 2 + k, root, tmpV2, upperQ);

        // La jambe
        const a = k === 0 ? p.legLa : p.legRa;
        const b = k === 0 ? p.legLb : p.legRb;
        hip.set(side * 0.15, HIP_Y - p.drop - 0.08, 0);
        knee.set(hip.x, hip.y - Math.cos(a) * THIGH, hip.z + Math.sin(a) * THIGH);
        const c = a - b;
        ankle.set(knee.x, knee.y - Math.cos(c) * SHIN, knee.z + Math.sin(c) * SHIN);
        this.setBone(this.thighs, i * 2 + k, root, hip, knee);
        this.setBone(this.shins, i * 2 + k, root, knee, ankle);
        tmpQ.setFromAxisAngle(X_AXIS, c * 0.55);
        this.setPart(this.boots, i * 2 + k, root, ankle, tmpQ);

        // Le bras
        const ga = k === 0 ? p.armLa : p.armRa;
        const gb = k === 0 ? p.armLb : p.armRb;
        const gs = k === 0 ? p.armLs : p.armRs;
        hip.set(0, HIP_Y - p.drop, 0);
        shoulder
          .set(side * 0.33, SHOULDER_Y + 0.02, 0)
          .applyQuaternion(upperQ)
          .add(hip);
        elbow.set(
          shoulder.x + side * Math.sin(gs) * UPPER,
          shoulder.y - Math.cos(ga) * Math.cos(gs) * UPPER,
          shoulder.z + Math.sin(ga) * Math.cos(gs) * UPPER,
        );
        const fc = ga + gb;
        wrist.set(elbow.x, elbow.y - Math.cos(fc) * FORE, elbow.z + Math.sin(fc) * FORE);
        this.setBone(this.upperArms, i * 2 + k, root, shoulder, elbow);
        this.setBone(this.foreArms, i * 2 + k, root, elbow, wrist);
        this.setPart(this.hands, i * 2 + k, root, wrist, none);
      }
      if (this.shadows) {
        const flat = p.pitch !== 0 || p.roll !== 0 ? 1.3 : 1;
        tmpS.set(flat, 1, flat);
        tmpV2.set(f.x, 0.03, f.z);
        tmpM.compose(tmpV2, none, tmpS);
        this.shadows.setMatrixAt(i, tmpM);
      }
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    this.atlas.dispose();
    this.blob?.dispose();
    this.group.removeFromParent();
  }
}
