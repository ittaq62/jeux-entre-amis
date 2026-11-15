import * as THREE from "three";
import type { SpecialKind } from "../../../shared/games/capitale/board.ts";
import * as B from "./buildings.ts";
import { landmark } from "./landmarks.ts";
import { cityBlock, cityHouse } from "./streets.ts";
import { buildModel, vacantLot } from "./builderCity.ts";
import type { BuildKind } from "../../../shared/games/capitale/builder.ts";

// Les vignettes des bâtiments pour les menus : chaque modèle 3D rendu une fois en petite image, vu de trois quarts.

let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
const cache = new Map<string, string>();

function render(key: string, make: () => THREE.Object3D, size: number): string {
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
  const obj = make();
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

/** La vignette d'un niveau d'une rue (une maison, un immeuble, le monument de la ville), ou "" si le WebGL manque */
export function levelThumb(level: number, index: number, color: string, size = 160): string {
  return render(
    `l${level}|${index}|${color}|${size}`,
    () =>
      level >= 5 ? landmark(index, color) : level >= 3 ? cityBlock(index, color, level === 4 ? 1 : 0) : cityHouse(index, color, level - 1),
    size,
  );
}

/** Builder : la vignette d'un bâtiment à poser, à la façon de la ville */
export function buildThumb(kind: BuildKind, index: number, color: string, size = 120): string {
  return render(`b${kind}|${index}|${color}|${size}`, () => buildModel(kind, index, color, 0).obj, size);
}

/** Un sujet sur son socle rond, comme les bâtiments de l'album : une galette de pierre claire, une pelouse, un liseré doré */
function diorama(subject: THREE.Object3D, r: number): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, 0.05, 48), B.mat("#efe3c8", { rough: 0.8 }));
  stone.position.y = -0.03;
  const gold = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.045, r * 1.045, 0.012, 48), B.mat("#d9b24a", { metal: 0.7, rough: 0.35 }));
  gold.position.y = -0.052;
  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.012, 48), B.mat("#86b85f", { rough: 1 }));
  lawn.position.y = -0.004;
  g.add(stone, gold, lawn, subject);
  return g;
}

/** L'image d'une carte de l'album pour Capitale Builder : le commerce, le terrain vague, la centrale */
export function albumThumb(subject: "commerce" | "vague" | "centrale", size = 320): string {
  return render(
    `album|${subject}|${size}`,
    () =>
      diorama(
        subject === "commerce" ? buildModel("commerce", 27, "#e2453c").obj : subject === "centrale" ? B.centrale().group : vacantLot(),
        0.36,
      ),
    size,
  );
}

/** La vignette d'un bâtiment spécial */
export function specialThumb(kind: SpecialKind, color: string, size = 160): string {
  return render(
    `s${kind}|${color}|${size}`,
    () => {
      switch (kind) {
        case "monument":
          return B.monument(color);
        case "parc":
          return B.parc().group;
        case "stade":
          return B.stade(color);
        case "decharge":
          return B.decharge().group;
        case "centrale":
          return B.centrale().group;
      }
    },
    size,
  );
}
