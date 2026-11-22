// La géométrie de la visée, sans physique : où la blanche lancée tout droit touche la première bille (la bille
// fantôme), quelle direction prend alors la bille visée et celle que prend la blanche (la tangente), ou quelle bande elle
// touche. Sert à la ligne de visée à l'écran et aux bots pour choisir leurs coups.

import type { BallSpot } from "./shot.ts";
import type { Table } from "./table.ts";

export interface AimHit {
  /** La distance parcourue par la blanche jusqu'au contact */
  dist: number;
  /** Le centre de la blanche au contact (la bille fantôme) */
  gx: number;
  gy: number;
  /** La bille touchée (−1 : une bande) */
  ball: number;
  /** La direction que prend la bille touchée (unitaire), et celle de la blanche juste après (sans effet) */
  ox: number;
  oy: number;
  tx: number;
  ty: number;
  /** La part de la vitesse donnée à la bille visée (cos de l'angle de coupe) */
  full: number;
}

/** La blanche lancée de (x, y) dans la direction (dx, dy), unitaire : son premier contact, avec une bille ou une bande */
export function castAim(t: Table, balls: readonly BallSpot[], cue: number, x: number, y: number, dx: number, dy: number): AimHit {
  const R = t.R;
  let best = Infinity;
  let hit = -1;
  for (const b of balls) {
    if (b.id === cue) continue;
    const px = b.x - x,
      py = b.y - y;
    const along = px * dx + py * dy;
    if (along <= 0) continue;
    const perp2 = px * px + py * py - along * along;
    const d2 = 4 * R * R - perp2;
    if (d2 < 0) continue;
    const d = along - Math.sqrt(d2);
    if (d < best && d >= -1e-9) {
      best = Math.max(0, d);
      hit = b.id;
    }
  }
  // La bande : le bord du tapis moins le rayon (on ignore les poches pour la ligne)
  const lim = (lo: number, hi: number, p: number, v: number) => (v > 0 ? (hi - p) / v : v < 0 ? (lo - p) / v : Infinity);
  const tx = lim(-t.lx + R, t.lx - R, x, dx),
    ty = lim(-t.ly + R, t.ly - R, y, dy);
  const wall = Math.max(0, Math.min(tx, ty));
  if (hit < 0 || wall < best) {
    const gx = x + dx * wall,
      gy = y + dy * wall;
    // Le rebond sans effet : on renverse la composante qui touche la bande
    const rx = tx < ty ? -dx : dx,
      ry = tx < ty ? dy : -dy;
    return { dist: wall, gx, gy, ball: -1, ox: rx, oy: ry, tx: rx, ty: ry, full: 0 };
  }
  const gx = x + dx * best,
    gy = y + dy * best;
  const b = balls.find((q) => q.id === hit)!;
  let ox = b.x - gx,
    oy = b.y - gy;
  const l = Math.sqrt(ox * ox + oy * oy) || 1;
  ox /= l;
  oy /= l;
  const full = dx * ox + dy * oy;
  // La blanche part le long de la tangente (à 90° de la bille visée), du côté où elle allait
  let tx2 = dx - full * ox,
    ty2 = dy - full * oy;
  const tl = Math.sqrt(tx2 * tx2 + ty2 * ty2);
  if (tl > 1e-6) {
    tx2 /= tl;
    ty2 /= tl;
  } else {
    tx2 = 0;
    ty2 = 0;
  }
  return { dist: best, gx, gy, ball: hit, ox, oy, tx: tx2, ty: ty2, full };
}

/** Rien sur le chemin d'une bille de (ax, ay) à (bx, by), à part celles qu'on ignore */
export function pathClear(
  t: Table,
  balls: readonly BallSpot[],
  ignore: readonly number[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  margin = 0,
): boolean {
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const lim = 2 * t.R + margin;
  for (const b of balls) {
    if (ignore.includes(b.id)) continue;
    let k = len2 > 0 ? ((b.x - ax) * dx + (b.y - ay) * dy) / len2 : 0;
    if (k < 0) k = 0;
    else if (k > 1) k = 1;
    const ex = ax + dx * k - b.x,
      ey = ay + dy * k - b.y;
    if (ex * ex + ey * ey < lim * lim) return false;
  }
  return true;
}

/** Le point de la poche à viser (un peu au-delà de l'embouchure) */
export function pocketAim(t: Table, i: number): { x: number; y: number } {
  const p = t.pockets[i]!;
  const k = p.corner ? 0.012 : 0.008;
  return { x: p.ox + p.nx * k, y: p.oy + p.ny * k };
}

/** La bille peut-elle entrer dans cette poche en arrivant de (x, y) ? (pas trop de biais sur une poche du milieu) */
export function pocketOpen(t: Table, i: number, x: number, y: number): number {
  const p = t.pockets[i]!;
  const a = pocketAim(t, i);
  let dx = a.x - x,
    dy = a.y - y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= l;
  dy /= l;
  // Le cosinus entre l'arrivée et l'axe de la poche
  const c = dx * p.nx + dy * p.ny;
  const need = p.corner ? 0.5 : 0.62;
  if (c < need) return 0;
  return (c - need) / (1 - need);
}
