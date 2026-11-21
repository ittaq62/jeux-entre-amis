// Une partie d'Escarmouche vue de chez soi. Ses propres pas sont joués tout de suite (60 par seconde), sans attendre
// le serveur, puis recalés sur ce que le serveur en a retenu ; les autres soldats sont montrés un dixième de seconde
// dans le passé, entre deux positions reçues, pour qu'ils glissent sans à-coups. Les balles sont jugées par le serveur,
// là où le tireur voyait ses cibles : ce qu'on voit est ce qu'on touche.

import * as THREE from "three";
import { seededAvatar } from "../../shared/avatar.ts";
import { getMap, type GameMap } from "../../shared/games/escarmouche/maps.ts";
import {
  isTeamMode,
  partBox,
  rayFighter,
  worldOf,
  type EscEvent,
  type KillWeapon,
  POINTS,
  CONQUEST,
  POINT_NAMES,
  worldWithout,
  RESUPPLY,
  DEPOT_NAMES,
  SABOTAGE,
} from "../../shared/games/escarmouche/match.ts";
import {
  B,
  copySoldier,
  DT,
  encodeCmd,
  eyeOf,
  forward,
  MAX_PITCH,
  quantizeCmd,
  spreadOf,
  stepSoldier,
  defOf,
  weaponOf,
  wrapAngle,
  type Cmd,
  type CmdNet,
  type Soldier,
  type StepOut,
} from "../../shared/games/escarmouche/soldier.ts";
import { P_STRIDE, PF, readFighter, SC_STRIDE, type EscMe, type EscTick, type FighterNet } from "../../shared/games/escarmouche/view.ts";
import { WEAPONS, type PrimaryId, type SecondaryId, type WeaponId } from "../../shared/games/escarmouche/weapons.ts";
import type { Mat, World } from "../../shared/games/escarmouche/world.ts";
import type { EscarmoucheClientMessage, EscarmoucheRoomView } from "../../shared/protocol.ts";
import { AutoQuality } from "../lib/autoQuality.ts";
import { usePrefs } from "../stores/prefs.ts";
import { EscControls, type Scheme } from "./controls.ts";
import { EscSound } from "./escSound.ts";
import { EscScene, TEAM_HEX } from "./scene/EscScene.ts";
import type { Surface } from "./scene/effects.ts";
import { drawCompass, Radar, type RadarDot } from "./radar.ts";
import { pickQuality } from "./scene/quality.ts";
import { ffaKit, TEAM_KITS } from "./scene/soldiers.ts";
import { due, enqueue } from "./eventQueue.ts";

/** Les boutons qui ne comptent qu'au moment de l'appui (gardés jusqu'au prochain pas) */
const TAPS = B.reload | B.grenade | B.melee | B.swap | B.slot1 | B.slot2 | B.jump | B.spot;
const INTERP_MIN = 70;
const INTERP_MAX = 250;

export interface FeedLine {
  id: number;
  killer: string | null;
  killerColor: string;
  victim: string;
  victimColor: string;
  weapon: KillWeapon;
  head: boolean;
}

export interface BoardRow {
  i: number;
  name: string;
  team: number;
  kills: number;
  deaths: number;
  assists: number;
  points: number;
  me: boolean;
  bot: boolean;
}

export interface HudState {
  seated: boolean;
  alive: boolean;
  hp: number;
  weapon: WeaponId;
  slot: 0 | 1;
  mag: number;
  res: number;
  grenades: number;
  reloading: number;
  ads: boolean;
  scoped: boolean;
  /** Le réticule : son écart, en pixels */
  spread: number;
  back: number;
  /** Sabotage : tombé, plus de renforts pour revenir */
  noReinforcements: boolean;
  next: PrimaryId;
  nextSecondary: SecondaryId;
  killer: { name: string; weapon: KillWeapon; head: boolean; hp: number | null } | null;
  teamScores: [number, number];
  myTeam: number;
  mine: { kills: number; deaths: number; points: number };
  leader: { name: string; kills: number } | null;
  timeLeft: number;
  phase: "countdown" | "live" | "over";
  countdown: number;
  feed: FeedLine[];
  hitAt: number;
  hitKind: "body" | "head" | "kill";
  /** Les dégâts qu'on vient d'infliger : un chiffre par adversaire, qui s'additionne pendant une rafale */
  pops: { id: number; value: number; at: number; head: boolean; kill: boolean }[];
  damage: { id: number; angle: number; at: number }[];
  hurtAt: number;
  flags: { at: number; carrier: number }[] | null;
  carrying: number;
  zone: { owner: number; contested: boolean; inside: boolean } | null;
  /** Sabotage : chaque dépôt (son état, les secondes avant qu'il saute), la charge en cours, le conseil */
  sab: { deps: { state: number; left: number }[]; act: { label: string; k: number } | null; hint: string | null } | null;
  /** Conquête : chaque drapeau (qui le tient, sa jauge de -1 à 1), celui où l'on se tient (-1 aucun) */
  cq: { pts: { owner: number; v: number }[]; inside: number } | null;
  banner: { id: number; text: string; tone: "info" | "good" | "bad" } | null;
  /** Les médailles du moment, et les points qu'elles rapportent */
  awards: { id: number; text: string; pts: number }[];
  /** Sous le feu (0 à 1) */
  suppress: number;
  /** À la lunette : le souffle qui reste, retenu ou non */
  breath: { left: number; holding: boolean; winded: boolean } | null;
  /** Ses éliminations d'affilée (vers les jumelles, puis le mortier) */
  streak: number;
  /** En équipe : ses coéquipiers (pour revenir auprès d'eux), la relève en cours, le conseil pour relever */
  team: {
    mates: { i: number; name: string; alive: boolean; fight: boolean }[];
    spawnOn: number;
    reviving: { name: string; k: number } | null;
    rescue: { name: string; k: number } | null;
    waiting: boolean;
    hint: string | null;
  } | null;
  scheme: Scheme;
  locked: boolean;
  /** Le nom de l'adversaire dans le viseur */
  aimed: string | null;
  spectating: string | null;
  board: BoardRow[];
  ping: number;
}

interface Snap {
  at: number;
  s: number;
  p: number[];
  g: number[];
  f?: number[];
}

export interface RuntimeOpts {
  canvas: HTMLCanvasElement;
  room: EscarmoucheRoomView;
  send: (msg: EscarmoucheClientMessage) => void;
  touch: boolean;
  onHud: (h: HudState) => void;
}

/** Les crans de la qualité automatique (voir tuneQuality), et la finesse de l'image à chaque cran de pixels */
const QUALITY_LEVERS = ["pixels", "pixels", "pixels", "ombres"];
const QUALITY_LEVERS_HIGH = ["recoins", ...QUALITY_LEVERS];
const PIXEL_STEPS = [1, 0.85, 0.7, 0.55];

export class BattleRuntime {
  readonly controls = new EscControls();
  /** Le tableau des scores, ouvert au doigt */
  forceBoard = false;
  private scene: EscScene;
  private sound = new EscSound();
  private gm: GameMap;
  private world: World;
  private room: EscarmoucheRoomView;
  private send: RuntimeOpts["send"];
  private onHud: RuntimeOpts["onHud"];
  private touch: boolean;
  private raf = 0;
  private lastFrame = 0;
  private running = false;

  // L'heure du serveur, estimée d'après les envois reçus
  private minLag: number | null = null;
  private jitter = 30;
  private snaps: Snap[] = [];
  private latest: EscTick | null = null;
  private latestAt = 0;

  // Son soldat, joué en avance
  private me = -1;
  private pred: Soldier | null = null;
  private pending: Cmd[] = [];
  private outbox: CmdNet[] = [];
  private seq = 0;
  private acc = 0;
  private lastSend = 0;
  private taps = 0;
  private hp = 100;
  private back = 0;
  private noReinforcements = false;
  private next: PrimaryId = "fa";
  private nextSecondary: SecondaryId = "pistolet";
  private err = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private kickPitch = 0;
  private kickYaw = 0;
  private vmKick = 0;
  private adsAmount = 0;
  private raise = 1;
  private bob = 0;
  private stride = 0;
  private wasGround = true;
  /** La hauteur des yeux à l'image (qui suit en douceur l'accroupissement), le tassement d'une réception, la dernière vitesse de chute */
  private eyeOff = 0;
  private landDip = 0;
  private lastVy = 0;
  private swayX = 0;
  private swayY = 0;
  private aimSeeded = false;
  private lastAlive = false;
  private deathAt = 0;
  private deathPos = new THREE.Vector3();
  private shake = 0;
  private spec = -1;

  // Ce qu'on montre
  private queue: { at: number; e: EscEvent }[] = [];
  private feed: FeedLine[] = [];
  private feedSeq = 0;
  private hitAt = 0;
  private pops: { id: number; victim: number; value: number; at: number; head: boolean; kill: boolean }[] = [];
  private hitKind: HudState["hitKind"] = "body";
  private damage: HudState["damage"] = [];
  private hurtAt = 0;
  /** Le radar et la boussole, dessinés à chaque image */
  private radar: Radar;
  private radarCanvas: HTMLCanvasElement | null = null;
  private compassCanvas: HTMLCanvasElement | null = null;
  private radarDots: RadarDot[] = [];
  private killer: HudState["killer"] = null;
  private banner: HudState["banner"] = null;
  /** Les médailles du moment (élimination, tir à la tête, double élimination…), qui montent et s'effacent */
  private awards: { id: number; text: string; pts: number; at: number }[] = [];
  private multi = 0;
  private lastKillAt = -1e9;
  private firstBlood = false;
  /** Celui qui nous a eu en dernier : l'avoir à son tour, c'est une vengeance */
  private nemesis = -1;
  /** La pression des balles qui frôlent (0 à 1) : l'image s'assombrit, la visée tremble */
  private suppress = 0;
  /** Le souffle retenu à la lunette : il en reste (1 plein), et l'essoufflement qui suit */
  private breath = 1;
  private winded = 0;
  private holding = false;
  private swayT = 0;
  private aimYaw = 0;
  private aimPitch = 0;
  private heartAt = 0;
  /** Les ennemis repérés pour soi (son équipe, ou soi en chacun pour soi) */
  private marked = new Set<number>();
  /** Ses éliminations depuis sa dernière mort */
  private streak = 0;
  /** Le jeu en équipe : auprès de qui revenir, qui on relève, qui nous relève, si l'on attend d'être relevé */
  private spawnOn = -1;
  private revivingNow: [number, number] | null = null;
  private rescueNow: [number, number] | null = null;
  /** Sabotage : le dépôt où l'on pose (ou désamorce) une charge, et où on en est ; le prochain bip de chaque dépôt */
  private sabNow: [number, number] | null = null;
  private beepAt = [0, 0];
  private waiting = false;
  private nearFallen: string | null = null;
  /** Les bidons de la carte (leur boîte dans le monde) */
  private barrelBoxes: { i: number; x: number; z: number }[] = [];
  /** La vue penche et s'élargit pendant une glissade */
  private slideTilt = 0;
  private bannerUntil = 0;
  private bannerSeq = 0;
  private hudAt = 0;
  private stepTimers = new Map<number, number>();
  private lastShots = new Map<number, number>();
  /** La prochaine bouffée de buée (sur le col) */
  private breathAt = 0;
  /** Les repères de son équipe, pour le radar */
  private pingDots: { x: number; y: number; z: number }[] = [];
  /** Le dernier ravitaillement (pour ne pas l'annoncer à chaque chargeur) */
  private suppliedAt = -1e9;
  /** Vers où tombe chacun (la dernière fois qu'il a été éliminé), et la dernière explosion */
  private falls = new Map<number, { dx: number; dz: number; head: boolean; blast: boolean }>();
  private lastBoom: { x: number; z: number; t: number } | null = null;
  /** Conquête : le drapeau où l'on se tient (-1 aucun), et l'alerte des derniers tickets déjà donnée */
  private insidePoint = -1;
  private ticketWarned = false;
  /** Le dernier tir entendu de chacun (pas au silencieux) : il le montre au radar un moment */
  private radarPing = new Map<number, number>();
  private lastBeep = -1;
  private ping = 0;
  /** La qualité automatique : moins de pixels, plus d'ombres… quand l'appareil peine (voir tuneQuality) */
  private quality: AutoQuality;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private tmp3 = new THREE.Vector3();
  private tmp4 = new THREE.Vector3();

  constructor(o: RuntimeOpts) {
    this.room = o.room;
    this.send = o.send;
    this.onHud = o.onHud;
    this.touch = o.touch;
    const v = o.room.escarmouche!;
    this.gm = getMap(v.map);
    this.world = worldOf(v.map);
    this.radar = new Radar(this.gm);
    this.gm.boxes.forEach((b, i) => {
      if (b.m === "bidon") this.barrelBoxes.push({ i, x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 });
    });
    this.scene = new EscScene(o.canvas, this.gm, {
      quality: pickQuality(usePrefs.getState().escQuality, o.touch),
      teams: isTeamMode(v.mode),
      night: Boolean(v.settings.night),
    });
    const levers = this.scene.quality === "haut" ? QUALITY_LEVERS_HIGH : QUALITY_LEVERS;
    this.quality = new AutoQuality({ levers, apply: (on) => this.tuneQuality(levers, on) });
    this.controls.attach(o.canvas);
    this.applyPrefs();
    this.setRoom(o.room);
    window.addEventListener("resize", this.fit);
    this.fit();
    // En développement seulement : de quoi piloter la partie depuis la console (tests à plusieurs onglets)
    if (import.meta.env.DEV) (window as unknown as { __esc?: BattleRuntime }).__esc = this;
  }

  setRadarCanvas(c: HTMLCanvasElement | null) {
    this.radarCanvas = c;
  }

  setCompassCanvas(c: HTMLCanvasElement | null) {
    this.compassCanvas = c;
  }

  applyPrefs() {
    const p = usePrefs.getState();
    this.controls.mouseSens = p.escMouse;
    this.controls.touchSens = p.escTouch;
    this.controls.invert = p.escInvert;
  }

  private fit = () => {
    this.scene.resize(window.innerWidth, window.innerHeight);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.sound.startAmbience(this.room.escarmouche?.settings.night ? "nuit" : this.gm.light);
    const loop = () => {
      if (!this.running) return;
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.fit);
    this.controls.dispose();
    this.scene.dispose();
    this.sound.dispose();
  }

  /** La table a changé : les soldats, leurs camps, leurs camouflages */
  setRoom(room: EscarmoucheRoomView) {
    this.room = room;
    const v = room.escarmouche;
    if (!v) return;
    const seatId = room.you.seatId;
    this.me = seatId ? v.fighters.findIndex((f) => f.id === seatId) : -1;
    const teams = isTeamMode(v.mode);
    v.fighters.forEach((f, i) => {
      if (i === this.me) {
        this.scene.removeSoldier(i);
        const seat = room.seats.find((s) => s.id === f.id);
        this.scene.setLocalLook(seat?.avatar ?? seededAvatar(f.id), room.arsenal[f.id]?.tenue ?? "perso");
        return;
      }
      const seat = room.seats.find((s) => s.id === f.id);
      const kit = teams ? TEAM_KITS[f.team === 1 ? 1 : 0] : ffaKit(i);
      const arsenal = room.arsenal[f.id];
      const look = {
        avatar: seat?.avatar ?? seededAvatar(f.id),
        tenue: arsenal?.tenue ?? "perso",
        band: kit.band,
        camo: arsenal?.camo ?? "usine",
        gear: { muzzle: arsenal?.muzzle ?? "aucun", extra: arsenal?.extra ?? "aucun" },
      };
      const color = teams ? TEAM_HEX[f.team === 1 ? 1 : 0] : kit.band;
      this.scene.ensureSoldier(i, look, seat?.name ?? "Soldat", color);
    });
  }

  private nameOf(i: number): string {
    const id = this.room.escarmouche?.fighters[i]?.id;
    return this.room.seats.find((s) => s.id === id)?.name ?? "Soldat";
  }

  private teamOf(i: number): number {
    return this.room.escarmouche?.fighters[i]?.team ?? i;
  }

  private colorOf(i: number): string {
    const v = this.room.escarmouche;
    if (!v) return "#fff";
    if (isTeamMode(v.mode)) return TEAM_HEX[this.teamOf(i) === 1 ? 1 : 0];
    return ffaKit(i).band;
  }

  private enemy(i: number): boolean {
    const v = this.room.escarmouche;
    if (!v || i === this.me) return false;
    if (this.me < 0) return true;
    return !isTeamMode(v.mode) || this.teamOf(i) !== this.teamOf(this.me);
  }

  // -------------------------------------------------------------------------
  // Ce qui arrive du serveur
  // -------------------------------------------------------------------------

  /** L'heure du serveur qu'il est maintenant, d'après le trajet le plus court observé */
  private serverNow(t = performance.now()) {
    return this.minLag === null ? Date.now() : t - this.minLag;
  }

  private renderTime(t = performance.now()) {
    const delay = Math.max(INTERP_MIN, Math.min(INTERP_MAX, 55 + this.jitter * 1.5));
    return this.serverNow(t) - delay;
  }

  onTick(now: number, tick: EscTick, me: EscMe | undefined) {
    const arrival = performance.now();
    const prev = this.snaps.at(-1);
    if (prev && now < prev.at) return;
    const lag = arrival - now;
    this.minLag = this.minLag === null ? lag : Math.min(lag, this.minLag + 0.05);
    const late = lag - this.minLag;
    this.jitter = Math.max(late, this.jitter * 0.97);
    this.snaps.push({ at: now, s: tick.s, p: tick.p, g: tick.g, f: tick.f });
    while (this.snaps.length > 30) this.snaps.shift();
    this.latest = tick;
    this.latestAt = arrival;
    for (const e of tick.e) {
      // Ce qui touche le joueur lui-même passe tout de suite ; le reste au moment où on le voit arriver
      const mine = this.me >= 0 && ("a" in e && e.a === this.me ? true : "v" in e && e.v === this.me ? true : "i" in e && e.i === this.me);
      if (mine || e.k === "live" || e.k === "over") this.handle(e);
      else enqueue(this.queue, now, e);
    }
    if (me) this.reconcile(me);
  }

  /** Ce que le serveur a retenu de ses pas : on y revient, puis on rejoue ceux qu'il n'a pas encore vus */
  private reconcile(me: EscMe) {
    this.me = me.i;
    this.hp = me.hp;
    this.back = me.back;
    this.noReinforcements = Boolean(me.noReinforcements);
    this.next = me.next;
    this.nextSecondary = me.nextSecondary;
    this.spawnOn = me.spawnOn ?? -1;
    this.revivingNow = me.reviving ?? null;
    this.rescueNow = me.rescue ?? null;
    this.sabNow = me.sab ?? null;
    this.waiting = Boolean(me.waiting);
    const s = me.s;
    // Le serveur compte plus loin que nous (une connexion d'avant) : on reprend à son compte
    if (s.seq > this.seq) {
      this.seq = s.seq;
      this.pending = [];
    }
    this.pending = this.pending.filter((c) => c.s > s.seq);
    const live = this.latest ? this.phaseNow() === "live" : false;
    const before = this.pred ? new THREE.Vector3(this.pred.x, this.pred.y, this.pred.z) : null;
    const fresh = !this.pred || this.pred.alive !== s.alive || Math.hypot(this.pred.x - s.x, this.pred.z - s.z) > 6;
    this.pred = copySoldier(s);
    for (const c of this.pending) stepSoldier(this.pred, c, this.world, live);
    if (!this.aimSeeded || (fresh && s.alive && !this.lastAlive)) {
      // Une nouvelle vie : il regarde là où le serveur l'a fait apparaître
      this.yaw = s.yaw;
      this.pitch = 0;
      this.aimSeeded = true;
    }
    if (fresh || !before) this.err.set(0, 0, 0);
    else {
      this.err.x += before.x - this.pred.x;
      this.err.y += before.y - this.pred.y;
      this.err.z += before.z - this.pred.z;
      if (this.err.length() > 2) this.err.set(0, 0, 0);
    }
    if (s.alive && !this.lastAlive) {
      this.killer = null;
      this.raise = 0;
    }
    if (!s.alive && this.lastAlive) {
      this.deathAt = performance.now();
      this.deathPos.set(s.x, eyeOf(s), s.z);
    }
    this.lastAlive = s.alive;
  }

  private phaseNow(): HudState["phase"] {
    const v = this.room.escarmouche;
    if (!v) return "live";
    if (v.phase === "over") return "over";
    const s = this.latest?.s ?? 0;
    return s >= v.liveAt ? "live" : "countdown";
  }

  /** Un évènement de la partie, au moment où on le voit */
  private handle(e: EscEvent) {
    const v = this.room.escarmouche;
    switch (e.k) {
      case "shot": {
        if (e.i === this.me) return;
        const at = this.tmp.set(e.x, e.y, e.z);
        const from = this.scene.muzzleOf(e.i, this.tmp2) ? this.tmp2 : null;
        if (from) {
          const last = this.lastShots.get(e.i) ?? 0;
          // Au silencieux : pas de flamme, un tir étouffé qu'on n'entend pas de loin, et pas de trace au radar
          const quiet = this.quietShooter(e.i, e.w);
          if (performance.now() - last > 30) {
            if (!quiet) this.scene.effects.flash(from, 0.3);
            this.scene.soldierFired(e.i);
            const dist = from.distanceTo(this.scene.camera.position);
            if (quiet) {
              if (dist < 30) this.sound.play("shot-quiet", { at: from, volume: 0.8, gap: 40 });
            } else if (dist > 40) this.sound.play("far", { at: from, volume: 0.9, gap: 40 });
            else this.sound.play(`shot-${e.w}`, { at: from, gap: 40 });
            this.lastShots.set(e.i, performance.now());
            if (!quiet) this.radarPing.set(e.i, performance.now());
          }
          // La balle passe tout près : elle siffle
          if (this.me >= 0 && this.pred?.alive) {
            const cam = this.scene.camera.position;
            const seg = this.tmp3.subVectors(at, from);
            const len = seg.length();
            if (len > 1) {
              const k = Math.max(0, Math.min(1, this.tmp4.subVectors(cam, from).dot(seg) / (len * len)));
              const close = this.tmp4.copy(from).addScaledVector(seg, k);
              if (k > 0.05 && k < 0.98 && close.distanceTo(cam) < 2.2) {
                this.sound.play("whiz", { at: close, volume: 0.7, gap: 60 });
                this.suppress = Math.min(1, this.suppress + 0.22);
              }
            }
          }
        }
        if (e.n > 0) {
          const axis = (e.n - 1) >> 1;
          const sign = (e.n - 1) & 1 ? 1 : -1;
          this.scene.effects.impact(at, axis, sign, this.surfaceAt(at, axis, sign));
        }
        return;
      }
      case "hit": {
        this.scene.effects.blood(this.tmp.set(e.x, e.y, e.z), e.p === 0);
        if (e.v !== this.me) this.scene.soldierHit(e.v, e.p === 0);
        if (e.a === this.me && e.v !== this.me) {
          const now = performance.now();
          this.hitAt = now;
          this.hitKind = e.p === 0 ? "head" : "body";
          this.sound.play(e.p === 0 ? "head" : "hit", { volume: 0.5 });
          // Le chiffre des dégâts : le même adversaire touché à nouveau dans la seconde, il s'additionne
          const last = this.pops.find((q) => q.victim === e.v && now - q.at < 1000 && !q.kill);
          if (last) {
            last.value += Math.round(e.d);
            last.at = now;
            last.head ||= e.p === 0;
          } else {
            this.pops = [
              ...this.pops.filter((q) => now - q.at < 1200).slice(-2),
              { id: ++this.feedSeq, victim: e.v, value: Math.round(e.d), at: now, head: e.p === 0, kill: false },
            ];
          }
        }
        if (e.v === this.me) {
          this.hurtAt = performance.now();
          this.sound.play("hurt", { volume: 0.7 });
          const src = e.a >= 0 ? this.fighterAt(e.a) : null;
          if (src && this.pred) {
            const ang = Math.atan2(-(src.x - this.pred.x), -(src.z - this.pred.z));
            this.damage = [
              ...this.damage.filter((d) => performance.now() - d.at < 1500).slice(-4),
              { id: ++this.feedSeq, angle: wrapAngle(ang - this.yaw), at: performance.now() },
            ];
          }
          if (e.p === 0 || e.d > 40) this.shake = Math.max(this.shake, 0.4);
        }
        return;
      }
      case "kill": {
        // Vers où il tombe : poussé depuis le tireur, ou depuis l'explosion qui l'a eu
        {
          const vpos = this.fighterAt(e.v);
          const blast = e.w === "grenade" || e.w === "mortier" || e.w === "bidon";
          const boom = this.lastBoom && performance.now() - this.lastBoom.t < 600 ? this.lastBoom : null;
          const from = blast && boom ? boom : e.a >= 0 && e.a !== e.v ? this.fighterAt(e.a) : null;
          if (vpos) {
            const dx = from ? vpos.x - from.x : Math.random() - 0.5;
            const dz = from ? vpos.z - from.z : Math.random() - 0.5;
            const l = Math.hypot(dx, dz) || 1;
            this.falls.set(e.v, { dx: dx / l, dz: dz / l, head: e.h, blast });
          }
        }
        const line: FeedLine = {
          id: ++this.feedSeq,
          killer: e.a >= 0 && e.a !== e.v ? this.nameOf(e.a) : null,
          killerColor: e.a >= 0 ? this.colorOf(e.a) : "#fff",
          victim: this.nameOf(e.v),
          victimColor: this.colorOf(e.v),
          weapon: e.w,
          head: e.h,
        };
        this.feed = [...this.feed.slice(-4), line];
        setTimeout(() => (this.feed = this.feed.filter((f) => f.id !== line.id)), 6000);
        const first = !this.firstBlood && e.a >= 0 && e.a !== e.v;
        if (first) this.firstBlood = true;
        if (e.a === this.me && e.v !== this.me) {
          const now = performance.now();
          this.hitAt = now;
          this.hitKind = "kill";
          const pop = this.pops.find((q) => q.victim === e.v && now - q.at < 1200);
          if (pop) {
            pop.kill = true;
            pop.at = now;
          }
          this.sound.play("kill", { volume: 0.55 });
          this.say(`Tu as éliminé ${this.nameOf(e.v)}${e.h ? " d'une balle à la tête" : ""}`, "good");
          this.award(`${this.nameOf(e.v)} éliminé`, POINTS.kill);
          if (e.h) this.award("Tir à la tête");
          this.multi = now - this.lastKillAt < 4500 ? this.multi + 1 : 1;
          this.lastKillAt = now;
          if (this.multi >= 2)
            this.award(["", "", "Double élimination", "Triple élimination", "Quadruple élimination"][this.multi] ?? "Carnage !");
          if (first) this.award("Premier sang");
          if (e.v === this.nemesis) {
            this.award("Vengeance");
            this.nemesis = -1;
          }
          if (e.w === "grenade") this.award("À la grenade");
          if (e.w === "couteau") this.award("Au couteau");
          const victim = this.fighterAt(e.v);
          if (victim && this.pred) {
            const d = Math.hypot(victim.x - this.pred.x, victim.z - this.pred.z);
            if (d > 38 && e.w !== "grenade") this.award(`Tir de loin · ${Math.round(d)} m`);
          }
          if (this.hp < 25 && this.pred?.alive) this.award("Dernier souffle");
        } else if (e.as === this.me && e.v !== this.me) this.award(`Aide contre ${this.nameOf(e.v)}`, POINTS.assist);
        if (e.a === this.me && e.v !== this.me) this.streak++;
        if (e.v === this.me) {
          this.killer =
            e.a >= 0 && e.a !== e.v ? { name: this.nameOf(e.a), weapon: e.w, head: e.h, hp: this.fighterAt(e.a)?.hp ?? null } : null;
          this.nemesis = e.a >= 0 && e.a !== e.v ? e.a : -1;
          this.multi = 0;
          this.streak = 0;
        }
        return;
      }
      case "throw": {
        const f = this.fighterAt(e.i);
        if (f && e.i !== this.me) this.sound.play("throw", { at: { x: f.x, y: f.y + 1.4, z: f.z } });
        return;
      }
      case "boom": {
        this.lastBoom = { x: e.x, z: e.z, t: performance.now() };
        const at = this.tmp.set(e.x, e.y, e.z);
        this.scene.effects.explosion(at);
        if (e.w === "bidon") this.scene.effects.fire(at, 7);
        if (e.w === "charge") {
          this.scene.effects.explosion(this.tmp2.copy(at).add(this.tmp3.set(-0.9, 0.4, 0.7)));
          this.scene.effects.explosion(this.tmp2.copy(at).add(this.tmp3.set(0.7, 1.2, -0.5)));
          this.scene.effects.fire(at, 14);
        }
        if (e.w === "obus") this.scene.effects.explosion(this.tmp2.copy(at).add(this.tmp3.set(0.8, 0, -0.6)));
        this.sound.play("boom", { at, volume: e.w === "obus" ? 1.2 : 1 });
        const d = at.distanceTo(this.scene.camera.position);
        const reach = e.w === "obus" ? 20 : 14;
        if (d < reach) this.shake = Math.max(this.shake, 1.3 * (1 - d / reach));
        if (d < 6) this.suppress = Math.min(1, this.suppress + 0.6);
        return;
      }
      case "barrel":
        return;
      case "ammo": {
        if (e.i !== this.me) return;
        this.sound.play("reload", { volume: 0.35, gap: 400 });
        if (e.from >= 0) this.award(`Munitions de ${this.nameOf(e.from)}`);
        else if (performance.now() - this.suppliedAt > 4000) this.award(e.g > 0 && e.n === 0 ? "Grenade" : "Ravitaillé");
        this.suppliedAt = performance.now();
        return;
      }
      case "crate": {
        if (e.up) return;
        const b = this.gm.boxes[e.b];
        if (!b) return;
        this.scene.effects.splinters(new THREE.Vector3(b.x0, b.y0, b.z0), new THREE.Vector3(b.x1, b.y1, b.z1));
        this.sound.play("crate", { at: { x: (b.x0 + b.x1) / 2, y: b.y0 + 0.6, z: (b.z0 + b.z1) / 2 }, gap: 60 });
        return;
      }
      case "revive": {
        const at = this.fighterAt(e.v);
        if (at) this.sound.play("revive", { at: { x: at.x, y: at.y + 0.5, z: at.z }, volume: 0.6 });
        if (e.i === this.me) this.award(`${this.nameOf(e.v)} relevé`, POINTS.revive);
        if (e.v === this.me) this.say(`${this.nameOf(e.i)} t'a relevé !`, "good");
        return;
      }
      case "spawn": {
        if (e.i === this.me && e.on !== undefined && e.on >= 0) this.say(`De retour auprès de ${this.nameOf(e.on)}`, "info");
        if (e.i === this.me && e.fl !== undefined) this.say(`De retour sur ${POINT_NAMES[e.fl] ?? "le drapeau"}`, "info");
        return;
      }
      case "spot": {
        const mine = this.me >= 0 ? this.teamOf(this.me) : -1;
        const teams = v ? isTeamMode(v.mode) : false;
        if (e.i === this.me || (teams && this.teamOf(e.i) === mine)) this.sound.play("spot", { volume: 0.35, gap: 300 });
        if (e.i === this.me && e.v.length > 0)
          this.award(e.v.length > 1 ? `${e.v.length} ennemis repérés` : `${this.nameOf(e.v[0]!)} repéré`);
        return;
      }
      case "reward": {
        const mine = this.me >= 0 ? this.teamOf(this.me) : -1;
        const teams = v ? isTeamMode(v.mode) : false;
        const ally = e.i === this.me || (teams && this.teamOf(e.i) === mine);
        if (e.r === "jumelles") {
          if (e.i === this.me) this.award("Jumelles : ennemis repérés");
          else
            this.say(
              ally ? `${this.nameOf(e.i)} sort les jumelles : ennemis repérés` : `${this.nameOf(e.i)} vous a repérés aux jumelles !`,
              ally ? "good" : "bad",
            );
        } else {
          if (e.i === this.me) this.award("Tir de mortier en route");
          this.say(ally ? `Tir de mortier demandé par ${this.nameOf(e.i)}` : "Tir de mortier ennemi : à couvert !", ally ? "good" : "bad");
        }
        return;
      }
      case "shell": {
        const at = this.tmp.set(e.x, 0.05, e.z);
        this.scene.effects.flare(at, e.in);
        const hear = { x: e.x, y: 3, z: e.z };
        setTimeout(() => this.sound.play("shell", { at: hear, volume: 1, gap: 0 }), Math.max(0, (e.in - 1.3) * 1000));
        return;
      }
      case "knife": {
        const f = this.fighterAt(e.i);
        if (f && e.i !== this.me) this.sound.play("knife", { at: { x: f.x, y: f.y + 1.2, z: f.z } });
        return;
      }
      case "reload": {
        if (e.i === this.me) return;
        const f = this.fighterAt(e.i);
        if (f) this.sound.play("reload", { at: { x: f.x, y: f.y + 1.2, z: f.z }, volume: 0.5 });
        return;
      }
      case "flag": {
        if (!v) return;
        const mine = this.me >= 0 ? this.teamOf(this.me) : -1;
        const who = e.i >= 0 ? this.nameOf(e.i) : "";
        if (e.i === this.me) {
          if (e.f === "take") this.award("Drapeau pris", POINTS.take);
          else if (e.f === "capture") this.award("Drapeau rapporté", POINTS.capture);
          else if (e.f === "return") this.award("Drapeau ramené", POINTS.ret);
        }
        if (e.f === "take") {
          this.sound.play("flag-take", { volume: 0.6 });
          this.say(
            e.team === mine ? `${who} a pris votre drapeau !` : `${who} a pris le drapeau adverse !`,
            e.team === mine ? "bad" : "good",
          );
        } else if (e.f === "capture") {
          this.sound.play("flag-score", { volume: 0.7 });
          this.say(
            e.team === mine ? `${who} a rapporté votre drapeau chez lui.` : `${who} marque : drapeau rapporté !`,
            e.team === mine ? "bad" : "good",
          );
        } else if (e.f === "return") {
          this.sound.play("flag-back", { volume: 0.5 });
          this.say(e.team === mine ? "Votre drapeau est revenu à sa place." : "Le drapeau adverse est revenu chez lui.", "info");
        } else if (e.f === "drop") {
          this.say(e.team === mine ? "Votre drapeau est tombé : allez le reprendre !" : "Le drapeau adverse est tombé.", "info");
        }
        return;
      }
      case "ping": {
        const mine = this.me >= 0 ? this.teamOf(this.me) : -1;
        const teams = v ? isTeamMode(v.mode) : false;
        if (e.i === this.me || (teams && this.teamOf(e.i) === mine)) {
          this.sound.play("spot", { volume: 0.3, gap: 250 });
          if (e.i !== this.me) this.say(`${this.nameOf(e.i)} : par ici !`, "info");
        }
        return;
      }
      case "sab": {
        const mine = this.me >= 0 ? this.teamOf(this.me) : -1;
        const name = DEPOT_NAMES[e.d] ?? "?";
        const attack = mine !== 1;
        if (e.s === "arm") {
          this.sound.play("beep", { volume: 0.7 });
          this.say(
            attack ? `Charge posée sur le dépôt ${name} !` : `Le dépôt ${name} est piégé : désamorcez-le !`,
            attack ? "good" : "bad",
          );
          if (e.i === this.me) this.award("Charge posée", SABOTAGE.arm);
        } else if (e.s === "defuse") {
          this.say(attack ? `Ils ont désamorcé le dépôt ${name}` : `Charge désamorcée sur le dépôt ${name}`, attack ? "bad" : "good");
          if (e.i === this.me) this.award("Charge désamorcée", SABOTAGE.saved);
        } else {
          this.say(attack ? `Dépôt ${name} détruit !` : `On a perdu le dépôt ${name}`, attack ? "good" : "bad");
          if (e.i === this.me) this.award("Dépôt détruit", SABOTAGE.blown);
        }
        return;
      }
      case "cq": {
        const mine = this.me >= 0 ? this.teamOf(this.me) : -1;
        const name = POINT_NAMES[e.p] ?? "?";
        if (e.owner >= 0) {
          const ours = e.owner === mine;
          this.sound.play("zone", { volume: 0.5 });
          this.say(ours ? `${name} est à nous !` : `L'adversaire a pris ${name} !`, ours ? "good" : "bad");
          if (ours && this.insidePoint === e.p) this.award(`${name} pris`, POINTS.flag);
        } else {
          const lost = e.was === mine;
          this.say(lost ? `On perd ${name} !` : `${name} neutralisé`, lost ? "bad" : "good");
          if (!lost && this.insidePoint === e.p) this.award(`${name} neutralisé`, POINTS.neutral);
        }
        return;
      }
      case "zone": {
        const mine = this.me >= 0 ? this.teamOf(this.me) : -1;
        if (e.contested) this.say("La zone est disputée !", "info");
        else if (e.owner >= 0) {
          this.sound.play("zone", { volume: 0.5 });
          this.say(e.owner === mine ? "Ton équipe tient la zone." : "L'adversaire tient la zone !", e.owner === mine ? "good" : "bad");
        }
        return;
      }
      case "streak": {
        if (e.i === this.me) {
          this.say(`${e.n} éliminations d'affilée !`, "good");
          this.award(`Série de ${e.n}`);
        }
        return;
      }
      case "live":
        this.sound.play("go", { volume: 0.6 });
        this.say("Au combat !", "info");
        return;
      default:
        return;
    }
  }

  /** Les évènements envoyés avec l'état d'ensemble (ils ne passent pas par les positions) */
  onEvents(events: EscEvent[]) {
    for (const e of events) this.handle(e);
  }

  /** Une médaille : quelques mots, et les points qu'elle rapporte (0 : rien qu'une mention) */
  private award(text: string, pts = 0) {
    const now = performance.now();
    this.awards = [...this.awards.filter((a) => now - a.at < 2600).slice(-4), { id: ++this.feedSeq, text, pts, at: now }];
  }

  private say(text: string, tone: "info" | "good" | "bad") {
    this.banner = { id: ++this.bannerSeq, text, tone };
    this.bannerUntil = performance.now() + 2600;
  }

  /** Un autre soldat, tel qu'on le montre en ce moment (un dixième de seconde dans le passé) */
  private fighterAt(i: number, rt = this.renderTime()): (FighterNet & { speed: number }) | null {
    const s = this.snaps;
    if (s.length === 0) return null;
    let k = s.length - 1;
    while (k > 0 && s[k - 1]!.at > rt) k--;
    const b = s[k]!;
    const a = s[k - 1] ?? b;
    if (i * P_STRIDE >= b.p.length || i * P_STRIDE >= a.p.length) return null;
    const span = b.at - a.at;
    const f = span > 0 ? Math.max(0, Math.min(1, (rt - a.at) / span)) : 1;
    const pb = readFighter(b.p, i);
    // Caché (le serveur ne dit rien de lui : on ne peut ni le voir ni l'entendre) : pas de soldat à montrer
    if ((pb.bits & PF.hidden) !== 0) return null;
    // Il vient d'apparaître : là où il est, sans glisser depuis l'endroit vide d'avant
    const pa = (readFighter(a.p, i).bits & PF.hidden) !== 0 ? pb : readFighter(a.p, i);
    const jump = Math.hypot(pb.x - pa.x, pb.z - pa.z) > 4 || (pa.bits & PF.alive) !== (pb.bits & PF.alive);
    const g = jump ? (f < 0.5 ? 0 : 1) : f;
    const speed = span > 0 && !jump ? (Math.hypot(pb.x - pa.x, pb.z - pa.z) / span) * 1000 : 0;
    const base = g < 0.5 ? pa : pb;
    return {
      ...base,
      x: pa.x + (pb.x - pa.x) * g,
      y: pa.y + (pb.y - pa.y) * g,
      z: pa.z + (pb.z - pa.z) * g,
      yaw: pa.yaw + wrapAngle(pb.yaw - pa.yaw) * g,
      pitch: pa.pitch + (pb.pitch - pa.pitch) * g,
      speed,
    };
  }

  // -------------------------------------------------------------------------
  // Chaque image
  // -------------------------------------------------------------------------

  private frame() {
    const t = performance.now();
    const dt = Math.min(0.1, (t - this.lastFrame) / 1000);
    this.lastFrame = t;
    this.quality.tick(t);
    const v = this.room.escarmouche;
    if (!v) return;
    const rt = this.renderTime(t);
    for (const e of due(this.queue, rt)) this.handle(e);
    const r = this.controls.read();
    const prefs = usePrefs.getState();
    const s = this.pred;
    const alive = Boolean(s?.alive) && this.me >= 0;
    const w = s ? weaponOf(s) : WEAPONS.fa;
    const scoped = alive && s!.ads && (w.id === "precision" || w.id === "carabine");

    // Viser : la souris ou le doigt tournent la vue tout de suite ; au doigt, une aide colle un peu à l'adversaire
    const assist = this.touch && prefs.escAssist && alive ? this.assistTarget(rt) : null;
    let slow = 1;
    if (assist && assist.off < 0.07) slow = 0.55;
    const zoomSlow = s?.ads ? (scoped ? 0.35 : 0.7) : 1;
    if (alive) {
      this.yaw = wrapAngle(this.yaw + r.dyaw * slow * zoomSlow);
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + r.dpitch * slow * zoomSlow));
      if (assist && (r.dyaw !== 0 || (r.b & B.fire) !== 0 || Math.abs(r.mx) > 0.1)) {
        const pull = Math.min(1, dt * 2.6);
        this.yaw = wrapAngle(this.yaw + wrapAngle(assist.yaw - this.yaw) * pull);
        this.pitch += (assist.pitch - this.pitch) * pull * 0.5;
      }
    }
    this.swayX += (r.dyaw * 30 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (r.dpitch * 30 - this.swayY) * Math.min(1, dt * 10);

    // La visée bouge un peu d'elle-même : à la lunette (le souffle, retenu avec la touche de course), et sous le feu
    this.swayT += dt;
    this.suppress = Math.max(0, this.suppress - dt * 0.45);
    const scopedNow = alive && s!.ads && (w.id === "precision" || w.id === "carabine");
    this.holding = scopedNow && (r.b & B.sprint) !== 0 && this.winded <= 0 && this.breath > 0;
    if (this.holding) this.breath = Math.max(0, this.breath - dt / 4.5);
    else this.breath = Math.min(1, this.breath + dt / (this.winded > 0 ? 6 : 3));
    if (this.holding && this.breath <= 0) this.winded = 2.2;
    this.winded = Math.max(0, this.winded - dt);
    const swayK = scopedNow ? (this.holding ? 0.12 : this.winded > 0 ? 2.2 : 1) * (s!.crouch ? 0.6 : 1) : 0;
    const shaky = this.suppress * (alive ? 1 : 0);
    const wantYaw =
      (Math.sin(this.swayT * 0.83) * 0.0042 + Math.sin(this.swayT * 2.1 + 1) * 0.0016) * swayK +
      (Math.sin(this.swayT * 9.3) * 0.004 + Math.sin(this.swayT * 13.7 + 2) * 0.002) * shaky;
    const wantPitch =
      (Math.sin(this.swayT * 1.21 + 0.5) * 0.0034 + Math.cos(this.swayT * 2.7) * 0.0012) * swayK +
      (Math.cos(this.swayT * 8.1) * 0.0035 + Math.sin(this.swayT * 11.9) * 0.0018) * shaky;
    this.aimYaw += (wantYaw - this.aimYaw) * Math.min(1, dt * 8);
    this.aimPitch += (wantPitch - this.aimPitch) * Math.min(1, dt * 8);
    // Peu de vie : le cœur bat, de plus en plus vite
    if (alive && this.hp < 35 && t > this.heartAt) {
      this.heartAt = t + 520 + this.hp * 14;
      this.sound.play("heart", { volume: 0.25 + (35 - this.hp) / 60 });
    }

    // Les pas de simulation : un toutes les 1/60 s, envoyés au serveur par petits paquets
    this.taps |= r.b & TAPS;
    const held = r.b & ~TAPS;
    this.acc += dt;
    let steps = 0;
    const live = this.phaseNow() === "live";
    while (this.acc >= DT && steps < 8) {
      this.acc -= DT;
      steps++;
      const cmd = quantizeCmd({
        s: ++this.seq,
        mx: alive ? r.mx : 0,
        mz: alive ? r.mz : 0,
        yaw: wrapAngle(this.yaw + this.kickYaw + this.aimYaw),
        pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + this.kickPitch + this.aimPitch)),
        b: held | this.taps,
        vt: rt,
      });
      this.taps = 0;
      if (this.me >= 0) {
        if (this.pred) {
          const out = stepSoldier(this.pred, cmd, this.world, live);
          this.localEffects(out, cmd);
        }
        this.pending.push(cmd);
        if (this.pending.length > 180) this.pending.shift();
        this.outbox.push(encodeCmd(cmd));
      }
    }
    if (this.acc > DT * 8) this.acc = 0;
    if (this.outbox.length > 0 && (t - this.lastSend > 33 || this.outbox.length >= 4)) {
      this.send({ t: "cmd", c: this.outbox });
      this.outbox = [];
      this.lastSend = t;
    }

    // Le recul se résorbe, l'arme revient
    const rec = Math.exp(-dt * 7);
    this.kickPitch *= rec;
    this.kickYaw *= rec;
    this.vmKick = Math.max(0, this.vmKick - dt * 9);
    this.raise = Math.min(1, this.raise + dt * 2.6);
    this.adsAmount += ((s?.ads ? 1 : 0) - this.adsAmount) * Math.min(1, dt * 14);
    this.err.multiplyScalar(Math.exp(-dt * 14));
    this.shake = Math.max(0, this.shake - dt * 2.5);

    // La caméra : à ses yeux, ou celle d'un autre soldat pour qui regarde
    const baseFov = prefs.escFov;
    const slidingNow = Boolean(s && s.alive && s.slideEnd > s.clock);
    this.slideTilt += ((slidingNow ? 1 : 0) - this.slideTilt) * Math.min(1, dt * 9);
    const fov = baseFov + (w.adsFov - baseFov) * this.adsAmount + this.slideTilt * 7 + (s?.sprint ? 3 : 0) * (1 - this.adsAmount);
    let spectating: string | null = null;
    if (s && this.me >= 0 && s.alive) {
      const speed = Math.hypot(s.vx, s.vz);
      if (s.ground) {
        this.bob += dt * (4 + speed * 1.7);
        this.stride += speed * dt;
        const strideLen = s.sprint ? 2.8 : 2.2;
        if (this.stride > strideLen && !s.crouch && speed > 2) {
          this.stride = 0;
          this.sound.play("step", { volume: s.sprint ? 0.45 : 0.3 });
        }
      }
      if (s.ground && !this.wasGround) {
        this.sound.play("land", { volume: 0.4 });
        // La réception : la vue se tasse un instant, d'autant plus que la chute était rapide
        this.landDip = Math.min(0.16, Math.max(0.03, -this.lastVy * 0.018));
      }
      this.wasGround = s.ground;
      if (!s.ground) this.lastVy = s.vy;
      // S'accroupir, se relever : la vue descend et remonte en douceur (la balle part toujours des vrais yeux)
      const eyeWant = eyeOf(s) - s.y;
      this.eyeOff = this.eyeOff === 0 ? eyeWant : this.eyeOff + (eyeWant - this.eyeOff) * Math.min(1, dt * 15);
      this.landDip = Math.max(0, this.landDip - dt * 0.9);
      const bobAmp = s.ground ? Math.min(1, speed / 5) * (s.sprint ? 0.022 : 0.012) : 0;
      const shakeX = (Math.random() - 0.5) * this.shake * 0.05;
      const shakeY = (Math.random() - 0.5) * this.shake * 0.05;
      this.scene.setView(
        s.x + this.err.x,
        s.y +
          this.eyeOff -
          this.landDip * Math.sin(Math.min(1, this.landDip / 0.16) * Math.PI * 0.5) +
          this.err.y +
          Math.sin(this.bob * 2) * bobAmp * 0.6,
        s.z + this.err.z,
        this.yaw + this.kickYaw + this.aimYaw + shakeX,
        this.pitch + this.kickPitch + this.aimPitch + shakeY,
        fov,
        this.slideTilt * 0.08,
      );
      this.scene.updateViewmodel({
        weapon: w.id,
        camo: this.room.arsenal[this.room.you.seatId ?? ""]?.camo ?? "usine",
        gear: { muzzle: s.muzzle ?? "aucun", extra: s.extra ?? "aucun" },
        ads: this.adsAmount,
        reload: s.reloadEnd > 0 ? 1 - (s.reloadEnd - s.clock) / w.reload : -1,
        raise: Math.min(this.raise, s.switchEnd > s.clock ? 1 - (s.switchEnd - s.clock) / 0.45 : 1),
        kick: this.vmKick,
        bob: this.bob,
        bobAmp: bobAmp * 1.6,
        swayX: this.swayX,
        swayY: this.swayY,
        sprint: s.sprint,
        melee: s.meleeEnd > s.clock ? 1 - (s.meleeEnd - s.clock) / 0.65 : -1,
        throwing: s.throwEnd > s.clock ? 1 - (s.throwEnd - s.clock) / 0.6 : -1,
        alive: true,
        scoped,
      });
      this.sound.setListener(s.x, eyeOf(s), s.z, this.yaw);
    } else if (this.me >= 0 && s) {
      // Hors de combat : la vue tombe au sol et se tourne vers celui qui l'a eu
      const f = Math.min(1, (t - this.deathAt) / 700);
      const k = this.killerIndex();
      const target = k >= 0 ? this.fighterAt(k, rt) : null;
      const look = target ? Math.atan2(-(target.x - this.deathPos.x), -(target.z - this.deathPos.z)) : this.yaw;
      this.scene.setView(
        this.deathPos.x,
        this.deathPos.y - f * 1.1,
        this.deathPos.z,
        this.yaw + wrapAngle(look - this.yaw) * f,
        -0.25 * f,
        baseFov,
        f * 0.4,
      );
      this.scene.updateViewmodel(this.deadView(w.id));
      this.sound.setListener(this.deathPos.x, this.deathPos.y, this.deathPos.z, this.yaw);
    } else {
      // Spectateur : il suit un soldat (un clic ou une touche pour passer au suivant)
      const n = v.fighters.length;
      if (n > 0) {
        if (this.spec < 0 || this.spec >= n) this.spec = 0;
        if (r.b & (B.fire | B.jump)) this.spec = (this.spec + 1) % n;
        const f = this.fighterAt(this.spec, rt);
        if (f) {
          const eye = f.y + ((f.bits & PF.crouch) !== 0 ? 1.05 : 1.62);
          const [fx, , fz] = forward(f.yaw, 0);
          this.scene.setView(f.x - fx * 3, eye + 0.8, f.z - fz * 3, f.yaw, f.pitch * 0.5 - 0.15, baseFov);
          this.sound.setListener(f.x, eye, f.z, f.yaw);
        }
        spectating = this.nameOf(this.spec);
      }
      this.scene.updateViewmodel(this.deadView("fa"));
    }

    // Les autres soldats
    const teams = isTeamMode(v.mode);
    const flags = this.latest?.f;
    let aimed: string | null = null;
    const eyeX = this.scene.camera.position.x;
    const eyeY = this.scene.camera.position.y;
    const eyeZ = this.scene.camera.position.z;
    const dir = forward(this.yaw, this.pitch);
    const wallT = this.world.raycast(eyeX, eyeY, eyeZ, dir[0], dir[1], dir[2], 120)?.t ?? 120;
    this.radarDots.length = 0;
    const nowMs = performance.now();
    let nearFallen: string | null = null;
    // Les repères : ceux qui sont montrés à son équipe (ou à soi seul, en chacun pour soi)
    this.marked.clear();
    const mk = this.latest?.mk;
    if (mk && this.me >= 0) {
      const myTeam = this.teamOf(this.me);
      for (let k = 0; k + 2 < mk.length; k += 3) if (teams ? mk[k + 1] === myTeam : mk[k + 2] === this.me) this.marked.add(mk[k]!);
    }
    this.scene.setBarrels(this.barrelBoxes, new Set(this.latest?.bd ?? []));
    // Le froid du col : la buée des respirations, la sienne devant soi, celle des soldats tout près
    if (this.gm.light === "neige" && nowMs >= this.breathAt) {
      this.breathAt = nowMs + 450;
      const cam = this.scene.camera;
      if (s?.alive && Math.random() < 0.3) {
        cam.getWorldDirection(this.tmp2);
        this.scene.effects.breath(
          this.tmp
            .copy(cam.position)
            .addScaledVector(this.tmp2, 0.45)
            .add(this.tmp3.set(0, -0.16, 0)),
        );
      }
      const tick = this.latest;
      if (tick) {
        for (let i = 0; i < v.fighters.length; i++) {
          if (i === this.me || Math.random() > 0.22) continue;
          const g = readFighter(tick.p, i);
          if (!g || (g.bits & PF.alive) === 0 || Math.hypot(g.x - cam.position.x, g.z - cam.position.z) > 18) continue;
          const at = this.scene.mouthOf(i, this.tmp);
          if (at) this.scene.effects.breath(at);
        }
      }
    }
    // Les repères de son équipe (en chacun pour soi, les siens)
    {
      const pg = this.latest?.pg ?? [];
      const mine = this.me >= 0 ? this.teamOf(this.me) : -2;
      const teams = isTeamMode(v.mode);
      const list: { x: number; y: number; z: number }[] = [];
      for (let k = 0; k + 4 < pg.length; k += 5) {
        const ok = teams ? pg[k] === mine : pg[k + 1] === this.me;
        if (ok) list.push({ x: pg[k + 2]! / 100, y: pg[k + 3]! / 100, z: pg[k + 4]! / 100 });
      }
      this.scene.setPings(list);
      this.pingDots = list;
    }
    // Ses lieux de ravitaillement : sa base (les deux, chacun pour soi), et ses drapeaux en conquête
    if (this.me >= 0) {
      const team = this.teamOf(this.me);
      const cq = this.latest?.cq;
      const pts = isTeamMode(v.mode)
        ? [this.gm.flags[team === 1 ? 1 : 0], ...this.gm.points.filter((_, k) => cq && cq[k * 2] === team)]
        : [this.gm.flags[0], this.gm.flags[1]];
      this.scene.setSupply(pts, RESUPPLY.reach);
    }
    // Les caisses cassées : à l'image, et dans le monde où l'on prévoit ses pas (on passe là où elles étaient)
    const broken = this.latest?.cr ?? [];
    this.scene.setCrates(new Set(broken));
    this.world = worldWithout(v.map, broken);
    for (let i = 0; i < v.fighters.length; i++) {
      if (i === this.me) continue;
      const f = this.fighterAt(i, rt);
      if (!f) {
        // Hors de vue et sans bruit : le serveur ne l'envoie plus, on ne le montre plus
        this.scene.hideSoldier(i);
        continue;
      }
      const alive = (f.bits & PF.alive) !== 0;
      const crouch = (f.bits & PF.crouch) !== 0;
      const pose = { x: f.x, y: f.y, z: f.z, crouch, alive };
      const inSight = alive && this.enemy(i) && (rayFighter(eyeX, eyeY, eyeZ, dir, pose, wallT)?.t ?? Infinity) < wallT;
      if (inSight) aimed = this.nameOf(i);
      const ally = teams && this.me >= 0 && this.teamOf(i) === this.teamOf(this.me);
      const flagTeam = f.carrying;
      // Au radar : ses alliés toujours, un ennemi quand il vient de tirer
      const marked = !ally && this.marked.has(i);
      const fallen = ally && !alive;
      if (fallen && s?.alive && Math.hypot(f.x - s.x, f.z - s.z) < 1.8 && Math.abs(f.y - s.y) < 1.2) nearFallen = this.nameOf(i);
      if (alive && (ally || marked || nowMs - (this.radarPing.get(i) ?? -1e9) < 2500))
        this.radarDots.push({ x: f.x, z: f.z, yaw: f.yaw, kind: ally ? "ally" : "enemy" });
      this.scene.updateSoldier(
        i,
        {
          x: f.x,
          y: f.y,
          z: f.z,
          yaw: f.yaw,
          pitch: f.pitch,
          speed: f.speed,
          crouch,
          ground: (f.bits & PF.ground) !== 0,
          sprint: (f.bits & PF.sprint) !== 0,
          ads: (f.bits & PF.ads) !== 0,
          reload: (f.bits & PF.reload) !== 0,
          slide: (f.bits & PF.slide) !== 0,
          mantle: (f.bits & PF.mantle) !== 0,
          alive,
          weapon: f.weapon,
          carrying: f.carrying,
          shield: (f.bits & PF.shield) !== 0,
          fall: alive ? undefined : this.falls.get(i),
        },
        dt,
        ally || inSight || this.me < 0,
        flagTeam >= 0 ? TEAM_HEX[flagTeam === 1 ? 1 : 0] : null,
        marked,
        fallen,
      );
      // Les pas des autres, s'ils courent près de soi
      if (alive && f.speed > 3 && !crouch && (f.bits & PF.ground) !== 0) {
        const d = Math.hypot(f.x - eyeX, f.z - eyeZ);
        const due = this.stepTimers.get(i) ?? 0;
        if (d < 22 && t > due) {
          this.stepTimers.set(i, t + 340);
          this.sound.play("step", { at: { x: f.x, y: f.y, z: f.z }, volume: 0.5 });
        }
      }
    }
    // Les grenades, les drapeaux, la zone
    this.scene.setGrenades(this.grenadesAt(rt));
    if (flags) {
      this.scene.setFlags(
        [0, 1].map((k) => ({ at: flags[k * 5]!, x: flags[k * 5 + 2]! / 100, y: flags[k * 5 + 3]! / 100, z: flags[k * 5 + 4]! / 100 })),
        this.gm.flags,
      );
    }
    if (v.mode === "zone") this.scene.setZone(this.gm.zone, this.latest?.z?.[0] ?? -1, this.latest?.z?.[1] === 1);
    if (v.mode === "conquete") this.scene.setPoints(this.gm.points, this.latest?.cq ?? null, CONQUEST.r);
    if (v.mode === "sabotage") {
      const sb = this.latest?.sb ?? null;
      this.scene.setDepots(this.gm.depots, sb);
      // Le bip des charges posées, de plus en plus pressé
      this.gm.depots.forEach((d, k) => {
        if (!sb || sb[k * 2] !== 1) return;
        const left = (sb[k * 2 + 1] ?? 0) / 10;
        if (nowMs < this.beepAt[k]!) return;
        this.beepAt[k] = nowMs + 1000 * Math.max(0.14, Math.min(1, left / 22));
        this.sound.play("beep", { at: { x: d.x, y: d.y + 1, z: d.z }, volume: 0.5 });
      });
    }
    // La douleur à l'image : pâle et rougie sur les bords quand on vient d'être touché, ou qu'il reste peu de vie
    const hurtK =
      this.me >= 0 && s?.alive ? Math.max(0, 1 - (nowMs - this.hurtAt) / 650) * 0.55 + Math.max(0, (40 - this.hp) / 40) * 0.45 : 0;
    this.scene.setHurt(hurtK);
    this.scene.render(dt);
    if (this.radarCanvas) {
      const cam = this.scene.camera.position;
      const zoneOwner = this.latest?.z?.[0] ?? -1;
      this.radar.draw(
        this.radarCanvas,
        { x: cam.x, z: cam.z, yaw: this.yaw },
        this.radarDots,
        [
          ...(flags ? [0, 1].map((k) => ({ x: flags[k * 5 + 2]! / 100, z: flags[k * 5 + 4]! / 100, color: TEAM_HEX[k as 0 | 1] })) : []),
          ...this.pingDots.map((p) => ({ x: p.x, z: p.z, color: "#ffd23a" })),
        ],
        v.mode === "zone" ? { ...this.gm.zone, color: zoneOwner >= 0 ? TEAM_HEX[zoneOwner === 1 ? 1 : 0] : "rgba(240,236,220,.8)" } : null,
        v.mode === "sabotage" && this.latest?.sb
          ? this.gm.depots
              .map((p, k) => ({ p, k, st: this.latest!.sb![k * 2] ?? 0 }))
              .filter(({ st }) => st !== 2)
              .map(({ p, k, st }) => ({
                x: p.x,
                z: p.z,
                letter: DEPOT_NAMES[k] ?? "?",
                color: st === 1 ? (Math.floor(nowMs / 300) % 2 ? "#ff5a3a" : "#ffb020") : TEAM_HEX[1],
              }))
          : v.mode === "conquete" && this.latest?.cq
            ? this.gm.points.map((p, k) => {
                const owner = this.latest!.cq![k * 2] ?? -1;
                return {
                  x: p.x,
                  z: p.z,
                  letter: POINT_NAMES[k] ?? "?",
                  color: owner >= 0 ? TEAM_HEX[owner === 1 ? 1 : 0] : "rgba(240,236,220,.9)",
                };
              })
            : [],
      );
    }
    if (this.compassCanvas) drawCompass(this.compassCanvas, this.yaw);

    // Le compte à rebours
    const remain = v.liveAt - this.simNow();
    if (v.phase === "countdown" || (remain > 0 && remain < 4)) {
      const sec = Math.ceil(remain);
      if (sec !== this.lastBeep && sec > 0 && sec <= 3) {
        this.lastBeep = sec;
        this.sound.play("beep", { volume: 0.5 });
      }
    }
    this.nearFallen = nearFallen;
    if (t - this.hudAt > 66) {
      this.hudAt = t;
      this.emitHud(r.board || this.forceBoard, scoped, aimed, spectating, w.id);
    }
  }

  private deadView(weapon: WeaponId) {
    return {
      weapon,
      camo: "usine" as const,
      ads: 0,
      reload: -1,
      raise: 0,
      kick: 0,
      bob: 0,
      bobAmp: 0,
      swayX: 0,
      swayY: 0,
      sprint: false,
      melee: -1,
      throwing: -1,
      alive: false,
      scoped: false,
    };
  }

  private killerIndex(): number {
    if (!this.killer) return -1;
    const v = this.room.escarmouche;
    return v ? v.fighters.findIndex((_, i) => this.nameOf(i) === this.killer!.name) : -1;
  }

  /** L'heure de la partie (s), d'après le dernier envoi reçu */
  private simNow() {
    if (!this.latest) return 0;
    return this.latest.s + (performance.now() - this.latestAt) / 1000;
  }

  private grenadesAt(rt: number): { x: number; y: number; z: number }[] {
    const s = this.snaps;
    if (s.length === 0) return [];
    let k = s.length - 1;
    while (k > 0 && s[k - 1]!.at > rt) k--;
    const b = s[k]!;
    const a = s[k - 1] ?? b;
    const f = b.at > a.at ? Math.max(0, Math.min(1, (rt - a.at) / (b.at - a.at))) : 1;
    const out: { x: number; y: number; z: number }[] = [];
    for (let q = 0; q < b.g.length; q += 4) {
      const id = b.g[q]!;
      let pa = -1;
      for (let r = 0; r < a.g.length; r += 4) if (a.g[r] === id) pa = r;
      const bx = b.g[q + 1]! / 100;
      const by = b.g[q + 2]! / 100;
      const bz = b.g[q + 3]! / 100;
      if (pa < 0) out.push({ x: bx, y: by, z: bz });
      else
        out.push({
          x: a.g[pa + 1]! / 100 + (bx - a.g[pa + 1]! / 100) * f,
          y: a.g[pa + 2]! / 100 + (by - a.g[pa + 2]! / 100) * f,
          z: a.g[pa + 3]! / 100 + (bz - a.g[pa + 3]! / 100) * f,
        });
    }
    return out;
  }

  /** L'adversaire le plus près du viseur (au doigt), et l'angle qui le viserait */
  private assistTarget(rt: number): { yaw: number; pitch: number; off: number } | null {
    const s = this.pred;
    const v = this.room.escarmouche;
    if (!s || !v) return null;
    const ex = s.x;
    const ey = eyeOf(s);
    const ez = s.z;
    let best: { yaw: number; pitch: number; off: number } | null = null;
    for (let i = 0; i < v.fighters.length; i++) {
      if (!this.enemy(i)) continue;
      const f = this.fighterAt(i, rt);
      if (!f || (f.bits & PF.alive) === 0) continue;
      const box = partBox({ x: f.x, y: f.y, z: f.z, crouch: (f.bits & PF.crouch) !== 0 }, 1);
      const cy = (box[1] + box[4]) / 2;
      const dx = f.x - ex;
      const dz = f.z - ez;
      const d = Math.hypot(dx, dz);
      if (d > 60 || d < 0.5) continue;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(cy - ey, d);
      const off = Math.hypot(wrapAngle(yaw - this.yaw), pitch - this.pitch);
      if (off > 0.12 || (best && off > best.off)) continue;
      if (!this.world.clear(ex, ey, ez, f.x, cy, f.z)) continue;
      best = { yaw, pitch, off };
    }
    return best;
  }

  /** Sabotage : tout près d'un dépôt où l'on a quelque chose à faire, le conseil pour s'y mettre */
  private sabHint(s: { x: number; y: number; z: number }, sb: readonly number[] | null): string | null {
    if (!sb || this.me < 0) return null;
    const defend = this.teamOf(this.me) === 1;
    for (let k = 0; k < this.gm.depots.length; k++) {
      const d = this.gm.depots[k]!;
      if (sb[k * 2] !== (defend ? 1 : 0)) continue;
      if (Math.hypot(d.x - s.x, d.z - s.z) > SABOTAGE.reach + 0.6 || Math.abs(d.y - s.y) > 1.2) continue;
      const how = this.controls.scheme === "tactile" ? "Accroupis-toi" : "Accroupis-toi (C)";
      return defend ? `${how} pour désamorcer la charge` : `${how} pour poser la charge`;
    }
    return null;
  }

  /** Ce soldat tire-t-il au silencieux (avec son arme principale) ? */
  private quietShooter(i: number, w: WeaponId): boolean {
    const id = this.room.escarmouche?.fighters[i]?.id;
    const a = id ? this.room.arsenal[id] : undefined;
    return Boolean(a && a.muzzle === "silencieux" && a.primary === w);
  }

  /** La matière de la face touchée en ce point (un tout petit rayon tiré vers elle) */
  private surfaceAt(at: THREE.Vector3, axis: number, sign: number): Surface {
    if (axis < 0) return "dirt";
    const n = [axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0] as const;
    const hit = this.world.raycast(at.x + n[0] * 0.05, at.y + n[1] * 0.05, at.z + n[2] * 0.05, -n[0], -n[1], -n[2], 0.12);
    return surfaceOf(hit ? this.world.boxes[hit.box]?.m : undefined);
  }

  /** Ses propres tirs : vus et entendus tout de suite, avant même que le serveur les juge */
  private localEffects(out: StepOut, cmd: Cmd) {
    const s = this.pred!;
    for (const shot of out.shots) {
      const w = defOf(s, shot.weapon);
      const quiet = shot.weapon === s.primary && s.muzzle === "silencieux";
      const muzzle = this.scene.viewMuzzle(this.tmp2);
      shot.dirs.slice(0, 4).forEach((d) => {
        const hit = this.world.raycast(shot.ox, shot.oy, shot.oz, d[0], d[1], d[2], 150);
        const t = hit?.t ?? 150;
        const end = this.tmp.set(shot.ox + d[0] * t, shot.oy + d[1] * t, shot.oz + d[2] * t);
        if (hit) this.scene.effects.impact(end, hit.axis, hit.sign, surfaceOf(this.world.boxes[hit.box]?.m));
      });
      this.scene.viewFlash(shot.weapon, quiet);
      this.scene.effects.glow(muzzle, 8, 60);
      if (Math.random() < 0.35) this.scene.effects.muzzleSmoke(muzzle);
      if (shot.weapon === "pompe") setTimeout(() => this.scene.ejectShell("pompe"), 380);
      else this.scene.ejectShell(shot.weapon);
      this.sound.play(quiet ? "shot-quiet" : `shot-${shot.weapon}`, { gap: 20 });
      if (shot.weapon === "pompe" || shot.weapon === "precision") setTimeout(() => this.sound.play("pump", { volume: 0.6 }), 380);
      const k = ((w.kick * (s.ads ? 0.55 : 1) * (s.crouch ? 0.8 : 1)) / 180) * Math.PI;
      this.kickPitch += k;
      this.kickYaw += (Math.random() - 0.5) * k * 0.5;
      this.vmKick = 1;
    }
    if (out.reloaded) this.sound.play(weaponOf(s).id === "pompe" ? "pump" : "reload", { volume: 0.6 });
    if (out.swapped) {
      this.sound.play("swap", { volume: 0.5 });
      this.raise = 0;
    }
    if (out.melee) this.sound.play("knife", { volume: 0.6 });
    if (out.grenade) this.sound.play("throw", { volume: 0.6 });
    if (out.slid) this.sound.play("slide", { volume: 0.55 });
    if (out.mantled) {
      this.sound.play("mantle", { volume: 0.6 });
      this.raise = 0.25;
    }
    if ((cmd.b & B.fire) !== 0 && (s.prevB & B.fire) !== 0 && s.mag[s.slot] === 0 && s.res[s.slot] === 0 && s.reloadEnd === 0) {
      this.sound.play("empty", { volume: 0.5, gap: 250 });
    }
  }

  /**
   * Quand l'appareil peine, un cran de plus : en qualité haute, d'abord l'ombre des recoins (une deuxième image de toute
   * la scène, à peine visible) ; puis moins de pixels, en trois fois ; enfin plus d'ombres portées. La qualité
   * automatique défait un cran qui ne sert à rien (un processeur qui peine ne gagne rien à dessiner moins de pixels).
   */
  private tuneQuality(levers: readonly string[], on: readonly boolean[]) {
    let pixels = 0;
    let ao = true;
    let shadows = true;
    on.forEach((taken, i) => {
      if (!taken) return;
      if (levers[i] === "pixels") pixels++;
      else if (levers[i] === "recoins") ao = false;
      else if (levers[i] === "ombres") shadows = false;
    });
    this.scene.setResolution(PIXEL_STEPS[pixels]!);
    this.scene.setAo(ao);
    this.scene.setShadows(shadows);
  }

  private emitHud(board: boolean, scoped: boolean, aimed: string | null, spectating: string | null, weapon: WeaponId) {
    const v = this.room.escarmouche!;
    const s = this.pred;
    const tick = this.latest;
    const now = performance.now();
    const teams = isTeamMode(v.mode);
    const sc = tick?.sc ?? [];
    const rows: BoardRow[] = v.fighters.map((f, i) => ({
      i,
      name: this.nameOf(i),
      team: f.team,
      kills: sc[i * SC_STRIDE] ?? 0,
      deaths: sc[i * SC_STRIDE + 1] ?? 0,
      points: sc[i * SC_STRIDE + 2] ?? 0,
      assists: sc[i * SC_STRIDE + 3] ?? 0,
      me: i === this.me,
      bot: f.bot,
    }));
    const lead = [...rows].sort((a, b) => b.kills - a.kills)[0];
    const myRow = rows[this.me];
    const w = s ? weaponOf(s) : WEAPONS.fa;
    // Le réticule : la dispersion du moment, ramenée à l'écran
    const spreadDeg = s ? spreadOf(s) : w.hip;
    const fov = this.scene.camera.fov;
    const spread = (Math.tan(((spreadDeg / 2) * Math.PI) / 180) / Math.tan(((fov / 2) * Math.PI) / 180)) * (window.innerHeight / 2);
    const flagsRaw = tick?.f;
    const inZone =
      v.mode === "zone" && s?.alive ? (s.x - this.gm.zone.x) ** 2 + (s.z - this.gm.zone.z) ** 2 <= this.gm.zone.r ** 2 && s.y < 3 : false;
    const myFighter = this.me >= 0 && tick ? readFighter(tick.p, this.me) : null;
    // Conquête : le drapeau où l'on se tient ; et l'alerte quand les tickets de son équipe s'épuisent
    this.insidePoint =
      v.mode === "conquete" && s?.alive
        ? this.gm.points.findIndex((p) => (s.x - p.x) ** 2 + (s.z - p.z) ** 2 <= CONQUEST.r ** 2 && Math.abs(s.y - p.y) <= CONQUEST.dy)
        : -1;
    if (v.mode === "conquete" && tick && this.me >= 0) {
      const left = tick.ts[this.teamOf(this.me) === 1 ? 1 : 0];
      if (left <= 20 && left > 0 && !this.ticketWarned) {
        this.ticketWarned = true;
        this.say(`Plus que ${left} tickets !`, "bad");
      }
    }
    this.ping = this.minLag === null ? 0 : Math.round(this.jitter);
    this.onHud({
      seated: this.me >= 0,
      alive: Boolean(s?.alive),
      hp: this.hp,
      weapon,
      slot: s?.slot ?? 0,
      mag: s ? s.mag[s.slot] : 0,
      res: s ? s.res[s.slot] : 0,
      grenades: s?.grenades ?? 0,
      reloading: s && s.reloadEnd > 0 ? 1 - (s.reloadEnd - s.clock) / w.reload : -1,
      ads: Boolean(s?.ads),
      scoped,
      spread: Math.max(4, spread),
      back: this.back,
      noReinforcements: this.noReinforcements,
      next: this.next,
      nextSecondary: this.nextSecondary,
      killer: this.killer,
      teamScores: tick?.ts ?? [0, 0],
      myTeam: this.me >= 0 ? this.teamOf(this.me) : -1,
      mine: { kills: myRow?.kills ?? 0, deaths: myRow?.deaths ?? 0, points: myRow?.points ?? 0 },
      leader: !teams && lead ? { name: lead.name, kills: lead.kills } : null,
      timeLeft: Math.max(0, v.endAt - this.simNow()),
      phase: this.phaseNow(),
      countdown: Math.max(0, v.liveAt - this.simNow()),
      feed: this.feed,
      hitAt: this.hitAt,
      hitKind: this.hitKind,
      pops: this.pops.filter((q) => now - q.at < 1100).map(({ id, value, at, head, kill }) => ({ id, value, at, head, kill })),
      damage: this.damage.filter((d) => now - d.at < 1500),
      hurtAt: this.hurtAt,
      flags: flagsRaw ? [0, 1].map((k) => ({ at: flagsRaw[k * 5]!, carrier: flagsRaw[k * 5 + 1]! })) : null,
      carrying: myFighter?.carrying ?? -1,
      zone: v.mode === "zone" ? { owner: tick?.z?.[0] ?? -1, contested: tick?.z?.[1] === 1, inside: inZone } : null,
      sab:
        v.mode === "sabotage"
          ? {
              deps: this.gm.depots.map((_, k) => ({ state: tick?.sb?.[k * 2] ?? 0, left: (tick?.sb?.[k * 2 + 1] ?? 0) / 10 })),
              act: this.sabNow
                ? {
                    k: this.sabNow[1],
                    label:
                      this.teamOf(this.me) === 1
                        ? `Désamorçage du dépôt ${DEPOT_NAMES[this.sabNow[0]] ?? "?"}`
                        : `Charge sur le dépôt ${DEPOT_NAMES[this.sabNow[0]] ?? "?"}`,
                  }
                : null,
              hint: s?.alive && !this.sabNow ? this.sabHint(s, tick?.sb ?? null) : null,
            }
          : null,
      cq:
        v.mode === "conquete"
          ? {
              pts: this.gm.points.map((_, k) => ({ owner: tick?.cq?.[k * 2] ?? -1, v: (tick?.cq?.[k * 2 + 1] ?? 0) / 100 })),
              inside: this.insidePoint,
            }
          : null,
      banner: now < this.bannerUntil ? this.banner : null,
      awards: this.awards.filter((a) => now - a.at < 2600),
      suppress: this.suppress,
      breath: scoped ? { left: this.breath, holding: this.holding, winded: this.winded > 0 } : null,
      streak: s?.alive ? this.streak : 0,
      team:
        teams && this.me >= 0
          ? {
              mates: v.fighters
                .map((f, i) => ({ i, f }))
                .filter(({ f, i }) => i !== this.me && f.team === this.teamOf(this.me))
                .map(({ i }) => {
                  const g = tick ? readFighter(tick.p, i) : null;
                  return {
                    i,
                    name: this.nameOf(i),
                    alive: Boolean(g && (g.bits & PF.alive) !== 0),
                    fight: Boolean(g && (g.bits & PF.fight) !== 0),
                  };
                }),
              spawnOn: this.spawnOn,
              reviving: this.revivingNow ? { name: this.nameOf(this.revivingNow[0]), k: this.revivingNow[1] } : null,
              rescue: this.rescueNow ? { name: this.nameOf(this.rescueNow[0]), k: this.rescueNow[1] } : null,
              waiting: this.waiting,
              hint: s?.alive && !this.revivingNow ? this.nearFallen : null,
            }
          : null,
      scheme: this.controls.scheme,
      locked: this.controls.locked,
      aimed,
      spectating,
      board: board ? rows : [],
      ping: this.ping,
    });
  }
}

/** Ce que devient une balle selon ce qu'elle touche : des étincelles, des éclats de pierre, des copeaux, de la terre */
function surfaceOf(m: Mat | undefined): Surface {
  switch (m) {
    case "metal":
    case "rouille":
    case "wagon":
    case "wagon2":
      return "metal";
    case "bois":
    case "planche":
    case "caisse":
      return "wood";
    case "herbe":
    case "terre":
    case "sol":
    case "gravier":
    case "foin":
    case "sacs":
      return "dirt";
    case "neige":
      return "snow";
    default:
      return "stone";
  }
}
