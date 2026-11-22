// La boule en 3D : sa couleur et son motif, un vernis profond, et ses trois trous (le pouce et deux doigts) qui tournent
// avec elle ; certains motifs ont leur propre matière (miroir à facettes, or, cristal).

import * as THREE from "three";
import type { BowlingLook } from "../../../shared/games/bowling/looks.ts";
import { ballTexture } from "./textures.ts";

const holeMat = new THREE.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.5 });

export class BallModel {
  readonly group = new THREE.Group();
  /** Ce qui tourne (la boule et ses trous) */
  readonly spin = new THREE.Group();
  private mesh: THREE.Mesh;
  private key = "";
  private tex: THREE.Texture | null = null;

  constructor(
    readonly r: number,
    look: Pick<BowlingLook, "color" | "pattern">,
  ) {
    this.group.add(this.spin);
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 40));
    this.mesh.castShadow = true;
    this.spin.add(this.mesh);
    // Les trous : le pouce un peu à part, les deux doigts côte à côte
    const holes: [number, number, number][] = [
      [0, 0.0, 0.019],
      [-0.4, 0.5, 0.012],
      [0.4, 0.5, 0.012],
    ];
    for (const [ax, ay, rr] of holes) {
      const dir = new THREE.Vector3(ax * 0.32, 0.55 + ay * 0.32, 1).normalize();
      const radius = rr * (r / 0.1085) + 0.0;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), holeMat);
      const rim = new THREE.Mesh(new THREE.RingGeometry(radius, radius * 1.22, 20), rimMat);
      for (const m of [hole, rim]) {
        m.position.copy(dir).multiplyScalar(r * 1.0015);
        m.lookAt(dir.clone().multiplyScalar(r * 2));
        this.spin.add(m);
      }
    }
    this.setLook(look);
  }

  setLook(look: Pick<BowlingLook, "color" | "pattern">) {
    const key = `${look.color}:${look.pattern}`;
    if (key === this.key) return;
    this.key = key;
    this.tex?.dispose();
    (this.mesh.material as THREE.Material | undefined)?.dispose?.();
    const map = ballTexture(look);
    this.tex = map;
    let m: THREE.MeshPhysicalMaterial;
    switch (look.pattern) {
      case "disco":
        m = new THREE.MeshPhysicalMaterial({ map, metalness: 1, roughness: 0.08, flatShading: true });
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.IcosahedronGeometry(this.r, 4);
        break;
      case "or":
        m = new THREE.MeshPhysicalMaterial({ map, metalness: 1, roughness: 0.2, clearcoat: 0.6 });
        break;
      case "cristal":
        m = new THREE.MeshPhysicalMaterial({ map, roughness: 0.02, transmission: 0.82, thickness: 0.2, ior: 1.5, clearcoat: 1 });
        break;
      case "galaxie":
        m = new THREE.MeshPhysicalMaterial({
          map,
          roughness: 0.12,
          clearcoat: 1,
          clearcoatRoughness: 0.02,
          emissiveMap: map,
          emissive: 0x332255,
        });
        break;
      default:
        m = new THREE.MeshPhysicalMaterial({ map, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03 });
    }
    if (look.pattern !== "disco" && !(this.mesh.geometry instanceof THREE.SphereGeometry)) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.SphereGeometry(this.r, 64, 40);
    }
    this.mesh.material = m;
  }

  dispose() {
    this.tex?.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
  }
}
