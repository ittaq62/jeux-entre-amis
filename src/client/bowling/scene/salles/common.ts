// Ce que toutes les salles partagent : leur description (la piste à leurs couleurs, la lumière, l'image), et des outils
// pour bâtir un décor (des tubes de néon qui brillent, des panneaux dessinés, des quilles sur les pistes voisines).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RACK } from "../../../../shared/games/bowling/lane.ts";
import { lookKey } from "../../../lib/sameLook.ts";
import { PIN_COM } from "../../../../shared/games/bowling/physics.ts";
import type { LaneStyle } from "../laneMesh.ts";
import { pinGeometry, pinMaterial } from "../pins.ts";

export interface BenchSpot {
  x: number;
  y: number;
  z: number;
  /** Vers où il regarde (angle autour de la verticale ; 0 : vers les quilles) */
  yaw: number;
}

export interface Salle {
  style: LaneStyle;
  /** Le nombre de pistes voisines de chaque côté */
  neighbors: number;
  /** Les quilles des pistes voisines */
  neighborPins?: (group: THREE.Group, x: number) => void;
  /** Tout le décor autour des pistes */
  root: THREE.Group;
  background: THREE.Color | THREE.Texture | null;
  fog: THREE.Fog | THREE.FogExp2 | null;
  /** La lumière du ciel et du sol, sa force */
  hemi: [THREE.ColorRepresentation, THREE.ColorRepresentation, number];
  /** La force des reflets de la pièce sur le vernis */
  env: number;
  exposure: number;
  /** Le halo : force, rayon, seuil */
  bloom: [number, number, number];
  grade: { warm: number; sat: number; vignette: number };
  /** Où s'assoient ceux qui attendent leur tour */
  bench: BenchSpot[];
  /** Ce qui bouge dans la salle (néons qui clignotent, boule à facettes…) */
  update?: (t: number, camera: THREE.Camera) => void;
  dispose: () => void;
}

export type Keep = <T extends { dispose: () => void }>(x: T) => T;

/** Un panier où ranger ce qu'il faudra libérer avec la salle */
export function bin(): { keep: Keep; dispose: () => void } {
  const list: { dispose: () => void }[] = [];
  return {
    keep: (x) => (list.push(x), x),
    dispose: () => {
      for (const x of list) x.dispose();
      list.length = 0;
    },
  };
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Un tube de néon le long de ces points (il brille : le halo de l'image fait le reste) */
export function neon(points: THREE.Vector3[], color: THREE.ColorRepresentation, keep: Keep, radius = 0.018, closed = false): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  const geo = keep(new THREE.TubeGeometry(curve, Math.max(8, points.length * 10), radius, 8, closed));
  const mat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2) }));
  return new THREE.Mesh(geo, mat);
}

/** Les dix quilles debout d'une piste voisine (toutes les voisines en un seul dessin) */
export function neighborPinsInstanced(keep: Keep, xs: number[], skin = "classiques"): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(pinGeometry(true), pinMaterial(skin), xs.length * RACK.length);
  const m = new THREE.Matrix4();
  let i = 0;
  for (const x of xs) {
    for (const p of RACK) {
      m.makeTranslation(x + p.x, PIN_COM, p.z);
      mesh.setMatrixAt(i++, m);
    }
  }
  keep({ dispose: () => mesh.dispose() });
  return mesh;
}

/** Une boîte posée (son pied à y) */
export function block(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, keep: Keep): THREE.Mesh {
  const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Une boîte aux arêtes arrondies (pied à y) */
export function roundBlock(
  w: number,
  h: number,
  d: number,
  r: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  keep: Keep,
): THREE.Mesh {
  const s = new THREE.Shape();
  const hw = w / 2,
    hh = h / 2;
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  const geo = keep(
    new THREE.ExtrudeGeometry(s, {
      depth: d - 2 * r,
      bevelEnabled: true,
      bevelSize: r,
      bevelThickness: r,
      bevelSegments: 3,
      curveSegments: 6,
    }),
  );
  geo.translate(0, 0, -(d - 2 * r) / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export const std = (
  keep: Keep,
  color: THREE.ColorRepresentation,
  roughness = 0.7,
  metalness = 0,
  extra: THREE.MeshStandardMaterialParameters = {},
) => keep(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));

export const phys = (keep: Keep, params: THREE.MeshPhysicalMaterialParameters) => keep(new THREE.MeshPhysicalMaterial(params));

/**
 * Une enseigne lumineuse : du texte qui brille sur un fond transparent (le halo de l'image fait le reste).
 * `font` : la police (une police cursive pour une enseigne au néon) ; la plaque fait `height` de haut.
 */
export function glowSign(text: string, color: string, font: string, height: number, keep: Keep): THREE.Mesh {
  const H = 256;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `${H * 0.62}px ${font}`;
  const W = Math.ceil(probe.measureText(text).width + H * 0.5);
  const t = canvasTex(W, H, (g) => {
    g.font = `${H * 0.62}px ${font}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    // Le halo coloré, puis le cœur presque blanc du tube
    g.shadowColor = color;
    g.shadowBlur = H * 0.12;
    g.lineWidth = H * 0.05;
    g.strokeStyle = color;
    g.strokeText(text, W / 2, H * 0.55);
    g.shadowBlur = 0;
    g.lineWidth = H * 0.018;
    g.strokeStyle = "#ffffff";
    g.strokeText(text, W / 2, H * 0.55);
  });
  const mat = keep(new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: new THREE.Color(1.8, 1.8, 1.8) }));
  return new THREE.Mesh(keep(new THREE.PlaneGeometry((height * W) / H, height)), mat);
}

/**
 * Le décor immobile fondu en quelques formes : toutes les pièces qui rendent pareil (même matière, au réglage près)
 * deviennent une seule forme, dessinée d'un seul appel. Les lumières, les sprites, les formes répétées et ce qui bouge
 * (marqué `userData.live`) restent tels quels. Rien de ce décor ne porte d'ombre (seuls les quilles, les boules et les
 * personnages en portent) ; il en reçoit.
 */
export function mergeStatic(root: THREE.Object3D, keep: Keep) {
  root.updateMatrixWorld(true);
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; receive: boolean; reflect: boolean }>();
  const remove: THREE.Mesh[] = [];
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material)) return;
    let live = false;
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.live) live = true;
    if (live) return;
    const mat = o.material as THREE.Material;
    const reflect = Boolean(o.userData.reflect);
    const key = `${reflect ? "r" : ""}${lookKey(mat) ?? mat.uuid}`;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    if (!g.getAttribute("uv"))
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const entry = groups.get(key) ?? { mat, geos: [], receive: false, reflect };
    entry.geos.push(g);
    entry.receive ||= o.receiveShadow;
    groups.set(key, entry);
    remove.push(o);
  });
  for (const m of remove) m.parent?.remove(m);
  for (const { mat, geos, receive, reflect } of groups.values()) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (!merged) continue;
    if (geos.length > 1) for (const g of geos) g.dispose();
    keep(merged);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = receive;
    mesh.castShadow = false;
    mesh.userData.reflect = reflect;
    root.add(mesh);
  }
}
