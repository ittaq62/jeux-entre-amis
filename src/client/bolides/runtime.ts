// Ce qui fait tourner une course dans le navigateur : le kart du joueur conduit chez lui, les autres karts reçus du
// serveur et lissés entre deux positions, les objets et les coups, les sons, la caméra, et de quoi remplir
// l'affichage tête haute. Une boucle par image, en dehors de React.

import { botDrive, botWantsItem, newBotMemory, type BotMemory } from "../../shared/games/bolides/bot.ts";
import {
  AIMANT_RADIUS,
  ARC_SPEED,
  BOMBE_AHEAD,
  BOMBE_BACK,
  BOMBE_RADIUS,
  BOX_RADIUS,
  COIN_RADIUS,
  COIN_SPEED,
  fuseeDist,
  GEANT_SPEED,
  KLAXON_RADIUS,
  OIL_AHEAD,
  OIL_RADIUS,
  tarteTarget,
  TURBO_TIME,
  type ItemKind,
} from "../../shared/games/bolides/items.ts";
import {
  assistSteer,
  CLASS_SPEED,
  KART_RADIUS,
  newKart,
  TOP_SPEED,
  type Kart,
  type KartEvent,
} from "../../shared/games/bolides/physics.ts";
import { COUNTDOWN_MS, INTRO_MS, type BolidesEvent, type HitKind } from "../../shared/games/bolides/race.ts";
import { VEHICLES } from "../../shared/games/bolides/garage.ts";
import { getTrack, locate, pointAt, solidGround, wrapAngle, wrapS, type Track } from "../../shared/games/bolides/track.ts";
import { decodeKart, encodeKart, type BolidesView, type KartNet } from "../../shared/games/bolides/view.ts";
import type { BolidesClientMessage } from "../../shared/protocol.ts";
import { BOLIDES_SOUNDS, play, soundsLoaded, vibrate, type SoundName } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { Controls } from "./controls.ts";
import { LocalDriver } from "./driver.ts";
import { EngineSound, honk } from "./engineSound.ts";
import { RaceMusic } from "./music.ts";
import type { Aim } from "./scene/aim.ts";
import type { KartLook } from "./scene/kart.ts";
import { RaceScene } from "./scene/RaceScene.ts";

/** Le temps que tourne la roue des objets */
const ROLL_MS = 850;
/** Ce que la course joue en continu : à charger avant les feux, comme les autres sons */
const RACE_AUDIO = ["bolides-music.mp3", "bolides-engine.wav", "bolides-skid.wav"];
/** Un réseau très lent ne retient pas la course à cause des sons : ils arriveront pendant le survol */
const SOUNDS_LIMIT_MS = 6000;

/** Ce que l'affichage tête haute montre, rafraîchi une dizaine de fois par seconde */
export interface Hud {
  /** 3, 2, 1, 0 (« Partez ! ») pendant le départ, null sinon ; le survol du circuit avant */
  countdown: number | null;
  intro: boolean;
  lap: number;
  laps: number;
  place: number;
  total: number;
  item: ItemKind | null;
  uses: number;
  /** L'objet en réserve */
  item2: ItemKind | null;
  uses2: number;
  /** La roue des objets tourne encore (on vient de prendre une caisse), et dans quelle case */
  rolling: boolean;
  rollSlot: 1 | 2;
  /** Ce qu'on affiche en recevant l'objet (`long` : avec l'explication) */
  tip: { key: number; item: ItemKind; long: boolean } | null;
  /** Augmente quand on appuie alors qu'il n'y a rien à utiliser (la case tremble) */
  nudge: number;
  /** L'aspiration en cours */
  drafting: boolean;
  /** Le classement en direct */
  order: { id: string; name: string; color: string; me: boolean }[];
  /** Ce qui arrive sur soi */
  incoming: "fusee" | "tarte" | null;
  raceMs: number;
  finished: { place: number; ms: number } | null;
  wrongWay: boolean;
  /** De la crème sur l'écran */
  pie: boolean;
  /** Le fil de la course : ce qui vient de se passer, en quelques mots */
  feed: { key: number; text: string; mine: boolean }[];
  /** Un flash blanc à l'écran (la foudre) : change de numéro à chaque éclair */
  flash: number;
  stuck: boolean;
  speed: number;
  /** Ses pièces (dix au plus) */
  coins: number;
  /** Un turbo en cours (les lignes de vitesse) */
  boosting: boolean;
  /** Une annonce en grand au milieu de l'écran (« Dernier tour ! »), et sa clé pour la rejouer */
  banner: { text: string; key: number } | null;
  /** Les karts sur la petite carte : x, z, couleur, le sien */
  map: { x: number; z: number; color: string; me: boolean }[];
}

export interface RuntimeOptions {
  phone: boolean;
  reduced: boolean;
  /** Son id de pilote (null : on regarde la course) */
  me: string | null;
  send: (msg: BolidesClientMessage) => void;
  onHud: (hud: Hud) => void;
}

interface Tick {
  now: number;
  karts: (Kart | null)[];
  /** L'heure (du serveur) de chaque position */
  at: number[];
}

/** Le délai avec lequel on montre les autres karts : de quoi avoir toujours deux positions encadrantes */
const INTERP_MS = 120;
/** Ce dont on les avance ensuite, à leur vitesse, pour les montrer à peu près où ils sont vraiment */
const LEAD_S = 0.14;
const SEND_MS = 50;

export class RaceRuntime {
  private scene: RaceScene;
  readonly controls: Controls;
  private engine = new EngineSound();
  private music = new RaceMusic();
  private track: Track;
  private view: BolidesView;
  private serverOffset = 0;
  /** Le décalage d'horloge estimé d'après les positions reçues ; serverOffset le rejoint en douceur */
  private offsetTarget = 0;
  /** Les autres karts tels qu'on les montre (réutilisés d'une image à l'autre) */
  private views: Kart[] = [];
  /** La part de l'avance montrée pour chaque kart (elle s'efface en douceur pendant un tête-à-queue) */
  private leads: number[] = [];
  /** Les pièces : celles de chacun (selon le serveur), celles qui sont ramassées, et celles qu'on vient de prendre */
  private coinCounts: number[] = [];
  private coinTaken = new Set<number>();
  private coinMine = new Map<number, number>();
  private ids: string[];
  private colors: string[];
  private mine: number;
  private driver: LocalDriver | null = null;
  private ticks: Tick[] = [];
  private shown: Kart[];
  private steers: number[];
  private frame = 0;
  private last = performance.now();
  private sentAt = 0;
  private hudAt = 0;
  private beep: number | null = null;
  /** Le bip d'alerte d'une fusée qui arrive : la prochaine fois qu'il sonne */
  private rocketBeepAt = 0;
  /** Le fil de la course, le nom de chacun, le premier actuel (pour annoncer qui prend la tête) */
  private feed: { key: number; text: string; mine: boolean; until: number }[] = [];
  private feedSeq = 0;
  private names: string[] = [];
  private leaderNow: number | null = null;
  private flash = 0;
  private rollingUntil = 0;
  private rollSlot: 1 | 2 = 1;
  private rollTickAt = 0;
  private wasRolling = false;
  /** Pas deux objets d'affilée : le serveur n'a pas encore répondu */
  private useReadyAt = 0;
  private lastItem: ItemKind | null = null;
  private tip: Hud["tip"] = null;
  private tipUntil = 0;
  private tipSeq = 0;
  private nudge = 0;
  private flipNow = false;
  private toldGlide = false;
  private wantRescue = false;
  private banner: Hud["banner"] = null;
  private bannerSeq = 0;
  private autoRng = { rng: 77 };
  private autopilot: BotMemory = newBotMemory(this.autoRng);
  private launched = false;
  /** Ce que son kart a fait depuis le départ, envoyé au serveur avec sa position */
  private turbos = 0;
  private walls = 0;
  private disposed = false;
  /** Le moteur tourne (pas avant que la course démarre) */
  private engineOn = false;
  /** La cérémonie : chaque kart à sa place sur le podium, et sa place au classement (null : pas encore de cérémonie) */
  private podium: { kart: Kart; place: number }[] | null = null;

  constructor(
    container: HTMLElement,
    view: BolidesView,
    private looks: KartLook[],
    serverOffset: number,
    private opts: RuntimeOptions,
  ) {
    this.view = view;
    this.serverOffset = serverOffset;
    this.offsetTarget = serverOffset;
    this.track = getTrack(view.track);
    this.ids = view.racers.map((r) => r.id);
    this.colors = looks.map((l) => l.color);
    this.names = looks.map((l) => l.name);
    this.mine = opts.me ? this.ids.indexOf(opts.me) : -1;
    this.scene = new RaceScene(container, { phone: opts.phone, reduced: opts.reduced });
    this.scene.onLife = (sound, volume) =>
      play(sound === "clang" ? "bolidesClang" : sound === "baa" ? "bolidesBaa" : sound === "dive" ? "bolidesDive" : "bolidesFirework", {
        volume,
      });
    this.shown = view.karts.map((n) => decodeKart(n)!);
    this.views = this.shown.map((k) => ({ ...k }));
    this.steers = this.shown.map(() => 0);
    this.controls = new Controls(() => this.mine >= 0);
    this.controls.autoGas = opts.phone;
  }

  /** Tout préparer sans geler l'écran de chargement (le circuit, les karts, les sons), puis lancer la boucle. `progress` : de 0 à 1 */
  async prepare(progress: (share: number) => void) {
    let built = 0;
    let heard = false;
    const report = () => progress(built * 0.92 + (heard ? 0.08 : 0));
    const sounds = Promise.race([
      soundsLoaded(BOLIDES_SOUNDS, RACE_AUDIO),
      new Promise((resolve) => setTimeout(resolve, SOUNDS_LIMIT_MS)),
    ]).then(() => {
      heard = true;
      report();
    });
    await this.scene.build(this.track, this.looks, (share) => {
      built = share;
      report();
    });
    await sounds;
    if (this.disposed) return;
    this.takeView(this.view, this.serverOffset);
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }

  private get serverNow() {
    return Date.now() + this.serverOffset;
  }

  /** La table à jour (à chaque évènement) */
  setView(view: BolidesView, serverOffset: number) {
    if (view.track !== this.view.track) return;
    this.takeView(view, serverOffset);
  }

  private takeView(view: BolidesView, serverOffset: number) {
    this.view = view;
    // L'heure du serveur s'estime mieux avec les positions, reçues bien plus souvent
    if (this.ticks.length === 0) this.serverOffset = this.offsetTarget = serverOffset;
    const now = this.serverNow;
    this.scene.setCrates(view.boxes.map((at) => at <= now));
    this.scene.setHazards(view.hazards);
    const me = this.mine >= 0 ? view.racers[this.mine] : undefined;
    // Son kart revient entre ses mains (au départ, ou de retour après une coupure) : on repart de la dernière position connue
    if (me && !me.bot && !this.driver) {
      const k = decodeKart(view.karts[this.mine]!);
      if (k) {
        const at = locate(this.track, k.x, k.z);
        const stats = VEHICLES[me.vehicle ?? "kart"].stats;
        this.driver = new LocalDriver(
          this.track,
          { ...k, i: at.i, s: at.s, d: at.d, y: at.y },
          CLASS_SPEED[view.settings.speed] * stats.top,
          stats,
        );
      }
    } else if (me?.bot && this.driver) this.driver = null;
  }

  /** Les positions de tous les karts, reçues du serveur */
  onTick(now: number, karts: KartNet[], ages?: number[], coins?: { counts?: number[]; taken?: number[] }) {
    if (coins?.counts) this.coinCounts = coins.counts;
    if (coins?.taken) this.coinTaken = new Set(coins.taken);
    // Le décalage d'horloge : le plus grand vu récemment (un message en retard le ferait croire plus petit). L'heure
    // utilisée le rejoint petit à petit, à chaque image : jamais de saut, donc des karts qui glissent sans à-coups.
    const est = now - Date.now();
    if (this.ticks.length === 0) this.serverOffset = this.offsetTarget = est;
    else this.offsetTarget = Math.max(est, this.offsetTarget - 2);
    this.ticks.push({ now, karts: karts.map((n) => decodeKart(n)), at: karts.map((_, i) => now - (ages?.[i] ?? 0)) });
    if (this.ticks.length > 30) this.ticks.shift();
  }

  /** Ce qui vient d'arriver dans la course */
  onEvents(events: BolidesEvent[]) {
    const meId = this.opts.me;
    for (const e of events) {
      switch (e.type) {
        case "go":
          play("brickGo");
          break;
        case "box":
          if (e.id === meId && e.item) {
            this.rollingUntil = performance.now() + ROLL_MS;
            this.rollSlot = e.slot === 2 ? 2 : 1;
            play("bolidesBox");
          }
          break;
        case "noTarget":
          if (e.id === meId) {
            this.tell(e.item === "tarte" ? "Personne à portée de ta tarte" : "Personne à viser", true);
            this.nudge++;
          }
          break;
        case "use": {
          const at = this.kartOf(e.id);
          if (e.item === "klaxon") {
            honk();
            if (at) this.scene.ring(at.x, at.y, at.z);
          } else if (e.item === "petard" || e.item === "fusee") this.near(e.id, "torpedo", e.item === "fusee" ? 1 : 0.8);
          else if (e.item === "arc") this.near(e.id, "tourFanfare", 0.6);
          else if (e.item === "geant") {
            this.near(e.id, "bolidesGrow", 1);
            this.tell(e.id === meId ? "Tu deviens énorme !" : `${this.nameOf(e.id)} devient énorme !`, e.id === meId);
          } else if (e.item === "aimant") this.near(e.id, "bolidesMagnet", 0.8);
          else if (e.item === "bowling" || e.item === "tarte" || e.item === "bombe") this.near(e.id, "bolidesThrow", 0.9);
          else if (e.item === "orage") {
            play("bolidesThunder");
            this.tell(e.id === meId ? "Tu déchaînes l'orage !" : `${this.nameOf(e.id)} déchaîne l'orage !`, e.id === meId);
          } else if (e.item === "ressort" && e.id !== meId) this.near(e.id, "bolidesJump", 0.6);
          else if (e.item === "huile") this.near(e.id, "splash", 0.6);
          else if (e.item === "bouclier") this.near(e.id, "pop", 0.8);
          else if (e.id !== meId) this.near(e.id, "wild", 0.5);
          break;
        }
        case "gone":
          if (e.why === "hit" || e.why === "klaxon") {
            const hz = this.view.hazards.find((h) => h.id === e.hazard);
            if (hz?.kind === "petard") {
              this.near(null, "mecheBoom", 0.7);
            }
          }
          break;
        case "pie": {
          if (e.id === meId) {
            if (this.driver) this.driver.kart.v *= 0.7;
            play("bolidesSplat");
            vibrate(40);
          } else this.near(e.id, "bolidesSplat", 0.6);
          this.tell(
            e.by === meId
              ? `Tarte en pleine figure pour ${this.nameOf(e.id)} !`
              : e.id === meId
                ? `${this.nameOf(e.by)} t'a entarté !`
                : `${this.nameOf(e.by)} entarte ${this.nameOf(e.id)}`,
            e.id === meId || e.by === meId,
          );
          break;
        }
        case "blast": {
          const y = locate(this.track, e.x, e.z).y;
          this.scene.explosion(e.x, y, e.z, BOMBE_RADIUS);
          this.nearAt(e.x, e.z, "mecheBoom", 1);
          break;
        }
        case "bolt": {
          const at = this.kartOf(e.id);
          if (at) this.scene.bolt(at.x, at.y + at.air, at.z);
          if (e.id === meId) this.flash++;
          break;
        }
        case "hit": {
          this.tellHit(e.id, e.by, e.kind);
          const at = this.kartOf(e.id);
          if (at) this.scene.boom(at.x, at.y, at.z, e.kind === "petard" || e.kind === "fusee");
          if (e.kind === "bowling") this.near(e.id, "bolidesStrike", 1);
          if (e.id === meId) {
            this.driver?.hit();
            this.scene.shake(0.7);
            play("bigHit", { volume: 0.8 });
            vibrate([60, 40, 120]);
          } else this.near(e.id, "hit", 0.6);
          break;
        }
        case "shield": {
          const at = this.kartOf(e.id);
          if (at) this.scene.burst({ x: at.x, y: at.y + 1, z: at.z }, 0x7fe3ff, 14);
          this.near(e.id, "pop", 1);
          break;
        }
        case "lap":
          if (e.id === meId) {
            const left = this.view.settings.laps - e.lap;
            if (left === 1) this.announce("Dernier tour !");
            play(left === 1 ? "tourChip" : "capTurn");
          }
          break;
        case "finish": {
          const at = this.kartOf(e.id);
          if (at) this.scene.confetti(at.x, at.y, at.z);
          if (e.id === meId) {
            this.announce(e.place === 1 ? "Victoire !" : `Arrivé ${placeLabel(e.place)} !`);
            play(e.place === 1 ? "tourTrophyMine" : "tourApplause");
          }
          break;
        }
      }
    }
  }

  private nameOf(id: string | null): string {
    const i = id ? this.ids.indexOf(id) : -1;
    return i >= 0 ? this.names[i]! : "Quelqu'un";
  }

  /** Une ligne de plus dans le fil de la course */
  private tell(text: string, mine: boolean) {
    this.feed.push({ key: ++this.feedSeq, text, mine, until: performance.now() + 4200 });
    if (this.feed.length > 4) this.feed.shift();
  }

  private tellHit(id: string, by: string | null, kind: HitKind) {
    const meId = this.opts.me;
    const how: Record<HitKind, string> = {
      huile: "dans sa flaque",
      petard: "au pétard",
      klaxon: "au klaxon",
      fusee: "à la fusée",
      arc: "à l'arc-en-ciel",
      bowling: "au bowling",
      geant: "en l'écrasant",
      orage: "à la foudre",
      bombe: "à la bombe",
    };
    if (!by || by === id)
      this.tell(id === meId ? "Tu glisses sur ta propre flaque !" : `${this.nameOf(id)} se piège tout seul`, id === meId);
    else if (id === meId) this.tell(`${this.nameOf(by)} t'a eu ${how[kind]}`, true);
    else if (by === meId) this.tell(`Tu as eu ${this.nameOf(id)} ${how[kind]}`, true);
    else this.tell(`${this.nameOf(by)} a eu ${this.nameOf(id)} ${how[kind]}`, false);
  }

  private announce(text: string) {
    this.banner = { text, key: ++this.bannerSeq };
  }

  /** Un son, plus faible si ça se passe loin de soi */
  private near(id: string | null, name: SoundName, volume: number) {
    const me = this.myKart();
    const at = id ? this.kartOf(id) : null;
    const d = me && at ? Math.hypot(me.x - at.x, me.z - at.z) : 0;
    const v = volume * Math.max(0.15, 1 - d / 90);
    play(name, { volume: v });
  }

  /** Un son qui vient d'un endroit précis : plus faible s'il est loin */
  private nearAt(x: number, z: number, name: SoundName, volume: number) {
    const me = this.myKart();
    const d = me ? Math.hypot(me.x - x, me.z - z) : 0;
    play(name, { volume: volume * Math.max(0.2, 1 - d / 110) });
  }

  private kartOf(id: string): Kart | null {
    const i = this.ids.indexOf(id);
    return i >= 0 ? (this.shown[i] ?? null) : null;
  }

  private myKart(): Kart | null {
    return this.driver?.kart ?? (this.mine >= 0 ? (this.shown[this.mine] ?? null) : null);
  }

  /**
   * Les autres karts à l'instant montré : entre les deux positions reçues qui l'encadrent. Chaque position a sa
   * propre heure (un bot est simulé jusqu'à un instant, un joueur a envoyé la sienne un peu avant le tic) : on s'en
   * sert, sinon ils avanceraient par saccades.
   */
  private interpolate(renderAt: number) {
    const ticks = this.ticks;
    if (ticks.length === 0) return;
    this.ids.forEach((_, i) => {
      if (i === this.mine && this.driver) return;
      // La dernière position d'avant l'instant montré, et la suivante (une position répétée par deux tics ne compte qu'une fois)
      let ia = -1;
      for (let j = ticks.length - 1; j >= 0; j--) {
        if (ticks[j]!.at[i]! <= renderAt && ticks[j]!.karts[i]) {
          ia = j;
          break;
        }
      }
      if (ia < 0) ia = 0;
      const a = ticks[ia]!;
      let b = a;
      for (let j = ia + 1; j < ticks.length; j++) {
        if (ticks[j]!.at[i]! > a.at[i]! && ticks[j]!.karts[i]) {
          b = ticks[j]!;
          break;
        }
      }
      // Pas de position plus récente : on part de l'avant-dernière, et on prolonge un peu
      let from = a;
      if (b === a) {
        for (let j = ia - 1; j >= 0; j--) {
          if (ticks[j]!.at[i]! < a.at[i]! && ticks[j]!.karts[i]) {
            from = ticks[j]!;
            break;
          }
        }
        b = a;
      }
      const ka = from.karts[i];
      const kb = b.karts[i];
      if (!ka || !kb) return;
      const span = Math.max(1, b.at[i]! - from.at[i]!);
      const f = from === b ? 1 : Math.max(0, Math.min(1.6, (renderAt - from.at[i]!) / span));
      const prev = this.shown[i]!;
      const prevH = prev.h;
      const h = ka.h + wrapAngle(kb.h - ka.h) * f;
      const v = ka.v + (kb.v - ka.v) * f;
      const slip = ka.slip + (kb.slip - ka.slip) * f;
      // On les montre là où ils sont sans doute maintenant : la position lissée, avancée de ce retard à leur vitesse
      // (sans cela, deux karts côte à côte se voient chacun un peu devant l'autre)
      const want = kb.spin > 0 ? 0 : 1;
      const share = (this.leads[i] ?? 1) + (want - (this.leads[i] ?? 1)) * 0.12;
      this.leads[i] = share;
      const lead = LEAD_S * share;
      const next = Object.assign(this.views[i]!, kb);
      next.x = ka.x + (kb.x - ka.x) * f + (Math.sin(h) * v - Math.cos(h) * slip) * lead;
      next.z = ka.z + (kb.z - ka.z) * f + (Math.cos(h) * v + Math.sin(h) * slip) * lead;
      next.y = ka.y + (kb.y - ka.y) * f;
      // Une hauteur négative : il tombe dans un trou
      const air = ka.air + (kb.air - ka.air) * f;
      next.air = kb.air < -0.05 ? air : Math.max(0, air);
      next.h = h;
      next.v = v;
      next.slip = slip;
      next.dist = ka.dist + (kb.dist - ka.dist) * f + v * lead;
      // Le volant des autres : deviné d'après leur façon de tourner
      const turn = wrapAngle(h - prevH);
      this.steers[i] = this.steers[i]! + (Math.max(-1, Math.min(1, -turn * 18)) - this.steers[i]!) * 0.3;
      this.shown[i] = next;
    });
  }

  private loop = (t: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    // L'heure du serveur avance avec l'image, et rattrape l'estimation sans à-coup (2 ms par image au plus)
    const gap = this.offsetTarget - this.serverOffset;
    this.serverOffset += Math.abs(gap) > 400 ? gap : Math.max(-2, Math.min(2, gap * 0.1));
    // L'heure de cette image (et non celle où ce code tourne, parfois en retard) : les karts avancent avec l'image
    const now = performance.timeOrigin + t + this.serverOffset;
    const v = this.view;
    // Tout le monde n'a pas fini de charger : rien ne bouge encore, l'écran de chargement couvre la scène
    if (v.phase === "loading") return;
    if (!this.engineOn) {
      this.engineOn = true;
      this.engine.start();
    }
    this.interpolate(now - INTERP_MS);
    const pad = this.controls.read(dt);
    const me = this.mine >= 0 ? v.racers[this.mine] : undefined;
    const d = this.driver;
    let events: KartEvent[] = [];
    if (d && me && v.phase !== "over") {
      if (now < v.goAt) {
        // Sur téléphone le kart accélère tout seul : le bouton de dérapage sert au départ canon
        d.waiting(this.opts.phone ? pad.drift : pad.gas, now, v.goAt);
      } else {
        if (!this.launched) {
          this.launched = true;
          if (d.launch(v.goAt)) {
            play("bolidesTurbo", { volume: 0.9 });
            this.scene.turboBurst(d.kart, 2);
            this.scene.punch(8);
            this.tell("Départ canon !", true);
          }
        }
        // Arrivé : le kart roule tout seul, le temps que les autres finissent (en développement, les tests peuvent aussi le lâcher)
        const auto = import.meta.env.DEV && Boolean((window as unknown as { __bolidesAuto?: boolean }).__bolidesAuto);
        const pilot =
          me.finish !== null || auto
            ? botDrive(
                this.track,
                d.kart,
                me.item,
                [],
                v.hazards,
                auto ? "fort" : "moyen",
                this.autopilot,
                now,
                this.autoRng,
                this.track.coins.map((_, i) => (this.coinTaken.has(i) ? now + 1000 : 0)),
              )
            : null;
        const prefs = usePrefs.getState();
        const steer = !pilot && prefs.bolidesAssist ? assistSteer(this.track, d.kart, pad.steer) : pad.steer;
        const input = pilot ? pilot.input : { ...pad, steer };
        if (auto && pilot?.use) pad.item = true;
        const clock = performance.now();
        const rollingMain = clock < this.rollingUntil && this.rollSlot === 1;
        // Les objets automatiques : ils partent au bon moment, comme pour un bot
        let flip = pad.flip;
        if (prefs.bolidesAutoItem && !auto && !rollingMain && me.finish === null && me.item) {
          const rivals = v.racers.flatMap((r, i) => (i === this.mine ? [] : [{ id: r.id, kart: this.shown[i]! }]));
          const wish = botWantsItem(this.track, d.kart, me.item, rivals, v.hazards, "fort", this.autopilot, now, this.autoRng);
          if (wish.use) {
            pad.item = true;
            flip = wish.flip;
          }
        }
        this.flipNow = flip;
        const others = this.shown.filter((_, i) => i !== this.mine);
        // Les pièces donnent un peu de vitesse de pointe (selon le compte du serveur), l'arc-en-ciel beaucoup
        const star = (me.starUntil ?? 0) > now;
        const giant = (me.giantUntil ?? 0) > now;
        d.top =
          CLASS_SPEED[v.settings.speed] *
          (1 + COIN_SPEED * (this.coinCounts[this.mine] ?? me.coins ?? 0)) *
          (star ? ARC_SPEED : 1) *
          (giant ? GEANT_SPEED : 1) *
          VEHICLES[me.vehicle ?? "kart"].stats.top;
        const weights = v.racers
          .filter((_, i) => i !== this.mine)
          .map((r) => VEHICLES[r.vehicle ?? "kart"].stats.weight * ((r.giantUntil ?? 0) > now ? 4 : 1));
        events = d.update(dt, input, others, now / 1000, star, weights, giant ? 4 : 1);
        // Un appui pendant que la roue tourne l'arrête (on ne lance jamais un objet qu'on n'a pas vu)
        if (pad.item && rollingMain) {
          this.rollingUntil = clock;
          pad.item = false;
        }
        if (pad.item && (!me.item || d.kart.spin > 0) && me.finish === null) {
          this.nudge++;
          if (!me.item) play("click", { volume: 0.3 });
        }
        if (pad.item && me.item && me.finish === null && d.kart.spin === 0 && clock >= this.useReadyAt) {
          this.useReadyAt = clock + 220;
          if (me.item === "turbo" || me.item === "turbo3") {
            d.boost(TURBO_TIME);
            play("bolidesTurbo", { volume: 1, rate: 0.95 });
            this.scene.punch(8);
          } else if (me.item === "ressort") {
            d.spring();
            play("bolidesJump", { rate: 0.85 });
          }
          this.opts.send({ t: "use", flip });
        }
        // Bloqué : le drone vient tout seul, ou tout de suite si on le demande
        if (me.finish === null && (d.rescueDue || ((pad.respawn || this.wantRescue) && d.stuck))) d.rescue(events);
        this.wantRescue = false;
        // Les pièces traversées disparaissent tout de suite (le serveur, lui, les compte)
        if (me.finish === null && d.kart.air < 1.2) {
          this.track.coins.forEach((c, i) => {
            if (this.coinTaken.has(i) || (this.coinMine.get(i) ?? -1e9) > now - 1500) return;
            const reach = (me.magnetUntil ?? 0) > now ? AIMANT_RADIUS : COIN_RADIUS + KART_RADIUS * 0.6;
            if (Math.hypot(c.x - d.kart.x, c.z - d.kart.z) < reach) {
              this.coinMine.set(i, now);
              this.scene.coinSparkle(c.x, d.kart.y + 1, c.z);
              play("bolidesCoin", { rate: 0.95 + Math.min(10, this.coinCounts[this.mine] ?? 0) * 0.03 });
            }
          });
        }
        // Les caisses traversées éclatent tout de suite, sans attendre le serveur
        if (v.settings.items) {
          this.track.boxes.forEach((b, i) => {
            if (v.boxes[i]! <= now && Math.hypot(b.x - d.kart.x, b.z - d.kart.z) < BOX_RADIUS + KART_RADIUS * 0.6) this.scene.takeCrate(i);
          });
        }
      }
      this.shown[this.mine] = d.view();
      this.steers[this.mine] = pad.steer;
      if (t - this.sentAt >= SEND_MS) {
        this.sentAt = t;
        this.opts.send({ t: "kart", k: encodeKart(d.kart), n: [this.turbos, this.walls], at: Math.round(now) });
      }
    }
    // Les pièces montrées : ni ramassées selon le serveur, ni prises à l'instant par soi
    this.scene.setCoins((i) => !this.coinTaken.has(i) && (this.coinMine.get(i) ?? -1e9) <= now - 1500);
    // Les sons et les effets de la conduite, et ce qu'on compte pour les succès
    const mine = this.driver?.kart;
    for (const e of events) {
      if (mine) {
        if (e === "turbo1" || e === "turbo2" || e === "turbo3") {
          const level = e === "turbo3" ? 3 : e === "turbo2" ? 2 : 1;
          this.scene.turboBurst(mine, level);
          this.scene.punch(3 + level * 2);
        } else if (e === "pad") this.scene.punch(5);
        else if (e === "wall") {
          this.scene.wallSparks(mine);
          this.scene.shake(0.3);
        } else if (e === "land") {
          this.scene.landDust(mine);
          this.scene.shake(0.25);
        } else if (e === "trick") this.scene.trickSparkle(mine);
        else if (e === "bump") {
          this.scene.shake(0.2);
          play("bolidesBump");
        } else if (e === "fall") {
          this.scene.shake(0.3);
          this.tell("Plouf ! Il fallait prendre le tremplin", true);
          vibrate([30, 60, 30]);
        } else if (e === "rescue") {
          this.tell("Le drone te remet sur la piste", true);
          vibrate(30);
        } else if (e === "respawn") {
          this.scene.respawnSparkle(mine);
        } else if (e === "bound") {
          this.scene.landDust(mine);
          this.scene.punch(2);
          play("bolidesJump", { volume: 0.7, rate: 1.2 });
        } else if (e === "glide") {
          this.scene.punch(8);
          if (!this.toldGlide) {
            this.toldGlide = true;
            this.tell("Tourne pour viser les anneaux, freine pour plonger", true);
          }
        } else if (e === "hoop") {
          this.scene.punch(5);
          this.scene.trickSparkle(mine);
          vibrate(20);
        } else if (e === "draft") {
          this.scene.punch(5);
          this.tell("Aspiration !", true);
          play("bolidesTurbo", { volume: 0.7, rate: 1.25 });
        } else if (e === "spring") {
          this.scene.punch(4);
          this.scene.shake(0.2);
          vibrate(25);
        } else if (e === "crash") {
          this.scene.shake(0.7);
          play("bigHit", { volume: 0.7 });
          vibrate([50, 30, 80]);
        } else if (e === "spark1" || e === "spark2" || e === "spark3") {
          const level = e === "spark3" ? 3 : e === "spark2" ? 2 : 1;
          this.scene.sparkFlash(mine, level);
          play("bolidesCharge", { volume: 0.6 + level * 0.15, rate: level === 3 ? 1.5 : level === 2 ? 1.25 : 1 });
        }
      }
      if (e === "turbo1" || e === "turbo2" || e === "turbo3") this.turbos += 1;
      else if (e === "wall") this.walls += 1;
      if (e === "wall") play("capDiceHit", { volume: 0.7 });
      else if (e === "pad") play("bolidesTurbo", { volume: 0.8, rate: 1.2 });
      else if (e === "turbo1" || e === "turbo2" || e === "turbo3")
        play("bolidesTurbo", {
          volume: e === "turbo3" ? 1 : e === "turbo2" ? 0.85 : 0.7,
          rate: e === "turbo3" ? 1.15 : e === "turbo2" ? 1.07 : 1,
        });
      else if (e === "drift") play("click", { volume: 0.4 });
      else if (e === "jump") play("bolidesJump");
      else if (e === "fall") play("bolidesFall");
      else if (e === "rescue") play("bolidesRescue");
      else if (e === "glide") play("bolidesGlide");
      else if (e === "hoop") play("bolidesHoop");
      else if (e === "spring") play("bolidesSpring");
      else if (e === "land") play("bolidesLand");
      else if (e === "trick") play("bolidesTrick");
    }
    // La roue des objets : un tic à chaque image qui passe, et un petit bruit quand elle s'arrête
    const clockNow = performance.now();
    const rolling = clockNow < this.rollingUntil;
    if (rolling && clockNow >= this.rollTickAt) {
      this.rollTickAt = clockNow + 90;
      play("tick", { volume: 0.28, rate: 1.5 });
    }
    if (this.wasRolling && !rolling) play("pop", { volume: 0.6 });
    this.wasRolling = rolling;
    // Une fusée vient sur soi : un bip, de plus en plus pressant à mesure qu'elle approche
    if (me && me.finish === null) {
      const mine = this.shown[this.mine];
      let gap = Infinity;
      for (const h of v.hazards) if (h.kind === "fusee" && h.target === me.id && mine) gap = Math.min(gap, mine.dist - fuseeDist(h, now));
      if (gap < Infinity && now >= this.rocketBeepAt) {
        play("tick", { volume: 1, rate: 1.6 });
        this.rocketBeepAt = now + Math.max(110, Math.min(600, gap * 2.2));
      }
    }
    // Le bip du compte à rebours
    const left = v.goAt - now;
    // La musique : dès les feux, plus vite au dernier tour, plus discrète une fois arrivé
    if (left <= COUNTDOWN_MS && v.phase !== "over") this.music.start();
    const myLap =
      this.mine >= 0 && this.shown[this.mine] ? Math.floor(Math.max(0, this.shown[this.mine]!.dist) / this.track.length) + 1 : 1;
    this.music.setFast(me?.finish == null && myLap >= v.settings.laps && v.settings.laps > 1 && now > v.goAt);
    this.music.setQuiet(me?.finish != null || v.phase === "over");
    this.music.update();
    if (v.phase === "start" && left <= COUNTDOWN_MS && left > 0) {
      const n = Math.ceil(left / 1000);
      if (n !== this.beep) {
        this.beep = n;
        play("brickCount");
      }
    }
    const mk = this.myKart();
    if (this.podium) this.engine.update(0, false, false, false);
    else if (mk) {
      this.engine.update(mk.v / TOP_SPEED, pad.gas || mk.boost > 0, mk.drift !== 0, mk.boost > 0);
      if (mk.offroad && mk.v > 6) this.scene.dust(mk);
    }
    for (let i = 0; i < this.shown.length; i++) {
      const k = this.shown[i]!;
      if (i !== this.mine && k.offroad && k.v > 6) this.scene.dust(k);
    }
    // La caméra : le survol avant le compte à rebours, puis derrière son kart (ou celui de tête, si on regarde)
    const intro = v.phase === "start" && left > COUNTDOWN_MS;
    const follow = this.mine >= 0 ? this.mine : this.leader();
    const finishedLong = me?.finish != null && now - v.goAt - me.finish > 4000;
    const podium = this.podium;
    this.scene.render({
      karts: podium
        ? // Sur le podium, seuls les trois premiers font la fête
          podium.map(({ kart, place }) => ({ kart, steer: 0, shield: false, done: place < 3 }))
        : this.shown.map((kart, i) => ({
            kart,
            steer: this.steers[i]!,
            shield: v.racers[i]!.shieldUntil > now,
            done: v.racers[i]!.finish !== null,
            star: (v.racers[i]!.starUntil ?? 0) > now,
            giant: (v.racers[i]!.giantUntil ?? 0) > now,
            magnet: (v.racers[i]!.magnetUntil ?? 0) > now,
            safe: (v.racers[i]!.safeUntil ?? 0) > now,
            under: this.track.water !== null && kart.y + kart.air < this.track.water - 0.3,
          })),
      follow,
      camera: podium ? "podium" : intro ? "intro" : v.phase === "over" || finishedLong ? "orbit" : "chase",
      introT: (now - (v.goAt - COUNTDOWN_MS - INTRO_MS)) / INTRO_MS,
      // Les feux : un rouge de plus chaque seconde du compte à rebours, puis verts deux secondes
      lights: left > COUNTDOWN_MS ? 0 : left > 0 ? Math.min(3, 4 - Math.ceil(left / 1000)) : now - v.goAt < 2000 ? 4 : 0,
      serverNow: now,
      dt,
      fireworks:
        podium !== null ||
        (v.phase !== "start" && now > v.goAt && (me?.finish != null || (myLap >= v.settings.laps && v.settings.laps > 1))),
      aim: this.aimNow(rolling),
      draft: Math.max(0, this.driver?.kart.draft ?? 0),
      lookBack: pad.look && !intro && this.mine >= 0,
    });
    if (t - this.hudAt > 100) {
      this.hudAt = t;
      this.opts.onHud(this.hud(now, intro));
    }
  };

  /** La cérémonie : `order`, les pilotes du premier au dernier */
  startPodium(order: string[]) {
    if (this.podium || this.disposed) return;
    const spots = this.scene.startPodium(order.length);
    this.podium = this.view.racers.map((r, i) => {
      const place = order.indexOf(r.id);
      const spot = spots[place];
      if (!spot) return { kart: this.shown[i]!, place: 99 };
      const kart = newKart(this.track, spot.x, spot.z, spot.h);
      kart.y = spot.y;
      return { kart, place };
    });
    play("tourFanfare");
    play("tourApplause", { volume: 0.55 });
  }

  /** Où partira l'objet qu'on tient : ce que la scène montre sur la route */
  private aimNow(rolling: boolean): Aim | null {
    const me = this.mine >= 0 ? this.view.racers[this.mine] : undefined;
    const k = this.driver?.kart;
    if (!me || !k || !me.item || me.finish !== null || (rolling && this.rollSlot === 1) || this.view.phase !== "racing") return null;
    const t = this.track;
    const flip = this.flipNow;
    const lane = Math.max(-t.half + 1.5, Math.min(t.half - 1.5, k.d));
    const ring = (s: number, d: number, r: number): Aim => {
      const p = pointAt(t, s, d);
      return { kind: "ring", x: p.x, y: p.y, z: p.z, r };
    };
    const onKart = (i: number): Aim | null => {
      const o = this.shown[i];
      return o ? { kind: "target", x: o.x, y: o.y + o.air, z: o.z } : null;
    };
    switch (me.item) {
      case "petard":
        return { kind: "road", s: k.s + (flip ? -3 : 3), d: lane, len: flip ? -38 : 58 };
      case "bowling":
        return { kind: "road", s: k.s + (flip ? -4 : 4), d: lane, len: flip ? -38 : 58 };
      case "bombe":
        return ring(solidGround(t, wrapS(t, k.s + (flip ? -BOMBE_BACK : BOMBE_AHEAD))), lane, BOMBE_RADIUS);
      case "huile":
        return flip ? ring(solidGround(t, wrapS(t, k.s + OIL_AHEAD)), lane, OIL_RADIUS + 0.5) : ring(k.s - 3.4, k.d, OIL_RADIUS + 0.5);
      case "klaxon":
        return { kind: "ring", x: k.x, y: k.y, z: k.z, r: KLAXON_RADIUS };
      case "tarte": {
        const pick = tarteTarget(
          this.view.racers.map((r, i) => ({ id: r.id, dist: this.shown[i]!.dist, done: r.finish !== null, i })),
          me.id,
          k.dist,
          flip,
        );
        return pick ? onKart(pick.i) : null;
      }
      case "fusee": {
        let best = -1;
        this.view.racers.forEach((r, i) => {
          if (i === this.mine || r.finish !== null) return;
          if (best < 0 || this.shown[i]!.dist > this.shown[best]!.dist) best = i;
        });
        return best >= 0 ? onKart(best) : null;
      }
      default:
        return null;
    }
  }

  /** Le kart de tête (pour qui regarde sans courir) */
  private leader(): number {
    let best = 0;
    this.shown.forEach((k, i) => {
      if (k.dist > this.shown[best]!.dist) best = i;
    });
    return best;
  }

  private hud(now: number, intro: boolean): Hud {
    const v = this.view;
    const me = this.mine >= 0 ? v.racers[this.mine] : undefined;
    const mk = this.myKart();
    const L = this.track.length;
    // La place en direct : les arrivés d'abord, puis la distance parcourue
    const order = v.racers
      .map((r, i) => ({ i, fin: r.finish, dist: this.shown[i]!.dist }))
      .sort((a, b) => (a.fin !== null && b.fin !== null ? a.fin - b.fin : a.fin !== null ? -1 : b.fin !== null ? 1 : b.dist - a.dist));
    const place = this.mine >= 0 ? order.findIndex((o) => o.i === this.mine) + 1 : 0;
    // Qui mène : on l'annonce quand ça change (une fois la course lancée)
    const leader = order[0]?.i ?? null;
    if (leader !== null && leader !== this.leaderNow) {
      if (this.leaderNow !== null && now - v.goAt > 6000)
        this.tell(leader === this.mine ? "Tu prends la tête !" : `${this.names[leader]} prend la tête !`, leader === this.mine);
      this.leaderNow = leader;
    }
    const left = v.goAt - now;
    const lap = mk ? Math.min(v.settings.laps, Math.max(1, Math.floor(Math.max(0, mk.dist) / L) + 1)) : 1;
    // Un nouvel objet : on dit ce que c'est (et à quoi il sert, tant qu'on ne le connaît pas bien)
    const clock = performance.now();
    const rolling = clock < this.rollingUntil;
    const held = me?.item && !(rolling && this.rollSlot === 1) ? me.item : null;
    if (held !== this.lastItem) {
      this.lastItem = held;
      if (held) {
        const prefs = usePrefs.getState();
        const seen = prefs.bolidesItemsSeen[held] ?? 0;
        const long = seen < 4;
        prefs.set({ bolidesItemsSeen: { ...prefs.bolidesItemsSeen, [held]: seen + 1 } });
        this.tip = { key: ++this.tipSeq, item: held, long };
        this.tipUntil = clock + (long ? 3800 : 1500);
      } else this.tip = null;
    }
    if (this.tip && clock > this.tipUntil) this.tip = null;
    const arriving =
      me && me.finish === null ? v.hazards.find((h) => (h.kind === "fusee" || h.kind === "tarte") && h.target === me.id) : undefined;
    return {
      countdown:
        v.phase === "start" && left <= COUNTDOWN_MS ? Math.max(0, Math.ceil(left / 1000)) : now - v.goAt < 900 && now >= v.goAt ? 0 : null,
      intro,
      lap,
      laps: v.settings.laps,
      place,
      total: v.racers.length,
      item: me?.item ?? null,
      uses: me?.uses ?? 0,
      item2: me?.item2 ?? null,
      uses2: me?.uses2 ?? 0,
      rolling,
      rollSlot: this.rollSlot,
      tip: this.tip,
      nudge: this.nudge,
      drafting: Boolean(this.driver && (this.driver.kart.draft > 0.15 || this.driver.kart.glide)),
      order: order.map((o) => ({ id: this.ids[o.i]!, name: this.names[o.i]!, color: this.colors[o.i]!, me: o.i === this.mine })),
      incoming: arriving?.kind === "fusee" || arriving?.kind === "tarte" ? arriving.kind : null,
      raceMs: me?.finish ?? (v.phase === "start" ? 0 : Math.max(0, now - v.goAt)),
      finished: me?.finish != null ? { place: v.ranks?.[me.id] ?? place, ms: me.finish } : null,
      wrongWay: Boolean(this.driver?.wrongWay) && me?.finish == null,
      pie: Boolean(me && (me.pieUntil ?? 0) > now),
      feed: this.feed.filter((l) => l.until > performance.now()),
      flash: this.flash,
      stuck: Boolean(this.driver?.stuck) && v.phase === "racing" && me?.finish == null,
      speed: mk ? Math.round(Math.abs(mk.v) * 3.6) : 0,
      coins: this.mine >= 0 ? (this.coinCounts[this.mine] ?? me?.coins ?? 0) : 0,
      boosting: Boolean(mk && mk.boost > 0 && mk.spin === 0),
      banner: this.banner,
      map: this.shown.map((k, i) => ({ x: k.x, z: k.z, color: this.colors[i]!, me: i === this.mine })),
    };
  }

  /** Repartir quand on est coincé (le bouton du téléphone, comme la touche R) */
  respawnNow() {
    this.wantRescue = true;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.engine.stop();
    this.music.stop();
    this.controls.dispose();
    this.scene.dispose();
  }
}

export function placeLabel(place: number): string {
  return place === 1 ? "1er" : `${place}e`;
}
