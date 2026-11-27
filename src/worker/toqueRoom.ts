import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { botInput, forgetBrain, newBotTable, newBrain, type BotBrain, type BotTable } from "../shared/games/toque/bot.ts";
import { isOpen, type StarBook } from "../shared/games/toque/campaign.ts";
import { KITCHENS, type KitchenId } from "../shared/games/toque/kitchens.ts";
import { botLook, DEFAULT_LOOK, isToqueLook, usableLook, type ToqueLook } from "../shared/games/toque/looks.ts";
import {
  DEFAULT_CONFIG,
  mergeConfig,
  MODE_NAMES,
  packInputs,
  packWorld,
  SAMPLE_STRIDE,
  TOQUE_MAX_PLAYERS,
  type TeamResult,
  type ToqueClientMessage,
  type ToqueOwner,
  type ToqueRecordStats,
  type ToqueResult,
  type ToqueRoomSettings,
  type ToqueRoomView,
  type ToqueServerMessage,
  type ToqueView,
} from "../shared/games/toque/net.ts";
import {
  createWorld,
  FPS,
  NO_INPUT,
  OVER_S,
  starsOf as starsForScore,
  starThresholds,
  step,
  type Input,
  type ToqueEvent,
  type World,
} from "../shared/games/toque/sim.ts";
import {
  CHAT_MAX,
  MIN_PLAYERS,
  REACTIONS,
  TAUNTS,
  type ChatMessage,
  type PresenceRoom,
  type PublicUser,
  type RoomStatus,
  type RoomSummary,
} from "../shared/protocol.ts";
import { forgetPlayer, gatePassed, markLoaded, openGate, settleGate, type LoadGate } from "../shared/loadGate.ts";
import { randomSeed } from "../shared/rng.ts";
import type { StarAwardResult } from "../shared/stars.ts";
import { variantSettings, type TourInit } from "../shared/tour.ts";
import { applyDrawnRules, drawNotice, drawRules, hostDraw, hostPatch } from "../shared/randomRules.ts";
import type { RoomInit } from "./room.ts";
import { abortToTour, reportToTour, TOUR_JOIN_MS, TOUR_LOCKED, TOUR_PICK_MS, TOUR_TABLE_LINGER_MS, tourChat } from "./tourLink.ts";
import { ownedItems } from "./shop.ts";
import { awardStars, starsOf } from "./stars.ts";
import { recordGame } from "./users.ts";
import { isLive, replaceOlder } from "./sockets.ts";
import { emptyTableDelay, LEFT_EMPTY_MS, nextHost } from "./tableLife.ts";
import { decodeHeaderJson } from "./util.ts";
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
import { ANNOUNCE_MS } from "../shared/announce.ts";

// Les commis qui complètent la brigade
const BOT_NAMES = ["Lulu", "Dédé", "Momo", "Josette", "Riton", "Nini", "Fifi", "Bébert", "Zaza", "Titi"];
const AWAY_AFTER_MS = 8000;
const SEAT_RELEASE_MS = 25_000;
const WATCHDOG_MS = 60_000;
const CHAT_KEEP = 80;
/** La boucle : le service avance par trentièmes de seconde ; tout le monde reçoit la cuisine quinze fois par seconde */
const LOOP_MS = 16;
const STEP_MS = 1000 / FPS;
const SEND_EVERY = 2;
const SAVE_EVERY_MS = 10_000;
/** Les commandes en attente d'un joueur amortissent les à-coups du réseau (voir Culbute) */
const QUEUE_LOW = 2;
const QUEUE_DRAIN = 60;
const QUEUE_MAX = 16;
const QUEUE_KEEP = 3;
/** Plus rien d'un joueur depuis une demi-seconde : il lâche tout */
const STALE_STEPS = 15;
const SEQ_RESTART = 300;
/** Le niveau des commis de la tournée */
const TOUR_LEVEL: Record<string, "facile" | "moyen" | "fort"> = { easy: "facile", normal: "moyen", hard: "fort" };

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
  look: ToqueLook;
}

type TimerKind = "away" | "seatCleanup" | "cleanup" | "tourStart";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
}

interface ToqueData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: ToqueRoomSettings;
  status: RoomStatus;
  seats: Seat[];
  botCounter: number;
  world: World | null;
  view: ToqueView | null;
  startedAt: number | null;
  rematch: string[];
  chat: ChatMessage[];
  chatSeq: number;
  timers: Timer[];
  kicked: string[];
  recorded: boolean;
  results?: Record<string, { elo: number; delta: number }> | null;
  tour?: TourInit | null;
  watchers?: string[];
  pickUntil?: number | null;
  ready?: string[];
  gate?: LoadGate | null;
  /** Les étoiles de chacun à la fin du service (on les renvoie à qui revient) */
  stars?: Record<string, StarAwardResult> | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
  replaced?: boolean;
}

interface InputQueue {
  samples: { seq: number; input: Input }[];
  lastSeq: number;
  ack: number;
  last: Input;
  stamp: number;
  starved: number;
  low: number;
  since: number;
}

/** Une cuisine de Toque ! : le salon commun, puis un service où chacun mène son chef. */
export class ToqueRoom extends DurableObject<Env> {
  private data: ToqueData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private acc = 0;
  private steps = 0;
  private lastSave = 0;
  private queues = new Map<string, InputQueue>();
  private lastInputs: Input[] = [];
  private pendingEvents: ToqueEvent[] = [];
  private brains = new Map<number, BotBrain>();
  private botTable: BotTable = newBotTable();
  private lastPhase = -1;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<ToqueData>("room")) ?? null;
      if (this.data?.status === "playing" && this.data.world) this.startLoop();
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
      settings: {
        visibility: opts.visibility,
        maxPlayers: TOQUE_MAX_PLAYERS,
        lateJoin: defaultLateJoin(opts.quick),
        toque: { ...DEFAULT_CONFIG },
      },
      status: "lobby",
      seats: [],
      botCounter: 0,
      world: null,
      view: null,
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

  /** Table d'une tournée : tout le monde est déjà assis, les commis aussi ; les équipes de la tournée s'il y en a */
  private seatTour(tour: TourInit, now: number) {
    const d = this.data!;
    const humans: Seat[] = tour.players.map((u) => ({ ...this.newHumanSeat(u), disconnectedAt: now }));
    const bots: Seat[] = tour.bots.map((b, i) => ({
      id: b.id,
      kind: "bot",
      userId: null,
      name: b.name,
      avatar: b.avatar,
      photo: 0,
      autoplay: false,
      disconnectedAt: null,
      team: 0,
      look: botLook(i * 7 + 3),
    }));
    d.seats = [...humans, ...bots].slice(0, TOQUE_MAX_PLAYERS);
    if (tour.teams) for (const s of d.seats) s.team = tour.teams[s.userId ?? s.id] ?? 0;
    // En tournée, toujours deux brigades face à face : il faut un classement
    d.settings.toque = mergeConfig(d.settings.toque, {
      mode: "duel",
      ...variantSettings("toque", tour.variant),
      botLevel: TOUR_LEVEL[tour.botLevel] ?? "moyen",
    });
    d.settings.maxPlayers = Math.min(TOQUE_MAX_PLAYERS, Math.max(MIN_PLAYERS, d.seats.length));
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
      midGame: JOINS_STARTED.toque,
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
        this.forgetSeatBrain(seat.id);
        if (d.status === "playing") this.systemChat(`${seat.name} est de retour aux fourneaux.`);
      }
      if (d.status !== "playing") {
        seat.name = user.pseudo;
        seat.avatar = user.avatar;
        seat.photo = user.photo;
      }
    } else if (decision === "seat" && d.status !== "playing") {
      seat = this.seatHuman(user) ?? undefined;
      if (seat) this.systemChat(`${user.pseudo} enfile son tablier.`);
    }
    if (!seat) {
      d.watchers = rememberWatcher(d.watchers, user.id);
      this.systemChat(`${user.pseudo} regarde le service.`);
    }
    this.ensureHost();
    this.send(ws, { t: "chat", messages: d.chat, reset: true });
    const stars = d.stars?.[user.id];
    if (stars && d.status === "finished") this.send(ws, { t: "stars", result: stars });
    if (d.tour && d.status === "lobby" && !d.pickUntil && d.seats.every((s) => s.kind === "bot" || this.isConnected(s.userId))) {
      d.pickUntil = now + TOUR_PICK_MS;
      d.timers = d.timers.filter((t) => t.kind !== "tourStart");
      d.timers.push({ at: d.pickUntil, kind: "tourStart" });
    }
    await this.afterChange(now);
    void this.setPresence(user.id, this.presenceRoom()).catch(() => {});
  }

  private newHumanSeat(user: PublicUser): Seat {
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
      team: 0,
      look: { ...DEFAULT_LOOK },
    };
  }

  private seatHuman(user: PublicUser): Seat | null {
    const d = this.data!;
    const seat = this.newHumanSeat(user);
    const inTeam = (t: 0 | 1) => d.seats.filter((s) => s.team === t).length;
    seat.team = inTeam(0) <= inTeam(1) ? 0 : 1;
    if (d.seats.length < d.settings.maxPlayers) {
      d.seats.push(seat);
      return seat;
    }
    for (let i = d.seats.length - 1; i >= 0; i--) {
      if (d.seats[i]!.kind === "bot") {
        seat.team = d.seats[i]!.team;
        d.seats[i] = seat;
        return seat;
      }
    }
    return null;
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
      if (forgetPlayer(d.gate, seat.id)) settleGate(d.gate, now);
      if (d.status === "playing") this.addTimer({ at: now + AWAY_AFTER_MS, kind: "away", seatId: seat.id });
      else this.addTimer({ at: now + SEAT_RELEASE_MS, kind: "seatCleanup", seatId: seat.id });
    }
    if (this.connectedUsers(ws).size === 0) {
      this.addTimer({ at: now + emptyTableDelay(d.status), kind: "cleanup" });
    }
    this.ensureHost();
    void this.setPresence(att.userId, null).catch(() => {});
    await this.afterChange(now, ws);
  }

  private announcing(): boolean {
    const d = this.data!;
    return d.tour ? d.status === "lobby" : d.status === "finished" && Boolean(d.pickUntil);
  }

  private allReady(): boolean {
    const d = this.data!;
    const ready = d.ready ?? [];
    const humans = d.seats.filter((s) => s.kind === "human");
    if (d.tour) return humans.every((s) => this.isConnected(s.userId) && ready.includes(s.userId!));
    const here = humans.filter((s) => this.isConnected(s.userId));
    return here.length > 0 && here.every((s) => ready.includes(s.userId!));
  }

  private async openAnnounce(now: number) {
    const d = this.data!;
    if (d.status === "finished" && !d.pickUntil) {
      d.pickUntil = now + ANNOUNCE_MS;
      d.ready = [];
      d.timers = d.timers.filter((t) => t.kind !== "tourStart");
      d.timers.push({ at: d.pickUntil, kind: "tourStart" });
    }
    return this.afterChange(now);
  }

  private startProblem(): string | null {
    if (!this.data!.seats.some((s) => s.kind === "human" && this.isConnected(s.userId))) return "Il faut au moins un chef aux fourneaux.";
    return null;
  }

  private async announceDone(now: number) {
    const d = this.data!;
    const problem = this.startProblem();
    if (!problem) return this.startGame(now);
    d.pickUntil = null;
    d.ready = [];
    d.rematch = [];
    d.timers = d.timers.filter((t) => t.kind !== "tourStart");
    this.systemChat(`Le service ne peut pas commencer. ${problem}`);
    return this.afterChange(now);
  }

  private rematchReady(): boolean {
    const d = this.data!;
    if (d.status !== "finished" || d.rematch.length === 0) return false;
    const here = d.seats.filter((s) => s.kind === "human" && this.isConnected(s.userId));
    return here.length > 0 && here.every((s) => d.rematch.includes(s.userId!));
  }

  private releaseAbsent(now: number) {
    const d = this.data!;
    if (d.status === "playing" || d.tour) return;
    for (const s of d.seats) {
      if (s.kind !== "human" || s.disconnectedAt === null || this.isConnected(s.userId)) continue;
      if (d.timers.some((t) => t.kind === "seatCleanup" && t.seatId === s.id)) continue;
      this.addTimer({ at: Math.max(now, s.disconnectedAt + SEAT_RELEASE_MS), kind: "seatCleanup", seatId: s.id });
    }
  }

  /**
   * L'hôte n'est plus là (sans place, ou `absent` : parti, remplacé par un commis) : la main passe à un joueur présent
   * (voir tableLife.ts)
   */
  private ensureHost(absent?: string) {
    const d = this.data!;
    const next = nextHost(d.seats, d.hostId, this.connectedUsers(), absent);
    if (!next) return;
    d.hostId = next.id;
    this.systemChat(`${next.name} prend la main sur la cuisine.`);
  }

  // -------------------------------------------------------------------------
  // Messages des joueurs
  // -------------------------------------------------------------------------

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const d = this.data;
    if (!d || typeof raw !== "string" || raw.length > 4000) return;
    let msg: ToqueClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
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
      case "in": {
        // Les commandes : jamais enregistrées, seulement mises en file
        if (!seat || !d.world || d.status !== "playing" || seat.autoplay) return;
        this.queueInputs(seat.id, msg.s, msg.d, msg.c);
        return;
      }

      case "look": {
        if (!seat || d.status === "playing" || !isToqueLook(msg.look) || !this.allowMessage(`look:${userId}`, 120)) return;
        const owned = await ownedItems(this.env.DB, userId);
        const live = this.data;
        if (live !== d || !live || live.status === "playing" || !live.seats.includes(seat)) return;
        seat.look = usableLook(msg.look, (item) => owned.has(item));
        return this.afterChange(now);
      }

      case "team": {
        if (!seat || d.status === "playing" || (msg.team !== 0 && msg.team !== 1)) return;
        if (seat.team === msg.team || !this.allowMessage(`team:${userId}`, 150)) return;
        seat.team = msg.team;
        return this.afterChange(now);
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
        if (!seat || d.status !== "playing" || !markLoaded(d.gate, seat.id, msg.gate)) return;
        settleGate(d.gate, now);
        return this.afterChange(now);
      }

      case "ready": {
        if (!this.announcing() || !seat || !this.allowMessage(`ready:${userId}`, 150)) return;
        d.ready = [...new Set([...(d.ready ?? []), userId])];
        if (this.allReady()) return d.tour ? this.startTourGame(now) : this.announceDone(now);
        return this.afterChange(now);
      }

      case "sit": {
        if (seat || d.tour || !maySit(this.arrivalCase(userId, "play"))) return;
        if (!this.seatHuman(att.user)) return error("La brigade est complète.");
        d.watchers = forgetWatcher(d.watchers, userId);
        this.systemChat(`${att.user.pseudo} enfile son tablier.`);
        this.ensureHost();
        return this.afterChange(now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            if (forgetPlayer(d.gate, seat.id)) settleGate(d.gate, now);
            this.systemChat(`${seat.name} a quitté le service, un commis prend sa place.`);
          } else {
            d.seats = d.seats.filter((s) => s !== seat);
            d.rematch = d.rematch.filter((id) => id !== userId);
            this.systemChat(`${seat.name} a quitté la cuisine.`);
          }
        }
        for (const other of this.ctx.getWebSockets(userId)) {
          try {
            other.close(1000, "Au revoir");
          } catch {
            // déjà fermée
          }
        }
        // L'hôte qui s'en va passe la main tout de suite, même en plein service (sa place gardée pour un commis ne la retient plus)
        this.ensureHost(userId);
        void this.setPresence(userId, null).catch(() => {});
        // Plus personne : la cuisine ferme presque aussitôt, au lieu de laisser ses commis servir seuls
        if (this.connectedUsers().size === 0) this.addTimer({ at: now + LEFT_EMPTY_MS, kind: "cleanup" });
        if (this.rematchReady()) return this.openAnnounce(now);
        return this.afterChange(now, ws);
      }

      case "rematch": {
        if (d.status !== "finished" || !seat || d.rematch.includes(userId)) return;
        d.rematch.push(userId);
        if (this.rematchReady()) return this.openAnnounce(now);
        return this.afterChange(now);
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
          this.systemChat(lateJoinNotice("toque", msg.lateJoin));
          if (d.status === "playing") return this.afterChange(now);
        }
        if (d.status === "playing") return msg.lateJoin === undefined ? error("On ne change pas de cuisine en plein service.") : undefined;
        const current = { ...DEFAULT_CONFIG, ...d.settings.toque };
        const drawn = d.tour ? null : hostDraw("toque", d.settings.randomRules, current, DEFAULT_CONFIG, msg.randomRules, Math.random);
        if (drawn) {
          d.settings.randomRules = drawn.draw;
          d.settings.toque = drawn.settings;
          this.systemChat(drawn.notice);
        }
        d.settings.toque = mergeConfig(d.settings.toque, hostPatch("toque", d.settings.randomRules, msg.settings ?? {}));
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= MIN_PLAYERS && max <= TOQUE_MAX_PLAYERS) {
            while (d.seats.length > max) {
              const botIndex = d.seats.map((s) => s.kind).lastIndexOf("bot");
              if (botIndex < 0) break;
              d.seats.splice(botIndex, 1);
            }
            d.settings.maxPlayers = Math.max(max, d.seats.length);
          }
        }
        return this.afterChange(now);
      }

      case "addBot": {
        if (d.status === "playing") return;
        if (d.seats.length >= d.settings.maxPlayers) return error("La brigade est complète.");
        this.addBotSeat();
        return this.afterChange(now);
      }

      case "removeSeat": {
        if (d.status === "playing") return;
        const target = d.seats.find((s) => s.id === msg.seatId);
        if (!target || target.userId === userId) return;
        d.seats = d.seats.filter((s) => s !== target);
        if (target.kind === "human") this.systemChat(`${target.name} a été retiré de la cuisine.`);
        if (target.userId) d.rematch = d.rematch.filter((id) => id !== target.userId);
        if (this.rematchReady()) return this.openAnnounce(now);
        return this.afterChange(now);
      }

      case "kick": {
        if (typeof msg.userId !== "string" || msg.userId === userId) return;
        return this.kickUser(msg.userId, now);
      }

      case "start": {
        if (d.status === "playing") return;
        if (d.status === "finished" && !d.tour) {
          const problem = this.startProblem() ?? (await this.lockProblem());
          if (problem) return this.send(ws, { t: "error", message: problem });
          return this.openAnnounce(now);
        }
        const locked = await this.lockProblem();
        if (locked) return this.send(ws, { t: "error", message: locked });
        return this.startGame(now, ws);
      }
    }
  }

  /** La cuisine de la campagne choisie n'est pas encore ouverte pour l'hôte (en duel, toutes les cuisines se jouent) */
  private async lockProblem(): Promise<string | null> {
    const d = this.data;
    if (!d || d.tour || d.settings.toque.mode !== "service") return null;
    const kitchen = d.settings.toque.kitchen;
    if (kitchen === "bistrot") return null;
    const host = d.seats.find((s) => s.userId === d.hostId);
    if (!host?.userId) return null;
    const stars = await starsOf(this.env.DB, host.userId);
    const maps = stars.games.toque?.maps ?? {};
    const book: StarBook = {};
    for (const [k, v] of Object.entries(maps)) book[k as KitchenId] = v.stars;
    return isOpen(kitchen, book)
      ? null
      : `« ${KITCHENS[kitchen].name} » n'est pas encore ouverte : gagne des étoiles sur la route de la roulotte.`;
  }

  private async kickUser(target: string, now: number) {
    const d = this.data!;
    if (!d.kicked.includes(target)) d.kicked.push(target);
    const seat = d.seats.find((s) => s.userId === target);
    if (seat) {
      if (d.status === "playing") {
        seat.autoplay = "away";
        seat.disconnectedAt = now;
      } else {
        d.seats = d.seats.filter((s) => s !== seat);
      }
      this.systemChat(`${seat.name} a été exclu de la cuisine.`);
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
    d.rematch = d.rematch.filter((id) => id !== target);
    if (this.rematchReady()) return this.openAnnounce(now);
    return this.afterChange(now);
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
  // Les commandes des joueurs
  // -------------------------------------------------------------------------

  private queueInputs(seatId: string, first: unknown, data: unknown, stamp: unknown) {
    if (typeof first !== "number" || !Array.isArray(data) || data.length > SAMPLE_STRIDE * 30) return;
    let q = this.queues.get(seatId);
    if (!q) {
      q = { samples: [], lastSeq: 0, ack: 0, last: NO_INPUT, stamp: 0, starved: 0, low: 0, since: 0 };
      this.queues.set(seatId, q);
    }
    if (Math.floor(first) < q.lastSeq - SEQ_RESTART) {
      q.samples = [];
      q.lastSeq = Math.floor(first) - 1;
      q.ack = 0;
      q.last = NO_INPUT;
    }
    const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);
    for (let i = 0; i + SAMPLE_STRIDE <= data.length; i += SAMPLE_STRIDE) {
      const seq = Math.floor(first) + i / SAMPLE_STRIDE;
      if (seq <= q.lastSeq) continue;
      q.lastSeq = seq;
      q.samples.push({
        seq,
        input: {
          x: num(data[i], -1, 1),
          y: num(data[i + 1], -1, 1),
          held: num(data[i + 2], 0, 15) | 0,
          pressed: num(data[i + 3], 0, 15) | 0,
        },
      });
    }
    if (typeof stamp === "number" && Number.isFinite(stamp)) q.stamp = stamp;
  }

  /** La commande d'un joueur pour ce pas : la suivante de sa file, ou la dernière tenue s'il n'y en a pas */
  private nextInput(seatId: string): Input {
    const q = this.queues.get(seatId);
    if (!q) return NO_INPUT;
    if (q.samples.length > QUEUE_MAX) {
      let pressed = 0;
      while (q.samples.length > QUEUE_KEEP) pressed |= q.samples.shift()!.input.pressed;
      q.samples[0]!.input.pressed |= pressed;
      q.low = q.samples.length;
      q.since = 0;
    } else {
      q.low = Math.min(q.low, q.samples.length);
      if (++q.since >= QUEUE_DRAIN) {
        if (q.low >= QUEUE_LOW) {
          const drop = q.samples.shift()!;
          q.samples[0]!.input.pressed |= drop.input.pressed;
        }
        q.low = q.samples.length;
        q.since = 0;
      }
    }
    const next = q.samples.shift();
    if (!next) {
      q.starved += 1;
      return q.starved > STALE_STEPS ? NO_INPUT : { ...q.last, pressed: 0 };
    }
    q.starved = 0;
    q.ack = next.seq;
    q.last = next.input;
    return next.input;
  }

  private forgetSeatBrain(seatId: string) {
    const owner = this.data?.view?.owners.findIndex((o) => o.seat === seatId) ?? -1;
    const w = this.data?.world;
    if (owner < 0 || !w) return;
    for (const c of w.chefs) {
      if (c.owner !== owner) continue;
      this.brains.delete(c.slot);
      forgetBrain(this.botTable, c.slot);
    }
  }

  // -------------------------------------------------------------------------
  // Le service
  // -------------------------------------------------------------------------

  private async startTourGame(now: number) {
    const d = this.data!;
    d.timers = d.timers.filter((t) => t.kind !== "tourStart");
    d.pickUntil = null;
    d.ready = [];
    const present = d.seats.filter((s) => s.kind === "bot" || this.isConnected(s.userId));
    if (present.length < MIN_PLAYERS || !present.some((s) => s.kind === "human")) {
      await abortToTour(this.env, d.tour!.code, d.code);
      await this.close("Pas assez de joueurs arrivés : la tournée reprend la main.");
      return;
    }
    return this.startGame(now);
  }

  private async startGame(now: number, ws?: WebSocket) {
    const d = this.data!;
    d.pickUntil = null;
    d.ready = [];
    d.timers = d.timers.filter((t) => t.kind !== "tourStart");
    d.seats = d.seats.filter((x) => x.kind === "bot" || this.isConnected(x.userId));
    this.ensureHost();
    if (!d.seats.some((s) => s.kind === "human")) {
      if (ws) this.send(ws, { t: "error", message: "Personne aux fourneaux." });
      return this.afterChange(now);
    }
    if (d.settings.randomRules && !d.tour) {
      d.settings.toque = applyDrawnRules("toque", { ...DEFAULT_CONFIG, ...d.settings.toque }, DEFAULT_CONFIG, d.settings.randomRules);
    }
    const cfg = { ...DEFAULT_CONFIG, ...d.settings.toque };
    const duel = cfg.mode === "duel";
    // Seul : un commis vient l'aider (ou il mènera deux chefs) ; en duel, chaque équipe a au moins un chef, et autant
    // de chefs que l'autre
    const humans = d.seats.filter((s) => s.kind === "human");
    if (!duel && humans.length === 1 && d.seats.length === 1 && cfg.solo === "commis") {
      this.addBotSeat();
      this.systemChat(`${d.seats[d.seats.length - 1]!.name} vient te donner un coup de main.`);
    }
    if (duel) {
      for (const s of d.seats) if (s.team !== 0 && s.team !== 1) s.team = 0;
      const count = (t: 0 | 1) => d.seats.filter((s) => s.team === t).length;
      if (count(0) === 0 || count(1) === 0) {
        // Tout le monde du même côté : on répartit
        d.seats.forEach((s, i) => (s.team = (i % 2) as 0 | 1));
      }
      while (count(0) !== count(1) && d.seats.length < TOQUE_MAX_PLAYERS) {
        this.addBotSeat();
        d.seats[d.seats.length - 1]!.team = count(0) < count(1) ? 0 : 1;
      }
      if (count(0) === 0 || count(1) === 0) {
        this.addBotSeat();
        d.seats[d.seats.length - 1]!.team = count(0) === 0 ? 0 : 1;
      }
    }
    for (const seat of d.seats) {
      seat.autoplay = false;
      seat.disconnectedAt = null;
    }
    const seed = randomSeed();
    const twoChefs = !duel && humans.length === 1 && d.seats.length === 1 && cfg.solo === "deux";
    const owners: ToqueOwner[] = d.seats.map((s) => ({
      seat: s.id,
      team: duel ? s.team : 0,
      chefs: twoChefs ? 2 : 1,
      bot: s.kind === "bot",
    }));
    const world = createWorld(cfg.kitchen, duel, owners, seed, { rush: cfg.rush });
    d.world = world;
    d.view = {
      config: cfg,
      kitchen: cfg.kitchen,
      duel,
      owners,
      seed,
      goals: world.teams.map((t) => starThresholds(cfg.kitchen, t.chefs)),
      result: null,
    };
    this.queues.clear();
    this.brains.clear();
    this.botTable = newBotTable();
    this.pendingEvents = [];
    this.lastInputs = owners.map(() => NO_INPUT);
    d.stars = null;
    // Le service attend que chacun ait chargé la cuisine ; l'introduction (le tour de la cuisine, « Prêts ? ») part au
    // départ commun et tient lieu de compte à rebours
    d.gate = openGate(
      d.seats.filter((s) => s.kind === "human" && this.isConnected(s.userId)).map((s) => s.id),
      now,
      d.gate,
      { countdown: 0 },
    );
    d.status = "playing";
    d.startedAt = now;
    d.recorded = false;
    d.results = null;
    d.rematch = [];
    d.timers = d.timers.filter((t) => t.kind === "cleanup" || t.kind === "seatCleanup");
    this.lastPhase = -1;
    this.systemChat(
      duel
        ? `${KITCHENS[cfg.kitchen].name}, l'un contre l'autre : en cuisine !`
        : `${KITCHENS[cfg.kitchen].name} : en cuisine, et bon service !`,
    );
    if (d.settings.randomRules && !d.tour) this.systemChat(drawNotice("toque", d.settings.randomRules, "start"));
    this.startLoop();
    return this.afterChange(now);
  }

  /** Un commis de plus dans la brigade */
  private addBotSeat() {
    const d = this.data!;
    const used = new Set(d.seats.map((s) => s.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Commis ${d.botCounter + 1}`;
    const inTeam = (t: 0 | 1) => d.seats.filter((s) => s.team === t).length;
    d.seats.push({
      id: `bot-${++d.botCounter}`,
      kind: "bot",
      userId: null,
      name,
      avatar: seededAvatar(`${name}-${d.code}`),
      photo: 0,
      autoplay: false,
      disconnectedAt: null,
      team: inTeam(0) <= inTeam(1) ? 0 : 1,
      look: botLook(d.botCounter * 13 + 5),
    });
  }

  private startLoop() {
    if (this.loop) return;
    this.lastTick = Date.now();
    this.acc = 0;
    this.loop = setInterval(() => void this.tick(), LOOP_MS);
  }

  private stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  /** Les commandes de ce pas : chaque joueur, et les commis (ou ceux qu'un commis remplace) */
  private inputs(w: World): Input[] {
    const d = this.data!;
    const view = d.view!;
    const level = view.config.botLevel;
    return view.owners.map((o, owner) => {
      const seat = d.seats.find((s) => s.id === o.seat);
      if (seat && seat.kind === "human" && !seat.autoplay) return this.nextInput(seat.id);
      const slot = w.active[owner] ?? -1;
      if (slot < 0) return NO_INPUT;
      let brain = this.brains.get(slot);
      if (!brain) {
        brain = newBrain(slot, seat?.kind === "bot" ? level : "moyen", view.seed);
        this.brains.set(slot, brain);
      }
      return botInput(w, slot, brain, this.botTable);
    });
  }

  private async tick() {
    const d = this.data;
    const w = d?.world;
    if (!d || !w || d.status !== "playing") {
      this.stopLoop();
      return;
    }
    const now = Date.now();
    if (d.gate) {
      const settled = settleGate(d.gate, now);
      this.lastTick = now;
      this.acc = 0;
      this.queues.clear();
      if (!gatePassed(d.gate, now)) {
        if (settled) {
          this.saveLive();
          this.broadcast();
        }
        return;
      }
      d.gate = null;
      this.saveLive();
      this.broadcast();
      return;
    }
    this.acc += Math.min(now - this.lastTick, 200);
    this.lastTick = now;
    let stepped = 0;
    while (this.acc >= STEP_MS && stepped < 8) {
      this.acc -= STEP_MS;
      stepped++;
      const inputs = this.inputs(w);
      this.lastInputs = inputs;
      this.pendingEvents.push(...step(w, inputs));
      this.steps++;
      if (this.steps % SEND_EVERY === 0) this.sendTick(w, now);
    }
    if (stepped === 0) return;
    if (w.phase !== this.lastPhase) {
      this.lastPhase = w.phase;
      this.broadcast();
    }
    if (w.phase === 2 && w.frame >= w.end + Math.round(OVER_S * FPS)) {
      this.sendTick(w, now);
      await this.finishGame(now);
      return;
    }
    if (now - this.lastSave > SAVE_EVERY_MS) {
      this.lastSave = now;
      this.saveLive();
    }
  }

  /** La cuisine à tous, avec les accusés de réception de chacun */
  private sendTick(w: World, now: number) {
    const d = this.data!;
    const view = d.view!;
    const acks: number[] = [];
    const stamps: number[] = [];
    for (const o of view.owners) {
      const q = this.queues.get(o.seat);
      acks.push(q?.ack ?? 0);
      stamps.push(q?.stamp ?? 0);
    }
    const events = this.pendingEvents;
    this.pendingEvents = [];
    const text = JSON.stringify({ t: "tick", now, w: packWorld(w), k: acks, c: stamps, u: packInputs(this.lastInputs), e: events });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private async finishGame(now: number) {
    const d = this.data!;
    if (d.status !== "playing") return;
    d.status = "finished";
    this.stopLoop();
    if (d.tour) this.addTimer({ at: now + TOUR_TABLE_LINGER_MS, kind: "cleanup" });
    const w = d.world!;
    const view = d.view!;
    const teams: TeamResult[] = w.teams.map((t) => ({
      score: t.score,
      served: t.served,
      failed: t.failed,
      tips: t.tips,
      best: t.best,
      stars: view.duel ? 0 : starsForScore(view.kitchen, t.chefs, t.score),
    }));
    const winner = view.duel ? (teams[0]!.score > teams[1]!.score ? 0 : teams[1]!.score > teams[0]!.score ? 1 : null) : null;
    const result: ToqueResult = { teams, winner, chefs: w.chefs.map((c) => ({ ...c.st, owner: c.owner })) };
    view.result = result;
    const t0 = teams[0]!;
    if (view.duel) {
      const names = (team: number) =>
        view.owners
          .filter((o) => o.team === team)
          .map((o) => d.seats.find((s) => s.id === o.seat)?.name ?? "?")
          .join(" et ");
      if (winner === null) this.systemChat(`Égalité parfaite, ${teams[0]!.score} points partout !`);
      else
        this.systemChat(
          `${names(winner)} gagne${view.owners.filter((o) => o.team === winner).length > 1 ? "nt" : ""} le duel, ${teams[winner]!.score} points à ${teams[1 - winner]!.score} !`,
        );
    } else {
      const s = t0.stars;
      this.systemChat(
        `Service terminé : ${t0.score} points, ${t0.served} plat${t0.served > 1 ? "s" : ""} servi${t0.served > 1 ? "s" : ""}${s > 0 ? `, ${"★".repeat(s)}` : ""}.`,
      );
    }
    if (d.settings.randomRules && !d.tour) {
      d.settings.randomRules = drawRules("toque", Math.random, d.settings.randomRules);
      this.systemChat(drawNotice("toque", d.settings.randomRules, "next"));
    }
    await this.afterChange(now);
  }

  // -------------------------------------------------------------------------
  // Minuteurs
  // -------------------------------------------------------------------------

  private async afterChange(now: number, closing?: WebSocket) {
    const d = this.data;
    if (!d) return;
    this.releaseAbsent(now);
    await this.persist();
    this.broadcast(closing);
    await this.armAlarm();
    await this.syncHub();
    await this.recordIfNeeded();
  }

  private async recordIfNeeded() {
    const d = this.data;
    if (!d || d.status !== "finished" || d.recorded || !d.view?.result) return;
    d.recorded = true;
    await this.persist();
    await this.recordResults(Date.now());
    this.broadcast();
  }

  private addTimer(t: Timer) {
    this.data!.timers.push(t);
  }

  private async armAlarm() {
    const d = this.data;
    const watch = d?.status === "playing" ? [Date.now() + WATCHDOG_MS] : [];
    if (!d || d.timers.length + watch.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const at = Math.min(...d.timers.map((t) => t.at), ...watch);
    await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 5));
  }

  override async alarm() {
    const d = this.data;
    if (!d) return;
    const now = Date.now();
    if (d.status === "playing" && d.world) this.startLoop();
    const due = d.timers.filter((t) => t.at <= now + 15).sort((a, b) => a.at - b.at);
    d.timers = d.timers.filter((t) => t.at > now + 15);
    let changed = false;
    for (const t of due) {
      if (!this.data) return;
      if (await this.runTimer(t, now)) changed = true;
    }
    if (!this.data) return;
    if (changed && this.rematchReady()) return void (await this.openAnnounce(now));
    if (changed) await this.afterChange(now);
    else {
      await this.persist();
      await this.armAlarm();
    }
  }

  private async runTimer(t: Timer, now: number): Promise<boolean> {
    const d = this.data!;
    const seat = t.seatId ? d.seats.find((s) => s.id === t.seatId) : undefined;
    switch (t.kind) {
      case "away": {
        if (!seat || seat.disconnectedAt === null || d.status !== "playing" || seat.autoplay) return false;
        seat.autoplay = "away";
        this.queues.delete(seat.id);
        this.systemChat(`${seat.name} s'est déconnecté : un commis tient son poste en attendant son retour.`);
        // L'hôte coupé le temps qu'un commis le remplace : la main passe à un joueur présent
        if (seat.userId === d.hostId) this.ensureHost(seat.userId);
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

  private async recordResults(now: number) {
    const d = this.data!;
    const view = d.view!;
    const w = d.world!;
    const result = view.result!;
    try {
      const players = view.owners.map((o, i) => {
        const seat = d.seats.find((s) => s.id === o.seat);
        const team = result.teams[o.team]!;
        const mine = result.chefs.filter((c) => c.owner === i);
        const sum = (k: keyof (typeof mine)[number]) => mine.reduce((n, c) => n + (c[k] as number), 0);
        const rank = view.duel ? (result.winner === null ? 1 : result.winner === o.team ? 1 : 2) : 1;
        const stats: ToqueRecordStats = {
          score: team.score,
          stars: team.stars,
          served: team.served,
          failed: team.failed,
          tips: team.tips,
          best: team.best,
          chopped: sum("chopped"),
          washed: sum("washed"),
          fires: sum("fires"),
          thrown: sum("thrown"),
          caught: sum("caught"),
          falls: sum("falls"),
          plated: sum("served"),
          duelWon: view.duel && result.winner === o.team ? 1 : 0,
          perfect: !view.duel && team.failed === 0 && team.served >= 4 ? 1 : 0,
          three: team.stars >= 3 ? 1 : 0,
          kitchen: view.kitchen,
        };
        return {
          seat: i,
          userId: seat?.kind === "human" ? seat.userId : null,
          name: seat?.name ?? "?",
          isBot: seat?.kind !== "human",
          absent: Boolean(seat?.autoplay),
          rank,
          score: team.score,
          eliminated: false,
          team: view.duel ? o.team : 0,
          stats,
        };
      });
      if (d.tour) {
        await reportToTour(this.env, d.tour.code, {
          code: d.code,
          index: d.tour.index,
          game: "toque",
          seats: players.length,
          players: players.map((p) => {
            const { kitchen: _kitchen, ...stats } = p.stats;
            void _kitchen;
            return { userId: p.userId ?? view.owners[p.seat]!.seat, rank: p.rank, stats };
          }),
        });
      }
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "toque",
        mode: view.config.mode,
        roomCode: d.code,
        settings: view.config,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: 1,
        players,
        // En brigade : pas d'adversaire, les étoiles font les points (et le succès d'avoir « gagné » le service)
        ...(view.duel ? {} : { coopStars: result.teams[0]!.stars }),
      });
      const unlocks = Object.entries(unlocked).map(([userId, ids]) => ({ userId, ids }));
      // Les étoiles de la cuisine (en brigade seulement), pour chaque joueur encore là
      if (!view.duel) {
        d.stars = {};
        for (const p of players) {
          if (!p.userId || p.absent) continue;
          const r = await awardStars(this.env.DB, {
            userId: p.userId,
            game: "toque",
            map: view.kitchen,
            value: result.teams[0]!.score,
            stars: result.teams[0]!.stars,
          });
          if (!r) continue;
          d.stars[p.userId] = r;
          for (const ws of this.ctx.getWebSockets(p.userId)) this.send(ws, { t: "stars", result: r });
          if (r.unlocked.length > 0) {
            const u = unlocks.find((x) => x.userId === p.userId);
            if (u) u.ids.push(...r.unlocked);
            else unlocks.push({ userId: p.userId, ids: [...r.unlocked] });
          }
        }
      }
      if (unlocks.length > 0) this.broadcastRaw({ t: "achievements", unlocks });
      if (this.data === d && Object.keys(elo).length > 0) d.results = elo;
      if (this.data === d) await this.persist();
      void w;
    } catch (err) {
      console.error("Enregistrement du service impossible", err);
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
    const message: ChatMessage = { id: ++d.chatSeq, userId: null, name: "", text, at: Date.now(), system: true };
    if (d.tour && d.status !== "lobby") tourChat(this.env, d.tour.code, d.code, text);
    this.pushChat(message);
    this.broadcastRaw({ t: "chat", messages: [message] });
  }

  private pushChat(message: ChatMessage) {
    const d = this.data!;
    d.chat.push(message);
    if (d.chat.length > CHAT_KEEP) d.chat.splice(0, d.chat.length - CHAT_KEEP);
  }

  private viewFor(userId: string, connected: Map<string, PublicUser>): ToqueRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    const cfg = { ...DEFAULT_CONFIG, ...d.settings.toque };
    return {
      code: d.code,
      game: "toque",
      status: d.status,
      settings: { ...d.settings, lateJoin: lateJoinOf(d.settings, d.quick), toque: cfg },
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
        team: s.team,
        look: s.look,
      })),
      spectators: [...connected.values()].filter((u) => !seatedUsers.has(u.id)).map((u) => ({ userId: u.id, name: u.pseudo })),
      hostId: d.hostId,
      you: { userId, seatId: seat?.id ?? null, isHost: userId === d.hostId, isAdmin: Boolean(connected.get(userId)?.admin) },
      teams: Object.fromEntries(d.seats.map((s) => [s.id, s.team])),
      toque: d.view,
      gate: d.status === "playing" ? (d.gate ?? null) : null,
      serverNow: Date.now(),
      rematch: d.rematch,
      results: d.results ?? null,
      quick: d.quick,
      tour: d.tour?.code ?? null,
      pickUntil: d.pickUntil ?? null,
      ready: d.ready ?? [],
    };
  }

  private broadcast(except?: WebSocket) {
    const connected = this.connectedUsers(except);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !isLive(ws)) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: "room", room: this.viewFor(att.userId, connected) });
    }
    // Celui qui arrive (ou revient) en plein service reçoit tout de suite la cuisine
    const w = this.data?.world;
    if (w && this.data?.status === "playing" && this.data.view) this.sendTick(w, Date.now());
  }

  private broadcastRaw(msg: ToqueServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: ToqueServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // déjà fermée
    }
  }

  private saveLive() {
    if (this.data) void this.ctx.storage.put("room", this.data, { allowUnconfirmed: true });
  }

  private async persist() {
    if (this.data) await this.ctx.storage.put("room", this.data);
  }

  private presenceRoom(): PresenceRoom {
    const d = this.data!;
    return { code: d.code, game: "toque", status: d.status, lateJoin: lateJoinOf(d.settings, d.quick) };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    return {
      code: d.code,
      game: "toque",
      variant: d.settings.toque.mode === "duel" ? "duel" : d.settings.toque.kitchen,
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

void MODE_NAMES;
