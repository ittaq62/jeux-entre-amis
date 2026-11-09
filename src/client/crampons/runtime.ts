// La boucle d'un match, côté navigateur : recevoir les positions, les rejouer à vitesse constante un peu en retard pour
// qu'elles soient fluides, anticiper son propre joueur pour que le stick réponde tout de suite, et traduire les boutons en gestes.

import { steer, topSpeed, type Act, type HumanActionKind, type MatchEvent, type Player } from "../../shared/games/crampons/model.ts";
import { clamp, DT, GOAL_HALF, wrapAngle } from "../../shared/games/crampons/pitch.ts";
import { ACTS, TICK_STRIDE, type CramponsTick, type CramponsView } from "../../shared/games/crampons/view.ts";
import { CramponsControls, type GameButton, type Scheme } from "./controls.ts";
import { CramponsScene, type SceneFrame } from "./scene/CramponsScene.ts";
import type { FootballerView } from "./scene/footballers.ts";

const SEND_EVERY_MS = 33;
/** Même sans changement, on donne signe de vie : c'est aussi ce qui mesure le temps de trajet */
const HEARTBEAT_MS = 220;
/** Au moins ce retard, pour avoir toujours deux positions entre lesquelles glisser (en secondes) */
const MIN_DELAY = 0.075;
const MAX_DELAY = 0.32;
/** Faute de position récente, on prolonge le mouvement, mais pas longtemps */
const MAX_EXTRAPOLATE = 0.12;

interface Snapshot {
  sim: number;
  p: number[];
  b: number[];
  o: number;
}

export interface HudState {
  clock: number;
  activeName: string;
  stamina: number;
  charge: number;
  hasBall: boolean;
  /** L'équipe adverse a le ballon */
  defending: boolean;
  scheme: Scheme;
  /** Tout le monde, pour le mini-terrain : x, z, équipe */
  radar: number[];
  ballX: number;
  ballZ: number;
}

/** Ce que font les boutons quand on a le ballon */
const WITH_BALL: Record<GameButton, HumanActionKind> = { pass: "pass", through: "through", lob: "lob", shoot: "shot" };

export interface RuntimeOptions {
  seatId: string | null;
  send: (x: number, z: number, sprint: boolean, press: boolean, stamp: number) => void;
  act: (k: HumanActionKind, p: number, x: number, z: number) => void;
  onHud: (hud: HudState) => void;
  /** Le joueur vient de frapper : on l'entend tout de suite, sans attendre le serveur */
  onLocalKick: (kind: HumanActionKind) => void;
}

export class MatchRuntime {
  private scene: CramponsScene;
  private controls: CramponsControls;
  private snaps: Snapshot[] = [];
  private view: CramponsView;
  private raf = 0;
  private last = performance.now();
  private lastSend = 0;
  private lastSentKey = "";
  private latestClock = 0;
  private active: number[] = [];
  private frameViews: FootballerView[];
  private myIndex: number;
  private hudAt = 0;
  private charge = 0;
  private scheme: Scheme = "fleches";
  // La lecture du match : une horloge qui avance régulièrement, calée sur les positions reçues
  private renderSim: number | null = null;
  private minLag: number | null = null;
  private jitter = 0.02;
  // Son joueur, anticipé
  private pred: Player | null = null;
  private predFor = -1;
  private acc = 0;
  private history: { t: number; x: number; z: number }[] = [];
  private corrX = 0;
  private corrZ = 0;
  private rtt = 0.09;
  private lastEcho = 0;
  private predBlocked = false;
  private localKickUntil = 0;
  // Le ballon montré : il suit le pied en douceur, sans sauter d'un côté à l'autre du joueur
  private shownBall = { x: 0, y: 0.2, z: 0 };
  private lastOwner = -2;

  constructor(
    canvas: HTMLCanvasElement,
    view: CramponsView,
    private opts: RuntimeOptions,
    lowQuality: boolean,
  ) {
    this.view = view;
    this.myIndex = view.humans.findIndex((h) => h.id === opts.seatId);
    this.scene = new CramponsScene(canvas, {
      count: view.players.length,
      kits: [view.teams[0].kit, view.teams[1].kit],
      gkKits: [view.teams[0].keeper, view.teams[1].keeper],
      keepers: view.players.map((p) => p.role === "GK"),
      shirts: view.players.map((p) => p.shirt),
      ambience: view.config.ambience,
      lowQuality,
    });
    this.frameViews = view.players.map((p) => ({
      x: 0,
      z: 0,
      h: 0,
      v: 0,
      act: "none" as Act,
      team: p.team,
      keeper: p.role === "GK",
      dirX: 0,
      dirZ: 1,
      cheer: false,
      off: false,
    }));
    this.controls = new CramponsControls(() => true);
    this.controls.attachMouse(canvas);
    this.fit();
    window.addEventListener("resize", this.fit);
    this.raf = requestAnimationFrame(this.loop);
  }

  get pad() {
    return this.controls;
  }

  setView(view: CramponsView) {
    this.view = view;
    this.myIndex = view.humans.findIndex((h) => h.id === this.opts.seatId);
  }

  setCamera(mode: "tele" | "large" | "pres") {
    this.scene.mode = mode;
  }

  /** Ce coup de pied du joueur a déjà été entendu au moment d'appuyer */
  isLocalKick(p: number): boolean {
    return p === this.myActive() && performance.now() < this.localKickUntil;
  }

  private fit = () => {
    this.scene.resize(window.innerWidth, window.innerHeight);
  };

  onTick(_now: number, tick: CramponsTick) {
    const arrival = performance.now() / 1000;
    const lag = arrival - tick.s;
    // Le trajet le plus court observé sert de référence ; il remonte très lentement pour suivre le réseau
    this.minLag = this.minLag === null ? lag : Math.min(lag, this.minLag + 0.0015);
    const late = lag - this.minLag;
    this.jitter = Math.max(late, this.jitter * 0.992);
    this.snaps.push({ sim: tick.s, p: tick.p, b: tick.b, o: tick.o });
    if (this.snaps.length > 40) this.snaps.shift();
    this.latestClock = tick.c;
    this.active = tick.a;
    this.reconcile(tick);
  }

  private myActive(): number {
    return this.myIndex >= 0 ? (this.active[this.myIndex] ?? -1) : -1;
  }

  /** Compare la position du serveur à celle que le joueur anticipé avait au même moment, et note l'écart à rattraper */
  private reconcile(tick: CramponsTick) {
    const a = this.myActive();
    if (a < 0) {
      this.pred = null;
      return;
    }
    const nowMs = performance.now();
    const echo = this.myIndex >= 0 ? (tick.k[this.myIndex] ?? 0) : 0;
    if (echo > this.lastEcho) {
      this.lastEcho = echo;
      this.rtt = this.rtt * 0.85 + (Math.max(0, nowMs - echo) / 1000) * 0.15;
    }
    const k = a * TICK_STRIDE;
    const x = tick.p[k]!;
    const z = tick.p[k + 1]!;
    const h = tick.p[k + 2]!;
    const act = ACTS[tick.p[k + 4]!] ?? "none";
    const stam = tick.p[k + 5]! / 100;
    if (!this.pred || this.predFor !== a) {
      const info = this.view.players[a]!;
      this.predFor = a;
      this.history.length = 0;
      this.corrX = this.corrZ = 0;
      this.pred = {
        ...({} as Player),
        i: a,
        stats: { pac: info.pac, dri: info.dri, phy: info.phy, sho: 0, pas: 0, tac: 0, gk: 0 },
        x,
        z,
        vx: 0,
        vz: 0,
        h,
        stam,
      };
      return;
    }
    const p = this.pred;
    p.stam = stam;
    // Un geste qui commande le corps, ou une remise en jeu : c'est le serveur qui sait
    this.predBlocked = act !== "none" && act !== "kick";
    if (this.predBlocked) {
      p.x = x;
      p.z = z;
      p.vx = 0;
      p.vz = 0;
      p.h = h;
      this.history.length = 0;
      this.corrX = this.corrZ = 0;
      return;
    }
    // Là où notre joueur était quand le serveur a calculé cette position
    const when = nowMs / 1000 - this.rtt / 2 - 0.02;
    let past = this.history[0];
    for (const e of this.history) {
      if (e.t > when) break;
      past = e;
    }
    if (!past) return;
    const ex = x - past.x;
    const ez = z - past.z;
    const err = Math.hypot(ex, ez);
    if (err > 5) {
      p.x = x;
      p.z = z;
      p.vx = 0;
      p.vz = 0;
      this.history.length = 0;
      this.corrX = this.corrZ = 0;
    } else if (err > 0.15) {
      this.corrX = ex;
      this.corrZ = ez;
    } else {
      this.corrX = this.corrZ = 0;
    }
  }

  private isTaking(active: number) {
    const r = this.view.restart;
    return Boolean(r?.ready && r.taker === active && this.view.phase !== "play");
  }

  /** La direction d'une action : le stick, ou le curseur pour un clic */
  private aimOf(kind: HumanActionKind, mouse: boolean, mx: number, mz: number, cursor: { x: number; y: number } | null): [number, number] {
    if (!mouse || !cursor || !this.pred) return [mx, mz];
    const pt = this.scene.pickGround(cursor.x, cursor.y);
    if (!pt) return [mx, mz];
    const dx = pt[0] - this.pred.x;
    const dz = pt[1] - this.pred.z;
    const l = Math.hypot(dx, dz) || 1;
    // Pour une frappe, le curseur désigne l'endroit du but : à gauche, au centre, à droite
    if (kind === "shot" || kind === "finesse" || kind === "chip") return [dx / l, clamp(pt[1] / (GOAL_HALF + 0.5), -1, 1)];
    return [dx / l, dz / l];
  }

  /** Les boutons deviennent des gestes */
  private handleButtons(dt: number): void {
    const pad = this.controls.read();
    this.scheme = pad.scheme;
    const [mx, mz] = this.scene.screenToWorld(pad.sx, pad.sy);
    const now = performance.now();
    const active = this.myActive();
    const lastSnap = this.snaps.at(-1);
    const hasBall = active >= 0 && lastSnap?.o === active;
    const owner = lastSnap?.o ?? -1;
    const foeHasIt = owner >= 0 && this.view.players[owner]?.team !== this.view.players[active]?.team;
    const taking = this.isTaking(active);
    const press = foeHasIt && pad.held.pass;
    this.charge = hasBall || taking ? pad.charge : 0;

    const kindFor = (button: GameButton): HumanActionKind => {
      if (button !== "shoot") return WITH_BALL[button];
      const touch = this.controls.touch;
      const kind = pad.chip ? "chip" : pad.finesse ? "finesse" : "shot";
      // Sur l'écran tactile, « effet » et « piqué » ne valent que pour un seul tir
      touch.finesse = false;
      touch.chip = false;
      return kind;
    };

    if (pad.swap) this.opts.act("switch", 0, 0, 0);
    for (const r of pad.released) {
      if (taking || hasBall) {
        const kind = kindFor(r.button);
        const [ax, az] = this.aimOf(kind, r.mouse, mx, mz, pad.mouse);
        this.opts.act(kind, r.power, ax, az);
        if (hasBall && !taking) {
          this.localKickUntil = now + 320;
          this.opts.onLocalKick(kind);
        }
        continue;
      }
      if (foeHasIt) {
        // L'adversaire a le ballon : Passe presse tant qu'on la tient, Tir part en glissade, les deux autres changent de joueur
        if (r.button === "shoot") this.opts.act("slide", r.power, mx, mz);
        else if (r.button === "through" || r.button === "lob") this.opts.act("switch", 0, 0, 0);
        continue;
      }
      // Le ballon est libre : c'est une reprise, si le ballon arrive à cet instant
      const kind = kindFor(r.button);
      const [ax, az] = this.aimOf(kind, r.mouse, mx, mz, pad.mouse);
      this.opts.act(kind, r.power, ax, az);
    }

    if (now - this.lastSend >= SEND_EVERY_MS) {
      const key = `${mx.toFixed(2)}|${mz.toFixed(2)}|${pad.sprint}|${press}`;
      if (key !== this.lastSentKey || now - this.lastSend >= HEARTBEAT_MS) {
        this.lastSentKey = key;
        this.lastSend = now;
        this.opts.send(mx, mz, pad.sprint, press, Math.round(now));
      }
    }

    // Anticiper son joueur, au même rythme que le serveur
    const p = this.pred;
    const frozen = taking || this.view.phase === "halftime" || this.view.phase === "over" || this.predBlocked;
    if (p && active === this.predFor) {
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        if (frozen) {
          p.vx = 0;
          p.vz = 0;
          continue;
        }
        const l = Math.hypot(mx, mz);
        const speed = topSpeed(p, pad.sprint, hasBall) * Math.min(1, l * 1.25);
        steer(p, l > 0.05 ? mx / l : 0, l > 0.05 ? mz / l : 0, speed);
      }
      // L'écart avec le serveur se rattrape peu à peu, à chaque image : jamais d'un coup
      const k = 1 - Math.exp(-dt * 7);
      const dx = this.corrX * k;
      const dz = this.corrZ * k;
      p.x += dx;
      p.z += dz;
      this.corrX -= dx;
      this.corrZ -= dz;
      for (const e of this.history) {
        e.x += dx;
        e.z += dz;
      }
      this.history.push({ t: now / 1000, x: p.x, z: p.z });
      if (this.history.length > 90) this.history.shift();
    }
  }

  /** Fait avancer l'horloge de lecture : d'un pas régulier, recalée tout en douceur */
  private advanceClock(dt: number): number | null {
    const latest = this.snaps.at(-1);
    if (!latest || this.minLag === null) return null;
    const delay = clamp(MIN_DELAY + this.jitter, MIN_DELAY, MAX_DELAY);
    const target = performance.now() / 1000 - this.minLag - delay;
    if (this.renderSim === null || Math.abs(target - this.renderSim) > 0.35) this.renderSim = target;
    else this.renderSim += dt + (target - this.renderSim) * Math.min(1, dt * 1.5);
    return this.renderSim;
  }

  private interpolated(dt: number): SceneFrame | null {
    const n = this.snaps.length;
    const at = this.advanceClock(dt);
    if (n === 0 || at === null) return null;
    let a = this.snaps[0]!;
    let b = this.snaps[n - 1]!;
    if (n >= 2 && at >= b.sim) {
      // Plus de position récente : on prolonge le dernier mouvement, un court instant
      a = this.snaps[n - 2]!;
    } else {
      for (let i = n - 1; i > 0; i--) {
        if (this.snaps[i - 1]!.sim <= at) {
          a = this.snaps[i - 1]!;
          b = this.snaps[i]!;
          break;
        }
      }
    }
    const span = b.sim - a.sim;
    const maxF = span > 0 ? 1 + MAX_EXTRAPOLATE / span : 1;
    const f = clamp(span > 0 ? (at - a.sim) / span : 1, 0, maxF);
    const views = this.frameViews;
    const active = this.myActive();
    const scorer = this.view.phase === "goal" ? (this.view.goals.at(-1)?.team ?? null) : null;
    const local = performance.now() < this.localKickUntil;
    for (let i = 0; i < views.length; i++) {
      const k = i * TICK_STRIDE;
      const v = views[i]!;
      const ax = a.p[k]!;
      const az = a.p[k + 1]!;
      const bx = b.p[k]!;
      const bz = b.p[k + 1]!;
      // Un grand saut, c'est une remise en place : on ne le fait pas glisser
      const teleport = Math.hypot(bx - ax, bz - az) > 3;
      v.x = teleport ? bx : ax + (bx - ax) * f;
      v.z = teleport ? bz : az + (bz - az) * f;
      v.h = a.p[k + 2]! + wrapAngle(b.p[k + 2]! - a.p[k + 2]!) * Math.min(f, 1);
      v.v = a.p[k + 3]! + (b.p[k + 3]! - a.p[k + 3]!) * Math.min(f, 1);
      const act = ACTS[(f < 0.5 ? a : b).p[k + 4]!] ?? "none";
      v.act = act;
      v.cheer = scorer !== null && v.team === scorer;
      v.off = this.view.cards.some((c) => c.i === i && c.off);
      if (act === "dive" || act === "slide") {
        const dx = bx - ax;
        const dz = bz - az;
        const l = Math.hypot(dx, dz);
        if (l > 0.02) {
          v.dirX = dx / l;
          v.dirZ = dz / l;
        }
      }
      if (i === active && this.pred && this.predFor === i && (act === "none" || act === "kick")) {
        v.x = this.pred.x;
        v.z = this.pred.z;
        v.h = this.pred.h;
        v.v = Math.hypot(this.pred.vx, this.pred.vz);
        if (local) v.act = "kick";
      }
    }
    const ballA = a.b;
    const ballB = b.b;
    const fb = Math.min(f, maxF);
    const ball = {
      x: ballA[0]! + (ballB[0]! - ballA[0]!) * fb,
      y: Math.max(0.16, ballA[1]! + (ballB[1]! - ballA[1]!) * Math.min(f, 1)),
      z: ballA[2]! + (ballB[2]! - ballA[2]!) * fb,
      vx: ballB[3]!,
      vz: ballB[4]!,
    };
    // Le ballon de son joueur reste à ses pieds, là où on le voit
    const owner = b.o;
    if (owner === active && active >= 0 && this.pred && this.predFor === active) {
      const p = this.pred;
      const reach = 0.55 + Math.min(1, Math.hypot(p.vx, p.vz) / 9) * 0.55;
      ball.x = p.x + Math.cos(p.h) * reach;
      ball.z = p.z + Math.sin(p.h) * reach;
      ball.y = Math.min(ball.y, 0.3);
      ball.vx = p.vx;
      ball.vz = p.vz;
    }
    // Au pied, le ballon suit en souplesse ; libre, il va exactement où il doit aller
    const s = this.shownBall;
    const jump = Math.hypot(ball.x - s.x, ball.z - s.z);
    const k = owner >= 0 && jump < 5 ? 1 - Math.exp(-dt * 24) : this.lastOwner !== owner && jump < 3 ? 0.5 : 1;
    s.x += (ball.x - s.x) * k;
    s.z += (ball.z - s.z) * k;
    s.y += (ball.y - s.y) * Math.max(k, 0.6);
    this.lastOwner = owner;
    const flip = this.view.flipped;
    const myTeam = this.myIndex >= 0 ? this.view.humans[this.myIndex]!.team : 0;
    return {
      players: views,
      ball: { x: s.x, y: s.y, z: s.z, vx: ball.vx, vz: ball.vz },
      active,
      attackSide: (myTeam === 0) !== flip ? 1 : -1,
      excitement: this.view.phase === "goal" ? 1 : this.view.phase === "over" ? 0.6 : 0.12,
      cuts: this.view.cuts,
      charge: this.charge,
    };
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.opts.seatId !== null && this.myIndex >= 0) this.handleButtons(dt);
    const frame = this.interpolated(dt);
    if (!frame) return;
    if (import.meta.env.DEV) (window as unknown as { __crFrame: SceneFrame }).__crFrame = frame;
    this.scene.render(dt, frame);
    if (now - this.hudAt > 90) {
      this.hudAt = now;
      const a = this.myActive();
      const last = this.snaps.at(-1);
      const owner = last?.o ?? -1;
      const radar: number[] = [];
      for (let i = 0; i < frame.players.length; i++) {
        const v = frame.players[i]!;
        if (!v.off) radar.push(v.x, v.z, v.team + (i === a ? 2 : 0));
      }
      this.opts.onHud({
        clock: this.latestClock,
        activeName: a >= 0 ? (this.view.players[a]?.name ?? "") : "",
        stamina: a >= 0 && last ? last.p[a * TICK_STRIDE + 5]! / 100 : 1,
        charge: this.charge,
        hasBall: a >= 0 && owner === a,
        defending: a >= 0 && owner >= 0 && this.view.players[owner]?.team !== this.view.players[a]?.team,
        scheme: this.scheme,
        radar,
        ballX: frame.ball.x,
        ballZ: frame.ball.z,
      });
    }
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.fit);
    this.controls.dispose();
    this.scene.dispose();
  }
}

export type { MatchEvent };
