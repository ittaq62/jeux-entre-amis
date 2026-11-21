// Une balle de golf en 3D : ses alvéoles, sa couleur et son motif (le skin du joueur), qui roule vraiment sur
// elle-même, avec son ombre et l'étiquette de son nom. Les balles des autres sont un peu transparentes.

import * as THREE from "three";
import { BALL_R } from "../../../shared/games/minigolf/course.ts";
import { colorOf, type BallLook } from "../../../shared/games/minigolf/looks.ts";
import { blobTex } from "./textures.ts";

const maps = new Map<string, THREE.Texture>();

/** Le relief des alvéoles (une seule texture pour toutes les balles) */
function dimples(): THREE.Texture {
  const hit = maps.get("dimples");
  if (hit) return hit;
  const w = 512;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgb(128,128,255)";
  g.fillRect(0, 0, w, h);
  // Des alvéoles en quinconce ; plus serrées vers les pôles, où la texture s'étire
  for (let row = 0; row < 18; row++) {
    const v = (row + 0.5) / 18;
    const lat = (v - 0.5) * Math.PI;
    const count = Math.max(6, Math.round(36 * Math.cos(lat)));
    for (let k = 0; k < count; k++) {
      const u = (k + (row % 2) * 0.5) / count;
      const cx = u * w;
      const cy = v * h;
      const rx = (w / count) * 0.42;
      const ry = (h / 18) * 0.42;
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      grd.addColorStop(0, "rgb(128,128,255)");
      grd.addColorStop(0.7, "rgb(128,128,240)");
      grd.addColorStop(1, "rgb(128,128,255)");
      g.save();
      g.translate(cx, cy);
      g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
      g.translate(-cx, -cy);
      // Le bord de l'alvéole : une pente vers le centre, de chaque côté
      for (const [dx, dy, col] of [
        [-1, 0, "rgb(96,128,235)"],
        [1, 0, "rgb(160,128,235)"],
        [0, -1, "rgb(128,96,235)"],
        [0, 1, "rgb(128,160,235)"],
      ] as const) {
        const gr = g.createRadialGradient(cx + dx * 3, cy + dy * 3, 0, cx + dx * 3, cy + dy * 3, Math.max(rx, ry) * 0.9);
        gr.addColorStop(0, col);
        gr.addColorStop(1, "rgba(128,128,255,0)");
        g.fillStyle = gr;
        g.globalAlpha = 0.5;
        g.beginPath();
        g.arc(cx + dx * 3, cy + dy * 3, Math.max(rx, ry) * 0.9, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  maps.set("dimples", tex);
  return tex;
}

/** La couleur et le motif d'une balle, en carte équirectangulaire */
export function patternTex(look: BallLook): THREE.Texture {
  const key = `${look.color}:${look.pattern}`;
  const hit = maps.get(key);
  if (hit) return hit;
  const w = 512;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const col = colorOf(look.color);
  g.fillStyle = col.hex;
  g.fillRect(0, 0, w, h);
  g.fillStyle = col.accent;
  switch (look.pattern) {
    case "rayure":
      g.fillRect(0, h * 0.44, w, h * 0.12);
      break;
    case "pois":
      for (let row = 0; row < 6; row++)
        for (let k = 0; k < 10; k++) {
          g.beginPath();
          g.ellipse(
            ((k + (row % 2) * 0.5) / 10) * w,
            ((row + 0.5) / 6) * h,
            13 / Math.max(0.35, Math.cos(((row + 0.5) / 6 - 0.5) * Math.PI)),
            13,
            0,
            0,
            Math.PI * 2,
          );
          g.fill();
        }
      break;
    case "etoiles":
      for (let k = 0; k < 14; k++) {
        const x = ((k * 97) % 14) * (w / 14) + 18;
        const y = (((k * 53) % 7) + 0.6) * (h / 7.2);
        star(g, x, y, 14, 6);
      }
      break;
    case "damier":
      for (let row = 0; row < 8; row++)
        for (let k = 0; k < 16; k++) if ((row + k) % 2) g.fillRect((k * w) / 16, (row * h) / 8, w / 16, h / 8);
      break;
    case "pasteque": {
      g.fillStyle = "#3e9b3a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#1f5e24";
      for (let k = 0; k < 12; k++) {
        g.beginPath();
        for (let y = 0; y <= h; y += 8) {
          const x = (k / 12) * w + Math.sin(y * 0.09 + k) * 7;
          if (y === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        for (let y = h; y >= 0; y -= 8) g.lineTo((k / 12) * w + 16 + Math.sin(y * 0.09 + k) * 7, y);
        g.fill();
      }
      break;
    }
    case "planete": {
      const bands = ["#e7c08a", "#c98a55", "#f1dcb3", "#a8643a", "#e9c79b", "#d49a63"];
      for (let k = 0; k < 18; k++) {
        g.fillStyle = bands[k % bands.length]!;
        g.fillRect(0, (k * h) / 18 + Math.sin(k) * 3, w, h / 18 + 4);
      }
      g.fillStyle = "rgba(170,70,40,0.8)";
      g.beginPath();
      g.ellipse(w * 0.3, h * 0.62, 26, 14, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "oeil": {
      g.fillStyle = "#f8f6f0";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(200,40,40,0.35)";
      for (let k = 0; k < 18; k++) {
        g.beginPath();
        g.moveTo(w * 0.75 + Math.cos(k) * 40, h * 0.5 + Math.sin(k * 2) * 60);
        g.quadraticCurveTo(w * 0.85, h * 0.5 + Math.sin(k) * 80, w * 0.98, h * 0.5 + Math.cos(k * 3) * 90);
        g.stroke();
      }
      const grd = g.createRadialGradient(w * 0.25, h * 0.5, 0, w * 0.25, h * 0.5, 58);
      grd.addColorStop(0, "#111");
      grd.addColorStop(0.35, "#111");
      grd.addColorStop(0.38, col.hex);
      grd.addColorStop(0.95, shade(col.hex));
      grd.addColorStop(1, "#f8f6f0");
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(w * 0.25, h * 0.5, 58, 58 * 1.1, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath();
      g.arc(w * 0.25 - 12, h * 0.5 - 14, 7, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "disco":
      for (let row = 0; row < 16; row++)
        for (let k = 0; k < 32; k++) {
          const v = 150 + ((row * 37 + k * 59) % 100);
          g.fillStyle = `rgb(${v},${v},${v + 10})`;
          g.fillRect((k * w) / 32 + 1, (row * h) / 16 + 1, w / 32 - 2, h / 16 - 2);
        }
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  maps.set(key, tex);
  return tex;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, r2: number) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 2 ? r2 : r;
    if (k === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.fill();
}

function shade(hex: string): string {
  const c = new THREE.Color(hex).multiplyScalar(0.55);
  return `#${c.getHexString()}`;
}

/** L'étiquette du nom au-dessus d'une balle */
function label(text: string, color: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "600 30px 'Libre Franklin Variable', system-ui, sans-serif";
  const w = Math.min(240, g.measureText(text).width + 30);
  g.fillStyle = "rgba(20,24,20,0.62)";
  g.beginPath();
  g.roundRect((256 - w) / 2, 10, w, 44, 22);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc((256 - w) / 2 + 20, 32, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128 + 8, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.34, 0.085, 1);
  s.renderOrder = 20;
  return s;
}

export class BallModel {
  readonly group = new THREE.Group();
  private ball: THREE.Mesh;
  private shadow: THREE.Mesh;
  private tag: THREE.Sprite | null = null;
  private mat: THREE.MeshPhysicalMaterial;
  private ring: THREE.Mesh | null = null;
  private q = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private last = new THREE.Vector3(NaN, 0, 0);

  constructor(
    look: BallLook,
    readonly mine: boolean,
    name?: string,
  ) {
    this.mat = new THREE.MeshPhysicalMaterial({
      map: patternTex(look),
      normalMap: dimples(),
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: look.pattern === "disco" ? 0.12 : 0.32,
      metalness: look.pattern === "disco" ? 0.85 : 0,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      transparent: !mine,
      opacity: mine ? 1 : 0.62,
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 28), this.mat);
    this.ball.castShadow = mine;
    this.group.add(this.ball);
    if (look.pattern === "planete") {
      this.ring = new THREE.Mesh(
        new THREE.RingGeometry(BALL_R * 1.25, BALL_R * 1.65, 40),
        new THREE.MeshStandardMaterial({ color: 0xe4c79a, side: THREE.DoubleSide, transparent: true, opacity: mine ? 0.85 : 0.5 }),
      );
      this.ring.rotation.x = -Math.PI / 2 + 0.35;
      this.ball.add(this.ring);
    }
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(BALL_R * 3.2, BALL_R * 3.2),
      new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: mine ? 0.55 : 0.35 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow);
    if (name) {
      this.tag = label(name, colorOf(look.color).hex);
      this.tag.position.y = BALL_R + 0.16;
      this.group.add(this.tag);
    }
  }

  /** La balle en (x, y, z) ; le sol est à `ground` sous elle. Elle tourne sur elle-même d'après son déplacement */
  set(x: number, y: number, z: number, ground: number) {
    const p = this.group.position;
    if (!Number.isNaN(this.last.x)) {
      const dx = x - this.last.x;
      const dz = z - this.last.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-5 && d < 1) {
        this.axis.set(dz, 0, -dx).normalize();
        this.q.setFromAxisAngle(this.axis, d / BALL_R);
        this.ball.quaternion.premultiply(this.q);
      }
    }
    this.last.set(x, y, z);
    p.set(x, y, z);
    // L'ombre reste au sol, plus pâle et plus large quand la balle est en l'air
    const up = Math.max(0, y - BALL_R - ground);
    this.shadow.position.y = ground - y + 0.004;
    const k = 1 + up * 2.5;
    this.shadow.scale.set(k, k, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = (this.mine ? 0.55 : 0.35) / (1 + up * 6);
  }

  /** Cachée (dans le trou, perdue) ou visible */
  show(on: boolean) {
    this.group.visible = on;
  }

  showTag(on: boolean) {
    if (this.tag) this.tag.visible = on;
  }

  /** Disparaître dans le trou : elle s'enfonce */
  sink(k: number) {
    this.ball.position.y = -k * 0.11;
    this.shadow.visible = k < 0.2;
  }

  dispose() {
    this.ball.geometry.dispose();
    this.mat.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    if (this.tag) {
      this.tag.material.map?.dispose();
      this.tag.material.dispose();
    }
    if (this.ring) {
      this.ring.geometry.dispose();
      (this.ring.material as THREE.Material).dispose();
    }
  }
}
