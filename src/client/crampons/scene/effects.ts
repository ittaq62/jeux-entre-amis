// Les petits plus qui font vivre l'image : la traînée du ballon, la poussière des tacles, les confettis des buts,
// les flashs des photographes en tribune, la pluie ou la neige.

import * as THREE from "three";
import { HALF_L, HALF_W } from "../../../shared/games/crampons/pitch.ts";

export type Weather = "clair" | "pluie" | "neige";

const TRAIL = 14;
const DUST = 26;
const CONFETTI = 380;
const FLASHES = 46;
/** La pluie tombe en biais : autant de mètres sur le côté que de chute */
const RAIN_SLANT = 0.16;
const RAIN_TOP = 44;

function softDot(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  vx: number;
  vz: number;
}

export class Effects {
  private group = new THREE.Group();
  private dot = softDot();
  private trail: THREE.InstancedMesh;
  private trailPoints: THREE.Vector3[] = [];
  private puffs: Puff[] = [];
  private puffIndex = 0;
  private confetti: THREE.InstancedMesh;
  private bits: { p: THREE.Vector3; v: THREE.Vector3; a: number; s: number }[] = [];
  private confettiOn = 0;
  private flashes: THREE.Sprite[] = [];
  private flashFor = 0;
  private rain: THREE.LineSegments | THREE.Points | null = null;
  private rainPos: Float32Array | null = null;
  private weather: Weather;
  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private scale = new THREE.Vector3();

  constructor(scene: THREE.Scene, weather: Weather, low: boolean) {
    this.weather = weather;
    const trailMat = new THREE.MeshBasicMaterial({
      color: "#fff6d8",
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    });
    this.trail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), trailMat, TRAIL);
    this.trail.frustumCulled = false;
    this.group.add(this.trail);
    for (let i = 0; i < TRAIL; i++) this.trailPoints.push(new THREE.Vector3(0, -50, 0));

    for (let i = 0; i < DUST; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.dot, color: "#d9c79a", transparent: true, opacity: 0, depthWrite: false }),
      );
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, life: 0, max: 1, vx: 0, vz: 0 });
    }

    const bit = new THREE.PlaneGeometry(0.28, 0.18);
    this.confetti = new THREE.InstancedMesh(
      bit,
      new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, toneMapped: false }),
      low ? 120 : CONFETTI,
    );
    this.confetti.frustumCulled = false;
    this.confetti.visible = false;
    this.group.add(this.confetti);

    if (!low) {
      for (let i = 0; i < FLASHES; i++) {
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.dot,
            color: "#ffffff",
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0,
            fog: false,
          }),
        );
        s.scale.setScalar(2.4);
        s.visible = false;
        this.group.add(s);
        this.flashes.push(s);
      }
    }

    if (weather !== "clair") {
      const n = weather === "pluie" ? (low ? 700 : 2600) : low ? 900 : 3200;
      if (weather === "pluie") {
        const pos = new Float32Array(n * 6);
        // Chaque goutte s'estompe vers le haut : un trait fin plutôt qu'un petit bâton blanc
        const tint = new Float32Array(n * 8);
        for (let i = 0; i < n; i++) {
          const x = Math.random() * 120 - 60;
          const y = Math.random() * RAIN_TOP;
          const z = Math.random() * 90 - 45;
          pos.set([x, y, z, x + 1.7 * RAIN_SLANT, y - 1.7, z + 0.04], i * 6);
          tint.set([0.82, 0.89, 0.97, 0, 0.82, 0.89, 0.97, 0.5], i * 8);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setAttribute("color", new THREE.BufferAttribute(tint, 4));
        this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
        this.rainPos = pos;
      } else {
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) pos.set([Math.random() * 110 - 55, Math.random() * 42, Math.random() * 90 - 45], i * 3);
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        this.rain = new THREE.Points(
          g,
          new THREE.PointsMaterial({ map: this.dot, color: "#ffffff", size: 0.46, transparent: true, opacity: 0.9, depthWrite: false }),
        );
        this.rainPos = pos;
      }
      this.rain.frustumCulled = false;
      this.group.add(this.rain);
    }
    scene.add(this.group);
  }

  /** Un nuage de poussière, là où un tacle ou une frappe arrache l'herbe */
  puff(x: number, z: number, count = 5, strength = 1) {
    for (let i = 0; i < count; i++) {
      const p = this.puffs[this.puffIndex]!;
      this.puffIndex = (this.puffIndex + 1) % DUST;
      p.max = p.life = 0.45 + Math.random() * 0.35;
      p.vx = (Math.random() - 0.5) * 3 * strength;
      p.vz = (Math.random() - 0.5) * 3 * strength;
      p.sprite.position.set(x + (Math.random() - 0.5) * 0.5, 0.2, z + (Math.random() - 0.5) * 0.5);
      p.sprite.visible = true;
    }
  }

  /** La pluie de confettis sur le but qui vient de tomber */
  celebrate(end: number, colors: string[]) {
    const n = this.confetti.count;
    const c = new THREE.Color();
    this.bits = [];
    for (let i = 0; i < n; i++) {
      this.bits.push({
        p: new THREE.Vector3(end * (HALF_L - 6 - Math.random() * 16), 10 + Math.random() * 16, (Math.random() - 0.5) * (HALF_W * 1.5)),
        v: new THREE.Vector3((Math.random() - 0.5) * 4, -1 - Math.random() * 2.5, (Math.random() - 0.5) * 4),
        a: Math.random() * 6,
        s: 0.7 + Math.random() * 0.7,
      });
      this.confetti.setColorAt(i, c.set(colors[i % colors.length]!));
    }
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
    this.confetti.visible = true;
    this.confettiOn = 6.5;
    this.flashFor = 3.2;
  }

  update(dt: number, t: number, ball: { x: number; y: number; z: number; vx: number; vz: number }, cameraX: number, cameraZ: number) {
    // La traînée n'apparaît que sur les ballons frappés fort
    const speed = Math.hypot(ball.vx, ball.vz);
    this.trailPoints.pop();
    this.trailPoints.unshift(this.trailPoints[this.trailPoints.length - 1]!.clone().set(ball.x, ball.y + 0.08, ball.z));
    const on = speed > 15;
    for (let i = 0; i < TRAIL; i++) {
      const k = on ? (1 - i / TRAIL) * 0.95 : 0;
      this.scale.setScalar(Math.max(0.0001, k));
      this.matrix.compose(this.trailPoints[i]!, this.quat, this.scale);
      this.trail.setMatrixAt(i, this.matrix);
    }
    this.trail.instanceMatrix.needsUpdate = true;

    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const f = Math.max(0, p.life / p.max);
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.z += p.vz * dt;
      p.sprite.position.y += dt * 0.7;
      p.sprite.scale.setScalar(0.55 + (1 - f) * 1.3);
      (p.sprite.material as THREE.SpriteMaterial).opacity = f * 0.6;
      if (p.life <= 0) p.sprite.visible = false;
    }

    if (this.confettiOn > 0) {
      this.confettiOn -= dt;
      const pos = new THREE.Vector3();
      for (let i = 0; i < this.bits.length; i++) {
        const b = this.bits[i]!;
        b.a += dt * 7;
        b.p.addScaledVector(b.v, dt);
        b.p.x += Math.sin(t * 2 + i) * dt * 0.8;
        if (b.p.y < 0.05) b.p.y = 0.05;
        pos.copy(b.p);
        this.quat.setFromEuler(new THREE.Euler(b.a, b.a * 0.7, b.a * 0.4));
        this.scale.setScalar(b.s);
        this.matrix.compose(pos, this.quat, this.scale);
        this.confetti.setMatrixAt(i, this.matrix);
      }
      this.confetti.instanceMatrix.needsUpdate = true;
      this.quat.identity();
      if (this.confettiOn <= 0) this.confetti.visible = false;
    }

    // Les flashs des photographes, dans les tribunes
    if (this.flashFor > 0) this.flashFor -= dt;
    for (const s of this.flashes) {
      const m = s.material as THREE.SpriteMaterial;
      if (m.opacity > 0.01) m.opacity *= Math.exp(-dt * 14);
      else if (s.visible) s.visible = false;
      if (this.flashFor > 0 && Math.random() < dt * 5) {
        const side = Math.random();
        const along = (Math.random() - 0.5) * 130;
        s.position.set(
          side < 0.8 ? along : Math.sign(along) * (HALF_L + 22),
          5 + Math.random() * 18,
          side < 0.8 ? -(HALF_W + 18 + Math.random() * 22) : (Math.random() - 0.5) * 70,
        );
        m.opacity = 1;
        s.visible = true;
      }
    }

    if (this.rain && this.rainPos) {
      const pos = this.rainPos;
      const fall = (this.weather === "pluie" ? 38 : 3.2) * dt;
      const stride = this.weather === "pluie" ? 6 : 3;
      for (let i = 0; i < pos.length; i += stride) {
        pos[i + 1]! -= fall;
        if (this.weather === "neige") pos[i]! += Math.sin(t + i) * dt * 0.6;
        if (stride === 6) {
          pos[i + 4]! -= fall;
          pos[i]! += fall * RAIN_SLANT;
          pos[i + 3]! += fall * RAIN_SLANT;
        }
        if (pos[i + 1]! < 0) {
          pos[i + 1]! += RAIN_TOP;
          if (stride === 6) {
            pos[i + 4]! += RAIN_TOP;
            pos[i]! -= RAIN_TOP * RAIN_SLANT;
            pos[i + 3]! -= RAIN_TOP * RAIN_SLANT;
          }
        }
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      // La pluie suit la caméra : il pleut toujours là où on regarde
      this.rain.position.set(cameraX, 0, cameraZ * 0.3);
    }
  }

  dispose() {
    this.dot.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    this.group.removeFromParent();
  }
}
