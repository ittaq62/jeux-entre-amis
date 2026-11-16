// La boucle d'un combat, côté navigateur : lire les commandes soixante fois par seconde et les envoyer, anticiper son
// propre combattant (le même calcul que le serveur, rejoué depuis le dernier état reçu avec les commandes pas encore
// prises en compte), montrer les autres un peu en retard pour qu'ils glissent sans à-coups, et tout dessiner.

import { platformsAt, type ArenaId, type PlatformNow } from "../../shared/games/culbute/arenas.ts";
import { createFight, INTRO_FRAMES, predictHits, stepSolo, type PredictedHit } from "../../shared/games/culbute/engine.ts";
import type { Fight, FightEvent, Input, ItemKind } from "../../shared/games/culbute/model.ts";
import type { CulbuteClientMessage } from "../../shared/games/culbute/net.ts";
import {
  F_INTANG,
  FIGHTER_STRIDE,
  HELD_ITEMS,
  ITEM_STRIDE,
  SHOT_KINDS,
  SHOT_STRIDE,
  TRAP_STRIDE,
  unpackFighter,
  unpackFull,
  type CulbuteTick,
  type CulbuteView,
  type FighterNet,
} from "../../shared/games/culbute/view.ts";
import { CulbuteControls, type Scheme } from "./controls.ts";
import { CulbuteScene, type FighterLook } from "./scene/CulbuteScene.ts";

const STEP = 1 / 60;
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
  // Son combattant, anticipé
  private solo: Fight | null = null;
  private mySlot = -1;
  private seq = 0;
  private unacked: { seq: number; input: Input }[] = [];
  private outbox: number[] = [];
  private outFirst = 1;
  private sinceSend = 0;
  private lastSendAt = 0;
  private prevX = 0;
  private prevY = 0;
  private offX = 0;
  private offY = 0;
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
  /** Ses coups devinés (on ne rejouera pas l'étincelle quand le serveur les confirmera) */
  private predicted: { v: number; at: number; ko: boolean }[] = [];

  constructor(
    host: HTMLElement,
    view: CulbuteView,
    private opts: RuntimeOptions,
  ) {
    this.view = view;
    this.scene = new CulbuteScene(host, view.arena, view.scale, opts.looks);
    if (import.meta.env.DEV) (window as unknown as { __cbScene: CulbuteScene }).__cbScene = this.scene;
    this.looksKey = JSON.stringify(opts.looks);
    this.setupSolo(view);
    window.addEventListener("resize", this.fit);
    this.fit();
    this.raf = requestAnimationFrame(this.loop);
  }

  get scheme(): Scheme {
    return this.controls.current;
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

  private setupSolo(view: CulbuteView) {
    this.mySlot = this.opts.mySeat ? view.fighters.findIndex((f) => f.id === this.opts.mySeat) : -1;
    if (this.mySlot < 0) {
      this.solo = null;
      return;
    }
    this.solo = createFight(
      view.config,
      view.arena,
      view.fighters.map((f) => ({ id: f.id, team: f.team, style: f.style })),
      0,
    );
    // L'arène est déjà agrandie par le serveur selon le nombre de combattants : la même
    this.solo.scale = view.scale;
  }

  private fit = () => {
    this.scene.resize(window.innerWidth, window.innerHeight);
  };

  onTick(_now: number, tick: CulbuteTick) {
    const prev = this.snaps.at(-1);
    if (prev && tick.f < prev.f - 30) {
      // Une revanche : nouveau combat, nouvelle horloge
      this.snaps.length = 0;
      this.pending.length = 0;
      this.renderF = null;
      this.minLag = null;
      this.unacked.length = 0;
      this.setupSolo(this.view);
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
    if (tick.m && this.solo && this.mySlot >= 0) this.reconcile(tick);
  }

  /** Le serveur a parlé : on repart de son état, et on rejoue les commandes qu'il n'a pas encore prises en compte */
  private reconcile(tick: CulbuteTick) {
    const solo = this.solo!;
    const me = solo.fighters[this.mySlot]!;
    const ack = tick.k[this.mySlot] ?? 0;
    while (this.unacked.length > 0 && this.unacked[0]!.seq <= ack) this.unacked.shift();
    const [ox, oy] = this.shownMe();
    solo.phase = tick.ph === 0 ? "intro" : tick.ph === 1 ? "fight" : "over";
    solo.frame = tick.f;
    unpackFull(me, tick.m!);
    // Les objets tels que le serveur les voit : on anticipe aussi le ramassage
    solo.items = [];
    for (let k = 0; k + ITEM_STRIDE <= tick.i.length; k += ITEM_STRIDE) {
      solo.items.push({
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
    this.syncOthers();
    for (const u of this.unacked) {
      this.prevX = me.x;
      this.prevY = me.y;
      stepSolo(solo, this.mySlot, u.input);
      predictHits(solo, this.mySlot);
    }
    if (this.unacked.length === 0) {
      this.prevX = me.x;
      this.prevY = me.y;
    }
    // Un petit écart se rattrape en douceur ; un grand (une sortie, un retour) se suit tout de suite
    const [nx, ny] = this.shownMe();
    const dx = ox - nx;
    const dy = oy - ny;
    if (Math.hypot(dx, dy) < 1.8 && me.state !== "dead" && me.state !== "respawn") {
      this.offX = dx;
      this.offY = dy;
    } else {
      this.offX = 0;
      this.offY = 0;
    }
  }

  /** Les autres, dans son combat anticipé, là où on les voit à l'écran */
  private syncOthers() {
    const solo = this.solo;
    const frame = this.lastFrame;
    if (!solo || !frame) return;
    for (const r of frame.fighters) {
      if (r.slot === this.mySlot) continue;
      const o = solo.fighters[r.slot];
      if (!o) continue;
      o.x = r.x;
      o.y = r.y;
      o.face = r.face;
      o.state = r.state;
      o.dmg = r.dmg;
      o.shield = r.shield;
      o.intangUntil = (r.flags & F_INTANG) !== 0 ? solo.frame + 2 : 0;
      o.ground = r.state === "stand" || r.state === "land" || r.state === "shield" || r.state === "squat" ? 0 : -1;
    }
  }

  /** Ses coups qui touchent, montrés tout de suite (le serveur confirmera un peu plus tard) */
  private showPredicted(hits: PredictedHit[]) {
    const frame = this.lastFrame;
    if (hits.length === 0 || !frame) return;
    const now = performance.now();
    const events: FightEvent[] = hits.map((h) => ({
      k: "hit",
      a: this.mySlot,
      v: h.v,
      dmg: h.dmg,
      x: h.x,
      y: h.y,
      power: h.power,
      kind: h.parry ? "parry" : h.shield ? "shield" : "hit",
      ...(h.ko ? { ko: true } : {}),
    }));
    for (const h of hits) this.predicted.push({ v: h.v, at: now, ko: h.ko });
    for (const e of events) this.scene.effect(e, frame);
    this.opts.onEvents(events, frame);
  }

  /** Un coup confirmé par le serveur : déjà montré s'il avait été deviné */
  private alreadyShown(e: FightEvent): boolean {
    if (e.k !== "hit" || e.a !== this.mySlot || this.mySlot < 0) return false;
    const now = performance.now();
    this.predicted = this.predicted.filter((p) => now - p.at < 900);
    const i = this.predicted.findIndex((p) => p.v === e.v && (p.ko || !e.ko));
    if (i < 0) return false;
    this.predicted.splice(i, 1);
    return true;
  }

  private shownMe(): [number, number] {
    const me = this.solo!.fighters[this.mySlot]!;
    const k = Math.min(1, this.acc / STEP);
    return [this.prevX + (me.x - this.prevX) * k + this.offX, this.prevY + (me.y - this.prevY) * k + this.offY];
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
      if (this.solo) {
        const me = this.solo.fighters[this.mySlot]!;
        this.prevX = me.x;
        this.prevY = me.y;
        stepSolo(this.solo, this.mySlot, input);
        this.syncOthers();
        this.showPredicted(predictHits(this.solo, this.mySlot));
      }
      this.sinceSend++;
    }
    // Un onglet resté en arrière-plan : on ne rattrape pas des secondes de commandes
    if (this.acc > STEP * 5) this.acc = 0;
    if (this.mySlot >= 0 && this.outbox.length > 0 && (this.sinceSend >= SEND_EVERY || now - this.lastSendAt > HEARTBEAT_MS)) {
      this.opts.send({ t: "in", s: this.outFirst, d: this.outbox, c: now });
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
    // Soi-même : l'anticipation
    if (this.solo && this.mySlot >= 0 && fighters[this.mySlot]) {
      const me = this.solo.fighters[this.mySlot]!;
      const server = fighters[this.mySlot]!;
      if (me.state !== "dead" && me.state !== "out" && this.solo.phase === "fight") {
        const [x, y] = this.shownMe();
        fighters[this.mySlot] = {
          ...server,
          x,
          y,
          face: me.face,
          state: me.state,
          move: me.move,
          mt: me.mt,
          t: me.t,
          charge: me.charge,
          shield: me.shield,
          item: me.item,
          ground: me.ground,
          kb: Math.hypot(me.kx, me.ky),
          me: true,
        };
      } else fighters[this.mySlot] = { ...server, me: true };
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
    const plats = platformsAt(this.view.arena as ArenaId, this.view.scale, Math.round(at));
    // Debout sur une plateforme qui bouge : ses pieds suivent la plateforme telle qu'on la voit
    const mine = fighters[this.mySlot];
    if (mine?.me && mine.ground >= 0 && plats[mine.ground]) mine.y = plats[mine.ground]!.y;
    return { frame: at, fighters, shots: lerpList(shots(a), shots(b)), items: lerpList(items(a), items(b)), traps, plats };
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    this.stepInputs(now);
    // Le rattrapage de son combattant s'efface en un dixième de seconde environ
    const fade = Math.exp(-dt * 12);
    this.offX *= fade;
    this.offY *= fade;
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
    this.scene.render(dt, frame);
    if (import.meta.env.DEV) (window as unknown as { __cbFrame: RenderFrame }).__cbFrame = frame;
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
