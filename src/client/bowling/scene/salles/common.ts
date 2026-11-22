// Ce que toutes les salles partagent : leur description (la piste à leurs couleurs, la lumière, l'image), et des outils
// pour bâtir un décor (des tubes de néon qui brillent, des panneaux dessinés, des quilles sur les pistes voisines).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RACK } from "../../../../shared/games/bowling/lane.ts";
import { colorless, lookKey, paintVertices } from "../../../lib/sameLook.ts";
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
  const groups = new Map<
    string,
    { mat: THREE.Material; geos: THREE.BufferGeometry[]; colors: (THREE.Color | null)[]; receive: boolean; reflect: boolean }
  >();
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
    const entry = groups.get(key) ?? { mat, geos: [], colors: [], receive: false, reflect };
    entry.geos.push(g);
    entry.colors.push((mat as THREE.MeshStandardMaterial).color ?? null);
    entry.receive ||= o.receiveShadow;
    groups.set(key, entry);
    remove.push(o);
  });
  for (const m of remove) m.parent?.remove(m);
  for (const entry of groups.values()) {
    const { geos, colors, receive, reflect } = entry;
    let mat = entry.mat;
    // Des matières qui ne diffèrent que par leur couleur : la couleur de chacune passe dans ses sommets
    const first = colors[0];
    if (first && colors.some((c) => c && !c.equals(first))) {
      geos.forEach((g, i) => paintVertices(g, colors[i] ?? first));
      mat = keep(colorless(mat as THREE.MeshStandardMaterial));
    }
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

/**
 * Une banquette en arc face aux pistes (le siège, le dossier, des boutons de capitonnage), centrée en (0, cz), de rayon
 * R ; renvoie les places assises, de gauche à droite.
 */
export function arcBench(root: THREE.Object3D, keep: Keep, mat: THREE.Material, cz: number, R = 1.55, tufts?: THREE.Material): BenchSpot[] {
  const arcShape = (r0: number, r1: number, a0: number, a1: number) => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r1, a0, a1, false);
    s.absarc(0, 0, r0, a1, a0, true);
    return s;
  };
  const a0 = Math.PI * 1.12,
    a1 = Math.PI * 1.88;
  const ext = (r0: number, r1: number, depth: number, bevel: number) =>
    keep(
      new THREE.ExtrudeGeometry(arcShape(r0, r1, a0, a1), {
        depth,
        bevelEnabled: true,
        bevelSize: bevel,
        bevelThickness: bevel,
        bevelSegments: 2,
        curveSegments: 40,
      }),
    );
  for (const [g, y] of [
    [ext(R - 0.32, R + 0.22, 0.42, 0.03), 0],
    [ext(R + 0.22, R + 0.42, 0.95, 0.05), 0],
  ] as const) {
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y, cz);
    m.receiveShadow = true;
    root.add(m);
  }
  if (tufts) {
    const tuft = keep(new THREE.SphereGeometry(0.018, 8, 6));
    for (let k = 0; k < 14; k++) {
      const a = a0 + ((k + 0.5) / 14) * (a1 - a0);
      for (const y of [0.62, 0.84]) {
        const t = new THREE.Mesh(tuft, tufts);
        t.position.set(Math.cos(a) * (R + 0.2), y, cz - Math.sin(a) * (R + 0.2));
        root.add(t);
      }
    }
  }
  const spots: BenchSpot[] = [];
  for (let k = 0; k < 8; k++) {
    const a = a0 + ((k + 0.5) / 8) * (a1 - a0);
    spots.push({ x: Math.cos(a) * R, y: 0.45, z: cz - Math.sin(a) * R, yaw: Math.atan2(-Math.cos(a), Math.sin(a)) + Math.PI });
  }
  return spots;
}

/** Un banc droit (bois ou pierre), face aux pistes, en (0, z) ; ses huit places */
export function straightBench(root: THREE.Object3D, keep: Keep, mat: THREE.Material, z: number, width = 4.2, back = true): BenchSpot[] {
  root.add(roundBlock(width, 0.08, 0.5, 0.03, mat, 0, 0.38, z, keep));
  for (const x of [-width / 2 + 0.25, 0, width / 2 - 0.25]) root.add(block(0.12, 0.38, 0.42, mat, x, 0, z, keep));
  if (back) root.add(roundBlock(width, 0.5, 0.08, 0.03, mat, 0, 0.5, z + 0.24, keep));
  return Array.from({ length: 8 }, (_, k) => ({ x: -width / 2 + 0.3 + (k * (width - 0.6)) / 7, y: 0.45, z: z - 0.02, yaw: Math.PI }));
}

/** Un retour de boules entre deux pistes, avec ses boules de couleur */
export function ballReturn(root: THREE.Object3D, keep: Keep, x: number, hood: THREE.Material, rail: THREE.Material, seed = 0) {
  root.add(roundBlock(0.42, 0.42, 1.6, 0.12, hood, x, 0.0, 2.6, keep));
  root.add(roundBlock(0.46, 0.05, 1.7, 0.02, rail, x, 0.42, 2.6, keep));
  const cols = [0x1d3c8f, 0xee7a1e, 0x6b3cc9, 0x1f7a4a, 0xc8263a, 0x1fb5b0, 0xf2c12e];
  const geo = keep(new THREE.SphereGeometry(0.1085, 24, 16));
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(geo, phys(keep, { color: cols[(k + seed) % cols.length]!, roughness: 0.15, clearcoat: 1 }));
    b.position.set(x + (k % 2 ? 0.11 : -0.11), 0.55, 3.15 - Math.floor(k / 2) * 0.24 + (k % 2) * 0.05);
    root.add(b);
  }
}

/** Un ciel : une grande sphère peinte d'un dégradé (du zénith à l'horizon, puis le sol au loin) */
export function skyDome(keep: Keep, stops: [number, string][], radius = 180): THREE.Mesh {
  const t = canvasTex(8, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    for (const [k, c] of stops) grd.addColorStop(k, c);
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 256);
  });
  const m = new THREE.Mesh(
    keep(new THREE.SphereGeometry(radius, 32, 24)),
    keep(new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false })),
  );
  m.renderOrder = -10;
  return m;
}

/** Une guirlande de lampions entre deux points : un fil qui pend, et des boules de couleur qui luisent */
export function lampions(a: THREE.Vector3, b: THREE.Vector3, sag: number, colors: number[], keep: Keep, n = 14): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    pts.push(new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0)));
  }
  const wire = new THREE.Mesh(
    keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.006, 4)),
    keep(new THREE.MeshBasicMaterial({ color: 0x222222 })),
  );
  g.add(wire);
  const geo = keep(new THREE.SphereGeometry(0.09, 14, 10));
  const mats = colors.map((c) => keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.9) })));
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u) - 0.1, 0));
    const m = new THREE.Mesh(geo, mats[i % mats.length]!);
    m.position.copy(p);
    m.scale.set(1, 1.25, 1);
    g.add(m);
  }
  return g;
}
