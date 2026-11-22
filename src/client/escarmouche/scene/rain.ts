// La bruine du matin sur la gare : des gouttes fines et clairsemées autour du joueur (un trait court qui s'efface vers
// le haut, pas un rideau de longs traits), qui s'arrêtent sur ce qui est au-dessus d'elles (pas de pluie sous un toit)
// et éclaboussent en touchant le sol près de soi. Les avancées des toits gouttent. Une seule géométrie pour les
// gouttes, une pour les ronds d'éclaboussure, mises à jour à chaque image.

import * as THREE from "three";
import type { World } from "../../../shared/games/escarmouche/world.ts";

interface Drop {
  x: number;
  y: number;
  z: number;
  v: number;
  /** Où elle s'arrête : le sol, ou le toit au-dessus */
  floor: number;
  /** Sa clarté (les gouttes ne se voient pas toutes autant) */
  a: number;
}

interface Splash {
  x: number;
  y: number;
  z: number;
  age: number;
  size: number;
}

/** Une goutte qui tombe du bord d'un toit */
interface Drip {
  x: number;
  y: number;
  z: number;
  v: number;
  floor: number;
}

const SPLASH_LIFE = 0.3;

export class Rain {
  readonly group = new THREE.Group();
  private lines: THREE.LineSegments;
  private pos: Float32Array;
  private col: Float32Array;
  private drops: Drop[] = [];
  private drips: Drip[] = [];
  private splashes: Splash[] = [];
  private rings: THREE.InstancedMesh | null = null;
  private eaves: { x: number; y: number; z: number }[] = [];
  private center = new THREE.Vector3();
  private readonly span = 20;
  private readonly top = 9;
  private wind = new THREE.Vector3(1.1, 0, 0.6);
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();

  /**
   * `count` gouttes à la fois ; `splash` : des éclaboussures et des gouttières (pas en qualité basse). `world` : ce qui
   * arrête la pluie (les toits, les auvents).
   */
  constructor(
    count: number,
    private world: World,
    splash: boolean,
  ) {
    // Deux sommets par goutte, chacun avec sa couleur et sa transparence : le trait s'efface vers le haut ; les
    // gouttières en ont 24 de plus
    const n = count + (splash ? 24 : 0);
    this.pos = new Float32Array(n * 6);
    this.col = new Float32Array(n * 8);
    for (let i = 0; i < count; i++) {
      const d: Drop = { x: 0, y: 0, z: 0, v: 0, floor: 0, a: 0 };
      this.respawn(d, true);
      this.drops.push(d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true }),
    );
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
    if (splash) {
      // Un petit rond qui s'ouvre et s'efface là où la goutte touche
      const ring = new THREE.RingGeometry(0.022, 0.03, 12);
      ring.rotateX(-Math.PI / 2);
      this.rings = new THREE.InstancedMesh(
        ring,
        new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
        48,
      );
      this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.rings.count = 0;
      this.rings.frustumCulled = false;
      this.group.add(this.rings);
      this.findEaves();
    }
  }

  /** Le bord des toits et des auvents (ce qui est en l'air, assez haut), d'où l'eau goutte */
  private findEaves() {
    for (const b of this.world.boxes) {
      if (b.m === "invisible" || b.y0 < 2.2 || b.y0 > 9) continue;
      const w = b.x1 - b.x0;
      const d = b.z1 - b.z0;
      if (w < 1.5 && d < 1.5) continue;
      const step = 0.9;
      for (let x = b.x0 + 0.3; x < b.x1; x += step) {
        this.eaves.push({ x, y: b.y0, z: b.z0 - 0.04 }, { x, y: b.y0, z: b.z1 + 0.04 });
      }
      for (let z = b.z0 + 0.3; z < b.z1; z += step) {
        this.eaves.push({ x: b.x0 - 0.04, y: b.y0, z }, { x: b.x1 + 0.04, y: b.y0, z });
      }
    }
  }

  /** Ce qui arrête une goutte qui tombe en (x, z) depuis `from` : le premier toit au-dessous, ou le sol */
  private floorAt(x: number, z: number, from: number): number {
    const hit = this.world.raycast(x, from, z, 0, -1, 0, from + 2);
    return hit ? from - hit.t : 0;
  }

  /** Une goutte repart : en haut, ou n'importe où entre le haut et ce qui l'arrête (au début, ou si le joueur a bougé) */
  private respawn(d: Drop, anywhere: boolean) {
    // Plus de gouttes près de soi que loin, pour les voir une à une, mais aucune sous le nez (un trait énorme)
    const r = 1.4 + Math.pow(Math.random(), 0.8) * (this.span / 2 - 1.4);
    const a = Math.random() * Math.PI * 2;
    d.x = this.center.x + Math.cos(a) * r;
    d.z = this.center.z + Math.sin(a) * r;
    const top = this.center.y + this.top;
    d.floor = this.floorAt(d.x, d.z, top);
    d.y = anywhere ? d.floor + Math.random() * (top - d.floor) : top;
    d.v = 6.5 + Math.random() * 3.5;
    d.a = 0.2 + Math.random() * 0.32;
  }

  private splash(x: number, y: number, z: number, size: number) {
    if (!this.rings) return;
    if (this.splashes.length >= 48) this.splashes.shift();
    this.splashes.push({ x, y: y + 0.015, z, age: 0, size });
  }

  update(dt: number, camera: THREE.Camera) {
    camera.getWorldPosition(this.center);
    this.t += dt;
    // Le vent tourne un peu et faiblit par moments : les gouttes ne tombent pas toutes du même biais
    this.wind.set(0.9 + Math.sin(this.t * 0.23) * 0.6, 0, 0.5 + Math.sin(this.t * 0.17 + 1.3) * 0.5);
    const half = this.span / 2;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i]!;
      d.y -= d.v * dt;
      d.x += this.wind.x * dt;
      d.z += this.wind.z * dt;
      const dx = d.x - this.center.x;
      const dz = d.z - this.center.z;
      if (d.y <= d.floor) {
        // Elle touche : une éclaboussure si c'est près de soi, puis elle repart d'en haut
        if (dx * dx + dz * dz < 64 && Math.abs(d.floor - this.center.y) < 4 && Math.random() < 0.7) this.splash(d.x, d.floor, d.z, 1);
        this.respawn(d, false);
      } else if (dx * dx + dz * dz > half * half * 1.4 || d.y > this.center.y + this.top + 2) this.respawn(d, true);
      this.segment(i, d.x, d.y, d.z, d.v, d.a);
    }
    // Les gouttières : de temps en temps une goutte se détache d'un bord de toit proche, droite, plus lourde
    if (this.rings) {
      if (this.drips.length < 24 && this.eaves.length > 0) {
        for (let k = 0; k < 6; k++) {
          const e = this.eaves[Math.floor(Math.random() * this.eaves.length)]!;
          const ex = e.x - this.center.x;
          const ez = e.z - this.center.z;
          if (ex * ex + ez * ez > 140 || Math.random() > dt * 9) continue;
          this.drips.push({ x: e.x, y: e.y - 0.02, z: e.z, v: 0.5, floor: this.floorAt(e.x, e.z, e.y - 0.05) });
        }
      }
      for (let k = this.drips.length - 1; k >= 0; k--) {
        const g = this.drips[k]!;
        g.v += 9.8 * dt;
        g.y -= g.v * dt;
        if (g.y <= g.floor) {
          this.splash(g.x, g.floor, g.z, 1.4);
          this.drips.splice(k, 1);
        }
      }
      const base = this.drops.length;
      for (let k = 0; k < 24; k++) {
        const g = this.drips[k];
        if (g) this.segment(base + k, g.x, g.y, g.z, Math.max(3, g.v), 0.5, true);
        else this.segment(base + k, 0, -100, 0, 1, 0);
      }
      // Les ronds : ils s'ouvrent et s'effacent
      let n = 0;
      for (let k = this.splashes.length - 1; k >= 0; k--) {
        const s = this.splashes[k]!;
        s.age += dt;
        if (s.age > SPLASH_LIFE) {
          this.splashes.splice(k, 1);
          continue;
        }
        const f = s.age / SPLASH_LIFE;
        const scale = (1 + f * 2.4) * s.size;
        this.m.compose(this.p.set(s.x, s.y, s.z), this.q, this.s.set(scale, 1, scale));
        this.rings.setMatrixAt(n, this.m);
        this.rings.setColorAt(n, this.c.setScalar((1 - f) * (1 - f) * 0.2));
        n++;
      }
      this.rings.count = n;
      this.rings.instanceMatrix.needsUpdate = true;
      if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.lines.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Le trait d'une goutte : court, clair en bas, transparent en haut (dans le sens de sa chute) */
  private segment(i: number, x: number, y: number, z: number, v: number, a: number, straight = false) {
    const len = straight ? 0.12 + v * 0.012 : 0.1 + v * 0.016;
    const wx = straight ? 0 : this.wind.x / v;
    const wz = straight ? 0 : this.wind.z / v;
    const k = i * 6;
    this.pos[k] = x;
    this.pos[k + 1] = y;
    this.pos[k + 2] = z;
    this.pos[k + 3] = x - wx * len;
    this.pos[k + 4] = y + len;
    this.pos[k + 5] = z - wz * len;
    const c = i * 8;
    this.col[c] = 0.86;
    this.col[c + 1] = 0.9;
    this.col[c + 2] = 0.93;
    this.col[c + 3] = a;
    this.col[c + 4] = 0.86;
    this.col[c + 5] = 0.9;
    this.col[c + 6] = 0.93;
    this.col[c + 7] = 0;
  }

  dispose() {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
    if (this.rings) {
      this.rings.geometry.dispose();
      (this.rings.material as THREE.Material).dispose();
      this.rings.dispose();
    }
  }
}
