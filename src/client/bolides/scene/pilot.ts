// Le pilote assis dans son kart, fait d'après l'avatar du joueur : sa tête au teint et aux traits de l'avatar, sa
// coiffure et son chapeau en volume, un maillot à la couleur de son fond d'avatar, des gants sur le volant et une
// écharpe qui flotte. Il vit : il tourne le volant, regarde dans le virage, penche, a la tête qui tourne après un
// coup, lève les bras pour une figure ou à l'arrivée.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { AVATAR_BACKGROUNDS, AVATAR_HAIR_COLORS, AVATAR_SKINS, type AvatarConfig } from "../../../shared/avatar.ts";
import { mergeStatic } from "./merge.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

/** Ce que fait le pilote à cette image */
export interface PilotState {
  /** Le volant, de -1 (à gauche) à 1 (à droite) */
  steer: number;
  /** Le dérapage en cours (1 : vers la droite) */
  drift: -1 | 0 | 1;
  /** Le pilote penche dans le virage, en radians (positif : vers la droite) */
  lean: number;
  /** Il tourne sur lui-même après un coup */
  spinning: boolean;
  boosting: boolean;
  /** En pleine figure, en l'air */
  trick: boolean;
  /** Arrivé : il fête ça */
  celebrate: boolean;
  /** La vitesse, en part de la vitesse de pointe */
  speed: number;
  time: number;
  dt: number;
}

/** La tête : son rayon, et où est son centre au-dessus du siège */
const R = 0.34;
const HEAD_Y = 1.5;
const HIPS = new THREE.Vector3(0, 0.56, -0.3);
/** Le volant, au bout de sa colonne, penché vers le pilote */
export const WHEEL_AT = new THREE.Vector3(0, 0.98, 0.32);
/** Le volant regarde le pilote : son axe monte vers lui (vers l'arrière et le haut) */
export const WHEEL_TILT = 0.52;
const WHEEL_R = 0.18;
const UPPER = 0.34;
const FORE = 0.34;

const std = (color: THREE.ColorRepresentation, roughness = 0.7, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Un point de la sphère de la tête : `theta` depuis le haut, `phi` autour (π/2 : le devant, vers +z) */
function onHead(theta: number, phi: number, r = R): THREE.Vector3 {
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

/** Une calotte de sphère : le dessus de la tête jusqu'à `theta`, sauf `gap` radians de part et d'autre du devant */
function shell(r: number, theta: number, gap = 0): THREE.BufferGeometry {
  if (gap <= 0) return new THREE.SphereGeometry(r, 28, 12, 0, Math.PI * 2, 0, theta);
  return new THREE.SphereGeometry(r, 28, 14, Math.PI / 2 + gap, Math.PI * 2 - 2 * gap, 0, theta);
}

/** La coiffure (0 : rien), en une seule forme ; null si chauve */
function hairGeometry(kind: number, hatCoversTop: boolean): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  // La base de presque toutes les coiffures : une calotte sur le dessus et l'arrière, qui laisse le visage libre
  const base = () => {
    parts.push(shell(R * 1.06, Math.PI * 0.36));
    parts.push(shell(R * 1.05, Math.PI * 0.6, 0.95));
  };
  const blob = (r: number, at: THREE.Vector3, scale = new THREE.Vector3(1, 1, 1), rot = new THREE.Euler()) => {
    const g = new THREE.SphereGeometry(r, 14, 10);
    g.applyMatrix4(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(rot), scale));
    parts.push(g);
  };
  switch (kind) {
    case 1: // court
      base();
      break;
    case 2: // raie sur le côté : une mèche qui retombe sur un côté du front
      base();
      blob(R * 0.42, onHead(0.42, Math.PI / 2 - 0.45, R * 0.96), new THREE.Vector3(1.25, 0.42, 0.9), new THREE.Euler(0.5, 0, -0.35));
      break;
    case 3: // boucles : des petites boules partout sur le dessus et l'arrière
      for (let i = 0; i < 22; i++) {
        const theta = 0.12 + (i % 4) * 0.42 + (i % 3) * 0.05;
        const phi = Math.PI / 2 + 0.95 + ((i * 2.399) % (Math.PI * 2 - 1.9));
        blob(R * 0.32, onHead(Math.min(1.75, theta), i < 4 ? Math.PI / 2 + (i - 1.5) * 0.5 : phi, R * 1.0));
      }
      blob(R * 0.36, onHead(0.05, 0, R * 1.0));
      break;
    case 4: // long : jusqu'aux épaules dans le dos
      base();
      blob(R * 0.95, new THREE.Vector3(0, -R * 0.75, -R * 0.38), new THREE.Vector3(1.05, 1.15, 0.55));
      break;
    case 5: // chignon
      base();
      if (!hatCoversTop) blob(R * 0.38, onHead(0.55, -Math.PI / 2, R * 1.1));
      break;
    case 6: // crête : une rangée de pointes du front à la nuque
      if (hatCoversTop) {
        base();
        break;
      }
      for (let i = 0; i < 6; i++) {
        const theta = -0.55 + i * 0.36;
        const at = onHead(Math.abs(theta), theta < 0 ? Math.PI / 2 : -Math.PI / 2, R * 0.95);
        const out = at.clone().normalize();
        const g = new THREE.ConeGeometry(R * 0.26, R * (1.05 - Math.abs(i - 2) * 0.1), 8);
        g.translate(0, R * 0.4, 0);
        g.applyMatrix4(
          new THREE.Matrix4().compose(
            at,
            new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out),
            new THREE.Vector3(1, 1, 0.6),
          ),
        );
        parts.push(g);
      }
      break;
    case 7: // queue de cheval
      base();
      blob(R * 0.34, onHead(1.25, -Math.PI / 2, R * 1.12), new THREE.Vector3(0.75, 1.5, 0.75), new THREE.Euler(-0.5, 0, 0));
      break;
    default:
      return null;
  }
  // Toutes les pièces n'ont pas les mêmes attributs (les cônes n'ont pas d'index) : on les met d'accord
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) if (g.index) g.dispose();
  const merged = mergeGeometries(flat, false);
  for (const g of flat) g.dispose();
  return merged;
}

/** Le chapeau (0 : aucun), posé sur la tête */
function hatGroup(kind: number, keep: Keep, shadows: boolean): THREE.Group | null {
  if (kind === 0) return null;
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = shadows;
    g.add(m);
    return m;
  };
  const top = R * 0.82;
  switch (kind) {
    case 1: {
      // béret
      const mat = keep(std(0x1f2933, 0.9));
      const b = add(new THREE.SphereGeometry(R * 1.02, 22, 12), mat, R * 0.12, top + 0.02, -0.02);
      b.scale.set(1.12, 0.32, 1.1);
      b.rotation.z = -0.22;
      add(new THREE.SphereGeometry(0.035, 8, 6), mat, R * 0.1, top + 0.13, -0.02);
      break;
    }
    case 2: {
      // haut-de-forme
      const black = keep(std(0x15171c, 0.5));
      add(new THREE.CylinderGeometry(R * 0.72, R * 0.72, R * 1.25, 22), black, 0, top + R * 0.62);
      add(new THREE.CylinderGeometry(R * 1.2, R * 1.2, 0.035, 26), black, 0, top + 0.01);
      add(new THREE.CylinderGeometry(R * 0.735, R * 0.735, R * 0.24, 22), keep(std(0xb3263c, 0.6)), 0, top + R * 0.17);
      g.rotation.z = 0.1;
      break;
    }
    case 3: {
      // couronne
      const gold = keep(std(0xf2c04d, 0.3, 0.75));
      const ring = new THREE.CylinderGeometry(R * 0.78, R * 0.82, R * 0.42, 22, 1, true);
      const m = add(ring, gold, 0, top + R * 0.12);
      (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.ConeGeometry(R * 0.16, R * 0.42, 6), gold, Math.cos(a) * R * 0.78, top + R * 0.5, Math.sin(a) * R * 0.78);
      }
      const gems = [0xd9304a, 0x2c7be5, 0x2fa864];
      gems.forEach((c, i) => {
        const a = Math.PI / 2 + (i - 1) * 0.7;
        add(new THREE.SphereGeometry(0.035, 8, 6), keep(std(c, 0.2, 0.2)), -Math.cos(a) * R * 0.82, top + R * 0.12, Math.sin(a) * R * 0.82);
      });
      break;
    }
    case 4: {
      // casquette, la visière devant
      const red = keep(std(0xd6413a, 0.7));
      add(shell(R * 1.08, Math.PI * 0.42), red, 0, 0, 0);
      const visor = add(
        new THREE.CylinderGeometry(R * 0.85, R * 0.85, 0.03, 20, 1, false, -Math.PI / 2, Math.PI),
        keep(std(0xb8322c, 0.7)),
      );
      visor.position.set(0, R * 0.36, R * 0.78);
      visor.rotation.x = 0.18;
      add(new THREE.SphereGeometry(0.03, 8, 6), red, 0, R * 1.08, 0);
      break;
    }
    case 5: {
      // bonnet et son pompon
      add(shell(R * 1.1, Math.PI * 0.5), keep(std(0x3a6ea5, 0.95)));
      const rim = add(new THREE.TorusGeometry(R * 1.06, 0.055, 8, 28), keep(std(0x2b5482, 0.95)), 0, R * 0.08, 0);
      rim.rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.09, 12, 8), keep(std(0xf3efe6, 1)), 0, R * 1.18, 0);
      break;
    }
    case 6: {
      // chapeau de fête, un peu de travers
      const cone = add(new THREE.ConeGeometry(R * 0.5, R * 1.5, 18), keep(std(0x8e44ad, 0.6)), 0, top + R * 0.72);
      cone.rotation.z = 0.18;
      add(new THREE.SphereGeometry(0.055, 10, 8), keep(std(0xf3b62c, 0.5)), -R * 0.25, top + R * 1.45);
      break;
    }
    case 7: {
      // chapeau de cow-boy
      const brown = keep(std(0x9c6b3c, 0.85));
      add(new THREE.CylinderGeometry(R * 0.62, R * 0.75, R * 0.62, 20), brown, 0, top + R * 0.28);
      const brim = new THREE.LatheGeometry(
        [
          new THREE.Vector2(R * 0.72, 0),
          new THREE.Vector2(R * 1.25, -0.01),
          new THREE.Vector2(R * 1.6, 0.07),
          new THREE.Vector2(R * 1.62, 0.1),
        ],
        28,
      );
      const b = add(brim, keep(std(0x87582f, 0.85)), 0, top - 0.02);
      (b.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      add(new THREE.CylinderGeometry(R * 0.7, R * 0.73, R * 0.14, 20), keep(std(0x5d3a1c, 0.8)), 0, top + R * 0.06);
      break;
    }
    case 8: {
      // bandeau, et ses deux bouts qui pendent derrière
      const red = keep(std(0xe23b3f, 0.8));
      const band = add(new THREE.TorusGeometry(R * 1.01, 0.05, 8, 30), red, 0, R * 0.42, 0);
      band.rotation.x = Math.PI / 2 - 0.12;
      for (const side of [-1, 1]) {
        const tail = add(new THREE.BoxGeometry(0.06, 0.24, 0.03), red, side * 0.06, R * 0.3, -R * 1.02);
        tail.rotation.set(0.5, 0, side * 0.35);
      }
      break;
    }
  }
  return g;
}

/** Une étoile à cinq branches, à plat */
function starGeometry(r: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new THREE.ShapeGeometry(s);
}

/** Un os de bras : un cylindre de longueur 1 le long de y, à étirer et orienter */
function bone(radius: number, mat: THREE.Material, keep: Keep, shadows: boolean): THREE.Mesh {
  const geo = keep(new THREE.CylinderGeometry(radius, radius * 0.9, 1, 8));
  geo.translate(0, 0.5, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  return m;
}

const UP = new THREE.Vector3(0, 1, 0);
/** Des vecteurs de travail, réutilisés à chaque image (rien à ramasser pour le ramasse-miettes) */
const V = Array.from({ length: 7 }, () => new THREE.Vector3());

/** Place un os de `a` à `b` */
function stretch(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const dir = V[6]!.subVectors(b, a);
  const len = dir.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1));
  m.scale.set(1, len, 1);
}

export class PilotModel {
  readonly group = new THREE.Group();
  /** Le volant (à placer dans le kart : il tourne avec les mains) */
  readonly wheel = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private arms: { shoulder: THREE.Vector3; upper: THREE.Mesh; fore: THREE.Mesh; elbow: THREE.Mesh; hand: THREE.Mesh; side: number }[] = [];
  private stars = new THREE.Group();
  private scarf: THREE.Mesh[] = [];
  private dizzy = 0;
  private cheer = 0;
  private turn = 0;
  private yaw = 0;

  constructor(avatar: AvatarConfig, head: HTMLCanvasElement | null, scarfColor: string, keep: Keep, shadows: boolean) {
    const skinColor = AVATAR_SKINS[avatar.skin] ?? AVATAR_SKINS[0]!;
    const shirt = keep(std(AVATAR_BACKGROUNDS[avatar.bg] ?? AVATAR_BACKGROUNDS[0]!, 0.75));
    const glove = keep(std(0xf7f4ee, 0.6));
    const hatCoversTop = [1, 2, 4, 5, 7].includes(avatar.hat);

    // Le buste : il pivote aux hanches pour pencher, la tête et les épaules suivent
    this.torso.position.copy(HIPS);
    this.group.add(this.torso);
    const body = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.27, 0.32, 6, 14)), shirt);
    body.position.set(0, 0.38, 0);
    body.scale.set(1.08, 1, 0.82);
    body.castShadow = shadows;
    this.torso.add(body);
    // Un col blanc, et l'écharpe à la couleur du kart, nouée au cou
    const scarfMat = keep(std(scarfColor, 0.8));
    const knot = new THREE.Mesh(keep(new THREE.TorusGeometry(0.17, 0.06, 8, 18)), scarfMat);
    knot.rotation.x = Math.PI / 2;
    knot.position.set(0, 0.78, 0.02);
    this.torso.add(knot);
    for (let i = 0; i < 2; i++) {
      const piece = new THREE.Mesh(keep(new THREE.BoxGeometry(0.13, 0.04, 0.3)), scarfMat);
      piece.geometry.translate(0, 0, -0.15);
      this.torso.add(piece);
      this.scarf.push(piece);
    }

    // La tête : la peau dépliée de l'avatar, les oreilles, la coiffure, le chapeau
    this.head.position.set(0, HEAD_Y - HIPS.y, 0.06);
    this.torso.add(this.head);
    let skinMat: THREE.MeshStandardMaterial;
    if (head) {
      const tex = keep(new THREE.CanvasTexture(head));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      skinMat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65 }));
    } else skinMat = keep(std(skinColor, 0.65));
    const skull = new THREE.Mesh(keep(new THREE.SphereGeometry(R, 32, 20)), skinMat);
    skull.castShadow = shadows;
    this.head.add(skull);
    const earMat = keep(std(skinColor, 0.65));
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(keep(new THREE.SphereGeometry(R * 0.24, 10, 8)), earMat);
      ear.position.set(side * R * 0.97, -R * 0.05, -R * 0.05);
      ear.scale.set(0.55, 1, 0.85);
      this.head.add(ear);
    }
    const hairGeo = hairGeometry(avatar.hair, hatCoversTop);
    if (hairGeo) {
      const hairColor = AVATAR_HAIR_COLORS[avatar.hairColor] ?? AVATAR_HAIR_COLORS[0]!;
      const hair = new THREE.Mesh(
        keep(hairGeo),
        keep(new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.85, side: THREE.DoubleSide })),
      );
      hair.castShadow = shadows;
      this.head.add(hair);
    }
    const hat = hatGroup(avatar.hat, keep, shadows);
    if (hat) {
      mergeStatic(hat, keep);
      this.head.add(hat);
    }
    mergeStatic(this.head, keep);

    // Les étoiles de la tête qui tourne, au-dessus d'elle
    const starMat = keep(new THREE.MeshBasicMaterial({ color: 0xffd84a, side: THREE.DoubleSide }));
    const starGeo = keep(starGeometry(0.09));
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(starGeo, starMat);
      this.stars.add(s);
    }
    this.stars.position.set(0, R + 0.2, 0);
    this.stars.visible = false;
    this.head.add(this.stars);

    // Le volant et sa colonne
    const dark = keep(std(0x23252a, 0.5));
    this.wheel.position.copy(WHEEL_AT);
    this.wheel.rotation.x = WHEEL_TILT;
    const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(WHEEL_R, 0.035, 8, 22)), dark);
    this.wheel.add(rim);
    const hub = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12)), keep(std(scarfColor, 0.4)));
    hub.rotation.x = Math.PI / 2;
    this.wheel.add(hub);
    const spoke = new THREE.Mesh(keep(new THREE.BoxGeometry(WHEEL_R * 2, 0.03, 0.02)), dark);
    this.wheel.add(spoke);
    mergeStatic(this.wheel, keep);
    this.group.add(this.wheel);

    // Les bras : épaule, coude, gant
    for (const side of [-1, 1]) {
      const upper = bone(0.075, shirt, keep, shadows);
      const fore = bone(0.068, shirt, keep, shadows);
      const elbow = new THREE.Mesh(keep(new THREE.SphereGeometry(0.075, 10, 8)), shirt);
      const hand = new THREE.Mesh(keep(new THREE.SphereGeometry(0.085, 12, 8)), glove);
      hand.castShadow = shadows;
      this.group.add(upper, fore, elbow, hand);
      this.arms.push({ shoulder: new THREE.Vector3(side * 0.27, 0.64, 0.02), upper, fore, elbow, hand, side });
    }
  }

  update(s: PilotState) {
    const k = Math.min(1, s.dt * 10);
    // Le volant tourne avec le braquage (plus fort en dérapage)
    this.turn += (s.steer + s.drift * 0.35 - this.turn) * Math.min(1, s.dt * 14);
    this.wheel.rotation.z = -this.turn * 1.1;
    // La tête regarde dans le virage ; le buste penche, se cale en arrière pendant un turbo
    const lookTarget = -(s.steer * 0.32 + s.drift * 0.28);
    this.yaw += (lookTarget - this.yaw) * k;
    if (s.spinning) this.dizzy = 0.9;
    else this.dizzy = Math.max(0, this.dizzy - s.dt);
    const cheering = s.celebrate || s.trick;
    this.cheer += ((cheering ? 1 : 0) - this.cheer) * Math.min(1, s.dt * 8);
    const wobble = this.dizzy > 0 ? Math.sin(s.time * 16) * 0.32 * Math.min(1, this.dizzy * 2) : 0;
    const shake = Math.sin(s.time * 47) * 0.012 * Math.min(1.2, s.speed);
    this.head.rotation.set(
      -0.08 - this.cheer * 0.18 + shake,
      this.yaw + (s.celebrate ? Math.sin(s.time * 3) * 0.4 : 0),
      wobble + s.lean * 0.4,
    );
    // Pencher à droite : le haut part vers -x (la droite du kart)
    this.torso.rotation.z += (s.lean - this.torso.rotation.z) * k;
    this.torso.rotation.x += ((s.boosting ? -0.16 : 0.04) - this.torso.rotation.x) * Math.min(1, s.dt * 5);
    this.torso.position.y = HIPS.y + (s.celebrate ? Math.abs(Math.sin(s.time * 6)) * 0.06 : 0);
    // Les étoiles tournent au-dessus de la tête sonnée
    this.stars.visible = this.dizzy > 0;
    if (this.stars.visible) {
      this.stars.children.forEach((star, i) => {
        const a = s.time * 5 + (i * Math.PI * 2) / 3;
        star.position.set(Math.cos(a) * 0.3, Math.sin(s.time * 7 + i) * 0.03, Math.sin(a) * 0.3);
        star.rotation.set(0, -a, s.time * 4);
      });
    }
    // L'écharpe flotte derrière, plus fort quand ça va vite
    const flap = 0.25 + Math.min(1.3, s.speed) * 0.9;
    this.scarf.forEach((p, i) => {
      p.position.set((i === 0 ? -1 : 1) * 0.05, 0.76 - i * 0.04, -0.12);
      p.rotation.set(
        flap * 0.7 - 1.2 + Math.sin(s.time * (11 + i * 3)) * 0.18 * flap,
        (i === 0 ? -1 : 1) * 0.2 + Math.sin(s.time * 9 + i) * 0.15,
        0,
      );
      p.scale.z = 0.7 + flap * 0.45;
    });

    // Les bras : les mains sur le volant (ou en l'air), les coudes plient vers l'extérieur
    this.torso.updateMatrix();
    this.wheel.updateMatrix();
    for (const arm of this.arms) {
      const [shoulder, hand, up, along, perp, elbow] = V as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
      ];
      shoulder.copy(arm.shoulder).applyMatrix4(this.torso.matrix);
      // Les mains tiennent le volant à « 9 h 15 », et tournent avec lui
      hand.set(arm.side * WHEEL_R, 0.02, 0).applyMatrix4(this.wheel.matrix);
      const wave = s.celebrate ? Math.sin(s.time * 9 + arm.side) * 0.1 : 0;
      up.set(arm.side * 0.45 + wave, HEAD_Y + 0.25, -0.05);
      hand.lerp(up, this.cheer);
      const d = Math.min(UPPER + FORE - 0.01, shoulder.distanceTo(hand));
      along.subVectors(hand, shoulder).normalize();
      // Le coude : du côté extérieur et un peu vers le bas
      perp.set(arm.side, -0.6, -0.2);
      const dot = perp.dot(along);
      perp.addScaledVector(along, -dot).normalize();
      const x = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, UPPER * UPPER - x * x));
      elbow.copy(shoulder).addScaledVector(along, x).addScaledVector(perp, h);
      stretch(arm.upper, shoulder, elbow);
      stretch(arm.fore, elbow, hand);
      arm.elbow.position.copy(elbow);
      arm.hand.position.copy(hand);
    }
  }
}
