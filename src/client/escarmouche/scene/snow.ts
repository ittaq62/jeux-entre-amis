// La neige qui tombe sur le col : des flocons qui descendent doucement en tournoyant autour du joueur, recyclés quand
// ils touchent le sol (une seule géométrie de points, mise à jour à chaque image).

import * as THREE from "three";

export class Snow {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private flakes: { x: number; y: number; z: number; v: number; phase: number; sway: number }[] = [];
  private center = new THREE.Vector3();
  private t = 0;
  private readonly span = 34;
  private readonly height = 16;
  private readonly wind = new THREE.Vector3(0.7, 0, 0.35);

  constructor(count: number) {
    this.pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.flakes.push({
        x: (Math.random() - 0.5) * this.span,
        y: Math.random() * this.height,
        z: (Math.random() - 0.5) * this.span,
        v: 0.7 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        sway: 0.25 + Math.random() * 0.45,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: "#ffffff",
        size: 0.075,
        map: flakeTexture(),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
  }

  /** Les flocons tombent autour de la caméra ; ceux qui sortent de la boîte reviennent de l'autre côté */
  update(dt: number, camera: THREE.Camera) {
    this.t += dt;
    camera.getWorldPosition(this.center);
    const half = this.span / 2;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i]!;
      f.y -= f.v * dt;
      f.x += (this.wind.x + Math.sin(this.t * 1.3 + f.phase) * f.sway) * dt;
      f.z += (this.wind.z + Math.cos(this.t * 1.1 + f.phase) * f.sway) * dt;
      if (f.y < -2) {
        f.y += this.height;
        f.x = (Math.random() - 0.5) * this.span;
        f.z = (Math.random() - 0.5) * this.span;
      }
      if (f.x > half) f.x -= this.span;
      if (f.x < -half) f.x += this.span;
      if (f.z > half) f.z -= this.span;
      if (f.z < -half) f.z += this.span;
      const k = i * 3;
      this.pos[k] = this.center.x + f.x;
      this.pos[k + 1] = Math.max(0.02, this.center.y - 5 + f.y);
      this.pos[k + 2] = this.center.z + f.z;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** Un flocon : un point blanc aux bords doux */
let flake: THREE.CanvasTexture | null = null;
function flakeTexture(): THREE.CanvasTexture {
  if (flake) return flake;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  flake = new THREE.CanvasTexture(c);
  return flake;
}
