// Ce qui vit dans la cuisine : le feu (des flammes qui dansent, la fumée noire), la vapeur des marmites, les bulles de
// l'évier, la mousse de l'extincteur, les éclats de ce qu'on coupe, les étincelles d'un plat servi, la neige du chalet.
// Des petits carrés toujours tournés vers la caméra, dans trois couches (une seule image dessinée par couche, chaque
// particule avec sa couleur, sa taille et sa transparence).

import * as THREE from "three";
import type { Keep } from "./textures.ts";

const VERT = `
attribute vec3 iPos;
attribute float iSize;
attribute float iAlpha;
attribute vec3 iColor;
attribute float iSpin;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vUv = uv;
  vAlpha = iAlpha;
  vColor = iColor;
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float c = cos(iSpin), s = sin(iSpin);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  mv.xy += p * iSize;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform sampler2D map;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb * vColor, t.a * vAlpha);
  if (gl_FragColor.a < 0.004) discard;
}`;

class Layer {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private pos: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private color: Float32Array;
  private spin: Float32Array;
  count = 0;

  constructor(
    keep: Keep,
    map: THREE.Texture,
    readonly cap: number,
    additive: boolean,
  ) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = keep(new THREE.InstancedBufferGeometry());
    this.geo.index = base.index;
    this.geo.setAttribute("position", base.getAttribute("position"));
    this.geo.setAttribute("uv", base.getAttribute("uv"));
    this.pos = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.color = new Float32Array(cap * 3);
    this.spin = new Float32Array(cap);
    const attr = (a: Float32Array, n: number) => new THREE.InstancedBufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("iPos", attr(this.pos, 3));
    this.geo.setAttribute("iSize", attr(this.size, 1));
    this.geo.setAttribute("iAlpha", attr(this.alpha, 1));
    this.geo.setAttribute("iColor", attr(this.color, 3));
    this.geo.setAttribute("iSpin", attr(this.spin, 1));
    this.geo.instanceCount = 0;
    const mat = keep(
      new THREE.ShaderMaterial({
        uniforms: { map: { value: map } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
  }

  begin() {
    this.count = 0;
  }

  push(x: number, y: number, z: number, size: number, alpha: number, c: THREE.Color, spin: number) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.size[i] = size;
    this.alpha[i] = alpha;
    this.color[i * 3] = c.r;
    this.color[i * 3 + 1] = c.g;
    this.color[i * 3 + 2] = c.b;
    this.spin[i] = spin;
  }

  end() {
    this.geo.instanceCount = this.count;
    for (const name of ["iPos", "iSize", "iAlpha", "iColor", "iSpin"])
      (this.geo.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}

function radialTexture(keep: Keep, soft: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(soft, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = keep(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Une flamme : une goutte, jaune au cœur, orange puis rouge au bord */
function flameTexture(keep: Keep): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 44, 2, 32, 38, 30);
  grad.addColorStop(0, "rgba(255,250,215,1)");
  grad.addColorStop(0.3, "rgba(255,205,80,0.95)");
  grad.addColorStop(0.65, "rgba(255,110,30,0.6)");
  grad.addColorStop(1, "rgba(200,40,10,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(32, 2);
  g.bezierCurveTo(50, 22, 58, 40, 32, 62);
  g.bezierCurveTo(6, 40, 14, 22, 32, 2);
  g.fill();
  const t = keep(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff {
  layer: 0 | 1 | 2;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Ce qui retombe (éclats, gouttes) */
  g: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  alpha: number;
  color: THREE.Color;
  spin: number;
  vs: number;
  /** Elle apparaît en douceur (la vapeur) */
  ease: boolean;
}

const C = (hex: string) => new THREE.Color(hex);
const STEAM = C("#f3f5f7");
const SMOKE = C("#3a3532");
const DARK = C("#201c1a");
const FOAM = C("#ffffff");
const WATER = C("#bfe4f4");
const WHITE = C("#ffffff");
const SPARK = C("#ffd27a");

export class Effects {
  readonly group = new THREE.Group();
  /** 0 : tout ce qui est doux (vapeur, fumée, mousse, neige…), 1 : les flammes, 2 : les étincelles */
  private layers: Layer[];
  private puffs: Puff[] = [];
  private budget: number;
  private colors = new Map<string, THREE.Color>();

  constructor(keep: Keep, touch: boolean) {
    this.budget = touch ? 300 : 650;
    const soft = radialTexture(keep, 0.35);
    this.layers = [
      new Layer(keep, soft, this.budget, false),
      new Layer(keep, flameTexture(keep), 160, true),
      new Layer(keep, radialTexture(keep, 0.2), 160, true),
    ];
    for (const l of this.layers) this.group.add(l.mesh);
  }

  private add(p: Omit<Puff, "life" | "spin" | "vs"> & { vs?: number }) {
    if (this.puffs.length >= this.budget) return;
    this.puffs.push({ ...p, life: 0, spin: Math.random() * 6.28, vs: p.vs ?? (Math.random() - 0.5) * 1.5 });
  }

  private tone(hex: string): THREE.Color {
    let c = this.colors.get(hex);
    if (!c) this.colors.set(hex, (c = C(hex)));
    return c;
  }

  /** Le feu sur une case (force de 0 à 1) : des flammes et de la fumée, à chaque image */
  fire(x: number, y: number, z: number, k: number, dt: number) {
    let n = dt * 46 * (0.4 + k);
    while (n > 0) {
      if (Math.random() < n)
        this.add({
          layer: 1,
          x: x + (Math.random() - 0.5) * 0.7,
          y: y + 0.02,
          z: z + (Math.random() - 0.5) * 0.7,
          vx: (Math.random() - 0.5) * 0.2,
          vy: 0.9 + Math.random() * 0.7,
          vz: (Math.random() - 0.5) * 0.2,
          g: 0,
          drag: 0.5,
          max: 0.4 + Math.random() * 0.35,
          size: 0.32 + Math.random() * 0.3 * k,
          grow: 0.4,
          alpha: 1,
          color: WHITE,
          ease: false,
          vs: (Math.random() - 0.5) * 0.6,
        });
      n -= 1;
    }
    if (Math.random() < dt * 9 * k)
      this.add({
        layer: 0,
        x,
        y: y + 0.6,
        z,
        vx: (Math.random() - 0.5) * 0.2,
        vy: 0.8,
        vz: (Math.random() - 0.5) * 0.2,
        g: 0,
        drag: 0.3,
        max: 1.8,
        size: 0.4,
        grow: 3,
        alpha: 0.75,
        color: DARK,
        ease: true,
      });
  }

  /** La vapeur qui monte (d'une marmite qui cuit, de la friteuse) */
  steam(x: number, y: number, z: number, k: number, dt: number) {
    if (Math.random() < dt * 7 * k)
      this.add({
        layer: 0,
        x: x + (Math.random() - 0.5) * 0.2,
        y,
        z: z + (Math.random() - 0.5) * 0.2,
        vx: (Math.random() - 0.5) * 0.08,
        vy: 0.5,
        vz: (Math.random() - 0.5) * 0.08,
        g: 0,
        drag: 0.4,
        max: 1.5,
        size: 0.16,
        grow: 3.2,
        alpha: 0.45,
        color: STEAM,
        ease: true,
      });
  }

  /** Ça va brûler : une fumée grise, de plus en plus épaisse */
  scorch(x: number, y: number, z: number, k: number, dt: number) {
    if (Math.random() < dt * 12 * k)
      this.add({
        layer: 0,
        x,
        y,
        z,
        vx: (Math.random() - 0.5) * 0.1,
        vy: 0.55,
        vz: (Math.random() - 0.5) * 0.1,
        g: 0,
        drag: 0.3,
        max: 1.2,
        size: 0.18,
        grow: 2.6,
        alpha: 0.6,
        color: SMOKE,
        ease: true,
      });
  }

  /** Les bulles de l'évier quand on lave */
  bubbles(x: number, y: number, z: number, dt: number) {
    if (Math.random() < dt * 16)
      this.add({
        layer: 0,
        x: x + (Math.random() - 0.5) * 0.5,
        y,
        z: z + (Math.random() - 0.5) * 0.4,
        vx: 0,
        vy: 0.25,
        vz: 0,
        g: 0,
        drag: 0,
        max: 0.9,
        size: 0.05 + Math.random() * 0.06,
        grow: 1.5,
        alpha: 0.9,
        color: FOAM,
        ease: false,
      });
  }

  /** La mousse de l'extincteur, en cône devant le chef */
  spray(x: number, y: number, z: number, dx: number, dz: number, dt: number) {
    for (let i = 0; i < Math.ceil(dt * 80); i++) {
      const sp = 3 + Math.random() * 1.5;
      const a = (Math.random() - 0.5) * 0.7;
      const vx = (dx * Math.cos(a) - dz * Math.sin(a)) * sp;
      const vz = (dx * Math.sin(a) + dz * Math.cos(a)) * sp;
      this.add({
        layer: 0,
        x,
        y,
        z,
        vx,
        vy: (Math.random() - 0.3) * 0.6,
        vz,
        g: 1,
        drag: 2.6,
        max: 0.6,
        size: 0.08,
        grow: 4.5,
        alpha: 0.9,
        color: FOAM,
        ease: false,
      });
    }
  }

  /** Des éclats de ce qu'on coupe (de sa couleur) */
  chop(x: number, y: number, z: number, color: string) {
    const c = this.tone(color);
    for (let i = 0; i < 3; i++)
      this.add({
        layer: 0,
        x,
        y: y + 0.05,
        z,
        vx: (Math.random() - 0.5) * 1.4,
        vy: 1 + Math.random(),
        vz: (Math.random() - 0.5) * 1.4,
        g: 6,
        drag: 0.5,
        max: 0.45,
        size: 0.045,
        grow: 0.8,
        alpha: 1,
        color: c,
        ease: false,
      });
  }

  /** Un plat servi : une gerbe d'étincelles dorées */
  burst(x: number, y: number, z: number, n = 26) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = 1.2 + Math.random() * 1.3;
      this.add({
        layer: 2,
        x,
        y,
        z,
        vx: Math.cos(a) * sp,
        vy: 1.6 + Math.random() * 1.6,
        vz: Math.sin(a) * sp,
        g: 5,
        drag: 0.6,
        max: 0.75,
        size: 0.13,
        grow: 0.3,
        alpha: 1,
        color: SPARK,
        ease: false,
      });
    }
  }

  /** Un plouf (tombé à l'eau, un ingrédient perdu) */
  splash(x: number, y: number, z: number) {
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      this.add({
        layer: 0,
        x,
        y,
        z,
        vx: Math.cos(a) * 1.3,
        vy: 2 + Math.random() * 1.2,
        vz: Math.sin(a) * 1.3,
        g: 7,
        drag: 0.4,
        max: 0.7,
        size: 0.11,
        grow: 1.3,
        alpha: 0.85,
        color: WATER,
        ease: false,
      });
    }
  }

  /** De la poussière (une charrette, un élan, une chute) */
  dust(x: number, y: number, z: number, n = 4) {
    for (let i = 0; i < n; i++)
      this.add({
        layer: 0,
        x: x + (Math.random() - 0.5) * 0.3,
        y,
        z: z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 0.3,
        vz: (Math.random() - 0.5) * 0.6,
        g: 0,
        drag: 1,
        max: 0.6,
        size: 0.12,
        grow: 2.5,
        alpha: 0.5,
        color: STEAM,
        ease: true,
      });
  }

  /** La neige qui tombe (le chalet) : des flocons au-dessus de la cuisine */
  snow(cx: number, cz: number, w: number, d: number, dt: number) {
    let n = dt * 34;
    while (n > 0) {
      if (Math.random() < n)
        this.add({
          layer: 0,
          x: cx + (Math.random() - 0.5) * w,
          y: 4.2,
          z: cz + (Math.random() - 0.5) * d,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.8,
          vz: 0.15,
          g: 0,
          drag: 0,
          max: 5.2,
          size: 0.05 + Math.random() * 0.04,
          grow: 1,
          alpha: 0.9,
          color: FOAM,
          ease: true,
        });
      n -= 1;
    }
  }

  update(dt: number) {
    for (const l of this.layers) l.begin();
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) {
        this.puffs[i] = this.puffs[this.puffs.length - 1]!;
        this.puffs.pop();
        continue;
      }
      p.vy -= p.g * dt;
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.spin += p.vs * dt;
      const a = (p.ease ? Math.min(1, k * 4) * (1 - k) : 1 - k * k) * p.alpha;
      this.layers[p.layer]!.push(p.x, p.y, p.z, p.size * (1 + (p.grow - 1) * k), a, p.color, p.spin);
    }
    for (const l of this.layers) l.end();
  }

  dispose() {
    this.puffs = [];
  }
}
