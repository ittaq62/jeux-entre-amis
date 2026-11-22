// Les billes en 3D : une sphère vernie par bille (sa couleur, son bandeau, ses numéros), qui reflète la lampe et la
// salle ; une petite ombre douce au contact du tapis ; leur rotation suit la physique (on voit les numéros rouler, le
// rétro tourner à l'envers). Une bille tombée descend dans la poche et se pose au fond du filet.

import * as THREE from "three";
import type { TableKind } from "../../../shared/games/billard/table.ts";
import { ballCanvas, tex } from "./textures.ts";

export interface BallView {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  /** La bille est en train de tomber dans une poche : d'où, vers où, depuis quand */
  drop: { from: THREE.Vector3; to: THREE.Vector3; at: number } | null;
}

let shadowTex: THREE.CanvasTexture | null = null;
function contactShadow(): THREE.CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.75)");
  grd.addColorStop(0.35, "rgba(0,0,0,0.45)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

/** L'orientation de départ de chaque bille : les numéros tournés un peu au hasard (toujours les mêmes) */
function startQuat(id: number): THREE.Quaternion {
  const e = new THREE.Euler(((id * 1.7) % 3.1) - 1.5, (id * 2.3) % 6.28, ((id * 0.9) % 1.2) - 0.6);
  return new THREE.Quaternion().setFromEuler(e);
}

export class BallSet {
  readonly group = new THREE.Group();
  readonly balls = new Map<number, BallView>();
  private geo: THREE.SphereGeometry;
  private shadowGeo: THREE.PlaneGeometry;
  private shadowMat: THREE.MeshBasicMaterial;
  private mats: THREE.Material[] = [];
  private maps: THREE.Texture[] = [];
  private q = new THREE.Quaternion();
  private axis = new THREE.Vector3();

  constructor(
    readonly kind: TableKind,
    readonly R: number,
    ids: readonly number[],
    set: string,
    touch: boolean,
  ) {
    this.group.name = "billes";
    this.geo = touch ? new THREE.SphereGeometry(R, 24, 16) : new THREE.SphereGeometry(R, 32, 24);
    this.shadowGeo = new THREE.PlaneGeometry(R * 3.2, R * 3.2);
    this.shadowGeo.rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false, opacity: 0.85 });
    for (const id of ids) this.add(id, set);
  }

  private add(id: number, set: string) {
    const carom = this.kind === "carambole";
    const map = tex(ballCanvas(id, set, carom));
    this.maps.push(map);
    const metal = set === "metal" && !carom && id !== 0;
    const mat = new THREE.MeshPhysicalMaterial({
      map,
      roughness: metal ? 0.22 : 0.07,
      metalness: metal ? 0.85 : 0,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      ...(set === "neon" && id !== 0 && !carom ? { emissive: new THREE.Color("#ffffff"), emissiveMap: map, emissiveIntensity: 0.35 } : {}),
    });
    this.mats.push(mat);
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.name = `bille-${id}`;
    mesh.quaternion.copy(startQuat(id));
    mesh.userData.reflect = true;
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.renderOrder = 2;
    this.group.add(mesh, shadow);
    this.balls.set(id, { mesh, shadow, drop: null });
  }

  /** Le reflet que voient les billes (la table d'au-dessus du tapis) */
  setEnv(env: THREE.Texture) {
    for (const m of this.mats) {
      (m as THREE.MeshPhysicalMaterial).envMap = env;
      m.needsUpdate = true;
    }
  }

  /** Une bille posée sur le tapis (coordonnées de la physique) */
  place(id: number, x: number, y: number) {
    const b = this.balls.get(id);
    if (!b) return;
    b.drop = null;
    b.mesh.visible = true;
    b.shadow.visible = true;
    b.mesh.position.set(x, this.R, -y);
    b.shadow.position.set(x, 0.0012, -y);
  }

  hide(id: number) {
    const b = this.balls.get(id);
    if (!b) return;
    b.drop = null;
    b.mesh.visible = false;
    b.shadow.visible = false;
  }

  /** Toutes les billes du tapis à leur place ; les autres cachées */
  setAll(spots: readonly { id: number; x: number; y: number }[]) {
    const on = new Set(spots.map((s) => s.id));
    for (const id of this.balls.keys()) if (!on.has(id)) this.hide(id);
    for (const s of spots) this.place(s.id, s.x, s.y);
  }

  /** Les billes reprennent leur orientation de départ (une nouvelle manche) */
  resetSpin() {
    for (const [id, b] of this.balls) b.mesh.quaternion.copy(startQuat(id));
  }

  /** La bille tourne comme la physique le dit pendant dt secondes (ω de la physique : x, y sur le tapis, z vers le haut) */
  spin(id: number, wx: number, wy: number, wz: number, dt: number) {
    const b = this.balls.get(id);
    if (!b) return;
    // (x, y, z) de la physique → (x, z, −y) de three
    this.axis.set(wx, wz, -wy);
    const w = this.axis.length();
    if (w < 1e-6) return;
    this.axis.multiplyScalar(1 / w);
    this.q.setFromAxisAngle(this.axis, w * dt);
    b.mesh.quaternion.premultiply(this.q);
  }

  /** La bille tombe dans la poche : de là où elle est, jusqu'au fond du filet */
  dropInto(id: number, to: THREE.Vector3, now: number) {
    const b = this.balls.get(id);
    if (!b) return;
    b.drop = { from: b.mesh.position.clone(), to: to.clone(), at: now };
    b.shadow.visible = false;
  }

  /** Les billes qui tombent, à l'instant `now` (secondes) */
  update(now: number) {
    for (const b of this.balls.values()) {
      if (!b.drop) continue;
      const k = Math.min(1, (now - b.drop.at) / 0.45);
      const e = k * k;
      b.mesh.position.lerpVectors(b.drop.from, b.drop.to, Math.min(1, k * 1.3));
      // Elle plonge : d'abord à peine, puis d'un coup
      b.mesh.position.y = b.drop.from.y + (b.drop.to.y - b.drop.from.y) * e;
      if (k >= 1) {
        b.mesh.position.copy(b.drop.to);
        b.drop = null;
      }
    }
  }

  dispose() {
    this.geo.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.maps) t.dispose();
  }
}
