// Les briques des maillages de la carte : des seaux où l'on verse des faces (positions, normales, coordonnées de
// toile, couleurs par sommet), puis un seul maillage par seau.

import * as THREE from "three";

export class Bucket {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];

  quad(p: number[][], n: number[], uv: number[][], c: number[]) {
    const order = [0, 1, 2, 0, 2, 3];
    for (const k of order) {
      this.pos.push(...p[k]!);
      this.nor.push(...n);
      this.uv.push(...uv[k]!);
      this.col.push(...c);
    }
  }

  tri(p: number[][], n: number[], uv: number[][], c: number[]) {
    for (let k = 0; k < 3; k++) {
      this.pos.push(...p[k]!);
      this.nor.push(...n);
      this.uv.push(...uv[k]!);
      this.col.push(...c);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Un peu de variation d'une boîte à l'autre, toujours la même */
export function tintOf(i: number): number {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return 0.88 + (h - Math.floor(h)) * 0.2;
}

export function addBox(
  b: Bucket,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  tile: number,
  tint: number,
  skipBottom: boolean,
) {
  const t = 1 / tile;
  // L'ombre au pied des murs : un peu plus sombre en bas
  const ao = (y: number) => tint * (y < 0.05 ? 0.72 : y < 1 ? 0.86 : 1);
  const col = (y: number) => {
    const v = ao(y);
    return [v, v, v];
  };
  // +x et -x
  for (const [x, nx] of [
    [x1, 1],
    [x0, -1],
  ] as const) {
    const p =
      nx > 0
        ? [
            [x, y0, z1],
            [x, y0, z0],
            [x, y1, z0],
            [x, y1, z1],
          ]
        : [
            [x, y0, z0],
            [x, y0, z1],
            [x, y1, z1],
            [x, y1, z0],
          ];
    const uv = p.map((q) => [q[2]! * t * -nx, q[1]! * t]);
    const c = p.map((q) => col(q[1]!));
    // Couleur par sommet : on pousse face par face
    pushFace(b, p, [nx, 0, 0], uv, c);
  }
  for (const [z, nz] of [
    [z1, 1],
    [z0, -1],
  ] as const) {
    const p =
      nz > 0
        ? [
            [x0, y0, z],
            [x1, y0, z],
            [x1, y1, z],
            [x0, y1, z],
          ]
        : [
            [x1, y0, z],
            [x0, y0, z],
            [x0, y1, z],
            [x1, y1, z],
          ];
    const uv = p.map((q) => [q[0]! * t * nz, q[1]! * t]);
    const c = p.map((q) => col(q[1]!));
    pushFace(b, p, [0, 0, nz], uv, c);
  }
  {
    const p = [
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0],
    ];
    const uv = p.map((q) => [q[0]! * t, -q[2]! * t]);
    pushFace(
      b,
      p,
      [0, 1, 0],
      uv,
      p.map(() => [tint, tint, tint]),
    );
  }
  if (!skipBottom) {
    const p = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
    ];
    const uv = p.map((q) => [q[0]! * t, q[2]! * t]);
    pushFace(
      b,
      p,
      [0, -1, 0],
      uv,
      p.map(() => [tint * 0.7, tint * 0.7, tint * 0.7]),
    );
  }
}

export function pushFace(b: Bucket, p: number[][], n: number[], uv: number[][], c: number[][]) {
  for (const k of [0, 1, 2, 0, 2, 3]) {
    b.pos.push(...p[k]!);
    b.nor.push(...n);
    b.uv.push(...uv[k]!);
    b.col.push(...c[k]!);
  }
}

/**
 * Une boîte aux arêtes chanfreinées : ses six faces, rentrées de `e`, douze biseaux à 45° le long des arêtes et huit
 * petits coins. La lumière accroche ses bords : elle ne fait plus « cube ». Posée au sol (`grounded`), elle descend de
 * `e` sous le sol, qui cache le biseau du bas (elle ne flotte pas sur une rainure).
 */
export function addChamferBox(
  b: Bucket,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  tile: number,
  tint: number,
  e: number,
  grounded: boolean,
) {
  if (grounded) y0 -= e;
  const t = 1 / tile;
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const h = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2];
  e = Math.min(e, h[0]! * 0.45, h[1]! * 0.45, h[2]! * 0.45);
  const ao = (y: number) => tint * (y < 0.05 ? 0.72 : y < 1 ? 0.86 : 1);
  /** Les coordonnées de toile, projetées depuis l'axe vers lequel la face regarde le plus (comme `addBox`) */
  const uvOf = (p: number[], n: number[]): number[] => {
    const ax = Math.abs(n[0]!);
    const ay = Math.abs(n[1]!);
    const az = Math.abs(n[2]!);
    if (ay > Math.max(ax, az) + 0.01) return n[1]! > 0 ? [p[0]! * t, -p[2]! * t] : [p[0]! * t, p[2]! * t];
    if (ax >= az) return [p[2]! * t * -Math.sign(n[0]!), p[1]! * t];
    return [p[0]! * t * Math.sign(n[2]!), p[1]! * t];
  };
  const colOf = (p: number[], n: number[]): number[] => {
    const v = n[1]! > 0.6 ? tint : n[1]! < -0.6 ? tint * 0.7 : ao(p[1]!);
    return [v, v, v];
  };
  /** Un polygone (3 ou 4 sommets, en coordonnées locales), remis dans le bon sens pour sa normale */
  const poly = (pts: number[][], n: number[]) => {
    const len = Math.hypot(n[0]!, n[1]!, n[2]!);
    const nn = [n[0]! / len, n[1]! / len, n[2]! / len];
    let w = pts.map((p) => [p[0]! + c[0]!, p[1]! + c[1]!, p[2]! + c[2]!]);
    const u = [w[1]![0]! - w[0]![0]!, w[1]![1]! - w[0]![1]!, w[1]![2]! - w[0]![2]!];
    const v = [w[2]![0]! - w[0]![0]!, w[2]![1]! - w[0]![1]!, w[2]![2]! - w[0]![2]!];
    const cr = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    if (cr[0]! * nn[0]! + cr[1]! * nn[1]! + cr[2]! * nn[2]! < 0) w = w.reverse();
    const order = w.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
    for (const k of order) {
      b.pos.push(...w[k]!);
      b.nor.push(...nn);
      b.uv.push(...uvOf(w[k]!, nn));
      b.col.push(...colOf(w[k]!, nn));
    }
  };
  /** Un point local, donné par axe (a, b, c) puis remis en (x, y, z) */
  const at = (axes: [number, number, number], va: number, vb: number, vc: number) => {
    const p = [0, 0, 0];
    p[axes[0]] = va;
    p[axes[1]] = vb;
    p[axes[2]] = vc;
    return p;
  };
  // Les six faces
  for (let a = 0; a < 3; a++) {
    const bAx = (a + 1) % 3;
    const cAx = (a + 2) % 3;
    const axes: [number, number, number] = [a, bAx, cAx];
    for (const s of [1, -1]) {
      if (grounded && a === 1 && s < 0) continue;
      const fa = s * h[a]!;
      const hb = h[bAx]! - e;
      const hc = h[cAx]! - e;
      const n = at(axes, s, 0, 0);
      poly([at(axes, fa, -hb, -hc), at(axes, fa, hb, -hc), at(axes, fa, hb, hc), at(axes, fa, -hb, hc)], n);
    }
  }
  // Les douze biseaux
  for (let a = 0; a < 3; a++) {
    const bAx = (a + 1) % 3;
    const cAx = (a + 2) % 3;
    const axes: [number, number, number] = [a, bAx, cAx];
    for (const sa of [1, -1]) {
      for (const sb of [1, -1]) {
        const hc = h[cAx]! - e;
        const n = at(axes, sa, sb, 0);
        poly(
          [
            at(axes, sa * h[a]!, sb * (h[bAx]! - e), -hc),
            at(axes, sa * h[a]!, sb * (h[bAx]! - e), hc),
            at(axes, sa * (h[a]! - e), sb * h[bAx]!, hc),
            at(axes, sa * (h[a]! - e), sb * h[bAx]!, -hc),
          ],
          n,
        );
      }
    }
  }
  // Les huit coins
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        poly(
          [
            [sx * h[0]!, sy * (h[1]! - e), sz * (h[2]! - e)],
            [sx * (h[0]! - e), sy * h[1]!, sz * (h[2]! - e)],
            [sx * (h[0]! - e), sy * (h[1]! - e), sz * h[2]!],
          ],
          [sx, sy, sz],
        );
      }
    }
  }
}

/** Un nombre entre 0 et 1, toujours le même pour un même point (pour bosseler une roche sans déchirer ses faces) */
function hash3(x: number, y: number, z: number, seed: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Une roche qui remplit sa boîte : une sphère facettée poussée vers les faces de la boîte (pour ne pas laisser de coins
 * vides là où l'on bute), bosselée au hasard, le dessous aplati sur le sol. Ses facettes sont plates (de la pierre
 * taillée par le gel) ; celles qui regardent le ciel vont dans `top` (la neige), s'il y en a.
 */
export function addRock(
  rock: Bucket,
  top: Bucket | null,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  tile: number,
  tint: number,
  seed: number,
  grounded: boolean,
) {
  const t = 1 / tile;
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const h = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2];
  const ico = new THREE.IcosahedronGeometry(1, 2);
  const pos = ico.getAttribute("position") as THREE.BufferAttribute;
  const shape = (i: number): number[] => {
    const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const m = Math.max(Math.abs(v[0]!), Math.abs(v[1]!), Math.abs(v[2]!));
    const k = 0.62;
    // Entre la sphère et le cube, puis des bosses (les mêmes pour un même sommet partagé)
    const bump = 0.86 + hash3(Math.round(v[0]! * 100), Math.round(v[1]! * 100), Math.round(v[2]! * 100), seed) * 0.2;
    const p = v.map((x) => (x * (1 - k) + (x / m) * k) * bump);
    const out = [p[0]! * h[0]! + c[0]!, p[1]! * h[1]! + c[1]!, p[2]! * h[2]! + c[2]!];
    // Le dessous s'aplatit sur ce qui le porte (un peu enfoncé dans le sol)
    out[1] = Math.max(out[1]!, y0 - (grounded ? 0.06 : 0));
    out[1] = Math.min(out[1]!, y1 + 0.05);
    return out;
  };
  const ao = (y: number) => (y < y0 + 0.25 ? 0.8 : 1);
  for (let f = 0; f < pos.count; f += 3) {
    const a = shape(f);
    const b = shape(f + 1);
    const d = shape(f + 2);
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const v = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (len < 1e-9) continue;
    const nn = [n[0]! / len, n[1]! / len, n[2]! / len];
    // Le dessous, à plat sur le sol, ne se voit pas
    if (nn[1]! < -0.9 && a[1]! <= y0 + 0.01) continue;
    const snow = top && nn[1]! > 0.62;
    const into = snow ? top : rock;
    const shade = tint * (0.86 + hash3(f, 3, 7, seed) * 0.2);
    for (const p of [a, b, d]) {
      into.pos.push(...p);
      into.nor.push(...nn);
      const ax = Math.abs(nn[0]!);
      const ay = Math.abs(nn[1]!);
      const az = Math.abs(nn[2]!);
      into.uv.push(...(ay >= Math.max(ax, az) ? [p[0]! * t, -p[2]! * t] : ax >= az ? [p[2]! * t, p[1]! * t] : [p[0]! * t, p[1]! * t]));
      const s = snow ? 1 : shade * ao(p[1]!);
      into.col.push(s, s, s);
    }
  }
  ico.dispose();
}

/**
 * Une caisse en bois : un corps aux arêtes adoucies et, en relief, son cadre (quatre montants et huit traverses qui
 * dépassent de 2 cm, un ton plus sombre). Le tout tient dans sa boîte, à 1 cm près.
 */
export function addCrate(
  b: Bucket,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  tile: number,
  tint: number,
  grounded: boolean,
) {
  const f = Math.min(0.075, (x1 - x0) * 0.12, (z1 - z0) * 0.12, (y1 - y0) * 0.12);
  const p = 0.012;
  addChamferBox(b, x0 + p, y0, z0 + p, x1 - p, y1 - p, z1 - p, tile, tint, 0.015, grounded);
  const dark = tint * 0.74;
  // Les montants, aux quatre coins
  for (const [cx, cz] of [
    [x0, z0],
    [x1 - f, z0],
    [x0, z1 - f],
    [x1 - f, z1 - f],
  ] as const) {
    addBox(b, cx - p / 2, y0, cz - p / 2, cx + f + p / 2, y1, cz + f + p / 2, tile, dark, grounded);
  }
  // Les traverses du haut et du bas, sur les quatre côtés
  for (const [ya, yb] of [
    [y0, y0 + f],
    [y1 - f, y1],
  ] as const) {
    addBox(b, x0 + f, ya, z0 - p / 2, x1 - f, yb, z0 + f, tile, dark, grounded && ya === y0);
    addBox(b, x0 + f, ya, z1 - f, x1 - f, yb, z1 + p / 2, tile, dark, grounded && ya === y0);
    addBox(b, x0 - p / 2, ya, z0 + f, x0 + f, yb, z1 - f, tile, dark, grounded && ya === y0);
    addBox(b, x1 - f, ya, z0 + f, x1 + p / 2, yb, z1 - f, tile, dark, grounded && ya === y0);
  }
}
