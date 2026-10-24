// Dessin des plateaux sur canvas : des briques laquées, pré-dessinées une fois par couleur et par taille,
// puis recopiées à chaque image ; par-dessus, les éclats de verre et les éclairs des lignes faites.

import { cellsOf, COLS, HIDDEN, ROWS, type Active, type Grid, type PieceType, colorOf } from "../../shared/games/bricks/engine.ts";

/** Laques des pièces (1 à 7, ordre I O T S Z J L) et pierre des lignes grises (8) */
export const LACQUER: Record<number, { base: string; light: string; dark: string }> = {
  1: { base: "#b8323a", light: "#e86a6a", dark: "#6e1420" },
  2: { base: "#d9cfb4", light: "#fff8e6", dark: "#8d8269" },
  3: { base: "#228a63", light: "#5fd3a2", dark: "#0d4a33" },
  4: { base: "#2c5fb8", light: "#7aa6f0", dark: "#142d63" },
  5: { base: "#d39a2c", light: "#ffd77a", dark: "#7c5310" },
  6: { base: "#d9643f", light: "#ff9e78", dark: "#7f2e17" },
  7: { base: "#7d45b5", light: "#b68aea", dark: "#3f1d66" },
  8: { base: "#4d524c", light: "#7b8279", dark: "#272a26" },
};

/** Lignes montrées au-dessus du plateau, pour voir la pièce arriver */
export const SKY_ROWS = 2;
export const SHOWN_ROWS = ROWS - HIDDEN + SKY_ROWS;
const FIRST_ROW = HIDDEN - SKY_ROWS;

const sprites = new Map<string, HTMLCanvasElement>();

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Une brique laquée : dégradé, arête sombre, liseré clair et un reflet comme sur un vernis. */
export function sprite(color: number, cell: number, dpr: number): HTMLCanvasElement {
  const key = `${color}:${cell}:${dpr}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const size = Math.round(cell * dpr);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const l = LACQUER[color] ?? LACQUER[8]!;
  const pad = Math.max(1, size * 0.04);
  const r = size * 0.18;
  const w = size - pad * 2;
  // Corps
  const body = g.createLinearGradient(0, pad, 0, size - pad);
  body.addColorStop(0, l.light);
  body.addColorStop(0.45, l.base);
  body.addColorStop(1, l.dark);
  roundRect(g, pad, pad, w, w, r);
  g.fillStyle = body;
  g.fill();
  // Ombre intérieure en bas et à droite
  g.save();
  roundRect(g, pad, pad, w, w, r);
  g.clip();
  const shade = g.createLinearGradient(pad, pad, size - pad, size - pad);
  shade.addColorStop(0.55, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.32)");
  g.fillStyle = shade;
  g.fillRect(0, 0, size, size);
  // Reflet du vernis
  if (color !== 8) {
    const gloss = g.createLinearGradient(0, pad, 0, pad + w * 0.5);
    gloss.addColorStop(0, "rgba(255,255,255,0.55)");
    gloss.addColorStop(1, "rgba(255,255,255,0.04)");
    g.fillStyle = gloss;
    g.beginPath();
    g.ellipse(size * 0.42, pad + w * 0.2, w * 0.42, w * 0.2, -0.18, 0, Math.PI * 2);
    g.fill();
  } else {
    // Pierre : quelques grains plutôt qu'un reflet
    g.fillStyle = "rgba(255,255,255,0.07)";
    for (let i = 0; i < 6; i++) g.fillRect((((i * 37) % 97) / 97) * w + pad, (((i * 61) % 89) / 89) * w + pad, size * 0.06, size * 0.06);
  }
  g.restore();
  // Liseré clair en haut à gauche, arête sombre
  roundRect(g, pad + 0.5, pad + 0.5, w - 1, w - 1, r);
  g.strokeStyle = "rgba(255,255,255,0.28)";
  g.lineWidth = Math.max(1, size * 0.04);
  g.stroke();
  roundRect(g, pad, pad, w, w, r);
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.lineWidth = Math.max(1, size * 0.03);
  g.stroke();
  sprites.set(key, c);
  return c;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  size: number;
  color: string;
  life: number;
  max: number;
}

export interface Flash {
  row: number;
  life: number;
  max: number;
  gold: boolean;
}

export interface Streak {
  x: number;
  from: number;
  to: number;
  width: number;
  life: number;
  max: number;
  color: number;
}

/** Effets qui vivent sur un plateau : éclats, éclairs de ligne, traînées de chute. */
export class Effects {
  particles: Particle[] = [];
  flashes: Flash[] = [];
  streaks: Streak[] = [];
  /** Décalage vertical de la pile qui monte (lignes grises), en cases */
  rise = 0;
  shake = 0;

  /** Une ligne éclate : un éclair puis des éclats de verre de la couleur des briques */
  burst(rows: number[], grid: Grid, cell: number, big: boolean, reduced: boolean) {
    for (const row of rows) {
      this.flashes.push({ row, life: 0, max: big ? 420 : 300, gold: big });
      if (reduced) continue;
      for (let x = 0; x < COLS; x++) {
        const color = grid[row * COLS + x] || 8;
        const l = LACQUER[color] ?? LACQUER[8]!;
        const count = big ? 3 : 2;
        for (let i = 0; i < count; i++) {
          this.particles.push({
            x: (x + 0.5) * cell,
            y: (row - FIRST_ROW + 0.5) * cell,
            vx: (Math.random() - 0.5) * cell * (big ? 16 : 10),
            vy: -Math.random() * cell * (big ? 14 : 9) - cell * 2,
            spin: (Math.random() - 0.5) * 12,
            angle: Math.random() * Math.PI,
            size: cell * (0.18 + Math.random() * 0.22),
            color: i % 2 ? l.light : l.base,
            life: 0,
            max: 700 + Math.random() * 500,
          });
        }
      }
    }
    if (big && !reduced) this.shake = 1;
  }

  dropStreak(from: Active, to: Active) {
    const xs = cellsOf(to).map(([x]) => x);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    this.streaks.push({ x: min, from: from.y, to: to.y, width: max - min + 1, life: 0, max: 220, color: colorOf(to.type) });
  }

  step(dt: number, cell: number) {
    const g = cell * 34;
    for (const p of this.particles) {
      p.life += dt;
      p.vy += (g * dt) / 1000;
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      p.angle += (p.spin * dt) / 1000;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const f of this.flashes) f.life += dt;
    this.flashes = this.flashes.filter((f) => f.life < f.max);
    for (const s of this.streaks) s.life += dt;
    this.streaks = this.streaks.filter((s) => s.life < s.max);
    this.rise = Math.max(0, this.rise - dt / 140);
    this.shake = Math.max(0, this.shake - dt / 260);
  }

  get busy() {
    return this.particles.length > 0 || this.flashes.length > 0 || this.streaks.length > 0 || this.rise > 0 || this.shake > 0;
  }
}

export interface DrawOptions {
  grid: Grid;
  piece: Active | null;
  ghost: Active | null;
  cell: number;
  dpr: number;
  effects?: Effects;
  /** Plateau éteint : K.O. en cours, éliminé, ou partie pas commencée */
  dim?: boolean;
  /** Pièce posée à moitié transparente (vue d'un adversaire) */
  pieceAlpha?: number;
}

/** Dessine un plateau entier sur son canvas (taille : 10 × SHOWN_ROWS cases). */
export function drawBoard(g: CanvasRenderingContext2D, o: DrawOptions) {
  const { cell, dpr } = o;
  const W = COLS * cell;
  const H = SHOWN_ROWS * cell;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const fx = o.effects;
  const shakeY = fx && fx.shake > 0 ? Math.sin(fx.shake * 30) * fx.shake * cell * 0.12 : 0;
  g.save();
  g.translate(0, shakeY);
  // Fond du bac : feutre sombre et grille très fine, sous les lignes du ciel
  const top = SKY_ROWS * cell;
  const felt = g.createLinearGradient(0, top, 0, H);
  felt.addColorStop(0, "#0b241a");
  felt.addColorStop(1, "#06150f");
  g.fillStyle = felt;
  g.fillRect(0, top, W, H - top);
  g.strokeStyle = "rgba(244,236,218,0.045)";
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 1; x < COLS; x++) {
    g.moveTo(x * cell + 0.5, top);
    g.lineTo(x * cell + 0.5, H);
  }
  for (let y = SKY_ROWS + 1; y < SHOWN_ROWS; y++) {
    g.moveTo(0, y * cell + 0.5);
    g.lineTo(W, y * cell + 0.5);
  }
  g.stroke();

  // Ombre portée par le haut du bac, pour la profondeur
  const shadow = g.createLinearGradient(0, top, 0, top + cell * 2.5);
  shadow.addColorStop(0, "rgba(0,0,0,0.45)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = shadow;
  g.fillRect(0, top, W, cell * 2.5);
  // Un rai de lumière sous la pièce qui tombe, pour viser
  if (o.piece && !o.dim && o.ghost) {
    const xs = cellsOf(o.piece).map(([x]) => x);
    const x0 = Math.min(...xs) * cell;
    const x1 = (Math.max(...xs) + 1) * cell;
    const beam = g.createLinearGradient(0, top, 0, H);
    beam.addColorStop(0, "rgba(255,240,200,0.0)");
    beam.addColorStop(1, "rgba(255,240,200,0.06)");
    g.fillStyle = beam;
    g.fillRect(x0, top, x1 - x0, H - top);
  }

  const rise = fx ? fx.rise * cell : 0;
  // Briques posées
  for (let y = FIRST_ROW; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v = o.grid[y * COLS + x]!;
      if (v === 0) continue;
      g.drawImage(sprite(v, cell, dpr), x * cell, (y - FIRST_ROW) * cell + rise, cell, cell);
    }
  }
  // Fantôme : là où la pièce va tomber
  if (o.ghost && o.piece && o.ghost.y !== o.piece.y) {
    const l = LACQUER[colorOf(o.ghost.type)]!;
    g.save();
    g.globalAlpha = 0.28;
    for (const [x, y] of cellsOf(o.ghost)) {
      if (y < FIRST_ROW) continue;
      roundRect(g, x * cell + cell * 0.1, (y - FIRST_ROW) * cell + cell * 0.1, cell * 0.8, cell * 0.8, cell * 0.16);
      g.fillStyle = l.base;
      g.fill();
    }
    g.globalAlpha = 0.7;
    g.strokeStyle = l.light;
    g.lineWidth = Math.max(1, cell * 0.06);
    for (const [x, y] of cellsOf(o.ghost)) {
      if (y < FIRST_ROW) continue;
      roundRect(g, x * cell + cell * 0.1, (y - FIRST_ROW) * cell + cell * 0.1, cell * 0.8, cell * 0.8, cell * 0.16);
      g.stroke();
    }
    g.restore();
  }
  // Traînées de chute directe
  if (fx) {
    for (const s of fx.streaks) {
      const t = s.life / s.max;
      const l = LACQUER[s.color]!;
      const grad = g.createLinearGradient(0, (s.from - FIRST_ROW) * cell, 0, (s.to - FIRST_ROW + 1) * cell);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, l.light);
      g.globalAlpha = (1 - t) * 0.45;
      g.fillStyle = grad;
      g.fillRect(s.x * cell + cell * 0.12, (s.from - FIRST_ROW) * cell, s.width * cell - cell * 0.24, (s.to - s.from + 1) * cell);
      g.globalAlpha = 1;
    }
  }
  // Pièce en vol
  if (o.piece) {
    g.globalAlpha = o.pieceAlpha ?? 1;
    const color = colorOf(o.piece.type);
    for (const [x, y] of cellsOf(o.piece)) {
      if (y < FIRST_ROW) continue;
      g.drawImage(sprite(color, cell, dpr), x * cell, (y - FIRST_ROW) * cell, cell, cell);
    }
    g.globalAlpha = 1;
  }
  // Éclairs des lignes faites, puis éclats de verre
  if (fx) {
    for (const f of fx.flashes) {
      const t = f.life / f.max;
      g.fillStyle = f.gold ? `rgba(255,226,150,${0.85 * (1 - t)})` : `rgba(255,255,255,${0.75 * (1 - t)})`;
      const y = (f.row - FIRST_ROW) * cell;
      const grow = cell * 0.35 * t;
      g.fillRect(0, y - grow, W, cell + grow * 2);
    }
    for (const p of fx.particles) {
      const t = p.life / p.max;
      g.save();
      g.globalAlpha = 1 - t;
      g.translate(p.x, p.y);
      g.rotate(p.angle);
      g.fillStyle = p.color;
      g.beginPath();
      g.moveTo(0, -p.size);
      g.lineTo(p.size * 0.8, p.size * 0.6);
      g.lineTo(-p.size * 0.7, p.size * 0.4);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
  g.restore();
  if (o.dim) {
    g.fillStyle = "rgba(3,10,7,0.55)";
    g.fillRect(0, top, W, H - top);
  }
}

/** Une pièce seule, centrée dans une petite case (réserve, aperçus). */
export function drawPiece(g: CanvasRenderingContext2D, type: PieceType | null, size: number, dpr: number, faded = false) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size * 0.62);
  if (!type) return;
  const cells = cellsOf({ type, rot: 0, x: 0, y: 0 });
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  const h = Math.max(...ys) - Math.min(...ys) + 1;
  const cell = Math.min(size / 4.6, (size * 0.62) / 2.6);
  const ox = (size - w * cell) / 2 - Math.min(...xs) * cell;
  const oy = (size * 0.62 - h * cell) / 2 - Math.min(...ys) * cell;
  g.globalAlpha = faded ? 0.35 : 1;
  for (const [x, y] of cells) g.drawImage(sprite(colorOf(type), cell, dpr), ox + x * cell, oy + y * cell, cell, cell);
  g.globalAlpha = 1;
}

/** Cellule du canvas sous un point (pour viser un adversaire au doigt, ou les gestes). */
export const boardSize = (cell: number) => ({ width: COLS * cell, height: SHOWN_ROWS * cell });
