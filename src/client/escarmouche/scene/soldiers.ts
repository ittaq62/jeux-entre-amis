// Les soldats vus par les autres : chacun a la tête de son personnage de profil (son teint, ses yeux, sa bouche, ses
// lunettes, sa coiffure, son chapeau) et porte la tenue qu'il a choisie : la sienne (aux couleurs de son portrait) ou
// une tenue militaire, avec son motif, son gilet et ses poches, son casque. Le foulard et les brassards disent son
// camp. Il marche, court, s'accroupit, vise haut ou bas, recharge, et tombe.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { AVATAR_BACKGROUNDS, AVATAR_HAIR_COLORS, AVATAR_SKINS, type AvatarConfig } from "../../../shared/avatar.ts";
import type { CamoId } from "../../../shared/games/escarmouche/camos.ts";
import { UNIFORM_BY_ID, type UniformId, type UniformInfo } from "../../../shared/games/escarmouche/uniforms.ts";
import type { WeaponId } from "../../../shared/games/escarmouche/weapons.ts";
import { headCanvas } from "../../bolides/scene/faces.ts";
import { hairGeometry, hatGroup } from "../../bolides/scene/pilot.ts";
import { fuse } from "./fuse.ts";
import { buildGun, NO_GEAR, type Gear, type Gun } from "./guns.ts";
import { clothTexture } from "./textures.ts";
import { outfitCoat, outfitExtras, wearHair, wearHat } from "./wardrobe3d.ts";

/** La couleur d'un camp (ou d'un soldat en chacun pour soi) : son foulard, ses brassards, la bande de son casque */
export interface Kit {
  band: string;
}

export const TEAM_KITS: [Kit, Kit] = [{ band: "#c8392d" }, { band: "#2f6fd0" }];

/** En chacun pour soi : un foulard de couleur différente pour chacun */
const FFA_BANDS = ["#d64535", "#2f6fd0", "#e3b02a", "#2e9d59", "#9b4fd0", "#e07a2a", "#1fb5b0", "#e75fa0"];
export function ffaKit(i: number): Kit {
  return { band: FFA_BANDS[i % FFA_BANDS.length]! };
}

/** Qui il est : son personnage, sa tenue, sa couleur, le camouflage de ses armes */
export interface SoldierLook {
  avatar: AvatarConfig;
  tenue: UniformId;
  band: string;
  camo: CamoId;
  /** Les accessoires de son arme principale */
  gear?: Gear;
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
  /** En train de glisser, de se hisser */
  slide?: boolean;
  mantle?: boolean;
  alive: boolean;
  weapon: WeaponId;
  carrying: number;
  shield: boolean;
  /** Sa chute : vers où le coup l'a poussé (dans le monde), une balle dans la tête, le souffle d'une explosion */
  fall?: { dx: number; dz: number; head: boolean; blast: boolean };
}

type Keep = <T extends { dispose: () => void }>(x: T) => T;

/** La tête du personnage, dépliée sur une toile : faite une fois par personnage (c'est un dessin de React) */
const heads = new Map<string, Promise<HTMLCanvasElement>>();
export function headOf(avatar: AvatarConfig): Promise<HTMLCanvasElement> {
  const key = JSON.stringify(avatar);
  let p = heads.get(key);
  if (!p) {
    p = headCanvas(avatar);
    heads.set(key, p);
    if (heads.size > 40) heads.delete(heads.keys().next().value!);
  }
  return p;
}

/**
 * Le rayon de la tête du soldat (un peu plus grosse que nature : on reconnaît le personnage de loin, et elle remplit sa
 * zone de touche), et celui des têtes de pilote dont on reprend la coiffure et le chapeau
 */
const HEAD_R = 0.15;
const PILOT_R = 0.34;

const std = (keep: Keep, color: THREE.ColorRepresentation, roughness = 0.85, metalness = 0, map: THREE.Texture | null = null) =>
  keep(new THREE.MeshStandardMaterial({ color: map ? "#ffffff" : color, map, roughness, metalness }));

/** Les matières d'une tenue (la sienne prend la couleur de fond de son portrait) */
export interface UniformMats {
  coat: THREE.MeshStandardMaterial;
  trousers: THREE.MeshStandardMaterial;
  vest: THREE.MeshStandardMaterial | null;
  pouch: THREE.MeshStandardMaterial;
  boots: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  belt: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial | null;
  helmet: THREE.MeshStandardMaterial | null;
  /** Mains nues (sa propre tenue) ou gantées */
  bare: boolean;
}

export function uniformMats(u: UniformInfo, avatar: AvatarConfig, keep: Keep): UniformMats {
  // Sa propre tenue reprend celle de son personnage : la couleur de son portrait, ou ce qu'il porte (chemise, marinière…)
  const own = u.id === "perso" ? outfitCoat(avatar.wear?.outfit) : {};
  const coatColor = own.stripes?.[0] ?? own.coat ?? u.coat ?? AVATAR_BACKGROUNDS[avatar.bg] ?? AVATAR_BACKGROUNDS[0]!;
  const coatTex = own.stripes ? clothTexture(own.stripes[0], [own.stripes[1]], "rayures") : clothTexture(coatColor, u.spots, u.pattern);
  const trouserTex = clothTexture(
    u.trousers,
    u.spots.map((c) => darken(c, 0.92)),
    u.pattern === "feuillu" ? "taches" : u.pattern,
  );
  const skinColor = AVATAR_SKINS[avatar.skin] ?? AVATAR_SKINS[0]!;
  const bare = u.id === "perso";
  return {
    coat: std(keep, coatColor, 0.9, 0, coatTex),
    trousers: std(keep, u.trousers, 0.9, 0, trouserTex),
    vest: u.vest ? std(keep, u.vest, 0.8) : null,
    pouch: std(keep, u.vest ? darken(u.vest, 0.82) : darken(coatColor, 0.7), 0.85),
    boots: std(keep, u.boots, 0.6),
    glove: std(keep, bare ? skinColor : u.id === "parade" ? "#eeeae0" : "#26231f", bare ? 0.7 : 0.75),
    skin: std(keep, skinColor, 0.7),
    belt: std(keep, u.id === "parade" ? "#ece6d6" : "#2b2722", 0.7),
    accent: u.accent ? std(keep, u.accent, 0.35, u.id === "parade" ? 0.8 : 0.2) : null,
    helmet: u.helmet ? std(keep, u.helmet, 0.8, 0, clothTexture(u.helmet, u.spots, u.pattern === "feuillu" ? "taches" : u.pattern)) : null,
    bare,
  };
}

function darken(hex: string, k: number): string {
  return `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
}

function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function capsule(r: number, len: number, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, seg), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Un segment de membre (une capsule) tendu entre deux points */
export function segment(from: THREE.Vector3, to: THREE.Vector3, r: number, mat: THREE.Material, parent: THREE.Object3D, seg = 10) {
  const d = new THREE.Vector3().subVectors(to, from);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - r), 3, seg), mat);
  m.position.copy(from).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  parent.add(m);
  return m;
}

/** Le coude, pour aller de l'épaule à la main avec deux segments de même longueur, plié vers `bend` */
export function elbow(shoulder: THREE.Vector3, hand: THREE.Vector3, len: number, bend: THREE.Vector3): THREE.Vector3 {
  const d = new THREE.Vector3().subVectors(hand, shoulder);
  const dist = Math.min(d.length(), len * 2 * 0.999);
  const mid = shoulder.clone().addScaledVector(d.clone().normalize(), dist / 2);
  const h = Math.sqrt(Math.max(0, len * len - (dist / 2) * (dist / 2)));
  const n = d.clone().normalize();
  const b = bend.clone().addScaledVector(n, -bend.dot(n)).normalize();
  return mid.addScaledVector(b, h);
}

/** La tête du personnage, au rayon des pilotes (on la met à l'échelle ensuite) : crâne, oreilles, coiffure, chapeau ou casque */
function buildHead(avatar: AvatarConfig, u: UniformInfo, band: THREE.Material, m: UniformMats, keep: Keep, low: boolean) {
  const R = PILOT_R;
  const g = new THREE.Group();
  const skull = new THREE.Mesh(keep(new THREE.SphereGeometry(R, low ? 18 : 28, low ? 12 : 18)), m.skin);
  skull.userData.keep = true;
  g.add(skull);
  // Un fin liseré sombre autour du visage : la tête se détache du décor, même de loin
  const rim = new THREE.Mesh(keep(new THREE.SphereGeometry(R * 1.05, low ? 14 : 22, low ? 10 : 14)), outlineMaterial());
  g.add(rim);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(keep(new THREE.SphereGeometry(R * 0.24, 8, 6)), m.skin);
    ear.position.set(side * R * 0.97, -R * 0.05, -R * 0.05);
    ear.scale.set(0.55, 1, 0.85);
    g.add(ear);
  }
  const helmet = m.helmet;
  // Ce qu'il porte de la garde-robe remplace la coiffure et le chapeau de base (sous un casque, on garde la coiffure courte)
  const wornHat = helmet ? undefined : avatar.wear?.hat;
  const wornHair = helmet ? undefined : avatar.wear?.hair;
  const hatCoversTop =
    helmet !== null ||
    (wornHat
      ? ["melon", "chantier", "toque", "helice", "tricorne", "sorcier", "viking"].includes(wornHat)
      : [1, 2, 4, 5, 7].includes(avatar.hat));
  const hairColor = AVATAR_HAIR_COLORS[avatar.hairColor] ?? AVATAR_HAIR_COLORS[0]!;
  const extraHair = wearHair(wornHair, R, hairColor, keep);
  if (extraHair) g.add(extraHair);
  const hairGeo = extraHair ? null : hairGeometry(avatar.hair, hatCoversTop);
  if (hairGeo) {
    const hairMat = keep(
      new THREE.MeshStandardMaterial({
        color: AVATAR_HAIR_COLORS[avatar.hairColor] ?? AVATAR_HAIR_COLORS[0]!,
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    const hair = new THREE.Mesh(keep(hairGeo), hairMat);
    hair.userData.keep = true;
    g.add(hair);
  }
  if (helmet) {
    // Le casque : une coque couverte de toile, son rebord, la jugulaire, et la bande du camp
    const shell = new THREE.Mesh(keep(new THREE.SphereGeometry(R * 1.2, low ? 14 : 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.52)), helmet);
    shell.position.y = R * 0.08;
    shell.scale.set(1, 0.92, 1.06);
    g.add(shell);
    const rim = new THREE.Mesh(keep(new THREE.CylinderGeometry(R * 1.24, R * 1.28, R * 0.08, low ? 14 : 22)), helmet);
    rim.position.y = R * 0.03;
    rim.scale.z = 1.06;
    g.add(rim);
    const strip = new THREE.Mesh(keep(new THREE.CylinderGeometry(R * 1.205, R * 1.225, R * 0.2, low ? 14 : 22, 1, true)), band);
    strip.position.y = R * 0.32;
    strip.scale.z = 1.06;
    g.add(strip);
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(keep(new THREE.BoxGeometry(R * 0.06, R * 0.9, R * 0.08)), m.belt);
      strap.position.set(side * R * 0.96, -R * 0.35, R * 0.1);
      strap.rotation.z = side * 0.12;
      g.add(strap);
    }
  } else {
    const hat = wornHat ? wearHat(wornHat, R, keep) : hatGroup(avatar.hat, keep, true);
    if (hat) g.add(hat);
  }
  if (u.id === "nuit") {
    // Les lunettes de vision nocturne, relevées sur le front
    const dark = std(keep, "#15171b", 0.5, 0.4);
    const lensMat = keep(
      new THREE.MeshStandardMaterial({ color: "#2a4a70", emissive: u.accent ?? "#3d5a80", emissiveIntensity: 0.7, roughness: 0.1 }),
    );
    const mount = new THREE.Mesh(keep(new THREE.BoxGeometry(R * 0.5, R * 0.22, R * 0.3)), dark);
    mount.position.set(0, R * 0.78, R * 0.82);
    g.add(mount);
    for (const side of [-1, 1]) {
      const tube = new THREE.Mesh(keep(new THREE.CylinderGeometry(R * 0.14, R * 0.16, R * 0.42, 10)), dark);
      tube.rotation.x = Math.PI / 2 - 0.5;
      tube.position.set(side * R * 0.2, R * 0.92, R * 1.02);
      g.add(tube);
      const lens = new THREE.Mesh(keep(new THREE.CircleGeometry(R * 0.13, 10)), lensMat);
      lens.position.set(side * R * 0.2, R * 1.03, R * 1.2);
      lens.rotation.x = -0.5;
      g.add(lens);
    }
    const strap = new THREE.Mesh(keep(new THREE.TorusGeometry(R * 1.02, R * 0.05, 6, 20)), dark);
    strap.rotation.x = Math.PI / 2 - 0.25;
    strap.position.y = R * 0.42;
    g.add(strap);
  }
  // La tête de pilote regarde vers +z ; le soldat, vers -z
  g.rotation.y = Math.PI;
  g.scale.setScalar(HEAD_R / PILOT_R);
  return { group: g, skull };
}

/** La matière du liseré : sombre, vue de l'intérieur (seul son bord dépasse autour de la tête) */
let outline: THREE.MeshBasicMaterial | null = null;
function outlineMaterial(): THREE.MeshBasicMaterial {
  outline ??= new THREE.MeshBasicMaterial({ color: "#16120f", side: THREE.BackSide });
  return outline;
}

/** Des touffes de feuillage cousues sur la tenue */
function leaves(parent: THREE.Object3D, spots: string[], keep: Keep, at: [number, number, number][], seed: number) {
  const mats = spots.map((c) => std(keep, c, 0.95));
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (const [x, y, z] of at) {
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.045 + r() * 0.03, 0)), mats[k % mats.length]!);
      m.position.set(x + (r() - 0.5) * 0.06, y + (r() - 0.5) * 0.06, z + (r() - 0.5) * 0.06);
      m.scale.set(1, 0.55 + r() * 0.4, 1);
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      parent.add(m);
    }
  }
}

export class SoldierModel {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private spine = new THREE.Group();
  private head = new THREE.Group();
  private aim = new THREE.Group();
  private arms = new THREE.Group();
  private legs: { thigh: THREE.Group; shin: THREE.Group }[] = [];
  private gun: Gun | null = null;
  private gunKey = "";
  private flag: THREE.Group;
  private flagCloth: THREE.Mesh;
  private phase = 0;
  private deadFor = -1;
  private fallSide = 1;
  /** Sa chute : en arrière ou en avant, le quart de tour qu'il fait en tombant, d'où il part et vers où */
  private fallBack = true;
  private fallTwist = 0;
  private fallYaw = 0;
  private fallDir = { dx: 0, dz: 1, head: false, blast: false };
  private disposables: { dispose: () => void }[] = [];
  private mats: UniformMats;
  private bandMat: THREE.MeshStandardMaterial;
  private camo: CamoId;
  private gear: Gear = NO_GEAR;
  private low: boolean;
  private alive = true;
  /** Caché depuis qu'on l'a vu : s'il réapparaît à terre, c'est qu'il est tombé hors de vue (pas de chute à rejouer) */
  private unseen = false;
  /** Le temps depuis le dernier coup tiré, pour le recul de l'arme */
  private kick = 0;
  /** Touché : il tressaille (le buste rejeté, la tête qui part), d'autant plus fort à la tête */
  private flinch = 0;
  private flinchSide = 1;
  private flinchHead = false;
  /** Pour viser les tirs des autres : là où naît la balle */
  readonly muzzle = new THREE.Vector3();
  readonly key: string;

  constructor(look: SoldierLook, low: boolean) {
    this.camo = look.camo;
    this.gear = look.gear ?? NO_GEAR;
    this.low = low;
    this.key = soldierKey(look);
    const keep: Keep = (x) => {
      this.disposables.push(x);
      return x;
    };
    const u = UNIFORM_BY_ID.get(look.tenue) ?? UNIFORM_BY_ID.get("perso")!;
    const m = uniformMats(u, look.avatar, keep);
    this.mats = m;
    this.bandMat = std(keep, look.band, 0.7);
    const seg = low ? 6 : 10;

    this.root.add(this.hips);
    this.hips.position.y = 0.95;
    // Le bassin et le ceinturon
    rbox(0.36, 0.22, 0.22, 0.07, m.trousers, this.hips, 0, 0.0, 0);
    rbox(0.345, 0.055, 0.215, 0.02, m.belt, this.hips, 0, 0.1, 0);
    rbox(0.05, 0.04, 0.02, 0.008, m.accent ?? m.pouch, this.hips, 0, 0.1, -0.11);
    if (u.vest) {
      rbox(0.07, 0.08, 0.06, 0.015, m.pouch, this.hips, -0.15, 0.06, 0.06);
      rbox(0.07, 0.08, 0.06, 0.015, m.pouch, this.hips, 0.15, 0.06, 0.06);
    }
    // Les jambes : cuisse et tibia, articulés aux hanches et aux genoux ; genouillères et rangers
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.095, 0, 0);
      this.hips.add(thigh);
      capsule(0.086, 0.3, m.trousers, thigh, 0, -0.22, 0, seg);
      if (u.vest) rbox(0.07, 0.12, 0.05, 0.015, m.pouch, thigh, side * 0.07, -0.2, 0.0);
      const shin = new THREE.Group();
      shin.position.y = -0.46;
      thigh.add(shin);
      capsule(0.072, 0.3, m.trousers, shin, 0, -0.2, 0, seg);
      if (u.id !== "parade" && u.id !== "perso") rbox(0.1, 0.11, 0.05, 0.02, m.vest ?? m.pouch, shin, 0, -0.02, -0.06);
      rbox(0.12, 0.13, 0.25, 0.035, m.boots, shin, 0, -0.415, -0.035);
      rbox(0.126, 0.03, 0.265, 0.01, std(keep, "#141210", 0.9), shin, 0, -0.475, -0.035);
      this.legs.push({ thigh, shin });
    }
    // Le buste, les épaules, le gilet et ses poches, le foulard du camp
    this.hips.add(this.spine);
    const torso = capsule(0.16, 0.24, m.coat, this.spine, 0, 0.31, 0, seg + 2);
    torso.scale.set(1.14, 1, 0.8);
    const shoulders = capsule(0.075, 0.27, m.coat, this.spine, 0, 0.47, 0, seg);
    shoulders.rotation.z = Math.PI / 2;
    capsule(0.05, 0.05, m.skin, this.spine, 0, 0.56, 0, seg);
    const scarf = new THREE.Mesh(keep(new THREE.TorusGeometry(0.075, 0.03, 6, 14)), this.bandMat);
    scarf.rotation.x = Math.PI / 2 + 0.25;
    scarf.position.set(0, 0.53, -0.01);
    this.spine.add(scarf);
    if (m.vest) {
      rbox(0.37, 0.34, 0.27, 0.05, m.vest, this.spine, 0, 0.31, 0);
      for (const x of [-0.095, 0, 0.095]) rbox(0.078, 0.105, 0.05, 0.015, m.pouch, this.spine, x, 0.21, -0.15);
      rbox(0.12, 0.07, 0.04, 0.012, m.pouch, this.spine, -0.08, 0.38, -0.145);
      rbox(0.11, 0.19, 0.07, 0.02, m.pouch, this.spine, 0.02, 0.33, 0.16);
      const antenna = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004, 0.004, 0.32, 4)), m.belt);
      antenna.position.set(0.06, 0.55, 0.17);
      this.spine.add(antenna);
    } else {
      // Une veste : deux poches de poitrine, une rangée de boutons
      for (const x of [-0.08, 0.08]) rbox(0.095, 0.085, 0.025, 0.01, m.pouch, this.spine, x, 0.37, -0.13);
      for (let k = 0; k < 4; k++)
        rbox(0.018, 0.018, 0.012, 0.005, m.accent ?? m.pouch, this.spine, u.id === "parade" ? -0.05 : 0, 0.42 - k * 0.07, -0.14);
      if (u.id === "parade") {
        for (let k = 0; k < 4; k++) rbox(0.018, 0.018, 0.012, 0.005, m.accent ?? m.pouch, this.spine, 0.05, 0.42 - k * 0.07, -0.14);
        for (const side of [-1, 1]) rbox(0.1, 0.025, 0.12, 0.01, m.accent ?? m.pouch, this.spine, side * 0.2, 0.53, 0);
        const collar = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 12, 1, true)), m.accent ?? m.pouch);
        collar.position.y = 0.55;
        this.spine.add(collar);
      }
    }
    // Dans sa propre tenue : la capuche, la cape, le collier de fleurs, le nœud du smoking, l'armure… de son personnage
    if (u.id === "perso") {
      const extras = outfitExtras(look.avatar.wear?.outfit, AVATAR_BACKGROUNDS[look.avatar.bg] ?? AVATAR_BACKGROUNDS[0]!, keep);
      if (extras) this.spine.add(extras);
    }
    if (u.pattern === "feuillu")
      leaves(
        this.spine,
        u.spots,
        keep,
        [
          [-0.2, 0.5, 0],
          [0.2, 0.5, 0],
          [0, 0.45, 0.16],
          [-0.12, 0.3, 0.17],
          [0.12, 0.25, 0.16],
          [0, 0.6, 0.08],
        ],
        7,
      );
    // La tête du personnage
    this.head.position.y = 0.62;
    this.spine.add(this.head);
    const head = buildHead(look.avatar, u, this.bandMat, m, keep, low);
    head.group.position.y = 0.075;
    this.head.add(head.group);
    if (u.pattern === "feuillu" && look.avatar.hat === 0)
      leaves(
        this.head,
        u.spots,
        keep,
        [
          [0, 0.24, 0.03],
          [-0.09, 0.21, 0.06],
          [0.09, 0.21, 0.06],
        ],
        11,
      );
    void headOf(look.avatar).then((c) => {
      if (this.disposables.length === 0) return;
      const tex = keep(new THREE.CanvasTexture(c));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      // Le visage s'éclaire un peu de lui-même : il ne se perd pas dans l'ombre d'un mur ou sous un casque
      const face = keep(
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.2 }),
      );
      head.skull.material = face;
    });
    // Les bras et l'arme : ils suivent la visée (les bras sont posés sur l'arme quand elle change)
    this.aim.position.set(0, 0.46, 0);
    this.spine.add(this.aim);
    this.aim.add(this.arms);
    // Le drapeau porté dans le dos
    this.flag = new THREE.Group();
    this.flag.position.set(0.12, 0.3, 0.16);
    this.flag.visible = false;
    this.spine.add(this.flag);
    const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 5)), std(keep, "#3a3a3a", 0.6, 0.4));
    pole.position.y = 0.45;
    this.flag.add(pole);
    this.flagCloth = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(0.5, 0.32)),
      keep(new THREE.MeshLambertMaterial({ color: "#fff", side: THREE.DoubleSide })),
    );
    this.flagCloth.position.set(0.25, 0.95, 0);
    this.flagCloth.userData.keep = true;
    this.flag.add(this.flagCloth);

    fuse(this.root);
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        this.disposables.push(o.geometry);
      }
    });
  }

  /** Les bras, posés sur l'arme : la main droite à la poignée, la gauche sous le garde-main (ou sur la poignée) */
  private poseArms(gun: Gun) {
    for (const c of [...this.arms.children]) {
      this.arms.remove(c);
      if (c instanceof THREE.Mesh) c.geometry.dispose();
    }
    const m = this.mats;
    const seg = this.low ? 6 : 8;
    const at = gun.group.position;
    const right = { shoulder: new THREE.Vector3(0.19, 0.0, -0.02), hand: new THREE.Vector3(at.x, at.y - 0.03, at.z + 0.01) };
    const front = gun.pistol ? 0 : Math.max(gun.front, -0.34);
    const left = {
      shoulder: new THREE.Vector3(-0.19, 0.0, -0.02),
      hand: gun.pistol ? new THREE.Vector3(at.x - 0.03, at.y - 0.04, at.z + 0.0) : new THREE.Vector3(at.x, at.y + 0.02, at.z + front),
    };
    for (const [arm, bend] of [
      [right, new THREE.Vector3(1, -1.2, 0.3)],
      [left, new THREE.Vector3(-1, -1.4, 0.2)],
    ] as const) {
      // La main ne peut pas aller plus loin que le bras
      const reach = 0.58;
      const d = arm.hand.clone().sub(arm.shoulder);
      if (d.length() > reach) arm.hand.copy(arm.shoulder).addScaledVector(d.normalize(), reach);
      const e = elbow(arm.shoulder, arm.hand, 0.3, bend);
      segment(arm.shoulder, e, 0.056, m.coat, this.arms, seg);
      segment(e, arm.hand, 0.048, m.coat, this.arms, seg);
      // Le brassard du camp, en haut du bras
      const band = new THREE.Vector3().lerpVectors(arm.shoulder, e, 0.35);
      segment(band.clone().lerp(arm.shoulder, 0.12), band.clone().lerp(e, 0.12), 0.06, this.bandMat, this.arms, seg);
      const hand = rbox(0.075, 0.085, 0.095, 0.03, m.glove, this.arms, arm.hand.x, arm.hand.y, arm.hand.z);
      hand.rotation.x = 0.3;
    }
    fuse(this.arms);
    this.arms.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  private setGun(weapon: WeaponId) {
    const key = `${weapon}:${this.camo}:${this.gear.muzzle}:${this.gear.extra}`;
    if (key === this.gunKey) return;
    if (this.gun) {
      this.aim.remove(this.gun.group);
      this.gun.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.gun = buildGun(weapon, this.camo, this.low, this.gear);
    this.gun.group.position.set(0.08, -0.16, this.gun.pistol ? -0.36 : -0.3);
    this.aim.add(this.gun.group);
    this.poseArms(this.gun);
    this.gunKey = key;
  }

  setCamo(camo: CamoId, gear: Gear = NO_GEAR) {
    if (camo === this.camo && gear.muzzle === this.gear.muzzle && gear.extra === this.gear.extra) return;
    this.camo = camo;
    this.gear = gear;
    this.gunKey = "";
  }

  /** Il vient de tirer */
  fired() {
    this.kick = 1;
  }

  /** Il vient d'être touché (à la tête ou non) */
  hit(head: boolean) {
    this.flinch = 1;
    this.flinchHead = head;
    this.flinchSide = Math.random() < 0.5 ? -1 : 1;
  }

  /** Hors de vue : on ne le montre plus */
  hide() {
    this.root.visible = false;
    this.unseen = true;
  }

  update(p: SoldierPose, dt: number, flagColor: string | null) {
    this.setGun(p.weapon);
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.set(0, p.yaw, 0);
    if (!p.alive) {
      this.fallDown(p, dt);
      this.flag.visible = false;
      this.alive = false;
      this.unseen = false;
      return;
    }
    this.unseen = false;
    if (!this.alive) {
      this.hips.rotation.set(0, 0, 0);
      this.hips.position.set(0, 0.95, 0);
      this.spine.rotation.set(0, 0, 0);
      this.head.rotation.set(0, 0, 0);
      this.aim.rotation.set(0, 0, 0);
      if (this.gun) this.gun.group.rotation.set(0, 0, 0);
      this.alive = true;
    }
    this.deadFor = -1;
    this.root.visible = true;
    const run = Math.min(1.3, p.speed / 4.8);
    this.phase += dt * (3 + p.speed * 1.9);
    const swing = Math.sin(this.phase) * 0.62 * run;
    const crouch = p.crouch ? 1 : 0;
    // Le bassin monte et descend à chaque pas
    const hipY = 0.95 - crouch * 0.36 + (p.ground ? Math.abs(Math.cos(this.phase)) * 0.035 * run : 0);
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
    // La glissade : assis sur une hanche, une jambe tendue devant, le buste en arrière ; l'escalade : penché, les jambes repliées
    if (p.slide || p.mantle) {
      const [front, back] = this.legs;
      if (p.slide) {
        this.hips.position.y += (0.42 - this.hips.position.y) * Math.min(1, dt * 18);
        front!.thigh.rotation.x = 1.45;
        front!.shin.rotation.x = -0.15;
        back!.thigh.rotation.x = 0.9;
        back!.shin.rotation.x = -1.9;
        this.spine.rotation.x = 0.45;
      } else {
        front!.thigh.rotation.x = 1.3;
        front!.shin.rotation.x = -1.6;
        back!.thigh.rotation.x = 0.4;
        back!.shin.rotation.x = -1.1;
        this.spine.rotation.x = -0.45;
      }
      this.spine.rotation.y = 0;
      this.aim.rotation.x = p.slide ? p.pitch * 0.9 - 0.35 : -0.9;
      this.head.rotation.x = p.pitch * 0.4 + (p.slide ? -0.3 : 0.3);
      if (this.gun) this.gun.muzzle.getWorldPosition(this.muzzle);
      this.flag.visible = p.carrying >= 0 && flagColor !== null;
      this.root.visible = !p.shield || Math.floor(performance.now() / 120) % 3 !== 0;
      return;
    }
    // Le haut du corps : il se penche en courant, l'arme baissée ; il vise haut ou bas ; les épaules tournent un peu au pas
    const lean = p.sprint ? 0.25 : crouch * 0.12;
    this.spine.rotation.x = -lean;
    this.spine.rotation.y = Math.sin(this.phase) * 0.07 * run;
    const lower = p.sprint ? -0.65 : p.reload ? -0.35 : 0;
    this.kick = Math.max(0, this.kick - dt * 8);
    this.aim.rotation.x = p.pitch * 0.9 + lower + this.kick * 0.08;
    this.head.rotation.x = p.pitch * 0.4 + lean * 0.5;
    // Le coup encaissé : un sursaut bref du buste et de la tête, qui revient aussitôt
    if (this.flinch > 0) {
      this.flinch = Math.max(0, this.flinch - dt * 7);
      const f = Math.sin(this.flinch * Math.PI) * this.flinch;
      this.spine.rotation.x += f * (this.flinchHead ? 0.12 : 0.22);
      this.spine.rotation.z = f * 0.12 * this.flinchSide;
      this.head.rotation.x += f * (this.flinchHead ? 0.45 : 0.12);
      this.head.rotation.z = f * (this.flinchHead ? 0.3 : 0.08) * this.flinchSide;
    } else {
      this.spine.rotation.z = 0;
      this.head.rotation.z = 0;
    }
    if (this.gun) {
      this.gun.group.rotation.z = p.reload ? 0.6 : 0;
      this.gun.group.position.z = (this.gun.pistol ? -0.36 : -0.3) + this.kick * 0.05;
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

  /**
   * La chute : le coup le pousse (il recule d'un pas, le buste rejeté), les genoux lâchent, il pivote vers où il
   * tombe et bascule, en arrière si le coup venait de devant, en avant s'il venait de dos ; il touche le sol avec un
   * petit rebond, la tête ballotte. Une balle dans la tête : il s'effondre net. Une explosion : il est projeté.
   */
  private fallDown(p: SoldierPose, dt: number) {
    if (this.deadFor < 0) {
      // Tombé pendant qu'on ne le voyait pas : il est déjà à terre
      this.deadFor = this.unseen ? 1.5 : 0;
      this.fallSide = Math.random() < 0.5 ? -1 : 1;
      const ang = Math.random() * Math.PI * 2;
      this.fallDir = p.fall ?? { dx: Math.sin(ang), dz: Math.cos(ang), head: false, blast: false };
      // La poussée, vue depuis le soldat (l'avant est vers -z)
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      const lx = this.fallDir.dx * c - this.fallDir.dz * s;
      const lz = this.fallDir.dx * s + this.fallDir.dz * c;
      this.fallBack = lz >= 0;
      const tw = this.fallBack ? Math.atan2(lx, lz) : Math.atan2(-lx, -lz);
      this.fallTwist = Math.max(-1, Math.min(1, tw));
      this.fallYaw = p.yaw;
    }
    this.deadFor += dt;
    const { dx, dz, head, blast } = this.fallDir;
    const t = this.deadFor * (head ? 1.35 : 1);
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const smooth = (v: number) => {
      const k = clamp(v);
      return k * k * (3 - 2 * k);
    };
    // Un petit dépassement à l'arrivée au sol, puis il se pose
    const land = (v: number) => {
      const k = clamp(v);
      const c1 = 1.9;
      return 1 + (c1 + 1) * (k - 1) ** 3 + c1 * (k - 1) ** 2;
    };
    const sign = this.fallBack ? 1 : -1;
    // Il glisse un peu dans le sens du coup ; une explosion le soulève et le jette plus loin
    const push = (blast ? 1.5 : head ? 0.25 : 0.5) * (1 - (1 - clamp(t / 0.7)) ** 2);
    const lift = blast ? Math.sin(Math.PI * clamp(t / 0.55)) * 0.55 : 0;
    this.root.position.set(p.x + dx * push, p.y + lift, p.z + dz * push);
    this.root.rotation.set(0, this.fallYaw + this.fallTwist * smooth(t / 0.6), 0);
    // Le coup : le buste rejeté (sauf une balle dans la tête : tout lâche d'un coup)
    const jolt = head ? 0 : Math.sin(Math.PI * clamp(t / 0.16)) * 0.4;
    // Les genoux lâchent
    const buckle = smooth((t - (head ? 0 : 0.06)) / 0.38);
    // Il bascule et touche le sol
    const topple = land((t - 0.28) / 0.5);
    const flat = smooth((t - 0.28) / 0.5);
    this.hips.rotation.set(sign * 1.45 * topple, 0, this.fallSide * 0.22 * flat);
    this.hips.position.set(0, 0.95 - buckle * 0.38 - flat * 0.4, 0);
    this.spine.rotation.set(sign * (jolt + 0.15 * flat), this.fallSide * 0.12 * flat, 0);
    // Les jambes plient en tombant, puis se détendent au sol
    for (const [k, leg] of this.legs.entries()) {
      const bend = buckle * (1 - flat * 0.65);
      leg.thigh.rotation.x = bend * (k === 0 ? 0.95 : 0.55) + flat * (this.fallBack ? 0.15 : -0.1) * (k === 0 ? 1 : -1);
      leg.shin.rotation.x = -bend * (k === 0 ? 1.5 : 0.9);
    }
    // Les bras lâchent l'arme qui pend, puis retombent au sol : au-dessus de la tête sur le dos, le long du corps face
    // contre terre
    this.aim.rotation.set(-0.9 * buckle * (1 - flat) + (this.fallBack ? 1.85 : -1.25) * flat, 0, 0);
    if (this.gun) this.gun.group.rotation.set(0, 0, 1.2 * buckle);
    // La tête suit avec un temps de retard, et ballotte un peu au choc
    const after = t - 0.78;
    const wobble = after > 0 ? Math.sin(after * 17) * Math.exp(-after * 6) * 0.35 : 0;
    this.head.rotation.set(sign * (0.35 * buckle + 0.25 * flat) + wobble, this.fallSide * 0.4 * flat, 0);
    // Le corps reste là tant qu'un coéquipier peut venir le relever
    this.root.visible = this.deadFor < 9;
  }

  /** Où est sa tête (pour son nom) */
  headWorld(out: THREE.Vector3) {
    return this.head.getWorldPosition(out);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

/** Ce qui fait qu'un soldat doit être refait : son personnage, sa tenue, sa couleur */
export function soldierKey(look: SoldierLook): string {
  return `${look.tenue}|${look.band}|${JSON.stringify(look.avatar)}`;
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
