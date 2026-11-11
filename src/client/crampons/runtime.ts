// La boucle d'un match, côté navigateur : recevoir les positions, les rejouer à vitesse constante un peu en retard pour
// qu'elles soient fluides, anticiper son propre joueur pour que le stick réponde tout de suite, et traduire les boutons en gestes.

import { GRAVITY, stepBall, type Ball } from "../../shared/games/crampons/ball.ts";
import { planPass, planThrough, shotSpeed, throughTarget } from "../../shared/games/crampons/kicks.ts";
import {
  BURST_COOLDOWN,
  BURST_S,
  BURST_SPEED,
  steer,
  topSpeed,
  type Act,
  type HumanActionKind,
  type MatchEvent,
  type Player,
} from "../../shared/games/crampons/model.ts";
import { clamp, DT, GOAL_HALF, HALF_L, lerp, wrapAngle } from "../../shared/games/crampons/pitch.ts";
import { ACTS, TICK_STRIDE, type CramponsTick, type CramponsView } from "../../shared/games/crampons/view.ts";
import type { CramponsSettings } from "./bindings.ts";
import { CramponsControls, type GameButton, type Scheme } from "./controls.ts";
import { CramponsScene, SCORER_CAM_DIST, type SceneFrame } from "./scene/CramponsScene.ts";
import { KICK_CONTACT, KICK_HOLD, type FootballerView } from "./scene/footballers.ts";

/** La distance d'un point à la ligne de vue, de la caméra (cx, cz) à ce qu'elle filme (tx, tz) */
function distToSight(px: number, pz: number, cx: number, cz: number, tx: number, tz: number): number {
  const dx = tx - cx;
  const dz = tz - cz;
  const u = clamp(((px - cx) * dx + (pz - cz) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - cx - dx * u, pz - cz - dz * u);
}

const SEND_EVERY_MS = 33;
/** La présentation du match, avant le coup d'envoi */
const INTRO_S = 2.4;
/** Même sans changement, on donne signe de vie : c'est aussi ce qui mesure le temps de trajet */
const HEARTBEAT_MS = 220;
/** Au moins ce retard, pour avoir toujours deux positions entre lesquelles glisser (en secondes) */
const MIN_DELAY = 0.075;
const MAX_DELAY = 0.32;
/** Faute de position récente, on prolonge le mouvement, mais pas longtemps */
const MAX_EXTRAPOLATE = 0.12;
/** Ces boutons partent dès l'appui : seule la frappe se charge */
const INSTANT: readonly GameButton[] = ["pass", "through", "lob"];
/** Un geste de frappe mené par l'affichage commence juste avant que le pied n'arrive au ballon */
const KICK_START = KICK_CONTACT - 0.02;

/** Le ballon qu'on voit partir dès le clic, sans attendre la réponse du serveur */
interface Ghost {
  ball: Ball;
  kicker: number;
  born: number;
  /** Le temps que doit durer son voyage : l'écart avec le vrai ballon se résorbe d'ici là */
  eta: number;
  seen: boolean;
  lastX: number;
  lastY: number;
  lastZ: number;
}

interface Snapshot {
  sim: number;
  p: number[];
  b: number[];
  o: number;
}

export interface HudState {
  clock: number;
  /** Le joueur qu'il dirige, ou -1 */
  active: number;
  activeName: string;
  stamina: number;
  charge: number;
  hasBall: boolean;
  /** Son gardien tient le ballon dans les mains : à lui de relancer */
  keeperHold: boolean;
  /** L'équipe adverse a le ballon */
  defending: boolean;
  scheme: Scheme;
  /** Images par seconde et temps de réponse, en millisecondes */
  fps: number;
  ping: number;
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
  act: (k: HumanActionKind, p: number, x: number, z: number, to?: number) => void;
  onHud: (hud: HudState) => void;
  /** Le joueur vient de frapper : on l'entend tout de suite, sans attendre le serveur */
  onLocalKick: (kind: HumanActionKind) => void;
  /** Les premières images sont prêtes : on peut lever le rideau */
  onReady?: () => void;
  /** Les événements du match, au moment où l'image les montre : le son de la frappe quand le pied touche le ballon */
  onEvents: (events: MatchEvent[]) => void;
  /** L'état du match tel que l'image le montre : le score change quand le ballon franchit la ligne à l'écran */
  onShownView?: (view: CramponsView) => void;
  /** À chaque image, l'envie du public d'après ce qu'on voit (de 0 à 1) : le stade gronde quand ça chauffe */
  onCrowd?: (dt: number, mood: number) => void;
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
  private scheme: Scheme = "clavier";
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
  /** Son joueur au pas de calcul d'avant : on le montre entre les deux, sinon il n'avancerait qu'une image sur deux */
  private prevX = 0;
  private prevZ = 0;
  private prevH = 0;
  private errFor = 0;
  private settings: CramponsSettings;
  // La qualité s'adapte : si l'ordinateur peine, on allège l'image plutôt que de laisser le jeu saccader
  private fpsFrames = 0;
  private fpsAt = performance.now();
  private fps = 60;
  private slowFor = 0;
  private resolution = 1;
  private shadowsOn = true;
  private rtt = 0.09;
  private lastEcho = 0;
  private predBlocked = false;
  /**
   * L'image a un temps de retard sur le serveur, pour être fluide : les événements et l'état du match attendent qu'elle
   * les ait rattrapés. Sinon on entend la frappe avant de la voir, et la fête commence avant que le ballon n'entre.
   */
  private pendingEvents: { at: number; events: MatchEvent[] }[] = [];
  private pendingViews: { at: number; view: CramponsView }[] = [];
  /** L'état du match tel que l'image le montre */
  private shown: CramponsView;
  /** Le geste de frappe de chaque joueur, calé sur le départ du ballon à l'écran (performance.now()) */
  private kickShow = new Map<number, number>();
  /** Sa propre frappe, partie au clic : le serveur ne fera que la confirmer */
  private localKick: { p: number; at: number } | null = null;
  /** Ce que faisait son équipe quand on a enfoncé chaque bouton : si le ballon a changé de camp, le relâcher ne fait rien */
  private pressCtx = new Map<GameButton, "ball" | "foe" | "free">();
  /** Le joueur qu'on cesse d'anticiper : l'écart avec sa position du serveur s'efface en douceur */
  private releaseFor = -1;
  private releaseX = 0;
  private releaseZ = 0;
  private lastPredX = 0;
  private lastPredZ = 0;
  /** La dernière position du serveur de son joueur : un saut, c'est une remise en place */
  private srvFor = -1;
  private srvX = 0;
  private srvZ = 0;
  /** L'instant du but, en temps du match : le ralenti s'arrête juste après */
  private goalSim = -Infinity;
  // Le ballon montré : il suit le pied en douceur, sans sauter d'un côté à l'autre du joueur
  private shownBall = { x: 0, y: 0.2, z: 0 };
  private lastOwner = -2;
  private ownerChangedAt = 0;
  // Le film des dernières secondes, pour revoir un but au ralenti
  private film: { t: number; p: Float32Array; b: Float32Array; acts: Act[] }[] = [];
  private cinema: "intro" | "scorer" | "replay" | null = null;
  private cinemaT = 0;
  private replayAt = 0;
  private replayEnd = 0;
  private goalEnd = 1;
  private goalX = 0;
  private goalZ = 0;
  private goalScorer = -1;
  /** L'état du match a bien annoncé le but : avant cela, il peut encore dire que le jeu continue */
  private goalSeen = false;
  private goalAngle = 0;
  private intro = true;
  private cursorPoint: [number, number] | null = null;
  private aimX = 0;
  private aimZ = 0;
  /** Le coéquipier désigné à l'écran : c'est lui qui recevra la passe */
  private receiver = -1;
  private firedOnPress = new Set<GameButton>();
  private ghost: Ghost | null = null;
  /** Une passe arrive à son joueur : il va seul au ballon, et le serveur seul sait où il est */
  private receiving = false;
  private blendX = 0;
  private blendZ = 0;
  private predShownFor = -1;
  private burstUntilMs = 0;
  private burstReadyMs = 0;
  private touchPhase = 0;
  private shownFrames = 0;
  private jank = 0;
  private startedAt = performance.now();

  constructor(
    canvas: HTMLCanvasElement,
    view: CramponsView,
    private opts: RuntimeOptions,
    lowQuality: boolean,
    settings: CramponsSettings,
  ) {
    this.settings = settings;
    this.view = view;
    this.shown = view;
    this.myIndex = view.humans.findIndex((h) => h.id === opts.seatId);
    this.scene = new CramponsScene(canvas, {
      count: view.players.length,
      kits: [view.teams[0].kit, view.teams[1].kit],
      gkKits: [view.teams[0].keeper, view.teams[1].keeper],
      keepers: view.players.map((p) => p.role === "GK"),
      shirts: view.players.map((p) => p.shirt),
      ambience: view.config.ambience,
      lowQuality,
      weather: view.config.weather,
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
    this.controls = new CramponsControls(settings.bindings);
    this.controls.attachMouse(canvas);
    this.applyQuality();
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
    // On ne montre ce nouvel état que lorsque l'image en est au même instant
    const at = this.snaps.at(-1)?.sim;
    if (at === undefined || this.renderSim === null) this.applyShown(view);
    else this.pendingViews.push({ at, view });
  }

  private applyShown(view: CramponsView) {
    this.shown = view;
    this.scene.setScoreboard({ left: view.teams[0].short, right: view.teams[1].short, score: view.score });
    this.opts.onShownView?.(view);
  }

  /** Libère ce que l'image vient de rattraper : les événements (sons, bandeaux, fête), puis l'état du match */
  private releaseDue() {
    const at = this.renderSim;
    const latest = this.snaps.at(-1)?.sim ?? 0;
    const nowMs = performance.now();
    while (this.pendingEvents.length > 0) {
      const due = this.pendingEvents[0]!;
      if (at !== null && due.at > at && latest - due.at < 1) break;
      this.pendingEvents.shift();
      // Restés en attente trop longtemps (l'onglet était caché) : on ne rejoue pas les sons d'il y a longtemps
      if (at !== null && at - due.at > 1.5) continue;
      // L'image juste avant ces événements : une touche se joue à la main, pas d'un coup de pied
      const before = this.snaps.findLast((sn) => sn.sim < due.at);
      for (const e of due.events) {
        if (e.k !== "kick") continue;
        if (before && ACTS[before.p[e.p * TICK_STRIDE + 4]!] === "throw") continue;
        // Le pied part quand le ballon part ; sa propre frappe, on l'a déjà vue partir au clic
        const k = this.localKick;
        if (!k || k.p !== e.p || nowMs - k.at > 1500) this.kickShow.set(e.p, nowMs);
      }
      this.opts.onEvents(due.events);
    }
    while (this.pendingViews.length > 0) {
      const due = this.pendingViews[0]!;
      if (at !== null && due.at > at && latest - due.at < 1) break;
      this.pendingViews.shift();
      this.applyShown(due.view);
    }
  }

  /** Le filet tremble, les confettis tombent, et la célébration commence */
  goal(scorer: number, team: number) {
    const end = this.shownBall.x > 0 ? 1 : -1;
    this.scene.shakeNet(end);
    const kit = this.view.teams[team as 0 | 1].kit;
    this.scene.celebrate(end, [kit.shirt, kit.sleeves, kit.shorts, "#ffffff", "#f8d866"]);
    this.goalEnd = end;
    this.goalScorer = scorer;
    this.goalSeen = false;
    this.cinema = "scorer";
    this.cinemaT = 0;
    const v = this.frameViews[scorer];
    this.goalX = v?.x ?? this.shownBall.x;
    this.goalZ = v?.z ?? this.shownBall.z;
    this.goalAngle = this.clearAngle(scorer);
    // Le ralenti finit un peu après que le ballon a franchi la ligne : on le voit gonfler les filets
    this.goalSim = this.renderSim ?? this.film.at(-1)?.t ?? 0;
    this.replayEnd = this.goalSim + 0.8;
  }

  /** L'angle du gros plan où personne ne s'interpose entre la caméra et le buteur */
  private clearAngle(scorer: number): number {
    let best = 0;
    let bestGap = -1;
    for (const a of [0, -0.8, 0.8, -1.3, 1.3]) {
      const cx = this.goalX - Math.cos(a) * SCORER_CAM_DIST * this.goalEnd;
      const cz = this.goalZ + Math.sin(a) * SCORER_CAM_DIST;
      let gap = Infinity;
      this.frameViews.forEach((p, i) => {
        if (i !== scorer) gap = Math.min(gap, distToSight(p.x, p.z, cx, cz, this.goalX, this.goalZ));
      });
      if (gap > bestGap + 0.4) {
        bestGap = gap;
        best = a;
      }
    }
    return best;
  }

  /** Le choc d'une grosse frappe, ressenti jusque dans la caméra */
  punch(player: number, power: number) {
    const v = this.frameViews[player];
    if (v) this.scene.impact(v.x, v.z, power);
  }

  /** Une frappe ou un tacle arrache un peu d'herbe */
  dust(player: number, strength: number) {
    const v = this.frameViews[player];
    if (v) this.scene.puff(v.x, v.z, strength > 0.7 ? 7 : 4, strength);
  }

  /** Le ralenti est-il en cours ? Le joueur peut alors passer */
  get inCinema(): "intro" | "scorer" | "replay" | null {
    return this.cinema;
  }

  /** De nouvelles touches, une autre visée ou une autre qualité : tout s'applique aussitôt */
  setSettings(s: CramponsSettings) {
    this.settings = s;
    this.controls.setBindings(s.bindings);
    this.applyQuality();
  }

  setPaused(on: boolean) {
    this.controls.paused = on;
  }

  private applyQuality() {
    const q = this.settings.quality;
    this.resolution = q === "basse" ? 0.6 : q === "moyenne" ? 0.8 : 1;
    this.shadowsOn = q !== "basse";
    this.slowFor = 0;
    this.scene.setResolution(this.resolution, q === "haute" ? 3.7e6 : 2.3e6);
    this.scene.setShadows(this.shadowsOn);
  }

  /** En mode automatique : des images qui manquent ou qui arrivent en retard deux secondes de suite, et on allège d'un cran */
  private adaptQuality(now: number, frameMs: number) {
    this.fpsFrames++;
    if (frameMs > 25) this.jank++;
    if (now - this.fpsAt < 1000) return;
    this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsAt));
    const jank = this.jank;
    this.fpsFrames = 0;
    this.jank = 0;
    this.fpsAt = now;
    // Les toutes premières secondes ne comptent pas : la carte graphique finit de tout charger
    if (this.settings.quality !== "auto" || document.hidden || now - this.startedAt < 3500) return;
    this.slowFor = this.fps < 45 || jank >= 6 ? this.slowFor + 1 : 0;
    if (this.slowFor < 2) return;
    this.slowFor = 0;
    if (this.resolution > 0.62) {
      this.resolution = Math.max(0.6, this.resolution - 0.14);
      this.scene.setResolution(this.resolution, 2.3e6);
    } else if (this.shadowsOn) {
      this.shadowsOn = false;
      this.scene.setShadows(false);
    }
  }

  setCamera(mode: "tele" | "large" | "pres") {
    this.scene.mode = mode;
  }

  /** Ce coup de pied du joueur a déjà été entendu et vu au moment d'appuyer : le serveur ne fait que le confirmer */
  isLocalKick(p: number): boolean {
    const k = this.localKick;
    if (!k || k.p !== p || performance.now() - k.at > 1500) return false;
    this.localKick = null;
    return true;
  }

  private fit = () => {
    this.scene.resize(window.innerWidth, window.innerHeight);
  };

  /** Un nouveau match commence sur le même terrain (la revanche) : son horloge repart de zéro, on oublie l'ancien */
  private resetTimeline() {
    this.snaps.length = 0;
    this.minLag = null;
    this.renderSim = null;
    this.jitter = 0.02;
    this.film.length = 0;
    this.pendingEvents.length = 0;
    for (const v of this.pendingViews.splice(0)) this.applyShown(v.view);
    this.pred = null;
    this.predFor = -1;
    this.predShownFor = -1;
    this.releaseFor = -1;
    this.srvFor = -1;
    this.ghost = null;
    this.localKick = null;
    this.kickShow.clear();
    this.cinema = null;
    this.scene.setShot(null);
    this.goalSim = -Infinity;
    this.intro = true;
  }

  onTick(_now: number, tick: CramponsTick) {
    const prev = this.snaps.at(-1);
    if (prev && tick.s < prev.sim - 1) this.resetTimeline();
    const arrival = performance.now() / 1000;
    const lag = arrival - tick.s;
    // Le trajet le plus court observé sert de référence ; il remonte très lentement pour suivre le réseau
    this.minLag = this.minLag === null ? lag : Math.min(lag, this.minLag + 0.0015);
    const late = lag - this.minLag;
    this.jitter = Math.max(late, this.jitter * 0.992);
    this.snaps.push({ sim: tick.s, p: tick.p, b: tick.b, o: tick.o });
    if (this.snaps.length > 40) this.snaps.shift();
    if (tick.e.length > 0) this.pendingEvents.push({ at: tick.s, events: tick.e });
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
    const speed = tick.p[k + 3]!;
    const act = ACTS[tick.p[k + 4]!] ?? "none";
    const stam = tick.p[k + 5]! / 100;
    this.receiving = tick.r === a;
    // Le serveur l'a replacé d'un coup (remise en jeu, engagement) : on le suit sans glisser
    const jumped = this.srvFor === a && Math.hypot(x - this.srvX, z - this.srvZ) > 2;
    this.srvFor = a;
    this.srvX = x;
    this.srvZ = z;
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
        vx: Math.cos(h) * speed,
        vz: Math.sin(h) * speed,
        h,
        stam,
      };
      this.prevX = x;
      this.prevZ = z;
      this.prevH = h;
      return;
    }
    const p = this.pred;
    p.stam = stam;
    if (this.receiving) {
      // Il court seul vers le ballon : on le garde prêt à repartir du bon endroit, à la bonne vitesse
      p.x = x;
      p.z = z;
      p.h = h;
      p.vx = Math.cos(h) * speed;
      p.vz = Math.sin(h) * speed;
      this.prevX = x;
      this.prevZ = z;
      this.prevH = h;
      this.history.length = 0;
      this.corrX = this.corrZ = 0;
      this.predBlocked = false;
      return;
    }
    // Un geste qui commande le corps, ou une remise en jeu : c'est le serveur qui sait
    this.predBlocked = act !== "none" && act !== "kick";
    if (this.predBlocked || jumped) {
      p.x = x;
      p.z = z;
      p.vx = 0;
      p.vz = 0;
      p.h = h;
      this.prevX = x;
      this.prevZ = z;
      this.prevH = h;
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
    // Un petit écart est normal quand on court : on ne touche à rien tant qu'il reste raisonnable
    const tolerated = 0.22 + Math.hypot(p.vx, p.vz) * 0.05;
    if (err > 5) {
      p.x = x;
      p.z = z;
      p.vx = 0;
      p.vz = 0;
      this.prevX = x;
      this.prevZ = z;
      this.history.length = 0;
      this.corrX = this.corrZ = 0;
    } else if (err > tolerated) {
      // Un écart passager vient du temps de trajet et se résorbe tout seul : on ne recale que s'il dure
      this.errFor += DT;
      if (this.errFor > 0.25) {
        this.corrX = ex;
        this.corrZ = ez;
      }
    } else {
      this.errFor = 0;
      this.corrX = this.corrZ = 0;
    }
  }

  private isTaking(active: number) {
    const r = this.view.restart;
    return Boolean(r?.ready && r.taker === active && this.view.phase !== "play");
  }

  /**
   * Le curseur vise-t-il ? Oui si le joueur s'en sert : il l'a bougé il y a peu, ou il ne dirige pas son joueur au
   * clavier. Une souris oubliée dans un coin pendant qu'on court aux flèches enverrait la passe n'importe où.
   */
  private cursorAims(pad: { mouse: { x: number; y: number } | null; mouseIdle: number; scheme: Scheme }, mx: number, mz: number): boolean {
    if (this.settings.aim !== "curseur" || pad.scheme !== "clavier" || !pad.mouse) return false;
    return pad.mouseIdle < 2500 || Math.hypot(mx, mz) < 0.2;
  }

  /** La direction d'une action : le curseur, si le joueur vise avec, sinon le sens de sa course */
  private aimOf(kind: HumanActionKind, mx: number, mz: number, cursor: { x: number; y: number } | null, scheme: Scheme): [number, number] {
    if (this.settings.aim !== "curseur" || scheme !== "clavier" || !cursor || !this.pred || !this.cursorPoint) return [mx, mz];
    const pt = this.scene.pickGround(cursor.x, cursor.y);
    if (!pt) return [mx, mz];
    const dx = pt[0] - this.pred.x;
    const dz = pt[1] - this.pred.z;
    const l = Math.hypot(dx, dz) || 1;
    // Pour une frappe, le curseur donne la ligne de tir : on regarde où elle coupe la ligne de but
    if (kind === "shot" || kind === "finesse" || kind === "chip") {
      const toGoal = this.attackEnd() * HALF_L - this.pred.x;
      const z = Math.abs(dx) > 1 && Math.sign(dx) === Math.sign(toGoal) ? this.pred.z + (dz * toGoal) / dx : pt[1];
      return [Math.sign(toGoal), clamp(z / (GOAL_HALF + 0.3), -1, 1)];
    }
    return [dx / l, dz / l];
  }

  private attackEnd(): number {
    const myTeam = this.myIndex >= 0 ? this.view.humans[this.myIndex]!.team : 0;
    return (myTeam === 0) !== this.view.flipped ? 1 : -1;
  }

  /** Fait partir le ballon à l'écran dès le geste : le vrai, celui du serveur, le rejoindra pendant son voyage */
  private launchGhost(kind: HumanActionKind, power: number, to: number, ax: number, az: number, me: number) {
    const s = this.shownBall;
    const end = this.attackEnd();
    const q = to >= 0 ? this.frameViews[to] : undefined;
    let vx: number;
    let vy = 0;
    let vz: number;
    let eta: number;
    if (kind === "pass" && q) {
      const plan = planPass(s.x, s.z, q.x, q.z, Math.cos(q.h) * q.v, Math.sin(q.h) * q.v, power);
      const d = Math.max(0.1, Math.hypot(plan.tx - s.x, plan.tz - s.z));
      vx = ((plan.tx - s.x) / d) * plan.v;
      vz = ((plan.tz - s.z) / d) * plan.v;
      eta = plan.t;
    } else if (kind === "through" && q) {
      const [tx, tz] = throughTarget(q.x, q.z, end, ax, az, power);
      const plan = planThrough(s.x, s.z, q.x, q.z, tx, tz);
      const d = Math.max(0.1, Math.hypot(tx - s.x, tz - s.z));
      vx = ((tx - s.x) / d) * plan.v;
      vz = ((tz - s.z) / d) * plan.v;
      eta = plan.t;
    } else if ((kind === "shot" || kind === "finesse") && Math.abs(az) > 0.12) {
      const gx = end * HALF_L;
      const aimZ = clamp(az, -1, 1) * GOAL_HALF * 0.9;
      const d = Math.max(1, Math.hypot(gx - s.x, aimZ - s.z));
      const speed = shotSpeed(power, 0.78) * (kind === "finesse" ? 0.84 : 1);
      eta = d / speed;
      vx = ((gx - s.x) / d) * speed;
      vz = ((aimZ - s.z) / d) * speed;
      vy = (lerp(0.35, 1.5, power * power) - s.y + 0.5 * GRAVITY * eta * eta) / eta;
    } else return;
    this.ghost = {
      ball: { x: s.x, y: s.y, z: s.z, vx, vy, vz, curl: 0 },
      kicker: me,
      born: performance.now(),
      eta,
      seen: false,
      lastX: 0,
      lastY: 0,
      lastZ: 0,
    };
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
    // Son gardien : sa frappe est un dégagement (le serveur en décide), et il ne bouge pas tant qu'il tient le ballon
    const keeper = hasBall && this.view.players[active]?.role === "GK";
    const holding = keeper && ACTS[lastSnap!.p[active * TICK_STRIDE + 4]!] === "hold";

    const kindFor = (button: GameButton): HumanActionKind => {
      // Un penalty se tire, un coup d'envoi se passe : quelle que soit la touche, on fait ce qui va de soi
      const restart = this.view.restart?.kind;
      if (taking && restart === "penalty") return "shot";
      if (taking && restart === "kickoff") return "pass";
      if (button !== "shoot") return WITH_BALL[button];
      const touch = this.controls.touch;
      const kind = pad.chip ? "chip" : pad.finesse ? "finesse" : "shot";
      // Sur l'écran tactile, « effet » et « piqué » ne valent que pour un seul tir
      touch.finesse = false;
      touch.chip = false;
      return kind;
    };

    // Pendant la présentation ou un ralenti, n'importe quel geste le passe ; le buteur, on le voit d'abord un instant
    // (on vient souvent de tirer : un clic de trop ne doit pas effacer la fête). Ce geste ne fait rien d'autre :
    // passer la présentation ne donne pas le coup d'envoi.
    const watching = this.cinema !== null;
    if (watching) {
      const skippable = this.cinema === "intro" ? this.cinemaT > 0.4 : this.cinema === "scorer" ? this.cinemaT > 1.8 : true;
      if (skippable && pad.pressed.length > 0) {
        if (this.cinema !== "intro") this.opts.act("skip", 0, 0, 0);
        this.cinema = null;
        this.scene.setShot(null);
      }
      for (const b of pad.pressed) this.firedOnPress.add(b);
    }
    if (pad.swap) this.opts.act("switch", 0, 0, 0);
    if (pad.skill && !taking) {
      this.opts.act("skill", 0, mx, mz);
      if (hasBall && now >= this.burstReadyMs) {
        this.burstUntilMs = now + BURST_S * 1000;
        this.burstReadyMs = now + BURST_COOLDOWN * 1000;
      }
    }
    const fire = (button: GameButton, power: number) => {
      const kicking = hasBall && !taking;
      // Le ballon est déjà parti au clic d'avant, le serveur ne le sait pas encore : un deuxième clic ne refait rien partir
      if (kicking && this.localKick && now - this.localKick.at < (this.rtt + 0.3) * 1000) return;
      const kind = kindFor(button);
      const [ax, az] = this.aimOf(kind, mx, mz, pad.mouse, pad.scheme);
      const to = kind === "pass" || kind === "through" || kind === "lob" ? this.receiver : -1;
      this.opts.act(kind, power, ax, az, to);
      if (kicking) {
        this.localKick = { p: active, at: now };
        this.kickShow.set(active, now);
        this.opts.onLocalKick(kind);
        if (!keeper || kind === "pass" || kind === "through") this.launchGhost(kind, power, to, ax, az, active);
      }
    };
    const ctx = taking || hasBall ? "ball" : foeHasIt ? "foe" : "free";
    // Une passe part à l'instant où on appuie : c'est ce qui fait la différence entre un jeu vif et un jeu lourd.
    // Au penalty, toutes les touches tirent : elles se chargent comme la frappe.
    const penalty = taking && this.view.restart?.kind === "penalty";
    for (const b of pad.pressed) {
      if (watching) break;
      this.pressCtx.set(b, ctx);
      if (!INSTANT.includes(b) || foeHasIt || penalty) continue;
      fire(b, 0.5);
      this.firedOnPress.add(b);
    }
    for (const r of pad.released) {
      const was = this.pressCtx.get(r.button);
      this.pressCtx.delete(r.button);
      if (this.firedOnPress.delete(r.button) || watching) continue;
      // Le ballon a changé de camp pendant l'appui : on ne passe pas un ballon qu'on vient de gagner en pressant,
      // on ne part pas en glissade parce qu'on l'a perdu en armant sa frappe
      if ((was === "foe" && ctx === "ball") || (was === "ball" && ctx === "foe")) continue;
      if (taking || hasBall) {
        fire(r.button, r.power);
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
      const [ax, az] = this.aimOf(kind, mx, mz, pad.mouse, pad.scheme);
      this.opts.act(kind, r.power, ax, az);
    }
    // La mire, là où ira le prochain geste
    this.cursorPoint = this.cursorAims(pad, mx, mz) ? this.scene.pickGround(pad.mouse!.x, pad.mouse!.y) : null;
    this.aimX = this.cursorPoint && this.pred ? this.cursorPoint[0] - this.pred.x : mx;
    this.aimZ = this.cursorPoint && this.pred ? this.cursorPoint[1] - this.pred.z : mz;

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
    // Pendant la fête d'un but aussi : le serveur n'écoute plus les touches, il emmène tout le monde célébrer
    const phase = this.view.phase;
    const frozen = taking || holding || phase === "halftime" || phase === "over" || phase === "goal" || this.predBlocked || this.receiving;
    if (p && active === this.predFor) {
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        this.prevX = p.x;
        this.prevZ = p.z;
        this.prevH = p.h;
        if (frozen) {
          if (!this.receiving) {
            p.vx = 0;
            p.vz = 0;
          }
          continue;
        }
        const l = Math.hypot(mx, mz);
        const carrier = press && l < 0.1 && owner >= 0 ? this.frameViews[owner] : undefined;
        if (carrier) {
          // Sans direction, le presseur fonce sur le porteur, comme le fait le serveur
          const dx = carrier.x - p.x;
          const dz = carrier.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.6) steer(p, dx / d, dz / d, topSpeed(p, true, false));
          else steer(p, 0, 0, 0);
          continue;
        }
        const speed = topSpeed(p, pad.sprint, hasBall) * Math.min(1, l * 1.25) * (now < this.burstUntilMs ? BURST_SPEED : 1);
        steer(p, l > 0.05 ? mx / l : 0, l > 0.05 ? mz / l : 0, speed);
      }
      // L'écart avec le serveur se rattrape peu à peu, à chaque image : jamais d'un coup
      const k = 1 - Math.exp(-dt * 5);
      const dx = this.corrX * k;
      const dz = this.corrZ * k;
      p.x += dx;
      p.z += dz;
      this.prevX += dx;
      this.prevZ += dz;
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

  /** Son joueur à cette image précise : entre son dernier pas de calcul et le précédent, au prorata du temps */
  private shownPred(): [number, number, number] {
    const p = this.pred!;
    const f = clamp(this.acc / DT, 0, 1);
    return [this.prevX + (p.x - this.prevX) * f, this.prevZ + (p.z - this.prevZ) * f, this.prevH + wrapAngle(p.h - this.prevH) * f];
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
    const shown = this.shown;
    const scorer = shown.phase === "goal" ? (shown.goals.at(-1)?.team ?? null) : null;
    const nowMs = performance.now();
    const fade = Math.exp(-dt / 0.09);
    this.blendX *= fade;
    this.blendZ *= fade;
    const ease = Math.exp(-dt / 0.16);
    this.releaseX *= ease;
    this.releaseZ *= ease;
    const wasPredicted = this.predShownFor;
    // Pendant la fête d'un but, le serveur n'écoute plus les touches : on montre son joueur tel qu'il est
    const canPredict = this.view.phase !== "goal";
    let predicted = false;
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
      v.sad = scorer !== null && v.team !== scorer;
      v.off = shown.cards.some((c) => c.i === i && c.off);
      if (teleport && i === this.releaseFor) this.releaseX = this.releaseZ = 0;
      if (act === "dive" || act === "slide") {
        const dx = bx - ax;
        const dz = bz - az;
        const l = Math.hypot(dx, dz);
        if (l > 0.02) {
          v.dirX = dx / l;
          v.dirZ = dz / l;
        }
      }
      let mine = false;
      if (canPredict && i === active && this.pred && this.predFor === i && !this.receiving && (act === "none" || act === "kick")) {
        const [sx, sz, sh] = this.shownPred();
        // Le joueur passe du temps du serveur au temps présent : on efface la différence en douceur, jamais d'un coup
        if (this.predShownFor !== i) {
          this.predShownFor = i;
          this.blendX = v.x - sx;
          this.blendZ = v.z - sz;
        }
        v.x = sx + this.blendX;
        v.z = sz + this.blendZ;
        v.h = sh;
        v.v = Math.hypot(this.pred.vx, this.pred.vz);
        this.lastPredX = v.x;
        this.lastPredZ = v.z;
        predicted = true;
        mine = true;
      } else if (i === wasPredicted) {
        // On cesse de l'anticiper (passe donnée, autre joueur, geste du serveur) : il ne recule pas d'un coup jusqu'à
        // sa position du serveur, l'écart s'efface en douceur
        this.releaseFor = i;
        this.releaseX = this.lastPredX - v.x;
        this.releaseZ = this.lastPredZ - v.z;
        if (Math.hypot(this.releaseX, this.releaseZ) > 4) this.releaseX = this.releaseZ = 0;
      }
      if (!mine && i === this.releaseFor) {
        v.x += this.releaseX;
        v.z += this.releaseZ;
      }
      // Le geste de frappe, calé sur le départ du ballon à l'écran
      v.kickT = undefined;
      const kickAt = this.kickShow.get(i);
      if (kickAt !== undefined) {
        const age = (nowMs - kickAt) / 1000;
        // Jusqu'au bout de l'accompagnement du pied, puis le geste s'achève comme les autres
        if (KICK_START + age > KICK_HOLD) this.kickShow.delete(i);
        else if (v.act === "none" || v.act === "kick") {
          v.act = "kick";
          v.kickT = KICK_START + age;
        }
      }
    }
    if (!predicted) this.predShownFor = -1;
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
    if (owner === active && active >= 0 && predicted && this.pred) {
      const p = this.pred;
      const reach = 0.55 + Math.min(1, Math.hypot(p.vx, p.vz) / 11) * 0.55;
      const me = views[active]!;
      ball.x = me.x + Math.cos(me.h) * reach;
      ball.z = me.z + Math.sin(me.h) * reach;
      ball.y = Math.min(ball.y, 0.3);
      ball.vx = p.vx;
      ball.vz = p.vz;
    }
    // Balle au pied, il la pousse à chaque foulée : elle s'éloigne un peu du pied et revient
    const carrier = owner >= 0 ? views[owner] : undefined;
    if (carrier && carrier.act === "none" && carrier.v > 1) {
      this.touchPhase += carrier.v * dt * 1.5;
      const nudge = Math.abs(Math.sin(this.touchPhase)) * clamp(carrier.v / 9, 0, 1) * 0.3;
      ball.x += Math.cos(carrier.h) * nudge;
      ball.z += Math.sin(carrier.h) * nudge;
    }
    // Le ballon qu'on vient de frapper part aussitôt ; le vrai le rejoint pendant le trajet
    const g = this.ghost;
    let ghosted = false;
    if (g) {
      const age = (performance.now() - g.born) / 1000;
      if (b.o === g.kicker && !g.seen) {
        // Le serveur ne l'a pas encore vu partir : on attend le temps d'un aller-retour et du retard de l'image
        const late = Math.max(0, (this.snaps.at(-1)?.sim ?? at) - at);
        if (age > this.rtt + late + 0.3) this.ghost = null;
        else {
          stepBall(g.ball, dt);
          ghosted = true;
        }
      } else if (b.o >= 0 && g.seen) {
        // Quelqu'un a contrôlé le ballon : c'est fini
        this.ghost = null;
      } else {
        if (!g.seen) {
          g.seen = true;
        } else {
          g.ball.x += ball.x - g.lastX;
          g.ball.y += ball.y - g.lastY;
          g.ball.z += ball.z - g.lastZ;
        }
        g.lastX = ball.x;
        g.lastY = ball.y;
        g.lastZ = ball.z;
        const close = Math.min(1, dt / Math.max(0.15, g.eta - age));
        g.ball.x += (ball.x - g.ball.x) * close;
        g.ball.y += (ball.y - g.ball.y) * close;
        g.ball.z += (ball.z - g.ball.z) * close;
        if (Math.hypot(ball.x - g.ball.x, ball.z - g.ball.z) < 0.12) this.ghost = null;
        ghosted = true;
      }
      if (ghosted) {
        ball.x = g.ball.x;
        ball.y = Math.max(0.16, g.ball.y);
        ball.z = g.ball.z;
        ball.vx = g.ball.vx;
        ball.vz = g.ball.vz;
      }
    }
    // Au pied, le ballon suit en souplesse ; libre, il va exactement où il doit aller
    const s = this.shownBall;
    const jump = Math.hypot(ball.x - s.x, ball.z - s.z);
    // Au contrôle, le ballon rejoint le pied sans sauter ; ensuite, il le suit de près
    if (this.lastOwner !== owner) this.ownerChangedAt = performance.now();
    const settling = performance.now() - this.ownerChangedAt < 200;
    const k = ghosted ? 1 : owner >= 0 && jump < 9 ? 1 - Math.exp(-dt * (settling ? 15 : 42)) : settling && jump < 3 ? 0.3 : 1;
    s.x += (ball.x - s.x) * k;
    s.z += (ball.z - s.z) * k;
    s.y += (ball.y - s.y) * Math.max(k, 0.6);
    this.lastOwner = owner;
    this.receiver = owner === active && active >= 0 ? this.guessReceiver(views, active) : -1;
    const flip = this.view.flipped;
    const myTeam = this.myIndex >= 0 ? this.view.humans[this.myIndex]!.team : 0;
    return {
      players: views,
      ball: { x: s.x, y: s.y, z: s.z, vx: ball.vx, vz: ball.vz },
      active,
      attackSide: (myTeam === 0) !== flip ? 1 : -1,
      excitement: shown.phase === "goal" ? 1 : shown.phase === "over" ? 0.6 : 0.12,
      // Le changement de plan tombe avec la remise en place, à l'image
      cuts: shown.cuts,
      charge: this.charge,
      aim: this.cursorPoint,
      receiver: this.receiver,
      // Pendant la fête, la caméra suit le buteur, pas le ballon resté dans les filets
      focus: shown.phase === "goal" && views[this.goalScorer] ? [views[this.goalScorer]!.x, views[this.goalScorer]!.z] : null,
    };
  }

  /**
   * L'envie du public : un ballon qui approche d'un but dans l'axe, une frappe qui part, un penalty ou un corner qui se
   * prépare. Pendant la fête d'un but, tout le stade est debout ; à la pause, il bavarde.
   */
  private crowdMood(frame: SceneFrame): number {
    const s = this.shown;
    if (s.phase === "goal") return 1;
    if (s.phase === "halftime" || s.phase === "over") return 0.08;
    if (this.cinema === "intro") return 0.45;
    const b = frame.ball;
    const toLine = HALF_L - Math.abs(b.x);
    const axis = Math.abs(b.z) < GOAL_HALF + 16 ? 1 : 0.55;
    let mood = 0.1 + Math.pow(clamp(1 - toLine / 36, 0, 1), 1.5) * 0.62 * axis;
    if (Math.hypot(b.vx, b.vz) > 17 && toLine < 38) mood += 0.3;
    const r = s.phase === "restart" || s.phase === "kickoff" ? s.restart : null;
    if (r?.kind === "penalty") mood = Math.max(mood, 0.75);
    else if (r?.kind === "corner") mood = Math.max(mood, 0.42);
    return clamp(mood, 0, 1);
  }

  /** Le coéquipier qui recevra la passe : le plus proche du curseur, sinon le mieux placé dans la direction demandée */
  private guessReceiver(views: FootballerView[], me: number): number {
    const p = views[me]!;
    const cursor = this.cursorPoint;
    let dx = this.aimX;
    let dz = this.aimZ;
    if (Math.hypot(dx, dz) < 0.2) {
      dx = Math.cos(p.h);
      dz = Math.sin(p.h);
    }
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    let best = -1;
    let score = -Infinity;
    for (let i = 0; i < views.length; i++) {
      const q = views[i]!;
      if (i === me || q.team !== p.team || q.off || q.keeper) continue;
      const rx = q.x - p.x;
      const rz = q.z - p.z;
      const d = Math.hypot(rx, rz);
      if (d < 2.5 || d > 62) continue;
      let s: number;
      if (cursor) {
        s = -Math.hypot(q.x - cursor[0], q.z - cursor[1]) + (i === this.receiver ? 2.5 : 0);
      } else {
        const c = (rx * dx + rz * dz) / d;
        if (c < 0.45) continue;
        s = c * c * 3 - d / 45 + (i === this.receiver ? 0.25 : 0);
      }
      if (s > score) {
        score = s;
        best = i;
      }
    }
    return best;
  }

  /** Garde en mémoire les dernières secondes de jeu */
  private record(frame: SceneFrame) {
    if (this.renderSim === null) return;
    const n = frame.players.length;
    const p = new Float32Array(n * 4);
    const acts: Act[] = [];
    for (let i = 0; i < n; i++) {
      const v = frame.players[i]!;
      p[i * 4] = v.x;
      p[i * 4 + 1] = v.z;
      p[i * 4 + 2] = v.h;
      p[i * 4 + 3] = v.v;
      acts.push(v.act);
    }
    this.film.push({
      t: this.renderSim,
      p,
      b: new Float32Array([frame.ball.x, frame.ball.y, frame.ball.z, frame.ball.vx, frame.ball.vz]),
      acts,
    });
    while (this.film.length > 2 && this.film.at(-1)!.t - this.film[0]!.t > 7) this.film.shift();
  }

  /** Une image du film, à l'instant voulu */
  private filmFrame(at: number, base: SceneFrame): SceneFrame {
    const list = this.film;
    let i = 1;
    while (i < list.length - 1 && list[i]!.t < at) i++;
    const a = list[i - 1]!;
    const b = list[i]!;
    const f = clamp(b.t > a.t ? (at - a.t) / (b.t - a.t) : 0, 0, 1);
    const views = base.players.map((v, k) => ({
      ...v,
      x: a.p[k * 4]! + (b.p[k * 4]! - a.p[k * 4]!) * f,
      z: a.p[k * 4 + 1]! + (b.p[k * 4 + 1]! - a.p[k * 4 + 1]!) * f,
      h: a.p[k * 4 + 2]! + wrapAngle(b.p[k * 4 + 2]! - a.p[k * 4 + 2]!) * f,
      v: a.p[k * 4 + 3]!,
      act: b.acts[k]!,
      cheer: false,
    }));
    return {
      ...base,
      players: views,
      active: -1,
      receiver: -1,
      aim: null,
      charge: 0,
      ball: {
        x: a.b[0]! + (b.b[0]! - a.b[0]!) * f,
        y: a.b[1]! + (b.b[1]! - a.b[1]!) * f,
        z: a.b[2]! + (b.b[2]! - a.b[2]!) * f,
        vx: b.b[3]!,
        vz: b.b[4]!,
      },
    };
  }

  /** Enchaîne les plans : la présentation avant le match, le buteur, puis le ralenti */
  private directCinema(dt: number, frame: SceneFrame): SceneFrame {
    if (this.intro) {
      this.intro = false;
      if (this.shown.phase === "kickoff" && this.shown.period === 1 && this.shown.score[0] + this.shown.score[1] === 0) {
        this.cinema = "intro";
        this.cinemaT = 0;
      }
    }
    if (!this.cinema) return frame;
    // Le match a repris sans attendre la fin du film : on revient au direct
    if (this.cinema !== "intro") {
      if (this.shown.phase === "goal") {
        this.goalSeen = true;
      } else if (this.goalSeen || this.cinemaT > 1) {
        this.cinema = null;
        this.scene.setShot(null);
        return frame;
      }
    }
    this.cinemaT += dt;
    if (this.cinema === "intro") {
      if (this.cinemaT > INTRO_S || this.shown.phase === "play") {
        this.cinema = null;
        this.scene.setShot(null);
        return frame;
      }
      this.scene.setShot({ kind: "intro", t: this.cinemaT / INTRO_S });
      return frame;
    }
    if (this.cinema === "scorer") {
      if (this.cinemaT > 2.4 && this.film.length > 10) {
        this.cinema = "replay";
        this.cinemaT = 0;
        this.replayAt = this.replayEnd - 3.2;
      } else {
        const v = this.frameViews[this.goalScorer];
        if (v) {
          this.goalX += (v.x - this.goalX) * Math.min(1, dt * 4);
          this.goalZ += (v.z - this.goalZ) * Math.min(1, dt * 4);
        }
        this.scene.setShot({ kind: "scorer", x: this.goalX, z: this.goalZ, side: this.goalEnd, t: this.cinemaT, base: this.goalAngle });
        return frame;
      }
    }
    this.replayAt += dt * 0.62;
    if (this.replayAt >= this.replayEnd) {
      this.cinema = null;
      this.scene.setShot(null);
      return frame;
    }
    this.scene.setShot({ kind: "replay", end: this.goalEnd });
    return this.filmFrame(this.replayAt, frame);
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    this.adaptQuality(now, now - this.last);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.opts.seatId !== null && this.myIndex >= 0) this.handleButtons(dt);
    const frame = this.interpolated(dt);
    if (!frame) return;
    this.releaseDue();
    if (import.meta.env.DEV) (window as unknown as { __crFrame: SceneFrame }).__crFrame = frame;
    // On filme le jeu, et encore un instant après le but : le ralenti montre le ballon gonfler les filets
    if (this.shown.phase !== "goal" || (this.renderSim ?? 0) < this.goalSim + 0.9) this.record(frame);
    const shot = this.directCinema(dt, frame);
    if (import.meta.env.DEV) (window as unknown as { __crShot: SceneFrame }).__crShot = shot;
    // Au ralenti, les gestes ralentissent avec le film
    this.scene.render(this.cinema === "replay" ? dt * 0.62 : dt, shot);
    if (import.meta.env.DEV) (window as unknown as { __crCam: number[] }).__crCam = this.scene.camera.position.toArray();
    this.opts.onCrowd?.(dt, this.crowdMood(frame));
    if (++this.shownFrames === 3) this.opts.onReady?.();
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
        active: a,
        activeName: a >= 0 ? (this.view.players[a]?.name ?? "") : "",
        stamina: a >= 0 && last ? last.p[a * TICK_STRIDE + 5]! / 100 : 1,
        charge: this.charge,
        hasBall: a >= 0 && owner === a,
        keeperHold: a >= 0 && owner === a && last !== undefined && ACTS[last.p[a * TICK_STRIDE + 4]!] === "hold",
        defending: a >= 0 && owner >= 0 && this.view.players[owner]?.team !== this.view.players[a]?.team,
        scheme: this.scheme,
        fps: this.fps,
        ping: Math.round(this.rtt * 1000),
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
