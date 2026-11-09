// Les footballeurs : des petits personnages articulés, dessinés en un seul lot par morceau de corps pour rester fluides
// même à vingt-deux sur un téléphone. Courses, frappes, tacles et plongeons sont calculés, sans animation préenregistrée.

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

const SKINS = ["#f0c8a2", "#e0ac83", "#b98055", "#8a5a3a", "#5d3b26"];
const HAIRS = ["#2a1c12", "#6b4423", "#c99a4e", "#1b1b22", "#8c3a22", "#e8e2d4"];
const SCALE = 1.28;

interface Pose {
  lean: number;
  side: number;
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

const POSE_KEYS: (keyof Pose)[] = [
  "lean",
  "side",
  "drop",
  "lift",
  "legLa",
  "legLb",
  "legRa",
  "legRb",
  "armLa",
  "armLb",
  "armLs",
  "armRa",
  "armRb",
  "armRs",
  "pitch",
  "roll",
];

const zeroPose = (): Pose => ({
  lean: 0,
  side: 0,
  drop: 0,
  lift: 0,
  legLa: 0,
  legLb: 0.15,
  legRa: 0,
  legRb: 0.15,
  armLa: 0,
  armLb: 0.3,
  armLs: 0.12,
  armRa: 0,
  armRb: 0.3,
  armRs: 0.12,
  pitch: 0,
  roll: 0,
});

interface State {
  pose: Pose;
  phase: number;
  /** Depuis quand il fait ce geste, pour le dérouler */
  actAge: number;
  lastAct: Act;
  skin: THREE.Color;
  hair: THREE.Color;
  hairStyle: number;
}

function poseFor(s: State, f: FootballerView, target: Pose, t: number) {
  Object.assign(target, zeroPose());
  const speed = Math.min(1.1, f.v / 8.5);
  const a = f.act;
  if (f.cheer) {
    const bob = Math.sin(t * 9 + s.hairStyle);
    target.armLa = 3.0;
    target.armRa = 3.0;
    target.armLs = 0.25;
    target.armRs = 0.25;
    target.armLb = 0.2 + bob * 0.2;
    target.armRb = 0.2 - bob * 0.2;
    target.lift = Math.max(0, bob) * 0.28;
    return;
  }
  if (a === "kick") {
    const p = Math.min(1, s.actAge / 0.22);
    const swing = p < 0.5 ? -0.9 * (p / 0.5) : -0.9 + 2.9 * ((p - 0.5) / 0.5);
    target.legRa = swing;
    target.legRb = p < 0.5 ? 1.2 : 0.2;
    target.legLa = -0.05;
    target.lean = -0.22;
    target.armLa = 0.7;
    target.armLs = 0.7;
    target.armRa = -0.5;
    return;
  }
  if (a === "tackle") {
    target.legRa = 1.1;
    target.legRb = 0.1;
    target.legLa = -0.5;
    target.legLb = 0.9;
    target.drop = 0.2;
    target.lean = 0.2;
    target.armLs = 0.7;
    target.armRs = 0.7;
    return;
  }
  if (a === "slide") {
    target.pitch = -1.25;
    target.drop = 0.72;
    target.legRa = 1.5;
    target.legRb = 0;
    target.legLa = 1.0;
    target.legLb = 1.4;
    target.armLa = -0.6;
    target.armRa = 0.5;
    target.armLs = 0.9;
    target.armRs = 0.9;
    return;
  }
  if (a === "down") {
    target.pitch = -1.45;
    target.drop = 0.86;
    target.legRa = 0.2;
    target.legLa = 0.4;
    target.legLb = 0.5;
    target.armLs = 0.8;
    target.armRs = 0.8;
    return;
  }
  if (a === "dive") {
    // Le corps part à l'horizontale vers son côté, les bras tendus vers le ballon
    target.roll = f.dirZ * 1.35;
    target.lift = 0.5;
    target.drop = 0.3;
    target.armLa = 3.0;
    target.armRa = 3.0;
    target.armLs = 0.1;
    target.armRs = 0.1;
    target.armLb = 0.05;
    target.armRb = 0.05;
    target.legLb = 0.5;
    target.legRb = 0.3;
    return;
  }
  if (a === "header") {
    target.lift = 0.42;
    target.lean = -0.28;
    target.armLa = -0.4;
    target.armRa = -0.4;
    target.armLs = 0.5;
    target.armRs = 0.5;
    target.legLb = 0.9;
    target.legRb = 0.9;
    return;
  }
  if (a === "hold") {
    target.armLa = 1.25;
    target.armRa = 1.25;
    target.armLb = 1.5;
    target.armRb = 1.5;
    target.armLs = 0.3;
    target.armRs = 0.3;
    return;
  }
  if (a === "throw") {
    target.armLa = 3.0;
    target.armRa = 3.0;
    target.armLs = 0.12;
    target.armRs = 0.12;
    target.armLb = 0.6;
    target.armRb = 0.6;
    target.lean = -0.18;
    return;
  }
  if (f.v > 0.35) {
    const amp = 0.45 + speed * 0.75;
    const sin = Math.sin(s.phase);
    const cos = Math.cos(s.phase);
    target.legLa = sin * amp;
    target.legRa = -sin * amp;
    target.legLb = 0.2 + Math.max(0, -cos) * (0.7 + speed * 0.9);
    target.legRb = 0.2 + Math.max(0, cos) * (0.7 + speed * 0.9);
    target.armLa = -sin * amp * 0.85;
    target.armRa = sin * amp * 0.85;
    target.armLb = 1.05 + speed * 0.4;
    target.armRb = 1.05 + speed * 0.4;
    target.armLs = 0.18;
    target.armRs = 0.18;
    target.lean = 0.08 + speed * 0.32;
    target.lift = Math.abs(sin) * 0.05 * speed;
  } else {
    const breathe = Math.sin(t * 2.2 + s.hairStyle * 1.7) * 0.03;
    target.armLs = 0.14 + breathe;
    target.armRs = 0.14 + breathe;
    target.armLb = 0.3;
    target.armRb = 0.3;
    if (f.keeper) {
      target.armLs = 0.55;
      target.armRs = 0.55;
      target.armLa = 0.5;
      target.armRa = 0.5;
      target.drop = 0.12;
      target.legLb = 0.5;
      target.legRb = 0.5;
    }
  }
}

const HIP_Y = 0.86;
const SHOULDER_Y = 0.54;
const HEAD_Y = 0.86;
const THIGH = 0.42;
const SHIN = 0.42;
const UPPER = 0.31;
const FORE = 0.3;

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

/** Un os : un cylindre dont le haut est à l'origine et qui descend d'une unité */
function boneGeometry(r0: number, r1: number): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry((r0 + r1) / 2, 1, 2, 8);
  g.translate(0, -0.5, 0);
  return g;
}

/** Une calotte de cheveux, ou une crête, ou des cheveux longs */
function hairGeometry(style: number): THREE.BufferGeometry {
  if (style === 1) {
    const g = new THREE.BoxGeometry(0.09, 0.14, 0.42);
    g.translate(0, 0.27, 0);
    return g;
  }
  if (style === 2) {
    const g = new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.72);
    g.translate(0, 0.02, -0.03);
    return g;
  }
  const g = new THREE.SphereGeometry(0.262, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.46);
  g.translate(0, 0.03, -0.015);
  return g;
}

const HAIR_STYLES = 3;

export class Footballers {
  private group = new THREE.Group();
  private states: State[] = [];
  private targetPose = zeroPose();
  private meshes: THREE.InstancedMesh[] = [];
  private head: THREE.InstancedMesh;
  private eyes: THREE.InstancedMesh;
  private torso: THREE.InstancedMesh;
  private shorts: THREE.InstancedMesh;
  private upperArms: THREE.InstancedMesh;
  private foreArms: THREE.InstancedMesh;
  private hands: THREE.InstancedMesh;
  private thighs: THREE.InstancedMesh;
  private shins: THREE.InstancedMesh;
  private boots: THREE.InstancedMesh;
  private hair: THREE.InstancedMesh[] = [];
  private shadows: THREE.InstancedMesh;
  private hairUsed = [0, 0, 0];
  private kits: [Kit, Kit];
  private gkKits: [Kit, Kit];
  private keeperFlags: boolean[];
  private colorsReady = false;

  constructor(
    scene: THREE.Scene,
    private count: number,
    kits: [Kit, Kit],
    gkKits: [Kit, Kit],
    keeperFlags: boolean[],
    seed = 1,
  ) {
    this.kits = kits;
    this.gkKits = gkKits;
    this.keeperFlags = keeperFlags;
    const mat = () => new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const add = (g: THREE.BufferGeometry, n: number, material: THREE.Material = mat()) => {
      const m = new THREE.InstancedMesh(g, material, n);
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      this.meshes.push(m);
      return m;
    };
    const head = new THREE.SphereGeometry(0.26, 14, 12);
    head.scale(1, 1.02, 0.98);
    this.head = add(head, count);
    this.eyes = add(new THREE.SphereGeometry(0.048, 8, 6), count * 2, new THREE.MeshBasicMaterial({ color: "#1b1b22" }));
    const torso = new THREE.CapsuleGeometry(0.24, 0.3, 3, 12);
    torso.scale(1, 1, 0.72);
    this.torso = add(torso, count);
    const shorts = new THREE.CylinderGeometry(0.23, 0.27, 0.24, 12);
    shorts.scale(1, 1, 0.78);
    this.shorts = add(shorts, count);
    this.upperArms = add(boneGeometry(0.085, 0.075), count * 2);
    this.foreArms = add(boneGeometry(0.07, 0.06), count * 2);
    this.hands = add(new THREE.SphereGeometry(0.075, 8, 6), count * 2);
    this.thighs = add(boneGeometry(0.105, 0.09), count * 2);
    this.shins = add(boneGeometry(0.085, 0.07), count * 2);
    const boot = new THREE.BoxGeometry(0.15, 0.11, 0.3);
    boot.translate(0, 0, 0.06);
    this.boots = add(boot, count * 2);
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
      });
    }
    for (let style = 0; style < HAIR_STYLES; style++) {
      const m = add(hairGeometry(style), Math.max(1, this.hairUsed[style]!));
      this.hair.push(m);
    }
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 64;
    const g = shadowCanvas.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeo = new THREE.PlaneGeometry(1.5, 1.5);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadows = add(shadowGeo, count, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadows.renderOrder = 1;
    scene.add(this.group);
  }

  private paint() {
    const c = new THREE.Color();
    const kitOf = (i: number, team: Team) => (this.keeperFlags[i] ? this.gkKits[team] : this.kits[team]);
    let eye = 0;
    void eye;
    const hairCount = [0, 0, 0];
    for (let i = 0; i < this.count; i++) {
      const s = this.states[i]!;
      const team: Team = i < this.count / 2 ? 0 : 1;
      const kit = kitOf(i, team);
      this.head.setColorAt(i, s.skin);
      this.torso.setColorAt(i, c.set(kit.shirt));
      this.shorts.setColorAt(i, c.set(kit.shorts));
      for (let k = 0; k < 2; k++) {
        const n = i * 2 + k;
        this.upperArms.setColorAt(n, c.set(kit.sleeves));
        this.foreArms.setColorAt(n, s.skin);
        this.hands.setColorAt(n, this.keeperFlags[i] ? c.set("#f2f2ea") : s.skin);
        this.thighs.setColorAt(n, s.skin);
        this.shins.setColorAt(n, c.set(kit.socks));
        this.boots.setColorAt(n, c.set(team === 0 ? "#1b1b22" : "#f5f1e6"));
      }
      const h = this.hair[s.hairStyle]!;
      h.setColorAt(hairCount[s.hairStyle]!, s.hair);
      hairCount[s.hairStyle]!++;
    }
    for (const m of this.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.colorsReady = true;
  }

  private setBone(mesh: THREE.InstancedMesh, n: number, root: THREE.Matrix4, from: THREE.Vector3, to: THREE.Vector3, sx = 1) {
    tmpV.copy(to).sub(from);
    const len = tmpV.length();
    tmpQ.setFromUnitVectors(DOWN, tmpV.divideScalar(len || 1));
    tmpS.set(sx, len, sx);
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
    const hairIndex = [0, 0, 0];
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
    const scale = new THREE.Vector3(SCALE, SCALE, SCALE);
    const zero = new THREE.Vector3(0, -50, 0);
    const none = new THREE.Quaternion();

    for (let i = 0; i < this.count; i++) {
      const f = views[i]!;
      const s = this.states[i]!;
      if (f.off) {
        // Expulsé : on le range sous le terrain
        tmpM.compose(zero, none, ONE);
        for (const m of [this.head, this.torso, this.shorts, this.shadows]) m.setMatrixAt(i, tmpM);
        for (const m of [this.upperArms, this.foreArms, this.hands, this.thighs, this.shins, this.boots]) {
          m.setMatrixAt(i * 2, tmpM);
          m.setMatrixAt(i * 2 + 1, tmpM);
        }
        this.eyes.setMatrixAt(i * 2, tmpM);
        this.eyes.setMatrixAt(i * 2 + 1, tmpM);
        this.hair[s.hairStyle]!.setMatrixAt(hairIndex[s.hairStyle]!, tmpM);
        hairIndex[s.hairStyle]!++;
        continue;
      }
      if (f.act !== s.lastAct) {
        s.lastAct = f.act;
        s.actAge = 0;
      } else s.actAge += dt;
      s.phase += (f.v / 2.05) * Math.PI * 2 * dt * 0.5;
      poseFor(s, f, this.targetPose, t);
      const fast = f.act === "kick" || f.act === "dive" ? 2.2 : 1;
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
      // Le tronc, penché vers l'avant
      tmpV2
        .set(0, SHOULDER_Y * 0.5, 0)
        .applyQuaternion(upperQ)
        .add(hip);
      this.setPart(this.torso, i, root, tmpV2, upperQ);
      tmpV2.set(0, -0.04, 0).add(hip);
      this.setPart(this.shorts, i, root, tmpV2, none);
      // La tête et les cheveux suivent le tronc
      tmpV2.set(0, HEAD_Y, 0.02).applyQuaternion(upperQ).add(hip);
      this.setPart(this.head, i, root, tmpV2, upperQ);
      const headAt = tmpV2.clone();
      this.setPart(this.hair[s.hairStyle]!, hairIndex[s.hairStyle]!, root, headAt, upperQ);
      hairIndex[s.hairStyle]!++;
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        tmpV2
          .set(side * 0.1, 0.04, 0.235)
          .applyQuaternion(upperQ)
          .add(headAt);
        this.setPart(this.eyes, i * 2 + k, root, tmpV2, none);

        // La jambe
        const a = k === 0 ? p.legLa : p.legRa;
        const b = k === 0 ? p.legLb : p.legRb;
        hip.set(side * 0.13, HIP_Y - p.drop - 0.1, 0);
        knee.set(hip.x, hip.y - Math.cos(a) * THIGH, hip.z + Math.sin(a) * THIGH);
        const c = a - b;
        ankle.set(knee.x, knee.y - Math.cos(c) * SHIN, knee.z + Math.sin(c) * SHIN);
        this.setBone(this.thighs, i * 2 + k, root, hip, knee);
        this.setBone(this.shins, i * 2 + k, root, knee, ankle);
        tmpQ.setFromAxisAngle(X_AXIS, c * 0.5);
        this.setPart(this.boots, i * 2 + k, root, ankle, tmpQ);

        // Le bras
        const ga = k === 0 ? p.armLa : p.armRa;
        const gb = k === 0 ? p.armLb : p.armRb;
        const gs = k === 0 ? p.armLs : p.armRs;
        hip.set(0, HIP_Y - p.drop, 0);
        shoulder
          .set(side * 0.29, SHOULDER_Y + 0.12, 0)
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
      // L'ombre reste au sol, sous lui
      const flat = p.pitch !== 0 || p.roll !== 0 ? 1.3 : 1;
      tmpS.set(flat, 1, flat);
      tmpV2.set(f.x, 0.03, f.z);
      tmpM.compose(tmpV2, none, tmpS);
      this.shadows.setMatrixAt(i, tmpM);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    this.group.removeFromParent();
  }
}
