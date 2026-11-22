// Le moteur du billard : des billes sur un tapis, vues de dessus, avec leur rotation en trois dimensions.
//
// Une bille glisse tant que son point de contact avec le tapis frotte (après le coup de queue, après un choc) : le
// frottement la freine et la fait tourner, jusqu'à ce qu'elle roule sans glisser. C'est ce qui fait le rétro (une bille
// frappée bas tourne à l'envers, s'arrête sur la bille visée puis revient), le coulé (frappée haut, elle suit) et le
// piqué de la bille qui part en courbe après un choc. L'effet de côté (rotation autour de la verticale) ne courbe pas la
// trajectoire sur le tapis, mais il change l'angle du rebond sur les bandes, et un peu la bille visée (l'« effet
// transmis »).
//
// Les chocs se calculent à l'instant exact du contact : à chaque pas, on cherche le premier choc à venir (entre deux
// billes, ou d'une bille contre une bande), on avance tout le monde jusque-là, on le règle par impulsions (rebond et
// frottement au point de contact), et on recommence avec le reste du pas. Rien ne passe au travers, même lancé fort.
//
// Le serveur et tous les écrans doivent trouver exactement les mêmes billes aux mêmes places : la boucle n'utilise que
// + − × ÷ et la racine carrée, qui donnent le même résultat au bit près dans tous les navigateurs (pas de sinus ni de
// cosinus, pas de Math.hypot), et toujours dans le même ordre.

import type { Table } from "./table.ts";

export const HZ = 400;
export const DT = 1 / HZ;
/** Au plus tant de chocs dans un même pas (un triangle qui éclate en fait beaucoup d'un coup) */
const MAX_EVENTS_PER_STEP = 120;
/** Au plus trente secondes de jeu par coup : au-delà, tout s'arrête là où c'est */
export const MAX_STEPS = 30 * HZ;

export interface PhysConfig {
  g: number;
  /** Le frottement de la bille qui glisse sur le tapis */
  slide: number;
  /** La résistance au roulement */
  roll: number;
  /** Le ralentissement de la rotation autour de la verticale (rad/s²) */
  spinDecel: number;
  /** Les chocs entre billes : rebond, frottement (l'effet transmis, la bille « jetée ») */
  ballE: number;
  ballMu: number;
  /** Les bandes : rebond, frottement, et la hauteur du nez au-dessus du centre de la bille (en part du rayon) */
  cushionE: number;
  cushionMu: number;
  cushionLift: number;
}

/** Le tapis d'une table à poches */
export const POOL_PHYS: PhysConfig = {
  g: 9.81,
  slide: 0.2,
  roll: 0.012,
  spinDecel: 10,
  ballE: 0.94,
  ballMu: 0.05,
  cushionE: 0.84,
  cushionMu: 0.3,
  cushionLift: 0.27,
};

/** Le drap de carambole, plus rapide (ardoise chauffée, drap ras) */
export const CAROM_PHYS: PhysConfig = {
  ...POOL_PHYS,
  slide: 0.18,
  roll: 0.0095,
  spinDecel: 8,
  ballE: 0.95,
  cushionE: 0.86,
};

export class Ball {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  wx = 0;
  wy = 0;
  wz = 0;
  /** Sur le tapis (faux : dans une poche, ou sortie de la table) */
  on = true;
  /** La poche où elle est tombée (−1 : aucune) */
  pocket = -1;
  constructor(readonly id: number) {}

  get moving(): boolean {
    return this.vx !== 0 || this.vy !== 0 || this.wx !== 0 || this.wy !== 0 || this.wz !== 0;
  }
}

/** Un choc : entre deux billes, contre une bande, une bille qui tombe dans une poche (ou qui sort) */
export interface PhysEvent {
  /** Le pas où il arrive */
  s: number;
  k: "bille" | "bande" | "poche" | "sortie";
  /** La bille (pour un choc entre deux billes, la première des deux par numéro) */
  a: number;
  /** L'autre bille, la bande, la poche */
  b: number;
  /** La vitesse du choc (m/s) */
  v: number;
  /** Où, sur le tapis */
  x: number;
  y: number;
}

/** Une bande prête à servir : son segment, sa direction, sa longueur */
interface Rail {
  ax: number;
  ay: number;
  ux: number;
  uy: number;
  len: number;
  /** La distance du contact : rayon de la bille + rayon du caoutchouc */
  d: number;
  rail: number;
}

/** Ce que demande un coup de queue */
export interface Strike {
  /** La direction du coup (pas forcément de longueur 1 : on la ramène à 1 ici) */
  dx: number;
  dy: number;
  /** La vitesse donnée à la bille (m/s) */
  v: number;
  /** Le point de frappe sur la bille, dans le disque de rayon 1 : a de côté (positif : à droite), b en hauteur (positif : haut) */
  a: number;
  b: number;
}

/** Le point de frappe le plus excentré (en part du rayon de la bille) : au-delà, la queue glisserait */
export const TIP_REACH = 0.5;

export class World {
  readonly balls: Ball[];
  readonly events: PhysEvent[] = [];
  step = 0;
  private rails: Rail[];
  private readonly R: number;
  private readonly D2: number;
  /** En deçà de cette distance du bord du tapis, une bille peut toucher une bande pendant le pas */
  private readonly lx: number;
  private readonly ly: number;

  constructor(
    readonly table: Table,
    readonly cfg: PhysConfig,
    start: readonly { id: number; x: number; y: number }[],
  ) {
    this.R = table.R;
    this.D2 = 4 * table.R * table.R;
    this.lx = table.lx;
    this.ly = table.ly;
    this.balls = start.map((b) => {
      const o = new Ball(b.id);
      o.x = b.x;
      o.y = b.y;
      return o;
    });
    this.rails = table.cushions.map((c) => {
      const dx = c.bx - c.ax,
        dy = c.by - c.ay;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { ax: c.ax, ay: c.ay, ux: dx / len, uy: dy / len, len, d: table.R + c.r, rail: c.rail };
    });
  }

  ball(id: number): Ball | undefined {
    return this.balls.find((b) => b.id === id);
  }

  /** Le coup de queue sur une bille */
  strike(id: number, s: Strike) {
    const b = this.ball(id);
    if (!b || !b.on) return;
    const l = Math.sqrt(s.dx * s.dx + s.dy * s.dy);
    if (!(l > 0)) return;
    const dx = s.dx / l,
      dy = s.dy / l;
    b.vx = dx * s.v;
    b.vy = dy * s.v;
    // Le coup frappe la bille à (a, b)·TIP_REACH·R de son centre : ω = (5/2)·v/R·(a·haut + b·(haut × direction))
    const k = (2.5 * s.v * TIP_REACH) / this.R;
    b.wz = k * s.a;
    b.wx = -k * s.b * dy;
    b.wy = k * s.b * dx;
  }

  /** Une bille bouge encore */
  get moving(): boolean {
    for (const b of this.balls) if (b.on && b.moving) return true;
    return false;
  }

  /** Un pas de temps */
  advance() {
    const balls = this.balls;
    const n = balls.length;
    const R = this.R;
    let rem = DT;
    // La vitesse de chacun (pour écarter vite les paires trop loin l'une de l'autre)
    const speed = new Float64Array(n);
    let any = false;
    for (let i = 0; i < n; i++) {
      const b = balls[i]!;
      if (!b.on) continue;
      if (b.vx !== 0 || b.vy !== 0) {
        speed[i] = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        any = true;
      }
    }
    for (let guard = 0; any && rem > 0 && guard < MAX_EVENTS_PER_STEP; guard++) {
      let best = rem;
      let kind = 0;
      let ia = -1,
        ib = -1;
      for (let i = 0; i < n; i++) {
        const p = balls[i]!;
        if (!p.on) continue;
        for (let j = i + 1; j < n; j++) {
          const q = balls[j]!;
          if (!q.on || (speed[i] === 0 && speed[j] === 0)) continue;
          const dx = q.x - p.x,
            dy = q.y - p.y;
          const reach = 2 * R + (speed[i]! + speed[j]!) * best;
          const dd = dx * dx + dy * dy;
          if (dd > reach * reach) continue;
          const t = ballToi(dx, dy, q.vx - p.vx, q.vy - p.vy, dd - this.D2, best);
          if (t >= 0 && t < best) {
            best = t;
            kind = 1;
            ia = i;
            ib = j;
          }
        }
      }
      for (let i = 0; i < n; i++) {
        const p = balls[i]!;
        if (!p.on || speed[i] === 0) continue;
        // Loin des bords, aucune bande ne peut être touchée pendant ce pas
        const m = R + 0.012 + speed[i]! * best;
        if (p.x > -this.lx + m && p.x < this.lx - m && p.y > -this.ly + m && p.y < this.ly - m) continue;
        for (let c = 0; c < this.rails.length; c++) {
          const t = railToi(p, this.rails[c]!, best);
          if (t >= 0 && t < best) {
            best = t;
            kind = 2;
            ia = i;
            ib = c;
          }
        }
      }
      // Tout le monde avance jusqu'au choc (ou jusqu'au bout du pas)
      if (best > 0) {
        for (let i = 0; i < n; i++) {
          const p = balls[i]!;
          if (!p.on || speed[i] === 0) continue;
          p.x += p.vx * best;
          p.y += p.vy * best;
        }
      }
      rem -= best;
      if (kind === 0) break;
      if (kind === 1) this.collideBalls(balls[ia]!, balls[ib]!);
      else this.collideRail(balls[ia]!, this.rails[ib]!);
      for (const k of kind === 1 ? [ia, ib] : [ia]) {
        const b = balls[k]!;
        speed[k] = b.vx !== 0 || b.vy !== 0 ? Math.sqrt(b.vx * b.vx + b.vy * b.vy) : 0;
      }
    }
    // Il reste du temps sans choc trouvé (trop de chocs dans ce pas) : on avance quand même
    if (rem > 0 && any) {
      for (let i = 0; i < n; i++) {
        const p = balls[i]!;
        if (!p.on || speed[i] === 0) continue;
        p.x += p.vx * rem;
        p.y += p.vy * rem;
      }
    }
    for (const b of balls) if (b.on && b.moving) this.friction(b);
    this.checkPockets();
    this.step++;
  }

  /** Le frottement du tapis pendant un pas */
  private friction(b: Ball) {
    const R = this.R;
    const cfg = this.cfg;
    // La vitesse du point de contact avec le tapis
    const ux = b.vx - R * b.wy,
      uy = b.vy + R * b.wx;
    const us = Math.sqrt(ux * ux + uy * uy);
    const slideDec = cfg.slide * cfg.g * DT;
    if (us > 1e-9 && us > 3.5 * slideDec) {
      // Elle glisse : le frottement la freine dans le sens du glissement et la fait tourner
      const kx = ux / us,
        ky = uy / us;
      b.vx -= slideDec * kx;
      b.vy -= slideDec * ky;
      b.wx -= ((2.5 * slideDec) / R) * ky;
      b.wy += ((2.5 * slideDec) / R) * kx;
    } else {
      if (us > 0) {
        // Elle finit de glisser pendant ce pas : la part qui reste, puis elle roule
        const k = us / 3.5;
        b.vx -= (k * ux) / us;
        b.vy -= (k * uy) / us;
      }
      // Elle roule : la résistance au roulement la freine
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const rollDec = cfg.roll * cfg.g * DT;
      if (sp <= rollDec) {
        b.vx = 0;
        b.vy = 0;
      } else {
        const f = (sp - rollDec) / sp;
        b.vx *= f;
        b.vy *= f;
      }
      b.wx = -b.vy / R;
      b.wy = b.vx / R;
    }
    // La rotation autour de la verticale s'use
    const sd = cfg.spinDecel * DT;
    if (b.wz > sd) b.wz -= sd;
    else if (b.wz < -sd) b.wz += sd;
    else b.wz = 0;
  }

  /** Deux billes qui se touchent : le rebond, puis le frottement au point de contact */
  private collideBalls(p: Ball, q: Ball) {
    const R = this.R;
    const cfg = this.cfg;
    let nx = q.x - p.x,
      ny = q.y - p.y;
    const l = Math.sqrt(nx * nx + ny * ny);
    nx /= l;
    ny /= l;
    const vn = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
    if (vn <= 0) return;
    const jn = ((1 + cfg.ballE) * vn) / 2;
    p.vx -= jn * nx;
    p.vy -= jn * ny;
    q.vx += jn * nx;
    q.vy += jn * ny;
    // Le glissement au point de contact (vitesses du point sur chaque bille, rotation comprise), sans la part normale
    const c1x = p.vx - R * p.wz * ny,
      c1y = p.vy + R * p.wz * nx,
      c1z = R * (p.wx * ny - p.wy * nx);
    const c2x = q.vx + R * q.wz * ny,
      c2y = q.vy - R * q.wz * nx,
      c2z = -R * (q.wx * ny - q.wy * nx);
    let sx = c1x - c2x,
      sy = c1y - c2y;
    const sz = c1z - c2z;
    const sn = sx * nx + sy * ny;
    sx -= sn * nx;
    sy -= sn * ny;
    const ss = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (ss > 1e-9) {
      const jt = Math.min(cfg.ballMu * jn, ss / 7);
      const fx = (-jt * sx) / ss,
        fy = (-jt * sy) / ss,
        fz = (-jt * sz) / ss;
      // Sur la première bille, l'impulsion (fx, fy, fz) au point R·n ; sur la seconde, l'opposée au point −R·n
      p.vx += fx;
      p.vy += fy;
      q.vx -= fx;
      q.vy -= fy;
      const k = 2.5 / R; // (5/2)/(m·R²) × R
      // ω += (r × f)·5/(2R²) avec r = R·n : r × f = R·(ny·fz, −nx·fz, nx·fy − ny·fx)
      const tx = ny * fz,
        ty = -nx * fz,
        tz = nx * fy - ny * fx;
      p.wx += k * tx;
      p.wy += k * ty;
      p.wz += k * tz;
      // Sur la seconde : r = −R·n, f opposée : le même moment
      q.wx += k * tx;
      q.wy += k * ty;
      q.wz += k * tz;
    }
    const a = p.id < q.id ? p : q,
      b = p.id < q.id ? q : p;
    this.events.push({ s: this.step, k: "bille", a: a.id, b: b.id, v: vn, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  }

  /** Une bille contre une bande : le rebond, puis le frottement du caoutchouc (qui touche la bille un peu au-dessus de son centre) */
  private collideRail(b: Ball, rail: Rail) {
    const R = this.R;
    const cfg = this.cfg;
    // Le point le plus proche du segment : la normale va de lui au centre de la bille
    let t = (b.x - rail.ax) * rail.ux + (b.y - rail.ay) * rail.uy;
    if (t < 0) t = 0;
    else if (t > rail.len) t = rail.len;
    let nx = b.x - (rail.ax + rail.ux * t),
      ny = b.y - (rail.ay + rail.uy * t);
    const l = Math.sqrt(nx * nx + ny * ny);
    nx /= l;
    ny /= l;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    const jn = -(1 + cfg.cushionE) * vn;
    b.vx += jn * nx;
    b.vy += jn * ny;
    // Le contact : r = R·(−cos·n + sin·haut), avec sin la hauteur du nez au-dessus du centre
    const sn = cfg.cushionLift;
    const cs = Math.sqrt(1 - sn * sn);
    const rx = -R * cs * nx,
      ry = -R * cs * ny,
      rz = R * sn;
    // La vitesse du point de contact : v + ω × r
    const cx = b.vx + (b.wy * rz - b.wz * ry),
      cy = b.vy + (b.wz * rx - b.wx * rz),
      cz = b.wx * ry - b.wy * rx;
    // Sa part dans le plan de la bande (le long de la bande, et en hauteur)
    const tx = -ny,
      ty = nx;
    const ct = cx * tx + cy * ty;
    const ss = Math.sqrt(ct * ct + cz * cz);
    if (ss > 1e-9) {
      const jt = Math.min(cfg.cushionMu * jn, ss / 3.5);
      const fx = ((-jt * ct) / ss) * tx,
        fy = ((-jt * ct) / ss) * ty,
        fz = (-jt * cz) / ss;
      // La part horizontale change la vitesse ; la part verticale, le tapis la reprend
      b.vx += fx;
      b.vy += fy;
      const k = 2.5 / (R * R);
      b.wx += k * (ry * fz - rz * fy);
      b.wy += k * (rz * fx - rx * fz);
      b.wz += k * (rx * fy - ry * fx);
    }
    this.events.push({ s: this.step, k: "bande", a: b.id, b: rail.rail, v: -vn, x: b.x, y: b.y });
  }

  /** Les billes qui ont franchi la ligne de chute d'une poche tombent ; celles qui sortent de la table aussi */
  private checkPockets() {
    const t = this.table;
    for (const b of this.balls) {
      if (!b.on || (b.vx === 0 && b.vy === 0)) continue;
      for (let i = 0; i < t.pockets.length; i++) {
        const p = t.pockets[i]!;
        if ((b.x - p.ox) * p.nx + (b.y - p.oy) * p.ny > p.depth) {
          this.events.push({ s: this.step, k: "poche", a: b.id, b: i, v: Math.sqrt(b.vx * b.vx + b.vy * b.vy), x: b.x, y: b.y });
          this.sink(b, i);
          break;
        }
      }
      if (b.on && (b.x > t.lx + 0.15 || b.x < -t.lx - 0.15 || b.y > t.ly + 0.15 || b.y < -t.ly - 0.15)) {
        this.events.push({ s: this.step, k: "sortie", a: b.id, b: -1, v: 0, x: b.x, y: b.y });
        this.sink(b, -1);
      }
    }
  }

  private sink(b: Ball, pocket: number) {
    b.on = false;
    b.pocket = pocket;
    b.vx = b.vy = b.wx = b.wy = b.wz = 0;
  }

  /** Tout s'arrête (le coup a trop duré) */
  freeze() {
    for (const b of this.balls) b.vx = b.vy = b.wx = b.wy = b.wz = 0;
  }
}

/**
 * Le premier instant (dans [0, max]) où deux billes se touchent, ou −1. (dx, dy) : de la première à la seconde ;
 * (dvx, dvy) : la vitesse de la seconde par rapport à la première ; c : distance² − (2R)².
 */
function ballToi(dx: number, dy: number, dvx: number, dvy: number, c: number, max: number): number {
  const b = dx * dvx + dy * dvy;
  if (b >= 0) return -1;
  if (c <= 0) return 0;
  const a = dvx * dvx + dvy * dvy;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  // La plus petite racine, écrite sans soustraction de nombres voisins
  const t = c / (-b + Math.sqrt(disc));
  return t <= max ? t : -1;
}

/** Le premier instant (dans [0, max]) où une bille touche une bande, ou −1 */
function railToi(p: Ball, r: Rail, max: number): number {
  const px = p.x - r.ax,
    py = p.y - r.ay;
  const along = px * r.ux + py * r.uy;
  const vAlong = p.vx * r.ux + p.vy * r.uy;
  // La normale du segment, du côté de la bille
  let nx = -r.uy,
    ny = r.ux;
  let s0 = px * nx + py * ny;
  if (s0 < 0) {
    nx = -nx;
    ny = -ny;
    s0 = -s0;
  }
  const vn = p.vx * nx + p.vy * ny;
  let best = -1;
  if (vn < 0) {
    const t = s0 <= r.d ? 0 : (s0 - r.d) / -vn;
    if (t <= max) {
      const at = along + vAlong * t;
      if (at >= 0 && at <= r.len) {
        // Déjà contre la bande (au milieu du segment) : seulement si elle s'en approche, ce qui est le cas
        best = t;
      }
    }
  }
  if (best >= 0) return best;
  // Les deux bouts arrondis
  const d2 = r.d * r.d;
  for (const e of [0, r.len]) {
    const dx = r.ax + r.ux * e - p.x,
      dy = r.ay + r.uy * e - p.y;
    const t = ballToi(dx, dy, -p.vx, -p.vy, dx * dx + dy * dy - d2, max);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

/** Tout le coup, joué jusqu'à ce que plus rien ne bouge */
export function runToRest(w: World, maxSteps = MAX_STEPS): World {
  while (w.moving && w.step < maxSteps) w.advance();
  if (w.moving) w.freeze();
  return w;
}
