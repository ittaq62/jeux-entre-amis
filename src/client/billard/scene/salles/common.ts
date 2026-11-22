// Ce que toutes les salles du billard partagent : leur description (la table à leur style, la lumière, l'image), la
// lampe au-dessus de la table (trois abat-jour et leurs projecteurs, qui font les ombres douces sous les billes), et des
// outils pour bâtir un décor (des boîtes, des panneaux dessinés, des tubes de néon, le décor fondu en quelques formes).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { colorless, lookKey, paintVertices } from "../../../lib/sameLook.ts";
import type { TableStyle } from "../tableMesh.ts";

/** Une place autour de la table pour un joueur qui attend son tour (debout ou assis) */
export interface Spot {
  x: number;
  y: number;
  z: number;
  /** Vers où il regarde (angle autour de la verticale ; 0 : vers −z) */
  yaw: number;
  sit: boolean;
}

export interface Salle {
  /** La table à son style (le tapis vient de l'hôte) */
  table: Omit<TableStyle, "cloth">;
  /** Tout le décor autour de la table, la lampe comprise */
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
  /** Les projecteurs de la lampe (les ombres) */
  lamps: THREE.SpotLight[];
  /** L'arrivée dans la salle : la caméra part d'ici et vient vers la table */
  intro: { from: THREE.Vector3; look: THREE.Vector3 };
  /** Où se tiennent ceux qui attendent leur tour */
  spots: Spot[];
  /** Le son de la salle (voir sfx.ts) */
  ambience: string;
  /** Ce qui bouge dans la salle (le feu, la pluie, le paysage…) */
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

export const std = (
  keep: Keep,
  color: THREE.ColorRepresentation,
  roughness = 0.7,
  metalness = 0,
  extra: THREE.MeshStandardMaterialParameters = {},
) => keep(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));

export const phys = (keep: Keep, params: THREE.MeshPhysicalMaterialParameters) => keep(new THREE.MeshPhysicalMaterial(params));

export const glow = (keep: Keep, color: THREE.ColorRepresentation, k = 2) =>
  keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));

/** Une boîte posée (son pied à y) */
export function block(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, keep: Keep): THREE.Mesh {
  const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x, y + h / 2, z);
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
  r = Math.min(r, hw * 0.99, hh * 0.99, d * 0.49);
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
      depth: Math.max(0.001, d - 2 * r),
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
  m.receiveShadow = true;
  return m;
}

/** Un panneau peint (un tableau, une affiche, une fenêtre lumineuse) : un plan vertical tourné de `yaw` */
export function panel(w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, yaw: number, keep: Keep): THREE.Mesh {
  const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), mat);
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  return m;
}

/** Un tube de néon le long de ces points (il brille : le halo de l'image fait le reste) */
export function neon(points: THREE.Vector3[], color: THREE.ColorRepresentation, keep: Keep, radius = 0.014, closed = false): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  const geo = keep(new THREE.TubeGeometry(curve, Math.max(8, points.length * 10), radius, 8, closed));
  const mat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4) }));
  const m = new THREE.Mesh(geo, mat);
  m.userData.reflect = true;
  return m;
}

/** Une enseigne lumineuse : du texte qui brille sur un fond transparent */
export function glowSign(text: string, color: string, font: string, height: number, keep: Keep): THREE.Mesh {
  const H = 256;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `${H * 0.62}px ${font}`;
  const W = Math.ceil(probe.measureText(text).width + H * 0.5);
  const t = keep(
    canvasTex(W, H, (g) => {
      g.font = `${H * 0.62}px ${font}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = color;
      g.shadowBlur = H * 0.12;
      g.lineWidth = H * 0.05;
      g.strokeStyle = color;
      g.strokeText(text, W / 2, H * 0.55);
      g.shadowBlur = 0;
      g.lineWidth = H * 0.018;
      g.strokeStyle = "#ffffff";
      g.strokeText(text, W / 2, H * 0.55);
    }),
  );
  const mat = keep(new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: new THREE.Color(1.8, 1.8, 1.8) }));
  const m = new THREE.Mesh(keep(new THREE.PlaneGeometry((height * W) / H, height)), mat);
  m.userData.live = true;
  return m;
}

/** Un ciel : une grande sphère peinte d'un dégradé (du zénith à l'horizon, puis le sol au loin) */
export function skyDome(keep: Keep, stops: [number, string][], radius = 120): THREE.Mesh {
  const t = keep(
    canvasTex(8, 256, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 256);
      for (const [k, c] of stops) grd.addColorStop(k, c);
      g.fillStyle = grd;
      g.fillRect(0, 0, 8, 256);
    }),
  );
  const m = new THREE.Mesh(
    keep(new THREE.SphereGeometry(radius, 32, 24)),
    keep(new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false })),
  );
  m.renderOrder = -10;
  m.userData.live = true;
  return m;
}

/**
 * Le décor immobile fondu en quelques formes : toutes les pièces qui rendent pareil (même matière, au réglage près)
 * deviennent une seule forme, dessinée d'un seul appel. Les lumières, les formes répétées et ce qui bouge (marqué
 * `userData.live`) restent tels quels. Le décor ne porte pas d'ombre ; il en reçoit.
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
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.live) return;
    const mat = o.material as THREE.Material;
    const reflect = Boolean(o.userData.reflect);
    const key = `${reflect ? "r" : ""}${lookKey(mat) ?? mat.uuid}`;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
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

// ---------------------------------------------------------------------------
// La lampe
// ---------------------------------------------------------------------------

export type LampKind = "vert" | "metal" | "laiton" | "verre" | "rotin" | "tiffany";

export interface LampOptions {
  kind: LampKind;
  /** La hauteur des abat-jour au-dessus du tapis */
  height?: number;
  /** La couleur de la lumière, sa force */
  color?: THREE.ColorRepresentation;
  intensity?: number;
  /** Où elle est accrochée (le plafond) */
  ceiling?: number;
  /** Une seule ombre (téléphone) */
  touch?: boolean;
}

/**
 * La lampe du billard : une barre, trois abat-jour au-dessus de la table, une ampoule dans chacun et son projecteur qui
 * tombe droit sur le tapis (son ombre douce). Renvoie le groupe et les projecteurs.
 */
export function poolLamp(keep: Keep, o: LampOptions): { group: THREE.Group; lamps: THREE.SpotLight[] } {
  const g = new THREE.Group();
  g.name = "lampe";
  const h = o.height ?? 0.95;
  const ceiling = o.ceiling ?? 2.4;
  const color = new THREE.Color(o.color ?? "#ffe2b8");
  const lamps: THREE.SpotLight[] = [];
  const shadeMat = (() => {
    switch (o.kind) {
      case "vert":
        return phys(keep, { color: "#0f5a32", roughness: 0.2, clearcoat: 1, transmission: 0, side: THREE.DoubleSide });
      case "metal":
        return std(keep, "#20262a", 0.45, 0.6, { side: THREE.DoubleSide });
      case "laiton":
        return std(keep, "#b8913c", 0.3, 1, { side: THREE.DoubleSide });
      case "verre":
        return phys(keep, { color: "#dfe9ee", roughness: 0.1, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
      case "rotin":
        return std(keep, "#b08a52", 0.85, 0, { side: THREE.DoubleSide });
      default:
        return phys(keep, { color: "#9a5a20", roughness: 0.25, clearcoat: 1, side: THREE.DoubleSide });
    }
  })();
  const innerMat = std(keep, o.kind === "metal" ? "#f2f0ea" : "#fff4dc", 0.6, 0, {
    side: THREE.BackSide,
    emissive: color.clone().multiplyScalar(0.18),
  });
  const brass = std(keep, o.kind === "metal" ? "#30363a" : "#b8913c", 0.3, 1);
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6) }));
  // La barre et ses deux tiges vers le plafond
  const bar = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012, 0.012, 1.9, 10)), brass);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = h + 0.17;
  g.add(bar);
  for (const x of [-0.75, 0.75]) {
    const rod = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004, 0.004, ceiling - h - 0.17, 6)), brass);
    rod.position.set(x, h + 0.17 + (ceiling - h - 0.17) / 2, 0);
    g.add(rod);
  }
  // Les abat-jour
  const shadeGeo = (() => {
    if (o.kind === "vert" || o.kind === "tiffany" || o.kind === "verre") {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * (Math.PI / 2);
        pts.push(new THREE.Vector2(0.03 + Math.sin(a) * 0.2, 0.17 - (1 - Math.cos(a)) * 0.14 - (i / 12) * 0.02));
      }
      pts.push(new THREE.Vector2(0.235, 0.01));
      return keep(new THREE.LatheGeometry(pts.reverse(), 32));
    }
    if (o.kind === "rotin") return keep(new THREE.CylinderGeometry(0.11, 0.24, 0.2, 24, 1, true));
    // Métal, laiton : un cône évasé
    return keep(new THREE.CylinderGeometry(0.06, 0.24, 0.17, 28, 1, true));
  })();
  const xs = [-0.66, 0, 0.66];
  xs.forEach((x, i) => {
    const shade = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.set(x, h + (o.kind === "vert" || o.kind === "tiffany" || o.kind === "verre" ? 0 : 0.085), 0);
    shade.userData.reflect = true;
    g.add(shade);
    const inner = new THREE.Mesh(shadeGeo, innerMat);
    inner.position.copy(shade.position);
    inner.scale.setScalar(0.985);
    g.add(inner);
    const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8)), brass);
    stem.position.set(x, h + 0.2, 0);
    g.add(stem);
    const bulb = new THREE.Mesh(keep(new THREE.SphereGeometry(0.035, 16, 12)), bulbMat);
    bulb.position.set(x, h + 0.06, 0);
    bulb.userData.reflect = true;
    g.add(bulb);
    const spot = new THREE.SpotLight(color, o.intensity ?? 4.5, 3.2, 1.05, 0.75, 1.4);
    spot.position.set(x, h + 0.05, 0);
    spot.target.position.set(x * 1.12, 0, 0);
    const shadows = o.touch ? i === 1 : true;
    spot.castShadow = shadows;
    if (shadows) {
      spot.shadow.mapSize.set(o.touch ? 1024 : 1024, o.touch ? 1024 : 1024);
      spot.shadow.camera.near = 0.3;
      spot.shadow.camera.far = 2.2;
      spot.shadow.bias = -0.0004;
      spot.shadow.normalBias = 0.012;
      spot.shadow.radius = 6;
      spot.shadow.blurSamples = 12;
    }
    g.add(spot, spot.target);
    lamps.push(spot);
  });
  return { group: g, lamps };
}
