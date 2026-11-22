// Le jeu à l'écran : la salle, les personnages (le lanceur sur l'élan, les autres sur la banquette), le geste du lancer
// à la souris ou au doigt, et chaque lancer rejoué avec la même physique que le serveur (un ralenti sur les strikes) ;
// la machine qui balaie et repose les quilles ; la caméra qui suit la boule, s'approche des quilles, puis se retourne
// vers le lanceur pour sa réaction.

import * as THREE from "three";
import type { AvatarConfig } from "../../shared/avatar.ts";
import type { PinSpot } from "../../shared/games/bowling/lane.ts";
import type { BowlingLook } from "../../shared/games/bowling/looks.ts";
import { colorOf } from "../../shared/games/bowling/looks.ts";
import { physOf, SLOWMO_MS, WINDUP_MS, type ThrowRecord } from "../../shared/games/bowling/match.ts";
import type { BowlingPose, BowlingView } from "../../shared/games/bowling/net.ts";
import { HZ, type PhysEvent, type World } from "../../shared/games/bowling/physics.ts";
import { isSplit } from "../../shared/games/bowling/score.ts";
import { cleanThrow, DIR_MAX, MAX_STEPS, startThrow, X_MAX, type ThrowParams } from "../../shared/games/bowling/throw.ts";
import { headCanvas } from "../bolides/scene/faces.ts";
import { armAngle, release, type Refusal, type Release, type Sample } from "./gesture.ts";
import { BallModel } from "./scene/ball.ts";
import { approachPose, blend, BowlerModel, ease, followPose, reactPose, sitPose, STAND, walkPose, type Pose } from "./scene/bowler.ts";
import { LaneScene } from "./scene/LaneScene.ts";

export interface PlayerInfo {
  id: string;
  name: string;
  avatar: AvatarConfig;
  look: BowlingLook;
}

export interface HudState {
  /** C'est à lui de lancer, et il peut (la machine a fini) */
  canThrow: boolean;
  /** Il est en train de prendre son élan */
  swinging: boolean;
  /** L'angle de son bras (pour la jauge) */
  arm: number;
  fps: number;
}

/** Un moment du lancer, pour le son et l'écran */
export type Moment =
  | { k: "release"; id: string; v: number; mine: boolean }
  | { k: "impact"; id: string; strike: boolean }
  | { k: "result"; rec: ThrowRecord }
  | { k: "sweep" };

export interface RuntimeOptions {
  me: string | null;
  serverNow: () => number;
  onThrow: (n: number, t: ThrowParams) => void;
  onPose: (p: BowlingPose) => void;
  onHud: (h: HudState) => void;
  /** Un choc de la physique (volume selon la distance) */
  onPhys?: (e: PhysEvent, volume: number) => void;
  onMoment?: (m: Moment) => void;
  /** La boule roule : sa vitesse, le volume (selon la distance), dans la rigole ou pas */
  onRoll?: (speed: number, volume: number, gutter: boolean) => void;
  /** Un geste qui ne lance pas, et pourquoi ; le lancer parti, ce qu'il a donné */
  onGesture?: (r: Refusal | (Release & { t: ThrowParams })) => void;
}

/** Le ralenti : à partir d'un peu avant le premier choc, ce nombre de pas de physique, à cette vitesse */
const SLOW_FACTOR = 0.35;
const SLOW_STEPS = Math.round(((SLOWMO_MS / 1000) * HZ) / (1 / SLOW_FACTOR - 1));
/** La machine : le balai, la table, les quilles reposées */
const SWEEP_MS = 1900;
/** Le temps pour aller de la banquette à l'élan */
const WALK_MS = 1300;
/** Où le lanceur se tient avant son élan, et la longueur de son élan */
const STANCE_Z = 1.95;
const APPROACH_LEN = 1.55;

interface Bowler {
  info: PlayerInfo;
  model: BowlerModel;
  ball: BallModel;
  /** Sa place sur la banquette */
  seat: number;
  pos: THREE.Vector3;
  yaw: number;
  /** D'où il part quand il marche, et quand */
  from: THREE.Vector3;
  fromYaw: number;
  walkAt: number;
  where: "bench" | "lane";
  /** Sa réaction en cours (sur la banquette : 1 contente, −1 déçue) */
  cheer: number;
  cheerUntil: number;
  /** Une bulle au-dessus de lui (une réaction envoyée) */
  bubble: THREE.Sprite | null;
  bubbleUntil: number;
  seed: number;
}

interface Replay {
  rec: ThrowRecord;
  world: World;
  /** Le moment (horloge de l'appareil) où la boule est partie */
  t0: number;
  slowFrom: number;
  slow: boolean;
  events: number;
  impact: boolean;
  done: boolean;
  released: boolean;
}

export class BowlingRuntime {
  readonly scene: LaneScene;
  private view: BowlingView | null = null;
  private bowlers = new Map<string, Bowler>();
  private raf = 0;
  private last = performance.now();
  private disposed = false;
  private paused = false;
  private replay: Replay | null = null;
  /** Le lancer que je viens de faire (avant que le serveur le montre) */
  private pending: { n: number; t: ThrowParams; at: number } | null = null;
  private aimKey = "";
  private aimAt = 0;
  /** La machine, à faire tourner au début du tour (les quilles tombées à balayer, celles à reposer) */
  private sweep: {
    at: number;
    down: { n: number; px: number; py: number; pz: number; q: THREE.Quaternion }[];
    rack: PinSpot[];
    fresh: boolean;
  } | null = null;
  // Ma visée
  private stanceX = 0;
  private aimD = 0;
  private drag: { mode: "swing" | "move" | "aim"; x: number; y: number; id: number; x0: number; d0: number } | null = null;
  private samples: Sample[] = [];
  private backAt = 0;
  private arm = 0;
  private keys = new Set<string>();
  private lastPose = 0;
  private lastPoseKey = "";
  // La pose du lanceur (un autre), reçue du serveur
  private remote: { x: number; d: number; k: number; sw: boolean; at: number; swAt: number } | null = null;
  // La caméra
  private camPos = new THREE.Vector3(0, 1.6, 6);
  private camLook = new THREE.Vector3(0, 0.4, -10);
  private camReady = false;
  private shot = "";
  private arrow: THREE.Mesh;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private heads = new Map<string, Promise<HTMLCanvasElement>>();

  constructor(
    host: HTMLElement,
    private o: RuntimeOptions,
  ) {
    this.scene = new LaneScene(host);
    const el = this.scene.renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onCancel);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    // La flèche de visée : un trait de petits chevrons posé sur la piste
    const tex = arrowTexture();
    this.arrow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    this.arrow.rotation.x = -Math.PI / 2;
    this.arrow.renderOrder = 5;
    this.arrow.visible = false;
    this.scene.scene.add(this.arrow);
    this.raf = requestAnimationFrame(this.frame);
  }

  // -------------------------------------------------------------------------
  // Ce que le jeu lui dit
  // -------------------------------------------------------------------------

  setPlayers(list: PlayerInfo[]) {
    const ballR = this.view ? physOf(this.view.cfg).ballR : 0.1085;
    list.forEach((p, i) => {
      let b = this.bowlers.get(p.id);
      const key = JSON.stringify([p.avatar, p.look.left, p.look.color]);
      if (b && b.model.look && JSON.stringify([b.model.look.avatar, b.model.look.left, b.info.look.color]) !== key) {
        this.scene.scene.remove(b.model.group, b.ball.group);
        b.model.dispose();
        b.ball.dispose();
        this.bowlers.delete(p.id);
        b = undefined;
      }
      if (!b) {
        const model = new BowlerModel({ avatar: p.avatar, left: p.look.left, accent: colorOf(p.look.color).hex });
        const ball = new BallModel(ballR, p.look);
        this.scene.scene.add(model.group, ball.group);
        const pos = new THREE.Vector3();
        b = {
          info: p,
          model,
          ball,
          seat: i,
          pos,
          yaw: 0,
          from: pos.clone(),
          fromYaw: 0,
          walkAt: -1e9,
          where: "bench",
          cheer: 0,
          cheerUntil: 0,
          bubble: null,
          bubbleUntil: 0,
          seed: i * 1.7 + 0.3,
        };
        this.bowlers.set(p.id, b);
        this.seatOf(b, pos);
        b.from.copy(pos);
        b.yaw = b.fromYaw = this.benchYaw(b);
        const k = JSON.stringify(p.avatar);
        let head = this.heads.get(k);
        if (!head) {
          head = headCanvas(p.avatar);
          this.heads.set(k, head);
        }
        void head.then((c) => !this.disposed && model.setHead(c));
      } else {
        b.info = p;
        b.seat = i;
        b.ball.setLook(p.look);
      }
    });
  }

  setView(v: BowlingView) {
    const first = !this.view;
    this.view = v;
    this.scene.setSalle(v.salle);
    if (first) {
      // Les personnages déjà là : la bonne taille de boule pour les règles
      const r = physOf(v.cfg).ballR;
      for (const b of this.bowlers.values()) {
        if (Math.abs(b.ball.r - r) > 1e-6) {
          this.scene.scene.remove(b.ball.group);
          b.ball.dispose();
          b.ball = new BallModel(r, b.info.look);
          this.scene.scene.add(b.ball.group);
        }
      }
    }
    const now = performance.now();
    const thrower = v.players[v.turn];
    if (v.phase === "aim" || v.phase === "intro") {
      const key = `${v.throws}:${thrower?.id}`;
      if (key !== this.aimKey) {
        this.aimKey = key;
        this.aimAt = now;
        this.remote = null;
        // La machine passe : les quilles tombées au dernier lancer, et celles à reposer
        if (v.phase === "aim" && this.replay) {
          const w = this.replay.world;
          const fresh = v.rack.length === 10 || v.cfg.mode === "spares";
          const down = w.pins
            .filter((p) => !p.gone && !v.rack.some((q) => q.n === p.id && !fresh))
            .map((p) => ({ n: p.id, px: p.px, py: p.py, pz: p.pz, q: new THREE.Quaternion(p.qx, p.qy, p.qz, p.qw) }));
          this.sweep = { at: now, down, rack: v.rack.map((p) => ({ ...p })), fresh };
          this.o.onMoment?.({ k: "sweep" });
        } else {
          this.sweep = null;
          this.scene.placeRack(v.rack);
        }
        this.replay = null;
        // Le lanceur se place : au milieu (un peu à droite pour un droitier), visée droite
        if (thrower && thrower.id === this.o.me) {
          const b = this.bowlers.get(thrower.id);
          this.stanceX = b?.info.look.left ? -0.12 : 0.12;
          if (v.rack.length < 10 && v.cfg.mode === "classique") this.stanceX = 0;
          this.aimD = 0;
          this.drag = null;
          this.arm = 0;
        }
        const b = thrower ? this.bowlers.get(thrower.id) : null;
        if (b) {
          this.scene.setPinSkin(b.info.look.pins);
          // Déjà sur l'élan (sa deuxième boule) : il remonte à sa place à pied
          if (b.where === "lane") {
            b.from.copy(b.pos);
            b.fromYaw = b.yaw;
            b.walkAt = now;
          }
        }
      }
    }
    if ((v.phase === "roll" || v.phase === "aim") && v.last) {
      const rec = v.last;
      const r = this.replay;
      if (r && r.rec.n === rec.n && JSON.stringify(r.rec.t) === JSON.stringify(rec.t)) {
        // Mon lancer, déjà parti chez moi : le serveur donne ce qu'il a fait (la fin, le ralenti)
        if (r.rec.steps !== rec.steps || r.rec.decided !== rec.decided) {
          r.rec = rec;
          r.slow = rec.down.length === rec.rack.length && rec.rack.length >= 6 && rec.firstHit > 0;
          r.slowFrom = Math.max(0, rec.firstHit - Math.round(0.06 * HZ));
        }
        this.pending = null;
      } else if (v.phase === "roll" && (!r || r.rec.n !== rec.n)) {
        this.startReplay(rec, now - Math.max(0, this.o.serverNow() - rec.at));
        this.pending = null;
      }
    }
  }

  /** La pose du lanceur, reçue du serveur */
  pose(id: string, p: BowlingPose) {
    const v = this.view;
    if (!v || v.players[v.turn]?.id !== id || id === this.o.me) return;
    const now = performance.now();
    const swAt = p.sw ? (this.remote?.sw ? this.remote.swAt : now) : now;
    this.remote = { ...p, at: now, swAt };
  }

  /** Une réaction envoyée par un joueur : une bulle au-dessus de son personnage */
  emote(seatId: string | null, emoji: string) {
    if (!seatId) return;
    const b = this.bowlers.get(seatId);
    if (!b) return;
    if (b.bubble) {
      this.scene.scene.remove(b.bubble);
      (b.bubble.material as THREE.SpriteMaterial).map?.dispose();
      b.bubble.material.dispose();
    }
    b.bubble = bubbleSprite(emoji);
    b.bubbleUntil = performance.now() + 2600;
    this.scene.scene.add(b.bubble);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.cancelSwing();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const el = this.scene.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onCancel);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    for (const b of this.bowlers.values()) {
      b.model.dispose();
      b.ball.dispose();
    }
    this.scene.dispose();
  }

  // -------------------------------------------------------------------------
  // Le lancer rejoué
  // -------------------------------------------------------------------------

  private startReplay(rec: ThrowRecord, t0: number) {
    const v = this.view!;
    const world = startThrow(rec.rack, rec.t, physOf(v.cfg));
    const cleared = rec.down.length === rec.rack.length && rec.rack.length >= 6;
    this.replay = {
      rec,
      world,
      t0,
      slow: cleared && rec.firstHit > 0,
      slowFrom: Math.max(0, rec.firstHit - Math.round(0.06 * HZ)),
      events: 0,
      impact: false,
      done: false,
      released: false,
    };
    this.scene.placeRack(rec.rack);
  }

  /** Le pas de physique à montrer, ce temps (ms) après le lâcher (le ralenti étire un moment) */
  private stepAt(r: Replay, ms: number): number {
    const t = (ms / 1000) * HZ;
    if (!r.slow || t <= r.slowFrom) return t;
    const wall = SLOW_STEPS / SLOW_FACTOR;
    if (t <= r.slowFrom + wall) return r.slowFrom + (t - r.slowFrom) * SLOW_FACTOR;
    return t - wall + SLOW_STEPS;
  }

  /** Quand (ms après le lâcher) la physique finit, ralenti compris */
  private endMs(r: Replay): number {
    const extra = r.slow ? SLOW_STEPS / SLOW_FACTOR - SLOW_STEPS : 0;
    return ((Math.min(r.rec.decided, MAX_STEPS) + extra) / HZ) * 1000;
  }

  private runReplay(now: number) {
    const r = this.replay!;
    const ms = now - r.t0;
    if (ms < 0) return;
    if (!r.released) {
      r.released = true;
      this.o.onMoment?.({ k: "release", id: r.rec.id, v: r.rec.t.v, mine: r.rec.id === this.o.me });
    }
    // On continue la physique jusqu'au bout (les quilles qui roulent encore), même pendant la réaction
    const target = Math.min(MAX_STEPS, Math.floor(this.stepAt(r, ms)));
    let budget = 900;
    while (r.world.step < target && budget-- > 0) r.world.advance();
    for (const p of r.world.pins) this.scene.placePin(p.id, p);
    // Les chocs, pour le son
    const ev = r.world.events;
    for (; r.events < ev.length; r.events++) {
      const e = ev[r.events]!;
      if (r.world.step - e.t > HZ * 0.4) continue;
      const d = this.scene.camera.position.distanceTo(this.tmp.set(e.x, e.y, e.z));
      this.o.onPhys?.(e, Math.max(0.12, Math.min(1, 1.6 / (1 + d * 0.22))));
    }
    if (!r.impact && r.rec.firstHit >= 0 && r.world.step >= r.rec.firstHit) {
      r.impact = true;
      this.o.onMoment?.({ k: "impact", id: r.rec.id, strike: r.slow });
    }
    if (!r.done && ms >= this.endMs(r) - 150) {
      r.done = true;
      this.o.onMoment?.({ k: "result", rec: r.rec });
      // Ceux de la banquette réagissent
      const cleared = r.rec.down.length === r.rec.rack.length;
      const bad = r.rec.gutter || r.rec.down.length <= 2;
      for (const b of this.bowlers.values()) {
        if (b.info.id === r.rec.id) continue;
        b.cheer = cleared ? 1 : bad ? -1 : 0;
        b.cheerUntil = now + 2200;
      }
    }
  }

  // -------------------------------------------------------------------------
  // La boucle
  // -------------------------------------------------------------------------

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const v = this.view;
    if (!v) {
      this.scene.render(dt);
      return;
    }
    if (this.replay && !this.paused) this.runReplay(now);
    const rb = this.replay?.world.ball;
    if (rb && !rb.gone && rb.py < rb.shape.r[0]! + 0.02) {
      const d = this.scene.camera.position.distanceTo(this.tmp.set(rb.px, rb.py, rb.pz));
      this.o.onRoll?.(
        Math.sqrt(rb.vx * rb.vx + rb.vz * rb.vz),
        Math.max(0.15, Math.min(1, 2.2 / (1 + d * 0.3))),
        this.replay!.world.inGutter,
      );
    } else this.o.onRoll?.(0, 0, false);
    this.updateSweep(now);
    this.updateBowlers(now, dt);
    this.updateArrow();
    this.updateCamera(now, dt);
    this.sendPose(now);
    this.scene.render(dt);
    const thrower = v.players[v.turn];
    this.o.onHud({ canThrow: this.canThrow(now), swinging: this.drag?.mode === "swing", arm: this.arm, fps: this.scene.fps });
    void thrower;
  };

  /** Il peut lancer : c'est son tour, la machine a fini, il est arrivé sur l'élan */
  private canThrow(now: number): boolean {
    const v = this.view;
    if (!v || v.phase !== "aim" || this.paused || this.pending) return false;
    if (v.players[v.turn]?.id !== this.o.me) return false;
    return now - this.aimAt > Math.max(this.sweep ? SWEEP_MS : 0, WALK_MS) - 200;
  }

  private updateSweep(now: number) {
    const s = this.sweep;
    const lane = this.scene.lane;
    if (!s || !lane) return;
    const t = now - s.at;
    const sw = lane.sweep;
    const table = lane.table;
    if (t >= SWEEP_MS) {
      sw.visible = false;
      table.visible = false;
      this.scene.placeRack(s.rack);
      this.sweep = null;
      return;
    }
    sw.visible = true;
    table.visible = true;
    const k = t / SWEEP_MS;
    // Le balai descend devant les quilles, part vers le fond en poussant les quilles couchées, puis revient et remonte
    const front = -17.95,
      back = -19.35;
    const down = ease(k / 0.18);
    const push = ease((k - 0.32) / 0.3);
    const ret = ease((k - 0.75) / 0.2);
    sw.position.y = 0.9 - 0.88 * down + 0.88 * ret;
    sw.position.z = front + (back - front) * push * (1 - ret) + (back - front) * push * 0;
    if (ret > 0) sw.position.z = back + (front - back) * ret;
    // La table descend, lève les quilles debout (ou apporte les nouvelles), les repose, remonte
    const tdown = ease((k - 0.12) / 0.2) - ease((k - 0.38) / 0.12) * 0.0;
    const lift = ease((k - 0.3) / 0.12) * (1 - ease((k - 0.66) / 0.14));
    const tup = ease((k - 0.82) / 0.16);
    table.position.y = 1.2 - 0.62 * tdown + 0.3 * lift * 0 + 0.62 * tup;
    const pinLift = s.fresh ? 0.55 * (1 - ease((k - 0.55) / 0.22)) : 0.32 * lift;
    for (const [n, m] of this.scene.pins) {
      const keep = s.rack.find((q) => q.n === n);
      const fallen = s.down.find((q) => q.n === n);
      if (s.fresh) {
        // Les nouvelles quilles descendent avec la table
        if (keep && k > 0.45) {
          m.visible = true;
          m.position.set(keep.x, 0.146 + pinLift, keep.z);
          m.quaternion.identity();
          continue;
        }
      } else if (keep) {
        m.visible = true;
        m.position.set(keep.x, 0.146 + pinLift, keep.z);
        m.quaternion.identity();
        continue;
      }
      if (fallen) {
        // Une quille couchée : poussée vers la fosse par le balai
        const z = Math.min(fallen.pz, sw.position.z - 0.12 + (ret > 0 ? 10 : 0));
        m.visible = z > -19.3 && k < 0.75;
        m.position.set(fallen.px, fallen.py, z);
        m.quaternion.copy(fallen.q);
      } else m.visible = false;
    }
  }

  private seatOf(b: Bowler, out: THREE.Vector3): THREE.Vector3 {
    const spots = this.scene.benchSpots();
    const s = spots[b.seat % Math.max(1, spots.length)];
    return s ? out.set(s.x, 0, s.z) : out.set(-1 + b.seat * 0.6, 0, 6.5);
  }

  private benchYaw(b: Bowler): number {
    const spots = this.scene.benchSpots();
    return spots[b.seat % Math.max(1, spots.length)]?.yaw ?? 0;
  }

  /** Où se tient le lanceur sur l'élan (sa boule dans l'axe de son lâcher) */
  private laneSpot(b: Bowler, x: number, out: THREE.Vector3): THREE.Vector3 {
    const side = b.info.look.left ? -1 : 1;
    return out.set(x - 0.27 * side, 0, STANCE_Z);
  }

  private updateBowlers(now: number, dt: number) {
    const v = this.view!;
    const throwerId = v.phase === "over" ? null : (v.players[v.turn]?.id ?? null);
    const rec = this.replay?.rec ?? null;
    const T = now / 1000;
    for (const b of this.bowlers.values()) {
      const isThrower = b.info.id === throwerId || (rec !== null && rec.id === b.info.id && v.phase === "roll");
      const want: "bench" | "lane" = isThrower ? "lane" : "bench";
      if (want !== b.where) {
        b.where = want;
        b.from.copy(b.pos);
        b.fromYaw = b.yaw;
        b.walkAt = now;
      }
      const target = this.tmp;
      let targetYaw = 0;
      if (want === "lane") {
        const x = rec && rec.id === b.info.id ? rec.t.x : b.info.id === this.o.me ? this.stanceX : (this.remote?.x ?? 0);
        this.laneSpot(b, x, target);
        targetYaw = 0;
      } else {
        this.seatOf(b, target);
        targetYaw = this.benchYaw(b);
      }
      const wk = (now - b.walkAt) / WALK_MS;
      let pose: Pose;
      const walking = wk < 1;
      if (walking) {
        const k = ease(wk);
        b.pos.lerpVectors(b.from, target, k);
        const dir = this.tmp2.subVectors(target, b.from);
        const heading = Math.atan2(-dir.x, -dir.z);
        b.yaw = wk < 0.2 ? lerpAngle(b.fromYaw, heading, wk / 0.2) : wk > 0.8 ? lerpAngle(heading, targetYaw, (wk - 0.8) / 0.2) : heading;
        pose = walkPose(T * 1.1, Math.sin(Math.min(1, wk) * Math.PI) * 1.3);
      } else if (want === "bench") {
        b.pos.copy(target);
        b.yaw = targetYaw;
        const cheer = now < b.cheerUntil ? b.cheer : 0;
        pose = sitPose(T, cheer, b.seed);
      } else {
        b.yaw = 0;
        pose = this.throwerPose(b, now, target);
      }
      const seatY = want === "bench" && !walking ? this.benchHeight() : 0;
      b.model.group.position.set(b.pos.x, b.pos.y + seatY, b.pos.z);
      b.model.group.rotation.y = b.yaw;
      b.model.apply(pose);
      this.placeBall(b, now);
      if (b.bubble) {
        b.bubble.position.set(b.pos.x, b.pos.y + seatY + 1.95, b.pos.z);
        const left = b.bubbleUntil - now;
        b.bubble.material.opacity = Math.max(0, Math.min(1, left / 400));
        if (left <= 0) {
          this.scene.scene.remove(b.bubble);
          b.bubble.material.map?.dispose();
          b.bubble.material.dispose();
          b.bubble = null;
        }
      }
    }
    void dt;
  }

  private benchHeight(): number {
    return this.scene.benchSpots()[0]?.y ?? 0.45;
  }

  /** La posture du lanceur : en place, l'élan, le lâcher et le bras en l'air, puis sa réaction */
  private throwerPose(b: Bowler, now: number, spot: THREE.Vector3): Pose {
    const v = this.view!;
    const r = this.replay && this.replay.rec.id === b.info.id ? this.replay : null;
    if (r && now < r.t0) {
      // L'élan d'un bot (ou d'un joueur qu'on n'a pas vu s'élancer) : il avance, le bras part en arrière puis revient
      const k = 1 - (r.t0 - now) / WINDUP_MS;
      const arm = k < 0.2 ? -0.1 : k < 0.7 ? -0.1 - ((k - 0.2) / 0.5) * 1.6 : -1.7 + ((k - 0.7) / 0.3) * 2.0;
      b.pos.set(spot.x, 0, STANCE_Z - ease(Math.max(0, k)) * APPROACH_LEN);
      return blend(STAND, approachPose(Math.max(0, k), arm), Math.min(1, Math.max(0, k) * 5));
    }
    if (r) {
      // Après le lâcher : la fin de la glissade, le bras qui monte, puis la réaction quand les quilles sont tombées
      const ms = now - r.t0;
      b.pos.set(spot.x, 0, STANCE_Z - APPROACH_LEN);
      if (r.done) {
        const rec = r.rec;
        const cleared = rec.down.length === rec.rack.length;
        const kind = cleared
          ? b.info.look.dance
          : rec.gutter || rec.down.length === 0
            ? "rigole"
            : rec.rack.length === 10 && isSplit(rec.standing.map((p) => p.n))
              ? "rate"
              : "";
        const t = (ms - this.endMs(r) + 150) / 1000;
        const settle = followPose(1);
        return kind ? blend(settle, reactPose(kind, t), ease(t * 3)) : blend(settle, STAND, ease(t * 2));
      }
      return followPose(Math.min(1, ms / 500));
    }
    if (v.phase !== "aim") {
      b.pos.copy(spot);
      return STAND;
    }
    // Avant le lâcher : l'élan
    const mine = b.info.id === this.o.me;
    let step = 0;
    let arm = 0;
    let swinging = false;
    if (mine && this.drag?.mode === "swing") {
      swinging = true;
      arm = this.arm;
      step = this.backAt > 0 ? Math.min(0.9, (now - this.backAt) / 1500) : 0;
    } else if (mine && this.pending) {
      // Lancé, en attendant le serveur : la glissade finit
      swinging = true;
      arm = 0.6;
      step = 1;
    } else if (!mine && this.remote?.sw) {
      swinging = true;
      arm = this.remote.k * 2;
      step = Math.min(0.9, (now - this.remote.swAt) / 1500);
    }
    b.pos.set(spot.x, 0, STANCE_Z - ease(step) * APPROACH_LEN * 0.95);
    if (!swinging) return blend(STAND, walkPose(now / 1000, 0), 0);
    return blend(STAND, approachPose(step, arm), Math.min(1, step * 5 + Math.abs(arm) * 2));
  }

  /** La boule : dans la main du lanceur, sur la piste pendant le lancer, sur le retour de boules sinon */
  private placeBall(b: Bowler, now: number) {
    const ball = b.ball;
    const r = this.replay;
    if (r && r.rec.id === b.info.id && now < r.t0) {
      ball.group.visible = true;
      b.model.ballInHand(ball.r, ball.group.position);
      return;
    }
    if (r && r.rec.id === b.info.id) {
      const w = r.world.ball;
      ball.group.visible = !w.gone;
      // Juste après le lâcher, la boule passe de la main à la piste
      const ms = now - r.t0;
      const k = Math.min(1, ms / 90);
      if (k < 1) {
        b.model.ballInHand(ball.r, this.tmp2);
        ball.group.position.lerpVectors(this.tmp2, this.tmp.set(w.px, w.py, w.pz), k);
      } else ball.group.position.set(w.px, w.py, w.pz);
      ball.spin.quaternion.set(w.qx, w.qy, w.qz, w.qw);
      return;
    }
    const v = this.view!;
    if (b.where === "lane" && v.phase === "aim") {
      ball.group.visible = true;
      b.model.ballInHand(ball.r, ball.group.position);
      ball.spin.quaternion.identity();
      return;
    }
    ball.group.visible = false;
  }

  private updateArrow() {
    const v = this.view!;
    const thrower = v.players[v.turn];
    const show =
      v.phase === "aim" && thrower !== undefined && (thrower.id === this.o.me ? this.drag?.mode !== "swing" : Boolean(this.remote));
    this.arrow.visible = show;
    if (!show) return;
    const x = thrower!.id === this.o.me ? this.stanceX : this.remote!.x;
    const d = thrower!.id === this.o.me ? this.aimD : this.remote!.d;
    const len = 5;
    this.arrow.position.set(x + d * (0.4 + len / 2), 0.003, -0.4 - len / 2);
    this.arrow.rotation.set(-Math.PI / 2, 0, -Math.atan(d));
  }

  // -------------------------------------------------------------------------
  // La caméra
  // -------------------------------------------------------------------------

  private updateCamera(now: number, dt: number) {
    const v = this.view!;
    const cam = this.scene.camera;
    const pos = this.tmp.set(0, 1.6, 6);
    const look = this.tmp2.set(0, 0.4, -10);
    let speed = 3;
    let shot = "aim";
    const r = this.replay;
    const thrower = v.players[v.turn];
    const tb = thrower ? this.bowlers.get(thrower.id) : null;
    if (v.phase === "intro") {
      // La salle : on arrive du fond, au-dessus de la banquette, vers l'élan
      const k = ease((now - this.aimAt) / 3800);
      pos.set(3.2 - 3 * k, 3.1 - 1.5 * k, 9.5 - 5.2 * k);
      look.set(0, 0.4 + 0.5 * (1 - k), -12);
      speed = 6;
    } else if (r && v.phase !== "over" && now >= r.t0) {
      const w = r.world.ball;
      const ms = now - r.t0;
      const bx = w.gone ? 0 : w.px;
      const bz = w.gone ? -18.5 : w.pz;
      if (r.done && ms > this.endMs(r) + 250) {
        // La réaction : face au lanceur, la banquette derrière lui
        const b = this.bowlers.get(r.rec.id);
        const p = b?.pos ?? this.tmp.set(0, 0, 0.4);
        pos.set(p.x * 0.6 + 0.3, 1.55, p.z - 2.5);
        look.set(p.x, 1.05, p.z + 0.6);
        speed = 2.2;
        shot = "react";
      } else if (r.slow && r.world.step >= r.slowFrom - 30 && r.world.step < r.slowFrom + SLOW_STEPS + 120) {
        // Le ralenti du strike : basse, de trois quarts, tout près des quilles
        const side = r.rec.t.s >= 0 ? -1 : 1;
        pos.set(side * 0.42, 0.36, -16.75);
        look.set(-side * 0.05, 0.2, -18.7);
        speed = 7;
        shot = "slow";
      } else {
        // Derrière la boule, puis on s'arrête un peu avant les quilles
        const z = Math.max(bz + 2.7, -15.2);
        pos.set(bx * 0.55, 0.55 + Math.max(0, (bz + 15) * -0.02), z);
        look.set(bx * 0.35, 0.18, Math.max(bz - 4.5, -18.7));
        speed = 4.5;
        shot = "follow";
      }
    } else if (v.phase === "over") {
      pos.set(0.6, 2.2, 7.8);
      look.set(0, 0.9, 2);
      speed = 1.2;
    } else if (tb) {
      // Derrière le lanceur, la piste et les quilles devant
      // Derrière lui, un peu au-dessus et du côté de la main libre : sa tête ne cache pas la piste
      const p = tb.pos;
      const side = tb.info.look.left ? -1 : 1;
      const swing = tb.info.id === this.o.me ? (this.drag?.mode === "swing" ? 1 : 0) : this.remote?.sw ? 1 : 0;
      pos.set(p.x - 0.4 * side, 2.2 + swing * 0.05, p.z + 3.1 + swing * 0.2);
      look.set(p.x * 0.4 + 0.12 * side, 0.2, -14.5);
      speed = 3;
    }
    // Le ralenti et la réaction : on coupe net, comme à la télévision
    if (shot !== this.shot && (shot === "slow" || shot === "react" || this.shot === "slow" || this.shot === "react")) this.camReady = false;
    this.shot = shot;
    if (!this.camReady) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.camReady = true;
    }
    const k = 1 - Math.exp(-dt * speed);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }

  // -------------------------------------------------------------------------
  // Le geste
  // -------------------------------------------------------------------------

  private myTurnNow(): boolean {
    return this.canThrow(performance.now());
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (!this.myTurnNow() || this.drag) return;
    const rect = this.scene.renderer.domElement.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    let mode: "swing" | "move" | "aim" = "aim";
    if (y > 0.5 && Math.abs(x - 0.5) < 0.2) mode = "swing";
    else if (y > 0.5) mode = "move";
    this.drag = { mode, x: e.clientX, y: e.clientY, id: e.pointerId, x0: this.stanceX, d0: this.aimD };
    if (mode === "swing") {
      this.samples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
      this.backAt = 0;
      this.arm = 0;
    }
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // Un pointeur qui n'existe plus (ou simulé) : on suit quand même le geste sur la fenêtre
    }
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const rect = this.scene.renderer.domElement.getBoundingClientRect();
    const h = rect.height;
    if (d.mode === "move") {
      this.stanceX = clamp(d.x0 + ((e.clientX - d.x) / rect.width) * 1.6, -X_MAX, X_MAX);
    } else if (d.mode === "aim") {
      this.aimD = clamp(d.d0 + ((e.clientX - d.x) / rect.width) * 0.06, -0.045, 0.045);
    } else {
      const list = e.getCoalescedEvents?.();
      for (const c of list && list.length > 0 ? list : [e]) this.samples.push({ t: c.timeStamp, x: c.clientX, y: c.clientY });
      if (this.samples.length > 400) this.samples.splice(0, this.samples.length - 400);
      this.arm = armAngle(this.samples[0]!, this.samples[this.samples.length - 1]!, h);
      if (this.backAt === 0 && this.arm < -0.35) this.backAt = performance.now();
    }
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (d.mode !== "swing") return;
    const rect = this.scene.renderer.domElement.getBoundingClientRect();
    this.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    const r = release(this.samples, rect.height);
    this.samples = [];
    if (typeof r === "string") {
      this.arm = 0;
      this.backAt = 0;
      this.o.onGesture?.(r);
      return;
    }
    this.throwBall(r);
  };

  private onCancel = (e: PointerEvent) => {
    if (this.drag?.id === e.pointerId) this.cancelSwing();
  };

  private cancelSwing() {
    this.drag = null;
    this.samples = [];
    this.arm = 0;
    this.backAt = 0;
  }

  private throwBall(r: Release) {
    const v = this.view!;
    const t = cleanThrow({ x: this.stanceX, d: clamp(this.aimD + r.dev, -DIR_MAX, DIR_MAX), v: r.v, s: r.s });
    if (!t) return;
    const at = performance.now();
    const n = v.throws;
    this.pending = { n, t, at };
    this.o.onGesture?.({ ...r, t });
    // La boule part tout de suite chez soi : le serveur confirmera le même lancer
    const thrower = v.players[v.turn]!;
    const rec: ThrowRecord = {
      n: v.throws + 1,
      id: thrower.id,
      frame: v.frame,
      ball: v.ball,
      t,
      rack: v.rack.map((p) => ({ ...p })),
      down: [],
      standing: [],
      gutter: false,
      steps: MAX_STEPS,
      firstHit: -1,
      decided: MAX_STEPS,
      at: this.o.serverNow(),
      until: 0,
      auto: false,
    };
    this.startReplay(rec, at);
    this.arm = 0;
    // Le serveur après : sa réponse (même immédiate) retrouve le lancer déjà parti
    this.o.onThrow(n, t);
  }

  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    this.keys.add(e.key);
    if (!this.myTurnNow()) return;
    if (e.key === "ArrowLeft") this.stanceX = clamp(this.stanceX - 0.027, -X_MAX, X_MAX);
    else if (e.key === "ArrowRight") this.stanceX = clamp(this.stanceX + 0.027, -X_MAX, X_MAX);
    else if (e.key === "q" || e.key === "a") this.aimD = clamp(this.aimD - 0.002, -0.045, 0.045);
    else if (e.key === "d") this.aimD = clamp(this.aimD + 0.002, -0.045, 0.045);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key);
  };

  private sendPose(now: number) {
    const v = this.view!;
    if (v.phase !== "aim" || v.players[v.turn]?.id !== this.o.me || this.pending) return;
    if (now - this.lastPose < 66) return;
    const sw = this.drag?.mode === "swing";
    const p: BowlingPose = { x: round3(this.stanceX), d: round3(this.aimD * 100) / 100, k: round3(this.arm / 2), sw };
    const key = JSON.stringify(p);
    if (key === this.lastPoseKey && now - this.lastPose < 1000) return;
    this.lastPose = now;
    this.lastPoseKey = key;
    this.o.onPose(p);
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.max(0, Math.min(1, k));
}

/** Les chevrons de la flèche de visée */
function arrowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 32, 512);
  for (let y = 0; y < 512; y += 40) {
    const a = 0.25 + (1 - y / 512) * 0.65;
    g.fillStyle = `rgba(255,236,170,${a})`;
    g.beginPath();
    g.moveTo(16, y);
    g.lineTo(30, y + 18);
    g.lineTo(24, y + 22);
    g.lineTo(16, y + 12);
    g.lineTo(8, y + 22);
    g.lineTo(2, y + 18);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Une bulle de réaction (un emoji) au-dessus d'un personnage */
function bubbleSprite(emoji: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.beginPath();
  g.arc(64, 58, 50, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(52, 100);
  g.lineTo(64, 124);
  g.lineTo(74, 100);
  g.fill();
  g.font = "60px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, 64, 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(0.45, 0.45, 0.45);
  s.renderOrder = 20;
  return s;
}
