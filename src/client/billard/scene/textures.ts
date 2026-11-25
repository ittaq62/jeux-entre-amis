// Les textures du billard, dessinées à la volée : le feutre du tapis (ses fibres, l'ombre au pied des bandes, les
// mouches), les bois vernis (veinés), les billes (couleurs, bandeaux, numéros), la queue (le fût, les filets, la poignée).

import * as THREE from "three";

export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

export function tex(c: HTMLCanvasElement, color = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Un bruit doux qui boucle (période en cases) */
export function valueNoise(seed: number, period: number) {
  const rnd = seeded(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const at = (x: number, y: number) => g[(((y % period) + period) % period) * period + (((x % period) + period) % period)]!;
  return (x: number, y: number) => {
    const x0 = Math.floor(x),
      y0 = Math.floor(y);
    const fx = x - x0,
      fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx),
      sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

export function fbm(noise: (x: number, y: number) => number, x: number, y: number, oct = 4): number {
  let v = 0,
    amp = 0.5,
    f = 1,
    norm = 0;
  for (let i = 0; i < oct; i++) {
    v += noise(x * f, y * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / norm;
}

const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = (c: number[]) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",")})`;
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i]! - v) * k);

// ---------------------------------------------------------------------------
// Le feutre
// ---------------------------------------------------------------------------

const feltCache = new Map<string, THREE.CanvasTexture>();

/** Les fibres du feutre, en relief (une carte de normales qui se répète) */
export function feltNormal(): THREE.CanvasTexture {
  const key = "normal";
  const hit = feltCache.get(key);
  if (hit) return hit;
  const N = 256;
  const [c, g] = canvas(N, N);
  const img = g.createImageData(N, N);
  const n1 = valueNoise(11, 64),
    n2 = valueNoise(12, 16);
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = fbm(n1, x / 4, y / 4, 3) * 0.7 + n2(x / 16, y / 16) * 0.3;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)]! - h[y * N + ((x + N - 1) % N)]!;
      const dy = h[((y + 1) % N) * N + x]! - h[((y + N - 1) % N) * N + x]!;
      const i = (y * N + x) * 4;
      img.data[i] = 128 + dx * 160;
      img.data[i + 1] = 128 + dy * 160;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, false, true);
  feltCache.set(key, t);
  return t;
}

/**
 * Le dessus du tapis entier (une seule image, sans répétition) : sa couleur, à peine marbrée, plus sombre au pied des
 * bandes et dans les coins, et les mouches (les petits points de tête et de pied). `w`, `h` : la taille du tapis en mètres.
 */
export function feltTop(color: string, shade: string, w: number, h: number, spots: [number, number][], key: string): THREE.CanvasTexture {
  const hit = feltCache.get(key);
  if (hit) return hit;
  const W = 1024,
    H = Math.round((1024 * h) / w);
  const [c, g] = canvas(W, H);
  const base = hexRgb(color),
    dark = hexRgb(shade);
  const img = g.createImageData(W, H);
  const n = valueNoise(5, 32);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W,
        v = y / H;
      // L'ombre au pied des bandes : la distance au bord
      const edge = Math.min(u, 1 - u) * w,
        edgeV = Math.min(v, 1 - v) * h;
      const d = Math.min(edge, edgeV);
      const ao = 1 - 0.34 * Math.exp(-d / 0.035) - 0.1 * Math.exp(-d / 0.12);
      const grain = 0.96 + fbm(n, u * 40, v * 20, 3) * 0.08;
      const k = Math.max(0, Math.min(1, (1 - ao) * 1.4));
      const col = mix(base, dark, k).map((ch) => ch * grain * (0.85 + 0.15 * ao));
      const i = (y * W + x) * 4;
      img.data[i] = col[0]!;
      img.data[i + 1] = col[1]!;
      img.data[i + 2] = col[2]!;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Les mouches
  g.fillStyle = "rgba(255,255,255,0.55)";
  for (const [sx, sy] of spots) {
    g.beginPath();
    g.arc(((sx + w / 2) / w) * W, ((sy + h / 2) / h) * H, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  const t = tex(c);
  feltCache.set(key, t);
  return t;
}

/** Le feutre des bandes (un drap uni qui se répète, à peine marbré) */
export function feltTile(color: string): THREE.CanvasTexture {
  const key = `tile:${color}`;
  const hit = feltCache.get(key);
  if (hit) return hit;
  const N = 128;
  const [c, g] = canvas(N, N);
  const base = hexRgb(color);
  const img = g.createImageData(N, N);
  const n = valueNoise(9, 16);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = 0.93 + fbm(n, x / 8, y / 8, 3) * 0.12;
      const i = (y * N + x) * 4;
      img.data[i] = base[0] * k;
      img.data[i + 1] = base[1] * k;
      img.data[i + 2] = base[2] * k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, true, true);
  feltCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------
// Le bois
// ---------------------------------------------------------------------------

export interface WoodStyle {
  /** Le bois clair et le bois sombre des veines */
  light: string;
  dark: string;
  /** La densité des veines, leur ondulation */
  rings: number;
  wave: number;
}

export const WOODS: Record<string, WoodStyle> = {
  acajou: { light: "#8a3b22", dark: "#4a1a0e", rings: 26, wave: 0.6 },
  noyer: { light: "#7a5236", dark: "#3b2414", rings: 22, wave: 0.8 },
  chene: { light: "#b48a58", dark: "#7a5530", rings: 30, wave: 0.5 },
  ebene: { light: "#2a211c", dark: "#120d0a", rings: 34, wave: 0.4 },
  merisier: { light: "#9c4f2e", dark: "#5c2714", rings: 24, wave: 0.7 },
  laque: { light: "#151517", dark: "#0b0b0c", rings: 6, wave: 0.2 },
  blanc: { light: "#ece6dc", dark: "#d8d0c2", rings: 8, wave: 0.2 },
  teck: { light: "#a06a3c", dark: "#5a3618", rings: 28, wave: 0.6 },
  erable: { light: "#e2c595", dark: "#b8945e", rings: 30, wave: 0.4 },
};

const woodCache = new Map<string, THREE.CanvasTexture>();

/** Un bois veiné qui se répète (les veines le long de la planche, axe u) */
export function woodTexture(kind: string, seed = 3): THREE.CanvasTexture {
  const key = `${kind}:${seed}`;
  const hit = woodCache.get(key);
  if (hit) return hit;
  const st = WOODS[kind] ?? WOODS.acajou!;
  const W = 1024,
    H = 256;
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  const light = hexRgb(st.light),
    dark = hexRgb(st.dark);
  const n = valueNoise(seed, 32),
    m = valueNoise(seed + 7, 64);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W,
        v = y / H;
      // Les veines : des cernes presque parallèles à la planche (axe u), qui ondulent à peine
      const warp = fbm(n, u * 3, v * 3, 4) * st.wave;
      const ring = Math.sin((v * st.rings + warp * 1.2) * Math.PI * 2);
      const fine = fbm(m, u * 96, v * 6, 2);
      let k = 0.55 + ring * 0.16 + (fine - 0.5) * 0.3;
      k = Math.max(0, Math.min(1, k));
      const col = mix(dark, light, k);
      const i = (y * W + x) * 4;
      img.data[i] = col[0]!;
      img.data[i + 1] = col[1]!;
      img.data[i + 2] = col[2]!;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, true, true);
  woodCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------
// Les billes
// ---------------------------------------------------------------------------

export const BALL_COLORS: Record<number, string> = {
  1: "#f2c21b",
  2: "#1f4fbf",
  3: "#d42a24",
  4: "#5b2a8c",
  5: "#f07a1a",
  6: "#1b8a4a",
  7: "#7a2418",
  8: "#141414",
};

/** Les couleurs de chaque jeu de billes (la couleur de base de chaque numéro, de 1 à 8) */
const SET_COLORS: Record<string, Record<number, string>> = {
  classiques: BALL_COLORS,
  pastel: { 1: "#f6dc7a", 2: "#8fb4ec", 3: "#f2948e", 4: "#c2a2e6", 5: "#f7b98a", 6: "#93d6ad", 7: "#d49a8a", 8: "#4a4a58" },
  neon: { 1: "#fff200", 2: "#00b3ff", 3: "#ff2040", 4: "#c400ff", 5: "#ff8a00", 6: "#00ff7a", 7: "#ff3dc8", 8: "#101018" },
  bois: { 1: "#d9b277", 2: "#8a6844", 3: "#b07040", 4: "#6e4a30", 5: "#c48a50", 6: "#7d6a40", 7: "#5c3a22", 8: "#2a1c12" },
  marbre: { 1: "#e6c86e", 2: "#4a6aa8", 3: "#b8504a", 4: "#7a5a9a", 5: "#d8905a", 6: "#4a8a68", 7: "#8a5048", 8: "#202024" },
  metal: { 1: "#d8b24a", 2: "#4a78c8", 3: "#c84a4a", 4: "#8a5ac8", 5: "#d8883a", 6: "#3aa86a", 7: "#a85a3a", 8: "#2a2a30" },
  planetes: { 1: "#ffb52e", 2: "#3a7ad8", 3: "#c8502a", 4: "#a87ad8", 5: "#e8a060", 6: "#4aa8a0", 7: "#b86a4a", 8: "#0e0e1a" },
};

export const CAROM_COLORS: Record<number, string> = { 0: "#f4f1e8", 1: "#f3c534", 2: "#c8262a" };

const ballCache = new Map<string, HTMLCanvasElement>();

/**
 * Une bille : une image en équirectangulaire (le tour de la bille en largeur, d'un pôle à l'autre en hauteur). Les
 * pleines de leur couleur, les rayées blanches avec un bandeau ; le numéro dans un rond blanc, des deux côtés.
 */
export function ballCanvas(id: number, set: string, carom = false): HTMLCanvasElement {
  const key = `${id}:${set}:${carom}`;
  const hit = ballCache.get(key);
  if (hit) return hit;
  const c = drawBall(id, set, carom, 512);
  ballCache.set(key, c);
  return c;
}

/**
 * La même bille sur `W` de large (la moitié en hauteur), sans la garder : tout y est mesuré en fractions de l'image du
 * jeu (512), le bruit compris, pour qu'une vignette dessinée directement à sa taille soit la bille du jeu en petit
 */
export function drawBall(id: number, set: string, carom: boolean, W: number): HTMLCanvasElement {
  const H = Math.round(W / 2),
    s = W / 512;
  const [c, g] = canvas(W, H);
  const colors = SET_COLORS[set] ?? BALL_COLORS;
  const ivory = set === "bois" ? "#e8d2a8" : set === "neon" ? "#f8f8ff" : "#f6f2e6";
  if (carom) {
    g.fillStyle = CAROM_COLORS[id] ?? ivory;
    g.fillRect(0, 0, W, H);
    // La blanche « à point » des jeux de carambole se distingue de la jaune par sa couleur ; un léger voile nacré
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "rgba(255,255,255,0.08)");
    grd.addColorStop(1, "rgba(0,0,0,0.06)");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  } else if (id === 0) {
    g.fillStyle = ivory;
    g.fillRect(0, 0, W, H);
    // La blanche : quelques points rouges discrets, pour voir sa rotation
    g.fillStyle = "#c8262a";
    for (const [u, v] of [
      [0.25, 0.5],
      [0.75, 0.5],
      [0.0, 0.5],
      [0.5, 0.5],
      [0.5, 0.08],
      [0.5, 0.92],
    ] as [number, number][]) {
      g.beginPath();
      g.ellipse(u * W, v * H, (5 * s) / Math.max(0.2, Math.sin(v * Math.PI)), 5 * s, 0, 0, Math.PI * 2);
      g.fill();
      if (u === 0) {
        g.beginPath();
        g.ellipse(W, v * H, 5 * s, 5 * s, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else {
    const base = colors[id > 8 ? id - 8 : id] ?? "#888";
    const stripe = id > 8;
    g.fillStyle = stripe ? ivory : base;
    g.fillRect(0, 0, W, H);
    if (stripe) {
      g.fillStyle = base;
      g.fillRect(0, H * 0.29, W, H * 0.42);
    }
    // Les veines du bois ou du marbre
    if (set === "bois" || set === "marbre") {
      const n = valueNoise(id * 13 + 3, 16);
      const img = g.getImageData(0, 0, W, H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const k =
            set === "bois"
              ? 0.85 + 0.2 * Math.sin((y / H) * 60 + fbm(n, x / (64 * s), y / (32 * s), 3) * 9)
              : 0.8 + 0.35 * Math.pow(Math.abs(Math.sin(fbm(n, x / (48 * s), y / (48 * s), 4) * 14)), 6);
          const i = (y * W + x) * 4;
          img.data[i] = img.data[i]! * k;
          img.data[i + 1] = img.data[i + 1]! * k;
          img.data[i + 2] = img.data[i + 2]! * k;
        }
      g.putImageData(img, 0, 0);
    }
    if (set === "planetes") {
      // Des bandes de nuages, des cratères : une petite planète par bille
      const n = valueNoise(id * 7 + 1, 16);
      const img = g.getImageData(0, 0, W, H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const k = 0.78 + 0.4 * fbm(n, x / (40 * s), (y / (40 * s)) * (id % 2 ? 4 : 1), 4);
          const i = (y * W + x) * 4;
          img.data[i] = img.data[i]! * k;
          img.data[i + 1] = img.data[i + 1]! * k;
          img.data[i + 2] = img.data[i + 2]! * k;
        }
      g.putImageData(img, 0, 0);
    }
    // Le numéro, deux fois
    for (const u of [0.25, 0.75]) {
      const cx = u * W,
        cy = H / 2;
      g.fillStyle = ivory;
      g.beginPath();
      g.ellipse(cx, cy, 34 * s, 34 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = id === 8 && set === "neon" ? "#ff2bd6" : "#16161a";
      g.font = `bold ${(id > 9 ? 34 : 40) * s}px "Libre Franklin Variable", Arial, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(id), cx, cy + 2 * s);
      if (id === 6 || id === 9) g.fillRect(cx - 10 * s, cy + 21 * s, 20 * s, 3 * s);
    }
  }
  return c;
}

// ---------------------------------------------------------------------------
// La queue
// ---------------------------------------------------------------------------

export interface CueStyle {
  /** Le bois du fût (le haut, fin) et du talon (le bas) */
  shaft: string;
  butt: string;
  /** Les pointes de marqueterie du talon, la poignée, les filets */
  points: string | null;
  wrap: string;
  rings: string;
  /** Un fût qui brille (le néon), un fût translucide (le cristal) */
  glow?: string;
  glass?: boolean;
  /** Un tissage de carbone */
  carbon?: boolean;
}

export const CUE_STYLES: Record<string, CueStyle> = {
  erable: { shaft: "#e8cc9a", butt: "#8a5a32", points: "#2a1a10", wrap: "#2c2c30", rings: "#d8d2c4" },
  noyer: { shaft: "#e2c491", butt: "#5a3a22", points: "#d9c39a", wrap: "#5c2420", rings: "#c8b088" },
  ebene: { shaft: "#ead29e", butt: "#18120e", points: "#efe7d6", wrap: "#f0ebe0", rings: "#efe7d6" },
  rouge: { shaft: "#ead09c", butt: "#9a1420", points: "#f2e4c8", wrap: "#1a1a1c", rings: "#d8b46a" },
  nuit: { shaft: "#e6cc98", butt: "#14244a", points: "#b8c8e8", wrap: "#0e1424", rings: "#c8d4ec" },
  marqueterie: { shaft: "#e8cc96", butt: "#6a3a1c", points: "#e8c890", wrap: "#2a1e16", rings: "#e8c890" },
  carbone: { shaft: "#2a2a2e", butt: "#1a1a1c", points: null, wrap: "#3a3a40", rings: "#8a8a92", carbon: true },
  neon: { shaft: "#20202a", butt: "#12121a", points: "#00e5ff", wrap: "#1a1a24", rings: "#ff2bd6", glow: "#00e5ff" },
  or: { shaft: "#e8cc96", butt: "#111111", points: "#e8b84a", wrap: "#111111", rings: "#f2c75a" },
  cristal: { shaft: "#cfe8ff", butt: "#9ccaf2", points: "#ffffff", wrap: "#b8dcff", rings: "#ffffff", glass: true },
};

/**
 * L'habit de la queue, de la pointe (v = 0) au talon (v = 1) : le procédé bleu, la virole blanche, le fût, la bague du
 * joint, l'avant-talon et ses pointes, la poignée, le talon, la butée. Les proportions suivent `CUE_PARTS`.
 */
export const CUE_PARTS = { tip: 0.008, ferrule: 0.025, joint: 0.52, forearm: 0.7, wrapEnd: 0.88, sleeve: 0.985 };

export function cueTexture(style: string): THREE.CanvasTexture {
  const t = tex(cueCanvas(style, 128, 2048));
  t.anisotropy = 4;
  return t;
}

/**
 * L'habit de la queue sur `W` (le tour) × `H` (la longueur) : tout y est mesuré en fractions de la texture du jeu
 * (128 × 2048), le bruit compris, pour qu'une vignette dessinée directement à sa taille soit la queue du jeu en petit
 */
export function cueCanvas(style: string, W: number, H: number): HTMLCanvasElement {
  const st = CUE_STYLES[style] ?? CUE_STYLES.erable!;
  const sx = W / 128,
    sy = H / 2048;
  const [c, g] = canvas(W, H);
  const P = CUE_PARTS;
  const y = (v: number) => v * H;
  // Le procédé et la virole
  g.fillStyle = "#3a6fb8";
  g.fillRect(0, 0, W, y(P.tip));
  g.fillStyle = "#f4f0e6";
  g.fillRect(0, y(P.tip), W, y(P.ferrule - P.tip));
  // Le fût, veiné
  const n = valueNoise(style.length * 31 + 7, 32);
  const shaft = hexRgb(st.shaft),
    butt = hexRgb(st.butt);
  const img = g.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    const v = py / H;
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      let col: number[];
      if (v < P.ferrule) continue;
      if (st.carbon) {
        const weave = ((Math.floor(px / (8 * sx)) + Math.floor(py / (8 * sy))) % 2) * 0.25 + 0.75;
        col = (v < P.joint ? shaft : butt).map((ch) => ch * weave + 18 * (1 - weave));
      } else if (v < P.joint) {
        const k = 0.92 + (fbm(n, px / (32 * sx), py / (220 * sy), 3) - 0.5) * 0.18;
        col = shaft.map((ch) => ch * k);
      } else {
        const k = 0.85 + (fbm(n, px / (24 * sx), py / (80 * sy), 4) - 0.5) * 0.45;
        col = butt.map((ch) => ch * k);
      }
      img.data[i] = col[0]!;
      img.data[i + 1] = col[1]!;
      img.data[i + 2] = col[2]!;
      img.data[i + 3] = 255;
    }
  }
  // On remet le procédé et la virole par-dessus
  g.putImageData(img, 0, 0, 0, y(P.ferrule), W, H);
  // Le joint : une bague claire et deux filets
  g.fillStyle = st.rings;
  g.fillRect(0, y(P.joint) - 10 * sy, W, 20 * sy);
  g.fillStyle = "#101010";
  g.fillRect(0, y(P.joint) + 10 * sy, W, 3 * sy);
  g.fillRect(0, y(P.joint) - 13 * sy, W, 3 * sy);
  // Les pointes de l'avant-talon : des triangles qui montent depuis la poignée
  if (st.points) {
    g.fillStyle = st.points;
    for (let k = 0; k < 4; k++) {
      const cx = ((k + 0.5) / 4) * W;
      g.beginPath();
      g.moveTo(cx - W / 10, y(P.forearm + 0.012));
      g.lineTo(cx, y(P.joint + 0.06));
      g.lineTo(cx + W / 10, y(P.forearm + 0.012));
      g.closePath();
      g.fill();
    }
  }
  // Les filets autour de la poignée
  g.fillStyle = st.rings;
  for (const v of [P.forearm, P.wrapEnd]) {
    g.fillRect(0, y(v) - 4 * sy, W, 8 * sy);
  }
  // La poignée : un fil enroulé
  const wrap = hexRgb(st.wrap);
  // (en petit, chaque ligne prend la moyenne des tours de fil qu'elle couvre)
  const sub = Math.max(1, Math.ceil(1 / sy));
  for (let py = Math.round(y(P.forearm) + 4 * sy); py < y(P.wrapEnd) - 4 * sy; py++) {
    let k = 0;
    for (let j = 0; j < sub; j++) k += 0.75 + 0.25 * Math.abs(Math.sin(((py + j / sub) / sy) * 0.9));
    k /= sub;
    g.fillStyle = rgb(wrap.map((ch) => ch * k + 12 * (1 - k)));
    g.fillRect(0, py, W, 1);
  }
  // La butée en caoutchouc
  g.fillStyle = "#111";
  g.fillRect(0, y(P.sleeve), W, H - y(P.sleeve));
  if (st.glow) {
    // Deux fines lignes lumineuses le long du fût
    g.fillStyle = st.glow;
    g.fillRect(W * 0.2, y(P.ferrule + 0.01), 4 * sx, y(P.joint - P.ferrule - 0.02));
    g.fillRect(W * 0.7, y(P.ferrule + 0.01), 4 * sx, y(P.joint - P.ferrule - 0.02));
  }
  return c;
}
