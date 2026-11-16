// Ce qui traîne au sol : des flaques qui reflètent le ciel (la bruine de la gare, le port à l'aube, quelques flaques de
// boue au village), et des taches d'huile près des quais. Des formes plates et irrégulières, posées là où le sol est
// libre, toujours au même endroit pour une carte donnée.

import * as THREE from "three";
import type { GameMap } from "../../../shared/games/escarmouche/maps.ts";
import type { World } from "../../../shared/games/escarmouche/world.ts";
import type { Quality } from "./quality.ts";

/** Combien de flaques et de taches, et leurs couleurs, selon la carte */
const LOOK: Record<GameMap["light"], { puddles: number; stains: number; water: string; stain: string }> = {
  gris: { puddles: 46, stains: 10, water: "#8d969e", stain: "#191a1a" },
  aube: { puddles: 22, stains: 26, water: "#9a9aa0", stain: "#141312" },
  soir: { puddles: 12, stains: 0, water: "#8a7c66", stain: "#1b1a18" },
};

/** Les sols où l'eau stagne (pas l'herbe, ni les toits) */
const WET = new Set(["gravier", "beton", "pave", "sol", "terre"]);

export function buildDecals(gm: GameMap, world: World, q: Quality): THREE.Group | null {
  if (q === "bas") return null;
  const look = LOOK[gm.light];
  const group = new THREE.Group();
  let seed = gm.id.length * 7919 + 13;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const { x0, z0, x1, z1 } = gm.bounds;
  /** Une place libre, sur un sol où l'eau stagne, à hauteur du sol */
  const spot = (size: number) => {
    for (let tries = 0; tries < 30; tries++) {
      const x = x0 + 3 + r() * (x1 - x0 - 6);
      const z = z0 + 3 + r() * (z1 - z0 - 6);
      const hit = world.raycast(x, 3, z, 0, -1, 0, 4);
      if (!hit) continue;
      const y = 3 - hit.t;
      if (y > 0.45 || y < -0.05) continue;
      if (!WET.has(world.boxes[hit.box]?.m ?? "")) continue;
      if (world.overlaps(x - size, y + 0.02, z - size, x + size, y + 0.6, z + size)) continue;
      return { x, y, z };
    }
    return null;
  };
  /** Une forme ronde et irrégulière, à plat, pleine au milieu et qui s'efface sur ses bords */
  const blob = (size: number, lumps: number) => {
    const n = 24;
    const phase = r() * 6;
    const pos: number[] = [0, 0, 0];
    const col: number[] = [1, 1, 1, 1];
    const radius: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      radius.push(size * (1 + 0.22 * Math.sin(a * lumps + phase) + 0.12 * Math.sin(a * (lumps + 3) + phase * 2)));
    }
    // Deux anneaux : le bord net de l'eau (opaque), puis le bord mouillé qui s'efface
    for (const [k0, alpha] of [
      [0.78, 1],
      [1, 0],
    ] as const) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        pos.push(Math.cos(a) * radius[k]! * k0, 0, Math.sin(a) * radius[k]! * k0 * 0.7);
        col.push(1, 1, 1, alpha);
      }
    }
    const idx: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = 1 + k;
      const b = 1 + ((k + 1) % n);
      idx.push(0, b, a);
      idx.push(a, b, b + n, a, b + n, a + n);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  const water = new THREE.MeshStandardMaterial({
    color: look.water,
    roughness: 0.05,
    metalness: 0.65,
    envMapIntensity: 1.6,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
  const stain = new THREE.MeshStandardMaterial({
    color: look.stain,
    roughness: 0.35,
    metalness: 0.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
  const lay = (count: number, mat: THREE.Material, min: number, span: number, lift: number) => {
    for (let k = 0; k < count; k++) {
      const size = min + r() * span;
      const at = spot(size);
      if (!at) continue;
      const m = new THREE.Mesh(blob(size, 2 + Math.floor(r() * 3)), mat);
      m.position.set(at.x, at.y + lift, at.z);
      m.rotation.y = r() * Math.PI * 2;
      m.receiveShadow = true;
      m.renderOrder = 1;
      group.add(m);
    }
  };
  lay(look.puddles, water, 0.5, 1.4, 0.014);
  lay(look.stains, stain, 0.35, 0.9, 0.012);
  return group.children.length > 0 ? group : null;
}
