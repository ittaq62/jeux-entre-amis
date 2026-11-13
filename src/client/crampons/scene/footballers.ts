// Les footballeurs : des athlètes de dessin animé, à la tête sculptée et au visage peint, tous différents. Chaque morceau de
// corps est dessiné en un seul lot pour rester fluide à vingt-deux ; courses, frappes, tacles et célébrations sont calculés à chaque image.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Act, Team } from "../../../shared/games/crampons/model.ts";
import { clamp, wrapAngle } from "../../../shared/games/crampons/pitch.ts";

export interface Kit {
  shirt: string;
  sleeves: string;
  shorts: string;
  socks: string;
  pattern?: string;
  accent?: string;
}

export interface FootballerView {
  x: number;
  z: number;
  /** Là où il regarde, en radians (0 vers +x) */
  h: number;
  /** Sa vitesse */
  v: number;
  act: Act;
  team: Team;
  keeper: boolean;
  /** La direction d'un plongeon ou d'un tacle glissé */
  dirX: number;
  dirZ: number;
  /** Il vient de marquer ou il célèbre */
  cheer: boolean;
  /** Son équipe vient d'encaisser un but */
  sad?: boolean;
  off: boolean;
  /**
   * Quand c'est l'affichage qui mène la frappe (le ballon part à l'écran à cet instant) : où en est le geste, en secondes.
   * Le pied touche le ballon à KICK_CONTACT.
   */
  kickT?: number;
  /** Sa façon de célébrer, imposée (l'atelier des cartes) ; sinon chacun a la sienne */
  joy?: number;
  /** Il vient de faire une faute et proteste, les bras écartés */
  protest?: boolean;
  /**
   * Le sens de sa marche par rapport à son regard : 1 droit devant, 0 de côté, -1 à reculons (le gardien qui recule
   * face au jeu). Absent : droit devant.
   */
  gait?: number;
}

// -------------------------------------------------------------------------
// Les proportions : en mètres avant l'échelle, l'origine aux pieds
// -------------------------------------------------------------------------

/** La taille des joueurs : un peu plus de 2 m, tête comprise ; plus grands, le gardien bouchait tout son but */
const SCALE = 1.06;
const HIP_Y = 0.92;
const HIP_X = 0.115;
/** Depuis le bassin */
const SHOULDER_Y = 0.47;
const SHOULDER_X = 0.3;
const NECK_Y = 0.56;
const HEAD_Y = 0.85;
const THIGH = 0.37;
const SHIN = 0.35;
/** Du bas de la cheville au bas de la semelle */
const SOLE_DEPTH = 0.116;
const UPPER = 0.28;
const FORE = 0.26;
/** Le buste reste dans le geste un moment après le ballon */
export const KICK_HOLD = 0.3;
/** L'instant du geste où le pied arrive au ballon */
export const KICK_CONTACT = 0.13;

const HEAD_W = 0.2;
const HEAD_H = 0.238;
const HEAD_D = 0.225;
/** Le visage peint s'étend sur cet angle, de chaque côté du nez */
const FACE_SPAN = 1.25;

// -------------------------------------------------------------------------
// Les postures
// -------------------------------------------------------------------------

interface Pose {
  lean: number;
  twist: number;
  drop: number;
  lift: number;
  legLa: number;
  legLb: number;
  legRa: number;
  legRb: number;
  armLa: number;
  armLb: number;
  armLs: number;
  armRa: number;
  armRb: number;
  armRs: number;
  /** L'avant-bras qui se replie vers le milieu du corps (les mains sur les hanches, sur la tête) */
  armLi: number;
  armRi: number;
  pitch: number;
  roll: number;
  /** La tête, qui se relève ou se baisse sans suivre le buste */
  nod: number;
}

const zeroPose = (): Pose => ({
  lean: 0,
  twist: 0,
  drop: 0,
  lift: 0,
  legLa: 0.02,
  legLb: 0.12,
  legRa: -0.02,
  legRb: 0.12,
  armLa: 0,
  armLb: 0.28,
  armLs: 0.13,
  armRa: 0,
  armRb: 0.28,
  armRs: 0.13,
  armLi: 0,
  armRi: 0,
  pitch: 0,
  roll: 0,
  nod: 0,
});

const POSE_KEYS = Object.keys(zeroPose()) as (keyof Pose)[];

interface State {
  pose: Pose;
  phase: number;
  actAge: number;
  lastAct: Act;
  kickT: number;
  lastH: number;
  /** De combien on remonte (ou descend) le corps pour qu'il touche la pelouse, lissé d'une image à l'autre */
  ground: number;
  bank: number;
  hairStyle: number;
  hairSlot: number;
  skin: THREE.Color;
  hair: THREE.Color;
  /** Sa façon à lui de célébrer */
  joy: number;
  mood: number;
}

/** L'amplitude de la foulée (en radians de cuisse) à cette vitesse, de 0 à 1,2 */
const strideAmp = (speed: number) => 0.38 + speed * 0.32;

/**
 * La longueur de ses pas, selon le sens de sa marche : droit devant, la foulée entière ; de côté ou à reculons, des pas
 * plus courts (le gardien, en pas chassés, plus courts encore). La cadence suit : des pas courts, mais plus fréquents.
 */
function strideOf(f: FootballerView): number {
  const gait = f.gait ?? 1;
  if (f.keeper && f.v > 0.35 && f.v < 6 && gait < 0.75) return gait < -0.3 ? 0.55 : 0.45;
  return gait < -0.3 ? 0.6 : 0.6 + 0.4 * Math.abs(gait);
}

function legsRunning(target: Pose, s: State, speed: number, stride = 1) {
  const amp = strideAmp(speed) * stride;
  const sin = Math.sin(s.phase);
  const cos = Math.cos(s.phase);
  // La cuisse va et vient ; le genou se plie quand la jambe revient vers l'avant (le talon monte sous les fesses),
  // il reste presque tendu quand le pied pousse sur la pelouse. Le corps descend et remonte de lui-même avec la foulée.
  target.legLa = sin * amp + 0.06 * speed;
  target.legRa = -sin * amp + 0.06 * speed;
  target.legLb = 0.22 + Math.max(0, cos) * (0.55 + speed * 1.15);
  target.legRb = 0.22 + Math.max(0, -cos) * (0.55 + speed * 1.15);
  target.lift = 0;
}

function poseFor(s: State, f: FootballerView, act: Act, target: Pose, t: number) {
  Object.assign(target, zeroPose());
  const speed = Math.min(1.2, f.v / 10);
  if (f.cheer) {
    // Dès qu'il se déplace, il marche ou court : pas de joueur qui glisse, les jambes figées, pendant la fête
    const moving = f.v > 0.35;
    if (moving) legsRunning(target, s, speed);
    // Le rythme de chacun, pour que la fête ne soit pas réglée comme un ballet
    const beat = t * 9 + s.hairSlot * 1.3;
    const hop = moving ? 0 : Math.abs(Math.sin(beat * 0.5));
    const joy = f.joy ?? s.joy;
    target.nod = -0.35;
    if (joy === 0) {
      // Les bras au ciel, en V, qui frappent l'air tour à tour ; il saute sur place, les genoux repliés en l'air.
      // L'avant-bras prolonge l'écart du bras (armLi négatif) : sans cela, les coudes partaient sur le côté et les mains
      // remontaient à la verticale, comme un « haut les mains »
      target.armLa = 2.95;
      target.armRa = 2.95;
      target.armLs = 0.42;
      target.armRs = 0.42;
      target.armLi = -0.42;
      target.armRi = -0.42;
      target.armLb = 0.12 + Math.max(0, Math.sin(beat)) * 0.35;
      target.armRb = 0.12 + Math.max(0, -Math.sin(beat)) * 0.35;
      target.lift = hop * 0.42;
      if (!moving) {
        target.legLb = 0.3 + hop * 0.9;
        target.legRb = 0.3 + hop * 0.9;
      }
    } else if (joy === 1) {
      // L'avion, qui penche d'une aile sur l'autre
      target.armLs = 1.5;
      target.armRs = 1.5;
      target.armLb = 0.05;
      target.armRb = 0.05;
      target.armLa = Math.sin(beat * 0.5) * 0.3;
      target.armRa = -Math.sin(beat * 0.5) * 0.3;
      target.roll = Math.sin(beat * 0.5) * 0.32;
      target.lean = 0.3;
      if (!moving) {
        target.legLa = Math.sin(beat) * 0.3;
        target.legRa = -Math.sin(beat) * 0.3;
        target.lift = hop * 0.1;
      }
    } else if (joy === 2) {
      // Le poing levé, qui frappe l'air
      target.armRa = 2.6 + Math.sin(beat * 1.4) * 0.45;
      target.armRb = 0.9 + Math.sin(beat * 1.4) * 0.5;
      target.armRs = 0.2;
      target.armLa = -0.3;
      target.armLb = 1.4;
      target.armLs = 0.3;
      target.lift = hop * 0.25;
      target.twist = Math.sin(beat * 0.5) * 0.3;
    } else {
      // Les deux poings serrés, le buste en arrière : il crie sa joie
      target.armLa = 1.4;
      target.armRa = 1.4;
      target.armLb = 1.9 + Math.sin(beat) * 0.6;
      target.armRb = 1.9 - Math.sin(beat) * 0.6;
      target.armLs = 0.6;
      target.armRs = 0.6;
      target.lean = -0.28;
      target.nod = -0.5;
      target.lift = hop * 0.18;
    }
    return;
  }
  if (f.sad) {
    // L'équipe qui vient d'encaisser (ou l'exclu qui sort) : la tête basse et les mains sur les hanches, ou les bras
    // ballants pour ceux qui marchent
    if (f.v > 0.35) {
      legsRunning(target, s, speed * 0.6);
      target.nod = 0.6;
      target.lean = 0.16;
      const sin = Math.sin(s.phase);
      target.armLa = -sin * 0.25;
      target.armRa = sin * 0.25;
      target.armLb = 0.3;
      target.armRb = 0.3;
      return;
    }
    target.nod = 0.55;
    target.lean = 0.1;
    target.armLa = -0.2;
    target.armRa = -0.2;
    target.armLs = 0.6;
    target.armRs = 0.6;
    target.armLb = 0.65;
    target.armRb = 0.65;
    target.armLi = 0.91;
    target.armRi = 0.91;
    return;
  }
  if (f.protest && act === "none") {
    // « J'ai joué le ballon ! » : les bras écartés devant lui, les paumes vers le ciel, la tête qui se secoue
    if (f.v > 1) legsRunning(target, s, speed * 0.6);
    const shake = Math.sin(t * 7 + s.hairSlot) * 0.12;
    target.armLa = 0.9;
    target.armRa = 0.9;
    target.armLs = 0.75;
    target.armRs = 0.75;
    target.armLb = 0.55;
    target.armRb = 0.55;
    target.lean = -0.06;
    target.twist = shake;
    target.nod = -0.2;
    return;
  }
  if (act === "kick") {
    const p = Math.min(1, s.kickT / 0.24);
    const swing = p < 0.3 ? -1.25 * (p / 0.3) : -1.25 + 2.95 * ((p - 0.3) / 0.7);
    target.legRa = swing;
    target.legRb = p < 0.3 ? 1.5 : 0.1;
    target.legLa = -0.1;
    target.legLb = 0.3;
    target.lean = p < 0.3 ? 0.05 : -0.32;
    target.twist = p < 0.3 ? -0.45 : 0.55;
    target.armLa = 1;
    target.armLs = 1;
    target.armLb = 0.5;
    target.armRa = -0.8;
    target.armRs = 0.5;
    target.nod = 0.25;
    return;
  }
  if (act === "tackle") {
    target.legRa = 1.35;
    target.legRb = 0.1;
    target.legLa = -0.7;
    target.legLb = 1.1;
    target.drop = 0.2;
    target.lean = 0.3;
    target.armLs = 0.9;
    target.armRs = 0.9;
    return;
  }
  if (act === "slide") {
    // Assis sur l'herbe, le buste en arrière, la jambe d'attaque tendue au ras du sol, l'autre repliée dessous
    target.pitch = -1.0;
    target.drop = 0.55;
    target.legRa = 0.48;
    target.legRb = 0.05;
    target.legLa = 0.2;
    target.legLb = 1.65;
    target.armLa = -1.1;
    target.armLb = 0.2;
    target.armLs = 0.9;
    target.armRa = 0.5;
    target.armRs = 0.7;
    target.nod = 0.6;
    return;
  }
  if (act === "down") {
    target.pitch = -1.5;
    target.drop = 0.88;
    target.legRa = 0.25;
    target.legLa = 0.45;
    target.legLb = 0.6;
    target.armLs = 1;
    target.armRs = 1;
    return;
  }
  if (act === "dive") {
    // Le corps part à l'horizontale, du côté du plongeon, les bras tendus vers le ballon
    const facing = Math.cos(f.h) * f.dirZ - Math.sin(f.h) * f.dirX;
    target.roll = Math.sign(facing || 1) * 1.4;
    target.lift = 0.42;
    target.drop = 0.46;
    target.armLa = 3.05;
    target.armRa = 3.05;
    target.armLs = 0.12;
    target.armRs = 0.12;
    target.armLb = 0.05;
    target.armRb = 0.05;
    target.legLb = 0.5;
    target.legRb = 0.3;
    return;
  }
  if (act === "header") {
    target.lift = 0.5;
    target.lean = -0.3;
    target.nod = 0.4;
    target.armLa = -0.5;
    target.armRa = -0.5;
    target.armLs = 0.6;
    target.armRs = 0.6;
    target.legLb = 1;
    target.legRb = 1;
    return;
  }
  if (act === "hold") {
    target.armLa = 1.3;
    target.armRa = 1.3;
    target.armLb = 1.5;
    target.armRb = 1.5;
    target.armLs = 0.35;
    target.armRs = 0.35;
    return;
  }
  if (act === "throw") {
    target.armLa = 3.05;
    target.armRa = 3.05;
    target.armLs = 0.14;
    target.armRs = 0.14;
    target.armLb = 0.7;
    target.armRb = 0.7;
    target.lean = -0.2;
    return;
  }
  const gait = f.gait ?? 1;
  if (f.keeper && f.v > 0.35 && f.v < 6 && gait < 0.75) {
    // Le gardien qui se décale ou recule face au jeu : à petits pas, un peu fléchi, les bras prêts
    legsRunning(target, s, speed, strideOf(f));
    target.armLs = 0.65;
    target.armRs = 0.65;
    target.armLa = 0.55;
    target.armRa = 0.55;
    target.drop = 0.08;
    target.lean = gait < -0.3 ? 0.02 : 0.14;
    return;
  }
  if (f.v > 0.35) {
    // À reculons ou de côté, les pas sont plus courts
    legsRunning(target, s, speed, strideOf(f));
    const sin = Math.sin(s.phase);
    const amp = 0.5 + speed * 0.6;
    target.armLa = -sin * amp;
    target.armRa = sin * amp;
    target.armLb = 1.35 + speed * 0.35;
    target.armRb = 1.35 + speed * 0.35;
    target.armLs = 0.16;
    target.armRs = 0.16;
    target.lean = 0.08 + speed * 0.32;
    target.twist = sin * 0.24 * speed;
    target.roll = s.bank;
    target.nod = -target.lean * 0.7;
  } else {
    const breathe = Math.sin(t * 2.2 + s.hairSlot * 1.7) * 0.03;
    target.armLs = 0.13 + breathe;
    target.armRs = 0.13 + breathe;
    if (f.keeper) {
      target.armLs = 0.65;
      target.armRs = 0.65;
      target.armLa = 0.55;
      target.armRa = 0.55;
      target.drop = 0.1;
      target.lean = 0.2;
      target.legLb = 0.5;
      target.legRb = 0.5;
    }
  }
}

// -------------------------------------------------------------------------
// Les volumes
// -------------------------------------------------------------------------

const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const bump = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

type Ring = [y: number, halfWidth: number, halfDepth: number, zOffset?: number];

/** Un volume fait d'anneaux empilés du bas vers le haut, fermé aux deux bouts */
function loft(rings: Ring[], seg = 18): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const n = rings.length;
  const minY = rings[0]![0];
  const maxY = rings[n - 1]![0];
  for (let j = 0; j < n; j++) {
    const [y, w, d, off = 0] = rings[j]!;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.sin(a) * w, y, Math.cos(a) * d + off);
      uv.push(i / seg, (y - minY) / (maxY - minY || 1));
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + 1;
      const d = a + seg + 1;
      const c = d + 1;
      idx.push(a, b, c, a, c, d);
    }
  }
  // Les deux bouts
  const top = pos.length / 3;
  pos.push(0, maxY, rings[n - 1]![3] ?? 0);
  uv.push(0.5, 1);
  const bottom = pos.length / 3;
  pos.push(0, minY, rings[0]![3] ?? 0);
  uv.push(0.5, 0);
  for (let i = 0; i < seg; i++) {
    idx.push((n - 1) * (seg + 1) + i, (n - 1) * (seg + 1) + i + 1, top);
    idx.push(i + 1, i, bottom);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  sealSeam(g, n, seg);
  return g;
}

/** La première et la dernière colonne se touchent : on leur donne la même normale, pour ne pas voir de couture */
function sealSeam(g: THREE.BufferGeometry, rows: number, seg: number) {
  const nor = g.getAttribute("normal") as THREE.BufferAttribute;
  for (let j = 0; j < rows; j++) {
    const a = j * (seg + 1);
    const b = a + seg;
    const x = nor.getX(a) + nor.getX(b);
    const y = nor.getY(a) + nor.getY(b);
    const z = nor.getZ(a) + nor.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(a, x / l, y / l, z / l);
    nor.setXYZ(b, x / l, y / l, z / l);
  }
}

/** Un membre, de son attache (en haut, à l'origine) jusqu'à une unité plus bas : `profile` donne son rayon le long du segment */
function limb(profile: (u: number) => number, back = (_u: number) => 0, seg = 12): THREE.BufferGeometry {
  const rings: Ring[] = [];
  const steps = 8;
  rings.push([-1.04, profile(1) * 0.55, profile(1) * 0.55, back(1)]);
  for (let k = steps; k >= 0; k--) {
    const u = k / steps;
    rings.push([-u, profile(u), profile(u), back(u)]);
  }
  rings.push([0.05, profile(0) * 0.72, profile(0) * 0.72, back(0)]);
  rings.push([0.09, profile(0) * 0.25, profile(0) * 0.25, back(0)]);
  return loft(rings, seg);
}

/** La forme de la tête : une sphère retravaillée, avec une vraie mâchoire, un menton, des pommettes et un nez discret */
function headPoint(nx: number, ny: number, nz: number): [number, number, number] {
  const low = sstep(0.0, -1, ny);
  const crown = sstep(0.4, 1, ny);
  // La mâchoire reste large jusqu'au menton : sans cela, la tête finit en pointe
  const x = nx * (1 - crown * 0.03 + bump(ny, -0.52, 0.3) * 0.13 - low * 0.03);
  const y = ny * (1 - crown * 0.07);
  let z = nz * (1 - low * 0.12);
  if (nz > 0) {
    const side = Math.abs(nx);
    const nose = Math.exp(-((nx / 0.095) ** 2 + ((ny + 0.13) / 0.12) ** 2)) * 0.13;
    const bridge = Math.exp(-((nx / 0.07) ** 2 + ((ny - 0.03) / 0.18) ** 2)) * 0.04;
    const brow = bump(ny, 0.27, 0.09) * 0.02 * (1 - sstep(0.3, 0.7, side));
    const socket = Math.exp(-(((side - 0.34) / 0.17) ** 2 + ((ny - 0.11) / 0.11) ** 2)) * 0.028;
    const cheek = Math.exp(-(((side - 0.55) / 0.2) ** 2 + ((ny + 0.2) / 0.18) ** 2)) * 0.02;
    const lips = Math.exp(-((nx / 0.24) ** 2 + ((ny + 0.5) / 0.1) ** 2)) * 0.022;
    z += (nose + bridge + brow - socket + cheek + lips) * Math.min(1, nz * 1.6);
  }
  const chin = Math.exp(-((nx / 0.32) ** 2 + ((ny + 0.86) / 0.17) ** 2)) * 0.07;
  return [x * HEAD_W, y * HEAD_H, (z + chin * Math.max(0, nz + 0.3)) * HEAD_D];
}

/** Une surface posée sur une grille longitude-latitude ; seules les cases retenues par `keep` sont construites */
function gridSurface(
  nu: number,
  nv: number,
  at: (nx: number, ny: number, nz: number) => [number, number, number],
  keep: ((nx: number, ny: number, nz: number, theta: number) => boolean) | null,
  extra?: (nx: number, ny: number, nz: number, theta: number, lat: number, uv: number[], colors: number[]) => void,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const colors: number[] = [];
  const idx: number[] = [];
  const ok: boolean[] = [];
  for (let j = 0; j <= nv; j++) {
    const lat = -Math.PI / 2 + (j / nv) * Math.PI;
    for (let i = 0; i <= nu; i++) {
      const theta = -Math.PI + (i / nu) * Math.PI * 2;
      const nx = Math.cos(lat) * Math.sin(theta);
      const ny = Math.sin(lat);
      const nz = Math.cos(lat) * Math.cos(theta);
      pos.push(...at(nx, ny, nz));
      ok.push(keep ? keep(nx, ny, nz, theta) : true);
      extra?.(nx, ny, nz, theta, lat, uv, colors);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const d = a + nu + 1;
      const c = d + 1;
      if (ok[a] && ok[b] && ok[c] && ok[d]) idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (uv.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (colors.length) g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  sealSeam(g, nv + 1, nu);
  return g;
}

function headGeometry(): THREE.BufferGeometry {
  return gridSurface(44, 34, headPoint, null, (_x, _y, _z, theta, lat, uv) => {
    uv.push(clamp(0.5 + theta / (2 * FACE_SPAN), 0.005, 0.995), lat / Math.PI + 0.5);
  });
}

// -------------------------------------------------------------------------
// Les coiffures
// -------------------------------------------------------------------------

const lumpAt = (nx: number, ny: number, nz: number) => Math.sin(nx * 11 + 1.3) * Math.sin(ny * 13 + 0.4) * Math.sin(nz * 9 + 2.1);

/** La limite naturelle des cheveux, longitude par longitude : haute sur le front, au-dessus des oreilles, basse sur la nuque */
function hairline(theta: number, front = 0.6, side = 0.2, back = -0.5): number {
  const c = Math.cos(theta);
  const limit = c > 0 ? side + (front - side) * c : side + (back - side) * -c;
  return limit + Math.sin(theta * 9) * 0.022;
}

/** Une calotte de cheveux, faite de grosses mèches sculptées, qui s'affine jusqu'à la limite de la chevelure */
function shell(thick: (nx: number, ny: number, nz: number) => number, limit: (theta: number) => number, lumps = 0.4): THREE.BufferGeometry {
  const nu = 60;
  const nv = 20;
  const pos: number[] = [];
  const colors: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const theta = -Math.PI + (i / nu) * Math.PI * 2;
      const low = Math.asin(clamp(limit(theta), -0.98, 0.98));
      const f = j / nv;
      const lat = low + f * (Math.PI / 2 - low);
      const nx = Math.cos(lat) * Math.sin(theta);
      const ny = Math.sin(lat);
      const nz = Math.cos(lat) * Math.cos(theta);
      const [x, y, z] = headPoint(nx, ny, nz * (nz > 0 ? 0.9 : 1));
      const l = Math.hypot(x, y, z) || 1;
      // Les cheveux naissent à ras du crâne, puis prennent tout leur volume
      const lump = lumpAt(nx, ny, nz);
      const t = thick(nx, ny, nz) * (1 + lumps * lump) * sstep(0, 0.16, f) + 0.002;
      pos.push(x + (x / l) * t, y + (y / l) * t, z + (z / l) * t);
      const c = 0.84 + 0.26 * (lump * 0.5 + 0.5);
      colors.push(c, c, c);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const d = a + nu + 1;
      const c = d + 1;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  sealSeam(g, nv + 1, nu);
  return g;
}

function tint(g: THREE.BufferGeometry, c: number): THREE.BufferGeometry {
  const n = g.getAttribute("position").count;
  const a = new Float32Array(n * 3).fill(c);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

function blob(x: number, y: number, z: number, rx: number, ry: number, rz: number, c = 1): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 9, 7);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return tint(g, c);
}

/** Un cône, de sa base vers sa pointe */
function spike(x: number, y: number, z: number, tx: number, ty: number, tz: number, r: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3(tx - x, ty - y, tz - z);
  const h = dir.length();
  const g = new THREE.ConeGeometry(r, h, 7);
  g.translate(0, h / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate(x, y, z);
  return tint(g, 1.08);
}

function joined(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    g.deleteAttribute("uv");
    return g;
  });
  const merged = mergeGeometries(flat)!;
  for (const p of parts) p.dispose();
  return merged;
}

const HAIR_STYLES = 12;
const BALD = 11;

function hairGeometry(style: number): THREE.BufferGeometry {
  const basic = (theta: number) => hairline(theta);
  if (style === 0) return joined([shell(() => 0.018, basic, 0.25)]);
  if (style === 1) {
    // Courts et en bataille, une frange sur le front
    return joined([
      shell(() => 0.05, basic, 0.65),
      ...[-0.11, -0.055, 0, 0.055, 0.11].map((x, i) => blob(x, 0.155 - i * 0.004, 0.17 - Math.abs(x) * 0.25, 0.05, 0.042, 0.05, 0.98)),
    ]);
  }
  if (style === 2) {
    // La banane, relevée à l'avant
    return joined([
      shell(() => 0.038, basic, 0.3),
      blob(0, 0.235, 0.12, 0.13, 0.085, 0.1, 1.05),
      blob(-0.05, 0.27, 0.06, 0.1, 0.07, 0.1, 1.08),
      blob(0.06, 0.255, 0.05, 0.09, 0.06, 0.09, 1),
    ]);
  }
  if (style === 3) {
    // En pointes
    const parts = [shell(() => 0.03, basic, 0.3)];
    for (let k = 0; k < 18; k++) {
      const a = k * 2.4;
      const r = 0.16 * Math.sqrt((k + 0.5) / 18);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r - 0.01;
      const y = 0.25 * Math.sqrt(Math.max(0.05, 1 - (x / HEAD_W) ** 2 - (z / HEAD_D) ** 2));
      parts.push(spike(x, y, z, x * 1.5, y + 0.1, z * 1.5 - 0.015, 0.042));
    }
    return joined(parts);
  }
  if (style === 4) {
    // La crête, sur le milieu du crâne, les côtés rasés de près
    const parts = [shell(() => 0.005, basic, 0.1)];
    for (let k = 0; k < 9; k++) {
      const a = 0.45 + (k / 8) * 2.15;
      const z = Math.cos(a) * 0.225;
      const y = Math.sin(a) * 0.25;
      parts.push(spike(0, y - 0.02, z - 0.012, 0, y * 1.2 + 0.05, z * 1.2, 0.055));
    }
    return joined(parts);
  }
  if (style === 5) {
    // La coupe afro, ronde et fournie
    return joined([
      shell(
        () => 0.125,
        (t) => hairline(t, 0.5, 0.02, -0.5),
        0.22,
      ),
    ]);
  }
  if (style === 6) {
    // Bouclés sur le dessus
    const parts = [shell(() => 0.022, basic, 0.25)];
    for (let k = 0; k < 42; k++) {
      const a = k * 2.399;
      const r = 0.2 * Math.sqrt((k + 0.5) / 42);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 1.05;
      const y = 0.25 * Math.sqrt(Math.max(0.03, 1 - (x / HEAD_W) ** 2 - (z / HEAD_D) ** 2));
      parts.push(blob(x, y + 0.02, z, 0.044, 0.04, 0.044, 0.9 + (k % 4) * 0.08));
    }
    return joined(parts);
  }
  if (style === 7) {
    // Mi-longs, jusqu'à la nuque
    return joined([
      shell(
        () => 0.05,
        (t) => hairline(t, 0.6, -0.45, -0.95),
        0.32,
      ),
      blob(0, -0.2, -0.17, 0.17, 0.1, 0.07, 0.92),
    ]);
  }
  if (style === 8) {
    // Le chignon
    return joined([shell(() => 0.03, basic, 0.25), blob(0, 0.25, -0.14, 0.085, 0.08, 0.085, 1.05)]);
  }
  if (style === 9) {
    // La raie sur le côté, le volume à droite
    return joined([shell((nx) => 0.03 + Math.max(0, nx + 0.15) * 0.05, basic, 0.3), blob(0.07, 0.235, 0.1, 0.12, 0.06, 0.1, 1.05)]);
  }
  // Les tresses, qui tombent autour de la tête
  const parts = [shell(() => 0.03, basic, 0.3)];
  for (let k = 0; k < 16; k++) {
    const a = Math.PI * 0.42 + (k / 15) * Math.PI * 1.16;
    const x = Math.sin(a) * 0.2;
    const z = Math.cos(a) * 0.215;
    const g = new THREE.CapsuleGeometry(0.025, 0.2 + (k % 3) * 0.05, 2, 6);
    g.translate(x, 0.0 - (k % 3) * 0.02, z);
    parts.push(tint(g, 0.9 + (k % 2) * 0.16));
  }
  return joined(parts);
}

// -------------------------------------------------------------------------
// Les planches : les maillots et les visages
// -------------------------------------------------------------------------

function isLight(hex: string): boolean {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.45;
}

const TILE_COLS = 6;
const TILE_ROWS = 4;

/** Une planche de maillots : un carreau par joueur, avec sa couleur, ses bandes et son numéro dans le dos */
function shirtAtlas(kits: Kit[], shirts: number[]): THREE.CanvasTexture {
  const tw = 170;
  const th = 128;
  const c = document.createElement("canvas");
  c.width = tw * TILE_COLS;
  c.height = th * TILE_ROWS;
  const g = c.getContext("2d")!;
  kits.forEach((k, i) => {
    const x = (i % TILE_COLS) * tw;
    const y = Math.floor(i / TILE_COLS) * th;
    g.fillStyle = k.shirt;
    g.fillRect(x, y, tw, th);
    // Le motif du club, sur le pourtour du maillot
    g.save();
    g.beginPath();
    g.rect(x, y, tw, th);
    g.clip();
    g.fillStyle = k.accent ?? k.sleeves;
    if (k.pattern === "rayures") for (let s = 0; s < 8; s += 2) g.fillRect(x + (s * tw) / 8, y, tw / 8, th);
    else if (k.pattern === "cercles") for (let s = 0; s < 7; s += 2) g.fillRect(x, y + (s * th) / 7, tw, th / 7);
    else if (k.pattern === "moitie") g.fillRect(x + tw * 0.5, y, tw * 0.5, th);
    else if (k.pattern === "echarpe") {
      g.beginPath();
      g.moveTo(x, y + th * 0.72);
      g.lineTo(x + tw, y - th * 0.02);
      g.lineTo(x + tw, y + th * 0.3);
      g.lineTo(x, y + th * 1.04);
      g.closePath();
      g.fill();
    }
    g.restore();
    // Le haut des épaules, dans la couleur des manches
    g.fillStyle = k.sleeves === k.shirt ? "rgba(255,255,255,0.22)" : k.sleeves;
    g.fillRect(x, y, tw, th * 0.11);
    // Dans le dos, un numéro bordé : il reste lisible sur n'importe quel motif
    const dark = isLight(k.shirt);
    g.font = `900 ${th * 0.46}px 'Arial Black', Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = 8;
    g.strokeStyle = dark ? "#ffffff" : "#16202c";
    g.strokeText(String(shirts[i] ?? i + 1), x + tw / 2, y + th * 0.47);
    g.fillStyle = dark ? "#16202c" : "#ffffff";
    g.fillText(String(shirts[i] ?? i + 1), x + tw / 2, y + th * 0.47);
    // L'écusson sur le cœur, et un petit numéro sur la poitrine
    g.fillStyle = isLight(k.shirt) ? "#16202c" : "#ffffff";
    g.beginPath();
    g.arc(x + tw * 0.085, y + th * 0.34, th * 0.052, 0, Math.PI * 2);
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

interface FaceTraits {
  skin: THREE.Color;
  hair: THREE.Color;
  iris: string;
  /** L'angle des sourcils : positif, il a l'air déterminé */
  browTilt: number;
  browThick: number;
  /** 0 rasé, 1 barbe de trois jours, 2 bouc, 3 barbe, 4 moustache */
  beard: number;
  freckles: boolean;
  eyeSize: number;
  mouthW: number;
  war: string | null;
}

const css = (c: THREE.Color, k = 1) => {
  const o = c.clone().multiplyScalar(k);
  return `#${o.getHexString()}`;
};

const FACE_COLS = 8;
const FACE_ROWS = 6;
const FACE_TILE = 224;

/** Peint un visage dans son carreau. Le centre du carreau est le nez ; le haut est le sommet du crâne. */
function paintFace(g: CanvasRenderingContext2D, ox: number, oy: number, t: FaceTraits, joy: boolean) {
  const S = FACE_TILE;
  g.save();
  g.translate(ox, oy);
  g.beginPath();
  g.rect(0, 0, S, S);
  g.clip();
  g.fillStyle = css(t.skin);
  g.fillRect(0, 0, S, S);
  // Le modelé : le front et les joues prennent la lumière, les tempes et le dessous du menton restent sombres
  let grad = g.createRadialGradient(S * 0.5, S * 0.47, S * 0.06, S * 0.5, S * 0.5, S * 0.52);
  grad.addColorStop(0, "rgba(255,240,225,0.2)");
  grad.addColorStop(0.55, "rgba(255,240,225,0)");
  grad.addColorStop(1, "rgba(40,16,8,0.26)");
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  grad = g.createLinearGradient(0, S * 0.74, 0, S * 0.9);
  grad.addColorStop(0, "rgba(40,16,8,0)");
  grad.addColorStop(1, "rgba(40,16,8,0.16)");
  g.fillStyle = grad;
  g.fillRect(0, S * 0.68, S, S * 0.32);
  // Le rose des joues
  for (const sx of [0.3, 0.7]) {
    grad = g.createRadialGradient(S * sx, S * 0.58, 1, S * sx, S * 0.58, S * 0.1);
    grad.addColorStop(0, joy ? "rgba(235,90,70,0.3)" : "rgba(235,90,70,0.16)");
    grad.addColorStop(1, "rgba(235,90,70,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }
  // La barbe, sous tout le reste
  const beardCol = css(t.hair, 0.82);
  if (t.beard === 1 || t.beard === 3) {
    g.globalAlpha = t.beard === 1 ? 0.3 : 0.92;
    g.fillStyle = beardCol;
    g.beginPath();
    g.moveTo(S * 0.17, S * 0.56);
    g.quadraticCurveTo(S * 0.27, S * 0.63, S * 0.34, S * 0.635);
    g.quadraticCurveTo(S * 0.5, S * 0.6, S * 0.66, S * 0.635);
    g.quadraticCurveTo(S * 0.73, S * 0.63, S * 0.83, S * 0.56);
    g.lineTo(S * 0.82, S * 0.9);
    g.lineTo(S * 0.18, S * 0.9);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  } else if (t.beard === 2) {
    g.globalAlpha = 0.9;
    g.fillStyle = beardCol;
    g.beginPath();
    g.ellipse(S * 0.5, S * 0.74, S * 0.075, S * 0.08, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  if (t.beard === 3 || t.beard === 4 || t.beard === 2) {
    g.fillStyle = beardCol;
    g.beginPath();
    g.moveTo(S * 0.4, S * 0.645);
    g.quadraticCurveTo(S * 0.5, S * 0.605, S * 0.6, S * 0.645);
    g.quadraticCurveTo(S * 0.5, S * 0.635, S * 0.4, S * 0.645);
    g.lineTo(S * 0.4, S * 0.66);
    g.quadraticCurveTo(S * 0.5, S * 0.645, S * 0.6, S * 0.66);
    g.closePath();
    g.fill();
  }
  if (t.freckles) {
    g.fillStyle = "rgba(120,60,30,0.4)";
    for (let k = 0; k < 16; k++) {
      const sx = 0.33 + ((k * 37) % 34) / 100;
      const sy = 0.53 + ((k * 23) % 9) / 100;
      g.beginPath();
      g.arc(S * sx, S * sy, 1.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (t.war) {
    g.fillStyle = t.war;
    for (const sx of [0.3, 0.7]) g.fillRect(S * (sx - 0.055), S * 0.555, S * 0.11, S * 0.03);
  }
  // Les yeux
  const eyeY = S * 0.468;
  const w = S * 0.074 * t.eyeSize;
  const h = S * 0.042 * t.eyeSize;
  for (const side of [-1, 1]) {
    const ex = S * (0.5 + side * 0.158);
    g.save();
    g.translate(ex, eyeY);
    if (joy) {
      // Les yeux plissés de bonheur
      g.strokeStyle = "#1c1210";
      g.lineWidth = 4.2;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(-w, h * 0.5);
      g.quadraticCurveTo(0, -h * 1.5, w, h * 0.5);
      g.stroke();
    } else {
      const almond = () => {
        g.beginPath();
        g.moveTo(-w, h * 0.25);
        g.quadraticCurveTo(-w * 0.2, -h * 1.45, w, -h * 0.1);
        g.quadraticCurveTo(w * 0.1, h * 1.2, -w, h * 0.25);
        g.closePath();
      };
      if (side === 1) g.scale(-1, 1);
      almond();
      g.fillStyle = "#fbf6ec";
      g.fill();
      g.save();
      almond();
      g.clip();
      g.fillStyle = t.iris;
      g.beginPath();
      g.arc(side * 0.5, -h * 0.05, h * 1.02, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#0d0a0a";
      g.beginPath();
      g.arc(side * 0.5, -h * 0.05, h * 0.52, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.95)";
      g.beginPath();
      g.arc(side * -h * 0.28 + 0.5, -h * 0.42, h * 0.26, 0, Math.PI * 2);
      g.fill();
      g.restore();
      // La paupière, qui donne le regard
      g.strokeStyle = "#1c1210";
      g.lineWidth = 3.6;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(-w * 1.06, h * 0.3);
      g.quadraticCurveTo(-w * 0.2, -h * 1.5, w * 1.04, -h * 0.12);
      g.stroke();
    }
    g.restore();
    // Le sourcil
    const bx = S * (0.5 + side * 0.158);
    const by = S * 0.39;
    const tilt = joy ? -0.14 : t.browTilt;
    g.save();
    g.translate(bx, by);
    g.rotate(-side * tilt);
    g.fillStyle = css(t.hair, 0.62);
    g.beginPath();
    g.moveTo(side * -S * 0.075, S * 0.008);
    g.quadraticCurveTo(0, -S * 0.016 * t.browThick, side * S * 0.08, -S * 0.003);
    g.quadraticCurveTo(0, S * 0.022 * t.browThick, side * -S * 0.075, S * 0.008);
    g.closePath();
    g.fill();
    g.restore();
  }
  // Le dessous du nez
  g.fillStyle = "rgba(60,22,12,0.42)";
  g.beginPath();
  g.ellipse(S * 0.5, S * 0.595, S * 0.052, S * 0.014, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,245,235,0.24)";
  g.beginPath();
  g.ellipse(S * 0.5, S * 0.53, S * 0.016, S * 0.05, 0, 0, Math.PI * 2);
  g.fill();
  // La bouche
  const mw = S * 0.09 * t.mouthW;
  if (joy) {
    g.fillStyle = "#3e0f12";
    g.beginPath();
    g.moveTo(S * 0.5 - mw * 1.25, S * 0.655);
    g.quadraticCurveTo(S * 0.5, S * 0.645, S * 0.5 + mw * 1.25, S * 0.655);
    g.quadraticCurveTo(S * 0.5 + mw, S * 0.775, S * 0.5, S * 0.775);
    g.quadraticCurveTo(S * 0.5 - mw, S * 0.775, S * 0.5 - mw * 1.25, S * 0.655);
    g.closePath();
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = "#fbf8f2";
    g.fillRect(S * 0.5 - mw * 1.3, S * 0.645, mw * 2.6, S * 0.038);
    g.fillStyle = "#c9444a";
    g.beginPath();
    g.ellipse(S * 0.5, S * 0.775, mw * 0.72, S * 0.04, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  } else {
    g.strokeStyle = "#5c2420";
    g.lineWidth = 3.2;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(S * 0.5 - mw, S * 0.668);
    g.quadraticCurveTo(S * 0.5, S * 0.682, S * 0.5 + mw, S * 0.664);
    g.stroke();
    g.fillStyle = "rgba(90,30,28,0.26)";
    g.beginPath();
    g.ellipse(S * 0.5, S * 0.693, mw * 0.62, S * 0.012, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// -------------------------------------------------------------------------
// Les teintes
// -------------------------------------------------------------------------

const SKINS = ["#f7d3ae", "#eebd93", "#d9a074", "#b77d52", "#8d5b3a", "#5f3d29"];
const DARK_HAIR = ["#141216", "#1f1612", "#2b1c12"];
const ANY_HAIR = ["#1b1612", "#3a2616", "#5f3c1f", "#8a5a2c", "#c4934a", "#e0c27a", "#7f2f1b", "#d8d2c4"];
const IRIS = ["#4a2e18", "#3a2415", "#2e6a8c", "#467a4a", "#6b4a22"];

/** Plus ou moins de lumière selon le tissu, et un liseré clair au bord des volumes pour bien détacher les joueurs de la pelouse */
function dressed(mat: THREE.MeshStandardMaterial, tiles?: { cols: number; rows: number }, rim = 0.2): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (s) => {
    if (tiles) {
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aTile;")
        .replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>\nvMapUv = uv * vec2(${(1 / tiles.cols).toFixed(5)}, ${(1 / tiles.rows).toFixed(5)}) + aTile;`,
        );
    }
    s.fragmentShader = s.fragmentShader.replace(
      "#include <opaque_fragment>",
      `float rimLight = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
outgoingLight += (diffuseColor.rgb * 0.6 + vec3(0.4)) * rimLight * ${rim.toFixed(2)};
#include <opaque_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => `joueur-${tiles?.cols ?? 0}-${tiles?.rows ?? 0}-${rim}`;
  return mat;
}

const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class Footballers {
  private group = new THREE.Group();
  private states: State[] = [];
  private targetPose = zeroPose();
  private meshes: THREE.InstancedMesh[] = [];
  private single: THREE.InstancedMesh[] = [];
  private double: THREE.InstancedMesh[] = [];
  private head: THREE.InstancedMesh;
  private neck: THREE.InstancedMesh;
  private collar: THREE.InstancedMesh;
  private ears: THREE.InstancedMesh;
  private torso: THREE.InstancedMesh;
  private shorts: THREE.InstancedMesh;
  private shortLegs: THREE.InstancedMesh;
  private upperArms: THREE.InstancedMesh;
  private foreArms: THREE.InstancedMesh;
  private hands: THREE.InstancedMesh;
  /** Les épaules, les coudes et les genoux : des rotules qui raccordent les membres, quel que soit le geste */
  private delts: THREE.InstancedMesh;
  private elbowBalls: THREE.InstancedMesh;
  private kneeBalls: THREE.InstancedMesh;
  private thighs: THREE.InstancedMesh;
  private shins: THREE.InstancedMesh;
  private cuffs: THREE.InstancedMesh;
  private boots: THREE.InstancedMesh;
  private soles: THREE.InstancedMesh;
  private hair: (THREE.InstancedMesh | null)[] = [];
  private shadows: THREE.InstancedMesh | null = null;
  private atlas: THREE.CanvasTexture;
  private faces: THREE.CanvasTexture;
  private faceTiles: THREE.InstancedBufferAttribute;
  private blob: THREE.Texture | null = null;

  constructor(
    scene: THREE.Scene,
    private count: number,
    private kits: [Kit, Kit],
    private gkKits: [Kit, Kit],
    private keeperFlags: boolean[],
    shirts: number[],
    castShadows: boolean,
    seed = 1,
  ) {
    const mat = (rough = 0.62) => dressed(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: rough, metalness: 0 }));
    const add = (g: THREE.BufferGeometry, n: number, material: THREE.Material = mat(), shadow = true) => {
      const m = new THREE.InstancedMesh(g, material, n);
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = castShadows && shadow;
      this.group.add(m);
      this.meshes.push(m);
      return m;
    };
    const one = (g: THREE.BufferGeometry, material?: THREE.Material, shadow = true) => {
      const m = add(g, count, material, shadow);
      this.single.push(m);
      return m;
    };
    const two = (g: THREE.BufferGeometry, material?: THREE.Material, shadow = true) => {
      const m = add(g, count * 2, material, shadow);
      this.double.push(m);
      return m;
    };

    let rng = seed | 0;
    const rand = () => {
      rng = (rng + 0x6d2b79f5) | 0;
      let t = Math.imul(rng ^ (rng >>> 15), 1 | rng);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;

    // Chacun sa tête : la peau, les cheveux, le regard, la barbe, puis le visage peint deux fois, normal et joyeux
    const c = document.createElement("canvas");
    c.width = FACE_COLS * FACE_TILE;
    c.height = FACE_ROWS * FACE_TILE;
    const paint = c.getContext("2d")!;
    const hairUsed = new Array(HAIR_STYLES).fill(0) as number[];
    const tiles = new Float32Array(count * 2);
    this.faceTiles = new THREE.InstancedBufferAttribute(tiles, 2);
    this.faceTiles.setUsage(THREE.DynamicDrawUsage);
    const team = (i: number) => (i < count / 2 ? 0 : 1);
    for (let i = 0; i < count; i++) {
      const skinIndex = Math.floor(rand() * SKINS.length);
      const hairColor = new THREE.Color(skinIndex >= 4 ? (rand() < 0.86 ? pick(DARK_HAIR) : pick(ANY_HAIR)) : pick(ANY_HAIR));
      const skin = new THREE.Color(SKINS[skinIndex]!);
      // Les coupes qui vont mieux à certains cheveux sont plus fréquentes pour eux, sans jamais être réservées
      const style = skinIndex >= 4 && rand() < 0.45 ? pick([0, 5, 6, 10, BALD]) : Math.floor(rand() * HAIR_STYLES);
      const traits: FaceTraits = {
        skin,
        hair: hairColor,
        iris: skinIndex >= 3 ? pick([IRIS[0]!, IRIS[1]!]) : pick(IRIS),
        browTilt: 0.01 + rand() * 0.11,
        browThick: 0.8 + rand() * 0.8,
        beard: rand() < 0.5 ? 0 : pick([1, 1, 2, 3, 4]),
        freckles: skinIndex <= 1 && rand() < 0.3,
        eyeSize: 0.92 + rand() * 0.22,
        mouthW: 0.85 + rand() * 0.3,
        war: rand() < 0.1 ? "#1a1a22" : null,
      };
      paintFace(paint, ((i * 2) % FACE_COLS) * FACE_TILE, Math.floor((i * 2) / FACE_COLS) * FACE_TILE, traits, false);
      paintFace(paint, ((i * 2 + 1) % FACE_COLS) * FACE_TILE, Math.floor((i * 2 + 1) / FACE_COLS) * FACE_TILE, traits, true);
      this.states.push({
        pose: zeroPose(),
        phase: rand() * 6,
        actAge: 0,
        lastAct: "none",
        kickT: 9,
        ground: 0,
        lastH: 0,
        bank: 0,
        hairStyle: style,
        hairSlot: hairUsed[style]!,
        skin,
        hair: hairColor,
        joy: Math.floor(rand() * 4),
        mood: 0,
      });
      hairUsed[style]!++;
      this.setFace(i, 0);
    }
    void team;
    this.faces = new THREE.CanvasTexture(c);
    this.faces.colorSpace = THREE.SRGBColorSpace;
    this.faces.anisotropy = 8;

    const head = headGeometry();
    head.setAttribute("aTile", this.faceTiles);
    this.head = one(
      head,
      dressed(new THREE.MeshStandardMaterial({ map: this.faces, roughness: 0.56 }), { cols: FACE_COLS, rows: FACE_ROWS }, 0.16),
    );
    const neck = loft(
      [
        [-0.08, 0.075, 0.08],
        [0.05, 0.07, 0.075],
        [0.14, 0.066, 0.07],
      ],
      12,
    );
    this.neck = one(neck, mat(0.56));
    const collar = new THREE.TorusGeometry(0.083, 0.019, 6, 18);
    collar.rotateX(Math.PI / 2);
    collar.rotateX(-0.25);
    this.collar = one(collar, mat(0.7), false);
    const ear = new THREE.SphereGeometry(1, 10, 8);
    ear.scale(0.022, 0.06, 0.04);
    this.ears = two(ear, mat(0.56), false);

    const torso = loft(
      [
        [-0.03, 0.195, 0.14],
        [0.1, 0.19, 0.137],
        [0.24, 0.225, 0.152],
        [0.38, 0.268, 0.163],
        [0.47, 0.29, 0.15],
        [0.525, 0.235, 0.115],
        [0.57, 0.1, 0.085],
      ],
      22,
    );
    const kitOf = keeperFlags.map((k, i) => (k ? gkKits[i < count / 2 ? 0 : 1] : kits[i < count / 2 ? 0 : 1]));
    this.atlas = shirtAtlas(kitOf, shirts);
    const shirtTiles = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      shirtTiles[i * 2] = (i % TILE_COLS) / TILE_COLS;
      shirtTiles[i * 2 + 1] = 1 - (Math.floor(i / TILE_COLS) + 1) / TILE_ROWS;
    }
    torso.setAttribute("aTile", new THREE.InstancedBufferAttribute(shirtTiles, 2));
    this.torso = one(
      torso,
      dressed(new THREE.MeshStandardMaterial({ map: this.atlas, roughness: 0.66 }), { cols: TILE_COLS, rows: TILE_ROWS }),
    );

    this.shorts = one(
      loft(
        [
          [-0.14, 0.215, 0.165],
          [-0.03, 0.22, 0.165],
          [0.06, 0.205, 0.155],
          [0.1, 0.19, 0.142],
        ],
        18,
      ),
      mat(0.7),
    );
    this.shortLegs = two(
      limb(
        (u) => 0.128 + u * 0.018,
        () => 0,
        14,
      ),
      mat(0.7),
    );
    this.upperArms = two(limb((u) => 0.078 - u * 0.006, undefined, 12));
    this.foreArms = two(
      limb((u) => 0.058 - u * 0.016, undefined, 10),
      mat(0.56),
    );
    const palm = new THREE.SphereGeometry(1, 10, 8);
    palm.scale(0.055, 0.075, 0.042);
    palm.translate(0, -0.06, 0);
    const thumb = new THREE.SphereGeometry(1, 8, 6);
    thumb.scale(0.02, 0.045, 0.02);
    thumb.translate(0.05, -0.04, 0.03);
    this.hands = two(joinedPlain([palm, thumb]), mat(0.56));
    this.thighs = two(
      limb((u) => 0.106 - u * 0.036 + bump(u, 0.3, 0.3) * 0.006, undefined, 12),
      mat(0.56),
    );
    this.shins = two(
      limb(
        (u) => 0.058 + bump(u, 0.28, 0.24) * 0.03 - u * 0.012,
        (u) => -bump(u, 0.28, 0.24) * 0.018,
        12,
      ),
    );
    const cuff = new THREE.TorusGeometry(0.075, 0.016, 6, 14);
    cuff.rotateX(Math.PI / 2);
    this.cuffs = two(cuff, mat(0.7), false);
    // L'épaule arrondie (dans la couleur de la manche), le coude et le genou (de la couleur de la peau)
    const delt = new THREE.SphereGeometry(1, 14, 10);
    delt.scale(0.086, 0.082, 0.084);
    this.delts = two(delt, mat(0.62));
    const elbow = new THREE.SphereGeometry(1, 10, 8);
    elbow.scale(0.05, 0.05, 0.05);
    this.elbowBalls = two(elbow, mat(0.56), false);
    const knee = new THREE.SphereGeometry(1, 12, 8);
    knee.scale(0.064, 0.064, 0.068);
    this.kneeBalls = two(knee, mat(0.56), false);

    // La chaussure : un dessus de couleur vive et une semelle claire
    const upper = new THREE.CapsuleGeometry(0.066, 0.17, 4, 12);
    upper.rotateX(Math.PI / 2);
    upper.scale(0.96, 0.82, 1);
    upper.translate(0, -0.05, 0.07);
    const ankle = new THREE.CylinderGeometry(0.056, 0.066, 0.1, 10);
    ankle.translate(0, -0.02, -0.02);
    this.boots = two(joinedPlain([upper, ankle]), mat(0.34));
    const sole = new THREE.CapsuleGeometry(0.068, 0.18, 2, 12);
    sole.rotateX(Math.PI / 2);
    sole.scale(1.02, 0.24, 1.02);
    sole.translate(0, -0.1, 0.07);
    this.soles = two(sole, new THREE.MeshStandardMaterial({ color: "#f2efe6", roughness: 0.7 }), false);

    for (let style = 0; style < HAIR_STYLES; style++) {
      if (style === BALD || hairUsed[style] === 0) {
        this.hair.push(null);
        continue;
      }
      const m = add(
        hairGeometry(style),
        hairUsed[style]!,
        dressed(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5, vertexColors: true }), undefined, 0.26),
      );
      this.hair.push(m);
    }

    if (!castShadows) {
      // Sans vraies ombres : une tache sombre au sol
      const blobCanvas = document.createElement("canvas");
      blobCanvas.width = blobCanvas.height = 64;
      const g = blobCanvas.getContext("2d")!;
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, "rgba(0,0,0,0.5)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.blob = new THREE.CanvasTexture(blobCanvas);
      const geo = new THREE.PlaneGeometry(1.6, 1.6);
      geo.rotateX(-Math.PI / 2);
      this.shadows = add(geo, count, new THREE.MeshBasicMaterial({ map: this.blob, transparent: true, depthWrite: false }), false);
      this.shadows.renderOrder = 1;
    }
    scene.add(this.group);
    this.paintKits();
  }

  /** Où se trouve une partie du corps d'un joueur, dans le repère des joueurs, après `update` (l'atelier des cartes y pose le ballon) */
  partAt(i: number, part: "head" | "handL" | "handR" | "footL" | "footR", out = new THREE.Vector3()): THREE.Vector3 {
    const m = new THREE.Matrix4();
    if (part === "head") this.head.getMatrixAt(i, m);
    else (part.startsWith("hand") ? this.hands : this.boots).getMatrixAt(i * 2 + (part.endsWith("L") ? 0 : 1), m);
    return out.setFromMatrixPosition(m);
  }

  private setFace(i: number, mood: number) {
    const n = i * 2 + mood;
    this.faceTiles.setXY(i, (n % FACE_COLS) / FACE_COLS, 1 - (Math.floor(n / FACE_COLS) + 1) / FACE_ROWS);
    this.faceTiles.needsUpdate = true;
  }

  private paintKits() {
    const c = new THREE.Color();
    const kitOf = (i: number, team: Team) => (this.keeperFlags[i] ? this.gkKits[team] : this.kits[team]);
    for (let i = 0; i < this.count; i++) {
      const s = this.states[i]!;
      const team: Team = i < this.count / 2 ? 0 : 1;
      const kit = kitOf(i, team);
      this.neck.setColorAt(i, s.skin);
      this.collar.setColorAt(i, c.set(kit.sleeves === kit.shirt ? (isLight(kit.shirt) ? "#1a2230" : "#f4f2ea") : kit.sleeves));
      this.shorts.setColorAt(i, c.set(kit.shorts));
      for (let k = 0; k < 2; k++) {
        const n = i * 2 + k;
        this.ears.setColorAt(n, s.skin);
        this.shortLegs.setColorAt(n, c.set(kit.shorts));
        this.upperArms.setColorAt(n, c.set(kit.sleeves));
        this.foreArms.setColorAt(n, this.keeperFlags[i] ? c.set(kit.sleeves) : s.skin);
        this.hands.setColorAt(n, this.keeperFlags[i] ? c.set("#f7f7ee") : s.skin);
        this.thighs.setColorAt(n, s.skin);
        this.shins.setColorAt(n, c.set(kit.socks));
        this.cuffs.setColorAt(n, c.set(kit.socks === kit.shorts ? "#f4f2ea" : kit.shorts));
        this.delts.setColorAt(n, c.set(kit.sleeves));
        this.elbowBalls.setColorAt(n, this.keeperFlags[i] ? c.set(kit.sleeves) : s.skin);
        this.kneeBalls.setColorAt(n, s.skin);
        this.boots.setColorAt(n, c.set(team === 0 ? "#f6c93a" : "#2fd4e6"));
      }
      this.hair[s.hairStyle]?.setColorAt(s.hairSlot, s.hair);
    }
    for (const m of this.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  private setBone(mesh: THREE.InstancedMesh, n: number, root: THREE.Matrix4, from: THREE.Vector3, to: THREE.Vector3, keepSize = false) {
    tmpV.copy(to).sub(from);
    const len = tmpV.length();
    tmpQ.setFromUnitVectors(DOWN, tmpV.divideScalar(len || 1));
    tmpS.set(1, keepSize ? 1 : len, 1);
    tmpM.compose(from, tmpQ, tmpS);
    tmpM2.multiplyMatrices(root, tmpM);
    mesh.setMatrixAt(n, tmpM2);
  }

  private setPart(mesh: THREE.InstancedMesh, n: number, root: THREE.Matrix4, pos: THREE.Vector3, q: THREE.Quaternion) {
    tmpM.compose(pos, q, ONE);
    tmpM2.multiplyMatrices(root, tmpM);
    mesh.setMatrixAt(n, tmpM2);
  }

  update(dt: number, t: number, views: FootballerView[]) {
    const blend = 1 - Math.exp(-dt * 20);
    const pelvis = new THREE.Vector3();
    const chest = new THREE.Vector3();
    const two3 = () => [new THREE.Vector3(), new THREE.Vector3()];
    const legTop = two3();
    const knees = two3();
    const ankles = two3();
    const shoulders = two3();
    const elbows = two3();
    const wrists = two3();
    const shinAngle = [0, 0];
    const root = new THREE.Matrix4();
    const rootQ = new THREE.Quaternion();
    const upperQ = new THREE.Quaternion();
    const headQ = new THREE.Quaternion();
    const rootPos = new THREE.Vector3();
    const headAt = new THREE.Vector3();
    const scale = new THREE.Vector3(SCALE, SCALE, SCALE);
    const hidden = new THREE.Vector3(0, -50, 0);
    const none = new THREE.Quaternion();
    const hideAll = (i: number, s: State) => {
      tmpM.compose(hidden, none, ONE);
      for (const m of this.single) m.setMatrixAt(i, tmpM);
      this.shadows?.setMatrixAt(i, tmpM);
      for (const m of this.double) {
        m.setMatrixAt(i * 2, tmpM);
        m.setMatrixAt(i * 2 + 1, tmpM);
      }
      this.hair[s.hairStyle]?.setMatrixAt(s.hairSlot, tmpM);
    };

    for (let i = 0; i < this.count; i++) {
      const f = views[i]!;
      const s = this.states[i]!;
      if (f.off) {
        hideAll(i, s);
        continue;
      }
      if (f.kickT !== undefined) {
        // C'est l'affichage qui mène la frappe, calée sur le départ du ballon à l'écran
        if (s.lastAct !== "kick") s.actAge = 0;
        s.lastAct = "kick";
        s.kickT = f.kickT;
      } else {
        if (f.act !== s.lastAct) {
          if (f.act === "kick") s.kickT = 0;
          s.lastAct = f.act;
          s.actAge = 0;
        } else s.actAge += dt;
        s.kickT += dt;
      }
      // Le geste continue après le départ du ballon : c'est l'accompagnement du pied
      const act = f.kickT !== undefined ? "kick" : f.act === "none" && s.kickT < KICK_HOLD ? "kick" : f.act;
      // La cadence suit la vitesse : le pied posé recule exactement aussi vite que le corps avance, il ne patine pas
      // À reculons, les jambes tournent dans l'autre sens : il fait des pas en arrière au lieu de courir sur place
      const stride = f.cheer || f.sad ? 1 : strideOf(f);
      s.phase += ((f.gait ?? 1) < -0.3 ? -1 : 1) * (f.v / ((THIGH + SHIN) * SCALE * strideAmp(Math.min(1.2, f.v / 10)) * stride)) * dt;
      const turn = wrapAngle(f.h - s.lastH) / Math.max(dt, 0.001);
      s.lastH = f.h;
      s.bank += (clamp(turn * f.v * 0.011, -0.3, 0.3) - s.bank) * Math.min(1, dt * 10);
      const mood = f.cheer ? 1 : 0;
      if (mood !== s.mood) {
        s.mood = mood;
        this.setFace(i, mood);
      }
      poseFor(s, f, act, this.targetPose, t);
      const fast = act === "kick" || act === "dive" ? 2.6 : 1;
      for (const k of POSE_KEYS) s.pose[k] += (this.targetPose[k] - s.pose[k]) * Math.min(1, blend * fast);
      const p = s.pose;

      // Le corps tourne vers sa course, penche (roulis positif : la tête part du côté gauche du joueur, vers le centre
      // du virage ou vers le plongeon), et bascule en avant ou en arrière
      const yaw = Math.PI / 2 - f.h;
      rootQ.setFromAxisAngle(Y_AXIS, yaw);
      tmpQ2.setFromAxisAngle(Z_AXIS, p.roll);
      rootQ.multiply(tmpQ2);
      tmpQ2.setFromAxisAngle(X_AXIS, p.pitch);
      rootQ.multiply(tmpQ2);

      // Toutes les articulations d'abord, dans le repère du joueur : on pourra poser le corps sur la pelouse
      pelvis.set(0, HIP_Y - p.drop, 0);
      upperQ.setFromAxisAngle(X_AXIS, p.lean);
      tmpQ2.setFromAxisAngle(Y_AXIS, p.twist);
      upperQ.multiply(tmpQ2);
      chest
        .set(0, SHOULDER_Y * 0.62, 0)
        .applyQuaternion(upperQ)
        .add(pelvis);
      // La tête regarde devant elle, et ne suit pas toute l'inclinaison du buste
      headQ.copy(upperQ);
      tmpQ2.setFromAxisAngle(X_AXIS, p.nod);
      headQ.multiply(tmpQ2);
      headAt.set(0, HEAD_Y, 0.03).applyQuaternion(upperQ).add(pelvis);
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        const a = k === 0 ? p.legLa : p.legRa;
        const b = k === 0 ? p.legLb : p.legRb;
        const top = legTop[k]!;
        top.set(side * HIP_X, HIP_Y - p.drop - 0.09, 0);
        knees[k]!.set(top.x, top.y - Math.cos(a) * THIGH, top.z + Math.sin(a) * THIGH);
        const c = a - b;
        shinAngle[k] = c;
        ankles[k]!.set(top.x, knees[k]!.y - Math.cos(c) * SHIN, knees[k]!.z + Math.sin(c) * SHIN);
        const ga = k === 0 ? p.armLa : p.armRa;
        const gb = k === 0 ? p.armLb : p.armRb;
        const gs = k === 0 ? p.armLs : p.armRs;
        const sh = shoulders[k]!.set(side * SHOULDER_X, SHOULDER_Y, 0)
          .applyQuaternion(upperQ)
          .add(pelvis);
        const el = elbows[k]!.set(
          sh.x + side * Math.sin(gs) * UPPER,
          sh.y - Math.cos(ga) * Math.cos(gs) * UPPER,
          sh.z + Math.sin(ga) * Math.cos(gs) * UPPER,
        );
        const fc = ga + gb;
        // L'avant-bras se replie aussi vers le milieu du corps : les mains sur les hanches, sur la tête
        const gi = k === 0 ? p.armLi : p.armRi;
        const ci = Math.cos(gi);
        wrists[k]!.set(el.x - side * Math.sin(gi) * FORE, el.y - Math.cos(fc) * ci * FORE, el.z + Math.sin(fc) * ci * FORE);
      }
      // Le point le plus bas du corps, une fois tourné
      let low = Infinity;
      const lowest = (v: THREE.Vector3, r: number) => {
        tmpV.copy(v).applyQuaternion(rootQ);
        if (tmpV.y - r < low) low = tmpV.y - r;
      };
      for (let k = 0; k < 2; k++) {
        lowest(ankles[k]!, SOLE_DEPTH);
        lowest(knees[k]!, 0.075);
        lowest(elbows[k]!, 0.06);
        lowest(wrists[k]!, 0.06);
      }
      lowest(pelvis, 0.17);
      lowest(chest, 0.16);
      lowest(headAt, 0.15);
      // Au sol, il touche la pelouse sans s'y enfoncer ni flotter (une glissade, une chute, un tacle, la foulée) ;
      // en l'air (un saut, une tête, un plongeon), on l'empêche seulement de passer dessous
      const lift = Math.max(0, p.lift);
      const air = clamp(lift / 0.1, 0, 1);
      const settle = -low * (1 - air) + Math.max(0, -low) * air;
      s.ground += (settle - s.ground) * Math.min(1, dt * 30);
      rootPos.set(f.x, (lift + s.ground) * SCALE, f.z);
      root.compose(rootPos, rootQ, scale);

      this.setPart(this.torso, i, root, pelvis, upperQ);
      this.setPart(this.shorts, i, root, pelvis, none);
      tmpV2.set(0, NECK_Y, 0).applyQuaternion(upperQ).add(pelvis);
      this.setPart(this.neck, i, root, tmpV2, upperQ);
      tmpV2.set(0, NECK_Y, 0.008).applyQuaternion(upperQ).add(pelvis);
      this.setPart(this.collar, i, root, tmpV2, upperQ);
      this.setPart(this.head, i, root, headAt, headQ);
      this.hair[s.hairStyle] && this.setPart(this.hair[s.hairStyle]!, s.hairSlot, root, headAt, headQ);

      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        const n = i * 2 + k;
        tmpV2
          .set(side * (HEAD_W * 0.96), -0.015, -0.015)
          .applyQuaternion(headQ)
          .add(headAt);
        this.setPart(this.ears, n, root, tmpV2, headQ);

        // La jambe
        const top = legTop[k]!;
        const kn = knees[k]!;
        const an = ankles[k]!;
        this.setBone(this.thighs, n, root, top, kn);
        tmpV2.lerpVectors(top, kn, 0.56);
        this.setBone(this.shortLegs, n, root, top, tmpV2);
        this.setBone(this.shins, n, root, kn, an);
        this.setPart(this.kneeBalls, n, root, kn, none);
        tmpV2.lerpVectors(kn, an, 0.1);
        this.setBone(this.cuffs, n, root, tmpV2, kn, true);
        tmpQ.setFromAxisAngle(X_AXIS, shinAngle[k]! * 0.55);
        this.setPart(this.boots, n, root, an, tmpQ);
        this.setPart(this.soles, n, root, an, tmpQ);

        // Le bras
        const sh = shoulders[k]!;
        const el = elbows[k]!;
        const wr = wrists[k]!;
        this.setBone(this.upperArms, n, root, sh, el);
        this.setBone(this.foreArms, n, root, el, wr);
        this.setPart(this.delts, n, root, sh, upperQ);
        this.setPart(this.elbowBalls, n, root, el, none);
        // La main prolonge l'avant-bras : on la reconstruit dans son axe
        tmpV2.copy(wr).sub(el).normalize().multiplyScalar(0.1).add(wr);
        this.setBone(this.hands, n, root, wr, tmpV2, true);
      }
      if (this.shadows) {
        const flat = p.pitch !== 0 || p.roll !== 0 ? 1.3 : 1;
        tmpS.set(flat, 1, flat);
        tmpV2.set(f.x, 0.03, f.z);
        tmpM.compose(tmpV2, none, tmpS);
        this.shadows.setMatrixAt(i, tmpM);
      }
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    this.atlas.dispose();
    this.faces.dispose();
    this.blob?.dispose();
    this.group.removeFromParent();
  }
}

/** Fusionne des volumes simples d'une même matière */
function joinedPlain(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    g.deleteAttribute("uv");
    return g;
  });
  const merged = mergeGeometries(flat)!;
  for (const p of parts) p.dispose();
  return merged;
}
