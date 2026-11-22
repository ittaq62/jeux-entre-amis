import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { planThrow, thinkTime } from "../shared/games/bowling/bot.ts";
import { botLook, DEFAULT_LOOK, isBowlingLook, usableLook, type BowlingLook } from "../shared/games/bowling/looks.ts";
import {
  createMatch,
  DEFAULT_CONFIG,
  mergeConfig,
  nextEvent,
  predChoices,
  predict,
  throwBall,
  thrower,
  tickMatch,
  timedOut,
  totals,
  type BotLevel,
  type Match,
  type PredPick,
  WINDUP_MS,
} from "../shared/games/bowling/match.ts";
import {
  BOWLING_MAX_PLAYERS,
  type BowlingClientMessage,
  type BowlingRecordStats,
  type BowlingRoomSettings,
  type BowlingRoomView,
  type BowlingServerMessage,
} from "../shared/games/bowling/net.ts";
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
import { random, randomSeed } from "../shared/rng.ts";
import { variantSettings, type TourInit } from "../shared/tour.ts";
import { applyDrawnRules, drawNotice, drawRules, hostDraw, hostPatch } from "../shared/randomRules.ts";
import type { RoomInit } from "./room.ts";
import { abortToTour, reportToTour, TOUR_JOIN_MS, TOUR_LOCKED, TOUR_PICK_MS, TOUR_TABLE_LINGER_MS, tourChat } from "./tourLink.ts";
import { ownedItems } from "./shop.ts";
import { recordGame } from "./users.ts";
import { isLive, replaceOlder } from "./sockets.ts";
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

// Les habitués de la piste qui complètent la table
const BOT_NAMES = ["Gaston", "Josiane", "Odette", "Fernand", "Germaine", "Marcel", "Paulette", "Lucien", "Simone", "Raymond"];
const AWAY_AFTER_MS = 8000;
const SEAT_RELEASE_MS = 25_000;
/** Pendant la partie, l'alarme de garde ne dort jamais plus longtemps */
const WATCHDOG_MS = 60_000;
const CHAT_KEEP = 80;
/** La boucle de la partie : le temps, les bots */
const LOOP_MS = 100;
/** Le niveau des bots de la tournée, traduit pour le bowling */
const TOUR_LEVEL: Record<string, BotLevel> = { easy: "facile", normal: "moyen", hard: "fort" };

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
  look: BowlingLook;
}

type TimerKind = "away" | "seatCleanup" | "cleanup" | "tourStart";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
}

interface BowlingData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: BowlingRoomSettings;
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
  results?: Record<string, { elo: number; delta: number }> | null;
  tour?: TourInit | null;
  watchers?: string[];
  pickUntil?: number | null;
  ready?: string[];
}

interface Attachment {
  userId: string;
  user: PublicUser;
  replaced?: boolean;
}

/** Une table de bowling : le salon commun, puis une partie où chacun lance à son tour. */
export class BowlingRoom extends DurableObject<Env> {
  private data: BowlingData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();
  private loop: ReturnType<typeof setInterval> | null = null;
  /** Quand le bot (ou le joueur remplacé) dont c'est le tour lancera, pour quel lancer */
  private botAt: { n: number; at: number } | null = null;
  /** Les paris que les bots feront sur le lancer qui vient */
  private botPreds = new Map<string, { n: number; at: number; pick: PredPick }>();
  private botRng = { rng: 1 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<BowlingData>("room")) ?? null;
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
      settings: { visibility: opts.visibility, maxPlayers: 4, lateJoin: defaultLateJoin(opts.quick), bowling: { ...DEFAULT_CONFIG } },
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

  /** Table d'une tournée : tout le monde est déjà assis, les bots aussi ; les équipes de la tournée s'il y en a */
  private seatTour(tour: TourInit, now: number) {
    const d = this.data!;
    const humans: Seat[] = tour.players.map((u) => ({ ...this.newHumanSeat(u), disconnectedAt: now }));
    const taken: string[] = [];
    const bots: Seat[] = tour.bots.map((b, i) => {
      const look = botLook(taken, i * 7 + 3);
      taken.push(look.color);
      return {
        id: b.id,
        kind: "bot",
        userId: null,
        name: b.name,
        avatar: b.avatar,
        photo: 0,
        autoplay: false,
        disconnectedAt: null,
        team: 0,
        look,
      };
    });
    d.seats = [...humans, ...bots];
    if (tour.teams) for (const s of d.seats) s.team = tour.teams[s.userId ?? s.id] ?? 0;
    d.settings.bowling = mergeConfig(d.settings.bowling, {
      frames: 3,
      ...variantSettings("bowling", tour.variant),
      teams: Boolean(tour.teams),
      botLevel: TOUR_LEVEL[tour.botLevel] ?? "moyen",
    });
    d.settings.maxPlayers = Math.min(BOWLING_MAX_PLAYERS, Math.max(MIN_PLAYERS, d.seats.length));
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
      midGame: JOINS_STARTED.bowling,
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
        if (d.status === "playing") this.systemChat(`${seat.name} est de retour sur la piste.`);
      }
      if (d.status !== "playing") {
        seat.name = user.pseudo;
        seat.avatar = user.avatar;
        seat.photo = user.photo;
      }
    } else if (decision === "seat" && d.status !== "playing") {
      seat = this.seatHuman(user) ?? undefined;
      if (seat) this.systemChat(`${user.pseudo} enfile ses chaussures.`);
    }
    if (!seat) {
      d.watchers = rememberWatcher(d.watchers, user.id);
      this.systemChat(`${user.pseudo} regarde la partie.`);
    }
    this.ensureHost();
    this.send(ws, { t: "chat", messages: d.chat, reset: true });
    if (d.tour && d.status === "lobby" && !d.pickUntil && d.seats.every((s) => s.kind === "bot" || this.isConnected(s.userId))) {
      // Tout le monde est là : l'annonce, puis la partie part
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
      // La boule de départ tant qu'il n'a rien choisi (l'appareil envoie aussitôt son skin)
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
      if (d.status === "playing") this.addTimer({ at: now + AWAY_AFTER_MS, kind: "away", seatId: seat.id });
      else this.addTimer({ at: now + SEAT_RELEASE_MS, kind: "seatCleanup", seatId: seat.id });
    }
    if (this.connectedUsers(ws).size === 0) {
      this.addTimer({ at: now + (d.status === "playing" ? 20 : 10) * 60_000, kind: "cleanup" });
    }
    void this.setPresence(att.userId, null).catch(() => {});
    await this.afterChange(now, ws);
  }

  /** L'écran d'annonce est ouvert : avant une partie de tournée, ou avant la revanche (hors tournée) */
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
    return this.afterChange(now);
  }

  /** Ce qui empêche une partie de partir avec les joueurs présents, ou null (on peut jouer seul au bowling) */
  private startProblem(): string | null {
    const seats = this.data!.seats.filter((s) => s.kind === "bot" || this.isConnected(s.userId));
    return seats.length < 1 ? "Personne sur la piste." : null;
  }

  /** L'annonce de la revanche est finie (compte à rebours, ou tous prêts) : la partie part, ou la table dit pourquoi */
  private async announceDone(now: number) {
    const d = this.data!;
    const problem = this.startProblem();
    if (!problem) return this.startGame(now);
    d.pickUntil = null;
    d.ready = [];
    d.rematch = [];
    d.timers = d.timers.filter((t) => t.kind !== "tourStart");
    this.systemChat(`La partie ne peut pas partir. ${problem}`);
    return this.afterChange(now);
  }

  /** La revanche part : la partie est finie et tous les joueurs restés à la table l'ont demandée */
  private rematchReady(): boolean {
    const d = this.data!;
    if (d.status !== "finished" || d.rematch.length === 0) return false;
    return d.seats.filter((s) => s.kind === "human" && this.isConnected(s.userId)).every((s) => d.rematch.includes(s.userId!));
  }

  /** Après la partie, la place d'un joueur parti pendant le jeu se libère comme au salon */
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
    if (!d || typeof raw !== "string" || raw.length > 4000) return;
    let msg: BowlingClientMessage;
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
      case "throw": {
        const m = d.match;
        if (!seat || !m || d.status !== "playing" || seat.autoplay || msg.n !== m.throws) return;
        if (!this.allowMessage(`throw:${userId}`, 300)) return;
        const r = throwBall(m, seat.id, { x: Number(msg.x), d: Number(msg.d), v: Number(msg.v), s: Number(msg.s) }, now);
        if (typeof r === "string") return error(r);
        this.botAt = null;
        return this.afterChange(now);
      }

      case "pose": {
        // La pose du lanceur : les autres le voient se placer et prendre son élan
        const m = d.match;
        if (!seat || !m || d.status !== "playing" || thrower(m)?.id !== seat.id) return;
        if (![msg.x, msg.d, msg.k].every((v) => typeof v === "number" && Number.isFinite(v))) return;
        if (!this.allowMessage(`pose:${userId}`, 45)) return;
        const r3 = (v: number) => Math.round(v * 1000) / 1000;
        const text = JSON.stringify({ t: "pose", id: seat.id, x: r3(msg.x), d: r3(msg.d), k: r3(msg.k), sw: Boolean(msg.sw) });
        for (const other of this.ctx.getWebSockets()) {
          if (other === ws) continue;
          try {
            other.send(text);
          } catch {
            // déjà fermée
          }
        }
        return;
      }

      case "predict": {
        const m = d.match;
        if (!m || d.status !== "playing" || !this.allowMessage(`predict:${userId}`, 200)) return;
        const who = seat ? seat.id : `w:${userId}`;
        const r = predict(m, who, msg.pick);
        if (r) return error(r);
        return this.afterChange(now);
      }

      case "look": {
        if (!seat || d.status === "playing" || !isBowlingLook(msg.look) || !this.allowMessage(`look:${userId}`, 120)) return;
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

      case "ready": {
        if (!this.announcing() || !seat || !this.allowMessage(`ready:${userId}`, 150)) return;
        d.ready = [...new Set([...(d.ready ?? []), userId])];
        if (this.allReady()) return d.tour ? this.startTourGame(now) : this.announceDone(now);
        return this.afterChange(now);
      }

      case "sit": {
        if (seat || d.tour || !maySit(this.arrivalCase(userId, "play"))) return;
        if (!this.seatHuman(att.user)) return error("La table est complète.");
        d.watchers = forgetWatcher(d.watchers, userId);
        this.systemChat(`${att.user.pseudo} enfile ses chaussures.`);
        return this.afterChange(now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            this.systemChat(`${seat.name} a quitté la partie, un bot lance à sa place.`);
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
          this.systemChat(lateJoinNotice("bowling", msg.lateJoin));
          if (d.status === "playing") return this.afterChange(now);
        }
        if (d.status === "playing") return msg.lateJoin === undefined ? error("On ne change pas les règles en pleine partie.") : undefined;
        const current = { ...DEFAULT_CONFIG, ...d.settings.bowling };
        const drawn = d.tour ? null : hostDraw("bowling", d.settings.randomRules, current, DEFAULT_CONFIG, msg.randomRules, Math.random);
        if (drawn) {
          d.settings.randomRules = drawn.draw;
          d.settings.bowling = drawn.settings;
          this.systemChat(drawn.notice);
        }
        d.settings.bowling = mergeConfig(d.settings.bowling, hostPatch("bowling", d.settings.randomRules, msg.settings ?? {}));
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= MIN_PLAYERS && max <= BOWLING_MAX_PLAYERS) {
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
        if (d.seats.length >= d.settings.maxPlayers) return error("La table est complète.");
        const used = new Set(d.seats.map((s) => s.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Joueur ${d.botCounter + 1}`;
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
          look: botLook(
            d.seats.map((s) => s.look.color),
            d.botCounter * 13 + 5,
          ),
        });
        return this.afterChange(now);
      }

      case "removeSeat": {
        if (d.status === "playing") return;
        const target = d.seats.find((s) => s.id === msg.seatId);
        if (!target || target.userId === userId) return;
        d.seats = d.seats.filter((s) => s !== target);
        if (target.kind === "human") this.systemChat(`${target.name} a été retiré de la table.`);
        return this.afterChange(now);
      }

      case "kick": {
        if (typeof msg.userId !== "string" || msg.userId === userId) return;
        return this.kickUser(msg.userId, now);
      }

      case "start": {
        if (d.status === "playing") return;
        // Après une partie, « Rejouer » passe par l'annonce, comme la revanche ; ce qui l'empêche se dit tout de suite
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
  // La partie
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
    if (d.seats.length < 1) {
      if (ws) this.send(ws, { t: "error", message: "Personne sur la piste." });
      return this.afterChange(now);
    }
    for (const seat of d.seats) {
      seat.autoplay = false;
      seat.disconnectedAt = null;
    }
    if (d.settings.randomRules && !d.tour) {
      d.settings.bowling = applyDrawnRules("bowling", { ...DEFAULT_CONFIG, ...d.settings.bowling }, DEFAULT_CONFIG, d.settings.randomRules);
    }
    const cfg = { ...DEFAULT_CONFIG, ...d.settings.bowling };
    const seed = randomSeed();
    d.match = createMatch(
      cfg,
      d.seats.map((s) => ({ id: s.id, team: cfg.teams ? s.team : 0 })),
      seed,
      now,
    );
    this.botRng = { rng: seed ^ 0x5bd1e995 };
    this.botAt = null;
    this.botPreds.clear();
    d.status = "playing";
    d.startedAt = now;
    d.recorded = false;
    d.results = null;
    d.rematch = [];
    d.timers = d.timers.filter((t) => t.kind === "cleanup" || t.kind === "seatCleanup");
    this.systemChat(
      cfg.mode === "spares" ? `Défi des spares en ${cfg.frames} manches : bonne partie !` : `${cfg.frames} frames : bonne partie !`,
    );
    if (d.settings.randomRules && !d.tour) this.systemChat(drawNotice("bowling", d.settings.randomRules, "start"));
    this.startLoop();
    return this.afterChange(now);
  }

  private startLoop() {
    if (this.loop) return;
    this.loop = setInterval(() => void this.tick(), LOOP_MS);
  }

  private stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  private async tick() {
    const d = this.data;
    const m = d?.match;
    if (!d || !m || d.status !== "playing") {
      this.stopLoop();
      return;
    }
    const now = Date.now();
    let changed = tickMatch(m, now);
    if (m.phase === "over") return this.finishGame(now);
    const p = thrower(m);
    if (p && m.phase === "aim") {
      const seat = d.seats.find((s) => s.id === p.id);
      const auto = !seat || seat.kind === "bot" || Boolean(seat.autoplay);
      const level: BotLevel = seat?.kind === "bot" ? (d.settings.bowling.botLevel ?? "moyen") : "moyen";
      const left = Boolean(seat?.look.left);
      const late = timedOut(m, now);
      if (late && !auto) {
        // Le temps est écoulé : un bot lance pour lui
        this.systemChat(`Temps écoulé : un bot lance pour ${seat?.name ?? "le joueur"}.`);
        const r = throwBall(m, p.id, planThrow(m, "moyen", left, this.botRng), now, true, WINDUP_MS);
        if (typeof r !== "string") changed = true;
      } else if (auto) {
        if (!this.botAt || this.botAt.n !== m.throws)
          this.botAt = { n: m.throws, at: Math.max(now, m.phaseAt) + thinkTime(level, this.botRng) };
        else if (now >= this.botAt.at || late) {
          this.botAt = null;
          const r = throwBall(m, p.id, planThrow(m, level, left, this.botRng), now, seat?.kind !== "bot", WINDUP_MS);
          if (typeof r !== "string") changed = true;
        }
      }
      if (this.botPredict(m, now)) changed = true;
    }
    if (changed) {
      this.broadcast();
      this.saveLive();
      await this.armAlarm();
    }
  }

  /** Les bots parient aussi, un peu après que le lanceur s'est mis en place */
  private botPredict(m: Match, now: number): boolean {
    const d = this.data!;
    if (!m.cfg.pronostics) return false;
    let changed = false;
    const choices = predChoices(m);
    for (const s of d.seats) {
      if (s.kind !== "bot" || s.id === thrower(m)?.id || m.preds[s.id]) continue;
      let plan = this.botPreds.get(s.id);
      if (!plan || plan.n !== m.throws) {
        // Ils parient plutôt sur un beau lancer, parfois sur la cata
        const r = random(this.botRng);
        const pick: PredPick = choices.length === 2 ? (r < 0.6 ? "spare" : "rate") : r < 0.45 ? "strike" : r < 0.85 ? "reste" : "cata";
        plan = { n: m.throws, at: now + 1200 + random(this.botRng) * 2500, pick };
        this.botPreds.set(s.id, plan);
      }
      if (now >= plan.at && !predict(m, s.id, plan.pick)) changed = true;
    }
    return changed;
  }

  private async finishGame(now: number) {
    const d = this.data!;
    if (d.status !== "playing") return;
    d.status = "finished";
    this.stopLoop();
    this.botAt = null;
    this.botPreds.clear();
    if (d.tour) this.addTimer({ at: now + TOUR_TABLE_LINGER_MS, kind: "cleanup" });
    const m = d.match!;
    const ranks = m.ranks ?? [];
    const first = m.players.map((p, i) => (ranks[i] === 1 ? p.id : null)).filter(Boolean) as string[];
    const names = first.map((id) => d.seats.find((s) => s.id === id)?.name ?? "?");
    const tot = totals(m);
    const best = Math.max(...tot);
    const unit = m.cfg.mode === "spares" ? "points" : "";
    if (m.cfg.teams) this.systemChat(`Victoire de l'équipe de ${names.join(", ")} !`);
    else if (names.length === 1) this.systemChat(`${names[0]} gagne la partie avec ${best}${unit ? ` ${unit}` : ""} !`);
    else if (names.length > 1) this.systemChat(`Victoire de ${names.join(", ")} avec ${best}${unit ? ` ${unit}` : ""} !`);
    if (d.settings.randomRules && !d.tour) {
      d.settings.randomRules = drawRules("bowling", Math.random, d.settings.randomRules);
      this.systemChat(drawNotice("bowling", d.settings.randomRules, "next"));
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
    if (!d || d.status !== "finished" || d.recorded || d.match?.phase !== "over") return;
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
    // Pendant la partie, une alarme de garde : si l'objet redémarre sans personne pour le rappeler, elle le réveille,
    // la boucle repart et la partie va à son terme
    const next = d?.status === "playing" && d.match ? nextEvent(d.match) : null;
    const watch = d?.status === "playing" ? [Math.min(Date.now() + WATCHDOG_MS, next ?? Infinity)] : [];
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
    if (d.status === "playing" && d.match) this.startLoop();
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
        this.systemChat(`${seat.name} s'est déconnecté : un bot lance à sa place en attendant son retour.`);
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
    const m = d.match!;
    try {
      const ranks = m.ranks ?? m.players.map(() => 1);
      const tot = totals(m);
      const classic10 = m.cfg.mode === "classique" && m.cfg.frames === 10;
      const players = m.players.map((p, i) => {
        const seat = d.seats.find((s) => s.id === p.id);
        const stats: BowlingRecordStats = {
          score: tot[i]!,
          full: classic10 ? tot[i]! : 0,
          strikes: p.stats.strikes,
          spares: p.stats.spares,
          gutters: p.stats.gutters,
          splitsMade: p.stats.splitsMade,
          bestRun: p.stats.bestRun,
          perfect: classic10 && tot[i] === 300 ? 1 : 0,
          seer: m.seers[p.id]?.points ?? 0,
          won: ranks[i] === 1 ? 1 : 0,
        };
        return {
          seat: i,
          userId: seat?.kind === "human" ? seat.userId : null,
          name: seat?.name ?? "?",
          isBot: seat?.kind !== "human",
          absent: Boolean(seat?.autoplay),
          rank: ranks[i]!,
          score: tot[i]!,
          eliminated: false,
          team: m.cfg.teams ? p.team : null,
          stats,
        };
      });
      if (d.tour) {
        await reportToTour(this.env, d.tour.code, {
          code: d.code,
          index: d.tour.index,
          game: "bowling",
          seats: players.length,
          players: players.map((p) => ({ userId: p.userId ?? m.players[p.seat]!.id, rank: p.rank, stats: { ...p.stats } })),
        });
      }
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "bowling",
        mode: m.cfg.mode,
        roomCode: d.code,
        settings: m.cfg,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: m.cfg.frames,
        players,
      });
      const unlocks = Object.entries(unlocked).map(([userId, ids]) => ({ userId, ids }));
      if (unlocks.length > 0) this.broadcastRaw({ t: "achievements", unlocks });
      if (this.data === d && Object.keys(elo).length > 0) {
        d.results = elo;
        await this.persist();
        this.broadcast();
      }
    } catch (err) {
      console.error("Enregistrement de la partie de bowling impossible", err);
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

  private viewFor(userId: string, connected: Map<string, PublicUser>): BowlingRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    const cfg = { ...DEFAULT_CONFIG, ...d.settings.bowling };
    let match: BowlingRoomView["bowling"] = null;
    if (d.match) {
      const { rng: _rng, ...rest } = d.match;
      void _rng;
      match = rest;
    }
    return {
      code: d.code,
      game: "bowling",
      status: d.status,
      settings: { ...d.settings, lateJoin: lateJoinOf(d.settings, d.quick), bowling: cfg },
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
      bowling: match,
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
  }

  private broadcastRaw(msg: BowlingServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: BowlingServerMessage) {
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
    return { code: d.code, game: "bowling", status: d.status, lateJoin: lateJoinOf(d.settings, d.quick) };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    return {
      code: d.code,
      game: "bowling",
      variant: d.settings.bowling.mode,
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
