// Le radar et la boussole, dessinés à chaque image (pas par React : ils doivent suivre la vue sans à-coups). Le radar
// tourne avec soi (devant, c'est en haut) : les bâtiments, ses alliés, les ennemis qui viennent de tirer, les drapeaux
// et la zone. La boussole donne le cap, le nord vers -z.

import type { GameMap } from "../../shared/games/escarmouche/maps.ts";

export interface RadarDot {
  x: number;
  z: number;
  yaw: number;
  kind: "ally" | "enemy";
}

/** Combien de mètres du centre au bord du radar */
const RANGE = 42;
const PX_PER_M = 4;

export class Radar {
  private plan: HTMLCanvasElement;
  private x0: number;
  private z0: number;

  constructor(gm: GameMap) {
    const { x0, x1, z0, z1 } = gm.bounds;
    this.x0 = x0 - 4;
    this.z0 = z0 - 4;
    this.plan = document.createElement("canvas");
    this.plan.width = Math.ceil((x1 - x0 + 8) * PX_PER_M);
    this.plan.height = Math.ceil((z1 - z0 + 8) * PX_PER_M);
    const g = this.plan.getContext("2d")!;
    g.fillStyle = "rgba(196, 202, 176, 0.12)";
    g.fillRect((x0 - this.x0) * PX_PER_M, (z0 - this.z0) * PX_PER_M, (x1 - x0) * PX_PER_M, (z1 - z0) * PX_PER_M);
    // Ce qui dépasse la tête d'un homme : les murs, les maisons, les wagons ; plus clair, plus c'est haut
    const boxes = [...gm.boxes]
      .filter((b) => b.m !== "invisible" && b.y1 - Math.max(0, b.y0) > 0.9 && b.y0 < 2)
      .sort((a, b) => a.y1 - b.y1);
    for (const b of boxes) {
      const tall = Math.min(1, (b.y1 - 0.9) / 6);
      g.fillStyle = `rgba(${200 + tall * 40}, ${206 + tall * 34}, ${190 + tall * 40}, ${0.35 + tall * 0.4})`;
      g.fillRect((b.x0 - this.x0) * PX_PER_M, (b.z0 - this.z0) * PX_PER_M, (b.x1 - b.x0) * PX_PER_M, (b.z1 - b.z0) * PX_PER_M);
    }
  }

  draw(
    c: HTMLCanvasElement,
    me: { x: number; z: number; yaw: number } | null,
    dots: RadarDot[],
    flags: { x: number; z: number; color: string }[],
    zone: { x: number; z: number; r: number; color: string } | null,
    points: { x: number; z: number; letter: string; color: string }[] = [],
  ) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = c.clientWidth || 150;
    if (c.width !== Math.round(size * dpr)) {
      c.width = Math.round(size * dpr);
      c.height = Math.round(size * dpr);
    }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    const r = size / 2;
    g.save();
    g.beginPath();
    g.arc(r, r, r - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "rgba(18, 22, 16, 0.62)";
    g.fillRect(0, 0, size, size);
    if (me) {
      const k = r / RANGE;
      // Le plan, tourné pour que l'avant soit en haut (yaw 0 regarde vers -z)
      g.save();
      g.translate(r, r);
      g.rotate(me.yaw);
      g.scale(k / PX_PER_M, k / PX_PER_M);
      g.translate(-(me.x - this.x0) * PX_PER_M, -(me.z - this.z0) * PX_PER_M);
      g.drawImage(this.plan, 0, 0);
      g.restore();
      const toScreen = (x: number, z: number): [number, number] => {
        const dx = x - me.x;
        const dz = z - me.z;
        const c0 = Math.cos(me.yaw);
        const s0 = Math.sin(me.yaw);
        return [r + (dx * c0 - dz * s0) * k, r + (dx * s0 + dz * c0) * k];
      };
      if (zone) {
        const [zx, zy] = toScreen(zone.x, zone.z);
        g.strokeStyle = zone.color;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(zx, zy, zone.r * k, 0, Math.PI * 2);
        g.stroke();
      }
      // Conquête : chaque drapeau, sa lettre dans un rond aux couleurs de qui le tient (au bord, s'il est loin)
      for (const p of points) {
        let [px, py] = toScreen(p.x, p.z);
        const off = Math.hypot(px - r, py - r);
        if (off > r - 9) {
          px = r + ((px - r) / off) * (r - 9);
          py = r + ((py - r) / off) * (r - 9);
        }
        g.beginPath();
        g.arc(px, py, 7, 0, Math.PI * 2);
        g.fillStyle = "rgba(0,0,0,.55)";
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = p.color;
        g.stroke();
        g.fillStyle = p.color;
        g.font = "bold 9px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(p.letter, px, py + 0.5);
      }
      for (const f of flags) {
        const [fx, fy] = toScreen(f.x, f.z);
        g.fillStyle = f.color;
        g.fillRect(fx - 1, fy - 7, 2, 9);
        g.beginPath();
        g.moveTo(fx + 1, fy - 7);
        g.lineTo(fx + 7, fy - 4.5);
        g.lineTo(fx + 1, fy - 2);
        g.fill();
      }
      for (const d of dots) {
        const [dx, dy] = toScreen(d.x, d.z);
        const a = d.yaw - me.yaw;
        g.save();
        g.translate(dx, dy);
        g.rotate(-a);
        g.fillStyle = d.kind === "ally" ? "#7fb6ff" : "#ff4b3a";
        g.strokeStyle = "rgba(0,0,0,.6)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, -5);
        g.lineTo(3.6, 3.5);
        g.lineTo(-3.6, 3.5);
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
      }
      // Les anneaux de distance, et soi au centre
      g.strokeStyle = "rgba(220, 230, 200, 0.14)";
      g.lineWidth = 1;
      for (const m of [14, 28]) {
        g.beginPath();
        g.arc(r, r, m * k, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = "rgba(220, 230, 200, 0.08)";
      g.beginPath();
      g.moveTo(r, r);
      g.arc(r, r, r, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
      g.closePath();
      g.fill();
      g.fillStyle = "#f4f1e6";
      g.beginPath();
      g.moveTo(r, r - 6);
      g.lineTo(r + 4.5, r + 4.5);
      g.lineTo(r, r + 2);
      g.lineTo(r - 4.5, r + 4.5);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.strokeStyle = "rgba(220, 226, 205, 0.45)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(r, r, r - 1, 0, Math.PI * 2);
    g.stroke();
  }
}

const POINTS: [number, string][] = [
  [0, "N"],
  [45, "NE"],
  [90, "E"],
  [135, "SE"],
  [180, "S"],
  [225, "SO"],
  [270, "O"],
  [315, "NO"],
];

/** La boussole : une bande graduée qui défile, le cap au milieu */
export function drawCompass(c: HTMLCanvasElement, yaw: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth || 320;
  const h = c.clientHeight || 30;
  if (c.width !== Math.round(w * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const heading = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
  const span = 100;
  const px = w / span;
  g.font = "600 11px 'Libre Franklin Variable', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  for (let d = Math.floor((heading - span / 2) / 5) * 5; d <= heading + span / 2; d += 5) {
    const x = w / 2 + (d - heading) * px;
    const fade = 1 - Math.abs(x - w / 2) / (w / 2);
    const deg = ((d % 360) + 360) % 360;
    const label = POINTS.find(([a]) => a === deg)?.[1];
    g.fillStyle = `rgba(240, 236, 220, ${0.85 * fade})`;
    const tall = label ? 9 : deg % 15 === 0 ? 6 : 3;
    g.fillRect(Math.round(x), h - tall - 2, 1, tall);
    if (label) {
      g.fillStyle = label === "N" ? `rgba(255, 140, 110, ${fade})` : `rgba(244, 240, 226, ${fade})`;
      g.fillText(label, x, h - 13);
    } else if (deg % 15 === 0) {
      g.fillStyle = `rgba(230, 226, 210, ${0.5 * fade})`;
      g.font = "500 9px 'Libre Franklin Variable', sans-serif";
      g.fillText(String(deg), x, h - 13);
      g.font = "600 11px 'Libre Franklin Variable', sans-serif";
    }
  }
  g.fillStyle = "#f4c86a";
  g.beginPath();
  g.moveTo(w / 2 - 4, 0);
  g.lineTo(w / 2 + 4, 0);
  g.lineTo(w / 2, 5);
  g.closePath();
  g.fill();
}
