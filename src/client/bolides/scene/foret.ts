// La forêt au crépuscule : des arbres immenses (séquoias et hêtres) de part et d'autre du chemin, les fougères, les
// rochers moussus et les troncs couchés du sous-bois, des champignons qui luisent, des lucioles partout, le tronc creux
// qu'on traverse dans la montée, l'arbre géant planté au milieu de la route, des rayons de lune entre les cimes, une
// chouette qui regarde passer la course. Tout est posé par rapport au circuit : en miroir, la forêt est retournée.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pointAt, type Track } from "../../../shared/games/bolides/track.ts";
import { onTrack } from "./onTrack.ts";
import { glowTexture } from "./villeTextures.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

export interface ForetContext {
  group: THREE.Group;
  t: Track;
  keep: Keep;
  heightAt: (x: number, z: number) => number;
  distAt: (x: number, z: number) => number;
  shadows: boolean;
  phone: boolean;
  r: () => number;
  /** Le tronc creux (le tunnel), en mètres depuis la ligne */
  tunnel: [number, number];
}

export interface Foret {
  update: (time: number, camera: THREE.Vector3) => void;
}

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

function lumpy(radius: number, detail: number, amount: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + amount * (Math.sin(v.x * 1.7 + seed) * Math.sin(v.y * 1.3 - seed) + 0.5 * Math.sin(v.z * 2.1 + v.x));
    p.setXYZ(i, v.x * n, v.y * n, v.z * n);
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

/** L'écorce : de longues crevasses verticales, rousses pour les séquoias */
function barkTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#6a3e26";
  g.fillRect(0, 0, 128, 256);
  for (let x = 0; x < 128; x += 4) {
    const l = 18 + ((x * 37) % 17);
    g.fillStyle = `hsl(20, 40%, ${l}%)`;
    g.fillRect(x, 0, 2 + ((x * 13) % 3), 256);
  }
  g.fillStyle = "rgba(0,0,0,0.25)";
  for (let i = 0; i < 40; i++) g.fillRect((i * 53) % 128, (i * 97) % 256, 1, 30 + ((i * 7) % 40));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Les cernes du bois, au bout d'un tronc coupé */
function ringsTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b88a5a";
  g.fillRect(0, 0, 256, 256);
  for (let rad = 6; rad < 128; rad += 7) {
    g.strokeStyle = rad % 14 === 6 ? "#8a603a" : "#a47a4c";
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(128, 128, rad, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Toute la forêt */
export function buildForet(ctx: ForetContext): Foret {
  const { group, t, keep, heightAt, distAt, shadows, phone, r } = ctx;
  const fx = t.def.id.endsWith("-miroir") ? -1 : 1;
  const L = t.length;
  const near = (s: number, x: number, gap: number) => Math.abs(((((s - x) % L) + L * 1.5) % L) - L / 2) < gap;
  const taken: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, rad: number) => taken.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + rad);
  const take = (x: number, z: number, rad: number) => taken.push({ x, z, r: rad });
  const updates: ((time: number, camera: THREE.Vector3) => void)[] = [];
  const lam = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => keep(new THREE.MeshLambertMaterial({ color, ...extra }));
  const bark = keep(barkTexture());
  const barkMat = lam(0xffffff, { map: bark });
  const glow = keep(glowTexture());
  const add = (o: THREE.Object3D) => {
    group.add(o);
    return o;
  };
  const [t1, t2] = ctx.tunnel;

  // --- Le tronc creux, couché en travers de la montée : on roule dedans ---
  if (t1 >= 0) {
    const a = pointAt(t, t1, 0);
    const b = pointAt(t, t2, 0);
    const R = t.wall + 2.2;
    const axis = v3(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = axis.length();
    axis.normalize();
    // Des tranches de 2 m : un grand triangle qui passerait derrière la caméra serait mal dessiné
    const rows = Math.max(8, Math.round(len / 2));
    const log = new THREE.Group();
    // Son axe à 4 m au-dessus de la route : ses parois retombent derrière les murets (le bas est sous terre)
    log.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 4, (a.z + b.z) / 2);
    log.quaternion.setFromUnitVectors(UP, axis);
    const outerTex = keep(barkTexture());
    outerTex.repeat.set(6, 2);
    const outer = new THREE.Mesh(keep(new THREE.CylinderGeometry(R + 1.2, R + 1.2, len, 40, rows, true)), lam(0xffffff, { map: outerTex }));
    outer.castShadow = shadows;
    log.add(outer);
    const innerTex = keep(barkTexture());
    innerTex.repeat.set(4, 2);
    log.add(
      new THREE.Mesh(keep(new THREE.CylinderGeometry(R, R, len, 40, rows, true)), lam(0xc8a070, { map: innerTex, side: THREE.BackSide })),
    );
    // Les deux bouts : les cernes du bois, en anneau
    const rings = keep(ringsTexture());
    for (const y of [-len / 2, len / 2]) {
      const ring = new THREE.Mesh(
        keep(new THREE.RingGeometry(R, R + 1.2, 40, 1).rotateX(Math.PI / 2)),
        lam(0xffffff, { map: rings, side: THREE.DoubleSide }),
      );
      ring.position.y = y;
      log.add(ring);
    }
    // La mousse sur le dessus
    const moss = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(R + 1.45, R + 1.45, len * 0.92, 24, rows, true, -0.9, 1.8)),
      lam(0x4a7a34, { side: THREE.DoubleSide }),
    );
    moss.rotation.y = Math.PI;
    log.add(moss);
    add(log);
    take(log.position.x, log.position.z, 4);
  }

  // --- L'arbre géant planté au milieu de la route ---
  for (const isl of t.islands) {
    const c = pointAt(t, isl.s + isl.len / 2, isl.d);
    // L'arbre est un îlot : la conduite le connaît
    const tree = onTrack(new THREE.Group(), "solid");
    tree.position.set(c.x, c.y, c.z);
    tree.rotation.y = Math.atan2(c.tx, c.tz);
    const H = 95;
    // Le tronc : ovale comme l'îlot (son grand axe suit la route), il s'évase en racines au pied
    const trunkTex = keep(barkTexture());
    trunkTex.repeat.set(3, 8);
    const trunk = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(isl.half * 0.7, isl.half, H, 20).translate(0, H / 2, 0)),
      lam(0xffffff, { map: trunkTex }),
    );
    trunk.scale.set(1, 1, isl.len / 2 / isl.half);
    trunk.castShadow = shadows;
    tree.add(trunk);
    const roots: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      roots.push(
        // Elles restent au pied de l'arbre, sur l'îlot
        new THREE.ConeGeometry(0.9, 2.4, 6)
          .rotateZ(Math.PI / 2 - 0.35)
          .translate(isl.half * 0.7, 0.5, 0)
          .rotateY(ang),
      );
    }
    const rootMesh = new THREE.Mesh(keep(merge(roots)), barkMat);
    rootMesh.scale.set(1, 1, isl.len / 2 / isl.half);
    tree.add(rootMesh);
    // Sa couronne, tout là-haut, et une branche qui passe au-dessus de la route
    const crown: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) crown.push(lumpy(16, 1, 0.12, k).translate((r() - 0.5) * 26, H - 6 + r() * 14, (r() - 0.5) * 26));
    const crownMesh = new THREE.Mesh(keep(merge(crown)), lam(0x2f5a2a, { flatShading: true }));
    tree.add(crownMesh);
    add(tree);
  }

  // --- Les arbres : de grands séquoias et des hêtres, serrés le long du chemin, puis toute la forêt autour ---
  const keepClear = (s: number) =>
    t.gaps.some((g) => near(s, (g.from + g.to) / 2, (g.to - g.from) / 2 + 30)) || near(s, 0, 10) || t.crossers.some((c) => near(s, c.s, 8));
  const trunks: THREE.Matrix4[] = [];
  const cones: THREE.Matrix4[] = [];
  const beeches: THREE.Matrix4[] = [];
  const beechTrunks: THREE.Matrix4[] = [];
  const plant = (x: number, z: number, big: boolean) => {
    const y = heightAt(x, z);
    const scale = big ? 1.4 + r() * 1.2 : 0.8 + r() * 0.6;
    if (r() < 0.6) {
      trunks.push(at(x, y - 0.5, z, r() * 6, scale, scale * (0.9 + r() * 0.3), scale));
      cones.push(at(x, y - 0.5, z, r() * 6, scale, scale * (0.9 + r() * 0.3), scale));
    } else {
      beechTrunks.push(at(x, y - 0.5, z, r() * 6, scale));
      beeches.push(at(x, y - 0.5, z, r() * 6, scale));
    }
  };
  for (const side of [-1, 1]) {
    for (let s = 0; s < L; s += 9 + r() * 8) {
      if (keepClear(s)) continue;
      const d = side * (t.wall + 6 + r() * 10);
      const p = pointAt(t, s, d);
      if (distAt(p.x, p.z) < t.wall + 5 || !free(p.x, p.z, 6)) continue;
      take(p.x, p.z, 5);
      plant(p.x, p.z, r() < 0.4);
    }
  }
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
  const deep = phone ? 140 : 280;
  for (let k = 0; k < deep * 6 && trunks.length + beechTrunks.length < deep + 120; k++) {
    const x = minX - 160 + r() * (maxX - minX + 320);
    const z = minZ - 160 + r() * (maxZ - minZ + 320);
    if (distAt(x, z) < t.wall + 22 || !free(x, z, 7)) continue;
    take(x, z, 6);
    plant(x, z, r() < 0.5);
  }
  // Un séquoia : un fût roux qui s'élève, une flèche de trois étages sombres ; un hêtre : un tronc gris, un dôme
  add(instanced(keep(new THREE.CylinderGeometry(1.2, 2.2, 46, 9).translate(0, 23, 0)), barkMat, trunks, shadows));
  add(
    instanced(
      keep(
        merge([
          new THREE.ConeGeometry(9, 18, 9).translate(0, 30, 0),
          new THREE.ConeGeometry(7.5, 16, 9).translate(0, 40, 0),
          new THREE.ConeGeometry(5, 14, 9).translate(0, 50, 0),
        ]),
      ),
      lam(0xffffff, { flatShading: true }),
      cones,
      shadows,
      [0x1f3a26, 0x24422a, 0x1a3322],
    ),
  );
  add(instanced(keep(new THREE.CylinderGeometry(0.9, 1.5, 22, 8).translate(0, 11, 0)), lam(0x7a7a70), beechTrunks, shadows));
  add(
    instanced(
      keep(lumpy(11, 1, 0.12, 2).scale(1, 0.85, 1).translate(0, 26, 0)),
      lam(0xffffff, { flatShading: true }),
      beeches,
      shadows,
      [0x33582a, 0x3d6430, 0x2c4e26],
    ),
  );

  // --- Le sous-bois : fougères, rochers moussus, troncs couchés, buissons ---
  const ferns: THREE.Matrix4[] = [];
  const rocks: THREE.Matrix4[] = [];
  const logs: THREE.Matrix4[] = [];
  for (let k = 0; k < (phone ? 900 : 1800) && ferns.length < (phone ? 220 : 480); k++) {
    const s = r() * L;
    const side = r() < 0.5 ? -1 : 1;
    const p = pointAt(t, s, side * (t.wall + 1.5 + r() * 26));
    if (distAt(p.x, p.z) < t.wall + 1 || !free(p.x, p.z, 1.5) || keepClear(s)) continue;
    const y = heightAt(p.x, p.z);
    const roll = r();
    if (roll < 0.72) ferns.push(at(p.x, y, p.z, r() * 6, 0.8 + r() * 0.9));
    else if (roll < 0.92) {
      const sx = 1.2 + r() * 2.2;
      const sz = 1.4 + r() * 2;
      // Un gros rocher plus loin : aucun ne déborde sur la piste
      if (distAt(p.x, p.z) > t.wall + 0.8 + Math.max(sx, sz)) rocks.push(at(p.x, y + 0.2, p.z, r() * 6, sx, 0.8 + r() * 1.2, sz));
    } else if (distAt(p.x, p.z) > t.wall + 6 && free(p.x, p.z, 5)) {
      take(p.x, p.z, 4);
      // Couché le long du chemin
      logs.push(at(p.x, y + 0.7, p.z, Math.atan2(-p.tz, p.tx), 1, 1, 1));
    }
  }
  const fern: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++)
    fern.push(
      new THREE.ConeGeometry(0.5, 3.2, 3)
        .scale(1, 1, 0.2)
        .translate(0, 1.6, 0)
        .rotateX(0.9)
        .rotateY((k / 7) * Math.PI * 2),
    );
  add(
    onTrack(
      instanced(
        keep(merge(fern)),
        lam(0xffffff, { flatShading: true, side: THREE.DoubleSide }),
        ferns,
        false,
        [0x3f7a34, 0x4a8a3a, 0x356a2e],
      ),
      "traversable",
    ),
  );
  add(instanced(keep(new THREE.DodecahedronGeometry(1, 0)), lam(0x6a7062, { flatShading: true }), rocks, shadows));
  add(instanced(keep(new THREE.CylinderGeometry(0.7, 0.8, 9, 8).rotateZ(Math.PI / 2)), barkMat, logs, shadows));

  // --- Les champignons qui luisent, en touffes au bord du chemin ---
  const caps: THREE.Matrix4[] = [];
  const stems: THREE.Matrix4[] = [];
  const glowPos: number[] = [];
  const glowCol: number[] = [];
  const shroomColors = [new THREE.Color(0.35, 1.2, 1.4), new THREE.Color(1.1, 0.5, 1.4), new THREE.Color(0.6, 1.4, 0.5)];
  for (let s = 6; s < L; s += 14 + r() * 10) {
    if (keepClear(s)) continue;
    const side = r() < 0.5 ? -1 : 1;
    const base = pointAt(t, s, side * (t.wall + 2.4 + r() * 3));
    if (distAt(base.x, base.z) < t.wall + 2) continue;
    const y0 = heightAt(base.x, base.z);
    const tint = shroomColors[Math.floor(r() * shroomColors.length)]!;
    for (let k = 0; k < 3 + Math.floor(r() * 4); k++) {
      const x = base.x + (r() - 0.5) * 2;
      const z = base.z + (r() - 0.5) * 2;
      const h = 0.6 + r() * 1.3;
      stems.push(at(x, y0, z, 0, 1, h, 1));
      caps.push(at(x, y0 + h, z, r() * 6, 0.6 + h * 0.35));
      glowPos.push(x, y0 + h + 0.2, z);
      glowCol.push(tint.r, tint.g, tint.b);
    }
  }
  add(instanced(keep(new THREE.CylinderGeometry(0.12, 0.16, 1, 6).translate(0, 0.5, 0)), lam(0xe8e2d4), stems, false));
  const capMesh = instanced(
    keep(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1)),
    keep(new THREE.MeshBasicMaterial()),
    caps,
    false,
  );
  // Chaque touffe sa couleur : bleu, violet ou vert, et assez forte pour briller
  const cc = new THREE.Color();
  for (let i = 0; i < caps.length; i++) capMesh.setColorAt(i, cc.setRGB(glowCol[i * 3]!, glowCol[i * 3 + 1]!, glowCol[i * 3 + 2]!));
  if (capMesh.instanceColor) capMesh.instanceColor.needsUpdate = true;
  add(capMesh);
  {
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(glowPos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(glowCol, 3));
    add(
      new THREE.Points(
        geo,
        keep(
          new THREE.PointsMaterial({
            map: glow,
            size: 3.2,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        ),
      ),
    );
  }

  // --- Les lucioles : des centaines de points qui flottent et clignotent le long du chemin ---
  {
    const n = phone ? 160 : 420;
    const home = new Float32Array(n * 3);
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = pointAt(t, r() * L, (r() - 0.5) * 2 * (t.wall + 14));
      home.set([p.x, heightAt(p.x, p.z) + 0.8 + r() * 6, p.z], i * 3);
      phase[i] = r() * 100;
    }
    pos.set(home);
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const groups = [0, 1].map((k) => {
      const g2 = keep(new THREE.BufferGeometry());
      g2.setAttribute("position", geo.attributes.position!);
      g2.setDrawRange(k * Math.floor(n / 2), Math.floor(n / 2));
      const mat = keep(
        new THREE.PointsMaterial({
          map: glow,
          size: 1.1,
          color: new THREE.Color(1.3, 1.5, 0.5),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const pts = new THREE.Points(g2, mat);
      pts.frustumCulled = false;
      add(pts);
      return mat;
    });
    updates.push((time) => {
      for (let i = 0; i < n; i++) {
        const ph = phase[i]!;
        pos[i * 3] = home[i * 3]! + Math.sin(time * 0.37 + ph) * 1.6;
        pos[i * 3 + 1] = home[i * 3 + 1]! + Math.sin(time * 0.53 + ph * 1.7) * 0.8;
        pos[i * 3 + 2] = home[i * 3 + 2]! + Math.cos(time * 0.31 + ph * 0.6) * 1.6;
      }
      geo.attributes.position!.needsUpdate = true;
      groups.forEach((m, k) => {
        m.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(time * 2.3 + k * 2.4));
      });
    });
  }

  // --- Des rayons de lune entre les cimes ---
  {
    const beam = keep(new THREE.ConeGeometry(7, 60, 16, 1, true).translate(0, -30, 0));
    const mat = keep(
      new THREE.MeshBasicMaterial({
        color: 0xb8c8ff,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    for (let k = 0; k < (phone ? 5 : 10); k++) {
      const s = (k / (phone ? 5 : 10)) * L + 30;
      if (keepClear(s)) continue;
      const p = pointAt(t, s, (r() - 0.5) * 2 * (t.wall + 6));
      // Un rayon de lumière : on passe au travers
      const m = onTrack(new THREE.Mesh(beam, mat), "traversable");
      m.position.set(p.x, p.y + 52, p.z);
      m.rotation.z = 0.25 * fx;
      m.rotation.x = -0.2;
      add(m);
    }
  }

  // --- La chouette, sur une branche au-dessus du départ, ses yeux qui brillent ---
  {
    const p = pointAt(t, 30, -(t.wall + 4));
    const owl = new THREE.Group();
    const body = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 12, 10).scale(0.85, 1.1, 0.8)), lam(0x7a6450));
    owl.add(body);
    const eyes = new THREE.Mesh(
      keep(
        merge([
          new THREE.SphereGeometry(0.22, 10, 8).translate(-0.3, 0.4, 0.7),
          new THREE.SphereGeometry(0.22, 10, 8).translate(0.3, 0.4, 0.7),
        ]),
      ),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 0.4) })),
    );
    owl.add(eyes);
    const branch = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.35, 0.5, 14, 7).rotateZ(Math.PI / 2)), barkMat);
    branch.position.y = -1.2;
    owl.add(branch);
    owl.position.set(p.x, heightAt(p.x, p.z) + 11, p.z);
    owl.rotation.y = Math.atan2(-p.tx, -p.tz);
    add(owl);
    updates.push((time) => {
      owl.rotation.y = Math.atan2(-p.tx, -p.tz) + Math.sin(time * 0.6) * 0.6;
    });
  }

  return {
    update(time, camera) {
      for (const u of updates) u(time, camera);
    },
  };
}
