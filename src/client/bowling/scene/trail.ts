// La traînée de la boule (un article de la boutique) : des étincelles, des bulles, des notes de musique, une comète, des
// flammes, un arc-en-ciel, ou juste un reflet de lumière. Des petits points qui naissent derrière la boule qui roule,
// montent ou retombent un peu, et s'éteignent.

import * as THREE from "three";

interface Style {
  colors: number[];
  /** Combien de points par mètre parcouru */
  rate: number;
  life: number;
  size: number;
  /** Ils s'écartent de la boule, montent (positif) ou retombent */
  spread: number;
  rise: number;
  additive: boolean;
  shape: "dot" | "ring" | "note" | "flame";
}

const STYLES: Record<string, Style> = {
  reflet: { colors: [0xfff0d0], rate: 26, life: 0.35, size: 0.07, spread: 0.01, rise: 0, additive: true, shape: "dot" },
  etincelles: {
    colors: [0xffd75a, 0xfff6c8, 0xffa63a],
    rate: 55,
    life: 0.6,
    size: 0.08,
    spread: 0.6,
    rise: 0.8,
    additive: true,
    shape: "dot",
  },
  bulles: { colors: [0xbfeaff, 0xe8fbff], rate: 10, life: 1.4, size: 0.09, spread: 0.15, rise: 0.35, additive: false, shape: "ring" },
  notes: {
    colors: [0xff8fbf, 0xffd166, 0x7fd3ff],
    rate: 5,
    life: 1.3,
    size: 0.14,
    spread: 0.1,
    rise: 0.45,
    additive: false,
    shape: "note",
  },
  comete: { colors: [0x9fe0ff, 0x4f8cff], rate: 60, life: 0.45, size: 0.16, spread: 0.02, rise: 0, additive: true, shape: "dot" },
  flammes: {
    colors: [0xff5a1f, 0xffa63a, 0xffd166],
    rate: 70,
    life: 0.42,
    size: 0.2,
    spread: 0.12,
    rise: 0.9,
    additive: true,
    shape: "flame",
  },
  arcenciel: {
    colors: [0xff4f4f, 0xffb347, 0xffe66b, 0x5fd06a, 0x4fa3ff, 0xa06bff],
    rate: 80,
    life: 0.7,
    size: 0.07,
    spread: 0,
    rise: 0,
    additive: true,
    shape: "dot",
  },
};

const MAX = 420;

function shapeTexture(shape: Style["shape"]): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  if (shape === "ring") {
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = 5;
    g.beginPath();
    g.arc(32, 32, 24, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    g.arc(23, 22, 5, 0, Math.PI * 2);
    g.fill();
  } else if (shape === "note") {
    g.fillStyle = "#fff";
    g.font = "bold 52px serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("♪", 32, 34);
  } else {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(shape === "flame" ? 0.25 : 0.4, "rgba(255,255,255,0.75)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BallTrail {
  readonly points: THREE.Points;
  private style: Style | null;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  /** La couleur de chaque point à sa naissance */
  private cb = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private age = new Float32Array(MAX);
  private base: THREE.Color[] = [];
  private next = 0;
  private carry = 0;
  private last = new THREE.Vector3();
  private hasLast = false;
  private tex: THREE.Texture | null = null;
  private seed = 1;

  constructor(kind: string) {
    this.style = STYLES[kind] ?? null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.age.fill(99);
    const st = this.style;
    this.tex = st ? shapeTexture(st.shape) : null;
    const mat = new THREE.PointsMaterial({
      size: st?.size ?? 0.05,
      map: this.tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: st?.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.visible = Boolean(st);
    this.base = (st?.colors ?? [0xffffff]).map((c) => new THREE.Color(c));
  }

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** La boule a avancé jusqu'ici (null : elle ne roule plus) ; on fait naître des points derrière elle */
  update(at: THREE.Vector3 | null, r: number, dt: number) {
    const st = this.style;
    if (!st) return;
    if (at && this.hasLast) {
      const dist = at.distanceTo(this.last);
      this.carry += dist * st.rate;
      const n = Math.min(40, Math.floor(this.carry));
      this.carry -= n;
      for (let k = 0; k < n; k++) {
        const u = (k + this.rand()) / Math.max(1, n);
        const i = this.next;
        this.next = (this.next + 1) % MAX;
        const x = this.last.x + (at.x - this.last.x) * u;
        const z = this.last.z + (at.z - this.last.z) * u;
        // L'arc-en-ciel : six bandes de couleur, côte à côte en travers
        const band = st === STYLES.arcenciel ? (i % 6) - 2.5 : 0;
        this.pos[i * 3] = x + band * r * 0.22 + (this.rand() - 0.5) * st.spread * r;
        this.pos[i * 3 + 1] = st.shape === "note" || st.shape === "ring" ? r * 1.2 : r * (0.35 + this.rand() * 0.5);
        this.pos[i * 3 + 2] = z + (this.rand() - 0.5) * st.spread * r;
        this.vel[i * 3] = (this.rand() - 0.5) * st.spread;
        this.vel[i * 3 + 1] = st.rise * (0.5 + this.rand());
        this.vel[i * 3 + 2] = (this.rand() - 0.5) * st.spread;
        this.age[i] = 0;
        const c = this.base[band ? i % 6 : Math.floor(this.rand() * this.base.length)]!;
        this.cb[i * 3] = this.col[i * 3] = c.r;
        this.cb[i * 3 + 1] = this.col[i * 3 + 1] = c.g;
        this.cb[i * 3 + 2] = this.col[i * 3 + 2] = c.b;
      }
    }
    if (at) {
      this.last.copy(at);
      this.hasLast = true;
    } else this.hasLast = false;
    // Ils vieillissent : ils s'éloignent un peu, puis s'éteignent
    for (let i = 0; i < MAX; i++) {
      if (this.age[i]! > st.life) {
        this.pos[i * 3 + 1] = -50;
        continue;
      }
      this.age[i] = this.age[i]! + dt;
      const k = Math.max(0, 1 - this.age[i]! / st.life);
      this.pos[i * 3] = this.pos[i * 3]! + this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1] = this.pos[i * 3 + 1]! + this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2] = this.pos[i * 3 + 2]! + this.vel[i * 3 + 2]! * dt;
      if (st.additive) {
        // En lumière ajoutée, s'éteindre c'est s'assombrir
        const f = k * k;
        this.col[i * 3] = this.cb[i * 3]! * f;
        this.col[i * 3 + 1] = this.cb[i * 3 + 1]! * f;
        this.col[i * 3 + 2] = this.cb[i * 3 + 2]! * f;
      } else if (k < 0.05) this.pos[i * 3 + 1] = -50;
    }
    const geo = this.points.geometry;
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.tex?.dispose();
  }
}
