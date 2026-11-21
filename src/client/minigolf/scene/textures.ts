// Les textures du minigolf, dessinées au chargement (rien à télécharger) : le gazon des pistes et ses bandes de tonte,
// le sable, le gravier, le bois, la pierre, le buis, la neige, la glace, l'herbe du décor, les rides de l'eau. Chaque
// texture se répète sans couture ; elle est gardée une fois faite.

import * as THREE from "three";

/** Un bruit de valeur qui boucle sur `period` cases */
function makeNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number, period: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const w = (i: number) => ((i % period) + period) % period;
    const a = hash(w(xi), w(yi));
    const b = hash(w(xi + 1), w(yi));
    const c = hash(w(xi), w(yi + 1));
    const d = hash(w(xi + 1), w(yi + 1));
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Plusieurs octaves de bruit, entre 0 et 1 */
function fbm(noise: ReturnType<typeof makeNoise>, x: number, y: number, period: number, octaves: number): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    s += noise(x * f, y * f, period * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / norm;
}

type Painter = (
  u: number,
  v: number,
  n: (x: number, y: number, period: number, oct?: number) => number,
) => [number, number, number, number];

/** Une texture de `size` pixels peinte point par point (couleur, et une hauteur pour le relief) */
function paint(size: number, seed: number, painter: Painter): { color: Uint8ClampedArray; height: Float32Array } {
  const noise = makeNoise(seed);
  const color = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const n = (x: number, y: number, period: number, oct = 4) => fbm(noise, x, y, period, oct);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, h] = painter(x / size, y / size, n);
      const i = (y * size + x) * 4;
      color[i] = r;
      color[i + 1] = g;
      color[i + 2] = b;
      color[i + 3] = 255;
      height[y * size + x] = h;
    }
  }
  return { color, height };
}

function toTexture(size: number, data: Uint8ClampedArray, srgb: boolean): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.putImageData(new ImageData(data as unknown as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Une carte de normales tirée d'une carte de hauteurs (qui boucle) */
function normalsOf(size: number, height: Float32Array, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      out[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  return out;
}

export interface SurfaceTex {
  map: THREE.Texture;
  normal: THREE.Texture;
  /** Combien de mètres couvre une répétition */
  meters: number;
}

const cache = new Map<string, SurfaceTex>();

function surface(key: string, size: number, meters: number, seed: number, strength: number, painter: Painter): SurfaceTex {
  const hit = cache.get(key);
  if (hit) return hit;
  const { color, height } = paint(size, seed, painter);
  const t = { map: toTexture(size, color, true), normal: toTexture(size, normalsOf(size, height, strength), false), meters };
  cache.set(key, t);
  return t;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Le gazon synthétique des pistes : des fibres fines, quelques nuances ; la couleur de base est donnée par le thème */
export function feltTex(): SurfaceTex {
  return surface("felt", 512, 1, 11, 2.2, (u, v, n) => {
    const fine = n(u * 128, v * 128, 128, 2);
    const mid = n(u * 16, v * 16, 16, 3);
    const k = 0.82 + fine * 0.22 + (mid - 0.5) * 0.12;
    const c = 255 * clamp01(k * 0.86);
    return [c, c, c, fine * 0.6 + mid * 0.4];
  });
}

/** Le sable fin, grain par grain */
export function sandTex(): SurfaceTex {
  return surface("sand", 512, 1.2, 23, 3.5, (u, v, n) => {
    const grain = n(u * 220, v * 220, 220, 1);
    const ripple = Math.sin((u * 7 + n(u * 4, v * 4, 4, 2) * 1.5) * Math.PI * 2) * 0.5 + 0.5;
    const k = 0.84 + grain * 0.2 + ripple * 0.05;
    return [236 * k, 212 * k, 160 * k, grain * 0.5 + ripple * 0.5];
  });
}

/** Le gravier des allées : de petits cailloux clairs */
export function gravelTex(): SurfaceTex {
  return surface("gravel", 512, 1, 31, 5, (u, v, n) => {
    const cells = n(u * 48, v * 48, 48, 1);
    const pebble = Math.pow(clamp01((cells - 0.35) * 2.2), 0.6);
    const tone = n(u * 90, v * 90, 90, 2);
    const k = 0.62 + pebble * 0.3 + tone * 0.12;
    return [226 * k, 214 * k, 190 * k, pebble];
  });
}

/** Des planches de bois, avec leurs veines et leurs joints */
export function woodTex(): SurfaceTex {
  return surface("wood", 512, 1.2, 41, 3, (u, v, n) => {
    const plank = Math.floor(u * 6);
    const pu = u * 6 - plank;
    const shade = n(plank * 3.1, 0.5, 64, 1);
    const grain = Math.sin((v * 40 + n(u * 6, v * 3, 6, 3) * 6 + plank * 1.7) * Math.PI) * 0.5 + 0.5;
    const joint = pu < 0.035 || pu > 0.965 ? 0.55 : 1;
    const k = (0.7 + shade * 0.25 + grain * 0.12) * joint;
    return [178 * k, 122 * k, 74 * k, joint < 1 ? 0 : 0.6 + grain * 0.3];
  });
}

/** Des dalles de pierre claire, posées en quinconce */
export function stoneTex(): SurfaceTex {
  return surface("stone", 512, 1.6, 53, 3, (u, v, n) => {
    const row = Math.floor(v * 4);
    const off = row % 2 ? 0.5 : 0;
    const cu = (u * 3 + off) % 1;
    const cv = (v * 4) % 1;
    const edge = Math.min(cu, 1 - cu, cv * 0.75, (1 - cv) * 0.75);
    const mortar = edge < 0.03 ? 0.62 : 1;
    const tone = n(Math.floor(u * 3 + off) * 7.7, row * 3.3, 32, 1);
    const grit = n(u * 120, v * 120, 120, 2);
    const k = (0.78 + tone * 0.15 + grit * 0.12) * mortar;
    return [222 * k, 210 * k, 188 * k, mortar < 1 ? 0 : 0.5 + grit * 0.4];
  });
}

/** Le feuillage serré du buis taillé */
export function hedgeTex(): SurfaceTex {
  return surface("hedge", 512, 0.8, 61, 6, (u, v, n) => {
    const leaves = n(u * 64, v * 64, 64, 2);
    const clumps = n(u * 10, v * 10, 10, 3);
    const k = clamp01(0.45 + leaves * 0.5 + (clumps - 0.5) * 0.35);
    return [mix(34, 92, k), mix(66, 140, k), mix(26, 52, k), leaves];
  });
}

/** L'herbe du décor, plus sauvage que le gazon des pistes */
export function grassTex(): SurfaceTex {
  return surface("grass", 512, 3, 71, 2.5, (u, v, n) => {
    const blades = n(u * 160, v * 160, 160, 1);
    const patches = n(u * 6, v * 6, 6, 4);
    const k = 0.7 + blades * 0.3;
    const dry = clamp01((patches - 0.55) * 3);
    return [mix(70, 140, dry) * k, mix(132, 150, dry) * k, mix(48, 70, dry) * k, blades];
  });
}

/** La neige tassée, scintillante */
export function snowTex(): SurfaceTex {
  return surface("snow", 512, 1.5, 83, 2, (u, v, n) => {
    const soft = n(u * 24, v * 24, 24, 4);
    const sparkle = n(u * 256, v * 256, 256, 1) > 0.93 ? 1 : 0;
    const k = 0.9 + soft * 0.1 + sparkle * 0.05;
    return [238 * k, 244 * k, 252 * k, soft];
  });
}

/** La glace : des voiles clairs et quelques fêlures */
export function iceTex(): SurfaceTex {
  return surface("ice", 512, 2, 97, 1.5, (u, v, n) => {
    const veil = n(u * 8, v * 8, 8, 4);
    const crack = Math.abs(n(u * 20, v * 20, 20, 3) - 0.5) < 0.012 ? 1 : 0;
    const k = 0.82 + veil * 0.16;
    return [190 * k + crack * 50, 225 * k + crack * 25, 245 * k + crack * 10, veil - crack * 0.3];
  });
}

/** Les rides de l'eau (seulement le relief) */
export function waterNormalTex(): THREE.Texture {
  const hit = cache.get("water");
  if (hit) return hit.normal;
  const size = 256;
  const { height } = paint(size, 107, (u, v, n) => {
    const h = n(u * 8, v * 8, 8, 4) * 0.7 + n(u * 24, v * 24, 24, 2) * 0.3;
    return [0, 0, 0, h];
  });
  const normal = toTexture(size, normalsOf(size, height, 4), false);
  cache.set("water", { map: normal, normal, meters: 2.5 });
  return normal;
}

/** Une petite tache d'ombre ronde (sous la balle, sous les objets) */
export function blobTex(): THREE.Texture {
  const hit = cache.get("blob");
  if (hit) return hit.map;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.6)");
  grd.addColorStop(0.5, "rgba(0,0,0,0.32)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  cache.set("blob", { map: tex, normal: tex, meters: 1 });
  return tex;
}
