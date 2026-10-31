import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GroupId } from "../../../shared/games/capitale/board.ts";
import { facadeTexture, mix, signTexture, type FacadeLook } from "./textures.ts";

// Les bâtiments de la ville, en petits volumes de jouet. Repère local : le sol au centre de l'emprise, la façade vers +z.

const BAY = 0.12;
const STOREY = 0.17;

const matCache = new Map<string, THREE.Material>();

/** Une matière colorée, partagée */
export function mat(color: string, opts: { rough?: number; metal?: number; flat?: boolean; emissive?: string; opacity?: number } = {}) {
  const key = `${color}|${opts.rough ?? 0.8}|${opts.metal ?? 0}|${opts.flat ? 1 : 0}|${opts.emissive ?? ""}|${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.8,
      metalness: opts.metal ?? 0,
      flatShading: opts.flat ?? false,
      emissive: opts.emissive ?? "#000000",
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

const wallCache = new Map<string, THREE.Material>();
function wallMat(look: FacadeLook) {
  const key = JSON.stringify(look);
  let m = wallCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: facadeTexture(look),
      roughness: look.curtain ? 0.35 : 0.85,
      metalness: look.curtain ? 0.25 : 0,
    });
    wallCache.set(key, m);
  }
  return m;
}

function shadowed<T extends THREE.Object3D>(o: T, receive = true, cast = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

/** Une tranche d'une géométrie sans index (un groupe de matière) */
function slice(geo: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const a = attr as THREE.BufferAttribute;
    out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  return out;
}

/**
 * Fond tous les morceaux d'un objet en un maillage par matière : beaucoup moins de dessins à chaque image.
 * Ce qui bouge seul (marqué userData.keep) et les instances restent à part, à la même place.
 */
export function bake(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }>();
  const kept: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o !== root && (o.userData.keep || (o as THREE.InstancedMesh).isInstancedMesh)) {
      kept.push(o);
      return;
    }
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const matrix = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(matrix);
      for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const parts: [THREE.BufferGeometry, THREE.Material][] =
        Array.isArray(m.material) && geo.groups.length > 0
          ? geo.groups.map((g) => [slice(geo, g.start, g.count), mats[g.materialIndex ?? 0]!])
          : [[geo, mats[0]!]];
      for (const [g, mat] of parts) {
        const key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}`;
        let b = buckets.get(key);
        if (!b) {
          b = { mat, cast: m.castShadow, receive: m.receiveShadow, geos: [] };
          buckets.set(key, b);
        }
        b.geos.push(g);
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  const out = new THREE.Group();
  out.userData = { ...root.userData };
  out.name = root.name;
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    out.add(mesh);
  }
  for (const k of kept) {
    const matrix = new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld);
    k.parent?.remove(k);
    matrix.decompose(k.position, k.quaternion, k.scale);
    out.add(k);
  }
  return out;
}

/** Un bloc de façade : les fenêtres se répètent selon sa taille (une par travée et par étage) */
export function facadeBox(w: number, h: number, d: number, look: FacadeLook, top: THREE.Material): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const rows = Math.max(1, Math.round(h / STOREY));
  for (let f = 0; f < 6; f++) {
    if (f === 2 || f === 3) continue;
    const span = f < 2 ? d : w;
    const cols = Math.max(1, Math.round(span / BAY));
    for (let v = 0; v < 4; v++) {
      const n = f * 4 + v;
      uv.setXY(n, uv.getX(n) * cols, uv.getY(n) * rows);
    }
  }
  const wall = wallMat(look);
  return new THREE.Mesh(geo, [wall, wall, top, top, wall, wall]);
}

/** Un toit à deux pans, le faîtage parallèle à la façade */
function gableRoof(w: number, d: number, h: number, color: string, overhang = 0.03): THREE.Mesh {
  const shape = new THREE.Shape();
  const half = d / 2 + overhang;
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + 2 * overhang, bevelEnabled: false });
  geo.translate(0, 0, -(w + 2 * overhang) / 2);
  geo.rotateY(Math.PI / 2);
  return new THREE.Mesh(geo, mat(color, { flat: true, rough: 0.9 }));
}

/** Un toit à quatre pans */
function hipRoof(w: number, d: number, h: number, color: string): THREE.Mesh {
  const geo = new THREE.ConeGeometry(1, h, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.scale((w / 2 + 0.03) / Math.SQRT1_2, 1, (d / 2 + 0.03) / Math.SQRT1_2);
  geo.translate(0, h / 2, 0);
  return new THREE.Mesh(geo, mat(color, { flat: true, rough: 0.9 }));
}

/** Un toit mansardé (zinc) : un tronc de pyramide */
function mansardRoof(w: number, d: number, h: number, color: string): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.62, 1, h, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.scale((w / 2 + 0.015) / Math.SQRT1_2, 1, (d / 2 + 0.015) / Math.SQRT1_2);
  geo.translate(0, h / 2, 0);
  return new THREE.Mesh(geo, mat(color, { flat: true, rough: 0.55, metal: 0.25 }));
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y + h / 2, z);
  return new THREE.Mesh(geo, m);
}

function cyl(rTop: number, rBottom: number, h: number, m: THREE.Material, seg = 10, x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
  geo.translate(x, y + h / 2, z);
  return new THREE.Mesh(geo, m);
}

// ---------------------------------------------------------------------------
// Les styles des quartiers : de la pierre des villages aux tours de verre
// ---------------------------------------------------------------------------

type RoofKind = "gable" | "steep" | "hip" | "mansard" | "flat";

interface Style {
  look: FacadeLook;
  roof: string;
  roofKind: RoofKind;
  tower: FacadeLook;
  towerHeight: number;
  crown: "pyramid" | "stepped" | "deco" | "glass" | "spire";
  /** Les étages un peu plus hauts dans les quartiers chers */
  scale: number;
}

export const STYLES: Record<GroupId, Style> = {
  // Guéret, Aurillac : maisons de pierre, tuiles brunes
  brun: {
    look: { wall: "#ddd0b5", shutters: "#7b5a3a", narrow: true },
    roof: "#7a4a31",
    roofKind: "gable",
    tower: { wall: "#d6c7a8", glass: "#55697a", frame: "#efe6d2" },
    towerHeight: 1.0,
    crown: "pyramid",
    scale: 0.92,
  },
  // Mende, Vesoul, Foix : chalets de bois, ardoise
  ciel: {
    look: { wall: "#c8935f", shutters: "#f1ebdf", frame: "#f6efe1", narrow: true },
    roof: "#56606c",
    roofKind: "steep",
    tower: { wall: "#c99a6a", glass: "#6f97b4", frame: "#f6efe1" },
    towerHeight: 1.1,
    crown: "pyramid",
    scale: 0.95,
  },
  // Périgueux, Auxerre, Chartres : colombages
  rose: {
    look: { wall: "#f2e5cc", timber: "#6a4831", frame: "#f6efe1" },
    roof: "#a8472f",
    roofKind: "steep",
    tower: { wall: "#efdcc4", glass: "#4f6c86", frame: "#6a4831" },
    towerHeight: 1.2,
    crown: "stepped",
    scale: 1,
  },
  // Limoges, Brest, Poitiers : granit et volets bleus
  orange: {
    look: { wall: "#bfb8aa", shutters: "#3e6f9f", frame: "#f1eee8" },
    roof: "#48525e",
    roofKind: "gable",
    tower: { wall: "#c5beb1", glass: "#4f6f8c", frame: "#eeeae2" },
    towerHeight: 1.32,
    crown: "stepped",
    scale: 1,
  },
  // Clermont, Dijon, Rennes : la brique
  rouge: {
    look: { wall: "#b5553e", brick: true, frame: "#efe6d6" },
    roof: "#3c3c42",
    roofKind: "hip",
    tower: { wall: "#a94d39", brick: true, glass: "#3f5f7d", frame: "#efe6d6" },
    towerHeight: 1.45,
    crown: "stepped",
    scale: 1.04,
  },
  // Montpellier, Strasbourg, Toulouse : le Midi, ocre et tuiles rondes
  jaune: {
    look: { wall: "#e9bd74", shutters: "#4b8a8d", frame: "#f7efe0" },
    roof: "#c5653b",
    roofKind: "hip",
    tower: { wall: "#e7a98a", glass: "#4e7591", frame: "#f7efe0" },
    towerHeight: 1.6,
    crown: "deco",
    scale: 1.05,
  },
  // Nantes, Lille, Bordeaux : la pierre de taille, balcons et zinc
  vert: {
    look: { wall: "#efe3c7", balcony: true, frame: "#f9f4ea", glass: "#4a6276" },
    roof: "#76818d",
    roofKind: "mansard",
    tower: { wall: "#e8dcc0", balcony: true, glass: "#41607a", frame: "#f9f4ea" },
    towerHeight: 1.78,
    crown: "deco",
    scale: 1.1,
  },
  // Lyon, Paris : verre et acier
  bleu: {
    look: { wall: "#dfe6ec", curtain: true, glass: "#5b8fc2", frame: "#e9eef2" },
    roof: "#8e98a2",
    roofKind: "flat",
    tower: { wall: "#cfdbe6", curtain: true, glass: "#4f86c0", frame: "#dbe4ec" },
    towerHeight: 2.1,
    crown: "glass",
    scale: 1.15,
  },
};

function roofFor(style: Style, w: number, d: number, h: number): THREE.Object3D | null {
  switch (style.roofKind) {
    case "gable":
      return gableRoof(w, d, h, style.roof);
    case "steep":
      return gableRoof(w, d, h * 1.35, style.roof, 0.05);
    case "hip":
      return hipRoof(w, d, h * 0.8, style.roof);
    case "mansard":
      return mansardRoof(w, d, h, style.roof);
    default: {
      // Toit plat : un rebord et quelques machines
      const g = new THREE.Group();
      g.add(box(w, 0.025, d, mat(style.roof, { rough: 0.7 })));
      g.add(box(w * 0.3, 0.05, d * 0.25, mat("#b9c1c8", { rough: 0.5, metal: 0.4 }), -w * 0.18, 0.025, d * 0.12));
      g.add(cyl(0.035, 0.035, 0.06, mat("#9aa4ad", { metal: 0.5, rough: 0.4 }), 8, w * 0.22, 0.025, -d * 0.15));
      return g;
    }
  }
}

// ---------------------------------------------------------------------------
// Les bâtiments des parcelles : chacun tient sur une case (environ 0,55 × 0,5), façade vers +z
// ---------------------------------------------------------------------------

/** Un bâtiment d'habitation dans le style du quartier : une porte à la couleur du propriétaire */
function dwelling(group: GroupId, accent: string, w: number, d: number, storeys: number, roofH: number, chimney: boolean): THREE.Group {
  const style = STYLES[group];
  const h = storeys * STOREY * style.scale;
  const g = new THREE.Group();
  const top = mat(style.roof, { rough: 0.8 });
  g.add(facadeBox(w, h, d, style.look, top));
  // Un soubassement plus sombre, une porte et un auvent à la couleur du propriétaire
  g.add(box(w + 0.008, 0.035, d + 0.008, mat(mix(style.look.wall, "#000000", 0.25))));
  g.add(box(0.07, 0.11, 0.012, mat(accent, { rough: 0.5 }), 0, 0, d / 2 + 0.004));
  g.add(box(0.11, 0.012, 0.04, mat(accent, { rough: 0.5 }), 0, 0.12, d / 2 + 0.02));
  const roof = roofFor(style, w, d, roofH);
  if (roof) {
    roof.position.y = h;
    g.add(roof);
  }
  if (chimney && style.roofKind !== "flat") {
    g.add(box(0.045, 0.12, 0.045, mat(mix(style.look.wall, "#000000", 0.2)), w * 0.28, h + roofH * 0.3, -d * 0.12));
  }
  if (style.roofKind === "flat") {
    g.add(box(w * 0.6, 0.014, 0.03, mat(accent, { rough: 0.4, emissive: mix(accent, "#000000", 0.6) }), 0, h * 0.94, d / 2 + 0.006));
  }
  return g;
}

/** La maison : deux niveaux, un jardinet devant */
export function maison(group: GroupId, accent: string): THREE.Group {
  const g = dwelling(group, accent, 0.36, 0.3, 2, 0.15, true);
  g.position.z = -0.05;
  const root = new THREE.Group();
  root.add(g);
  root.add(box(0.4, 0.04, 0.03, mat("#6f9a4c", { rough: 1 }), 0, 0, 0.17));
  return bake(shadowed(root));
}

/** L'immeuble : cinq niveaux, plus large, le toit du quartier */
export function immeuble(group: GroupId, accent: string): THREE.Group {
  return bake(shadowed(dwelling(group, accent, 0.44, 0.4, 4, 0.15, false)));
}

/** Le gratte-ciel : une tour sur un socle, plus haute dans les quartiers chers */
export function gratteCiel(group: GroupId, accent: string, paris: boolean): THREE.Group {
  const style = STYLES[group];
  const g = new THREE.Group();
  const H = style.towerHeight * (paris ? 1.12 : 1) * 0.78;
  const top = mat(mix(style.tower.wall, "#000000", 0.15), { rough: 0.7 });
  const base = 0.14;
  g.add(facadeBox(0.48, base, 0.44, { ...style.tower, wall: mix(style.tower.wall, "#000000", 0.08) }, top));
  g.add(box(0.5, 0.02, 0.46, mat(accent, { rough: 0.45 }), 0, base, 0));
  const W = 0.36;
  if (style.crown === "stepped" || style.crown === "deco") {
    // Une tour en gradins
    const h1 = H * 0.55;
    const h2 = H * 0.28;
    const h3 = H * 0.17;
    const t1 = facadeBox(W, h1, W, style.tower, top);
    t1.position.y = base;
    const t2 = facadeBox(W * 0.8, h2, W * 0.8, style.tower, top);
    t2.position.y = base + h1;
    const t3 = facadeBox(W * 0.58, h3, W * 0.58, style.tower, top);
    t3.position.y = base + h1 + h2;
    g.add(t1, t2, t3);
    if (style.crown === "deco") g.add(cyl(0.012, 0.03, 0.3, mat("#d8c58a", { metal: 0.7, rough: 0.3 }), 8, 0, base + H, 0));
    g.add(box(W * 0.6, 0.02, W * 0.6, mat(accent, { emissive: mix(accent, "#000000", 0.4) }), 0, base + H - 0.04, 0));
  } else if (style.crown === "pyramid") {
    const t = facadeBox(W, H, W, style.tower, top);
    t.position.y = base;
    g.add(t);
    const roof = hipRoof(W, W, 0.28, style.roof);
    roof.position.y = base + H;
    g.add(roof);
    g.add(box(W + 0.02, 0.03, W + 0.02, mat(accent), 0, base + H - 0.03, 0));
  } else {
    // Du verre : une tour aux angles coupés, une antenne (et une flèche pour Paris)
    const geo = new THREE.CylinderGeometry(W * 0.62, W * 0.7, H, 8, 1);
    geo.translate(0, H / 2, 0);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n) * 14, uv.getY(n) * Math.round(H / STOREY));
    const glass = new THREE.Mesh(geo, [wallMat(style.tower), top, top]);
    glass.position.y = base;
    g.add(glass);
    g.add(cyl(W * 0.5, W * 0.62, 0.1, mat("#c9d3dc", { metal: 0.6, rough: 0.3 }), 8, 0, base + H, 0));
    g.add(cyl(0.008, 0.016, paris ? 0.7 : 0.35, mat("#e8ecef", { metal: 0.8, rough: 0.2 }), 6, 0, base + 0.1 + H, 0));
    g.add(box(W * 1.1, 0.02, 0.02, mat(accent, { emissive: mix(accent, "#000000", 0.3) }), 0, base + H * 0.5, W * 0.6));
  }
  return bake(shadowed(g));
}

/** Le monument : un obélisque sur un socle à gradins, la pointe dorée, un ruban à la couleur du propriétaire */
export function monument(accent: string): THREE.Group {
  const g = new THREE.Group();
  const stone = mat("#e9e1cf", { rough: 0.7 });
  g.add(box(0.42, 0.05, 0.42, mat("#d2c6ad")));
  g.add(box(0.32, 0.06, 0.32, stone, 0, 0.05));
  g.add(box(0.24, 0.05, 0.24, stone, 0, 0.11));
  g.add(box(0.245, 0.03, 0.245, mat(accent, { rough: 0.45 }), 0, 0.16));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 0.62, 4), stone);
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = 0.19 + 0.31;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), mat("#d8b24a", { metal: 0.75, rough: 0.3 }));
  tip.rotation.y = Math.PI / 4;
  tip.position.y = 0.19 + 0.62 + 0.05;
  g.add(tip);
  for (const [x, z] of [
    [-0.17, 0.17],
    [0.17, 0.17],
  ] as const) {
    g.add(cyl(0.006, 0.006, 0.22, mat("#8a8f94", { metal: 0.6 }), 6, x, 0.05, z));
    g.add(box(0.05, 0.035, 0.004, mat(accent), x + 0.026, 0.22, z));
  }
  return bake(shadowed(g));
}

/** Le parc : une pelouse, trois arbres, une fontaine et un banc */
export function parc(): { group: THREE.Group; jet: THREE.Mesh } {
  const g = new THREE.Group();
  g.add(box(0.5, 0.025, 0.45, mat("#86b85f", { rough: 1 })));
  g.add(box(0.07, 0.027, 0.45, mat("#e4d7b5", { rough: 1 })));
  const leaves = ["#5f9a45", "#4f8a3d", "#6eaa4c"];
  for (const [x, z, s, k] of [
    [-0.15, -0.12, 1.15, 0],
    [0.16, -0.13, 1, 1],
    [-0.16, 0.13, 0.9, 2],
  ] as const) {
    g.add(cyl(0.02, 0.028, 0.14 * s, mat("#7a5a3c"), 6, x, 0.02, z));
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 * s, 0), mat(leaves[k]!, { flat: true, rough: 0.9 }));
    crown.position.set(x, 0.02 + 0.2 * s, z);
    g.add(crown);
  }
  g.add(cyl(0.08, 0.085, 0.04, mat("#d6ccb6"), 16, 0.13, 0.02, 0.12));
  g.add(cyl(0.068, 0.068, 0.01, mat("#58a6d6", { rough: 0.1, metal: 0.3 }), 16, 0.13, 0.055, 0.12));
  const b = bench();
  b.position.set(0, 0.025, 0.17);
  g.add(b);
  const jet = cyl(
    0.01,
    0.022,
    0.13,
    new THREE.MeshStandardMaterial({ color: "#bfe3f7", transparent: true, opacity: 0.75, roughness: 0.1 }),
  );
  jet.position.set(0.13, 0.06, 0.12);
  shadowed(g);
  jet.castShadow = false;
  jet.userData.keep = true;
  g.add(jet);
  return { group: bake(g), jet };
}

/** Le stade : une pelouse dans un anneau de tribunes, quatre pylônes d'éclairage */
export function stade(accent: string): THREE.Group {
  const g = new THREE.Group();
  const ring = (rx: number, rz: number, h: number, inset: number, color: string) => {
    const outer = new THREE.Shape();
    outer.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, rx - inset, rz - inset, 0, Math.PI * 2, true, 0);
    outer.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(outer, { depth: h, bevelEnabled: false, curveSegments: 28 });
    geo.rotateX(-Math.PI / 2);
    return new THREE.Mesh(geo, mat(color, { rough: 0.7 }));
  };
  g.add(ring(0.25, 0.22, 0.07, 0.06, "#d9d4c8"));
  const upper = ring(0.25, 0.22, 0.05, 0.035, accent);
  upper.position.y = 0.07;
  g.add(upper);
  const field = new THREE.Mesh(new THREE.CircleGeometry(1, 28), mat("#5ea347", { rough: 1 }));
  field.rotation.x = -Math.PI / 2;
  field.scale.set(0.19, 0.16, 1);
  field.position.y = 0.012;
  g.add(field);
  g.add(box(0.005, 0.002, 0.3, mat("#f4f4ee"), 0, 0.013, 0));
  for (const [x, z] of [
    [-0.22, -0.18],
    [0.22, -0.18],
    [-0.22, 0.18],
    [0.22, 0.18],
  ] as const) {
    g.add(cyl(0.006, 0.008, 0.3, mat("#9aa1a8", { metal: 0.6, rough: 0.35 }), 6, x, 0, z));
    g.add(box(0.05, 0.03, 0.012, mat("#fff8dc", { emissive: "#fff2c0" }), x, 0.3, z));
  }
  return bake(shadowed(g));
}

/** La décharge : des tas d'ordures, une benne, une palissade ; des mouettes tournent au-dessus */
export function decharge(): { group: THREE.Group; birds: THREE.Group } {
  const g = new THREE.Group();
  g.add(box(0.5, 0.012, 0.45, mat("#8b7d62", { rough: 1 })));
  const heaps: [number, number, number, string][] = [
    [-0.1, -0.06, 0.15, "#6f6656"],
    [0.1, 0.02, 0.12, "#857a63"],
    [-0.02, 0.12, 0.1, "#5f5a4f"],
  ];
  for (const [x, z, r, c] of heaps) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(c, { flat: true, rough: 1 }));
    m.scale.y = 0.55;
    m.position.set(x, 0.02, z);
    g.add(m);
  }
  const bits = ["#d6433a", "#2f6fb8", "#e8b12f", "#f2f2ee", "#2fa864"];
  for (let k = 0; k < 9; k++)
    g.add(box(0.03, 0.02, 0.025, mat(bits[k % bits.length]!), -0.16 + (k % 5) * 0.08, 0.05 + (k % 3) * 0.02, -0.1 + (k % 4) * 0.07));
  g.add(box(0.14, 0.07, 0.08, mat("#3f7d4e", { rough: 0.6, metal: 0.3 }), 0.16, 0, -0.15));
  const fenceM = mat("#9aa1a8", { metal: 0.5, rough: 0.5 });
  g.add(box(0.5, 0.06, 0.008, fenceM, 0, 0, 0.22), box(0.008, 0.06, 0.45, fenceM, -0.25, 0, 0), box(0.008, 0.06, 0.45, fenceM, 0.25, 0, 0));
  shadowed(g);
  const birds = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const bird = new THREE.Group();
    const wing = mat("#f4f4f0");
    const left = box(0.05, 0.004, 0.018, wing, -0.024, 0, 0);
    left.rotation.z = 0.35;
    const right = box(0.05, 0.004, 0.018, wing, 0.024, 0, 0);
    right.rotation.z = -0.35;
    bird.add(left, right);
    const a = (k * Math.PI * 2) / 3;
    bird.position.set(Math.cos(a) * 0.16, 0.42 + k * 0.05, Math.sin(a) * 0.16);
    bird.rotation.y = -a;
    birds.add(bird);
  }
  birds.userData.keep = true;
  g.add(birds);
  return { group: bake(g), birds };
}

/** La centrale : deux tours de refroidissement, la salle des machines, une cheminée rayée ; de la vapeur sort des tours */
export function centrale(): { group: THREE.Group; steam: THREE.Group } {
  const g = new THREE.Group();
  g.add(box(0.5, 0.012, 0.45, mat("#a7a194", { rough: 1 })));
  const pts = [
    [0.12, 0],
    [0.1, 0.08],
    [0.075, 0.2],
    [0.08, 0.26],
    [0.09, 0.3],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const towerGeo = new THREE.LatheGeometry(pts, 20);
  const concrete = mat("#d8d4ca", { rough: 0.85 });
  (concrete as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  for (const x of [-0.12, 0.12]) {
    const t = new THREE.Mesh(towerGeo, concrete);
    t.position.set(x, 0.012, -0.08);
    g.add(t);
  }
  g.add(box(0.3, 0.12, 0.12, mat("#c4bcae"), 0, 0.012, 0.13));
  g.add(box(0.3, 0.015, 0.12, mat("#6a6f75"), 0, 0.132, 0.13));
  for (let k = 0; k < 5; k++) g.add(cyl(0.022, 0.024, 0.07, mat(k % 2 ? "#f4f4ee" : "#d0352c"), 10, 0.19, 0.012 + k * 0.07, 0.15));
  shadowed(g);
  const steam = new THREE.Group();
  const puff = new THREE.MeshStandardMaterial({ color: "#f4f6f8", transparent: true, opacity: 0.8, roughness: 1, depthWrite: false });
  for (const x of [-0.12, 0.12]) {
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), puff);
      p.position.set(x, 0.34, -0.08);
      p.userData.phase = k / 3;
      p.userData.x = x;
      steam.add(p);
    }
  }
  steam.userData.keep = true;
  g.add(steam);
  return { group: bake(g), steam };
}

// ---------------------------------------------------------------------------
// Les lieux : gares, banque, barrage, éoliennes, impôts, péage, parc
// ---------------------------------------------------------------------------

const STONE = "#e7dcc4";

/** La gare : le bâtiment voyageurs côté place, la verrière, un TGV à quai. Repère : u le long de la bande (x), la place vers +z. */
export function station(livery: string): THREE.Group {
  const g = new THREE.Group();
  const top = mat("#8d8478");
  const hall = facadeBox(0.86, 0.28, 0.26, { wall: STONE, glass: "#4d6a80", frame: "#f6f0e2" }, top);
  hall.position.set(0, 0, 0.28);
  g.add(hall);
  // La verrière en demi-cylindre au-dessus des voies
  const vault = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.27, 0.92, 16, 1, true, 0, Math.PI),
    new THREE.MeshStandardMaterial({
      color: "#a9c9df",
      transparent: true,
      opacity: 0.45,
      roughness: 0.15,
      metalness: 0.3,
      side: THREE.DoubleSide,
    }),
  );
  vault.rotation.z = Math.PI / 2;
  vault.position.set(0, 0.14, -0.3);
  g.add(vault);
  for (const x of [-0.45, 0, 0.45]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.012, 6, 16, Math.PI), mat("#6f7780", { metal: 0.5, rough: 0.4 }));
    arch.position.set(x, 0.14, -0.3);
    arch.rotation.y = Math.PI / 2;
    g.add(arch);
  }
  // L'horloge
  const clock = cyl(0.06, 0.06, 0.012, mat("#fbf7ea", { rough: 0.4 }), 18);
  clock.rotation.x = Math.PI / 2;
  clock.position.set(0, 0.36, 0.42);
  g.add(clock);
  g.add(box(0.18, 0.12, 0.2, mat(STONE), 0, 0.28, 0.28));
  // Le TGV : une motrice au nez effilé et une voiture
  const train = new THREE.Group();
  const white = mat("#f4f6f8", { rough: 0.35, metal: 0.2 });
  const stripe = mat(livery, { rough: 0.4 });
  train.add(box(0.5, 0.09, 0.09, white, 0.1, 0.02, 0));
  train.add(box(0.5, 0.025, 0.092, stripe, 0.1, 0.045, 0));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), white);
  nose.scale.set(2.6, 0.9, 0.9);
  nose.position.set(-0.17, 0.065, 0);
  train.add(nose);
  train.add(box(0.06, 0.02, 0.07, mat("#20262c", { rough: 0.2 }), -0.2, 0.085, 0));
  train.position.set(0, 0, -0.45);
  g.add(train);
  return bake(shadowed(g));
}

/** La banque : un temple à colonnes */
export function bank(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat("#efe6d2", { rough: 0.7 });
  g.add(box(0.8, 0.04, 0.7, mat("#d6cbb2")));
  g.add(box(0.72, 0.04, 0.62, stone, 0, 0.04));
  g.add(
    facadeBox(0.6, 0.32, 0.4, { wall: "#efe6d2", glass: "#5a6a76", frame: "#efe6d2", narrow: true }, stone)
      .translateY(0.08)
      .translateZ(-0.06),
  );
  for (let n = 0; n < 6; n++) g.add(cyl(0.022, 0.026, 0.3, stone, 10, -0.25 + n * 0.1, 0.08, 0.2));
  g.add(box(0.64, 0.04, 0.48, stone, 0, 0.38, -0.02));
  const pediment = gableRoof(0.64, 0.48, 0.12, "#e6dcc6", 0.0);
  pediment.position.set(0, 0.42, -0.02);
  g.add(pediment);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.06),
    new THREE.MeshStandardMaterial({ map: signTexture("BANQUE", "#efe6d2", "#5b4a2e", 256, 40), roughness: 0.6 }),
  );
  sign.position.set(0, 0.4, 0.222);
  g.add(sign);
  return bake(shadowed(g));
}

/** Le barrage : un mur de béton courbe au bord du lac, l'usine en contrebas */
export function dam(): { group: THREE.Group; water: THREE.Mesh } {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.16, 20, 1, true, -0.7, 1.4), mat("#c9c6bd", { rough: 0.85 }));
  (wall.material as THREE.Material).side = THREE.DoubleSide;
  wall.position.set(-0.05, 0.08, -0.05);
  wall.rotation.y = Math.PI * 0.25;
  g.add(wall);
  g.add(box(0.16, 0.1, 0.12, mat("#ded7c8"), 0.3, 0, 0.3));
  g.add(box(0.17, 0.02, 0.13, mat("#7d6b58"), 0.3, 0.1, 0.3));
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshStandardMaterial({ color: "#3f8fc4", roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.88 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.scale.set(0.4, 0.34, 1);
  water.rotation.z = -0.4;
  water.position.set(-0.05, 0.012, -0.05);
  shadowed(g);
  water.receiveShadow = true;
  water.castShadow = false;
  water.userData.keep = true;
  g.add(water);
  return { group: bake(g), water };
}

/** Une éolienne ; son rotor tourne */
export function turbine(height: number): { group: THREE.Group; rotor: THREE.Group } {
  const g = new THREE.Group();
  const white = mat("#f3f4f2", { rough: 0.45 });
  g.add(cyl(0.016, 0.032, height, white, 10));
  g.add(box(0.075, 0.05, 0.13, white, 0, height - 0.025, 0));
  const rotor = new THREE.Group();
  rotor.position.set(0, height, 0.075);
  for (let k = 0; k < 3; k++) {
    const blade = box(0.028, 0.36, 0.008, white, 0, 0, 0);
    const arm = new THREE.Group();
    arm.add(blade);
    arm.rotation.z = (k * Math.PI * 2) / 3;
    rotor.add(arm);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), white);
  rotor.add(hub);
  shadowed(rotor);
  const spinning = bake(rotor);
  spinning.position.copy(rotor.position);
  spinning.userData.keep = true;
  g.add(spinning);
  return { group: bake(shadowed(g)), rotor: spinning };
}

/** L'hôtel des impôts : un bâtiment administratif et son drapeau */
export function taxOffice(): THREE.Group {
  const g = new THREE.Group();
  const top = mat("#8c8478");
  g.add(facadeBox(0.62, 0.42, 0.42, { wall: "#e4dccb", glass: "#4b5f70", frame: "#f3eee2", narrow: true }, top).translateZ(-0.12));
  g.add(box(0.66, 0.03, 0.46, mat("#cfc6b3"), 0, 0.42, -0.12));
  g.add(cyl(0.006, 0.006, 0.36, mat("#b9b9b9", { metal: 0.6, rough: 0.3 }), 6, 0.26, 0, 0.26));
  // Le drapeau tricolore
  ["#2a4fa0", "#f6f6f2", "#d0352c"].forEach((c, n) => g.add(box(0.04, 0.07, 0.004, mat(c, { rough: 0.6 }), 0.28 + n * 0.04, 0.28, 0.26)));
  return bake(shadowed(g));
}

/** Le péage : un auvent au-dessus de trois voies, des cabines, des barrières */
export function tollBooth(): THREE.Group {
  const g = new THREE.Group();
  const roof = mat("#e8e4da", { rough: 0.6 });
  g.add(box(0.86, 0.04, 0.32, roof, 0, 0.26, 0.1));
  g.add(box(0.86, 0.025, 0.04, mat("#2f6fb8"), 0, 0.27, 0.27));
  for (const x of [-0.42, -0.14, 0.14, 0.42]) {
    g.add(box(0.05, 0.26, 0.05, mat("#c9c3b6"), x, 0, 0.1));
    if (Math.abs(x) < 0.3) g.add(box(0.07, 0.13, 0.1, mat("#f3efe5"), x, 0, 0.18));
  }
  for (const x of [-0.28, 0, 0.28]) {
    const bar = new THREE.Group();
    for (let n = 0; n < 4; n++) bar.add(box(0.05, 0.012, 0.012, mat(n % 2 ? "#ffffff" : "#d6433a"), 0.025 + n * 0.05, 0.08, 0.3));
    bar.position.x = x - 0.1;
    g.add(bar);
  }
  return bake(shadowed(g));
}

/** Le kiosque à journaux : un pavillon rond sous un toit vert */
export function kiosk(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.15, 0.15, 0.03, mat("#d6ccb6"), 16));
  g.add(cyl(0.12, 0.12, 0.16, mat("#2f6b4f", { rough: 0.6 }), 8, 0, 0.03, 0));
  g.add(box(0.14, 0.07, 0.01, mat("#f6efdc"), 0, 0.09, 0.12));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.12, 8), mat("#2f6b4f", { rough: 0.5, metal: 0.2 }));
  roof.position.y = 0.25;
  g.add(roof);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mat("#d8c58a", { metal: 0.7, rough: 0.3 })).translateY(0.32));
  return bake(shadowed(g));
}

/** Le parc : une fontaine (son jet monte et descend) */
export function fountain(): { group: THREE.Group; jet: THREE.Mesh } {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.17, 0.05, mat("#d6ccb6"), 20));
  const water = cyl(0.14, 0.14, 0.012, mat("#58a6d6", { rough: 0.1, metal: 0.3 }), 20, 0, 0.042, 0);
  g.add(water);
  g.add(cyl(0.025, 0.035, 0.1, mat("#d6ccb6"), 10, 0, 0.04, 0));
  const jet = cyl(
    0.012,
    0.03,
    0.16,
    new THREE.MeshStandardMaterial({ color: "#bfe3f7", transparent: true, opacity: 0.7, roughness: 0.1 }),
    8,
    0,
    0,
    0,
  );
  jet.position.y = 0.13;
  shadowed(g);
  jet.userData.keep = true;
  jet.castShadow = false;
  g.add(jet);
  return { group: bake(g), jet };
}

/** Une pile de pièces d'or : la cagnotte */
export function coinStack(count: number): THREE.Group {
  const g = new THREE.Group();
  const gold = mat("#e8b730", { metal: 0.85, rough: 0.28 });
  const stacks = [
    [0, 0],
    [0.07, 0.03],
    [-0.05, 0.06],
    [0.03, -0.07],
    [-0.07, -0.04],
  ];
  for (let s = 0; s < stacks.length; s++) {
    const n = Math.max(0, Math.round((count - s) / stacks.length));
    for (let k = 0; k < n; k++) {
      const coin = cyl(0.03, 0.03, 0.012, gold, 14, stacks[s]![0]! + Math.sin(k * 1.7) * 0.003, k * 0.013, stacks[s]![1]!);
      g.add(coin);
    }
  }
  return bake(shadowed(g));
}

// ---------------------------------------------------------------------------
// Le petit mobilier : drapeaux, panneaux, clôtures, arbres, voitures
// ---------------------------------------------------------------------------

/** Le drapeau du propriétaire, planté au coin de la parcelle */
export function flag(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.005, 0.006, 0.3, mat("#e9e9e4", { metal: 0.5, rough: 0.3 }), 6));
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.11, 0.07, 6, 1),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide }),
  );
  cloth.geometry.translate(0.055, 0, 0);
  cloth.position.y = 0.26;
  cloth.name = "cloth";
  shadowed(g, false, false);
  cloth.castShadow = true;
  cloth.userData.keep = true;
  g.add(cloth);
  return bake(g);
}

let saleTex: THREE.CanvasTexture | null = null;
/** Le panneau « à vendre » d'un terrain libre */
export function forSale(): THREE.Group {
  saleTex ??= signTexture("À VENDRE", "#fbf6ea", "#c0392b", 256, 110, undefined, "#c0392b");
  const g = new THREE.Group();
  const post = mat("#8a6a48");
  const face = new THREE.MeshStandardMaterial({ map: saleTex, roughness: 0.6 });
  g.add(box(0.018, 0.2, 0.018, post, -0.11));
  g.add(box(0.018, 0.2, 0.018, post, 0.11));
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.13, 0.014), [post, post, post, post, face, face]);
  board.position.y = 0.23;
  g.add(board);
  return bake(shadowed(g, false));
}

let mortgageTex: THREE.CanvasTexture | null = null;
/** Une palissade de chantier : le terrain est hypothéqué */
export function fence(w: number, d: number): THREE.Group {
  mortgageTex ??= signTexture("HYPOTHÉQUÉ", "#f2c230", "#2b2418", 320, 80);
  const g = new THREE.Group();
  const panel = mat("#f1eee6", { rough: 0.7 });
  const stripe = mat("#e07b2c");
  const h = 0.09;
  for (const [x, z, sx, sz] of [
    [0, -d / 2, w, 0.012],
    [0, d / 2, w, 0.012],
    [-w / 2, 0, 0.012, d],
    [w / 2, 0, 0.012, d],
  ] as const) {
    g.add(box(sx, h, sz, panel, x, 0, z));
    g.add(box(sx + 0.002, 0.016, sz + 0.002, stripe, x, h * 0.55, z));
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.075), new THREE.MeshStandardMaterial({ map: mortgageTex, roughness: 0.6 }));
  sign.position.set(0, 0.06, d / 2 + 0.009);
  g.add(sign);
  return bake(shadowed(g, false, false));
}

/** Les arbres : des troncs et des feuillages en instances, beaucoup pour pas cher */
export function trees(spots: { x: number; z: number; s: number; kind: number }[]): THREE.Group {
  const g = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.018, 0.026, 0.14, 6);
  trunkGeo.translate(0, 0.07, 0);
  const roundGeo = new THREE.IcosahedronGeometry(0.11, 0);
  roundGeo.translate(0, 0.21, 0);
  const pineGeo = new THREE.ConeGeometry(0.095, 0.3, 7);
  pineGeo.translate(0, 0.25, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, mat("#7a5a3c"), spots.length);
  const rounds = spots.filter((s) => s.kind === 0);
  const pines = spots.filter((s) => s.kind === 1);
  const roundMesh = new THREE.InstancedMesh(roundGeo, mat("#ffffff", { flat: true, rough: 0.9 }), Math.max(1, rounds.length));
  const pineMesh = new THREE.InstancedMesh(pineGeo, mat("#ffffff", { flat: true, rough: 0.9 }), Math.max(1, pines.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  const greens = ["#5f9a45", "#6eaa4c", "#4f8a3d", "#7cb357"];
  spots.forEach((s, n) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), n * 1.3);
    m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(s.s, s.s, s.s));
    trunks.setMatrixAt(n, m);
  });
  rounds.forEach((s, n) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), n * 2.1);
    m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(s.s, s.s * (0.9 + (n % 3) * 0.1), s.s));
    roundMesh.setMatrixAt(n, m);
    roundMesh.setColorAt(n, color.set(greens[n % greens.length]!));
  });
  pines.forEach((s, n) => {
    m.compose(new THREE.Vector3(s.x, 0, s.z), q.identity(), new THREE.Vector3(s.s, s.s, s.s));
    pineMesh.setMatrixAt(n, m);
    pineMesh.setColorAt(n, color.set(n % 2 ? "#3f7a45" : "#4d8a4f"));
  });
  for (const im of [trunks, roundMesh, pineMesh]) {
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  }
  if (rounds.length === 0) roundMesh.count = 0;
  if (pines.length === 0) pineMesh.count = 0;
  return g;
}

/** La circulation : toutes les voitures en trois maillages (carrosserie, vitres, roues), chacune sa couleur */
export class CarFleet {
  readonly meshes: THREE.InstancedMesh[];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);

  constructor(colors: string[]) {
    const shape = (w: number, h: number, d: number, y: number, z = 0) => new THREE.BoxGeometry(w, h, d).translate(0, y + h / 2, z);
    const bodyGeo = mergeGeometries([shape(0.075, 0.035, 0.16, 0.012), shape(0.068, 0.006, 0.08, 0.075, -0.01)])!;
    const glassGeo = shape(0.066, 0.03, 0.085, 0.045, -0.01);
    const wheels = [
      [-0.036, 0.05],
      [0.036, 0.05],
      [-0.036, -0.05],
      [0.036, -0.05],
    ].map(([x, z]) => new THREE.CylinderGeometry(0.016, 0.016, 0.012, 10).rotateZ(Math.PI / 2).translate(x!, 0.016, z!));
    const wheelGeo = mergeGeometries(wheels)!;
    const n = colors.length;
    const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.35, metalness: 0.3 }), n);
    const glass = new THREE.InstancedMesh(glassGeo, mat("#2a3340", { rough: 0.15, metal: 0.4 }), n);
    const tyres = new THREE.InstancedMesh(wheelGeo, mat("#1c1c1c", { rough: 0.8 }), n);
    const c = new THREE.Color();
    colors.forEach((col, k) => body.setColorAt(k, c.set(col)));
    this.meshes = [body, glass, tyres];
    for (const im of this.meshes) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.receiveShadow = true;
    }
  }

  place(k: number, x: number, z: number, angle: number) {
    this.p.set(x, 0, z);
    this.q.setFromAxisAngle(this.up, angle);
    this.m.compose(this.p, this.q, this.one);
    for (const im of this.meshes) im.setMatrixAt(k, this.m);
  }

  commit() {
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }
}

/** Une petite voiture, l'avant vers +z */
export function car(color: string, police = false): THREE.Group {
  const g = new THREE.Group();
  const body = mat(color, { rough: 0.35, metal: 0.3 });
  g.add(box(0.075, 0.035, 0.16, body, 0, 0.012));
  g.add(box(0.066, 0.03, 0.085, mat("#2a3340", { rough: 0.15, metal: 0.4 }), 0, 0.045, -0.01));
  g.add(box(0.068, 0.006, 0.08, body, 0, 0.075, -0.01));
  const wheel = mat("#1c1c1c", { rough: 0.8 });
  for (const [x, z] of [
    [-0.036, 0.05],
    [0.036, 0.05],
    [-0.036, -0.05],
    [0.036, -0.05],
  ] as const) {
    const w = cyl(0.016, 0.016, 0.012, wheel, 10, 0, 0, 0);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.016, z);
    g.add(w);
  }
  if (police) {
    g.add(box(0.077, 0.012, 0.03, mat("#ffffff"), 0, 0.03, 0.05));
    const light = box(
      0.04,
      0.014,
      0.014,
      new THREE.MeshStandardMaterial({ color: "#2b6cff", emissive: "#2b6cff", emissiveIntensity: 1.5 }),
      0,
      0.081,
      -0.01,
    );
    light.name = "siren";
    light.userData.keep = true;
    g.add(light);
  }
  return bake(shadowed(g, false, false));
}

/** Un massif de fleurs : une bordure de pierre, de la terre, des fleurs de couleur */
export function flowerBed(w: number, d: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, 0.03, d, mat("#d2c6ad")));
  g.add(box(w - 0.03, 0.034, d - 0.03, mat("#6b4f35", { rough: 1 })));
  const colors = ["#e2453c", "#f2c94c", "#f6f2e8", "#d36fa8", "#8f6fd8"];
  const bloom = new THREE.IcosahedronGeometry(0.022, 0);
  const n = Math.max(3, Math.round((w * d) / 0.006));
  for (let k = 0; k < n; k++) {
    const r = (Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1;
    const r2 = (Math.sin(seed * 4.1414 + k * 19.19) * 24634.6345) % 1;
    const f = new THREE.Mesh(bloom, mat(colors[(k + seed) % colors.length]!, { flat: true }));
    f.position.set((Math.abs(r) - 0.5) * (w - 0.06), 0.05, (Math.abs(r2) - 0.5) * (d - 0.06));
    g.add(f);
  }
  return shadowed(g, true, false);
}

/** Un réverbère */
export function lamp(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat("#2e3338", { metal: 0.5, rough: 0.4 });
  g.add(cyl(0.006, 0.009, 0.26, iron, 6));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mat("#fff4d0", { emissive: "#ffd98a" })).translateY(0.275));
  return shadowed(g, false, false);
}

/** Un banc */
export function bench(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat("#8a5a34");
  g.add(box(0.14, 0.012, 0.04, wood, 0, 0.035, 0));
  g.add(box(0.14, 0.035, 0.008, wood, 0, 0.05, -0.02));
  g.add(box(0.008, 0.035, 0.035, mat("#2e3338"), -0.06, 0, 0));
  g.add(box(0.008, 0.035, 0.035, mat("#2e3338"), 0.06, 0, 0));
  return shadowed(g, false, false);
}

/** La cellule de la prison : des barreaux sur les deux côtés qui donnent sur la visite */
export function jailBars(w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const iron = mat("#3a3d42", { metal: 0.7, rough: 0.35 });
  const h = 0.42;
  const n = 9;
  for (let k = 0; k <= n; k++) {
    g.add(cyl(0.007, 0.007, h, iron, 6, -w / 2 + (k * w) / n, 0, d / 2));
    g.add(cyl(0.007, 0.007, h, iron, 6, -w / 2, 0, d / 2 - (k * d) / n));
  }
  g.add(box(w, 0.018, 0.018, iron, 0, h, d / 2));
  g.add(box(0.018, 0.018, d, iron, -w / 2, h, 0));
  g.add(box(w, 0.018, 0.018, iron, 0, h * 0.5, d / 2));
  g.add(box(0.018, 0.018, d, iron, -w / 2, h * 0.5, 0));
  return bake(shadowed(g, false));
}

/** Le pion d'un joueur : un pion de jeu classique, verni */
export function pawn(color: string): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.05 });
  const pts = [
    [0, 0],
    [0.15, 0],
    [0.16, 0.025],
    [0.145, 0.045],
    [0.1, 0.065],
    [0.072, 0.11],
    [0.058, 0.2],
    [0.09, 0.225],
    [0.09, 0.245],
    [0.045, 0.265],
    [0, 0.27],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), m);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 14), m);
  head.position.y = 0.33;
  const inner = new THREE.Group();
  inner.add(body, head);
  inner.scale.setScalar(1.3);
  g.add(inner);
  return bake(shadowed(g, false));
}
