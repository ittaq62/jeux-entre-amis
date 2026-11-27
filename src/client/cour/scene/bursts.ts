// Les éclats : peinture qui gicle, mousse qui déborde, eau qui éclabousse, balles de la piscine qui sautent, plumes qui
// volent, confettis et paillettes. Tous les éclats de la scène partagent une seule forme (des petites particules qui
// retombent), dessinée en un appel.

import * as THREE from "three";

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  r: number;
  g: number;
  b: number;
  /** Elle flotte (mousse, plumes, confettis) au lieu de tomber vite */
  float: number;
  spin: number;
}

const MAX = 2400;

export class Bursts {
  readonly mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(keep: <T extends { dispose: () => void }>(x: T) => T) {
    const geo = keep(new THREE.IcosahedronGeometry(0.5, 0));
    const mat = keep(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }));
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  }

  /** Un éclat d'un genre, à cet endroit */
  burst(kind: string, x: number, y: number, z: number, opts: { color?: string; count?: number; power?: number } = {}) {
    const n = opts.count ?? 30;
    const power = opts.power ?? 1;
    const palette = (() => {
      switch (kind) {
        case "peinture":
          return [opts.color ?? "#ff3f86"];
        case "mousse":
        case "canon":
          return ["#ffffff", "#f3fbff", "#e3f4ff"];
        case "eau":
          return ["#bfe8f5", "#8fd3ea", "#ffffff"];
        case "balles":
          return ["#ff4f5e", "#ffd23f", "#3fa6d9", "#5cbf6a", "#f78fb3"];
        case "plumes":
          return ["#f4e7d0", "#ffffff", "#d9c3a0"];
        case "gelee":
          return ["#7ddf64", "#a6f08c", "#4fbf3a"];
        case "tarte":
          return ["#fff4e0", "#ffe7c2", "#e24b5a"];
        case "miettes":
          return ["#e2a35a", "#c7843d", "#f0c27a"];
        case "or":
          return ["#ffd84a", "#fff1b8", "#e9b43b"];
        default:
          return ["#ff4f5e", "#ffd23f", "#3fa6d9", "#5cbf6a", "#b47cff", "#ffffff"];
      }
    })();
    const float = kind === "mousse" || kind === "canon" ? 0.92 : kind === "plumes" ? 0.97 : kind === "confettis" || kind === "or" ? 0.9 : 0;
    const size =
      kind === "mousse" || kind === "canon"
        ? 0.32
        : kind === "balles"
          ? 0.16
          : kind === "plumes"
            ? 0.12
            : kind === "peinture" || kind === "gelee"
              ? 0.13
              : 0.08;
    for (let k = 0; k < n; k++) {
      if (this.ps.length >= MAX) this.ps.shift();
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = (1.5 + Math.random() * 3.5) * power;
      this.c.set(palette[k % palette.length]!);
      this.ps.push({
        x: x + (Math.random() - 0.5) * 0.3,
        y: y + Math.random() * 0.3,
        z: z + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(a) * sp * (1 - up * 0.5),
        vy: (2 + up * 5) * power * (kind === "confettis" || kind === "or" ? 1.6 : 1),
        vz: Math.sin(a) * sp * (1 - up * 0.5),
        life: 0,
        max: (float ? 2.2 : 1.2) + Math.random() * 0.8,
        size: size * (0.6 + Math.random() * 0.8),
        r: this.c.r,
        g: this.c.g,
        b: this.c.b,
        float,
        spin: Math.random() * 10,
      });
    }
  }

  update(dt: number) {
    let n = 0;
    const keep: P[] = [];
    for (const p of this.ps) {
      p.life += dt;
      if (p.life >= p.max) continue;
      const drag = p.float ? Math.pow(1 - p.float, dt) : 1;
      p.vx *= p.float ? Math.max(0, 1 - dt * 2) : 1;
      p.vz *= p.float ? Math.max(0, 1 - dt * 2) : 1;
      p.vy -= (p.float ? 2.2 : 13) * dt;
      if (p.float) p.vy *= Math.max(0, 1 - dt * 1.5);
      void drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03) {
        p.y = 0.03;
        p.vy *= -0.25;
        p.vx *= 0.5;
        p.vz *= 0.5;
      }
      keep.push(p);
      const fade = Math.min(1, (p.max - p.life) * 3);
      const s = p.size * fade;
      this.e.set(p.spin + p.life * 4, p.spin * 2 + p.life * 3, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(s, p.float && p.size < 0.15 ? s * 0.2 : s, s));
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, this.c.setRGB(p.r, p.g, p.b));
      n++;
    }
    this.ps = keep;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
