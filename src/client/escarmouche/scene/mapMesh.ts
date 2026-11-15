// Une carte en trois dimensions : ses boîtes fondues en un seul maillage par matière (peu d'appels de dessin, même au
// téléphone), puis le décor : toits, clochers, arbres, voies ferrées, lampadaires, citernes.

import * as THREE from "three";
import type { Decor, GameMap } from "../../../shared/games/escarmouche/maps.ts";
import type { Mat } from "../../../shared/games/escarmouche/world.ts";
import { matTexture, TILE } from "./textures.ts";

/** Les teintes de base : elles colorent la toile (et la remplacent quand il n'y en a pas) */
const TINT: Partial<Record<Mat, string>> = {
  invisible: "#000000",
};

class Bucket {
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
function tintOf(i: number): number {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return 0.88 + (h - Math.floor(h)) * 0.2;
}

function addBox(
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

function pushFace(b: Bucket, p: number[][], n: number[], uv: number[][], c: number[][]) {
  for (const k of [0, 1, 2, 0, 2, 3]) {
    b.pos.push(...p[k]!);
    b.nor.push(...n);
    b.uv.push(...uv[k]!);
    b.col.push(...c[k]!);
  }
}

const materials = new Map<string, THREE.Material>();
export function matMaterial(m: Mat, low: boolean): THREE.Material {
  const key = `${m}:${low}`;
  const known = materials.get(key);
  if (known) return known;
  const tex = matTexture(m, low ? 128 : 256);
  const mat = new THREE.MeshLambertMaterial({ map: tex ?? undefined, color: TINT[m] ?? "#ffffff", vertexColors: true });
  materials.set(key, mat);
  return mat;
}

export interface MapMesh {
  group: THREE.Group;
  dispose(): void;
}

/** La carte entière : boîtes, toits et décor */
export function buildMap(gm: GameMap, low: boolean): MapMesh {
  const group = new THREE.Group();
  const buckets = new Map<Mat, Bucket>();
  const bucket = (m: Mat) => {
    let b = buckets.get(m);
    if (!b) {
      b = new Bucket();
      buckets.set(m, b);
    }
    return b;
  };
  gm.boxes.forEach((bx, i) => {
    if (bx.m === "invisible") return;
    // Le sol n'a qu'une face, celle du dessus
    if (bx.y1 <= 0.001 && bx.y0 < -0.5) {
      const b = bucket(bx.m);
      const t = 1 / (TILE[bx.m] ?? 3);
      const p = [
        [bx.x0, 0, bx.z1],
        [bx.x1, 0, bx.z1],
        [bx.x1, 0, bx.z0],
        [bx.x0, 0, bx.z0],
      ];
      pushFace(
        b,
        p,
        [0, 1, 0],
        p.map((q) => [q[0]! * t, -q[2]! * t]),
        p.map(() => [1, 1, 1]),
      );
      return;
    }
    addBox(bucket(bx.m), bx.x0, bx.y0, bx.z0, bx.x1, bx.y1, bx.z1, TILE[bx.m] ?? 3, tintOf(i), bx.y0 <= 0.001);
  });
  for (const d of gm.decor) addDecor(d, bucket, group, low);
  for (const [m, b] of buckets) {
    if (b.pos.length === 0) continue;
    const mesh = new THREE.Mesh(b.geometry(), matMaterial(m, low));
    mesh.receiveShadow = true;
    mesh.castShadow = m !== "sol" && m !== "pave" && m !== "gravier";
    group.add(mesh);
  }
  return {
    group,
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      });
    },
  };
}

const foliage = new THREE.MeshLambertMaterial({ color: "#4a5a30", flatShading: true });
const darkFoliage = new THREE.MeshLambertMaterial({ color: "#3a4826", flatShading: true });
const steel = new THREE.MeshLambertMaterial({ color: "#3e4246" });
const lampGlow = new THREE.MeshBasicMaterial({ color: "#ffe2a8" });
const water = new THREE.MeshLambertMaterial({ color: "#3f5f6a", transparent: true, opacity: 0.82, emissive: "#0d1a1f" });
const wireMat = new THREE.LineBasicMaterial({ color: "#2b2b2b" });
const clockFace = new THREE.MeshLambertMaterial({ color: "#efe8d6" });
const clockHand = new THREE.MeshBasicMaterial({ color: "#1d1d1d" });

function addDecor(d: Decor, bucket: (m: Mat) => Bucket, group: THREE.Group, low: boolean) {
  switch (d.k) {
    case "roof": {
      const b = bucket(d.m);
      const t = 1 / (TILE[d.m] ?? 2);
      const { x0, x1, z0, z1, y, h } = d;
      const top = y + h;
      if (d.axis === "x") {
        const zm = (z0 + z1) / 2;
        const slope = Math.hypot(zm - z0, h);
        const ny = (zm - z0) / slope;
        const nz = h / slope;
        // Le pan sud puis le pan nord
        pushFace(
          b,
          [
            [x1, y, z0],
            [x0, y, z0],
            [x0, top, zm],
            [x1, top, zm],
          ],
          [0, ny, -nz],
          [
            [x0 * t, 0],
            [x1 * t, 0],
            [x1 * t, slope * t],
            [x0 * t, slope * t],
          ],
          [
            [0.85, 0.85, 0.85],
            [0.85, 0.85, 0.85],
            [1, 1, 1],
            [1, 1, 1],
          ],
        );
        pushFace(
          b,
          [
            [x0, y, z1],
            [x1, y, z1],
            [x1, top, zm],
            [x0, top, zm],
          ],
          [0, ny, nz],
          [
            [x1 * t, 0],
            [x0 * t, 0],
            [x0 * t, slope * t],
            [x1 * t, slope * t],
          ],
          [
            [0.85, 0.85, 0.85],
            [0.85, 0.85, 0.85],
            [1, 1, 1],
            [1, 1, 1],
          ],
        );
        const g = bucket("crepi2");
        for (const [x, s] of [
          [x0 + 0.3, -1],
          [x1 - 0.3, 1],
        ] as const) {
          const p =
            s > 0
              ? [
                  [x, y, z1 - 0.3],
                  [x, y, z0 + 0.3],
                  [x, top - 0.1, zm],
                ]
              : [
                  [x, y, z0 + 0.3],
                  [x, y, z1 - 0.3],
                  [x, top - 0.1, zm],
                ];
          for (const q of p) {
            g.pos.push(...q);
            g.nor.push(s, 0, 0);
            g.uv.push(q[2]! / 3, q[1]! / 3);
            g.col.push(0.9, 0.9, 0.9);
          }
        }
      } else {
        const xm = (x0 + x1) / 2;
        const slope = Math.hypot(xm - x0, h);
        const ny = (xm - x0) / slope;
        const nx = h / slope;
        pushFace(
          b,
          [
            [x0, y, z0],
            [x0, y, z1],
            [xm, top, z1],
            [xm, top, z0],
          ],
          [-nx, ny, 0],
          [
            [z1 * t, 0],
            [z0 * t, 0],
            [z0 * t, slope * t],
            [z1 * t, slope * t],
          ],
          [
            [0.85, 0.85, 0.85],
            [0.85, 0.85, 0.85],
            [1, 1, 1],
            [1, 1, 1],
          ],
        );
        pushFace(
          b,
          [
            [x1, y, z1],
            [x1, y, z0],
            [xm, top, z0],
            [xm, top, z1],
          ],
          [nx, ny, 0],
          [
            [z0 * t, 0],
            [z1 * t, 0],
            [z1 * t, slope * t],
            [z0 * t, slope * t],
          ],
          [
            [0.85, 0.85, 0.85],
            [0.85, 0.85, 0.85],
            [1, 1, 1],
            [1, 1, 1],
          ],
        );
        const g = bucket("crepi2");
        for (const [z, s] of [
          [z0 + 0.3, -1],
          [z1 - 0.3, 1],
        ] as const) {
          const p =
            s > 0
              ? [
                  [x0 + 0.3, y, z],
                  [x1 - 0.3, y, z],
                  [xm, top - 0.1, z],
                ]
              : [
                  [x1 - 0.3, y, z],
                  [x0 + 0.3, y, z],
                  [xm, top - 0.1, z],
                ];
          for (const q of p) {
            g.pos.push(...q);
            g.nor.push(0, 0, s);
            g.uv.push(q[0]! / 3, q[1]! / 3);
            g.col.push(0.9, 0.9, 0.9);
          }
        }
      }
      return;
    }
    case "spire": {
      const b = bucket(d.m);
      const xm = (d.x0 + d.x1) / 2;
      const zm = (d.z0 + d.z1) / 2;
      const apex = [xm, d.y + d.h, zm];
      const c = [
        [d.x0, d.y, d.z1],
        [d.x1, d.y, d.z1],
        [d.x1, d.y, d.z0],
        [d.x0, d.y, d.z0],
      ];
      for (let k = 0; k < 4; k++) {
        const a = c[k]!;
        const e = c[(k + 1) % 4]!;
        const n = new THREE.Vector3()
          .subVectors(new THREE.Vector3(...e), new THREE.Vector3(...a))
          .cross(new THREE.Vector3(apex[0]! - a[0]!, apex[1]! - a[1]!, apex[2]! - a[2]!))
          .normalize();
        b.tri(
          [a, e, apex],
          [n.x, n.y, n.z],
          [
            [0, 0],
            [1, 0],
            [0.5, d.h / 2],
          ],
          [0.9, 0.9, 0.9],
        );
      }
      return;
    }
    case "tree": {
      const geo = new THREE.IcosahedronGeometry(1, low ? 0 : 1);
      const crowns: [number, number, number, number][] = [
        [0, d.h * 0.62, 0, d.r],
        [d.r * 0.45, d.h * 0.78, d.r * 0.2, d.r * 0.75],
        [-d.r * 0.4, d.h * 0.74, -d.r * 0.3, d.r * 0.7],
        [0, d.h * 0.92, 0, d.r * 0.55],
      ];
      crowns.forEach(([x, y, z, r], i) => {
        const m = new THREE.Mesh(geo, i % 2 ? darkFoliage : foliage);
        m.position.set(d.x + x, y, d.z + z);
        m.scale.set(r, r * 0.85, r);
        m.rotation.set(i, i * 2, 0);
        m.castShadow = true;
        group.add(m);
      });
      return;
    }
    case "rail": {
      const b = bucket("metal");
      const s = bucket("bois");
      for (const dz of [-0.72, 0.72]) addBox(b, d.x0, 0, d.z + dz - 0.04, d.x1, 0.14, d.z + dz + 0.04, 2, 0.7, true);
      for (let x = d.x0 + 0.3; x < d.x1; x += 0.65) addBox(s, x - 0.12, 0, d.z - 1.2, x + 0.12, 0.08, d.z + 1.2, 2, 0.6, true);
      return;
    }
    case "lamp": {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, d.h, 6), steel);
      pole.position.set(d.x, d.h / 2, d.z);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.35), steel);
      head.position.set(d.x, d.h, d.z);
      group.add(head);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.26), lampGlow);
      glow.position.set(d.x, d.h - 0.12, d.z);
      group.add(glow);
      return;
    }
    case "patch": {
      const b = bucket(d.m);
      const t = 1 / (TILE[d.m] ?? 3);
      const y = 0.012;
      const p = [
        [d.x0, y, d.z1],
        [d.x1, y, d.z1],
        [d.x1, y, d.z0],
        [d.x0, y, d.z0],
      ];
      pushFace(
        b,
        p,
        [0, 1, 0],
        p.map((q) => [q[0]! * t, -q[2]! * t]),
        p.map(() => [1, 1, 1]),
      );
      return;
    }
    case "water": {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.x1 - d.x0, d.z1 - d.z0), water);
      m.rotation.x = -Math.PI / 2;
      m.position.set((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2);
      group.add(m);
      return;
    }
    case "tank": {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.x1 - d.x0, low ? 10 : 18), matMaterial("metal", low));
      m.rotation.z = Math.PI / 2;
      m.position.set((d.x0 + d.x1) / 2, d.y + 0.2, d.z);
      m.castShadow = true;
      group.add(m);
      return;
    }
    case "tower": {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.h, low ? 10 : 18), matMaterial("rouille", low));
      tank.position.set(d.x, d.y + d.h / 2, d.z);
      tank.castShadow = true;
      group.add(tank);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(d.r * 1.05, 1.2, low ? 10 : 18), matMaterial("metal", low));
      cap.position.set(d.x, d.y + d.h + 0.6, d.z);
      group.add(cap);
      return;
    }
    case "wire": {
      const pts: THREE.Vector3[] = [];
      const n = 18;
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        const x = d.x0 + (d.x1 - d.x0) * f;
        const z = d.z0 + (d.z1 - d.z0) * f;
        pts.push(new THREE.Vector3(x, 0.4 + Math.sin(k * 1.7) * 0.25 + (k % 2) * 0.3, z + Math.cos(k * 2.3) * 0.15));
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      const posts = bucket("bois");
      addBox(posts, d.x0 - 0.04, 0, d.z0 - 0.04, d.x0 + 0.04, 1, d.z0 + 0.04, 1, 0.7, true);
      addBox(posts, d.x1 - 0.04, 0, d.z1 - 0.04, d.x1 + 0.04, 1, d.z1 + 0.04, 1, 0.7, true);
      return;
    }
    case "clock": {
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), clockFace);
      face.position.set(d.x + d.nx * 0.02, d.y, d.z + d.nz * 0.02);
      face.lookAt(d.x + d.nx * 2, d.y, d.z + d.nz * 2);
      group.add(face);
      for (const [len, a] of [
        [0.6, 0.6],
        [0.42, 2.4],
      ] as const) {
        const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.06, len), clockHand);
        hand.position.copy(face.position).add(new THREE.Vector3(d.nx * 0.01, 0, d.nz * 0.01));
        hand.lookAt(d.x + d.nx * 2, d.y, d.z + d.nz * 2);
        hand.rotateZ(a);
        hand.translateY(len / 2);
        group.add(hand);
      }
      return;
    }
  }
}
