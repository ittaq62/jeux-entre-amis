// Un kart dessiné : le châssis à la couleur du pilote, ses roues qui tournent et braquent, le pilote casqué, et ses
// effets (étincelles de dérapage selon le niveau du mini-turbo, flammes de turbo, bouclier, tête-à-queue, saut).

import * as THREE from "three";
import { driftLevel, type Kart } from "../../../shared/games/bolides/physics.ts";
import { sparkTexture } from "./textures.ts";

export interface KartLook {
  color: string;
  name: string;
  /** Son visage (avatar ou photo), déjà dessiné sur une toile */
  face: HTMLCanvasElement | null;
  /** Le kart du joueur lui-même : pas d'étiquette au-dessus */
  me: boolean;
}

const SPARK_COLORS = [0xfff3c4, 0x45c8ff, 0xff9a2e, 0xc77dff];
let sharedSpark: THREE.Texture | null = null;

/** L'étiquette au-dessus d'un kart : son visage dans un rond, et son nom */
function tagCanvas(look: KartLook): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 80;
  const g = c.getContext("2d")!;
  g.font = "700 30px 'Libre Franklin Variable', system-ui, sans-serif";
  const textW = Math.min(220, g.measureText(look.name).width);
  const w = 70 + textW + 22;
  const x = (320 - w) / 2;
  g.fillStyle = "rgba(20,14,10,0.78)";
  g.beginPath();
  g.roundRect(x, 8, w, 64, 32);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(x + 32, 40, 26, 0, Math.PI * 2);
  g.clip();
  if (look.face) g.drawImage(look.face, x + 6, 14, 52, 52);
  else {
    g.fillStyle = look.color;
    g.fillRect(x + 6, 14, 52, 52);
  }
  g.restore();
  g.strokeStyle = look.color;
  g.lineWidth = 4;
  g.beginPath();
  g.arc(x + 32, 40, 26, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#fff";
  g.textBaseline = "middle";
  g.fillText(look.name, x + 66, 41, 220);
  return c;
}

export class KartModel {
  readonly group = new THREE.Group();
  /** Ce qui tourne sur soi, saute et penche, à l'intérieur du kart */
  private body = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private front: THREE.Group[] = [];
  private sparks: THREE.Points[] = [];
  private flames: THREE.Mesh[] = [];
  private shield: THREE.Mesh;
  private tag: THREE.Sprite | null = null;
  private disposables: { dispose: () => void }[] = [];
  private roll = 0;

  constructor(look: KartLook, shadows: boolean) {
    const keep = <T extends { dispose: () => void }>(x: T): T => {
      this.disposables.push(x);
      return x;
    };
    const paint = keep(new THREE.MeshLambertMaterial({ color: look.color }));
    const dark = keep(new THREE.MeshLambertMaterial({ color: 0x2a2c31 }));
    const metal = keep(new THREE.MeshLambertMaterial({ color: 0x9aa1ab }));
    const rubber = keep(new THREE.MeshLambertMaterial({ color: 0x1b1b1e }));
    const skin = keep(new THREE.MeshLambertMaterial({ color: new THREE.Color(look.color).lerp(new THREE.Color(0xffffff), 0.35) }));
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      m.castShadow = shadows;
      this.body.add(m);
      return m;
    };
    // Le châssis, la carrosserie, le nez, le pare-chocs, l'aileron, le moteur
    box(1.5, 0.16, 2.5, dark, 0, 0.28, 0);
    box(1.2, 0.42, 1.5, paint, 0, 0.55, 0.15);
    box(0.95, 0.3, 0.7, paint, 0, 0.46, 1.05);
    box(1.62, 0.2, 0.22, dark, 0, 0.32, 1.38);
    box(0.5, 0.06, 0.2, metal, 0, 0.56, 1.42);
    box(1.6, 0.08, 0.38, paint, 0, 1.08, -1.12);
    box(0.08, 0.5, 0.2, dark, -0.55, 0.82, -1.1);
    box(0.08, 0.5, 0.2, dark, 0.55, 0.82, -1.1);
    box(0.85, 0.42, 0.55, metal, 0, 0.55, -0.9);
    box(0.72, 0.62, 0.14, dark, 0, 0.88, -0.42);
    for (const side of [-0.22, 0.22]) {
      const pipe = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 8)), metal);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(side, 0.5, -1.28);
      this.body.add(pipe);
      // La flamme du turbo
      const flame = new THREE.Mesh(
        keep(new THREE.ConeGeometry(0.13, 0.7, 8)),
        keep(new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 })),
      );
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(side, 0.5, -1.7);
      flame.visible = false;
      this.body.add(flame);
      this.flames.push(flame);
    }
    // Le volant
    const wheelRing = new THREE.Mesh(keep(new THREE.TorusGeometry(0.17, 0.035, 6, 14)), dark);
    wheelRing.position.set(0, 0.92, 0.38);
    wheelRing.rotation.x = -0.6;
    this.body.add(wheelRing);
    // Le pilote : le buste, le casque, et son visage devant
    const torso = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.26, 0.32, 0.6, 10)), skin);
    torso.position.set(0, 1.0, -0.12);
    torso.castShadow = shadows;
    this.body.add(torso);
    const helmet = new THREE.Mesh(keep(new THREE.SphereGeometry(0.34, 16, 12)), paint);
    helmet.position.set(0, 1.55, -0.1);
    helmet.castShadow = shadows;
    this.body.add(helmet);
    const stripe = new THREE.Mesh(
      keep(new THREE.TorusGeometry(0.33, 0.04, 6, 18)),
      keep(new THREE.MeshLambertMaterial({ color: 0xffffff })),
    );
    stripe.position.copy(helmet.position);
    stripe.rotation.y = Math.PI / 2;
    this.body.add(stripe);
    if (look.face) {
      const tex = keep(new THREE.CanvasTexture(look.face));
      tex.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(keep(new THREE.CircleGeometry(0.25, 20)), keep(new THREE.MeshBasicMaterial({ map: tex })));
      face.position.set(0, 1.55, 0.25);
      this.body.add(face);
    }
    // Les roues : celles de devant braquent
    const tyre = keep(new THREE.CylinderGeometry(0.34, 0.34, 0.32, 14));
    tyre.rotateZ(Math.PI / 2);
    const rearTyre = keep(new THREE.CylinderGeometry(0.37, 0.37, 0.4, 14));
    rearTyre.rotateZ(Math.PI / 2);
    const rim = keep(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 10));
    rim.rotateZ(Math.PI / 2);
    for (const [x, z, rear] of [
      [-0.8, 0.85, false],
      [0.8, 0.85, false],
      [-0.84, -0.82, true],
      [0.84, -0.82, true],
    ] as const) {
      const holder = new THREE.Group();
      holder.position.set(x, rear ? 0.37 : 0.34, z);
      const spin = new THREE.Group();
      const t = new THREE.Mesh(rear ? rearTyre : tyre, rubber);
      t.castShadow = shadows;
      spin.add(t);
      const hub = new THREE.Mesh(rim, metal);
      hub.scale.x = rear ? 1.2 : 1;
      spin.add(hub);
      holder.add(spin);
      this.body.add(holder);
      this.wheels.push(spin);
      if (!rear) this.front.push(holder);
    }
    // Les étincelles du dérapage, derrière chaque roue arrière
    sharedSpark ??= sparkTexture();
    for (const x of [-0.85, 0.85]) {
      const geo = keep(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      const pts = new THREE.Points(
        geo,
        keep(
          new THREE.PointsMaterial({
            size: 0.42,
            map: sharedSpark,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            color: 0xffffff,
          }),
        ),
      );
      pts.position.set(x, 0.12, -1.0);
      pts.visible = false;
      this.body.add(pts);
      this.sparks.push(pts);
    }
    // Le bouclier
    this.shield = new THREE.Mesh(
      keep(new THREE.SphereGeometry(1.75, 20, 14)),
      keep(new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.22, depthWrite: false })),
    );
    this.shield.position.y = 0.8;
    this.shield.visible = false;
    this.body.add(this.shield);
    this.group.add(this.body);
    if (!look.me) {
      const tex = keep(new THREE.CanvasTexture(tagCanvas(look)));
      tex.colorSpace = THREE.SRGBColorSpace;
      this.tag = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true })));
      this.tag.scale.set(3.2, 0.8, 1);
      this.tag.position.y = 2.6;
      this.tag.renderOrder = 10;
      this.group.add(this.tag);
    }
  }

  /** Le kart à cet instant : sa place, et ses effets. `steer` : son volant (estimé pour les autres) */
  update(k: Kart, dt: number, steer: number, shielded: boolean, time: number) {
    this.group.position.set(k.x, k.y + k.air + 0.02, k.z);
    this.group.rotation.y = k.h;
    // Le tête-à-queue : deux tours complets sur la durée, le saut au début d'un dérapage, la pente dans les virages
    const spinAngle = k.spin > 0 ? (1 - k.spin / 1.1) * Math.PI * 4 : 0;
    this.body.rotation.y = spinAngle + (k.drift !== 0 ? -k.drift * 0.32 : 0);
    this.body.position.y = k.hop > 0 ? Math.sin((1 - k.hop / 0.22) * Math.PI) * 0.35 : 0;
    this.body.rotation.z += (Math.max(-0.12, Math.min(0.12, k.slip * 0.02)) - this.body.rotation.z) * Math.min(1, dt * 8);
    this.roll += (k.v * dt) / 0.35;
    for (const w of this.wheels) w.rotation.x = this.roll;
    for (const f of this.front) f.rotation.y = -steer * 0.42;
    // Les flammes du turbo, qui vacillent
    const boosting = k.boost > 0;
    for (const f of this.flames) {
      f.visible = boosting;
      if (boosting) f.scale.set(1, 0.8 + Math.random() * 0.6, 1);
    }
    // Les étincelles : leur couleur dit le niveau du mini-turbo qui charge
    const drifting = k.drift !== 0 && k.spin === 0;
    const level = drifting ? driftLevel(k.charge) : 0;
    for (const p of this.sparks) {
      p.visible = drifting;
      if (!drifting) continue;
      (p.material as THREE.PointsMaterial).color.setHex(SPARK_COLORS[level]!);
      (p.material as THREE.PointsMaterial).size = level === 0 ? 0.28 : 0.42 + level * 0.08;
      const arr = (p.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = (Math.random() - 0.5) * 0.5;
        arr[i + 1] = Math.random() * 0.4;
        arr[i + 2] = -Math.random() * 0.9;
      }
      p.geometry.attributes.position!.needsUpdate = true;
    }
    this.shield.visible = shielded;
    if (shielded) (this.shield.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(time * 6) * 0.06;
  }

  /** L'étiquette du nom : visible ou pas (on la cache quand le kart est trop loin ou trop près) */
  showTag(on: boolean) {
    if (this.tag) this.tag.visible = on;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

/** Les couleurs des karts, dans l'ordre des places à la table */
export const KART_COLORS = ["#e2483d", "#2f80ed", "#27ae60", "#f2c94c", "#9b51e0", "#f2994a", "#2fc4c4", "#eb5ea8"];
