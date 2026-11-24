import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { MAP_NAMES } from "../shared/games/escarmouche/maps.ts";
import { botCommand, botHurt, botPrimary, newBotMemory, type BotMemory } from "../shared/games/escarmouche/bot.ts";
import { CAMO_BY_ID, isCamoId, type CamoId } from "../shared/games/escarmouche/camos.ts";
import {
  addFighter,
  applyCmd,
  chooseNext,
  createMatch,
  fighterIndex,
  finish,
  isTeamMode,
  snapshotPose,
  worldStep,
  type EscEvent,
  type Match,
  type Pose,
  upgradeMatch,
  chooseSpawn,
  giveUp,
  takeOver,
} from "../shared/games/escarmouche/match.ts";
import { DEFAULT_SETTINGS, MODE_INFO, mergeSettings, type EscarmoucheSettings } from "../shared/games/escarmouche/rules.ts";
import { decodeCmd, DT, type Cmd } from "../shared/games/escarmouche/soldier.ts";
import { encodeMe, encodeTick, escarmoucheView, stateKey, type EscTick } from "../shared/games/escarmouche/view.ts";
import { Sight, tickFor } from "../shared/games/escarmouche/sight.ts";
import { ViewLag } from "../shared/games/escarmouche/viewLag.ts";
import { isUniformId, UNIFORM_BY_ID, type UniformId } from "../shared/games/escarmouche/uniforms.ts";
import {
  isPrimaryId,
  isSecondaryId,
  WEAPONS,
  type PrimaryId,
  type SecondaryId,
  EXTRA_BY_ID,
  isExtraId,
  isMuzzleId,
  MUZZLE_BY_ID,
  type ExtraId,
  type MuzzleId,
} from "../shared/games/escarmouche/weapons.ts";
import {
  CHAT_MAX,
  ESCARMOUCHE_MAX_PLAYERS,
  REACTIONS,
  TAUNTS,
  type ChatMessage,
  type EscarmoucheClientMessage,
  type EscarmoucheRoomSettings,
  type EscarmoucheRoomView,
  type EscarmoucheServerMessage,
  type PresenceRoom,
  type PublicUser,
  type RoomStatus,
  type RoomSummary,
} from "../shared/protocol.ts";
import { forgetPlayer, gatePassed, markLoaded, openGate, settleGate, type LoadGate } from "../shared/loadGate.ts";
import { randomSeed } from "../shared/rng.ts";
import { lookOf } from "../shared/looks.ts";
import { camoItem, canUse, uniformItem, weaponItem, attachmentItem } from "../shared/shop.ts";
import { TOUR_BOT_LEVELS, TOUR_GUEST_PREFIX, variantSettings, type TourInit } from "../shared/tour.ts";
import { applyDrawnRules, drawNotice, drawRules, hostDraw, hostPatch } from "../shared/randomRules.ts";
import {
  CLOSED_TABLE,
  defaultLateJoin,
  forgetWatcher,
  intentFrom,
  JOINS_STARTED,
  lateJoinNotice,
  lateJoinOf,
  maySit,
  rememberWatcher,
  type Arrival,
  type ArrivalCase,
  type ArrivalIntent,
} from "../shared/lateJoin.ts";
import { decide, friendForArrival, refuseSocket } from "./arrival.ts";
import type { RoomInit } from "./room.ts";
import { ownedItems } from "./shop.ts";
import { isLive, replaceOlder } from "./sockets.ts";
import { abortToTour, reportToTour, TOUR_JOIN_MS, TOUR_LOCKED, TOUR_PICK_MS, TOUR_TABLE_LINGER_MS, tourChat } from "./tourLink.ts";
import { recordGame, type EloResults, type EscarmoucheRecordStats } from "./users.ts";
import { decodeHeaderJson } from "./util.ts";
import { ANNOUNCE_MS } from "../shared/announce.ts";

// Des soldats pour compléter les rangs
const BOT_NAMES = [
  "Adrien",
  "Bastien",
  "Clément",
  "Damien",
  "Étienne",
  "Fabrice",
  "Gilles",
  "Hervé",
  "Isabelle",
  "Josiane",
  "Karine",
  "Lucie",
];
// Délai laissé à un joueur déconnecté pour revenir avant qu'un bot se batte à sa place
const AWAY_AFTER_MS = 8000;
const SEAT_RELEASE_MS = 25_000;
/** Pendant la partie, l'alarme de garde ne dort jamais plus longtemps */
const WATCHDOG_MS = 60_000;
const CHAT_KEEP = 80;
/** La boucle : les commandes reçues sont jouées, le monde avance, tout le monde reçoit les positions, 20 fois par seconde */
const TICK_MS = 50;
const SAVE_EVERY_MS = 10_000;
/** Le retour dans le temps ne remonte pas plus loin (au-delà, on tire là où le tireur aurait dû voir) */
const REWIND_MS = 350;
const HISTORY_MS = 1000;
/** Les pas qu'un joueur peut avoir d'avance (au-delà, les plus vieux sont oubliés) */
const QUEUE_MAX = 40;
const STEP_MS = DT * 1000;
/** Les spectateurs voient tout le combat, avec ce retard */
const WATCH_DELAY_MS = 3000;

/**
 * Le hasard de la dispersion des balles, tiré ici (et pas par un calcul que l'appareil du tireur saurait refaire : il
 * viserait de façon à annuler l'écart de son prochain coup)
 */
const spreadPool = new Uint32Array(256);
let spreadNext = spreadPool.length;
function spreadRand(): number {
  if (spreadNext >= spreadPool.length) {
    crypto.getRandomValues(spreadPool);
    spreadNext = 0;
  }
  return spreadPool[spreadNext++]! / 4294967296;
}

interface Seat {
  id: string;
  kind: "human" | "bot";
  userId: string | null;
  name: string;
  avatar: AvatarConfig;
  photo: number;
  admin?: boolean;
  autoplay: false | "away";
  disconnectedAt: number | null;
  team: 0 | 1;
  primary: PrimaryId;
  /** L'arme de poing et la tenue (absentes des tables d'avant : le pistolet, et sa propre tenue) */
  secondary?: SecondaryId;
  tenue?: UniformId;
  /** Les accessoires de l'arme principale (absents des tables d'avant : aucun) */
  muzzle?: MuzzleId;
  extra?: ExtraId;
  camo: CamoId;
}

type TimerKind = "away" | "seatCleanup" | "cleanup" | "tourStart";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
}

interface EscarmoucheData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: EscarmoucheRoomSettings;
  status: RoomStatus;
  seats: Seat[];
  botCounter: number;
  match: Match | null;
  startedAt: number | null;
  rematch: string[];
  chat: ChatMessage[];
  chatSeq: number;
  timers: Timer[];
  kicked: string[];
  recorded: boolean;
  results?: EloResults | null;
  tour?: TourInit | null;
  watchers?: string[];
  pickUntil?: number | null;
  ready?: string[];
  /** Le combat retenu le temps que chacun charge la carte (voir loadGate.ts) ; null : il tourne */
  gate?: LoadGate | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
  replaced?: boolean;
}

/** Une partie finie, relevée pour l'historique et la tournée */
interface GameReport {
  game: Parameters<typeof recordGame>[1];
  tour: { code: string; report: Parameters<typeof reportToTour>[2] } | null;
}

/** Une table d'Escarmouche : le salon commun, puis une partie que le serveur mène et arbitre : il fait autorité. */
export class EscarmoucheRoom extends DurableObject<Env> {
  private data: EscarmoucheData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private acc = 0;
  private lastKey = "";
  private lastSave = 0;
  /** Les pas reçus de chaque joueur, pas encore joués, et le crédit de pas qu'il a (contre ceux qui en enverraient trop) */
  private queues = new Map<string, Cmd[]>();
  /** Le retard habituel de chaque joueur, pour brider l'heure de ses tirs (viewLag.ts) */
  private viewLags = new Map<string, ViewLag>();
  private credit = new Map<string, number>();
  /** Où était chacun à chaque envoi : c'est là que le retour dans le temps va chercher les cibles */
  private history: { at: number; poses: Pose[] }[] = [];
  private memories = new Map<string, BotMemory>();
  /** Pas joués par le monde depuis le début (horloge des bots) */
  private steps = 0;
  /** Ce que chaque joueur peut voir ou entendre des autres */
  private sight = new Sight();
  /** Le combat tel que les spectateurs le verront, en attendant son heure */
  private watchFeed: { at: number; text: string }[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<EscarmoucheData>("room")) ?? null;
      if (this.data?.match) upgradeMatch(this.data.match);
      if (this.data?.status === "playing" && this.data.match) this.startLoop();
    });
  }

  private get hub() {
    return this.env.HUB.get(this.env.HUB.idFromName("hub"));
  }

  // -------------------------------------------------------------------------
  // API appelée par le worker
  // -------------------------------------------------------------------------

  async init(opts: RoomInit): Promise<boolean> {
    if (this.data) return false;
    const now = Date.now();
    this.data = {
      code: opts.code,
      createdAt: now,
      hostId: opts.host.id,
      quick: opts.quick,
      settings: { visibility: opts.visibility, maxPlayers: 6, lateJoin: defaultLateJoin(opts.quick), escarmouche: { ...DEFAULT_SETTINGS } },
      status: "lobby",
      seats: [],
      botCounter: 0,
      match: null,
      startedAt: null,
      rematch: [],
      chat: [],
      chatSeq: 0,
      timers: [{ at: now + 10 * 60_000, kind: "cleanup" }],
      kicked: [],
      recorded: false,
      tour: opts.tour ?? null,
    };
    if (opts.tour) this.seatTour(opts.tour, now);
    await this.persist();
    await this.syncHub();
    await this.armAlarm();
    return true;
  }

  /**
   * Table d'une tournée : tout le monde est déjà assis, les bots de la tournée aussi. Avec les équipes de la tournée,
   * on joue en équipes ; sinon chacun pour soi. La carte est tirée au sort, les règles sont celles de la tournée.
   */
  private seatTour(tour: TourInit, now: number) {
    const d = this.data!;
    d.settings.escarmouche = mergeSettings(d.settings.escarmouche, {
      ...variantSettings("escarmouche", tour.variant),
      mode: tour.teams ? "equipes" : "solo",
      map: "hasard",
      minutes: 5,
      botLevel: TOUR_BOT_LEVELS[tour.botLevel]?.escarmouche ?? "moyen",
    });
    const humans: Seat[] = tour.players.map((u) => {
      const look = lookOf(tour.looks, u.id);
      const camo = look.escarmoucheCamo;
      const tenue = look.escarmoucheTenue;
      return { ...this.newHumanSeat(u, 0), disconnectedAt: now, ...(camo ? { camo } : {}), ...(tenue ? { tenue } : {}) };
    });
    const bots: Seat[] = tour.bots.map((b) => this.newBotSeat(b.id, b.name, 0, b.avatar));
    const all = [...humans, ...bots];
    if (tour.teams) for (const s of all) s.team = tour.teams[s.userId ?? s.id] ?? 0;
    else all.forEach((s, i) => (s.team = (i % 2) as 0 | 1));
    d.seats = all;
    d.settings.maxPlayers = Math.min(ESCARMOUCHE_MAX_PLAYERS, Math.max(2, d.seats.length));
    d.hostId = humans[0]?.userId ?? d.hostId;
    d.timers.push({ at: now + TOUR_JOIN_MS, kind: "tourStart" });
  }

  async summary(): Promise<RoomSummary | null> {
    return this.data ? this.buildSummary() : null;
  }

  async refusal(user: PublicUser): Promise<string | null> {
    const d = this.data;
    if (!d || d.tour) return null;
    const c = this.arrivalCase(user.id, null);
    const friend = await friendForArrival(this.env.DB, user, c, d.seats);
    return this.data && decide(this.arrivalCase(user.id, null), friend) === "deny" ? CLOSED_TABLE : null;
  }

  async adminClose(): Promise<boolean> {
    if (!this.data) return false;
    await this.close("La table a été fermée par l'administrateur du site.");
    return true;
  }

  async adminKick(userId: string): Promise<void> {
    if (!this.data) return;
    await this.kickUser(userId, Date.now());
  }

  override async fetch(request: Request): Promise<Response> {
    const d = this.data;
    if (!d) return new Response("Salon introuvable", { status: 404 });
    const user = decodeHeaderJson<PublicUser>(request.headers.get("X-User"));
    if (!user || request.headers.get("Upgrade") !== "websocket") return new Response("Requête invalide", { status: 400 });
    if (d.kicked.includes(user.id)) return new Response("Tu as été exclu de ce salon", { status: 403 });
    const intent = intentFrom(new URL(request.url).search);
    const friend = await friendForArrival(this.env.DB, user, this.arrivalCase(user.id, intent), d.seats);
    if (!this.data) return new Response("Salon introuvable", { status: 404 });
    const decision = d.tour ? "watch" : decide(this.arrivalCase(user.id, intent), friend);
    if (decision === "deny") return refuseSocket(CLOSED_TABLE);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [user.id]);
    server.serializeAttachment({ userId: user.id, user } satisfies Attachment);
    replaceOlder(this.ctx.getWebSockets(user.id), server);
    await this.onJoin(user, server, decision);
    return new Response(null, { status: 101, webSocket: client });
  }

  private arrivalCase(userId: string, intent: ArrivalIntent): ArrivalCase {
    const d = this.data!;
    return {
      intent,
      seated: d.seats.some((s) => s.userId === userId),
      started: d.status === "playing",
      lateJoin: lateJoinOf(d.settings, d.quick),
      midGame: JOINS_STARTED.escarmouche,
      watcher: (d.watchers ?? []).includes(userId),
      friend: false,
      room: d.seats.length < d.settings.maxPlayers || d.seats.some((s) => s.kind === "bot"),
    };
  }

  // -------------------------------------------------------------------------
  // Arrivées et départs
  // -------------------------------------------------------------------------

  private async onJoin(user: PublicUser, ws: WebSocket, decision: Arrival) {
    const d = this.data!;
    const now = Date.now();
    d.timers = d.timers.filter((t) => t.kind !== "cleanup");
    let seat = d.seats.find((s) => s.userId === user.id);
    if (seat) {
      seat.disconnectedAt = null;
      seat.admin = Boolean(user.admin);
      d.timers = d.timers.filter((t) => !((t.kind === "away" || t.kind === "seatCleanup") && t.seatId === seat!.id));
      if (seat.autoplay === "away") {
        seat.autoplay = false;
        if (d.status === "playing") this.systemChat(`${seat.name} est de retour.`);
        this.takeBack(seat);
      }
      // Un appareil qui (re)vient recompte ses pas depuis zéro
      this.restartSteps(seat.id);
      if (d.status !== "playing") {
        seat.name = user.pseudo;
        seat.avatar = user.avatar;
        seat.photo = user.photo;
      }
    } else if (decision === "seat") {
      seat = this.enterBattle(user) ?? undefined;
    }
    if (!seat) {
      d.watchers = rememberWatcher(d.watchers, user.id);
      this.systemChat(`${user.pseudo} observe le combat.`);
    }
    this.ensureHost();
    this.send(ws, { t: "chat", messages: d.chat, reset: true });
    if (d.tour && d.status === "lobby" && !d.pickUntil && d.seats.every((s) => s.kind === "bot" || this.isConnected(s.userId))) {
      d.pickUntil = now + TOUR_PICK_MS;
      d.timers = d.timers.filter((t) => t.kind !== "tourStart");
      d.timers.push({ at: d.pickUntil, kind: "tourStart" });
    }
    await this.afterChange([], now);
    void this.setPresence(user.id, this.presenceRoom()).catch(() => {});
  }

  private newHumanSeat(user: PublicUser, team: 0 | 1): Seat {
    return {
      id: user.id,
      kind: "human",
      userId: user.id,
      name: user.pseudo,
      avatar: user.avatar,
      photo: user.photo,
      admin: Boolean(user.admin),
      autoplay: false,
      disconnectedAt: null,
      team,
      primary: "fa",
      camo: "usine",
    };
  }

  private newBotSeat(id: string, name: string, team: 0 | 1, avatar?: AvatarConfig): Seat {
    const d = this.data!;
    return {
      id,
      kind: "bot",
      userId: null,
      name,
      avatar: avatar ?? seededAvatar(`${name}-${d.code}`),
      photo: 0,
      autoplay: false,
      disconnectedAt: null,
      team,
      primary: botPrimary(`${name}-${d.code}`),
      tenue: "treillis",
      camo: "usine",
    };
  }

  /** L'équipe qui a le moins de monde */
  private lighterTeam(): 0 | 1 {
    const d = this.data!;
    const n = (t: number) => d.seats.filter((s) => s.team === t).length;
    return n(0) <= n(1) ? 0 : 1;
  }

  /**
   * Il entre au combat : une place libre, ou celle d'un bot (qui lui laisse son soldat, en pleine partie). Avant la
   * partie, il rejoint l'équipe qui a le moins de monde.
   */
  private enterBattle(user: PublicUser): Seat | null {
    const d = this.data!;
    const m = d.status === "playing" ? d.match : null;
    if (d.seats.length < d.settings.maxPlayers) {
      const seat = this.newHumanSeat(user, this.lighterTeam());
      d.seats.push(seat);
      if (m && m.phase !== "over") {
        addFighter(m, {
          id: seat.id,
          team: seat.team,
          bot: false,
          primary: seat.primary,
          secondary: seat.secondary,
          muzzle: seat.muzzle,
          extra: seat.extra,
        });
        this.systemChat(`${user.pseudo} rejoint le combat en cours de partie.`);
      } else this.systemChat(`${user.pseudo} rejoint les rangs.`);
      return seat;
    }
    for (let k = d.seats.length - 1; k >= 0; k--) {
      const bot = d.seats[k]!;
      if (bot.kind !== "bot") continue;
      const seat = { ...this.newHumanSeat(user, bot.team), primary: bot.primary };
      d.seats[k] = seat;
      if (m) {
        // Il reprend le soldat du bot là où il est, avec un bilan à zéro
        const i = fighterIndex(m, bot.id);
        if (i >= 0) takeOver(m, i, seat.id);
        this.memories.delete(bot.id);
        this.systemChat(`${user.pseudo} prend la place de ${bot.name} en pleine partie.`);
      } else this.systemChat(`${user.pseudo} prend la place de ${bot.name}.`);
      return seat;
    }
    return null;
  }

  /** Un bot se bat à sa place (absent, parti) */
  private handOver(seat: Seat) {
    const m = this.data!.match;
    const i = m ? fighterIndex(m, seat.id) : -1;
    if (!m || i < 0) return;
    m.fighters[i]!.bot = true;
    this.queues.delete(seat.id);
    this.viewLags.delete(seat.id);
  }

  /** Il reprend son soldat là où le bot l'a laissé */
  private takeBack(seat: Seat) {
    const m = this.data!.match;
    const i = m ? fighterIndex(m, seat.id) : -1;
    if (!m || i < 0) return;
    m.fighters[i]!.bot = false;
    this.memories.delete(seat.id);
    this.credit.set(seat.id, 0);
  }

  /** Ses pas repartent de zéro (nouvel appareil, page rechargée) : on oublie ceux d'avant */
  private restartSteps(seatId: string) {
    const m = this.data!.match;
    const i = m ? fighterIndex(m, seatId) : -1;
    if (!m || i < 0) return;
    m.fighters[i]!.s.seq = 0;
    this.queues.delete(seatId);
    this.viewLags.delete(seatId);
  }

  private connectedUsers(except?: WebSocket): Map<string, PublicUser> {
    const out = new Map<string, PublicUser>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !isLive(ws)) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att) out.set(att.userId, att.user);
    }
    return out;
  }

  private isConnected(userId: string | null): boolean {
    if (!userId) return false;
    return this.ctx.getWebSockets(userId).some((ws) => isLive(ws));
  }

  override async webSocketClose(ws: WebSocket) {
    await this.onSocketGone(ws);
  }

  override async webSocketError(ws: WebSocket) {
    await this.onSocketGone(ws);
  }

  private async onSocketGone(ws: WebSocket) {
    const d = this.data;
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!d || !att || att.replaced) return;
    const stillHere = this.ctx.getWebSockets(att.userId).some((o) => o !== ws && isLive(o));
    if (stillHere) return;
    const now = Date.now();
    const seat = d.seats.find((s) => s.userId === att.userId);
    if (seat) {
      seat.disconnectedAt = now;
      // Parti pendant le chargement : les autres ne l'attendent plus
      if (forgetPlayer(d.gate, seat.id)) settleGate(d.gate, now);
      if (d.status === "playing") this.addTimer({ at: now + AWAY_AFTER_MS, kind: "away", seatId: seat.id });
      else this.addTimer({ at: now + SEAT_RELEASE_MS, kind: "seatCleanup", seatId: seat.id });
    }
    if (this.connectedUsers(ws).size === 0) {
      this.addTimer({ at: now + (d.status === "playing" ? 20 : 10) * 60_000, kind: "cleanup" });
    }
    // Un hôte sans place (il regardait) qui s'en va : la main passe à un joueur présent
    this.ensureHost();
    void this.setPresence(att.userId, null).catch(() => {});
    await this.afterChange([], now, ws);
  }

  /** L'écran d'annonce est ouvert : avant un jeu de tournée, ou avant la revanche (hors tournée) */
  private announcing(): boolean {
    const d = this.data!;
    return d.tour ? d.status === "lobby" : d.status === "finished" && Boolean(d.pickUntil);
  }

  /** Tous les joueurs sont prêts (les présents, à la revanche) : on n'attend pas la fin de l'annonce */
  private allReady(): boolean {
    const d = this.data!;
    const ready = d.ready ?? [];
    const humans = d.seats.filter((s) => s.kind === "human");
    if (d.tour) return humans.every((s) => this.isConnected(s.userId) && ready.includes(s.userId!));
    const here = humans.filter((s) => this.isConnected(s.userId));
    return here.length > 0 && here.every((s) => ready.includes(s.userId!));
  }

  /** La revanche demandée par tous : l'écran d'annonce, quinze secondes (moins si tous sont prêts) avant la partie */
  private async openAnnounce(now: number) {
    const d = this.data!;
    if (d.status === "finished" && !d.pickUntil) {
      d.pickUntil = now + ANNOUNCE_MS;
      d.ready = [];
      d.timers = d.timers.filter((t) => t.kind !== "tourStart");
      d.timers.push({ at: d.pickUntil, kind: "tourStart" });
    }
    return this.afterChange([], now);
  }
  /** Ce qui empêche un combat de partir avec les soldats présents (pas assez de monde, une équipe vide), ou null */
  private startProblem(): string | null {
    // Personne d'assis n'est là (parti pendant l'annonce de la revanche, coupure) : pas de partie de bots seuls
    if (!this.data!.seats.some((s) => s.kind === "human" && this.isConnected(s.userId)))
      return "Il faut au moins un joueur assis à la table.";
    const d = this.data!;
    const seats = d.seats.filter((s) => s.kind === "bot" || this.isConnected(s.userId));
    if (seats.length < 2) return "Il faut au moins deux soldats : ajoute un bot !";
    const own = { ...DEFAULT_SETTINGS, ...d.settings.escarmouche };
    const drawn = d.settings.randomRules && !d.tour ? d.settings.randomRules : null;
    const settings = drawn ? applyDrawnRules("escarmouche", own, DEFAULT_SETTINGS, drawn) : own;
    if (!isTeamMode(settings.mode)) return null;
    for (const t of [0, 1]) if (!seats.some((s) => s.team === t)) return "Chaque équipe doit avoir au moins un soldat : ajoute un bot !";
    return null;
  }

  /** L'annonce de la revanche est finie (compte à rebours, ou tous prêts) : le combat part, ou la table dit pourquoi */
  private async announceDone(now: number) {
    const d = this.data!;
    const problem = this.startProblem();
    if (!problem) return this.startGame(now);
    d.pickUntil = null;
    d.ready = [];
    d.rematch = [];
    d.timers = d.timers.filter((t) => t.kind !== "tourStart");
    this.systemChat(`Le combat ne peut pas partir. ${problem}`);
    return this.afterChange([], now);
  }

  /** La revanche part : la partie est finie et tous les joueurs restés à la table l'ont demandée */
  private rematchReady(): boolean {
    const d = this.data!;
    if (d.status !== "finished" || d.rematch.length === 0) return false;
    // Au moins un joueur encore là : sans personne, le compte à rebours lancerait une partie de bots seuls, et celui qui
    // revient trouverait sa table commencée sans lui
    const here = d.seats.filter((s) => s.kind === "human" && this.isConnected(s.userId));
    return here.length > 0 && here.every((s) => d.rematch.includes(s.userId!));
  }

  /**
   * Après la partie, la place d'un joueur parti pendant le jeu se libère comme au salon. Sans ça, elle restait (avec
   * la main d'hôte s'il l'avait : plus personne ne pouvait lancer la suite ni changer les règles).
   */
  private releaseAbsent(now: number) {
    const d = this.data!;
    if (d.status === "playing" || d.tour) return;
    for (const s of d.seats) {
      if (s.kind !== "human" || s.disconnectedAt === null || this.isConnected(s.userId)) continue;
      if (d.timers.some((t) => t.kind === "seatCleanup" && t.seatId === s.id)) continue;
      this.addTimer({ at: Math.max(now, s.disconnectedAt + SEAT_RELEASE_MS), kind: "seatCleanup", seatId: s.id });
    }
  }

  private ensureHost() {
    const d = this.data!;
    if (d.seats.find((s) => s.userId === d.hostId)) return;
    const connected = this.connectedUsers();
    if (d.seats.length === 0 && connected.has(d.hostId)) return;
    const next = d.seats.find((s) => s.kind === "human" && this.isConnected(s.userId)) ?? d.seats.find((s) => s.kind === "human");
    const fallback = next?.userId ?? connected.keys().next().value;
    if (fallback && fallback !== d.hostId) {
      d.hostId = fallback;
      const name = next?.name ?? connected.get(fallback)?.pseudo ?? "Quelqu'un";
      this.systemChat(`${name} prend la main sur la table.`);
    }
  }

  // -------------------------------------------------------------------------
  // Messages des joueurs
  // -------------------------------------------------------------------------

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const d = this.data;
    if (!d || typeof raw !== "string" || raw.length > 6000) return;
    let msg: EscarmoucheClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    // « null », un nombre, une liste : rien à lire
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
    const att = ws.deserializeAttachment() as Attachment;
    if (att.replaced) return;
    const userId = att.userId;
    const isHost = userId === d.hostId;
    const isAdmin = Boolean(att.user.admin);
    const seat = d.seats.find((s) => s.userId === userId) ?? null;
    const now = Date.now();
    const error = (message: string) => this.send(ws, { t: "error", message });
    if (d.tour && TOUR_LOCKED.has(msg.t)) return;

    switch (msg.t) {
      case "cmd": {
        // Ses pas : jamais enregistrés, seulement mis de côté pour la prochaine boucle
        const m = d.match;
        if (!seat || seat.autoplay || !m || d.status !== "playing" || !Array.isArray(msg.c)) return;
        const q = this.queues.get(seat.id) ?? [];
        const last = q.at(-1)?.s ?? m.fighters[fighterIndex(m, seat.id)]?.s.seq ?? 0;
        let lag = this.viewLags.get(seat.id);
        if (!lag) this.viewLags.set(seat.id, (lag = new ViewLag()));
        let after = last;
        for (const raw of msg.c.slice(0, 30)) {
          const c = decodeCmd(raw);
          if (!c || c.s <= after) continue;
          after = c.s;
          // L'heure de son tir ne remonte pas plus loin que son retard habituel
          c.vt = lag.admit(c, now);
          q.push(c);
        }
        if (q.length > QUEUE_MAX) q.splice(0, q.length - QUEUE_MAX);
        this.queues.set(seat.id, q);
        return;
      }

      case "arsenal": {
        if (!seat || !this.allowMessage(`arsenal:${userId}`, 120)) return;
        // Ce qu'il a le droit de prendre : ce qui est à tout le monde, et ce qu'il a acheté à la boutique
        let owned: ReadonlySet<string> | null = null;
        const has = async (item: string) => canUse(item, (owned ??= await ownedItems(this.env.DB, userId)));
        let changed = false;
        const m = d.status === "playing" ? d.match : null;
        if (isPrimaryId(msg.primary) && msg.primary !== seat.primary) {
          if (!(await has(weaponItem(msg.primary)))) return error(`${WEAPONS[msg.primary].name} se débloque à la boutique.`);
          seat.primary = msg.primary;
          changed = true;
          if (m) chooseNext(m, fighterIndex(m, seat.id), { primary: msg.primary });
        }
        if (isSecondaryId(msg.secondary) && msg.secondary !== (seat.secondary ?? "pistolet")) {
          if (!(await has(weaponItem(msg.secondary)))) return error(`${WEAPONS[msg.secondary].name} se débloque à la boutique.`);
          seat.secondary = msg.secondary;
          changed = true;
          if (m) chooseNext(m, fighterIndex(m, seat.id), { secondary: msg.secondary });
        }
        if (isMuzzleId(msg.muzzle) && msg.muzzle !== (seat.muzzle ?? "aucun")) {
          if (!(await has(attachmentItem(msg.muzzle))))
            return error(`Le ${MUZZLE_BY_ID.get(msg.muzzle)!.name.toLowerCase()} se débloque à la boutique.`);
          seat.muzzle = msg.muzzle;
          changed = true;
          if (m) chooseNext(m, fighterIndex(m, seat.id), { muzzle: msg.muzzle });
        }
        if (isExtraId(msg.extra) && msg.extra !== (seat.extra ?? "aucun")) {
          if (!(await has(attachmentItem(msg.extra))))
            return error(`La ${EXTRA_BY_ID.get(msg.extra)!.name.toLowerCase()} se débloque à la boutique.`);
          seat.extra = msg.extra;
          changed = true;
          if (m) chooseNext(m, fighterIndex(m, seat.id), { extra: msg.extra });
        }
        if (isCamoId(msg.camo) && msg.camo !== seat.camo) {
          if (!(await has(camoItem(msg.camo)))) return error(`Le camouflage ${CAMO_BY_ID.get(msg.camo)!.name} s'achète à la boutique.`);
          seat.camo = msg.camo;
          changed = true;
        }
        if (isUniformId(msg.tenue) && msg.tenue !== (seat.tenue ?? "perso")) {
          if (!(await has(uniformItem(msg.tenue)))) return error(`La tenue ${UNIFORM_BY_ID.get(msg.tenue)!.name} s'achète à la boutique.`);
          seat.tenue = msg.tenue;
          changed = true;
        }
        if (changed) return this.afterChange([], now);
        return;
      }

      case "respawnNow": {
        const m = d.status === "playing" ? d.match : null;
        if (!seat || !m) return;
        giveUp(m, fighterIndex(m, seat.id));
        return;
      }

      case "spawnOn": {
        const m = d.status === "playing" ? d.match : null;
        if (!seat || !m || typeof msg.target !== "number" || !Number.isInteger(msg.target)) return;
        chooseSpawn(m, fighterIndex(m, seat.id), msg.target);
        return;
      }

      case "team": {
        if (d.status === "playing" || (msg.team !== 0 && msg.team !== 1)) return;
        const target = msg.seatId && isHost ? d.seats.find((s) => s.id === msg.seatId) : seat;
        // Rien qui change, ou un changement par-dessus l'autre : ni écriture ni envoi à toute la table
        if (!target || target.team === msg.team || !this.allowMessage(`team:${userId}`, 150)) return;
        target.team = msg.team;
        return this.afterChange([], now);
      }

      case "chat": {
        if (typeof msg.text !== "string") return;
        const text = msg.text.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX);
        if (!text || !this.allowMessage(userId, 700)) return;
        const message: ChatMessage = { id: ++d.chatSeq, userId, name: att.user.pseudo, text, at: now, ...(isAdmin ? { admin: true } : {}) };
        this.pushChat(message);
        await this.persist();
        return this.broadcastRaw({ t: "chat", messages: [message] });
      }

      case "emote": {
        const valid = (REACTIONS as readonly string[]).includes(msg.emote) || (TAUNTS as readonly string[]).includes(msg.emote);
        if (!valid || !this.allowMessage(`emote:${userId}`, 900)) return;
        return this.broadcastRaw({ t: "emote", seatId: seat?.id ?? null, userId, emote: msg.emote });
      }

      case "loaded": {
        // Son jeu a fini de charger la carte : le compte à rebours du combat part quand tout le monde l'a dit
        if (!seat || d.status !== "playing" || !markLoaded(d.gate, seat.id, msg.gate)) return;
        settleGate(d.gate, now);
        return this.afterChange([], now);
      }

      case "ready": {
        if (!this.announcing() || !seat || !this.allowMessage(`ready:${userId}`, 150)) return;
        d.ready = [...new Set([...(d.ready ?? []), userId])];
        if (this.allReady()) return d.tour ? this.startTourGame(now) : this.announceDone(now);
        return this.afterChange([], now);
      }

      case "sit": {
        if (seat || d.tour || !maySit(this.arrivalCase(userId, "play"))) return;
        if (!this.enterBattle(att.user)) return error("Les rangs sont complets.");
        d.watchers = forgetWatcher(d.watchers, userId);
        this.ensureHost();
        return this.afterChange([], now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            if (forgetPlayer(d.gate, seat.id)) settleGate(d.gate, now);
            this.handOver(seat);
            this.systemChat(`${seat.name} a quitté le combat, un bot prend sa place.`);
          } else {
            d.seats = d.seats.filter((s) => s !== seat);
            d.rematch = d.rematch.filter((id) => id !== userId);
            this.systemChat(`${seat.name} a quitté la table.`);
          }
        }
        for (const other of this.ctx.getWebSockets(userId)) {
          try {
            other.close(1000, "Au revoir");
          } catch {
            // déjà fermée
          }
        }
        this.ensureHost();
        void this.setPresence(userId, null).catch(() => {});
        if (this.rematchReady()) return this.openAnnounce(now);
        return this.afterChange([], now, ws);
      }

      case "rematch": {
        if (d.status !== "finished" || !seat || d.rematch.includes(userId)) return;
        d.rematch.push(userId);
        if (this.rematchReady()) return this.openAnnounce(now);
        return this.afterChange([], now);
      }
    }

    if (msg.t === "close") {
      if (!isAdmin) return error("Seul l'administrateur du site peut fermer une table.");
      return this.close("La table a été fermée par l'administrateur du site.");
    }

    const moderation = msg.t === "kick" || msg.t === "removeSeat";
    if (!isHost && !(isAdmin && moderation)) return error("Seul l'hôte peut faire ça.");
    switch (msg.t) {
      case "settings": {
        if (typeof msg.lateJoin === "boolean" && msg.lateJoin !== lateJoinOf(d.settings, d.quick)) {
          d.settings.lateJoin = msg.lateJoin;
          this.systemChat(lateJoinNotice("escarmouche", msg.lateJoin));
          if (d.status === "playing") return this.afterChange([], now);
        }
        if (d.status === "playing") return msg.lateJoin === undefined ? error("On ne change pas les règles en plein combat.") : undefined;
        const current = { ...DEFAULT_SETTINGS, ...d.settings.escarmouche };
        const drawn = d.tour
          ? null
          : hostDraw("escarmouche", d.settings.randomRules, current, DEFAULT_SETTINGS, msg.randomRules, Math.random);
        if (drawn) {
          d.settings.randomRules = drawn.draw;
          d.settings.escarmouche = drawn.settings;
          this.systemChat(drawn.notice);
        }
        const wasTeams = MODE_INFO[d.settings.escarmouche.mode].teams;
        d.settings.escarmouche = mergeSettings(d.settings.escarmouche, hostPatch("escarmouche", d.settings.randomRules, msg.settings));
        // On passe en équipes : chacun est réparti à tour de rôle, pour partir de deux camps égaux
        if (!wasTeams && MODE_INFO[d.settings.escarmouche.mode].teams) d.seats.forEach((s, i) => (s.team = (i % 2) as 0 | 1));
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= 2 && max <= ESCARMOUCHE_MAX_PLAYERS) {
            while (d.seats.length > max) {
              const botIndex = d.seats.map((s) => s.kind).lastIndexOf("bot");
              if (botIndex < 0) break;
              d.seats.splice(botIndex, 1);
            }
            d.settings.maxPlayers = Math.max(max, d.seats.length);
          }
        }
        return this.afterChange([], now);
      }

      case "addBot": {
        if (d.status === "playing") return;
        if (d.seats.length >= d.settings.maxPlayers) return error("Les rangs sont complets.");
        const used = new Set(d.seats.map((s) => s.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Soldat ${d.botCounter + 1}`;
        d.seats.push(this.newBotSeat(`bot-${++d.botCounter}`, name, this.lighterTeam()));
        return this.afterChange([], now);
      }

      case "removeSeat": {
        if (d.status === "playing") return;
        const target = d.seats.find((s) => s.id === msg.seatId);
        if (!target || target.userId === userId) return;
        d.seats = d.seats.filter((s) => s !== target);
        if (target.kind === "human") this.systemChat(`${target.name} a été retiré de la table.`);
        // Celui qu'on attendait parti, la revanche part si tous les autres l'ont demandée
        if (target.userId) d.rematch = d.rematch.filter((id) => id !== target.userId);
        if (this.rematchReady()) return this.openAnnounce(now);
        return this.afterChange([], now);
      }

      case "kick": {
        if (typeof msg.userId !== "string" || msg.userId === userId) return;
        return this.kickUser(msg.userId, now);
      }

      case "start": {
        if (d.status === "playing") return;
        // Après un combat, « Rejouer » passe par l'annonce, comme la revanche ; ce qui l'empêche se dit tout de suite
        if (d.status === "finished" && !d.tour) {
          const problem = this.startProblem();
          if (problem) return this.send(ws, { t: "error", message: problem });
          return this.openAnnounce(now);
        }
        return this.startGame(now, ws);
      }
    }
  }

  private async kickUser(target: string, now: number) {
    const d = this.data!;
    if (!d.kicked.includes(target)) d.kicked.push(target);
    const seat = d.seats.find((s) => s.userId === target);
    if (seat) {
      if (d.status === "playing") {
        seat.autoplay = "away";
        seat.disconnectedAt = now;
        this.handOver(seat);
      } else {
        d.seats = d.seats.filter((s) => s !== seat);
      }
      this.systemChat(`${seat.name} a été exclu du salon.`);
    }
    for (const other of this.ctx.getWebSockets(target)) {
      this.send(other, { t: "kicked" });
      try {
        other.close(4003, "Exclu");
      } catch {
        // déjà fermée
      }
    }
    this.ensureHost();
    void this.setPresence(target, null).catch(() => {});
    // Sa voix pour la revanche part avec lui ; tous les autres l'avaient peut-être demandée
    d.rematch = d.rematch.filter((id) => id !== target);
    if (this.rematchReady()) return this.openAnnounce(now);
    return this.afterChange([], now);
  }

  private async close(reason: string) {
    const connected = [...this.connectedUsers().keys()];
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, { t: "closed", reason });
      try {
        ws.close(4004, "Table fermee");
      } catch {
        // déjà fermée
      }
    }
    for (const id of connected) void this.setPresence(id, null).catch(() => {});
    await this.destroy();
  }

  private allowMessage(key: string, minGapMs: number): boolean {
    const now = Date.now();
    const last = this.lastMessageAt.get(key) ?? 0;
    if (now - last < minGapMs) return false;
    this.lastMessageAt.set(key, now);
    return true;
  }

  // -------------------------------------------------------------------------
  // La partie
  // -------------------------------------------------------------------------

  private async startTourGame(now: number) {
    const d = this.data!;
    d.timers = d.timers.filter((t) => t.kind !== "tourStart");
    d.pickUntil = null;
    d.ready = [];
    const present = d.seats.filter((s) => s.kind === "bot" || this.isConnected(s.userId));
    if (present.length < 2 || !present.some((s) => s.kind === "human")) {
      await abortToTour(this.env, d.tour!.code, d.code);
      await this.close("Pas assez de joueurs arrivés : la tournée reprend la main.");
      return;
    }
    return this.startGame(now);
  }

  /** Pourquoi les équipes ne permettent pas de jouer (une équipe vide), ou null */
  private teamProblem(settings: EscarmoucheSettings): string | null {
    if (!isTeamMode(settings.mode)) return null;
    const d = this.data!;
    for (const t of [0, 1]) if (!d.seats.some((s) => s.team === t)) return "Chaque équipe doit avoir au moins un soldat : ajoute un bot !";
    return null;
  }

  private async startGame(now: number, ws?: WebSocket) {
    const d = this.data!;
    // L'annonce (revanche ou tournée) est passée
    d.pickUntil = null;
    d.ready = [];
    d.timers = d.timers.filter((t) => t.kind !== "tourStart");
    d.seats = d.seats.filter((x) => x.kind === "bot" || this.isConnected(x.userId));
    this.ensureHost();
    if (d.seats.length < 2) {
      if (ws) this.send(ws, { t: "error", message: "Il faut au moins deux soldats : ajoute un bot !" });
      return this.afterChange([], now);
    }
    if (d.settings.randomRules && !d.tour) {
      d.settings.escarmouche = applyDrawnRules(
        "escarmouche",
        { ...DEFAULT_SETTINGS, ...d.settings.escarmouche },
        DEFAULT_SETTINGS,
        d.settings.randomRules,
      );
    }
    const settings = { ...DEFAULT_SETTINGS, ...d.settings.escarmouche };
    const problem = this.teamProblem(settings);
    if (problem) {
      if (ws) this.send(ws, { t: "error", message: problem });
      return this.afterChange([], now);
    }
    for (const seat of d.seats) {
      seat.autoplay = false;
      seat.disconnectedAt = null;
    }
    d.match = createMatch(
      settings,
      d.seats.map((s) => ({
        id: s.id,
        team: s.team,
        bot: s.kind === "bot",
        primary: s.primary,
        secondary: s.secondary,
        muzzle: s.muzzle,
        extra: s.extra,
      })),
      randomSeed(),
    );
    d.status = "playing";
    d.startedAt = now;
    d.recorded = false;
    d.results = null;
    d.rematch = [];
    d.timers = d.timers.filter((t) => t.kind === "cleanup" || t.kind === "seatCleanup");
    this.queues.clear();
    this.viewLags.clear();
    this.credit.clear();
    this.history = [];
    this.memories.clear();
    this.steps = 0;
    this.sight = new Sight();
    this.watchFeed = [];
    // Le combat attend que chaque joueur présent ait chargé la carte ; son propre compte à rebours (en temps de combat,
    // qui ne court pas pendant l'attente) part au départ commun et en tient lieu
    d.gate = openGate(
      d.seats.filter((s) => s.kind === "human" && this.isConnected(s.userId)).map((s) => s.id),
      now,
      d.gate,
      { countdown: 0 },
    );
    this.lastKey = stateKey(d.match);
    this.systemChat(`Au combat ! ${MODE_INFO[settings.mode].name}, ${MAP_NAMES[d.match.map].name.toLowerCase()}.`);
    if (d.settings.randomRules && !d.tour) this.systemChat(drawNotice("escarmouche", d.settings.randomRules, "start"));
    this.startLoop();
    return this.afterChange([], now);
  }

  private startLoop() {
    if (this.loop) return;
    this.lastTick = Date.now();
    this.acc = 0;
    this.loop = setInterval(() => void this.tick(), TICK_MS);
  }

  private stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  /** Où étaient les soldats à l'heure `vt` (celle où le tireur les voyait), entre deux envois gardés */
  private poseAt = (vt: number): ((i: number) => Pose | null) | null => {
    const h = this.history;
    if (h.length === 0) return null;
    const now = Date.now();
    const t = Math.max(now - REWIND_MS, Math.min(now, vt));
    if (t >= h.at(-1)!.at) return null;
    let k = h.length - 1;
    while (k > 0 && h[k - 1]!.at > t) k--;
    const b = h[k]!;
    const a = h[k - 1] ?? b;
    const span = b.at - a.at;
    const f = span > 0 ? Math.max(0, Math.min(1, (t - a.at) / span)) : 1;
    return (i) => {
      const pa = a.poses[i];
      const pb = b.poses[i];
      if (!pa || !pb) return pb ?? pa ?? null;
      // Celui qui vient de réapparaître (ou de mourir) n'est pas entre deux endroits
      if (!pa.alive || !pb.alive || Math.hypot(pb.x - pa.x, pb.z - pa.z) > 4) return f < 0.5 ? pa : pb;
      return {
        x: pa.x + (pb.x - pa.x) * f,
        y: pa.y + (pb.y - pa.y) * f,
        z: pa.z + (pb.z - pa.z) * f,
        crouch: f < 0.5 ? pa.crouch : pb.crouch,
        alive: true,
      };
    };
  };

  /** Un tour de boucle : les pas reçus sont joués, le monde avance, et tout le monde reçoit où en est la partie */
  private async tick() {
    const d = this.data;
    const m = d?.match;
    if (!d || !m || d.status !== "playing") {
      this.stopLoop();
      return;
    }
    const now = Date.now();
    // Le chargement de chacun : le combat ne court pas (ni le compte à rebours, ni les bots), les pas envoyés entre-temps
    // ne comptent pas ; au départ commun, il part pour tout le monde au même instant
    if (d.gate) {
      this.lastTick = now;
      this.acc = 0;
      this.queues.clear();
      this.credit.clear();
      if (settleGate(d.gate, now)) await this.afterChange([], now);
      if (!gatePassed(d.gate, now)) return;
      d.gate = null;
      await this.afterChange([], now);
      return;
    }
    const elapsed = Math.min(now - this.lastTick, 250);
    this.lastTick = now;
    const events: EscEvent[] = [];

    // Les humains : chacun joue les pas qu'il a envoyés, dans la limite du temps écoulé (personne n'avance plus vite)
    m.fighters.forEach((f, i) => {
      if (f.bot) return;
      const q = this.queues.get(f.id);
      const credit = Math.min(18, (this.credit.get(f.id) ?? 0) + elapsed / STEP_MS);
      let used = 0;
      while (q && q.length > 0 && used + 1 <= credit) {
        const c = q.shift()!;
        applyCmd(m, i, c, this.poseAt, events, spreadRand);
        used++;
      }
      this.credit.set(f.id, credit - used);
    });

    // Le monde et les bots, par pas réguliers
    this.acc += elapsed;
    while (this.acc >= STEP_MS && m.phase !== "over") {
      this.acc -= STEP_MS;
      this.steps++;
      worldStep(m, events);
      m.fighters.forEach((f, i) => {
        if (!f.bot) return;
        let mem = this.memories.get(f.id);
        if (!mem) {
          mem = newBotMemory(i, f.s.yaw);
          mem.seq = f.s.seq;
          this.memories.set(f.id, mem);
        }
        applyCmd(m, i, botCommand(m, i, mem, m.settings.botLevel, now), null, events, spreadRand);
      });
    }
    // Un bot touché se retourne vers le tireur
    for (const e of events) {
      if (e.k !== "hit") continue;
      const v = m.fighters[e.v];
      const mem = v?.bot ? this.memories.get(v.id) : undefined;
      const by = e.a >= 0 ? m.fighters[e.a] : undefined;
      if (mem && by) botHurt(mem, e.a, m.t, by.s.x, by.s.z);
    }

    // L'envoi : à chaque joueur, ce qu'il peut voir ou entendre des autres (sight.ts) et son propre soldat ; aux
    // spectateurs, tout, mais en différé (sinon un second compte qui regarde verrait à travers les murs pour un ami)
    const tick = encodeTick(m, events);
    this.sight.hear(m, events, (i, w) => {
      const seat = this.seatById(m.fighters[i]!.id);
      return seat?.muzzle === "silencieux" && seat.primary === w;
    });
    const { p, e, mk, pg, ...common } = tick;
    const head = JSON.stringify({ t: "tick", now, ...common }).slice(0, -1);
    const part = (x: Pick<EscTick, "p" | "e" | "mk" | "pg">) =>
      `"p":${JSON.stringify(x.p)},"e":${JSON.stringify(x.e)}${x.mk ? `,"mk":${JSON.stringify(x.mk)}` : ""}${x.pg ? `,"pg":${JSON.stringify(x.pg)}` : ""}`;
    this.watchFeed.push({ at: now, text: `${head},${part({ p, e, mk, pg })}}` });
    let late = 0;
    while (late < this.watchFeed.length && this.watchFeed[late]!.at <= now - WATCH_DELAY_MS) late++;
    const due = this.watchFeed.splice(0, late);
    const views = new Map<number, string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (!isLive(ws)) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att || att.replaced) continue;
      const i = fighterIndex(m, att.userId);
      try {
        if (i < 0) {
          for (const d of due) ws.send(d.text);
          continue;
        }
        let body = views.get(i);
        if (body === undefined) {
          body = part(tickFor(m, tick, i, this.sight.mask(m, i)));
          views.set(i, body);
        }
        ws.send(`${head},${body},"me":${JSON.stringify(encodeMe(m, i))}}`);
      } catch {
        // déjà fermée
      }
    }
    this.history.push({ at: now, poses: snapshotPose(m) });
    while (this.history.length > 0 && now - this.history[0]!.at > HISTORY_MS) this.history.shift();

    const key = stateKey(m);
    if (key !== this.lastKey) {
      this.lastKey = key;
      if (m.phase === "over") {
        await this.finishGame(now);
        return;
      }
      this.saveLive();
      this.lastSave = now;
      this.broadcast([]);
    } else if (now - this.lastSave > SAVE_EVERY_MS) {
      this.lastSave = now;
      this.saveLive();
    }
  }

  private async finishGame(now: number) {
    const d = this.data!;
    d.status = "finished";
    this.stopLoop();
    if (d.tour) this.addTimer({ at: now + TOUR_TABLE_LINGER_MS, kind: "cleanup" });
    const m = d.match!;
    if (m.phase !== "over") finish(m);
    if (isTeamMode(m.mode)) {
      const [a, b] = m.scores;
      this.systemChat(
        `Fin du combat : ${a} - ${b}${m.winner === null ? ", égalité" : `, victoire des ${m.winner === 0 ? "Rouges" : "Bleus"}`}.`,
      );
    } else if (m.winner !== null) {
      const f = m.fighters[m.winner]!;
      this.systemChat(`${this.seatById(f.id)?.name ?? "?"} remporte l'escarmouche avec ${f.stats.kills} éliminations !`);
    } else this.systemChat("Fin du combat : égalité en tête.");
    if (d.settings.randomRules && !d.tour) {
      d.settings.randomRules = drawRules("escarmouche", Math.random, d.settings.randomRules);
      this.systemChat(drawNotice("escarmouche", d.settings.randomRules, "next"));
    }
    await this.afterChange([], now);
  }

  private seatById(id: string): Seat | undefined {
    return this.data!.seats.find((s) => s.id === id);
  }

  // -------------------------------------------------------------------------
  // Boucle des minuteurs
  // -------------------------------------------------------------------------

  private async afterChange(events: EscEvent[], now: number, closing?: WebSocket) {
    const d = this.data;
    if (!d) return;
    // Une partie finie est relevée tout de suite, avant la moindre attente : pendant que le hub ou la base répondent,
    // d'autres messages passent, et une revanche lancée entre-temps remplaçait la partie avant qu'elle soit enregistrée
    const recording = this.recordIfNeeded();
    this.releaseAbsent(now);
    await this.persist();
    this.broadcast(events, closing);
    await this.armAlarm();
    await this.syncHub();
    await recording;
  }

  private async recordIfNeeded() {
    const d = this.data;
    const m = d?.match;
    if (!d || !m || d.status !== "finished" || d.recorded || m.phase !== "over") return;
    // Tout ce qui part dans l'historique est lu maintenant, d'un coup : une revanche lancée pendant l'enregistrement
    // n'y change plus rien
    const record = this.recordOf(m, Date.now());
    d.recorded = true;
    await this.persist();
    await this.recordResults(d, m, record);
    this.broadcast([]);
  }

  private addTimer(t: Timer) {
    this.data!.timers.push(t);
  }

  private async armAlarm() {
    const d = this.data;
    // Pendant la partie, une alarme de garde : si l'objet redémarre (une mise en ligne) sans personne pour le rappeler,
    // elle le réveille, la boucle repart et la partie va à son terme
    const watch = d?.status === "playing" ? [Date.now() + WATCHDOG_MS] : [];
    if (!d || d.timers.length + watch.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const next = Math.min(...d.timers.map((t) => t.at), ...watch);
    await this.ctx.storage.setAlarm(Math.max(next, Date.now() + 5));
  }

  override async alarm() {
    const d = this.data;
    if (!d) return;
    const now = Date.now();
    if (d.status === "playing" && d.match) this.startLoop();
    const due = d.timers.filter((t) => t.at <= now + 15).sort((a, b) => a.at - b.at);
    d.timers = d.timers.filter((t) => t.at > now + 15);
    let changed = false;
    for (const t of due) {
      if (!this.data) return;
      if (await this.runTimer(t, now)) changed = true;
    }
    if (!this.data) return;
    // Une place s'est libérée après la partie : si tous ceux qui restent ont demandé la revanche, elle part
    if (changed && this.rematchReady()) return void (await this.openAnnounce(now));
    if (changed) await this.afterChange([], now);
    else {
      await this.persist();
      await this.armAlarm();
    }
  }

  private async runTimer(t: Timer, now: number): Promise<boolean> {
    const d = this.data!;
    const seat = t.seatId ? this.seatById(t.seatId) : undefined;
    switch (t.kind) {
      case "away": {
        if (!seat || seat.disconnectedAt === null || d.status !== "playing" || seat.autoplay) return false;
        seat.autoplay = "away";
        this.handOver(seat);
        this.systemChat(`${seat.name} s'est déconnecté : un bot se bat à sa place en attendant son retour.`);
        return true;
      }
      case "seatCleanup": {
        if (!seat || seat.disconnectedAt === null || d.status === "playing") return false;
        if (this.isConnected(seat.userId)) return false;
        d.seats = d.seats.filter((s) => s !== seat);
        d.rematch = d.rematch.filter((id) => id !== seat.userId);
        this.ensureHost();
        return true;
      }
      case "cleanup":
        if (this.connectedUsers().size > 0) return false;
        await this.destroy();
        return false;
      case "tourStart":
        // Hors tournée : l'annonce de la revanche est passée, la partie part
        if (!d.tour && d.status === "finished" && d.pickUntil) {
          await this.announceDone(now);
          return false;
        }
        if (!d.tour || d.status !== "lobby") return false;
        await this.startTourGame(now);
        return false;
    }
  }

  private async destroy() {
    const d = this.data!;
    this.stopLoop();
    for (const s of d.seats) if (s.userId) void this.setPresence(s.userId, null).catch(() => {});
    await this.hub.removeRoom(d.code).catch(() => {});
    this.data = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /** Ce que la partie finie envoie à l'historique (et à la tournée) */
  private recordOf(m: Match, now: number): GameReport {
    const d = this.data!;
    const teams = isTeamMode(m.mode);
    const statsOf = (i: number): EscarmoucheRecordStats => {
      const f = m.fighters[i]!;
      const won = m.ranks?.[i] === 1 && m.winner !== null;
      return {
        kills: f.stats.kills,
        deaths: f.stats.deaths,
        assists: f.stats.assists,
        headshots: f.stats.headshots,
        damage: Math.round(f.stats.damage),
        shots: f.stats.shots,
        hits: f.stats.hits,
        captures: f.stats.captures,
        returns: f.stats.returns,
        zone: Math.round(f.stats.zone),
        best: f.stats.best,
        knives: f.stats.knives,
        grenadeKills: f.stats.grenadeKills,
        points: f.points,
        won: won ? 1 : 0,
      };
    };
    const players = m.fighters.map((f, i) => {
      const seat = this.seatById(f.id);
      return {
        seat: i,
        userId: seat?.kind === "human" ? seat.userId : null,
        name: seat?.name ?? "?",
        isBot: seat?.kind !== "human",
        absent: Boolean(seat?.autoplay),
        rank: m.ranks?.[i] ?? m.fighters.length,
        score: teams ? m.scores[f.team === 1 ? 1 : 0] : f.stats.kills,
        eliminated: false,
        team: teams ? f.team : null,
        stats: statsOf(i),
      };
    });
    let tour: GameReport["tour"] = null;
    if (d.tour) {
      // La tournée classe ses membres : en équipes, les gagnants devant puis, dans chaque équipe, les points de chacun
      const counted = players.map((p, i) => ({ p, f: m.fighters[i]! })).filter(({ f }) => !f.id.startsWith(TOUR_GUEST_PREFIX));
      const key = (x: (typeof counted)[number]) => -x.p.rank * 100000 + x.f.points;
      tour = {
        code: d.tour.code,
        report: {
          code: d.code,
          index: d.tour.index,
          game: "escarmouche",
          seats: counted.length,
          players: counted.map((c) => ({
            userId: c.p.userId ?? c.f.id,
            rank: 1 + counted.filter((o) => key(o) > key(c)).length,
            stats: { ...c.p.stats },
          })),
        },
      };
    }
    return {
      game: {
        game: "escarmouche",
        mode: m.mode,
        roomCode: d.code,
        settings: m.settings,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: 1,
        players,
      },
      tour,
    };
  }

  /** L'envoi à la tournée et à l'historique ; les points d'Elo s'affichent avec la partie qui les a donnés */
  private async recordResults(d: EscarmoucheData, m: Match, record: GameReport) {
    try {
      if (record.tour) await reportToTour(this.env, record.tour.code, record.tour.report);
      const { unlocked, elo } = await recordGame(this.env.DB, record.game);
      const unlocks = Object.entries(unlocked).map(([userId, ids]) => ({ userId, ids }));
      if (unlocks.length > 0) this.broadcastRaw({ t: "achievements", unlocks });
      // Une revanche partie entre-temps joue une autre partie : ces points-là ne sont pas les siens
      if (this.data === d && d.match === m && Object.keys(elo).length > 0) {
        d.results = elo;
        await this.persist();
      }
    } catch (err) {
      console.error("Enregistrement de la partie d'Escarmouche impossible", err);
    }
  }

  // -------------------------------------------------------------------------
  // Diffusion
  // -------------------------------------------------------------------------

  private setPresence(userId: string, room: PresenceRoom | null): Promise<void> {
    if (this.data?.tour) return Promise.resolve();
    return this.hub.setUserRoom(userId, room);
  }

  private systemChat(text: string) {
    const d = this.data!;
    if (d.tour && d.status !== "lobby") tourChat(this.env, d.tour.code, d.code, text);
    const message: ChatMessage = { id: ++d.chatSeq, userId: null, name: "", text, at: Date.now(), system: true };
    this.pushChat(message);
    this.broadcastRaw({ t: "chat", messages: [message] });
  }

  private pushChat(message: ChatMessage) {
    const d = this.data!;
    d.chat.push(message);
    if (d.chat.length > CHAT_KEEP) d.chat.splice(0, d.chat.length - CHAT_KEEP);
  }

  private viewFor(userId: string, connected: Map<string, PublicUser>): EscarmoucheRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    const teams = MODE_INFO[d.settings.escarmouche.mode].teams;
    return {
      code: d.code,
      game: "escarmouche",
      status: d.status,
      settings: {
        ...d.settings,
        lateJoin: lateJoinOf(d.settings, d.quick),
        escarmouche: { ...DEFAULT_SETTINGS, ...d.settings.escarmouche },
      },
      seats: d.seats.map((s) => ({
        id: s.id,
        kind: s.kind,
        userId: s.userId,
        name: s.name,
        avatar: s.avatar,
        photo: s.photo,
        admin: Boolean(s.admin),
        connected: s.kind === "bot" || connected.has(s.userId!),
        autoplay: Boolean(s.autoplay),
        ...(s.autoplay ? { autoplayReason: s.autoplay } : {}),
        awayAt:
          d.status === "playing" && s.kind === "human" && !s.autoplay && s.disconnectedAt !== null && !connected.has(s.userId!)
            ? s.disconnectedAt + AWAY_AFTER_MS
            : null,
        isHost: s.userId === d.hostId,
        ...(teams ? { team: s.team } : {}),
      })),
      spectators: [...connected.values()].filter((u) => !seatedUsers.has(u.id)).map((u) => ({ userId: u.id, name: u.pseudo })),
      hostId: d.hostId,
      you: { userId, seatId: seat?.id ?? null, isHost: userId === d.hostId, isAdmin: Boolean(connected.get(userId)?.admin) },
      teams: Object.fromEntries(d.seats.map((s) => [s.id, s.team])),
      arsenal: Object.fromEntries(
        d.seats.map((s) => [
          s.id,
          {
            primary: s.primary,
            secondary: s.secondary ?? "pistolet",
            camo: s.camo,
            tenue: s.tenue ?? "perso",
            muzzle: s.muzzle ?? "aucun",
            extra: s.extra ?? "aucun",
          },
        ]),
      ),
      escarmouche: d.match ? escarmoucheView(d.match) : null,
      gate: d.status === "playing" ? (d.gate ?? null) : null,
      startedAt: d.startedAt,
      serverNow: Date.now(),
      rematch: d.rematch,
      results: d.results ?? null,
      quick: d.quick,
      tour: d.tour?.code ?? null,
      pickUntil: d.pickUntil ?? null,
      ready: d.ready ?? [],
    };
  }

  private broadcast(events: EscEvent[], except?: WebSocket) {
    const connected = this.connectedUsers(except);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !isLive(ws)) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: "room", room: this.viewFor(att.userId, connected), events });
    }
  }

  private broadcastRaw(msg: EscarmoucheServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: EscarmoucheServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // déjà fermée
    }
  }

  /** Pendant la partie : on enregistre sans faire attendre les positions en route vers les joueurs */
  private saveLive() {
    if (this.data) void this.ctx.storage.put("room", this.data, { allowUnconfirmed: true });
  }

  private async persist() {
    if (this.data) await this.ctx.storage.put("room", this.data);
  }

  private presenceRoom(): PresenceRoom {
    const d = this.data!;
    return { code: d.code, game: "escarmouche", status: d.status, lateJoin: lateJoinOf(d.settings, d.quick) };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    return {
      code: d.code,
      game: "escarmouche",
      variant: d.settings.escarmouche.mode,
      status: d.status,
      visibility: d.settings.visibility,
      hostName: host?.name ?? "",
      humans: d.seats.filter((s) => s.kind === "human").length,
      bots: d.seats.filter((s) => s.kind === "bot").length,
      maxPlayers: d.settings.maxPlayers,
      names: d.seats.filter((s) => s.kind === "human").map((s) => s.name),
      createdAt: d.createdAt,
      quick: d.quick,
      lateJoin: lateJoinOf(d.settings, d.quick),
    };
  }

  private async syncHub() {
    const d = this.data;
    if (!d) return;
    const summary = this.buildSummary();
    const json = JSON.stringify(summary);
    if (json !== this.lastSummary) {
      this.lastSummary = json;
      await this.hub.upsertRoom(summary).catch((err) => console.error("Hub injoignable", err));
    }
    const presence = JSON.stringify(this.presenceRoom());
    for (const userId of this.connectedUsers().keys()) {
      if (this.lastPresence.get(userId) === presence) continue;
      this.lastPresence.set(userId, presence);
      void this.setPresence(userId, this.presenceRoom()).catch(() => {});
    }
  }
}
