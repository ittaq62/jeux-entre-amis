// Le rechargement de son arme en main, temps par temps : où va la main gauche (attraper le chargeur, l'arracher, aller
// en chercher un plein à la ceinture, l'enfoncer, le taper, tirer la culasse ; ou glisser les cartouches une à une,
// ouvrir et refermer les canons), quand le chargeur sort, tombe, revient et s'enfonce, quand la culasse part en arrière
// et claque ; et les bruits, aux mêmes instants. Une seule table pour l'image et le son, en fraction du rechargement
// (de 1,5 à 4,4 s selon l'arme).

import * as THREE from "three";
import type { WeaponId } from "../../shared/games/escarmouche/weapons.ts";
import type { EscSoundName } from "./escSound.ts";
import type { Gun } from "./scene/guns.ts";

export type ReloadKind = "mag" | "pistol" | "pump" | "double" | "revolver";

/** Les endroits où va la main gauche (calculés sur chaque arme) */
export type Anchor =
  | "rest"
  | "pouch"
  | "mag"
  | "magDown"
  | "magUp"
  | "below"
  | "bolt"
  | "boltBack"
  | "boltOut"
  | "port"
  | "portBelow"
  | "portIn"
  | "pumpBack"
  | "hinge"
  | "hingeUp"
  | "chamber"
  | "chamberBelow"
  | "chamberIn"
  | "cyl"
  | "cylPush"
  | "cylBelow"
  | "cylFlick";

export interface ReloadPlan {
  /** La main gauche : où elle est, à quel moment */
  hand: [number, Anchor][];
  /** Le chargeur : arraché avec la main (grab), qui tombe (drop), parti (gone), revenu dans la main (back), enfoncé (seat) */
  mag?: { grab: number; drop: number; gone: number; back: number; seat: number };
  /** La culasse, ou la glissière du pistolet : tirée en arrière avec la main (de grab à back), relâchée d'un coup */
  bolt?: { grab: number; release: number };
  /** La pompe, tirée puis repoussée par la main */
  pump?: { from: number; to: number };
  /** Ce que la main apporte (des cartouches) : visible dans ces intervalles */
  carry?: [number, number][];
  /** Les petits chocs qui secouent l'arme (le chargeur qui s'enclenche, la culasse qui claque, les canons refermés) */
  jolts: number[];
  /** Les bruits, à leur instant */
  sounds: [number, EscSoundName][];
}

/** Les cartouches du fusil à pompe, une à une dans la fenêtre de chargement */
function pumpHand(): [number, Anchor][] {
  const keys: [number, Anchor][] = [
    [0, "rest"],
    [0.06, "pouch"],
  ];
  for (let i = 0; i < 3; i++) {
    const b = 0.06 + i * 0.22;
    keys.push([b + 0.07, "portBelow"], [b + 0.11, "port"], [b + 0.13, "portIn"], [b + 0.16, "portBelow"]);
    if (i < 2) keys.push([b + 0.22, "pouch"]);
  }
  keys.push([0.76, "rest"], [0.84, "rest"], [0.9, "pumpBack"], [0.93, "pumpBack"], [0.97, "rest"], [1, "rest"]);
  return keys;
}

export const RELOAD_PLANS: Record<ReloadKind, ReloadPlan> = {
  mag: {
    hand: [
      [0, "rest"],
      [0.08, "mag"],
      [0.12, "mag"],
      [0.16, "magDown"],
      [0.3, "pouch"],
      [0.44, "pouch"],
      [0.58, "below"],
      [0.62, "below"],
      [0.69, "mag"],
      [0.72, "mag"],
      [0.735, "magUp"],
      [0.75, "mag"],
      [0.81, "bolt"],
      [0.83, "bolt"],
      [0.86, "boltBack"],
      [0.875, "boltBack"],
      [0.9, "boltOut"],
      [1, "rest"],
    ],
    mag: { grab: 0.12, drop: 0.16, gone: 0.3, back: 0.46, seat: 0.69 },
    bolt: { grab: 0.83, release: 0.875 },
    jolts: [0.69, 0.875],
    sounds: [
      [0.1, "mag-release"],
      [0.13, "mag-out"],
      [0.32, "pouch"],
      [0.62, "mag-slide"],
      [0.69, "mag-in"],
      [0.735, "mag-tap"],
      [0.83, "bolt-back"],
      [0.875, "bolt-fwd"],
    ],
  },
  pistol: {
    hand: [
      [0, "rest"],
      [0.07, "mag"],
      [0.1, "mag"],
      [0.14, "magDown"],
      [0.28, "pouch"],
      [0.42, "pouch"],
      [0.55, "below"],
      [0.58, "below"],
      [0.64, "mag"],
      [0.67, "mag"],
      [0.69, "magUp"],
      [0.71, "mag"],
      [0.77, "bolt"],
      [0.8, "bolt"],
      [0.84, "boltBack"],
      [0.855, "boltBack"],
      [0.88, "boltOut"],
      [1, "rest"],
    ],
    mag: { grab: 0.1, drop: 0.14, gone: 0.28, back: 0.42, seat: 0.64 },
    bolt: { grab: 0.8, release: 0.855 },
    jolts: [0.64, 0.855],
    sounds: [
      [0.08, "mag-release"],
      [0.11, "mag-out"],
      [0.3, "pouch"],
      [0.59, "mag-slide"],
      [0.64, "mag-in"],
      [0.69, "mag-tap"],
      [0.8, "slide-back"],
      [0.855, "slide-fwd"],
    ],
  },
  pump: {
    hand: pumpHand(),
    pump: { from: 0.84, to: 0.97 },
    carry: [
      [0.13, 0.19],
      [0.35, 0.41],
      [0.57, 0.63],
    ],
    jolts: [0.19, 0.41, 0.63, 0.93],
    sounds: [
      [0.07, "pouch"],
      [0.19, "shell-in"],
      [0.29, "pouch"],
      [0.41, "shell-in"],
      [0.51, "pouch"],
      [0.63, "shell-in"],
      [0.86, "pump"],
    ],
  },
  double: {
    hand: [
      [0, "rest"],
      [0.12, "hinge"],
      [0.24, "hinge"],
      [0.34, "pouch"],
      [0.46, "pouch"],
      [0.56, "chamberBelow"],
      [0.6, "chamber"],
      [0.64, "chamberIn"],
      [0.68, "chamber"],
      [0.74, "hinge"],
      [0.8, "hingeUp"],
      [0.86, "hinge"],
      [1, "rest"],
    ],
    carry: [[0.46, 0.64]],
    jolts: [0.11, 0.8],
    sounds: [
      [0.11, "hinge-open"],
      [0.2, "brass"],
      [0.36, "pouch"],
      [0.64, "shell-in"],
      [0.8, "hinge-close"],
    ],
  },
  revolver: {
    hand: [
      [0, "rest"],
      [0.1, "cyl"],
      [0.2, "cylPush"],
      [0.24, "cyl"],
      [0.34, "pouch"],
      [0.46, "pouch"],
      [0.56, "cylBelow"],
      [0.62, "cyl"],
      [0.66, "cylPush"],
      [0.7, "cyl"],
      [0.78, "cylFlick"],
      [0.86, "rest"],
      [1, "rest"],
    ],
    carry: [[0.46, 0.66]],
    jolts: [0.11, 0.8],
    sounds: [
      [0.11, "hinge-open"],
      [0.21, "brass"],
      [0.36, "pouch"],
      [0.66, "shell-in"],
      [0.8, "hinge-close"],
    ],
  },
};

export function reloadKind(w: WeaponId): ReloadKind {
  if (w === "pistolet" || w === "pa") return "pistol";
  if (w === "pompe") return "pump";
  if (w === "double") return "double";
  if (w === "revolver") return "revolver";
  return "mag";
}

/** Le volume de chaque bruit du rechargement (le froissement de la poche et les douilles, plus discrets) */
export const RELOAD_VOLUME: Partial<Record<EscSoundName, number>> = { pouch: 0.35, brass: 0.3, "mag-tap": 0.45 };

/** Où la main gauche attrape le chargeur (dans le repère de l'arme) */
export function magGrip(gun: Gun): THREE.Vector3 {
  if (!gun.mag) return new THREE.Vector3();
  return gun.magRest.clone().add(gun.pistol ? new THREE.Vector3(-0.022, -0.095, 0.015) : new THREE.Vector3(-0.036, -0.085, 0));
}

/** De combien la main tire la culasse, ou la glissière d'un pistolet */
export function boltPull(gun: Gun): number {
  return gun.pistol ? 0.035 : 0.06;
}

/**
 * Chaque endroit où va la main gauche, sur cette arme, dans le repère de l'arme : `rest`, sa place au repos ; `pouch`,
 * la ceinture (hors de vue en première personne, à la hanche vue de dehors)
 */
export function gunAnchors(gun: Gun, rest: THREE.Vector3, pouch: THREE.Vector3): Record<Anchor, () => THREE.Vector3> {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const magAt = gun.mag ? magGrip(gun) : rest.clone();
  const pull = boltPull(gun);
  return {
    rest: () => rest.clone(),
    pouch: () => pouch.clone(),
    mag: () => magAt.clone(),
    magDown: () => magAt.clone().add(V(0, -0.06, 0)),
    magUp: () => magAt.clone().add(V(0, 0.016, 0)),
    below: () => magAt.clone().add(V(-0.025, -0.13, 0.05)),
    bolt: () => gun.boltAt.clone(),
    boltBack: () => gun.boltAt.clone().add(V(0, 0, pull)),
    boltOut: () => gun.boltAt.clone().add(V(-0.07, -0.03, 0.07)),
    port: () => V(-0.012, -0.006, -0.08),
    portBelow: () => V(-0.03, -0.1, -0.05),
    portIn: () => V(-0.012, 0.01, -0.095),
    pumpBack: () => rest.clone().add(V(0, 0, 0.09)),
    hinge: () => V(-0.03, 0.02, -0.22),
    hingeUp: () => V(-0.03, 0.07, -0.22),
    chamber: () => V(-0.012, 0.1, -0.09),
    chamberBelow: () => V(-0.05, -0.02, -0.03),
    chamberIn: () => V(-0.012, 0.08, -0.09),
    cyl: () => V(-0.045, 0.06, -0.05),
    cylPush: () => V(-0.045, 0.06, -0.03),
    cylBelow: () => V(-0.075, -0.05, 0.0),
    cylFlick: () => V(-0.01, 0.08, -0.05),
  };
}

/** La main gauche à ce moment du geste : d'un endroit au suivant, en douceur */
export function handAt(plan: ReloadPlan, t: number, anchors: Record<Anchor, () => THREE.Vector3>): THREE.Vector3 {
  const keys = plan.hand;
  let k = 0;
  while (k + 1 < keys.length - 1 && t >= keys[k + 1]![0]) k++;
  const [t0, a0] = keys[k]!;
  const [t1, a1] = keys[Math.min(k + 1, keys.length - 1)]!;
  const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
  return anchors[a0]().lerp(anchors[a1](), u * u * (3 - 2 * u));
}

/**
 * Les pièces de l'arme pendant le geste (la main gauche en `hand`, dans le repère de l'arme) : le chargeur arraché,
 * qui tombe, revient dans la main et s'enfonce ; la culasse tirée puis relâchée ; la pompe ; les canons ou le barillet.
 * Rend le recul de la pompe (le reste est posé directement). `t` négatif : tout revient au repos.
 */
export function poseGunParts(gun: Gun, plan: ReloadPlan | null, t: number, hand: THREE.Vector3, rest: THREE.Vector3): number {
  if (!plan || t < 0) {
    if (gun.mag) {
      gun.mag.position.copy(gun.magRest);
      gun.mag.rotation.x = 0;
      gun.mag.visible = true;
    }
    if (gun.hinge) gun.hinge.rotation[gun.hingeAxis] = 0;
    if (gun.slide) gun.slide.position.z = gun.slideRest;
    return 0;
  }
  const magAt = magGrip(gun);
  const pull = boltPull(gun);
  if (gun.mag && plan.mag) {
    const m = plan.mag;
    gun.mag.visible = t < m.gone || t >= m.back;
    gun.mag.rotation.x = 0;
    if (t >= m.grab && t < m.drop) gun.mag.position.copy(gun.magRest).add(hand).sub(magAt);
    else if (t >= m.drop && t < m.gone) {
      const f = (t - m.drop) / (m.gone - m.drop);
      gun.mag.position.copy(gun.magRest).add(new THREE.Vector3(-0.01 * f, -0.06 - f * f * 0.6, 0.06 * f));
      gun.mag.rotation.x = f * 0.9;
    } else if (t >= m.back && t < m.seat) {
      gun.mag.position.copy(gun.magRest).add(hand).sub(magAt);
      gun.mag.rotation.x = 0.3 * (1 - Math.min(1, (t - m.back) / (m.seat - m.back)));
    } else gun.mag.position.copy(gun.magRest);
  }
  if (gun.slide) {
    let back = 0;
    if (plan.bolt && t >= plan.bolt.grab && t < plan.bolt.release) back = Math.min(1, Math.max(0, (hand.z - gun.boltAt.z) / pull));
    gun.slide.position.z = gun.slideRest + back * pull;
  }
  if (gun.hinge) {
    const ease = (a: number, b: number) => {
      const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
      return x * x * (3 - 2 * x);
    };
    const open = ease(0.1, 0.24) - ease(0.76, 0.84);
    gun.hinge.rotation[gun.hingeAxis] = gun.hingeAxis === "x" ? -open * 0.55 : open * 1.3;
  }
  if (plan.pump && t >= plan.pump.from && t <= plan.pump.to) return Math.min(0.09, Math.max(0, hand.z - rest.z));
  return 0;
}
