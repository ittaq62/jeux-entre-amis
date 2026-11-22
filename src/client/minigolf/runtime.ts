// Le jeu à l'écran : la scène du trou, la balle de chacun rejouée à partir de ses coups (la même physique que le
// serveur, au même pas de temps), la visée, la caméra qui tourne autour de la balle, suit celle de qui joue ou montre
// tout le trou, et ce qui se passe (chocs, plouf, balle dans le trou) pour le son et l'écran.
//
// La visée, à la souris comme au doigt : on tourne la caméra autour de sa balle pour choisir la direction (un pointillé
// court la montre), puis on attrape sa balle et on la tire vers soi pour doser la force ; un écart sur le côté affine la
// direction, on lâche pour frapper. Revenir au point de départ, Échap ou le bouton droit annulent.

import { navDist, navOf } from "../../shared/games/minigolf/bot.ts";
import { BALL_R, type Course } from "../../shared/games/minigolf/course.ts";
import { courseOf, type HoleRef } from "../../shared/games/minigolf/courses.ts";
import { bonusCourse, bonusSpots } from "../../shared/games/minigolf/bonus.ts";
import type { BallLook } from "../../shared/games/minigolf/looks.ts";
import { physOf, type GolfShot, type MinigolfConfig } from "../../shared/games/minigolf/match.ts";
import type { MinigolfView } from "../../shared/games/minigolf/net.ts";
import {
  moving,
  restingBall,
  solidOf,
  stepWorld,
  strike,
  STEPS_PER_S,
  worldBalls,
  type Ball,
  type PhysEvent,
  type PhysOpts,
} from "../../shared/games/minigolf/physics.ts";
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
  /** La force où il tire sa balle (de 0 à 1), null s'il ne la tire pas */
  power: number | null;
  /** La force de son coup d'avant sur ce trou (un repère sur la jauge) */
  lastPower: number | null;
  /** Sa balle roule */
  rolling: boolean;
  /** Il peut jouer */
  canShoot: boolean;
  /** On voit tout le trou d'en haut */
  overview: boolean;
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

/**
 * Ce qu'on rejoue d'un coup : les balles de la physique, celle qu'on frappe d'abord puis celles qu'elle peut pousser,
 * avancées ensemble pas à pas jusqu'à maintenant (le même calcul que le serveur)
 */
interface Replay {
  key: string;
  balls: Ball[];
  /** Le joueur de chaque balle */
  ids: string[];
  opts: PhysOpts[];
  solid: boolean[];
  tick: number;
  shot: GolfShot;
  /** Où revient chaque balle si elle se perd (d'où elle est partie) */
  home: [number, number, number][];
  /** Le pas où elle s'est perdue, le moment où elle est tombée dans le trou (pour l'animation) */
  lostAt: (number | null)[];
  inAt: (number | null)[];
}

/** En dessous de cette force, il n'a pas vraiment tiré sa balle : lâcher annule */
export const MIN_PULL = 0.03;
/** Autour de sa balle, à l'écran, la zone où on l'attrape (en pixels ; plus large au doigt, et en dessous) */
const GRAB_TOUCH = 92;
const GRAB_MOUSE = 72;

export class GolfRuntime {
  readonly scene: HoleScene;
  private view: MinigolfView | null = null;
  private players: PlayerInfo[] = [];
  private course: Course | null = null;
  private ref: HoleRef | null = null;
  private cfg: MinigolfConfig | null = null;
  private replays = new Map<string, Replay>();
  /** Le coup rejoué qui montre la balle de chacun (le sien, ou celui d'un autre qui l'a poussée) */
  private owner = new Map<string, { r: Replay; i: number }>();
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
  /** Ce que la caméra monte (en angle) quand un mur derrière la balle la cacherait */
  private lift = 0;
  // Sa balle attrapée en (x, y) : `lx` est la dernière position du pointeur sur le côté, `full` le recul (en pixels) de
  // la pleine force
  private pull: { x: number; lx: number; y: number; id: number; full: number } | null = null;
  private aimAngle = 0;
  private aimPower = 0;
  private lastPower: number | null = null;
  private aimSent = "-";
  private aimSentAt = 0;
  private orbit: { x: number; y: number; id: number; yaw: number; pitch: number } | null = null;
  private pinch: { d: number; dist: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private keys = new Set<string>();
  private holeKey = "";
  private introFrom = 0;
  /** Le survol du premier trou attend le départ commun (que chacun ait chargé le parcours) */
  private introHeld = false;
  // Qui la caméra suit (chacun son tour : celui qui joue), et depuis quand ; le joueur dont c'était le tour
  private focus: string | null = null;
  private focusAt = 0;
  private turnOf: string | null = null;
  /** Une direction vers laquelle la caméra tourne d'elle-même (au début d'un tour, la visée de celui qu'on regarde) */
  private yawGoal: number | null = null;
  /** La dernière fois qu'il a tourné la caméra lui-même : on le laisse regarder où il veut un moment */
  private lookedAt = -1e9;
  /** Où visent les autres (chacun son tour : on voit la flèche de celui qui joue) */
  private others = new Map<string, { a: number; p: number }>();
  private hudKey = "";

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
    window.addEventListener("blur", this.onBlur);
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
      this.owner.clear();
      this.others.clear();
      this.yaw = this.course.tee.aim;
      this.yawGoal = null;
      this.pitch = 0.5;
      this.dist = 2.2;
      this.camReady = false;
      this.lastPower = null;
      this.turnOf = null;
      this.focus = null;
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
      this.others.delete(p.id);
      if (s.skip) {
        // Le temps de son tour est passé : le coup compte, la balle n'a pas bougé
        const ball = restingBall(this.course!, s.from[0], s.from[1], s.from[2]);
        const r: Replay = {
          key: k,
          balls: [ball],
          ids: [p.id],
          opts: [],
          solid: [true],
          tick: s.at,
          shot: s,
          home: [s.from],
          lostAt: [null],
          inAt: [null],
        };
        this.replays.set(p.id, r);
        this.own(r);
        continue;
      }
      // Notre propre coup, déjà lancé à l'écran avec les mêmes valeurs : on garde l'animation
      if (old && old.shot.at === s.at && old.shot.a === s.a && old.shot.p === s.p && old.key.startsWith(`${v.hole}:pending`)) {
        old.key = k;
        old.shot = s;
        continue;
      }
      this.replays.set(p.id, this.newReplay(k, s, p.id));
      // Un coup qui part maintenant (pas un coup d'avant, rejoué à l'arrivée)
      if (prev && this.tickNow() - s.at < STEPS_PER_S * 0.6) this.o.onShot?.(p.id, p.id === this.o.me, s.p);
    }
    // Chacun son tour : la main passe, la caméra va voir la balle de celui qui joue
    const active = this.activeId();
    if (active !== this.turnOf) {
      this.turnOf = active;
      if (active) this.startTurn(active);
    }
  }

  /** Un autre joueur vise (p < 0 : il ne vise plus) */
  setOtherAim(id: string, a: number, p: number) {
    if (id === this.o.me) return;
    if (p < 0) this.others.delete(id);
    else this.others.set(id, { a, p });
    // On regarde sa balle : la caméra se tourne doucement vers là où il vise
    if (p >= 0 && id === this.activeId() && performance.now() - this.lookedAt > 2500 && !this.overview) this.yawGoal = a;
  }

  /** Chacun son tour : celui qui joue (null : personne, ou tout le monde en même temps) */
  private activeId(): string | null {
    const v = this.view;
    if (!v?.cfg.turns || v.turn < 0) return null;
    return v.players[v.turn]?.id ?? null;
  }

  /** Son tour commence : la caméra rejoint sa balle et se tourne vers où il faut aller */
  private startTurn(id: string) {
    if (this.focus !== id) {
      this.focus = id;
      this.focusAt = performance.now();
    }
    const mine = id === this.o.me;
    if (mine) this.cancelAim();
    if (mine || performance.now() - this.lookedAt > 2500) this.yawGoal = this.wayFrom(id);
  }

  /** La direction à prendre depuis la balle d'un joueur : le trou s'il est en vue, sinon le chemin qui y mène */
  private wayFrom(id: string): number {
    const c = this.course!;
    const p = this.view!.players.find((x) => x.id === id);
    if (!p) return c.tee.aim;
    const [x, , z] = p.ball;
    // Encore au départ (un tour passé sans tirer) : la direction du départ
    if (Math.hypot(x - c.tee.x, z - c.tee.z) < 0.1) return c.tee.aim;
    let best = this.yaw;
    let bestD = Infinity;
    for (const cup of c.cups) {
      const d = Math.hypot(cup.x - x, cup.z - z);
      const a = Math.atan2(cup.z - z, cup.x - x);
      if (d < 7 && d < bestD && this.scene.reach(x, z, a, d) >= d - 0.05) {
        best = a;
        bestD = d;
      }
    }
    if (bestD < Infinity) return best;
    const nav = navOf(c);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const step = Math.min(0.8, this.scene.reach(x, z, a, 0.8));
      if (step < 0.2) continue;
      const d = navDist(nav, x + Math.cos(a) * step, z + Math.sin(a) * step);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  /** La balle que la caméra suit */
  private focusId(): string | null {
    const v = this.view!;
    if (v.cfg.turns) return this.activeId() ?? this.focus ?? v.players[v.order?.[0] ?? 0]?.id ?? null;
    if (this.o.me) return this.o.me;
    // Il regarde une partie où tout le monde joue en même temps : la dernière balle partie
    if (!this.isRolling(this.focus))
      for (const p of v.players)
        if (this.isRolling(p.id)) {
          this.focus = p.id;
          this.focusAt = performance.now();
          break;
        }
    return this.focus ?? v.players[0]?.id ?? null;
  }

  /**
   * Le coup à rejouer : la balle frappée, et les balles que le serveur dit poussées (dans le même ordre). Pour son propre
   * coup, pas encore confirmé, toutes les balles sur le parcours (le serveur fera le même calcul)
   */
  private newReplay(key: string, s: GolfShot, id: string, pending = false): Replay {
    const c = this.course!;
    const v = this.view!;
    const others: { id: string; at: [number, number, number] }[] = pending
      ? v.cfg.turns
        ? v.players
            .filter((q) => q.id !== id && !q.done && q.cur > 0)
            .map((q) => ({ id: q.id, at: [...q.ball] as [number, number, number] }))
        : []
      : (s.hits ?? []).map((h) => ({ id: h.id, at: h.from }));
    const balls = worldBalls(
      c,
      { x: s.from[0], y: s.from[1], z: s.from[2] },
      others.map((o) => ({ x: o.at[0], y: o.at[1], z: o.at[2] })),
    );
    strike(c, balls[0]!, s.a, s.p, s.mods);
    const opts = balls.map((_, i) => physOf(this.cfg!, this.ref!, i === 0 ? s.mods : undefined));
    const r: Replay = {
      key,
      balls,
      ids: [id, ...others.map((o) => o.id)],
      opts,
      solid: solidOf(balls.length, opts[0]!),
      tick: s.at,
      shot: s,
      home: [s.to, ...others.map((o) => o.at)],
      lostAt: balls.map(() => null),
      inAt: balls.map(() => null),
    };
    this.own(r);
    return r;
  }

  /** Ce coup montre désormais ces balles (sauf celle qu'un coup plus récent montre déjà) */
  private own(r: Replay) {
    r.ids.forEach((id, i) => {
      const was = this.owner.get(id);
      if (!was || was.r === r || was.r.shot.at <= r.shot.at) this.owner.set(id, { r, i });
    });
  }

  /** La balle de la physique d'un joueur, si un coup rejoué la montre */
  private physBall(id: string | null): Ball | null {
    if (!id) return null;
    const o = this.owner.get(id);
    return o ? o.r.balls[o.i]! : null;
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
    if (v.cfg.turns && (this.activeId() !== p.id || v.turnShot)) return false;
    const b = this.physBall(p.id);
    if (b && moving(b)) return false;
    return this.tickNow() >= p.restAt;
  }

  /** La position de la balle d'un joueur maintenant */
  private ballPos(id: string): { x: number; y: number; z: number } | null {
    const v = this.view;
    const p = v?.players.find((x) => x.id === id);
    if (!p) return null;
    // Là où la physique l'a menée (elle roule, ou vient de s'arrêter) ; sinon, là où le serveur la dit
    const b = this.physBall(id);
    if (b && (moving(b) || b.mode === "rest")) return { x: b.x, y: b.y, z: b.z };
    return { x: p.ball[0], y: p.ball[1], z: p.ball[2] };
  }

  setPaused(on: boolean) {
    this.paused = on;
    if (on) this.cancelAim();
  }

  /** Préparer la scène avant le départ (voir HoleScene.prepare) */
  prepare(onProgress?: (share: number) => void) {
    return this.scene.prepare(onProgress);
  }

  /** Retenir le survol du trou sur son premier plan (jusqu'au départ commun), puis le laisser partir de là */
  holdIntro(on: boolean) {
    if (this.introHeld && !on) this.introFrom = performance.now();
    this.introHeld = on;
  }

  /** Voir tout le trou d'en haut, ou revenir derrière sa balle */
  toggleOverview(on?: boolean) {
    this.overview = on ?? !this.overview;
    this.camMode = this.overview ? "overview" : "aim";
    if (this.overview) this.cancelAim();
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
    if (this.pull && !this.canShoot()) this.cancelAim();
    this.keysTurn(dt);
    this.turnYaw(dt);
    this.placeBalls(tick);
    this.updateCamera(dt, now);
    this.updateFlags(dt);
    this.sendAim(now);
    const t = tick / STEPS_PER_S;
    this.scene.render(t, dt);
    const hud: HudState = {
      power: this.pull ? this.aimPower : null,
      lastPower: this.lastPower,
      rolling: this.isRolling(this.o.me),
      canShoot: this.canShoot(),
      overview: this.overview,
      fps: Math.round(this.scene.fps),
    };
    // L'écran ne se redessine que si quelque chose a changé
    const key = `${hud.power?.toFixed(3)}|${hud.lastPower}|${hud.rolling}|${hud.canShoot}|${hud.overview}|${hud.fps}`;
    if (key !== this.hudKey) {
      this.hudKey = key;
      this.o.onHud?.(hud);
    }
  };

  /** La caméra tourne d'elle-même vers la direction voulue, sans à-coup */
  private turnYaw(dt: number) {
    if (this.yawGoal === null) return;
    const d = wrap(this.yawGoal - this.yaw);
    if (Math.abs(d) < 0.002) {
      this.yaw = this.yawGoal;
      this.yawGoal = null;
      return;
    }
    this.yaw += d * (1 - Math.exp(-dt * 4.5));
  }

  /** Chacun son tour : les autres voient où il vise (sa direction, puis sa force quand il tire sa balle) */
  private sendAim(now: number) {
    if (!this.cfg?.turns || !this.o.me) return;
    const can = this.canShoot();
    const a = this.pull ? this.aimAngle : this.yaw;
    const p = this.pull ? this.aimPower : 0;
    const key = can ? `${a.toFixed(2)}:${p.toFixed(2)}` : "-";
    if (key === this.aimSent) return;
    if (can && now - this.aimSentAt < 110) return;
    this.aimSent = key;
    this.aimSentAt = now;
    this.o.onAim?.(a, can ? p : -1);
  }

  private isRolling(id: string | null): boolean {
    const b = this.physBall(id);
    return Boolean(b && moving(b));
  }

  /** Chaque coup rejoué avance jusqu'au pas actuel (sans bruit pour ce qui est déjà loin dans le passé) */
  private advance(tick: number) {
    const c = this.course!;
    const target = Math.floor(tick);
    for (const r of this.replays.values()) {
      if (r.opts.length === 0) continue;
      while (r.tick < target && r.balls.some(moving)) {
        r.tick++;
        const live = target - r.tick < STEPS_PER_S * 0.25;
        stepWorld(
          c,
          r.balls,
          r.tick,
          r.opts,
          r.solid,
          live
            ? (i, e, b) => {
                // Les bulles bonus : seulement pour la balle frappée (le serveur ne compte que celles-là)
                if (i > 0 && e.k === "item") return;
                this.emit(r.ids[i]!, r.ids[i] === this.o.me, e, b);
              }
            : undefined,
        );
        r.balls.forEach((b, i) => {
          if (b.mode === "in" && r.inAt[i] === null) r.inAt[i] = performance.now();
          if (b.mode === "lost" && r.lostAt[i] === null) r.lostAt[i] = r.tick;
        });
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
      const o = this.owner.get(p.id);
      const b = o ? o.r.balls[o.i]! : null;
      let pos = { x: p.ball[0], y: p.ball[1], z: p.ball[2] };
      let visible = !(p.done && p.doneAt <= tick && (!b || b.mode === "in"));
      // Chacun son tour : une balle pas encore jouée reste dans la poche de son joueur jusqu'à son tour (sinon, au
      // départ, toutes les balles se cacheraient l'une l'autre)
      if (v.cfg.turns && p.cur === 0 && !o && p.id !== this.activeId()) visible = false;
      if (o && b) {
        if (b.mode === "lost") {
          // Perdue : on la voit encore un instant là où elle est, puis elle revient d'où elle était partie
          const at = o.r.lostAt[o.i] ?? o.r.tick;
          visible = tick < at + STEPS_PER_S * 0.6;
          const home = o.r.home[o.i]!;
          pos = visible ? { x: b.x, y: b.y, z: b.z } : { x: home[0], y: home[1], z: home[2] };
          if (!visible) visible = !p.done;
        } else if (b.mode === "in") {
          const inAt = o.r.inAt[o.i] ?? null;
          const k = inAt === null ? 1 : Math.min(1, (performance.now() - inAt) / 350);
          pos = { x: b.x, y: b.y + 0.06, z: b.z };
          model.sink(k);
          visible = k < 1;
        } else {
          pos = { x: b.x, y: b.y, z: b.z };
        }
      }
      if (!b || b.mode !== "in") model.sink(0);
      model.show(visible);
      model.set(pos.x, pos.y, pos.z, this.scene.groundAt(pos.x, pos.z));
    }
    // La visée : la sienne quand il peut jouer (l'anneau l'invite à attraper sa balle) ; chacun son tour, celle de
    // celui qui joue
    const mine = this.o.me ? this.ballPos(this.o.me) : null;
    if (mine && this.canShoot()) {
      this.scene.setAim(mine, this.pull ? this.aimAngle : this.yaw, this.pull ? this.aimPower : 0);
      this.scene.setGrab(this.pull || this.overview ? null : mine, performance.now() / 1000);
      return;
    }
    this.scene.setGrab(null);
    const id = this.activeId();
    const o = id ? this.others.get(id) : undefined;
    const at = id && o && !this.isRolling(id) ? this.ballPos(id) : null;
    this.scene.setAim(at, o?.a ?? 0, o?.p ?? 0, true);
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
    const fid = this.focusId();
    const focus = (fid && this.ballPos(fid)) || { x: c.tee.x, y: c.tee.y, z: c.tee.z };
    const wantPos = new THREE.Vector3();
    const wantLook = new THREE.Vector3();
    const b = c.box;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    let mode = this.camMode;
    if (mode === "intro" && this.introHeld) this.introFrom = now;
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
      // Un mur entre la balle et la caméra : elle monte juste assez pour voir la balle par-dessus
      const need = this.scene.clearPitch(focus, this.yaw + Math.PI, this.dist * Math.cos(this.pitch));
      const want = Math.max(0, Math.min(1.3, need) - this.pitch);
      this.lift += (want - this.lift) * (1 - Math.exp(-dt * 5));
      const { pos, look } = this.behind(focus, this.yaw, this.pitch + this.lift, this.dist);
      wantPos.copy(pos);
      wantLook.copy(look);
    }
    if (!this.camReady) {
      this.camPos.copy(wantPos);
      this.camLook.copy(wantLook);
      this.camReady = true;
    } else if (mode !== "intro") {
      // D'une balle à l'autre, la caméra glisse plus doucement
      const glide = now - this.focusAt < 1400;
      const k = 1 - Math.exp(-dt * (glide ? 3.2 : this.isRolling(fid) ? 5 : 9));
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
    // Elle regarde un peu devant la balle ; d'autant moins qu'elle regarde de haut (la balle reste au milieu de l'écran)
    const ahead = dist * 0.45 * Math.min(1, Math.cos(pitch) / Math.cos(0.5));
    const look = new THREE.Vector3(at.x + dx * ahead, at.y + 0.05, at.z + dz * ahead);
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
      this.looked();
      return;
    }
    // Le bouton droit pendant qu'il tire sa balle : il annule
    if (this.pull && e.button === 2) {
      this.cancelAim();
      return;
    }
    if (e.button === 2 || e.button === 1 || (e.button === 0 && (e.altKey || e.ctrlKey))) {
      this.startOrbit(e);
      return;
    }
    if (this.orbit?.id === e.pointerId) this.orbit = null;
    if (e.button !== 0 || this.pull) return;
    if (this.camMode === "overview") {
      this.toggleOverview(false);
      return;
    }
    const room = this.canShoot() ? this.onMyBall(e.clientX, e.clientY, e.pointerType === "touch") : null;
    if (room !== null) {
      // Il attrape sa balle : il la tire vers lui pour doser (la pleine force tient dans la place sous la balle)
      const full = clamp(Math.min(Math.min(this.host.clientWidth, this.host.clientHeight) * 0.36, room), 100, 300);
      this.pull = { x: e.clientX, lx: e.clientX, y: e.clientY, id: e.pointerId, full };
      this.capture(e);
      this.aimAngle = this.yaw;
      this.aimPower = 0;
      this.yawGoal = null;
      return;
    }
    // Ailleurs : il tourne la caméra (et sa visée) autour de la balle
    this.startOrbit(e);
  };

  private startOrbit(e: PointerEvent) {
    this.orbit = { x: e.clientX, y: e.clientY, id: e.pointerId, yaw: this.yaw, pitch: this.pitch };
    this.looked();
    this.capture(e);
  }

  /** Le pointeur reste à nous tant que le bouton est tenu, même hors de la fenêtre */
  private capture(e: PointerEvent) {
    try {
      this.scene.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // un pointeur déjà relâché
    }
  }

  /** Il a tourné la caméra lui-même */
  private looked() {
    this.lookedAt = performance.now();
    this.yawGoal = null;
  }

  /**
   * Le pointeur est-il sur sa balle (à l'écran, avec de la marge) ? Si oui : la place qu'il a pour la tirer vers lui
   * (en pixels, jusqu'au bas de l'écran) ; sinon null
   */
  private onMyBall(x: number, y: number, touch: boolean): number | null {
    const at = this.o.me ? this.ballPos(this.o.me) : null;
    if (!at) return null;
    const p = new THREE.Vector3(at.x, at.y, at.z).project(this.scene.camera);
    if (p.z < -1 || p.z > 1) return null;
    const rect = this.scene.renderer.domElement.getBoundingClientRect();
    const sx = rect.left + ((p.x + 1) / 2) * rect.width;
    const sy = rect.top + ((1 - p.y) / 2) * rect.height;
    const r = touch ? GRAB_TOUCH : GRAB_MOUSE;
    // Plus large en dessous de la balle : c'est par là qu'on la tire
    const dx = (x - sx) / (r * 1.2);
    const dy = (y - sy) / (y > sy ? r * 1.7 : r);
    if (dx * dx + dy * dy > 1) return null;
    return Math.max(0, rect.bottom - y - 12);
  }

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
      this.looked();
      return;
    }
    if (this.orbit && e.pointerId === this.orbit.id) {
      this.yaw = this.orbit.yaw + ((e.clientX - this.orbit.x) / this.host.clientWidth) * Math.PI * 1.6;
      this.pitch = clamp(this.orbit.pitch + ((e.clientY - this.orbit.y) / this.host.clientHeight) * 1.6, 0.12, 1.35);
      this.looked();
      return;
    }
    if (this.pull && e.pointerId === this.pull.id) this.updateAim(e.clientX, e.clientY, e.shiftKey);
  };

  private onUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    if (this.orbit && (e.pointerId === this.orbit.id || this.orbit.id === -1)) {
      if (this.orbit.id !== -1 || this.touches.size === 0) this.orbit = null;
      return;
    }
    if (!this.pull || e.pointerId !== this.pull.id) return;
    const power = this.aimPower;
    const angle = this.aimAngle;
    this.pull = null;
    // Revenu au point de départ : il ne frappe pas
    if (power < MIN_PULL) return;
    this.lastPower = power;
    this.shoot(angle, power);
    // La caméra se range derrière le coup
    this.yawGoal = angle;
  };

  /**
   * La force d'après le recul (vers le bas de l'écran, c'est-à-dire vers soi) ; la direction s'affine par l'écart sur
   * le côté, comme un élastique : tiré vers la droite, la balle part un peu plus à gauche. Maj : plus finement encore
   */
  private updateAim(x: number, y: number, fine: boolean) {
    const d = this.pull!;
    this.aimPower = clamp((y - d.y - 6) / d.full, 0, 1);
    this.aimAngle -= (x - d.lx) * (((fine ? 0.3 : 1) * 0.5) / d.full);
    d.lx = x;
  }

  private cancelAim() {
    this.pull = null;
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
    this.replays.set(me.id, this.newReplay(`${this.view.hole}:pending`, shot, me.id, true));
    this.o.onShot?.(me.id, true, power);
    this.o.onShoot(this.view.hole, angle, power, at);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dist = clamp(this.dist * Math.exp(e.deltaY * 0.0012), 1.1, 9);
  };

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
    const k = keyOf(e);
    this.keys.add(k);
    if (k === "v") this.toggleOverview();
    if (k === "Escape") this.cancelAim();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(keyOf(e));
  };

  private onBlur = () => {
    this.keys.clear();
    this.cancelAim();
  };

  /** Les flèches tournent la caméra autour de sa balle (Maj : doucement) ; pendant qu'il tire sa balle, elles affinent */
  private keysTurn(dt: number) {
    if (this.paused) return;
    const slow = this.keys.has("Shift") ? 0.25 : 1;
    let turn = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("q") || this.keys.has("a")) turn -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("d")) turn += 1;
    if (turn !== 0) {
      if (this.pull) this.aimAngle += turn * dt * 0.3 * slow;
      else {
        this.yaw += turn * dt * 1.6 * slow;
        this.looked();
      }
    }
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
    window.removeEventListener("blur", this.onBlur);
    this.scene.dispose();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Un angle ramené entre -π et π */
function wrap(a: number): number {
  return a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
}

/** La touche, sans majuscule (Maj ne la change pas) */
function keyOf(e: KeyboardEvent): string {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

void BALL_R;
