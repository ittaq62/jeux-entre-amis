// Le jeu à l'écran : la table dans sa salle, la visée (on tourne la queue autour de la blanche, on la recule pour doser
// la force, on choisit le point de frappe), et chaque coup rejoué avec la même physique que le serveur, au bit près : les
// chocs font leur bruit, les billes tombent dans les filets, un beau coup repasse au ralenti. La caméra se met derrière
// la blanche pour viser, s'élève pour suivre le coup, descend au ras du tapis pour le ralenti.

import * as THREE from "three";
import type { AvatarConfig } from "../../shared/avatar.ts";
import { castAim } from "../../shared/games/billard/aim.ts";
import {
  cueOf,
  legalTargets,
  mustCall,
  REPLAY_AFTER_S,
  REPLAY_BEFORE_S,
  REPLAY_RATE,
  rigFor,
  type ShotRecord,
} from "../../shared/games/billard/match.ts";
import type { BillardAim, BillardView } from "../../shared/games/billard/net.ts";
import { DT, HZ, type PhysEvent, type World } from "../../shared/games/billard/physics.ts";
import { maxSpeed, playbackRate, startShot, type BallSpot, type Rig, type ShotParams } from "../../shared/games/billard/shot.ts";
import { AimLines } from "./scene/aimLines.ts";
import { CUE_TILT } from "./scene/cue.ts";
import { TablePeople, type CueAt } from "./scene/people.ts";
import { TableScene, TOUCH } from "./scene/TableScene.ts";

export interface PlayerInfo {
  id: string;
  name: string;
  cue: string;
  fx: string;
  /** Son personnage (sans lui, pas de joueur autour de la table) */
  avatar?: AvatarConfig;
  /** La couleur de son nœud papillon */
  accent?: string;
}

export type ViewMode = "queue" | "dessus";

export interface HudState {
  /** C'est à moi de jouer, et je peux (rien ne roule) */
  canShoot: boolean;
  inHand: boolean;
  /** Je pose la bille en main */
  placing: boolean;
  /** La queue reculée (0 à 1), le point de frappe */
  pull: number;
  tip: { a: number; b: number };
  mustCall: boolean;
  call: number | null;
  /** La bille visée est une bonne bille */
  legal: boolean;
  mode: ViewMode;
  /** Un ralenti passe */
  slow: boolean;
  fps: number;
}

/** Un moment d'un coup, pour le son et l'écran */
export type Moment =
  | { k: "strike"; id: string; p: number; mine: boolean }
  | { k: "result"; rec: ShotRecord }
  | { k: "slow"; on: boolean }
  /** Une nouvelle manche : on remplit le triangle */
  | { k: "rack" };

export interface RuntimeOptions {
  me: string | null;
  serverNow: () => number;
  onShot: (n: number, shot: ShotParams, place: { x: number; y: number } | null, call: number | null) => void;
  onAim: (a: BillardAim) => void;
  onHud: (h: HudState) => void;
  /** Un choc de la physique (son volume selon la distance à la caméra) */
  onPhys?: (e: PhysEvent, volume: number) => void;
  onMoment?: (m: Moment) => void;
  /** Ça roule : la vitesse de la bille la plus rapide (pour le grondement) */
  onRoll?: (speed: number) => void;
}

interface Replay {
  rec: ShotRecord;
  world: World;
  /** Le moment (horloge de l'appareil, en secondes) de la frappe */
  t0: number;
  stage: "windup" | "roll" | "pause" | "slow" | "end";
  stageAt: number;
  acc: number;
  /** Le temps déjà montré depuis la frappe (pour rattraper un onglet resté en arrière-plan) */
  played: number;
  seen: number;
  /** Le coup que je viens de jouer, avant que le serveur ne le confirme */
  local: boolean;
  /** Le ralenti : son monde, ses pas */
  slowWorld: World | null;
  slowTo: number;
  /** La direction de la queue avant la visée de ce coup (pour l'élan d'un bot) */
  fromAngle: number;
}

const now = () => performance.now() / 1000;
const lerpAngle = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

/** La course de la queue, reculée à fond */
const PULL_MAX = 0.26;

export class BillardRuntime {
  readonly scene: TableScene;
  private view: BillardView | null = null;
  private rig: Rig | null = null;
  private players = new Map<string, PlayerInfo>();
  private lines: AimLines | null = null;
  private raf = 0;
  private last = now();
  private disposed = false;
  private paused = false;
  private introHeld = false;
  private introAt = -1;
  private replay: Replay | null = null;
  private pending: { n: number; at: number } | null = null;
  private shownShot = 0;
  private rackNo = -1;
  /** Ma visée */
  private angle = 0;
  private angleFor = "";
  private tip = { a: 0, b: 0 };
  private pull = 0;
  private place: { x: number; y: number } | null = null;
  private call: number | null = null;
  private userCall = false;
  private mode: ViewMode = "queue";
  private drag: { kind: "aim" | "place"; x: number; y: number; id: number; moved: boolean; a0: number; lastX: number } | null = null;
  private pinch: { d: number; zoom: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private zoom = 1;
  private lastAimSent = 0;
  private lastAimKey = "";
  /** La visée de celui qui joue, quand ce n'est pas moi */
  private remote: (BillardAim & { at: number }) | null = null;
  private remoteAngle = 0;
  // La caméra
  private camPos = new THREE.Vector3(-3, 1.5, 2);
  private camLook = new THREE.Vector3(0, 0, 0);
  private camReady = false;
  private netCount = new Map<number, number>();
  private netOf = new Map<number, number>();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmp = new THREE.Vector3();
  private hudKey = "";
  private cueAnim: { strikeAt: number; from: number; dirX: number; dirY: number; cx: number; cy: number; a: number; b: number } | null =
    null;
  /** Les joueurs autour de la table */
  private people: TablePeople;
  /** La queue à la table telle qu'on la montre, et là où elle sera (pendant qu'il y va) */
  private tableCue: CueAt | null = null;
  private aimCue: CueAt | null = null;

  constructor(
    host: HTMLElement,
    private o: RuntimeOptions,
  ) {
    this.scene = new TableScene(host);
    this.people = new TablePeople(this.scene.scene);
    const el = this.scene.renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    try {
      const m = localStorage.getItem("billard-vue");
      if (m === "dessus" || m === "queue") this.mode = m;
    } catch {
      // pas de stockage
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  // -------------------------------------------------------------------------
  // Ce que le jeu lui dit
  // -------------------------------------------------------------------------

  setPlayers(list: PlayerInfo[]) {
    this.players = new Map(list.map((p) => [p.id, p]));
    this.people.setPeople(
      list.flatMap((p) => (p.avatar ? [{ id: p.id, avatar: p.avatar, cue: p.cue, accent: p.accent ?? "#7a1a22" }] : [])),
    );
  }

  setView(v: BillardView) {
    const first = !this.view;
    this.view = v;
    const rig = rigFor(v.cfg);
    this.rig = rig;
    const ids =
      v.cfg.variant === "carambole"
        ? [0, 1, 2]
        : v.cfg.variant === "neuf"
          ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
          : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    this.scene.setup(v.salle, rig.table, v.dress, ids);
    this.people.setTable(rig.table, this.scene.salle?.spots ?? []);
    if (!this.lines) {
      const t = rig.table;
      this.lines = new AimLines(t.R, t.pockets, t.kind === "poches" ? { x0: -t.lx, x1: t.head, y: t.ly } : null);
      this.scene.overlay.add(this.lines.group);
    }
    if (v.rackNo !== this.rackNo) {
      if (this.rackNo >= 0 && v.rackNo > this.rackNo) this.o.onMoment?.({ k: "rack" });
      this.rackNo = v.rackNo;
      this.netCount.clear();
      this.netOf.clear();
      this.scene.balls?.resetSpin();
    }
    // Un nouveau coup à montrer
    const rec = v.last;
    if (rec && rec.n !== this.shownShot && (v.phase === "shot" || v.phase === "rack" || v.phase === "over" || this.pending)) {
      this.shownShot = rec.n;
      if (this.replay?.local && this.pending && rec.n === this.pending.n + 1) {
        // Mon coup, que je montre déjà : le serveur le confirme (le même, au bit près)
        this.replay.rec = rec;
        this.replay.local = false;
      } else this.startReplay(rec, first);
      this.pending = null;
    }
    // Le tour change : la visée repart vers la meilleure bille
    const key = `${v.shots}:${v.shooter}:${v.phase}`;
    if (key !== this.angleFor && v.phase === "aim") {
      this.angleFor = key;
      this.place = null;
      this.pull = 0;
      this.call = null;
      this.userCall = false;
      if (v.shooter !== this.o.me) this.remote = null;
      const t = this.defaultAngle();
      if (t !== null && (v.shooter !== this.o.me || !this.lastShooterWasMe(v))) this.angle = t;
      if (v.shooter !== this.o.me && t !== null) this.remoteAngle = t;
      this.tip = { a: 0, b: 0 };
    }
    if (!this.replay) this.showBalls();
  }

  private lastShooterWasMe(v: BillardView) {
    return v.last?.id === this.o.me && v.shooter === this.o.me;
  }

  /** La visée de celui qui joue (reçue du serveur) */
  remoteAim(id: string, a: BillardAim) {
    if (!this.view || id !== this.view.shooter || id === this.o.me) return;
    this.remote = { ...a, at: now() };
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  /** Pendant le chargement de chacun, la présentation de la salle attend */
  holdIntro(held: boolean) {
    this.introHeld = held;
    if (!held && this.introAt < 0) this.introAt = now();
  }

  prepare(onProgress?: (share: number) => void) {
    return this.scene.prepare(onProgress);
  }

  setTip(a: number, b: number) {
    this.tip = { a, b };
    this.pushHud(true);
  }

  /** La queue reculée de k (0 à 1), par la réglette */
  setPull(k: number) {
    if (!this.canShoot()) return;
    this.pull = Math.max(0, Math.min(1, k));
  }

  /** On lâche la réglette : le coup part (ou rien, si la queue n'est presque pas reculée) */
  release() {
    if (!this.canShoot() || !this.view || !this.rig) return;
    const p = this.pull;
    if (p < 0.03) {
      this.pull = 0;
      return;
    }
    const v = this.view;
    const cueId = this.myCue();
    const start = this.ballsNow();
    const cue = start.find((b) => b.id === cueId);
    if (!cue) return;
    const shot: ShotParams = { dx: Math.cos(this.angle), dy: Math.sin(this.angle), p, a: this.tip.a, b: this.tip.b };
    const place = v.inHand ? { x: cue.x, y: cue.y } : null;
    const call = mustCall({ ...v, rng: 0 }) ? this.call : null;
    this.o.onShot(v.shots, shot, place, call);
    this.pending = { n: v.shots, at: now() };
    // Je montre mon coup tout de suite, avec la même physique : le serveur trouvera le même
    const rec: ShotRecord = {
      n: v.shots + 1,
      id: this.o.me!,
      side: v.turn,
      cue: cueId,
      place,
      call,
      shot,
      breakShot: v.breakShot,
      start,
      end: start,
      pocketed: [],
      steps: 0,
      outcome: { foul: null, keep: false, text: "", tone: "info", inHand: null, respot: [], scored: 0 },
      at: this.o.serverNow(),
      until: Infinity,
      auto: false,
    };
    this.startReplay(rec, false, true);
    this.pull = 0;
  }

  /** Tourner la visée d'un rien (la molette de précision) */
  nudge(d: number) {
    if (!this.canShoot()) return;
    this.angle += d;
    if (!this.userCall) this.call = null;
  }

  toggleView() {
    this.mode = this.mode === "queue" ? "dessus" : "queue";
    try {
      localStorage.setItem("billard-vue", this.mode);
    } catch {
      // pas de stockage
    }
    this.pushHud(true);
  }

  setCall(pocket: number) {
    this.call = pocket;
    this.userCall = true;
    this.pushHud(true);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const el = this.scene.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    el.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKey);
    this.lines?.dispose();
    this.people.dispose();
    this.scene.dispose();
  }

  // -------------------------------------------------------------------------
  // L'état
  // -------------------------------------------------------------------------

  private myCue(): number {
    const v = this.view!;
    const p = v.players.find((x) => x.id === v.shooter);
    return p ? cueOf(v, p) : 0;
  }

  private canShoot(): boolean {
    const v = this.view;
    return Boolean(v && this.o.me && v.phase === "aim" && v.shooter === this.o.me && !this.replay && !this.pending && !this.paused);
  }

  /** Les billes sur le tapis, comme on les montre (la bille en main posée là où je l'ai mise) */
  private ballsNow(): BallSpot[] {
    const v = this.view!;
    const cue = this.myCue();
    const spot =
      v.shooter === this.o.me ? this.place : this.remote && this.remote.px !== undefined ? { x: this.remote.px, y: this.remote.py! } : null;
    return v.balls.map((b) => (b.id === cue && v.inHand && spot ? { id: b.id, x: spot.x, y: spot.y } : { ...b }));
  }

  /** La direction vers la bille à viser la plus simple : plein dans la plus proche des bonnes billes */
  private defaultAngle(): number | null {
    const v = this.view!;
    const balls = this.ballsNow();
    const cue = balls.find((b) => b.id === this.myCue());
    if (!cue) return null;
    const targets = legalTargets({ ...v, rng: 0 });
    let best: BallSpot | null = null;
    let bd = Infinity;
    for (const b of balls) {
      if (!targets.includes(b.id)) continue;
      const d = Math.hypot(b.x - cue.x, b.y - cue.y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (v.breakShot && v.cfg.variant !== "carambole") {
      const objs = balls.filter((b) => b.id !== cue.id);
      if (objs.length) best = objs.reduce((a, b) => (b.x < a.x ? b : a));
    }
    return best ? Math.atan2(best.y - cue.y, best.x - cue.x) : null;
  }

  private showBalls() {
    const v = this.view;
    const set = this.scene.balls;
    if (!v || !set) return;
    const balls = this.ballsNow();
    const on = new Set(balls.map((b) => b.id));
    for (const b of balls) set.place(b.id, b.x, b.y);
    // Celles qui ne sont plus sur le tapis : au fond d'un filet (ou cachées à la carambole)
    for (const id of set.balls.keys()) {
      if (on.has(id)) continue;
      if (v.cfg.variant === "carambole" || id === 0) {
        set.hide(id);
        continue;
      }
      if (!this.netOf.has(id)) this.toNet(id, id % 6, false);
    }
  }

  /** Une bille tombée va au fond du filet de sa poche (elle y tombe si `animate`) */
  private toNet(id: number, pocket: number, animate: boolean) {
    const t = this.scene.table;
    const set = this.scene.balls;
    if (!t || !set || pocket < 0 || pocket >= t.nets.length) {
      set?.hide(id);
      return;
    }
    const k = this.netCount.get(pocket) ?? 0;
    this.netCount.set(pocket, k + 1);
    this.netOf.set(id, pocket);
    const base = t.nets[pocket]!;
    const R = this.rig!.table.R;
    const ang = k * 2.2;
    const to = new THREE.Vector3(
      base.x + Math.cos(ang) * (k > 0 ? R * 1.05 : 0),
      base.y + Math.floor(k / 4) * R * 1.5,
      base.z + Math.sin(ang) * (k > 0 ? R * 1.05 : 0),
    );
    if (animate) set.dropInto(id, to, now());
    else {
      const b = set.balls.get(id)!;
      b.mesh.visible = true;
      b.shadow.visible = false;
      b.mesh.position.copy(to);
    }
  }

  // -------------------------------------------------------------------------
  // Les coups rejoués
  // -------------------------------------------------------------------------

  private startReplay(rec: ShotRecord, late: boolean, local = false) {
    if (!this.rig) return;
    const world = startShot(this.rig, rec.start, rec.cue, rec.shot);
    const t0 = local ? now() : now() + (rec.at - this.o.serverNow()) / 1000;
    const r: Replay = {
      rec,
      world,
      t0,
      stage: "windup",
      stageAt: now(),
      acc: 0,
      played: 0,
      seen: 0,
      local,
      slowWorld: null,
      slowTo: 0,
      fromAngle: this.view?.shooter === this.o.me ? this.angle : this.remoteAngle,
    };
    // Les billes repartent de là où le coup commence
    this.netOfReset(rec.start);
    // Arrivé en retard (une page rechargée) : on saute à la fin
    if (late && now() - t0 > (rec.steps / HZ) * 1.2 + 1) {
      r.stage = "end";
      this.replay = r;
      this.finishReplay(false);
      return;
    }
    this.replay = r;
    this.cueAnim = {
      strikeAt: t0,
      from: local ? Math.max(0.15, rec.shot.p) : 0,
      dirX: rec.shot.dx,
      dirY: rec.shot.dy,
      cx: rec.start.find((b) => b.id === rec.cue)?.x ?? 0,
      cy: rec.start.find((b) => b.id === rec.cue)?.y ?? 0,
      a: rec.shot.a,
      b: rec.shot.b,
    };
  }

  /** Les billes du début d'un coup : celles qui y sont sortent du filet */
  private netOfReset(start: readonly BallSpot[]) {
    for (const b of start) this.netOf.delete(b.id);
    const set = this.scene.balls;
    if (!set) return;
    for (const b of start) set.place(b.id, b.x, b.y);
  }

  private stepReplay(dt: number) {
    const r = this.replay!;
    const t = now();
    const set = this.scene.balls!;
    if (r.stage === "windup") {
      if (t < r.t0) return;
      r.stage = "roll";
      r.stageAt = t;
      this.o.onMoment?.({ k: "strike", id: r.rec.id, p: r.rec.shot.p, mine: r.rec.id === this.o.me });
    }
    if (r.stage === "roll") {
      // Un onglet resté en arrière-plan (ou un appareil qui rame) prend du retard : au-delà d'une demi-seconde, on
      // rattrape l'horloge d'un coup, sans les sons
      const lag = t - r.t0 - r.played - dt;
      const catchUp = lag > 0.5 ? lag : 0;
      r.played += dt + catchUp;
      r.acc += dt + catchUp;
      const w = r.world;
      let guard = 0;
      const limit = catchUp > 0 ? 40000 : 200;
      while (w.moving && guard++ < limit) {
        const need = DT / playbackRate(maxSpeed(w));
        if (r.acc < need) break;
        r.acc -= need;
        w.advance();
        if (catchUp === 0) for (const b of w.balls) if (b.on) set.spin(b.id, b.wx, b.wy, b.wz, DT);
      }
      this.flushEvents(r, catchUp === 0);
      for (const b of w.balls) if (b.on) set.place(b.id, b.x, b.y);
      this.o.onRoll?.(maxSpeed(w));
      if (!w.moving) {
        r.stage = "pause";
        r.stageAt = t;
        this.o.onRoll?.(0);
        // Le serveur a jugé le coup : on le montre (pour mon coup, quand sa réponse est arrivée)
        if (!r.local) this.result(r.rec);
      }
      return;
    }
    if (r.stage === "pause") {
      if (r.local) return; // j'attends que le serveur confirme mon coup
      if (t - r.stageAt < 0.7) return;
      const h = r.rec.outcome.highlight;
      if (h && !this.paused) {
        // Le ralenti : on rejoue le coup depuis le début jusqu'à un peu avant le moment clé, puis doucement
        const sw = startShot(this.rig!, r.rec.start, r.rec.cue, r.rec.shot);
        const from = Math.max(0, h.s - Math.round(REPLAY_BEFORE_S * HZ));
        while (sw.step < from && sw.moving) sw.advance();
        this.netOfReset(sw.balls.filter((b) => b.on).map((b) => ({ id: b.id, x: b.x, y: b.y })));
        for (const b of sw.balls) if (!b.on) set.hide(b.id);
        r.slowWorld = sw;
        r.slowTo = h.s + Math.round(REPLAY_AFTER_S * HZ);
        r.seen = sw.events.length;
        r.acc = 0;
        r.stage = "slow";
        r.stageAt = t;
        this.o.onMoment?.({ k: "slow", on: true });
        return;
      }
      this.finishReplay(true);
      return;
    }
    if (r.stage === "slow") {
      const w = r.slowWorld!;
      r.acc += dt * REPLAY_RATE;
      while (r.acc >= DT && w.step < r.slowTo && w.moving) {
        r.acc -= DT;
        w.advance();
        for (const b of w.balls) if (b.on) set.spin(b.id, b.wx, b.wy, b.wz, DT);
      }
      // Les chocs du ralenti : plus graves, pas de nouvelle bille au filet en double
      for (; r.seen < w.events.length; r.seen++) {
        const e = w.events[r.seen]!;
        this.o.onPhys?.({ ...e, v: e.v * 0.8 }, this.volumeAt(e.x, e.y) * 0.8);
        if (e.k === "poche") set.dropInto(e.a, this.netSpot(e.a, e.b), now());
      }
      for (const b of w.balls) if (b.on) set.place(b.id, b.x, b.y);
      if (w.step >= r.slowTo || !w.moving) {
        this.o.onMoment?.({ k: "slow", on: false });
        this.finishReplay(true);
      }
    }
  }

  /** Les chocs du coup qui viennent d'arriver : le son, les billes qui tombent */
  private flushEvents(r: Replay, sound: boolean) {
    const w = r.world;
    const set = this.scene.balls!;
    for (; r.seen < w.events.length; r.seen++) {
      const e = w.events[r.seen]!;
      if (sound) this.o.onPhys?.(e, this.volumeAt(e.x, e.y));
      if (e.k === "poche") {
        if (this.view?.cfg.variant === "carambole") set.hide(e.a);
        else this.toNet(e.a, e.b, true);
      } else if (e.k === "sortie") set.hide(e.a);
    }
  }

  /** Où la bille ira dans ce filet (sans la compter deux fois) */
  private netSpot(id: number, pocket: number): THREE.Vector3 {
    const t = this.scene.table!;
    const base = t.nets[Math.max(0, Math.min(t.nets.length - 1, pocket))] ?? new THREE.Vector3();
    void id;
    return base.clone();
  }

  private finishReplay(sound: boolean) {
    const r = this.replay!;
    void sound;
    this.replay = null;
    this.cueAnim = null;
    const set = this.scene.balls!;
    // Les billes à leur place de fin, comme le serveur les a trouvées
    for (const b of r.rec.end) set.place(b.id, b.x, b.y);
    for (const p of r.rec.pocketed)
      if (!this.netOf.has(p.id) && this.view?.cfg.variant !== "carambole" && p.id !== 0) this.toNet(p.id, p.pocket, false);
    for (const p of r.rec.pocketed) if (p.id === 0 || this.view?.cfg.variant === "carambole") set.hide(p.id);
    if (r.stage === "end") this.result(r.rec);
    if (this.view && this.view.phase !== "shot") this.showBalls();
  }

  /** Le coup est jugé : l'écran l'annonce, les joueurs réagissent */
  private result(rec: ShotRecord) {
    this.o.onMoment?.({ k: "result", rec });
    this.people.react(rec.id, rec.outcome.tone, now());
  }

  /** Le volume d'un choc selon sa distance à la caméra */
  private volumeAt(x: number, y: number): number {
    const d = this.scene.camera.position.distanceTo(this.tmp.set(x, 0, -y));
    return Math.max(0.15, Math.min(1, 1.6 / (0.6 + d)));
  }

  // -------------------------------------------------------------------------
  // La visée
  // -------------------------------------------------------------------------

  private pointerTable(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = this.scene.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.scene.camera);
    this.plane.constant = -(this.rig?.table.R ?? 0.028);
    const hit = this.ray.ray.intersectPlane(this.plane, this.tmp);
    return hit ? { x: hit.x, y: -hit.z } : null;
  }

  private onDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: this.zoom };
      this.drag = null;
      return;
    }
    if (!this.canShoot()) return;
    const v = this.view!;
    const p = this.pointerTable(e.clientX, e.clientY);
    const cue = this.ballsNow().find((b) => b.id === this.myCue());
    if (p && cue && v.inHand && Math.hypot(p.x - cue.x, p.y - cue.y) < this.rig!.table.R * (TOUCH ? 3.2 : 2.2)) {
      this.drag = { kind: "place", x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, a0: this.angle, lastX: e.clientX };
      return;
    }
    if (p && mustCall({ ...v, rng: 0 })) {
      const t = this.rig!.table;
      const i = t.pockets.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.09);
      if (i >= 0) {
        this.setCall(i);
        return;
      }
    }
    this.drag = { kind: "aim", x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, a0: this.angle, lastX: e.clientX };
  };

  private onMove = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.zoom = Math.max(0.45, Math.min(2.4, (this.pinch.zoom * this.pinch.d) / Math.max(20, d)));
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId || !this.canShoot()) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
    if (d.kind === "place") {
      const p = this.pointerTable(e.clientX, e.clientY);
      if (p && this.validPlace(p.x, p.y)) this.place = p;
      return;
    }
    if (!d.moved) return;
    if (this.mode === "dessus") {
      const p = this.pointerTable(e.clientX, e.clientY);
      const cue = this.ballsNow().find((b) => b.id === this.myCue());
      if (p && cue && Math.hypot(p.x - cue.x, p.y - cue.y) > 0.02) this.angle = Math.atan2(p.y - cue.y, p.x - cue.x);
    } else {
      // Tourner la queue : plus fin quand on bouge lentement (ou avec Maj)
      const step = e.clientX - d.lastX;
      const fine = e.shiftKey || Math.abs(step) < 2.5;
      const k = (TOUCH ? 0.0042 : 0.0032) * (fine ? 0.3 : 1);
      this.angle -= step * k;
    }
    d.lastX = e.clientX;
    if (!this.userCall) this.call = null;
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (d.kind !== "aim" || d.moved || !this.canShoot()) return;
    // Un simple appui : viser là (plein dans la bille touchée, s'il y en a une)
    const p = this.pointerTable(e.clientX, e.clientY);
    const balls = this.ballsNow();
    const cue = balls.find((b) => b.id === this.myCue());
    if (!p || !cue) return;
    const R = this.rig!.table.R;
    const hitBall = balls.find((b) => b.id !== cue.id && Math.hypot(b.x - p.x, b.y - p.y) < R * (TOUCH ? 2.2 : 1.4));
    const tx = hitBall ? hitBall.x : p.x,
      ty = hitBall ? hitBall.y : p.y;
    if (Math.hypot(tx - cue.x, ty - cue.y) > 0.02) this.angle = Math.atan2(ty - cue.y, tx - cue.x);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = Math.max(0.45, Math.min(2.4, this.zoom * (1 + e.deltaY * 0.0012)));
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.canShoot()) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return;
    const k = e.shiftKey ? 0.001 : 0.008;
    if (e.key === "ArrowLeft") this.angle += k;
    else if (e.key === "ArrowRight") this.angle -= k;
  };

  private validPlace(x: number, y: number): boolean {
    const v = this.view!;
    const t = this.rig!.table;
    if (Math.abs(x) > t.lx - t.R || Math.abs(y) > t.ly - t.R) return false;
    if (v.inHand === "tete" && x > t.head) return false;
    const cue = this.myCue();
    return v.balls.every((b) => b.id === cue || Math.hypot(b.x - x, b.y - y) >= 2 * t.R * 1.002);
  }

  // -------------------------------------------------------------------------
  // L'image
  // -------------------------------------------------------------------------

  private frame = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const t = now();
    const dt = Math.min(0.05, t - this.last);
    this.last = t;
    const v = this.view;
    if (!v || !this.rig) {
      this.scene.render(dt);
      return;
    }
    // Mon coup refusé par le serveur (ou perdu) : on revient à l'état de la table
    if (this.pending && t - this.pending.at > 2.5 && this.replay?.local) {
      this.pending = null;
      this.replay = null;
      this.cueAnim = null;
      this.showBalls();
    }
    if (this.replay && !this.paused) this.stepReplay(dt);
    this.scene.balls?.update(t);
    this.updateAim();
    this.updateCue(t);
    this.updateCamera(dt, t);
    this.updatePeople(t, dt);
    this.scene.render(dt);
    this.pushHud(false);
  };

  /** La visée affichée : la mienne, celle de celui qui joue, ou rien pendant un coup */
  private updateAim() {
    const v = this.view!;
    const lines = this.lines!;
    const aiming = v.phase === "aim" && !this.replay;
    const mine = aiming && v.shooter === this.o.me && !this.pending;
    if (!aiming) {
      lines.hide();
      lines.pockets(false, null);
      lines.kitchen(false);
      return;
    }
    if (!mine && this.remote) this.remoteAngle = lerpAngle(this.remoteAngle, Math.atan2(this.remote.dy, this.remote.dx), 0.35);
    const angle = mine ? this.angle : this.remoteAngle;
    const balls = this.ballsNow();
    if (!mine) this.showBalls();
    else if (this.place) this.scene.balls?.place(this.myCue(), this.place.x, this.place.y);
    const cue = balls.find((b) => b.id === this.myCue());
    if (!cue) {
      lines.hide();
      return;
    }
    const t = this.rig!.table;
    const dx = Math.cos(angle),
      dy = Math.sin(angle);
    // Vus de loin (de dessus, de côté), les traits s'épaississent pour rester lisibles
    lines.setScale(Math.max(1, Math.min(3.2, this.scene.camera.position.distanceTo(this.tmp.set(cue.x, 0, -cue.y)) / 0.85)));
    const hit = castAim(t, balls, cue.id, cue.x, cue.y, dx, dy);
    const targets = legalTargets({ ...v, rng: 0 });
    const legal = hit.ball < 0 ? true : targets.includes(hit.ball);
    const aide = v.cfg.aide;
    // Jusqu'où va la bille visée, avant la bande
    const toRail = (x: number, y: number, ux: number, uy: number) => {
      const lim = (lo: number, hi: number, p: number, u: number) => (u > 0 ? (hi - p) / u : u < 0 ? (lo - p) / u : Infinity);
      return Math.max(0, Math.min(lim(-t.lx + t.R, t.lx - t.R, x, ux), lim(-t.ly + t.R, t.ly - t.R, y, uy)));
    };
    const objLen = hit.ball >= 0 ? Math.min(0.55, toRail(hit.gx + hit.ox * 2 * t.R, hit.gy + hit.oy * 2 * t.R, hit.ox, hit.oy) + 0.05) : 0;
    lines.show({
      cx: cue.x,
      cy: cue.y,
      gx: hit.gx,
      gy: hit.gy,
      ball: hit.ball >= 0,
      ox: hit.ox,
      oy: hit.oy,
      objLen,
      tx: hit.tx,
      ty: hit.ty,
      cueLen: hit.ball >= 0 ? 0.22 * (1 - Math.abs(hit.full)) : 0,
      bounceLen: 0.3,
      legal,
      level: mine || aide !== "aucune" ? aide : "aucune",
      R: t.R,
    });
    // La poche annoncée pour la noire : celle vers laquelle part la bille visée, sauf si on en a choisi une
    const calling = mustCall({ ...v, rng: 0 });
    if (calling && mine && !this.userCall && hit.ball === 8) {
      let best = -1,
        bc = 0.9;
      t.pockets.forEach((p, i) => {
        const ux = p.ox - (hit.gx + hit.ox * 2 * t.R),
          uy = p.oy - (hit.gy + hit.oy * 2 * t.R);
        const l = Math.hypot(ux, uy) || 1;
        const c = (ux * hit.ox + uy * hit.oy) / l;
        if (c > bc) {
          bc = c;
          best = i;
        }
      });
      this.call = best >= 0 ? best : null;
    }
    lines.pockets(calling && mine, this.call);
    lines.kitchen(mine && v.inHand === "tete");
    // Ma visée, envoyée aux autres (une dizaine de fois par seconde au plus)
    if (mine) {
      const key = `${angle.toFixed(4)}|${this.tip.a.toFixed(2)}|${this.tip.b.toFixed(2)}|${this.pull.toFixed(2)}|${this.place?.x.toFixed(3) ?? ""}|${this.place?.y.toFixed(3) ?? ""}`;
      const tt = now();
      if (key !== this.lastAimKey && tt - this.lastAimSent > 0.09) {
        this.lastAimKey = key;
        this.lastAimSent = tt;
        this.o.onAim({ dx, dy, a: this.tip.a, b: this.tip.b, k: this.pull, ...(this.place ? { px: this.place.x, py: this.place.y } : {}) });
      }
    }
  }

  /**
   * La queue de la table : derrière la blanche pendant la visée, puis le coup sec ; ensuite elle repart dans la main
   * du joueur, qui se relève avec (sans personnage, elle se retire et s'efface). Celle d'un autre n'y est qu'une fois
   * qu'il est arrivé à la table.
   */
  private updateCue(t: number) {
    const v = this.view!;
    const sc = this.scene;
    const cueStick = sc.cue;
    const R = this.rig!.table.R;
    const shooter = this.players.get(v.shooter);
    this.tableCue = null;
    this.aimCue = null;
    let dirX = 0,
      dirY = 0,
      cx = 0,
      cy = 0,
      back = 0,
      a = 0,
      b = 0;
    let hide = false;
    const anim = this.cueAnim;
    if (anim) {
      const owner = this.replay?.rec.id ?? v.shooter;
      cueStick.setStyle(this.players.get(owner)?.cue ?? "erable");
      const rec = this.replay?.rec;
      let pullK = anim.from;
      let ang = Math.atan2(anim.dirY, anim.dirX);
      if (t < anim.strikeAt) {
        // L'élan : la queue vient dans l'axe du coup, recule, puis part
        const left = anim.strikeAt - t;
        const span = Math.max(0.6, anim.strikeAt - (this.replay?.stageAt ?? t));
        const k = 1 - left / span;
        if (!this.replay?.local) {
          ang = lerpAngle(this.replay?.fromAngle ?? ang, ang, Math.min(1, k * 2.2));
          pullK = (rec?.shot.p ?? 0.5) * Math.min(1, Math.max(0, (k - 0.35) / 0.45));
        }
        back = R * 0.6 + pullK * PULL_MAX;
      } else {
        const since = t - anim.strikeAt;
        // Le coup sec : la queue avance en 70 ms et accompagne ; puis le joueur la reprend (ou elle se retire)
        if (since < 0.07) back = R * 0.6 + pullK * PULL_MAX * (1 - since / 0.07) * (1 - since / 0.07);
        else if (since < 0.2) back = -Math.min(0.05, (since - 0.07) * 0.5);
        else back = -0.05 + (since - 0.2) * 0.6;
        if ((since > 0.25 && this.people.has(owner)) || since > 0.9) {
          cueStick.visible = false;
          return;
        }
      }
      dirX = Math.cos(ang);
      dirY = Math.sin(ang);
      cx = anim.cx;
      cy = anim.cy;
      a = anim.a;
      b = anim.b;
    } else if (v.phase === "aim" && !this.replay) {
      const mine = v.shooter === this.o.me;
      if (!mine && !shooter) {
        cueStick.visible = false;
        return;
      }
      cueStick.setStyle(shooter?.cue ?? "erable");
      const angle = mine ? this.angle : this.remoteAngle;
      dirX = Math.cos(angle);
      dirY = Math.sin(angle);
      const cue = this.ballsNow().find((q) => q.id === this.myCue());
      if (!cue) {
        cueStick.visible = false;
        return;
      }
      cx = cue.x;
      cy = cue.y;
      const k = mine ? this.pull : (this.remote?.k ?? 0);
      // Au repos, la queue respire un peu : elle va et vient comme quand on se met en place
      const idle = k < 0.01 ? 0.012 * (1 + Math.sin(t * 2.4)) : 0;
      back = R * 0.6 + k * PULL_MAX + idle;
      a = mine ? this.tip.a : (this.remote?.a ?? 0);
      b = mine ? this.tip.b : (this.remote?.b ?? 0);
      // Celui qui joue n'est pas encore à la table : sa queue est encore dans sa main
      if (!mine && this.people.has(v.shooter) && !this.people.ready(v.shooter)) hide = true;
    } else {
      cueStick.visible = false;
      return;
    }
    // La pointe : derrière la blanche, face au point de frappe (à droite : le côté droit de la direction)
    const rx = dirY,
      ry = -dirX;
    const off = R * 0.5;
    const px = cx - dirX * (R + back) + rx * a * off;
    const py = cy - dirY * (R + back) + ry * a * off;
    const h = R + b * off + Math.tan(CUE_TILT) * back;
    const c = Math.cos(CUE_TILT),
      s = Math.sin(CUE_TILT);
    const at: CueAt = {
      tip: new THREE.Vector3(px, h, -py),
      back: new THREE.Vector3(-dirX * c, s, dirY * c),
      drawn: back - R * 0.6,
    };
    this.aimCue = at;
    if (hide) {
      cueStick.visible = false;
      return;
    }
    this.tableCue = at;
    cueStick.visible = true;
    sc.cue.pose(at.tip, dirX, -dirY);
  }

  /** Les joueurs autour de la table : qui joue, où est sa queue, ce que tout le monde regarde */
  private updatePeople(t: number, dt: number) {
    const v = this.view!;
    const r = this.replay;
    const shooter = r ? r.rec.id : v.phase === "aim" ? v.shooter : null;
    const anim = this.cueAnim;
    const sinceStrike = r && anim && t >= anim.strikeAt ? t - anim.strikeAt : null;
    const look = this.tmp;
    const w = r ? (r.stage === "slow" && r.slowWorld ? r.slowWorld : r.world) : null;
    let n = 0;
    look.set(0, 0, 0);
    if (w && sinceStrike !== null) {
      for (const b of w.balls) {
        if (!b.on || b.vx * b.vx + b.vy * b.vy < 0.0004) continue;
        look.x += b.x;
        look.z -= b.y;
        n++;
      }
    }
    if (n) look.multiplyScalar(1 / n);
    else {
      const cue = (w ? w.balls.filter((b) => b.on).map((b) => ({ id: b.id, x: b.x, y: b.y })) : this.ballsNow()).find(
        (b) => b.id === (r ? r.rec.cue : this.myCue()),
      );
      if (cue) look.set(cue.x, 0, -cue.y);
    }
    look.y = this.rig!.table.R;
    this.people.update({
      t,
      dt,
      shooter,
      cue: this.tableCue,
      aim: this.aimCue,
      sinceStrike,
      look: look.clone(),
      camera: this.scene.camera.position,
      mine: shooter !== null && shooter === this.o.me,
    });
  }

  private updateCamera(dt: number, t: number) {
    const v = this.view!;
    const cam = this.scene.camera;
    const tbl = this.rig!.table;
    const salle = this.scene.salle;
    const balls = this.ballsNow();
    const cue = balls.find((b) => b.id === this.myCue()) ?? { x: tbl.head, y: 0 };
    const portrait = cam.aspect < 1;
    let pos = new THREE.Vector3(),
      look = new THREE.Vector3();
    let rate = 3.2;
    const r = this.replay;
    const top = () => {
      // Au-dessus de la table, assez haut pour la voir entière ; en portrait, la table en long dans l'écran
      const h = portrait ? 3.55 : 2.6;
      pos.set(0, h, portrait ? 0.001 : 0.9);
      look.set(0, 0, 0);
      if (portrait) cam.up.set(-1, 0, 0);
    };
    cam.up.set(0, 1, 0);
    if (v.phase === "intro" && salle) {
      const s = this.introAt < 0 || this.introHeld ? 0 : Math.min(1, (t - this.introAt) / 4.2);
      const e = s * s * (3 - 2 * s);
      const end = this.aimPose(cue, this.angle, portrait);
      pos.copy(salle.intro.from).lerp(end.pos, e);
      pos.y += Math.sin(e * Math.PI) * 0.5;
      look.copy(salle.intro.look).lerp(end.look, e);
      rate = 8;
    } else if (r && r.stage === "slow" && r.rec.outcome.highlight) {
      // Le ralenti : au ras du tapis, près du moment clé, qui tourne doucement
      const h = r.rec.outcome.highlight;
      const ang = Math.atan2(h.y, h.x) + Math.PI * 0.85 + (t - r.stageAt) * 0.12;
      pos.set(h.x + Math.cos(ang) * 0.55, 0.16, -(h.y + Math.sin(ang) * 0.55));
      look.set(h.x, 0.02, -h.y);
      rate = r.stageAt + 0.05 > t ? 60 : 2.5;
    } else if (r && (r.stage === "roll" || r.stage === "pause")) {
      // Le coup : la caméra s'élève derrière celui qui joue et suit les billes qui bougent
      if (this.mode === "dessus") top();
      else {
        let sx = 0,
          sy = 0,
          n = 0;
        for (const b of r.world.balls) {
          if (!b.on) continue;
          const sp = b.vx * b.vx + b.vy * b.vy;
          if (sp < 0.0004) continue;
          sx += b.x;
          sy += b.y;
          n++;
        }
        const c0 = r.rec.start.find((b) => b.id === r.rec.cue)!;
        const cxm = n ? sx / n : c0.x,
          cym = n ? sy / n : c0.y;
        // Derrière celui qui joue, sous les abat-jour, et assez loin pour voir le coup entier
        const d = Math.atan2(r.rec.shot.dy, r.rec.shot.dx);
        const [bxMax, byMax] = salle?.camBox ?? [3.2, 2.4];
        const bx = Math.max(-bxMax, Math.min(bxMax, c0.x - Math.cos(d) * 1.25)),
          by = Math.max(-byMax, Math.min(byMax, c0.y - Math.sin(d) * 1.25));
        pos.set(bx, 0.78, -by);
        look.set((c0.x + cxm) / 2, 0, -(c0.y + cym) / 2);
        rate = 1.4;
      }
    } else if (v.phase === "rack" || v.phase === "over") {
      const ang = t * 0.1;
      pos.set(Math.cos(ang) * 2.8, 1.7, Math.sin(ang) * 2.2);
      look.set(0, -0.1, 0);
      rate = 1.2;
    } else if (r && r.stage === "windup") {
      const ang = Math.atan2(r.rec.shot.dy, r.rec.shot.dx);
      const p = (r.rec.id !== this.o.me && this.watchPose(r.rec.id, cue, ang, portrait)) || this.aimPose(cue, ang, portrait);
      pos = p.pos;
      look = p.look;
      if (this.mode === "dessus") top();
    } else {
      // La visée : la mienne, de ses yeux ; celle d'un autre, par-dessus son épaule (une fois qu'il est à la table)
      const mine = v.shooter === this.o.me;
      const ang = mine ? this.angle : this.remoteAngle;
      const p =
        (!mine && this.people.ready(v.shooter) && this.watchPose(v.shooter, cue, ang, portrait)) || this.aimPose(cue, ang, portrait);
      pos = p.pos;
      look = p.look;
      if (this.mode === "dessus" || (mine && this.drag?.kind === "place")) top();
      rate = mine ? 9 : 2.5;
    }
    if (!this.camReady) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.camReady = true;
    }
    const k = 1 - Math.exp(-rate * dt);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }

  /**
   * La visée d'un autre, vue de derrière et de côté, en hauteur : on le voit penché sur sa queue, la blanche et la
   * bille visée devant lui. La première place qui reste dans la salle et pas collée à sa tête, en tournant autour de
   * la blanche depuis derrière-à-droite.
   */
  private watchPose(id: string, cue: { x: number; y: number }, angle: number, portrait: boolean) {
    const head = this.people.headOf(id);
    if (!head) return null;
    const [mx, mz] = this.scene.salle?.camBox ?? [3.2, 2.4];
    const dist = portrait ? 1.85 : 1.65,
      h = portrait ? 1.45 : 1.3;
    const pos = new THREE.Vector3();
    const ball = new THREE.Vector3(cue.x, 0.03, -cue.y);
    const seg = new THREE.Line3();
    const near = new THREE.Vector3();
    for (const deg of [70, -70, 95, -95, 50, -50, 125, -125]) {
      const a = angle + Math.PI + (deg * Math.PI) / 180;
      pos.set(cue.x + Math.cos(a) * dist, h, -(cue.y + Math.sin(a) * dist));
      if (Math.abs(pos.x) > mx || Math.abs(pos.z) > mz) continue;
      if (pos.distanceTo(head) < 1.25) continue;
      // Sa tête ne doit pas cacher la blanche
      seg.set(pos, ball).closestPointToPoint(head, true, near);
      if (near.distanceTo(head) < 0.5) continue;
      const ahead = portrait ? 0.3 : 0.45;
      const look = new THREE.Vector3(cue.x + Math.cos(angle) * ahead, -0.08, -(cue.y + Math.sin(angle) * ahead));
      return { pos, look };
    }
    return null;
  }

  /** La caméra de visée : derrière la blanche, dans l'axe de la queue, un peu au-dessus */
  private aimPose(cue: { x: number; y: number }, angle: number, portrait: boolean) {
    const dx = Math.cos(angle),
      dy = Math.sin(angle);
    const dist = (portrait ? 0.95 : 0.72) * this.zoom;
    const h = 0.16 + 0.26 * this.zoom;
    const pos = new THREE.Vector3(cue.x - dx * dist, h, -(cue.y - dy * dist));
    const ahead = 0.35 + 0.35 * this.zoom;
    const look = new THREE.Vector3(cue.x + dx * ahead, 0, -(cue.y + dy * ahead));
    return { pos, look };
  }

  private pushHud(force: boolean) {
    const v = this.view;
    if (!v) return;
    const mine = v.phase === "aim" && v.shooter === this.o.me;
    const h: HudState = {
      canShoot: this.canShoot(),
      inHand: mine && Boolean(v.inHand),
      placing: this.drag?.kind === "place",
      pull: this.pull,
      tip: this.tip,
      mustCall: mine && mustCall({ ...v, rng: 0 }),
      call: this.call,
      legal: true,
      mode: this.mode,
      slow: this.replay?.stage === "slow",
      fps: Math.round(this.scene.fps),
    };
    const key = JSON.stringify(h);
    if (!force && key === this.hudKey) return;
    this.hudKey = key;
    this.o.onHud(h);
  }
}
