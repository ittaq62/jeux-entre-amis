// Un joueur de bowling en 3D : le personnage du profil (sa tête dessinée, sa coiffure, son chapeau, ce qu'il porte de
// la garde-robe), à grosse tête comme dans les autres jeux, en chemise de bowling à la couleur de son portrait, pantalon
// sombre et chaussures bicolores. Ses bras et ses jambes se plient vers des points visés ; ses postures font le reste :
// debout la boule contre la poitrine, l'élan (le bras qui balance comme un pendule pendant qu'il avance), la glissade et
// le lâcher, le bras qui finit en l'air, les danses de victoire, la déception, et assis sur la banquette à attendre.

import * as THREE from "three";
import { AVATAR_BACKGROUNDS, AVATAR_HAIR_COLORS, AVATAR_SKINS, type AvatarConfig } from "../../../shared/avatar.ts";
import { hairGeometry, hatGroup } from "../../bolides/scene/pilot.ts";
import { cloth, limb, loft, mitten, shoe } from "../../culbute/scene/body.ts";
import { outfitCoat, outfitExtras, wearHair, wearHat } from "../../escarmouche/scene/wardrobe3d.ts";

export interface BowlerLook {
  avatar: AvatarConfig;
  /** Il lance de la main gauche */
  left: boolean;
  /** La couleur de sa boule (le liseré de sa chemise) */
  accent: string;
}

type V3 = [number, number, number];

/** Une posture, dans le repère du personnage (les pieds au sol en 0, le devant vers +z, sa droite vers −x) */
export interface Pose {
  /** Il s'accroupit (les hanches descendent) */
  crouch: number;
  /** Il se penche en avant (radians), il se tourne (radians), il penche sur le côté */
  lean: number;
  twist: number;
  roll: number;
  /** La main qui lance, puis l'autre */
  hands: [V3, V3];
  /** Le pied droit, puis le gauche */
  feet: [V3, V3];
  /** La tête : vers le haut ou le bas, à gauche ou à droite */
  nod: number;
  turn: number;
  /** Il saute (le corps entier monte) */
  lift: number;
  /** Il tourne sur lui-même (autour de la verticale) */
  spin: number;
}

const HIPS_Y = 0.5;
const SHOULDER_Y = 0.92;
const SHOULDER_X = 0.25;
const HEAD_R = 0.34;
const UPPER = 0.26;
const FORE = 0.25;
const THIGH = 0.235;
const SHIN = 0.215;
/** La longueur du bras tendu (de l'épaule au creux de la main) */
export const ARM = UPPER + FORE - 0.02;

export const STAND: Pose = {
  crouch: 0,
  lean: 0.04,
  twist: 0,
  roll: 0,
  hands: [
    [-0.08, 0.98, 0.3],
    [0.08, 0.96, 0.3],
  ],
  feet: [
    [-0.11, 0, 0.02],
    [0.11, 0, -0.02],
  ],
  nod: 0,
  turn: 0,
  lift: 0,
  spin: 0,
};

/** Debout, les bras le long du corps (sans boule) */
export const RELAX: Pose = {
  ...STAND,
  hands: [
    [-0.3, 0.5, 0.06],
    [0.3, 0.5, 0.06],
  ],
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lv = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const ease = (k: number) => {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
};

export function blend(a: Pose, b: Pose, k: number): Pose {
  return {
    crouch: lerp(a.crouch, b.crouch, k),
    lean: lerp(a.lean, b.lean, k),
    twist: lerp(a.twist, b.twist, k),
    roll: lerp(a.roll, b.roll, k),
    hands: [lv(a.hands[0], b.hands[0], k), lv(a.hands[1], b.hands[1], k)],
    feet: [lv(a.feet[0], b.feet[0], k), lv(a.feet[1], b.feet[1], k)],
    nod: lerp(a.nod, b.nod, k),
    turn: lerp(a.turn, b.turn, k),
    lift: lerp(a.lift, b.lift, k),
    spin: lerp(a.spin, b.spin, k),
  };
}

const withP = (p: Pose, q: Partial<Pose>): Pose => ({ ...p, ...q });

/** La main qui lance, au bout du bras qui balance : 0 pendu, négatif en arrière, positif en avant */
export function swingHand(angle: number, crouch: number, lean: number): V3 {
  // L'épaule descend et avance quand il se penche
  const sy = SHOULDER_Y - crouch - Math.sin(lean) * 0.0 - (1 - Math.cos(lean)) * 0.42;
  const sz = Math.sin(lean) * 0.42;
  return [-SHOULDER_X - 0.02, sy - Math.cos(angle) * ARM, sz + Math.sin(angle) * ARM];
}

/**
 * L'élan : `step` de 0 (en place) à 1 (la glissade finie), `arm` l'angle du bras qui lance. Quatre pas : la boule
 * poussée devant, le bras qui descend, le bras en haut derrière, la glissade.
 */
export function approachPose(step: number, arm: number): Pose {
  const s = Math.max(0, Math.min(1, step));
  // Les pieds, par rapport aux hanches (le corps, lui, avance sur la piste) : droite, gauche, droite, puis le gauche
  // glisse devant pendant que la jambe droite part en arrière. Un pied passe devant en l'air, puis recule posé au sol
  // pendant que le corps avance ; jamais plus loin que la jambe ne l'atteint.
  const phase = s * 4;
  const go = (u: number, from: number, to: number) => from + (to - from) * ease(Math.max(0, Math.min(1, u)));
  const AHEAD = 0.22,
    BEHIND = -0.2;
  const footR =
    phase < 1
      ? go(phase, 0.02, AHEAD)
      : phase < 2
        ? go(phase - 1, AHEAD, BEHIND)
        : phase < 3
          ? go(phase - 2, BEHIND, AHEAD)
          : go(phase - 3, AHEAD, -0.36);
  const footL =
    phase < 1
      ? go(phase, -0.02, BEHIND)
      : phase < 2
        ? go(phase - 1, BEHIND, AHEAD)
        : phase < 3
          ? go(phase - 2, AHEAD, BEHIND + 0.04)
          : go(phase - 3, BEHIND + 0.04, 0.36);
  const liftR = phase < 1 ? Math.sin(phase * Math.PI) * 0.06 : phase > 2 && phase < 3 ? Math.sin((phase - 2) * Math.PI) * 0.06 : 0;
  const liftL = phase > 1 && phase < 2 ? Math.sin((phase - 1) * Math.PI) * 0.06 : 0;
  const slide = Math.max(0, phase - 3);
  // Le genou fléchit et le buste se penche sur la glissade, sans s'accroupir jusqu'au sol
  const crouch = 0.04 + ease(slide) * 0.12;
  const lean = 0.08 + ease(slide) * 0.3 + Math.max(0, Math.min(1, phase - 2)) * 0.06;
  const hand = swingHand(arm, crouch, lean);
  // L'autre bras s'écarte pour l'équilibre
  const other: V3 = [0.42 + ease(slide) * 0.12, 0.82 - crouch * 0.6, 0.12 + ease(slide) * 0.15];
  return {
    crouch,
    lean,
    twist: -arm * 0.08,
    roll: 0,
    hands: [hand, other],
    feet: [
      // La jambe droite, à la fin, part en arrière et croise derrière (le pied presque à plat)
      [-0.11 + ease(slide) * 0.18, liftR + ease(slide) * 0.06, footR],
      [0.11 - ease(slide) * 0.06, liftL, footL],
    ],
    nod: 0.15 + ease(slide) * 0.25,
    turn: 0,
    lift: 0,
    spin: 0,
  };
}

/** Le bras qui finit en l'air, le corps penché, après le lâcher (k de 0 à 1) */
export function followPose(k: number): Pose {
  const from = approachPose(1, 0.6);
  const to = withP(approachPose(1, 2.3), { nod: 0.05 });
  return blend(from, to, ease(k));
}

/** Ce que fait le personnage après son lancer, selon sa danse ou son humeur ; `t` en secondes */
export function reactPose(kind: string, t: number): Pose {
  const w = Math.sin(t * 9);
  const up: Pose = withP(STAND, {
    hands: [
      [-0.35, 1.55, 0.05],
      [0.35, 1.55, 0.05],
    ],
    nod: -0.25,
  });
  switch (kind) {
    case "bras": {
      const j = Math.abs(Math.sin(t * 6)) * 0.18;
      return withP(up, {
        lift: j,
        hands: [
          [-0.36, 1.62 + w * 0.04, 0.04],
          [0.36, 1.62 - w * 0.04, 0.04],
        ],
      });
    }
    case "reverence": {
      const k = ease(Math.min(1, t * 2));
      return withP(STAND, {
        lean: k * 0.7,
        crouch: k * 0.06,
        hands: [
          [-0.3, 0.75, 0.5 * k],
          [0.38, 0.85, -0.2 * k],
        ],
        feet: [
          [-0.11, 0, 0.1],
          [0.14, 0, -0.18],
        ],
        nod: k * 0.4,
      });
    }
    case "pirouette":
      return withP(up, { spin: ease(Math.min(1, t * 1.2)) * Math.PI * 2, lift: Math.sin(Math.min(1, t * 1.2) * Math.PI) * 0.12 });
    case "danse": {
      const s = Math.sin(t * 7);
      return withP(STAND, {
        roll: s * 0.15,
        twist: s * 0.25,
        crouch: Math.abs(Math.cos(t * 7)) * 0.06,
        hands: [
          [-0.3, 1.15 + s * 0.2, 0.2],
          [0.3, 1.15 - s * 0.2, 0.2],
        ],
        feet: [
          [-0.13, Math.max(0, s) * 0.08, 0],
          [0.13, Math.max(0, -s) * 0.08, 0],
        ],
        nod: -0.1,
      });
    }
    case "robot": {
      const step = Math.floor(t * 4) % 4;
      const angles = [0, 1.2, 0.4, 1.4];
      const a = angles[step]!;
      return withP(STAND, {
        twist: (step % 2 ? 0.3 : -0.3) * 0.6,
        hands: [
          [-0.32, 0.92 + Math.sin(a) * 0.25, 0.2 + Math.cos(a) * 0.1],
          [0.32, 0.92 + Math.cos(a) * 0.25, 0.2 + Math.sin(a) * 0.1],
        ],
        turn: step % 2 ? 0.4 : -0.4,
      });
    }
    case "poulet": {
      const f = Math.sin(t * 14);
      return withP(STAND, {
        crouch: 0.08 + Math.abs(f) * 0.04,
        hands: [
          [-0.3 - Math.abs(f) * 0.08, 0.95, 0.0],
          [0.3 + Math.abs(f) * 0.08, 0.95, 0.0],
        ],
        nod: f * 0.2,
        lean: 0.2,
      });
    }
    case "genoux": {
      // La glissade à genoux, les poings serrés
      const k = ease(Math.min(1, t * 2.5));
      return withP(STAND, {
        crouch: 0.28 * k,
        lean: -0.25 * k,
        hands: [
          [-0.3, 1.05 + w * 0.05, 0.25],
          [0.3, 1.05 - w * 0.05, 0.25],
        ],
        feet: [
          [-0.13, 0.06 * k, 0.05 - 0.25 * k],
          [0.13, 0.06 * k, 0.05 - 0.25 * k],
        ],
        nod: -0.35 * k,
      });
    }
    case "guitare": {
      const strum = Math.sin(t * 16);
      return withP(STAND, {
        crouch: 0.05,
        lean: -0.15,
        roll: 0.1,
        hands: [
          [-0.05, 0.75 + strum * 0.06, 0.25],
          [0.4, 0.95, 0.32],
        ],
        nod: -0.2 + Math.abs(Math.sin(t * 8)) * 0.3,
      });
    }
    case "spare": {
      // Il applaudit
      const c = Math.abs(Math.sin(t * 10));
      return withP(STAND, {
        hands: [
          [-0.04 - c * 0.12, 1.02, 0.32],
          [0.04 + c * 0.12, 1.02, 0.32],
        ],
        nod: -0.1,
      });
    }
    case "rate": {
      // Les mains sur la tête
      return withP(STAND, {
        crouch: 0.03,
        hands: [
          [-0.28, 1.5, 0.12],
          [0.28, 1.5, 0.12],
        ],
        nod: 0.25,
        roll: Math.sin(t * 2) * 0.05,
      });
    }
    case "rigole": {
      // Accablé : le dos rond, les bras ballants
      const k = ease(Math.min(1, t * 1.5));
      return withP(STAND, {
        lean: 0.35 * k,
        crouch: 0.05 * k,
        hands: [
          [-0.26, 0.45, 0.12],
          [0.26, 0.45, 0.12],
        ],
        nod: 0.5 * k,
        turn: Math.sin(t * 3) * 0.3 * k,
      });
    }
    default: {
      // Le poing serré, ramené vers soi
      const k = ease(Math.min(1, t * 3));
      const pump = Math.sin(Math.max(0, t - 0.3) * 8) * 0.06;
      return withP(STAND, {
        crouch: 0.04 * k,
        hands: [
          [-0.2, 1.05 + pump - 0.15 * (1 - k), 0.26],
          [0.3, 0.75, 0.05],
        ],
        nod: -0.15 * k,
        lean: -0.05 * k,
      });
    }
  }
}

/** Assis sur la banquette ; `cheer` le fait réagir (1 : bras en l'air, −1 : mains sur la tête) */
export function sitPose(t: number, cheer: number, seed: number): Pose {
  const idle = Math.sin(t * 0.7 + seed) * 0.5 + 0.5;
  const base: Pose = {
    crouch: 0,
    lean: -0.05,
    twist: 0,
    roll: 0,
    hands: [
      [-0.22, 0.46, 0.28],
      [0.22, 0.46, 0.28],
    ],
    feet: [
      [-0.12, 0, 0.42],
      [0.12, 0, 0.44],
    ],
    nod: 0.05,
    turn: Math.sin(t * 0.31 + seed * 3) * 0.35 * idle,
    lift: 0,
    spin: 0,
  };
  if (cheer > 0)
    return withP(base, {
      hands: [
        [-0.34, 1.5 + Math.sin(t * 12) * 0.05, 0.1],
        [0.34, 1.5 - Math.sin(t * 12) * 0.05, 0.1],
      ],
      lift: Math.abs(Math.sin(t * 8)) * 0.06,
      nod: -0.2,
      turn: 0,
    });
  if (cheer < 0)
    return withP(base, {
      hands: [
        [-0.26, 1.42, 0.12],
        [0.26, 1.42, 0.12],
      ],
      nod: 0.3,
      turn: 0,
    });
  return base;
}

/** Il marche (sur place : c'est le groupe qui avance), `t` en secondes */
export function walkPose(t: number, speed: number): Pose {
  const s = Math.sin(t * 9);
  const a = Math.min(1, speed);
  return withP(STAND, {
    hands: [
      [-0.28, 0.6, s * 0.18 * a],
      [0.28, 0.6, -s * 0.18 * a],
    ],
    feet: [
      [-0.11, Math.max(0, s) * 0.07 * a, s * 0.16 * a],
      [0.11, Math.max(0, -s) * 0.07 * a, -s * 0.16 * a],
    ],
    lift: Math.abs(Math.cos(t * 9)) * 0.02 * a,
  });
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

/** La chemise de bowling : deux tons, une bande verticale de chaque côté du devant, le col */
function shirtTexture(main: string, band: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = main;
  g.fillRect(0, 0, 256, 128);
  // Le loft tourne autour du buste : u = 0 devant (sin = 0, cos = 1), donc les bandes autour de u = ±0.1
  g.fillStyle = band;
  for (const u of [0.08, 0.92]) g.fillRect(u * 256 - 7, 0, 14, 128);
  // Le liseré du bas
  g.fillRect(0, 0, 256, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BowlerModel {
  readonly group = new THREE.Group();
  /** Tourné vers les quilles (le devant du modèle est vers +z) */
  private root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private skull: THREE.Mesh;
  private arms: Limb[] = [];
  private legs: Limb[] = [];
  private disposables: { dispose: () => void }[] = [];
  /** Où se trouve la main qui lance, dans le monde (pour y poser la boule) */
  readonly handWorld = new THREE.Vector3();
  /** La direction de l'avant-bras qui lance, dans le monde */
  readonly foreDir = new THREE.Vector3();
  readonly look: BowlerLook;
  private side: number;

  constructor(look: BowlerLook) {
    this.look = look;
    this.side = look.left ? -1 : 1;
    const keep = <T extends { dispose: () => void }>(x: T) => (this.disposables.push(x), x);
    const avatar = look.avatar;
    const skinHex = AVATAR_SKINS[avatar.skin] ?? AVATAR_SKINS[0]!;
    const bg = AVATAR_BACKGROUNDS[avatar.bg] ?? AVATAR_BACKGROUNDS[0]!;
    const own = outfitCoat(avatar.wear?.outfit);
    const main = own.coat ?? bg;
    const band = own.stripes ? own.stripes[1] : look.accent;
    const shirtMat = keep(cloth(0xffffff, 0.8, 0.32, keep(shirtTexture(main, band))));
    const sleeveMat = keep(cloth(main, 0.8, 0.32));
    const trousers = keep(cloth(0x2b2d3a, 0.8, 0.25));
    const skin = keep(cloth(skinHex, 0.62, 0.22));
    // Les chaussures de bowling : deux tons, et la semelle claire
    const shoeMat = keep(cloth(look.left ? 0x2a5fb0 : 0xb3242f, 0.45, 0.25));
    const geo = <T extends THREE.BufferGeometry>(g: T) => keep(g);

    this.group.add(this.root);
    this.root.rotation.y = Math.PI;
    this.root.add(this.body);
    this.body.add(this.torso);
    this.torso.position.y = HIPS_Y;

    const chest = new THREE.Mesh(
      geo(
        loft([
          [-0.12, 0.17, 0.14],
          [-0.04, 0.215, 0.17],
          [0.06, 0.238, 0.19],
          [0.16, 0.245, 0.195],
          [0.26, 0.25, 0.185],
          [0.34, 0.245, 0.17],
          [0.41, 0.205, 0.145],
          [0.46, 0.12, 0.095],
        ]),
      ),
      shirtMat,
    );
    chest.castShadow = true;
    this.torso.add(chest);
    // Le col de la chemise, ouvert
    const collar = new THREE.Mesh(geo(new THREE.TorusGeometry(1, 0.3, 6, 22, Math.PI * 1.5)), keep(cloth(band, 0.75)));
    collar.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI * 0.75 + Math.PI);
    collar.scale.set(0.13, 0.11, 0.1);
    collar.position.set(0, 0.42, 0.02);
    this.torso.add(collar);
    // Le bassin et la ceinture
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
    hips.castShadow = true;
    this.torso.add(hips);
    const belt = new THREE.Mesh(geo(new THREE.TorusGeometry(1, 0.11, 6, 26)), keep(cloth(0x2a2228, 0.5, 0.2)));
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(0.224, 0.18, 0.21);
    belt.position.set(0, 0.035, 0);
    this.torso.add(belt);
    // Ce qu'il porte de sa garde-robe sur le buste (cape, écharpe, collier…) : fait pour un buste tourné vers −z
    const extras = outfitExtras(avatar.wear?.outfit, bg, keep);
    if (extras) {
      extras.rotation.y = Math.PI;
      extras.scale.setScalar(1.25);
      extras.position.set(0, -0.2, 0);
      this.torso.add(extras);
    }

    // La tête : la peau de l'avatar (posée plus tard), les oreilles, la coiffure, le chapeau
    this.head.position.set(0, 0.74, 0.02);
    this.torso.add(this.head);
    this.skull = new THREE.Mesh(geo(new THREE.SphereGeometry(HEAD_R, 36, 24)), skin);
    this.skull.castShadow = true;
    this.head.add(this.skull);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(geo(new THREE.SphereGeometry(HEAD_R * 0.24, 12, 8)), skin);
      ear.position.set(side * HEAD_R * 0.97, -HEAD_R * 0.05, -HEAD_R * 0.05);
      ear.scale.set(0.55, 1, 0.85);
      this.head.add(ear);
    }
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
      const hair = new THREE.Mesh(keep(hairGeo), hairMat);
      hair.castShadow = true;
      this.head.add(hair);
    }
    const hat = wornHat ? wearHat(wornHat, HEAD_R, keep) : hatGroup(avatar.hat, keep, true);
    if (hat) this.head.add(hat);

    // Les bras (manches courtes de la chemise), les jambes, les chaussures
    for (let i = 0; i < 2; i++) {
      const upper = new THREE.Mesh(geo(limb((u) => 0.088 - u * 0.012, UPPER)), skin);
      const fore = new THREE.Mesh(geo(limb((u) => 0.074 - u * 0.012, FORE)), skin);
      upper.userData.len = UPPER;
      fore.userData.len = FORE;
      const sleeve = new THREE.Mesh(
        geo(
          loft(
            [
              [-0.05, 0.11, 0.11],
              [0.06, 0.112, 0.112],
              [0.14, 0.104, 0.104],
            ],
            16,
            true,
          ),
        ),
        sleeveMat,
      );
      sleeveMat.side = THREE.DoubleSide;
      upper.add(sleeve);
      const hand = new THREE.Mesh(geo(mitten(0.11)), skin);
      for (const m of [upper, fore, hand]) m.castShadow = true;
      this.body.add(upper, fore, hand);
      this.arms.push({ a: upper, b: fore, end: hand });
      const thigh = new THREE.Mesh(geo(limb((u) => 0.105 - u * 0.018, THIGH)), trousers);
      const shin = new THREE.Mesh(geo(limb((u) => 0.085 - u * 0.02, SHIN)), trousers);
      thigh.userData.len = THIGH;
      shin.userData.len = SHIN;
      const foot = new THREE.Mesh(geo(shoe(0.3, 0.19)), shoeMat);
      // La semelle claire
      const sole = new THREE.Mesh(geo(new THREE.BoxGeometry(0.17, 0.02, 0.29)), keep(cloth(0xf2ece0, 0.6)));
      sole.position.set(0, 0.008, 0.075);
      foot.add(sole);
      for (const m of [thigh, shin, foot]) m.castShadow = true;
      this.body.add(thigh, shin, foot);
      this.legs.push({ a: thigh, b: shin, end: foot });
    }
    this.apply(STAND);
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

  /** Une posture (la main qui lance est la droite, ou la gauche pour un gaucher : on retourne le personnage en miroir) */
  apply(p: Pose) {
    const s = this.side;
    const mx = (v: V3): V3 => [v[0] * s, v[1], v[2]];
    const hands: [V3, V3] = s > 0 ? [p.hands[0], p.hands[1]] : [mx(p.hands[1]), mx(p.hands[0])];
    const feet: [V3, V3] = s > 0 ? [p.feet[0], p.feet[1]] : [mx(p.feet[1]), mx(p.feet[0])];
    this.body.position.y = p.lift;
    this.body.rotation.y = p.spin;
    this.torso.position.y = HIPS_Y - p.crouch;
    this.torso.rotation.set(p.lean, p.twist * s, p.roll * s);
    this.head.rotation.set(p.nod * 0.6, p.turn * s, 0);
    this.torso.updateMatrix();
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i]!;
      const side = i === 0 ? -1 : 1;
      const shoulder = V.a.set(side * SHOULDER_X, SHOULDER_Y - HIPS_Y, 0).applyMatrix4(this.torso.matrix);
      const target = V.b.fromArray(hands[i]!);
      const elbow = ik(shoulder, target, UPPER, FORE, V.c.set(side * 0.6, -0.5, -0.5), V.d);
      stretch(arm.a, shoulder, elbow);
      stretch(arm.b, elbow, target);
      arm.end.position.copy(target);
      arm.end.quaternion.setFromUnitVectors(DOWN, V.e.subVectors(target, elbow).normalize());
    }
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i]!;
      const side = i === 0 ? -1 : 1;
      const hip = V.a.set(side * 0.1, HIPS_Y - p.crouch - 0.03, 0);
      const f = feet[i]!;
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
    // La main qui lance, dans le monde (la boule s'y pose)
    const throwing = s > 0 ? this.arms[0]! : this.arms[1]!;
    this.group.updateMatrixWorld(true);
    this.handWorld.setFromMatrixPosition(throwing.end.matrixWorld);
    const elbowW = V.g.setFromMatrixPosition(throwing.b.matrixWorld);
    this.foreDir.subVectors(this.handWorld, elbowW).normalize();
  }

  /** Où poser la boule tenue : au bout des doigts, dans le prolongement de l'avant-bras */
  ballInHand(r: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.handWorld).addScaledVector(this.foreDir, r * 0.55);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
