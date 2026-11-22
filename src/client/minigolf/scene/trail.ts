// La traînée d'une balle (le skin choisi au salon) : un fil blanc, un arc-en-ciel, des étincelles, des bulles, des
// confettis ou des flammes, laissés derrière elle quand elle roule ou vole. Des points qui naissent, vivent un instant
// et s'effacent, dessinés en une seule fois.

import * as THREE from "three";

const MAX = 180;

const VERT = /* glsl */ `
attribute float size;
attribute vec4 tint;
varying vec4 vTint;
uniform float scale;
void main() {
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec4 vTint;
uniform float square;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = square > 0.5 ? step(max(abs(c.x), abs(c.y)), 0.42) : smoothstep(0.5, 0.15, length(c));
  if (a * vTint.a < 0.01) discard;
  gl_FragColor = vec4(vTint.rgb, vTint.a * a);
}`;

interface Style {
  /** Une particule tous les `every` mètres parcourus (fil, arc-en-ciel), ou `rate` par seconde */
  every?: number;
  rate?: number;
  life: number;
  size: [number, number];
  additive: boolean;
  square?: boolean;
  /** Vitesse de départ : vers le haut, et au hasard autour ; la pesanteur des confettis */
  up: number;
  spread: number;
  gravity?: number;
  alpha: number;
}

const STYLES: Record<string, Style> = {
  fil: { every: 0.012, life: 0.55, size: [0.028, 0.028], additive: false, up: 0, spread: 0, alpha: 0.75 },
  arcenciel: { every: 0.014, life: 0.75, size: [0.06, 0.04], additive: false, up: 0, spread: 0, alpha: 0.85 },
  etincelles: { rate: 90, life: 0.45, size: [0.04, 0.01], additive: true, up: 0.5, spread: 0.35, alpha: 1 },
  bulles: { rate: 16, life: 1.3, size: [0.05, 0.08], additive: false, up: 0.28, spread: 0.08, alpha: 0.5 },
  confettis: { rate: 34, life: 1.1, size: [0.04, 0.04], additive: false, square: true, up: 0.9, spread: 0.5, gravity: 2.4, alpha: 1 },
  flammes: { rate: 110, life: 0.36, size: [0.1, 0.02], additive: true, up: 0.35, spread: 0.1, alpha: 0.9 },
};

export class TrailFx {
  readonly points: THREE.Points;
  private style: Style;
  private pos = new Float32Array(MAX * 3);
  private tint = new Float32Array(MAX * 4);
  private size = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private born = new Float32Array(MAX).fill(-99);
  private hue = new Float32Array(MAX);
  private next = 0;
  private dist = 0;
  private acc = 0;
  private lastT = 0;
  private last = new THREE.Vector3(NaN, 0, 0);
  private hueRun = 0;
  private c = new THREE.Color();

  constructor(
    readonly kind: string,
    private strength: number,
  ) {
    this.style = STYLES[kind] ?? STYLES.fil!;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("tint", new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { scale: { value: 700 }, square: { value: this.style.square ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: this.style.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** La balle est en (x, y, z) à cet instant ; `on` : visible (sinon elle n'émet plus, les particules finissent) */
  update(x: number, y: number, z: number, on: boolean) {
    const t = performance.now() / 1000;
    const dt = Math.min(0.1, this.lastT ? t - this.lastT : 0);
    this.lastT = t;
    const st = this.style;
    if (on && !Number.isNaN(this.last.x)) {
      const d = Math.hypot(x - this.last.x, y - this.last.y, z - this.last.z);
      // Seulement quand la balle file (pas quand elle saute d'un endroit à l'autre : un départ, un téléporteur)
      if (d > 1e-4 && d < 0.6 && dt > 0 && d / dt > 0.25) {
        if (st.every) {
          this.dist += d;
          const n = Math.min(12, Math.floor(this.dist / st.every));
          for (let k = 0; k < n; k++) {
            const u = (k + 1) / (n + 1);
            this.emit(this.last.x + (x - this.last.x) * u, this.last.y + (y - this.last.y) * u, this.last.z + (z - this.last.z) * u, t);
          }
          this.dist -= n * st.every;
          this.hueRun += d * 2.4;
        } else if (st.rate) {
          this.acc += st.rate * dt * Math.min(1.5, d / dt / 2);
          const n = Math.min(10, Math.floor(this.acc));
          for (let k = 0; k < n; k++) this.emit(x, y, z, t);
          this.acc -= n;
        }
      }
    }
    this.last.set(x, y, z);
    this.age(t, dt);
  }

  private emit(x: number, y: number, z: number, t: number) {
    const st = this.style;
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const r = () => Math.random() - 0.5;
    this.pos[i * 3] = x + r() * 0.02;
    this.pos[i * 3 + 1] = y - (st.every ? 0.03 : 0);
    this.pos[i * 3 + 2] = z + r() * 0.02;
    this.vel[i * 3] = r() * st.spread;
    this.vel[i * 3 + 1] = st.up * (0.5 + Math.random() * 0.8);
    this.vel[i * 3 + 2] = r() * st.spread;
    this.born[i] = t;
    this.hue[i] = this.kind === "arcenciel" ? this.hueRun % 1 : Math.random();
  }

  private age(t: number, dt: number) {
    const st = this.style;
    for (let i = 0; i < MAX; i++) {
      const k = (t - this.born[i]!) / st.life;
      if (k >= 1 || k < 0) {
        this.tint[i * 4 + 3] = 0;
        this.size[i] = 0;
        continue;
      }
      this.pos[i * 3] += this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2]! * dt;
      if (st.gravity) this.vel[i * 3 + 1] -= st.gravity * dt;
      this.size[i] = st.size[0] + (st.size[1] - st.size[0]) * k;
      let a = st.alpha * (1 - k) * this.strength;
      switch (this.kind) {
        case "arcenciel":
          this.c.setHSL(this.hue[i]!, 0.9, 0.6);
          break;
        case "etincelles":
          this.c.setRGB(1, 0.85 + 0.15 * (1 - k), 0.45 + 0.5 * (1 - k));
          break;
        case "bulles":
          this.c.setRGB(0.75, 0.92, 1);
          a *= Math.min(1, k * 6);
          break;
        case "confettis":
          this.c.setHSL(this.hue[i]!, 0.85, 0.55);
          break;
        case "flammes":
          this.c.setRGB(1, 0.9 - 0.7 * k, 0.45 - 0.45 * k);
          break;
        default:
          this.c.setRGB(1, 1, 1);
      }
      this.tint[i * 4] = this.c.r;
      this.tint[i * 4 + 1] = this.c.g;
      this.tint[i * 4 + 2] = this.c.b;
      this.tint[i * 4 + 3] = a;
    }
    const g = this.points.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.tint!.needsUpdate = true;
    g.attributes.size!.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
