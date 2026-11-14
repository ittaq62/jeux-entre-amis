// Les ballons de Crampons : chacun peint sur une image dépliée (la sphère entière, d'un pôle à l'autre), avec sa matière.
// Le classique pour tous ; les autres se débloquent à la boutique, et chacun voit le sien.

import * as THREE from "three";
import type { BallId } from "../../../shared/games/crampons/boutique.ts";

const W = 512;
const H = 256;

/** Une étoile à cinq branches, centrée en (x, y) */
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const rr = k % 2 ? r * 0.44 : r;
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** Un pentagone, pour les pièces du ballon noir et blanc */
function pentagon(g: CanvasRenderingContext2D, x: number, y: number, r: number, sx = 1) {
  g.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(x + Math.cos(a) * r * sx, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

/** La peinture de chaque ballon, sur l'image dépliée (largeur : le tour du ballon, hauteur : d'un pôle à l'autre) */
const PAINT: Record<BallId, (g: CanvasRenderingContext2D) => void> = {
  classique: (g) => {
    g.fillStyle = "#fdfaf0";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#e0453a";
    for (let i = 0; i < 4; i++) g.fillRect(i * 128 + 12, 0, 34, H);
    g.fillStyle = "#1f3f8f";
    for (let i = 0; i < 4; i++) star(g, i * 128 + 88, 128, 32);
  },
  // Le cuir d'avant-guerre : des panneaux cousus, un lacet
  cuir: (g) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#7a4a26");
    grad.addColorStop(0.5, "#9a6236");
    grad.addColorStop(1, "#7a4a26");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#4a2a14";
    g.lineWidth = 5;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo((i * W) / 6, 0);
      g.bezierCurveTo((i * W) / 6 + 30, H * 0.35, (i * W) / 6 - 30, H * 0.65, (i * W) / 6, H);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, H / 2);
    g.lineTo(W, H / 2);
    g.stroke();
    // Le lacet
    g.strokeStyle = "#e9d6b0";
    g.lineWidth = 4;
    for (let k = 0; k < 7; k++) {
      const y = H / 2 - 42 + k * 14;
      g.beginPath();
      g.moveTo(232, y);
      g.lineTo(280, y + 7);
      g.stroke();
    }
  },
  // Le grand classique des années soixante-dix : des pentagones noirs sur fond blanc
  "noir-blanc": (g) => {
    g.fillStyle = "#f7f7f2";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#16161a";
    for (let row = 0; row < 3; row++) {
      const y = 40 + row * 88;
      // Près des pôles, l'image dépliée s'étire : les pièces y sont plus larges
      const sx = row === 1 ? 1 : 1.6;
      for (let i = 0; i < 5; i++) pentagon(g, ((i + (row % 2) * 0.5) * W) / 5, y, 24, sx);
    }
    g.fillRect(0, 0, W, 10);
    g.fillRect(0, H - 10, W, 10);
  },
  // Le ballon de plage : des quartiers de couleur, du pôle au pôle
  plage: (g) => {
    const colors = ["#e8443a", "#ffffff", "#2f7fe0", "#f6cf2e", "#ffffff", "#34b35a"];
    colors.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect((i * W) / colors.length, 0, W / colors.length + 1, H);
    });
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, 16);
    g.fillRect(0, H - 16, W, 16);
  },
  // Étoilé : blanc nacré semé d'étoiles d'or
  etoile: (g) => {
    g.fillStyle = "#f4f6fb";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#d9a520";
    const rand = (n: number) => (((Math.sin(n * 127.1) * 43758.5453) % 1) + 1) % 1;
    for (let k = 0; k < 26; k++) star(g, rand(k) * W, 20 + rand(k + 40) * (H - 40), 10 + rand(k + 80) * 9);
    g.fillStyle = "#24356e";
    g.fillRect(0, H / 2 - 4, W, 8);
  },
  // Néon : sombre, des lignes qui brillent (elles éclairent aussi : voir la matière)
  neon: (g) => {
    g.fillStyle = "#0d1022";
    g.fillRect(0, 0, W, H);
    g.lineWidth = 7;
    g.strokeStyle = "#39ff8e";
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo((i * W) / 4 + 20, 0);
      g.bezierCurveTo((i * W) / 4 + 90, H * 0.4, (i * W) / 4 - 20, H * 0.6, (i * W) / 4 + 60, H);
      g.stroke();
    }
    g.strokeStyle = "#22d6ff";
    g.beginPath();
    g.moveTo(0, H / 2);
    for (let x = 0; x <= W; x += 16) g.lineTo(x, H / 2 + Math.sin((x / W) * Math.PI * 8) * 14);
    g.stroke();
  },
  // Le ballon d'or : doré, des pièces gravées
  or: (g) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#b8862a");
    grad.addColorStop(0.45, "#f6d67a");
    grad.addColorStop(1, "#a8761e");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(110, 72, 12, 0.7)";
    g.lineWidth = 3;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 6; i++) {
        const x = ((i + (row % 2) * 0.5) * W) / 6;
        const y = 44 + row * 84;
        g.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          g.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 24);
        }
        g.stroke();
      }
    }
  },
};

/** L'image dépliée d'un ballon */
export function ballCanvas(id: BallId): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  (PAINT[id] ?? PAINT.classique)(c.getContext("2d")!);
  return c;
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * La matière d'un ballon. Sous la neige, un ballon clair devient orange, comme le vrai : on le perdrait de vue sur la
 * pelouse blanche (le néon et l'or se voient déjà très bien).
 */
export function ballMaterial(id: BallId, snow = false): THREE.MeshStandardMaterial {
  const map = texture(ballCanvas(id));
  const light = id === "classique" || id === "noir-blanc" || id === "etoile" || id === "plage";
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.42, color: snow && light ? "#ff9a30" : "#ffffff" });
  if (id === "cuir") m.roughness = 0.7;
  if (id === "or") {
    m.metalness = 0.75;
    m.roughness = 0.28;
  }
  if (id === "neon") {
    // Les lignes éclairent d'elles-mêmes : le ballon se voit de nuit
    m.emissiveMap = map;
    m.emissive = new THREE.Color("#ffffff");
    m.emissiveIntensity = 0.85;
    m.roughness = 0.5;
  }
  return m;
}

/** Une vignette du ballon pour la boutique et le salon : l'image dépliée posée dans un rond, avec son relief */
export function ballThumbnail(id: BallId, size: number): string {
  const c = document.createElement("canvas");
  c.width = c.height = size * 2;
  const g = c.getContext("2d")!;
  const r = size;
  g.save();
  g.beginPath();
  g.arc(r, r, r - 1, 0, Math.PI * 2);
  g.clip();
  // La face visible : le milieu de l'image dépliée, un peu plus large que haute
  g.drawImage(ballCanvas(id), W * 0.18, 0, W * 0.5, H, 0, 0, r * 2, r * 2);
  const shade = g.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  shade.addColorStop(0, "rgba(255,255,255,0.35)");
  shade.addColorStop(0.55, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = shade;
  g.fillRect(0, 0, r * 2, r * 2);
  g.restore();
  return c.toDataURL();
}
