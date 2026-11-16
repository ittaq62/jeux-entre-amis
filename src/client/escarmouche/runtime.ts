// Une partie d'Escarmouche vue de chez soi. Ses propres pas sont joués tout de suite (60 par seconde), sans attendre
// le serveur, puis recalés sur ce que le serveur en a retenu ; les autres soldats sont montrés un dixième de seconde
// dans le passé, entre deux positions reçues, pour qu'ils glissent sans à-coups. Les balles sont jugées par le serveur,
// là où le tireur voyait ses cibles : ce qu'on voit est ce qu'on touche.

import * as THREE from "three";
import { seededAvatar } from "../../shared/avatar.ts";
import { getMap, type GameMap } from "../../shared/games/escarmouche/maps.ts";
import { isTeamMode, partBox, rayFighter, worldOf, type EscEvent, type KillWeapon } from "../../shared/games/escarmouche/match.ts";
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
import { usePrefs } from "../stores/prefs.ts";
import { EscControls, type Scheme } from "./controls.ts";
import { EscSound } from "./escSound.ts";
import { EscScene, TEAM_HEX } from "./scene/EscScene.ts";
import type { Surface } from "./scene/effects.ts";
import { drawCompass, Radar, type RadarDot } from "./radar.ts";
import { pickQuality } from "./scene/quality.ts";
import { ffaKit, TEAM_KITS } from "./scene/soldiers.ts";

/** Les boutons qui ne comptent qu'au moment de l'appui (gardés jusqu'au prochain pas) */
const TAPS = B.reload | B.grenade | B.melee | B.swap | B.slot1 | B.slot2 | B.jump;
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
  next: PrimaryId;
  nextSecondary: SecondaryId;
  killer: { name: string; weapon: KillWeapon; head: boolean } | null;
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
  damage: { id: number; angle: number; at: number }[];
  hurtAt: number;
  flags: { at: number; carrier: number }[] | null;
  carrying: number;
  zone: { owner: number; contested: boolean; inside: boolean } | null;
  banner: { id: number; text: string; tone: "info" | "good" | "bad" } | null;
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
  private bannerUntil = 0;
  private bannerSeq = 0;
  private hudAt = 0;
  private stepTimers = new Map<number, number>();
  private lastShots = new Map<number, number>();
  private lastBeep = -1;
  private ping = 0;
  private fps = 60;
  private frames = 0;
  private fpsAt = 0;
  private slowFor = 0;
  private fastFor = 0;
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
    this.scene = new EscScene(o.canvas, this.gm, {
      quality: pickQuality(usePrefs.getState().escQuality, o.touch),
      teams: isTeamMode(v.mode),
    });
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
    this.sound.startAmbience(this.gm.light);
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
      else this.queue.push({ at: now, e });
    }
    if (me) this.reconcile(me);
  }

  /** Ce que le serveur a retenu de ses pas : on y revient, puis on rejoue ceux qu'il n'a pas encore vus */
  private reconcile(me: EscMe) {
    this.me = me.i;
    this.hp = me.hp;
    this.back = me.back;
    this.next = me.next;
    this.nextSecondary = me.nextSecondary;
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
          if (performance.now() - last > 30) {
            this.scene.effects.flash(from, 0.3);
            this.scene.soldierFired(e.i);
            const dist = from.distanceTo(this.scene.camera.position);
            if (dist > 40) this.sound.play("far", { at: from, volume: 0.9, gap: 40 });
            else this.sound.play(`shot-${e.w}`, { at: from, gap: 40 });
            this.lastShots.set(e.i, performance.now());
          }
          this.scene.effects.tracer(from, at, 0.8);
          // La balle passe tout près : elle siffle
          if (this.me >= 0 && this.pred?.alive) {
            const cam = this.scene.camera.position;
            const seg = this.tmp3.subVectors(at, from);
            const len = seg.length();
            if (len > 1) {
              const k = Math.max(0, Math.min(1, this.tmp4.subVectors(cam, from).dot(seg) / (len * len)));
              const close = this.tmp4.copy(from).addScaledVector(seg, k);
              if (k > 0.05 && k < 0.98 && close.distanceTo(cam) < 2.2) this.sound.play("whiz", { at: close, volume: 0.7, gap: 60 });
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
        if (e.a === this.me && e.v !== this.me) {
          this.hitAt = performance.now();
          this.hitKind = e.p === 0 ? "head" : "body";
          this.sound.play(e.p === 0 ? "head" : "hit", { volume: 0.5 });
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
        if (e.a === this.me && e.v !== this.me) {
          this.hitAt = performance.now();
          this.hitKind = "kill";
          this.sound.play("kill", { volume: 0.55 });
          this.say(`Tu as éliminé ${this.nameOf(e.v)}${e.h ? " d'une balle à la tête" : ""}`, "good");
        }
        if (e.v === this.me) this.killer = e.a >= 0 && e.a !== e.v ? { name: this.nameOf(e.a), weapon: e.w, head: e.h } : null;
        return;
      }
      case "throw": {
        const f = this.fighterAt(e.i);
        if (f && e.i !== this.me) this.sound.play("throw", { at: { x: f.x, y: f.y + 1.4, z: f.z } });
        return;
      }
      case "boom": {
        const at = this.tmp.set(e.x, e.y, e.z);
        this.scene.effects.explosion(at);
        this.sound.play("boom", { at });
        const d = at.distanceTo(this.scene.camera.position);
        if (d < 14) this.shake = Math.max(this.shake, 1.2 * (1 - d / 14));
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
        if (e.i === this.me) this.say(`${e.n} éliminations d'affilée !`, "good");
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
    const pa = readFighter(a.p, i);
    const pb = readFighter(b.p, i);
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
    this.tuneQuality(t, dt);
    const v = this.room.escarmouche;
    if (!v) return;
    const rt = this.renderTime(t);
    while (this.queue.length > 0 && this.queue[0]!.at <= rt) this.handle(this.queue.shift()!.e);
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
        yaw: wrapAngle(this.yaw + this.kickYaw),
        pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + this.kickPitch)),
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
    const fov = baseFov + (w.adsFov - baseFov) * this.adsAmount;
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
      if (s.ground && !this.wasGround) this.sound.play("land", { volume: 0.4 });
      this.wasGround = s.ground;
      const bobAmp = s.ground ? Math.min(1, speed / 5) * (s.sprint ? 0.022 : 0.012) : 0;
      const shakeX = (Math.random() - 0.5) * this.shake * 0.05;
      const shakeY = (Math.random() - 0.5) * this.shake * 0.05;
      this.scene.setView(
        s.x + this.err.x,
        eyeOf(s) + this.err.y + Math.sin(this.bob * 2) * bobAmp * 0.6,
        s.z + this.err.z,
        this.yaw + this.kickYaw + shakeX,
        this.pitch + this.kickPitch + shakeY,
        fov,
      );
      this.scene.updateViewmodel({
        weapon: w.id,
        camo: this.room.arsenal[this.room.you.seatId ?? ""]?.camo ?? "usine",
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
    for (let i = 0; i < v.fighters.length; i++) {
      if (i === this.me) continue;
      const f = this.fighterAt(i, rt);
      if (!f) continue;
      const alive = (f.bits & PF.alive) !== 0;
      const crouch = (f.bits & PF.crouch) !== 0;
      const pose = { x: f.x, y: f.y, z: f.z, crouch, alive };
      const inSight = alive && this.enemy(i) && (rayFighter(eyeX, eyeY, eyeZ, dir, pose, wallT)?.t ?? Infinity) < wallT;
      if (inSight) aimed = this.nameOf(i);
      const ally = teams && this.me >= 0 && this.teamOf(i) === this.teamOf(this.me);
      const flagTeam = f.carrying;
      // Au radar : ses alliés toujours, un ennemi quand il vient de tirer
      if (alive && (ally || nowMs - (this.lastShots.get(i) ?? -1e9) < 2500))
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
          alive,
          weapon: f.weapon,
          carrying: f.carrying,
          shield: (f.bits & PF.shield) !== 0,
        },
        dt,
        ally || inSight || this.me < 0,
        flagTeam >= 0 ? TEAM_HEX[flagTeam === 1 ? 1 : 0] : null,
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
        flags ? [0, 1].map((k) => ({ x: flags[k * 5 + 2]! / 100, z: flags[k * 5 + 4]! / 100, color: TEAM_HEX[k as 0 | 1] })) : [],
        v.mode === "zone" ? { ...this.gm.zone, color: zoneOwner >= 0 ? TEAM_HEX[zoneOwner === 1 ? 1 : 0] : "rgba(240,236,220,.8)" } : null,
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
      const w = WEAPONS[shot.weapon];
      const muzzle = this.scene.viewMuzzle(this.tmp2);
      shot.dirs.slice(0, 4).forEach((d) => {
        const hit = this.world.raycast(shot.ox, shot.oy, shot.oz, d[0], d[1], d[2], 150);
        const t = hit?.t ?? 150;
        const end = this.tmp.set(shot.ox + d[0] * t, shot.oy + d[1] * t, shot.oz + d[2] * t);
        this.scene.effects.tracer(muzzle, end, 1);
        if (hit) this.scene.effects.impact(end, hit.axis, hit.sign, surfaceOf(this.world.boxes[hit.box]?.m));
      });
      this.scene.viewFlash(shot.weapon);
      this.scene.effects.glow(muzzle, 8, 60);
      if (Math.random() < 0.35) this.scene.effects.muzzleSmoke(muzzle);
      if (shot.weapon === "pompe") setTimeout(() => this.scene.ejectShell("pompe"), 380);
      else this.scene.ejectShell(shot.weapon);
      this.sound.play(`shot-${shot.weapon}`, { gap: 20 });
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
    if ((cmd.b & B.fire) !== 0 && (s.prevB & B.fire) !== 0 && s.mag[s.slot] === 0 && s.res[s.slot] === 0 && s.reloadEnd === 0) {
      this.sound.play("empty", { volume: 0.5, gap: 250 });
    }
  }

  /** Moins de pixels quand l'appareil peine, plus quand il est à l'aise */
  private tuneQuality(t: number, dt: number) {
    void dt;
    this.frames++;
    if (t - this.fpsAt < 2000) return;
    this.fps = (this.frames * 1000) / (t - this.fpsAt);
    this.frames = 0;
    this.fpsAt = t;
    const scale = this.scene.pixelScale;
    if (this.fps < 40) {
      this.slowFor++;
      this.fastFor = 0;
      if (scale > 0.55) this.scene.setResolution(Math.max(0.55, scale - 0.15));
      else if (this.slowFor > 2) this.scene.setShadows(false);
    } else if (this.fps > 57) {
      this.fastFor++;
      this.slowFor = 0;
      if (this.fastFor >= 3 && scale < 1) this.scene.setResolution(Math.min(1, scale + 0.1));
    }
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
      damage: this.damage.filter((d) => now - d.at < 1500),
      hurtAt: this.hurtAt,
      flags: flagsRaw ? [0, 1].map((k) => ({ at: flagsRaw[k * 5]!, carrier: flagsRaw[k * 5 + 1]! })) : null,
      carrying: myFighter?.carrying ?? -1,
      zone: v.mode === "zone" ? { owner: tick?.z?.[0] ?? -1, contested: tick?.z?.[1] === 1, inside: inZone } : null,
      banner: now < this.bannerUntil ? this.banner : null,
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
    default:
      return "stone";
  }
}
