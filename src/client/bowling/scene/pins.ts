// Une quille en 3D : son profil réel (la base étroite, le ventre, le cou fin, la tête ronde), tourné autour de son axe,
// laquée, avec ses deux bandes rouges ; et ses autres habits (bois, pois, sucre d'orge, néon, cristal, or). L'origine
// est le centre de gravité, comme dans la physique.

import * as THREE from "three";
import { PIN_H } from "../../../shared/games/bowling/lane.ts";
import { PIN_COM } from "../../../shared/games/bowling/physics.ts";
import { pinTexture } from "./textures.ts";

/** Le profil d'une quille : hauteur, rayon (d'après les mesures officielles, en pouces convertis) */
const PROFILE: [number, number][] = [
  [0, 0],
  [0, 0.0258],
  [0.006, 0.0305],
  [0.019, 0.0359],
  [0.057, 0.0496],
  [0.0857, 0.0573],
  [0.1143, 0.0605],
  [0.1492, 0.058],
  [0.1842, 0.0494],
  [0.2191, 0.0379],
  [0.254, 0.0228],
  [0.2889, 0.0237],
  [0.3239, 0.0297],
  [0.3429, 0.0318],
  [0.3683, 0.0273],
  [0.3775, 0.017],
  [PIN_H, 0],
];

const shared = new Map<string, THREE.BufferGeometry>();

/** La forme d'une quille (la même pour toutes) ; `far` : une version plus légère, pour les pistes voisines */
export function pinGeometry(far = false): THREE.BufferGeometry {
  const key = far ? "far" : "near";
  const have = shared.get(key);
  if (have) return have;
  // Le profil lissé : une courbe qui passe par chaque mesure
  const curve = new THREE.SplineCurve(PROFILE.slice(1).map(([h, r]) => new THREE.Vector2(r, h)));
  const pts = [new THREE.Vector2(0, 0), ...curve.getPoints(far ? 18 : 38)];
  pts[pts.length - 1]!.set(0, PIN_H);
  const g = new THREE.LatheGeometry(pts, far ? 12 : 28);
  // La texture se pose à la hauteur (v de 0 à la base à 1 au sommet), pas au long du profil
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / PIN_H);
  g.translate(0, -PIN_COM, 0);
  g.computeVertexNormals();
  shared.set(key, g);
  return g;
}

const mats = new Map<string, THREE.Material>();

/** La matière des quilles de ce skin */
export function pinMaterial(skin: string): THREE.Material {
  const have = mats.get(skin);
  if (have) return have;
  const map = pinTexture(skin);
  let m: THREE.MeshPhysicalMaterial;
  switch (skin) {
    case "dorees":
      m = new THREE.MeshPhysicalMaterial({ map, metalness: 0.85, roughness: 0.22, clearcoat: 0.6 });
      break;
    case "cristal":
      m = new THREE.MeshPhysicalMaterial({
        map,
        metalness: 0,
        roughness: 0.04,
        transmission: 0.85,
        thickness: 0.06,
        ior: 1.45,
        clearcoat: 1,
      });
      break;
    case "neon":
      m = new THREE.MeshPhysicalMaterial({
        map,
        roughness: 0.3,
        clearcoat: 1,
        emissiveMap: map,
        emissive: 0xffffff,
        emissiveIntensity: 0.9,
      });
      break;
    case "bois":
      m = new THREE.MeshPhysicalMaterial({ map, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.2 });
      break;
    default:
      // La laque : un vernis épais et brillant sur un blanc chaud
      m = new THREE.MeshPhysicalMaterial({ map, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.2 });
  }
  mats.set(skin, m);
  return m;
}

/** Une quille prête à poser */
export function pinMesh(skin = "classiques"): THREE.Mesh {
  const m = new THREE.Mesh(pinGeometry(), pinMaterial(skin));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
