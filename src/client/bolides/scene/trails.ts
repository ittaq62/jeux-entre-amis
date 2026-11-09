// Ce que les karts laissent derrière eux : les traces noires des dérapages, qui restent un moment sur la route, et la
// traînée lumineuse des turbos. Une seule forme pour chacune, réécrite au fil de la course.

import * as THREE from "three";
import type { Kart } from "../../../shared/games/bolides/physics.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

const MARK_LIFE = 9;
const MARK_STEP = 0.45;
const MARK_WIDTH = 0.3;
const MARK_ALPHA = 0.5;

/** Les traces de pneus : un anneau de morceaux de bande ; quand il est plein, on réécrit les plus vieux */
export class DriftMarks {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private born: Float32Array;
  private head = 0;
  private last = new Map<string, { lx: number; lz: number; rx: number; rz: number; y: number }>();
  private tick = 0;
  /** Une trace ajoutée depuis la dernière image (on n'envoie à la carte graphique que ce qui a changé) */
  private dirty = false;

  constructor(
    keep: Keep,
    private max: number,
  ) {
    this.pos = new Float32Array(max * 4 * 3);
    this.col = new Float32Array(max * 4 * 4);
    this.born = new Float32Array(max).fill(-1e9);
    const index = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const v = i * 4;
      index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.mesh = new THREE.Mesh(
      geo,
      keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, color: 0x101012 })),
    );
    this.mesh.frustumCulled = false;
  }

  /** Une roue qui glisse à cet endroit (sinon, on oublie où elle en était) */
  private wheel(key: string, x: number, y: number, z: number, sideX: number, sideZ: number, time: number) {
    const lx = x + sideX * MARK_WIDTH * 0.5;
    const lz = z + sideZ * MARK_WIDTH * 0.5;
    const rx = x - sideX * MARK_WIDTH * 0.5;
    const rz = z - sideZ * MARK_WIDTH * 0.5;
    const last = this.last.get(key);
    if (last) {
      const gap = Math.hypot(lx - last.lx, lz - last.lz);
      if (gap < MARK_STEP) return;
      if (gap < 4) {
        const i = this.head;
        this.head = (this.head + 1) % this.max;
        this.pos.set([last.lx, last.y, last.lz, last.rx, last.y, last.rz, lx, y, lz, rx, y, rz], i * 12);
        this.born[i] = time;
        this.dirty = true;
        for (let v = 0; v < 4; v++) this.col.set([1, 1, 1, MARK_ALPHA], (i * 4 + v) * 4);
      }
    }
    this.last.set(key, { lx, lz, rx, rz, y });
  }

  update(karts: readonly { kart: Kart }[], time: number, camera: THREE.Vector3) {
    karts.forEach(({ kart: k }, n) => {
      const on = k.drift !== 0 && k.air === 0 && k.spin === 0 && !k.offroad && Math.hypot(k.x - camera.x, k.z - camera.z) < 80;
      if (!on) {
        this.last.delete(`${n}-0`);
        this.last.delete(`${n}-1`);
        return;
      }
      const fx = Math.sin(k.h);
      const fz = Math.cos(k.h);
      for (const side of [0, 1]) {
        const s = side ? 0.85 : -0.85;
        this.wheel(`${n}-${side}`, k.x - fx * 1.05 - fz * s, k.y + 0.072, k.z - fz * 1.05 + fx * s, fz, -fx, time);
      }
    });
    if (this.dirty) (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    // Elles s'effacent doucement (pas besoin de le recalculer à chaque image)
    this.tick = (this.tick + 1) % 6;
    if (this.tick === 0) {
      for (let i = 0; i < this.max; i++) {
        const age = time - this.born[i]!;
        const a = age > MARK_LIFE ? 0 : Math.min(1, (MARK_LIFE - age) / (MARK_LIFE * 0.35)) * MARK_ALPHA;
        for (let v = 0; v < 4; v++) this.col[(i * 4 + v) * 4 + 3] = a;
      }
    }
    if (this.dirty || this.tick === 0) (this.mesh.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.dirty = false;
  }
}

const TRAIL_LIFE = 0.42;
const TRAIL_POINTS = 18;
const TRAIL_WIDTH = 0.34;

interface TrailOptions {
  life: number;
  width: number;
  height: number;
  /** Les couleurs défilent le long du ruban */
  rainbow: boolean;
  on: (entry: TrailEntry) => boolean;
}

type TrailEntry = { kart: Kart; star?: boolean };

const TURBO_TRAIL: TrailOptions = {
  life: TRAIL_LIFE,
  width: TRAIL_WIDTH,
  height: 0.55,
  rainbow: false,
  on: ({ kart: k }) => k.boost > 0 && k.spin === 0,
};

/** Le ruban de l'arc-en-ciel : large, et de toutes les couleurs */
export const RAINBOW_TRAIL: TrailOptions = {
  life: 0.7,
  width: 1.5,
  height: 0.42,
  rainbow: true,
  on: ({ star }) => Boolean(star),
};

/** La traînée d'un turbo : un ruban lumineux, qui s'amincit et s'efface derrière le véhicule */
export class TurboTrails {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private index: Uint16Array;
  private history: { x: number; y: number; z: number; t: number }[][];
  private tint = new THREE.Color();

  constructor(
    keep: Keep,
    count: number,
    private o: TrailOptions = TURBO_TRAIL,
  ) {
    const verts = count * TRAIL_POINTS * 2;
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 4);
    this.index = new Uint16Array(count * (TRAIL_POINTS - 1) * 6);
    this.history = Array.from({ length: count }, () => []);
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(this.index, 1).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(
      geo,
      keep(
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          color: o.rainbow ? new THREE.Color(1.1, 1.1, 1.1) : new THREE.Color(1.45, 0.72, 0.2),
          fog: false,
        }),
      ),
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  update(karts: readonly TrailEntry[], time: number, camera: THREE.Vector3) {
    let v = 0;
    let i = 0;
    const { life: span, width, height, rainbow } = this.o;
    karts.forEach((entry, n) => {
      const k = entry.kart;
      const h = this.history[n];
      if (!h) return;
      const on = this.o.on(entry) && Math.hypot(k.x - camera.x, k.z - camera.z) < 90;
      if (on) {
        const x = k.x - Math.sin(k.h) * 1.5;
        const z = k.z - Math.cos(k.h) * 1.5;
        const last = h.at(-1);
        // Une téléportation casse le ruban
        if (last && Math.hypot(x - last.x, z - last.z) > 12) h.length = 0;
        if (!last || Math.hypot(x - last.x, z - last.z) > 0.55) h.push({ x, y: k.y + k.air + height, z, t: time });
      }
      while (h.length > 0 && (time - h[0]!.t > span || h.length > TRAIL_POINTS)) h.shift();
      if (h.length < 2) return;
      const first = v;
      h.forEach((p, j) => {
        const next = h[Math.min(h.length - 1, j + 1)]!;
        const prev = h[Math.max(0, j - 1)]!;
        let sx = next.z - prev.z;
        let sz = -(next.x - prev.x);
        const len = Math.hypot(sx, sz) || 1;
        sx /= len;
        sz /= len;
        const life = Math.max(0, 1 - (time - p.t) / span);
        const half = width * 0.5 * life;
        this.pos.set([p.x + sx * half, p.y, p.z + sz * half, p.x - sx * half, p.y, p.z - sz * half], v * 3);
        const a = life * life * (rainbow ? 0.8 : 0.55);
        if (rainbow) {
          this.tint.setHSL((j * 0.075 + time * 1.5) % 1, 1, 0.56);
          const { r, g, b } = this.tint;
          this.col.set([r, g, b, a, r, g, b, a], v * 4);
        } else this.col.set([1, 1, 1, a, 1, 1, 1, a], v * 4);
        v += 2;
      });
      for (let j = 0; j < h.length - 1; j++) {
        const a = first + j * 2;
        this.index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i);
        i += 6;
      }
    });
    this.mesh.visible = i > 0;
    if (i === 0) return;
    const g = this.mesh.geometry;
    g.setDrawRange(0, i);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (g.index as THREE.BufferAttribute).needsUpdate = true;
  }
}
