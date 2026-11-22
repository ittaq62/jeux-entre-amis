// La ville la nuit, sous la pluie : des immeubles serrés le long des rues (leurs fenêtres allumées, les boutiques du
// rez-de-chaussée, les toits de zinc), des réverbères dont la lumière se reflète sur les pavés mouillés, le fleuve et
// ses péniches au bout du quai, le canal sous le pont-levant, l'église en haut de la butte et le square de la place,
// la ville tout autour jusqu'à l'horizon, la pluie et les éclairs.

import * as THREE from "three";
import { onTrack } from "./onTrack.ts";
import { pointAt, type Track } from "../../../shared/games/bolides/track.ts";
import {
  BAY,
  churchTextures,
  facadeTextures,
  FACADE_COLS,
  FACADE_ROWS,
  FLOOR,
  glassRoofTexture,
  glowTexture,
  riverTexture,
  roofTextures,
  SHOP,
  SHOP_COUNT,
  SHOP_HEIGHT,
  shopTextures,
  streakTexture,
} from "./villeTextures.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

export interface VilleContext {
  group: THREE.Group;
  t: Track;
  keep: Keep;
  /** Le sol à cet endroit */
  heightAt: (x: number, z: number) => number;
  /** La distance au milieu de la route la plus proche */
  distAt: (x: number, z: number) => number;
  shadows: boolean;
  phone: boolean;
  r: () => number;
  /** La halle (le tunnel) et la passerelle, en mètres depuis la ligne */
  tunnel: [number, number];
  bridge: number;
}

export interface Ville {
  update: (time: number, camera: THREE.Vector3, daylight: number) => void;
  /** L'éclair en cours, de 0 à 1 (la scène éclaire tout d'un coup) */
  flash: () => number;
  /** Un éclair vient de tomber (pour le tonnerre, un peu après) */
  onFlash: (() => void) | null;
}

/** Le fleuve et le canal : des lignes, et leur demi-largeur ; l'eau est à WATER_Y, le fond plus bas */
export interface Waterway {
  pts: [number, number][];
  half: number;
}
export const WATER_Y = -4.5;
const BED_Y = -7.5;

/** Le fleuve passe au sud et à l'est de la ville ; le canal le relie, sous le pont-levant, à un bassin */
export function waterways(t: Track): Waterway[] {
  const river: Waterway = {
    half: 30,
    pts: [
      [-700, -62],
      [60, -62],
      [200, -40],
      [300, 60],
      [330, 200],
      [300, 330],
      [260, 900],
    ],
  };
  const out = [river];
  const gap = t.gaps.find((g) => !g.glide);
  if (gap) {
    const mid = (gap.from + gap.to) / 2;
    const a = pointAt(t, mid, -(t.wall + 34));
    const b = pointAt(t, mid, t.wall + 44);
    out.push({
      half: (gap.to - gap.from) / 2 + 0.4,
      pts: [
        [a.x, a.z],
        [b.x, b.z],
      ],
    });
  }
  return out;
}

/** La distance d'un point à une ligne brisée */
function lineDist(pts: [number, number][], x: number, z: number): number {
  let best = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k]!;
    const [bx, bz] = pts[k + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len = dx * dx + dz * dz;
    const f = len > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * f - x, az + dz * f - z));
  }
  return best;
}

/** De combien le sol plonge ici pour le fleuve ou le canal : la hauteur du fond, ou null hors de l'eau */
export function waterBed(ways: Waterway[], x: number, z: number): number | null {
  for (const w of ways) if (lineDist(w.pts, x, z) < w.half) return BED_Y;
  return null;
}

/** Dans l'eau (avec une marge pour le quai) */
function wet(ways: Waterway[], x: number, z: number, margin: number): boolean {
  return ways.some((w) => lineDist(w.pts, x, z) < w.half + margin);
}

function place(x: number, y: number, z: number, rot = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
    new THREE.Vector3(sx, sy, sz),
  );
}

function instances(geo: THREE.BufferGeometry, mat: THREE.Material, spots: THREE.Matrix4[], shadows: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  spots.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = spots.length;
  mesh.castShadow = shadows;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Des faces collées les unes aux autres, avec leurs coordonnées d'image et leur couleur, en une seule forme */
class Faces {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  /** Un quadrilatère a, b, c, d (dans l'ordre du tour), tourné vers `out` */
  quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    uvs: [number, number, number, number, number, number, number, number],
    color: THREE.Color,
    out: THREE.Vector3,
  ) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const flip = n.dot(out) < 0;
    const order = flip ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3];
    const v = [a, b, c, d];
    for (const k of order) {
      this.pos.push(v[k]!.x, v[k]!.y, v[k]!.z);
      this.uv.push(uvs[k * 2]!, uvs[k * 2 + 1]!);
      this.col.push(color.r, color.g, color.b);
    }
  }
  geometry(keep: Keep): THREE.BufferGeometry {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** Un immeuble : son pied au milieu de sa façade (côté rue), son cap, sa largeur, sa profondeur, sa hauteur */
interface Lot {
  x: number;
  z: number;
  /** Le sol au pied de la façade, et le plus bas sous l'immeuble */
  y: number;
  base: number;
  rot: number;
  w: number;
  depth: number;
  h: number;
  shop: number | null;
  tint: THREE.Color;
}

const TINTS = [0xf2ead8, 0xe8dcc4, 0xd9d4ca, 0xeadbb8, 0xd8c8b0, 0xe2d6c8, 0xcfc6b8, 0xf0e2c6];

/** Les immeubles : façades, rez-de-chaussée, soubassements, toits mansardés, cheminées */
function addBuildings(ctx: VilleContext, lots: Lot[]) {
  const { group, keep, shadows } = ctx;
  const facade = facadeTextures();
  const shops = shopTextures();
  const roofs = roofTextures();
  for (const tex of [facade.color, facade.lit, shops.color, shops.lit, roofs.color, roofs.lit]) keep(tex);
  const walls = new Faces();
  const fronts = new Faces();
  const plinths = new Faces();
  const roofFaces = new Faces();
  const tops = new Faces();
  const chimneys: THREE.Matrix4[] = [];
  const white = new THREE.Color(1, 1, 1);
  const gray = new THREE.Color(0.32, 0.3, 0.28);
  const tile = BAY * FACADE_COLS;
  const storey = FLOOR * FACADE_ROWS;
  for (const lot of lots) {
    const c = Math.cos(lot.rot);
    const s = Math.sin(lot.rot);
    // Le repère de l'immeuble : `along` suit la rue, `out` s'en éloigne
    const along = new THREE.Vector3(s, 0, c);
    const out = new THREE.Vector3(c, 0, -s);
    const corner = (u: number, v: number, y: number) =>
      new THREE.Vector3(lot.x + along.x * u + out.x * v, y, lot.z + along.z * u + out.z * v);
    const hw = lot.w / 2;
    const y0 = lot.y;
    const yShop = y0 + SHOP_HEIGHT;
    const yTop = y0 + lot.h;
    // Chaque immeuble commence ses fenêtres ailleurs dans l'image : ses voisins ne lui ressemblent pas
    const u0 = Math.floor((lot.x * 7 + lot.z * 3) % 8) / 8;
    const v0 = Math.floor(Math.abs(lot.x * 3 - lot.z * 5) % 4) / 8;
    const sides: [number, number, number, number, THREE.Vector3][] = [
      [-hw, 0, hw, 0, out.clone().negate()],
      [hw, 0, hw, lot.depth, along],
      [hw, lot.depth, -hw, lot.depth, out],
      [-hw, lot.depth, -hw, 0, along.clone().negate()],
    ];
    sides.forEach(([ua, va, ub, vb, normal], k) => {
      const len = Math.hypot(ub - ua, vb - va);
      const uA = u0 + 0;
      const uB = u0 + len / tile;
      // Les étages (sur la façade côté rue, au-dessus des boutiques ; ailleurs, depuis le trottoir)
      const from = k === 0 && lot.shop !== null ? yShop : y0 + 0.6;
      const vA = v0 + (from - y0 - SHOP_HEIGHT) / storey;
      const vB = v0 + (yTop - y0 - SHOP_HEIGHT) / storey;
      walls.quad(
        corner(ua, va, from),
        corner(ub, vb, from),
        corner(ub, vb, yTop),
        corner(ua, va, yTop),
        [uA, vA, uB, vA, uB, vB, uA, vB],
        lot.tint,
        normal,
      );
      // Le soubassement, jusqu'au sol le plus bas (la rue monte et descend)
      plinths.quad(
        corner(ua, va, lot.base - 0.5),
        corner(ub, vb, lot.base - 0.5),
        corner(ub, vb, k === 0 && lot.shop !== null ? y0 : y0 + 0.6),
        corner(ua, va, k === 0 && lot.shop !== null ? y0 : y0 + 0.6),
        [0, 0, 1, 0, 1, 1, 0, 1],
        gray,
        normal,
      );
      // Le toit mansardé : un pan incliné de zinc, avec ses lucarnes
      const inset = 1.7;
      const rise = 3.6;
      const ia = [ua === -hw ? -hw + inset : hw - inset, va === 0 ? inset : lot.depth - inset] as const;
      const ib = [ub === -hw ? -hw + inset : hw - inset, vb === 0 ? inset : lot.depth - inset] as const;
      roofFaces.quad(
        corner(ua, va, yTop),
        corner(ub, vb, yTop),
        corner(ib[0], ib[1], yTop + rise),
        corner(ia[0], ia[1], yTop + rise),
        [0, 0, len / 16, 0, len / 16, 1, 0, 1],
        white,
        normal.clone().add(new THREE.Vector3(0, 0.6, 0)),
      );
    });
    tops.quad(
      corner(-hw + 1.7, 1.7, yTop + 3.6),
      corner(hw - 1.7, 1.7, yTop + 3.6),
      corner(hw - 1.7, lot.depth - 1.7, yTop + 3.6),
      corner(-hw + 1.7, lot.depth - 1.7, yTop + 3.6),
      [0, 0, 1, 0, 1, 1, 0, 1],
      white,
      new THREE.Vector3(0, 1, 0),
    );
    // La boutique du rez-de-chaussée, côté rue
    if (lot.shop !== null) {
      const uS = lot.shop / SHOP_COUNT;
      const uE = uS + lot.w / (SHOP * SHOP_COUNT);
      fronts.quad(
        corner(-hw, 0, y0),
        corner(hw, 0, y0),
        corner(hw, 0, yShop),
        corner(-hw, 0, yShop),
        [uS, 0, uE, 0, uE, 1, uS, 1],
        white,
        out.clone().negate(),
      );
    }
    // Deux cheminées de briques
    for (const [u, v] of [
      [-hw * 0.5, lot.depth * 0.5],
      [hw * 0.45, lot.depth * 0.6],
    ] as const) {
      const p = corner(u, v, yTop + 3.6);
      chimneys.push(place(p.x, p.y + 0.8, p.z, lot.rot, 1, 1, 1));
    }
  }
  const lit = (map: THREE.Texture, glow: THREE.Texture, power: number) =>
    keep(new THREE.MeshLambertMaterial({ map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: power, vertexColors: true }));
  const add = (faces: Faces, mat: THREE.Material, cast: boolean) => {
    if (faces.pos.length === 0) return;
    const mesh = new THREE.Mesh(faces.geometry(keep), mat);
    mesh.castShadow = cast && shadows;
    mesh.receiveShadow = shadows;
    group.add(mesh);
  };
  add(walls, lit(facade.color, facade.lit, 1.25), true);
  add(fronts, lit(shops.color, shops.lit, 1.5), false);
  add(plinths, keep(new THREE.MeshLambertMaterial({ vertexColors: true })), false);
  add(roofFaces, lit(roofs.color, roofs.lit, 1.1), false);
  add(tops, keep(new THREE.MeshLambertMaterial({ color: 0x4d555e })), false);
  const chimney = keep(new THREE.BoxGeometry(0.9, 1.6, 0.7));
  group.add(instances(chimney, keep(new THREE.MeshLambertMaterial({ color: 0x8a4e3a })), chimneys, false));
}

/** Les rues de la ville : des immeubles serrés des deux côtés, sauf là où il faut de la place */
function streetLots(ctx: VilleContext, ways: Waterway[], keepClear: (s: number, side: number) => boolean): Lot[] {
  const { t, heightAt, distAt, r } = ctx;
  const lots: Lot[] = [];
  for (const side of [-1, 1]) {
    let s = 0;
    while (s < t.length - 4) {
      const w = 9 + r() * 7;
      if (keepClear(s, side) || keepClear(s + w, side) || keepClear(s + w / 2, side)) {
        s += 3;
        continue;
      }
      const depth = 10 + r() * 5;
      const front = side * (t.wall + 0.9);
      const mid = pointAt(t, s + w / 2, front);
      // L'immeuble regarde la rue : son repère suit la route au milieu de sa façade, son « dehors » s'en éloigne
      const rot = Math.atan2(mid.tx, mid.tz) + (side > 0 ? Math.PI : 0);
      const along = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
      const away = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot));
      // Rien ne doit toucher une autre rue, ni le fleuve : on vérifie l'arrière et le milieu de l'immeuble
      const probes: [number, number][] = [
        [-w / 2, depth],
        [w / 2, depth],
        [0, depth],
        [-w / 2, depth / 2],
        [w / 2, depth / 2],
        [0, depth / 2],
      ];
      let ok = true;
      let low = Infinity;
      for (const [u, v] of probes) {
        const x = mid.x + along.x * u + away.x * v;
        const z = mid.z + along.z * u + away.z * v;
        if (distAt(x, z) < t.wall + 0.8 + v * 0.6 || wet(ways, x, z, 4)) ok = false;
        low = Math.min(low, heightAt(x, z));
      }
      // Le fleuve juste derrière : c'est un quai, on le laisse ouvert sur l'eau
      const behind = [-w / 2, 0, w / 2].some((u) =>
        wet(ways, mid.x + along.x * u + away.x * (depth + 34), mid.z + along.z * u + away.z * (depth + 34), 0),
      );
      if (!ok || behind) {
        s += 3;
        continue;
      }
      const y = mid.y;
      const floors = 4 + Math.floor(r() * 3);
      lots.push({
        x: mid.x,
        z: mid.z,
        y,
        base: Math.min(low, y),
        rot,
        w: w + 0.4,
        depth,
        h: SHOP_HEIGHT + floors * FLOOR + 0.6,
        shop: r() < 0.82 ? Math.floor(r() * SHOP_COUNT) : null,
        tint: new THREE.Color(TINTS[Math.floor(r() * TINTS.length)]!),
      });
      s += w;
    }
  }
  return lots;
}

/** Derrière les rues : d'autres immeubles, pour que la ville soit pleine quand on regarde entre deux toits */
function blockLots(ctx: VilleContext, ways: Waterway[], count: number): Lot[] {
  const { t, heightAt, distAt, r } = ctx;
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
  const lots: Lot[] = [];
  for (let tries = 0; tries < count * 30 && lots.length < count; tries++) {
    const x = minX - 120 + r() * (maxX - minX + 240);
    const z = minZ - 120 + r() * (maxZ - minZ + 240);
    const w = 14 + r() * 10;
    const depth = 14 + r() * 10;
    const rot = Math.round(r() * 3) * (Math.PI / 2) + 0.05 * (r() - 0.5);
    const along = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
    const away = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot));
    let ok = true;
    for (const u of [-w / 2, 0, w / 2])
      for (const v of [0, depth / 2, depth]) {
        const px = x + along.x * u + away.x * v;
        const pz = z + along.z * u + away.z * v;
        if (distAt(px, pz) < t.wall + 17 || wet(ways, px, pz, 6)) ok = false;
      }
    if (!ok || lots.some((o) => Math.hypot(o.x - x, o.z - z) < (Math.max(o.w, o.depth) + Math.max(w, depth)) * 0.55)) continue;
    const y = heightAt(x, z);
    lots.push({
      x,
      z,
      y,
      base: y - 2,
      rot,
      w,
      depth,
      h: 14 + r() * 14,
      shop: null,
      tint: new THREE.Color(TINTS[Math.floor(r() * TINTS.length)]!).multiplyScalar(0.9),
    });
  }
  return lots;
}

/** Les réverbères, contre les façades : leur lanterne, leur halo, et le reflet qui s'étire sur les pavés */
function addLamps(ctx: VilleContext, keepClear: (s: number, side: number) => boolean) {
  const { group, t, keep } = ctx;
  const poles: THREE.Matrix4[] = [];
  const lanterns: THREE.Matrix4[] = [];
  const glows: number[] = [];
  const streaks = new Faces();
  const warm = new THREE.Color(1, 1, 1);
  const spacing = 24;
  for (let s = 6; s < t.length; s += spacing) {
    for (const side of [-1, 1]) {
      const at = s + (side > 0 ? spacing / 2 : 0);
      if (keepClear(at, side)) continue;
      const base = pointAt(t, at, side * (t.wall + 0.45));
      const head = pointAt(t, at, side * (t.wall - 0.9));
      // Le z de la crosse (vers l'arrière) doit pointer vers le milieu de la rue
      const arm = side > 0 ? Math.atan2(-base.tz, base.tx) : Math.atan2(base.tz, -base.tx);
      poles.push(place(base.x, base.y, base.z, arm));
      lanterns.push(place(head.x, head.y + 4.7, head.z, arm));
      glows.push(head.x, head.y + 4.7, head.z);
      // Le reflet sur la chaussée mouillée : une traînée le long de la rue, entre le trottoir et le milieu
      const a = pointAt(t, at - 5, side * (t.half - 2.2));
      const b = pointAt(t, at + 5, side * (t.half - 2.2));
      const n = new THREE.Vector3(-a.tz, 0, a.tx).multiplyScalar(1.3);
      const lift = 0.09;
      streaks.quad(
        new THREE.Vector3(a.x - n.x, a.y + lift, a.z - n.z),
        new THREE.Vector3(a.x + n.x, a.y + lift, a.z + n.z),
        new THREE.Vector3(b.x + n.x, b.y + lift, b.z + n.z),
        new THREE.Vector3(b.x - n.x, b.y + lift, b.z - n.z),
        [0, 0, 1, 0, 1, 1, 0, 1],
        warm,
        new THREE.Vector3(0, 1, 0),
      );
    }
  }
  // Le candélabre : un socle, un fût, une crosse qui avance au-dessus du trottoir
  const iron = keep(new THREE.MeshLambertMaterial({ color: 0x1d2a24 }));
  const parts: [THREE.BufferGeometry, number, number, number][] = [
    [new THREE.CylinderGeometry(0.22, 0.3, 0.9, 8), 0, 0.45, 0],
    [new THREE.CylinderGeometry(0.08, 0.12, 4.4, 8), 0, 2.6, 0],
    [new THREE.BoxGeometry(0.1, 0.1, 1.5), 0, 4.75, -0.7],
  ];
  const geos = parts.map(([g, x, y, z]) => {
    g.translate(x, y, z);
    return g;
  });
  const merged = keep(BufferMerge(geos));
  group.add(instances(merged, iron, poles, ctx.shadows));
  // La lanterne : une cage de verre qui brille (assez pour que le halo s'allume autour, sur ordinateur)
  const glass = keep(new THREE.CylinderGeometry(0.34, 0.2, 0.62, 6));
  group.add(instances(glass, keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 1.05) })), lanterns, false));
  const cap = keep(new THREE.ConeGeometry(0.46, 0.4, 6).translate(0, 0.5, 0));
  group.add(instances(cap, iron, lanterns, false));
  // Le halo autour de chaque lanterne, et la lumière qui tombe sur les pavés
  const glowGeo = keep(new THREE.BufferGeometry());
  glowGeo.setAttribute("position", new THREE.Float32BufferAttribute(glows, 3));
  const halo = new THREE.Points(
    glowGeo,
    keep(
      new THREE.PointsMaterial({
        map: keep(glowTexture()),
        size: 7,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xffc888,
        opacity: 0.55,
      }),
    ),
  );
  halo.frustumCulled = false;
  group.add(halo);
  const reflect = new THREE.Mesh(
    streaks.geometry(keep),
    keep(
      new THREE.MeshBasicMaterial({
        map: keep(streakTexture()),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.85,
      }),
    ),
  );
  reflect.renderOrder = 2;
  group.add(reflect);
}

/** Plusieurs formes en une (sans index, comme le veut la fusion) */
function BufferMerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    g.computeVertexNormals();
    pos.push(...(g.attributes.position!.array as Float32Array));
    nor.push(...(g.attributes.normal!.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

/** Le fleuve et le canal : l'eau sombre qui reflète la ville, les quais de pierre, les péniches amarrées */
function addWater(ctx: VilleContext, ways: Waterway[]): (time: number) => void {
  const { group, keep, t, r } = ctx;
  const tex = keep(riverTexture());
  tex.repeat.set(1, 1);
  const water = new THREE.MeshLambertMaterial({ map: tex, color: 0x8496b0, emissive: 0x0d1420 });
  keep(water);
  const stone = keep(new THREE.MeshLambertMaterial({ color: 0x6f675c }));
  const ribbonAlong = (w: Waterway, from: number, to: number, y0: number, y1: number, vertical: boolean) => {
    // Le long de la ligne : un ruban à plat (l'eau) entre deux écarts, ou un mur debout (le quai) à un écart
    const pos: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    let row = 0;
    let travelled = 0;
    for (let k = 0; k < w.pts.length; k++) {
      const [x, z] = w.pts[k]!;
      const [px, pz] = w.pts[Math.max(0, k - 1)]!;
      const [nx, nz] = w.pts[Math.min(w.pts.length - 1, k + 1)]!;
      const dx = nx - px;
      const dz = nz - pz;
      const l = Math.hypot(dx, dz) || 1;
      const ox = -dz / l;
      const oz = dx / l;
      if (k > 0) travelled += Math.hypot(x - px, z - pz);
      if (vertical) {
        pos.push(x + ox * from, y0, z + oz * from, x + ox * from, y1, z + oz * from);
        uv.push(travelled / 6, 0, travelled / 6, (y1 - y0) / 6);
      } else {
        pos.push(x + ox * from, y0, z + oz * from, x + ox * to, y0, z + oz * to);
        uv.push(0, travelled / 40, (to - from) / 40, travelled / 40);
      }
      if (row > 0) {
        const a = (row - 1) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      row++;
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  };
  for (const w of ways) {
    const sheet = new THREE.Mesh(ribbonAlong(w, -w.half - 1, w.half + 1, WATER_Y, WATER_Y, false), water);
    sheet.material.side = THREE.DoubleSide;
    group.add(sheet);
  }
  // Les quais du fleuve : deux murs de pierre (le canal a les siens, au pont-levant)
  const river = ways[0]!;
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(ribbonAlong(river, side * river.half, 0, BED_Y, 0.9, true), stone);
    wall.material.side = THREE.DoubleSide;
    group.add(wall);
  }
  // La promenade le long du fleuve : des platanes, des bancs, des lampadaires (jamais sur la route)
  const trunks: THREE.Matrix4[] = [];
  const benches: THREE.Matrix4[] = [];
  const lampPosts: THREE.Matrix4[] = [];
  const lampGlass: THREE.Matrix4[] = [];
  for (let k = 0; k + 1 < river.pts.length; k++) {
    const [ax, az] = river.pts[k]!;
    const [bx, bz] = river.pts[k + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    for (const side of [-1, 1]) {
      for (let along = 8; along < len - 8; along += 13) {
        const off = side * (river.half + 4.5);
        const x = ax + dx * along - dz * off;
        const z = az + dz * along + dx * off;
        if (ctx.distAt(x, z) < t.wall + 3 || Math.hypot(x, z) > 900) continue;
        const y = ctx.heightAt(x, z);
        const k2 = Math.round(along / 13) % 3;
        if (k2 === 0) {
          const lx = ax + dx * along - dz * side * (river.half + 1.2);
          const lz = az + dz * along + dx * side * (river.half + 1.2);
          lampPosts.push(place(lx, y, lz));
          lampGlass.push(place(lx, y + 4.4, lz));
        } else trunks.push(place(x, y, z, along, 1, 0.9 + k2 * 0.1, 1));
        if (k2 === 1)
          benches.push(
            place(
              ax + dx * along - dz * side * (river.half + 2.4),
              y,
              az + dz * along + dx * side * (river.half + 2.4),
              Math.atan2(dx, dz),
            ),
          );
      }
    }
  }
  const trunkGeo = keep(new THREE.CylinderGeometry(0.22, 0.32, 5, 7).translate(0, 2.5, 0));
  const crownGeo = keep(new THREE.IcosahedronGeometry(3, 1).translate(0, 6.8, 0));
  group.add(instances(trunkGeo, keep(new THREE.MeshLambertMaterial({ color: 0x5a4a3a })), trunks, ctx.shadows));
  group.add(instances(crownGeo, keep(new THREE.MeshLambertMaterial({ color: 0x2f4a2a, flatShading: true })), trunks, ctx.shadows));
  const benchGeo = keep(new THREE.BoxGeometry(1.8, 0.5, 0.6).translate(0, 0.45, 0));
  group.add(instances(benchGeo, keep(new THREE.MeshLambertMaterial({ color: 0x2c4a36 })), benches, false));
  const postGeo = keep(new THREE.CylinderGeometry(0.08, 0.12, 4.2, 7).translate(0, 2.1, 0));
  group.add(instances(postGeo, keep(new THREE.MeshLambertMaterial({ color: 0x1d2a24 })), lampPosts, false));
  const globeGeo = keep(new THREE.SphereGeometry(0.32, 10, 8));
  group.add(instances(globeGeo, keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 1.0) })), lampGlass, false));
  // Les péniches, amarrées contre l'autre rive, leurs fenêtres allumées
  const hull = keep(new THREE.BoxGeometry(5, 2.2, 32));
  const cabin = keep(new THREE.BoxGeometry(3.6, 2, 11));
  const hulls: THREE.Matrix4[] = [];
  const cabins: THREE.Matrix4[] = [];
  for (let k = 1; k < river.pts.length - 2; k++) {
    const [ax, az] = river.pts[k]!;
    const [bx, bz] = river.pts[k + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    const ox = -dz;
    const oz = dx;
    for (let along = 30; along < len - 30; along += 46 + r() * 30) {
      const x = ax + dx * along + ox * (river.half - 6);
      const z = az + dz * along + oz * (river.half - 6);
      // Jamais sous la route (le canal y passe)
      if (ctx.distAt(x, z) < t.wall + 6) continue;
      const rot = Math.atan2(dx, dz);
      hulls.push(place(x, WATER_Y + 0.6, z, rot));
      cabins.push(place(x, WATER_Y + 2.6, z - 0, rot));
    }
  }
  group.add(instances(hull, keep(new THREE.MeshLambertMaterial({ color: 0x2a1c1c })), hulls, false));
  const cabinTex = keep(shopWindows());
  group.add(
    instances(
      cabin,
      keep(
        new THREE.MeshLambertMaterial({
          color: 0x6a4a34,
          map: cabinTex,
          emissiveMap: cabinTex,
          emissive: 0xffffff,
          emissiveIntensity: 0.8,
        }),
      ),
      cabins,
      false,
    ),
  );
  return (time) => {
    tex.offset.set(time * 0.006, time * 0.02);
  };
}

/** Les hublots d'une péniche : une rangée de petites fenêtres chaudes */
function shopWindows(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 128, 32);
  for (let x = 6; x < 128; x += 20) {
    g.fillStyle = (x * 7) % 3 === 0 ? "#2a2a30" : "#ffcf7a";
    g.fillRect(x, 10, 10, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** L'église en haut de la butte, face au square : la nef, la rosace qui brille, le clocher et sa flèche */
function addChurch(ctx: VilleContext, s: number, side: number) {
  const { group, t, keep, heightAt, shadows } = ctx;
  const front = pointAt(t, s, side * (t.wall + 3));
  const rot = Math.atan2(front.tx, front.tz);
  const church = new THREE.Group();
  const stone = keep(new THREE.MeshLambertMaterial({ color: 0xcfc6b2 }));
  const slate = keep(new THREE.MeshLambertMaterial({ color: 0x3d434c }));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = shadows;
    church.add(m);
  };
  // Le repère : x le long de la rue, z vers l'arrière (loin de la rue)
  const ground = heightAt(front.x, front.z);
  const nave = { w: 16, d: 34, h: 17 };
  add(new THREE.BoxGeometry(nave.w, nave.h + 6, nave.d), stone, 0, nave.h / 2 - 3, nave.d / 2 + 1);
  // La façade : sa pierre, son portail, ses lancettes (ce qui brille la nuit à part)
  const facade = churchTextures();
  keep(facade.color);
  keep(facade.lit);
  const face = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(nave.w, 20)),
    keep(new THREE.MeshLambertMaterial({ map: facade.color, emissiveMap: facade.lit, emissive: 0xffffff, emissiveIntensity: 1.3 })),
  );
  face.position.set(0, 10, -0.04);
  face.rotation.y = Math.PI;
  church.add(face);
  // Le pignon au-dessus, et sa croix
  const gable = new THREE.Shape();
  gable.moveTo(-nave.w / 2, 0);
  gable.lineTo(nave.w / 2, 0);
  gable.lineTo(0, 7);
  gable.closePath();
  const gableMesh = new THREE.Mesh(keep(new THREE.ExtrudeGeometry(gable, { depth: 1.2, bevelEnabled: false })), stone);
  gableMesh.position.set(0, 20, -0.6);
  church.add(gableMesh);
  add(new THREE.BoxGeometry(0.3, 2.4, 0.3), slate, 0, 28.2, 0);
  add(new THREE.BoxGeometry(1.4, 0.3, 0.3), slate, 0, 28.6, 0);
  // Les contreforts qui avancent sur la façade
  for (const x of [-nave.w / 2 + 0.6, nave.w / 2 - 0.6]) add(new THREE.BoxGeometry(1.2, 22, 2.2), stone, x, 9, 0.4);
  // Le toit à deux pans
  const roof = new THREE.CylinderGeometry(0.01, nave.w * 0.62, nave.d, 4, 1, false, Math.PI / 4);
  roof.rotateX(Math.PI / 2);
  roof.scale(1, 0.55, 1);
  add(roof, slate, 0, nave.h + 3.2, nave.d / 2 + 1);
  // Le clocher, sur le côté de la façade, et sa flèche
  add(new THREE.BoxGeometry(6.5, 30, 6.5), stone, nave.w / 2 + 3.6, 12, 3.8);
  add(new THREE.ConeGeometry(4.8, 14, 4).rotateY(Math.PI / 4), slate, nave.w / 2 + 3.6, 34, 3.8);
  // Les deux escaliers du parvis
  add(new THREE.BoxGeometry(nave.w + 2, 1, 3), stone, 0, 0.2, -0.6);
  // La rosace et le grand portail, éclairés de l'intérieur
  const glass = keep(new THREE.MeshBasicMaterial({ map: keep(roseTexture()), color: new THREE.Color(1.7, 1.5, 1.4) }));
  const rose = new THREE.Mesh(keep(new THREE.CircleGeometry(3.4, 28)), glass);
  rose.position.set(0, 14.7, -0.08);
  rose.rotation.y = Math.PI;
  church.add(rose);
  church.position.set(front.x, ground, front.z);
  // Sa façade (z local négatif) regarde la rue
  church.rotation.y = rot + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
  group.add(church);
}

/** La rosace : des pétales de couleurs vives autour d'un cœur */
function roseTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1b1630";
  g.fillRect(0, 0, 128, 128);
  const colors = ["#3a6bff", "#ff3b4a", "#ffd23a", "#2fd08a", "#b24bff"];
  for (let ring = 3; ring >= 1; ring--) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.fillStyle = colors[(k + ring) % colors.length]!;
      g.beginPath();
      g.arc(64 + Math.cos(a) * ring * 17, 64 + Math.sin(a) * ring * 17, 9, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = "#ffe8a0";
  g.beginPath();
  g.arc(64, 64, 10, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Le square de la place, au milieu de la rue : sa bordure de granit, la pelouse, les arbres, les bancs, et la fontaine
 * à sa pointe, dont l'eau retombe en trois vasques
 */
function addSquare(ctx: VilleContext): (time: number) => void {
  const { group, t, keep, shadows } = ctx;
  const updates: ((time: number) => void)[] = [];
  for (const isl of t.islands) {
    // Le contour de l'îlot, ses bouts en demi-cercles : (le long de l'îlot, de quel côté de son axe, de -1 à 1)
    const ring: [number, number][] = [];
    const a = Math.min(isl.half, isl.len / 2);
    const seg = 14;
    for (let k = 0; k <= seg; k++) ring.push([isl.len - a + Math.sin((k / seg) * Math.PI) * a, Math.cos((k / seg) * Math.PI)]);
    for (let k = 0; k <= seg; k++) ring.push([a - Math.sin((k / seg) * Math.PI) * a, -Math.cos((k / seg) * Math.PI)]);
    const at = (along: number, side: number, r: number, lift: number) => {
      const p = pointAt(t, isl.s + along, isl.d + side * r);
      return new THREE.Vector3(p.x, p.y + lift, p.z);
    };
    // La pelouse, légèrement surélevée, et la bordure tout autour
    const lawnPos: number[] = [];
    const curbPos: number[] = [];
    const center = at(isl.len / 2, 0, 0, 0.32);
    for (let k = 0; k < ring.length; k++) {
      const [ua, sa] = ring[k]!;
      const [ub, sb] = ring[(k + 1) % ring.length]!;
      const pa = at(ua, sa, isl.half - 0.5, 0.32);
      const pb = at(ub, sb, isl.half - 0.5, 0.32);
      lawnPos.push(center.x, center.y, center.z, pb.x, pb.y, pb.z, pa.x, pa.y, pa.z);
      // La bordure : un bandeau debout entre l'herbe et la route
      const qa = at(ua, sa, isl.half, 0.05);
      const qb = at(ub, sb, isl.half, 0.05);
      const ra = at(ua, sa, isl.half, 0.42);
      const rb = at(ub, sb, isl.half, 0.42);
      curbPos.push(qa.x, qa.y, qa.z, qb.x, qb.y, qb.z, rb.x, rb.y, rb.z, qa.x, qa.y, qa.z, rb.x, rb.y, rb.z, ra.x, ra.y, ra.z);
    }
    const lawn = keep(new THREE.BufferGeometry());
    lawn.setAttribute("position", new THREE.Float32BufferAttribute(lawnPos, 3));
    lawn.computeVertexNormals();
    // Tout le square est un îlot : la conduite le connaît
    group.add(onTrack(new THREE.Mesh(lawn, keep(new THREE.MeshLambertMaterial({ color: 0x2f4a2a, side: THREE.DoubleSide }))), "solid"));
    const curb = keep(new THREE.BufferGeometry());
    curb.setAttribute("position", new THREE.Float32BufferAttribute(curbPos, 3));
    curb.computeVertexNormals();
    group.add(onTrack(new THREE.Mesh(curb, keep(new THREE.MeshLambertMaterial({ color: 0x8c9096, side: THREE.DoubleSide }))), "solid"));
    // Les arbres du square : un tronc, une couronne claire (des platanes)
    const trunk = keep(new THREE.CylinderGeometry(0.22, 0.32, 5, 7).translate(0, 2.5, 0));
    const crown = keep(new THREE.IcosahedronGeometry(2.8, 1).translate(0, 6.6, 0));
    const trees: THREE.Matrix4[] = [];
    for (let along = 14; along < isl.len - 6; along += 10) {
      const p = at(along, 0, 0, 0.3);
      trees.push(place(p.x, p.y, p.z, along, 1, 0.9 + (along % 3) * 0.08, 1));
    }
    group.add(onTrack(instances(trunk, keep(new THREE.MeshLambertMaterial({ color: 0x5a4a3a })), trees, shadows), "solid"));
    group.add(
      onTrack(instances(crown, keep(new THREE.MeshLambertMaterial({ color: 0x35532c, flatShading: true })), trees, shadows), "solid"),
    );
    // La fontaine, à la pointe du square, côté de ceux qui arrivent
    const f = at(Math.min(isl.half, isl.len / 2) + 0.3, 0, 0, 0);
    const fountain = new THREE.Group();
    const stone = keep(new THREE.MeshLambertMaterial({ color: 0xc8c0b0 }));
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
      const m = new THREE.Mesh(keep(geo), mat);
      m.position.y = y;
      fountain.add(m);
      return m;
    };
    add(new THREE.CylinderGeometry(isl.half - 0.2, isl.half, 0.8, 24), stone, 0.4);
    add(new THREE.CylinderGeometry(0.35, 0.5, 3.2, 10), stone, 1.9);
    add(new THREE.CylinderGeometry(1.4, 0.4, 0.5, 18), stone, 2.4);
    add(new THREE.CylinderGeometry(0.8, 0.25, 0.4, 16), stone, 3.6);
    const waterMat = keep(
      new THREE.MeshLambertMaterial({ color: 0x9fc4e8, emissive: 0x2a4a6a, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    add(new THREE.CircleGeometry(isl.half - 0.4, 24).rotateX(-Math.PI / 2), waterMat, 0.72);
    // L'eau qui retombe de chaque vasque : de petits rideaux qui ondulent
    const falls = [
      add(new THREE.CylinderGeometry(1.35, 1.6, 1.8, 18, 1, true), waterMat, 1.55),
      add(new THREE.CylinderGeometry(0.75, 1.0, 1.1, 14, 1, true), waterMat, 3.05),
    ];
    const jet = add(new THREE.CylinderGeometry(0.06, 0.12, 1.4, 8), waterMat, 4.4);
    fountain.position.copy(f);
    group.add(onTrack(fountain, "solid"));
    updates.push((time) => {
      falls.forEach((m, i) => m.scale.set(1 + Math.sin(time * 5 + i) * 0.03, 1, 1 + Math.cos(time * 4.3 + i) * 0.03));
      jet.scale.y = 1 + Math.sin(time * 7) * 0.12;
    });
  }
  return (time) => {
    for (const u of updates) u(time);
  };
}

/** La pluie : des traits qui tombent en biais autour de la caméra, plus fins sur téléphone */
function addRain(ctx: VilleContext): (time: number, camera: THREE.Vector3, daylight: number) => void {
  const { group, keep } = ctx;
  const n = ctx.phone ? 520 : 1300;
  const box = { x: 56, y: 26, z: 56 };
  const pos = new Float32Array(n * 6);
  const speed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * box.x;
    const y = Math.random() * box.y;
    const z = (Math.random() - 0.5) * box.z;
    pos.set([x, y, z, x, y + 0.9, z], i * 6);
    speed[i] = 13 + Math.random() * 6;
  }
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = keep(new THREE.LineBasicMaterial({ color: 0xaab8cc, transparent: true, opacity: 0.38, depthWrite: false }));
  const rain = new THREE.LineSegments(geo, mat);
  rain.frustumCulled = false;
  group.add(rain);
  let last = 0;
  // Le vent pousse la pluie un peu de côté
  const wx = 2.2;
  const wz = 1.2;
  return (time, camera, daylight) => {
    const dt = Math.min(0.05, Math.max(0, time - last));
    last = time;
    // Sous la halle, il ne pleut pas
    mat.opacity = 0.38 * Math.max(0, Math.min(1, (daylight - 0.45) / 0.5));
    rain.visible = mat.opacity > 0.02;
    const arr = geo.attributes.position!.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const v = speed[i]! * dt;
      let x = arr[i * 6]! + wx * dt;
      let y = arr[i * 6 + 1]! - v;
      let z = arr[i * 6 + 2]! + wz * dt;
      const rx = x - camera.x;
      const rz = z - camera.z;
      if (rx > box.x / 2) x -= box.x;
      else if (rx < -box.x / 2) x += box.x;
      if (rz > box.z / 2) z -= box.z;
      else if (rz < -box.z / 2) z += box.z;
      if (y < camera.y - 10) y += box.y;
      else if (y > camera.y + box.y) y -= box.y;
      arr[i * 6] = x;
      arr[i * 6 + 1] = y;
      arr[i * 6 + 2] = z;
      // Le trait suit la direction de sa chute
      arr[i * 6 + 3] = x - wx * 0.06;
      arr[i * 6 + 4] = y + 0.9;
      arr[i * 6 + 5] = z - wz * 0.06;
    }
    geo.attributes.position!.needsUpdate = true;
  };
}

/** La ville tout autour, jusqu'à l'horizon : des silhouettes d'immeubles, quelques fenêtres allumées, des clochers */
export function addSkyline(group: THREE.Group, keep: Keep, cx: number, cz: number, inner: number, phone: boolean) {
  const facade = facadeTextures();
  keep(facade.color);
  keep(facade.lit);
  const blocks = new Faces();
  const r = (() => {
    let s = 977;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  })();
  const dark = new THREE.Color(0.32, 0.31, 0.33);
  const count = phone ? 140 : 260;
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const dist = inner + 60 + r() * 560;
    const x = cx + Math.cos(a) * dist;
    const z = cz + Math.sin(a) * dist;
    const w = 18 + r() * 26;
    const d = 18 + r() * 26;
    const h = 14 + r() * 26 + (r() < 0.06 ? 30 : 0);
    const rot = r() * Math.PI;
    const ca = Math.cos(rot);
    const sa = Math.sin(rot);
    const corner = (u: number, v: number, y: number) => new THREE.Vector3(x + ca * u - sa * v, y, z + sa * u + ca * v);
    const quadSide = (u1: number, v1: number, u2: number, v2: number) => {
      const len = Math.hypot(u2 - u1, v2 - v1);
      const out = new THREE.Vector3((u1 + u2) / 2, 0, (v1 + v2) / 2);
      out.set(ca * out.x - sa * out.z, 0, sa * out.x + ca * out.z);
      const u0 = r();
      blocks.quad(
        corner(u1, v1, -2),
        corner(u2, v2, -2),
        corner(u2, v2, h),
        corner(u1, v1, h),
        [
          u0,
          0,
          u0 + len / (BAY * FACADE_COLS),
          0,
          u0 + len / (BAY * FACADE_COLS),
          h / (FLOOR * FACADE_ROWS),
          u0,
          h / (FLOOR * FACADE_ROWS),
        ],
        dark,
        out,
      );
    };
    quadSide(-w / 2, -d / 2, w / 2, -d / 2);
    quadSide(w / 2, -d / 2, w / 2, d / 2);
    quadSide(w / 2, d / 2, -w / 2, d / 2);
    quadSide(-w / 2, d / 2, -w / 2, -d / 2);
  }
  const mesh = new THREE.Mesh(
    blocks.geometry(keep),
    keep(
      new THREE.MeshLambertMaterial({
        map: facade.color,
        emissiveMap: facade.lit,
        emissive: 0xffffff,
        emissiveIntensity: 0.9,
        vertexColors: true,
      }),
    ),
  );
  group.add(mesh);
}

/** La halle du marché : des colonnes de fonte, une verrière à deux pans, des lampes rondes, des étals */
export function addHalle(ctx: VilleContext, s1: number, s2: number) {
  const { group, t, keep, shadows } = ctx;
  const w = t.wall + 0.6;
  const iron = keep(new THREE.MeshLambertMaterial({ color: 0x24302c }));
  const columns: THREE.Matrix4[] = [];
  const lamps: THREE.Matrix4[] = [];
  const stalls: THREE.Matrix4[] = [];
  for (let s = s1; s <= s2 + 0.1; s += 6) {
    for (const side of [-1, 1]) {
      const p = pointAt(t, s, side * w);
      columns.push(place(p.x, p.y, p.z));
      // Les étals, entre les colonnes, contre les murs
      const q = pointAt(t, s + 3, side * (w + 2));
      if (s + 3 < s2) stalls.push(place(q.x, q.y, q.z, Math.atan2(q.tx, q.tz)));
    }
    const c = pointAt(t, s + 3, 0);
    if (s + 3 < s2) lamps.push(place(c.x, c.y + 7.4, c.z));
  }
  group.add(instances(keep(new THREE.CylinderGeometry(0.22, 0.28, 8.5, 8).translate(0, 4.25, 0)), iron, columns, shadows));
  group.add(
    instances(
      keep(new THREE.SphereGeometry(0.5, 12, 10)),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 1.0) })),
      lamps,
      false,
    ),
  );
  const stall = keep(new THREE.BoxGeometry(5, 1, 1.6).translate(0, 0.5, 0));
  group.add(instances(stall, keep(new THREE.MeshLambertMaterial({ color: 0x7a5636 })), stalls, false));
  // La verrière : deux pans de verre de chaque côté du faîte, posés sur des fermes de fer
  const glass = keep(glassRoofTexture());
  const pos: number[] = [];
  const uv: number[] = [];
  const rows = Math.max(2, Math.round((s2 - s1) / 2));
  for (let k = 0; k <= rows; k++) {
    const s = s1 + ((s2 - s1) * k) / rows;
    for (const [d, y] of [
      [-w - 0.6, 8.4],
      [0, 12.2],
      [w + 0.6, 8.4],
    ] as const) {
      const p = pointAt(t, s, d);
      pos.push(p.x, p.y + y, p.z);
      uv.push(d / 6, (s - s1) / 6);
    }
  }
  const index: number[] = [];
  for (let k = 0; k < rows; k++) {
    const a = k * 3;
    index.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const roofGeo = keep(new THREE.BufferGeometry());
  roofGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  roofGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  roofGeo.setIndex(index);
  roofGeo.computeVertexNormals();
  group.add(
    new THREE.Mesh(
      roofGeo,
      keep(new THREE.MeshLambertMaterial({ map: glass, transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: 0x1a2230 })),
    ),
  );
  // Les fermes de fer qui portent la verrière, toutes les deux travées
  const truss = keep(new THREE.BoxGeometry(0.25, 0.25, 1));
  const beams: THREE.Matrix4[] = [];
  for (let s = s1; s <= s2 + 0.1; s += 12) {
    for (const side of [-1, 1]) {
      const a = pointAt(t, s, side * (w + 0.6));
      const b = pointAt(t, s, 0);
      const ya = a.y + 8.4;
      const yb = b.y + 12.2;
      const len = Math.hypot(b.x - a.x, yb - ya, b.z - a.z);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(a.x, ya, a.z), new THREE.Vector3(b.x, yb, b.z), new THREE.Vector3(0, 1, 0));
      m.multiply(new THREE.Matrix4().makeScale(1, 1, len));
      m.setPosition((a.x + b.x) / 2, (ya + yb) / 2, (a.z + b.z) / 2);
      beams.push(m);
    }
  }
  group.add(instances(truss, iron, beams, false));
}

/** La passerelle de fer au-dessus de la rue, ses lampadaires, et des passants sous leurs parapluies */
export function addFootbridge(ctx: VilleContext, s: number) {
  const { group, t, keep, heightAt, shadows } = ctx;
  const p = pointAt(t, s, 0);
  const span = 2 * (t.wall + 3);
  const bridge = new THREE.Group();
  const iron = keep(new THREE.MeshLambertMaterial({ color: 0x2a3a34 }));
  const deck = new THREE.Mesh(keep(new THREE.BoxGeometry(span, 0.6, 3.6)), iron);
  deck.position.y = 7.6;
  deck.castShadow = shadows;
  bridge.add(deck);
  // Un arc de fer sous le tablier, et le garde-corps en croisillons
  const arch = new THREE.Mesh(keep(new THREE.TorusGeometry(span / 2, 0.22, 6, 30, Math.PI)), iron);
  arch.scale.set(1, 0.18, 1);
  arch.position.y = 6.2;
  bridge.add(arch);
  for (const z of [-1.7, 1.7]) {
    const rail = new THREE.Mesh(keep(new THREE.BoxGeometry(span, 0.1, 0.1)), iron);
    rail.position.set(0, 8.8, z);
    bridge.add(rail);
    for (let x = -span / 2; x <= span / 2; x += 1.2) {
      const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 1.2, 0.06)), iron);
      bar.position.set(x, 8.25, z);
      bar.rotation.z = (Math.round(x / 1.2) % 2 ? 1 : -1) * 0.5;
      bridge.add(bar);
    }
  }
  // Les escaliers qui descendent de chaque côté, derrière les immeubles
  for (const side of [-1, 1]) {
    const x = side * (span / 2 + 1.5);
    const ground = heightAt(p.x - p.tz * x, p.z + p.tx * x) - p.y;
    const h = 7.6 - ground;
    const pile = new THREE.Mesh(keep(new THREE.BoxGeometry(3, h, 3.6)), keep(new THREE.MeshLambertMaterial({ color: 0x6f675c })));
    pile.position.set(x, ground + h / 2, 0);
    bridge.add(pile);
  }
  bridge.position.set(p.x, p.y, p.z);
  bridge.rotation.y = Math.atan2(p.tx, p.tz);
  group.add(bridge);
  // Des passants qui s'arrêtent pour regarder, chacun sous son parapluie
  const body = keep(new THREE.CapsuleGeometry(0.26, 0.6, 4, 8).translate(0, 0.6, 0));
  const umbrella = keep(new THREE.ConeGeometry(0.75, 0.35, 8).translate(0, 1.9, 0));
  const people: THREE.Matrix4[] = [];
  const colors = [0x1f2f4a, 0x5a1f2a, 0x2a2a2a, 0x3a4a2a, 0x6a4a1a];
  const c = Math.cos(bridge.rotation.y);
  const sn = Math.sin(bridge.rotation.y);
  for (let k = 0; k < 7; k++) {
    const x = -span / 2 + 3 + (k * (span - 6)) / 6;
    const z = k % 2 ? -1.1 : 1.1;
    people.push(place(p.x + x * c + z * sn, p.y + 7.9, p.z - x * sn + z * c, bridge.rotation.y + (z > 0 ? Math.PI : 0)));
  }
  group.add(instances(body, keep(new THREE.MeshLambertMaterial({ color: 0x2a2f3a })), people, false));
  const umbrellas = instances(umbrella, keep(new THREE.MeshLambertMaterial({ color: 0xffffff })), people, false);
  people.forEach((_, i) => umbrellas.setColorAt(i, new THREE.Color(colors[i % colors.length]!)));
  if (umbrellas.instanceColor) umbrellas.instanceColor.needsUpdate = true;
  group.add(umbrellas);
}

/** Le pont-levant : de chaque côté de la rampe, une tour de fer, son contrepoids, la chaîne qui tient le tablier */
function addDrawbridge(ctx: VilleContext) {
  const { group, t, keep, shadows } = ctx;
  const iron = keep(new THREE.MeshLambertMaterial({ color: 0x2b3f3a }));
  const weight = keep(new THREE.MeshLambertMaterial({ color: 0x3a3d42 }));
  for (const g of t.gaps) {
    if (g.glide) continue;
    for (const [s, h] of [
      [g.from, 13],
      [g.to, 9],
    ] as const) {
      const p = pointAt(t, s, 0);
      const frame = new THREE.Group();
      // Les tours derrière les parapets : on ne roule pas au travers
      const span = t.wall + 0.8;
      for (const x of [-span, span]) {
        const leg = new THREE.Mesh(keep(new THREE.BoxGeometry(1.1, h, 1.1)), iron);
        leg.position.set(x, h / 2, 0);
        leg.castShadow = shadows;
        frame.add(leg);
        // Le croisillon de la tour
        for (let y = 2; y < h - 1; y += 3) {
          const brace = new THREE.Mesh(keep(new THREE.BoxGeometry(0.12, 3.4, 0.12)), iron);
          brace.position.set(x, y + 1.5, 0.6);
          brace.rotation.z = 0.5;
          frame.add(brace);
        }
        // Le contrepoids, suspendu
        const block = new THREE.Mesh(keep(new THREE.BoxGeometry(1.8, 2.2, 1.6)), weight);
        block.position.set(x + Math.sign(x) * 1.6, h - 3.2, 0);
        frame.add(block);
      }
      const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(span * 2 + 1.1, 1, 1.1)), iron);
      beam.position.y = h;
      frame.add(beam);
      // Les chaînes, du haut de la tour jusqu'au bord du tablier
      if (s === g.from) {
        for (const x of [-span + 0.5, span - 0.5]) {
          const chain = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.06, h - 1.4, 5)), weight);
          chain.position.set(x, (h + 1.4) / 2, 0);
          frame.add(chain);
        }
      }
      frame.position.set(p.x, p.y, p.z);
      // Son x local en travers de la route
      frame.rotation.y = Math.atan2(p.tx, p.tz);
      group.add(frame);
    }
  }
}

/** Toute la ville */
export function buildVille(ctx: VilleContext): Ville {
  const { t } = ctx;
  const ways = waterways(t);
  // Ce qui doit rester libre au bord de la rue : la rue d'en face par où arrive la balayeuse, les ruelles d'où roulent
  // les poubelles, le canal, la halle, la passerelle, l'église face au square
  const church = t.islands[0] ? t.islands[0].s + t.islands[0].len / 2 : -1;
  const keepClear = (s: number, side: number): boolean => {
    const near = (x: number, gap: number) => {
      const d = Math.abs(((((s - x) % t.length) + t.length * 1.5) % t.length) - t.length / 2);
      return d < gap;
    };
    if (t.crossers.some((c) => near(c.s, 8))) return true;
    if (t.movers.some((m) => near(m.s, 6))) return true;
    if (t.gaps.some((g) => near((g.from + g.to) / 2, (g.to - g.from) / 2 + 5))) return true;
    if (ctx.tunnel[0] >= 0 && near((ctx.tunnel[0] + ctx.tunnel[1]) / 2, (ctx.tunnel[1] - ctx.tunnel[0]) / 2 + 1)) return true;
    if (near(ctx.bridge, 5)) return true;
    if (church >= 0 && side < 0 && near(church, 24)) return true;
    // Les poteaux des arches et des panneaux, plantés juste derrière le parapet
    const posts = [
      0,
      ...t.gaps.flatMap((g) => [g.from - 32, g.from - 44]),
      ...t.movers.map((m) => m.s - (m.kind === "drop" ? 44 : 40)),
      ...t.crossers.map((c) => c.s - 40),
    ];
    if (posts.some((x) => near(x, 3))) return true;
    return false;
  };
  const lots = [...streetLots(ctx, ways, keepClear), ...blockLots(ctx, ways, ctx.phone ? 50 : 90)];
  addBuildings(ctx, lots);
  addLamps(ctx, (s, side) => keepClear(s, side) || t.islands.some((i) => Math.abs(s - i.s - i.len / 2) < i.len / 2 + 4 && side < 0));
  const water = addWater(ctx, ways);
  if (church >= 0) addChurch(ctx, church, -1);
  const square = addSquare(ctx);
  addDrawbridge(ctx);
  const rain = addRain(ctx);
  // Les éclairs : de temps en temps, une lueur, un trou, une seconde plus forte qui s'éteint
  let nextBolt = 9 + Math.random() * 12;
  let boltAt = -10;
  let clock = 0;
  const ville: Ville = {
    onFlash: null,
    update(time, camera, daylight) {
      clock = time;
      water(time);
      square(time);
      rain(time, camera, daylight);
      if (time > nextBolt) {
        boltAt = time;
        nextBolt = time + 14 + Math.random() * 20;
        ville.onFlash?.();
      }
    },
    flash() {
      const a = clock - boltAt;
      if (a < 0 || a > 0.7) return 0;
      if (a < 0.08) return a / 0.08;
      if (a < 0.16) return 0.25;
      if (a < 0.24) return 1;
      return Math.max(0, 1 - (a - 0.24) / 0.46);
    },
  };
  return ville;
}
