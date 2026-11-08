// La nature autour du circuit : les montagnes de l'horizon, les teintes du terrain, les arbres plus vivants, les
// touffes d'herbe et les fleurs du bord de la route, les ombres au sol, les traces de pneus, la mer du port.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CURB, pointAt, trackBends, wrapAngle, type Theme, type Track } from "../../../shared/games/bolides/track.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Du bruit sur plusieurs échelles, entre 0 et 1 */
export function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x, y);
    total += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.01 + 9.2;
    amp *= 0.5;
  }
  return sum / total;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** La teinte du terrain à cet endroit : des prairies plus sèches, des creux plus sombres, de la neige bleutée */
export function groundTint(theme: Theme, x: number, z: number, out: THREE.Color): THREE.Color {
  const a = fbm(x / 70, z / 70, 3);
  const b = fbm(x / 26 + 40, z / 26 - 11, 3);
  const dry = smooth(0.45, 0.72, a);
  const dark = smooth(0.58, 0.3, b);
  if (theme === "col") {
    const blue = smooth(0.62, 0.34, a);
    return out.setRGB(1 - 0.12 * blue - 0.05 * dark, 1 - 0.07 * blue - 0.03 * dark, 1);
  }
  if (theme === "vignes") {
    return out.setRGB(1 + 0.3 * dry - 0.16 * dark, 1 + 0.08 * dry - 0.13 * dark, 0.92 - 0.3 * dry - 0.12 * dark);
  }
  return out.setRGB(1 + 0.2 * dry - 0.2 * dark, 1 + 0.1 * dry - 0.12 * dark, 0.95 - 0.22 * dry - 0.16 * dark);
}

/** La forme des montagnes : un anneau autour du circuit, en deux chaînes, colorées selon la hauteur */
export function addMountains(group: THREE.Group, keep: Keep, theme: Theme, cx: number, cz: number, inner: number, phone: boolean) {
  const angles = phone ? 150 : 300;
  const rings = phone ? 7 : 12;
  const pos: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  const H = theme === "col" ? 128 : theme === "vignes" ? 72 : 52;
  const c = new THREE.Color();
  const palette = {
    forest: new THREE.Color(theme === "col" ? 0x3c5a48 : theme === "vignes" ? 0x7a9150 : 0x4f7f50),
    middle: new THREE.Color(theme === "col" ? 0x566072 : theme === "vignes" ? 0xa79a62 : 0x6e9a6a),
    top: new THREE.Color(theme === "col" ? 0xf6f9fc : theme === "vignes" ? 0x8d8c5a : 0x88a886),
  };
  const band = (rIn: number, rOut: number, height: number, seed: number) => {
    const start = pos.length / 3;
    for (let j = 0; j <= rings; j++) {
      const p = j / rings;
      const radius = rIn + (rOut - rIn) * p;
      for (let i = 0; i <= angles; i++) {
        const a = (i / angles) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const f = theme === "col" ? 3.3 : 1.5;
        const nx = ca * f * 2 + p * 1.5 + seed;
        const nz = sa * f * 2 + p * 1.5 - seed;
        const n = fbm(nx, nz, 5);
        const ridge = 1 - Math.abs(2 * n - 1);
        const profile = Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.02)), 0.85);
        // Au port, le large reste ouvert : pas de montagnes du côté de la mer
        const open = theme === "port" ? smooth(-0.18, 0.2, sa) : 1;
        const peak = theme === "col" ? Math.pow(ridge, 1.8) : Math.pow(ridge, 1.2);
        const h = height * profile * open * (0.2 + 0.95 * peak);
        pos.push(cx + ca * radius, h - 1.5, cz + sa * radius);
        const t = h / H;
        const jitter = (fbm(nx * 5, nz * 5, 2) - 0.5) * 0.3;
        if (theme === "col") {
          c.copy(palette.forest)
            .lerp(palette.middle, smooth(0.08, 0.2, t + jitter * 0.4))
            .lerp(palette.top, smooth(0.5, 0.62, t + jitter));
        } else {
          c.copy(palette.forest)
            .lerp(palette.middle, smooth(0.15, 0.6, t + jitter))
            .lerp(palette.top, smooth(0.65, 1, t));
          // Des parcelles
          const patch = fbm(nx * 11, nz * 11, 2);
          c.multiplyScalar(0.86 + patch * 0.3);
        }
        col.push(c.r, c.g, c.b);
      }
    }
    const stride = angles + 1;
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < angles; i++) {
        const a = start + j * stride + i;
        const b = a + stride;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  };
  band(inner, inner + 340, H, 3.7);
  band(inner + 230, inner + 720, H * (theme === "col" ? 1.42 : 1.55), 11.3);
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  mesh.frustumCulled = false;
  group.add(mesh);
}

/** Une forme qui reçoit une couleur par sommet : plus sombre en bas, plus claire en haut */
function shaded(g: THREE.BufferGeometry, low: number, high: number, y0: number, y1: number): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = low + (high - low) * smooth(y0, y1, p.getY(i));
    col.set([v, v, v], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function fuse(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) g.deleteAttribute("uv");
  const merged = mergeGeometries(flat, false)!;
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  return merged;
}

/** Le feuillage d'un arbre : plusieurs boules bosselées, dans une sphère de rayon 1 */
export function foliageGeometry(): THREE.BufferGeometry {
  const lobes: [number, number, number, number][] = [
    [0, 0.08, 0, 0.8],
    [0.5, -0.12, 0.2, 0.5],
    [-0.46, -0.08, -0.26, 0.55],
    [0.08, 0.4, -0.36, 0.5],
    [-0.14, -0.2, 0.5, 0.5],
    [0.32, 0.36, 0.3, 0.42],
  ];
  const parts = lobes.map(([x, y, z, r], i) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const px = p.getX(k);
      const py = p.getY(k);
      const pz = p.getZ(k);
      const n = 1 + 0.16 * Math.sin(px * 9 + i) * Math.cos(py * 7 + pz * 5);
      p.setXYZ(k, px * n + x, py * n + y, pz * n + z);
    }
    return g;
  });
  return shaded(fuse(parts), 0.55, 1.12, -0.7, 0.8);
}

/** Un cyprès : une flamme verte, haute de 1 et de rayon 0,5 */
export function cypressGeometry(): THREE.BufferGeometry {
  const profile = [
    [0, -0.5],
    [0.34, -0.44],
    [0.5, -0.16],
    [0.42, 0.12],
    [0.24, 0.36],
    [0, 0.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(profile, 8);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.deleteAttribute("uv");
  return shaded(flat, 0.6, 1.1, -0.5, 0.5);
}

const TIERS: [number, number, number][] = [
  [1, 0.5, -0.24],
  [0.76, 0.46, 0.08],
  [0.5, 0.42, 0.34],
];

/** Un sapin en trois étages, de y = -0,5 à 0,5 */
export function pineGeometry(): THREE.BufferGeometry {
  const parts = TIERS.map(([r, h, y]) => new THREE.ConeGeometry(r, h, 9, 1).translate(0, y, 0));
  return shaded(fuse(parts), 0.62, 1.1, -0.5, 0.5);
}

/** La neige sur les branches : le haut de chaque étage du sapin */
export function pineSnowGeometry(): THREE.BufferGeometry {
  const parts = TIERS.map(([r, h, y]) => new THREE.ConeGeometry(r * 0.64, h * 0.62, 9, 1).translate(0, y + h * 0.21, 0));
  return fuse(parts);
}

/** Un toit à deux pentes : de y = 0 à 1, faîtage le long de z, avec sa cheminée */
export function gableGeometry(): THREE.BufferGeometry {
  // Les pentes, puis les deux pignons (plus sombres), chacun avec sa face propre
  const slope = [
    -0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, 0.5, 0, 1,
    -0.5, 0, 1, 0.5,
  ];
  const ends = [-0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5];
  const pos = [...slope, ...ends];
  const roof = new THREE.BufferGeometry();
  roof.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const col = new Float32Array((pos.length / 3) * 3).fill(1);
  for (let i = slope.length; i < pos.length; i += 3) {
    col[i] = 0.72;
    col[i + 1] = 0.7;
    col[i + 2] = 0.68;
  }
  roof.setAttribute("color", new THREE.BufferAttribute(col, 3));
  roof.computeVertexNormals();
  const chimney = new THREE.BoxGeometry(0.11, 0.55, 0.11).translate(0.22, 0.72, 0.18).toNonIndexed();
  chimney.deleteAttribute("uv");
  const dark = new Float32Array((chimney.attributes.position as THREE.BufferAttribute).count * 3).fill(0.55);
  chimney.setAttribute("color", new THREE.BufferAttribute(dark, 3));
  const merged = mergeGeometries([roof, chimney], false)!;
  roof.dispose();
  chimney.dispose();
  return merged;
}

/** Des taches d'ombre douces au sol, sous les arbres (une seule forme répétée) */
export function addGroundShadows(group: THREE.Group, keep: Keep, spots: [number, number, number, number][]) {
  if (spots.length === 0) return;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, "rgba(14,22,10,0.5)");
  grad.addColorStop(0.65, "rgba(14,22,10,0.3)");
  grad.addColorStop(1, "rgba(14,22,10,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = keep(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = keep(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2));
  const mesh = new THREE.InstancedMesh(
    geo,
    keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })),
    spots.length,
  );
  const m = new THREE.Matrix4();
  spots.forEach(([x, y, z, r], i) => mesh.setMatrixAt(i, m.makeScale(r, 1, r).setPosition(x, y + 0.04, z)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  group.add(mesh);
}

/** Deux quads croisés, le pied à y = 0, et la lumière qui vient d'en haut (pas de face sombre) */
function crossedQuads(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const b = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b], false)!;
  a.dispose();
  b.dispose();
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function tuftTexture(theme: Theme, flowers: boolean, keep: Keep): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  let seed = flowers ? 7 : 3;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed % 10000) / 10000;
  };
  const blades =
    theme === "col"
      ? ["#8f9a6a", "#a6a878", "#73825a"]
      : theme === "vignes"
        ? ["#8ea04e", "#a8ac5a", "#74893f"]
        : ["#4e9140", "#6aab4c", "#3c7a36"];
  g.lineCap = "round";
  for (let i = 0; i < (flowers ? 16 : 34); i++) {
    const x = 24 + r() * 80;
    g.strokeStyle = blades[Math.floor(r() * blades.length)]!;
    g.lineWidth = 2.5 + r() * 3;
    g.beginPath();
    g.moveTo(x, 128);
    g.quadraticCurveTo(x + (r() - 0.5) * 30, 76, x + (r() - 0.5) * 44, 18 + r() * 60);
    g.stroke();
  }
  if (flowers) {
    const petals = theme === "vignes" ? ["#b58fe0", "#f0e0a0", "#e29ad0"] : ["#ffd23a", "#ffffff", "#ef5b53"];
    for (let i = 0; i < 9; i++) {
      const x = 22 + r() * 84;
      const y = 14 + r() * 58;
      g.fillStyle = petals[i % petals.length]!;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4.4, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#f4b331";
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = keep(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Les touffes d'herbe et les fleurs entre le vibreur et le muret */
export function addGrass(group: THREE.Group, keep: Keep, t: Track, theme: Theme, tunnel: [number, number], phone: boolean) {
  const geo = keep(crossedQuads());
  let seed = t.n * 7 + 3;
  const r = () => {
    seed = (seed * 48271) % 2147483647;
    return (seed % 100000) / 100000;
  };
  const tufts: THREE.Matrix4[] = [];
  const flowers: THREE.Matrix4[] = [];
  const step = phone ? 2.2 : 0.55;
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const p3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const blocked = (s: number) => {
    if (s > tunnel[0] - 8 && s < tunnel[1] + 8) return true;
    return t.gaps.some((g) => s > g.from - 18 && s < g.to + 18);
  };
  for (let s = 2; s < t.length; s += step) {
    if (blocked(s)) continue;
    for (const side of [-1, 1]) {
      if (r() < 0.25) continue;
      const lo = t.half + CURB + 0.7;
      const hi = t.wall - 0.5;
      const d = side * (lo + r() * r() * (hi - lo));
      const p = pointAt(t, s, d);
      const size = 0.34 + r() * 0.34;
      const isFlower = theme !== "col" && r() < 0.22;
      const m = new THREE.Matrix4().compose(
        p3.set(p.x, p.y - 0.06, p.z),
        q.setFromAxisAngle(up, r() * Math.PI),
        s3.set(size * 1.1, size, size * 1.1),
      );
      (isFlower ? flowers : tufts).push(m);
    }
  }
  const add = (list: THREE.Matrix4[], isFlower: boolean) => {
    if (list.length === 0) return;
    const mat = keep(new THREE.MeshLambertMaterial({ map: tuftTexture(theme, isFlower, keep), alphaTest: 0.45, side: THREE.DoubleSide }));
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  add(tufts, false);
  add(flowers, true);
}

/** Les dégagements : du gravier (ou de la neige tassée) à l'extérieur de chaque virage, entre le vibreur et le muret */
export function addRunoffs(group: THREE.Group, keep: Keep, t: Track, theme: Theme, tunnelFree: (s: number) => boolean) {
  const step = t.length / t.n;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (const b of trackBends(t, 1 / 70)) {
    let from = b.from * step;
    let to = b.to * step;
    if (to < from) to += t.length;
    if (!tunnelFree((from + to) / 2)) continue;
    from -= 6;
    to += 10;
    const p0 = pointAt(t, (from + to) / 2 - 6, 0);
    const p1 = pointAt(t, (from + to) / 2 + 6, 0);
    const turn = wrapAngle(Math.atan2(p1.tx, p1.tz) - Math.atan2(p0.tx, p0.tz));
    // Dans un virage à gauche, l'extérieur est du côté des écarts positifs
    const out = turn > 0 ? 1 : -1;
    const d1 = out * (t.half + CURB);
    const d2 = out * (t.wall + 0.3);
    const n = Math.max(2, Math.ceil((to - from) / 2));
    const start = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const v = i / n;
      const s = from + (to - from) * v;
      const a = pointAt(t, s, Math.min(d1, d2));
      const c = pointAt(t, s, Math.max(d1, d2));
      pos.push(a.x, a.y + 0.012, a.z, c.x, c.y + 0.012, c.z);
      uv.push(0, v, 1, v);
    }
    for (let i = 0; i < n; i++) {
      const a = start + i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  if (index.length === 0) return;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 512;
  const g = c.getContext("2d")!;
  const tones =
    theme === "col"
      ? ["#d8e2ee", "#c9d5e4", "#e6edf5"]
      : theme === "vignes"
        ? ["#c8a66c", "#b7935a", "#d6b87e"]
        : ["#cfc3a3", "#bfb28f", "#ddd2b4"];
  g.fillStyle = tones[0]!;
  g.fillRect(0, 0, 128, 512);
  let seed = 19;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed % 10000) / 10000;
  };
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = tones[Math.floor(r() * tones.length)]!;
    const s = 1 + r() * 2.4;
    g.fillRect(r() * 128, r() * 512, s, s);
  }
  // Ses bords s'effacent : les deux bouts, et le côté du muret reste net
  g.globalCompositeOperation = "destination-in";
  const ends = g.createLinearGradient(0, 0, 0, 512);
  ends.addColorStop(0, "rgba(0,0,0,0)");
  ends.addColorStop(0.14, "rgba(0,0,0,1)");
  ends.addColorStop(0.86, "rgba(0,0,0,1)");
  ends.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = ends;
  g.fillRect(0, 0, 128, 512);
  g.globalCompositeOperation = "source-over";
  const tex = keep(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, keep(new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false })));
  mesh.receiveShadow = true;
  group.add(mesh);
}

/** Les traces de pneus sombres, à la corde de chaque virage */
export function addSkidMarks(group: THREE.Group, keep: Keep, t: Track, theme: Theme, tunnelFree: (s: number) => boolean) {
  const step = t.length / t.n;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const line = (from: number, to: number, base: number, swing: number, width: number) => {
    const n = Math.max(2, Math.ceil((to - from) / 2));
    const start = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const s = from + (to - from) * u;
      const d = base + swing * Math.sin(Math.PI * u);
      const a = pointAt(t, s, d - width / 2);
      const b = pointAt(t, s, d + width / 2);
      pos.push(a.x, a.y + 0.067, a.z, b.x, b.y + 0.067, b.z);
      uv.push(0, s / 22, 1, s / 22);
    }
    for (let i = 0; i < n; i++) {
      const a = start + i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  for (const b of trackBends(t, 1 / 70)) {
    let from = b.from * step;
    let to = b.to * step;
    if (to < from) to += t.length;
    if (!tunnelFree((from + to) / 2)) continue;
    from -= 8;
    to += 8;
    const mid = (from + to) / 2;
    const p0 = pointAt(t, mid - 6, 0);
    const p1 = pointAt(t, mid + 6, 0);
    // Positif : la route tourne à gauche, l'intérieur est du côté des écarts négatifs
    const turn = wrapAngle(Math.atan2(p1.tx, p1.tz) - Math.atan2(p0.tx, p0.tz));
    const inside = turn > 0 ? -1 : 1;
    for (const [off, swing] of [
      [0.1, 0.56],
      [-0.05, 0.42],
      [0.22, 0.32],
    ] as const) {
      const base = inside * t.half * off;
      const reach = inside * t.half * swing;
      line(from, to, base - 0.7, reach, 0.34);
      line(from, to, base + 0.7, reach, 0.34);
    }
  }
  if (index.length === 0) return;
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 256;
  const g = c.getContext("2d")!;
  let seed = 41;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed % 10000) / 10000;
  };
  for (let y = 0; y < 256;) {
    const len = 18 + r() * 40;
    const a = r() < 0.2 ? 0 : 0.24 + r() * 0.28;
    g.fillStyle = theme === "col" ? `rgba(40,44,52,${a})` : `rgba(12,12,14,${a})`;
    g.fillRect(2, y, 12, len);
    y += len;
  }
  const tex = keep(new THREE.CanvasTexture(c));
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))));
}

/** La mer : de petites vagues qui bougent, le ciel qui s'y reflète au loin, le soleil qui scintille */
export function seaMaterial(keep: Keep, sunDir: THREE.Vector3, sky: THREE.Color): THREE.ShaderMaterial {
  return keep(
    new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uDeep: { value: new THREE.Color(0x12577e) },
          uShallow: { value: new THREE.Color(0x2c8db0) },
          uSky: { value: sky.clone() },
          uSunDir: { value: sunDir.clone() },
        },
      ]),
      vertexShader: /* glsl */ `
        varying vec3 vW;
        #include <fog_pars_vertex>
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSky;
        uniform vec3 uSunDir;
        varying vec3 vW;
        #include <fog_pars_fragment>
        vec2 wave(vec2 p, vec2 d, float f, float s, float a) {
          float x = dot(p, d) * f + uTime * s;
          return d * cos(x) * a * f;
        }
        void main() {
          vec2 p = vW.xz;
          vec2 g = wave(p, vec2(0.86, 0.5), 0.34, 1.1, 0.16)
            + wave(p, vec2(-0.6, 0.8), 0.62, 1.6, 0.08)
            + wave(p, vec2(0.2, -0.98), 1.15, 2.2, 0.045)
            + wave(p, vec2(-0.93, -0.37), 2.3, 3.1, 0.022);
          vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 V = normalize(cameraPosition - vW);
          float F = pow(1.0 - max(dot(N, V), 0.0), 3.5);
          float swell = 0.5 + 0.5 * sin(p.x * 0.05 + p.y * 0.07 + uTime * 0.3);
          vec3 water = mix(uDeep, uShallow, swell * 0.5 + max(g.x + g.y, 0.0) * 0.8);
          vec3 color = mix(water, uSky, clamp(F * 0.9 + 0.04, 0.0, 1.0));
          vec3 R = reflect(-V, N);
          float s = pow(max(dot(R, uSunDir), 0.0), 220.0);
          color += vec3(1.0, 0.95, 0.8) * s * 2.2;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    }),
  );
}
