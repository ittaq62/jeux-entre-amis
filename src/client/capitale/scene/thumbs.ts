import * as THREE from "three";
import type { BuildingKind, GroupId } from "../../../shared/games/capitale/board.ts";
import * as B from "./buildings.ts";

// Les vignettes des bâtiments pour les menus : chaque modèle 3D rendu une fois en petite image, vu de trois quarts.

let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
const cache = new Map<string, string>();

function model(kind: BuildingKind, group: GroupId, color: string): THREE.Object3D {
  switch (kind) {
    case "maison":
      return B.maison(group, color);
    case "immeuble":
      return B.immeuble(group, color);
    case "gratte":
      return B.gratteCiel(group, color, false);
    case "parc":
      return B.parc().group;
    case "stade":
      return B.stade(color);
    case "decharge":
      return B.decharge().group;
    case "centrale":
      return B.centrale().group;
  }
}

/** La vignette d'un bâtiment (une image en data URL), ou "" si le WebGL manque */
export function buildingThumb(kind: BuildingKind, group: GroupId, color: string, size = 160): string {
  const key = `${kind}|${group}|${color}|${size}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (failed) return "";
  try {
    renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    failed = true;
    return "";
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#fff6e6", "#6b7a5c", 1.6));
  const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
  const obj = model(kind, group, color);
  scene.add(obj);
  // Cadrer le bâtiment : vu de trois quarts, un peu d'en haut, tout entier dans l'image
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  const dir = new THREE.Vector3(0.75, 0.62, 1).normalize();
  camera.position.copy(center).addScaledVector(dir, radius / Math.sin((14 * Math.PI) / 180));
  camera.lookAt(center);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  cache.set(key, url);
  return url;
}
