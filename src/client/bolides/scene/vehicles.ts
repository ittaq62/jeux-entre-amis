// Les véhicules de Bolides, dessinés pièce par pièce : leur carrosserie, leurs roues, où s'assoit le pilote et comment il
// tient son guidon. L'avant regarde vers +z, la droite du véhicule est du côté des x négatifs.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { VehicleId } from "../../../shared/games/bolides/garage.ts";
import type { PilotRig } from "./pilot.ts";

export interface VehicleMats {
  paint: THREE.Material;
  paintDark: THREE.Material;
  dark: THREE.Material;
  metal: THREE.Material;
  seat: THREE.Material;
  white: THREE.Material;
  rubber: THREE.Material;
  glass: THREE.Material;
  lamp: THREE.Material;
  /** Le nom du pilote, sur un panneau à l'arrière */
  name: THREE.Material;
}

export interface VehicleSpec {
  rig: PilotRig;
  wheels: { x: number; z: number; r: number; w: number; front: boolean }[];
  /** Où sortent les flammes du turbo */
  flames: [number, number, number][];
  /** Où jaillissent les étincelles du dérapage (écart de côté, distance derrière) */
  sparks: { x: number; z: number }[];
  /** La hauteur du pivot autour duquel le véhicule penche, et de combien il se couche dans les virages (moto) */
  pivot: number;
  lean: number;
  /** La bulle du bouclier (rayon, hauteur du centre), et la hauteur de l'étiquette du nom */
  shield: [number, number];
  tag: number;
  /** Une soucoupe plane au lieu de rouler */
  hover?: boolean;
  /** Un groupe qui tourne sur lui-même (les lumières de la soucoupe) */
  spinner?: THREE.Group;
}

type Add = (
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  x: number,
  y: number,
  z: number,
  cast?: boolean,
) => THREE.Mesh;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/** Un tube droit entre deux points */
function tube(add: Add, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, cast = false): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = add(new THREE.CylinderGeometry(r, r, len, 8), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, cast);
  m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  return m;
}

/** Une coque : un profil de côté (z vers l'avant, y vers le haut) étiré sur la largeur, aux bords arrondis */
function hull(profile: [number, number][], width: number, bevel = 0.08): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  profile.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: bevel * 1.25,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 4,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Le panneau à l'arrière, au nom du pilote (sa face arrière regarde vers -z) */
function namePlate(add: Add, m: VehicleMats, w: number, h: number, x: number, y: number, z: number, side: THREE.Material = m.paint) {
  return add(new THREE.BoxGeometry(w, h, 0.07), [side, side, side, side, side, m.name], x, y, z);
}

function buildKart(add: Add, m: VehicleMats): VehicleSpec {
  add(new RoundedBoxGeometry(1.36, 0.12, 2.6, 2, 0.05), m.dark, 0, 0.24, 0.05);
  add(
    hull(
      [
        [-1.02, 0.3],
        [1.22, 0.3],
        [1.42, 0.4],
        [1.32, 0.52],
        [0.62, 0.62],
        [0.38, 0.64],
        [0.3, 0.5],
        [-0.58, 0.48],
        [-0.66, 0.6],
        [-0.98, 0.66],
        [-1.1, 0.52],
      ],
      0.98,
    ),
    m.paint,
    0,
    0,
    0,
  );
  for (const side of [-1, 1]) {
    const pod = add(new THREE.CapsuleGeometry(0.17, 0.55, 4, 12), m.paintDark, side * 0.66, 0.42, 0);
    pod.rotation.x = Math.PI / 2;
    pod.scale.set(1, 1, 0.85);
    const stripe = add(new THREE.CapsuleGeometry(0.172, 0.5, 4, 12), m.white, side * 0.66, 0.42, 0.05, false);
    stripe.rotation.x = Math.PI / 2;
    stripe.scale.set(1.02, 0.35, 0.87);
  }
  for (const [z, w] of [
    [1.52, 1.1],
    [-1.28, 1.15],
  ] as const) {
    add(new THREE.CapsuleGeometry(0.085, w, 4, 10), m.dark, 0, 0.3, z).rotation.z = Math.PI / 2;
  }
  add(new RoundedBoxGeometry(0.66, 0.62, 0.16, 2, 0.06), m.seat, 0, 0.82, -0.66).rotation.x = 0.22;
  add(new RoundedBoxGeometry(0.66, 0.12, 0.6, 2, 0.04), m.seat, 0, 0.56, -0.36, false);
  add(new RoundedBoxGeometry(0.62, 0.34, 0.42, 2, 0.06), m.metal, 0, 0.78, -1.0);
  add(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12), m.dark, 0, 0.98, -1.0).rotation.z = Math.PI / 2;
  for (const side of [-0.22, 0.22])
    add(new THREE.CylinderGeometry(0.075, 0.095, 0.42, 10), m.metal, side, 0.7, -1.32).rotation.x = Math.PI / 2 + 0.25;
  namePlate(add, m, 1.5, 0.26, 0, 0.98, -1.24);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.08, 0.34), m.paintDark, side * 0.77, 0.98, -1.22);
    add(new THREE.BoxGeometry(0.06, 0.2, 0.12), m.dark, side * 0.42, 0.82, -1.19);
  }
  const at = V(0, 0.98, 0.32);
  const tilt = 0.52;
  const axis = V(0, 0, 1).applyAxisAngle(V(1, 0, 0), tilt);
  tube(add, at.clone().addScaledVector(axis, 0.02), at.clone().addScaledVector(axis, 0.44), 0.035, m.dark);
  return {
    rig: { hips: V(0, 0.56, -0.3), pitch: 0, steer: { kind: "wheel", at, tilt, half: 0.18 }, legs: null },
    wheels: [
      { x: -0.8, z: 0.9, r: 0.34, w: 0.32, front: true },
      { x: 0.8, z: 0.9, r: 0.34, w: 0.32, front: true },
      { x: -0.86, z: -0.82, r: 0.38, w: 0.42, front: false },
      { x: 0.86, z: -0.82, r: 0.38, w: 0.42, front: false },
    ],
    flames: [
      [-0.22, 0.76, -1.82],
      [0.22, 0.76, -1.82],
    ],
    sparks: [
      { x: -0.88, z: -1.05 },
      { x: 0.88, z: -1.05 },
    ],
    pivot: 0.6,
    lean: 0,
    shield: [1.85, 0.85],
    tag: 2.75,
  };
}

function buildMoto(add: Add, m: VehicleMats): VehicleSpec {
  // Le réservoir, le carénage et sa bulle, la selle, la coque arrière
  add(new RoundedBoxGeometry(0.46, 0.42, 0.95, 3, 0.16), m.paint, 0, 1.08, 0.2);
  add(new RoundedBoxGeometry(0.52, 0.58, 0.36, 3, 0.14), m.paint, 0, 1.2, 0.74).rotation.x = -0.3;
  add(new THREE.BoxGeometry(0.42, 0.34, 0.03), m.glass, 0, 1.56, 0.74, false).rotation.x = -0.5;
  add(new THREE.SphereGeometry(0.13, 12, 10), m.lamp, 0, 1.16, 0.95, false);
  add(new RoundedBoxGeometry(0.4, 0.14, 0.86, 2, 0.06), m.seat, 0, 1.06, -0.5);
  add(new RoundedBoxGeometry(0.38, 0.32, 0.42, 3, 0.12), m.paint, 0, 1.2, -1.0);
  namePlate(add, m, 0.54, 0.22, 0, 1.24, -1.24);
  // Le moteur, les pots de chaque côté, la fourche, le bras oscillant, les garde-boue, les repose-pieds
  add(new RoundedBoxGeometry(0.48, 0.46, 0.64, 2, 0.08), m.metal, 0, 0.66, 0.02);
  add(new THREE.CylinderGeometry(0.16, 0.16, 0.56, 12), m.dark, 0, 0.92, 0.08).rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.075, 0.1, 1.1, 10), m.metal, side * 0.27, 0.56, -0.68).rotation.x = Math.PI / 2 + 0.12;
    tube(add, V(side * 0.13, 1.34, 0.72), V(side * 0.13, 0.44, 1.02), 0.04, m.metal, true);
    tube(add, V(side * 0.17, 0.62, -0.1), V(side * 0.17, 0.46, -0.9), 0.05, m.dark, true);
    add(new THREE.BoxGeometry(0.2, 0.05, 0.05), m.dark, side * 0.3, 0.42, -0.2, false);
  }
  add(new RoundedBoxGeometry(0.26, 0.07, 0.62, 2, 0.03), m.paintDark, 0, 0.94, 1.04, false);
  add(new RoundedBoxGeometry(0.3, 0.07, 0.5, 2, 0.03), m.paintDark, 0, 1.0, -1.32 + 0.2, false);
  return {
    rig: {
      hips: V(0, 1.02, -0.45),
      pitch: 0.55,
      steer: { kind: "bar", at: V(0, 1.47, 0.58), tilt: -0.2, half: 0.38 },
      legs: { knee: V(0.3, 0.8, 0.04), foot: V(0.27, 0.44, -0.24) },
    },
    wheels: [
      { x: 0, z: 1.02, r: 0.44, w: 0.17, front: true },
      { x: 0, z: -0.9, r: 0.46, w: 0.24, front: false },
    ],
    flames: [
      [-0.27, 0.6, -1.5],
      [0.27, 0.6, -1.5],
    ],
    sparks: [
      { x: -0.14, z: -1.28 },
      { x: 0.14, z: -1.28 },
    ],
    pivot: 0.04,
    lean: 0.44,
    shield: [1.75, 1.05],
    tag: 3,
  };
}

function buildBuggy(add: Add, m: VehicleMats): VehicleSpec {
  add(new RoundedBoxGeometry(1.24, 0.2, 2.5, 2, 0.06), m.dark, 0, 0.52, 0);
  add(
    hull(
      [
        [-0.2, 0.62],
        [1.15, 0.62],
        [1.42, 0.78],
        [1.2, 0.96],
        [0.6, 1.02],
        [0.3, 0.8],
      ],
      0.92,
      0.06,
    ),
    m.paint,
    0,
    0,
    0,
  );
  add(new RoundedBoxGeometry(1.02, 0.32, 1.0, 2, 0.08), m.paintDark, 0, 0.78, -0.8);
  add(new RoundedBoxGeometry(0.62, 0.6, 0.14, 2, 0.05), m.seat, 0, 1.1, -0.55).rotation.x = 0.2;
  add(new RoundedBoxGeometry(0.6, 0.12, 0.55, 2, 0.04), m.seat, 0, 0.8, -0.28, false);
  // L'arceau : quatre montants, le cadre du toit et une barre de phares
  const top = [V(-0.46, 2.0, -0.5), V(0.46, 2.0, -0.5), V(0.42, 1.9, 0.28), V(-0.42, 1.9, 0.28)];
  const base = [V(-0.58, 0.7, -0.75), V(0.58, 0.7, -0.75), V(0.56, 0.7, 0.5), V(-0.56, 0.7, 0.5)];
  top.forEach((p, i) => {
    tube(add, base[i]!, p, 0.04, m.metal, true);
    tube(add, p, top[(i + 1) % 4]!, 0.04, m.metal, true);
  });
  for (const x of [-0.26, 0, 0.26]) add(new THREE.SphereGeometry(0.075, 10, 8), m.lamp, x, 1.98, 0.32, false);
  // Le moteur à nu, la roue de secours, les pare-chocs tubulaires, la plaque au nom
  add(new RoundedBoxGeometry(0.62, 0.42, 0.5, 2, 0.06), m.metal, 0, 1.1, -1.05);
  add(new THREE.TorusGeometry(0.3, 0.13, 8, 16), m.rubber, 0, 1.15, -1.45);
  namePlate(add, m, 1.0, 0.2, 0, 0.72, -1.36);
  for (const side of [-1, 1]) {
    tube(add, V(side * 0.55, 0.62, 1.05), V(side * 0.38, 0.62, 1.55), 0.04, m.metal);
    tube(add, V(side * 0.9, 0.62, -0.1), V(side * 0.9, 0.62, 0.55), 0.04, m.metal);
    tube(add, V(side * 0.55, 0.62, 0.0), V(side * 0.9, 0.62, -0.1), 0.04, m.metal);
    tube(add, V(side * 0.55, 0.62, 0.6), V(side * 0.9, 0.62, 0.55), 0.04, m.metal);
  }
  tube(add, V(-0.38, 0.62, 1.55), V(0.38, 0.62, 1.55), 0.05, m.metal);
  const at = V(0, 1.28, 0.34);
  const axis = V(0, 0, 1).applyAxisAngle(V(1, 0, 0), 0.52);
  tube(add, at.clone().addScaledVector(axis, 0.02), at.clone().addScaledVector(axis, 0.42), 0.035, m.dark);
  return {
    rig: { hips: V(0, 0.84, -0.22), pitch: 0, steer: { kind: "wheel", at, tilt: 0.52, half: 0.18 }, legs: null },
    wheels: [
      { x: -0.98, z: 1.0, r: 0.5, w: 0.38, front: true },
      { x: 0.98, z: 1.0, r: 0.5, w: 0.38, front: true },
      { x: -1.02, z: -0.86, r: 0.56, w: 0.48, front: false },
      { x: 1.02, z: -0.86, r: 0.56, w: 0.48, front: false },
    ],
    flames: [
      [-0.2, 1.2, -1.75],
      [0.2, 1.2, -1.75],
    ],
    sparks: [
      { x: -1.02, z: -1.25 },
      { x: 1.02, z: -1.25 },
    ],
    pivot: 0.8,
    lean: 0,
    shield: [2.15, 1.05],
    tag: 3.2,
  };
}

function buildBolide(add: Add, m: VehicleMats): VehicleSpec {
  add(
    hull(
      [
        [-1.55, 0.3],
        [2.05, 0.2],
        [2.18, 0.26],
        [1.3, 0.5],
        [0.5, 0.66],
        [0.28, 0.5],
        [-0.42, 0.5],
        [-0.5, 0.76],
        [-1.45, 0.62],
      ],
      0.56,
      0.07,
    ),
    m.paint,
    0,
    0,
    0,
  );
  add(new THREE.BoxGeometry(2.1, 0.05, 0.46), m.paintDark, 0, 0.24, 2.08);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.28, 0.5), m.white, side * 1.05, 0.3, 2.08, false);
    add(new RoundedBoxGeometry(0.46, 0.34, 1.35, 2, 0.1), m.paintDark, side * 0.58, 0.46, -0.45);
    tube(add, V(side * 0.3, 0.42, 1.15), V(side * 0.98, 0.4, 1.32), 0.03, m.dark);
    tube(add, V(side * 0.6, 0.45, -1.0), V(side * 0.98, 0.44, -1.08), 0.035, m.dark);
    add(new THREE.BoxGeometry(0.05, 0.42, 0.44), m.dark, side * 0.72, 1.12, -1.62, false);
  }
  // L'entrée d'air derrière la tête, l'aileron arrière au nom du pilote, l'appuie-tête
  add(new THREE.ConeGeometry(0.2, 0.7, 10), m.paintDark, 0, 1.14, -0.82).rotation.x = -1.2;
  namePlate(add, m, 1.5, 0.3, 0, 1.2, -1.66, m.paint);
  tube(add, V(0, 0.7, -1.3), V(0, 1.08, -1.62), 0.05, m.dark);
  add(new RoundedBoxGeometry(0.42, 0.24, 0.14, 2, 0.05), m.seat, 0, 0.78, -0.46, false);
  for (const side of [-0.14, 0.14])
    add(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 10), m.metal, side, 0.58, -1.62).rotation.x = Math.PI / 2 + 0.2;
  return {
    rig: { hips: V(0, 0.32, -0.16), pitch: -0.15, steer: { kind: "wheel", at: V(0, 0.76, 0.42), tilt: 0.85, half: 0.15 }, legs: null },
    wheels: [
      { x: -1.0, z: 1.3, r: 0.38, w: 0.36, front: true },
      { x: 1.0, z: 1.3, r: 0.38, w: 0.36, front: true },
      { x: -1.0, z: -1.05, r: 0.45, w: 0.56, front: false },
      { x: 1.0, z: -1.05, r: 0.45, w: 0.56, front: false },
    ],
    flames: [
      [-0.14, 0.62, -2.08],
      [0.14, 0.62, -2.08],
    ],
    sparks: [
      { x: -1.0, z: -1.5 },
      { x: 1.0, z: -1.5 },
    ],
    pivot: 0.5,
    lean: 0,
    shield: [2.2, 0.75],
    tag: 2.5,
  };
}

function buildMonstre(add: Add, m: VehicleMats): VehicleSpec {
  add(new RoundedBoxGeometry(1.3, 0.24, 3.1, 2, 0.08), m.dark, 0, 1.2, 0);
  add(
    hull(
      [
        [0.42, 1.42],
        [1.62, 1.42],
        [1.74, 1.72],
        [1.5, 2.0],
        [0.7, 2.06],
        [0.46, 1.86],
      ],
      1.52,
      0.08,
    ),
    m.paint,
    0,
    0,
    0,
  );
  add(new RoundedBoxGeometry(1.62, 0.56, 1.34, 2, 0.1), m.paint, 0, 1.72, -1.05);
  add(new RoundedBoxGeometry(1.7, 0.1, 1.5, 2, 0.04), m.paintDark, 0, 2.02, -1.05, false);
  add(new RoundedBoxGeometry(1.5, 0.4, 0.86, 2, 0.08), m.paintDark, 0, 1.56, -0.02);
  add(new RoundedBoxGeometry(0.7, 0.72, 0.16, 2, 0.06), m.seat, 0, 2.05, -0.38).rotation.x = 0.2;
  // Les essieux, les amortisseurs, le cadre du pare-brise, les deux pots qui montent, les phares, la plaque au nom
  for (const z of [1.2, -1.2]) {
    add(new THREE.CylinderGeometry(0.1, 0.1, 2.3, 10), m.metal, 0, 0.9, z).rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) tube(add, V(side * 0.75, 0.92, z), V(side * 0.5, 1.3, z - 0.2), 0.07, m.metal, true);
  }
  for (const side of [-1, 1]) {
    tube(add, V(side * 0.72, 1.9, 0.44), V(side * 0.6, 2.75, 0.2), 0.04, m.dark, true);
    add(new THREE.CylinderGeometry(0.09, 0.11, 1.15, 10), m.metal, side * 0.74, 2.5, -0.5);
    add(new THREE.SphereGeometry(0.13, 10, 8), m.lamp, side * 0.55, 1.78, 1.78, false);
  }
  tube(add, V(-0.6, 2.75, 0.2), V(0.6, 2.75, 0.2), 0.04, m.dark, true);
  add(new THREE.BoxGeometry(1.2, 0.03, 0.02), m.dark, 0, 2.06, 0.46, false);
  namePlate(add, m, 1.3, 0.26, 0, 1.72, -1.76);
  const at = V(0, 2.2, 0.26);
  const axis = V(0, 0, 1).applyAxisAngle(V(1, 0, 0), 0.52);
  tube(add, at.clone().addScaledVector(axis, 0.02), at.clone().addScaledVector(axis, 0.42), 0.035, m.dark);
  return {
    rig: { hips: V(0, 1.72, -0.12), pitch: 0, steer: { kind: "wheel", at, tilt: 0.52, half: 0.18 }, legs: null },
    wheels: [
      { x: -1.18, z: 1.2, r: 0.9, w: 0.62, front: true },
      { x: 1.18, z: 1.2, r: 0.9, w: 0.62, front: true },
      { x: -1.18, z: -1.2, r: 0.9, w: 0.62, front: false },
      { x: 1.18, z: -1.2, r: 0.9, w: 0.62, front: false },
    ],
    flames: [
      [-0.74, 3.25, -0.6],
      [0.74, 3.25, -0.6],
    ],
    sparks: [
      { x: -1.18, z: -1.9 },
      { x: 1.18, z: -1.9 },
    ],
    pivot: 1.3,
    lean: 0,
    shield: [2.9, 1.5],
    tag: 4.2,
  };
}

function buildTondeuse(add: Add, m: VehicleMats): VehicleSpec {
  // Le plateau de coupe, le capot, le siège sur son ressort, le bac à herbe
  add(new THREE.CylinderGeometry(0.98, 1.02, 0.18, 24), m.dark, 0, 0.28, 0.2);
  add(new THREE.BoxGeometry(1.32, 0.14, 0.5), m.white, 0, 0.38, 0.2, false);
  add(
    hull(
      [
        [0.1, 0.5],
        [1.3, 0.5],
        [1.42, 0.72],
        [1.28, 1.02],
        [0.5, 1.06],
        [0.14, 0.86],
      ],
      0.86,
      0.08,
    ),
    m.paint,
    0,
    0,
    0,
  );
  add(new RoundedBoxGeometry(1.1, 0.22, 1.2, 2, 0.06), m.paintDark, 0, 0.56, -0.5);
  add(new THREE.CylinderGeometry(0.1, 0.14, 0.32, 10), m.metal, 0, 0.78, -0.42);
  add(new RoundedBoxGeometry(0.62, 0.14, 0.56, 2, 0.05), m.seat, 0, 0.98, -0.44);
  add(new RoundedBoxGeometry(0.62, 0.5, 0.12, 2, 0.05), m.seat, 0, 1.26, -0.74).rotation.x = 0.2;
  add(new RoundedBoxGeometry(1.0, 0.72, 0.62, 3, 0.14), m.white, 0, 0.94, -1.26);
  namePlate(add, m, 0.9, 0.2, 0, 1.08, -1.6);
  for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.1, 10, 8), m.lamp, side * 0.28, 0.82, 1.42, false);
  const at = V(0, 1.42, 0.14);
  const axis = V(0, 0, 1).applyAxisAngle(V(1, 0, 0), 0.9);
  tube(add, at.clone().addScaledVector(axis, 0.02), at.clone().addScaledVector(axis, 0.7), 0.04, m.dark);
  return {
    rig: {
      hips: V(0, 1.0, -0.42),
      pitch: 0,
      steer: { kind: "wheel", at, tilt: 0.9, half: 0.17 },
      legs: { knee: V(0.32, 1.0, 0.22), foot: V(0.34, 0.58, 0.24) },
    },
    wheels: [
      { x: -0.62, z: 1.0, r: 0.28, w: 0.2, front: true },
      { x: 0.62, z: 1.0, r: 0.28, w: 0.2, front: true },
      { x: -0.74, z: -0.72, r: 0.44, w: 0.34, front: false },
      { x: 0.74, z: -0.72, r: 0.44, w: 0.34, front: false },
    ],
    flames: [
      [-0.12, 0.7, -1.95],
      [0.12, 0.7, -1.95],
    ],
    sparks: [
      { x: -0.74, z: -1.1 },
      { x: 0.74, z: -1.1 },
    ],
    pivot: 0.6,
    lean: 0,
    shield: [2.0, 0.95],
    tag: 3,
  };
}

function buildSoucoupe(add: Add, m: VehicleMats): VehicleSpec {
  // Le disque, tourné d'un profil ; le liseré brillant ; la bulle de verre au-dessus du pilote
  const disc = new THREE.LatheGeometry(
    [
      [0, 0.34],
      [0.5, 0.36],
      [1.15, 0.5],
      [1.5, 0.66],
      [1.46, 0.76],
      [1.0, 0.86],
      [0.74, 0.92],
      [0, 0.92],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    40,
  );
  disc.computeVertexNormals();
  add(disc, m.paint, 0, 0, 0);
  add(new THREE.TorusGeometry(1.48, 0.05, 8, 40), m.metal, 0, 0.71, 0).rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(0.84, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, 0, 0.9, 0, false);
  add(new THREE.CylinderGeometry(0.2, 0.3, 0.3, 14), m.dark, 0, 0.98, 0.42, false);
  namePlate(add, m, 0.9, 0.18, 0, 0.72, -1.44);
  // Sous le disque : une couronne de lumières qui tourne
  const spinner = new THREE.Group();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), m.lamp);
    lamp.position.set(Math.cos(a) * 0.95, 0.42, Math.sin(a) * 0.95);
    spinner.add(lamp);
  }
  return {
    rig: { hips: V(0, 0.82, -0.05), pitch: 0, steer: { kind: "none", at: V(0, 1.08, 0.42), tilt: 0, half: 0.2 }, legs: null },
    wheels: [],
    flames: [
      [-0.3, 0.66, -1.9],
      [0.3, 0.66, -1.9],
    ],
    sparks: [
      { x: -0.8, z: -0.6 },
      { x: 0.8, z: -0.6 },
    ],
    pivot: 0.6,
    lean: 0.24,
    shield: [2.2, 0.85],
    tag: 2.9,
    hover: true,
    spinner,
  };
}

export function buildVehicle(id: VehicleId, add: Add, m: VehicleMats): VehicleSpec {
  switch (id) {
    case "moto":
      return buildMoto(add, m);
    case "buggy":
      return buildBuggy(add, m);
    case "bolide":
      return buildBolide(add, m);
    case "monstre":
      return buildMonstre(add, m);
    case "tondeuse":
      return buildTondeuse(add, m);
    case "soucoupe":
      return buildSoucoupe(add, m);
    default:
      return buildKart(add, m);
  }
}
