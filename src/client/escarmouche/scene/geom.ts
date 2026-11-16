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
