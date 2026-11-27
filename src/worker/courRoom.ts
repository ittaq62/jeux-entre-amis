import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { CHAPTER_BY_ID, chapterScore, RIVAL_AVATAR, RIVAL_NAME } from "../shared/games/cour/campaign.ts";
import { DEFAULT_CONFIG, mergeConfig, type BotLevel, type CourConfig } from "../shared/games/cour/config.ts";
import { EPREUVE_INFO } from "../shared/games/cour/epreuves.ts";
import { botLook, DEFAULT_LOOK, isCourLook, usableLook, type CourLook } from "../shared/games/cour/looks.ts";
import {
  createMatch,
  matchInput,
  matchView,
  nextWake,
  skipCinematic,
  tickMatch,
  type EpInput,
  type Hooks,
  type Match,
  type MatchView,
} from "../shared/games/cour/match.ts";
import { CROWD_NAMES } from "../shared/games/cour/names.ts";
import {
  COUR_MAX_PLAYERS,
  type CampaignRun,
  type Candidate,
  type CourClientMessage,
  type CourRecordStats,
  type CourRoomSettings,
  type CourRoomView,
  type CourServerMessage,
} from "../shared/games/cour/net.ts";
import {
  CHAT_MAX,
  REACTIONS,
  TAUNTS,
  type ChatMessage,
  type PresenceRoom,
  type PublicUser,
  type RoomStatus,
  type RoomSummary,
} from "../shared/protocol.ts";
import { forgetPlayer, gatePassed, markLoaded, openGate, settleGate, type LoadGate } from "../shared/loadGate.ts";
import { randomSeed, shuffle } from "../shared/rng.ts";
import { variantSettings, type TourInit } from "../shared/tour.ts";
import { applyDrawnRules, drawNotice, drawRules, hostDraw, hostPatch } from "../shared/randomRules.ts";
import { emptyTableDelay, LEFT_EMPTY_MS, nextHost } from "./tableLife.ts";
import type { RoomInit } from "./room.ts";
import { abortToTour, reportToTour, TOUR_JOIN_MS, TOUR_LOCKED, TOUR_PICK_MS, TOUR_TABLE_LINGER_MS, tourChat } from "./tourLink.ts";
import { ownedItems } from "./shop.ts";
import { awardStars } from "./stars.ts";
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

const AWAY_AFTER_MS = 8000;
const SEAT_RELEASE_MS = 25_000;
const WATCHDOG_MS = 60_000;
const CHAT_KEEP = 80;
/** La boucle de la partie : vingt pas par seconde */
const LOOP_MS = 50;
/** Les épreuves où tout bouge sans cesse : la partie part à chaque pas ; les autres, quatre fois par seconde */
const LIVE_EPS = new Set(["soleil", "corde", "chaises", "epervier", "polochons"]);
const TOUR_LEVEL: Record<string, BotLevel> = { easy: "facile", normal: "moyen", hard: "fort" };

interface Seat {
  id: string;
  kind: "human";
  userId: string;
  name: string;
  avatar: AvatarConfig;
  photo: number;
  admin?: boolean;
  autoplay: false | "away";
  disconnectedAt: number | null;
  look: CourLook;
}

type TimerKind = "away" | "seatCleanup" | "cleanup" | "tourStart";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
}

interface CourData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: CourRoomSettings;
  status: RoomStatus;
  seats: Seat[];
  match: Match | null;
  roster: Candidate[] | null;
  startedAt: number | null;
  rematch: string[];
  chat: ChatMessage[];
  chatSeq: number;
  timers: Timer[];
  kicked: string[];
  recorded: boolean;
  results?: Record<string, { elo: number; delta: number }> | null;
  tour?: TourInit | null;
  /** Les bots de la tournée assis à cette table (ils comptent dans la foule, avec leur nom) */
  tourBots?: { id: string; name: string; avatar: AvatarConfig }[];
  watchers?: string[];
  pickUntil?: number | null;
  ready?: string[];
  gate?: LoadGate | null;
  campaign?: CampaignRun | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
  replaced?: boolean;
}

/** Une table de La Cour des Grands : le salon des vrais joueurs, puis le grand jeu avec la foule des candidats. */
export class CourRoom extends DurableObject<Env> {
  private data: CourData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private lastSent = 0;
  private lastPhase = "";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<CourData>("room")) ?? null;
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
      settings: {
        visibility: opts.visibility,
        maxPlayers: COUR_MAX_PLAYERS,
        lateJoin: defaultLateJoin(opts.quick),
        cour: { ...DEFAULT_CONFIG },
      },
      status: "lobby",
      seats: [],
      match: null,
      roster: null,
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

  /** Table d'une tournée : les joueurs déjà assis ; ses bots entrent dans la foule */
  private seatTour(tour: TourInit, now: number) {
    const d = this.data!;
    d.seats = tour.players.map((u) => ({ ...this.newHumanSeat(u), disconnectedAt: now }));
    d.tourBots = tour.bots;
    // En tournée : un grand jeu court (trois épreuves et la finale) ou une épreuve seule, avec seize candidats
    d.settings.cour = mergeConfig(d.settings.cour, {
      candidates: 16,
      duree: "courte",
      ...variantSettings("cour", tour.variant),
      botLevel: TOUR_LEVEL[tour.botLevel] ?? "moyen",
    });
    d.hostId = d.seats[0]?.userId ?? d.hostId;
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
      midGame: JOINS_STARTED.cour,
      watcher: (d.watchers ?? []).includes(userId),
      friend: false,
      room: d.seats.length < d.settings.maxPlayers && !d.campaign,
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
        if (d.status === "playing") this.systemChat(`${seat.name} est de retour dans la cour.`);
      }
      if (d.status !== "playing") {
        seat.name = user.pseudo;
        seat.avatar = user.avatar;
        seat.photo = user.photo;
      }
    } else if (decision === "seat" && d.status !== "playing" && !d.campaign) {
      seat = this.seatHuman(user) ?? undefined;
      if (seat) this.systemChat(`${user.pseudo} s'inscrit comme candidat.`);
    }
    if (!seat) {
      d.watchers = rememberWatcher(d.watchers, user.id);
      this.systemChat(`${user.pseudo} s'installe dans les gradins.`);
    }
    this.ensureHost();
    this.send(ws, { t: "chat", messages: d.chat, reset: true });
    if (d.tour && d.status === "lobby" && !d.pickUntil && d.seats.every((s) => this.isConnected(s.userId))) {
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
      look: { ...DEFAULT_LOOK },
    };
  }

  private seatHuman(user: PublicUser): Seat | null {
    const d = this.data!;
    if (d.seats.length >= d.settings.maxPlayers) return null;
    const seat = this.newHumanSeat(user);
    d.seats.push(seat);
    return seat;
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
    if (d.tour) return d.seats.every((s) => this.isConnected(s.userId) && ready.includes(s.userId));
    const here = d.seats.filter((s) => this.isConnected(s.userId));
    return here.length > 0 && here.every((s) => ready.includes(s.userId));
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
    if (!this.data!.seats.some((s) => this.isConnected(s.userId))) return "Il faut au moins un candidat inscrit.";
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
    this.systemChat(`La partie ne peut pas partir. ${problem}`);
    return this.afterChange(now);
  }

  private rematchReady(): boolean {
    const d = this.data!;
    if (d.status !== "finished" || d.rematch.length === 0 || d.campaign) return false;
    const here = d.seats.filter((s) => this.isConnected(s.userId));
    return here.length > 0 && here.every((s) => d.rematch.includes(s.userId));
  }

  private releaseAbsent(now: number) {
    const d = this.data!;
    if (d.status === "playing" || d.tour) return;
    for (const s of d.seats) {
      if (s.disconnectedAt === null || this.isConnected(s.userId)) continue;
      if (d.timers.some((t) => t.kind === "seatCleanup" && t.seatId === s.id)) continue;
      this.addTimer({ at: Math.max(now, s.disconnectedAt + SEAT_RELEASE_MS), kind: "seatCleanup", seatId: s.id });
    }
  }

  /**
   * L'hôte n'est plus là (sans place, ou `absent` : parti, remplacé par l'ordinateur) : la main passe à un joueur présent
   * (voir tableLife.ts)
   */
  private ensureHost(absent?: string) {
    const d = this.data!;
    const next = nextHost(d.seats, d.hostId, this.connectedUsers(), absent);
    if (!next) return;
    d.hostId = next.id;
    this.systemChat(`${next.name} prend la main sur la table.`);
  }

  // -------------------------------------------------------------------------
  // Messages des joueurs
  // -------------------------------------------------------------------------

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const d = this.data;
    if (!d || typeof raw !== "string" || raw.length > 8000) return;
    let msg: CourClientMessage;
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
        // Un geste pendant l'épreuve : du candidat, ou de l'ancien candidat devenu épervier
        const m = d.match;
        if (!seat || !m || d.status !== "playing" || seat.autoplay || !msg.i || typeof msg.i !== "object") return;
        if (
          !this.allowMessage(
            `in:${userId}:${(msg.i as EpInput).k}`,
            (msg.i as EpInput).k === "trace" || (msg.i as EpInput).k === "move" ? 30 : 60,
          )
        )
          return;
        if (matchInput(m, seat.id, msg.i, now, this.hooks())) this.sendMatch(now, true);
        return;
      }

      case "skip": {
        const m = d.match;
        if (!seat || !m || d.status !== "playing") return;
        if (skipCinematic(m, seat.id)) this.sendMatch(now, true);
        return;
      }

      case "campagne": {
        // Un chapitre de la campagne : l'hôte, seul à sa table, contre la foule
        const chapter = CHAPTER_BY_ID.get(String(msg.chapter));
        if (!seat || !isHost || d.status === "playing" || d.tour || !chapter) return;
        if (d.seats.length > 1) return error("La campagne se joue seul : les autres candidats doivent quitter la table.");
        d.campaign = { chapter: chapter.id, score: null, stars: null };
        d.settings.visibility = "private";
        d.settings.cour = mergeConfig(DEFAULT_CONFIG, { candidates: 16, only: chapter.ep, botLevel: chapter.level, cinema: true });
        return this.startGame(now, ws);
      }

      case "look": {
        if (!seat || d.status === "playing" || !isCourLook(msg.look) || !this.allowMessage(`look:${userId}`, 120)) return;
        const owned = await ownedItems(this.env.DB, userId);
        const live = this.data;
        if (live !== d || !live || live.status === "playing" || !live.seats.includes(seat)) return;
        seat.look = usableLook(msg.look, (item) => owned.has(item));
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
        if (seat || d.tour || d.campaign || !maySit(this.arrivalCase(userId, "play"))) return;
        if (!this.seatHuman(att.user)) return error("La table est complète.");
        d.watchers = forgetWatcher(d.watchers, userId);
        this.systemChat(`${att.user.pseudo} s'inscrit comme candidat.`);
        this.ensureHost();
        return this.afterChange(now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            if (forgetPlayer(d.gate, seat.id)) settleGate(d.gate, now);
            this.systemChat(`${seat.name} a quitté la cour, l'ordinateur joue à sa place.`);
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
        // L'hôte qui s'en va passe la main tout de suite, même en pleine partie
        this.ensureHost(userId);
        void this.setPresence(userId, null).catch(() => {});
        // Plus personne : la table ferme presque aussitôt, au lieu de laisser la foule jouer seule
        if (this.connectedUsers().size === 0) this.addTimer({ at: now + LEFT_EMPTY_MS, kind: "cleanup" });
        if (this.rematchReady()) return this.openAnnounce(now);
        return this.afterChange(now, ws);
      }

      case "rematch": {
        if (d.status !== "finished" || !seat || d.rematch.includes(userId) || d.campaign) return;
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
          this.systemChat(lateJoinNotice("cour", msg.lateJoin));
          if (d.status === "playing") return this.afterChange(now);
        }
        if (d.status === "playing") return msg.lateJoin === undefined ? error("On ne change pas les règles en plein jeu.") : undefined;
        // Une table de campagne redevient une table normale dès qu'on la règle
        d.campaign = null;
        const current = { ...DEFAULT_CONFIG, ...d.settings.cour };
        const drawn = d.tour ? null : hostDraw("cour", d.settings.randomRules, current, DEFAULT_CONFIG, msg.randomRules, Math.random);
        if (drawn) {
          d.settings.randomRules = drawn.draw;
          d.settings.cour = drawn.settings;
          this.systemChat(drawn.notice);
        }
        d.settings.cour = mergeConfig(d.settings.cour, hostPatch("cour", d.settings.randomRules, msg.settings ?? {}));
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= 1 && max <= COUR_MAX_PLAYERS) d.settings.maxPlayers = Math.max(max, d.seats.length);
        }
        return this.afterChange(now);
      }

      case "removeSeat": {
        if (d.status === "playing") return;
        const target = d.seats.find((s) => s.id === msg.seatId);
        if (!target || target.userId === userId) return;
        d.seats = d.seats.filter((s) => s !== target);
        this.systemChat(`${target.name} a été retiré de la table.`);
        d.rematch = d.rematch.filter((id) => id !== target.userId);
        if (this.rematchReady()) return this.openAnnounce(now);
        return this.afterChange(now);
      }

      case "kick": {
        if (typeof msg.userId !== "string" || msg.userId === userId) return;
        return this.kickUser(msg.userId, now);
      }

      case "start": {
        if (d.status === "playing") return;
        if (d.status === "finished" && !d.tour && !d.campaign) {
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
  // La partie
  // -------------------------------------------------------------------------

  /** Qui joue soi-même : un vrai joueur présent, pas remplacé par l'ordinateur */
  private hooks(): Hooks {
    const d = this.data!;
    return {
      auto: (id) => {
        const s = d.seats.find((x) => x.id === id);
        return !s || Boolean(s.autoplay);
      },
      live: (id) => {
        const s = d.seats.find((x) => x.id === id);
        return Boolean(s && !s.autoplay && this.isConnected(s.userId));
      },
    };
  }

  private async startTourGame(now: number) {
    const d = this.data!;
    d.timers = d.timers.filter((t) => t.kind !== "tourStart");
    d.pickUntil = null;
    d.ready = [];
    if (!d.seats.some((s) => this.isConnected(s.userId))) {
      await abortToTour(this.env, d.tour!.code, d.code);
      await this.close("Pas assez de joueurs arrivés : la tournée reprend la main.");
      return;
    }
    return this.startGame(now);
  }

  /** La foule : les vrais joueurs, les bots de la tournée, puis des candidats tirés au sort jusqu'au nombre voulu */
  private buildRoster(cfg: CourConfig, seed: number): Candidate[] {
    const d = this.data!;
    const roster: Candidate[] = d.seats.map((s) => ({
      id: s.id,
      name: s.name,
      avatar: s.avatar,
      photo: s.photo,
      userId: s.userId,
      look: s.look,
    }));
    for (const b of d.tourBots ?? [])
      roster.push({ id: b.id, name: b.name, avatar: b.avatar, photo: 0, userId: null, look: botLook(roster.length) });
    const chapter = d.campaign ? CHAPTER_BY_ID.get(d.campaign.chapter) : null;
    const want = chapter ? chapter.candidates : cfg.candidates;
    const taken = new Set(roster.map((c) => c.name));
    if (chapter && roster.length < want) {
      roster.push({
        id: "rival",
        name: RIVAL_NAME,
        avatar: RIVAL_AVATAR,
        photo: 0,
        userId: null,
        look: { jersey: "or", cheer: "feu" },
        rival: true,
      });
      taken.add(RIVAL_NAME);
    }
    const names = shuffle(
      { rng: seed },
      CROWD_NAMES.filter((n) => !taken.has(n)),
    );
    let k = 0;
    while (roster.length < want) {
      const name = names[k % names.length]! + (k >= names.length ? ` ${Math.floor(k / names.length) + 1}` : "");
      roster.push({ id: `c${++k}`, name, avatar: seededAvatar(`${name}-${seed}`), photo: 0, userId: null, look: botLook(seed + k * 7) });
    }
    return roster;
  }

  private async startGame(now: number, ws?: WebSocket) {
    const d = this.data!;
    d.pickUntil = null;
    d.ready = [];
    d.timers = d.timers.filter((t) => t.kind !== "tourStart");
    d.seats = d.seats.filter((x) => this.isConnected(x.userId));
    this.ensureHost();
    if (d.seats.length < 1) {
      if (ws) this.send(ws, { t: "error", message: "Personne à la table." });
      return this.afterChange(now);
    }
    for (const seat of d.seats) {
      seat.autoplay = false;
      seat.disconnectedAt = null;
    }
    if (d.settings.randomRules && !d.tour && !d.campaign) {
      d.settings.cour = applyDrawnRules("cour", { ...DEFAULT_CONFIG, ...d.settings.cour }, DEFAULT_CONFIG, d.settings.randomRules);
    }
    const cfg = { ...DEFAULT_CONFIG, ...d.settings.cour };
    const seed = randomSeed();
    const roster = this.buildRoster(cfg, seed);
    const chapter = d.campaign ? CHAPTER_BY_ID.get(d.campaign.chapter) : null;
    if (d.campaign) d.campaign = { chapter: d.campaign.chapter, score: null, stars: null };
    // La finale de la campagne : toi contre Gaspard
    const cands = roster.map((c) => ({ id: c.id, human: c.userId !== null, level: c.rival ? "fort" : cfg.botLevel }));
    d.match = createMatch(cfg, cands, seed, now, chapter ? { keep: chapter.keep } : {});
    d.roster = roster;
    this.lastPhase = "";
    d.gate = openGate(
      d.seats.filter((s) => this.isConnected(s.userId)).map((s) => s.id),
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
    if (d.settings.randomRules && !d.tour && !d.campaign) this.systemChat(drawNotice("cour", d.settings.randomRules, "start"));
    if (chapter) this.systemChat(`Campagne : ${chapter.title}. Bonne chance !`);
    else if (cfg.only) this.systemChat(`${EPREUVE_INFO[cfg.only].name} : ${roster.length} candidats. Bonne chance !`);
    else
      this.systemChat(
        `La Cour des Grands ouvre ses portes : ${roster.length} candidats, ${d.match.program.length - 1} épreuves et la finale. Bonne chance !`,
      );
    this.startLoop();
    return this.afterChange(now);
  }

  private startLoop() {
    if (this.loop) return;
    this.lastTick = Date.now();
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
    const dt = Math.min(0.12, Math.max(0.01, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (d.gate) {
      if (settleGate(d.gate, now)) {
        this.broadcast();
        this.saveLive();
      }
      const len = m.until - m.phaseAt;
      // Rien ne bouge avant le départ commun : l'arrivée des candidats part pour tout le monde au même instant
      m.phaseAt = now;
      m.until = now + len;
      if (!gatePassed(d.gate, now)) return;
      d.gate = null;
      this.broadcast();
      this.saveLive();
      await this.armAlarm();
      return;
    }
    const here = d.seats.filter((s) => this.isConnected(s.userId)).map((s) => s.id);
    const changed = tickMatch(m, now, dt, this.hooks(), here);
    if (m.phase === "over") return this.finishGame(now);
    const phase = `${m.phase}:${m.round}`;
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      // Un changement d'étape : tout le monde reçoit le salon entier, et on garde la partie
      this.broadcast();
      await this.persist();
      await this.armAlarm();
      return;
    }
    if (changed) this.sendMatch(now, false);
  }

  /** La partie part aux écrans : à chaque pas pendant une épreuve vive, sinon quatre fois par seconde (ou tout de suite) */
  private sendMatch(now: number, urgent: boolean) {
    const d = this.data!;
    const m = d.match!;
    const live = m.phase === "play" && m.ep && LIVE_EPS.has(m.ep.kind);
    if (!urgent && !live && now - this.lastSent < 240) return;
    this.lastSent = now;
    this.broadcastRaw({ t: "match", match: this.viewOfMatch(m, now), now });
    if (now % 2000 < LOOP_MS) this.saveLive();
  }

  private viewOfMatch(m: Match, now: number): MatchView {
    const v = matchView(m, now);
    // Les écrans n'ont besoin que des derniers effets (ils les reçoivent plusieurs fois par seconde)
    return { ...v, fx: v.fx.slice(-18) };
  }

  private async finishGame(now: number) {
    const d = this.data!;
    if (d.status !== "playing") return;
    d.status = "finished";
    this.stopLoop();
    if (d.tour) this.addTimer({ at: now + TOUR_TABLE_LINGER_MS, kind: "cleanup" });
    const m = d.match!;
    const winner = d.roster?.find((c) => c.id === m.winner);
    if (d.campaign) {
      const chapter = CHAPTER_BY_ID.get(d.campaign.chapter)!;
      const seat = d.seats[0];
      const score = seat && m.ep ? chapterScore(m.ep, seat.id) : 0;
      d.campaign.score = score;
      this.systemChat(score > 0 ? chapter.win : "Éliminé… mais la cour t'attend pour une revanche !");
    } else if (winner) this.systemChat(`${winner.name} remporte la Cloche d'or !`);
    if (d.settings.randomRules && !d.tour && !d.campaign) {
      d.settings.randomRules = drawRules("cour", Math.random, d.settings.randomRules);
      this.systemChat(drawNotice("cour", d.settings.randomRules, "next"));
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
    if (d.campaign) await this.recordCampaign();
    else await this.recordResults(Date.now());
    this.broadcast();
  }

  private addTimer(t: Timer) {
    this.data!.timers.push(t);
  }

  private async armAlarm() {
    const d = this.data;
    const next = d?.status === "playing" && d.match ? nextWake(d.match) : null;
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
        this.systemChat(`${seat.name} s'est déconnecté : l'ordinateur joue à sa place en attendant son retour.`);
        // L'hôte coupé le temps que l'ordinateur le remplace : la main passe à un joueur présent
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
    for (const s of d.seats) void this.setPresence(s.userId, null).catch(() => {});
    await this.hub.removeRoom(d.code).catch(() => {});
    this.data = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /** La campagne : les étoiles du chapitre (d'après le score que la salle a calculé), rien d'autre */
  private async recordCampaign() {
    const d = this.data!;
    const run = d.campaign!;
    const seat = d.seats[0];
    if (!seat || seat.autoplay || run.score === null) return;
    const result = await awardStars(this.env.DB, { userId: seat.userId, game: "cour", map: run.chapter, value: run.score });
    if (!result || this.data !== d) return;
    run.stars = result;
    await this.persist();
    for (const ws of this.ctx.getWebSockets(seat.userId)) this.send(ws, { t: "stars", result });
    if (result.unlocked.length > 0) this.broadcastRaw({ t: "achievements", unlocks: [{ userId: seat.userId, ids: result.unlocked }] });
  }

  private async recordResults(now: number) {
    const d = this.data!;
    const m = d.match!;
    const roster = d.roster ?? [];
    try {
      const ranks = m.ranks ?? {};
      const finalRound = m.program.indexOf("polochons");
      const players = m.cands.map((c, i) => {
        const info = roster.find((r) => r.id === c.id);
        const seat = d.seats.find((s) => s.id === c.id);
        const finalist = c.id === m.winner || (finalRound >= 0 && c.outRound === finalRound);
        const survived = m.history.filter((h, k) => h.ep !== "polochons" && (c.outRound === -1 || c.outRound > k)).length;
        const stats: CourRecordStats = {
          survived,
          finalist: finalist ? 1 : 0,
          won: c.id === m.winner ? 1 : 0,
          saved: c.saved !== undefined ? 1 : 0,
          played: m.history.length,
          soleil: 0,
          biscuit: 0,
          corde: 0,
          nenuphars: 0,
          chaises: 0,
          billes: 0,
          marelle: 0,
          epervier: 0,
        };
        // Les épreuves qu'il a jouées (entré dedans, pas en accéléré)
        m.history.forEach((h, k) => {
          if (h.ep !== "polochons" && !h.fast && (c.outRound === -1 || c.outRound >= k || c.id === m.winner)) stats[h.ep] = 1;
        });
        return {
          seat: i,
          userId: seat ? seat.userId : null,
          name: info?.name ?? "?",
          isBot: !seat,
          absent: Boolean(seat?.autoplay),
          rank: ranks[c.id] ?? m.cands.length,
          score: survived,
          eliminated: !c.alive && c.id !== m.winner,
          team: null,
          stats,
        };
      });
      if (d.tour) {
        await reportToTour(this.env, d.tour.code, {
          code: d.code,
          index: d.tour.index,
          game: "cour",
          seats: players.length,
          players: players
            .filter((p) => p.userId || (d.tourBots ?? []).some((b) => b.id === m.cands[p.seat]!.id))
            .map((p) => ({ userId: p.userId ?? m.cands[p.seat]!.id, rank: p.rank, stats: { ...p.stats } })),
        });
      }
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "cour",
        mode: m.cfg.only || m.cfg.duree,
        roomCode: d.code,
        settings: m.cfg,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: Math.max(1, m.history.length),
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
      console.error("Enregistrement de la partie de La Cour des Grands impossible", err);
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

  private viewFor(userId: string, connected: Map<string, PublicUser>, match: MatchView | null): CourRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    return {
      code: d.code,
      game: "cour",
      status: d.status,
      settings: { ...d.settings, lateJoin: lateJoinOf(d.settings, d.quick), cour: { ...DEFAULT_CONFIG, ...d.settings.cour } },
      seats: d.seats.map((s) => ({
        id: s.id,
        kind: s.kind,
        userId: s.userId,
        name: s.name,
        avatar: s.avatar,
        photo: s.photo,
        admin: Boolean(s.admin),
        connected: connected.has(s.userId),
        autoplay: Boolean(s.autoplay),
        ...(s.autoplay ? { autoplayReason: s.autoplay } : {}),
        awayAt:
          d.status === "playing" && !s.autoplay && s.disconnectedAt !== null && !connected.has(s.userId)
            ? s.disconnectedAt + AWAY_AFTER_MS
            : null,
        isHost: s.userId === d.hostId,
        look: s.look,
      })),
      spectators: [...connected.values()].filter((u) => !seatedUsers.has(u.id)).map((u) => ({ userId: u.id, name: u.pseudo })),
      hostId: d.hostId,
      you: { userId, seatId: seat?.id ?? null, isHost: userId === d.hostId, isAdmin: Boolean(connected.get(userId)?.admin) },
      roster: d.roster,
      match,
      gate: d.status === "playing" ? (d.gate ?? null) : null,
      serverNow: Date.now(),
      rematch: d.rematch,
      results: d.results ?? null,
      quick: d.quick,
      tour: d.tour?.code ?? null,
      pickUntil: d.pickUntil ?? null,
      ready: d.ready ?? [],
      campaign: d.campaign ?? null,
    };
  }

  private broadcast(except?: WebSocket) {
    const d = this.data!;
    const connected = this.connectedUsers(except);
    const match = d.match ? this.viewOfMatch(d.match, Date.now()) : null;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !isLive(ws)) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: "room", room: this.viewFor(att.userId, connected, match) });
    }
  }

  private broadcastRaw(msg: CourServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: CourServerMessage) {
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
    return { code: d.code, game: "cour", status: d.status, lateJoin: lateJoinOf(d.settings, d.quick) };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    return {
      code: d.code,
      game: "cour",
      variant: d.campaign ? "campagne" : d.settings.cour.only || d.settings.cour.duree,
      status: d.status,
      visibility: d.campaign ? "private" : d.settings.visibility,
      hostName: host?.name ?? "",
      humans: d.seats.length,
      bots: Math.max(0, d.settings.cour.candidates - d.seats.length),
      maxPlayers: d.settings.maxPlayers,
      names: d.seats.map((s) => s.name),
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
