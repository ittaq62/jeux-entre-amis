// Les matières des cartes, peintes une fois sur des toiles : pierres, crépi, planches, tuiles, béton, rouille,
// ballast… Des tons sourds, pour un village et une gare qui ont vécu. Et les camouflages des armes.

import * as THREE from "three";
import { CAMO_BY_ID, type CamoId } from "../../../shared/games/escarmouche/camos.ts";
import type { Mat } from "../../../shared/games/escarmouche/world.ts";

/** Un petit tirage toujours le même, pour que chaque toile se ressemble d'une fois sur l'autre */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d")!];
}

/** Du grain : des points clairs et sombres semés partout */
function grain(g: CanvasRenderingContext2D, size: number, r: () => number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    const s = 1 + r() * 2;
    g.fillRect(r() * size, r() * size, s, s);
  }
}

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

type Painter = (g: CanvasRenderingContext2D, size: number, r: () => number) => void;

const PAINT: Partial<Record<Mat, Painter>> = {
  pierre: (g, size, r) => {
    g.fillStyle = "#8d8577";
    g.fillRect(0, 0, size, size);
    const rows = 6;
    const h = size / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 40;
      while (x < size) {
        const w = 30 + r() * 46;
        const base = 0.78 + r() * 0.34;
        g.fillStyle = shade(r() < 0.5 ? "#9c9384" : "#857c6c", base);
        g.fillRect(x + 2, y * h + 2, w - 4, h - 4);
        x += w;
      }
    }
    g.strokeStyle = "rgba(40,36,30,.55)";
    g.lineWidth = 3;
    for (let y = 0; y <= rows; y++) {
      g.beginPath();
      g.moveTo(0, y * h);
      g.lineTo(size, y * h);
      g.stroke();
    }
    grain(g, size, r, 2600, 0.18);
  },
  crepi: (g, size, r) => {
    g.fillStyle = "#c7b08a";
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "120,96,66" : "230,214,180"},${0.08 + r() * 0.1})`;
      g.beginPath();
      g.ellipse(r() * size, r() * size, 10 + r() * 50, 6 + r() * 30, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    grain(g, size, r, 4000, 0.16);
  },
  crepi2: (g, size, r) => {
    g.fillStyle = "#b9b4a6";
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "90,92,88" : "220,218,206"},${0.08 + r() * 0.1})`;
      g.beginPath();
      g.ellipse(r() * size, r() * size, 10 + r() * 50, 6 + r() * 30, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    grain(g, size, r, 4000, 0.16);
  },
  bois: (g, size, r) => {
    g.fillStyle = "#6e5236";
    g.fillRect(0, 0, size, size);
    const n = 8;
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade("#76593b", 0.8 + r() * 0.35);
      g.fillRect(0, (i * size) / n + 1, size, size / n - 2);
      g.strokeStyle = "rgba(30,20,10,.25)";
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        const y = (i * size) / n + r() * (size / n);
        g.moveTo(0, y);
        g.bezierCurveTo(size / 3, y + r() * 4 - 2, (2 * size) / 3, y + r() * 4 - 2, size, y);
        g.stroke();
      }
    }
    grain(g, size, r, 1500, 0.12);
  },
  planche: (g, size, r) => {
    g.fillStyle = "#7b6247";
    g.fillRect(0, 0, size, size);
    const n = 6;
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade("#856a4c", 0.8 + r() * 0.3);
      g.fillRect((i * size) / n + 1, 0, size / n - 2, size);
    }
    grain(g, size, r, 1500, 0.12);
  },
  tuile: (g, size, r) => {
    g.fillStyle = "#8f4a33";
    g.fillRect(0, 0, size, size);
    const rows = 8;
    const h = size / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = -(y % 2) * 16; x < size; x += 32) {
        g.fillStyle = shade("#a2563a", 0.75 + r() * 0.35);
        g.beginPath();
        g.ellipse(x + 16, y * h + h * 0.8, 15, h * 0.75, 0, 0, Math.PI);
        g.fill();
      }
    }
    grain(g, size, r, 2000, 0.15);
  },
  beton: (g, size, r) => {
    g.fillStyle = "#8f9092";
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "60,60,62" : "200,200,196"},${0.05 + r() * 0.08})`;
      g.beginPath();
      g.ellipse(r() * size, r() * size, 10 + r() * 60, 6 + r() * 40, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(40,40,40,.35)";
    g.lineWidth = 2;
    g.strokeRect(0, 0, size, size);
    grain(g, size, r, 3500, 0.14);
  },
  metal: (g, size, r) => {
    g.fillStyle = "#5b636a";
    g.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 16) {
      g.fillStyle = x % 32 === 0 ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.12)";
      g.fillRect(x, 0, 8, size);
    }
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(110,62,30,${0.08 + r() * 0.15})`;
      g.beginPath();
      g.ellipse(r() * size, r() * size, 4 + r() * 18, 6 + r() * 30, 0, 0, Math.PI * 2);
      g.fill();
    }
    grain(g, size, r, 1500, 0.12);
  },
  rouille: (g, size, r) => {
    g.fillStyle = "#6f4630";
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "150,80,40" : "50,36,28"},${0.12 + r() * 0.2})`;
      g.beginPath();
      g.ellipse(r() * size, r() * size, 6 + r() * 30, 4 + r() * 20, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    grain(g, size, r, 3000, 0.2);
  },
  wagon: (g, size, r) => {
    g.fillStyle = "#6a2e22";
    g.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 32) {
      g.fillStyle = shade("#74342a", 0.85 + r() * 0.25);
      g.fillRect(x + 2, 0, 28, size);
    }
    g.fillStyle = "rgba(20,14,10,.5)";
    g.fillRect(0, size * 0.46, size, 6);
    grain(g, size, r, 2500, 0.16);
  },
  wagon2: (g, size, r) => {
    g.fillStyle = "#3f4a3c";
    g.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 32) {
      g.fillStyle = shade("#465242", 0.85 + r() * 0.25);
      g.fillRect(x + 2, 0, 28, size);
    }
    g.fillStyle = "rgba(20,14,10,.5)";
    g.fillRect(0, size * 0.46, size, 6);
    grain(g, size, r, 2500, 0.16);
  },
  gravier: (g, size, r) => {
    g.fillStyle = "#6f6b64";
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      const v = 70 + r() * 90;
      g.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`;
      g.beginPath();
      g.arc(r() * size, r() * size, 1 + r() * 2.6, 0, Math.PI * 2);
      g.fill();
    }
  },
  pave: (g, size, r) => {
    g.fillStyle = "#5c5750";
    g.fillRect(0, 0, size, size);
    const n = 8;
    const s = size / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = shade("#7d766b", 0.75 + r() * 0.4);
        const o = (y % 2) * (s / 2);
        g.beginPath();
        g.roundRect(((x * s + o) % size) + 2, y * s + 2, s - 4, s - 4, 6);
        g.fill();
      }
    }
    grain(g, size, r, 2500, 0.15);
  },
  herbe: (g, size, r) => {
    g.fillStyle = "#56653a";
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "120,140,70" : "52,64,32"},${0.3 + r() * 0.4})`;
      g.fillRect(r() * size, r() * size, 1.5, 3 + r() * 3);
    }
  },
  terre: (g, size, r) => {
    g.fillStyle = "#6b5641";
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "90,70,50" : "130,110,84"},${0.1 + r() * 0.2})`;
      g.beginPath();
      g.ellipse(r() * size, r() * size, 8 + r() * 30, 6 + r() * 20, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    grain(g, size, r, 3000, 0.2);
  },
  foin: (g, size, r) => {
    g.fillStyle = "#b39a55";
    g.fillRect(0, 0, size, size);
    g.lineWidth = 1.5;
    for (let i = 0; i < 900; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? "214,190,110" : "130,110,50"},.6)`;
      const x = r() * size;
      const y = r() * size;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + r() * 20 - 10, y + r() * 6 - 3);
      g.stroke();
    }
  },
  caisse: (g, size, r) => {
    g.fillStyle = "#86683f";
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = shade("#8f7046", 0.85 + r() * 0.25);
      g.fillRect(0, (i * size) / 5 + 1, size, size / 5 - 2);
    }
    g.strokeStyle = "#4d3a22";
    g.lineWidth = 14;
    g.strokeRect(7, 7, size - 14, size - 14);
    g.beginPath();
    g.moveTo(10, 10);
    g.lineTo(size - 10, size - 10);
    g.stroke();
    grain(g, size, r, 1200, 0.12);
  },
};

/** La taille d'un motif dans le monde (mètres) : une toile couvre ce carré */
export const TILE: Partial<Record<Mat, number>> = {
  pierre: 2.4,
  crepi: 3,
  crepi2: 3,
  bois: 2,
  planche: 1.6,
  tuile: 2,
  beton: 3,
  metal: 2.4,
  rouille: 2.4,
  wagon: 3,
  wagon2: 3,
  gravier: 2.5,
  pave: 2,
  herbe: 3,
  terre: 3,
  foin: 1.2,
  caisse: 1.2,
  sol: 3,
};

const cache = new Map<string, THREE.CanvasTexture>();

/** La toile d'une matière (une seule par matière, partagée) */
export function matTexture(m: Mat, size = 256): THREE.CanvasTexture | null {
  const key = `${m}:${size}`;
  const known = cache.get(key);
  if (known) return known;
  const paint = PAINT[m === "sol" ? "terre" : m];
  if (!paint) return null;
  const [c, g] = canvas(size);
  let seed = 0;
  for (const ch of m) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  paint(g, size, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** La toile d'un camouflage, pour les armes */
export function camoTexture(id: CamoId): THREE.CanvasTexture {
  const key = `camo:${id}`;
  const known = cache.get(key);
  if (known) return known;
  const c0 = CAMO_BY_ID.get(id) ?? CAMO_BY_ID.get("usine")!;
  const size = 128;
  const [c, g] = canvas(size);
  const r = rng(id.length * 7919 + id.charCodeAt(0));
  const [base, ...spots] = c0.colors;
  g.fillStyle = base!;
  g.fillRect(0, 0, size, size);
  if (c0.pattern === "taches") {
    for (let i = 0; i < 26; i++) {
      g.fillStyle = spots[i % spots.length]!;
      g.beginPath();
      g.ellipse(r() * size, r() * size, 8 + r() * 18, 5 + r() * 10, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  } else if (c0.pattern === "pixels") {
    for (let i = 0; i < 70; i++) {
      g.fillStyle = spots[i % spots.length]!;
      g.fillRect(Math.floor((r() * size) / 8) * 8, Math.floor((r() * size) / 8) * 8, 8 * (1 + Math.floor(r() * 2)), 8);
    }
  } else if (c0.pattern === "bandes") {
    g.lineWidth = 7;
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = spots[i % spots.length]!;
      const x = r() * size;
      g.beginPath();
      g.moveTo(x, -10);
      g.bezierCurveTo(x + 30, size * 0.3, x - 30, size * 0.7, x + 10, size + 10);
      g.stroke();
    }
  } else {
    const grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, spots[0] ?? base!);
    grad.addColorStop(0.5, base!);
    grad.addColorStop(1, spots[1] ?? base!);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  grain(g, size, r, 500, 0.1);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Un dégradé rond, pour les lueurs, la fumée, la poussière */
export function softDot(): THREE.CanvasTexture {
  const key = "dot";
  const known = cache.get(key);
  if (known) return known;
  const [c, g] = canvas(64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  cache.set(key, t);
  return t;
}

/** Le ciel : un dégradé, du sol à l'horizon puis au zénith */
export function skyTexture(light: "soir" | "gris"): THREE.CanvasTexture {
  const key = `sky:${light}`;
  const known = cache.get(key);
  if (known) return known;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  if (light === "soir") {
    grad.addColorStop(0, "#3d5a80");
    grad.addColorStop(0.45, "#a9b8c4");
    grad.addColorStop(0.5, "#e8c9a0");
    grad.addColorStop(0.55, "#a89a86");
    grad.addColorStop(1, "#5d5446");
  } else {
    grad.addColorStop(0, "#5f6c78");
    grad.addColorStop(0.45, "#a3acb3");
    grad.addColorStop(0.52, "#b9bec0");
    grad.addColorStop(0.58, "#8c8e8a");
    grad.addColorStop(1, "#55574f");
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Le tissu d'une tenue : sa couleur, son motif (taches, petits carrés, feuillage) et un grain de toile */
export function clothTexture(base: string, spots: string[], pattern: "uni" | "taches" | "pixels" | "feuillu"): THREE.CanvasTexture {
  const key = `cloth:${base}:${spots.join(",")}:${pattern}`;
  const known = cache.get(key);
  if (known) return known;
  const size = 128;
  const [c, g] = canvas(size);
  const r = rng(base.charCodeAt(1) * 131 + base.charCodeAt(3) * 7 + pattern.length);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  if (pattern === "taches" && spots.length > 0) {
    for (let i = 0; i < 34; i++) {
      g.fillStyle = spots[i % spots.length]!;
      g.beginPath();
      const x = r() * size;
      const y = r() * size;
      const rx = 6 + r() * 14;
      const ry = 4 + r() * 8;
      // Chaque tache se répète de l'autre côté du bord : le motif se raccorde
      for (const [ox, oy] of [
        [0, 0],
        [size, 0],
        [-size, 0],
        [0, size],
        [0, -size],
      ] as const) {
        g.ellipse(x + ox, y + oy, rx, ry, r() * 3, 0, Math.PI * 2);
      }
      g.fill();
    }
  } else if (pattern === "pixels" && spots.length > 0) {
    for (let i = 0; i < 90; i++) {
      g.fillStyle = spots[i % spots.length]!;
      g.fillRect(Math.floor((r() * size) / 6) * 6, Math.floor((r() * size) / 6) * 6, 6 * (1 + Math.floor(r() * 3)), 6);
    }
  } else if (pattern === "feuillu" && spots.length > 0) {
    for (let i = 0; i < 160; i++) {
      g.fillStyle = spots[i % spots.length]!;
      g.beginPath();
      g.ellipse(r() * size, r() * size, 2 + r() * 5, 1 + r() * 2.5, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // La trame de la toile, et un peu d'usure
  g.globalAlpha = 0.07;
  g.fillStyle = "#000";
  for (let y = 0; y < size; y += 2) g.fillRect(0, y, size, 1);
  g.globalAlpha = 1;
  grain(g, size, r, 900, 0.12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Le relief d'une matière, tiré de sa toile : le clair dépasse, le sombre (les joints, les fentes) s'enfonce */
export function normalTexture(m: Mat, size = 256, strength = 1): THREE.CanvasTexture | null {
  const src = matTexture(m, size);
  return src ? normalFrom(src, `normal:${m}:${size}:${strength}`, strength) : null;
}

/** Le relief tiré de n'importe quelle toile */
export function normalFrom(src: THREE.CanvasTexture, key: string, strength = 1): THREE.CanvasTexture {
  const known = cache.get(key);
  if (known) return known;
  const img = src.image as HTMLCanvasElement;
  const w = img.width;
  const h = img.height;
  const data = img.getContext("2d")!.getImageData(0, 0, w, h).data;
  const height = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) height[i] = (data[i * 4]! * 0.3 + data[i * 4 + 1]! * 0.55 + data[i * 4 + 2]! * 0.15) / 255;
  const [c, g] = canvas(w);
  const out = g.createImageData(w, h);
  const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel : la pente du relief dans les deux sens (la toile se raccorde aux bords)
      const dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const nx = -dx * strength * 2;
      const ny = dy * strength * 2;
      const len = Math.hypot(nx, ny, 1);
      const o = (y * w + x) * 4;
      out.data[o] = ((nx / len) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      out.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Des planches verticales claires (volets, portes) : on les teint de la couleur voulue */
export function boardTexture(size = 128): THREE.CanvasTexture {
  const key = `board:${size}`;
  const known = cache.get(key);
  if (known) return known;
  const [c, g] = canvas(size);
  const r = rng(4242);
  g.fillStyle = "#d8d8d4";
  g.fillRect(0, 0, size, size);
  const n = 5;
  for (let i = 0; i < n; i++) {
    g.fillStyle = shade("#dcdcd6", 0.86 + r() * 0.16);
    g.fillRect((i * size) / n + 1, 0, size / n - 2, size);
    g.strokeStyle = "rgba(60,60,60,.18)";
    for (let k = 0; k < 4; k++) {
      const x = (i * size) / n + 2 + r() * (size / n - 4);
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + r() * 3 - 1.5, size / 3, x + r() * 3 - 1.5, (2 * size) / 3, x, size);
      g.stroke();
    }
  }
  // Les barres et l'écharpe du volet
  g.fillStyle = "rgba(0,0,0,.18)";
  g.fillRect(0, size * 0.16, size, size * 0.06);
  g.fillRect(0, size * 0.78, size, size * 0.06);
  grain(g, size, r, 900, 0.1);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}
