// Le ciel : un dôme en dégradé (plus clair à l'horizon, plus bleu en haut), le halo du soleil, et des nuages qui
// dérivent lentement. Il suit la caméra : on n'en voit jamais le bord.

import * as THREE from "three";
import type { Theme } from "../../../shared/games/bolides/track.ts";
import { cloudTexture } from "./textures.ts";

/** Les couleurs du ciel : en haut, et à l'horizon (le brouillard prend celle-ci) */
export const SKY_COLORS: Record<Theme, { top: number; horizon: number }> = {
  port: { top: 0x3b86d4, horizon: 0xd2eaf8 },
  vignes: { top: 0x4a8fd2, horizon: 0xf4e6c8 },
  col: { top: 0x6b9ad0, horizon: 0xedf2f8 },
};

const R = 1000;

export class Sky {
  readonly group = new THREE.Group();
  private clouds: { sprite: THREE.Sprite; a: number; dist: number; speed: number }[] = [];
  private disposables: { dispose: () => void }[] = [];

  constructor(theme: Theme, sunDir: THREE.Vector3, phone: boolean) {
    const keep = <T extends { dispose: () => void }>(x: T): T => {
      this.disposables.push(x);
      return x;
    };
    const { top, horizon } = SKY_COLORS[theme];
    const cTop = new THREE.Color(top);
    const cHor = new THREE.Color(horizon);
    const geo = keep(new THREE.SphereGeometry(R, 32, 16));
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, pos.getY(i) / R);
      c.copy(cHor).lerp(cTop, Math.pow(t, 0.55));
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
      keep(new THREE.SpriteMaterial({ map: glowTex, fog: false, depthWrite: false, toneMapped: false, transparent: true })),
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
