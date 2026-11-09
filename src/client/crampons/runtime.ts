// La boucle d'un match, côté téléphone : recevoir les positions, les montrer un peu en retard pour qu'elles soient fluides,
// anticiper son propre joueur pour que le stick réponde tout de suite, et traduire les boutons en gestes.

import { steer, topSpeed, type Act, type HumanActionKind, type MatchEvent, type Player } from "../../shared/games/crampons/model.ts";
import { DT, wrapAngle } from "../../shared/games/crampons/pitch.ts";
import { ACTS, TICK_STRIDE, type CramponsTick, type CramponsView } from "../../shared/games/crampons/view.ts";
import { CramponsControls, type GameButton } from "./controls.ts";
import { CramponsScene, type SceneFrame } from "./scene/CramponsScene.ts";
import type { FootballerView } from "./scene/footballers.ts";

/** On montre le match avec ce retard : le temps de recevoir la position suivante et de glisser de l'une à l'autre */
const INTERP_MS = 105;
const SEND_EVERY_MS = 45;

interface Snapshot {
  at: number;
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
}

/** Les gestes de chaque bouton, selon qu'on a le ballon ou non */
const WITH_BALL: Record<GameButton, HumanActionKind> = { a: "pass", b: "through", x: "lob", y: "shot" };
const WITHOUT_BALL: Record<GameButton, HumanActionKind | null> = { a: null, b: "tackle", x: "switch", y: "slide" };
const FIRST_TIME: Record<GameButton, HumanActionKind> = WITH_BALL;

export interface RuntimeOptions {
  /** Le siège de ce joueur, ou null pour un spectateur */
  seatId: string | null;
  send: (x: number, z: number, sprint: boolean, press: boolean) => void;
  act: (k: HumanActionKind, p: number, x: number, z: number) => void;
  onHud: (hud: HudState) => void;
  onEvents: (events: MatchEvent[]) => void;
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
  private offset: number | null = null;
  private latestClock = 0;
  private active: number[] = [];
  private frameViews: FootballerView[];
  private lastEventKick = 0;
  private myIndex: number;
  private hudAt = 0;
  private charge = 0;
  // Son joueur, anticipé
  private pred: Player | null = null;
  private predFor = -1;
  private acc = 0;

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

  private fit = () => {
    const c = this.scene;
    const w = window.innerWidth;
    const h = window.innerHeight;
    c.resize(w, h);
  };

  onTick(now: number, tick: CramponsTick) {
    const local = Date.now();
    const estimated = now - local;
    // L'horloge du serveur, lissée : on suit les paquets les moins retardés
    this.offset = this.offset === null ? estimated : Math.max(estimated, this.offset - 2) * 0.1 + this.offset * 0.9;
    this.snaps.push({ at: now, p: tick.p, b: tick.b, o: tick.o });
    if (this.snaps.length > 24) this.snaps.shift();
    this.latestClock = tick.c;
    this.active = tick.a;
    this.reconcile(tick);
  }

  private myActive(): number {
    return this.myIndex >= 0 ? (this.active[this.myIndex] ?? -1) : -1;
  }

  /** Recale doucement le joueur anticipé sur ce que dit le serveur */
  private reconcile(tick: CramponsTick) {
    const a = this.myActive();
    if (a < 0) {
      this.pred = null;
      return;
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
    // Un geste qui commande le corps : on laisse faire le serveur
    if (act !== "none" && act !== "kick") {
      p.x = x;
      p.z = z;
      p.vx = 0;
      p.vz = 0;
      p.h = h;
      return;
    }
    // Notre joueur est en avance sur ce que le serveur connaît : on compare à sa position, un peu projetée
    const lead = 0.09;
    const ex = x + p.vx * lead - p.x;
    const ez = z + p.vz * lead - p.z;
    const err = Math.hypot(ex, ez);
    if (err > 4) {
      p.x = x;
      p.z = z;
    } else {
      p.x += ex * 0.16;
      p.z += ez * 0.16;
    }
  }

  /** Les boutons deviennent des gestes */
  private handleButtons(dt: number): void {
    const pad = this.controls.read();
    const [mx, mz] = this.scene.screenToWorld(pad.sx, pad.sy);
    const now = performance.now();
    const active = this.myActive();
    const lastSnap = this.snaps.at(-1);
    const hasBall = active >= 0 && lastSnap?.o === active;
    const restart = this.view.restart;
    const taking = restart?.ready && restart.taker === active && this.view.phase !== "play";
    const press = !hasBall && pad.held.a && !taking;
    this.charge = pad.charge;

    if (pad.swap) this.opts.act("switch", 0, 0, 0);
    const kindFor = (button: GameButton): HumanActionKind => {
      if (button !== "y") return WITH_BALL[button];
      const touch = this.controls.touch;
      const kind = pad.chip ? "chip" : pad.finesse ? "finesse" : "shot";
      // Sur l'écran tactile, « effet » et « piqué » ne valent que pour un seul tir
      touch.finesse = false;
      touch.chip = false;
      return kind;
    };
    for (const r of pad.released) {
      if (taking) {
        this.opts.act(kindFor(r.button), r.power, mx, mz);
        continue;
      }
      if (hasBall) {
        this.opts.act(kindFor(r.button), r.power, mx, mz);
      } else if (r.button === "a") {
        // Rien à la relâche : ce bouton sert à presser tant qu'il est tenu ; une frappe en reprise part du bouton A si le ballon arrive
        continue;
      } else {
        const k = WITHOUT_BALL[r.button];
        if (k === "tackle" || k === "slide" || k === "switch") this.opts.act(k, r.power, mx, mz);
        // Une demande de reprise de volée : si le ballon arrive au joueur à cet instant
        if (r.button === "y" && lastSnap && lastSnap.o < 0) this.opts.act(FIRST_TIME.y, r.power, mx, mz);
      }
    }

    if (now - this.lastSend >= SEND_EVERY_MS) {
      const key = `${mx.toFixed(2)}|${mz.toFixed(2)}|${pad.sprint}|${press}`;
      if (key !== this.lastSentKey) {
        this.lastSentKey = key;
        this.lastSend = now;
        this.opts.send(mx, mz, pad.sprint, press);
      }
    }

    // Anticiper son joueur, au même rythme que le serveur
    const p = this.pred;
    if (p && active === this.predFor) {
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        const l = Math.hypot(mx, mz);
        const speed = topSpeed(p, pad.sprint, hasBall) * Math.min(1, l * 1.25);
        steer(p, l > 0.05 ? mx / l : 0, l > 0.05 ? mz / l : 0, speed);
      }
    }
  }

  private interpolated(): SceneFrame | null {
    const n = this.snaps.length;
    if (n === 0 || this.offset === null) return null;
    const target = Date.now() + this.offset - INTERP_MS;
    let a = this.snaps[0]!;
    let b = this.snaps[n - 1]!;
    for (let i = n - 1; i > 0; i--) {
      if (this.snaps[i - 1]!.at <= target) {
        a = this.snaps[i - 1]!;
        b = this.snaps[i]!;
        break;
      }
    }
    const f = Math.max(0, Math.min(1, b.at > a.at ? (target - a.at) / (b.at - a.at) : 1));
    const views = this.frameViews;
    const active = this.myActive();
    const scorer = this.view.phase === "goal" ? (this.view.goals.at(-1)?.team ?? null) : null;
    for (let i = 0; i < views.length; i++) {
      const k = i * TICK_STRIDE;
      const v = views[i]!;
      const ax = a.p[k]!;
      const az = a.p[k + 1]!;
      const bx = b.p[k]!;
      const bz = b.p[k + 1]!;
      v.x = ax + (bx - ax) * f;
      v.z = az + (bz - az) * f;
      v.h = a.p[k + 2]! + wrapAngle(b.p[k + 2]! - a.p[k + 2]!) * f;
      v.v = a.p[k + 3]! + (b.p[k + 3]! - a.p[k + 3]!) * f;
      const act = ACTS[b.p[k + 4]!] ?? "none";
      v.act = act;
      v.cheer = scorer !== null && v.team === scorer;
      v.off = this.view.cards.some((c) => c.i === i && c.off);
      if (act === "dive" || act === "slide") {
        // La direction se déduit du déplacement
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
      }
    }
    const ballA = a.b;
    const ballB = b.b;
    const ball = {
      x: ballA[0]! + (ballB[0]! - ballA[0]!) * f,
      y: ballA[1]! + (ballB[1]! - ballA[1]!) * f,
      z: ballA[2]! + (ballB[2]! - ballA[2]!) * f,
      vx: ballB[3]!,
      vz: ballB[4]!,
    };
    // Le ballon de son joueur reste à ses pieds, là où on le voit
    if (b.o === active && active >= 0 && this.pred && this.predFor === active) {
      const p = this.pred;
      const reach = 0.55 + Math.min(1, Math.hypot(p.vx, p.vz) / 9) * 0.55;
      ball.x = p.x + Math.cos(p.h) * reach;
      ball.z = p.z + Math.sin(p.h) * reach;
      ball.y = Math.min(ball.y, 0.3);
    }
    const flip = this.view.flipped;
    const myTeam = this.myIndex >= 0 ? this.view.humans[this.myIndex]!.team : 0;
    return {
      players: views,
      ball,
      active,
      attackSide: (myTeam === 0) !== flip ? 1 : -1,
      excitement: this.view.phase === "goal" ? 1 : this.view.phase === "over" ? 0.6 : 0.12,
      cuts: this.view.cuts,
    };
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.opts.seatId !== null && this.myIndex >= 0) this.handleButtons(dt);
    const frame = this.interpolated();
    if (!frame) return;
    this.scene.render(dt, frame);
    if (now - this.hudAt > 120) {
      this.hudAt = now;
      const a = this.myActive();
      const last = this.snaps.at(-1);
      this.opts.onHud({
        clock: this.latestClock,
        activeName: a >= 0 ? (this.view.players[a]?.name ?? "") : "",
        stamina: a >= 0 && last ? last.p[a * TICK_STRIDE + 5]! / 100 : 1,
        charge: this.charge,
        hasBall: a >= 0 && last?.o === a,
      });
    }
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.fit);
    this.controls.dispose();
    this.scene.dispose();
    void this.lastEventKick;
  }
}
