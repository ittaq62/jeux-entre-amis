// Ce que les thèmes partagent : des matières tirées des textures (en mètres), des formes répétées en une seule fois
// (arbres, fleurs, buissons), le gazon et ses bandes de tonte, l'eau qui ondule.

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
export function feltMat(color: number, stripe = 0.5, amount = 0.07): THREE.MeshStandardMaterial {
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
        float band = step(0.5, fract((vWPos.x + vWPos.z * 0.08) / (stripeW * 2.0)));
        diffuseColor.rgb *= 1.0 + stripeA * (band * 2.0 - 1.0);`,
      );
  };
  m.customProgramCacheKey = () => `felt-${stripe}-${amount}`;
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

/** Le kit par défaut d'un thème : une matière simple pour chaque chose */
export function plainKit(o: {
  felt: THREE.Material;
  ground: (mat: Mat, look?: string) => THREE.Material | null;
  side: THREE.Material;
  rail: (look?: string) => { material: THREE.Material; extra: number; widen: number; round?: boolean };
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
