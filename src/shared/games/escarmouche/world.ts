// Le monde d'une carte : des boîtes alignées sur les axes (murs, planchers, marches, caisses). Le même code sert au
// serveur, qui fait autorité, et au téléphone, qui anticipe ses propres pas : il doit donner exactement le même
// résultat des deux côtés.

/** Les matières : elles décident de l'image (et du son des pas), jamais du jeu */
export type Mat =
  | "sol"
  | "pave"
  | "herbe"
  | "terre"
  | "pierre"
  | "crepi"
  | "crepi2"
  | "bois"
  | "planche"
  | "tuile"
  | "beton"
  | "metal"
  | "rouille"
  | "wagon"
  | "wagon2"
  | "gravier"
  | "foin"
  | "caisse"
  /** Des sacs de sable (dessinés sac par sac) */
  | "sacs"
  /** Un bidon d'essence : il explose quand on tire dessus */
  | "bidon"
  | "invisible";

export interface Box {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  m: Mat;
}

const EPS = 1e-4;
const CELL = 4;

export interface RayHit {
  t: number;
  /** La face touchée : 0 x, 1 y, 2 z, avec son sens */
  axis: 0 | 1 | 2;
  sign: number;
  box: number;
}

export class World {
  readonly boxes: Box[];
  readonly minX: number;
  readonly minZ: number;
  readonly nx: number;
  readonly nz: number;
  private readonly grid: number[][];
  private readonly stamp: Uint32Array;
  private mark = 0;

  constructor(boxes: Box[]) {
    this.boxes = boxes;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.x0);
      minZ = Math.min(minZ, b.z0);
      maxX = Math.max(maxX, b.x1);
      maxZ = Math.max(maxZ, b.z1);
    }
    this.minX = Math.floor(minX) - CELL;
    this.minZ = Math.floor(minZ) - CELL;
    this.nx = Math.ceil((maxX - this.minX) / CELL) + 2;
    this.nz = Math.ceil((maxZ - this.minZ) / CELL) + 2;
    this.grid = Array.from({ length: this.nx * this.nz }, () => []);
    this.stamp = new Uint32Array(boxes.length);
    boxes.forEach((b, i) => {
      const [i0, k0] = this.cellOf(b.x0, b.z0);
      const [i1, k1] = this.cellOf(b.x1, b.z1);
      for (let k = k0; k <= k1; k++) for (let ii = i0; ii <= i1; ii++) this.grid[k * this.nx + ii]!.push(i);
    });
  }

  private cellOf(x: number, z: number): [number, number] {
    const i = Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.minX) / CELL)));
    const k = Math.max(0, Math.min(this.nz - 1, Math.floor((z - this.minZ) / CELL)));
    return [i, k];
  }

  /** Les boîtes qui peuvent toucher ce rectangle (vu de dessus), chacune une fois */
  near(x0: number, z0: number, x1: number, z1: number, out: number[]): number[] {
    out.length = 0;
    this.mark = (this.mark + 1) >>> 0;
    if (this.mark === 0) {
      this.stamp.fill(0);
      this.mark = 1;
    }
    const [i0, k0] = this.cellOf(x0, z0);
    const [i1, k1] = this.cellOf(x1, z1);
    for (let k = k0; k <= k1; k++) {
      for (let i = i0; i <= i1; i++) {
        for (const b of this.grid[k * this.nx + i]!) {
          if (this.stamp[b] === this.mark) continue;
          this.stamp[b] = this.mark;
          out.push(b);
        }
      }
    }
    return out;
  }

  /** Une boîte (x0..x1, y0..y1, z0..z1) chevauche-t-elle le monde ? */
  overlaps(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    for (const i of this.near(x0, z0, x1, z1, tmpList)) {
      const b = this.boxes[i]!;
      if (x1 > b.x0 + EPS && x0 < b.x1 - EPS && y1 > b.y0 + EPS && y0 < b.y1 - EPS && z1 > b.z0 + EPS && z0 < b.z1 - EPS) return true;
    }
    return false;
  }

  /**
   * Déplace une boîte d'un axe, jusqu'au premier obstacle. `p` : son coin bas (x, y, z au centre en x et z, aux pieds en y),
   * `hw` sa demi-largeur, `h` sa hauteur. Renvoie le déplacement fait.
   */
  moveAxis(p: { x: number; y: number; z: number }, hw: number, h: number, axis: 0 | 1 | 2, d: number): number {
    if (d === 0) return 0;
    let x0 = p.x - hw;
    let x1 = p.x + hw;
    let y0 = p.y;
    let y1 = p.y + h;
    let z0 = p.z - hw;
    let z1 = p.z + hw;
    if (axis === 0) {
      if (d > 0) x1 += d;
      else x0 += d;
    } else if (axis === 1) {
      if (d > 0) y1 += d;
      else y0 += d;
    } else if (d > 0) z1 += d;
    else z0 += d;
    let move = d;
    for (const i of this.near(x0, z0, x1, z1, tmpList)) {
      const b = this.boxes[i]!;
      if (axis === 0) {
        if (!(p.y + h > b.y0 + EPS && p.y < b.y1 - EPS && p.z + hw > b.z0 + EPS && p.z - hw < b.z1 - EPS)) continue;
        if (move > 0 && b.x0 >= p.x + hw - EPS) move = Math.min(move, b.x0 - (p.x + hw));
        else if (move < 0 && b.x1 <= p.x - hw + EPS) move = Math.max(move, b.x1 - (p.x - hw));
      } else if (axis === 1) {
        if (!(p.x + hw > b.x0 + EPS && p.x - hw < b.x1 - EPS && p.z + hw > b.z0 + EPS && p.z - hw < b.z1 - EPS)) continue;
        if (move > 0 && b.y0 >= p.y + h - EPS) move = Math.min(move, b.y0 - (p.y + h));
        else if (move < 0 && b.y1 <= p.y + EPS) move = Math.max(move, b.y1 - p.y);
      } else {
        if (!(p.y + h > b.y0 + EPS && p.y < b.y1 - EPS && p.x + hw > b.x0 + EPS && p.x - hw < b.x1 - EPS)) continue;
        if (move > 0 && b.z0 >= p.z + hw - EPS) move = Math.min(move, b.z0 - (p.z + hw));
        else if (move < 0 && b.z1 <= p.z - hw + EPS) move = Math.max(move, b.z1 - (p.z - hw));
      }
    }
    if (Math.abs(move) < EPS) move = 0;
    if (axis === 0) p.x += move;
    else if (axis === 1) p.y += move;
    else p.z += move;
    return move;
  }

  /** Le premier mur sur le trajet d'un rayon (direction unitaire), avant `max` mètres ; null s'il n'y en a pas */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): RayHit | null {
    let best: RayHit | null = null;
    let tMax = max;
    const ex = ox + dx * max;
    const ez = oz + dz * max;
    const list = this.near(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), rayList);
    for (const i of list) {
      const b = this.boxes[i]!;
      const hit = rayBox(ox, oy, oz, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, tMax);
      if (hit && hit.t < tMax) {
        tMax = hit.t;
        best = { ...hit, box: i };
      }
    }
    return best;
  }

  /** Rien entre ces deux points ? */
  clear(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) return true;
    return this.raycast(ax, ay, az, dx / l, dy / l, dz / l, l - 0.02) === null;
  }
}

const tmpList: number[] = [];
const rayList: number[] = [];

/** Rayon contre une boîte (méthode des tranches) : la distance d'entrée et la face, ou null */
export function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  max: number,
): { t: number; axis: 0 | 1 | 2; sign: number } | null {
  let tNear = -Infinity;
  let tFar = Infinity;
  let axis: 0 | 1 | 2 = 0;
  let sign = 0;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const lo = [x0, y0, z0];
  const hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    const da = d[a]!;
    const oa = o[a]!;
    if (Math.abs(da) < 1e-9) {
      if (oa < lo[a]! || oa > hi[a]!) return null;
      continue;
    }
    let t0 = (lo[a]! - oa) / da;
    let t1 = (hi[a]! - oa) / da;
    let s = -1;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
      s = 1;
    }
    if (t0 > tNear) {
      tNear = t0;
      axis = a as 0 | 1 | 2;
      sign = s;
    }
    tFar = Math.min(tFar, t1);
    if (tNear > tFar || tFar < 0) return null;
  }
  // Le rayon part de l'intérieur : on l'ignore (un tireur collé à un mur tire quand même devant lui)
  if (tNear < 0 || tNear > max) return null;
  return { t: tNear, axis, sign };
}
