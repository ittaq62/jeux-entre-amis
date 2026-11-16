// La bruine du matin sur la gare : des traits fins qui tombent en biais autour du joueur, recyclés quand ils touchent
// le sol (une seule géométrie, mise à jour à chaque image).

import * as THREE from "three";

export class Rain {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private drops: { x: number; y: number; z: number; v: number }[] = [];
  private center = new THREE.Vector3();
  private readonly span = 26;
  private readonly height = 14;
  private readonly wind = new THREE.Vector3(1.6, 0, 0.9);

  constructor(count: number) {
    this.pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      this.drops.push({
        x: (Math.random() - 0.5) * this.span,
        y: Math.random() * this.height,
        z: (Math.random() - 0.5) * this.span,
        v: 14 + Math.random() * 6,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: "#c9d2d8", transparent: true, opacity: 0.24, depthWrite: false }),
    );
    this.lines.frustumCulled = false;
  }

  /** Les gouttes tombent autour de la caméra ; celles qui sortent de la boîte reviennent de l'autre côté */
  update(dt: number, camera: THREE.Camera) {
    camera.getWorldPosition(this.center);
    const half = this.span / 2;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i]!;
      d.y -= d.v * dt;
      d.x += this.wind.x * dt;
      d.z += this.wind.z * dt;
      if (d.y < -2) {
        d.y += this.height;
        d.x = (Math.random() - 0.5) * this.span;
        d.z = (Math.random() - 0.5) * this.span;
      }
      if (d.x > half) d.x -= this.span;
      if (d.x < -half) d.x += this.span;
      if (d.z > half) d.z -= this.span;
      if (d.z < -half) d.z += this.span;
      const x = this.center.x + d.x;
      const y = Math.max(0, this.center.y - 4 + d.y);
      const z = this.center.z + d.z;
      const len = 0.045 * d.v;
      const k = i * 6;
      this.pos[k] = x;
      this.pos[k + 1] = y;
      this.pos[k + 2] = z;
      this.pos[k + 3] = x - (this.wind.x / d.v) * len;
      this.pos[k + 4] = y + len;
      this.pos[k + 5] = z - (this.wind.z / d.v) * len;
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
