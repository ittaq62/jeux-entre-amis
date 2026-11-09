// Le public : des milliers de petits supporters en 3D, dessinés d'un seul coup par la carte graphique, qui sautillent
// tous seuls et explosent de joie quand il y a un but.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface Seat {
  x: number;
  y: number;
  z: number;
  /** La couleur de son maillot */
  color: THREE.Color;
}

const SKINS = ["#f0c8a2", "#e0ac83", "#b98055", "#8a5a3a", "#5d3b26"].map((c) => new THREE.Color(c));

/** Un supporter : un buste et une tête. Le drapeau `aHead` dira quelle partie prend la couleur de la peau. */
function fanGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.2, 0.27, 0.72, 6, 1, true);
  body.translate(0, 0.36, 0);
  const head = new THREE.IcosahedronGeometry(0.19, 0);
  head.translate(0, 0.9, 0);
  const merged = mergeGeometries([body.toNonIndexed(), head.toNonIndexed()])!;
  const count = merged.attributes.position!.count;
  const bodyCount = body.toNonIndexed().attributes.position!.count;
  const flags = new Float32Array(count);
  for (let i = bodyCount; i < count; i++) flags[i] = 1;
  merged.setAttribute("aHead", new THREE.BufferAttribute(flags, 1));
  return merged;
}

export class Crowd {
  readonly mesh: THREE.InstancedMesh;
  private uniforms = { uTime: { value: 0 }, uJump: { value: 0.05 } };

  constructor(seats: Seat[]) {
    const geo = fanGeometry();
    const mat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.uniforms.uJump = u.uJump;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           attribute float aHead;
           attribute float aPhase;
           attribute vec3 aSkin;
           uniform float uTime;
           uniform float uJump;`,
        )
        .replace(
          "#include <color_vertex>",
          `#include <color_vertex>
           vColor.rgb = mix(vColor.rgb, aSkin, aHead);`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           transformed.y += abs(sin(uTime * (3.5 + aPhase * 2.5) + aPhase * 40.0)) * uJump * (0.5 + aPhase);`,
        );
    };
    const m = new THREE.InstancedMesh(geo, mat, seats.length);
    const phases = new Float32Array(seats.length);
    const skins = new Float32Array(seats.length * 3);
    const matrix = new THREE.Matrix4();
    const yaw = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxY = 0;
    seats.forEach((s, i) => {
      yaw.setFromAxisAngle(up, Math.random() * 1.2 - 0.6);
      pos.set(s.x, s.y, s.z);
      const k = 0.92 + Math.random() * 0.2;
      scale.set(k, k, k);
      matrix.compose(pos, yaw, scale);
      m.setMatrixAt(i, matrix);
      m.setColorAt(i, s.color);
      phases[i] = Math.random();
      const skin = SKINS[Math.floor(Math.random() * SKINS.length)]!;
      skins[i * 3] = skin.r;
      skins[i * 3 + 1] = skin.g;
      skins[i * 3 + 2] = skin.b;
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z);
      maxZ = Math.max(maxZ, s.z);
      maxY = Math.max(maxY, s.y);
    });
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute("aSkin", new THREE.InstancedBufferAttribute(skins, 3));
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // Un seul bloc par tribune : on lui donne sa vraie étendue, pour ne pas la dessiner quand elle est hors champ
    geo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3((minX + maxX) / 2, maxY / 2, (minZ + maxZ) / 2),
      Math.hypot(maxX - minX, maxZ - minZ, maxY) / 2 + 3,
    );
    this.mesh = m;
  }

  update(t: number, excitement: number) {
    this.uniforms.uTime.value = t;
    this.uniforms.uJump.value = 0.05 + excitement * 0.75;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
