// Le moteur du bowling : la boule et les quilles sont de vrais corps rigides. Une quille est faite de sphères posées le
// long de son axe (son ventre, son cou, sa tête, et une couronne de petites sphères sous sa base, pour qu'elle tienne
// debout et vacille avant de tomber) ; la boule est une seule sphère, lourde, qui glisse dans l'huile puis mord le fond
// sec de la piste : c'est ce frottement qui la fait courber quand elle tourne sur le côté.
//
// Les chocs se règlent par impulsions successives (rebond, frottement), pas à pas, 400 fois par seconde. Une quille
// immobile dort : on ne la calcule plus tant que rien ne la touche.
//
// Le serveur et tous les écrans doivent trouver exactement les mêmes quilles par terre : la boucle n'utilise que
// + − × ÷ et la racine carrée, qui donnent le même résultat au bit près dans tous les navigateurs (pas de sinus ni de
// cosinus, pas de Math.hypot), et toujours dans le même ordre.

import {
  CEILING,
  CUSHION,
  DECK_END,
  GUTTER_OUTER,
  GUTTER_R,
  GUTTER_XC,
  GUTTER_YC,
  KICKBACK_FROM,
  LANE_HALF,
  OIL_END,
  PIT_DEPTH,
  WALL_HIGH,
  WALL_LOW,
  type PinSpot,
} from "./lane.ts";

export const HZ = 400;
export const DT = 1 / HZ;
const ITERATIONS = 10;
/** Un contact se prépare un peu avant que les formes se touchent (rien ne passe au travers) */
const MARGIN = 0.012;
const SLOP = 0.0008;
const BAUMGARTE = 0.25;
/** En dessous de cette vitesse de choc, pas de rebond (on reste posé) */
const BOUNCE_MIN = 0.35;

export interface PhysConfig {
  /** La pesanteur */
  g: number;
  ballR: number;
  ballMass: number;
  /** Le frottement de la boule sur la piste huilée, puis sur le fond sec, et où l'huile s'arrête */
  oil: number;
  dry: number;
  oilEnd: number;
  /** Des barrières le long des rigoles : la boule n'y tombe plus */
  bumpers: boolean;
  /** La masse des quilles */
  pinMass: number;
  /** Les chocs : rebond et frottement entre quilles, de la boule sur une quille, et des quilles sur le plateau */
  pinBounce: number;
  pinFriction: number;
  ballBounce: number;
  ballFriction: number;
  deckFriction: number;
  deckBounce: number;
}

export const DEFAULT_PHYS: PhysConfig = {
  g: 9.81,
  ballR: 0.1085,
  ballMass: 7.2,
  oil: 0.035,
  dry: 0.2,
  oilEnd: OIL_END,
  bumpers: false,
  pinMass: 1.53,
  pinBounce: 0.58,
  pinFriction: 0.12,
  ballBounce: 0.58,
  ballFriction: 0.12,
  deckFriction: 0.42,
  deckBounce: 0.35,
};

// ---------------------------------------------------------------------------
// Les formes
// ---------------------------------------------------------------------------

interface Shape {
  n: number;
  lx: Float64Array;
  ly: Float64Array;
  lz: Float64Array;
  r: Float64Array;
  /** Les sphères à partir de celle-ci servent aux chocs entre corps (la couronne de la base ne sert qu'au sol) */
  main: number;
  /** Le rayon d'une sphère qui contient tout le corps, autour de son centre de gravité */
  bound: number;
}

/** La hauteur du centre de gravité d'une quille au-dessus de sa base */
export const PIN_COM = 0.146;
/** La couronne sous la base : ses petites sphères, leur rayon, à quelle distance de l'axe */
const RING_N = 8;
const RING_R = 0.006;
const RING_AT = 0.02;
/** Le profil d'une quille en sphères : hauteur au-dessus de la base, rayon */
const PIN_PROFILE: [number, number][] = [
  [0.04, 0.034],
  [0.085, 0.052],
  [0.12, 0.0605],
  [0.17, 0.05],
  [0.215, 0.035],
  [0.255, 0.024],
  [0.3, 0.028],
  [0.343, 0.032],
];
/** Les cosinus et sinus des huit directions de la couronne (des nombres écrits, pour ne rien calculer) */
const RING_DIRS: [number, number][] = [
  [1, 0],
  [0.7071067811865476, 0.7071067811865476],
  [0, 1],
  [-0.7071067811865476, 0.7071067811865476],
  [-1, 0],
  [-0.7071067811865476, -0.7071067811865476],
  [0, -1],
  [0.7071067811865476, -0.7071067811865476],
];

function pinShape(): Shape {
  const n = RING_N + PIN_PROFILE.length;
  const s: Shape = {
    n,
    lx: new Float64Array(n),
    ly: new Float64Array(n),
    lz: new Float64Array(n),
    r: new Float64Array(n),
    main: RING_N,
    bound: 0,
  };
  for (let i = 0; i < RING_N; i++) {
    s.lx[i] = RING_DIRS[i]![0] * RING_AT;
    s.lz[i] = RING_DIRS[i]![1] * RING_AT;
    s.ly[i] = RING_R - PIN_COM;
    s.r[i] = RING_R;
  }
  PIN_PROFILE.forEach(([h, r], k) => {
    s.ly[RING_N + k] = h - PIN_COM;
    s.r[RING_N + k] = r;
  });
  let bound = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.sqrt(s.lx[i]! * s.lx[i]! + s.ly[i]! * s.ly[i]! + s.lz[i]! * s.lz[i]!) + s.r[i]!;
    if (d > bound) bound = d;
  }
  s.bound = bound;
  return s;
}

function ballShape(r: number): Shape {
  return {
    n: 1,
    lx: new Float64Array(1),
    ly: new Float64Array(1),
    lz: new Float64Array(1),
    r: Float64Array.of(r),
    main: 0,
    bound: r,
  };
}

const PIN_SHAPE = pinShape();

// ---------------------------------------------------------------------------
// Les corps
// ---------------------------------------------------------------------------

export class Body {
  px = 0;
  py = 0;
  pz = 0;
  qw = 1;
  qx = 0;
  qy = 0;
  qz = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  wx = 0;
  wy = 0;
  wz = 0;
  readonly im: number;
  readonly iix: number;
  readonly iiy: number;
  readonly iiz: number;
  // La rotation (matrice), et l'inverse de l'inertie dans le repère du monde
  r00 = 1;
  r01 = 0;
  r02 = 0;
  r10 = 0;
  r11 = 1;
  r12 = 0;
  r20 = 0;
  r21 = 0;
  r22 = 1;
  i00 = 0;
  i01 = 0;
  i02 = 0;
  i11 = 0;
  i12 = 0;
  i22 = 0;
  awake = false;
  /** Depuis combien de pas il bouge à peine */
  still = 0;
  /** Tombé dans la fosse : on ne le calcule plus */
  gone = false;
  /** Il a touché le sol pendant ce pas (pour freiner une quille qui roule) */
  grounded = false;
  readonly sx: Float64Array;
  readonly sy: Float64Array;
  readonly sz: Float64Array;

  constructor(
    /** 0 : la boule ; 1 à 10 : le numéro de la quille */
    readonly id: number,
    readonly shape: Shape,
    mass: number,
    ix: number,
    iy: number,
    iz: number,
  ) {
    this.im = 1 / mass;
    this.iix = 1 / ix;
    this.iiy = 1 / iy;
    this.iiz = 1 / iz;
    this.sx = new Float64Array(shape.n);
    this.sy = new Float64Array(shape.n);
    this.sz = new Float64Array(shape.n);
  }

  get isPin() {
    return this.id > 0;
  }

  /** La rotation, l'inertie et les sphères dans le monde, d'après la position et l'orientation */
  update() {
    const { qw: w, qx: x, qy: y, qz: z } = this;
    const xx = x * x,
      yy = y * y,
      zz = z * z,
      xy = x * y,
      xz = x * z,
      yz = y * z,
      wx = w * x,
      wy = w * y,
      wz = w * z;
    const r00 = 1 - 2 * (yy + zz),
      r01 = 2 * (xy - wz),
      r02 = 2 * (xz + wy);
    const r10 = 2 * (xy + wz),
      r11 = 1 - 2 * (xx + zz),
      r12 = 2 * (yz - wx);
    const r20 = 2 * (xz - wy),
      r21 = 2 * (yz + wx),
      r22 = 1 - 2 * (xx + yy);
    this.r00 = r00;
    this.r01 = r01;
    this.r02 = r02;
    this.r10 = r10;
    this.r11 = r11;
    this.r12 = r12;
    this.r20 = r20;
    this.r21 = r21;
    this.r22 = r22;
    // I⁻¹ monde = R · diag · Rᵀ
    const a = this.iix,
      b = this.iiy,
      c = this.iiz;
    this.i00 = r00 * r00 * a + r01 * r01 * b + r02 * r02 * c;
    this.i01 = r00 * r10 * a + r01 * r11 * b + r02 * r12 * c;
    this.i02 = r00 * r20 * a + r01 * r21 * b + r02 * r22 * c;
    this.i11 = r10 * r10 * a + r11 * r11 * b + r12 * r12 * c;
    this.i12 = r10 * r20 * a + r11 * r21 * b + r12 * r22 * c;
    this.i22 = r20 * r20 * a + r21 * r21 * b + r22 * r22 * c;
    const s = this.shape;
    for (let i = 0; i < s.n; i++) {
      const lx = s.lx[i]!,
        ly = s.ly[i]!,
        lz = s.lz[i]!;
      this.sx[i] = this.px + r00 * lx + r01 * ly + r02 * lz;
      this.sy[i] = this.py + r10 * lx + r11 * ly + r12 * lz;
      this.sz[i] = this.pz + r20 * lx + r21 * ly + r22 * lz;
    }
  }

  /** Son axe vers le haut : y de la deuxième colonne de la rotation (1 pour une quille droite) */
  get upY() {
    return this.r11;
  }

  /** Le pied de la quille (le centre de sa base) */
  baseX() {
    return this.px - this.r01 * PIN_COM;
  }
  baseY() {
    return this.py - this.r11 * PIN_COM;
  }
  baseZ() {
    return this.pz - this.r21 * PIN_COM;
  }

  sleep() {
    this.awake = false;
    this.still = 0;
    this.vx = this.vy = this.vz = 0;
    this.wx = this.wy = this.wz = 0;
  }
}

export function makePin(spot: PinSpot, cfg: PhysConfig): Body {
  // Une quille : inertie le long de son axe plus faible qu'en travers (elle est fine et haute)
  const k = cfg.pinMass / 1.53;
  const b = new Body(spot.n, PIN_SHAPE, cfg.pinMass, 0.017 * k, 0.0018 * k, 0.017 * k);
  b.px = spot.x;
  b.py = PIN_COM;
  b.pz = spot.z;
  b.update();
  return b;
}

export function makeBall(cfg: PhysConfig): Body {
  // Une boule a un noyau : son inertie est un peu plus faible que celle d'une sphère pleine (rayon de giration 6,35 cm)
  const k2 = 0.0635 * 0.0635 * (cfg.ballR / 0.1085) * (cfg.ballR / 0.1085);
  const i = cfg.ballMass * k2;
  const b = new Body(0, ballShape(cfg.ballR), cfg.ballMass, i, i, i);
  b.awake = true;
  return b;
}

// ---------------------------------------------------------------------------
// Les contacts
// ---------------------------------------------------------------------------

/** Ce que touche un corps quand ce n'est pas un autre corps */
export const Static = {
  Floor: 1,
  Edge: 2,
  Gutter: 3,
  Wall: 4,
  Bumper: 5,
  PitFloor: 6,
  PitWall: 7,
  DeckEdge: 8,
  Cushion: 9,
  Ceiling: 10,
} as const;
type StaticFeature = (typeof Static)[keyof typeof Static];

class Contact {
  a!: Body;
  b: Body | null = null;
  key = 0;
  feature = 0;
  nx = 0;
  ny = 0;
  nz = 0;
  rax = 0;
  ray = 0;
  raz = 0;
  rbx = 0;
  rby = 0;
  rbz = 0;
  t1x = 0;
  t1y = 0;
  t1z = 0;
  t2x = 0;
  t2y = 0;
  t2z = 0;
  kn = 0;
  kt1 = 0;
  kt2 = 0;
  mu = 0;
  target = 0;
  jn = 0;
  jt1 = 0;
  jt2 = 0;
  /** La vitesse de rapprochement au moment du contact (pour le son) */
  vn0 = 0;
  /** L'enfoncement (négatif : l'écart qui reste avant de se toucher) */
  pen = 0;
  fresh = true;
}

/** Ce que le moteur raconte, pour le son et l'écran */
export interface PhysEvent {
  /** Le pas où ça arrive */
  t: number;
  /** boule sur la piste, boule contre quille, quille contre quille, quille au sol, mur, rigole, fosse, rideau */
  k: "drop" | "hit" | "clack" | "deck" | "wall" | "gutter" | "pit" | "cushion";
  /** Le corps (0 la boule, 1 à 10 les quilles) et l'autre s'il y en a un */
  a: number;
  b: number;
  /** La force du choc (m/s) */
  v: number;
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Le monde
// ---------------------------------------------------------------------------

export class World {
  readonly bodies: Body[];
  readonly ball: Body;
  readonly pins: Body[];
  step = 0;
  events: PhysEvent[] = [];
  /** La boule est dans une rigole (elle n'en ressort pas), depuis ce pas */
  inGutter = false;
  gutterAt = -1;
  /** Le pas où la boule a touché sa première quille, -1 sinon */
  firstHit = -1;
  /** La boule a touché la piste */
  landed = false;
  private pool: Contact[] = [];
  private count = 0;
  private prev = new Map<number, number>();
  private next = new Map<number, number>();

  constructor(
    readonly cfg: PhysConfig,
    pins: readonly PinSpot[],
  ) {
    this.ball = makeBall(cfg);
    this.pins = pins.map((p) => makePin(p, cfg));
    this.bodies = [this.ball, ...this.pins];
  }

  /** Lâcher la boule : sa position, sa vitesse et sa rotation */
  launch(p: [number, number, number], v: [number, number, number], w: [number, number, number]) {
    const b = this.ball;
    [b.px, b.py, b.pz] = p;
    [b.vx, b.vy, b.vz] = v;
    [b.wx, b.wy, b.wz] = w;
    b.update();
  }

  /** Un pas de temps */
  advance() {
    const g = this.cfg.g;
    for (const b of this.bodies) {
      if (!b.awake || b.gone) continue;
      b.vy -= g * DT;
      b.grounded = false;
    }
    this.count = 0;
    this.collide();
    this.prepare();
    for (let it = 0; it < ITERATIONS; it++) for (let i = 0; i < this.count; i++) this.solve(this.pool[i]!);
    const swap = this.prev;
    this.prev = this.next;
    this.next = swap;
    this.next.clear();
    for (let i = 0; i < this.count; i++) {
      const c = this.pool[i]!;
      // Seuls les contacts qui ont vraiment poussé comptent (un contact préparé à l'avance reste « nouveau »)
      if (c.jn > 0) this.prev.set(c.key, c.jn);
    }
    this.report();
    this.integrate();
    this.step++;
  }

  // -- Détection ------------------------------------------------------------

  private add(a: Body, b: Body | null, key: number): Contact {
    let c = this.pool[this.count];
    if (!c) {
      c = new Contact();
      this.pool.push(c);
    }
    this.count++;
    c.a = a;
    c.b = b;
    c.key = key;
    c.jn = 0;
    c.jt1 = 0;
    c.jt2 = 0;
    const was = this.prev.get(key);
    c.fresh = was === undefined;
    if (was !== undefined) c.jn = was * 0.85;
    return c;
  }

  private collide() {
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!;
      if (a.gone) continue;
      if (a.awake) this.collideStatic(a);
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]!;
        if (b.gone || (!a.awake && !b.awake)) continue;
        const dx = a.px - b.px,
          dy = a.py - b.py,
          dz = a.pz - b.pz;
        const reach = a.shape.bound + b.shape.bound + MARGIN;
        if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
        this.collidePair(a, b);
      }
    }
  }

  private collidePair(a: Body, b: Body) {
    const sa = a.shape,
      sb = b.shape;
    let touched = false;
    for (let i = sa.main; i < sa.n; i++) {
      const ax = a.sx[i]!,
        ay = a.sy[i]!,
        az = a.sz[i]!,
        ar = sa.r[i]!;
      for (let j = sb.main; j < sb.n; j++) {
        const dx = ax - b.sx[j]!,
          dy = ay - b.sy[j]!,
          dz = az - b.sz[j]!;
        const rs = ar + sb.r[j]!;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > (rs + MARGIN) * (rs + MARGIN) || d2 < 1e-12) continue;
        if (!touched) {
          touched = true;
          // Une quille endormie se réveille quand un corps qui bouge vient la toucher (contre un corps presque
          // immobile, elle reste un appui fixe)
          const sleeper = !a.awake ? a : !b.awake ? b : null;
          const mover = sleeper === a ? b : a;
          if (sleeper) {
            const sp = mover.vx * mover.vx + mover.vy * mover.vy + mover.vz * mover.vz;
            const sw = mover.wx * mover.wx + mover.wy * mover.wy + mover.wz * mover.wz;
            if (sp + sw * 0.04 >= 0.0009) {
              sleeper.awake = true;
              sleeper.still = 0;
            }
          }
        }
        const d = Math.sqrt(d2);
        const nx = dx / d,
          ny = dy / d,
          nz = dz / d;
        const c = this.add(a, b, a.id * 4096 + i * 256 + b.id * 16 + j);
        c.feature = 0;
        c.nx = nx;
        c.ny = ny;
        c.nz = nz;
        // Le point de contact : à mi-chemin des deux surfaces
        const pen = rs - d;
        const px = ax - nx * (ar - pen / 2),
          py = ay - ny * (ar - pen / 2),
          pz = az - nz * (ar - pen / 2);
        this.setPoint(c, px, py, pz, pen);
        const ball = a.id === 0 || b.id === 0;
        c.mu = ball ? this.cfg.ballFriction : this.cfg.pinFriction;
        c.target = ball ? this.cfg.ballBounce : this.cfg.pinBounce;
      }
    }
  }

  private collideStatic(a: Body) {
    const s = a.shape;
    const cfg = this.cfg;
    for (let i = 0; i < s.n; i++) {
      const cx = a.sx[i]!,
        cy = a.sy[i]!,
        cz = a.sz[i]!,
        r = s.r[i]!;
      const ax = cx < 0 ? -cx : cx;
      const side = cx < 0 ? -1 : 1;
      const onDeck = cz >= -DECK_END;
      // Le sol : l'élan, la piste et le plateau
      if (onDeck && ax <= LANE_HALF && cy - r < MARGIN && cy > -r) {
        this.staticContact(a, i, Static.Floor, 0, 1, 0, cx, cy - r, cz, r - cy);
      }
      // Le bord de la piste, au-dessus de la rigole
      if (onDeck && ax > LANE_HALF && ax < LANE_HALF + r + MARGIN) {
        const dx = cx - side * LANE_HALF,
          dy = cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < (r + MARGIN) * (r + MARGIN) && d2 > 1e-12) {
          const d = Math.sqrt(d2);
          this.staticContact(a, i, Static.Edge, dx / d, dy / d, 0, side * LANE_HALF, 0, cz, r - d);
        }
      }
      // Le creux de la rigole
      if (onDeck && ax > LANE_HALF - r && ax < GUTTER_OUTER + r) {
        const dx = cx - side * GUTTER_XC,
          dy = cy - GUTTER_YC;
        const d = Math.sqrt(dx * dx + dy * dy);
        const pen = d + r - GUTTER_R;
        if (pen > -MARGIN && d > 1e-9 && d < GUTTER_R) {
          const ux = dx / d,
            uy = dy / d;
          const py = GUTTER_YC + uy * GUTTER_R;
          if (py < 0.0005 && ux * side > -0.75 && ux * side < 0.75) {
            this.staticContact(a, i, Static.Gutter, -ux, -uy, 0, side * GUTTER_XC + ux * GUTTER_R, py, cz, pen);
          }
        }
      }
      // Les murs de côté : bas le long de la piste, hauts autour du plateau et de la fosse
      const top = cz < -KICKBACK_FROM ? WALL_HIGH : WALL_LOW;
      if (ax + r > GUTTER_OUTER - MARGIN && cy < top + r) {
        this.staticContact(a, i, Static.Wall, -side, 0, 0, side * GUTTER_OUTER, cy, cz, ax + r - GUTTER_OUTER);
      }
      // Les barrières (règle) : la boule rebondit au bord de la piste au lieu de tomber dans la rigole
      if (cfg.bumpers && onDeck && cz < -1 && cz > -(DECK_END - 0.95) && ax < LANE_HALF && ax + r > LANE_HALF - MARGIN && cy < 0.2) {
        this.staticContact(a, i, Static.Bumper, -side, 0, 0, side * LANE_HALF, cy, cz, ax + r - LANE_HALF);
      }
      if (!onDeck || cz - r < -DECK_END) {
        // La fosse : son fond, sa paroi avant (sous le bord du plateau), le bord lui-même
        if (cz < -DECK_END && cy - r < -PIT_DEPTH + MARGIN) {
          this.staticContact(a, i, Static.PitFloor, 0, 1, 0, cx, -PIT_DEPTH, cz, -PIT_DEPTH - (cy - r));
        }
        if (cz < -DECK_END && cy < 0 && cz + r > -DECK_END - MARGIN) {
          this.staticContact(a, i, Static.PitWall, 0, 0, -1, cx, cy, -DECK_END, cz + r + DECK_END);
        }
        if (cz < -DECK_END && cy >= 0) {
          const dz = cz + DECK_END,
            dy = cy;
          const d2 = dz * dz + dy * dy;
          if (d2 < (r + MARGIN) * (r + MARGIN) && d2 > 1e-12) {
            const d = Math.sqrt(d2);
            this.staticContact(a, i, Static.DeckEdge, 0, dy / d, dz / d, cx, 0, -DECK_END, r - d);
          }
        }
      }
      // Le rideau au fond, et le plafond de la machine
      if (cz - r < -CUSHION + MARGIN) {
        this.staticContact(a, i, Static.Cushion, 0, 0, 1, cx, cy, -CUSHION, -CUSHION - (cz - r));
      }
      if (cz < -KICKBACK_FROM && cy + r > CEILING - MARGIN) {
        this.staticContact(a, i, Static.Ceiling, 0, -1, 0, cx, CEILING, cz, cy + r - CEILING);
      }
    }
  }

  private staticContact(
    a: Body,
    i: number,
    f: StaticFeature,
    nx: number,
    ny: number,
    nz: number,
    px: number,
    py: number,
    pz: number,
    pen: number,
  ) {
    const c = this.add(a, null, a.id * 4096 + i * 256 + 200 + f);
    c.feature = f;
    c.nx = nx;
    c.ny = ny;
    c.nz = nz;
    this.setPoint(c, px, py, pz, pen);
    const ball = a.id === 0;
    switch (f) {
      case Static.Floor: {
        if (ball) {
          // L'huile : la boule glisse ; au-delà, la piste sèche la fait mordre (un passage d'un mètre entre les deux)
          const s = -a.pz;
          const k = s < this.cfg.oilEnd ? 0 : s > this.cfg.oilEnd + 1 ? 1 : s - this.cfg.oilEnd;
          c.mu = this.cfg.oil + (this.cfg.dry - this.cfg.oil) * k;
          c.target = 0.12;
        } else {
          c.mu = this.cfg.deckFriction;
          c.target = this.cfg.deckBounce;
        }
        a.grounded = true;
        break;
      }
      case Static.Edge:
      case Static.Gutter:
        c.mu = ball ? 0.06 : 0.25;
        c.target = 0.2;
        a.grounded = true;
        if (ball && f === Static.Gutter && !this.inGutter) {
          this.inGutter = true;
          this.gutterAt = this.step;
        }
        break;
      case Static.Wall:
        c.mu = 0.2;
        // Les parois du plateau renvoient les quilles sans trop d'élan : elles en fauchent parfois une, pas tout le jeu
        c.target = ball ? 0.3 : 0.4;
        break;
      case Static.Bumper:
        c.mu = 0.05;
        c.target = 0.55;
        break;
      case Static.PitFloor:
      case Static.PitWall:
      case Static.DeckEdge:
        c.mu = 0.4;
        c.target = 0.2;
        if (f !== Static.DeckEdge) a.grounded = true;
        break;
      case Static.Cushion:
        c.mu = 0.6;
        c.target = 0.05;
        break;
      case Static.Ceiling:
        c.mu = 0.2;
        c.target = 0.3;
        break;
    }
  }

  private setPoint(c: Contact, px: number, py: number, pz: number, pen: number) {
    const a = c.a,
      b = c.b;
    c.rax = px - a.px;
    c.ray = py - a.py;
    c.raz = pz - a.pz;
    if (b) {
      c.rbx = px - b.px;
      c.rby = py - b.py;
      c.rbz = pz - b.pz;
    }
    c.pen = pen;
  }

  // -- Résolution -----------------------------------------------------------

  /** Ce que coûte une impulsion dans une direction (inverse de la masse effective) */
  private k(c: Contact, dx: number, dy: number, dz: number): number {
    const a = c.a;
    // (ra × d)
    let cx = c.ray * dz - c.raz * dy,
      cy = c.raz * dx - c.rax * dz,
      cz = c.rax * dy - c.ray * dx;
    let k =
      a.im +
      cx * (a.i00 * cx + a.i01 * cy + a.i02 * cz) +
      cy * (a.i01 * cx + a.i11 * cy + a.i12 * cz) +
      cz * (a.i02 * cx + a.i12 * cy + a.i22 * cz);
    const b = c.b;
    if (b && b.awake) {
      cx = c.rby * dz - c.rbz * dy;
      cy = c.rbz * dx - c.rbx * dz;
      cz = c.rbx * dy - c.rby * dx;
      k +=
        b.im +
        cx * (b.i00 * cx + b.i01 * cy + b.i02 * cz) +
        cy * (b.i01 * cx + b.i11 * cy + b.i12 * cz) +
        cz * (b.i02 * cx + b.i12 * cy + b.i22 * cz);
    }
    return k;
  }

  private prepare() {
    for (let i = 0; i < this.count; i++) {
      const c = this.pool[i]!;
      const pen = c.pen;
      const { nx, ny, nz } = c;
      // Deux directions dans le plan du contact, pour le frottement
      if (nx > 0.6 || nx < -0.6) {
        const l = Math.sqrt(nz * nz + nx * nx);
        c.t1x = -nz / l;
        c.t1y = 0;
        c.t1z = nx / l;
      } else {
        const l = Math.sqrt(nz * nz + ny * ny);
        c.t1x = 0;
        c.t1y = nz / l;
        c.t1z = -ny / l;
      }
      c.t2x = ny * c.t1z - nz * c.t1y;
      c.t2y = nz * c.t1x - nx * c.t1z;
      c.t2z = nx * c.t1y - ny * c.t1x;
      c.kn = 1 / this.k(c, nx, ny, nz);
      c.kt1 = 1 / this.k(c, c.t1x, c.t1y, c.t1z);
      c.kt2 = 1 / this.k(c, c.t2x, c.t2y, c.t2z);
      const vn = this.relN(c, nx, ny, nz);
      c.vn0 = vn;
      const e = c.target;
      if (pen < 0) {
        // Pas encore touché : il peut s'approcher jusqu'au contact, pas plus loin ; s'il le touche pendant ce pas, il rebondit
        const close = -pen / DT;
        c.target = vn < -close && vn < -BOUNCE_MIN ? -e * vn : -close;
      } else {
        const bounce = vn < -BOUNCE_MIN ? -e * vn : 0;
        const push = pen > SLOP ? ((pen - SLOP) * BAUMGARTE) / DT : 0;
        c.target = bounce > push ? bounce : push;
      }
      // L'impulsion déjà trouvée au pas précédent repart tout de suite (une quille posée ne s'enfonce pas)
      if (c.jn > 0) this.apply(c, nx * c.jn, ny * c.jn, nz * c.jn);
    }
  }

  /** La vitesse relative des deux points en contact, dans une direction */
  private relN(c: Contact, dx: number, dy: number, dz: number): number {
    const a = c.a;
    let vx = a.vx + a.wy * c.raz - a.wz * c.ray,
      vy = a.vy + a.wz * c.rax - a.wx * c.raz,
      vz = a.vz + a.wx * c.ray - a.wy * c.rax;
    const b = c.b;
    if (b && b.awake) {
      vx -= b.vx + b.wy * c.rbz - b.wz * c.rby;
      vy -= b.vy + b.wz * c.rbx - b.wx * c.rbz;
      vz -= b.vz + b.wx * c.rby - b.wy * c.rbx;
    }
    return vx * dx + vy * dy + vz * dz;
  }

  private apply(c: Contact, px: number, py: number, pz: number) {
    const a = c.a;
    a.vx += px * a.im;
    a.vy += py * a.im;
    a.vz += pz * a.im;
    let tx = c.ray * pz - c.raz * py,
      ty = c.raz * px - c.rax * pz,
      tz = c.rax * py - c.ray * px;
    a.wx += a.i00 * tx + a.i01 * ty + a.i02 * tz;
    a.wy += a.i01 * tx + a.i11 * ty + a.i12 * tz;
    a.wz += a.i02 * tx + a.i12 * ty + a.i22 * tz;
    const b = c.b;
    if (b && b.awake) {
      b.vx -= px * b.im;
      b.vy -= py * b.im;
      b.vz -= pz * b.im;
      tx = c.rby * pz - c.rbz * py;
      ty = c.rbz * px - c.rbx * pz;
      tz = c.rbx * py - c.rby * px;
      b.wx -= b.i00 * tx + b.i01 * ty + b.i02 * tz;
      b.wy -= b.i01 * tx + b.i11 * ty + b.i12 * tz;
      b.wz -= b.i02 * tx + b.i12 * ty + b.i22 * tz;
    }
  }

  private solve(c: Contact) {
    // Le choc : on pousse jusqu'à la vitesse voulue (rebond, ou séparation), jamais on ne tire
    const vn = this.relN(c, c.nx, c.ny, c.nz);
    let dj = (c.target - vn) * c.kn;
    const old = c.jn;
    c.jn = old + dj > 0 ? old + dj : 0;
    dj = c.jn - old;
    if (dj !== 0) this.apply(c, c.nx * dj, c.ny * dj, c.nz * dj);
    // Le frottement : contre le glissement, sans dépasser μ fois la poussée
    const v1 = this.relN(c, c.t1x, c.t1y, c.t1z);
    const v2 = this.relN(c, c.t2x, c.t2y, c.t2z);
    let j1 = c.jt1 - v1 * c.kt1;
    let j2 = c.jt2 - v2 * c.kt2;
    const max = c.mu * c.jn;
    const l2 = j1 * j1 + j2 * j2;
    if (l2 > max * max) {
      const s = max / Math.sqrt(l2);
      j1 *= s;
      j2 *= s;
    }
    const d1 = j1 - c.jt1,
      d2 = j2 - c.jt2;
    c.jt1 = j1;
    c.jt2 = j2;
    if (d1 !== 0 || d2 !== 0) {
      this.apply(c, c.t1x * d1 + c.t2x * d2, c.t1y * d1 + c.t2y * d2, c.t1z * d1 + c.t2z * d2);
    }
  }

  // -- Ce qui se passe ------------------------------------------------------

  private report() {
    for (let i = 0; i < this.count; i++) {
      const c = this.pool[i]!;
      if (!c.fresh || c.jn <= 0) continue;
      const v = -c.vn0;
      const a = c.a,
        b = c.b;
      if (a.id === 0 && b && this.firstHit < 0) this.firstHit = this.step;
      let k: PhysEvent["k"] | null = null;
      if (b) {
        if (v < 0.15) continue;
        k = a.id === 0 || b.id === 0 ? "hit" : "clack";
      } else if (a.id === 0) {
        if (c.feature === Static.Floor && !this.landed) {
          this.landed = true;
          k = "drop";
        } else if (c.feature === Static.Gutter && v > 0.05) k = "gutter";
        else if (c.feature === Static.Wall || c.feature === Static.Bumper) k = v > 0.2 ? "wall" : null;
        else if (c.feature === Static.PitFloor || c.feature === Static.PitWall) k = "pit";
        else if (c.feature === Static.Cushion) k = "cushion";
      } else {
        if (v < 0.25) continue;
        k =
          c.feature === Static.Floor || c.feature === Static.Edge || c.feature === Static.Gutter
            ? "deck"
            : c.feature === Static.Wall || c.feature === Static.Ceiling
              ? "wall"
              : c.feature === Static.Cushion
                ? "cushion"
                : "pit";
      }
      if (!k) continue;
      this.events.push({ t: this.step, k, a: a.id, b: b ? b.id : -1, v, x: a.px + c.rax, y: a.py + c.ray, z: a.pz + c.raz });
    }
  }

  private integrate() {
    for (const b of this.bodies) {
      if (!b.awake || b.gone) continue;
      if (b.isPin && b.grounded) {
        // Une quille couchée finit par s'arrêter de rouler
        const kw = 1 - 2.2 * DT,
          kv = 1 - 0.4 * DT;
        b.wx *= kw;
        b.wy *= kw;
        b.wz *= kw;
        b.vx *= kv;
        b.vz *= kv;
      } else if (!b.isPin && b.grounded) {
        const kv = 1 - 0.015 * DT;
        b.vx *= kv;
        b.vz *= kv;
      }
      b.px += b.vx * DT;
      b.py += b.vy * DT;
      b.pz += b.vz * DT;
      // q ← q + ½·dt·(0, ω)·q, puis on la remet à la longueur 1
      const { wx, wy, wz, qw, qx, qy, qz } = b;
      const h = 0.5 * DT;
      const nw = qw + h * (-wx * qx - wy * qy - wz * qz);
      const nx = qx + h * (wx * qw + wy * qz - wz * qy);
      const ny = qy + h * (wy * qw + wz * qx - wx * qz);
      const nz = qz + h * (wz * qw + wx * qy - wy * qx);
      const l = Math.sqrt(nw * nw + nx * nx + ny * ny + nz * nz);
      b.qw = nw / l;
      b.qx = nx / l;
      b.qy = ny / l;
      b.qz = nz / l;
      b.update();
      // Dans la fosse : on ne le calcule plus
      if (b.py < -0.16 || b.pz < -CUSHION + 0.05) {
        if (b.pz < -DECK_END) {
          b.gone = true;
          b.awake = false;
          continue;
        }
      }
      // Un corps presque immobile s'endort (la boule, jamais : elle finit dans la fosse)
      if (b.isPin) {
        const v2 = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
        const w2 = b.wx * b.wx + b.wy * b.wy + b.wz * b.wz;
        if (v2 < 0.0016 && w2 < 0.0625) {
          if (++b.still > 0.25 * HZ) b.sleep();
        } else b.still = 0;
      }
    }
  }
}
