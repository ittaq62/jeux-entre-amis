// La boucle d'un service, côté navigateur : lire les commandes trente fois par seconde et les envoyer, et anticiper la
// cuisine. Le serveur envoie quinze fois par seconde l'état complet : l'appareil repart de cet état, rejoue ses propres
// commandes pas encore prises en compte (les autres gardent leur dernière commande), et montre son chef au présent :
// il prend, pose, coupe tout de suite. Les autres chefs glissent entre deux états reçus, un peu en retard, sans sauter.
// Celui qui regarde sans jouer voit les états reçus, sans rien anticiper.

import { buildKitchen } from "../../shared/games/toque/kitchens.ts";
import {
  packWorld,
  unpackInputs,
  unpackWorld,
  type ToqueClientMessage,
  type ToqueTick,
  type ToqueView,
} from "../../shared/games/toque/net.ts";
import {
  createWorld,
  DT,
  FPS,
  hazardNow,
  NO_INPUT,
  offsetsAt,
  serviceTime,
  step,
  targetCell,
  type Input,
  type ToqueEvent,
  type World,
} from "../../shared/games/toque/sim.ts";
import { ToqueControls } from "./controls.ts";
import { KitchenScene, type ChefDress, type ChefView } from "./scene/KitchenScene.ts";

/** En développement : une latence simulée (aller-retour, ms) et de la gigue (`localStorage.tqLag`, `tqJitter`) */
const LAG = import.meta.env.DEV ? Number(localStorage.getItem("tqLag") ?? 0) || 0 : 0;
const JITTER = import.meta.env.DEV ? Number(localStorage.getItem("tqJitter") ?? 0) || 0 : 0;
const lastArrival = { in: 0, out: 0 };
function later(way: "in" | "out", fn: () => void) {
  const at = Math.max(lastArrival[way], performance.now() + LAG / 2 + Math.random() * JITTER);
  lastArrival[way] = at;
  window.setTimeout(fn, at - performance.now());
}

const HEARTBEAT_MS = 100;
/** Le retard des autres chefs : au moins trois pas, plus la gigue mesurée */
const MIN_DELAY = 3;
const MAX_DELAY = 10;

/** Ce que ses propres gestes déclenchent : montré (et entendu) tout de suite, pas une seconde fois au retour du serveur */
const MINE = new Set(["take", "put", "drop", "pickup", "refuse", "trash", "throw", "dash", "swap", "chopped", "washed"]);

export interface HudState {
  world: World;
  /** Le chef du joueur (le sien, ou celui qu'il mène en ce moment), −1 pour un spectateur */
  me: number;
  ping: number;
  fps: number;
}

export interface RuntimeOptions {
  mySeat: string | null;
  dresses: ChefDress[];
  send: (msg: ToqueClientMessage) => void;
  onHud: (hud: HudState) => void;
  /** Ce qui arrive (sons, éclats, points) */
  onEvents: (events: ToqueEvent[], world: World, mine: number) => void;
}

interface Snap {
  f: number;
  chefs: { x: number; y: number; fx: number; fy: number; vx: number; vy: number }[];
}

export class ToqueRuntime {
  readonly controls = new ToqueControls();
  readonly scene: KitchenScene;
  private view: ToqueView;
  /** La cuisine anticipée (ou, pour un spectateur, la dernière reçue) */
  private world: World;
  private myOwner = -1;
  private seq = 0;
  private unacked: { seq: number; input: Input }[] = [];
  private outbox: number[] = [];
  private outFirst = 1;
  private lastSendAt = 0;
  private others: Input[] = [];
  private snaps: Snap[] = [];
  private renderF: number | null = null;
  private minLag: number | null = null;
  private jitter = 0.02;
  private raf = 0;
  private last = performance.now();
  private acc = 0;
  private disposed = false;
  private rtt = 0.08;
  private hudAt = 0;
  private fpsFrames = 0;
  private fpsAt = performance.now();
  private fps = 60;
  /** Son chef : sa place au pas d'avant (pour glisser d'une image à l'autre), l'écart à rattraper après une correction */
  private prev = { x: 0, y: 0 };
  private off = { x: 0, y: 0 };
  private pending: { f: number; events: ToqueEvent[] }[] = [];
  private received = false;

  constructor(
    host: HTMLElement,
    view: ToqueView,
    private opts: RuntimeOptions,
  ) {
    this.view = view;
    this.scene = new KitchenScene(host, view.kitchen, view.duel);
    this.scene.setChefs(opts.dresses);
    this.world = this.fresh(view);
    this.myOwner = opts.mySeat ? view.owners.findIndex((o) => o.seat === opts.mySeat) : -1;
    if (import.meta.env.DEV) (window as unknown as { __tq: unknown }).__tq = this;
    this.raf = requestAnimationFrame(this.loop);
  }

  private fresh(view: ToqueView): World {
    return createWorld(
      view.kitchen,
      view.duel,
      view.owners.map((o) => ({ team: o.team, chefs: o.chefs, bot: o.bot })),
      view.seed,
      { rush: view.config.rush },
    );
  }

  /** Tout préparer derrière l'écran de chargement */
  prepare(onProgress?: (share: number) => void) {
    return this.scene.prepare(onProgress);
  }

  setPaused(on: boolean) {
    this.controls.paused = on;
  }

  /** Un nouveau service (la revanche) : on repart de zéro */
  setView(view: ToqueView) {
    if (view.seed === this.view.seed) {
      this.view = view;
      return;
    }
    this.view = view;
    this.world = this.fresh(view);
    this.myOwner = this.opts.mySeat ? view.owners.findIndex((o) => o.seat === this.opts.mySeat) : -1;
    this.snaps = [];
    this.pending = [];
    this.unacked = [];
    this.renderF = null;
    this.minLag = null;
    this.received = false;
  }

  setDresses(dresses: ChefDress[]) {
    this.opts.dresses = dresses;
    this.scene.setChefs(dresses);
  }

  onTick(now: number, tick: ToqueTick) {
    if (LAG > 0 || JITTER > 0) {
      later("in", () => !this.disposed && this.receive(now, tick));
      return;
    }
    this.receive(now, tick);
  }

  private receive(_now: number, tick: ToqueTick) {
    const p = tick.w;
    const prev = this.snaps.at(-1);
    if (prev && p.f < prev.f - 60) {
      // Un nouveau service : nouvelle horloge
      this.snaps = [];
      this.renderF = null;
      this.minLag = null;
      this.unacked = [];
    }
    const arrival = performance.now() / 1000;
    const lag = arrival - p.f / FPS;
    this.minLag = this.minLag === null ? lag : Math.min(lag, this.minLag + 0.0012);
    this.jitter = Math.max(lag - this.minLag, this.jitter * 0.99);
    this.snaps.push({ f: p.f, chefs: p.c.map((c) => ({ x: c[0], y: c[1], vx: c[2], vy: c[3], fx: c[4], fy: c[5] })) });
    if (this.snaps.length > 30) this.snaps.shift();
    if (tick.e.length > 0) this.pending.push({ f: p.f, events: tick.e });
    if (this.myOwner >= 0) {
      const stamp = tick.c[this.myOwner] ?? 0;
      if (stamp > 0) {
        const sample = Math.max(0, performance.now() - stamp) / 1000;
        if (sample < 2) this.rtt = this.rtt * 0.9 + sample * 0.1;
      }
    }
    this.reconcile(tick);
    this.received = true;
  }

  /** Le serveur a parlé : on repart de son état, et on rejoue ses commandes qu'il n'a pas encore prises en compte */
  private reconcile(tick: ToqueTick) {
    const w = this.world;
    const mine = this.myChef();
    const before = mine >= 0 ? this.shown(mine) : null;
    unpackWorld(w, tick.w);
    if (this.myOwner < 0) return;
    const ack = tick.k[this.myOwner] ?? 0;
    while (this.unacked.length > 0 && this.unacked[0]!.seq <= ack) this.unacked.shift();
    this.others = unpackInputs(tick.u, this.view.owners.length);
    for (const u of this.unacked) {
      this.keepPrev();
      step(w, this.inputsWith(u.input));
    }
    // Un écart se rattrape en douceur (sauf un grand : une chute, un retour au départ)
    const c = this.myChef();
    if (c >= 0 && before) {
      const now = this.shown(c);
      const dx = before[0] - now[0];
      const dy = before[1] - now[1];
      const ax = this.off.x + dx;
      const ay = this.off.y + dy;
      if (Math.hypot(ax, ay) < 1.5 && w.chefs[c]!.out === 0) {
        this.off.x = ax;
        this.off.y = ay;
      } else {
        this.off.x = 0;
        this.off.y = 0;
      }
    }
  }

  /** Le chef que mène le joueur en ce moment */
  private myChef(): number {
    return this.myOwner >= 0 ? (this.world.active[this.myOwner] ?? -1) : -1;
  }

  private inputsWith(mine: Input): Input[] {
    return this.view.owners.map((_, i) => (i === this.myOwner ? mine : { ...(this.others[i] ?? NO_INPUT), pressed: 0 }));
  }

  private keepPrev() {
    const c = this.world.chefs[this.myChef()];
    if (!c) return;
    this.prev.x = c.x;
    this.prev.y = c.y;
  }

  /** Où montrer son chef : entre ses deux derniers pas, plus ce qui reste à rattraper */
  private shown(slot: number): [number, number] {
    const c = this.world.chefs[slot]!;
    const k = Math.min(1, this.acc / DT);
    return [this.prev.x + (c.x - this.prev.x) * k + this.off.x, this.prev.y + (c.y - this.prev.y) * k + this.off.y];
  }

  private stepInputs(now: number) {
    let steps = 0;
    while (this.acc >= DT && steps < 5) {
      this.acc -= DT;
      steps++;
      const s = this.controls.sample();
      if (this.myOwner < 0 || !this.received) continue;
      const [x, y] = this.scene.screenToPlan(s.sx, s.sy);
      const input: Input = { x, y, held: s.held, pressed: s.pressed };
      this.seq++;
      if (this.outbox.length === 0) this.outFirst = this.seq;
      this.outbox.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100, input.held, input.pressed);
      this.unacked.push({ seq: this.seq, input });
      if (this.unacked.length > 90) this.unacked.shift();
      this.keepPrev();
      const ev = step(this.world, this.inputsWith(input));
      const mine = this.myChef();
      const own = ev.filter((e) => "c" in e && e.c === mine && MINE.has(e.k));
      if (own.length > 0) this.opts.onEvents(own, this.world, mine);
    }
    if (this.acc > DT * 5) this.acc = 0;
    if (this.myOwner >= 0 && this.outbox.length > 0 && (this.outbox.length >= 4 || now - this.lastSendAt > HEARTBEAT_MS)) {
      const msg: ToqueClientMessage = { t: "in", s: this.outFirst, d: this.outbox, c: now };
      if (LAG > 0 || JITTER > 0) later("out", () => this.opts.send(msg));
      else this.opts.send(msg);
      this.outbox = [];
      this.lastSendAt = now;
    }
  }

  private advanceClock(dt: number): number | null {
    if (this.minLag === null || this.snaps.length === 0) return null;
    const delay = Math.min(MAX_DELAY, Math.max(MIN_DELAY, MIN_DELAY + this.jitter * FPS));
    const target = (performance.now() / 1000 - this.minLag) * FPS - delay;
    if (this.renderF === null || Math.abs(target - this.renderF) > 15) this.renderF = target;
    else this.renderF += dt * FPS + (target - this.renderF) * Math.min(1, dt * 2);
    return this.renderF;
  }

  /** Les autres chefs, entre deux états reçus */
  private othersAt(at: number): Snap["chefs"] | null {
    const n = this.snaps.length;
    if (n === 0) return null;
    let a = this.snaps[0]!;
    let b = this.snaps[n - 1]!;
    if (at >= b.f) a = n >= 2 ? this.snaps[n - 2]! : b;
    else
      for (let i = n - 1; i > 0; i--) {
        if (this.snaps[i - 1]!.f <= at) {
          a = this.snaps[i - 1]!;
          b = this.snaps[i]!;
          break;
        }
      }
    const span = Math.max(1, b.f - a.f);
    const k = Math.max(0, Math.min(1.3, (at - a.f) / span));
    return b.chefs.map((cb, i) => {
      const ca = a.chefs[i] ?? cb;
      const jump = Math.hypot(cb.x - ca.x, cb.y - ca.y) > 2;
      return {
        x: jump ? cb.x : ca.x + (cb.x - ca.x) * k,
        y: jump ? cb.y : ca.y + (cb.y - ca.y) * k,
        fx: k < 0.5 ? ca.fx : cb.fx,
        fy: k < 0.5 ? ca.fy : cb.fy,
        vx: cb.vx,
        vy: cb.vy,
      };
    });
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    this.stepInputs(now);
    const fade = Math.exp(-dt * 10);
    this.off.x *= fade;
    this.off.y *= fade;
    this.fpsFrames++;
    if (now - this.fpsAt > 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsAt));
      this.fpsFrames = 0;
      this.fpsAt = now;
    }
    const w = this.world;
    const at = this.advanceClock(dt);
    // Ce que le serveur annonce, au moment où les autres chefs le font à l'écran (sauf ses propres gestes, déjà montrés)
    if (at !== null) {
      const due: ToqueEvent[] = [];
      const mine = this.myChef();
      while (this.pending.length > 0 && this.pending[0]!.f <= at + 2)
        for (const e of this.pending.shift()!.events) if (!("c" in e && e.c === mine && MINE.has(e.k))) due.push(e);
      if (due.length > 0) this.opts.onEvents(due, w, mine);
    }
    const others = at !== null ? this.othersAt(at) : null;
    const mine = this.myChef();
    const chefs: ChefView[] = w.chefs.map((c, i) => {
      const o = others?.[i];
      const isMine = i === mine;
      const [x, y] = isMine ? this.shown(i) : o ? [o.x, o.y] : [c.x, c.y];
      const fx = isMine || !o ? c.fx : o.fx;
      const fy = isMine || !o ? c.fy : o.fy;
      const vx = isMine || !o ? c.vx : o.vx;
      const vy = isMine || !o ? c.vy : o.vy;
      return { slot: i, x, y, fx, fy, held: c.held, act: c.act, out: c.out, dash: c.dash, stun: c.stun, speed: Math.hypot(vx, vy) };
    });
    const k = buildKitchen(w.kitchen, w.duel);
    const target = mine >= 0 && w.phase === 1 ? targetCell(k, offsetsAt(k, serviceTime(w)), w.chefs[mine]!) : -1;
    this.scene.render(dt, this.received ? { world: w, chefs, me: mine, target, t: serviceTime(w), tilt: hazardNow(w).tilt } : null);
    if (now - this.hudAt > 120) {
      this.hudAt = now;
      this.opts.onHud({ world: w, me: mine, ping: Math.round(this.rtt * 1000), fps: this.fps });
    }
  };

  /** Pour les essais : l'état serré de la cuisine anticipée */
  debugPacked() {
    return packWorld(this.world);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.scene.dispose();
  }
}
