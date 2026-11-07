// Un kart dessiné : une coque arrondie à la couleur de sa place, des pontons, des pare-chocs, un aileron qui porte
// le nom du pilote, des roues qui tournent et braquent, le pilote (fait d'après son avatar) au volant, et tout ce
// qui bouge : suspension, tangage, roulis, dérapage, figure en l'air, tête-à-queue, étincelles, flammes, bouclier.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { AvatarConfig } from "../../../shared/avatar.ts";
import { driftLevel, SPIN_TIME, TOP_SPEED, type Kart } from "../../../shared/games/bolides/physics.ts";
import { PilotModel, WHEEL_AT, WHEEL_TILT } from "./pilot.ts";
import { blobTexture, sparkTexture } from "./textures.ts";

export interface KartLook {
  color: string;
  name: string;
  /** Son visage (avatar ou photo), déjà dessiné sur une toile, pour l'étiquette */
  face: HTMLCanvasElement | null;
  /** Son avatar, pour le pilote en 3D, et la peau de sa tête déjà peinte */
  avatar: AvatarConfig;
  head: HTMLCanvasElement | null;
  /** Le kart du joueur lui-même : pas d'étiquette au-dessus */
  me: boolean;
}

/** Ce qu'on sait d'un kart à cette image, en plus de sa conduite */
export interface KartExtras {
  /** Son volant (estimé pour les autres) */
  steer: number;
  shield: boolean;
  /** Arrivé : le pilote fête ça */
  done: boolean;
}

const SPARK_COLORS = [0xfff3c4, 0x45c8ff, 0xff9a2e, 0xc77dff];
/** La hauteur du pivot autour duquel le kart penche, tangue et fait ses figures */
const PIVOT = 0.6;
let sharedSpark: THREE.Texture | null = null;
let sharedBlob: THREE.Texture | null = null;

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

/** L'arrière de l'aileron : le nom du pilote en grand, sur sa couleur */
function spoilerCanvas(look: KartLook): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = look.color;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = "rgba(0,0,0,0.22)";
  g.fillRect(0, 76, 512, 20);
  g.fillStyle = "#fff";
  g.font = "800 60px 'Libre Franklin Variable', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(look.name.toUpperCase(), 256, 42, 480);
  return c;
}

/** La coque : un profil de côté (nez, capot, baquet, plage arrière) étiré sur la largeur, aux bords arrondis */
function hullGeometry(): THREE.ExtrudeGeometry {
  // En (z, y) : l'avant vers les z positifs
  const pts: [number, number][] = [
    [-1.02, 0.3],
    [1.22, 0.3],
    [1.42, 0.4],
    [1.32, 0.52],
    [0.62, 0.62],
    [0.38, 0.64],
    [0.3, 0.5],
    [-0.58, 0.48],
    [-0.66, 0.6],
    [-0.98, 0.66],
    [-1.1, 0.52],
  ];
  const shape = new THREE.Shape();
  pts.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  const width = 0.98;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.07,
    bevelSegments: 4,
    curveSegments: 4,
  });
  // Le profil est dessiné dans le plan (x, y) et étiré le long de z : on le couche pour que x devienne z
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Un pneu au profil arrondi (tourné autour de l'axe x) */
function tyreGeometry(radius: number, width: number): THREE.LatheGeometry {
  const inner = radius * 0.55;
  const w = width / 2;
  const r = Math.min(0.08, w * 0.6);
  const pts: THREE.Vector2[] = [new THREE.Vector2(inner, -w)];
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - r + Math.cos(a) * r, -w + r + Math.sin(a) * r));
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - r + Math.cos(a) * r, w - r + Math.sin(a) * r));
  }
  pts.push(new THREE.Vector2(inner, w));
  const geo = new THREE.LatheGeometry(pts, 20);
  geo.rotateZ(Math.PI / 2);
  return geo;
}

export class KartModel {
  readonly group = new THREE.Group();
  /** Le pivot au milieu du kart : il saute, penche, tangue et tourne sur lui-même ; la caisse est dedans */
  private tilt = new THREE.Group();
  private body = new THREE.Group();
  private pilot: PilotModel;
  private wheels: THREE.Group[] = [];
  private front: THREE.Group[] = [];
  private sparks: THREE.Points[] = [];
  private flames: THREE.Mesh[] = [];
  private flameMat: THREE.MeshBasicMaterial;
  private shield: THREE.Mesh;
  /** L'ombre douce posée sous le kart (elle reste au sol quand il saute) */
  private blob: THREE.Mesh;
  private blobMat: THREE.MeshBasicMaterial;
  private blobAlpha: number;
  private tag: THREE.Sprite | null = null;
  private disposables: { dispose: () => void }[] = [];
  private roll = 0;
  /** La suspension : l'écart et sa vitesse ; le tangage ; le pivot du dérapage ; la figure en cours */
  private squash = 0;
  private squashV = 0;
  private pitch = 0;
  private yawOff = 0;
  private lastV = 0;
  private lastAir = 0;
  private trickT = -1;
  private wasTrick = false;
  /** L'effacement en cours, et l'état d'origine de chaque matière */
  private alpha = 1;
  private solid = new Map<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();

  constructor(look: KartLook, shadows: boolean) {
    const keep = <T extends { dispose: () => void }>(x: T): T => {
      this.disposables.push(x);
      return x;
    };
    const paint = keep(new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.32, metalness: 0.15 }));
    const paintDark = keep(
      new THREE.MeshStandardMaterial({ color: new THREE.Color(look.color).multiplyScalar(0.72), roughness: 0.4, metalness: 0.1 }),
    );
    const dark = keep(new THREE.MeshStandardMaterial({ color: 0x25272c, roughness: 0.6 }));
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0xc5ccd4, roughness: 0.28, metalness: 0.85 }));
    const rubber = keep(new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.92 }));
    const seatMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a2f2a, roughness: 0.8 }));
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, cast = shadows) => {
      const m = new THREE.Mesh(keep(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      this.body.add(m);
      return m;
    };

    // Le plancher, la coque, les pontons de chaque côté, les pare-chocs
    add(new RoundedBoxGeometry(1.36, 0.12, 2.6, 2, 0.05), dark, 0, 0.24, 0.05);
    add(hullGeometry(), paint, 0, 0, 0);
    for (const side of [-1, 1]) {
      const pod = add(new THREE.CapsuleGeometry(0.17, 0.55, 4, 12), paintDark, side * 0.66, 0.42, 0);
      pod.rotation.x = Math.PI / 2;
      pod.scale.set(1, 1, 0.85);
      // Une bande blanche sur le ponton
      const white = keep(new THREE.MeshStandardMaterial({ color: 0xf5f1e8, roughness: 0.4 }));
      const stripe = add(new THREE.CapsuleGeometry(0.172, 0.5, 4, 12), white, side * 0.66, 0.42, 0.05, false);
      stripe.rotation.x = Math.PI / 2;
      stripe.scale.set(1.02, 0.35, 0.87);
    }
    const bumper = (z: number, w: number) => {
      const b = add(new THREE.CapsuleGeometry(0.085, w, 4, 10), dark, 0, 0.3, z);
      b.rotation.z = Math.PI / 2;
    };
    bumper(1.52, 1.1);
    bumper(-1.28, 1.15);
    // Le baquet, le moteur et ses deux pots
    const seat = add(new RoundedBoxGeometry(0.66, 0.62, 0.16, 2, 0.06), seatMat, 0, 0.82, -0.66);
    seat.rotation.x = 0.22;
    add(new RoundedBoxGeometry(0.66, 0.12, 0.6, 2, 0.04), seatMat, 0, 0.56, -0.36, false);
    add(new RoundedBoxGeometry(0.62, 0.34, 0.42, 2, 0.06), metal, 0, 0.78, -1.0);
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12), dark, 0, 0.98, -1.0).rotation.z = Math.PI / 2;
    this.flameMat = keep(new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, depthWrite: false }));
    for (const side of [-0.22, 0.22]) {
      const pipe = add(new THREE.CylinderGeometry(0.075, 0.095, 0.42, 10), metal, side, 0.7, -1.32);
      pipe.rotation.x = Math.PI / 2 + 0.25;
      // La flamme du turbo
      const flame = add(new THREE.ConeGeometry(0.14, 0.8, 10), this.flameMat, side, 0.76, -1.82, false);
      flame.rotation.x = -Math.PI / 2 + 0.25;
      flame.visible = false;
      this.flames.push(flame);
    }
    // L'aileron et ses deux montants ; le nom du pilote à l'arrière
    const nameTex = keep(new THREE.CanvasTexture(spoilerCanvas(look)));
    nameTex.colorSpace = THREE.SRGBColorSpace;
    nameTex.anisotropy = 4;
    const nameMat = keep(new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.35 }));
    // (assez bas pour qu'on voie le pilote de dos, depuis la caméra)
    add(new THREE.BoxGeometry(1.5, 0.26, 0.07), [paint, paint, paint, paint, paint, nameMat], 0, 0.98, -1.24);
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(0.05, 0.08, 0.34), paintDark, side * 0.77, 0.98, -1.22);
      add(new THREE.BoxGeometry(0.06, 0.2, 0.12), dark, side * 0.42, 0.82, -1.19);
    }
    // La colonne de direction, dans l'axe du volant, jusqu'au tableau de bord
    const axis = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(1, 0, 0), WHEEL_TILT);
    const columnAt = WHEEL_AT.clone().addScaledVector(axis, 0.22);
    const column = add(new THREE.CylinderGeometry(0.035, 0.035, 0.44, 8), dark, columnAt.x, columnAt.y, columnAt.z, false);
    column.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);

    // Le pilote et son volant
    this.pilot = new PilotModel(look.avatar, look.head, look.color, keep, shadows);
    this.body.add(this.pilot.group);

    // Les roues : celles de devant braquent
    const frontTyre = keep(tyreGeometry(0.34, 0.32));
    const rearTyre = keep(tyreGeometry(0.38, 0.42));
    const rimGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 14));
    rimGeo.rotateZ(Math.PI / 2);
    const capMat = keep(new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.3, metalness: 0.4 }));
    for (const [x, z, rear] of [
      [-0.8, 0.9, false],
      [0.8, 0.9, false],
      [-0.86, -0.82, true],
      [0.86, -0.82, true],
    ] as const) {
      const r = rear ? 0.38 : 0.34;
      const w = rear ? 0.42 : 0.32;
      const holder = new THREE.Group();
      holder.position.set(x, r, z);
      const spin = new THREE.Group();
      const t = new THREE.Mesh(rear ? rearTyre : frontTyre, rubber);
      t.castShadow = shadows;
      spin.add(t);
      const rim = new THREE.Mesh(rimGeo, metal);
      rim.scale.set(w * 0.9, r * 0.55, r * 0.55);
      spin.add(rim);
      const cap = new THREE.Mesh(rimGeo, capMat);
      cap.scale.set(w * 0.94, r * 0.25, r * 0.25);
      spin.add(cap);
      holder.add(spin);
      this.body.add(holder);
      this.wheels.push(spin);
      if (!rear) this.front.push(holder);
    }

    // Les étincelles du dérapage, derrière chaque roue arrière
    sharedSpark ??= sparkTexture();
    for (const x of [-0.88, 0.88]) {
      const geo = keep(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
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
      pts.position.set(x, 0.12, -1.05);
      pts.visible = false;
      this.body.add(pts);
      this.sparks.push(pts);
    }
    // Le bouclier
    this.shield = new THREE.Mesh(
      keep(new THREE.SphereGeometry(1.85, 22, 16)),
      keep(new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.22, depthWrite: false })),
    );
    this.shield.position.y = 0.85;
    this.shield.visible = false;
    this.body.add(this.shield);
    this.body.position.y = -PIVOT;
    this.tilt.add(this.body);
    this.group.add(this.tilt);
    sharedBlob ??= blobTexture();
    this.blobAlpha = shadows ? 0.4 : 0.7;
    this.blobMat = keep(new THREE.MeshBasicMaterial({ map: sharedBlob, transparent: true, depthWrite: false, opacity: this.blobAlpha }));
    this.blob = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.4, 3.3)), this.blobMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 1;
    this.group.add(this.blob);
    if (!look.me) {
      const tex = keep(new THREE.CanvasTexture(tagCanvas(look)));
      tex.colorSpace = THREE.SRGBColorSpace;
      this.tag = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true })));
      this.tag.scale.set(3.2, 0.8, 1);
      this.tag.position.y = 2.75;
      this.tag.renderOrder = 10;
      this.group.add(this.tag);
    }
  }

  /** Le kart à cet instant : sa place, ce qu'il fait, et ses effets */
  update(k: Kart, dt: number, x: KartExtras, time: number) {
    this.group.position.set(k.x, k.y + k.air + 0.02, k.z);
    this.group.rotation.y = k.h;
    // L'ombre reste sur la route, plus petite et plus pâle quand le kart est haut
    this.blob.position.y = -k.air + 0.07;
    this.blob.scale.setScalar(1 / (1 + k.air * 0.22));
    this.blobMat.opacity = this.blobAlpha / (1 + k.air * 0.6);
    const step = Math.max(1e-3, dt);
    // Le tangage : le nez se lève quand on accélère, plonge au freinage
    const accel = (k.v - this.lastV) / step;
    this.lastV = k.v;
    this.pitch += (Math.max(-0.07, Math.min(0.07, -accel * 0.004)) - this.pitch) * Math.min(1, dt * 6);
    // La suspension : un ressort amorti, secoué à l'atterrissage et dans l'herbe
    if (this.lastAir > 0.35 && k.air === 0) this.squashV -= 2.2 + this.lastAir * 0.8;
    this.lastAir = k.air;
    if (k.offroad && k.v > 4) this.squashV += (Math.random() - 0.5) * 2.4 * Math.min(1, k.v / TOP_SPEED);
    this.squashV += (-this.squash * 220 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    this.squash = Math.max(-0.18, Math.min(0.18, this.squash));
    // La figure : un tonneau complet, le pilote les bras en l'air
    if (k.trick && !this.wasTrick) this.trickT = 0;
    this.wasTrick = k.trick;
    let barrel = 0;
    if (this.trickT >= 0) {
      this.trickT += dt;
      const f = Math.min(1, this.trickT / 0.5);
      barrel = (1 - (1 - f) * (1 - f)) * Math.PI * 2;
      if (f >= 1) this.trickT = -1;
    }
    // Le tête-à-queue : deux tours complets ; le dérapage : le kart pivote vers l'intérieur, en douceur
    const spinAngle = k.spin > 0 ? (1 - k.spin / SPIN_TIME) * Math.PI * 4 : 0;
    this.yawOff += ((k.drift !== 0 ? -k.drift * 0.36 : 0) - this.yawOff) * Math.min(1, dt * 9);
    const hop = k.hop > 0 ? Math.sin((1 - k.hop / 0.22) * Math.PI) * 0.32 : 0;
    this.tilt.position.y = PIVOT + Math.max(0, hop) + this.squash;
    this.tilt.rotation.set(
      this.pitch + (k.air > 0.3 ? -0.08 : 0),
      spinAngle + this.yawOff,
      Math.max(-0.12, Math.min(0.12, k.slip * 0.02)) + barrel,
      "YXZ",
    );
    this.roll += (k.v * dt) / 0.36;
    for (const w of this.wheels) w.rotation.x = this.roll;
    for (const f of this.front) f.rotation.y = -x.steer * 0.45;
    // Les flammes du turbo, qui vacillent
    const boosting = k.boost > 0;
    for (const f of this.flames) {
      f.visible = boosting;
      if (boosting) f.scale.set(1, 0.75 + Math.random() * 0.7, 1);
    }
    if (boosting) this.flameMat.color.setHex(Math.random() < 0.5 ? 0xffb347 : 0xffe07a);
    // Les étincelles : leur couleur dit le niveau du mini-turbo qui charge
    const drifting = k.drift !== 0 && k.spin === 0 && k.air < 0.3;
    const level = drifting ? driftLevel(k.charge) : 0;
    for (const p of this.sparks) {
      p.visible = drifting;
      if (!drifting) continue;
      (p.material as THREE.PointsMaterial).color.setHex(SPARK_COLORS[level]!);
      (p.material as THREE.PointsMaterial).size = level === 0 ? 0.26 : 0.42 + level * 0.1;
      const arr = (p.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = (Math.random() - 0.5) * 0.5;
        arr[i + 1] = Math.random() * 0.45;
        arr[i + 2] = -Math.random() * (0.6 + level * 0.25);
      }
      p.geometry.attributes.position!.needsUpdate = true;
    }
    this.shield.visible = x.shield;
    if (x.shield) (this.shield.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(time * 6) * 0.06;
    // Le pilote : penché dans le virage, plus fort en dérapage
    this.pilot.update({
      steer: k.spin > 0 ? 0 : x.steer,
      drift: k.drift,
      lean: Math.max(-0.26, Math.min(0.26, x.steer * 0.14 + k.drift * 0.1)),
      spinning: k.spin > 0,
      boosting,
      trick: this.trickT >= 0 || (k.trick && k.air > 0),
      celebrate: x.done,
      speed: Math.abs(k.v) / TOP_SPEED,
      time,
      dt,
    });
  }

  /** Le kart s'efface (1 : bien là, 0 : invisible) quand il est collé à la caméra */
  fade(alpha: number) {
    const a = Math.round(alpha * 20) / 20;
    if (a === this.alpha) return;
    this.alpha = a;
    this.group.visible = a > 0;
    this.group.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      if (!mats || o === this.blob || o === this.shield || o instanceof THREE.Points || o instanceof THREE.Sprite) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        if (!this.solid.has(m)) this.solid.set(m, { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
        const base = this.solid.get(m)!;
        m.transparent = a < 1 || base.transparent;
        m.opacity = base.opacity * a;
        m.depthWrite = a >= 1 && base.depthWrite;
      }
    });
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
