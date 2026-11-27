// Le grand bassin de mousse : des bords carrelés bleu et blanc, et une mousse épaisse faite de centaines de boules
// blanches qui ondulent doucement (une seule forme). Celui qui tombe dedans fait un trou, et la mousse gicle.

import * as THREE from "three";
import { Batch, type World } from "./world.ts";

export class FoamPool {
  readonly root = new THREE.Group();
  private foam: THREE.InstancedMesh;
  private base: { x: number; z: number; s: number; p: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  /** Les trous faits par ceux qui tombent : où, quand */
  private dents: { x: number; z: number; at: number }[] = [];

  constructor(
    world: World,
    readonly w: number,
    readonly d: number,
    readonly top = 0.55,
  ) {
    const keep = world.keep;
    const b = new Batch();
    const wall = 0.35;
    // Les bords carrelés
    const tiles = Math.ceil((w * 2 + d * 2) / 0.5);
    void tiles;
    for (const [x, z, sx, sz] of [
      [0, -d / 2 - wall / 2, w + wall * 2, wall],
      [0, d / 2 + wall / 2, w + wall * 2, wall],
      [-w / 2 - wall / 2, 0, wall, d],
      [w / 2 + wall / 2, 0, wall, d],
    ] as const) {
      b.put(new THREE.BoxGeometry(sx, top + 0.25, sz), "#3fa6d9", x, (top + 0.25) / 2, z);
      b.put(new THREE.BoxGeometry(sx + 0.04, 0.08, sz + 0.04), "#f4f9fc", x, top + 0.29, z);
    }
    b.put(new THREE.BoxGeometry(w, 0.05, d), "#2b7fb5", 0, 0.03, 0);
    const mesh = b.build(world.paint, keep);
    if (mesh) {
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.root.add(mesh);
    }
    const count = Math.min(900, Math.round(w * d * 6));
    const geo = keep(new THREE.IcosahedronGeometry(0.5, 1));
    const mat = keep(new THREE.MeshStandardMaterial({ color: "#fbfdff", roughness: 0.9, emissive: new THREE.Color("#1a2733") }));
    this.foam = new THREE.InstancedMesh(geo, mat, count);
    this.foam.receiveShadow = true;
    for (let k = 0; k < count; k++) {
      this.base.push({
        x: (Math.random() - 0.5) * (w - 0.3),
        z: (Math.random() - 0.5) * (d - 0.3),
        s: 0.35 + Math.random() * 0.45,
        p: Math.random() * 6,
      });
    }
    this.root.add(this.foam);
    this.update(0);
  }

  /** Quelqu'un tombe dedans (en coordonnées du bassin) */
  dent(x: number, z: number, at: number) {
    this.dents.push({ x, z, at });
    if (this.dents.length > 12) this.dents.shift();
  }

  update(now: number) {
    const t = now / 1000;
    this.base.forEach((b, k) => {
      let y = this.top - 0.12 + Math.sin(t * 0.9 + b.p) * 0.05 + Math.sin(t * 0.5 + b.x * 0.7) * 0.04;
      for (const d of this.dents) {
        const age = (now - d.at) / 1000;
        if (age < 0 || age > 3) continue;
        const dist = Math.hypot(b.x - d.x, b.z - d.z);
        if (dist < 1.3) y -= (1.3 - dist) * 0.5 * Math.max(0, 1 - age / 3);
      }
      this.m.compose(this.v.set(b.x, y, b.z), this.q, this.sc.set(b.s, b.s * 0.75, b.s));
      this.foam.setMatrixAt(k, this.m);
    });
    this.foam.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.root.removeFromParent();
  }
}
