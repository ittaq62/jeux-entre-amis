// La foule des candidats : un acteur par candidat, qui va là où l'épreuve le place (en douceur), regarde où il faut,
// et joue ce qu'il fait (marcher, courir, se figer, tomber, s'asseoir, tirer la corde, sauter, fêter…). Les postures
// sont des petites fonctions du temps, chacune avec un rien de variation propre à chaque candidat, pour qu'une foule ne
// bouge jamais comme un seul homme. Les ombres sont des taches douces (une seule forme pour toute la foule), les noms
// des vrais joueurs flottent au-dessus de leur tête.

import * as THREE from "three";
import type { Candidate } from "../../../shared/games/cour/net.ts";
import { CandidateModel, pose, STAND, blendPose, type Pose } from "./candidate.ts";

export type Act =
  | "idle"
  | "walk"
  | "run"
  | "freeze"
  | "fallBack"
  | "lie"
  | "sit"
  | "pull"
  | "celebrate"
  | "hop"
  | "crouch"
  | "flick"
  | "swim"
  | "cheer"
  | "sad"
  | "carve"
  | "wobble"
  | "pilHigh"
  | "pilLow"
  | "pilGuardH"
  | "pilGuardL"
  | "pilHit"
  | "stun"
  | "flail"
  | "dash"
  | "wave"
  | "think"
  | "plunge"
  | "hawk";

const TAU = Math.PI * 2;
const ease = (k: number) => {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
};

/** Une petite empreinte propre à chacun (pour varier les gestes) */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** La posture d'un acte à cet instant : `t` le temps depuis le début de l'acte, `cycle` l'avancée de la foulée, `s` sa graine */
export function actPose(act: Act, t: number, cycle: number, s: number, speed = 1): Pose {
  const sw = Math.sin(cycle * TAU);
  const sw2 = Math.sin(cycle * TAU * 2);
  switch (act) {
    case "idle": {
      const b = Math.sin(t * 1.6 + s * 9) * 0.02;
      const look = Math.sin(t * 0.37 + s * 20) * 0.5;
      return pose({
        lift: b * 0.3,
        bend: b,
        look,
        nod: Math.sin(t * 0.5 + s * 7) * 0.08,
        roll: Math.sin(t * 0.8 + s * 3) * 0.03,
        armL: [0.05 + b, 0.14, 0.2],
        armR: [0.05 - b, 0.14, 0.2],
        legL: [0, 0.04, 0.05],
        legR: [0, 0.04, 0.05],
      });
    }
    case "walk": {
      const a = 0.45 * Math.min(1.2, speed);
      return pose({
        lift: Math.abs(sw2) * 0.03,
        lean: 0.06,
        twist: sw * 0.08,
        armL: [-sw * a * 0.9, 0.1, 0.35],
        armR: [sw * a * 0.9, 0.1, 0.35],
        legL: [sw * a, 0.02, Math.max(0, -Math.cos(cycle * TAU)) * 0.7 + 0.08],
        legR: [-sw * a, 0.02, Math.max(0, Math.cos(cycle * TAU)) * 0.7 + 0.08],
        nod: 0.04,
      });
    }
    case "run":
    case "dash": {
      const a = act === "dash" ? 1 : 0.85;
      return pose({
        lift: Math.abs(sw2) * 0.07 - 0.03,
        lean: act === "dash" ? 0.42 : 0.28,
        twist: sw * 0.14,
        bend: 0.08,
        armL: [-sw * a * 1.1, 0.12, 1.3],
        armR: [sw * a * 1.1, 0.12, 1.3],
        legL: [sw * a * 0.95 + 0.15, 0.02, Math.max(0, -Math.cos(cycle * TAU)) * 1.5 + 0.2],
        legR: [-sw * a * 0.95 + 0.15, 0.02, Math.max(0, Math.cos(cycle * TAU)) * 1.5 + 0.2],
        nod: -0.1,
      });
    }
    case "freeze": {
      // Figé en pleine course : chacun dans une posture de statue qui vacille
      const w = Math.sin(t * 7 + s * 30) * 0.025 * Math.max(0, 1 - t * 0.4);
      const k = Math.floor(s * 4);
      const arms: [number, number, number][][] = [
        [
          [0.9, 0.2, 1.2],
          [-0.5, 0.1, 0.6],
        ],
        [
          [-0.4, 0.5, 0.4],
          [1.2, 0.3, 0.2],
        ],
        [
          [0.3, 1.2, 0.2],
          [0.3, 1.2, 0.2],
        ],
        [
          [1.6, 0.1, 0.5],
          [0.2, 0.3, 1.4],
        ],
      ];
      const legs: [number, number, number][][] = [
        [
          [0.6, 0.02, 0.6],
          [-0.4, 0.02, 0.5],
        ],
        [
          [1.1, 0.05, 1.3],
          [-0.1, 0.02, 0.1],
        ],
        [
          [0.2, 0.1, 0.2],
          [-0.2, 0.1, 0.2],
        ],
        [
          [-0.5, 0.02, 0.9],
          [0.5, 0.02, 0.3],
        ],
      ];
      return pose({
        lean: 0.18 + w,
        roll: w * 1.5,
        armL: arms[k]![0]!,
        armR: arms[k]![1]!,
        legL: legs[k]![0]!,
        legR: legs[k]![1]!,
        lift: k === 1 ? 0.04 : -0.02,
        nod: -0.05,
        tilt: w * 2,
      });
    }
    case "fallBack": {
      // Il tombe en arrière, les bras en moulinet, puis reste étalé
      const k = ease(t / 0.7);
      const flap = Math.sin(t * 18) * (1 - k) * 0.6;
      return pose({
        down: k,
        lean: -0.3 * (1 - k),
        armL: [1.2 + flap, 1.0 * k + 0.3, 0.4],
        armR: [1.2 - flap, 1.0 * k + 0.3, 0.4],
        legL: [0.6 * k + 0.2, 0.25 * k, 0.4 * k],
        legR: [0.3 * k, 0.3 * k, 0.2],
        nod: -0.4 * k,
      });
    }
    case "lie":
      return pose({
        down: 1,
        armL: [1.4, 1.2, 0.3],
        armR: [1.2, 1.3, 0.5],
        legL: [0.5, 0.25, 0.4],
        legR: [0.2, 0.3, 0.2],
        nod: -0.35 + Math.sin(t * 0.9 + s * 9) * 0.1,
      });
    case "sit": {
      const b = Math.sin(t * 1.4 + s * 8) * 0.03;
      return pose({
        lift: -0.18,
        fwd: -0.08,
        lean: -0.08,
        bend: 0.1 + b,
        armL: [0.55, 0.18, 0.9],
        armR: [0.55, 0.18, 0.9],
        legL: [1.5, 0.08, 1.5],
        legR: [1.5, 0.08, 1.5],
        look: Math.sin(t * 0.4 + s * 6) * 0.35,
      });
    }
    case "carve": {
      // Penché sur son biscuit, la main qui gratte doucement
      const g = Math.sin(t * 5 + s * 4) * 0.06;
      return pose({
        lift: -0.18,
        fwd: -0.08,
        bend: 0.42,
        nod: 0.45,
        armL: [0.9, 0.08, 1.4],
        armR: [1.0 + g, 0.05, 1.2 - g],
        legL: [1.5, 0.08, 1.5],
        legR: [1.5, 0.08, 1.5],
      });
    }
    case "pull": {
      // Tirer la corde : penché en arrière, les bras devant, et le coup de rein à chaque « hisse »
      const heave = Math.max(0, Math.sin(cycle * TAU)) * 0.25;
      return pose({
        lift: -0.12 - heave * 0.1,
        lean: -0.45 - heave,
        bend: 0.15,
        armL: [1.35 - heave, 0.05, 0.25],
        armR: [1.25 - heave, 0.05, 0.35],
        legL: [0.7, 0.08, 0.7 + heave],
        legR: [0.1, 0.12, 0.25],
        nod: 0.3,
      });
    }
    case "celebrate": {
      const j = Math.abs(Math.sin(t * 5.5 + s * 3));
      return pose({
        lift: j * 0.22,
        armL: [0.4, 2.6 + Math.sin(t * 11) * 0.2, 0.25],
        armR: [0.4, 2.6 + Math.cos(t * 11) * 0.2, 0.25],
        legL: [0.2 * j, 0.05, 0.6 * j],
        legR: [0.2 * j, 0.05, 0.6 * j],
        nod: -0.25,
        look: Math.sin(t * 3) * 0.3,
      });
    }
    case "cheer": {
      const j = Math.max(0, Math.sin(t * 6 + s * 12));
      return pose({
        lift: j * 0.06,
        armL: [0.6, 1.8 + j * 0.6, 0.6],
        armR: [0.4 + j, 0.5, 1.6],
        nod: -0.15,
        look: Math.sin(t * 0.8 + s * 5) * 0.6,
      });
    }
    case "wave":
      return pose({ armR: [0.3, 2.3, 0.7 + Math.sin(t * 9) * 0.5], armL: [0.05, 0.14, 0.2], nod: -0.1 });
    case "sad":
      return pose({ lean: 0.15, bend: 0.25, nod: 0.6, armL: [0.1, 0.06, 0.1], armR: [0.1, 0.06, 0.1], look: Math.sin(t * 0.6) * 0.15 });
    case "think":
      return pose({ armR: [1.0, 0.4, 2.2], armL: [0.6, 0.3, 1.6], nod: 0.15, tilt: 0.25, look: Math.sin(t * 0.9 + s * 4) * 0.5 });
    case "hop": {
      // Un saut de marelle : accroupi, détente, en l'air sur un pied, réception
      const k = (t % 0.55) / 0.55;
      const air = Math.sin(Math.min(1, k * 1.25) * Math.PI);
      return pose({
        lift: air * 0.28 - (1 - air) * 0.08,
        lean: 0.12,
        armL: [0.6, 0.7 + air * 0.6, 0.6],
        armR: [0.6, 0.7 + air * 0.6, 0.6],
        legL: [0.3 + air * 0.4, 0.04, 0.4 + air * 0.8],
        legR: [0.2, 0.04, 0.3 + air * 0.2],
      });
    }
    case "crouch":
      return pose({
        lift: -0.3,
        lean: 0.35,
        bend: 0.3,
        nod: 0.2,
        armL: [0.8, 0.3, 0.8],
        armR: [1.1, 0.1, 0.4],
        legL: [1.9, 0.15, 2.2],
        legR: [0.8, 0.15, 2.1],
      });
    case "flick": {
      const k = ease(t / 0.25);
      return pose({
        lift: -0.3,
        lean: 0.4,
        bend: 0.35,
        nod: 0.1,
        armL: [0.8, 0.3, 0.8],
        armR: [0.6 + k * 0.9, 0.1, 0.6 - k * 0.5],
        legL: [1.9, 0.15, 2.2],
        legR: [0.8, 0.15, 2.1],
      });
    }
    case "swim":
    case "flail": {
      // Dans l'eau ou dans la mousse : les bras qui battent
      const f = t * (act === "swim" ? 5 : 9);
      return pose({
        lift: act === "swim" ? -0.7 : -0.2,
        lean: 0.2,
        armL: [1.5 + Math.sin(f) * 0.8, 1.2 + Math.cos(f) * 0.5, 0.6],
        armR: [1.5 - Math.sin(f) * 0.8, 1.2 - Math.cos(f) * 0.5, 0.6],
        legL: [0.5 + Math.sin(f) * 0.4, 0.2, 0.6],
        legR: [0.5 - Math.sin(f) * 0.4, 0.2, 0.6],
        nod: -0.2,
      });
    }
    case "plunge": {
      // Il bascule et tombe (dans la mousse, l'eau, la trappe)
      const k = ease(t / 0.5);
      return pose({
        lift: -k * 0.2,
        lean: -0.4 * k,
        armL: [2.2 * k, 1.6 * k, 0.3],
        armR: [2.2 * k, 1.6 * k, 0.3],
        legL: [1.0 * k, 0.4 * k, 0.6],
        legR: [0.4 * k, 0.4 * k, 0.2],
        nod: -0.6 * k,
      });
    }
    case "wobble": {
      const w = Math.sin(t * 9 + s * 8);
      return pose({ roll: w * 0.18, lean: 0.1, armL: [0.4, 1.4 + w * 0.4, 0.2], armR: [0.4, 1.4 - w * 0.4, 0.2], tilt: -w * 0.2 });
    }
    case "pilHigh": {
      const k = ease(t / 0.45);
      return pose({
        lean: -0.18 * k,
        twist: -0.3 * k,
        armL: [2.6 * k + 0.4, 0.3, 0.6],
        armR: [2.8 * k + 0.3, 0.3, 0.6],
        nod: -0.15 * k,
        legL: [0.25, 0.1, 0.3],
        legR: [-0.15, 0.1, 0.2],
      });
    }
    case "pilLow": {
      const k = ease(t / 0.45);
      return pose({
        lift: -0.1 * k,
        twist: 0.45 * k,
        armL: [0.2, 0.2, 0.4],
        armR: [-0.6 * k, 0.5, 0.3],
        legL: [0.4, 0.1, 0.5],
        legR: [-0.1, 0.1, 0.3],
      });
    }
    case "pilHit": {
      const k = ease(t / 0.18);
      return pose({
        lean: 0.3 * k,
        twist: 0.4 * k,
        armL: [1.4 + k * 0.4, 0.2, 0.3],
        armR: [1.6 + k * 0.4, 0.2, 0.3],
        legL: [0.45, 0.1, 0.4],
        legR: [-0.2, 0.1, 0.2],
      });
    }
    case "pilGuardH":
      return pose({
        lean: -0.05,
        armL: [2.2, 0.6, 1.3],
        armR: [2.2, 0.6, 1.3],
        nod: 0.1,
        legL: [0.3, 0.12, 0.35],
        legR: [-0.15, 0.12, 0.25],
      });
    case "pilGuardL":
      return pose({
        lift: -0.12,
        lean: 0.25,
        armL: [0.9, 0.4, 0.5],
        armR: [0.9, 0.4, 0.5],
        legL: [0.55, 0.15, 0.7],
        legR: [0.1, 0.15, 0.6],
      });
    case "stun": {
      const w = Math.sin(t * 12);
      return pose({
        roll: w * 0.25,
        lean: -0.15,
        armL: [0.3, 1.2 + w * 0.5, 0.3],
        armR: [0.3, 1.2 - w * 0.5, 0.3],
        tilt: w * 0.3,
        nod: -0.2,
      });
    }
    case "hawk": {
      // L'épervier : penché, les bras écartés comme des ailes qui battent
      const f = Math.sin(t * 6 + s * 9);
      return pose({
        lean: 0.35,
        armL: [0.3, 1.5 + f * 0.25, 0.3],
        armR: [0.3, 1.5 - f * 0.25, 0.3],
        lift: -0.06,
        legL: [sw * 0.5, 0.05, 0.4],
        legR: [-sw * 0.5, 0.05, 0.4],
      });
    }
  }
  return STAND;
}

export interface ActorTarget {
  x: number;
  y?: number;
  z: number;
  /** La direction où il regarde (radians, 0 : vers +z) ; undefined : là où il va */
  face?: number;
  act: Act;
  /** Pour les actes cycliques : la vitesse au sol (m/s), qui règle la foulée */
  speed?: number;
  /** Aller à sa place sans glisser (téléporté) */
  snap?: boolean;
  /** Le suivre vite (une course, une chute) ou doucement */
  stiff?: number;
}

const STAIN_COLORS: Record<string, string> = {
  peinture: "#ff4f8b",
  tarte: "#fff4e0",
  mousse: "#f5fbff",
  plouf: "#9bd4e8",
  trappe: "#ffffff",
  gelee: "#7ddf64",
  canon: "#e9f6ff",
  plumes: "#f4e7d0",
  chute: "#ffffff",
  temps: "#c46bff",
  jury: "#ffffff",
};
export const stainColorOf = (how: string) => STAIN_COLORS[how] ?? "#ffffff";

/** Un candidat sur scène */
export class Actor {
  readonly group = new THREE.Group();
  readonly model: CandidateModel;
  readonly seed: number;
  x = 0;
  y = 0;
  z = 0;
  heading = 0;
  private act: Act = "idle";
  private actAt = 0;
  private cycle = 0;
  private prevPose: Pose = STAND;
  private blendFrom: Pose | null = null;
  private blendAt = 0;
  private stain = 0;
  private stainTarget = 0;
  speed = 0;
  visible = true;

  constructor(
    readonly info: Candidate,
    head: HTMLCanvasElement | null,
    lite: boolean,
  ) {
    this.model = new CandidateModel({ avatar: info.avatar, look: info.look, head, lite });
    this.group.add(this.model.mesh);
    this.seed = seedOf(info.id);
  }

  get currentAct() {
    return this.act;
  }

  /** Il fait autre chose : la posture passe en douceur de l'une à l'autre */
  setAct(act: Act, now: number) {
    if (act === this.act) return;
    this.blendFrom = this.prevPose;
    this.blendAt = now;
    this.act = act;
    this.actAt = now;
  }

  /** Taché par son élimination (peinture, gelée…) ; 0 : propre */
  stainWith(how: string | null, k: number) {
    if (how) this.model.setStain(stainColorOf(how), this.stain);
    this.stainTarget = k;
  }

  update(target: ActorTarget | null, now: number, dt: number) {
    if (!target) {
      this.group.visible = false;
      this.visible = false;
      return;
    }
    this.group.visible = true;
    this.visible = true;
    const ty = target.y ?? 0;
    if (target.snap) {
      this.x = target.x;
      this.y = ty;
      this.z = target.z;
    } else {
      const k = Math.min(1, dt * (target.stiff ?? 10));
      const dx = target.x - this.x;
      const dz = target.z - this.z;
      this.x += dx * k;
      this.z += dz * k;
      this.y += (ty - this.y) * Math.min(1, dt * 12);
    }
    const moveSpeed = target.speed ?? 0;
    this.speed = moveSpeed;
    // Vers où il regarde : là où on le lui dit, sinon dans le sens de sa marche
    let face = target.face;
    if (face === undefined) face = this.heading;
    let d = face - this.heading;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    this.heading += d * Math.min(1, dt * 9);
    this.setAct(target.act, now);
    const t = (now - this.actAt) / 1000;
    const stride = target.act === "run" || target.act === "dash" ? 2.4 : target.act === "hawk" ? 1.8 : 1.25;
    this.cycle += (dt * Math.max(0.6, moveSpeed)) / stride;
    let p = actPose(this.act, t, this.cycle + this.seed, this.seed, moveSpeed);
    if (this.blendFrom) {
      const k = (now - this.blendAt) / 220;
      if (k >= 1) this.blendFrom = null;
      else p = blendPose(this.blendFrom, p, ease(k));
    }
    this.prevPose = p;
    this.model.setPose(p);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    if (Math.abs(this.stain - this.stainTarget) > 0.002) {
      this.stain += (this.stainTarget - this.stain) * Math.min(1, dt * 4);
      this.model.setStain(null, this.stain);
    }
  }

  dispose() {
    this.model.dispose();
  }
}

/** Les ombres douces de toute la foule : une tache par acteur, en une seule forme */
export class BlobShadows {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  constructor(max: number) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(0.55, "rgba(0,0,0,0.3)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.q.identity();
  }

  update(actors: Actor[], ground: (x: number, z: number) => number) {
    let n = 0;
    for (const a of actors) {
      if (!a.visible || n >= this.mesh.count) continue;
      const gy = ground(a.x, a.z);
      const h = Math.max(0, a.y - gy);
      const size = Math.max(0.3, 0.9 - h * 0.5);
      this.p.set(a.x, gy + 0.02, a.z);
      this.s.set(size, 1, size * 0.85);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m);
    }
    for (let k = n; k < this.mesh.count; k++) {
      this.s.set(0, 0, 0);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(k, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}

/** Le nom d'un vrai joueur, au-dessus de sa tête */
export function nameTag(name: string, color: string, me: boolean): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "700 30px 'Libre Franklin Variable', 'Libre Franklin', system-ui, sans-serif";
  const w = Math.min(244, g.measureText(name).width + 36);
  g.fillStyle = me ? "#ffd84a" : "rgba(20, 24, 40, 0.78)";
  const x = (256 - w) / 2;
  g.beginPath();
  g.roundRect(x, 10, w, 44, 22);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(x + 20, 32, 7, 0, TAU);
  g.fill();
  g.fillStyle = me ? "#2a1d00" : "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(name, 128 + 8, 33, w - 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}

export const isHumanTag = (c: Candidate) => c.userId !== null;
export { pose };
