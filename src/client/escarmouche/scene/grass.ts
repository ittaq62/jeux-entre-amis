// L'herbe des prés : des touffes de brins dessinés sur une toile, deux plans croisés chacune, semées sur les pelouses de
// la carte (jamais dans un mur) et dessinées d'un seul coup. Le haut des brins ondule au vent.

import * as THREE from "three";
import type { GameMap } from "../../../shared/games/escarmouche/maps.ts";
import type { World } from "../../../shared/games/escarmouche/world.ts";
import type { Quality } from "./quality.ts";

/** L'heure du vent, avancée par la scène */
export const grassTime = { value: 0 };

function bladeTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  let seed = 41;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 26; i++) {
    const x = 4 + r() * 56;
    const h = 30 + r() * 32;
    const lean = (r() - 0.5) * 14;
    const shade = 0.75 + r() * 0.35;
    g.strokeStyle = `rgb(${Math.round(128 * shade)}, ${Math.round(156 * shade)}, ${Math.round(72 * shade)})`;
    g.lineWidth = 1.5 + r() * 1.5;
    g.beginPath();
    g.moveTo(x, 64);
    g.quadraticCurveTo(x + lean * 0.3, 64 - h * 0.6, x + lean, 64 - h);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // Sans réduction : les bords transparents ne noircissent pas les brins au loin
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

export function buildGrass(gm: GameMap, world: World, q: Quality): THREE.Mesh | null {
  if (q === "bas") return null;
  const density = q === "haut" ? 1.1 : 0.45;
  const cap = q === "haut" ? 7000 : 2600;
  // Les pelouses : les sols et les taches d'herbe
  const areas: { x0: number; z0: number; x1: number; z1: number; y: number }[] = [];
  for (const b of gm.boxes) if (b.m === "herbe" && b.y1 < 0.6) areas.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y: Math.max(0, b.y1) });
  for (const d of gm.decor) if (d.k === "patch" && d.m === "herbe") areas.push({ x0: d.x0, z0: d.z0, x1: d.x1, z1: d.z1, y: 0.012 });
  if (areas.length === 0) return null;
  let seed = 7;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const spots: { x: number; y: number; z: number; s: number; a: number }[] = [];
  for (const a of areas) {
    const n = Math.round((a.x1 - a.x0) * (a.z1 - a.z0) * density);
    for (let k = 0; k < n && spots.length < cap; k++) {
      const x = a.x0 + r() * (a.x1 - a.x0);
      const z = a.z0 + r() * (a.z1 - a.z0);
      // Pas dans un mur, ni sous une caisse
      if (world.overlaps(x - 0.15, a.y + 0.02, z - 0.15, x + 0.15, a.y + 0.5, z + 0.15)) continue;
      spots.push({ x, y: a.y, z, s: 0.65 + r() * 0.45, a: r() * Math.PI });
    }
  }
  if (spots.length === 0) return null;
  // Une touffe : deux plans croisés, le bas plus sombre
  const parts: number[] = [];
  const uvs: number[] = [];
  const cols: number[] = [];
  const w = 0.45;
  const h = 0.42;
  for (const rot of [0, Math.PI / 2]) {
    const cx = Math.cos(rot) * w * 0.5;
    const cz = Math.sin(rot) * w * 0.5;
    const quad = [
      [-cx, 0, -cz, 0, 0, 0.75],
      [cx, 0, cz, 1, 0, 0.75],
      [cx, h, cz, 1, 1, 1.15],
      [-cx, 0, -cz, 0, 0, 0.75],
      [cx, h, cz, 1, 1, 1.15],
      [-cx, h, -cz, 0, 1, 1.15],
    ];
    for (const [x, y, z, u, v, c] of quad) {
      parts.push(x!, y!, z!);
      uvs.push(u!, v!);
      cols.push(c!, c!, c!);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(parts, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  geo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(
      new Array((parts.length / 3) * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  const mat = new THREE.MeshLambertMaterial({ map: bladeTexture(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true });
  // Le vent : le haut des brins se balance, chaque touffe à son rythme
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = grassTime;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float windTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
        vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(windTime * 1.7 + wpos.x * 0.6 + wpos.z * 0.4) * 0.07 + sin(windTime * 3.1 + wpos.z) * 0.025;
        transformed.x += sway * position.y * 2.0;
        transformed.z += sway * position.y * 1.2;`,
    );
  };
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((p, i) => {
    quat.setFromAxisAngle(up, p.a);
    m.compose(new THREE.Vector3(p.x, p.y, p.z), quat, new THREE.Vector3(p.s, p.s * (0.8 + (i % 5) * 0.08), p.s));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
