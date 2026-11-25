// Les joueurs autour de la table. Celui qui joue se penche sur sa queue : la main du pont sur le tapis derrière la
// blanche (sur la bande quand elle est trop loin), l'autre au talon, qui recule et frappe avec la queue ; puis il se
// relève, sa queue à la main, regarde rouler ses billes et réagit. Les autres attendent à leur place dans la salle,
// debout leur queue à la main (qu'ils frottent de craie de temps en temps) ou assis, suivent la blanche des yeux et
// applaudissent les beaux coups. Chacun rejoint la table ou sa place en la contournant.

import * as THREE from "three";
import type { AvatarConfig } from "../../../shared/avatar.ts";
import type { Table } from "../../../shared/games/billard/table.ts";
import { headCanvas } from "../../bolides/scene/faces.ts";
import { blend, ease, reactPose, STAND, walkPose, type Pose } from "../../bowling/scene/bowler.ts";
import { CUE_LENGTH, CueStick } from "./cue.ts";
import { HIPS_Y, PLAYER_SCALE, PlayerModel, REACH, shoulderOf, type Elbows, type V3 } from "./player.ts";
import type { Spot } from "./salles/common.ts";
import { TOUCH } from "./TableScene.ts";
import { FLOOR } from "./salles/decor.ts";

const S = PLAYER_SCALE;
/** La vitesse de marche (m/s) */
const WALK = 1.7;
/** Plus près que ça de la caméra, on ne montre pas le personnage (la vue de la queue est la sienne) */
const HIDE_NEAR = 0.9;

export interface PersonInfo {
  id: string;
  avatar: AvatarConfig;
  /** Sa queue (le style de la boutique) */
  cue: string;
  /** La couleur de son nœud papillon */
  accent: string;
}

/** La queue de celui qui joue, à la table */
export interface CueAt {
  tip: THREE.Vector3;
  /** De la pointe vers le talon (unitaire) */
  back: THREE.Vector3;
  /** De combien elle est reculée au-delà du repos (le dosage, l'élan ; négatif quand elle accompagne le coup) */
  drawn: number;
}

export interface PeopleFrame {
  t: number;
  dt: number;
  /** Celui dont c'est le tour (ou qui joue le coup qui roule) */
  shooter: string | null;
  /** La queue à la table (visée, élan, frappe) ; null quand elle n'y est plus */
  cue: CueAt | null;
  /** Où la queue sera dès qu'il sera à la table (pour qu'il y aille) */
  aim: CueAt | null;
  /** Depuis quand le coup est parti (s), tant qu'on le montre */
  sinceStrike: number | null;
  /** Ce que tout le monde regarde */
  look: THREE.Vector3;
  camera: THREE.Vector3;
  /** Celui qui joue, c'est moi : je vise de ses yeux, il est déjà en place */
  mine: boolean;
}

interface Person {
  info: PersonInfo;
  model: PlayerModel;
  cue: CueStick;
  chalk: THREE.Mesh;
  index: number;
  seed: number;
  pos: THREE.Vector3;
  yaw: number;
  path: THREE.Vector3[];
  goal: "home" | "table";
  /** La posture d'où l'on part, et depuis quand (pour passer de l'une à l'autre en douceur) */
  from: Pose;
  fromAt: number;
  mode: string;
  last: Pose;
  /** La queue dans sa main : du talon… non, de la pointe à la main ; et son sens (de la pointe vers le talon) */
  gripS: number;
  cueBack: THREE.Vector3;
  /** Après son coup : depuis quand il se relève */
  after: number | null;
  react: { kind: string; at: number; until: number } | null;
  chalkAt: number;
  chalkUntil: number;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const lerpAngle = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

/** Le segment ab traverse-t-il le rectangle |x| < hx, |z| < hz ? */
function crosses(ax: number, az: number, bx: number, bz: number, hx: number, hz: number): boolean {
  let t0 = 0,
    t1 = 1;
  const dx = bx - ax,
    dz = bz - az;
  const edges: [number, number][] = [
    [-dx, ax + hx],
    [dx, hx - ax],
    [-dz, az + hz],
    [dz, hz - az],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t1 - t0 > 1e-4;
}

const inside = (p: THREE.Vector3, hx: number, hz: number) => Math.abs(p.x) < hx && Math.abs(p.z) < hz;

/** Le point juste au-dehors du rectangle, par le bord le plus proche */
function pushOut(p: THREE.Vector3, hx: number, hz: number): THREE.Vector3 {
  const q = p.clone();
  const ex = hx - Math.abs(p.x),
    ez = hz - Math.abs(p.z);
  if (ex < ez) q.x = Math.sign(p.x || 1) * (hx + 0.02);
  else q.z = Math.sign(p.z || 1) * (hz + 0.02);
  return q;
}

/** Le chemin de a à b qui contourne la table (le rectangle |x| < hx, |z| < hz), par ses coins */
export function route(a: THREE.Vector3, b: THREE.Vector3, hx: number, hz: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const a2 = inside(a, hx, hz) ? pushOut(a, hx, hz) : a;
  const bIn = inside(b, hx, hz);
  const b2 = bIn ? pushOut(b, hx, hz) : b;
  if (a2 !== a) out.push(a2);
  if (crosses(a2.x, a2.z, b2.x, b2.z, hx, hz)) {
    const cx = hx + 0.03,
      cz = hz + 0.03;
    const corners = [
      new THREE.Vector3(cx, b.y, cz),
      new THREE.Vector3(cx, b.y, -cz),
      new THREE.Vector3(-cx, b.y, -cz),
      new THREE.Vector3(-cx, b.y, cz),
    ];
    const clear = (p: THREE.Vector3, q: THREE.Vector3) => !crosses(p.x, p.z, q.x, q.z, hx, hz);
    let best: THREE.Vector3[] | null = null;
    let bestLen = Infinity;
    for (const c of corners) {
      if (clear(a2, c) && clear(c, b2)) {
        const len = a2.distanceTo(c) + c.distanceTo(b2);
        if (len < bestLen) {
          bestLen = len;
          best = [c];
        }
      }
    }
    for (let i = 0; i < 4; i++) {
      for (const j of [(i + 1) % 4, (i + 3) % 4]) {
        const c1 = corners[i]!,
          c2 = corners[j]!;
        if (clear(a2, c1) && clear(c2, b2)) {
          const len = a2.distanceTo(c1) + c1.distanceTo(c2) + c2.distanceTo(b2);
          if (len < bestLen) {
            bestLen = len;
            best = [c1, c2];
          }
        }
      }
    }
    if (best) out.push(...best);
  }
  if (bIn) out.push(b2);
  out.push(b.clone());
  return out;
}

/** Debout, sa queue à la main (le talon au sol), l'autre main sur la hanche ou le long du corps */
function holdPose(seed: number): Pose {
  const left: V3 = seed % 3 === 0 ? [0.31, 0.57, -0.03] : seed % 3 === 1 ? [0.3, 0.47, 0.06] : [-0.2, 0.92, 0.13];
  return {
    ...STAND,
    lean: 0.03,
    hands: [[-0.29, 0.76, 0.1], left],
    feet: [
      [-0.12, 0, 0.02],
      [0.12, 0, -0.03],
    ],
  };
}

/** Il frotte le procédé de craie : la queue penchée vers lui, la main gauche qui tourne au bout */
function chalkPose(t: number, tip: THREE.Vector3): Pose {
  const a = t * 11;
  return {
    ...STAND,
    lean: 0.05,
    hands: [
      [-0.12, 0.7, 0.2],
      [tip.x + Math.cos(a) * 0.015, tip.y - 0.06, tip.z + Math.sin(a) * 0.015],
    ],
    nod: 0.35,
  };
}

/** Assis, la queue debout entre les genoux, les deux mains dessus ; `cheer` : les bras en l'air */
function seatedPose(crouch: number, t: number, seed: number, cheer: number): Pose {
  const hy = HIPS_Y - crouch;
  const base: Pose = {
    crouch,
    lean: -0.06,
    twist: 0,
    roll: 0,
    // La queue droite à côté de lui, la main sur l'accoudoir (entre les genoux, elle lui barrait le visage), l'autre sur le genou
    hands: [
      [-0.27, hy + 0.24, 0.16],
      [0.1, hy + 0.15, 0.27],
    ],
    feet: [
      [-0.14, 0, 0.3],
      [0.14, 0, 0.33],
    ],
    nod: 0.05 + Math.sin(t * 0.6 + seed) * 0.05,
    turn: 0,
    lift: 0,
    spin: 0,
  };
  if (cheer > 0)
    return {
      ...base,
      hands: [
        [-0.3, hy + 0.95 + Math.sin(t * 12) * 0.04, 0.12],
        [0.3, hy + 0.95 - Math.sin(t * 12) * 0.04, 0.12],
      ],
      nod: -0.2,
    };
  return base;
}

export class TablePeople {
  private people = new Map<string, Person>();
  private heads = new Map<string, Promise<HTMLCanvasElement>>();
  private spots: Spot[] = [];
  /** Les mêmes places, tournées pour un personnage */
  private places: Spot[] = [];
  private table: Table | null = null;
  private disposed = false;
  private chalkGeo = new THREE.BoxGeometry(0.022, 0.022, 0.022);
  private chalkMat = new THREE.MeshStandardMaterial({ color: "#2f6fd0", roughness: 0.9 });

  constructor(private scene: THREE.Scene) {}

  setTable(t: Table, spots: Spot[]) {
    this.table = t;
    if (spots !== this.spots) {
      this.spots = spots;
      // Une place de salle est tournée comme son meuble (devant : +z) ; un personnage a son devant en −z
      this.places = spots.map((s) => ({ ...s, yaw: s.yaw + Math.PI }));
      // Une autre salle : chacun à sa nouvelle place, tout de suite
      for (const p of this.people.values()) {
        this.homeOf(p, p.pos);
        p.path = [];
        p.goal = "home";
        p.yaw = this.homeSpot(p).yaw;
      }
    }
  }

  setPeople(list: PersonInfo[]) {
    const keep = new Set(list.map((p) => p.id));
    for (const [id, p] of this.people)
      if (!keep.has(id)) {
        this.drop(p);
        this.people.delete(id);
      }
    list.forEach((info, i) => {
      let p = this.people.get(info.id);
      if (p && JSON.stringify([p.info.avatar, p.info.accent]) !== JSON.stringify([info.avatar, info.accent])) {
        this.drop(p);
        this.people.delete(info.id);
        p = undefined;
      }
      if (!p) {
        const model = new PlayerModel({ avatar: info.avatar, accent: info.accent }, TOUCH);
        const cue = new CueStick(true);
        cue.setStyle(info.cue);
        const chalk = new THREE.Mesh(this.chalkGeo, this.chalkMat);
        chalk.visible = false;
        this.scene.add(model.group, cue.group, chalk);
        p = {
          info,
          model,
          cue,
          chalk,
          index: i,
          seed: i * 7 + 3,
          pos: new THREE.Vector3(),
          yaw: 0,
          path: [],
          goal: "home",
          from: STAND,
          fromAt: -10,
          mode: "",
          last: STAND,
          gripS: CUE_LENGTH - 0.9,
          cueBack: new THREE.Vector3(0, -1, 0),
          after: null,
          react: null,
          // Compté depuis sa première image (l'horloge est celle de la page : tous frottaient leur craie ensemble)
          chalkAt: NaN,
          chalkUntil: 0,
        };
        this.people.set(info.id, p);
        p.index = i;
        this.homeOf(p, p.pos);
        p.yaw = this.homeSpot(p).yaw;
        const k = JSON.stringify(info.avatar);
        let head = this.heads.get(k);
        if (!head) {
          head = headCanvas(info.avatar);
          this.heads.set(k, head);
        }
        const m = model;
        void head.then((c) => !this.disposed && m.setHead(c));
      } else {
        p.info = info;
        p.cue.setStyle(info.cue);
        if (p.index !== i) {
          p.index = i;
          if (p.goal === "home") this.walkTo(p, this.homeOf(p, new THREE.Vector3()));
        }
      }
    });
  }

  has(id: string): boolean {
    return this.people.has(id);
  }

  /** Il est à la table, en place pour jouer (sa queue peut quitter sa main) */
  ready(id: string): boolean {
    const p = this.people.get(id);
    return Boolean(p && p.goal === "table" && p.path.length === 0 && p.mode === "queue");
  }

  /** Où il se tient (ses pieds) et vers où il regarde */
  where(id: string): { pos: THREE.Vector3; yaw: number } | null {
    const p = this.people.get(id);
    return p ? { pos: p.pos, yaw: p.yaw } : null;
  }

  /** Le centre de sa tête */
  headOf(id: string): THREE.Vector3 | null {
    return this.people.get(id)?.model.headWorld ?? null;
  }

  /** Le coup de celui-ci est jugé : il réagit, les autres aussi */
  react(id: string, tone: string, t: number) {
    const shooter = this.people.get(id);
    if (shooter) {
      const kind =
        tone === "great"
          ? (shooter.seed + Math.floor(t)) % 2
            ? "bras"
            : "poing"
          : tone === "good"
            ? "poing"
            : tone === "bad"
              ? "rate"
              : "";
      shooter.react = kind ? { kind, at: t, until: t + (tone === "great" ? 2.6 : 1.8) } : null;
    }
    if (tone !== "great") return;
    for (const p of this.people.values()) {
      if (p.info.id === id) continue;
      p.react = { kind: "bravo", at: t + 0.15 + (p.seed % 5) * 0.06, until: t + 2.2 };
    }
  }

  // -------------------------------------------------------------------------
  // Les places
  // -------------------------------------------------------------------------

  private homeSpot(p: Person): Spot {
    const n = this.places.length;
    if (n === 0) {
      const a = p.index * 1.3;
      return { x: Math.cos(a) * 2.6, y: FLOOR, z: Math.sin(a) * 2, yaw: Math.atan2(Math.cos(a), Math.sin(a)), sit: false };
    }
    const s = this.places[p.index % n]!;
    const round = Math.floor(p.index / n);
    if (round === 0) return s;
    // Plus de joueurs que de places : à côté de la place, debout
    const rx = Math.cos(s.yaw),
      rz = -Math.sin(s.yaw);
    return { x: s.x + rx * 0.75 * round, y: FLOOR, z: s.z + rz * 0.75 * round, yaw: s.yaw, sit: false };
  }

  private homeOf(p: Person, out: THREE.Vector3): THREE.Vector3 {
    const s = this.homeSpot(p);
    return out.set(s.x, FLOOR, s.z);
  }

  /** Le rectangle que l'on contourne en marchant (le cadre de la table et un peu d'air) */
  private walkBox(): [number, number] {
    const t = this.table;
    if (!t) return [1.6, 1.0];
    return [t.lx + t.cushionW + t.rail + 0.32, t.ly + t.cushionW + t.rail + 0.32];
  }

  private walkTo(p: Person, to: THREE.Vector3) {
    const [hx, hz] = this.walkBox();
    p.path = route(p.pos, to, hx, hz);
  }

  // -------------------------------------------------------------------------
  // Celui qui joue, penché sur sa queue
  // -------------------------------------------------------------------------

  /** Où se tenir pour jouer cette queue, et comment : la posture, les coudes, la prise sur la queue */
  private stance(p: Person, cue: CueAt): { root: THREE.Vector3; yaw: number; pose: Pose; elbows: Elbows; grip: number } {
    const t = this.table!;
    const OX = t.lx + t.cushionW + t.rail,
      OY = t.ly + t.cushionW + t.rail;
    // La queue au repos (sans le dosage) : d'elle dépend où il se tient
    const rest = tmpA.copy(cue.tip).addScaledVector(cue.back, -cue.drawn);
    const bh = tmpB.set(cue.back.x, 0, cue.back.z).normalize();
    // Jusqu'où la ligne de la queue reste au-dessus de la table, depuis la pointe
    const exit = (hx: number, hz: number) => {
      const lim = (p0: number, u: number, h: number) => (u > 1e-6 ? (h - p0) / u : u < -1e-6 ? (-h - p0) / u : Infinity);
      return Math.max(0, Math.min(lim(rest.x, bh.x, hx), lim(rest.z, bh.z, hz)));
    };
    const e = exit(OX + 0.14, OY + 0.14);
    const f = Math.max(1.0, e + 0.04);
    const fw = tmpC.copy(bh).negate();
    const left = tmpD.set(fw.z, 0, -fw.x);
    let root = rest.clone().addScaledVector(bh, f).addScaledVector(left, 0.085);
    let yaw = Math.atan2(-fw.x, -fw.z);
    // Derrière la queue, il serait sur la table (la blanche loin du bord, le coup dans la longueur) : il joue depuis
    // le bord le plus proche, penché par-dessus la bande vers sa queue
    const over = f > 1.08;
    if (over) {
      const chin = rest.clone().addScaledVector(bh, 0.55);
      root = pushOut(chin, OX + 0.13, OY + 0.13);
      const ball = rest.clone().addScaledVector(bh, -0.03);
      yaw = Math.atan2(-(ball.x - root.x), -(ball.z - root.z));
    }
    root.y = FLOOR;
    const pose: Pose = {
      crouch: over ? 0.03 : 0.05,
      lean: over ? 0.82 : 0.5,
      twist: -0.1,
      roll: 0.02,
      hands: [
        [-0.08, 0.72, 0.0],
        [0.0, 0.7, 0.6],
      ],
      feet: [
        [-0.17, 0, -0.12],
        [0.11, 0, 0.17],
      ],
      nod: -0.6,
      turn: 0,
      lift: 0,
      spin: 0,
    };
    // Le modèle à sa place, pour passer du monde à ses postures
    p.model.group.position.copy(root);
    p.model.group.rotation.y = yaw;
    const m = p.model;
    const tipP = m.toPose(cue.tip, new THREE.Vector3());
    const restP = m.toPose(rest, new THREE.Vector3());
    const backP = m.dirToPose(cue.back, new THREE.Vector3());
    // La main du talon : sur la queue, un peu derrière l'épaule droite (penché de côté : le point de la queue le plus
    // proche de l'épaule) ; elle suit la queue quand elle recule
    const rs = shoulderOf(pose, -1, new THREE.Vector3());
    let grip: number;
    if (over) grip = Math.max(0.45, Math.min(CUE_LENGTH - 0.1, rs.clone().sub(restP).dot(backP)));
    else {
      const zT = rs.z - 0.24;
      grip = backP.z < -1e-3 ? Math.max(0.55, Math.min(CUE_LENGTH - 0.08, (zT - restP.z) / backP.z)) : 1.1;
    }
    let hand = tipP.clone().addScaledVector(backP, grip);
    if (hand.distanceTo(rs) > REACH)
      hand = rs.clone().add(
        hand
          .sub(rs)
          .normalize()
          .multiplyScalar(REACH * 0.98),
      );
    pose.hands[0] = [hand.x, hand.y, hand.z];
    // La main du pont : sur le tapis, à vingt centimètres derrière la blanche ; sur la bande si c'est trop loin
    const ls = shoulderOf(pose, 1, new THREE.Vector3());
    const bridge = rest.clone().addScaledVector(bh, 0.2).addScaledVector(left, 0.045);
    bridge.y = 0.05;
    let bp = m.toPose(bridge, new THREE.Vector3());
    if (bp.distanceTo(ls) > REACH * 0.98) {
      const e2 = exit(t.lx + t.cushionW + t.rail * 0.45, t.ly + t.cushionW + t.rail * 0.45);
      const onRail = rest.clone().addScaledVector(bh, e2).addScaledVector(left, 0.045);
      onRail.y = 0.1;
      const rp = m.toPose(onRail, new THREE.Vector3());
      bp =
        rp.distanceTo(ls) <= REACH * 1.05
          ? rp
          : ls.clone().add(
              rp
                .sub(ls)
                .normalize()
                .multiplyScalar(REACH * 0.97),
            );
    }
    pose.hands[1] = [bp.x, bp.y, bp.z];
    return { root, yaw, pose, elbows: { r: [-0.35, 0.45, -1], l: [0.85, -0.15, -0.2] }, grip };
  }

  // -------------------------------------------------------------------------
  // L'image
  // -------------------------------------------------------------------------

  update(f: PeopleFrame) {
    if (!this.table) return;
    for (const p of this.people.values()) this.updatePerson(p, f);
  }

  private setMode(p: Person, mode: string, t: number) {
    if (p.mode === mode) return;
    p.mode = mode;
    p.from = p.last;
    p.fromAt = t;
  }

  private updatePerson(p: Person, f: PeopleFrame) {
    const { t, dt } = f;
    const isShooter = p.info.id === f.shooter;
    const m = p.model;
    let pose: Pose;
    let elbows: Elbows | undefined;
    let cueInHand = true;
    let goalPos: THREE.Vector3;
    let goalYaw: number;
    let atTable: ReturnType<TablePeople["stance"]> | null = null;

    // Où il doit être (le coup qui part le trouve à la table, même s'il n'avait pas fini d'y aller)
    const striking = f.sinceStrike !== null && f.sinceStrike < 0.25;
    if (isShooter && (f.cue || f.aim) && (f.sinceStrike === null || striking)) {
      p.goal = "table";
      p.after = null;
    } else if (isShooter && f.sinceStrike !== null) {
      if (p.after === null && f.sinceStrike > 0.25) p.after = t;
    } else if (!isShooter) {
      if (p.goal === "table") {
        p.goal = "home";
        this.walkTo(p, this.homeOf(p, new THREE.Vector3()));
      }
      p.after = null;
    }

    if (p.goal === "table" && p.after === null && (f.cue || f.aim)) {
      atTable = this.stance(p, (f.cue ?? f.aim)!);
      goalPos = atTable.root;
      goalYaw = atTable.yaw;
    } else if (p.goal === "table") {
      goalPos = p.pos.clone();
      goalYaw = p.yaw;
    } else {
      goalPos = this.homeOf(p, new THREE.Vector3());
      goalYaw = this.homeSpot(p).yaw;
    }

    // Y aller : d'un coup (c'est moi qui vise), en marchant (contourner la table), ou en glissant (un petit pas)
    if (isShooter && atTable && (f.mine || striking)) {
      p.pos.copy(goalPos);
      p.yaw = goalYaw;
      p.path = [];
    } else {
      const lastStop = p.path.length ? p.path[p.path.length - 1]! : p.pos;
      if (lastStop.distanceTo(goalPos) > 0.55) this.walkTo(p, goalPos);
      else if (p.path.length) p.path[p.path.length - 1]!.copy(goalPos);
    }
    let walking = false;
    if (p.path.length) {
      walking = true;
      // Le coup part déjà (un bot pressé) : il presse le pas
      let step = WALK * dt * (isShooter && f.cue ? 3 : 1);
      while (step > 0 && p.path.length) {
        const next = p.path[0]!;
        const d = tmpA.subVectors(next, p.pos);
        d.y = 0;
        const len = d.length();
        if (len <= step) {
          p.pos.x = next.x;
          p.pos.z = next.z;
          step -= len;
          p.path.shift();
        } else {
          p.pos.addScaledVector(d, step / len);
          p.yaw = lerpAngle(p.yaw, Math.atan2(-d.x, -d.z), 1 - Math.exp(-12 * dt));
          step = 0;
        }
      }
      p.pos.y = FLOOR;
      if (!p.path.length) walking = false;
    } else {
      const k = 1 - Math.exp(-9 * dt);
      p.pos.lerp(goalPos, k);
      p.yaw = lerpAngle(p.yaw, goalYaw, k);
    }
    m.group.position.copy(p.pos);
    m.group.rotation.y = p.yaw;

    // Sa posture
    const spot = this.homeSpot(p);
    const sitting = !walking && p.goal === "home" && spot.sit && p.pos.distanceTo(tmpB.set(spot.x, FLOOR, spot.z)) < 0.05;
    const react = p.react && t >= p.react.at && t < p.react.until ? p.react : null;
    if (p.react && t >= p.react.until) p.react = null;
    if (walking) {
      this.setMode(p, "marche", t);
      pose = walkPose(t * 1.25, 1.2);
      pose = { ...pose, hands: [[-0.29, 0.74, 0.1 + pose.hands[0][2] * 0.3], pose.hands[1]] };
    } else if (atTable && p.goal === "table") {
      this.setMode(p, "queue", t);
      pose = atTable.pose;
      elbows = atTable.elbows;
      p.gripS = atTable.grip;
      cueInHand = false;
      // La main sur la queue qui bouge : la posture suit la queue telle qu'elle est
      p.cueBack.copy((f.cue ?? f.aim)!.back);
    } else if (sitting) {
      this.setMode(p, "assis", t);
      const crouch = HIPS_Y - (spot.y - FLOOR) / S;
      pose = seatedPose(crouch, t, p.seed, react?.kind === "bravo" ? 1 : 0);
    } else {
      // Debout : à sa place, ou relevé après son coup
      if (Number.isNaN(p.chalkAt)) p.chalkAt = t + 6 + p.index * 3.7;
      const chalking = !isShooter && p.goal === "home" && !react && t < p.chalkUntil;
      if (!isShooter && p.goal === "home" && t > p.chalkAt) {
        p.chalkAt = t + 9 + ((p.seed * 13 + Math.floor(t)) % 7);
        p.chalkUntil = t + 2.2;
      }
      if (chalking) {
        this.setMode(p, "craie", t);
        const tip = m.toPose(this.cueTip(p, tmpC), new THREE.Vector3());
        pose = chalkPose(t, tip);
      } else if (react) {
        this.setMode(p, "joie" + react.kind, t);
        const kind = react.kind === "bravo" ? "spare" : react.kind === "poing" ? "" : react.kind;
        pose = reactPose(kind, t - react.at);
      } else {
        this.setMode(p, p.after !== null ? "releve" : "attend", t);
        pose = holdPose(p.seed);
        if (p.after !== null) pose = { ...pose, lean: 0.12, hands: [pose.hands[0], [0.3, 0.5, 0.08]] };
      }
    }

    // Le regard : vers ce que tout le monde regarde (sauf celui qui vise : le long de sa queue)
    if (!(atTable && p.goal === "table")) {
      const dirP = m.dirToPose(tmpA.subVectors(f.look, m.headWorld.lengthSq() ? m.headWorld : p.pos), new THREE.Vector3());
      const turn = Math.max(-1.1, Math.min(1.1, Math.atan2(dirP.x, dirP.z)));
      const nod = Math.max(-0.6, Math.min(0.9, Math.atan2(-dirP.y, Math.hypot(dirP.x, dirP.z)) / 0.6));
      pose = { ...pose, turn, nod: pose.nod + nod * 0.7, twist: pose.twist + turn * 0.2 };
    }

    // D'une posture à l'autre en douceur
    const k = ease((t - p.fromAt) / (p.mode === "queue" ? 0.45 : 0.35));
    const out = k < 1 ? blend(p.from, pose, k) : pose;
    m.apply(out, k < 1 && p.mode !== "queue" ? undefined : elbows);
    p.last = out;

    // Sa queue : dans sa main (debout, en marchant, assis, relevé), ou c'est celle de la table qui sert
    if (cueInHand) {
      const up = this.cueUp(p, sitting, p.mode === "craie", tmpB);
      const targetBack = up.negate();
      const kk = 1 - Math.exp(-(p.after !== null && t - p.after < 0.8 ? 5 : 8) * dt);
      p.cueBack.lerp(targetBack, kk).normalize();
      const handY = m.rightHand.y;
      const idleGrip = CUE_LENGTH - Math.max(0.35, Math.min(1.3, (handY - FLOOR - (walking ? 0.06 : 0.012)) / Math.max(0.3, -p.cueBack.y)));
      p.gripS += (idleGrip - p.gripS) * (1 - Math.exp(-(p.after !== null ? 2.5 : 6) * dt));
      p.cue.poseAxis(this.cueTip(p, tmpC), p.cueBack);
    }
    p.cue.visible = cueInHand;
    // La craie, dans la main gauche pendant qu'il frotte
    p.chalk.visible = p.mode === "craie";
    if (p.chalk.visible) {
      // la main gauche : on la retrouve par la posture (repère du modèle)
      const h = out.hands[1];
      p.chalk.position.set(h[0], h[1] + 0.03, h[2]);
      m.group.updateMatrixWorld(true);
      p.chalk.position.applyMatrix4(m.group.children[0]!.matrixWorld);
    }
    // Trop près de la caméra : on ne le montre pas (on vise de ses yeux)
    const near = m.headWorld.distanceTo(f.camera) < HIDE_NEAR || p.pos.distanceTo(tmpA.set(f.camera.x, FLOOR, f.camera.z)) < 0.35;
    m.visible = !near;
    p.cue.visible = p.cue.visible && !near;
    p.chalk.visible = p.chalk.visible && !near;
  }

  /** Le sens de sa queue tenue droite (de la pointe vers… le haut), selon qu'il est debout, assis ou qu'il la frotte */
  private cueUp(p: Person, sitting: boolean, chalking: boolean, out: THREE.Vector3): THREE.Vector3 {
    const yaw = p.yaw;
    // Le devant du groupe (−z tourné de yaw), sa droite
    const fx = -Math.sin(yaw),
      fz = -Math.cos(yaw);
    const rx = Math.cos(yaw),
      rz = -Math.sin(yaw);
    if (chalking) return out.set(-rx * 0.34 + fx * 0.1, 1, -rz * 0.34 + fz * 0.1).normalize();
    if (sitting) return out.set(rx * 0.1 + fx * 0.03, 1, rz * 0.1 + fz * 0.03).normalize();
    return out.set(rx * 0.07 + fx * 0.05, 1, rz * 0.07 + fz * 0.05).normalize();
  }

  /** La pointe de sa queue tenue à la main */
  private cueTip(p: Person, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(p.model.rightHand).addScaledVector(p.cueBack, -p.gripS);
  }

  private drop(p: Person) {
    this.scene.remove(p.model.group, p.cue.group, p.chalk);
    p.model.dispose();
    p.cue.dispose();
  }

  dispose() {
    this.disposed = true;
    for (const p of this.people.values()) this.drop(p);
    this.people.clear();
    this.chalkGeo.dispose();
    this.chalkMat.dispose();
  }
}

void UP;
