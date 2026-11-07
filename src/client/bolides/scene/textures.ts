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
  const [c, g] = canvas(256, 256);
  g.fillStyle = ASPHALT[theme];
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 5000, ["rgba(255,255,255,0.05)", "rgba(0,0,0,0.12)", "rgba(255,255,255,0.08)"], 2, 7);
  // Des traces de pneus, plus sombres, au milieu des voies
  g.fillStyle = "rgba(0,0,0,0.07)";
  for (const x of [58, 92, 164, 198]) g.fillRect(x, 0, 10, 256);
  g.fillStyle = "#f2efe6";
  g.fillRect(8, 0, 7, 256);
  g.fillRect(241, 0, 7, 256);
  g.fillStyle = theme === "col" ? "#f2c94c" : "#f2efe6";
  g.fillRect(124, 0, 8, 120);
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
  const base = theme === "col" ? "#e9eef3" : theme === "vignes" ? "#7d9a4a" : "#5f9a48";
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
