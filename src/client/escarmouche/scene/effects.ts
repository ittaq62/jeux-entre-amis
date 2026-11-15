// Ce qui passe en un éclair : les balles traçantes, les flammes au bout des canons, la poussière et les impacts rouges,
// les trous dans les murs, les explosions et leur fumée. Tout est pris dans des réserves fixes : rien ne se crée en
// plein combat, le téléphone ne ralentit pas.

import * as THREE from "three";
import { softDot } from "./textures.ts";

interface Puff {
  sprite: THREE.Sprite;
  born: number;
  life: number;
  grow: number;
  rise: number;
  vx: number;
  vz: number;
  size: number;
  alpha: number;
}

const TRACERS = 48;

/** Un rond sombre aux bords flous : le trou d'une balle, la trace d'une explosion */
function holeTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(10,8,6,1)");
  grad.addColorStop(0.35, "rgba(25,20,15,.9)");
  grad.addColorStop(0.6, "rgba(40,34,28,.35)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Effects {
  readonly group = new THREE.Group();
  private tracerGeo: THREE.BufferGeometry;
  private tracerPos: Float32Array;
  private tracerCol: Float32Array;
  private tracers: { a: THREE.Vector3; b: THREE.Vector3; born: number; life: number; color: THREE.Color }[] = [];
  private tracerNext = 0;
  private puffs: Puff[] = [];
  private puffNext = 0;
  private flashes: { sprite: THREE.Sprite; born: number }[] = [];
  private flashNext = 0;
  private holes: THREE.Mesh[] = [];
  private holeNext = 0;
  private scorches: THREE.Mesh[] = [];
  private scorchNext = 0;
  /** La lueur des explosions (et de son propre tir, sur ordinateur) */
  readonly light: THREE.PointLight | null;
  private lightUntil = 0;
  private now = 0;

  constructor(low: boolean) {
    const dot = softDot();
    this.tracerPos = new Float32Array(TRACERS * 6);
    this.tracerCol = new Float32Array(TRACERS * 6);
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute("position", new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeo.setAttribute("color", new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(
      this.tracerGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    lines.frustumCulled = false;
    this.group.add(lines);
    for (let i = 0; i < TRACERS; i++)
      this.tracers.push({ a: new THREE.Vector3(), b: new THREE.Vector3(), born: -1, life: 0, color: new THREE.Color() });
    for (let i = 0; i < (low ? 40 : 70); i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, transparent: true, depthWrite: false, color: "#aaa" }));
      s.visible = false;
      this.group.add(s);
      this.puffs.push({ sprite: s, born: -1, life: 1, grow: 1, rise: 0, vx: 0, vz: 0, size: 1, alpha: 1 });
    }
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#ffb35a" }),
      );
      s.visible = false;
      this.group.add(s);
      this.flashes.push({ sprite: s, born: -1 });
    }
    const hole = holeTexture();
    const holeMat = new THREE.MeshBasicMaterial({
      map: hole,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    for (let i = 0; i < (low ? 40 : 90); i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), holeMat);
      m.visible = false;
      this.group.add(m);
      this.holes.push(m);
    }
    const scorchMat = new THREE.MeshBasicMaterial({
      map: hole,
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), scorchMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.group.add(m);
      this.scorches.push(m);
    }
    this.light = low ? null : new THREE.PointLight("#ffb060", 0, 14, 2);
    if (this.light) this.group.add(this.light);
  }

  /** Une balle traçante, d'un point à l'autre */
  tracer(a: THREE.Vector3, b: THREE.Vector3, bright = 1) {
    const t = this.tracers[this.tracerNext]!;
    this.tracerNext = (this.tracerNext + 1) % TRACERS;
    t.a.copy(a);
    t.b.copy(b);
    t.born = this.now;
    t.life = 0.07;
    t.color.setRGB(1 * bright, 0.82 * bright, 0.5 * bright);
  }

  /** La flamme au bout d'un canon */
  flash(at: THREE.Vector3, size = 0.35) {
    const f = this.flashes[this.flashNext]!;
    this.flashNext = (this.flashNext + 1) % this.flashes.length;
    f.sprite.position.copy(at);
    f.sprite.scale.setScalar(size * (0.8 + Math.random() * 0.4));
    f.sprite.material.rotation = Math.random() * Math.PI;
    f.sprite.visible = true;
    f.born = this.now;
  }

  /** De la lumière un court instant (le tir, l'explosion) */
  glow(at: THREE.Vector3, power: number, ms: number) {
    if (!this.light) return;
    this.light.position.copy(at);
    this.light.intensity = power;
    this.lightUntil = this.now + ms / 1000;
  }

  private puff(at: THREE.Vector3, color: string, size: number, life: number, rise: number, spread: number, alpha = 0.8) {
    const p = this.puffs[this.puffNext]!;
    this.puffNext = (this.puffNext + 1) % this.puffs.length;
    p.sprite.position.copy(at);
    p.sprite.material.color.set(color);
    p.sprite.material.opacity = alpha;
    p.sprite.material.blending = THREE.NormalBlending;
    p.sprite.visible = true;
    p.born = this.now;
    p.life = life;
    p.size = size;
    p.grow = 1.8;
    p.rise = rise;
    p.vx = (Math.random() - 0.5) * spread;
    p.vz = (Math.random() - 0.5) * spread;
    p.alpha = alpha;
  }

  /**
   * Une balle dans un mur : un peu de poussière, et un trou qui reste. `axis` et `sign` : la face touchée (le trou s'y
   * colle, tourné vers le tireur).
   */
  impact(at: THREE.Vector3, axis: number, sign: number, dust: string) {
    this.puff(at, dust, 0.25, 0.45, 0.4, 0.6, 0.7);
    if (axis < 0) return;
    const h = this.holes[this.holeNext]!;
    this.holeNext = (this.holeNext + 1) % this.holes.length;
    h.visible = true;
    h.position.copy(at);
    h.rotation.set(0, 0, Math.random() * Math.PI);
    const off = 0.006 * sign;
    if (axis === 0) {
      h.rotation.set(0, sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      h.position.x += off;
    } else if (axis === 1) {
      h.rotation.set(sign > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0);
      h.position.y += off;
    } else {
      h.rotation.set(0, sign > 0 ? 0 : Math.PI, 0);
      h.position.z += off;
    }
  }

  /** Un soldat touché : une petite gerbe rouge */
  blood(at: THREE.Vector3, big = false) {
    this.puff(at, "#8c1010", big ? 0.42 : 0.28, 0.35, -0.3, 1.2, 0.9);
    this.puff(at, "#b81c1c", big ? 0.25 : 0.16, 0.25, 0.1, 1.6, 0.85);
  }

  /** Une grenade éclate */
  explosion(at: THREE.Vector3) {
    this.flash(at, 4.2);
    this.glow(at, 40, 220);
    for (let i = 0; i < 9; i++) {
      const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 0.8, (Math.random() - 0.5) * 1.6));
      this.puff(p, i % 3 === 0 ? "#3a3632" : "#6c665c", 1.4 + Math.random() * 0.8, 1.8 + Math.random(), 0.8, 1.6, 0.75);
    }
    for (let i = 0; i < 4; i++) this.puff(at, "#ffa64a", 1.2, 0.25, 0.5, 2, 0.9);
    const s = this.scorches[this.scorchNext]!;
    this.scorchNext = (this.scorchNext + 1) % this.scorches.length;
    s.position.set(at.x, Math.max(0.015, at.y - 0.05), at.z);
    s.visible = true;
  }

  update(dt: number) {
    this.now += dt;
    const now = this.now;
    this.tracers.forEach((t, i) => {
      const k = i * 6;
      const age = now - t.born;
      if (t.born < 0 || age > t.life) {
        this.tracerCol.fill(0, k, k + 6);
        return;
      }
      // Un trait qui file vers le point d'arrivée
      const f = age / t.life;
      const head = Math.min(1, f * 1.6 + 0.25);
      const tail = Math.max(0, head - 0.45);
      const ax = t.a.x + (t.b.x - t.a.x) * tail;
      const ay = t.a.y + (t.b.y - t.a.y) * tail;
      const az = t.a.z + (t.b.z - t.a.z) * tail;
      const bx = t.a.x + (t.b.x - t.a.x) * head;
      const by = t.a.y + (t.b.y - t.a.y) * head;
      const bz = t.a.z + (t.b.z - t.a.z) * head;
      this.tracerPos.set([ax, ay, az, bx, by, bz], k);
      const fade = 1 - f;
      this.tracerCol.set(
        [t.color.r * fade * 0.4, t.color.g * fade * 0.4, t.color.b * fade * 0.4, t.color.r * fade, t.color.g * fade, t.color.b * fade],
        k,
      );
    });
    (this.tracerGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.tracerGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    for (const f of this.flashes) {
      if (!f.sprite.visible) continue;
      const age = now - f.born;
      if (age > 0.06) f.sprite.visible = false;
      else f.sprite.material.opacity = 1 - age / 0.06;
    }
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      const age = now - p.born;
      if (age > p.life) {
        p.sprite.visible = false;
        continue;
      }
      const f = age / p.life;
      p.sprite.scale.setScalar(p.size * (1 + f * p.grow));
      p.sprite.material.opacity = p.alpha * (1 - f);
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.z += p.vz * dt;
      p.sprite.position.y += p.rise * dt;
    }
    if (this.light && now > this.lightUntil) this.light.intensity = 0;
  }
}
