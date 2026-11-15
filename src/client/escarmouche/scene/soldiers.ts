// Les soldats vus par les autres : un corps simple en treillis, casque et brassard aux couleurs de son camp, l'arme
// dans son camouflage. Ils marchent, courent, s'accroupissent, visent haut ou bas, rechargent, et tombent.

import * as THREE from "three";
import { AVATAR_SKINS, type AvatarConfig } from "../../../shared/avatar.ts";
import type { CamoId } from "../../../shared/games/escarmouche/camos.ts";
import type { WeaponId } from "../../../shared/games/escarmouche/weapons.ts";
import { buildGun, type Gun } from "./guns.ts";

/** Les couleurs d'un camp : le treillis, le brassard */
export interface Kit {
  uniform: string;
  dark: string;
  band: string;
}

export const TEAM_KITS: [Kit, Kit] = [
  { uniform: "#706447", dark: "#4f4733", band: "#c8392d" },
  { uniform: "#4c5763", dark: "#353d46", band: "#2f6fd0" },
];

/** En chacun pour soi : le même treillis, un brassard de couleur différente pour chacun */
const FFA_BANDS = ["#d64535", "#2f6fd0", "#e3b02a", "#2e9d59", "#9b4fd0", "#e07a2a", "#1fb5b0", "#e75fa0"];
export function ffaKit(i: number): Kit {
  return { uniform: "#59603f", dark: "#3f442c", band: FFA_BANDS[i % FFA_BANDS.length]! };
}

export interface SoldierPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Vitesse au sol (m/s) */
  speed: number;
  crouch: boolean;
  ground: boolean;
  sprint: boolean;
  ads: boolean;
  reload: boolean;
  alive: boolean;
  weapon: WeaponId;
  carrying: number;
  shield: boolean;
}

const lambert = (c: string) => new THREE.MeshLambertMaterial({ color: c });

function part(w: number, h: number, d: number, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class SoldierModel {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private spine = new THREE.Group();
  private head = new THREE.Group();
  private aim = new THREE.Group();
  private legs: { thigh: THREE.Group; shin: THREE.Group }[] = [];
  private gun: Gun | null = null;
  private gunKey = "";
  private flag: THREE.Group;
  private flagCloth: THREE.Mesh;
  private phase = 0;
  private deadFor = -1;
  private mats: THREE.MeshLambertMaterial[] = [];
  readonly kit: Kit;
  private camo: CamoId;
  private low: boolean;
  /** Le temps depuis le dernier coup tiré, pour le recul de l'arme */
  private kick = 0;
  /** Pour viser les tirs des autres : là où naît la balle */
  readonly muzzle = new THREE.Vector3();

  constructor(kit: Kit, avatar: AvatarConfig, camo: CamoId, low: boolean) {
    this.kit = kit;
    this.camo = camo;
    this.low = low;
    const uni = lambert(kit.uniform);
    const dark = lambert(kit.dark);
    const band = lambert(kit.band);
    const skin = lambert(AVATAR_SKINS[avatar.skin] ?? AVATAR_SKINS[0]!);
    const boots = lambert("#1f1c18");
    const vest = lambert("#3b3a2c");
    this.mats.push(uni, dark, band, skin, boots, vest);

    this.root.add(this.hips);
    this.hips.position.y = 0.95;
    // Les jambes : cuisse et tibia, articulés aux hanches et aux genoux
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.11, 0, 0);
      this.hips.add(thigh);
      part(0.15, 0.46, 0.17, dark, thigh, 0, -0.23, 0);
      const shin = new THREE.Group();
      shin.position.y = -0.46;
      thigh.add(shin);
      part(0.13, 0.42, 0.15, uni, shin, 0, -0.21, 0);
      part(0.14, 0.09, 0.24, boots, shin, 0, -0.44, -0.04);
      this.legs.push({ thigh, shin });
    }
    // Le buste, le gilet, le brassard
    this.hips.add(this.spine);
    part(0.38, 0.5, 0.22, uni, this.spine, 0, 0.27, 0);
    part(0.4, 0.34, 0.25, vest, this.spine, 0, 0.32, 0);
    part(0.36, 0.09, 0.2, dark, this.spine, 0, 0.03, 0);
    // La tête et le casque
    this.head.position.y = 0.58;
    this.spine.add(this.head);
    part(0.2, 0.22, 0.2, skin, this.head, 0, 0.1, 0);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, low ? 8 : 12, low ? 5 : 8, 0, Math.PI * 2, 0, Math.PI / 2), uni);
    helmet.position.y = 0.17;
    helmet.scale.set(1, 0.85, 1.08);
    helmet.castShadow = true;
    this.head.add(helmet);
    part(0.31, 0.035, 0.33, band, this.head, 0, 0.19, 0);
    // Les bras et l'arme : ils suivent la visée
    this.aim.position.set(0, 0.46, 0);
    this.spine.add(this.aim);
    const upperR = part(0.11, 0.3, 0.11, uni, this.aim, 0.2, -0.1, -0.06);
    upperR.rotation.x = 0.9;
    part(0.115, 0.07, 0.115, band, upperR, 0, 0.05, 0);
    const foreR = part(0.1, 0.28, 0.1, uni, this.aim, 0.13, -0.2, -0.28);
    foreR.rotation.set(1.45, 0, 0.5);
    const upperL = part(0.11, 0.3, 0.11, uni, this.aim, -0.2, -0.08, -0.12);
    upperL.rotation.set(1.2, 0, -0.3);
    const foreL = part(0.1, 0.3, 0.1, uni, this.aim, -0.06, -0.12, -0.42);
    foreL.rotation.set(1.6, 0, -0.9);
    part(0.09, 0.09, 0.09, dark, this.aim, 0.06, -0.2, -0.38);
    part(0.09, 0.09, 0.09, dark, this.aim, -0.02, -0.12, -0.56);
    // Le drapeau porté dans le dos
    this.flag = new THREE.Group();
    this.flag.position.set(0.12, 0.3, 0.14);
    this.flag.visible = false;
    this.spine.add(this.flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 5), lambert("#3a3a3a"));
    pole.position.y = 0.45;
    this.flag.add(pole);
    this.flagCloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.32),
      new THREE.MeshLambertMaterial({ color: "#fff", side: THREE.DoubleSide }),
    );
    this.flagCloth.position.set(0.25, 0.95, 0);
    this.flag.add(this.flagCloth);
  }

  private setGun(weapon: WeaponId) {
    const key = `${weapon}:${this.camo}`;
    if (key === this.gunKey) return;
    if (this.gun) this.aim.remove(this.gun.group);
    this.gun = buildGun(weapon, this.camo, this.low);
    this.gun.group.position.set(0.08, -0.16, -0.3);
    this.aim.add(this.gun.group);
    this.gunKey = key;
  }

  setCamo(camo: CamoId) {
    if (camo === this.camo) return;
    this.camo = camo;
    this.gunKey = "";
  }

  /** Il vient de tirer */
  fired() {
    this.kick = 1;
  }

  update(p: SoldierPose, dt: number, flagColor: string | null) {
    this.setGun(p.weapon);
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.set(0, p.yaw, 0);
    if (!p.alive) {
      // Il tombe en arrière, reste un moment au sol, puis disparaît
      if (this.deadFor < 0) this.deadFor = 0;
      this.deadFor += dt;
      const f = Math.min(1, this.deadFor / 0.45);
      this.hips.rotation.x = -f * f * 1.45;
      this.hips.position.y = 0.95 - f * 0.62;
      this.root.visible = this.deadFor < 3.2;
      this.flag.visible = false;
      return;
    }
    this.deadFor = -1;
    this.root.visible = true;
    this.hips.rotation.x = 0;
    const run = Math.min(1.3, p.speed / 4.8);
    this.phase += dt * (3 + p.speed * 1.9);
    const swing = Math.sin(this.phase) * 0.62 * run;
    const crouch = p.crouch ? 1 : 0;
    const hipY = 0.95 - crouch * 0.36;
    this.hips.position.y += (hipY - this.hips.position.y) * Math.min(1, dt * 14);
    for (const [k, leg] of this.legs.entries()) {
      const s = k === 0 ? 1 : -1;
      if (!p.ground) {
        leg.thigh.rotation.x = 0.6;
        leg.shin.rotation.x = -0.9;
      } else if (p.crouch) {
        leg.thigh.rotation.x = 1.15 + s * swing * 0.4 + (k === 0 ? 0.3 : 0);
        leg.shin.rotation.x = -1.75 - (k === 0 ? 0.25 : 0);
      } else {
        leg.thigh.rotation.x = s * swing;
        leg.shin.rotation.x = -Math.max(0, -s * Math.cos(this.phase) * 0.9 * run) - 0.05;
      }
    }
    // Le haut du corps : il se penche en courant, l'arme baissée ; il vise haut ou bas
    const lean = p.sprint ? 0.25 : crouch * 0.12;
    this.spine.rotation.x = -lean;
    const lower = p.sprint ? -0.65 : p.reload ? -0.35 : 0;
    this.kick = Math.max(0, this.kick - dt * 8);
    this.aim.rotation.x = p.pitch * 0.9 + lower + this.kick * 0.08;
    this.head.rotation.x = p.pitch * 0.4 + lean * 0.5;
    if (this.gun) {
      this.gun.group.rotation.z = p.reload ? 0.6 : 0;
      this.gun.group.position.z = -0.3 + this.kick * 0.05;
      this.gun.muzzle.getWorldPosition(this.muzzle);
    }
    // Le drapeau dans le dos, qui flotte
    this.flag.visible = p.carrying >= 0 && flagColor !== null;
    if (this.flag.visible) {
      (this.flagCloth.material as THREE.MeshLambertMaterial).color.set(flagColor!);
      this.flagCloth.rotation.y = Math.sin(this.phase * 0.7) * 0.4;
    }
    // Celui qui vient d'arriver clignote un peu : il ne craint rien pendant ce temps-là
    this.root.visible = !p.shield || Math.floor(performance.now() / 120) % 3 !== 0;
  }

  /** Où est sa tête (pour son nom) */
  headWorld(out: THREE.Vector3) {
    return this.head.getWorldPosition(out);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
  }
}

/** Le nom d'un soldat au-dessus de sa tête */
export function nameSprite(name: string, color: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "600 30px 'Libre Franklin Variable', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0,0,0,.7)";
  g.strokeText(name.slice(0, 16), 128, 32);
  g.fillStyle = color;
  g.fillText(name.slice(0, 16), 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(1.2, 0.3, 1);
  return s;
}
