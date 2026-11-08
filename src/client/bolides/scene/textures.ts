// Les textures de Bolides, toutes dessinées à la main sur des toiles : rien à télécharger.

import * as THREE from "three";
import type { Theme } from "../../../shared/games/bolides/track.ts";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

/** Un petit hasard qui donne toujours les mêmes textures */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function toTexture(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Des grains sur une toile : quelques milliers de points plus clairs ou plus sombres */
function speckle(g: CanvasRenderingContext2D, w: number, h: number, count: number, colors: string[], size: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)]!;
    const s = size * (0.5 + r());
    g.fillRect(r() * w, r() * h, s, s);
  }
}

const ASPHALT: Record<Theme, string> = { port: "#4b4c52", vignes: "#56524d", col: "#5b5f66" };

/** Le bitume : le grain, les lignes blanches des bords et les tirets du milieu. Elle se répète tous les 8 m. */
export function roadTexture(theme: Theme): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = ASPHALT[theme];
  g.fillRect(0, 0, S, S);
  // De grandes nuances douces, qui se répètent sans se voir
  const r = rng(5);
  for (let i = 0; i < 46; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 60 + r() * 120;
    const tone = r() < 0.5 ? "0,0,0" : "255,255,255";
    for (const oy of [-S, 0, S]) {
      const grad = g.createRadialGradient(x, y + oy, 0, x, y + oy, rad);
      grad.addColorStop(0, `rgba(${tone},0.05)`);
      grad.addColorStop(1, `rgba(${tone},0)`);
      g.fillStyle = grad;
      g.fillRect(x - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  // Le grain : des gravillons clairs et sombres
  speckle(g, S, S, 17000, ["rgba(255,255,255,0.07)", "rgba(0,0,0,0.16)", "rgba(255,255,255,0.11)", "rgba(0,0,0,0.09)"], 1.9, 7);
  // Le sillon des pneus : deux bandes par voie, plus sombres et polies
  for (const x of [116, 184, 328, 396]) {
    const grad = g.createLinearGradient(x - 18, 0, x + 18, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.13)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - 18, 0, 36, S);
  }
  // Le bas-côté plus sale, contre les lignes
  for (const [x0, x1] of [
    [30, 74],
    [482, 438],
  ] as const) {
    const grad = g.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, "rgba(40,30,20,0.22)");
    grad.addColorStop(1, "rgba(40,30,20,0)");
    g.fillStyle = grad;
    g.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), S);
  }
  // Des joints de goudron et quelques fissures
  g.strokeStyle = "rgba(10,10,12,0.2)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 201);
  g.lineTo(512, 201);
  g.stroke();
  for (let i = 0; i < 3; i++) {
    let x = 70 + r() * 372;
    let y = r() * S;
    g.lineWidth = 1 + r();
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (r() - 0.5) * 34;
      y += 6 + r() * 16;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // Les lignes de peinture, usées par endroits
  g.fillStyle = "#f2efe6";
  g.fillRect(16, 0, 14, S);
  g.fillRect(482, 0, 14, S);
  g.fillStyle = theme === "col" ? "#f2c94c" : "#f2efe6";
  g.fillRect(248, 0, 16, 240);
  speckle(g, S, S, 500, [`${ASPHALT[theme]}88`], 3, 91);
  return toTexture(c);
}

/** Les vibreurs : rouge et blanc */
export function curbTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(32, 64);
  g.fillStyle = "#d8352a";
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = "#f4f1ea";
  g.fillRect(0, 32, 32, 32);
  g.fillStyle = "rgba(0,0,0,0.15)";
  g.fillRect(0, 0, 4, 64);
  return toTexture(c);
}

/** Le sol autour du circuit : de l'herbe, de l'herbe sèche entre les vignes, de la neige au col */
export function groundTexture(theme: Theme): THREE.CanvasTexture {
  const size = 512;
  const [c, g] = canvas(size, size);
  const base = theme === "col" ? "#e9eef3" : theme === "vignes" ? "#7d9a4a" : "#5a8d48";
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const tones =
    theme === "col"
      ? ["rgba(255,255,255,0.5)", "rgba(196,210,224,0.35)", "rgba(230,238,246,0.5)"]
      : theme === "vignes"
        ? ["rgba(150,175,90,0.35)", "rgba(100,130,55,0.3)", "rgba(176,162,106,0.3)"]
        : ["rgba(120,180,90,0.35)", "rgba(70,130,55,0.3)", "rgba(140,190,95,0.3)"];
  // De grandes taches douces, puis un grain fin : rien de carré, de près comme de loin
  const r = rng(11);
  for (let i = 0; i < 260; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 10 + r() * 34;
    const color = tones[Math.floor(r() * tones.length)]!;
    for (const [ox, oy] of [
      [0, 0],
      [size, 0],
      [-size, 0],
      [0, size],
      [0, -size],
    ]) {
      const grad = g.createRadialGradient(x + ox!, y + oy!, 0, x + ox!, y + oy!, rad);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(x + ox! - rad, y + oy! - rad, rad * 2, rad * 2);
    }
  }
  const dots =
    theme === "col"
      ? ["rgba(255,255,255,0.7)", "rgba(190,205,220,0.5)"]
      : theme === "vignes"
        ? ["rgba(60,85,35,0.35)", "rgba(190,180,120,0.3)"]
        : ["rgba(40,90,35,0.35)", "rgba(170,210,120,0.3)"];
  speckle(g, size, size, 7000, dots, 1.4, 13);
  const t = toTexture(c);
  t.anisotropy = 8;
  return t;
}

/** Les murets au bord du circuit, selon le décor */
export function wallTexture(theme: Theme): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  if (theme === "port") {
    // Des blocs de béton aux bandes jaunes et noires
    g.fillStyle = "#b9bbbd";
    g.fillRect(0, 0, 256, 64);
    speckle(g, 256, 64, 900, ["rgba(0,0,0,0.08)", "rgba(255,255,255,0.1)"], 2, 3);
    for (let x = -64; x < 256; x += 32) {
      g.fillStyle = "#f2c230";
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 16, 40);
      g.lineTo(x + 32, 40);
      g.lineTo(x + 16, 64);
      g.fill();
    }
    g.fillStyle = "#222";
    g.fillRect(0, 38, 256, 3);
    for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 2, 64);
  } else if (theme === "vignes") {
    // Une palissade de bois
    g.fillStyle = "#8a5a33";
    g.fillRect(0, 0, 256, 64);
    for (let x = 0; x < 256; x += 21) {
      g.fillStyle = x % 42 === 0 ? "#9c6a3f" : "#7d5030";
      g.fillRect(x, 0, 19, 64);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(x + 19, 0, 2, 64);
    }
    g.fillStyle = "#5e3b22";
    g.fillRect(0, 14, 256, 6);
    g.fillRect(0, 44, 256, 6);
  } else {
    // Un mur de pierres sèches, saupoudré de neige
    g.fillStyle = "#7d7f84";
    g.fillRect(0, 0, 256, 64);
    const r = rng(21);
    for (let y = 0; y < 64; y += 16) {
      for (let x = (y / 16) % 2 === 0 ? 0 : -16; x < 256; x += 32) {
        const l = 100 + Math.floor(r() * 40);
        g.fillStyle = `rgb(${l},${l + 2},${l + 6})`;
        g.fillRect(x + 1, y + 1, 30, 14);
      }
    }
    g.fillStyle = "#f4f7fa";
    g.fillRect(0, 0, 256, 7);
  }
  return toTexture(c);
}

/** Une caisse d'objets : des planches cerclées et un éclair jaune */
export function crateTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = "#c08542";
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 21) {
    g.fillStyle = y % 42 === 0 ? "#cd9350" : "#b67a3a";
    g.fillRect(0, y, 128, 19);
  }
  g.strokeStyle = "#6b4220";
  g.lineWidth = 12;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = "#ffd23a";
  g.strokeStyle = "#7a3d00";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(72, 18);
  g.lineTo(38, 70);
  g.lineTo(62, 70);
  g.lineTo(52, 110);
  g.lineTo(92, 52);
  g.lineTo(66, 52);
  g.closePath();
  g.fill();
  g.stroke();
  return toTexture(c, false);
}

/** Une flaque d'huile : noire, irisée */
export function oilTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(5);
  g.fillStyle = "rgba(10,10,14,0.95)";
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rr = 48 + r() * 14;
    const x = 64 + Math.cos(a) * rr;
    const y = 64 + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.fill();
  const sheen = g.createRadialGradient(54, 54, 4, 64, 64, 50);
  sheen.addColorStop(0, "rgba(120,220,255,0.35)");
  sheen.addColorStop(0.4, "rgba(220,120,255,0.18)");
  sheen.addColorStop(0.7, "rgba(255,230,120,0.12)");
  sheen.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sheen;
  g.fillRect(0, 0, 128, 128);
  return toTexture(c, false);
}

/** Le damier de la ligne d'arrivée */
export function checkerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? "#111" : "#f4f4f4";
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const t = toTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Un accélérateur au sol : des chevrons lumineux */
export function boostTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  g.fillStyle = "#1b2b3a";
  g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 32) {
    g.fillStyle = y % 64 === 0 ? "#38d6ff" : "#ff9a2e";
    g.beginPath();
    g.moveTo(6, y + 26);
    g.lineTo(32, y + 6);
    g.lineTo(58, y + 26);
    g.lineTo(58, y + 34);
    g.lineTo(32, y + 14);
    g.lineTo(6, y + 34);
    g.closePath();
    g.fill();
  }
  return toTexture(c);
}

/** Le dessus d'un tremplin : des planches, des flèches jaunes vers le bord, et une bande rayée au bord */
export function rampTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  const r = rng(21);
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = `hsl(${26 + r() * 8}, ${48 + r() * 10}%, ${36 + r() * 8}%)`;
    g.fillRect(x, 0, 32, 128);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(x, 0, 2, 128);
  }
  // Les flèches pointent vers le haut de la toile (le bord du tremplin)
  g.fillStyle = "#ffd23a";
  for (const cx of [64, 192]) {
    g.beginPath();
    g.moveTo(cx - 34, 92);
    g.lineTo(cx, 44);
    g.lineTo(cx + 34, 92);
    g.lineTo(cx + 18, 92);
    g.lineTo(cx, 66);
    g.lineTo(cx - 18, 92);
    g.closePath();
    g.fill();
  }
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = (x / 32) % 2 === 0 ? "#1d1d1d" : "#ffd23a";
    g.fillRect(x, 0, 32, 16);
  }
  return toTexture(c, false);
}

/** L'eau du port */
export function waterTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#2f7fae";
  g.fillRect(0, 0, 256, 256);
  const r = rng(9);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = r() < 0.5 ? "rgba(255,255,255,0.16)" : "rgba(10,40,80,0.18)";
    g.lineWidth = 1 + r() * 2;
    const x = r() * 256;
    const y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 8, y - 4, x + 18 + r() * 10, y);
    g.stroke();
  }
  return toTexture(c);
}

/** Une banderole avec un texte, pour l'arche de la ligne d'arrivée */
export function bannerTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const [c, g] = canvas(512, 96);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = fg;
  g.font = "900 64px 'Big Shoulders Display Variable', 'Arial Black', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 52);
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(0, 88, 512, 8);
  return toTexture(c, false);
}

/** L'étiquette du nom au-dessus d'un kart */
export function nameTexture(text: string, color: string): { texture: THREE.CanvasTexture; aspect: number } {
  const [c, g] = canvas(256, 64);
  g.font = "700 30px 'Libre Franklin Variable', system-ui, sans-serif";
  const w = Math.min(248, g.measureText(text).width + 28);
  g.fillStyle = "rgba(20,14,10,0.78)";
  const x = (256 - w) / 2;
  g.beginPath();
  g.roundRect(x, 10, w, 44, 22);
  g.fill();
  g.fillStyle = color;
  g.fillRect(x + 12, 26, 10, 10);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128 + 6, 33, 220);
  return { texture: toTexture(c, false), aspect: 4 };
}

/** Une étincelle douce, pour les particules */
export function sparkTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

/** Un conteneur : des nervures, des rails en haut et en bas, des coins plus sombres (teinté par la matière) */
export function containerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  g.fillStyle = "#e9e9e9";
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 12) {
    g.fillStyle = "rgba(0,0,0,0.13)";
    g.fillRect(x, 10, 5, 108);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(x + 5, 10, 2, 108);
  }
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(0, 0, 256, 10);
  g.fillRect(0, 118, 256, 10);
  g.fillRect(0, 0, 8, 128);
  g.fillRect(248, 0, 8, 128);
  speckle(g, 256, 128, 500, ["rgba(110,60,30,0.12)", "rgba(0,0,0,0.06)"], 3, 17);
  return toTexture(c, false);
}

/** Une façade : deux étages de fenêtres à volets, une porte, un soubassement (teintée par la matière) */
export function houseTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#f4f1ea";
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 1200, ["rgba(0,0,0,0.04)", "rgba(255,255,255,0.2)"], 3, 23);
  g.fillStyle = "rgba(0,0,0,0.16)";
  g.fillRect(0, 226, 256, 30);
  const window = (x: number, y: number) => {
    g.fillStyle = "#5b7d99";
    g.fillRect(x, y, 44, 56);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(x + 4, y + 4, 14, 22);
    g.strokeStyle = "#f8f6f0";
    g.lineWidth = 5;
    g.strokeRect(x, y, 44, 56);
    g.beginPath();
    g.moveTo(x + 22, y);
    g.lineTo(x + 22, y + 56);
    g.moveTo(x, y + 26);
    g.lineTo(x + 44, y + 26);
    g.stroke();
    // Les volets
    g.fillStyle = "rgba(60,90,60,0.85)";
    g.fillRect(x - 16, y, 13, 56);
    g.fillRect(x + 47, y, 13, 56);
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(x - 4, y + 58, 52, 6);
  };
  window(42, 40);
  window(170, 40);
  window(170, 140);
  g.fillStyle = "#7a4b2c";
  g.fillRect(40, 140, 50, 86);
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(46, 146, 16, 74);
  g.fillStyle = "#d7b25c";
  g.fillRect(80, 182, 5, 5);
  return toTexture(c, false);
}

/** Un nuage : des boules blanches qui se chevauchent, un peu grises en dessous */
export function cloudTexture(seed: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  const r = rng(seed);
  for (let i = 0; i < 16; i++) {
    const x = 40 + r() * 176;
    const y = 54 + r() * 34 - Math.sin(((x - 40) / 176) * Math.PI) * 18;
    const rad = 22 + r() * 26;
    const grad = g.createRadialGradient(x, y - rad * 0.2, 0, x, y, rad);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.6, "rgba(250,252,255,0.75)");
    grad.addColorStop(1, "rgba(235,242,250,0)");
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Le dessous, plus gris
  const shade = g.createLinearGradient(0, 70, 0, 128);
  shade.addColorStop(0, "rgba(160,175,195,0)");
  shade.addColorStop(1, "rgba(160,175,195,0.35)");
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = shade;
  g.fillRect(0, 0, 256, 128);
  g.globalCompositeOperation = "source-over";
  return toTexture(c, false);
}

/** Le panneau d'un virage : des chevrons blancs sur rouge, qui pointent vers la gauche */
export function chevronTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.fillStyle = "#d8352a";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#fff8ee";
  for (let x = 14; x < 256; x += 60) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 26, 6);
    g.lineTo(x + 46, 6);
    g.lineTo(x + 20, 32);
    g.lineTo(x + 46, 58);
    g.lineTo(x + 26, 58);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = "#fff8ee";
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 58);
  return toTexture(c, false);
}

/** Des gradins pleins de monde : des rangées de têtes et de maillots de toutes les couleurs */
export function crowdTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  const r = rng(31);
  const shirts = ["#d8352a", "#2f80ed", "#27ae60", "#f2c94c", "#9b51e0", "#f2994a", "#ffffff", "#2fc4c4", "#eb5ea8"];
  const skins = ["#ffdbb4", "#f1c27d", "#e0ac69", "#c68642", "#8d5524"];
  for (let row = 0; row < 4; row++) {
    const y = row * 32;
    g.fillStyle = row % 2 === 0 ? "#5b6170" : "#4c5160";
    g.fillRect(0, y, 512, 32);
    for (let x = 4 + (row % 2) * 6; x < 512; x += 12 + r() * 4) {
      if (r() < 0.12) continue;
      g.fillStyle = shirts[Math.floor(r() * shirts.length)]!;
      g.fillRect(x - 5, y + 16, 10, 14);
      g.fillStyle = skins[Math.floor(r() * skins.length)]!;
      g.beginPath();
      g.arc(x, y + 11, 5, 0, Math.PI * 2);
      g.fill();
      // Quelques bras levés
      if (r() < 0.25) {
        g.fillStyle = skins[Math.floor(r() * skins.length)]!;
        g.fillRect(x + 4, y + 2, 3, 12);
      }
    }
  }
  return toTexture(c);
}

/** Les panneaux le long des murets : des mots sur des couleurs vives, à la suite */
export function boardsTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 64);
  const words: [string, string, string][] = [
    ["LA TABLÉE", "#2b2f36", "#ffd23a"],
    ["BOLIDES", "#d8352a", "#ffffff"],
    ["MINI-TURBO", "#2f80ed", "#ffffff"],
    ["VROUM !", "#f2c94c", "#2b2f36"],
  ];
  words.forEach(([text, bg, fg], i) => {
    g.fillStyle = bg;
    g.fillRect(i * 256, 0, 256, 64);
    g.fillStyle = fg;
    g.font = "900 40px 'Big Shoulders Display Variable', 'Arial Black', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, i * 256 + 128, 35, 236);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(i * 256 + 252, 0, 4, 64);
  });
  return toTexture(c);
}

/** Une case de la grille de départ : un crochet blanc peint au sol */
export function gridMarkTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = "rgba(245,242,234,0.92)";
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(10, 60);
  g.lineTo(10, 8);
  g.lineTo(118, 8);
  g.lineTo(118, 60);
  g.stroke();
  return toTexture(c, false);
}

/** Une ombre douce et ronde, sous un kart */
export function blobTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(0,0,0,0.6)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c, false, false);
}

/** L'intérieur d'un tunnel : des plaques de béton au port, des pierres aux vignes, de la roche au col */
export function tunnelTexture(theme: Theme): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(theme === "port" ? 41 : theme === "vignes" ? 43 : 47);
  if (theme === "port") {
    g.fillStyle = "#a9a6a0";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) {
      for (let x = 0; x < 256; x += 128) {
        const l = 150 + Math.floor(r() * 30);
        g.fillStyle = `rgb(${l},${l - 3},${l - 8})`;
        g.fillRect(x + 2, y + 2, 124, 60);
      }
    }
    g.fillStyle = "#e0b52c";
    g.fillRect(0, 232, 256, 24);
  } else if (theme === "vignes") {
    g.fillStyle = "#8f7c62";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      for (let x = (y / 32) % 2 === 0 ? 0 : -24; x < 256; x += 48) {
        const l = 150 + Math.floor(r() * 50);
        g.fillStyle = `rgb(${l},${l - 18},${l - 45})`;
        g.beginPath();
        g.roundRect(x + 2, y + 2, 44, 28, 6);
        g.fill();
      }
    }
  } else {
    g.fillStyle = "#6f6a66";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const l = 80 + Math.floor(r() * 60);
      g.fillStyle = `rgb(${l},${l - 4},${l - 8})`;
      g.beginPath();
      const x = r() * 256;
      const y = r() * 256;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 40);
      g.closePath();
      g.fill();
    }
  }
  speckle(g, 256, 256, 1500, ["rgba(0,0,0,0.08)", "rgba(255,255,255,0.06)"], 2, 53);
  return toTexture(c);
}

/** Des bandes de couleurs côte à côte (les ailes des moulins, les cabines…) */
export function stripesTexture(colors: string[]): THREE.CanvasTexture {
  const [c, g] = canvas(128, 16);
  const w = 128 / colors.length;
  colors.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(i * w, 0, w, 16);
  });
  return toTexture(c);
}

/** Une caisse-mystère : un verre clair aux bords plus vifs, et un gros point d'interrogation au milieu */
export function mysteryTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 90);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.7, "rgba(230,240,255,0.75)");
  grad.addColorStop(1, "rgba(255,255,255,1)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,255,255,1)";
  g.lineWidth = 10;
  g.strokeRect(5, 5, 118, 118);
  g.font = "900 96px 'Big Shoulders Display Variable', 'Arial Black', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 8;
  g.strokeStyle = "#2b1d14";
  g.strokeText("?", 64, 70);
  g.fillStyle = "#ffd23a";
  g.fillText("?", 64, 70);
  return toTexture(c, false);
}
