// Un chef de Toque ! en 3D : le personnage du profil (sa tête dessinée, sa coiffure, ce qu'il porte de la garde-robe sur
// le buste), à grosse tête comme dans les autres jeux, en veste de cuisine croisée, pantalon pied-de-poule et sabots, avec
// le tablier et la toque choisis à la boutique, et son couteau quand il coupe. Le même gabarit que le joueur de bowling :
// ses postures (marche, joie) servent ici aussi ; porter, couper, laver, éteindre le feu sont propres à la cuisine.

import * as THREE from "three";
import { AVATAR_BACKGROUNDS, AVATAR_HAIR_COLORS, AVATAR_SKINS, type AvatarConfig } from "../../../shared/avatar.ts";
import { APRON_COLORS, type ToqueLook } from "../../../shared/games/toque/looks.ts";
import { hairGeometry } from "../../bolides/scene/pilot.ts";
import { blend, reactPose, RELAX, STAND, walkPose, type Pose } from "../../bowling/scene/bowler.ts";
import { cloth, limb, loft, mitten, shoe } from "../../culbute/scene/body.ts";
import { outfitExtras, wearHair } from "../../escarmouche/scene/wardrobe3d.ts";

type V3 = [number, number, number];

/** La taille du chef dans la cuisine (une case fait un mètre ; il fait à peu près un mètre, toque comprise) */
export const CHEF_SCALE = 0.74;

const HIPS_Y = 0.5;
const SHOULDER_Y = 0.92;
const SHOULDER_X = 0.25;
const HEAD_R = 0.34;
const UPPER = 0.26;
const FORE = 0.25;
const THIGH = 0.235;
const SHIN = 0.215;
const HEAD_UP = 0.71;
/** Là où se tient ce qu'il porte, devant lui (dans le repère des postures) */
export const HOLD: V3 = [0, 0.86, 0.36];

interface Limb {
  a: THREE.Mesh;
  b: THREE.Mesh;
  end: THREE.Mesh;
}

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const V = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  d: new THREE.Vector3(),
  e: new THREE.Vector3(),
  f: new THREE.Vector3(),
  g: new THREE.Vector3(),
  ikAlong: new THREE.Vector3(),
  ikPerp: new THREE.Vector3(),
  st: new THREE.Vector3(),
};

function ik(a: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, out: THREE.Vector3) {
  const along = V.ikAlong.subVectors(target, a);
  let d = along.length();
  if (d > l1 + l2 - 0.005) {
    along.multiplyScalar((l1 + l2 - 0.005) / d);
    target.copy(a).add(along);
    d = l1 + l2 - 0.005;
  }
  along.normalize();
  const perp = V.ikPerp.copy(pole).addScaledVector(along, -pole.dot(along));
  if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
  perp.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * Math.max(d, 1e-3));
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  return out.copy(a).addScaledVector(along, x).addScaledVector(perp, h);
}

function stretch(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const dir = V.st.subVectors(b, a);
  const len = dir.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1));
  m.scale.set(1, len / ((m.userData.len as number | undefined) ?? 1), 1);
}

const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
};

/** La veste de cuisine : blanche, croisée, deux rangées de boutons, le col montant */
function jacketTexture(): THREE.CanvasTexture {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = "#f6f4ee";
    g.fillRect(0, 0, 256, 128);
    // Le pan croisé devant (u autour de 0 : les deux bords de l'image)
    g.strokeStyle = "rgba(120,110,95,0.35)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(18, 0);
    g.lineTo(18, 128);
    g.stroke();
    g.fillStyle = "#c8c0ae";
    for (let y = 40; y < 120; y += 22) {
      for (const x of [8, 248]) {
        g.beginPath();
        g.arc(x, y, 3.6, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Le col
    g.fillStyle = "#e8e4da";
    g.fillRect(0, 116, 256, 12);
  });
}

/** Le pantalon pied-de-poule, noir et blanc */
function houndstooth(): THREE.CanvasTexture {
  return canvasTex(
    32,
    32,
    (g) => {
      g.fillStyle = "#e9e6df";
      g.fillRect(0, 0, 32, 32);
      g.fillStyle = "#26252a";
      for (let y = 0; y < 32; y += 8)
        for (let x = 0; x < 32; x += 8) {
          g.fillRect(x, y, 4, 4);
          g.beginPath();
          g.moveTo(x + 4, y);
          g.lineTo(x + 8, y + 4);
          g.lineTo(x + 6, y + 4);
          g.closePath();
          g.fill();
          g.beginPath();
          g.moveTo(x, y + 4);
          g.lineTo(x + 4, y + 8);
          g.lineTo(x + 2, y + 8);
          g.closePath();
          g.fill();
        }
    },
    [6, 6],
  );
}

/** Le tablier : sa couleur (voir looks.ts), et son motif dessiné */
function apronTexture(id: string): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    const base = APRON_COLORS[id] ?? APRON_COLORS.blanc!;
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    switch (id) {
      case "bistrot":
        g.fillStyle = "#e9e4d6";
        for (let x = 4; x < 128; x += 16) g.fillRect(x, 0, 3, 128);
        break;
      case "vichy":
        g.fillStyle = "rgba(255,255,255,0.55)";
        for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 8, 128);
        for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 8);
        break;
      case "mariniere":
        g.fillStyle = "#f4f1ea";
        for (let y = 0; y < 128; y += 14) g.fillRect(0, y, 128, 7);
        break;
      case "jean": {
        g.strokeStyle = "rgba(255,255,255,0.08)";
        for (let i = -128; i < 128; i += 4) {
          g.beginPath();
          g.moveTo(i, 0);
          g.lineTo(i + 128, 128);
          g.stroke();
        }
        g.strokeStyle = "#d9a441";
        g.setLineDash([4, 3]);
        g.strokeRect(10, 10, 108, 108);
        break;
      }
      case "fleuri":
        for (let k = 0; k < 18; k++) {
          const x = (k * 37) % 128;
          const y = (k * 53) % 128;
          g.fillStyle = k % 2 ? "#c94f7c" : "#e07a4a";
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2;
            g.beginPath();
            g.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = "#f7e58a";
          g.beginPath();
          g.arc(x, y, 2.4, 0, Math.PI * 2);
          g.fill();
        }
        break;
      case "provence":
        g.fillStyle = "#2f5fa8";
        for (let y = 8; y < 128; y += 24)
          for (let x = (y / 24) % 2 ? 12 : 0; x < 128; x += 24) {
            g.beginPath();
            g.moveTo(x, y - 6);
            g.quadraticCurveTo(x + 8, y, x, y + 6);
            g.quadraticCurveTo(x - 8, y, x, y - 6);
            g.fill();
          }
        break;
      case "tricolore":
        g.fillStyle = "#2c4fa3";
        g.fillRect(0, 0, 43, 128);
        g.fillStyle = "#d63a3a";
        g.fillRect(85, 0, 43, 128);
        break;
      case "cuir": {
        const grad = g.createLinearGradient(0, 0, 128, 128);
        grad.addColorStop(0, "#8a5632");
        grad.addColorStop(1, "#5e361c");
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = "#e0b070";
        g.setLineDash([5, 4]);
        g.strokeRect(8, 8, 112, 112);
        break;
      }
      case "dore": {
        const grad = g.createLinearGradient(0, 0, 128, 0);
        grad.addColorStop(0, "#b8862d");
        grad.addColorStop(0.5, "#f6dc85");
        grad.addColorStop(1, "#b8862d");
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        break;
      }
      case "noir":
        g.fillStyle = "#e6e0d2";
        g.font = "bold 20px serif";
        g.textAlign = "center";
        g.fillText("✦", 64, 70);
        break;
    }
    // La poche ventrale, et l'ombre de la toile en bas
    g.strokeStyle = "rgba(0,0,0,0.18)";
    g.setLineDash([]);
    g.lineWidth = 2;
    g.strokeRect(38, 62, 52, 26);
  });
}

/** Un pan de tissu courbé autour du corps (le tablier), du bas vers le haut, d'un angle à l'autre */
function panel(y0: number, y1: number, r0: number, r1: number, span: number, z0 = 0): THREE.BufferGeometry {
  const seg = 14;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= 1; j++) {
    const y = j === 0 ? y0 : y1;
    const r = j === 0 ? r0 : r1;
    for (let i = 0; i <= seg; i++) {
      const a = -span / 2 + (i / seg) * span;
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r + z0);
      uv.push(i / seg, j);
    }
  }
  for (let i = 0; i < seg; i++) idx.push(i, i + 1, i + seg + 2, i, i + seg + 2, i + seg + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

type Keep = <T extends { dispose: () => void }>(x: T) => T;

const mesh = (g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
};

/** La toque (ou ce qui en tient lieu) choisie à la boutique, posée sur une tête de rayon R */
export function toqueGroup(id: string, R: number, keep: Keep): THREE.Group {
  const g = new THREE.Group();
  const white = keep(cloth("#f7f5ef", 0.85, 0.25));
  const top = R * 0.78;
  const chefHat = (mat: THREE.Material, height: number, puff: number) => {
    // Le bandeau, le cylindre plissé (des côtes), puis le haut bouffant
    mesh(g, keep(new THREE.CylinderGeometry(R * 0.84, R * 0.86, R * 0.36, 24)), mat, 0, top + R * 0.1, 0);
    const pleats = new THREE.CylinderGeometry(R * 0.98, R * 0.86, height, 24, 1, true);
    const p = pleats.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + Math.cos(a * 12) * 0.035;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    pleats.computeVertexNormals();
    const side = mesh(g, keep(pleats), mat, 0, top + R * 0.28 + height / 2, 0);
    (side.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const cap = mesh(g, keep(new THREE.SphereGeometry(R * 1.02 * puff, 20, 12)), mat, 0, top + R * 0.28 + height, 0);
    cap.scale.y = 0.55;
  };
  switch (id) {
    case "courte":
      chefHat(white, R * 0.25, 0.9);
      break;
    case "haute":
      chefHat(white, R * 1.0, 1.0);
      break;
    case "rayee": {
      const tex = keep(
        canvasTex(64, 16, (c) => {
          c.fillStyle = "#f7f5ef";
          c.fillRect(0, 0, 64, 16);
          c.fillStyle = "#3a62b8";
          for (let x = 0; x < 64; x += 8) c.fillRect(x, 0, 3, 16);
        }),
      );
      chefHat(keep(cloth(0xffffff, 0.85, 0.25, tex)), R * 0.55, 0.92);
      break;
    }
    case "noire":
      chefHat(keep(cloth("#1f1f24", 0.7, 0.3)), R * 0.55, 0.92);
      break;
    case "doree":
      chefHat(keep(new THREE.MeshStandardMaterial({ color: "#e2b74a", metalness: 0.85, roughness: 0.28 })), R * 0.6, 0.95);
      break;
    case "calot": {
      // Le calot de commis : un bateau de papier posé sur la tête
      const shape = new THREE.Shape();
      shape.moveTo(-R * 1.0, 0);
      shape.lineTo(R * 1.0, 0);
      shape.lineTo(R * 0.7, R * 0.5);
      shape.lineTo(-R * 0.7, R * 0.5);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: R * 0.9, bevelEnabled: true, bevelSize: R * 0.04, bevelThickness: R * 0.04 });
      geo.translate(0, 0, -R * 0.45);
      geo.rotateY(Math.PI / 2);
      mesh(g, keep(geo), white, 0, top - R * 0.05, 0);
      break;
    }
    case "bandana": {
      const red = keep(cloth("#c9362f", 0.8, 0.3));
      const dome = mesh(g, keep(new THREE.SphereGeometry(R * 1.04, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.45)), red, 0, R * 0.05, 0);
      dome.rotation.x = -0.12;
      // Le nœud derrière, et ses deux pans
      mesh(g, keep(new THREE.SphereGeometry(R * 0.2, 10, 8)), red, 0, R * 0.42, -R * 0.95);
      for (const s of [-1, 1]) {
        const tail = mesh(g, keep(new THREE.BoxGeometry(R * 0.16, R * 0.5, R * 0.05)), red, s * R * 0.12, R * 0.15, -R * 1.02);
        tail.rotation.z = s * 0.3;
      }
      break;
    }
    case "beret": {
      const navy = keep(cloth("#24304a", 0.85, 0.3));
      const b = mesh(g, keep(new THREE.SphereGeometry(R * 1.1, 22, 10)), navy, R * 0.12, top + R * 0.12, 0);
      b.scale.y = 0.28;
      b.rotation.z = -0.18;
      mesh(g, keep(new THREE.CylinderGeometry(R * 0.04, R * 0.06, R * 0.18, 8)), navy, R * 0.18, top + R * 0.42, 0);
      break;
    }
    case "pompon": {
      const tex = keep(
        canvasTex(64, 32, (c) => {
          c.fillStyle = "#d8443a";
          c.fillRect(0, 0, 64, 32);
          c.fillStyle = "rgba(0,0,0,0.18)";
          for (let x = 0; x < 64; x += 4) c.fillRect(x, 0, 2, 32);
          c.fillStyle = "#f2eee2";
          c.fillRect(0, 24, 64, 8);
        }),
      );
      const knit = keep(cloth(0xffffff, 0.95, 0.3, tex));
      mesh(g, keep(new THREE.SphereGeometry(R * 1.06, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), knit, 0, R * 0.02, 0);
      mesh(g, keep(new THREE.SphereGeometry(R * 0.28, 12, 10)), keep(cloth("#f2eee2", 1, 0.3)), 0, R * 1.12, 0);
      break;
    }
    default:
      chefHat(white, R * 0.55, 0.92);
  }
  g.scale.setScalar(0.88);
  return g;
}

/** Le couteau : sa lame et son manche, selon son modèle */
export function knifeGroup(id: string, keep: Keep): THREE.Group {
  const g = new THREE.Group();
  const steel = keep(new THREE.MeshStandardMaterial({ color: "#d9dde2", metalness: 0.9, roughness: 0.22 }));
  const handleColor: Record<string, string> = { bois: "#8a6a3a", or: "#e0b443", ceramique: "#2a2a30", damas: "#3a2a22" };
  const handle = keep(
    new THREE.MeshStandardMaterial({
      color: handleColor[id] ?? "#1f1f24",
      roughness: id === "or" ? 0.25 : 0.55,
      metalness: id === "or" ? 0.9 : 0.05,
    }),
  );
  const blade =
    id === "ceramique"
      ? keep(new THREE.MeshStandardMaterial({ color: "#f4f4f2", roughness: 0.3 }))
      : id === "or"
        ? keep(new THREE.MeshStandardMaterial({ color: "#f0c65a", metalness: 1, roughness: 0.2 }))
        : id === "damas"
          ? keep(new THREE.MeshStandardMaterial({ color: "#a7adb5", metalness: 0.85, roughness: 0.35 }))
          : steel;
  const len = id === "office" ? 0.16 : 0.22;
  mesh(g, keep(new THREE.BoxGeometry(0.035, 0.1, 0.035)), handle, 0, -0.06, 0);
  if (id === "hachoir") mesh(g, keep(new THREE.BoxGeometry(0.012, 0.12, 0.16)), blade, 0, 0.06, 0.06);
  else {
    const b = mesh(g, keep(new THREE.BoxGeometry(0.01, len, id === "chef" ? 0.05 : 0.036)), blade, 0, len / 2, 0.01);
    b.scale.z = 1;
  }
  return g;
}

export interface ChefLook {
  avatar: AvatarConfig;
  look: ToqueLook;
  /** La couleur de son équipe ou de sa place : le foulard au cou */
  color: string;
}

/** Ce que fait le chef, pour sa posture */
export interface ChefMotion {
  /** Sa vitesse (en cases par seconde) */
  speed: number;
  carrying: boolean;
  /** 0 rien, 1 couper, 2 laver, 3 éteindre */
  act: number;
  dash: boolean;
  stun: boolean;
  /** Il fête un plat servi (secondes depuis) ; -1 sinon */
  cheer: number;
}

export class ChefModel {
  readonly group = new THREE.Group();
  /** Le devant du chef est vers +z dans `root` */
  readonly root = new THREE.Group();
  /** Là où se pose ce qu'il porte (dans `root`) */
  readonly hold = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private skull: THREE.Mesh;
  private knife: THREE.Group;
  private arms: Limb[] = [];
  private legs: Limb[] = [];
  private disposables: { dispose: () => void }[] = [];
  private pose: Pose = RELAX;
  private walkT = 0;
  readonly look: ChefLook;

  constructor(look: ChefLook, touch = false) {
    this.look = look;
    const keep: Keep = (x) => (this.disposables.push(x), x);
    const avatar = look.avatar;
    const skinHex = AVATAR_SKINS[avatar.skin] ?? AVATAR_SKINS[0]!;
    const jacket = keep(cloth(0xffffff, 0.8, 0.28, keep(jacketTexture())));
    const sleeve = keep(cloth("#f6f4ee", 0.8, 0.28));
    const trousers = keep(cloth(0xffffff, 0.85, 0.2, keep(houndstooth())));
    const skin = keep(cloth(skinHex, 0.62, 0.22));
    const clog = keep(new THREE.MeshStandardMaterial({ color: "#2a2a30", roughness: 0.45 }));
    const apronMat = keep(cloth(0xffffff, look.look.apron === "cuir" ? 0.55 : 0.85, 0.2, keep(apronTexture(look.look.apron))));
    apronMat.side = THREE.DoubleSide;
    const geo = <T extends THREE.BufferGeometry>(g: T) => keep(g);

    this.group.scale.setScalar(CHEF_SCALE);
    this.group.add(this.root);
    this.root.add(this.body);
    this.body.add(this.torso);
    this.torso.position.y = HIPS_Y;

    // Le buste (la veste croisée), un peu plus large en bas
    this.torso.add(
      new THREE.Mesh(
        geo(
          loft([
            [-0.12, 0.18, 0.15],
            [-0.04, 0.22, 0.175],
            [0.06, 0.238, 0.19],
            [0.16, 0.242, 0.192],
            [0.26, 0.246, 0.182],
            [0.34, 0.24, 0.168],
            [0.41, 0.205, 0.145],
            [0.47, 0.12, 0.1],
          ]),
        ),
        jacket,
      ),
    );
    // Le foulard noué au cou, à la couleur de sa place
    const scarf = new THREE.Mesh(geo(new THREE.TorusGeometry(0.1, 0.03, 8, 18)), keep(cloth(look.color, 0.6, 0.35)));
    scarf.position.set(0, 0.45, 0.02);
    scarf.rotation.x = Math.PI / 2 + 0.25;
    this.torso.add(scarf);
    const knot = new THREE.Mesh(geo(new THREE.SphereGeometry(0.035, 8, 6)), scarf.material);
    knot.position.set(0, 0.42, 0.13);
    this.torso.add(knot);
    // Le bassin
    this.torso.add(
      new THREE.Mesh(
        geo(
          loft([
            [-0.2, 0.15, 0.12],
            [-0.14, 0.2, 0.155],
            [-0.04, 0.218, 0.172],
            [0.04, 0.222, 0.176],
          ]),
        ),
        trousers,
      ),
    );
    // Le tablier : la bavette sur la poitrine, la jupe qui descend aux genoux, les cordons
    const bib = new THREE.Mesh(geo(panel(0.02, 0.36, 0.205, 0.17, 1.25, 0.012)), apronMat);
    this.torso.add(bib);
    const skirt = new THREE.Mesh(geo(panel(-0.34, 0.04, 0.26, 0.205, 1.7, 0.015)), apronMat);
    this.torso.add(skirt);
    const cord = keep(cloth(APRON_COLORS[look.look.apron] ?? "#f4f1ea", 0.8, 0.2));
    const belt = new THREE.Mesh(geo(new THREE.TorusGeometry(0.222, 0.012, 6, 28)), cord);
    belt.position.y = 0.04;
    belt.rotation.x = Math.PI / 2;
    belt.scale.y = 0.82;
    this.torso.add(belt);
    // Ce qu'il porte de sa garde-robe sur le buste (fait pour un buste tourné vers −z)
    const extras = outfitExtras(avatar.wear?.outfit, AVATAR_BACKGROUNDS[avatar.bg] ?? "#c0392b", keep);
    if (extras) {
      extras.rotation.y = Math.PI;
      extras.scale.setScalar(1.25);
      extras.position.set(0, -0.2, 0);
      this.torso.add(extras);
    }

    // La tête : la peau de l'avatar (posée plus tard), les oreilles, la coiffure, la toque
    this.head.position.set(0, HEAD_UP, 0.02);
    this.torso.add(this.head);
    this.skull = new THREE.Mesh(geo(new THREE.SphereGeometry(HEAD_R, touch ? 22 : 30, touch ? 16 : 20)), skin);
    // La sphère de three.js regarde vers +z : le visage dessiné aussi
    this.head.add(this.skull);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(geo(new THREE.SphereGeometry(HEAD_R * 0.24, 10, 8)), skin);
      ear.scale.set(0.55, 1, 0.85);
      ear.position.set(side * HEAD_R * 0.97, -HEAD_R * 0.05, -HEAD_R * 0.05);
      this.head.add(ear);
    }
    const hairColor = AVATAR_HAIR_COLORS[avatar.hairColor] ?? AVATAR_HAIR_COLORS[0]!;
    const extraHair = wearHair(avatar.wear?.hair, HEAD_R, hairColor, keep);
    if (extraHair) this.head.add(extraHair);
    // La toque couvre le haut du crâne : la coiffure seulement autour
    const hairGeo = extraHair ? null : hairGeometry(avatar.hair, true);
    if (hairGeo) {
      const hairMat = keep(cloth(hairColor, 0.75, 0.35));
      hairMat.side = THREE.DoubleSide;
      this.head.add(new THREE.Mesh(keep(hairGeo), hairMat));
    }
    this.head.add(toqueGroup(look.look.toque, HEAD_R, keep));

    // Les bras (manches de la veste retroussées), les jambes, les sabots
    for (let i = 0; i < 2; i++) {
      const upper = new THREE.Mesh(geo(limb((u) => 0.092 - u * 0.012, UPPER)), sleeve);
      const fore = new THREE.Mesh(geo(limb((u) => 0.074 - u * 0.012, FORE)), skin);
      upper.userData.len = UPPER;
      fore.userData.len = FORE;
      const hand = new THREE.Mesh(geo(mitten(0.1)), skin);
      this.body.add(upper, fore, hand);
      this.arms.push({ a: upper, b: fore, end: hand });
      const thigh = new THREE.Mesh(geo(limb((u) => 0.108 - u * 0.016, THIGH)), trousers);
      const shin = new THREE.Mesh(geo(limb((u) => 0.09 - u * 0.016, SHIN)), trousers);
      thigh.userData.len = THIGH;
      shin.userData.len = SHIN;
      const foot = new THREE.Mesh(geo(shoe(0.3, 0.2)), clog);
      this.body.add(thigh, shin, foot);
      this.legs.push({ a: thigh, b: shin, end: foot });
    }
    // Le couteau, dans la main droite quand il coupe
    this.knife = knifeGroup(look.look.knife, keep);
    this.knife.visible = false;
    this.arms[0]!.end.add(this.knife);
    this.knife.position.set(0, -0.06, 0.03);
    this.knife.rotation.x = Math.PI;
    this.hold.position.set(HOLD[0], HOLD[1], HOLD[2]);
    this.root.add(this.hold);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.apply(RELAX);
  }

  /** La peau de la tête avec les traits de l'avatar */
  setHead(canvas: HTMLCanvasElement) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.disposables.push(tex);
    const mat = cloth(0xffffff, 0.6, 0.22, tex);
    this.disposables.push(mat);
    this.skull.material = mat;
  }

  /** Sa posture du moment, en douceur d'une image à l'autre */
  animate(m: ChefMotion, t: number, dt: number) {
    this.walkT += dt * Math.max(0.6, Math.min(1.6, m.speed / 2.6));
    const target = chefPose(m, t, this.walkT);
    const k = 1 - Math.exp(-dt * (m.act === 1 ? 30 : 16));
    this.pose = blend(this.pose, target, k);
    this.knife.visible = m.act === 1;
    this.apply(this.pose);
  }

  private apply(p: Pose) {
    this.body.position.y = p.lift;
    this.body.rotation.y = p.spin;
    this.torso.position.y = HIPS_Y - p.crouch;
    this.torso.rotation.set(p.lean, p.twist, p.roll);
    this.head.rotation.set(p.nod * 0.6, p.turn, 0);
    this.torso.updateMatrix();
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i]!;
      const side = i === 0 ? -1 : 1;
      const shoulder = V.a.set(side * SHOULDER_X, SHOULDER_Y - HIPS_Y, 0).applyMatrix4(this.torso.matrix);
      const target = V.b.fromArray(p.hands[i]!);
      const elbow = ik(shoulder, target, UPPER, FORE, V.c.set(side * 0.6, -0.5, -0.5), V.d);
      stretch(arm.a, shoulder, elbow);
      stretch(arm.b, elbow, target);
      arm.end.position.copy(target);
      arm.end.quaternion.setFromUnitVectors(DOWN, V.e.subVectors(target, elbow).normalize());
    }
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i]!;
      const side = i === 0 ? -1 : 1;
      const hip = V.a.set(side * 0.1, HIPS_Y - p.crouch - 0.03, 0);
      const f = p.feet[i]!;
      const ankle = V.b.set(f[0], f[1] + 0.06, f[2] - 0.02);
      const knee = ik(hip, ankle, THIGH, SHIN, V.c.set(0, 0.1, 1), V.d);
      stretch(leg.a, hip, knee);
      stretch(leg.b, knee, ankle);
      const shinUp = V.e.subVectors(knee, ankle).normalize();
      const lift = Math.min(1, Math.max(0, f[1] * 4));
      const up = V.f.set(0, 1, 0).lerp(shinUp, lift).normalize();
      leg.end.quaternion.setFromUnitVectors(UP, up);
      leg.end.position.copy(ankle).add(V.g.set(0, -0.06, -0.05).applyQuaternion(leg.end.quaternion));
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

const withP = (p: Pose, q: Partial<Pose>): Pose => ({ ...p, ...q });

/** Porter : les deux mains devant, sous ce qu'il tient */
const CARRY: [V3, V3] = [
  [-0.15, 0.82, 0.3],
  [0.15, 0.82, 0.3],
];

/** La posture d'un chef selon ce qu'il fait */
export function chefPose(m: ChefMotion, t: number, walkT: number): Pose {
  if (m.cheer >= 0 && m.cheer < 1.4) return reactPose("bras", m.cheer);
  if (m.act === 1) {
    // Le couteau monte et descend vite, l'autre main tient l'aliment
    const k = Math.abs(Math.sin(t * 14));
    return withP(STAND, {
      lean: 0.3,
      crouch: 0.03,
      hands: [
        [-0.1, 0.7 + k * 0.14, 0.4],
        [0.15, 0.64, 0.4],
      ],
      nod: 0.45,
    });
  }
  if (m.act === 2) {
    // On frotte l'assiette dans l'évier, en rond
    const a = t * 9;
    return withP(STAND, {
      lean: 0.42,
      crouch: 0.04,
      hands: [
        [-0.08 + Math.cos(a) * 0.05, 0.58, 0.4 + Math.sin(a) * 0.04],
        [0.1 - Math.cos(a) * 0.04, 0.58, 0.4 - Math.sin(a) * 0.03],
      ],
      nod: 0.5,
    });
  }
  let p = m.speed > 0.25 ? walkPose(walkT, Math.min(1, m.speed / 3.5)) : idlePose(t);
  if (m.act === 3) {
    // L'extincteur tenu devant, à deux mains, qui tremble un peu
    const s = Math.sin(t * 40) * 0.008;
    p = withP(p, {
      lean: 0.08,
      hands: [
        [-0.08, 0.8 + s, 0.38],
        [0.12, 0.72, 0.22],
      ],
    });
  } else if (m.carrying) p = withP(p, { hands: CARRY, lean: 0.06 });
  if (m.dash) p = withP(p, { lean: 0.42, crouch: 0.06 });
  if (m.stun) p = withP(p, { roll: Math.sin(t * 8) * 0.25, nod: -0.2, turn: Math.sin(t * 5) * 0.4 });
  return p;
}

/** Debout, il respire, regarde un peu autour */
function idlePose(t: number): Pose {
  const b = Math.sin(t * 2.2) * 0.012;
  return withP(RELAX, { crouch: b, turn: Math.sin(t * 0.6) * 0.15, lean: 0.03 });
}
