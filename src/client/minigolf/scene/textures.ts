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

/**
 * Un bruit de cellules qui boucle sur `period` cases : pour un point, la distance au germe le plus proche (f1), au
 * suivant (f2), et le numéro de la cellule (de quoi dessiner des cailloux, des feuilles, des écailles).
 */
export function makeCells(seed: number, period: number, stretch = 1) {
  const gx = new Float32Array(period * period);
  const gy = new Float32Array(period * period);
  // Chaque cellule peut être allongée dans sa propre direction (des feuilles plutôt que des cailloux)
  const ca = new Float32Array(period * period);
  const sa = new Float32Array(period * period);
  let h = seed * 2654435761;
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) + 0x6d2b79f5;
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < period * period; i++) {
    gx[i] = 0.12 + rnd() * 0.76;
    gy[i] = 0.12 + rnd() * 0.76;
    const a = rnd() * Math.PI;
    ca[i] = Math.cos(a);
    sa[i] = Math.sin(a);
  }
  const out = { f1: 0, f2: 0, id: 0 };
  return (x: number, y: number) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let f1 = 9;
    let f2 = 9;
    let id = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const ix = (((cx + dx) % period) + period) % period;
        const iy = (((cy + dy) % period) + period) % period;
        const k = iy * period + ix;
        const ex = cx + dx + gx[k]! - x;
        const ey = cy + dy + gy[k]! - y;
        const d = stretch === 1 ? Math.hypot(ex, ey) : Math.hypot(ex * ca[k]! + ey * sa[k]!, (ey * ca[k]! - ex * sa[k]!) * stretch);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = k;
        } else if (d < f2) f2 = d;
      }
    out.f1 = f1;
    out.f2 = f2;
    out.id = id;
    return out;
  };
}

/** Un nombre entre 0 et 1 tiré d'un entier (le ton d'un caillou, d'une feuille) */
export function hash01(i: number, salt: number): number {
  let h = Math.imul(i ^ (salt * 0x9e3779b9), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export type Painter = (
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

/**
 * Une texture de sol (couleur et relief) peinte point par point, qui se répète tous les `meters` mètres ; gardée sous
 * son nom une fois faite. `strength` : la force du relief.
 */
export function surface(key: string, size: number, meters: number, seed: number, strength: number, painter: Painter): SurfaceTex {
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
  // Des cailloux ronds serrés (2 cm environ), chacun son ton (blond, gris, blanc, un peu d'ocre), bombés, éclairés
  // d'en haut, et l'ombre entre eux
  const P = 36;
  const cells = makeCells(31, P);
  const tones: [number, number, number][] = [
    [226, 214, 190],
    [204, 198, 186],
    [238, 232, 218],
    [214, 190, 156],
    [186, 178, 166],
  ];
  return surface("gravel2", 512, 0.7, 31, 3.2, (u, v, n) => {
    const c = cells(u * P, v * P);
    // (la cellule rendue est réutilisée à l'appel suivant : on garde ses valeurs)
    const f1 = c.f1;
    const gap = clamp01((c.f2 - c.f1) * 5);
    const dome = Math.sqrt(clamp01(1 - f1 * 1.45));
    const t = tones[Math.floor(hash01(c.id, 3) * tones.length)]!;
    const shade = hash01(c.id, 7) * 0.16;
    const grit = n(u * 200, v * 200, 200, 1);
    // Plus clair du côté de la lumière (en haut à gauche du caillou)
    const cs = cells(u * P - 0.08, v * P - 0.08);
    const lit = clamp01(1 - cs.f1 * 1.45) - clamp01(1 - f1 * 1.45);
    const k = (0.58 + dome * 0.32 + lit * 0.35 - shade + grit * 0.06) * (0.35 + 0.65 * Math.pow(gap, 0.6));
    return [t[0] * k, t[1] * k, t[2] * k, dome * Math.pow(gap, 0.5)];
  });
}

/** Des planches de bois, avec leurs veines et leurs joints */
export function woodTex(): SurfaceTex {
  return surface("wood2", 512, 1.2, 41, 3, (u, v, n) => {
    // Six planches dans la largeur, chacune décalée en longueur, son ton, ses fils le long de la planche
    const plank = Math.floor(u * 6);
    const pu = u * 6 - plank;
    const shade = n(plank * 3.1, 0.5, 64, 1);
    const pv = v + plank * 0.37;
    const fibre = Math.sin((pu * 26 + n(plank * 5 + 0.5, pv * 2.5, 8, 3) * 5) * Math.PI) * 0.5 + 0.5;
    const fine = n(u * 6, v * 160, 6, 2);
    // Un nœud de temps en temps
    const kx = (pu - 0.5) * 3;
    const ky = (((pv * 3) % 1) - 0.5) * 6;
    const knot = n(plank * 7.3, Math.floor(pv * 3) * 1.7, 64, 1) > 0.78 ? Math.max(0, 1 - Math.hypot(kx, ky) * 1.6) : 0;
    // Les joints entre planches, et en bout de planche
    const end = (pv * 1.5) % 1 < 0.012 ? 0.6 : 1;
    const joint = (pu < 0.03 || pu > 0.97 ? 0.5 : 1) * end;
    const k = (0.78 + shade * 0.18 + fibre * 0.06 + fine * 0.06 - knot * 0.25) * joint;
    return [205 * k, 172 * k, 132 * k, joint < 1 ? 0 : 0.55 + fibre * 0.2 - knot * 0.3];
  });
}

/** Du bois peint (blanc, ou teinté par la matière) : des planches lisses, leurs joints, quelques écailles */
export function paintTex(): SurfaceTex {
  return surface("paint", 512, 1.2, 43, 2, (u, v, n) => {
    const plank = Math.floor(u * 6);
    const pu = u * 6 - plank;
    const joint = pu < 0.025 || pu > 0.975 ? 0.72 : 1;
    const wear = n(u * 30, v * 30, 30, 3);
    const chip = wear > 0.72 ? 0.86 : 1;
    const k = (0.93 + n(plank * 2.1, v * 4, 16, 2) * 0.06) * joint * chip;
    return [244 * k, 241 * k, 234 * k, joint < 1 ? 0 : 0.7 - (chip < 1 ? 0.2 : 0)];
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
  // Des petites feuilles serrées (deux couches de cellules) : chacune bombée, plus claire vers la lumière, des trous
  // d'ombre entre elles ; des touffes plus claires ou plus sombres par-dessus
  const A = 62;
  const B = 43;
  const front = makeCells(61, A, 1.7);
  const back = makeCells(62, B, 1.5);
  return surface("hedge2", 512, 0.8, 61, 4.5, (u, v, n) => {
    const clumps = n(u * 6, v * 6, 6, 3) * 0.65 + n(u * 2, v * 2, 2, 2) * 0.35;
    const f = front(u * A, v * A);
    const fGap = clamp01((f.f2 - f.f1) * 4.5);
    const fDome = clamp01(1 - f.f1 * 1.5);
    const fId = f.id;
    const b = back(u * B + 0.37, v * B + 0.61);
    const bGap = clamp01((b.f2 - b.f1) * 4);
    const bDome = clamp01(1 - b.f1 * 1.4);
    // La feuille de devant si on est dedans, sinon celle de derrière (plus sombre), sinon le creux
    const inFront = fDome * fGap > 0.18;
    const dome = inFront ? fDome : bDome * 0.7;
    const gap = inFront ? fGap : bGap * 0.8;
    const lit = inFront ? clamp01(1 - front(u * A - 0.1, v * A - 0.12).f1 * 1.5) - fDome : 0;
    const tone = hash01(inFront ? fId : b.id + 9999, 5);
    let k = (inFront ? 0.62 : 0.4) + dome * 0.28 + lit * 0.5 + (tone - 0.5) * 0.18 + (clumps - 0.5) * 0.4;
    k *= 0.5 + 0.5 * Math.pow(gap, 0.7);
    k = clamp01(k);
    const yellow = tone * 0.4 + clumps * 0.3;
    return [mix(26, 100 + yellow * 30, k), mix(52, 146 + yellow * 12, k), mix(20, 50, k), (inFront ? 0.6 : 0.25) + dome * 0.4 * gap];
  });
}

/** L'écorce : des sillons qui montent le long du tronc, des plaques plus claires entre eux */
export function barkTex(): SurfaceTex {
  return surface("bark", 256, 0.7, 91, 5, (u, v, n) => {
    const wob = n(u * 4, v * 4, 4, 3);
    const ridge = Math.abs(Math.sin((u * 7 + wob * 1.6) * Math.PI));
    const plate = n(u * 16, v * 16, 16, 2);
    const furrow = Math.pow(ridge, 0.45);
    const k = 0.38 + furrow * 0.42 + plate * 0.2;
    return [124 * k, 110 * k, 96 * k, furrow * 0.8 + plate * 0.2];
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
