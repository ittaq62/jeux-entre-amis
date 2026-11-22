// Le jeu à l'écran : la scène du trou, la balle de chacun rejouée à partir de ses coups (la même physique que le
// serveur, au même pas de temps), la visée en fronde à la souris et au doigt, la caméra qui tourne, suit la balle, ou
// montre tout le trou, et ce qui se passe (chocs, plouf, balle dans le trou) pour le son et l'écran.

import { BALL_R, type Course } from "../../shared/games/minigolf/course.ts";
import { courseOf, type HoleRef } from "../../shared/games/minigolf/courses.ts";
import { bonusCourse, bonusSpots } from "../../shared/games/minigolf/bonus.ts";
import type { BallLook } from "../../shared/games/minigolf/looks.ts";
import { physOf, type GolfShot, type MinigolfConfig } from "../../shared/games/minigolf/match.ts";
import type { MinigolfView } from "../../shared/games/minigolf/net.ts";
import { restingBall, stepBall, strike, STEPS_PER_S, type Ball, type PhysEvent } from "../../shared/games/minigolf/physics.ts";
import { HoleScene } from "./scene/HoleScene.ts";
import * as THREE from "three";

export interface PlayerInfo {
  id: string;
  name: string;
  look: BallLook;
}

export interface RuntimeEvent {
  /** Le joueur dont la balle a fait ça */
  id: string;
  mine: boolean;
  e: PhysEvent;
  /** La distance à la caméra (pour le volume) */
  dist: number;
}

export interface HudState {
  /** Où en est sa visée (force de 0 à 1), null s'il ne vise pas */
  power: number | null;
  /** Sa balle roule */
  rolling: boolean;
  /** Il peut jouer */
  canShoot: boolean;
  fps: number;
}

export interface RuntimeOptions {
  /** Son siège (null : il regarde) */
  me: string | null;
  /** L'heure du serveur, maintenant */
  serverNow: () => number;
  onShoot: (hole: number, angle: number, power: number, at: number) => void;
  onEvent?: (e: RuntimeEvent) => void;
  onHud?: (h: HudState) => void;
  onAim?: (angle: number, power: number) => void;
  /** Un coup part (le sien, ou celui d'un autre) */
  onShot?: (id: string, mine: boolean, power: number) => void;
}

type CamMode = "aim" | "follow" | "overview" | "intro";

/** Ce qu'on rejoue d'un coup : la balle de la physique, avancée pas à pas jusqu'à maintenant */
interface Replay {
  key: string;
  ball: Ball;
  tick: number;
  shot: GolfShot;
  /** La balle est tombée dans le trou à ce moment (pour l'animation) */
  inAt: number | null;
}

const MIN_DRAG = 12;

export class GolfRuntime {
  readonly scene: HoleScene;
  private view: MinigolfView | null = null;
  private players: PlayerInfo[] = [];
  private course: Course | null = null;
  private ref: HoleRef | null = null;
  private cfg: MinigolfConfig | null = null;
  private replays = new Map<string, Replay>();
  private raf = 0;
  private lastFrame = performance.now();
  private disposed = false;
  private paused = false;
  // Caméra : où elle regarde, depuis quelle direction, de quelle hauteur et de quelle distance
  private yaw = -Math.PI / 2;
  private pitch = 0.5;
  private dist = 2.2;
  private camMode: CamMode = "aim";
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camReady = false;
  private overview = false;
  // La visée en cours
  private drag: { x: number; y: number; id: number } | null = null;
  private aimAngle = 0;
  private aimPower = 0;
  private lastAimSent = 0;
  private orbit: { x: number; y: number; id: number; yaw: number; pitch: number } | null = null;
  private pinch: { d: number; dist: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private keys = new Set<string>();
  private holeKey = "";
  private introFrom = 0;

  constructor(
    private host: HTMLElement,
    private o: RuntimeOptions,
  ) {
    this.scene = new HoleScene(host);
    const el = this.scene.renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    this.raf = requestAnimationFrame(this.frame);
  }

  setPlayers(list: PlayerInfo[]) {
    this.players = list;
    for (const p of list) this.scene.ball(p.id, p.look, p.id === this.o.me, p.id === this.o.me ? undefined : p.name);
  }

  /** L'état de la partie a changé (un coup, un trou de plus, les scores) */
  setView(v: MinigolfView) {
    const prev = this.view;
    this.view = v;
    this.cfg = v.cfg;
    const ref = v.holes[v.hole]!;
    const key = `${v.hole}:${ref.c}:${ref.i}:${ref.m}`;
    if (key !== this.holeKey) {
      this.holeKey = key;
      this.ref = ref;
      // Avec la règle des bulles bonus, le même trou, plus ses bulles (pour voir la balle les traverser)
      this.course = v.cfg.bonus ? bonusCourse(ref) : courseOf(ref);
      this.scene.setHole(this.course, ref.c, ref.i * 7919 + (ref.m ? 1 : 0) + 17);
      this.scene.setBonus(v.cfg.bonus ? bonusSpots(ref) : null);
      this.replays.clear();
      this.yaw = this.course.tee.aim;
      this.pitch = 0.5;
      this.dist = 2.2;
      this.camReady = false;
      this.camMode = v.phase === "intro" ? "intro" : "aim";
      this.introFrom = performance.now();
    }
    if (prev && prev.phase !== v.phase && v.phase === "intro") {
      this.camMode = "intro";
      this.introFrom = performance.now();
    }
    // Les bulles déjà prises (si notre balle ne roule pas : sinon, elles éclatent quand elle passe dedans)
    const meNow = v.players.find((p) => p.id === this.o.me);
    if (v.cfg.bonus && meNow && !this.isRolling(this.o.me))
      for (let i = 0; i < 31; i++) if (meNow.picked & (1 << i)) this.scene.takeBonus(i, false);
    // Un nouveau coup pour quelqu'un : on le rejoue depuis son départ
    for (const p of v.players) {
      const s = p.shot;
      if (!s) {
        this.replays.delete(p.id);
        continue;
      }
      const k = `${v.hole}:${s.n}:${s.at}`;
      const old = this.replays.get(p.id);
      if (old?.key === k) continue;
      // Notre propre coup, déjà lancé à l'écran avec les mêmes valeurs : on garde l'animation
      if (old && old.shot.at === s.at && old.shot.a === s.a && old.shot.p === s.p && old.key.startsWith(`${v.hole}:pending`)) {
        old.key = k;
        old.shot = s;
        continue;
      }
      this.replays.set(p.id, this.newReplay(k, s));
      // Un coup qui part maintenant (pas un coup d'avant, rejoué à l'arrivée)
      if (prev && this.tickNow() - s.at < STEPS_PER_S * 0.6) this.o.onShot?.(p.id, p.id === this.o.me, s.p);
    }
  }

  private newReplay(key: string, s: GolfShot): Replay {
    const c = this.course!;
    const b = restingBall(c, s.from[0], s.from[1], s.from[2]);
    strike(c, b, s.a, s.p, s.mods);
    return { key, ball: b, tick: s.at, shot: s, inAt: null };
  }

  /** Le pas du trou à cette heure */
  private tickNow(): number {
    if (!this.view) return 0;
    return ((this.o.serverNow() - this.view.holeStart) * STEPS_PER_S) / 1000;
  }

  private me() {
    return this.view?.players.find((p) => p.id === this.o.me) ?? null;
  }

  /** Peut-il jouer maintenant ? */
  private canShoot(): boolean {
    const v = this.view;
    const p = this.me();
    if (!v || !p || v.phase !== "play" || p.done) return false;
    const r = this.replays.get(p.id);
    if (r && (r.ball.mode === "roll" || r.ball.mode === "air" || r.ball.mode === "rail")) return false;
    return this.tickNow() >= p.restAt;
  }

  /** La position de la balle d'un joueur maintenant */
  private ballPos(id: string): { x: number; y: number; z: number } | null {
    const v = this.view;
    const p = v?.players.find((x) => x.id === id);
    if (!p) return null;
    const r = this.replays.get(id);
    if (r && r.ball.mode !== "rest" && r.ball.mode !== "lost" && r.ball.mode !== "in") return { x: r.ball.x, y: r.ball.y, z: r.ball.z };
    return { x: p.ball[0], y: p.ball[1], z: p.ball[2] };
  }

  setPaused(on: boolean) {
    this.paused = on;
    if (on) this.cancelAim();
  }

  /** Voir tout le trou d'en haut, ou revenir derrière sa balle */
  toggleOverview(on?: boolean) {
    this.overview = on ?? !this.overview;
    this.camMode = this.overview ? "overview" : "aim";
  }

  get overviewOn() {
    return this.overview;
  }

  // -------------------------------------------------------------------------
  // La boucle
  // -------------------------------------------------------------------------

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.view || !this.course) {
      return;
    }
    const tick = this.tickNow();
    this.advance(tick);
    this.keysTurn(dt);
    this.placeBalls(tick);
    this.updateCamera(dt, now);
    this.updateFlags(dt);
    const t = tick / STEPS_PER_S;
    this.scene.render(t, dt);
    this.o.onHud?.({
      power: this.drag ? this.aimPower : null,
      rolling: this.isRolling(this.o.me),
      canShoot: this.canShoot(),
      fps: Math.round(this.scene.fps),
    });
  };

  private isRolling(id: string | null): boolean {
    if (!id) return false;
    const r = this.replays.get(id);
    return Boolean(r && (r.ball.mode === "roll" || r.ball.mode === "air" || r.ball.mode === "rail"));
  }

  /** Chaque coup rejoué avance jusqu'au pas actuel (sans bruit pour ce qui est déjà loin dans le passé) */
  private advance(tick: number) {
    const c = this.course!;
    const cfg = this.cfg!;
    const ref = this.ref!;
    const target = Math.floor(tick);
    for (const [id, r] of this.replays) {
      const phys = physOf(cfg, ref, r.shot.mods);
      const mine = id === this.o.me;
      while (r.tick < target && (r.ball.mode === "roll" || r.ball.mode === "air" || r.ball.mode === "rail")) {
        r.tick++;
        const live = target - r.tick < STEPS_PER_S * 0.25;
        stepBall(c, r.ball, r.tick, phys, live ? (e, b) => this.emit(id, mine, e, b) : undefined);
        if ((r.ball.mode as string) === "in" && r.inAt === null) r.inAt = performance.now();
      }
    }
  }

  private emit(id: string, mine: boolean, e: PhysEvent, b: Ball) {
    if (mine && e.k === "item") this.scene.takeBonus(e.i);
    const d = this.scene.camera.position.distanceTo(new THREE.Vector3(b.x, b.y, b.z));
    this.o.onEvent?.({ id, mine, e, dist: d });
  }

  private placeBalls(tick: number) {
    const v = this.view!;
    for (const p of v.players) {
      const model = this.scene.ball(
        p.id,
        this.players.find((x) => x.id === p.id)?.look ?? { color: "blanche", pattern: "unie", trail: "fil" },
        p.id === this.o.me,
      );
      const r = this.replays.get(p.id);
      let pos = { x: p.ball[0], y: p.ball[1], z: p.ball[2] };
      let visible = !(p.done && p.doneAt <= tick && (!r || r.ball.mode === "in"));
      if (r) {
        if (r.ball.mode === "lost") {
          // Perdue : on la voit encore un instant là où elle est, puis elle revient au départ du coup
          visible = tick < r.shot.end + STEPS_PER_S * 0.6;
          pos = visible ? { x: r.ball.x, y: r.ball.y, z: r.ball.z } : { x: r.shot.to[0], y: r.shot.to[1], z: r.shot.to[2] };
          if (!visible) visible = !p.done;
        } else if (r.ball.mode === "in") {
          const k = r.inAt === null ? 1 : Math.min(1, (performance.now() - r.inAt) / 350);
          pos = { x: r.ball.x, y: r.ball.y + 0.06, z: r.ball.z };
          model.sink(k);
          visible = k < 1;
        } else if (r.ball.mode !== "rest") {
          pos = { x: r.ball.x, y: r.ball.y, z: r.ball.z };
        } else {
          pos = { x: r.shot.to[0], y: r.shot.to[1], z: r.shot.to[2] };
        }
      }
      if (!r || r.ball.mode !== "in") model.sink(0);
      model.show(visible);
      model.set(pos.x, pos.y, pos.z, this.scene.groundAt(pos.x, pos.z));
    }
    // La visée, sur sa propre balle
    const mine = this.o.me ? this.ballPos(this.o.me) : null;
    if (this.drag && mine && this.canShoot()) this.scene.setAim(mine, this.aimAngle, this.aimPower);
    else this.scene.setAim(null);
  }

  private updateFlags(dt: number) {
    // Le drapeau se lève quand une balle approche du trou (on voit mieux le trou)
    const c = this.course!;
    this.scene.flags.forEach((f, i) => {
      const cup = c.cups[i];
      if (!cup) return;
      let near = false;
      for (const p of this.view!.players) {
        const pos = this.ballPos(p.id);
        if (pos && Math.hypot(pos.x - cup.x, pos.z - cup.z) < 1.2 && !p.done) near = true;
      }
      const want = near ? 0.55 : 0;
      f.position.y += (want - f.position.y) * Math.min(1, dt * 4);
    });
  }

  // -------------------------------------------------------------------------
  // La caméra
  // -------------------------------------------------------------------------

  private updateCamera(dt: number, now: number) {
    const c = this.course!;
    const cam = this.scene.camera;
    const focus = (this.o.me && this.ballPos(this.o.me)) ||
      this.ballPos(this.view!.players[0]?.id ?? "") || { x: c.tee.x, y: c.tee.y, z: c.tee.z };
    const wantPos = new THREE.Vector3();
    const wantLook = new THREE.Vector3();
    const b = c.box;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    let mode = this.camMode;
    if (mode === "intro" && (this.view!.phase !== "intro" || now - this.introFrom > 3600))
      mode = this.camMode = this.overview ? "overview" : "aim";
    if (mode === "intro") {
      // Le survol : du trou vers le départ
      const k = Math.min(1, (now - this.introFrom) / 3400);
      const e = k * k * (3 - 2 * k);
      const cup = c.cups[0]!;
      const from = new THREE.Vector3(cup.x - Math.cos(c.tee.aim) * 1.5, cup.rim + 2.2, cup.z - Math.sin(c.tee.aim) * 1.5);
      const behind = this.behind(focus, c.tee.aim, this.pitch, this.dist);
      wantPos.lerpVectors(from.clone().add(new THREE.Vector3(0, span * 0.35, 0)), behind.pos, e);
      wantLook.lerpVectors(new THREE.Vector3(cup.x, cup.rim, cup.z), behind.look, e);
      this.camPos.copy(wantPos);
      this.camLook.copy(wantLook);
      this.camReady = true;
    } else if (mode === "overview") {
      const h = span * 0.95 + 3;
      wantPos.set(cx - Math.cos(this.yaw) * span * 0.35, h, cz - Math.sin(this.yaw) * span * 0.35);
      wantLook.set(cx, 0, cz);
    } else {
      const { pos, look } = this.behind(focus, this.yaw, this.pitch, this.dist);
      wantPos.copy(pos);
      wantLook.copy(look);
    }
    if (!this.camReady) {
      this.camPos.copy(wantPos);
      this.camLook.copy(wantLook);
      this.camReady = true;
    } else if (mode !== "intro") {
      const k = 1 - Math.exp(-dt * (this.isRolling(this.o.me) ? 5 : 9));
      this.camPos.lerp(wantPos, k);
      this.camLook.lerp(wantLook, k);
    }
    // La caméra ne passe jamais sous le sol
    const ground = this.scene.groundAt(this.camPos.x, this.camPos.z);
    if (this.camPos.y < ground + 0.12) this.camPos.y = ground + 0.12;
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }

  private behind(at: { x: number; y: number; z: number }, yaw: number, pitch: number, dist: number) {
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw);
    const pos = new THREE.Vector3(at.x - dx * dist * Math.cos(pitch), at.y + dist * Math.sin(pitch), at.z - dz * dist * Math.cos(pitch));
    const look = new THREE.Vector3(at.x + dx * dist * 0.45, at.y + 0.05, at.z + dz * dist * 0.45);
    return { pos, look };
  }

  // -------------------------------------------------------------------------
  // Les commandes
  // -------------------------------------------------------------------------

  private onDown = (e: PointerEvent) => {
    if (this.paused) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === "touch" && this.touches.size === 2) {
      // Deux doigts : on tourne et on zoome, la visée s'annule
      this.cancelAim();
      const [a, b] = [...this.touches.values()];
      this.pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), dist: this.dist };
      this.orbit = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2, id: -1, yaw: this.yaw, pitch: this.pitch };
      return;
    }
    if (e.button === 2 || e.button === 1 || (e.button === 0 && (e.altKey || e.ctrlKey))) {
      this.orbit = { x: e.clientX, y: e.clientY, id: e.pointerId, yaw: this.yaw, pitch: this.pitch };
      return;
    }
    if (e.button === 0) {
      // Viser : on tire en arrière, d'où qu'on parte, comme une fronde
      if (this.camMode === "overview") this.toggleOverview(false);
      this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.aimPower = 0;
    }
  };

  private onMove = (e: PointerEvent) => {
    if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.orbit && this.touches.size >= 2) {
      const [a, b] = [...this.touches.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.dist = clamp(this.pinch.dist * (this.pinch.d / Math.max(20, d)), 1.1, 9);
      const mx = (a!.x + b!.x) / 2;
      const my = (a!.y + b!.y) / 2;
      this.yaw = this.orbit.yaw + ((mx - this.orbit.x) / this.host.clientWidth) * Math.PI * 1.4;
      this.pitch = clamp(this.orbit.pitch + ((my - this.orbit.y) / this.host.clientHeight) * 1.4, 0.12, 1.35);
      return;
    }
    if (this.orbit && e.pointerId === this.orbit.id) {
      this.yaw = this.orbit.yaw + ((e.clientX - this.orbit.x) / this.host.clientWidth) * Math.PI * 1.6;
      this.pitch = clamp(this.orbit.pitch + ((e.clientY - this.orbit.y) / this.host.clientHeight) * 1.6, 0.12, 1.35);
      return;
    }
    if (this.drag && e.pointerId === this.drag.id) this.updateAim(e.clientX, e.clientY);
  };

  private onUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    if (this.orbit && (e.pointerId === this.orbit.id || this.orbit.id === -1)) {
      if (this.orbit.id !== -1 || this.touches.size === 0) this.orbit = null;
      return;
    }
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const moved = Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y);
    const power = this.aimPower;
    const angle = this.aimAngle;
    this.drag = null;
    this.o.onAim?.(angle, -1);
    if (moved < MIN_DRAG || power < 0.02) return;
    this.shoot(angle, power);
  };

  /** La direction et la force d'après le glissé (l'opposé de la direction où l'on tire) */
  private updateAim(x: number, y: number) {
    const d = this.drag!;
    const dx = x - d.x;
    const dy = y - d.y;
    const len = Math.hypot(dx, dy);
    const full = Math.min(this.host.clientWidth, this.host.clientHeight) * 0.42;
    this.aimPower = clamp((len - MIN_DRAG * 0.5) / full, 0, 1);
    if (len > 2) {
      // L'écran vers le haut, c'est droit devant la caméra ; vers la droite, sa droite
      const fx = Math.cos(this.yaw);
      const fz = Math.sin(this.yaw);
      const rx = -fz;
      const rz = fx;
      const wx = -dx * rx + dy * fx;
      const wz = -dx * rz + dy * fz;
      this.aimAngle = Math.atan2(wz, wx);
    }
    const now = performance.now();
    if (now - this.lastAimSent > 90) {
      this.lastAimSent = now;
      this.o.onAim?.(this.aimAngle, this.aimPower);
    }
  }

  private cancelAim() {
    if (this.drag) this.o.onAim?.(this.aimAngle, -1);
    this.drag = null;
  }

  /** Frapper : la balle part tout de suite à l'écran, le coup part au serveur */
  shoot(angle: number, power: number) {
    if (!this.canShoot() || !this.view || !this.course) return;
    const me = this.me()!;
    const at = Math.max(me.restAt, Math.floor(this.tickNow()));
    const shot: GolfShot = {
      a: angle,
      p: power,
      at,
      from: [...me.ball],
      end: at,
      out: "rest",
      to: [...me.ball],
      lost: null,
      n: me.cur + 1,
    };
    this.replays.set(me.id, { ...this.newReplay(`${this.view.hole}:pending`, shot) });
    this.o.onShot?.(me.id, true, power);
    this.o.onShoot(this.view.hole, angle, power, at);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dist = clamp(this.dist * Math.exp(e.deltaY * 0.0012), 1.1, 9);
  };

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
    this.keys.add(e.key);
    if (e.key === "v" || e.key === "V") this.toggleOverview();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key);
  };

  /** Les flèches tournent la caméra autour de sa balle */
  private keysTurn(dt: number) {
    if (this.paused) return;
    if (this.keys.has("ArrowLeft") || this.keys.has("q") || this.keys.has("a")) this.yaw -= dt * 1.6;
    if (this.keys.has("ArrowRight") || this.keys.has("d")) this.yaw += dt * 1.6;
    if (this.keys.has("ArrowUp")) this.pitch = clamp(this.pitch - dt * 0.8, 0.12, 1.35);
    if (this.keys.has("ArrowDown")) this.pitch = clamp(this.pitch + dt * 0.8, 0.12, 1.35);
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
    window.removeEventListener("keyup", this.onKeyUp);
    this.scene.dispose();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

void BALL_R;
