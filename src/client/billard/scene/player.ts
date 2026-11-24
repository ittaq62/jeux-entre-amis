// Un joueur de billard en 3D : le personnage du profil (sa tête dessinée, sa coiffure, son chapeau, ce qu'il porte de
// la garde-robe), à grosse tête comme dans les autres jeux, en gilet de la couleur de son portrait sur une chemise
// blanche, nœud papillon, pantalon sombre et souliers vernis. Le même gabarit que le joueur de bowling (ses postures
// d'attente, de marche et de joie servent ici aussi) ; ses coudes, eux, se plient où on le veut : le bras qui tient la
// queue remonte le coude en arrière, celui du pont l'écarte.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { AVATAR_BACKGROUNDS, AVATAR_HAIR_COLORS, AVATAR_SKINS, type AvatarConfig } from "../../../shared/avatar.ts";
import { hairGeometry, hatGroup } from "../../bolides/scene/pilot.ts";
import type { Pose } from "../../bowling/scene/bowler.ts";
import { cloth, limb, loft, mitten, shoe } from "../../culbute/scene/body.ts";
import { outfitCoat, outfitExtras, wearHair, wearHat } from "../../escarmouche/scene/wardrobe3d.ts";

export type V3 = [number, number, number];

/** La taille du personnage : à l'échelle du bowling, le tapis lui arriverait aux hanches */
export const PLAYER_SCALE = 1.22;

// Le gabarit (le même que le joueur de bowling, pour que ses postures servent)
export const HIPS_Y = 0.5;
const SHOULDER_Y = 0.92;
const SHOULDER_X = 0.25;
const HEAD_R = 0.34;
const UPPER = 0.26;
const FORE = 0.25;
const THIGH = 0.235;
const SHIN = 0.215;
/** Le bras tendu (de l'épaule au poignet) */
export const REACH = UPPER + FORE - 0.02;
/** Le centre de la tête, au-dessus des hanches, dans le buste */
export const HEAD_UP = 0.71;
const HEAD_SCALE = 0.86;

/** Où pointent les coudes (vers ce côté-là du bras), pour la main droite puis la gauche */
export interface Elbows {
  r?: V3;
  l?: V3;
}

interface Limb {
  a: THREE.Mesh;
  b: THREE.Mesh;
  end: THREE.Mesh;
}

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const V = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  d: new THREE.Vector3(),
  e: new THREE.Vector3(),
  f: new THREE.Vector3(),
  g: new THREE.Vector3(),
  ikAlong: new THREE.Vector3(),
  ikPerp: new THREE.Vector3(),
  st: new THREE.Vector3(),
  m: new THREE.Matrix4(),
  e3: new THREE.Euler(),
};

function ik(a: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, out: THREE.Vector3) {
  const along = V.ikAlong.subVectors(target, a);
  let d = along.length();
  if (d > l1 + l2 - 0.005) {
    along.multiplyScalar((l1 + l2 - 0.005) / d);
    target.copy(a).add(along);
    d = l1 + l2 - 0.005;
  }
  along.normalize();
  const perp = V.ikPerp.copy(pole).addScaledVector(along, -pole.dot(along));
  if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
  perp.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * Math.max(d, 1e-3));
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  return out.copy(a).addScaledVector(along, x).addScaledVector(perp, h);
}

function stretch(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const dir = V.st.subVectors(b, a);
  const len = dir.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1));
  m.scale.set(1, len / ((m.userData.len as number | undefined) ?? 1), 1);
}

/** L'épaule (droite si side = −1, gauche si +1) dans le repère des postures, pour cette posture */
export function shoulderOf(p: Pose, side: -1 | 1, out: THREE.Vector3): THREE.Vector3 {
  V.e3.set(p.lean, p.twist, p.roll);
  V.m.makeRotationFromEuler(V.e3).setPosition(0, HIPS_Y - p.crouch, 0);
  return out.set(side * SHOULDER_X, SHOULDER_Y - HIPS_Y, 0).applyMatrix4(V.m);
}

/** Le centre de la tête dans le repère des postures */
export function headOf(p: Pose, out: THREE.Vector3): THREE.Vector3 {
  V.e3.set(p.lean, p.twist, p.roll);
  V.m.makeRotationFromEuler(V.e3).setPosition(0, HIPS_Y - p.crouch, 0);
  return out.set(0, HEAD_UP, 0.02).applyMatrix4(V.m);
}

const darker = (hex: string, k: number) => {
  const c = new THREE.Color(hex);
  return "#" + c.multiplyScalar(k).getHexString();
};

/** Le gilet : sa couleur, le V de la chemise blanche devant, la rangée de boutons, les poches, le dos satiné */
function vestTexture(vest: string, shirt: string, button: string): THREE.CanvasTexture {
  const W = 256,
    H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = vest;
  g.fillRect(0, 0, W, H);
  // Le dos, en satin un peu plus clair (le loft tourne autour du buste : u = 0 devant, 0,5 dans le dos)
  const back = g.createLinearGradient(W * 0.3, 0, W * 0.7, 0);
  back.addColorStop(0, vest);
  back.addColorStop(0.5, darker(vest, 1.25));
  back.addColorStop(1, vest);
  g.fillStyle = back;
  g.fillRect(W * 0.3, 0, W * 0.4, H);
  // Le V de la chemise, en haut devant (u autour de 0, donc aux deux bords de l'image)
  const vDepth = H * 0.58,
    open = W * 0.15;
  g.fillStyle = shirt;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(open, 0);
  g.lineTo(0, vDepth);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(W, 0);
  g.lineTo(W - open, 0);
  g.lineTo(W, vDepth);
  g.closePath();
  g.fill();
  // Le bord du gilet le long du V
  g.strokeStyle = darker(vest, 0.6);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(open, 0);
  g.lineTo(0, vDepth);
  g.moveTo(W - open, 0);
  g.lineTo(W, vDepth);
  g.stroke();
  // Les boutons, sur la ligne du milieu devant
  g.fillStyle = button;
  for (let y = vDepth + 9; y < H - 6; y += 13) {
    for (const x of [0, W]) {
      g.beginPath();
      g.arc(x, y, 3.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Les poches passepoilées
  g.strokeStyle = darker(vest, 0.55);
  g.lineWidth = 2.5;
  for (const x of [W * 0.1, W * 0.9]) {
    g.beginPath();
    g.moveTo(x - 9, H * 0.76);
    g.lineTo(x + 9, H * 0.74);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface PlayerLook {
  avatar: AvatarConfig;
  /** La couleur du nœud papillon */
  accent: string;
}

export class PlayerModel {
  readonly group = new THREE.Group();
  /** Le devant du modèle est vers +z dans `root` ; le groupe, lui, regarde vers −z */
  private root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private skull: THREE.Mesh;
  private arms: Limb[] = [];
  private legs: Limb[] = [];
  private disposables: { dispose: () => void }[] = [];
  /** La main droite (celle qui tient la queue), dans le monde ; la direction de son avant-bras */
  readonly rightHand = new THREE.Vector3();
  readonly rightFore = new THREE.Vector3();
  /** Le centre de la tête, dans le monde */
  readonly headWorld = new THREE.Vector3();
  readonly look: PlayerLook;

  constructor(look: PlayerLook, touch = false) {
    this.look = look;
    const keep = <T extends { dispose: () => void }>(x: T) => (this.disposables.push(x), x);
    const avatar = look.avatar;
    const skinHex = AVATAR_SKINS[avatar.skin] ?? AVATAR_SKINS[0]!;
    const bg = AVATAR_BACKGROUNDS[avatar.bg] ?? AVATAR_BACKGROUNDS[0]!;
    const own = outfitCoat(avatar.wear?.outfit);
    // Le gilet à la couleur de son portrait (ou de sa tenue), assombrie : un gilet de soirée
    const vest = darker(own.coat ?? bg, own.coat ? 0.8 : 0.62);
    const shirt = "#f1eee6";
    const vestMat = keep(cloth(0xffffff, 0.7, 0.3, keep(vestTexture(vest, shirt, "#d8c48a"))));
    const shirtMat = keep(cloth(shirt, 0.8, 0.3));
    const trousers = keep(cloth(0x23232b, 0.78, 0.22));
    const skin = keep(cloth(skinHex, 0.62, 0.22));
    const shoeMat = keep(new THREE.MeshStandardMaterial({ color: 0x131315, roughness: 0.3, metalness: 0.1 }));
    const geo = <T extends THREE.BufferGeometry>(g: T) => keep(g);

    this.group.scale.setScalar(PLAYER_SCALE);
    this.group.add(this.root);
    this.root.rotation.y = Math.PI;
    this.root.add(this.body);
    this.body.add(this.torso);
    this.torso.position.y = HIPS_Y;

    const chest = new THREE.Mesh(
      geo(
        loft([
          [-0.12, 0.17, 0.14],
          [-0.04, 0.212, 0.168],
          [0.06, 0.232, 0.186],
          [0.16, 0.238, 0.19],
          [0.26, 0.244, 0.18],
          [0.34, 0.24, 0.166],
          [0.41, 0.203, 0.143],
          [0.46, 0.12, 0.095],
        ]),
      ),
      vestMat,
    );
    this.torso.add(chest);
    // Le nœud papillon : deux triangles et le nœud, d'un seul tenant
    const wingL = new THREE.ConeGeometry(0.034, 0.07, 4);
    wingL.rotateZ(Math.PI / 2);
    wingL.translate(0.035, 0, 0);
    const wingR = new THREE.ConeGeometry(0.034, 0.07, 4);
    wingR.rotateZ(-Math.PI / 2);
    wingR.translate(-0.035, 0, 0);
    const knot = new THREE.SphereGeometry(0.018, 8, 6);
    const bow = new THREE.Mesh(geo(mergeGeometries([wingL, wingR, knot], false)!), keep(cloth(look.accent, 0.55, 0.25)));
    for (const g of [wingL, wingR, knot]) g.dispose();
    bow.position.set(0, 0.425, 0.14);
    bow.rotation.x = -0.35;
    this.torso.add(bow);
    // Le bassin
    const hips = new THREE.Mesh(
      geo(
        loft([
          [-0.2, 0.15, 0.12],
          [-0.14, 0.2, 0.155],
          [-0.04, 0.218, 0.172],
          [0.04, 0.222, 0.176],
        ]),
      ),
      trousers,
    );
    this.torso.add(hips);
    // Ce qu'il porte de sa garde-robe sur le buste (cape, écharpe, collier…) : fait pour un buste tourné vers −z
    const extras = outfitExtras(avatar.wear?.outfit, bg, keep);
    if (extras) {
      extras.rotation.y = Math.PI;
      extras.scale.setScalar(1.25);
      extras.position.set(0, -0.2, 0);
      this.torso.add(extras);
    }

    // La tête : la peau de l'avatar (posée plus tard), les oreilles, la coiffure, le chapeau
    this.head.position.set(0, HEAD_UP, 0.02);
    // Une tête un peu moins grosse qu'au bowling : penché sur la table, elle cacherait tout
    this.head.scale.setScalar(HEAD_SCALE);
    this.torso.add(this.head);
    this.skull = new THREE.Mesh(geo(new THREE.SphereGeometry(HEAD_R, touch ? 22 : 32, touch ? 16 : 22)), skin);
    this.head.add(this.skull);
    const earGeos = [-1, 1].map((side) => {
      const e = new THREE.SphereGeometry(HEAD_R * 0.24, 10, 8);
      e.scale(0.55, 1, 0.85);
      e.translate(side * HEAD_R * 0.97, -HEAD_R * 0.05, -HEAD_R * 0.05);
      return e;
    });
    this.head.add(new THREE.Mesh(geo(mergeGeometries(earGeos, false)!), skin));
    for (const e of earGeos) e.dispose();
    const wornHat = avatar.wear?.hat;
    const wornHair = avatar.wear?.hair;
    const hatCoversTop = wornHat
      ? ["melon", "chantier", "toque", "helice", "tricorne", "sorcier", "viking"].includes(wornHat)
      : [1, 2, 4, 5, 7].includes(avatar.hat);
    const hairColor = AVATAR_HAIR_COLORS[avatar.hairColor] ?? AVATAR_HAIR_COLORS[0]!;
    const extraHair = wearHair(wornHair, HEAD_R, hairColor, keep);
    if (extraHair) this.head.add(extraHair);
    const hairGeo = extraHair ? null : hairGeometry(avatar.hair, hatCoversTop);
    if (hairGeo) {
      const hairMat = keep(cloth(hairColor, 0.75, 0.35));
      hairMat.side = THREE.DoubleSide;
      this.head.add(new THREE.Mesh(keep(hairGeo), hairMat));
    }
    const hat = wornHat ? wearHat(wornHat, HEAD_R, keep) : hatGroup(avatar.hat, keep, false);
    if (hat) this.head.add(hat);

    // Les bras (manches de chemise retroussées), les jambes, les souliers
    for (let i = 0; i < 2; i++) {
      const upper = new THREE.Mesh(geo(limb((u) => 0.088 - u * 0.012, UPPER)), skin);
      const fore = new THREE.Mesh(geo(limb((u) => 0.074 - u * 0.012, FORE)), skin);
      upper.userData.len = UPPER;
      fore.userData.len = FORE;
      // La manche, fermée à l'épaule (elle entre dans le buste) et retroussée au-dessus du coude
      const sleeve = new THREE.Mesh(
        geo(
          loft(
            [
              [-0.04, 0.06, 0.06],
              [0.0, 0.1, 0.1],
              [0.07, 0.106, 0.106],
              [0.14, 0.1, 0.1],
              [0.155, 0.108, 0.108],
              [0.18, 0.106, 0.106],
            ],
            14,
          ),
        ),
        shirtMat,
      );
      upper.add(sleeve);
      const hand = new THREE.Mesh(geo(mitten(0.1)), skin);
      this.body.add(upper, fore, hand);
      this.arms.push({ a: upper, b: fore, end: hand });
      const thigh = new THREE.Mesh(geo(limb((u) => 0.105 - u * 0.018, THIGH)), trousers);
      const shin = new THREE.Mesh(geo(limb((u) => 0.085 - u * 0.02, SHIN)), trousers);
      thigh.userData.len = THIGH;
      shin.userData.len = SHIN;
      const foot = new THREE.Mesh(geo(shoe(0.29, 0.18)), shoeMat);
      this.body.add(thigh, shin, foot);
      this.legs.push({ a: thigh, b: shin, end: foot });
    }
  }

  /** La peau de la tête avec les traits de l'avatar */
  setHead(canvas: HTMLCanvasElement) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.disposables.push(tex);
    const mat = cloth(0xffffff, 0.6, 0.22, tex);
    this.disposables.push(mat);
    this.skull.material = mat;
  }

  /** Un point du monde dans le repère des postures (le groupe déjà placé) */
  toPose(world: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    return this.root.worldToLocal(out.copy(world));
  }

  /** Une direction du monde dans le repère des postures */
  dirToPose(world: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    const q = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    return out.copy(world).applyQuaternion(q).normalize();
  }

  /** Une posture ; `elbows` oriente les coudes (sinon : vers l'extérieur et un peu en arrière) */
  apply(p: Pose, elbows?: Elbows) {
    this.body.position.y = p.lift;
    this.body.rotation.y = p.spin;
    this.torso.position.y = HIPS_Y - p.crouch;
    this.torso.rotation.set(p.lean, p.twist, p.roll);
    this.head.rotation.set(p.nod * 0.6, p.turn, 0);
    this.torso.updateMatrix();
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i]!;
      const side = i === 0 ? -1 : 1;
      const shoulder = V.a.set(side * SHOULDER_X, SHOULDER_Y - HIPS_Y, 0).applyMatrix4(this.torso.matrix);
      const target = V.b.fromArray(p.hands[i]!);
      const pole = (i === 0 ? elbows?.r : elbows?.l) ?? [side * 0.6, -0.5, -0.5];
      const elbow = ik(shoulder, target, UPPER, FORE, V.c.fromArray(pole), V.d);
      stretch(arm.a, shoulder, elbow);
      stretch(arm.b, elbow, target);
      arm.end.position.copy(target);
      arm.end.quaternion.setFromUnitVectors(DOWN, V.e.subVectors(target, elbow).normalize());
    }
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i]!;
      const side = i === 0 ? -1 : 1;
      const hip = V.a.set(side * 0.1, HIPS_Y - p.crouch - 0.03, 0);
      const f = p.feet[i]!;
      const ankle = V.b.set(f[0], f[1] + 0.06, f[2] - 0.02);
      const knee = ik(hip, ankle, THIGH, SHIN, V.c.set(0, 0.1, 1), V.d);
      stretch(leg.a, hip, knee);
      stretch(leg.b, knee, ankle);
      const shinUp = V.e.subVectors(knee, ankle).normalize();
      const lift = Math.min(1, Math.max(0, f[1] * 4));
      const up = V.f.set(0, 1, 0).lerp(shinUp, lift).normalize();
      leg.end.quaternion.setFromUnitVectors(UP, up);
      leg.end.position.copy(ankle).add(V.g.set(0, -0.06, -0.05).applyQuaternion(leg.end.quaternion));
    }
    this.group.updateMatrixWorld(true);
    const right = this.arms[0]!;
    this.rightHand.setFromMatrixPosition(right.end.matrixWorld);
    const elbowW = V.g.setFromMatrixPosition(right.b.matrixWorld);
    this.rightFore.subVectors(this.rightHand, elbowW).normalize();
    this.head.getWorldPosition(this.headWorld);
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  get visible() {
    return this.group.visible;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
