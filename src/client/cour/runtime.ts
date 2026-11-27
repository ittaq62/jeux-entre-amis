// L'écran du grand jeu : il reçoit la partie (plusieurs fois par seconde pendant une épreuve), monte le décor de
// l'épreuve en cours, place la foule, joue les cinématiques (l'arrivée, la révélation de chaque épreuve, les éliminés,
// l'accéléré, le podium) et dirige la caméra en douceur. Les gestes du joueur passent par l'épreuve, qui les prédit
// s'il le faut et les envoie au serveur. L'interface (React) reçoit un petit état plusieurs fois par seconde.

import * as THREE from "three";
import type { EpreuveId } from "../../shared/games/cour/epreuves.ts";
import type { EpInput, MatchView, Phase } from "../../shared/games/cour/match.ts";
import type { Candidate } from "../../shared/games/cour/net.ts";
import { headCanvas } from "../bolides/scene/faces.ts";
import { nextFrame, warmThree } from "../lib/prepare.ts";
import { Bursts } from "./scene/bursts.ts";
import { Arrival, Podium } from "./scene/ceremony.ts";
import { Actor, BlobShadows, nameTag, type ActorTarget } from "./scene/crowd.ts";
import { Carillon } from "./scene/host.ts";
import { path, shot, type PointerInfo, type Shot, type Stage, type StageCtx } from "./scene/stage.ts";
import { makeStage } from "./scene/stages/index.ts";
import { TOUCH, World } from "./scene/world.ts";
import * as sfx from "./sfx.ts";

export interface HudState {
  phase: Phase;
  round: number;
  ep: EpreuveId | null;
  /** Le rang de l'épreuve (sans la finale) et leur nombre */
  index: number;
  rounds: number;
  alive: number;
  total: number;
  /** Moi : en lice, éliminé (comment, à quelle épreuve), ou spectateur */
  me: { alive: boolean; how: string | null; round: number } | null;
  /** Ce que l'épreuve affiche */
  stage: Record<string, unknown> | null;
  /** Le temps (0 à 1) de la cinématique en cours */
  k: number;
  skipped: boolean;
  fps: number;
}

export interface RuntimeOptions {
  me: string | null;
  serverNow: () => number;
  send: (i: EpInput) => void;
  skip: () => void;
  onHud: (h: HudState) => void;
  /** Une image fixe (les affiches) : pas de qualité automatique */
  fixed?: boolean;
}

/** Les événements où un candidat passe l'épreuve (ou une manche) */
const PASSED = new Set(["arrive", "detache", "ciel", "assis", "traverse"]);
/** L'éclat de chaque salut de la boutique : le genre d'éclats, et leur force */
const CHEER_BURST: Record<string, [string, number]> = {
  confettis: ["confettis", 1],
  bulles: ["mousse", 0.6],
  feuilles: ["plumes", 0.8],
  paillettes: ["or", 1],
  feu: ["confettis", 1.8],
};

export class CourRuntime {
  readonly world: World;
  private actors = new Map<string, Actor>();
  private actorList: Actor[] = [];
  private shadows: BlobShadows | null = null;
  private bursts: Bursts;
  private host: Carillon;
  private stage: Stage | null = null;
  private stageKey = "";
  private arrival: Arrival | null = null;
  private podium: Podium | null = null;
  private roster: Candidate[] = [];
  private m: MatchView | null = null;
  private raf = 0;
  private last = 0;
  private lastHud = 0;
  private lastFx = 0;
  private camPos = new THREE.Vector3(60, 40, 120);
  private camLook = new THREE.Vector3(0, 2, 0);
  private camFov = 50;
  private paused = false;
  private skipped = false;
  private skippedPhase = "";
  private tags = new Map<string, THREE.Sprite>();
  private disposed = false;
  private ctx: StageCtx;
  private resultsFocus: string[] = [];

  constructor(
    el: HTMLElement,
    private o: RuntimeOptions,
  ) {
    this.world = new World(el, { fixed: o.fixed });
    this.bursts = new Bursts(this.world.keep);
    this.world.scene.add(this.bursts.mesh);
    this.host = new Carillon(this.world.keep);
    this.host.fly(0, 6, 4, 0, 20, true);
    this.world.scene.add(this.host.group);
    this.ctx = {
      world: this.world,
      actors: this.actors,
      roster: [],
      me: o.me,
      serverNow: o.serverNow,
      send: (i) => o.send(i),
      sound: (name, opts) => sfx.stageSound(name, opts ?? {}),
      burst: (kind, x, y, z, opts) => this.bursts.burst(kind, x, y, z, opts),
    };
    this.bindInput();
  }

  /** La foule de la partie : chaque candidat construit avec sa tête dessinée (une seule fois) */
  async prepare(roster: Candidate[], onProgress?: (share: number) => void) {
    this.roster = roster;
    this.ctx.roster = roster;
    const lite = TOUCH || roster.length > 24;
    let done = 0;
    const heads = await Promise.all(
      roster.map((c) =>
        headCanvas(c.avatar)
          .catch(() => null)
          .then((h) => {
            onProgress?.((++done / roster.length) * 0.45);
            return h;
          }),
      ),
    );
    if (this.disposed) return;
    roster.forEach((c, i) => {
      const a = new Actor(c, heads[i] ?? null, lite && c.userId === null);
      a.model.mesh.castShadow = !TOUCH;
      this.actors.set(c.id, a);
      this.actorList.push(a);
      this.world.people.add(a.group);
      if (c.userId) {
        const tag = nameTag(c.name, "#ffd84a", c.id === this.o.me);
        tag.position.y = 2.15;
        a.group.add(tag);
        this.tags.set(c.id, tag);
      }
    });
    this.shadows = new BlobShadows(roster.length + 8);
    this.world.scene.add(this.shadows.mesh);
    if (this.m) this.ensureScene(this.m, this.o.serverNow());
    await nextFrame();
    // Une image de chaque chose, cachée derrière l'écran de chargement : les programmes compilés d'avance
    await warmThree(this.world.renderer, this.world.scene, this.world.camera, { onProgress: (k) => onProgress?.(0.45 + k * 0.55) });
  }

  setMatch(m: MatchView) {
    this.m = m;
    if (this.actorList.length) this.ensureScene(m, this.o.serverNow());
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const t = performance.now();
      // Un retour après une longue pause (onglet caché) : la caméra va droit à son plan
      if (t - this.last > 400) this.snapNext = true;
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.world.quality.tick(t);
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Passer la cinématique (je la passe chez moi, le serveur attend que tous l'aient passée) */
  skip() {
    if (!this.m || this.m.phase === "play") return;
    this.skipped = true;
    this.skippedPhase = `${this.m.phase}:${this.m.round}`;
    this.o.skip();
  }

  /** Un geste de l'interface (un bouton) : l'épreuve le reçoit comme une touche */
  press(code: string, down: boolean) {
    this.stage?.key?.(code, down, this.m?.ep ?? null);
  }

  get currentStage(): Stage | null {
    return this.stage;
  }

  /** Le décor qu'il faut : le portail à l'arrivée, l'épreuve dès sa révélation, le podium à la fin */
  private ensureScene(m: MatchView, now: number) {
    void now;
    const ep = m.program[m.round] ?? null;
    const wantArrival = m.phase === "intro";
    const wantPodium = m.phase === "podium" || m.phase === "over";
    if (wantArrival && !this.arrival) this.arrival = new Arrival(this.world);
    if (!wantArrival && this.arrival) {
      this.arrival.dispose();
      this.arrival = null;
    }
    if (wantPodium && !this.podium && !m.cfg.only) {
      this.stage?.dispose();
      this.stage = null;
      this.stageKey = "";
      this.podium = new Podium(this.world);
      sfx.fanfare();
    }
    const key =
      ep && (m.phase === "reveal" || m.phase === "play" || m.phase === "results" || (wantPodium && m.cfg.only)) ? `${m.round}:${ep}` : "";
    if (key && key !== this.stageKey && !this.podium) {
      this.stage?.dispose();
      this.stage = makeStage(ep!, this.ctx);
      this.stageKey = key;
      // Tout le monde reprend sa tenue propre pour la nouvelle épreuve (les éliminés restent tachés)
      for (const c of m.cands) this.actors.get(c.id)?.stainWith(c.outHow, c.alive ? 0 : 0.8);
    }
    if (m.phase === "ff" && this.stage) {
      this.stage.dispose();
      this.stage = null;
      this.stageKey = "";
    }
  }

  private frame(dt: number) {
    const m = this.m;
    const now = this.o.serverNow();
    const t = now / 1000;
    this.world.animate(t);
    if (!m || this.paused) {
      this.world.render();
      return;
    }
    this.ensureScene(m, now);
    this.processFx(m, now);
    const phaseKey = `${m.phase}:${m.round}`;
    if (this.skippedPhase && this.skippedPhase !== phaseKey) {
      this.skipped = false;
      this.skippedPhase = "";
    }
    const len = Math.max(1, m.until - m.phaseAt);
    const k = Math.max(0, Math.min(1, (now - m.phaseAt) / len));
    let targets = new Map<string, ActorTarget>();
    let cam: Shot;
    const aliveIds = m.cands.filter((c) => c.alive).map((c) => c.id);
    switch (m.phase) {
      case "intro": {
        targets = this.arrival
          ? this.arrival.targets(
              m.cands.map((c) => c.id),
              k,
              len / 1000,
            )
          : targets;
        cam = this.arrival ? this.arrival.camera(k) : shot(0, 10, 30, 0, 2, 0);
        this.host.fly(0, 5.2 + Math.sin(k * 6) * 0.4, 1.5, 0, 12);
        if (k > 0.82 && k < 0.84) this.host.ring(now);
        break;
      }
      case "reveal": {
        const stage = this.stage;
        if (stage) {
          const ids = aliveIds;
          targets = stage.lineup(ids, k);
          cam = stage.reveal(k);
        } else cam = shot(0, 12, 26, 0, 2, 0);
        this.host.fly(cam.look.x + 2.5, cam.look.y + 2.4, cam.look.z - 3, cam.pos.x, cam.pos.z);
        if (now - m.phaseAt < 60) this.host.ring(now);
        break;
      }
      case "play":
      case "results": {
        const stage = this.stage;
        if (stage && m.ep) {
          targets = stage.frame(m.ep, m, now, dt);
          cam = m.phase === "results" ? this.resultsCamera(m, now, k, stage) : stage.camera(m.ep, m, now);
        } else cam = shot(0, 12, 26, 0, 2, 0);
        // Pendant le jeu, Carillon se tient à l'écart, haut et sur le côté, pour ne rien cacher
        this.host.fly(cam.look.x - 16, 12, cam.look.z + 8, cam.look.x, cam.look.z);
        break;
      }
      case "ff": {
        // L'accéléré : la caméra file au-dessus de l'île, les survivants rangés au milieu de la cour
        aliveIds.forEach((id, i) => {
          const a = (i / Math.max(1, aliveIds.length)) * Math.PI * 2;
          targets.set(id, {
            x: Math.cos(a) * 3,
            z: Math.sin(a) * 3,
            face: Math.atan2(-Math.cos(a), -Math.sin(a)),
            act: "idle",
            snap: true,
          });
        });
        const a = k * Math.PI * 1.2;
        cam = shot(Math.cos(a) * 55, 30, Math.sin(a) * 55, 0, 0, 0, 52);
        this.host.fly(0, 8, 0, cam.pos.x, cam.pos.z);
        break;
      }
      case "podium":
      case "over": {
        if (this.podium) {
          const second =
            m.history.length && m.winner ? (m.cands.find((c) => c.outRound === m.round && c.id !== m.winner)?.id ?? null) : null;
          const others = m.cands.filter((c) => c.id !== m.winner && c.id !== second).map((c) => c.id);
          targets = this.podium.targets(m.winner, second, others.slice(0, 26), k);
          this.podium.update(m.phase === "over" ? 1 : k, now);
          cam = this.podium.camera(m.phase === "over" ? 1 : k);
          if (Math.random() < dt * 3)
            this.bursts.burst("confettis", (Math.random() - 0.5) * 8, 4 + Math.random() * 3, (Math.random() - 0.5) * 4, { count: 30 });
          this.host.fly(3, 4.5, 1.5, 0, 12);
        } else if (this.stage && m.ep) {
          targets = this.stage.frame(m.ep, m, now, dt);
          cam = this.stage.camera(m.ep, m, now);
        } else cam = shot(0, 8, 14, 0, 2, 0);
        break;
      }
    }
    // Ceux qui ne sont nulle part ne se montrent pas
    for (const a of this.actorList) a.update(targets.get(a.info.id) ?? null, now, dt);
    this.shadows?.update(this.actorList, (x, z) => this.world.groundAt(x, z));
    for (const [id, tag] of this.tags) {
      const c = m.cands.find((x) => x.id === id);
      tag.visible = Boolean(c && this.actors.get(id)?.visible);
    }
    this.host.update(now, dt);
    this.bursts.update(dt);
    this.direct(cam, dt);
    this.world.aimShadows(this.camLook.x, this.camLook.z);
    this.world.render();
    if (now - this.lastHud > 90) {
      this.lastHud = now;
      this.emitHud(m, now, k);
    }
  }

  /** Les éliminés de l'épreuve, montrés l'un après l'autre, puis la vue d'ensemble */
  private resultsCamera(m: MatchView, now: number, k: number, stage: Stage): Shot {
    const outs = m.history[m.history.length - 1]?.out ?? [];
    if (!this.resultsFocus.length || this.resultsFocus[0] !== `${m.round}`) {
      // Les vrais joueurs d'abord, puis quelques bots
      const humans = outs.filter((id) => this.roster.find((r) => r.id === id)?.userId);
      const bots = outs.filter((id) => !humans.includes(id));
      this.resultsFocus = [`${m.round}`, ...humans, ...bots].slice(0, 4);
    }
    const focus = this.resultsFocus.slice(1);
    const slot = Math.floor(k * (focus.length + 1));
    const id = focus[slot];
    const a = id ? this.actors.get(id) : null;
    if (a && a.visible) {
      const ang = this.actorList.indexOf(a) * 1.3;
      return shot(a.x + Math.cos(ang) * 3.4, a.y + 2.2, a.z + Math.sin(ang) * 3.4, a.x, a.y + 0.6, a.z, 42, { cut: true });
    }
    void now;
    const base = stage.camera(m.ep, m, now);
    return { ...base, pos: base.pos.clone().add(new THREE.Vector3(0, 4, -3)), ease: 0.6 };
  }

  private snapNext = true;

  private direct(s: Shot, dt: number) {
    if (this.snapNext) {
      this.snapNext = false;
      this.camPos.copy(s.pos);
      this.camLook.copy(s.look);
      this.camFov = s.fov;
    } else if (s.cut) {
      // Une coupe : une seule fois (le plan suivant de la même coupe glisse)
      if (this.camPos.distanceTo(s.pos) > 1.5) {
        this.camPos.copy(s.pos);
        this.camLook.copy(s.look);
        this.camFov = s.fov;
      }
    }
    const k = 1 - Math.exp(-dt * 4.5 * (s.ease ?? 1));
    this.camPos.lerp(s.pos, k);
    this.camLook.lerp(s.look, k);
    this.camFov += (s.fov - this.camFov) * k;
    const cam = this.world.camera;
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    if (Math.abs(cam.fov - this.camFov) > 0.01) {
      cam.fov = this.camFov;
      cam.updateProjectionMatrix();
    }
  }

  /** Les événements de la partie : les sons, les éclats, les taches des éliminés */
  private processFx(m: MatchView, now: number) {
    const fresh = m.fx.filter((f) => f.n > this.lastFx);
    if (!fresh.length) return;
    // Au premier message (une arrivée en cours de partie), on ne rejoue pas les effets d'avant
    const replay = this.lastFx > 0;
    this.lastFx = fresh[fresh.length - 1]!.n;
    if (!replay) return;
    for (const f of fresh) {
      if (now - f.at > 4000) continue;
      this.stage?.onFx?.(f.k, f, m.ep, now);
      if (f.k === "out" && f.id) {
        const c = m.cands.find((x) => x.id === f.id);
        const a = this.actors.get(f.id);
        if (!c || !a) continue;
        if (c.outHow !== "peinture") {
          a.stainWith(c.outHow, 0.7);
          const kind =
            c.outHow === "mousse"
              ? "mousse"
              : c.outHow === "plouf"
                ? "eau"
                : c.outHow === "trappe"
                  ? "balles"
                  : c.outHow === "gelee"
                    ? "gelee"
                    : c.outHow === "canon"
                      ? "canon"
                      : c.outHow === "plumes"
                        ? "plumes"
                        : c.outHow === "tarte"
                          ? "tarte"
                          : "confettis";
          this.bursts.burst(kind, a.x, a.y + 1, a.z, { count: 36 });
        }
        if (f.id === this.o.me) sfx.eliminatedMe();
      } else if (PASSED.has(f.k) && f.id) {
        // Il passe l'épreuve : l'éclat qu'il a choisi (la boutique) jaillit autour de lui
        const a = this.actors.get(f.id);
        const cheer = this.roster.find((r) => r.id === f.id)?.look.cheer ?? "confettis";
        if (a && (a.info.userId || Math.random() < 0.35)) {
          const [kind, power] = CHEER_BURST[cheer] ?? ["confettis", 1];
          this.bursts.burst(kind, a.x, a.y + 1.6, a.z, { count: a.info.userId ? 40 : 18, power });
        }
      } else if (f.k === "go") {
        this.host.ring(now);
        sfx.bell();
      } else if (f.k === "revele") {
        sfx.reveal();
        this.host.ring(now);
      } else if (f.k === "bilan") sfx.drumroll();
      else if (f.k === "repeche" && f.id) {
        const a = this.actors.get(f.id);
        a?.stainWith(null, 0);
        sfx.ding();
      }
    }
  }

  private emitHud(m: MatchView, now: number, k: number) {
    const me = this.o.me ? m.cands.find((c) => c.id === this.o.me) : null;
    const rounds = m.program.filter((e) => e !== "polochons").length;
    this.o.onHud({
      phase: m.phase,
      round: m.round,
      ep: m.program[m.round] ?? null,
      index: m.program.slice(0, m.round + 1).filter((e) => e !== "polochons").length,
      rounds,
      alive: m.cands.filter((c) => c.alive).length,
      total: m.cands.length,
      me: me ? { alive: me.alive, how: me.outHow, round: me.outRound } : null,
      stage: this.stage && m.ep && m.phase === "play" ? (this.stage.hud?.(m.ep, now) ?? null) : null,
      k,
      skipped: this.skipped,
      fps: this.world.quality.fps,
    });
  }

  private bindInput() {
    const el = this.world.renderer.domElement;
    el.style.touchAction = "none";
    const info = (e: PointerEvent, kind: PointerInfo["kind"]): PointerInfo => {
      const r = el.getBoundingClientRect();
      return {
        kind,
        nx: ((e.clientX - r.left) / r.width) * 2 - 1,
        ny: -((e.clientY - r.top) / r.height) * 2 + 1,
        x: e.clientX - r.left,
        y: e.clientY - r.top,
        t: performance.now(),
        id: e.pointerId,
        touch: e.pointerType === "touch",
      };
    };
    el.addEventListener("pointerdown", (e) => {
      sfx.unlock();
      el.setPointerCapture(e.pointerId);
      this.stage?.pointer?.(info(e, "down"), this.m?.ep ?? null);
    });
    el.addEventListener("pointermove", (e) => this.stage?.pointer?.(info(e, "move"), this.m?.ep ?? null));
    el.addEventListener("pointerup", (e) => this.stage?.pointer?.(info(e, "up"), this.m?.ep ?? null));
    el.addEventListener("pointercancel", (e) => this.stage?.pointer?.(info(e, "up"), this.m?.ep ?? null));
    this.onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      const down = e.type === "keydown";
      if (down && (e.code === "Enter" || e.code === "Escape") && this.m && this.m.phase !== "play") {
        this.skip();
        return;
      }
      this.stage?.key?.(e.code, down, this.m?.ep ?? null);
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    };
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
  }

  private onKey: ((e: KeyboardEvent) => void) | null = null;

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.onKey) {
      window.removeEventListener("keydown", this.onKey);
      window.removeEventListener("keyup", this.onKey);
    }
    this.stage?.dispose();
    this.arrival?.dispose();
    this.podium?.dispose();
    for (const a of this.actorList) a.dispose();
    for (const t of this.tags.values()) {
      (t.material as THREE.SpriteMaterial).map?.dispose();
      t.material.dispose();
    }
    this.shadows?.dispose();
    this.world.dispose();
  }
}

export { path };
