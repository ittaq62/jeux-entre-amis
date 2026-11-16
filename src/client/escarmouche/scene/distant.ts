// Le pays autour de la carte, là où l'on ne va pas : des prés et des champs en damier juste derrière la clôture, des
// bois et des haies, des collines qui montent, des montagnes bleuies par la brume tout au fond. Une seule grande
// toile de terrain (couleurs par sommet), et les arbres en deux paquets (troncs et houppiers) dessinés d'un coup.

import * as THREE from "three";
import type { GameMap } from "../../../shared/games/escarmouche/maps.ts";
import type { Quality } from "./quality.ts";

function hash(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, oct = 4) {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < oct; i++) {
    v += a * noise(x, y);
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 3.7;
    a *= 0.5;
  }
  return v;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Distant {
  group: THREE.Group;
  dispose(): void;
}

export function buildDistant(gm: GameMap, q: Quality, light: "soir" | "gris" | "aube" | "neige"): Distant {
  const winter = light === "neige";
  const group = new THREE.Group();
  const { x0, x1, z0, z1 } = gm.bounds;
  const pad = 3;
  /** La distance au bord de la carte (0 dedans) */
  const out = (x: number, z: number) => Math.hypot(Math.max(x0 - pad - x, 0, x - x1 - pad), Math.max(z0 - pad - z, 0, z - z1 - pad));
  const heightAt = (x: number, z: number) => {
    const d = out(x, z);
    if (d <= 0) return -0.3;
    // La mer au nord : le fond descend sous l'eau, et remonte au loin en falaises de l'autre côté de la baie
    if (gm.sea && z > z1 + pad) return -6 + smooth(260, 420, z - z1) * (20 + fbm(x * 0.006, z * 0.006) * 50);
    const hills = smooth(0, 60, d) * (1.5 + fbm(x * 0.012, z * 0.012) * 16) * (winter ? 1.6 : 1);
    const far = smooth(110, 360, d) * (25 + fbm(x * 0.004 + 9, z * 0.004 - 4, 5) * 110) * (winter ? 1.7 : 1);
    return hills + far;
  };

  // Le terrain : une grande toile, plus fine près de la carte
  const size = 980;
  const seg = q === "bas" ? 90 : q === "moyen" ? 130 : 170;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  geo.translate(cx, 0, cz);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grass = new THREE.Color(light === "soir" ? "#5f6e36" : "#56653d");
  const wheat = new THREE.Color(light === "soir" ? "#b39a52" : "#9a9060");
  const plowed = new THREE.Color("#6b5640");
  const meadow = new THREE.Color(light === "soir" ? "#7a8442" : "#6c7a4a");
  const forest = new THREE.Color(light === "soir" ? "#2f3d22" : "#2e3a27");
  const rock = new THREE.Color("#6d6a62");
  const snow = new THREE.Color("#e8ecef");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const d = out(x, z);
    // Les champs : des parcelles de quarante mètres, chacune sa culture
    const px = Math.floor((x + 13) / 42);
    const pz = Math.floor((z - 7) / 34);
    const crop = hash(px, pz);
    c.copy(crop < 0.3 ? wheat : crop < 0.48 ? plowed : crop < 0.75 ? meadow : grass);
    const woods = fbm(x * 0.018 + 50, z * 0.018 - 20);
    if (winter) {
      // L'hiver : la neige partout, les bois sombres qui la percent, la roche nue sur les pentes raides
      c.copy(snow);
      if (woods > 0.56 && d > 10) c.lerp(new THREE.Color("#2c3a2c"), smooth(0.56, 0.64, woods) * 0.8);
      if (h > 60 && fbm(x * 0.03, z * 0.03) > 0.55) c.lerp(rock, 0.55);
    } else {
      if (woods > 0.56 && d > 10) c.lerp(forest, smooth(0.56, 0.62, woods));
      c.lerp(grass, 1 - smooth(4, 20, d));
      if (h > 40) c.lerp(rock, smooth(40, 80, h));
      if (h > 95) c.lerp(snow, smooth(95, 120, h));
    }
    c.multiplyScalar(0.92 + hash(x * 0.3, z * 0.3) * 0.16);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    q === "bas"
      ? new THREE.MeshLambertMaterial({ vertexColors: true })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  );
  ground.receiveShadow = q === "haut";
  group.add(ground);

  // Les arbres : là où il y a du bois, et quelques-uns semés le long des haies
  const want = q === "bas" ? 160 : q === "moyen" ? 450 : 950;
  const spots: { x: number; z: number; h: number; s: number }[] = [];
  let tries = 0;
  while (spots.length < want && tries < want * 30) {
    tries++;
    const a = hash(tries * 0.71, 3.3) * Math.PI * 2;
    const r = 6 + Math.pow(hash(tries * 1.37, 9.1), 1.6) * 220;
    const x = cx + Math.cos(a) * (r + (x1 - x0) / 2);
    const z = cz + Math.sin(a) * (r + (z1 - z0) / 2);
    const d = out(x, z);
    if (d < 5 || d > 230) continue;
    if (gm.sea && z > z1) continue;
    const woods = fbm(x * 0.018 + 50, z * 0.018 - 20);
    const hedge = Math.abs(((x + 13) / 42) % 1) < 0.04 || Math.abs(((z - 7) / 34) % 1) < 0.05;
    if (woods < 0.55 && !(hedge && hash(x, z) < 0.5) && hash(z, x) > 0.04) continue;
    spots.push({ x, z, h: heightAt(x, z), s: 0.7 + hash(x * 2.1, z * 1.7) * 0.8 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, q === "bas" ? 0 : 1);
  const trunkMat = new THREE.MeshLambertMaterial({ color: "#3b2d22" });
  const crownMat = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, spots.length * 2);
  const m = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const leaf = winter
    ? [new THREE.Color("#2e3d30"), new THREE.Color("#3a4a3b"), new THREE.Color("#c9d3d6"), new THREE.Color("#28352a")]
    : [new THREE.Color("#3e5126"), new THREE.Color("#4a5d2b"), new THREE.Color("#33421f"), new THREE.Color("#58642e")];
  spots.forEach((p, i) => {
    const h = 7 * p.s;
    m.compose(new THREE.Vector3(p.x, p.h - 0.2, p.z), quat, new THREE.Vector3(p.s, h * 0.45, p.s));
    trunks.setMatrixAt(i, m);
    for (let k = 0; k < 2; k++) {
      const r = (k === 0 ? 2.6 : 1.9) * p.s;
      quat.setFromEuler(new THREE.Euler(i, i * 1.3 + k, 0));
      m.compose(
        new THREE.Vector3(p.x + (k ? 0.6 : 0) * p.s, p.h + h * (k ? 0.85 : 0.6), p.z + (k ? -0.4 : 0) * p.s),
        quat,
        new THREE.Vector3(r, r * 0.9, r),
      );
      crowns.setMatrixAt(i * 2 + k, m);
      crowns.setColorAt(i * 2 + k, leaf[(i + k) % leaf.length]!);
    }
    quat.identity();
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  crowns.castShadow = false;
  group.add(trunks);
  group.add(crowns);

  return {
    group,
    dispose() {
      geo.dispose();
      (ground.material as THREE.Material).dispose();
      trunkGeo.dispose();
      crownGeo.dispose();
      trunkMat.dispose();
      crownMat.dispose();
      trunks.dispose();
      crowns.dispose();
    },
  };
}
