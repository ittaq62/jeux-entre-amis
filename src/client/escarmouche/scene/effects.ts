// Ce qui passe en un éclair : les balles traçantes (de vrais traits lumineux, toujours tournés vers soi), les flammes en
// étoile au bout des canons, ce qui jaillit d'un impact selon ce qu'il touche (des étincelles sur le métal, des éclats
// et de la poussière sur la pierre, des copeaux sur le bois, de la terre au sol), les trous qui restent, le sang, et les
// explosions : la boule de feu, l'onde de poussière, les projections, la colonne de fumée qui monte longtemps.
// Tout est pris dans des réserves fixes : rien ne se crée en plein combat, le téléphone ne ralentit pas.

import * as THREE from "three";
import { softDot } from "./textures.ts";

/** Ce que touche une balle : il décide de ce qui en jaillit */
export type Surface = "metal" | "stone" | "wood" | "dirt";

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
  spin: number;
}

const TRACERS = 48;

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Le trou d'une balle : un cœur noir, un anneau éclaté, quelques fissures */
function holeTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, "rgba(8,6,5,1)");
    grad.addColorStop(0.22, "rgba(14,12,10,.95)");
    grad.addColorStop(0.32, "rgba(70,62,52,.7)");
    grad.addColorStop(0.55, "rgba(40,34,28,.3)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(20,16,12,.55)";
    g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.sin(i * 7) * 0.4;
      g.beginPath();
      g.moveTo(32 + Math.cos(a) * 7, 32 + Math.sin(a) * 7);
      g.lineTo(32 + Math.cos(a + 0.2) * 15, 32 + Math.sin(a + 0.2) * 15);
      g.lineTo(32 + Math.cos(a - 0.1) * 21, 32 + Math.sin(a - 0.1) * 21);
      g.stroke();
    }
  });
}

/** La flamme d'un canon : un cœur blanc, une étoile de quatre à six branches */
export function flashTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (g, s) => {
    const c = s / 2;
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + (i % 2) * 0.2;
      const len = (i % 2 ? 0.36 : 0.5) * s;
      const grad = g.createLinearGradient(c, c, c + Math.cos(a) * len, c + Math.sin(a) * len);
      grad.addColorStop(0, "rgba(255,240,200,1)");
      grad.addColorStop(0.4, "rgba(255,170,60,.8)");
      grad.addColorStop(1, "rgba(255,90,20,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(c + Math.cos(a + Math.PI / 2) * s * 0.05, c + Math.sin(a + Math.PI / 2) * s * 0.05);
      g.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
      g.lineTo(c + Math.cos(a - Math.PI / 2) * s * 0.05, c + Math.sin(a - Math.PI / 2) * s * 0.05);
      g.fill();
    }
    const core = g.createRadialGradient(c, c, 0, c, c, s * 0.22);
    core.addColorStop(0, "rgba(255,255,240,1)");
    core.addColorStop(0.5, "rgba(255,200,110,.8)");
    core.addColorStop(1, "rgba(255,120,30,0)");
    g.fillStyle = core;
    g.fillRect(0, 0, s, s);
  });
}

/** Une volute de fumée ou de poussière : des taches floues serrées, plus denses au milieu */
function smokeTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (g, s) => {
    let seed = 7;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * s * 0.22;
      const x = s / 2 + Math.cos(a) * d;
      const y = s / 2 + Math.sin(a) * d;
      const rad = s * (0.12 + r() * 0.16);
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      const v = 200 + Math.floor(r() * 55);
      grad.addColorStop(0, `rgba(${v},${v},${v},.32)`);
      grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    }
  });
}

/** Des particules qui retombent (éclats, terre, gouttes) ou qui brillent (étincelles) */
class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private age: Float32Array;
  private base: Float32Array;
  private next = 0;
  private gravity: number;

  constructor(count: number, size: number, additive: boolean, gravity: number) {
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count).fill(1);
    this.age = new Float32Array(count).fill(9);
    this.gravity = gravity;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        map: softDot(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
  }

  emit(at: THREE.Vector3, vx: number, vy: number, vz: number, color: THREE.Color, life: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.life.length;
    this.pos.set([at.x, at.y, at.z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.base.set([color.r, color.g, color.b], i * 3);
    this.life[i] = life;
    this.age[i] = 0;
  }

  update(dt: number) {
    for (let i = 0; i < this.life.length; i++) {
      const k = i * 3;
      if (this.age[i]! >= this.life[i]!) {
        this.col[k] = this.col[k + 1] = this.col[k + 2] = 0;
        this.pos[k + 1] = -100;
        continue;
      }
      this.age[i]! += dt;
      this.vel[k + 1]! -= this.gravity * dt;
      this.vel[k]! *= 1 - dt * 0.8;
      this.vel[k + 2]! *= 1 - dt * 0.8;
      this.pos[k]! += this.vel[k]! * dt;
      this.pos[k + 1]! += this.vel[k + 1]! * dt;
      this.pos[k + 2]! += this.vel[k + 2]! * dt;
      // Elles ne passent pas sous le sol : elles s'y posent
      if (this.pos[k + 1]! < 0.01) {
        this.pos[k + 1] = 0.01;
        this.vel[k] = this.vel[k + 1] = this.vel[k + 2] = 0;
      }
      const f = 1 - this.age[i]! / this.life[i]!;
      this.col[k] = this.base[k]! * f;
      this.col[k + 1] = this.base[k + 1]! * f;
      this.col[k + 2] = this.base[k + 2]! * f;
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

const SURFACE: Record<Surface, { dust: string; chip: string; hole: string; size: number }> = {
  metal: { dust: "#8d8a84", chip: "#d8d2c4", hole: "#9a9690", size: 0.07 },
  stone: { dust: "#b5a88f", chip: "#7a7062", hole: "#ffffff", size: 0.09 },
  wood: { dust: "#8b6a46", chip: "#5c3f26", hole: "#c9a37a", size: 0.08 },
  dirt: { dust: "#7d6a50", chip: "#4a3c2c", hole: "#ffffff", size: 0.12 },
};

export class Effects {
  readonly group = new THREE.Group();
  private tracerGeo: THREE.BufferGeometry;
  private tracerPos: Float32Array;
  private tracerCol: Float32Array;
  private tracers: { a: THREE.Vector3; b: THREE.Vector3; born: number; life: number; color: THREE.Color; width: number }[] = [];
  private tracerNext = 0;
  private puffs: Puff[] = [];
  private puffNext = 0;
  private flashes: { sprite: THREE.Sprite; born: number; life: number }[] = [];
  private flashNext = 0;
  private holes: THREE.Mesh[] = [];
  private holeMats: Map<Surface, THREE.MeshBasicMaterial> = new Map();
  private holeNext = 0;
  private scorches: THREE.Mesh[] = [];
  private scorchNext = 0;
  private chips: Particles;
  private sparks: Particles;
  /** La lueur des explosions (et de son propre tir, sur ordinateur) */
  readonly light: THREE.PointLight | null;
  private lightUntil = 0;
  private lightPower = 0;
  private lightDur = 0.05;
  private now = 0;
  private camPos = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private color = new THREE.Color();

  constructor(low: boolean) {
    const dot = softDot();
    const star = flashTexture();
    const smoke = smokeTexture();
    // Les traçantes : deux triangles par balle, recalculés à chaque image face à la caméra
    this.tracerPos = new Float32Array(TRACERS * 12);
    this.tracerCol = new Float32Array(TRACERS * 12);
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute("position", new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeo.setAttribute("color", new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < TRACERS; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
    this.tracerGeo.setIndex(idx);
    const lines = new THREE.Mesh(
      this.tracerGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    lines.frustumCulled = false;
    this.group.add(lines);
    for (let i = 0; i < TRACERS; i++)
      this.tracers.push({ a: new THREE.Vector3(), b: new THREE.Vector3(), born: -1, life: 0, color: new THREE.Color(), width: 0.02 });
    for (let i = 0; i < (low ? 50 : 110); i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, transparent: true, depthWrite: false, color: "#aaa" }));
      s.visible = false;
      this.group.add(s);
      this.puffs.push({ sprite: s, born: -1, life: 1, grow: 1, rise: 0, vx: 0, vz: 0, size: 1, alpha: 1, spin: 0 });
    }
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: i < 10 ? star : dot,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      s.visible = false;
      this.group.add(s);
      this.flashes.push({ sprite: s, born: -1, life: 0.05 });
    }
    const hole = holeTexture();
    for (const k of Object.keys(SURFACE) as Surface[])
      this.holeMats.set(
        k,
        new THREE.MeshBasicMaterial({
          map: hole,
          color: SURFACE[k].hole,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
        }),
      );
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < (low ? 40 : 110); i++) {
      const m = new THREE.Mesh(geo, this.holeMats.get("stone")!);
      m.visible = false;
      this.group.add(m);
      this.holes.push(m);
    }
    const scorchMat = new THREE.MeshBasicMaterial({
      map: dot,
      color: "#000000",
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), scorchMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.group.add(m);
      this.scorches.push(m);
    }
    this.chips = new Particles(low ? 120 : 260, 0.045, false, 9.8);
    this.sparks = new Particles(low ? 60 : 140, 0.035, true, 6);
    this.group.add(this.chips.points);
    this.group.add(this.sparks.points);
    this.light = low ? null : new THREE.PointLight("#ffb060", 0, 16, 2);
    if (this.light) this.group.add(this.light);
  }

  /** Une balle traçante, d'un point à l'autre */
  tracer(a: THREE.Vector3, b: THREE.Vector3, bright = 1) {
    const t = this.tracers[this.tracerNext]!;
    this.tracerNext = (this.tracerNext + 1) % TRACERS;
    t.a.copy(a);
    t.b.copy(b);
    t.born = this.now;
    t.life = Math.min(0.12, 0.05 + a.distanceTo(b) / 900);
    t.width = 0.018 + bright * 0.008;
    t.color.setRGB(1.6 * bright, 1.1 * bright, 0.55 * bright);
  }

  /** La flamme au bout d'un canon (celle des autres : la sienne est sur son arme) */
  flash(at: THREE.Vector3, size = 0.35) {
    const f = this.flashes[this.flashNext]!;
    this.flashNext = (this.flashNext + 1) % 10;
    f.sprite.position.copy(at);
    f.sprite.scale.setScalar(size * (0.8 + Math.random() * 0.5));
    f.sprite.material.rotation = Math.random() * Math.PI;
    f.sprite.material.color.setRGB(1.4, 1.2, 1);
    f.sprite.visible = true;
    f.born = this.now;
    f.life = 0.05;
  }

  /** De la lumière un court instant (le tir, l'explosion) */
  glow(at: THREE.Vector3, power: number, ms: number) {
    if (!this.light) return;
    if (this.now < this.lightUntil && power < this.lightPower) return;
    this.light.position.copy(at);
    this.light.intensity = power;
    this.lightPower = power;
    this.lightDur = ms / 1000;
    this.lightUntil = this.now + ms / 1000;
  }

  private puff(at: THREE.Vector3, color: string, size: number, life: number, rise: number, spread: number, alpha = 0.8, grow = 1.8) {
    const p = this.puffs[this.puffNext]!;
    this.puffNext = (this.puffNext + 1) % this.puffs.length;
    p.sprite.position.copy(at);
    p.sprite.material.color.set(color);
    p.sprite.material.opacity = alpha;
    p.sprite.material.rotation = Math.random() * Math.PI * 2;
    p.sprite.scale.setScalar(size);
    p.sprite.visible = true;
    p.born = this.now;
    p.life = life;
    p.size = size;
    p.grow = grow;
    p.rise = rise;
    p.vx = (Math.random() - 0.5) * spread;
    p.vz = (Math.random() - 0.5) * spread;
    p.alpha = alpha;
    p.spin = (Math.random() - 0.5) * 0.6;
  }

  /** Un peu de fumée qui sort du canon après une rafale */
  muzzleSmoke(at: THREE.Vector3) {
    this.puff(at, "#c9c6c0", 0.12, 0.9, 0.35, 0.15, 0.22, 3.2);
  }

  /**
   * Une balle dans un mur : ce qui en jaillit (selon la surface), et un trou qui reste. `axis` et `sign` : la face
   * touchée (le trou s'y colle, tourné vers le tireur).
   */
  impact(at: THREE.Vector3, axis: number, sign: number, surface: Surface = "stone") {
    const look = SURFACE[surface];
    // La direction du rebond : la normale de la face touchée
    const n = this.tmp.set(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
    if (axis < 0) n.set(0, 1, 0);
    this.puff(this.tmp2.copy(at).addScaledVector(n, 0.05), look.dust, surface === "dirt" ? 0.32 : 0.22, 0.7, 0.25, 0.5, 0.55, 2.4);
    if (surface === "dirt") this.puff(this.tmp2.copy(at).addScaledVector(n, 0.15), look.dust, 0.18, 0.5, 1.4, 0.3, 0.6, 1.2);
    this.color.set(look.chip);
    const count = surface === "metal" ? 3 : 6;
    for (let i = 0; i < count; i++) {
      const s = 1.5 + Math.random() * 2.5;
      this.chips.emit(
        at,
        n.x * s + (Math.random() - 0.5) * 2,
        n.y * s + Math.random() * 2.2,
        n.z * s + (Math.random() - 0.5) * 2,
        this.color,
        0.5 + Math.random() * 0.4,
      );
    }
    if (surface === "metal") {
      this.color.setRGB(1.6, 1.15, 0.5);
      for (let i = 0; i < 8; i++) {
        const s = 3 + Math.random() * 5;
        this.sparks.emit(
          at,
          n.x * s + (Math.random() - 0.5) * 4,
          n.y * s + Math.random() * 3,
          n.z * s + (Math.random() - 0.5) * 4,
          this.color,
          0.15 + Math.random() * 0.2,
        );
      }
    }
    if (axis < 0) return;
    const h = this.holes[this.holeNext]!;
    this.holeNext = (this.holeNext + 1) % this.holes.length;
    h.material = this.holeMats.get(surface)!;
    h.visible = true;
    h.scale.setScalar(look.size * (0.8 + Math.random() * 0.5));
    h.position.copy(at);
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
    h.rotateZ(Math.random() * Math.PI * 2);
  }

  /** Un soldat touché : une gerbe rouge, et des gouttes qui retombent */
  blood(at: THREE.Vector3, big = false) {
    this.puff(at, "#7a0d0d", big ? 0.42 : 0.28, 0.4, -0.25, 1.0, 0.85);
    this.puff(at, "#a81818", big ? 0.26 : 0.17, 0.28, 0.1, 1.4, 0.8);
    this.color.set("#6e0a0a");
    for (let i = 0; i < (big ? 10 : 5); i++)
      this.chips.emit(
        at,
        (Math.random() - 0.5) * 2.4,
        Math.random() * 1.6,
        (Math.random() - 0.5) * 2.4,
        this.color,
        0.5 + Math.random() * 0.3,
      );
  }

  /** Une grenade éclate */
  explosion(at: THREE.Vector3) {
    // L'éclair et la boule de feu
    const core = this.flashes[10 + (this.flashNext % 4)]!;
    core.sprite.position.copy(at).add(this.tmp.set(0, 0.6, 0));
    core.sprite.scale.setScalar(6);
    core.sprite.material.color.setRGB(2.2, 1.4, 0.6);
    core.sprite.visible = true;
    core.born = this.now;
    core.life = 0.18;
    this.flash(this.tmp.copy(at).add(this.tmp2.set(0, 0.5, 0)), 5);
    this.glow(at, 60, 260);
    for (let i = 0; i < 6; i++) {
      const p = this.tmp.copy(at).add(this.tmp2.set((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.9, (Math.random() - 0.5) * 1.2));
      const fire = this.puffs[this.puffNext]!;
      this.puff(p, i % 2 ? "#ffb04a" : "#ff7a24", 1.1 + Math.random() * 0.6, 0.35, 1.2, 2.2, 0.95, 1.6);
      fire.sprite.material.blending = THREE.AdditiveBlending;
    }
    // L'onde de poussière au ras du sol, la colonne de fumée qui monte longtemps
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const p = this.tmp.copy(at).add(this.tmp2.set(Math.cos(a) * 0.6, 0.25, Math.sin(a) * 0.6));
      const dust = this.puffs[this.puffNext]!;
      this.puff(p, "#8d7f68", 1.0, 1.6, 0.2, 0, 0.6, 2.2);
      dust.sprite.material.blending = THREE.NormalBlending;
      dust.vx = Math.cos(a) * 3.2;
      dust.vz = Math.sin(a) * 3.2;
    }
    for (let i = 0; i < 9; i++) {
      const p = this.tmp.copy(at).add(this.tmp2.set((Math.random() - 0.5) * 1.4, 0.6 + i * 0.35, (Math.random() - 0.5) * 1.4));
      const smoke = this.puffs[this.puffNext]!;
      this.puff(
        p,
        i % 3 === 0 ? "#2f2c29" : "#57524b",
        1.5 + Math.random() * 0.9,
        4 + Math.random() * 2.5,
        0.9 + Math.random() * 0.5,
        0.8,
        0.7,
        2.6,
      );
      smoke.sprite.material.blending = THREE.NormalBlending;
    }
    // Les projections de terre, et des étincelles
    this.color.set("#3e3326");
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 6;
      this.chips.emit(at, Math.cos(a) * s, 4 + Math.random() * 6, Math.sin(a) * s, this.color, 1.2 + Math.random() * 0.6);
    }
    this.color.setRGB(1.8, 1.1, 0.4);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 8;
      this.sparks.emit(at, Math.cos(a) * s, 2 + Math.random() * 7, Math.sin(a) * s, this.color, 0.4 + Math.random() * 0.5);
    }
    const s = this.scorches[this.scorchNext]!;
    this.scorchNext = (this.scorchNext + 1) % this.scorches.length;
    s.position.set(at.x, Math.max(0.015, at.y - 0.05), at.z);
    s.rotation.z = Math.random() * Math.PI * 2;
    s.visible = true;
  }

  update(dt: number, camera?: THREE.Camera) {
    this.now += dt;
    const now = this.now;
    if (camera) camera.getWorldPosition(this.camPos);
    const side = this.tmp;
    const dir = this.tmp2;
    this.tracers.forEach((t, i) => {
      const k = i * 12;
      const age = now - t.born;
      if (t.born < 0 || age > t.life) {
        this.tracerCol.fill(0, k, k + 12);
        return;
      }
      // Un trait qui file vers le point d'arrivée, large de quelques centimètres, tourné vers la caméra
      const f = age / t.life;
      const head = Math.min(1, f * 1.5 + 0.2);
      const tail = Math.max(0, head - 0.35);
      const ax = t.a.x + (t.b.x - t.a.x) * tail;
      const ay = t.a.y + (t.b.y - t.a.y) * tail;
      const az = t.a.z + (t.b.z - t.a.z) * tail;
      const bx = t.a.x + (t.b.x - t.a.x) * head;
      const by = t.a.y + (t.b.y - t.a.y) * head;
      const bz = t.a.z + (t.b.z - t.a.z) * head;
      dir.set(bx - ax, by - ay, bz - az);
      side
        .set((ax + bx) / 2 - this.camPos.x, (ay + by) / 2 - this.camPos.y, (az + bz) / 2 - this.camPos.z)
        .cross(dir)
        .normalize();
      const w = t.width * (1 + this.camPos.distanceTo(t.b) * 0.01);
      this.tracerPos.set(
        [
          ax - side.x * w * 0.4,
          ay - side.y * w * 0.4,
          az - side.z * w * 0.4,
          ax + side.x * w * 0.4,
          ay + side.y * w * 0.4,
          az + side.z * w * 0.4,
        ],
        k,
      );
      this.tracerPos.set([bx - side.x * w, by - side.y * w, bz - side.z * w, bx + side.x * w, by + side.y * w, bz + side.z * w], k + 6);
      const fade = 1 - f * 0.6;
      const tailK = 0.15 * fade;
      this.tracerCol.set(
        [
          t.color.r * tailK,
          t.color.g * tailK,
          t.color.b * tailK,
          t.color.r * tailK,
          t.color.g * tailK,
          t.color.b * tailK,
          t.color.r * fade,
          t.color.g * fade,
          t.color.b * fade,
          t.color.r * fade,
          t.color.g * fade,
          t.color.b * fade,
        ],
        k,
      );
    });
    (this.tracerGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.tracerGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    for (const f of this.flashes) {
      if (!f.sprite.visible) continue;
      const age = now - f.born;
      if (age > f.life) f.sprite.visible = false;
      else f.sprite.material.opacity = 1 - age / f.life;
    }
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      const age = now - p.born;
      if (age > p.life) {
        p.sprite.visible = false;
        p.sprite.material.blending = THREE.NormalBlending;
        continue;
      }
      const f = age / p.life;
      p.sprite.scale.setScalar(p.size * (1 + Math.sqrt(f) * p.grow));
      p.sprite.material.opacity = p.alpha * (1 - f) * Math.min(1, age * 20);
      p.sprite.material.rotation += p.spin * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.z += p.vz * dt;
      p.sprite.position.y += p.rise * dt * (1 - f * 0.6);
      p.vx *= 1 - dt * 1.6;
      p.vz *= 1 - dt * 1.6;
    }
    this.chips.update(dt);
    this.sparks.update(dt);
    if (this.light) {
      if (now > this.lightUntil) this.light.intensity = 0;
      else this.light.intensity = this.lightPower * Math.max(0, (this.lightUntil - now) / this.lightDur);
    }
  }
}
