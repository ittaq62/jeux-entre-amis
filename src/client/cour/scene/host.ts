// Carillon, la cloche qui présente La Cour des Grands : une cloche d'école dorée avec deux grands yeux, un nœud rouge et
// une petite hélice sur la tête pour voler d'une épreuve à l'autre. Elle se balance en parlant, tinte quand elle annonce,
// et sonne à toute volée pour le départ.

import * as THREE from "three";

export class Carillon {
  readonly group = new THREE.Group();
  private bell = new THREE.Group();
  private clapper: THREE.Mesh;
  private prop: THREE.Group;
  private lids: THREE.Mesh[] = [];
  private ringAt = -1e9;
  private blinkAt = 0;
  readonly pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private look = new THREE.Vector3(0, 0, 1);

  constructor(keep: <T extends { dispose: () => void }>(x: T) => T) {
    const gold = keep(new THREE.MeshStandardMaterial({ color: "#e9b43b", metalness: 0.85, roughness: 0.28 }));
    const dark = keep(new THREE.MeshStandardMaterial({ color: "#7a5512", metalness: 0.7, roughness: 0.4 }));
    const white = keep(new THREE.MeshStandardMaterial({ color: "#fffdf6", roughness: 0.3 }));
    const black = keep(new THREE.MeshStandardMaterial({ color: "#16120c", roughness: 0.3 }));
    const red = keep(new THREE.MeshStandardMaterial({ color: "#d9344d", roughness: 0.55 }));
    const profile: THREE.Vector2[] = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const r = 0.18 + 0.32 * Math.pow(t, 1.6) + 0.12 * Math.max(0, t - 0.82) * 4;
      profile.push(new THREE.Vector2(r, 0.95 - t * 0.95));
    }
    const shell = new THREE.Mesh(keep(new THREE.LatheGeometry(profile, 32)), gold);
    shell.material.side = THREE.DoubleSide;
    this.bell.add(shell);
    const top = new THREE.Mesh(keep(new THREE.SphereGeometry(0.19, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), gold);
    top.position.y = 0.95;
    this.bell.add(top);
    const lip = new THREE.Mesh(keep(new THREE.TorusGeometry(0.61, 0.035, 8, 40)), dark);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.01;
    this.bell.add(lip);
    this.clapper = new THREE.Mesh(keep(new THREE.SphereGeometry(0.1, 12, 10)), dark);
    this.clapper.position.y = 0.05;
    this.bell.add(this.clapper);
    // Les yeux, devant
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11, 16, 12)), white);
      eye.position.set(s * 0.13, 0.55, 0.3);
      eye.scale.set(1, 1.25, 0.6);
      this.bell.add(eye);
      const pupil = new THREE.Mesh(keep(new THREE.SphereGeometry(0.055, 12, 10)), black);
      pupil.position.set(s * 0.13, 0.54, 0.37);
      this.bell.add(pupil);
      const lid = new THREE.Mesh(keep(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), gold);
      lid.position.copy(eye.position);
      lid.scale.set(1, 0.05, 0.62);
      this.bell.add(lid);
      this.lids.push(lid);
    }
    // Le sourire et le nœud
    const smile = new THREE.Mesh(keep(new THREE.TorusGeometry(0.09, 0.016, 6, 16, Math.PI)), black);
    smile.position.set(0, 0.36, 0.42);
    smile.rotation.z = Math.PI;
    this.bell.add(smile);
    for (const s of [-1, 1]) {
      const loop = new THREE.Mesh(keep(new THREE.ConeGeometry(0.1, 0.22, 10)), red);
      loop.rotation.z = (s * Math.PI) / 2;
      loop.position.set(s * 0.12, 1.02, 0.08);
      this.bell.add(loop);
    }
    const knot = new THREE.Mesh(keep(new THREE.SphereGeometry(0.05, 10, 8)), red);
    knot.position.set(0, 1.02, 0.1);
    this.bell.add(knot);
    // L'hélice
    this.prop = new THREE.Group();
    const mast = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8)), dark);
    mast.position.y = 0.11;
    this.prop.add(mast);
    for (let k = 0; k < 3; k++) {
      const blade = new THREE.Mesh(keep(new THREE.BoxGeometry(0.42, 0.012, 0.07)), red);
      blade.position.set(0.21, 0.22, 0);
      const arm = new THREE.Group();
      arm.rotation.y = (k / 3) * Math.PI * 2;
      arm.add(blade);
      this.prop.add(arm);
    }
    this.prop.position.y = 1.0;
    this.bell.add(this.prop);
    this.bell.traverse((o) => (o.castShadow = true));
    this.group.add(this.bell);
    this.group.scale.setScalar(1.6);
  }

  /** Où elle vole, et vers quoi elle regarde */
  fly(x: number, y: number, z: number, lookX: number, lookZ: number, snap = false) {
    this.target.set(x, y, z);
    this.look.set(lookX - x, 0, lookZ - z);
    if (snap) this.pos.copy(this.target);
  }

  ring(now: number) {
    this.ringAt = now;
  }

  update(now: number, dt: number) {
    this.pos.lerp(this.target, Math.min(1, dt * 2.2));
    const t = now / 1000;
    this.group.position.set(this.pos.x, this.pos.y + Math.sin(t * 2.1) * 0.15, this.pos.z);
    this.group.rotation.y = Math.atan2(this.look.x, this.look.z);
    const r = (now - this.ringAt) / 1000;
    const swing = r < 1.6 ? Math.sin(r * 22) * 0.45 * (1 - r / 1.6) : Math.sin(t * 1.7) * 0.06;
    this.bell.rotation.z = swing;
    this.clapper.position.x = -Math.sin(swing * 2) * 0.3;
    this.prop.rotation.y = t * 26;
    if (now > this.blinkAt) this.blinkAt = now + 2200 + Math.random() * 2600;
    const blink = this.blinkAt - now < 140 ? 1 : 0.05;
    for (const l of this.lids) l.scale.y = blink;
  }
}
