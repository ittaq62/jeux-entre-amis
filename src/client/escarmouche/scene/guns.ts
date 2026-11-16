// Les armes en trois dimensions : des formes génériques (boîtier, garde-main, canon, chargeur, crosse, organes de visée),
// sans copier de modèle réel. Le corps prend le camouflage choisi ; le canon et les pièces restent en métal bruni, la
// poignée en polymère, le bois là où il y en a. L'arme regarde vers -z, la poignée à l'origine. Les pièces fixes sont
// fondues par matière (peu d'appels de dessin) ; celles qui bougent (chargeur, pompe, canons qui basculent, barillet)
// restent à part.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CamoId } from "../../../shared/games/escarmouche/camos.ts";
import type { WeaponId } from "../../../shared/games/escarmouche/weapons.ts";
import { camoTexture } from "./textures.ts";

const std = (color: string, roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const metal = std("#2c2f34", 0.4, 0.7);
const darkMetal = std("#191a1d", 0.55, 0.5);
const polymer = std("#202124", 0.85);
const wood = std("#6b4426", 0.55);
const brass = std("#b58b3d", 0.3, 0.85);
const lens = new THREE.MeshStandardMaterial({
  color: "#16324f",
  roughness: 0.05,
  metalness: 0.9,
  emissive: "#0a2034",
  emissiveIntensity: 0.8,
});
const glass = new THREE.MeshStandardMaterial({
  color: "#9fd4c8",
  roughness: 0.05,
  metalness: 0.2,
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
});
const redDot = new THREE.MeshBasicMaterial({ color: "#ff2a1f" });
const camoMats = new Map<CamoId, THREE.MeshStandardMaterial>();

function camoMat(camo: CamoId): THREE.MeshStandardMaterial {
  let m = camoMats.get(camo);
  if (!m) {
    const t = camoTexture(camo).clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.72, metalness: 0.08 });
    camoMats.set(camo, m);
  }
  return m;
}

export interface Gun {
  group: THREE.Group;
  /** Le bout du canon : là où naît la flamme */
  muzzle: THREE.Object3D;
  /** La fenêtre d'éjection : là où sortent les douilles */
  eject: THREE.Object3D;
  /** Le chargeur, qu'on retire en rechargeant (et sa place au repos) */
  mag: THREE.Object3D | null;
  magRest: THREE.Vector3;
  /** Ce qui bascule en rechargeant : les canons du fusil à deux coups, le barillet du revolver */
  hinge: THREE.Object3D | null;
  hingeAxis: "x" | "z";
  /** La pompe du fusil à pompe, qui recule après chaque coup */
  pump: THREE.Object3D | null;
  pumpRest: number;
  /** La hauteur de la ligne de visée (dans le repère de l'arme) */
  sight: number;
  /** Où tient la main d'appui (z), et une arme de poing (les deux mains sur la poignée) */
  front: number;
  pistol: boolean;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  parent.add(m);
  return m;
}

/** Un cylindre couché le long de l'arme (r2 : le rayon côté bouche, pour un canon effilé) */
function cyl(r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, seg = 10, r2 = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function ball(r: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Un rail crénelé sur le dessus */
function rail(len: number, y: number, z: number, p: THREE.Object3D, detail: boolean) {
  box(0.022, 0.008, len, darkMetal, 0, y, z, p);
  if (!detail) return;
  const n = Math.floor(len / 0.024);
  for (let k = 0; k < n; k++) box(0.026, 0.006, 0.011, darkMetal, 0, y + 0.006, z - len / 2 + 0.012 + k * 0.024, p);
}

/** Une poignée pistolet, inclinée vers l'arrière */
function grip(y: number, z: number, p: THREE.Object3D, mat: THREE.Material = polymer, h = 0.11) {
  box(0.036, h, 0.048, mat, 0, y - h / 2 + 0.02, z + 0.012, p, -0.28);
  // Le pontet et la détente
  box(0.006, 0.006, 0.07, darkMetal, 0, y - 0.035, z - 0.045, p);
  box(0.006, 0.035, 0.006, darkMetal, 0, y - 0.018, z - 0.08, p);
  box(0.004, 0.022, 0.006, darkMetal, 0, y - 0.01, z - 0.04, p, 0.3);
}

/** Un viseur point rouge ouvert : on voit au travers */
function reflex(y: number, z: number, p: THREE.Object3D) {
  box(0.04, 0.012, 0.06, darkMetal, 0, y - 0.024, z, p);
  box(0.006, 0.042, 0.05, darkMetal, -0.019, y - 0.002, z, p);
  box(0.006, 0.042, 0.05, darkMetal, 0.019, y - 0.002, z, p);
  box(0.044, 0.008, 0.05, darkMetal, 0, y + 0.022, z, p);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.036), glass);
  g.position.set(0, y, z - 0.02);
  p.add(g);
  ball(0.0025, redDot, 0, y, z - 0.021, p);
}

/** Une lunette : tube, bonnettes, tourelles et colliers */
function scope(y: number, z: number, len: number, r: number, p: THREE.Object3D, seg: number) {
  cyl(r, len, darkMetal, 0, y, z, p, seg);
  cyl(r * 1.15, len * 0.22, darkMetal, 0, y, z - len * 0.55, p, seg, r * 1.55);
  cyl(r * 1.25, len * 0.16, darkMetal, 0, y, z + len * 0.55, p, seg);
  const front = new THREE.Mesh(new THREE.CircleGeometry(r * 1.4, seg), lens);
  front.position.set(0, y, z - len * 0.66 - 0.001);
  front.rotation.y = Math.PI;
  p.add(front);
  const back = new THREE.Mesh(new THREE.CircleGeometry(r * 1.1, seg), lens);
  back.position.set(0, y, z + len * 0.63 + 0.001);
  p.add(back);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, r * 1.1, seg), darkMetal);
  top.position.set(0, y + r * 1.2, z - len * 0.05);
  p.add(top);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, r * 1.0, seg), darkMetal);
  side.rotation.z = Math.PI / 2;
  side.position.set(r * 1.15, y, z - len * 0.05);
  p.add(side);
  box(0.03, y - 0.1, 0.022, darkMetal, 0, (y + 0.1) / 2, z - len * 0.28, p);
  box(0.03, y - 0.1, 0.022, darkMetal, 0, (y + 0.1) / 2, z + len * 0.28, p);
}

/** Des fentes d'aération sur les deux flancs */
function vents(n: number, w: number, y: number, z0: number, step: number, p: THREE.Object3D) {
  for (let k = 0; k < n; k++) {
    box(0.004, 0.012, 0.03, darkMetal, -w / 2 - 0.001, y, z0 - k * step, p);
    box(0.004, 0.012, 0.03, darkMetal, w / 2 + 0.001, y, z0 - k * step, p);
  }
}

/** Un chargeur courbe en deux morceaux */
function curvedMag(p: THREE.Object3D, mat: THREE.Material, w = 0.04, d = 0.072) {
  box(w, 0.1, d, mat, 0, -0.045, 0, p, 0.16);
  box(w, 0.08, d * 0.96, mat, 0, -0.125, -0.024, p, 0.42);
  box(w + 0.006, 0.012, d + 0.008, darkMetal, 0, -0.165, -0.044, p, 0.42);
}

/** Les pièces fixes, fondues par matière : bien moins d'appels de dessin */
function fuse(parent: THREE.Object3D) {
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const meshes: THREE.Mesh[] = [];
  for (const c of [...parent.children]) {
    if (c instanceof THREE.Mesh && !(c.material as THREE.Material).transparent && c.material !== redDot) {
      c.updateMatrix();
      const geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
      geo.applyMatrix4(c.matrix);
      for (const name of Object.keys(geo.attributes))
        if (name !== "position" && name !== "normal" && name !== "uv") geo.deleteAttribute(name);
      const list = groups.get(c.material as THREE.Material) ?? [];
      list.push(geo);
      groups.set(c.material as THREE.Material, list);
      meshes.push(c);
    } else if (!(c instanceof THREE.Mesh) && c.children.length > 0) fuse(c);
  }
  for (const m of meshes) {
    parent.remove(m);
    m.geometry.dispose();
  }
  for (const [mat, list] of groups) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    parent.add(mesh);
  }
}

/** Une arme, dans son camouflage */
export function buildGun(id: WeaponId, camo: CamoId, low = false): Gun {
  const g = new THREE.Group();
  const body = camoMat(camo);
  const muzzle = new THREE.Object3D();
  const eject = new THREE.Object3D();
  const seg = low ? 6 : 12;
  const detail = !low;
  let mag: THREE.Object3D | null = null;
  let hinge: THREE.Object3D | null = null;
  let hingeAxis: "x" | "z" = "x";
  let pump: THREE.Object3D | null = null;
  let sight = 0.13;
  let front = -0.42;
  let pistol = false;
  const magGroup = (x: number, y: number, z: number) => {
    const m = new THREE.Group();
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };

  switch (id) {
    case "fa": {
      // Le fusil d'assaut : boîtier, garde-main ventilé, rail, point rouge, crosse réglable
      box(0.062, 0.07, 0.36, body, 0, 0.075, -0.16, g);
      box(0.056, 0.05, 0.22, body, 0, 0.025, -0.12, g);
      rail(0.36, 0.114, -0.17, g, detail);
      box(0.07, 0.075, 0.3, body, 0, 0.07, -0.49, g);
      if (detail) vents(4, 0.07, 0.07, -0.4, 0.06, g);
      cyl(0.012, 0.24, metal, 0, 0.075, -0.75, g, seg);
      box(0.03, 0.035, 0.03, darkMetal, 0, 0.088, -0.66, g);
      box(0.01, 0.05, 0.01, darkMetal, 0, 0.12, -0.66, g);
      cyl(0.018, 0.07, darkMetal, 0, 0.075, -0.9, g, seg);
      if (detail) for (const s of [-1, 1]) box(0.004, 0.008, 0.04, metal, s * 0.018, 0.075, -0.9, g);
      grip(0.02, 0.0, g);
      cyl(0.018, 0.2, metal, 0, 0.065, 0.12, g, seg);
      box(0.046, 0.085, 0.16, polymer, 0, 0.05, 0.22, g);
      box(0.05, 0.115, 0.022, polymer, 0, 0.035, 0.305, g);
      box(0.03, 0.012, 0.035, darkMetal, 0, 0.104, 0.03, g);
      box(0.004, 0.026, 0.07, darkMetal, 0.033, 0.08, -0.1, g);
      reflex(0.15, -0.14, g);
      mag = magGroup(0, 0.02, -0.2);
      curvedMag(mag, darkMetal);
      eject.position.set(0.04, 0.08, -0.1);
      muzzle.position.set(0, 0.075, -0.94);
      sight = 0.15;
      front = -0.46;
      break;
    }
    case "pm": {
      // Le pistolet-mitrailleur : court, poignée avant, crosse repliable en fil
      box(0.06, 0.08, 0.3, body, 0, 0.06, -0.12, g);
      rail(0.24, 0.104, -0.12, g, detail);
      box(0.056, 0.06, 0.12, body, 0, 0.055, -0.33, g);
      cyl(0.011, 0.08, metal, 0, 0.065, -0.42, g, seg);
      cyl(0.016, 0.05, darkMetal, 0, 0.065, -0.47, g, seg);
      box(0.03, 0.08, 0.035, polymer, 0, -0.015, -0.33, g, -0.1);
      grip(0.02, 0.0, g);
      for (const s of [-1, 1]) box(0.008, 0.008, 0.22, metal, s * 0.024, 0.06, 0.13, g);
      box(0.054, 0.08, 0.014, metal, 0, 0.05, 0.245, g);
      // Les organes de visée : un œilleton à l'arrière, un guidon sous capot à l'avant
      box(0.026, 0.026, 0.014, darkMetal, 0, 0.12, 0.0, g);
      box(0.004, 0.03, 0.012, darkMetal, -0.012, 0.125, -0.37, g);
      box(0.004, 0.03, 0.012, darkMetal, 0.012, 0.125, -0.37, g);
      box(0.004, 0.02, 0.006, darkMetal, 0, 0.12, -0.37, g);
      box(0.004, 0.022, 0.06, darkMetal, 0.031, 0.07, -0.1, g);
      mag = magGroup(0, -0.0, -0.18);
      box(0.034, 0.19, 0.045, darkMetal, 0, -0.095, 0, mag, 0.08);
      box(0.04, 0.012, 0.05, darkMetal, 0, -0.19, -0.008, mag, 0.08);
      eject.position.set(0.035, 0.07, -0.1);
      muzzle.position.set(0, 0.065, -0.5);
      sight = 0.122;
      front = -0.33;
      break;
    }
    case "pompe": {
      // Le fusil à pompe : long canon, tube magasin, pompe striée qui recule, guidon en bille
      box(0.062, 0.085, 0.26, body, 0, 0.05, -0.07, g);
      cyl(0.019, 0.6, metal, 0, 0.082, -0.5, g, seg);
      box(0.008, 0.006, 0.58, darkMetal, 0, 0.103, -0.5, g);
      ball(0.005, brass, 0, 0.11, -0.79, g);
      cyl(0.016, 0.52, darkMetal, 0, 0.036, -0.46, g, seg);
      box(0.026, 0.016, 0.03, darkMetal, 0, 0.06, -0.72, g);
      grip(0.02, 0.0, g);
      box(0.05, 0.065, 0.12, body, 0, 0.03, 0.08, g, 0.12);
      box(0.052, 0.12, 0.2, body, 0, 0.01, 0.23, g, 0.12);
      box(0.055, 0.13, 0.02, polymer, 0, 0.0, 0.335, g, 0.12);
      box(0.004, 0.03, 0.08, darkMetal, 0.033, 0.06, -0.08, g);
      pump = magGroup(0, 0.036, -0.45);
      box(0.07, 0.06, 0.18, body, 0, 0, 0, pump);
      if (detail) for (let k = 0; k < 6; k++) box(0.074, 0.008, 0.012, darkMetal, 0, -0.012, -0.07 + k * 0.028, pump);
      eject.position.set(0.04, 0.07, -0.08);
      muzzle.position.set(0, 0.082, -0.81);
      sight = 0.112;
      front = -0.45;
      break;
    }
    case "precision": {
      // Le fusil de précision : canon effilé, frein de bouche, culasse à levier, grosse lunette, bipied replié
      box(0.06, 0.075, 0.3, body, 0, 0.06, -0.12, g);
      cyl(0.017, 0.62, metal, 0, 0.066, -0.6, g, seg, 0.012);
      box(0.036, 0.03, 0.065, darkMetal, 0, 0.066, -0.94, g);
      if (detail) for (const s of [-1, 1]) box(0.004, 0.018, 0.012, metal, s * 0.019, 0.066, -0.945, g);
      box(0.066, 0.07, 0.38, body, 0, 0.035, -0.42, g);
      if (detail) vents(5, 0.066, 0.04, -0.3, 0.055, g);
      box(0.05, 0.12, 0.24, body, 0, 0.02, 0.2, g);
      box(0.046, 0.03, 0.13, body, 0, 0.098, 0.18, g);
      box(0.055, 0.135, 0.022, polymer, 0, 0.015, 0.33, g);
      grip(0.02, 0.0, g);
      cyl(0.006, 0.06, metal, 0.05, 0.07, -0.02, g, 6).rotation.set(0, 0, Math.PI / 2);
      ball(0.012, darkMetal, 0.082, 0.065, -0.02, g);
      for (const s of [-1, 1]) cyl(0.006, 0.26, darkMetal, s * 0.016, 0.0, -0.6, g, 6);
      box(0.05, 0.02, 0.03, darkMetal, 0, 0.012, -0.48, g);
      scope(0.152, -0.12, 0.34, 0.022, g, seg);
      mag = magGroup(0, 0.01, -0.12);
      box(0.05, 0.07, 0.09, darkMetal, 0, -0.03, 0, mag);
      eject.position.set(0.035, 0.08, -0.06);
      muzzle.position.set(0, 0.066, -0.98);
      sight = 0.152;
      front = -0.4;
      break;
    }
    case "carabine": {
      // La carabine de tireur : long garde-main, rail, lunette légère, crosse à appui-joue
      box(0.062, 0.072, 0.34, body, 0, 0.074, -0.15, g);
      box(0.056, 0.05, 0.2, body, 0, 0.026, -0.11, g);
      rail(0.62, 0.114, -0.32, g, detail);
      box(0.068, 0.07, 0.4, body, 0, 0.07, -0.53, g);
      if (detail) vents(6, 0.068, 0.07, -0.38, 0.055, g);
      cyl(0.013, 0.3, metal, 0, 0.074, -0.86, g, seg, 0.011);
      cyl(0.017, 0.06, darkMetal, 0, 0.074, -1.03, g, seg);
      grip(0.02, 0.0, g);
      cyl(0.018, 0.18, metal, 0, 0.065, 0.11, g, seg);
      box(0.048, 0.1, 0.2, body, 0, 0.04, 0.24, g);
      box(0.044, 0.026, 0.12, polymer, 0, 0.105, 0.22, g);
      box(0.052, 0.125, 0.022, polymer, 0, 0.03, 0.345, g);
      box(0.004, 0.026, 0.07, darkMetal, 0.033, 0.08, -0.09, g);
      scope(0.158, -0.14, 0.26, 0.018, g, seg);
      mag = magGroup(0, 0.02, -0.2);
      box(0.04, 0.11, 0.07, darkMetal, 0, -0.05, 0, mag, 0.08);
      box(0.046, 0.012, 0.076, darkMetal, 0, -0.105, -0.004, mag, 0.08);
      eject.position.set(0.04, 0.08, -0.09);
      muzzle.position.set(0, 0.074, -1.07);
      sight = 0.158;
      front = -0.5;
      break;
    }
    case "fm": {
      // Le fusil-mitrailleur : canon lourd sous manchon percé, poignée de transport, caisse à bande, bipied
      box(0.075, 0.09, 0.34, body, 0, 0.06, -0.12, g);
      box(0.072, 0.026, 0.2, body, 0, 0.118, -0.1, g);
      rail(0.18, 0.136, -0.1, g, detail);
      box(0.07, 0.06, 0.16, body, 0, 0.045, -0.36, g);
      cyl(0.016, 0.44, metal, 0, 0.068, -0.56, g, seg);
      cyl(0.028, 0.26, darkMetal, 0, 0.068, -0.44, g, seg);
      if (detail)
        for (let k = 0; k < 6; k++) for (const s of [-1, 1]) box(0.004, 0.012, 0.018, metal, s * 0.029, 0.068, -0.34 - k * 0.04, g);
      cyl(0.021, 0.05, darkMetal, 0, 0.068, -0.8, g, seg);
      box(0.012, 0.05, 0.012, darkMetal, 0, 0.108, -0.33, g);
      box(0.012, 0.05, 0.012, darkMetal, 0, 0.108, -0.48, g);
      box(0.014, 0.012, 0.17, darkMetal, 0, 0.138, -0.405, g);
      box(0.012, 0.045, 0.012, darkMetal, 0, 0.1, -0.68, g);
      box(0.006, 0.02, 0.006, darkMetal, 0, 0.13, -0.68, g);
      box(0.024, 0.024, 0.02, darkMetal, 0, 0.146, -0.02, g);
      for (const s of [-1, 1]) cyl(0.006, 0.28, darkMetal, s * 0.014, 0.02, -0.62, g, 6);
      grip(0.02, 0.0, g);
      box(0.05, 0.1, 0.22, body, 0, 0.035, 0.2, g);
      box(0.055, 0.12, 0.02, polymer, 0, 0.03, 0.315, g);
      mag = magGroup(-0.02, -0.0, -0.17);
      box(0.09, 0.12, 0.12, polymer, 0, -0.06, 0, mag);
      box(0.094, 0.012, 0.124, darkMetal, 0, -0.005, 0, mag);
      if (detail) for (let k = 0; k < 4; k++) box(0.012, 0.006, 0.02, brass, 0.05, 0.02 + k * 0.006, 0, mag);
      eject.position.set(0.045, 0.06, -0.1);
      muzzle.position.set(0, 0.068, -0.83);
      sight = 0.146;
      front = -0.36;
      break;
    }
    case "mitraillette": {
      // La mitraillette : boîtier tubulaire, manchon percé, long chargeur droit, crosse en fil
      cyl(0.03, 0.32, body, 0, 0.06, -0.1, g, seg);
      cyl(0.022, 0.1, darkMetal, 0, 0.06, -0.31, g, seg);
      if (detail) for (let k = 0; k < 3; k++) for (const s of [-1, 1]) box(0.004, 0.01, 0.014, metal, s * 0.023, 0.06, -0.28 - k * 0.03, g);
      cyl(0.009, 0.04, metal, 0, 0.06, -0.38, g, seg);
      box(0.04, 0.03, 0.12, body, 0, 0.02, -0.05, g);
      grip(0.012, 0.02, g);
      for (const s of [-1, 1]) box(0.007, 0.007, 0.2, metal, s * 0.02, 0.05, 0.16, g);
      box(0.048, 0.07, 0.012, metal, 0, 0.04, 0.26, g);
      box(0.02, 0.026, 0.012, darkMetal, 0, 0.1, 0.03, g);
      box(0.004, 0.03, 0.012, darkMetal, -0.01, 0.103, -0.27, g);
      box(0.004, 0.03, 0.012, darkMetal, 0.01, 0.103, -0.27, g);
      box(0.004, 0.02, 0.006, darkMetal, 0, 0.098, -0.27, g);
      mag = magGroup(0, 0.01, -0.17);
      box(0.03, 0.2, 0.04, darkMetal, 0, -0.1, 0, mag, 0.04);
      eject.position.set(0.032, 0.07, -0.08);
      muzzle.position.set(0, 0.06, -0.41);
      sight = 0.11;
      front = -0.2;
      break;
    }
    case "rafale": {
      // Le fusil à rafales : garde-main rond, frein de bouche, viseur ouvert sur rail haut, crosse fixe
      box(0.064, 0.08, 0.4, body, 0, 0.07, -0.17, g);
      box(0.056, 0.05, 0.2, body, 0, 0.02, -0.12, g);
      cyl(0.036, 0.28, body, 0, 0.066, -0.5, g, seg);
      if (detail) for (let k = 0; k < 5; k++) box(0.076, 0.012, 0.018, darkMetal, 0, 0.066, -0.4 - k * 0.05, g);
      cyl(0.012, 0.14, metal, 0, 0.068, -0.71, g, seg);
      box(0.03, 0.03, 0.06, darkMetal, 0, 0.068, -0.8, g);
      box(0.03, 0.03, 0.16, body, 0, 0.122, -0.14, g);
      rail(0.15, 0.142, -0.14, g, detail);
      reflex(0.172, -0.15, g);
      grip(0.02, 0.0, g);
      box(0.05, 0.1, 0.25, body, 0, 0.05, 0.2, g);
      box(0.046, 0.024, 0.12, body, 0, 0.11, 0.2, g);
      box(0.054, 0.12, 0.02, polymer, 0, 0.045, 0.33, g);
      box(0.004, 0.026, 0.07, darkMetal, 0.033, 0.08, -0.1, g);
      mag = magGroup(0, 0.0, -0.2);
      curvedMag(mag, polymer);
      eject.position.set(0.04, 0.08, -0.1);
      muzzle.position.set(0, 0.068, -0.83);
      sight = 0.172;
      front = -0.5;
      break;
    }
    case "double": {
      // Le fusil à deux coups : deux canons côte à côte qui basculent pour recharger, bois et métal
      box(0.07, 0.06, 0.12, metal, 0, 0.055, -0.02, g);
      box(0.012, 0.012, 0.03, metal, 0, 0.09, 0.04, g);
      box(0.004, 0.024, 0.006, darkMetal, -0.006, 0.012, -0.03, g, 0.3);
      box(0.004, 0.024, 0.006, darkMetal, 0.006, 0.012, -0.0, g, 0.3);
      box(0.006, 0.006, 0.07, darkMetal, 0, -0.002, -0.02, g);
      box(0.042, 0.065, 0.12, wood, 0, 0.03, 0.1, g, 0.12);
      box(0.048, 0.125, 0.22, wood, 0, -0.005, 0.25, g, 0.12);
      box(0.05, 0.13, 0.02, polymer, 0, -0.02, 0.36, g, 0.12);
      hinge = magGroup(0, 0.045, -0.08);
      for (const s of [-1, 1]) cyl(0.016, 0.62, metal, s * 0.017, 0.028, -0.31, hinge, seg);
      box(0.006, 0.008, 0.62, darkMetal, 0, 0.046, -0.31, hinge);
      ball(0.005, brass, 0, 0.054, -0.6, hinge);
      box(0.064, 0.04, 0.22, wood, 0, -0.004, -0.14, hinge);
      eject.position.set(0, 0.07, -0.08);
      muzzle.position.set(0.017, 0.073, -0.7);
      sight = 0.1;
      front = -0.22;
      break;
    }
    case "pistolet": {
      // Le pistolet : culasse striée, carcasse au camouflage, chargeur dans la poignée
      box(0.03, 0.032, 0.19, metal, 0, 0.09, -0.08, g);
      if (detail)
        for (let k = 0; k < 4; k++) for (const s of [-1, 1]) box(0.003, 0.024, 0.004, darkMetal, s * 0.016, 0.09, -0.005 - k * 0.009, g);
      box(0.028, 0.026, 0.17, body, 0, 0.062, -0.075, g);
      cyl(0.007, 0.012, darkMetal, 0, 0.09, -0.18, g, 8);
      box(0.032, 0.105, 0.048, body, 0, 0.0, 0.006, g, -0.25);
      box(0.006, 0.006, 0.045, darkMetal, 0, 0.034, -0.06, g);
      box(0.006, 0.024, 0.006, darkMetal, 0, 0.046, -0.082, g);
      box(0.012, 0.012, 0.012, darkMetal, 0, 0.112, 0.0, g);
      box(0.004, 0.01, 0.008, darkMetal, 0, 0.11, -0.165, g);
      box(0.003, 0.012, 0.03, darkMetal, 0.016, 0.098, -0.07, g);
      mag = magGroup(0, 0.0, 0.006);
      box(0.026, 0.012, 0.044, darkMetal, 0, -0.06, 0.013, mag, -0.25);
      eject.position.set(0.02, 0.1, -0.07);
      muzzle.position.set(0, 0.09, -0.19);
      sight = 0.114;
      front = 0;
      pistol = true;
      break;
    }
    case "revolver": {
      // Le revolver : barillet qui bascule sur le côté, canon long à masselotte, crosse en bois
      box(0.03, 0.05, 0.085, metal, 0, 0.07, -0.04, g);
      box(0.022, 0.01, 0.09, metal, 0, 0.1, -0.05, g);
      cyl(0.009, 0.15, metal, 0, 0.084, -0.155, g, 10);
      box(0.017, 0.018, 0.14, metal, 0, 0.066, -0.155, g);
      box(0.004, 0.014, 0.012, darkMetal, 0, 0.098, -0.22, g);
      box(0.008, 0.026, 0.014, darkMetal, 0, 0.104, 0.008, g, 0.4);
      box(0.032, 0.095, 0.046, wood, 0, -0.002, 0.024, g, -0.38);
      box(0.006, 0.006, 0.045, darkMetal, 0, 0.034, -0.03, g);
      box(0.006, 0.024, 0.006, darkMetal, 0, 0.045, -0.052, g);
      hinge = magGroup(-0.004, 0.05, -0.06);
      hingeAxis = "z";
      cyl(0.023, 0.046, metal, 0, 0.022, 0.01, hinge, 12);
      if (detail)
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          box(0.004, 0.004, 0.04, darkMetal, Math.cos(a) * 0.023, 0.022 + Math.sin(a) * 0.023, 0.01, hinge);
        }
      eject.position.set(0, 0.07, -0.05);
      muzzle.position.set(0, 0.084, -0.235);
      sight = 0.105;
      front = 0;
      pistol = true;
      break;
    }
    case "pa": {
      // Le pistolet automatique : culasse à compensateur, long chargeur qui dépasse, poignée avant repliable
      box(0.032, 0.034, 0.2, metal, 0, 0.09, -0.085, g);
      box(0.032, 0.03, 0.035, darkMetal, 0, 0.09, -0.2, g);
      if (detail) for (const s of [-1, 1]) box(0.004, 0.012, 0.02, metal, s * 0.017, 0.096, -0.2, g);
      box(0.03, 0.028, 0.18, body, 0, 0.062, -0.08, g);
      box(0.034, 0.105, 0.05, body, 0, 0.0, 0.006, g, -0.25);
      box(0.006, 0.006, 0.05, darkMetal, 0, 0.034, -0.062, g);
      box(0.006, 0.026, 0.006, darkMetal, 0, 0.046, -0.088, g);
      box(0.02, 0.05, 0.022, polymer, 0, 0.025, -0.14, g, 0.15);
      box(0.012, 0.012, 0.012, darkMetal, 0, 0.113, 0.0, g);
      box(0.004, 0.01, 0.008, darkMetal, 0, 0.112, -0.17, g);
      box(0.004, 0.012, 0.012, brass, -0.017, 0.07, -0.01, g);
      mag = magGroup(0, 0.0, 0.006);
      box(0.026, 0.13, 0.042, darkMetal, 0, -0.1, 0.03, mag, -0.25);
      eject.position.set(0.02, 0.1, -0.07);
      muzzle.position.set(0, 0.09, -0.22);
      sight = 0.116;
      front = 0;
      pistol = true;
      break;
    }
  }
  fuse(g);
  g.add(muzzle);
  g.add(eject);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return {
    group: g,
    muzzle,
    eject,
    mag,
    magRest: mag ? mag.position.clone() : new THREE.Vector3(),
    hinge,
    hingeAxis,
    pump,
    pumpRest: pump ? pump.position.z : 0,
    sight,
    front,
    pistol,
  };
}

/** La grenade dans la main, et en vol : un corps quadrillé, la cuillère et l'anneau */
export function buildGrenade(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), std("#3d4a2c", 0.75));
  m.scale.set(1, 1.2, 1);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.03, 8), metal);
  cap.position.y = 0.055;
  m.add(cap);
  const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.006), metal);
  spoon.position.set(0.02, 0.03, 0);
  spoon.rotation.z = -0.25;
  m.add(spoon);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 6, 12), metal);
  ring.position.set(-0.018, 0.07, 0);
  m.add(ring);
  return m;
}

/** Le couteau : manche cranté, garde, lame */
export function buildKnife(): THREE.Group {
  const g = new THREE.Group();
  box(0.024, 0.03, 0.11, polymer, 0, 0, 0.02, g);
  box(0.05, 0.012, 0.012, darkMetal, 0, 0, -0.04, g);
  box(0.006, 0.034, 0.17, std("#b8bcc0", 0.25, 0.9), 0, 0.004, -0.13, g);
  box(0.004, 0.012, 0.06, std("#8d9196", 0.35, 0.9), 0, 0.02, -0.19, g, 0.2);
  return g;
}
