// La boucle d'un combat, côté navigateur : lire les commandes soixante fois par seconde et les envoyer, et anticiper
// tout le combat. Le serveur envoie à chaque joueur l'état complet de chacun et sa dernière commande : l'appareil repart
// de cet état, rejoue ses propres commandes pas encore prises en compte (et, pour les autres, leur dernière commande
// prolongée), et montre tout le monde au présent. Ses coups et ceux qu'il reçoit se voient donc tout de suite, aux
// bonnes places ; quand un autre a changé d'idée entre-temps, il glisse vers sa vraie place au lieu de sauter. Celui
// qui regarde sans jouer voit les positions reçues, un peu en retard, sans rien anticiper.

import { platformsAt, type ArenaId, type PlatformNow } from "../../shared/games/culbute/arenas.ts";
import { createFight, INTRO_FRAMES, stepPredict } from "../../shared/games/culbute/engine.ts";
import type { Fight, FightEvent, Input, ItemKind } from "../../shared/games/culbute/model.ts";
import type { CulbuteClientMessage } from "../../shared/games/culbute/net.ts";
import {
  FIGHTER_STRIDE,
  HELD_ITEMS,
  ITEM_STRIDE,
  SHOT_KINDS,
  SHOT_STRIDE,
  TRAP_STRIDE,
  packFighter,
  unpackFighter,
  unpackFull,
  unpackInputs,
  type CulbuteTick,
  type CulbuteView,
  type FighterNet,
} from "../../shared/games/culbute/view.ts";
import { AIM_CENTER, CulbuteControls, type Scheme } from "./controls.ts";
import { CulbuteScene, type FighterLook } from "./scene/CulbuteScene.ts";

const STEP = 1 / 60;
/** En développement : une latence simulée, en millisecondes aller-retour (`localStorage.cbLag = "80"`, l'adresse d'une
 * table perd ses paramètres avant que le jeu ne se charge) */
const LAG = import.meta.env.DEV ? Number(localStorage.getItem("cbLag") ?? 0) || 0 : 0;
/** En développement : la gigue, un retard en plus tiré pour chaque paquet, jusqu'à tant de millisecondes
 * (`localStorage.cbJitter = "60"`) ; les paquets restent dans l'ordre, comme sur une vraie connexion */
const JITTER = import.meta.env.DEV ? Number(localStorage.getItem("cbJitter") ?? 0) || 0 : 0;
const lastArrival = { in: 0, out: 0 };
/** En développement, pour comparer : les autres aussi tels que devinés (l'ancienne façon, `localStorage.cbPredictOthers = "1"`) */
const PREDICT_OTHERS = import.meta.env.DEV && localStorage.getItem("cbPredictOthers") === "1";
function later(way: "in" | "out", fn: () => void) {
  const at = Math.max(lastArrival[way], performance.now() + LAG / 2 + Math.random() * JITTER);
  lastArrival[way] = at;
  window.setTimeout(fn, at - performance.now());
}
const SEND_EVERY = 2;
const HEARTBEAT_MS = 120;
const MIN_DELAY = 3;
const MAX_DELAY = 12;

export interface RenderFighter extends FighterNet {
  slot: number;
  /** La plateforme sous ses pieds, si on la connaît (son propre combattant) */
  ground: number;
  me: boolean;
}

export interface RenderFrame {
  frame: number;
  fighters: RenderFighter[];
  shots: { id: number; kind: string; x: number; y: number; vx: number; vy: number; owner: number; t: number }[];
  items: { id: number; kind: ItemKind; x: number; y: number; ground: boolean }[];
  traps: { id: number; x: number; y: number; owner: number }[];
  plats: PlatformNow[];
}

interface Snapshot {
  f: number;
  p: number[];
  j: number[];
  i: number[];
  r: number[];
  t: number;
  ph: number;
}

export interface HudState {
  /** Chacun : ses pourcents, ses vies, ses points */
  fighters: { slot: number; dmg: number; stocks: number; score: number; out: boolean }[];
  /** Le temps qui reste (au temps), en secondes */
  time: number;
  /** Le compte à rebours de l'introduction (3, 2, 1, 0 : c'est parti), ou null */
  countdown: number | null;
  phase: number;
  /** La charge de son attaque, de 0 à 1 */
  charge: number;
  scheme: Scheme;
  ping: number;
  fps: number;
}

export interface RuntimeOptions {
  mySeat: string | null;
  looks: FighterLook[];
  send: (msg: CulbuteClientMessage) => void;
  onHud: (hud: HudState) => void;
  /** Ce qui arrive, au moment où l'image le montre */
  onEvents: (events: FightEvent[], frame: RenderFrame) => void;
  /** Chaque image montrée (les bruits du corps s'y lisent) */
  onFrame?: (frame: RenderFrame) => void;
}

export class FightRuntime {
  readonly controls = new CulbuteControls();
  private scene: CulbuteScene;
  private view: CulbuteView;
  private snaps: Snapshot[] = [];
  private raf = 0;
  private last = performance.now();
  private acc = 0;
  // L'horloge de lecture, calée sur les images reçues
  private renderF: number | null = null;
  private minLag: number | null = null;
  private jitter = 0.02;
  // Le combat anticipé (seulement pour un joueur) : tout le monde au présent
  private world: Fight | null = null;
  private mySlot = -1;
  private seq = 0;
  private unacked: { seq: number; input: Input }[] = [];
  private outbox: number[] = [];
  private outFirst = 1;
  private sinceSend = 0;
  private lastSendAt = 0;
  /** Chacun : sa place à l'image d'avant (pour glisser d'une image à l'autre), et l'écart qui reste à rattraper */
  private prev: { x: number; y: number }[] = [];
  private off: { x: number; y: number }[] = [];
  /** La dernière commande connue des autres : on la prolonge jusqu'à la suivante */
  private others: Input[] = [];
  private rtt = 0.08;
  private pending: { f: number; events: FightEvent[] }[] = [];
  private hudAt = 0;
  private fpsFrames = 0;
  private fpsAt = performance.now();
  private fps = 60;
  private disposed = false;
  private looksKey = "";
  /** La dernière image montrée : les autres tels qu'on les voit, pour deviner ses propres coups */
  private lastFrame: RenderFrame | null = null;
  /** Les coups déjà montrés d'avance (on ne rejouera pas l'étincelle quand le serveur les confirmera) */
  private guessed: { k: string; a: number; v: number; at: number; ko: boolean }[] = [];

  constructor(
    host: HTMLElement,
    view: CulbuteView,
    private opts: RuntimeOptions,
  ) {
    this.view = view;
    this.scene = new CulbuteScene(host, view.arena, view.scale, opts.looks);
    if (import.meta.env.DEV) (window as unknown as { __cbScene: CulbuteScene }).__cbScene = this.scene;
    this.looksKey = JSON.stringify(opts.looks);
    // Viser à la souris : du milieu de son combattant (tel qu'anticipé) au point de l'arène sous le curseur
    this.controls.aimFrom = (cx, cy) => {
      const me = this.world?.fighters[this.mySlot];
      const p = me ? this.scene.worldAt(cx, cy) : null;
      return me && p ? [p[0] - me.x, p[1] - (me.y + AIM_CENTER)] : null;
    };
    this.controls.ready = () => {
      const st = this.world?.fighters[this.mySlot]?.state;
      return st === "stand" || st === "air" || st === "shield";
    };
    this.setupWorld(view);
    window.addEventListener("resize", this.fit);
    this.fit();
    this.raf = requestAnimationFrame(this.loop);
  }

  get scheme(): Scheme {
    return this.controls.current;
  }

  /** Tout préparer pendant l'écran de chargement (voir lib/prepare.ts) */
  prepare(onProgress?: (share: number) => void) {
    return this.scene.prepare(onProgress);
  }

  setPaused(on: boolean) {
    this.controls.paused = on;
  }

  /** L'état d'ensemble a changé (un combat qui recommence : on repart de zéro) */
  setView(view: CulbuteView) {
    const fresh = view.arena !== this.view.arena || view.fighters.length !== this.view.fighters.length;
    this.view = view;
    if (fresh) this.scene.setArena(view.arena, view.scale);
  }

  /** D'autres tenues ou d'autres noms (rien ne change au combat) */
  setLooks(looks: FighterLook[]) {
    const key = JSON.stringify(looks);
    if (key === this.looksKey) return;
    this.looksKey = key;
    this.scene.setLooks(looks);
  }

  private setupWorld(view: CulbuteView) {
    this.mySlot = this.opts.mySeat ? view.fighters.findIndex((f) => f.id === this.opts.mySeat) : -1;
    this.prev = [];
    this.off = [];
    this.others = [];
    if (this.mySlot < 0) {
      this.world = null;
      return;
    }
    this.world = createFight(
      view.config,
      view.arena,
      view.fighters.map((f) => ({ id: f.id, team: f.team, style: f.style })),
      0,
    );
    // L'arène est déjà agrandie par le serveur selon le nombre de combattants : la même
    this.world.scale = view.scale;
  }

  private fit = () => {
    this.scene.resize(window.innerWidth, window.innerHeight);
  };

  onTick(now: number, tick: CulbuteTick) {
    if (LAG > 0 || JITTER > 0) {
      later("in", () => !this.disposed && this.receive(now, tick));
      return;
    }
    this.receive(now, tick);
  }

  private receive(_now: number, tick: CulbuteTick) {
    if (import.meta.env.DEV) {
      const log = ((window as unknown as { __cbTicks?: number[] }).__cbTicks ??= []);
      log.push(tick.f);
      if (log.length > 80) log.shift();
    }
    const prev = this.snaps.at(-1);
    if (prev && tick.f < prev.f - 30) {
      // Une revanche : nouveau combat, nouvelle horloge
      this.snaps.length = 0;
      this.pending.length = 0;
      this.renderF = null;
      this.minLag = null;
      this.unacked.length = 0;
      this.guessed.length = 0;
      this.setupWorld(this.view);
    }
    const arrival = performance.now() / 1000;
    const lag = arrival - tick.f / 60;
    this.minLag = this.minLag === null ? lag : Math.min(lag, this.minLag + 0.0012);
    const late = lag - this.minLag;
    this.jitter = Math.max(late, this.jitter * 0.99);
    this.snaps.push({ f: tick.f, p: tick.p, j: tick.j, i: tick.i, r: tick.r, t: tick.tl, ph: tick.ph });
    if (this.snaps.length > 40) this.snaps.shift();
    if (tick.e.length > 0) this.pending.push({ f: tick.f, events: tick.e });
    const stamp = this.mySlot >= 0 ? (tick.c[this.mySlot] ?? 0) : 0;
    if (stamp > 0) {
      const sample = Math.max(0, performance.now() - stamp) / 1000;
      if (sample < 2) this.rtt = this.rtt * 0.9 + sample * 0.1;
    }
    if (tick.w && this.world && this.mySlot >= 0) this.reconcile(tick);
  }

  /** Le serveur a parlé : on repart de son état, et on rejoue les commandes qu'il n'a pas encore prises en compte */
  private reconcile(tick: CulbuteTick) {
    const world = this.world!;
    const ack = tick.k[this.mySlot] ?? 0;
    if (import.meta.env.DEV) {
      // Les pas du serveur sans commande de soi (arrivée trop tard), ou qui en ont avalé plusieurs (file trop longue)
      const net = ((window as unknown as { __cbNet?: Record<string, number> }).__cbNet ??= { mine: 0, others: 0 });
      const p = (window as unknown as { __cbAck?: [number, number] }).__cbAck;
      if (p && tick.f > p[0] && ack >= p[1]) {
        const gap = tick.f - p[0] - (ack - p[1]);
        if (gap > 0) net.starved = (net.starved ?? 0) + gap;
        if (gap < 0) net.squeezed = (net.squeezed ?? 0) - gap;
      }
      (window as unknown as { __cbAck?: [number, number] }).__cbAck = [tick.f, ack];
    }
    while (this.unacked.length > 0 && this.unacked[0]!.seq <= ack) this.unacked.shift();
    const before = world.fighters.map((_, i) => this.shown(i));
    world.phase = tick.ph === 0 ? "intro" : tick.ph === 1 ? "fight" : "over";
    world.frame = tick.f;
    tick.w!.forEach((p, i) => {
      const ft = world.fighters[i];
      if (ft) unpackFull(ft, p);
    });
    this.others = unpackInputs(tick.u ?? [], world.fighters.length);
    // Les objets tels que le serveur les voit : on anticipe aussi le ramassage
    world.items = [];
    for (let k = 0; k + ITEM_STRIDE <= tick.i.length; k += ITEM_STRIDE) {
      world.items.push({
        id: tick.i[k]!,
        kind: (HELD_ITEMS[tick.i[k + 1]!] || "tarte") as ItemKind,
        x: tick.i[k + 2]!,
        y: tick.i[k + 3]!,
        vx: 0,
        vy: 0,
        ground: tick.i[k + 4] === 1,
        life: 999,
      });
    }
    world.projectiles = [];
    world.traps = [];
    this.keepPrev();
    for (const u of this.unacked) {
      this.keepPrev();
      this.showPredicted(stepPredict(world, this.inputsWith(u.input)));
    }
    // Un écart se rattrape en douceur : il s'ajoute à ce qui restait à rattraper (le remplacer faisait sauter le
    // combattant à chaque état reçu) ; un très grand (une sortie, un retour) se suit tout de suite
    world.fighters.forEach((ft, i) => {
      const [nx, ny] = this.shown(i);
      const [ox, oy] = before[i]!;
      const o = (this.off[i] ??= { x: 0, y: 0 });
      const dx = ox - nx;
      const dy = oy - ny;
      if (import.meta.env.DEV && Math.hypot(dx, dy) > 0.4) {
        const net = ((window as unknown as { __cbNet?: { mine: number; others: number } }).__cbNet ??= { mine: 0, others: 0 });
        if (i === this.mySlot) net.mine++;
        else net.others++;
      }
      const ax = o.x + dx;
      const ay = o.y + dy;
      if (Math.hypot(ax, ay) < 2.5 && ft.state !== "dead" && ft.state !== "respawn" && ft.state !== "out") {
        o.x = ax;
        o.y = ay;
      } else {
        o.x = 0;
        o.y = 0;
      }
    });
  }

  /** Les commandes de cette image pour tout le monde : la sienne, et la dernière connue des autres (sans nouvel appui) */
  private inputsWith(mine: Input): Input[] {
    return this.world!.fighters.map((ft) =>
      ft.slot === this.mySlot ? mine : { ...(this.others[ft.slot] ?? { x: 0, y: 0, held: 0, pressed: 0 }), pressed: 0 },
    );
  }

  /** Chacun garde sa place de l'image d'avant, pour glisser jusqu'à la suivante */
  private keepPrev() {
    this.world!.fighters.forEach((ft, i) => {
      const p = (this.prev[i] ??= { x: ft.x, y: ft.y });
      p.x = ft.x;
      p.y = ft.y;
    });
  }

  /** Les coups (et les saisies) devinés sur l'appareil : montrés tout de suite, une seule fois */
  private showPredicted(events: FightEvent[]) {
    const frame = this.lastFrame;
    if (events.length === 0 || !frame) return;
    const now = performance.now();
    this.guessed = this.guessed.filter((g) => now - g.at < 900);
    const fresh: FightEvent[] = [];
    for (const e of events) {
      if (e.k !== "hit" && e.k !== "grab") continue;
      const ko = e.k === "hit" && Boolean(e.ko);
      if (this.guessed.some((g) => g.k === e.k && g.a === e.a && g.v === e.v && now - g.at < 400)) continue;
      this.guessed.push({ k: e.k, a: e.a, v: e.v, at: now, ko });
      fresh.push(e);
    }
    if (fresh.length === 0) return;
    for (const e of fresh) this.scene.effect(e, frame);
    this.opts.onEvents(fresh, frame);
  }

  /** Un coup (ou une saisie) confirmé par le serveur : déjà montré s'il avait été deviné */
  private alreadyShown(e: FightEvent): boolean {
    if ((e.k !== "hit" && e.k !== "grab") || !this.world) return false;
    const now = performance.now();
    this.guessed = this.guessed.filter((g) => now - g.at < 900);
    const ko = e.k === "hit" && Boolean(e.ko);
    const i = this.guessed.findIndex((g) => g.k === e.k && g.a === e.a && g.v === e.v && (g.ko || !ko) && !("done" in g));
    if (i < 0) return false;
    // Confirmé : il ne sert plus à reconnaître le suivant
    (this.guessed[i] as { done?: boolean }).done = true;
    return true;
  }

  /** Où montrer un combattant anticipé : entre ses deux dernières images, plus ce qui reste à rattraper */
  private shown(i: number): [number, number] {
    const ft = this.world!.fighters[i]!;
    const p = this.prev[i] ?? ft;
    const o = this.off[i] ?? { x: 0, y: 0 };
    const k = Math.min(1, this.acc / STEP);
    return [p.x + (ft.x - p.x) * k + o.x, p.y + (ft.y - p.y) * k + o.y];
  }

  /** Les commandes de cette image : au serveur, et à son combattant anticipé */
  private stepInputs(now: number) {
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.acc -= STEP;
      steps++;
      const input = this.controls.sample();
      if (this.mySlot < 0) continue;
      this.seq++;
      if (this.outbox.length === 0) this.outFirst = this.seq;
      this.outbox.push(Math.round(input.x * 100) / 100, Math.round(input.y * 100) / 100, input.held, input.pressed);
      this.unacked.push({ seq: this.seq, input });
      if (this.unacked.length > 120) this.unacked.shift();
      if (this.world) {
        this.keepPrev();
        this.showPredicted(stepPredict(this.world, this.inputsWith(input)));
      }
      this.sinceSend++;
    }
    // Un onglet resté en arrière-plan : on ne rattrape pas des secondes de commandes
    if (this.acc > STEP * 5) this.acc = 0;
    if (this.mySlot >= 0 && this.outbox.length > 0 && (this.sinceSend >= SEND_EVERY || now - this.lastSendAt > HEARTBEAT_MS)) {
      const msg: CulbuteClientMessage = { t: "in", s: this.outFirst, d: this.outbox, c: now };
      if (LAG > 0 || JITTER > 0) later("out", () => this.opts.send(msg));
      else this.opts.send(msg);
      this.outbox = [];
      this.sinceSend = 0;
      this.lastSendAt = now;
    }
  }

  private advanceClock(dt: number): number | null {
    const latest = this.snaps.at(-1);
    if (!latest || this.minLag === null) return null;
    const delay = Math.min(MAX_DELAY, Math.max(MIN_DELAY, MIN_DELAY + this.jitter * 60));
    const target = (performance.now() / 1000 - this.minLag) * 60 - delay;
    if (this.renderF === null || Math.abs(target - this.renderF) > 20) this.renderF = target;
    else this.renderF += dt * 60 + (target - this.renderF) * Math.min(1, dt * 2);
    return this.renderF;
  }

  /** L'image à montrer : les autres entre deux positions reçues, soi-même tel qu'anticipé */
  private frameAt(at: number): RenderFrame | null {
    const n = this.snaps.length;
    if (n === 0) return null;
    let a = this.snaps[0]!;
    let b = this.snaps[n - 1]!;
    if (n >= 2 && at >= b.f) a = this.snaps[n - 2]!;
    else {
      for (let i = n - 1; i > 0; i--) {
        if (this.snaps[i - 1]!.f <= at) {
          a = this.snaps[i - 1]!;
          b = this.snaps[i]!;
          break;
        }
      }
    }
    const span = Math.max(1, b.f - a.f);
    const k = Math.max(0, Math.min(1.4, (at - a.f) / span));
    const count = b.p.length / FIGHTER_STRIDE;
    const fighters: RenderFighter[] = [];
    for (let i = 0; i < count; i++) {
      const fa = i * FIGHTER_STRIDE < a.p.length ? unpackFighter(a.p, i) : unpackFighter(b.p, i);
      const fb = unpackFighter(b.p, i);
      const jump = Math.hypot(fb.x - fa.x, fb.y - fa.y) > 3;
      const base = k < 0.5 ? fa : fb;
      const sameMove = fa.state === fb.state && fa.move === fb.move;
      fighters.push({
        ...base,
        x: jump ? fb.x : fa.x + (fb.x - fa.x) * k,
        y: jump ? fb.y : fa.y + (fb.y - fa.y) * k,
        mt: sameMove ? fa.mt + (fb.mt - fa.mt) * Math.min(1, k) : base.mt,
        t: sameMove ? fa.t + (fb.t - fa.t) * Math.min(1, k) : base.t,
        slot: i,
        ground: -1,
        me: false,
      });
    }
    // Un joueur : son combattant tel qu'anticipé, au présent (les vies et les points restent ceux du serveur) ; les
    // autres tels que le serveur les a montrés, un peu en retard : deviner leurs gestes les faisait sauter sans cesse
    // (le calcul anticipé sert encore à montrer tout de suite ses coups qui touchent)
    const world = this.world;
    if (world && this.mySlot >= 0) {
      world.fighters.forEach((ft, i) => {
        if (i !== this.mySlot && !PREDICT_OTHERS) return;
        const server = fighters[i];
        const [x, y] = this.shown(i);
        fighters[i] = {
          ...unpackFighter(packFighter(ft, world.frame), 0),
          ...(server ? { stocks: server.stocks, score: server.score } : {}),
          x,
          y,
          slot: i,
          ground: ft.ground,
          me: i === this.mySlot,
        };
      });
    }
    const lerpList = <T extends { id: number; x: number; y: number }>(la: T[], lb: T[]) =>
      lb.map((q) => {
        const p = la.find((o) => o.id === q.id);
        return p ? { ...q, x: p.x + (q.x - p.x) * Math.min(1, k), y: p.y + (q.y - p.y) * Math.min(1, k) } : q;
      });
    const shots = (s: Snapshot) => {
      const out: RenderFrame["shots"] = [];
      for (let o = 0; o + SHOT_STRIDE <= s.j.length; o += SHOT_STRIDE)
        out.push({
          id: s.j[o]!,
          kind: SHOT_KINDS[s.j[o + 1]!] ?? "boule",
          x: s.j[o + 2]!,
          y: s.j[o + 3]!,
          vx: s.j[o + 4]!,
          vy: s.j[o + 5]!,
          owner: s.j[o + 6]!,
          t: s.j[o + 7]!,
        });
      return out;
    };
    const items = (s: Snapshot) => {
      const out: RenderFrame["items"] = [];
      for (let o = 0; o + ITEM_STRIDE <= s.i.length; o += ITEM_STRIDE)
        out.push({
          id: s.i[o]!,
          kind: (HELD_ITEMS[s.i[o + 1]!] || "tarte") as ItemKind,
          x: s.i[o + 2]!,
          y: s.i[o + 3]!,
          ground: s.i[o + 4] === 1,
        });
      return out;
    };
    const traps: RenderFrame["traps"] = [];
    for (let o = 0; o + TRAP_STRIDE <= b.r.length; o += TRAP_STRIDE)
      traps.push({ id: b.r[o]!, x: b.r[o + 1]!, y: b.r[o + 2]!, owner: b.r[o + 3]! });
    // Les plateformes qui bougent : au présent pour un joueur (comme son combattant), sinon à l'heure de lecture
    const now = world && this.mySlot >= 0 ? world.frame : at;
    const plats = platformsAt(this.view.arena as ArenaId, this.view.scale, Math.round(now));
    // Debout sur une plateforme qui bouge : les pieds suivent la plateforme telle qu'on la voit (les autres, montrés
    // en retard, sont emportés avec elle jusqu'au présent)
    if (world) {
      const then = now !== at ? platformsAt(this.view.arena as ArenaId, this.view.scale, Math.round(at)) : plats;
      for (const r of fighters) {
        if (r.ground >= 0 && plats[r.ground]) r.y = plats[r.ground]!.y;
        else if (!r.me && then !== plats) {
          const pi = then.findIndex((p) => Math.abs(r.y - p.y) < 0.06 && r.x >= p.x0 - 0.05 && r.x <= p.x1 + 0.05);
          const p0 = then[pi];
          const p1 = plats[pi];
          if (p0 && p1 && (p1.x0 !== p0.x0 || p1.y !== p0.y)) {
            r.x += p1.x0 - p0.x0;
            r.y = p1.y;
          }
        }
      }
    }
    // Ce qui vole, reçu en retard : poussé jusqu'au présent d'après sa vitesse (sinon il toucherait après coup)
    const ahead = world ? Math.max(0, Math.min(0.25, (now - at) / 60)) : 0;
    const flying = lerpList(shots(a), shots(b)).map((q) => (ahead > 0 ? { ...q, x: q.x + q.vx * ahead, y: q.y + q.vy * ahead } : q));
    return { frame: now, fighters, shots: flying, items: lerpList(items(a), items(b)), traps, plats };
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    this.stepInputs(now);
    // Les rattrapages s'effacent en un dixième de seconde environ
    const fade = Math.exp(-dt * 12);
    for (const o of this.off) {
      o.x *= fade;
      o.y *= fade;
    }
    this.fpsFrames++;
    if (now - this.fpsAt > 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsAt));
      this.fpsFrames = 0;
      this.fpsAt = now;
    }
    const at = this.advanceClock(dt);
    if (at === null) {
      this.scene.renderIdle(dt);
      return;
    }
    const frame = this.frameAt(at);
    if (!frame) return;
    this.lastFrame = frame;
    const due: FightEvent[] = [];
    while (this.pending.length > 0 && this.pending[0]!.f <= at + 1)
      for (const e of this.pending.shift()!.events) if (!this.alreadyShown(e)) due.push(e);
    if (due.length > 0) {
      for (const e of due) this.scene.effect(e, frame);
      this.opts.onEvents(due, frame);
    }
    this.scene.setAim(this.mySlot, this.mySlot >= 0 ? this.controls.aimNow() : null);
    this.scene.render(dt, frame);
    this.opts.onFrame?.(frame);
    if (import.meta.env.DEV) {
      const w = window as unknown as { __cbFrame?: RenderFrame; __cbFrameAt?: number; __cbNet?: Record<string, number> };
      // Les autres qui sautent d'une image à l'autre : plus de 40 m/s, plus vite que tout ce qui court ou vole
      const old = w.__cbFrame;
      const dtShown = (now - (w.__cbFrameAt ?? now)) / 1000;
      if (old && old !== frame && dtShown > 0) {
        const net = (w.__cbNet ??= { mine: 0, others: 0 });
        for (const f of frame.fighters) {
          const p = old.fighters[f.slot];
          if (!p || f.me || f.state === "dead" || f.state === "respawn" || p.state === "dead" || p.state === "respawn") continue;
          if (Math.hypot(f.x - p.x, f.y - p.y) / dtShown > 40) net.jumps = (net.jumps ?? 0) + 1;
        }
      }
      w.__cbFrame = frame;
      w.__cbFrameAt = now;
    }
    if (now - this.hudAt > 100) {
      this.hudAt = now;
      const latest = this.snaps.at(-1)!;
      const count = latest.p.length / FIGHTER_STRIDE;
      const list: HudState["fighters"] = [];
      for (let i = 0; i < count; i++) {
        const f = unpackFighter(latest.p, i);
        list.push({ slot: i, dmg: f.dmg, stocks: f.stocks, score: f.score, out: f.state === "out" });
      }
      const intro = latest.ph === 0;
      const left = (INTRO_FRAMES - at) / 60;
      const me = frame.fighters[this.mySlot];
      this.opts.onHud({
        fighters: list,
        time: latest.t,
        countdown: intro ? Math.max(1, Math.ceil(left)) : at - INTRO_FRAMES < 50 && at > INTRO_FRAMES - 2 ? 0 : null,
        phase: latest.ph,
        charge: me?.charge ? Math.min(1, me.charge / 60) : 0,
        scheme: this.controls.current,
        ping: Math.round(this.rtt * 1000),
        fps: this.fps,
      });
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.fit);
    this.controls.dispose();
    this.scene.dispose();
  }
}
