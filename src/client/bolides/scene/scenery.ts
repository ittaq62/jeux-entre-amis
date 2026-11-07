// Le décor qui fait vivre chaque circuit : un tunnel (on y entre, la lumière baisse, les lampes défilent), un pont
// au-dessus de la route avec du monde dessus, des spectateurs qui sautent au bord des virages, et selon le lieu des
// mouettes et le faisceau du phare au port, des moulins aux vignes, un téléphérique et la neige qui tombe au col.

import * as THREE from "three";
import { pointAt, trackBends, wrapS, type Theme, type Track } from "../../../shared/games/bolides/track.ts";
import { mergeDeep } from "./merge.ts";
import * as TX from "./textures.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

export interface SceneryContext {
  group: THREE.Group;
  t: Track;
  keep: Keep;
  heightAt: (x: number, z: number) => number;
  shadows: boolean;
  phone: boolean;
  free: (x: number, z: number, min: number) => boolean;
}

export interface Scenery {
  /** Les tunnels : de quelle distance à quelle distance du tour */
  tunnels: [number, number][];
  /** `daylight` : 1 dehors, moins dans un tunnel (la neige n'y tombe pas) */
  update: (time: number, camera: THREE.Vector3, daylight: number) => void;
}

/** Où sont le tunnel et le pont, pour chaque circuit (en mètres depuis la ligne) */
export const PLACES: Record<Theme, { tunnel: [number, number]; bridge: number }> = {
  port: { tunnel: [455, 530], bridge: 110 },
  vignes: { tunnel: [586, 648], bridge: 110 },
  col: { tunnel: [912, 1008], bridge: 98 },
};

const lambert = (color: THREE.ColorRepresentation, map?: THREE.Texture) => new THREE.MeshLambertMaterial({ color, map: map ?? null });

/** Un point au bord du tunnel : à l'écart d de la route, à la hauteur y au-dessus d'elle */
function at(t: Track, s: number, d: number, y: number): THREE.Vector3 {
  const p = pointAt(t, s, d);
  return new THREE.Vector3(p.x, p.y + y, p.z);
}

/** Une voûte qui suit la route : son profil (une demi-ellipse) répété le long du tracé */
function vault(t: Track, s1: number, s2: number, w: number, h: number, segs: number, uScale: number): THREE.BufferGeometry {
  const rows = Math.max(2, Math.round((s2 - s1) / 2));
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const s = s1 + ((s2 - s1) * r) / rows;
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI;
      const v = at(t, s, w * Math.cos(a), h * Math.sin(a) - 0.3);
      pos.push(v.x, v.y, v.z);
      uv.push((k / segs) * uScale, (s - s1) / 8);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < segs; k++) {
      const a = r * (segs + 1) + k;
      const b = a + segs + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** L'entrée d'un tunnel : un anneau épais entre la voûte et une voûte plus grande, à l'endroit s */
function portal(t: Track, s: number, w: number, h: number, thick: number, segs: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const index: number[] = [];
  for (let k = 0; k <= segs; k++) {
    const a = (k / segs) * Math.PI;
    const inner = at(t, s, w * Math.cos(a), h * Math.sin(a) - 0.3);
    const outer = at(t, s, (w + thick) * Math.cos(a), (h + thick) * Math.sin(a) - 0.3);
    pos.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
  }
  for (let k = 0; k < segs; k++) {
    const a = k * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function addTunnel(ctx: SceneryContext, theme: Theme, s1: number, s2: number) {
  const { group, t, keep } = ctx;
  const w = t.wall + 0.8;
  const h = theme === "port" ? 8.5 : 7.5;
  const tex = keep(TX.tunnelTexture(theme));
  tex.repeat.set(1, 1);
  const inner = new THREE.Mesh(
    keep(vault(t, s1, s2, w, h, 18, 6)),
    keep(new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })),
  );
  inner.receiveShadow = ctx.shadows;
  group.add(inner);
  // Le dessus, vu de loin : une voûte plus large (de la roche, des pierres, un hangar), et les deux entrées
  const thick = theme === "port" ? 1.2 : 3;
  const outerMat = keep(
    theme === "port"
      ? lambert(0x7b8a96)
      : theme === "vignes"
        ? new THREE.MeshLambertMaterial({ map: tex, color: 0xd8c7a8 })
        : new THREE.MeshLambertMaterial({ map: tex, color: 0xb9b4ae }),
  );
  const outer = new THREE.Mesh(keep(vault(t, s1, s2, w + thick, h + thick, 18, 8)), outerMat);
  outer.castShadow = ctx.shadows;
  group.add(outer);
  const frameMat = keep(theme === "port" ? lambert(0xe0b52c) : lambert(theme === "vignes" ? 0xcdb88f : 0x8a847d));
  for (const s of [s1, s2]) group.add(new THREE.Mesh(keep(portal(t, s, w - 0.05, h - 0.05, thick + 0.3, 18)), frameMat));
  // Au port, un toit de hangar en dents de scie et une enseigne ; au col, de la neige sur la roche
  if (theme === "col") {
    const snow = new THREE.Mesh(keep(vault(t, s1 + 2, s2 - 2, w + thick + 0.3, h + thick + 0.4, 18, 4)), keep(lambert(0xf4f7fa)));
    snow.scale.set(1, 1, 1);
    group.add(snow);
  }
  // Les lampes au plafond, tous les 9 m : elles brillent même quand la lumière baisse
  const lamp = keep(new THREE.BoxGeometry(1.6, 0.14, 0.5));
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
  const spots: THREE.Matrix4[] = [];
  for (let s = s1 + 4; s < s2; s += 9) {
    for (const d of [-w * 0.42, w * 0.42]) {
      const a = Math.acos(d / w);
      const p = at(t, s, d * 0.97, h * Math.sin(a) * 0.97 - 0.3);
      const q = pointAt(t, s, 0);
      spots.push(
        new THREE.Matrix4().compose(
          p,
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(q.tx, q.tz) + Math.PI / 2),
          new THREE.Vector3(1, 1, 1),
        ),
      );
    }
  }
  const lamps = new THREE.InstancedMesh(lamp, lampMat, spots.length);
  spots.forEach((m, i) => lamps.setMatrixAt(i, m));
  group.add(lamps);
}

/** Les spectateurs : un corps et une tête, en deux formes répétées, chacun à sa couleur ; ils sautillent */
class Crowd {
  readonly bodies: THREE.InstancedMesh;
  readonly heads: THREE.InstancedMesh;
  private people: { x: number; y: number; z: number; rot: number; phase: number; hop: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);

  constructor(keep: Keep, max: number) {
    const body = keep(new THREE.CapsuleGeometry(0.28, 0.6, 4, 8));
    body.translate(0, 0.58, 0);
    const head = keep(new THREE.SphereGeometry(0.24, 10, 8));
    head.translate(0, 1.32, 0);
    this.bodies = new THREE.InstancedMesh(body, keep(new THREE.MeshLambertMaterial()), max);
    this.heads = new THREE.InstancedMesh(head, keep(new THREE.MeshLambertMaterial()), max);
    this.bodies.count = 0;
    this.heads.count = 0;
    this.bodies.frustumCulled = false;
    this.heads.frustumCulled = false;
  }

  add(x: number, y: number, z: number, rot: number, seed: number) {
    const i = this.people.length;
    if (i >= this.bodies.instanceMatrix.count) return;
    const shirts = [0xd8352a, 0x2f80ed, 0x27ae60, 0xf2c94c, 0x9b51e0, 0xf2994a, 0xffffff, 0x2fc4c4, 0xeb5ea8];
    const skins = [0xffdbb4, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
    this.bodies.setColorAt(i, new THREE.Color(shirts[seed % shirts.length]!));
    this.heads.setColorAt(i, new THREE.Color(skins[(seed * 7) % skins.length]!));
    this.people.push({ x, y, z, rot, phase: (seed * 1.37) % 6.28, hop: 0.12 + ((seed * 13) % 10) / 40 });
    this.bodies.count = this.heads.count = this.people.length;
  }

  update(time: number) {
    this.people.forEach((p, i) => {
      const y = p.y + Math.max(0, Math.sin(time * 6 + p.phase)) * p.hop;
      this.q.setFromAxisAngle(this.up, p.rot + Math.sin(time * 1.3 + p.phase) * 0.3);
      this.m.compose(this.v.set(p.x, y, p.z), this.q, this.one);
      this.bodies.setMatrixAt(i, this.m);
      this.heads.setMatrixAt(i, this.m);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  /** Les couleurs posées : à envoyer une fois */
  done() {
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
  }
}

function addBridge(ctx: SceneryContext, theme: Theme, s: number, crowd: Crowd) {
  const { group, t, keep, heightAt } = ctx;
  const p = pointAt(t, s, 0);
  const span = 2 * (t.wall + 3.5);
  const deckY = p.y + 7.2;
  const bridge = new THREE.Group();
  const mat =
    theme === "port"
      ? keep(lambert(0x3d6ea8))
      : theme === "vignes"
        ? keep(lambert(0xd9c7a2, keep(TX.tunnelTexture("vignes"))))
        : keep(lambert(0x7a5230));
  const dark = keep(lambert(theme === "port" ? 0x2b3138 : theme === "vignes" ? 0xb39f7a : 0x5b3c22));
  // Le tablier en travers de la route (son x local suit la droite de la route), ses garde-corps, ses deux piles
  const deck = new THREE.Mesh(keep(new THREE.BoxGeometry(span, 0.7, 4)), mat);
  deck.position.y = 7.2;
  bridge.add(deck);
  for (const z of [-1.85, 1.85]) {
    const rail = new THREE.Mesh(keep(new THREE.BoxGeometry(span, 0.9, 0.12)), dark);
    rail.position.set(0, 8.0, z);
    bridge.add(rail);
  }
  for (const x of [-(t.wall + 2), t.wall + 2]) {
    const ground = heightAt(p.x - p.tz * x, p.z + p.tx * x);
    const h = deckY - ground;
    const pile = new THREE.Mesh(keep(new THREE.BoxGeometry(2.2, h, 3.4)), theme === "vignes" ? mat : dark);
    pile.position.set(x, 7.2 - h / 2, 0);
    pile.castShadow = ctx.shadows;
    bridge.add(pile);
  }
  if (theme === "vignes") {
    // Une arche de pierre sous le tablier
    const arch = new THREE.Mesh(keep(new THREE.TorusGeometry(t.wall + 1, 0.8, 6, 24, Math.PI)), mat);
    arch.position.y = 6.4 - (t.wall + 1) * 0.35;
    arch.scale.set(1, 0.35, 1);
    bridge.add(arch);
  }
  mergeDeep(bridge, keep);
  bridge.position.set(p.x, p.y, p.z);
  // Son x local en travers de la route (le long de sa droite, ou de sa gauche : le pont est symétrique)
  bridge.rotation.y = Math.atan2(p.tx, p.tz);
  group.add(bridge);
  // Du monde sur le pont, accoudé au garde-corps, qui regarde passer les karts
  for (let k = 0; k < 9; k++) {
    const x = -span / 2 + 2 + (k * (span - 4)) / 8;
    const z = k % 2 === 0 ? -1.3 : 1.3;
    const c = Math.cos(bridge.rotation.y);
    const sn = Math.sin(bridge.rotation.y);
    crowd.add(p.x + x * c + z * sn, deckY + 0.35, p.z - x * sn + z * c, bridge.rotation.y + (z > 0 ? Math.PI : 0), k * 5 + 3);
  }
}

/** Des spectateurs derrière le muret, à l'extérieur des plus grands virages */
function addFans(ctx: SceneryContext, crowd: Crowd) {
  const { t, heightAt } = ctx;
  const step = t.length / t.n;
  const bends = trackBends(t)
    .map((b) => ({ ...b, len: ((b.to - b.from + t.n) % t.n) * step }))
    .sort((a, b) => b.turn - a.turn)
    .slice(0, 3);
  let seed = 11;
  for (const b of bends) {
    const mid = b.from * step + b.len / 2;
    for (let k = 0; k < 9; k++) {
      const s = wrapS(t, mid + (k - 4) * 2.6);
      const d = -b.side * (t.wall + 2.2 + (k % 2) * 1.3);
      const p = pointAt(t, s, d);
      if (!ctx.free(p.x, p.z, t.wall + 1)) continue;
      const c = pointAt(t, s, 0);
      crowd.add(p.x, heightAt(p.x, p.z), p.z, Math.atan2(c.x - p.x, c.z - p.z), seed++);
    }
  }
}

/** Au port : des mouettes qui tournent au-dessus du quai */
function seagulls(ctx: SceneryContext): (time: number) => void {
  const { group, keep, t } = ctx;
  const n = ctx.phone ? 5 : 9;
  const body = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.3, 8, 6)), keep(lambert(0xf6f6f2)), n);
  const wingGeo = keep(new THREE.BoxGeometry(1.1, 0.05, 0.4));
  wingGeo.translate(0.55, 0, 0);
  const wingMat = keep(lambert(0xdedfe2));
  const left = new THREE.InstancedMesh(wingGeo, wingMat, n);
  const right = new THREE.InstancedMesh(wingGeo, wingMat, n);
  for (const m of [body, left, right]) {
    m.frustumCulled = false;
    group.add(m);
  }
  const quay = -t.wall - 9;
  const birds = Array.from({ length: n }, (_, i) => ({
    cx: -120 + i * 34,
    cz: quay - 20 - (i % 3) * 12,
    r: 12 + (i % 4) * 5,
    y: 16 + (i % 5) * 4,
    w: 0.35 + (i % 3) * 0.1,
    phase: i * 1.7,
  }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const body3 = new THREE.Vector3(1, 0.6, 1.8);
  return (time) => {
    birds.forEach((b, i) => {
      const a = time * b.w + b.phase;
      const x = b.cx + Math.cos(a) * b.r;
      const z = b.cz + Math.sin(a) * b.r;
      const y = b.y + Math.sin(time * 0.7 + b.phase) * 1.5;
      const heading = Math.atan2(-Math.sin(a), Math.cos(a));
      q.setFromEuler(e.set(0, heading, 0));
      body.setMatrixAt(i, m.compose(v.set(x, y, z), q, body3));
      const flap = Math.sin(time * 8 + b.phase) * 0.5;
      q.setFromEuler(e.set(0, heading, flap, "YXZ"));
      left.setMatrixAt(i, m.compose(v.set(x, y, z), q, one));
      q.setFromEuler(e.set(0, heading + Math.PI, flap, "YXZ"));
      right.setMatrixAt(i, m.compose(v.set(x, y, z), q, one));
    });
    for (const k of [body, left, right]) k.instanceMatrix.needsUpdate = true;
  };
}

/** Le faisceau du phare, qui balaie la mer */
function lighthouseBeam(ctx: SceneryContext): (time: number) => void {
  const { group, keep, t } = ctx;
  const quay = -t.wall - 9;
  const beam = new THREE.Mesh(
    keep(new THREE.ConeGeometry(5, 60, 16, 1, true)),
    keep(
      new THREE.MeshBasicMaterial({
        color: 0xfff1b8,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  beam.geometry.translate(0, -30, 0);
  beam.geometry.rotateZ(Math.PI / 2);
  const holder = new THREE.Group();
  holder.position.set(170, 22.5, quay - 40);
  holder.add(beam);
  const lamp = new THREE.Mesh(keep(new THREE.SphereGeometry(1.4, 12, 10)), keep(new THREE.MeshBasicMaterial({ color: 0xfff4c8 })));
  holder.add(lamp);
  const cap = new THREE.Mesh(keep(new THREE.ConeGeometry(2.4, 2.4, 12)), keep(lambert(0xd8352a)));
  cap.position.y = 2.2;
  holder.add(cap);
  group.add(holder);
  return (time) => {
    holder.rotation.y = time * 0.9;
  };
}

/** Des moulins, leurs quatre ailes qui tournent au vent */
function windmills(ctx: SceneryContext): (time: number) => void {
  const { group, keep, heightAt, t } = ctx;
  const sails: THREE.Group[] = [];
  const stone = keep(lambert(0xeee4cf));
  const roof = keep(lambert(0x7a4b2c));
  const cloth = keep(lambert(0xfaf6ee, keep(TX.stripesTexture(["#faf6ee", "#d8352a"]))));
  const wood = keep(lambert(0x6b4a2e));
  // Deux emplacements libres, assez loin de la route, sur le bord du circuit qu'on voit en arrivant
  const spots: [number, number][] = [];
  for (let s = 0; s < t.length && spots.length < 2; s += 37) {
    for (const side of [-1, 1]) {
      const p = pointAt(t, s, side * (t.wall + 45));
      if (ctx.free(p.x, p.z, t.wall + 30) && spots.every(([x, z]) => Math.hypot(x - p.x, z - p.z) > 200)) {
        spots.push([p.x, p.z]);
        break;
      }
    }
  }
  for (const [x, z] of spots) {
    const y = heightAt(x, z);
    const mill = new THREE.Group();
    const tower = new THREE.Mesh(keep(new THREE.CylinderGeometry(2.6, 3.6, 12, 14)), stone);
    tower.position.y = 6;
    tower.castShadow = ctx.shadows;
    mill.add(tower);
    const cap = new THREE.Mesh(keep(new THREE.ConeGeometry(3.2, 3.4, 14)), roof);
    cap.position.y = 13.6;
    mill.add(cap);
    const door = new THREE.Mesh(keep(new THREE.BoxGeometry(1.4, 2.4, 0.3)), wood);
    door.position.set(0, 1.2, 3.4);
    mill.add(door);
    mergeDeep(mill, keep);
    const hub = new THREE.Group();
    hub.position.set(0, 11.5, 3.2);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k * Math.PI) / 2;
      const spar = new THREE.Mesh(keep(new THREE.BoxGeometry(0.25, 8.5, 0.25)), wood);
      spar.position.y = 4.25;
      arm.add(spar);
      const sail = new THREE.Mesh(keep(new THREE.BoxGeometry(1.8, 6, 0.08)), cloth);
      sail.position.set(1.0, 5, 0);
      arm.add(sail);
      hub.add(arm);
    }
    mergeDeep(hub, keep);
    mill.add(hub);
    // Face au centre du circuit
    mill.rotation.y = Math.atan2(-x, -z);
    mill.position.set(x, y, z);
    group.add(mill);
    sails.push(hub);
  }
  return (time) => {
    for (const s of sails) s.rotation.z = -time * 0.8;
  };
}

/** Le téléphérique : des pylônes, le câble, et des cabines qui montent et descendent */
function cableCar(ctx: SceneryContext): (time: number) => void {
  const { group, keep, heightAt, t } = ctx;
  // Il part d'un côté du circuit et monte vers la montagne, loin de la route
  let start: THREE.Vector3 | null = null;
  let dir = new THREE.Vector3();
  for (let s = 0; s < t.length && !start; s += 29) {
    for (const side of [-1, 1]) {
      const p = pointAt(t, s, side * (t.wall + 30));
      const away = new THREE.Vector3(-p.tz * side, 0, p.tx * side).normalize();
      const end = new THREE.Vector3(p.x, 0, p.z).addScaledVector(away, 260);
      let ok = true;
      for (let k = 0; k <= 10; k++) {
        const q = new THREE.Vector3(p.x, 0, p.z).lerp(end, k / 10);
        if (!ctx.free(q.x, q.z, t.wall + 20)) ok = false;
      }
      if (ok) {
        start = new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z);
        dir = away;
        break;
      }
    }
  }
  if (!start) return () => {};
  const steel = keep(lambert(0x5f6670));
  const tops: THREE.Vector3[] = [];
  // Les pylônes et les câbles ne bougent pas : une forme par matière
  const fixed = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const base = start.clone().addScaledVector(dir, k * 85);
    base.y = heightAt(base.x, base.z);
    const h = 14 + k * 9;
    const pylon = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.5, 0.9, h, 6)), steel);
    pylon.position.set(base.x, base.y + h / 2, base.z);
    fixed.add(pylon);
    const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(6, 0.4, 0.4)), steel);
    bar.position.set(base.x, base.y + h, base.z);
    bar.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
    fixed.add(bar);
    tops.push(new THREE.Vector3(base.x, base.y + h, base.z));
  }
  const side = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(2.6);
  const cableMat = keep(lambert(0x2a2d33));
  for (const off of [side, side.clone().negate()]) {
    for (let k = 0; k < tops.length - 1; k++) {
      const a = tops[k]!.clone().add(off);
      const b = tops[k + 1]!.clone().add(off);
      const len = a.distanceTo(b);
      const cable = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.06, len, 4)), cableMat);
      cable.position.copy(a).lerp(b, 0.5);
      cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      fixed.add(cable);
    }
  }
  mergeDeep(fixed, keep);
  group.add(fixed);
  // Les cabines : rouges, accrochées par une tige, elles montent d'un côté et descendent de l'autre
  const cabins: { mesh: THREE.Group; up: boolean; phase: number }[] = [];
  const red = keep(lambert(0xc8302b));
  const glass = keep(lambert(0xbfe0f2));
  for (let k = 0; k < 4; k++) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(keep(new THREE.BoxGeometry(2.2, 2, 2.2)), red);
    box.position.y = -2.2;
    g.add(box);
    const win = new THREE.Mesh(keep(new THREE.BoxGeometry(2.25, 0.8, 1.6)), glass);
    win.position.y = -1.9;
    g.add(win);
    const rod = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 4)), cableMat);
    rod.position.y = -0.6;
    g.add(rod);
    mergeDeep(g, keep);
    group.add(g);
    cabins.push({ mesh: g, up: k % 2 === 0, phase: k * 0.5 });
  }
  const pos = new THREE.Vector3();
  return (time) => {
    for (const c of cabins) {
      const u = (time * 0.025 + c.phase) % 1;
      const f = c.up ? u : 1 - u;
      const seg = Math.min(tops.length - 2, Math.floor(f * (tops.length - 1)));
      const local = f * (tops.length - 1) - seg;
      pos
        .copy(tops[seg]!)
        .lerp(tops[seg + 1]!, local)
        .add(c.up ? side : side.clone().negate());
      c.mesh.position.copy(pos);
    }
  };
}

/** La neige qui tombe autour de la caméra */
function snowfall(ctx: SceneryContext): (time: number, camera: THREE.Vector3, daylight: number) => void {
  const { group, keep } = ctx;
  const n = ctx.phone ? 350 : 800;
  const box = new THREE.Vector3(70, 30, 70);
  const pos = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * box.x;
    pos[i * 3 + 1] = Math.random() * box.y;
    pos[i * 3 + 2] = (Math.random() - 0.5) * box.z;
    seeds[i] = Math.random() * 6.28;
  }
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const flakeMat = keep(
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.22,
      map: keep(TX.sparkTexture()),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    }),
  );
  const flakes = new THREE.Points(geo, flakeMat);
  flakes.frustumCulled = false;
  group.add(flakes);
  let last = 0;
  return (time, camera, daylight) => {
    flakeMat.opacity = 0.9 * Math.max(0, Math.min(1, (daylight - 0.45) / 0.5));
    flakes.visible = flakeMat.opacity > 0.02;
    const dt = Math.min(0.05, Math.max(0, time - last));
    last = time;
    const arr = geo.attributes.position!.array as Float32Array;
    for (let i = 0; i < n; i++) {
      let x = arr[i * 3]! + Math.sin(time * 0.8 + seeds[i]!) * 0.6 * dt;
      let y = arr[i * 3 + 1]! - 2.2 * dt;
      let z = arr[i * 3 + 2]!;
      // Ramenée dans la boîte autour de la caméra (elle la suit sans que ça se voie)
      const rx = x - camera.x;
      const rz = z - camera.z;
      if (rx > box.x / 2) x -= box.x;
      else if (rx < -box.x / 2) x += box.x;
      if (rz > box.z / 2) z -= box.z;
      else if (rz < -box.z / 2) z += box.z;
      if (y < camera.y - 8) y += box.y;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    geo.attributes.position!.needsUpdate = true;
  };
}

export function buildScenery(ctx: SceneryContext, theme: Theme): Scenery {
  const place = PLACES[theme];
  addTunnel(ctx, theme, place.tunnel[0], place.tunnel[1]);
  const crowd = new Crowd(ctx.keep, 60);
  addBridge(ctx, theme, place.bridge, crowd);
  addFans(ctx, crowd);
  crowd.done();
  ctx.group.add(crowd.bodies, crowd.heads);
  const extras: ((time: number, camera: THREE.Vector3, daylight: number) => void)[] = [];
  if (theme === "port") {
    extras.push(seagulls(ctx), lighthouseBeam(ctx));
  } else if (theme === "vignes") {
    extras.push(windmills(ctx));
  } else {
    extras.push(cableCar(ctx), snowfall(ctx));
  }
  return {
    tunnels: [place.tunnel],
    update(time, camera, daylight) {
      crowd.update(time);
      for (const e of extras) e(time, camera, daylight);
    },
  };
}
