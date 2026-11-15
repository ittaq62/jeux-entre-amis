// Les armes en trois dimensions : des formes génériques (boîtier, canon, chargeur, crosse, viseur), sans copier de
// modèle réel. Le corps prend le camouflage choisi ; le canon et les pièces restent en métal bruni. L'arme regarde
// vers -z, la poignée à l'origine.

import * as THREE from "three";
import type { CamoId } from "../../../shared/games/escarmouche/camos.ts";
import type { WeaponId } from "../../../shared/games/escarmouche/weapons.ts";
import { camoTexture } from "./textures.ts";

const metal = new THREE.MeshLambertMaterial({ color: "#26292d" });
const darkMetal = new THREE.MeshLambertMaterial({ color: "#16181b" });
const wood = new THREE.MeshLambertMaterial({ color: "#5a3e26" });
const lens = new THREE.MeshBasicMaterial({ color: "#2c4a63" });
const camoMats = new Map<CamoId, THREE.MeshLambertMaterial>();

function camoMat(camo: CamoId): THREE.MeshLambertMaterial {
  let m = camoMats.get(camo);
  if (!m) {
    const t = camoTexture(camo).clone();
    t.needsUpdate = true;
    t.repeat.set(3, 3);
    m = new THREE.MeshLambertMaterial({ map: t });
    camoMats.set(camo, m);
  }
  return m;
}

export interface Gun {
  group: THREE.Group;
  /** Le bout du canon : là où naît la flamme */
  muzzle: THREE.Object3D;
  /** Le chargeur, qu'on retire en rechargeant */
  mag: THREE.Object3D | null;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function tube(r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Une arme, dans son camouflage */
export function buildGun(id: WeaponId, camo: CamoId, low = false): Gun {
  const g = new THREE.Group();
  const body = camoMat(camo);
  const muzzle = new THREE.Object3D();
  let mag: THREE.Object3D | null = null;
  const seg = low ? 6 : 10;
  switch (id) {
    case "fa": {
      box(0.07, 0.09, 0.42, body, 0, 0.06, -0.16, g);
      box(0.06, 0.05, 0.3, body, 0, 0.05, -0.5, g);
      tube(0.014, 0.28, metal, 0, 0.07, -0.78, g, seg);
      box(0.03, 0.04, 0.05, darkMetal, 0, 0.07, -0.93, g);
      mag = box(0.045, 0.17, 0.08, darkMetal, 0, -0.06, -0.24, g);
      mag.rotation.x = 0.2;
      box(0.04, 0.12, 0.05, body, 0, -0.04, 0.02, g);
      box(0.05, 0.08, 0.26, body, 0, 0.04, 0.2, g);
      box(0.05, 0.14, 0.05, body, 0, 0.0, 0.32, g);
      box(0.03, 0.04, 0.14, darkMetal, 0, 0.13, -0.15, g);
      muzzle.position.set(0, 0.07, -0.97);
      break;
    }
    case "pm": {
      box(0.065, 0.085, 0.3, body, 0, 0.05, -0.12, g);
      tube(0.013, 0.16, metal, 0, 0.06, -0.35, g, seg);
      mag = box(0.04, 0.2, 0.05, darkMetal, 0, -0.1, -0.16, g);
      box(0.04, 0.11, 0.05, body, 0, -0.04, 0.02, g);
      box(0.02, 0.02, 0.24, metal, 0, 0.05, 0.16, g);
      box(0.05, 0.08, 0.02, metal, 0, 0.03, 0.28, g);
      box(0.025, 0.03, 0.08, darkMetal, 0, 0.11, -0.12, g);
      muzzle.position.set(0, 0.06, -0.44);
      break;
    }
    case "pompe": {
      box(0.07, 0.09, 0.3, body, 0, 0.05, -0.08, g);
      tube(0.02, 0.62, metal, 0, 0.075, -0.52, g, seg);
      tube(0.017, 0.5, darkMetal, 0, 0.03, -0.45, g, seg);
      mag = box(0.075, 0.07, 0.18, body, 0, 0.025, -0.48, g);
      box(0.045, 0.12, 0.05, body, 0, -0.04, 0.04, g);
      box(0.06, 0.1, 0.3, body, 0, 0.02, 0.22, g);
      muzzle.position.set(0, 0.075, -0.84);
      break;
    }
    case "precision": {
      box(0.07, 0.09, 0.4, body, 0, 0.05, -0.12, g);
      tube(0.016, 0.62, metal, 0, 0.065, -0.62, g, seg);
      box(0.06, 0.05, 0.36, body, 0, 0.035, -0.45, g);
      mag = box(0.045, 0.08, 0.08, darkMetal, 0, -0.03, -0.12, g);
      box(0.045, 0.12, 0.05, body, 0, -0.04, 0.06, g);
      box(0.06, 0.12, 0.32, body, 0, 0.02, 0.26, g);
      // La lunette
      tube(0.028, 0.32, darkMetal, 0, 0.15, -0.14, g, seg);
      tube(0.034, 0.05, darkMetal, 0, 0.15, -0.31, g, seg);
      const glass = tube(0.026, 0.005, lens, 0, 0.15, -0.336, g, seg);
      glass.rotation.x = Math.PI / 2;
      box(0.02, 0.05, 0.02, darkMetal, 0, 0.11, -0.08, g);
      box(0.02, 0.05, 0.02, darkMetal, 0, 0.11, -0.2, g);
      muzzle.position.set(0, 0.065, -0.94);
      break;
    }
    case "pistolet": {
      box(0.04, 0.05, 0.2, body, 0, 0.06, -0.08, g);
      box(0.036, 0.04, 0.2, darkMetal, 0, 0.1, -0.08, g);
      mag = box(0.034, 0.13, 0.05, body, 0, -0.02, 0.0, g);
      mag.rotation.x = -0.25;
      box(0.025, 0.04, 0.05, wood, 0, 0.02, -0.04, g);
      muzzle.position.set(0, 0.09, -0.19);
      break;
    }
  }
  g.add(muzzle);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { group: g, muzzle, mag };
}

/** La grenade dans la main, et en vol */
export function buildGrenade(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 8), new THREE.MeshLambertMaterial({ color: "#3d4a2c" }));
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.05), metal);
  cap.position.y = 0.07;
  m.add(cap);
  return m;
}

/** Le couteau */
export function buildKnife(): THREE.Group {
  const g = new THREE.Group();
  box(0.025, 0.03, 0.11, darkMetal, 0, 0, 0.02, g);
  const blade = box(0.006, 0.035, 0.17, new THREE.MeshLambertMaterial({ color: "#a8adb2" }), 0, 0.005, -0.12, g);
  blade.scale.set(1, 1, 1);
  return g;
}
