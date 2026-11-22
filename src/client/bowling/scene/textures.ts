// Les textures du bowling, dessinées sur des toiles : le bois de la piste latte par latte (son fil, ses nœuds, le
// vernis), les repères peints (la ligne de faute, les flèches, les points, les places des quilles), les motifs des
// boules (marbrée, galaxie, pastèque…) et des quilles (les deux bandes rouges du cou, le bois, le sucre d'orge…).

import * as THREE from "three";
import { colorOf, type BowlingLook } from "../../../shared/games/bowling/looks.ts";
import { LANE_HALF, PIN_H } from "../../../shared/games/bowling/lane.ts";

/** Un hasard qui se répète (le même dessin à chaque fois) */
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

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function tex(c: HTMLCanvasElement, color = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Un bruit doux, en 2D, qui se répète sur une grille de cette taille */
export function valueNoise(seed: number, period: number) {
  const r = seeded(seed);
  const g = Array.from({ length: period * period }, () => r());
  const at = (i: number, j: number) => g[(((j % period) + period) % period) * period + (((i % period) + period) % period)]!;
  return (x: number, y: number) => {
    const i = Math.floor(x),
      j = Math.floor(y);
    const fx = x - i,
      fy = y - j;
    const sx = fx * fx * (3 - 2 * fx),
      sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** Plusieurs octaves du même bruit */
export function fbm(noise: (x: number, y: number) => number, x: number, y: number, oct = 4): number {
  let s = 0,
    a = 0.5,
    f = 1,
    n = 0;
  for (let i = 0; i < oct; i++) {
    s += noise(x * f, y * f) * a;
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

const BOARDS = 39;

/**
 * Le bois de la piste : 39 lattes d'érable ou de pin, chacune sa teinte, son fil qui court tout du long, quelques
 * nœuds, les joints sombres entre elles. `kind` : la piste (érable doré), le plateau (érable clair), l'élan.
 */
const woodCache = new Map<string, THREE.CanvasTexture>();

/** Le même bois pour toutes les pistes (on le dessine une fois) ; chaque piste règle sa répétition sur une copie */
export function laneWood(kind: "lane" | "deck" | "approach", seed = 7): THREE.Texture {
  const key = `${kind}:${seed}`;
  let base = woodCache.get(key);
  if (!base) {
    base = drawLaneWood(kind, seed);
    woodCache.set(key, base);
  }
  const t = base.clone();
  t.needsUpdate = true;
  return t;
}

function drawLaneWood(kind: "lane" | "deck" | "approach", seed: number): THREE.CanvasTexture {
  const W = 1024,
    H = 2048;
  const [c, g] = canvas(W, H);
  const r = seeded(seed);
  const base = kind === "deck" ? [236, 214, 174] : kind === "approach" ? [222, 190, 140] : [226, 186, 128];
  const bw = W / BOARDS;
  for (let b = 0; b < BOARDS; b++) {
    const x0 = Math.round(b * bw),
      x1 = Math.round((b + 1) * bw);
    // Une teinte par latte : l'érable et le pin alternent un peu au milieu de la piste
    const pine = kind === "lane" && b > 6 && b < 32 && b % 3 === 1;
    const k = 0.9 + r() * 0.16;
    const warm = pine ? 1.04 : 1;
    const col = [base[0]! * k * warm, base[1]! * k * (pine ? 0.96 : 1), base[2]! * k * (pine ? 0.86 : 1)];
    g.fillStyle = `rgb(${col.map((v) => Math.min(255, Math.round(v))).join(",")})`;
    g.fillRect(x0, 0, x1 - x0, H);
    // Le fil : des traits très fins, plus ou moins foncés, qui ondulent à peine
    const lines = 7 + Math.floor(r() * 6);
    for (let i = 0; i < lines; i++) {
      const lx = x0 + 1 + r() * (x1 - x0 - 2);
      const dark = 0.05 + r() * 0.13;
      g.strokeStyle = `rgba(${pine ? "120,70,20" : "140,90,40"},${dark})`;
      g.lineWidth = 0.6 + r() * 1.3;
      g.beginPath();
      const amp = 0.4 + r() * 1.6,
        freq = 0.002 + r() * 0.006,
        ph = r() * 10;
      for (let y = 0; y <= H; y += 16) {
        const x = lx + Math.sin(y * freq + ph) * amp;
        if (y === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // Des reflets du bois (des taches longues un peu plus claires)
    for (let i = 0; i < 6; i++) {
      const y = r() * H,
        h = 60 + r() * 260;
      const grad = g.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, "rgba(255,240,210,0)");
      grad.addColorStop(0.5, `rgba(255,240,210,${0.05 + r() * 0.08})`);
      grad.addColorStop(1, "rgba(255,240,210,0)");
      g.fillStyle = grad;
      g.fillRect(x0, y, x1 - x0, h);
    }
    // Quelques petits nœuds
    if (r() < 0.35) {
      const ny = r() * H,
        nx = x0 + (x1 - x0) / 2;
      g.fillStyle = "rgba(110,60,20,0.35)";
      g.beginPath();
      g.ellipse(nx, ny, (x1 - x0) * 0.22, 7 + r() * 8, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Le joint avec la latte voisine
    g.fillStyle = "rgba(70,40,15,0.45)";
    g.fillRect(x1 - 1, 0, 1, H);
  }
  // Les bouts des lattes de l'élan (des planches plus courtes)
  if (kind !== "lane") {
    for (let b = 0; b < BOARDS; b++) {
      const y = ((b * 733) % 997) / 997;
      g.fillStyle = "rgba(70,40,15,0.35)";
      g.fillRect(Math.round(b * bw), y * H, Math.round(bw), 1.5);
    }
  }
  return tex(c, true, true);
}

/**
 * Les repères peints sur la piste, sur une toile transparente qui couvre toute la longueur : la ligne de faute, les
 * points à 2 m, les sept flèches à 4,5 m (en V), les repères lointains, et les places des quilles sur le plateau.
 */
export function laneMarks(length: number, pinSpots: readonly { x: number; z: number }[]): THREE.CanvasTexture {
  // 1 px = 1 cm en long, 4 px par cm en large
  const W = 512,
    H = Math.round(length * 100);
  const [c, g] = canvas(W, H);
  const pxX = (x: number) => ((x + LANE_HALF) / (2 * LANE_HALF)) * W;
  const pxZ = (dist: number) => H - dist * 100;
  const board = (n: number) => -LANE_HALF + ((n - 0.5) / BOARDS) * 2 * LANE_HALF;
  g.clearRect(0, 0, W, H);
  // La ligne de faute
  g.fillStyle = "#2a1414";
  g.fillRect(0, pxZ(0.03), W, 4);
  // Les points à 2,1 m
  g.fillStyle = "#3b1b10";
  for (const n of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) {
    g.beginPath();
    g.arc(pxX(board(n)), pxZ(2.13), 4, 0, Math.PI * 2);
    g.fill();
  }
  // Les flèches : sept triangles en V, la pointe vers les quilles
  const arrows = [5, 10, 15, 20, 25, 30, 35];
  arrows.forEach((n, i) => {
    const off = Math.abs(i - 3);
    const d = 4.88 - off * 0.3;
    const x = pxX(board(n));
    const y = pxZ(d);
    const grd = g.createLinearGradient(0, y - 30, 0, y + 20);
    grd.addColorStop(0, "#3a170c");
    grd.addColorStop(1, "#6b2a12");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x, y - 34);
    g.lineTo(x + 9, y + 16);
    g.lineTo(x - 9, y + 16);
    g.closePath();
    g.fill();
  });
  // Les repères lointains (deux petits traits de chaque côté, à 10-12 m)
  g.fillStyle = "rgba(60,26,12,0.8)";
  for (const n of [10, 30]) for (const d of [10.4, 12.2]) g.fillRect(pxX(board(n)) - 2, pxZ(d) - 18, 4, 36);
  // Les places des quilles : un petit disque sombre sous chacune
  for (const p of pinSpots) {
    g.fillStyle = "rgba(40,20,10,0.55)";
    g.beginPath();
    g.arc(pxX(p.x), pxZ(-p.z), 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(40,20,10,0.35)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(pxX(p.x), pxZ(-p.z), 15, 0, Math.PI * 2);
    g.stroke();
  }
  const t = tex(c);
  t.generateMipmaps = true;
  return t;
}

/** Les points de l'élan, derrière la ligne de faute (là où on se place) */
export function approachMarks(length: number): THREE.CanvasTexture {
  const W = 512,
    H = Math.round(length * 100);
  const [c, g] = canvas(W, H);
  const pxX = (x: number) => ((x + LANE_HALF) / (2 * LANE_HALF)) * W;
  const board = (n: number) => -LANE_HALF + ((n - 0.5) / BOARDS) * 2 * LANE_HALF;
  g.fillStyle = "#3b1b10";
  for (const d of [0.4, 3.6, 4.4]) {
    for (const n of [3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37]) {
      g.beginPath();
      g.arc(pxX(board(n)), d * 100, n === 20 ? 6 : 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  return tex(c);
}

// ---------------------------------------------------------------------------
// Les boules
// ---------------------------------------------------------------------------

const BALL_W = 512,
  BALL_H = 256;

const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i]! - v) * k);

/** Le dessin d'une boule, déplié comme une carte du monde (sa couleur, son motif) */
export function ballCanvas(look: Pick<BowlingLook, "color" | "pattern">): HTMLCanvasElement {
  const col = colorOf(look.color);
  const A = hexRgb(col.hex),
    B = hexRgb(col.accent);
  const [c, g] = canvas(BALL_W, BALL_H);
  const img = g.createImageData(BALL_W, BALL_H);
  const n1 = valueNoise(11 + look.color.length * 7, 64);
  const n2 = valueNoise(29, 64);
  const r = seeded(look.color.length * 131 + look.pattern.length);
  const put = (i: number, rgb: number[]) => {
    img.data[i] = Math.max(0, Math.min(255, rgb[0]!));
    img.data[i + 1] = Math.max(0, Math.min(255, rgb[1]!));
    img.data[i + 2] = Math.max(0, Math.min(255, rgb[2]!));
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < BALL_H; y++) {
    const lat = (y / BALL_H) * Math.PI;
    for (let x = 0; x < BALL_W; x++) {
      const i = (y * BALL_W + x) * 4;
      const u = x / BALL_W;
      // Coordonnées sur la sphère (pour un bruit sans couture)
      const sx = Math.cos(u * Math.PI * 2) * Math.sin(lat),
        sz = Math.sin(u * Math.PI * 2) * Math.sin(lat),
        sy = Math.cos(lat);
      const nx = sx * 3 + 8,
        ny = sy * 3 + sz * 1.7 + 8;
      let rgb: number[];
      switch (look.pattern) {
        case "unie": {
          const s = fbm(n1, nx * 6, ny * 6, 2);
          rgb = mix(A, [255, 255, 255], (s - 0.5) * 0.08);
          break;
        }
        case "nacre": {
          const s = fbm(n1, nx * 1.5 + sz, ny * 1.5, 4);
          const w = Math.sin(s * 14 + sx * 3) * 0.5 + 0.5;
          const iri = [200 + 55 * Math.sin(s * 9), 200 + 55 * Math.sin(s * 9 + 2), 200 + 55 * Math.sin(s * 9 + 4)];
          rgb = mix(mix(A, iri, 0.35 * w), B, 0.18 * w);
          break;
        }
        case "damier": {
          const cu = Math.floor(u * 12),
            cv = Math.floor((y / BALL_H) * 6);
          rgb = (cu + cv) % 2 ? A : B;
          break;
        }
        case "zebre": {
          const s = Math.sin((sy * 5 + fbm(n1, nx, ny, 3) * 5) * Math.PI);
          rgb = s > 0.15 ? A : B;
          break;
        }
        case "billard": {
          // Une bande claire autour, et le rond blanc avec son numéro (dessiné ensuite)
          rgb = Math.abs(sy) < 0.42 ? A : [244, 240, 228];
          break;
        }
        case "galaxie": {
          const s = fbm(n1, nx * 1.3, ny * 1.3, 5);
          const t = fbm(n2, nx * 2.2 + 3, ny * 2.2, 4);
          rgb = mix(mix([10, 8, 30], A, Math.max(0, s - 0.35) * 1.6), B, Math.max(0, t - 0.55) * 1.8);
          break;
        }
        case "flammes": {
          const s = fbm(n1, nx * 2, ny * 1.2 - y * 0.0, 4);
          const flame = sy + (s - 0.5) * 1.3;
          rgb = flame < -0.1 ? mix([255, 230, 90], [235, 70, 20], Math.min(1, (-0.1 - flame) * 2.4)) : A;
          if (flame < -0.1 && flame > -0.2) rgb = [255, 245, 170];
          break;
        }
        case "pasteque": {
          const s = Math.sin(u * Math.PI * 2 * 9 + fbm(n1, nx, ny, 3) * 6);
          rgb = s > 0.2 ? [36, 92, 34] : [96, 160, 62];
          break;
        }
        case "planete": {
          const land = fbm(n1, nx * 1.2, ny * 1.2, 5);
          const cloud = fbm(n2, nx * 2, ny * 2, 4);
          rgb = land > 0.55 ? mix([70, 130, 60], [150, 120, 70], (land - 0.55) * 3) : mix([20, 70, 160], [40, 120, 200], land);
          if (Math.abs(sy) > 0.88) rgb = [240, 245, 250];
          rgb = mix(rgb, [255, 255, 255], Math.max(0, cloud - 0.58) * 2.5);
          break;
        }
        case "cristal": {
          const s = fbm(n1, nx * 2, ny * 2, 3);
          rgb = mix(A, [255, 255, 255], 0.25 + s * 0.3);
          break;
        }
        case "disco": {
          rgb = mix([200, 205, 215], A, 0.25);
          break;
        }
        case "or": {
          const s = fbm(n1, nx * 3, ny * 3, 3);
          rgb = mix([212, 160, 50], [250, 214, 120], s);
          break;
        }
        default: {
          // Marbrée : des volutes de la couleur du motif dans la couleur de la boule, comme les vraies boules
          const s = fbm(n1, nx + fbm(n2, nx * 1.4, ny * 1.4, 3) * 2.4, ny, 4);
          const v = Math.sin(s * 22) * 0.5 + 0.5;
          const veins = Math.pow(v, 3);
          rgb = mix(mix(A, [0, 0, 0], 0.12 * (1 - v)), B, veins * 0.75);
        }
      }
      put(i, rgb);
    }
  }
  g.putImageData(img, 0, 0);
  if (look.pattern === "galaxie") {
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`;
      g.fillRect(r() * BALL_W, r() * BALL_H, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1);
    }
  }
  if (look.pattern === "billard") {
    // Le rond blanc et son numéro, de chaque côté
    for (const cx of [BALL_W * 0.25, BALL_W * 0.75]) {
      g.fillStyle = "#f6f2e6";
      g.beginPath();
      g.ellipse(cx, BALL_H / 2, 34, 30, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#151515";
      g.font = "bold 40px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("8", cx, BALL_H / 2 + 2);
    }
  }
  return c;
}

export function ballTexture(look: Pick<BowlingLook, "color" | "pattern">): THREE.CanvasTexture {
  return tex(ballCanvas(look));
}

// ---------------------------------------------------------------------------
// Les quilles
// ---------------------------------------------------------------------------

/** La peau d'une quille, dépliée : u autour, v de la base (0) au sommet (1) */
export function pinTexture(skin: string): THREE.CanvasTexture {
  const W = 256,
    H = 512;
  const [c, g] = canvas(W, H);
  const vy = (h: number) => H - (h / PIN_H) * H;
  const stripes = (color: string) => {
    g.fillStyle = color;
    g.fillRect(0, vy(0.262), W, vy(0.248) - vy(0.262));
    g.fillRect(0, vy(0.284), W, vy(0.274) - vy(0.284));
  };
  switch (skin) {
    case "bois": {
      const r = seeded(5);
      g.fillStyle = "#c98f55";
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = `rgba(110,60,25,${0.12 + r() * 0.2})`;
        g.lineWidth = 1 + r() * 2;
        const x = r() * W;
        g.beginPath();
        for (let y = 0; y <= H; y += 8) g.lineTo(x + Math.sin(y * 0.02 + i) * 4, y);
        g.stroke();
      }
      stripes("#7a2a16");
      break;
    }
    case "pois": {
      g.fillStyle = "#fbf7ee";
      g.fillRect(0, 0, W, H);
      const cols = ["#e94a4a", "#2e7fe0", "#f2b630", "#3bb36a"];
      for (let y = 20; y < H - 10; y += 34) {
        for (let x = (y / 34) % 2 ? 0 : 20; x < W + 20; x += 40) {
          g.fillStyle = cols[((Math.round(x + y) / 7) % cols.length) | 0]!;
          g.beginPath();
          g.arc(x, y, 8, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
    case "rayees": {
      g.fillStyle = "#fbf7ee";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#d9262c";
      for (let k = -H; k < W + H; k += 56) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + 26, 0);
        g.lineTo(k + 26 - H * 0.6, H);
        g.lineTo(k - H * 0.6, H);
        g.closePath();
        g.fill();
      }
      break;
    }
    case "neon": {
      g.fillStyle = "#14121c";
      g.fillRect(0, 0, W, H);
      stripes("#39ff88");
      g.fillStyle = "#ff3fd1";
      g.fillRect(0, vy(0.12), W, 8);
      break;
    }
    case "dorees": {
      const grad = g.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, "#c8921e");
      grad.addColorStop(0.5, "#f7d675");
      grad.addColorStop(1, "#c8921e");
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      stripes("#7d1414");
      break;
    }
    case "cristal": {
      g.fillStyle = "#e8f6ff";
      g.fillRect(0, 0, W, H);
      stripes("#3fb6ff");
      break;
    }
    default: {
      g.fillStyle = "#fbf9f4";
      g.fillRect(0, 0, W, H);
      stripes("#d42a2a");
    }
  }
  return tex(c);
}
