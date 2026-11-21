// Le potager géant, un matin de soleil : les karts sont tout petits au milieu des légumes. Des tournesols plus hauts
// que des immeubles le long de l'allée, un carré de citrouilles, une citrouille au milieu de la route, des rangs de
// salades, de choux, de carottes et de poireaux, des tomates sur leurs tuteurs, des haricots grimpants, la serre de
// verre qu'on traverse, le pommier qui lâche ses pommes, la mare et ses nénuphars, l'arrosoir, les pots, la cabane,
// l'épouvantail, le tas de compost, la maison du jardinier au loin, des papillons et des libellules.
// Tout est posé par rapport au circuit : en miroir, le potager est retourné avec lui.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pointAt, type Track } from "../../../shared/games/bolides/track.ts";
import { mergeDeep } from "./merge.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

export interface PotagerContext {
  group: THREE.Group;
  t: Track;
  keep: Keep;
  heightAt: (x: number, z: number) => number;
  distAt: (x: number, z: number) => number;
  shadows: boolean;
  phone: boolean;
  r: () => number;
  /** D'où vient le soleil (les tournesols le regardent) */
  sun: THREE.Vector3;
}

export interface Potager {
  update: (time: number) => void;
}

/** La serre, en mètres depuis la ligne : sur la ligne droite du haut */
export const GREENHOUSE: [number, number] = [470, 560];

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(n.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") n.deleteAttribute(name);
    if (!n.attributes.uv) n.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position!.count * 2), 2));
    return n;
  });
  const out = mergeGeometries(flat, false)!;
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  return out;
}

/** Une sphère bosselée (une salade, un chou, un feuillage) : facettes visibles, un peu de relief */
function lumpy(radius: number, detail: number, amount: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + amount * (Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 - seed) + 0.6 * Math.sin(v.z * 4.3 + v.x * 1.3));
    p.setXYZ(i, v.x * n, v.y * n, v.z * n);
  }
  g.computeVertexNormals();
  return g;
}

/** Une citrouille côtelée, posée sur le sol (de 0 à 2r de haut) */
function pumpkinGeometry(r: number, fine = false): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, fine ? 28 : 18, fine ? 16 : 10);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const rib = 1 - 0.08 * Math.pow(Math.abs(Math.cos(a * 5)), 0.6);
    p.setXYZ(i, v.x * rib * 1.15, v.y * 0.82 + r * 0.82, v.z * rib * 1.15);
  }
  g.computeVertexNormals();
  return g;
}

function instanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  mats: THREE.Matrix4[],
  cast: boolean,
  colors?: number[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = mats.length;
  mesh.castShadow = cast;
  if (colors) {
    const c = new THREE.Color();
    mats.forEach((_, i) => mesh.setColorAt(i, c.setHex(colors[i % colors.length]!)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

const at = (x: number, y: number, z: number, rot = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(v3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, rot), v3(sx, sy, sz));

/** Le potager entier */
export function buildPotager(ctx: PotagerContext): Potager {
  const { group, t, keep, heightAt, distAt, shadows, phone, r } = ctx;
  const fx = t.def.id.endsWith("-miroir") ? -1 : 1;
  const L = t.length;
  const near = (s: number, x: number, gap: number) => Math.abs(((((s - x) % L) + L * 1.5) % L) - L / 2) < gap;
  const taken: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, rad: number) => taken.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + rad);
  const take = (x: number, z: number, rad: number) => taken.push({ x, z, r: rad });
  const updates: ((time: number) => void)[] = [];
  const lam = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => keep(new THREE.MeshLambertMaterial({ color, ...extra }));
  const leafy = (color: number) => lam(color, { flatShading: true });
  const add = (mesh: THREE.Object3D) => {
    group.add(mesh);
    return mesh;
  };

  // --- La citrouille au milieu de la route ---
  for (const isl of t.islands) {
    const c = pointAt(t, isl.s + isl.len / 2, isl.d);
    const pumpkin = new THREE.Group();
    pumpkin.position.set(c.x, c.y + 0.05, c.z);
    pumpkin.rotation.y = r() * 6;
    const body = new THREE.Mesh(
      keep(pumpkinGeometry(isl.half, true)),
      keep(new THREE.MeshStandardMaterial({ color: 0xf08a1c, roughness: 0.55 })),
    );
    body.castShadow = shadows;
    pumpkin.add(body);
    const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.35, 0.55, 1.6, 7).rotateZ(0.25)), lam(0x6a7a32));
    stem.position.y = isl.half * 1.64 + 0.6;
    pumpkin.add(stem);
    const leaf = new THREE.Mesh(keep(new THREE.SphereGeometry(1.6, 12, 6).scale(1.5, 0.12, 1)), leafy(0x4f8a34));
    leaf.position.set(0.9, isl.half * 1.6 + 0.2, 0.6);
    leaf.rotation.z = -0.3;
    pumpkin.add(leaf);
    add(pumpkin);
  }

  // --- La serre, au-dessus de la route en haut de la butte ---
  {
    const [s1, s2] = GREENHOUSE;
    const w = t.wall + 0.6;
    const frameMat = lam(0xf4f4ee);
    const posts: THREE.Matrix4[] = [];
    const ribs: THREE.BufferGeometry[] = [];
    for (let s = s1; s <= s2 + 0.1; s += 7.5) {
      const segs = 10;
      let prev: THREE.Vector3 | null = null;
      for (let k = 0; k <= segs; k++) {
        const a = (k / segs) * Math.PI;
        const p = pointAt(t, s, Math.cos(a) * w);
        const q = v3(p.x, p.y + 0.0 + Math.sin(a) * 10.5 + 2.2, p.z);
        if (prev) {
          const len = prev.distanceTo(q);
          const g = new THREE.BoxGeometry(0.22, len, 0.22);
          g.translate(0, len / 2, 0);
          g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, q.clone().sub(prev).normalize()));
          g.translate(prev.x, prev.y, prev.z);
          ribs.push(g);
        }
        prev = q;
      }
      for (const side of [-1, 1]) {
        const p = pointAt(t, s, side * w);
        posts.push(at(p.x, p.y, p.z, 0, 1, 2.2, 1));
      }
    }
    add(new THREE.Mesh(keep(merge(ribs)), frameMat));
    add(instanced(keep(new THREE.BoxGeometry(0.25, 1, 0.25).translate(0, 0.5, 0)), frameMat, posts, false));
    // La verrière : une voûte de verre clair, un peu bleutée, qui laisse passer la lumière
    const pos: number[] = [];
    const idx: number[] = [];
    const rows = Math.round((s2 - s1) / 3);
    const segs = 12;
    for (let i = 0; i <= rows; i++) {
      const s = s1 + ((s2 - s1) * i) / rows;
      for (let k = 0; k <= segs; k++) {
        const a = (k / segs) * Math.PI;
        const p = pointAt(t, s, Math.cos(a) * (w + 0.05));
        pos.push(p.x, p.y + Math.sin(a) * 10.5 + 2.2, p.z);
      }
    }
    for (let i = 0; i < rows; i++)
      for (let k = 0; k < segs; k++) {
        const a = i * (segs + 1) + k;
        idx.push(a, a + segs + 1, a + 1, a + 1, a + segs + 1, a + segs + 2);
      }
    // Les deux pignons, aux deux bouts
    const glassGeo = keep(new THREE.BufferGeometry());
    glassGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    glassGeo.setIndex(idx);
    glassGeo.computeVertexNormals();
    add(
      new THREE.Mesh(
        glassGeo,
        keep(
          new THREE.MeshStandardMaterial({
            color: 0xdff4ff,
            transparent: true,
            opacity: 0.22,
            roughness: 0.05,
            metalness: 0.1,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        ),
      ),
    );
    // Dedans : les tomates sur leurs tuteurs, le long des deux côtés, et des caisses de semis
    const stakes: THREE.Matrix4[] = [];
    const foliage: THREE.Matrix4[] = [];
    const fruit: THREE.Matrix4[] = [];
    const trays: THREE.Matrix4[] = [];
    for (let s = s1 + 4; s < s2 - 2; s += 5) {
      for (const side of [-1, 1]) {
        const p = pointAt(t, s, side * (t.half + 3.2));
        stakes.push(at(p.x, p.y, p.z, 0, 1, 7.5, 1));
        for (let k = 0; k < 3; k++) {
          foliage.push(at(p.x + (r() - 0.5) * 1.2, p.y + 2.2 + k * 2.1, p.z + (r() - 0.5) * 1.2, r() * 6, 1.1 + r() * 0.4));
          if (r() < 0.8) fruit.push(at(p.x + (r() - 0.5) * 1.8, p.y + 1.8 + k * 2.1, p.z + (r() - 0.5) * 1.8, 0, 0.45 + r() * 0.2));
        }
        const q = pointAt(t, s + 2.5, side * (t.half + 4.6));
        trays.push(at(q.x, q.y + 0.5, q.z, Math.atan2(q.tx, q.tz), 1.4, 1, 3.2));
      }
    }
    add(instanced(keep(new THREE.CylinderGeometry(0.08, 0.08, 1, 5).translate(0, 0.5, 0)), lam(0xc9b27a), stakes, false));
    add(instanced(keep(lumpy(1, 1, 0.12, 3)), leafy(0x4f9a3a), foliage, false));
    add(
      instanced(
        keep(new THREE.SphereGeometry(1, 10, 8)),
        keep(new THREE.MeshStandardMaterial({ color: 0xe8301e, roughness: 0.3 })),
        fruit,
        false,
      ),
    );
    add(instanced(keep(new THREE.BoxGeometry(1, 1, 1)), lam(0x7a5a3a), trays, false));
  }

  // --- Le pommier, à côté de la ligne droite du haut, sa ramure au-dessus de la route ---
  for (const m of t.movers) {
    if (m.kind !== "drop") continue;
    const c = pointAt(t, m.s, 0);
    const foot = pointAt(t, m.s, -(t.wall + 8));
    const y0 = heightAt(foot.x, foot.z);
    take(foot.x, foot.z, 8);
    const tree = new THREE.Group();
    const bark = lam(0x6a4a30);
    // Le tronc penche vers la route ; ses branches portent la ramure
    const top = v3(c.x, c.y + 20, c.z);
    const base = v3(foot.x, y0, foot.z);
    const trunkLen = base.distanceTo(top);
    const trunk = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.4, 2.6, trunkLen, 10).translate(0, trunkLen / 2, 0)), bark);
    trunk.position.copy(base);
    trunk.quaternion.setFromUnitVectors(UP, top.clone().sub(base).normalize());
    trunk.castShadow = shadows;
    tree.add(trunk);
    const crowns: THREE.BufferGeometry[] = [];
    const apples: THREE.Matrix4[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rad = k === 0 ? 0 : 9 + r() * 4;
      const p = v3(top.x + Math.cos(a) * rad, top.y + 7 + r() * 4 - rad * 0.2, top.z + Math.sin(a) * rad);
      crowns.push(lumpy(8 + r() * 3, 1, 0.1, k).translate(p.x, p.y, p.z));
      for (let j = 0; j < 4; j++) {
        const u = new THREE.Vector3(r() - 0.5, r() * 0.6 - 0.5, r() - 0.5).normalize().multiplyScalar(8.5);
        apples.push(at(p.x + u.x, p.y + u.y, p.z + u.z, 0, 1.3 + r() * 0.4));
      }
    }
    const crown = new THREE.Mesh(keep(merge(crowns)), leafy(0x4a8a30));
    crown.castShadow = shadows;
    tree.add(crown);
    tree.add(
      instanced(
        keep(new THREE.SphereGeometry(1, 12, 10)),
        keep(new THREE.MeshStandardMaterial({ color: 0xd42a20, roughness: 0.35 })),
        apples,
        false,
      ),
    );
    add(tree);
  }

  // --- La mare, sous le saut : des nénuphars, des roseaux, des libellules ---
  for (const g of t.gaps) {
    if (g.glide) continue;
    const mid = (g.from + g.to) / 2;
    const c = pointAt(t, mid, 0);
    const waterY = c.y - 4.5 + 0.04;
    const pads: THREE.Matrix4[] = [];
    for (let k = 0; k < (phone ? 8 : 16); k++) {
      const p = pointAt(t, mid + (r() - 0.5) * (g.to - g.from - 3), (r() - 0.5) * 2 * (t.wall - 1));
      pads.push(at(p.x, waterY, p.z, r() * 6, 1.4 + r() * 1.2, 1, 1.4 + r() * 1.2));
    }
    const padShape = new THREE.Shape();
    padShape.absarc(0, 0, 1, 0.35, Math.PI * 2 - 0.05, false);
    padShape.lineTo(0, 0);
    add(
      instanced(keep(new THREE.ShapeGeometry(padShape, 16).rotateX(-Math.PI / 2)), lam(0x3f8a38, { side: THREE.DoubleSide }), pads, false),
    );
    // Les roseaux, sur les deux berges, de part et d'autre de la route
    const reeds: THREE.Matrix4[] = [];
    const heads: THREE.Matrix4[] = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < (phone ? 10 : 22); k++) {
        const p = pointAt(t, mid + (r() - 0.5) * 30, side * (t.wall + 2 + r() * 10));
        const y = heightAt(p.x, p.z);
        if (y < c.y - 1) continue;
        const h = 7 + r() * 6;
        reeds.push(at(p.x, y, p.z, r() * 6, 1, h, 1));
        if (r() < 0.5) heads.push(at(p.x, y + h * 0.92, p.z, 0, 1));
      }
    }
    add(instanced(keep(new THREE.CylinderGeometry(0.06, 0.14, 1, 4).translate(0, 0.5, 0)), lam(0x6a9a3a), reeds, false));
    add(instanced(keep(new THREE.CapsuleGeometry(0.28, 1.2, 3, 6)), lam(0x6a4426), heads, false));
    // Des libellules qui tournent au-dessus de l'eau
    const flies = new THREE.InstancedMesh(
      keep(
        merge([
          new THREE.CylinderGeometry(0.06, 0.04, 1.4, 5).rotateX(Math.PI / 2),
          new THREE.BoxGeometry(1.8, 0.02, 0.35).translate(0, 0.05, 0.2),
        ]),
      ),
      keep(new THREE.MeshStandardMaterial({ color: 0x3ad0e0, roughness: 0.2, metalness: 0.5 })),
      4,
    );
    flies.frustumCulled = false;
    add(flies);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    updates.push((time) => {
      for (let i = 0; i < flies.count; i++) {
        const a = time * (0.7 + i * 0.13) + i * 1.6;
        const x = c.x + Math.cos(a) * (6 + i * 2.5);
        const z = c.z + Math.sin(a * 1.3) * (5 + i * 2);
        q.setFromAxisAngle(UP, -a);
        m4.compose(v3(x, c.y + 1.5 + Math.sin(time * 3 + i) * 0.8, z), q, v3(1, 1, 1));
        flies.setMatrixAt(i, m4);
      }
      flies.instanceMatrix.needsUpdate = true;
    });
  }

  // --- Les grandes pièces du jardin : l'arrosoir, les pots, la cabane, l'épouvantail, le compost, la maison ---
  const P = (x: number, z: number) => v3(x * fx, heightAt(x * fx, z), z);
  {
    // L'arrosoir, couché sur l'herbe près du départ
    const p = pointAt(t, 70, -(t.wall + 30));
    const y = heightAt(p.x, p.z);
    take(p.x, p.z, 16);
    const can = new THREE.Group();
    const zinc = keep(new THREE.MeshStandardMaterial({ color: 0x5aa07a, roughness: 0.35, metalness: 0.55 }));
    const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(7, 7.5, 13, 28)), zinc);
    body.position.y = 6.5;
    body.castShadow = shadows;
    can.add(body);
    const spout = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.9, 1.5, 17, 12)), zinc);
    spout.position.set(9.5, 9, 0);
    spout.rotation.z = -0.95;
    can.add(spout);
    const rose = new THREE.Mesh(keep(new THREE.CylinderGeometry(2.2, 1, 1.6, 14)), zinc);
    rose.position.set(16.6, 14, 0);
    rose.rotation.z = -0.95;
    can.add(rose);
    const handle = new THREE.Mesh(keep(new THREE.TorusGeometry(5.5, 0.6, 8, 24, Math.PI)), zinc);
    handle.position.set(-1, 13, 0);
    can.add(handle);
    can.position.set(p.x, y, p.z);
    can.rotation.y = Math.atan2(p.tx, p.tz) + Math.PI / 2;
    mergeDeep(can, keep);
    add(can);
    // Les pots de terre cuite, empilés à côté
    const pots: THREE.Matrix4[] = [];
    for (let k = 0; k < 5; k++) {
      const q = pointAt(t, 112 + k * 9, -(t.wall + 18 + (k % 2) * 6));
      const qy = heightAt(q.x, q.z);
      take(q.x, q.z, 5);
      pots.push(at(q.x, qy, q.z, r() * 6, 1 + (k % 3) * 0.3));
      if (k % 2 === 0) pots.push(at(q.x, qy + 6.2 * (1 + (k % 3) * 0.3), q.z, r() * 6, 0.8));
    }
    add(
      instanced(
        keep(new THREE.CylinderGeometry(4.2, 3.2, 6.4, 18, 1, true).translate(0, 3.2, 0)),
        lam(0xc2683a, { side: THREE.DoubleSide }),
        pots,
        shadows,
      ),
    );
    // La cabane du jardinier, au bord de la dernière ligne droite
    const s = pointAt(t, 1356, -(t.wall + 30));
    const sy = heightAt(s.x, s.z);
    take(s.x, s.z, 22);
    const shed = new THREE.Group();
    const wood = lam(0x8a5a34);
    const walls = new THREE.Mesh(keep(new THREE.BoxGeometry(30, 18, 22)), wood);
    walls.position.y = 9;
    walls.castShadow = shadows;
    shed.add(walls);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-17, 0);
    roofShape.lineTo(17, 0);
    roofShape.lineTo(0, 10);
    roofShape.closePath();
    const roof = new THREE.Mesh(
      keep(new THREE.ExtrudeGeometry(roofShape, { depth: 24, bevelEnabled: false }).translate(0, 0, -12)),
      lam(0x3a5a3a),
    );
    roof.position.y = 18;
    shed.add(roof);
    const door = new THREE.Mesh(keep(new THREE.BoxGeometry(8, 13, 0.4)), lam(0x5a3a22));
    door.position.set(-6, 6.5, 11.1);
    shed.add(door);
    const window1 = new THREE.Mesh(
      keep(new THREE.BoxGeometry(7, 6, 0.4)),
      keep(new THREE.MeshStandardMaterial({ color: 0x9ad0e8, roughness: 0.1, metalness: 0.3 })),
    );
    window1.position.set(7, 10, 11.1);
    shed.add(window1);
    shed.position.set(s.x, sy, s.z);
    shed.rotation.y = Math.atan2(s.tx, s.tz) + Math.PI;
    mergeDeep(shed, keep);
    add(shed);
    // L'épouvantail, au milieu des tomates
    const e = P(118, 150);
    take(e.x, e.z, 6);
    const crow = new THREE.Group();
    const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.4, 0.5, 22, 6)), lam(0x7a5a3a));
    pole.position.y = 11;
    crow.add(pole);
    const arms = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.35, 0.35, 16, 6).rotateZ(Math.PI / 2)), lam(0x7a5a3a));
    arms.position.y = 16;
    crow.add(arms);
    const shirt = new THREE.Mesh(keep(new THREE.BoxGeometry(7, 7, 3)), lam(0x3a6ab0));
    shirt.position.y = 14;
    crow.add(shirt);
    const sleeves = new THREE.Mesh(keep(new THREE.BoxGeometry(14, 1.8, 1.8)), lam(0x3a6ab0));
    sleeves.position.y = 16;
    crow.add(sleeves);
    const head = new THREE.Mesh(keep(new THREE.SphereGeometry(2.3, 12, 10)), lam(0xe8cf8a));
    head.position.y = 19.6;
    crow.add(head);
    const hat = new THREE.Mesh(
      keep(merge([new THREE.CylinderGeometry(4, 4, 0.3, 16), new THREE.CylinderGeometry(1.8, 2.2, 2.6, 14).translate(0, 1.4, 0)])),
      lam(0x6a4a2a),
    );
    hat.position.y = 21.4;
    crow.add(hat);
    crow.position.copy(e);
    crow.rotation.y = r() * 6;
    crow.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = shadows;
    });
    mergeDeep(crow, keep);
    add(crow);
    // Le tas de compost et la brouette, près des lacets
    const cp = P(-195, 150);
    take(cp.x, cp.z, 20);
    const heap = new THREE.Mesh(keep(lumpy(14, 2, 0.08, 7).scale(1, 0.45, 1)), lam(0x5a4230, { flatShading: true }));
    heap.position.copy(cp);
    add(heap);
    const barrowAt = P(-188, 112);
    take(barrowAt.x, barrowAt.z, 10);
    const barrow = new THREE.Group();
    const tray = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(7, 4.5, 4, 4, 1, true).rotateY(Math.PI / 4).scale(1, 1, 1.4)),
      lam(0xc23a28, { side: THREE.DoubleSide }),
    );
    tray.position.y = 6;
    barrow.add(tray);
    const wheel = new THREE.Mesh(keep(new THREE.TorusGeometry(2.4, 0.7, 8, 20)), lam(0x2a2a2a));
    wheel.position.set(0, 2.6, 9);
    wheel.rotation.y = Math.PI / 2;
    barrow.add(wheel);
    for (const x of [-3, 3]) {
      const arm = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.3, 0.3, 16, 6).rotateX(Math.PI / 2 - 0.25)), lam(0x7a5a3a));
      arm.position.set(x, 5.5, -2);
      barrow.add(arm);
    }
    barrow.position.copy(barrowAt);
    barrow.rotation.y = 0.8 * fx;
    mergeDeep(barrow, keep);
    add(barrow);
    // La maison du jardinier, loin derrière la serre : on voit à quel point on est petit
    const hp = P(10, 470);
    const house = new THREE.Group();
    const wall = new THREE.Mesh(keep(new THREE.BoxGeometry(150, 80, 70)), lam(0xf0e4cc));
    wall.position.y = 40;
    house.add(wall);
    const hroof = new THREE.Shape();
    hroof.moveTo(-82, 0);
    hroof.lineTo(82, 0);
    hroof.lineTo(0, 55);
    hroof.closePath();
    const hroofMesh = new THREE.Mesh(
      keep(new THREE.ExtrudeGeometry(hroof, { depth: 78, bevelEnabled: false }).translate(0, 0, -39)),
      lam(0xa8442e),
    );
    hroofMesh.position.y = 80;
    house.add(hroofMesh);
    for (const x of [-48, 0, 48]) {
      const win = new THREE.Mesh(keep(new THREE.BoxGeometry(22, 26, 1)), lam(0x4a6a8a));
      win.position.set(x, 48, -35.5);
      house.add(win);
      const shutterL = new THREE.Mesh(keep(new THREE.BoxGeometry(9, 26, 1)), lam(0x3a7a5a));
      shutterL.position.set(x - 16, 48, -35.6);
      house.add(shutterL);
      const shutterR = new THREE.Mesh(keep(new THREE.BoxGeometry(9, 26, 1)), lam(0x3a7a5a));
      shutterR.position.set(x + 16, 48, -35.6);
      house.add(shutterR);
    }
    const hdoor = new THREE.Mesh(keep(new THREE.BoxGeometry(22, 34, 1)), lam(0x6a4a2a));
    hdoor.position.set(-48, 17, -35.6);
    house.add(hdoor);
    house.position.copy(hp);
    mergeDeep(house, keep);
    add(house);
  }

  // --- Les légumes, rang par rang, le long de la route ---
  type Kind = "tournesol" | "citrouille" | "salade" | "chou" | "carotte" | "poireau" | "haricot" | "fraise";
  const kindAt = (s: number): Kind[] => {
    if (s < 160 || s > 1300) return ["tournesol", "salade"];
    if (s < 360) return ["citrouille", "citrouille"];
    if (s < 470) return ["haricot", "chou"];
    if (s < 700) return ["chou", "poireau"];
    if (s < 870) return ["salade", "fraise"];
    if (s < 1060) return ["carotte", "salade"];
    if (s < 1220) return ["fraise", "poireau"];
    return ["poireau", "chou"];
  };
  const spots: Record<Kind, THREE.Matrix4[]> = {
    tournesol: [],
    citrouille: [],
    salade: [],
    chou: [],
    carotte: [],
    poireau: [],
    haricot: [],
    fraise: [],
  };
  const beds: THREE.Matrix4[] = [];
  const keepClear = (s: number) =>
    t.crossers.some((c) => near(s, c.s, 22)) ||
    t.gaps.some((g) => near(s, (g.from + g.to) / 2, 24)) ||
    near(s, (GREENHOUSE[0] + GREENHOUSE[1]) / 2, (GREENHOUSE[1] - GREENHOUSE[0]) / 2 + 4) ||
    near(s, 0, 10);
  for (const side of [-1, 1]) {
    for (let s = 4; s < L; s += 8) {
      if (keepClear(s)) continue;
      const kinds = kindAt(s);
      for (let row = 0; row < 3; row++) {
        const d = side * (t.wall + 5 + row * 8 + r() * 1.5);
        const p = pointAt(t, s + (r() - 0.5) * 3, d);
        if (distAt(p.x, p.z) < t.wall + 3.5 || !free(p.x, p.z, 3.5)) continue;
        const y = heightAt(p.x, p.z);
        const kind = kinds[row === 0 ? 0 : 1]!;
        const sc = 0.85 + r() * 0.35;
        spots[kind].push(at(p.x, y, p.z, r() * 6, sc));
        // La planche de terre sous le rang
        if (row < 2) beds.push(at(p.x, y + 0.04, p.z, Math.atan2(p.tx, p.tz), 7.5, 1, 8.2));
      }
    }
  }
  // La terre retournée des planches
  add(
    instanced(
      keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
      lam(0x5a4028, { polygonOffset: true, polygonOffsetFactor: -1 }),
      beds,
      false,
    ),
  );
  // Tournesols : la tige, deux grandes feuilles, le cœur et ses pétales tournés vers le soleil
  {
    const mats = spots.tournesol;
    const stems: THREE.Matrix4[] = [];
    const leaves: THREE.Matrix4[] = [];
    const heads: THREE.Matrix4[] = [];
    const sunFlat = ctx.sun.clone().setY(0).normalize();
    const look = Math.atan2(sunFlat.x, sunFlat.z);
    const pos = new THREE.Vector3();
    for (const m of mats) {
      pos.setFromMatrixPosition(m);
      const h = 24 + r() * 14;
      stems.push(at(pos.x, pos.y, pos.z, 0, 1, h, 1));
      for (const k of [0.35, 0.6]) leaves.push(at(pos.x, pos.y + h * k, pos.z, r() * 6, 1 + r() * 0.3));
      // Le capitule regarde le soleil, un peu penché vers le bas
      heads.push(
        new THREE.Matrix4().compose(
          v3(pos.x, pos.y + h, pos.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, look + (r() - 0.5) * 0.5, 0, "YXZ")),
          v3(1, 1, 1),
        ),
      );
    }
    add(instanced(keep(new THREE.CylinderGeometry(0.55, 0.8, 1, 8).translate(0, 0.5, 0)), lam(0x5a8a32), stems, shadows));
    add(instanced(keep(new THREE.SphereGeometry(1, 10, 6).scale(5, 0.3, 2.4).translate(4.5, 0, 0)), leafy(0x4f8a2e), leaves, false));
    // Le cœur : un disque brun ; les pétales : une couronne jaune (le disque regarde vers +z local)
    const petals: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      petals.push(new THREE.SphereGeometry(1, 6, 3).scale(3.4, 1.1, 0.25).translate(7.2, 0, 0).rotateZ(a));
    }
    add(instanced(keep(new THREE.CylinderGeometry(4.6, 4.6, 1.2, 24).rotateX(Math.PI / 2)), lam(0x5a3a1c), heads, shadows));
    add(instanced(keep(merge(petals)), lam(0xf6c21a), heads, false));
  }
  // Les citrouilles, et leurs grandes feuilles
  {
    const mats = spots.citrouille;
    const leaves: THREE.Matrix4[] = [];
    const pos = new THREE.Vector3();
    for (const m of mats) {
      pos.setFromMatrixPosition(m);
      for (let k = 0; k < 2; k++) leaves.push(at(pos.x + (r() - 0.5) * 9, pos.y + 0.4, pos.z + (r() - 0.5) * 9, r() * 6, 1 + r() * 0.5));
    }
    add(
      instanced(
        keep(pumpkinGeometry(2.6)),
        keep(new THREE.MeshStandardMaterial({ roughness: 0.55 })),
        mats,
        shadows,
        [0xf08a1c, 0xe8761a, 0xf2a030, 0xd8c060],
      ),
    );
    add(instanced(keep(new THREE.SphereGeometry(2.6, 12, 6).scale(1.2, 0.12, 1)), leafy(0x4f8a34), leaves, false));
  }
  // Les salades et les choux : des boules de feuilles froissées
  add(
    instanced(
      keep(lumpy(3.2, 1, 0.14, 1).scale(1, 0.62, 1).translate(0, 1.4, 0)),
      leafy(0xffffff),
      spots.salade,
      false,
      [0x8ccf4a, 0x9adf5a, 0x7ab83e, 0xa8503a],
    ),
  );
  add(instanced(keep(lumpy(3.6, 1, 0.1, 2).scale(1, 0.75, 1).translate(0, 2.2, 0)), leafy(0x7fa88a), spots.chou, false));
  // Les carottes : le collet orange qui sort de terre, un plumet de fanes
  {
    const roots = keep(new THREE.ConeGeometry(1.2, 2.4, 10).rotateX(Math.PI).translate(0, 0.6, 0));
    const fronds: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      fronds.push(new THREE.ConeGeometry(0.9, 9, 5).translate(0, 4.5, 0).rotateZ(0.35).rotateY(a).translate(0, 1.6, 0));
    }
    add(instanced(roots, lam(0xf07a1a), spots.carotte, false));
    add(instanced(keep(merge(fronds)), leafy(0x5aa63a), spots.carotte, false));
  }
  // Les poireaux : un fût blanc et vert, des feuilles en éventail
  {
    const stalk = keep(new THREE.CylinderGeometry(0.9, 1.0, 9, 10).translate(0, 4.5, 0));
    const fan: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++)
      fan.push(
        new THREE.BoxGeometry(1.4, 9, 0.15)
          .translate(0, 4.5, 0)
          .rotateZ((k - 1.5) * 0.35)
          .translate(0, 8.5, 0),
      );
    add(instanced(stalk, lam(0xe6efd2), spots.poireau, false));
    add(instanced(keep(merge(fan)), leafy(0x3f7a4a), spots.poireau, false));
  }
  // Les haricots grimpants : quatre perches en tipi, couvertes de feuilles
  {
    const poles: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      poles.push(new THREE.CylinderGeometry(0.15, 0.2, 20, 5).translate(0, 10, 0).rotateZ(0.18).rotateY(a));
    }
    add(instanced(keep(merge(poles)), lam(0xc9b27a), spots.haricot, false));
    add(instanced(keep(lumpy(3.4, 1, 0.15, 5).scale(0.9, 2.3, 0.9).translate(0, 8, 0)), leafy(0x5a9a3a), spots.haricot, false));
  }
  // Les fraisiers : des touffes basses et leurs grosses fraises
  {
    const berries: THREE.Matrix4[] = [];
    const pos = new THREE.Vector3();
    for (const m of spots.fraise) {
      pos.setFromMatrixPosition(m);
      for (let k = 0; k < 3; k++) berries.push(at(pos.x + (r() - 0.5) * 4, pos.y + 0.9, pos.z + (r() - 0.5) * 4, r() * 6, 0.9 + r() * 0.4));
    }
    add(instanced(keep(lumpy(2.4, 1, 0.12, 9).scale(1, 0.45, 1).translate(0, 0.9, 0)), leafy(0x4a9a3a), spots.fraise, false));
    add(
      instanced(
        keep(new THREE.ConeGeometry(0.8, 1.5, 10).rotateX(Math.PI)),
        keep(new THREE.MeshStandardMaterial({ color: 0xe8202a, roughness: 0.3 })),
        berries,
        false,
      ),
    );
  }

  // --- Autour du potager : des haies et des arbres fruitiers ---
  {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < t.n; i++) {
      minX = Math.min(minX, t.x[i]!);
      maxX = Math.max(maxX, t.x[i]!);
      minZ = Math.min(minZ, t.z[i]!);
      maxZ = Math.max(maxZ, t.z[i]!);
    }
    const trunks: THREE.Matrix4[] = [];
    for (let k = 0; k < 500 && trunks.length < (phone ? 22 : 45); k++) {
      const x = minX - 140 + r() * (maxX - minX + 280);
      const z = minZ - 140 + r() * (maxZ - minZ + 280);
      const d = distAt(x, z);
      if (d < t.wall + 45 || !free(x, z, 12)) continue;
      take(x, z, 10);
      trunks.push(at(x, heightAt(x, z), z, r() * 6, 1.6 + r() * 0.8));
    }
    add(instanced(keep(new THREE.CylinderGeometry(0.6, 0.9, 9, 7).translate(0, 4.5, 0)), lam(0x6a4a30), trunks, shadows));
    add(instanced(keep(lumpy(6, 1, 0.12, 4).translate(0, 12, 0)), leafy(0xffffff), trunks, shadows, [0x4f8a30, 0x5f9a36, 0x467a2a]));
  }

  // --- Des papillons, qui volettent au-dessus des rangs ---
  {
    const n = phone ? 8 : 18;
    const wing = keep(new THREE.CircleGeometry(0.9, 8).translate(0.85, 0, 0).rotateX(-Math.PI / 2));
    const mat = keep(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const left = new THREE.InstancedMesh(wing, mat, n);
    const right = new THREE.InstancedMesh(wing, mat, n);
    const colors = [0xffffff, 0xffd23a, 0xff8a2a, 0x7ab8ff, 0xee6fb0];
    const c = new THREE.Color();
    const homes: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const p = pointAt(t, (i / n) * L + r() * 20, (r() < 0.5 ? -1 : 1) * (t.wall + 6 + r() * 12));
      homes.push(v3(p.x, heightAt(p.x, p.z) + 3 + r() * 4, p.z));
      left.setColorAt(i, c.setHex(colors[i % colors.length]!));
      right.setColorAt(i, c.setHex(colors[i % colors.length]!));
    }
    for (const m of [left, right]) {
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.frustumCulled = false;
      add(m);
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, "YXZ");
    const one = v3(1, 1, 1);
    const pos = new THREE.Vector3();
    updates.push((time) => {
      homes.forEach((h, i) => {
        const a = time * 0.4 + i * 2.1;
        pos.set(h.x + Math.cos(a) * 4, h.y + Math.sin(time * 1.7 + i) * 1.2, h.z + Math.sin(a * 1.3) * 4);
        const flap = Math.sin(time * 14 + i) * 0.9;
        q.setFromEuler(e.set(0, -a, flap));
        left.setMatrixAt(i, m4.compose(pos, q, one));
        q.setFromEuler(e.set(0, -a + Math.PI, flap));
        right.setMatrixAt(i, m4.compose(pos, q, one));
      });
      left.instanceMatrix.needsUpdate = true;
      right.instanceMatrix.needsUpdate = true;
    });
  }

  return {
    update(time) {
      for (const u of updates) u(time);
    },
  };
}
