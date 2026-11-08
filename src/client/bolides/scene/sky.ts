// Le ciel : un dôme en dégradé (plus clair à l'horizon, plus bleu en haut), le halo du soleil, et des nuages qui
// dérivent lentement. Il suit la caméra : on n'en voit jamais le bord.

import * as THREE from "three";
import type { Theme } from "../../../shared/games/bolides/track.ts";
import { cloudTexture } from "./textures.ts";

/** L'ambiance d'un circuit : les couleurs du ciel (le brouillard prend celle de l'horizon), le soleil et la lumière */
export interface Mood {
  top: number;
  mid: number;
  horizon: number;
  /** D'où vient le soleil */
  dir: THREE.Vector3;
  sun: number;
  sunPower: number;
  hemiSky: number;
  hemiGround: number;
  hemiPower: number;
  /** La teinte des nuages, et la lueur autour du soleil */
  cloud: number;
  glow: number;
  ground: number;
}

export const MOODS: Record<Theme, Mood> = {
  // Le port : un grand matin bleu, très clair
  port: {
    top: 0x2a78d0,
    mid: 0x79b9ec,
    horizon: 0xdff0f9,
    dir: new THREE.Vector3(50, 105, 34).normalize(),
    sun: 0xfff0d8,
    sunPower: 2.0,
    hemiSky: 0xd8ebff,
    hemiGround: 0x6d7a4c,
    hemiPower: 1.2,
    cloud: 0xffffff,
    glow: 0xfff3c8,
    ground: 0x6a8f58,
  },
  // Les vignes : la fin de l'après-midi, une lumière dorée, rasante, de longues ombres
  vignes: {
    top: 0x3a70bc,
    mid: 0xa9c4d6,
    horizon: 0xfad3a0,
    dir: new THREE.Vector3(-72, 58, 46).normalize(),
    sun: 0xffcf96,
    sunPower: 2.7,
    hemiSky: 0xffe6c8,
    hemiGround: 0x7e6a3e,
    hemiPower: 1.0,
    cloud: 0xfff0dc,
    glow: 0xffc27a,
    ground: 0x94935a,
  },
  // Le col : le froid sec de la montagne, un ciel profond, une neige qui éclaire d'en bas
  col: {
    top: 0x2c66bd,
    mid: 0x90b8e6,
    horizon: 0xeef4fb,
    dir: new THREE.Vector3(42, 88, -60).normalize(),
    sun: 0xffffff,
    sunPower: 2.05,
    hemiSky: 0xe2eeff,
    hemiGround: 0xaabbd2,
    hemiPower: 1.32,
    cloud: 0xffffff,
    glow: 0xfff8e8,
    ground: 0xe8eef6,
  },
};

const R = 1000;

export class Sky {
  readonly group = new THREE.Group();
  private clouds: { sprite: THREE.Sprite; a: number; dist: number; speed: number }[] = [];
  private disposables: { dispose: () => void }[] = [];

  constructor(theme: Theme, phone: boolean) {
    const keep = <T extends { dispose: () => void }>(x: T): T => {
      this.disposables.push(x);
      return x;
    };
    const mood = MOODS[theme];
    const sunDir = mood.dir;
    const cTop = new THREE.Color(mood.top);
    const cMid = new THREE.Color(mood.mid);
    const cHor = new THREE.Color(mood.horizon);
    const cGlow = new THREE.Color(mood.glow);
    const geo = keep(new THREE.SphereGeometry(R, 48, 24));
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const t = Math.max(0, v.y);
      c.copy(cHor)
        .lerp(cMid, Math.min(1, Math.pow(t / 0.22, 0.8)))
        .lerp(cTop, Math.max(0, Math.min(1, (t - 0.18) / 0.62)));
      // Autour du soleil, le ciel se réchauffe, surtout près de l'horizon
      const near = Math.pow(Math.max(0, v.dot(sunDir)), 3);
      c.lerp(cGlow, near * (0.25 + 0.55 * (1 - t)));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const dome = new THREE.Mesh(
      geo,
      keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false })),
    );
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);

    // Le halo du soleil
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 128;
    const g = glowCanvas.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,252,236,1)");
    grad.addColorStop(0.12, "rgba(255,246,214,0.95)");
    grad.addColorStop(0.35, "rgba(255,236,190,0.28)");
    grad.addColorStop(1, "rgba(255,236,190,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const glowTex = keep(new THREE.CanvasTexture(glowCanvas));
    glowTex.colorSpace = THREE.SRGBColorSpace;
    const sun = new THREE.Sprite(
      keep(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: new THREE.Color(mood.glow).multiplyScalar(1.5),
          fog: false,
          depthWrite: false,
          toneMapped: false,
          transparent: true,
        }),
      ),
    );
    sun.position.copy(
      sunDir
        .clone()
        .normalize()
        .multiplyScalar(R * 0.9),
    );
    sun.scale.setScalar(260);
    sun.renderOrder = -9;
    this.group.add(sun);

    // Les nuages, en couronne, à des hauteurs variées
    const textures = [1, 2, 3].map((s) => keep(cloudTexture(s * 7)));
    const count = phone ? 9 : 16;
    for (let i = 0; i < count; i++) {
      const mat = keep(
        new THREE.SpriteMaterial({
          map: textures[i % 3]!,
          color: mood.cloud,
          fog: false,
          depthWrite: false,
          toneMapped: false,
          transparent: true,
          opacity: 0.92,
        }),
      );
      const sprite = new THREE.Sprite(mat);
      const w = 170 + ((i * 37) % 130);
      sprite.scale.set(w, w * 0.45, 1);
      const a = (i / count) * Math.PI * 2 + (i % 3) * 0.3;
      const dist = 640 + ((i * 53) % 260);
      sprite.position.set(Math.cos(a) * dist, 130 + ((i * 71) % 180), Math.sin(a) * dist);
      sprite.renderOrder = -8;
      this.group.add(sprite);
      this.clouds.push({ sprite, a, dist, speed: 0.004 + (i % 4) * 0.0015 });
    }
  }

  /** Il suit la caméra (sans monter ni descendre) ; les nuages tournent tout doucement */
  update(camera: THREE.Vector3, time: number) {
    this.group.position.set(camera.x, 0, camera.z);
    for (const c of this.clouds) {
      const a = c.a + time * c.speed;
      c.sprite.position.x = Math.cos(a) * c.dist;
      c.sprite.position.z = Math.sin(a) * c.dist;
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
