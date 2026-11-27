// Un candidat de La Cour des Grands en 3D : le personnage du profil (sa tête dessinée, sa coiffure, son chapeau, ce
// qu'il porte de la garde-robe), à grosse tête, en maillot de candidat (aux couleurs de son portrait, ou le motif acheté),
// short et baskets. Pour qu'une foule de quarante tienne sur un téléphone, tout le personnage est UNE seule forme animée
// par un petit squelette (bassin, buste, tête, bras, avant-bras, cuisses, tibias) : un seul appel de dessin, une seule
// texture (la peau de la tête en haut, le motif du maillot en bas, un coin blanc pour les couleurs des sommets).
//
// Ses postures sont calculées à chaque image (marcher, courir, se figer, tomber, tirer, sauter, s'asseoir…) et posées
// sur les os.

import * as THREE from "three";
import { AVATAR_BACKGROUNDS, AVATAR_HAIR_COLORS, AVATAR_SKINS, type AvatarConfig } from "../../../shared/avatar.ts";
import type { CourLook } from "../../../shared/games/cour/looks.ts";
import { JERSEY_BY_ID } from "../../../shared/games/cour/looks.ts";
import { hairGeometry, hatGroup } from "../../bolides/scene/pilot.ts";
import { limb, loft, mitten, shoe } from "../../culbute/scene/body.ts";
import { outfitCoat, wearHair, wearHat } from "../../escarmouche/scene/wardrobe3d.ts";

export const HEAD_R = 0.34;
/** Les hauteurs au repos (mètres, les pieds en 0) */
const HIPS_Y = 0.56;
const SPINE_UP = 0.08;
const NECK_UP = 0.44;
const HEAD_UP = 0.31;
const SHOULDER_X = 0.21;
const SHOULDER_UP = 0.36;
const UPPER = 0.22;
const FORE = 0.21;
const THIGH = 0.26;
const SHIN = 0.24;
const HIP_X = 0.1;

export const BONES = {
  root: 0,
  hips: 1,
  spine: 2,
  head: 3,
  armL: 4,
  foreL: 5,
  armR: 6,
  foreR: 7,
  thighL: 8,
  shinL: 9,
  thighR: 10,
  shinR: 11,
} as const;

/** Une posture : des angles (radians) et quelques déplacements, dans le repère du personnage (devant : +z) */
export interface Pose {
  /** Le bassin monte ou descend (mètres), avance, se penche en avant (x), tourne (y), penche sur le côté (z) */
  lift: number;
  fwd: number;
  lean: number;
  twist: number;
  roll: number;
  /** Le buste plie en avant, tourne */
  bend: number;
  turn: number;
  /** La tête : hoche, tourne, penche */
  nod: number;
  look: number;
  tilt: number;
  /** Les bras (gauche puis droit) : vers l'avant (x), écartés (z), coude plié */
  armL: [number, number, number];
  armR: [number, number, number];
  /** Les jambes : vers l'avant, écartées, genou plié */
  legL: [number, number, number];
  legR: [number, number, number];
  /** Couché : 0 debout, 1 sur le dos, -1 sur le ventre */
  down: number;
}

export const STAND: Pose = {
  lift: 0,
  fwd: 0,
  lean: 0.02,
  twist: 0,
  roll: 0,
  bend: 0,
  turn: 0,
  nod: 0,
  look: 0,
  tilt: 0,
  armL: [0.05, 0.12, 0.15],
  armR: [0.05, 0.12, 0.15],
  legL: [0, 0.03, 0.04],
  legR: [0, 0.03, 0.04],
  down: 0,
};

export const pose = (p: Partial<Pose>): Pose => ({ ...STAND, ...p });

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const l3 = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [
  lerp(a[0], b[0], k),
  lerp(a[1], b[1], k),
  lerp(a[2], b[2], k),
];

export function blendPose(a: Pose, b: Pose, k: number): Pose {
  return {
    lift: lerp(a.lift, b.lift, k),
    fwd: lerp(a.fwd, b.fwd, k),
    lean: lerp(a.lean, b.lean, k),
    twist: lerp(a.twist, b.twist, k),
    roll: lerp(a.roll, b.roll, k),
    bend: lerp(a.bend, b.bend, k),
    turn: lerp(a.turn, b.turn, k),
    nod: lerp(a.nod, b.nod, k),
    look: lerp(a.look, b.look, k),
    tilt: lerp(a.tilt, b.tilt, k),
    armL: l3(a.armL, b.armL, k),
    armR: l3(a.armR, b.armR, k),
    legL: l3(a.legL, b.legL, k),
    legR: l3(a.legR, b.legR, k),
    down: lerp(a.down, b.down, k),
  };
}

type Part = { geo: THREE.BufferGeometry; bone: number; color: THREE.Color; region: "head" | "jersey" | "plain" };

/** La matière de tous les candidats (un même programme ; chacun a sa texture) avec un liseré de lumière au bord */
function candidateMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.78, metalness: 0 });
  mat.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      "#include <opaque_fragment>",
      `float rimLight = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 2.8);
outgoingLight += (diffuseColor.rgb * 0.45 + vec3(0.55, 0.5, 0.42)) * rimLight * 0.3;
#include <opaque_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => "cour-candidat";
  return mat;
}

/** Le motif du maillot, dessiné dans le bas de la texture */
function drawJersey(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, look: CourLook, avatar: AvatarConfig) {
  const info = JERSEY_BY_ID.get(look.jersey);
  const coat = outfitCoat(avatar.wear?.outfit);
  const base = AVATAR_BACKGROUNDS[avatar.bg] ?? AVATAR_BACKGROUNDS[0]!;
  const [a, b] = info?.colors ?? coat.stripes ?? [coat.coat ?? base, "#ffffff"];
  g.fillStyle = a;
  g.fillRect(x, y, w, h);
  g.fillStyle = b;
  switch (info?.colors ? look.jersey : coat.stripes ? "rayures" : "portrait") {
    case "rayures":
      for (let k = 0; k < 8; k++) g.fillRect(x, y + (k * h) / 8, w, h / 16);
      break;
    case "pois":
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 8; c++) {
          g.beginPath();
          g.arc(x + ((c + (r % 2) * 0.5) * w) / 8, y + ((r + 0.5) * h) / 6, w / 40, 0, Math.PI * 2);
          g.fill();
        }
      break;
    case "damier":
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2) g.fillRect(x + (c * w) / 8, y + (r * h) / 8, w / 8, h / 8);
      break;
    case "etoiles":
      for (let k = 0; k < 22; k++) {
        const sx = x + ((k * 73) % 97) * (w / 97);
        const sy = y + ((k * 41) % 89) * (h / 89);
        star(g, sx, sy, w / 34);
      }
      break;
    case "arcenciel": {
      const cols = ["#ff6b6b", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#9775fa"];
      cols.forEach((c, k) => {
        g.fillStyle = c;
        g.fillRect(x, y + (k * h) / cols.length, w, h / cols.length + 1);
      });
      break;
    }
    case "or": {
      const grad = g.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, "#b7841a");
      grad.addColorStop(0.45, "#ffe9a0");
      grad.addColorStop(0.55, "#f3c64a");
      grad.addColorStop(1, "#9c6c10");
      g.fillStyle = grad;
      g.fillRect(x, y, w, h);
      break;
    }
    default: {
      // Le maillot uni : un col et deux bandes claires sur les côtés, pour qu'il ait l'air d'un vrai maillot
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.fillRect(x, y + h * 0.9, w, h * 0.1);
      g.fillRect(x + w * 0.22, y, w * 0.04, h);
      g.fillRect(x + w * 0.74, y, w * 0.04, h);
    }
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** Une forme d'un groupe de three.js (un chapeau, une coiffure de la garde-robe), fondue, avec la couleur de chaque morceau */
function groupParts(group: THREE.Object3D, bone: number, into: Part[], matrix: THREE.Matrix4) {
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld).applyMatrix4(matrix);
    into.push({ geo, bone, color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff), region: "plain" });
  });
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
}

export interface CandidateBuild {
  avatar: AvatarConfig;
  look: CourLook;
  head: HTMLCanvasElement | null;
  /** Moins de détails (la foule au loin) */
  lite?: boolean;
}

/** Le personnage, prêt à poser */
export class CandidateModel {
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[];
  readonly material: THREE.MeshStandardMaterial;
  private texture: THREE.CanvasTexture;
  private baseColor = new THREE.Color(0xffffff);
  /** La teinte qui le recouvre (peinture, gelée…), de 0 à 1 */
  private stain = 0;
  private stainColor = new THREE.Color(0xffffff);

  constructor(b: CandidateBuild) {
    const seg = b.lite ? 10 : 14;
    const skin = new THREE.Color(AVATAR_SKINS[b.avatar.skin] ?? AVATAR_SKINS[0]!);
    const hairColor = new THREE.Color(AVATAR_HAIR_COLORS[b.avatar.hairColor] ?? AVATAR_HAIR_COLORS[0]!);
    const white = new THREE.Color(0xffffff);
    const shorts = new THREE.Color("#2d3450");
    const sock = new THREE.Color("#f4f1ea");
    const sneaker = new THREE.Color(["#e8e4da", "#d23d3d", "#2e6fd1", "#242428", "#f0b429"][(b.avatar.mouth + b.avatar.eyes) % 5]!);

    // La texture : la peau de la tête en haut (512 × 256), le maillot en bas à gauche, un coin blanc en bas à droite
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const g = canvas.getContext("2d")!;
    g.fillStyle = AVATAR_SKINS[b.avatar.skin] ?? AVATAR_SKINS[0]!;
    g.fillRect(0, 0, 512, 256);
    if (b.head) g.drawImage(b.head, 0, 0, 512, 256);
    drawJersey(g, 0, 256, 256, 256, b.look, b.avatar);
    g.fillStyle = "#ffffff";
    g.fillRect(256, 256, 256, 256);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = candidateMaterial(this.texture);

    // Les os, au repos (le personnage debout, les bras le long du corps)
    const bones: THREE.Bone[] = [];
    const bone = (parent: THREE.Bone | null, x: number, y: number, z: number) => {
      const bn = new THREE.Bone();
      bn.position.set(x, y, z);
      if (parent) parent.add(bn);
      bones.push(bn);
      return bn;
    };
    const root = bone(null, 0, 0, 0);
    const hips = bone(root, 0, HIPS_Y, 0);
    const spine = bone(hips, 0, SPINE_UP, 0);
    bone(spine, 0, NECK_UP + HEAD_UP, 0.02);
    const armL = bone(spine, SHOULDER_X, SHOULDER_UP, 0);
    bone(armL, 0, -UPPER, 0);
    const armR = bone(spine, -SHOULDER_X, SHOULDER_UP, 0);
    bone(armR, 0, -UPPER, 0);
    const thighL = bone(hips, HIP_X, -0.04, 0);
    bone(thighL, 0, -THIGH, 0);
    const thighR = bone(hips, -HIP_X, -0.04, 0);
    bone(thighR, 0, -THIGH, 0);
    this.bones = bones;
    root.updateMatrixWorld(true);
    const at = (i: number) => new THREE.Vector3().setFromMatrixPosition(bones[i]!.matrixWorld);

    // Les morceaux, posés à leur place au repos, chacun sur son os
    const parts: Part[] = [];
    const add = (geo: THREE.BufferGeometry, boneIdx: number, color: THREE.Color, region: Part["region"] = "plain") =>
      parts.push({ geo, bone: boneIdx, color, region });
    const torsoBase = at(BONES.spine);
    // Le buste : un maillot ample, un peu bombé
    const torso = loft(
      [
        [-0.13, 0.17, 0.13],
        [-0.04, 0.2, 0.15, 0.01],
        [0.12, 0.22, 0.16, 0.015],
        [0.28, 0.23, 0.155, 0.01],
        [0.4, 0.2, 0.13],
        [0.46, 0.11, 0.09],
        [0.5, 0.05, 0.05],
      ],
      seg + 4,
    );
    torso.translate(torsoBase.x, torsoBase.y, torsoBase.z);
    add(torso, BONES.spine, white, "jersey");
    // Le short
    const pants = loft(
      [
        [-0.22, 0.16, 0.12],
        [-0.12, 0.19, 0.14],
        [0.02, 0.18, 0.135],
        [0.06, 0.17, 0.13],
      ],
      seg + 2,
    );
    const hp = at(BONES.hips);
    pants.translate(hp.x, hp.y, hp.z);
    add(pants, BONES.hips, shorts);
    // Le cou
    const neck = new THREE.CylinderGeometry(0.07, 0.08, 0.14, 10);
    neck.translate(torsoBase.x, torsoBase.y + 0.5, torsoBase.z + 0.01);
    add(neck, BONES.spine, skin);
    // La tête : la sphère de la peau dépliée (le visage devant, en +z), les oreilles, la coiffure, le chapeau
    const hc = at(BONES.head);
    const headGeo = new THREE.SphereGeometry(HEAD_R, b.lite ? 20 : 28, b.lite ? 14 : 18);
    headGeo.translate(hc.x, hc.y, hc.z);
    add(headGeo, BONES.head, white, "head");
    for (const s of [-1, 1]) {
      const ear = new THREE.SphereGeometry(HEAD_R * 0.24, 8, 6);
      ear.scale(0.55, 1, 0.85);
      ear.translate(hc.x + s * HEAD_R * 0.97, hc.y - HEAD_R * 0.05, hc.z - HEAD_R * 0.05);
      add(ear, BONES.head, skin);
    }
    const headMatrix = new THREE.Matrix4().makeTranslation(hc.x, hc.y, hc.z);
    const keep = <T extends { dispose: () => void }>(x: T) => x;
    const wear = b.avatar.wear;
    const hatCoversTop = [1, 2, 4, 5, 7].includes(b.avatar.hat) || Boolean(wear?.hat);
    const wornHair = wearHair(wear?.hair, HEAD_R, `#${hairColor.getHexString()}`, keep);
    if (wornHair) groupParts(wornHair, BONES.head, parts, headMatrix);
    else {
      const hair = hairGeometry(b.avatar.hair, hatCoversTop);
      if (hair) {
        hair.applyMatrix4(headMatrix);
        add(hair.index ? hair.toNonIndexed() : hair, BONES.head, hairColor);
      }
    }
    const hat = wearHat(wear?.hat, HEAD_R, keep) ?? hatGroup(b.avatar.hat, keep, false);
    if (hat) groupParts(hat, BONES.head, parts, headMatrix);

    // Les bras : la manche courte du maillot, la peau, la main
    for (const [arm, fore, side] of [
      [BONES.armL, BONES.foreL, 1],
      [BONES.armR, BONES.foreR, -1],
    ] as const) {
      const sh = at(arm);
      const sleeve = limb((u) => 0.072 - u * 0.012, UPPER * 0.55, seg - 4);
      sleeve.rotateX(Math.PI);
      sleeve.translate(sh.x, sh.y, sh.z);
      add(sleeve, arm, white, "jersey");
      const upper = limb((u) => 0.056 - u * 0.006, UPPER, seg - 6);
      upper.rotateX(Math.PI);
      upper.translate(sh.x, sh.y, sh.z);
      add(upper, arm, skin);
      const el = at(fore);
      const lower = limb((u) => 0.05 - u * 0.01, FORE, seg - 6);
      lower.rotateX(Math.PI);
      lower.translate(el.x, el.y, el.z);
      add(lower, fore, skin);
      const hand = mitten(0.075);
      hand.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
      hand.translate(el.x, el.y - FORE - 0.01, el.z);
      add(hand, fore, skin);
    }
    // Les jambes, les chaussettes, les baskets
    for (const [thigh, shin] of [
      [BONES.thighL, BONES.shinL],
      [BONES.thighR, BONES.shinR],
    ] as const) {
      const hip = at(thigh);
      const up = limb((u) => 0.074 - u * 0.012, THIGH, seg - 4);
      up.rotateX(Math.PI);
      up.translate(hip.x, hip.y, hip.z);
      add(up, thigh, skin);
      const kn = at(shin);
      const low = limb((u) => 0.06 - u * 0.016, SHIN, seg - 6);
      low.rotateX(Math.PI);
      low.translate(kn.x, kn.y, kn.z);
      add(low, shin, skin);
      const socks = limb(() => 0.05, 0.09, seg - 6);
      socks.rotateX(Math.PI);
      socks.translate(kn.x, kn.y - SHIN + 0.09, kn.z);
      add(socks, shin, sock);
      const foot = shoe(0.24, 0.13);
      foot.translate(kn.x, kn.y - SHIN - 0.045, kn.z - 0.05);
      add(foot, shin, sneaker);
    }

    // Tout fondu en une forme : la peau de chaque morceau va chercher sa région de la texture
    const geo = fuse(parts);
    this.mesh = new THREE.SkinnedMesh(geo, this.material);
    this.mesh.add(root);
    this.mesh.bind(new THREE.Skeleton(bones));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  /** La posture de cette image */
  setPose(p: Pose) {
    const b = this.bones;
    const e = (i: number, x: number, y: number, z: number) => b[i]!.rotation.set(x, y, z, "YXZ");
    const root = b[BONES.root]!;
    // Couché : le personnage bascule autour de ses pieds
    root.rotation.set(p.down * -1.45, 0, 0);
    root.position.set(0, Math.abs(p.down) * 0.16, -p.down * 0.12);
    b[BONES.hips]!.position.set(0, HIPS_Y + p.lift, p.fwd);
    e(BONES.hips, p.lean, p.twist, p.roll);
    e(BONES.spine, p.bend, p.turn, 0);
    e(BONES.head, p.nod, p.look, p.tilt);
    e(BONES.armL, -p.armL[0], 0, p.armL[1]);
    e(BONES.foreL, -p.armL[2], 0, 0);
    e(BONES.armR, -p.armR[0], 0, -p.armR[1]);
    e(BONES.foreR, -p.armR[2], 0, 0);
    e(BONES.thighL, -p.legL[0], 0, p.legL[1]);
    e(BONES.shinL, p.legL[2], 0, 0);
    e(BONES.thighR, -p.legR[0], 0, -p.legR[1]);
    e(BONES.shinR, p.legR[2], 0, 0);
  }

  /** Recouvert de peinture, de gelée, de mousse… (0 : propre) */
  setStain(color: THREE.ColorRepresentation | null, k: number) {
    if (color) this.stainColor.set(color);
    if (Math.abs(k - this.stain) < 0.004) return;
    this.stain = k;
    this.material.color.copy(this.baseColor).lerp(this.stainColor, k);
  }

  /** Un éclat (passé une épreuve, choisi) */
  setGlow(k: number) {
    this.material.emissive.setRGB(k * 0.35, k * 0.3, k * 0.12);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.mesh.skeleton.dispose();
  }
}

/** Les morceaux en une forme, avec les os, les couleurs et les coordonnées de texture de chacun */
function fuse(parts: Part[]): THREE.BufferGeometry {
  let count = 0;
  const flat = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    count += g.getAttribute("position").count;
    return { ...p, geo: g };
  });
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const col = new Float32Array(count * 3);
  const si = new Uint16Array(count * 4);
  const sw = new Float32Array(count * 4);
  let o = 0;
  for (const p of flat) {
    const P = p.geo.getAttribute("position");
    const N = p.geo.getAttribute("normal");
    const U = p.geo.getAttribute("uv");
    for (let k = 0; k < P.count; k++) {
      pos[(o + k) * 3] = P.getX(k);
      pos[(o + k) * 3 + 1] = P.getY(k);
      pos[(o + k) * 3 + 2] = P.getZ(k);
      nor[(o + k) * 3] = N.getX(k);
      nor[(o + k) * 3 + 1] = N.getY(k);
      nor[(o + k) * 3 + 2] = N.getZ(k);
      let u = 0.75;
      let v = 0.25;
      if (p.region === "head" && U) {
        // La sphère : u fait le tour (le devant de la peau dépliée est au quart), v du bas au haut
        u = U.getX(k);
        v = 0.5 + U.getY(k) * 0.5;
      } else if (p.region === "jersey" && U) {
        u = ((U.getX(k) * 2) % 1) * 0.5;
        v = U.getY(k) * 0.5;
      }
      uv[(o + k) * 2] = u;
      uv[(o + k) * 2 + 1] = v;
      col[(o + k) * 3] = p.color.r;
      col[(o + k) * 3 + 1] = p.color.g;
      col[(o + k) * 3 + 2] = p.color.b;
      si[(o + k) * 4] = p.bone;
      sw[(o + k) * 4] = 1;
    }
    o += P.count;
    p.geo.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  g.computeBoundingSphere();
  return g;
}
