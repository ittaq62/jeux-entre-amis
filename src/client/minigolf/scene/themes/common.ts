// Ce que les thèmes partagent : des matières tirées des textures (en mètres), des formes répétées en une seule fois
// (arbres, fleurs, buissons), le gazon et ses bandes de tonte, l'eau qui ondule.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Course, Mat, MoverDef } from "../../../../shared/games/minigolf/course.ts";
import type { SkyDef } from "../sky.ts";
import type { ThemeKit } from "../holeMesh.ts";
import { feltTex, waterNormalTex, type SurfaceTex } from "../textures.ts";

export interface Theme {
  sky: SkyDef;
  kit: ThemeKit;
  /**
   * Le décor autour d'un trou (tiré au hasard d'après la graine, toujours le même pour un trou). Dans
   * `userData.hideAbove` du groupe : ce qui surplombe la piste et s'efface quand on la regarde d'en haut
   */
  decor(c: Course, rng: () => number): THREE.Group;
  /** Ce qui vit à chaque image (l'eau, les feuilles, les oiseaux) ; `decor` : le décor du trou en cours */
  tick?(t: number, decor: THREE.Object3D | null): void;
  /** Le bruit de fond */
  ambience: string;
}

/** Un générateur pseudo-aléatoire simple et reproductible */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Une texture avec sa propre répétition (même image) */
function repeated(tex: THREE.Texture, meters: number): THREE.Texture {
  const t = tex.clone();
  t.repeat.set(1 / meters, 1 / meters);
  t.needsUpdate = true;
  return t;
}

/** Une matière de sol ou de mur tirée d'une texture (les uv sont en mètres) */
export function surfaceMat(s: SurfaceTex, o: THREE.MeshStandardMaterialParameters & { scale?: number } = {}): THREE.MeshStandardMaterial {
  const { scale = 1, ...rest } = o;
  return new THREE.MeshStandardMaterial({
    map: repeated(s.map, s.meters * scale),
    normalMap: repeated(s.normal, s.meters * scale),
    roughness: 0.9,
    ...rest,
  });
}

/** Le gazon des pistes : la couleur du thème, les fibres, et les bandes de tonte claires et foncées */
export function feltMat(color: number, stripe = 0.5, amount = 0.07, pattern: "bandes" | "damier" = "bandes"): THREE.MeshStandardMaterial {
  const s = feltTex();
  const m = new THREE.MeshStandardMaterial({
    color,
    map: repeated(s.map, s.meters * 0.5),
    normalMap: repeated(s.normal, s.meters * 0.5),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.96,
    vertexColors: true,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.stripeW = { value: stripe };
    shader.uniforms.stripeA = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nuniform float stripeW;\nuniform float stripeA;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        ${
          pattern === "damier"
            ? "float band = mod(floor(vWPos.x / stripeW) + floor(vWPos.z / stripeW), 2.0);"
            : "float band = step(0.5, fract((vWPos.x + vWPos.z * 0.08) / (stripeW * 2.0)));"
        }
        diffuseColor.rgb *= 1.0 + stripeA * (band * 2.0 - 1.0);`,
      );
  };
  m.customProgramCacheKey = () => `felt-${stripe}-${amount}-${pattern}`;
  return m;
}

/** L'eau : profonde, qui reflète le ciel et ondule */
export function waterMat(color: number, opacity = 0.86): THREE.MeshStandardMaterial {
  const n = waterNormalTex().clone();
  n.wrapS = n.wrapT = THREE.RepeatWrapping;
  n.repeat.set(0.45, 0.45);
  n.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.06,
    metalness: 0.15,
    normalMap: n,
    normalScale: new THREE.Vector2(0.35, 0.35),
    transparent: true,
    opacity,
    envMapIntensity: 1.3,
  });
  m.userData.flow = n;
  return m;
}

/** Fait onduler l'eau d'une matière faite par waterMat */
export function flowWater(m: THREE.Material, t: number) {
  const n = m.userData.flow as THREE.Texture | undefined;
  if (n) n.offset.set(t * 0.018, t * 0.011);
}

/** Des copies d'une même forme en une seule fois : des fleurs, des buissons, des troncs */
export class Scatter {
  private list: THREE.Matrix4[] = [];
  private colors: THREE.Color[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor(
    private geo: THREE.BufferGeometry,
    private mat: THREE.Material,
    private shadows = true,
  ) {}

  add(x: number, y: number, z: number, s: number | [number, number, number], rotY = 0, color?: THREE.Color | number, tilt = 0) {
    const sc = typeof s === "number" ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
    this.e.set(tilt, rotY, tilt * 0.6);
    this.q.setFromEuler(this.e);
    this.list.push(this.m.clone().compose(new THREE.Vector3(x, y, z), this.q, sc));
    if (color !== undefined) this.colors.push(color instanceof THREE.Color ? color : new THREE.Color(color));
  }

  get size() {
    return this.list.length;
  }

  build(): THREE.InstancedMesh | null {
    if (this.list.length === 0) return null;
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, this.list.length);
    this.list.forEach((m, i) => mesh.setMatrixAt(i, m));
    if (this.colors.length === this.list.length) this.colors.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
}

/** Une boule de feuillage un peu bosselée (houppier, buisson, topiaire) */
export function leafyBall(detail = 2, bump = 0.12, seed = 1): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, detail);
  base.deleteAttribute("normal");
  const g = mergeVertices(base);
  base.dispose();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rnd = seeded(seed);
  void rnd;
  // Le relief dépend seulement de la place du sommet : deux sommets confondus (une couture de la texture) bougent ensemble
  const hash = (x: number, y: number, z: number) => {
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.3) * 43758.5453;
    return h - Math.floor(h);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = Math.round(pos.getX(i) * 1000) / 1000;
    const y = Math.round(pos.getY(i) * 1000) / 1000;
    const z = Math.round(pos.getZ(i) * 1000) / 1000;
    const o = 1 + (hash(x, y, z) - 0.5) * bump * 2;
    pos.setXYZ(i, pos.getX(i) * o, pos.getY(i) * o, pos.getZ(i) * o);
  }
  g.computeVertexNormals();
  return g;
}

/** Une branche ou un tronc : un cylindre ouvert de `a` à `b` (rayons ra puis rb), ses uv en mètres */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, seg = 6): THREE.BufferGeometry {
  const len = a.distanceTo(b) || 0.01;
  const g = new THREE.CylinderGeometry(rb, ra, len, seg, 2, true);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * (ra + rb), uv.getY(i) * len);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

export type TreeShape = "rond" | "haut" | "large";

/**
 * Un arbre feuillu d'environ `h` mètres : un tronc qui s'évase au pied et penche un peu, des maîtresses branches qui
 * montent en s'écartant, et au bout de chacune une touffe de feuillage (des boules bosselées serrées, plus une au
 * sommet et d'autres entre elles). « rond » : un tilleul ; « haut » : un peuplier, en colonne ; « large » : un arbre
 * qui s'étale en parasol. Le bois et les feuilles à part (deux matières) ; les feuilles portent une couleur par
 * sommet, plus sombre dessous et au cœur, plus claire au soleil (la matière doit avoir `vertexColors`).
 */
export function broadleafTree(
  seed: number,
  shape: TreeShape = "rond",
  h = 5,
): { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const rng = seeded(seed * 7919 + 13);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const woods: THREE.BufferGeometry[] = [];
  const r0 = h * 0.034;
  const th = h * (shape === "haut" ? 0.28 : shape === "large" ? 0.36 : 0.4);
  const lean = V((rng() - 0.5) * h * 0.06, 0, (rng() - 0.5) * h * 0.06);
  const mid = V(lean.x * 0.35 + (rng() - 0.5) * 0.06, th * 0.5, lean.z * 0.35 + (rng() - 0.5) * 0.06);
  const top = V(lean.x, th, lean.z);
  woods.push(limb(V(0, -0.15, 0), mid, r0 * 1.12, r0 * 0.9, 8), limb(mid, top, r0 * 0.9, r0 * 0.72, 8));
  // Le pied qui s'évase
  woods.push(limb(V(0, -0.05, 0), V(lean.x * 0.05, h * 0.07, lean.z * 0.05), r0 * 1.9, r0 * 1.05, 8));
  const clumps: { c: THREE.Vector3; r: number; sy: number; detail: number }[] = [];
  const crown = V(top.x, h * (shape === "haut" ? 0.6 : shape === "large" ? 0.66 : 0.72), top.z);
  const nb = shape === "haut" ? 4 : 4 + Math.floor(rng() * 2);
  for (let i = 0; i < nb; i++) {
    const az = (i / nb) * Math.PI * 2 + rng() * 0.9;
    const el = shape === "haut" ? 1.2 + rng() * 0.2 : shape === "large" ? 0.32 + rng() * 0.3 : 0.62 + rng() * 0.35;
    const L = h * (shape === "haut" ? 0.2 + rng() * 0.1 : shape === "large" ? 0.4 + rng() * 0.12 : 0.28 + rng() * 0.1);
    const start = mid.clone().lerp(top, 0.7 + rng() * 0.3);
    const end = start.clone().add(V(Math.cos(el) * Math.cos(az) * L, Math.sin(el) * L, Math.cos(el) * Math.sin(az) * L));
    woods.push(limb(start, end, r0 * 0.5, r0 * 0.2, 5));
    const R = h * (shape === "large" ? 0.19 : shape === "haut" ? 0.13 : 0.17) * (0.85 + rng() * 0.3);
    clumps.push({ c: end.clone().add(V(0, R * 0.35, 0)), r: R, sy: shape === "large" ? 0.6 : 0.86, detail: 2 });
    // Une touffe entre le bout de la branche et le cœur, pour fermer le houppier
    const f = end
      .clone()
      .lerp(crown, 0.5)
      .add(V(0, R * 0.25, 0));
    clumps.push({ c: f, r: R * 0.82, sy: shape === "large" ? 0.6 : 0.85, detail: 1 });
  }
  if (shape === "haut") {
    for (let k = 0; k < 4; k++)
      clumps.push({
        c: V(top.x + (rng() - 0.5) * 0.25, th + (h - th) * (0.18 + k * 0.22), top.z + (rng() - 0.5) * 0.25),
        r: h * (0.15 - k * 0.018),
        sy: 1.45,
        detail: 2,
      });
  } else {
    clumps.push({
      c: crown.clone().add(V(0, h * 0.1, 0)),
      r: h * (shape === "large" ? 0.2 : 0.21),
      sy: shape === "large" ? 0.6 : 0.9,
      detail: 2,
    });
  }
  // Les feuilles : chaque touffe bosselée, sa couleur par sommet
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const k of clumps) {
    y0 = Math.min(y0, k.c.y - k.r * k.sy);
    y1 = Math.max(y1, k.c.y + k.r * k.sy);
  }
  const leafGeos = clumps.map((k, i) => {
    const g = leafyBall(k.detail, 0.2, seed * 31 + i);
    g.scale(k.r, k.r * k.sy, k.r);
    g.translate(k.c.x, k.c.y, k.c.z);
    const p = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const tone = 0.92 + rng() * 0.16;
    for (let j = 0; j < p.count; j++) {
      const up = (p.getY(j) - k.c.y) / (k.r * k.sy);
      const t = (p.getY(j) - y0) / Math.max(0.01, y1 - y0);
      const out = Math.min(1, Math.hypot(p.getX(j) - crown.x, p.getZ(j) - crown.z) / (h * 0.35));
      const v = (0.62 + 0.38 * (up * 0.5 + 0.5)) * (0.78 + 0.3 * t) * (0.86 + 0.18 * out) * tone;
      col[j * 3] = v * (1 + 0.1 * t);
      col[j * 3 + 1] = v;
      col[j * 3 + 2] = v * (0.9 - 0.08 * t);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  });
  const leaves = mergeGeometries(leafGeos)!;
  const wood = mergeGeometries(woods)!;
  for (const g of [...leafGeos, ...woods]) g.dispose();
  return { wood, leaves };
}

/**
 * Un pavé aux arêtes arrondies (une haie taillée, une plate-bande), un peu bosselé en surface, ses uv en mètres selon
 * le côté. `bump` : la hauteur des bosses.
 */
export function roundedSlab(w: number, h: number, d: number, radius: number, bump = 0, seed = 1): THREE.BufferGeometry {
  const g0 = new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2.1, h / 2.1, d / 2.1));
  g0.deleteAttribute("uv");
  const g = mergeVertices(g0);
  g0.dispose();
  g.computeVertexNormals();
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  if (bump > 0) {
    const hash = (x: number, y: number, z: number) => {
      const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1) * 43758.5453;
      return v - Math.floor(v);
    };
    for (let i = 0; i < p.count; i++) {
      const o = (hash(Math.round(p.getX(i) * 50), Math.round(p.getY(i) * 50), Math.round(p.getZ(i) * 50)) - 0.5) * bump * 2;
      p.setXYZ(i, p.getX(i) + n.getX(i) * o, p.getY(i) + n.getY(i) * o, p.getZ(i) + n.getZ(i) * o);
    }
    g.computeVertexNormals();
  }
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    const [a, b] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = a;
    uv[i * 2 + 1] = b;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Le sol du décor : un grand disque d'herbe (ou de sable, de neige…) au niveau du sol hors parcours */
export function groundDisc(mat: THREE.Material, y: number, radius = 160): THREE.Mesh {
  const g = new THREE.CircleGeometry(radius, 64);
  g.rotateX(-Math.PI / 2);
  // Les uv en mètres
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

/** Le contour du parcours vu de loin : la boîte qui l'englobe, et son centre */
export function courseBox(c: Course) {
  const b = c.box;
  return { x0: b.x0 + 1, z0: b.z0 + 1, x1: b.x1 - 1, z1: b.z1 - 1, cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2 };
}

/** Le point (x, z) tombe-t-il sur le parcours (ou trop près, à `pad` mètres) ? */
export function onCourse(c: Course, x: number, z: number, pad: number): boolean {
  for (const t of c.tiles) {
    const b = t.box;
    if (x < b.x0 - pad || x > b.x1 + pad || z < b.z0 - pad || z > b.z1 + pad) continue;
    if (pad <= 0) return true;
    // Assez près de la boîte : on regarde le contour lui-même
    const r = t.rings[0]!;
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i]![0];
      const zi = r[i]![1];
      const xj = r[j]![0];
      const zj = r[j]![1];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      const dx = xj - xi;
      const dz = zj - zi;
      const l2 = dx * dx + dz * dz || 1;
      const s = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / l2));
      if ((xi + dx * s - x) ** 2 + (zi + dz * s - z) ** 2 < pad * pad) return true;
    }
    if (inside) return true;
  }
  return false;
}

/** Une texture dessinée à la main sur une toile (répétée ; `alpha` : un fond transparent) */
export function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, alpha = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  if (alpha) g.clearRect(0, 0, size, size);
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Une boîte dont les uv sont en mètres */
export function boxMeters(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // L'ordre des faces : +x, −x, +y, −y, +z, −z (quatre sommets chacune)
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f]![0], uv.getY(i) * dims[f]![1]);
    }
  return g;
}

/** Un rectangle dont les uv sont en mètres */
export function planeMeters(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  return g;
}

/** Tout ce qui est dans `o` porte (ou non) une ombre, et en reçoit */
export function shadows(o: THREE.Object3D, cast = true) {
  o.traverse((q) => {
    if (q instanceof THREE.Mesh) {
      q.castShadow = cast;
      q.receiveShadow = true;
    }
  });
}

/** Le kit par défaut d'un thème : une matière simple pour chaque chose */
export function plainKit(o: {
  felt: THREE.Material;
  ground: (mat: Mat, look?: string) => THREE.Material | null;
  side: THREE.Material;
  rail: (look?: string) => { material: THREE.Material; extra: number; widen: number; round?: boolean; tube?: boolean; bevel?: number };
  wall: (look?: string) => THREE.Material;
  post: ThemeKit["post"];
  mover: (def: MoverDef, c: Course) => THREE.Object3D | null;
  water: (look?: string) => THREE.Material;
  flag: number;
}): ThemeKit {
  return {
    ground: (mat, look) => o.ground(mat, look) ?? o.felt,
    side: () => o.side,
    rail: o.rail,
    wall: o.wall,
    post: o.post,
    mover: o.mover,
    water: o.water,
    flag: o.flag,
  };
}
