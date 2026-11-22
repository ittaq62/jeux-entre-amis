import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { planShot, thinkTime, type BotLevel } from "../shared/games/minigolf/bot.ts";
import { courseOf } from "../shared/games/minigolf/courses.ts";
import { botLook, DEFAULT_LOOK, isBallLook, usableLook, type BallLook } from "../shared/games/minigolf/looks.ts";
import {
  ballsInPlay,
  createMatch,
  startHole,
  currentRef,
  DEFAULT_CONFIG,
  mergeConfig,
  nextEvent,
  nowTick,
  physOf,
  powerOf,
  readyToShoot,
  shoot,
  tickMatch,
  totals,
  type GolfShot,
  type Match,
} from "../shared/games/minigolf/match.ts";
import { STEPS_PER_S } from "../shared/games/minigolf/physics.ts";
import {
  MINIGOLF_MAX_PLAYERS,
  type MinigolfClientMessage,
  type MinigolfRecordStats,
  type MinigolfRoomSettings,
  type MinigolfRoomView,
  type MinigolfServerMessage,
} from "../shared/games/minigolf/net.ts";
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
import { randomSeed } from "../shared/rng.ts";
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
import { forgetPlayer, gatePassed, markLoaded, openGate, settleGate, type LoadGate } from "../shared/loadGate.ts";
import { ANNOUNCE_MS } from "../shared/announce.ts";

// Les golfeurs du dimanche qui complètent la table
const BOT_NAMES = ["Gaston", "Josiane", "Odette", "Fernand", "Germaine", "Marcel", "Paulette", "Lucien", "Simone", "Raymond"];
const AWAY_AFTER_MS = 8000;
const SEAT_RELEASE_MS = 25_000;
/** Pendant la partie, l'alarme de garde ne dort jamais plus longtemps */
const WATCHDOG_MS = 60_000;
const CHAT_KEEP = 80;
/** La boucle de la partie : le chrono, les bots */
const LOOP_MS = 100;
/** Le niveau des bots de la tournée, traduit pour le minigolf */
const TOUR_LEVEL: Record<string, BotLevel> = { easy: "facile", normal: "moyen", hard: "fort" };

interface Seat {
  id: string;
  kind: "human" | "bot";
  userId: string | null;
  name: string;
  avatar: AvatarConfig;
  photo: number;
  admin?: boolean;
  /** « away » : déconnecté ; « afk » : a laissé passer ses tours (chacun son tour) */
  autoplay: false | "away" | "afk";
  /** Chacun son tour : ses tours passés de suite sans tirer */
  missed?: number;
  disconnectedAt: number | null;
  team: 0 | 1;
  look: BallLook;
}

/** Chacun son tour : deux tours passés de suite sans tirer, et un bot joue sa balle (il reprend la main quand il veut) */
const MAX_MISSED_TURNS = 2;
/** Chacun son tour : le bot vise un moment avant de frapper, pour qu'on le voie faire */
const BOT_AIM_TICKS = Math.round(1.2 * STEPS_PER_S);

type TimerKind = "away" | "seatCleanup" | "cleanup" | "tourStart";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
}

interface MinigolfData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: MinigolfRoomSettings;
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
  /** La partie retenue le temps que chacun charge le parcours (voir loadGate.ts) ; null : elle tourne */
  gate?: LoadGate | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
  replaced?: boolean;
}

/** Une table de minigolf : le salon commun, puis une partie où chacun joue sa balle à son tour (ou tous en même temps). */
export class MinigolfRoom extends DurableObject<Env> {
  private data: MinigolfData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();
  private loop: ReturnType<typeof setInterval> | null = null;
  /** Quand chaque bot (ou joueur remplacé) jouera son prochain coup */
  private botAt = new Map<string, number>();
  /** Le coup qu'un bot a choisi de jouer un peu plus tard (le bon moment pour passer un obstacle qui bouge) */
  private botPlan = new Map<string, { a: number; p: number; at: number; hole: number; pulled?: boolean }>();
  private botRng = { rng: 1 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<MinigolfData>("room")) ?? null;
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
      settings: { visibility: opts.visibility, maxPlayers: 4, lateJoin: defaultLateJoin(opts.quick), minigolf: { ...DEFAULT_CONFIG } },
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
    d.settings.minigolf = mergeConfig(d.settings.minigolf, {
      holes: 3,
      ...variantSettings("minigolf", tour.variant),
      teams: Boolean(tour.teams),
      botLevel: TOUR_LEVEL[tour.botLevel] ?? "moyen",
    });
    d.settings.maxPlayers = Math.min(MINIGOLF_MAX_PLAYERS, Math.max(MIN_PLAYERS, d.seats.length));
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
      midGame: JOINS_STARTED.minigolf,
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
        this.botAt.delete(seat.id);
        this.botPlan.delete(seat.id);
        if (d.status === "playing") this.systemChat(`${seat.name} est de retour sur le parcours.`);
      }
      if (d.status !== "playing") {
        seat.name = user.pseudo;
        seat.avatar = user.avatar;
        seat.photo = user.photo;
      }
    } else if (decision === "seat" && d.status !== "playing") {
      seat = this.seatHuman(user) ?? undefined;
      if (seat) this.systemChat(`${user.pseudo} arrive au départ.`);
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
      // La balle blanche tant qu'il n'a rien choisi (l'appareil envoie aussitôt son skin)
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
      // Parti pendant le chargement : on ne l'attend plus
      if (forgetPlayer(d.gate, seat.id)) settleGate(d.gate, now);
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

  /** Ce qui empêche une partie de partir avec les joueurs présents, ou null (on peut jouer seul au minigolf) */
  private startProblem(): string | null {
    const seats = this.data!.seats.filter((s) => s.kind === "bot" || this.isConnected(s.userId));
    return seats.length < 1 ? "Personne au départ." : null;
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
    let msg: MinigolfClientMessage;
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
      case "shot": {
        const m = d.match;
        if (!seat || !m || d.status !== "playing" || msg.h !== m.hole) return;
        // Un bot jouait pour lui parce qu'il laissait passer ses tours : il tire, il reprend la main
        if (seat.autoplay === "afk") this.takeBack(seat);
        if (seat.autoplay) return;
        if (!this.allowMessage(`shot:${userId}`, 150)) return;
        const r = shoot(m, seat.id, Number(msg.a), Number(msg.p), Number(msg.at), now);
        if (typeof r === "string") return error(r);
        seat.missed = 0;
        this.botAt.delete(seat.id);
        this.botPlan.delete(seat.id);
        return this.afterChange(now);
      }

      case "loaded": {
        // Son jeu a chargé le parcours : quand tout le monde l'a dit (ou au bout de l'attente), le départ commun
        if (!seat || d.status !== "playing" || !markLoaded(d.gate, seat.id, msg.gate)) return;
        settleGate(d.gate, now);
        return this.afterChange(now);
      }

      case "takeBack": {
        if (!seat || seat.autoplay !== "afk" || d.status !== "playing") return;
        this.takeBack(seat);
        return this.afterChange(now);
      }

      case "aim": {
        const m = d.match;
        if (!seat || !m || d.status !== "playing" || !Number.isFinite(msg.a) || !Number.isFinite(msg.p)) return;
        if (!this.allowMessage(`aim:${userId}`, 70)) return;
        const text = JSON.stringify({ t: "aim", id: seat.id, a: Math.round(msg.a * 1000) / 1000, p: Math.round(msg.p * 1000) / 1000 });
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

      case "look": {
        if (!seat || d.status === "playing" || !isBallLook(msg.look) || !this.allowMessage(`look:${userId}`, 120)) return;
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
        this.systemChat(`${att.user.pseudo} arrive au départ.`);
        return this.afterChange(now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            if (forgetPlayer(d.gate, seat.id)) settleGate(d.gate, now);
            this.systemChat(`${seat.name} a quitté la partie, un bot joue sa balle.`);
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
          this.systemChat(lateJoinNotice("minigolf", msg.lateJoin));
          if (d.status === "playing") return this.afterChange(now);
        }
        if (d.status === "playing") return msg.lateJoin === undefined ? error("On ne change pas les règles en pleine partie.") : undefined;
        const current = { ...DEFAULT_CONFIG, ...d.settings.minigolf };
        const drawn = d.tour ? null : hostDraw("minigolf", d.settings.randomRules, current, DEFAULT_CONFIG, msg.randomRules, Math.random);
        if (drawn) {
          d.settings.randomRules = drawn.draw;
          d.settings.minigolf = drawn.settings;
          this.systemChat(drawn.notice);
        }
        d.settings.minigolf = mergeConfig(d.settings.minigolf, hostPatch("minigolf", d.settings.randomRules, msg.settings ?? {}));
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= MIN_PLAYERS && max <= MINIGOLF_MAX_PLAYERS) {
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
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Golfeur ${d.botCounter + 1}`;
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
      if (ws) this.send(ws, { t: "error", message: "Personne au départ." });
      return this.afterChange(now);
    }
    for (const seat of d.seats) {
      seat.autoplay = false;
      seat.disconnectedAt = null;
    }
    if (d.settings.randomRules && !d.tour) {
      d.settings.minigolf = applyDrawnRules(
        "minigolf",
        { ...DEFAULT_CONFIG, ...d.settings.minigolf },
        DEFAULT_CONFIG,
        d.settings.randomRules,
      );
    }
    const cfg = { ...DEFAULT_CONFIG, ...d.settings.minigolf };
    const seed = randomSeed();
    d.match = createMatch(
      cfg,
      d.seats.map((s) => ({ id: s.id, team: cfg.teams ? s.team : 0 })),
      seed,
      now,
    );
    this.botRng = { rng: seed ^ 0x5bd1e995 };
    this.botAt.clear();
    this.botPlan.clear();
    // La partie attend que chaque joueur présent ait chargé le parcours ; le survol du premier trou part au départ
    // commun et tient lieu de compte à rebours
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
    this.systemChat(`${d.match.holes.length} trous : bonne partie !`);
    if (d.settings.randomRules && !d.tour) this.systemChat(drawNotice("minigolf", d.settings.randomRules, "start"));
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
    // Le chargement de chacun : rien ne bouge avant le départ commun, où le survol du premier trou part pour tout le monde
    if (d.gate) {
      if (settleGate(d.gate, now)) {
        this.broadcast();
        this.saveLive();
      }
      if (!gatePassed(d.gate, now)) return;
      d.gate = null;
      if (m.phase === "intro") startHole(m, m.hole, now);
      this.broadcast();
      this.saveLive();
      await this.armAlarm();
      return;
    }
    const before = m.cfg.turns ? m.players.map((p) => p.shot) : null;
    let changed = tickMatch(m, now);
    if (before) this.noteMissed(m, before);
    if (m.phase === "over") return this.finishGame(now);
    // Les bots, et ceux qu'un bot remplace : un coup à la fois, chacun après avoir regardé un moment
    const level = d.settings.minigolf.botLevel ?? "moyen";
    let played = false;
    for (const p of readyToShoot(m, now)) {
      const seat = d.seats.find((s) => s.id === p.id);
      const auto = !seat || seat.kind === "bot" || Boolean(seat.autoplay);
      if (!auto) continue;
      const planned = this.botPlan.get(p.id);
      if (planned) {
        if (planned.hole !== m.hole) this.botPlan.delete(p.id);
        else {
          // Chacun son tour : on le voit tirer sa balle en arrière juste avant de frapper
          if (m.cfg.turns && !planned.pulled && nowTick(m, now) >= planned.at - BOT_AIM_TICKS / 2) {
            planned.pulled = true;
            this.botAim(p.id, planned.a, planned.p);
          }
          if (nowTick(m, now) < planned.at) continue;
          this.botPlan.delete(p.id);
          const r = shoot(m, p.id, planned.a, planned.p, planned.at, now);
          if (typeof r !== "string") changed = true;
          continue;
        }
      }
      const due = this.botAt.get(p.id);
      if (due === undefined) {
        this.botAt.set(p.id, now + thinkTime(level, this.botRng));
        continue;
      }
      if (now < due || played) continue;
      played = true;
      this.botAt.delete(p.id);
      const ref = currentRef(m);
      const t = nowTick(m, now);
      // Chacun son tour : il vise un moment (les autres le regardent), le coup est choisi pour ce moment-là
      const lead = m.cfg.turns ? BOT_AIM_TICKS : 0;
      const plan = planShot(
        courseOf(ref),
        { x: p.ball[0], y: p.ball[1], z: p.ball[2] },
        t + lead,
        physOf(m.cfg, ref, powerOf(m, p)),
        level,
        this.botRng,
        // Les autres balles sur le parcours (chacun son tour) : il en tient compte, et peut les pousser
        ballsInPlay(m, p.id).map((q) => ({ x: q.ball[0], y: q.ball[1], z: q.ball[2], ally: m.cfg.teams && q.team === p.team })),
        physOf(m.cfg, ref),
      );
      if (plan.wait + lead > 0) {
        this.botPlan.set(p.id, { a: plan.a, p: plan.p, at: t + lead + plan.wait, hole: m.hole, pulled: false });
        if (m.cfg.turns) this.botAim(p.id, plan.a, 0);
        continue;
      }
      const r = shoot(m, p.id, plan.a, plan.p, t, Date.now());
      if (typeof r !== "string") changed = true;
    }
    if (changed) {
      this.broadcast();
      this.saveLive();
    }
  }

  private async finishGame(now: number) {
    const d = this.data!;
    if (d.status !== "playing") return;
    d.status = "finished";
    this.stopLoop();
    this.botAt.clear();
    this.botPlan.clear();
    if (d.tour) this.addTimer({ at: now + TOUR_TABLE_LINGER_MS, kind: "cleanup" });
    const m = d.match!;
    const ranks = m.ranks ?? [];
    const first = m.players.map((p, i) => (ranks[i] === 1 ? p.id : null)).filter(Boolean) as string[];
    const names = first.map((id) => d.seats.find((s) => s.id === id)?.name ?? "?");
    const tot = totals(m);
    const best = Math.min(...tot);
    if (names.length === 1) this.systemChat(`${names[0]} gagne la partie en ${best} coups !`);
    else if (names.length > 1) this.systemChat(`Victoire de ${names.join(", ")} en ${best} coups !`);
    if (d.settings.randomRules && !d.tour) {
      d.settings.randomRules = drawRules("minigolf", Math.random, d.settings.randomRules);
      this.systemChat(drawNotice("minigolf", d.settings.randomRules, "next"));
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
        this.systemChat(`${seat.name} s'est déconnecté : un bot joue sa balle en attendant son retour.`);
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
      const par = m.holes.reduce((s, ref) => s + courseOf(ref).def.par, 0);
      const players = m.players.map((p, i) => {
        const seat = d.seats.find((s) => s.id === p.id);
        const stats: MinigolfRecordStats = {
          strokes: p.stats.strokes,
          holes: p.stats.holes,
          aces: p.stats.aces,
          under: p.stats.under,
          lost: p.stats.lost,
          best: p.stats.best,
          toPar: p.stats.strokes - par,
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
          game: "minigolf",
          seats: players.length,
          players: players.map((p) => ({ userId: p.userId ?? m.players[p.seat]!.id, rank: p.rank, stats: { ...p.stats } })),
        });
      }
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "minigolf",
        mode: m.cfg.course,
        roomCode: d.code,
        settings: m.cfg,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: m.holes.length,
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
      console.error("Enregistrement de la partie de minigolf impossible", err);
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

  private viewFor(userId: string, connected: Map<string, PublicUser>): MinigolfRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    const cfg = { ...DEFAULT_CONFIG, ...d.settings.minigolf };
    let match: MinigolfRoomView["minigolf"] = null;
    if (d.match) {
      const { rng: _rng, ...rest } = d.match;
      void _rng;
      match = rest;
    }
    return {
      code: d.code,
      game: "minigolf",
      status: d.status,
      settings: { ...d.settings, lateJoin: lateJoinOf(d.settings, d.quick), minigolf: cfg },
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
      minigolf: match,
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
  }

  /** Chacun son tour : les autres voient où vise un bot (ou le bot qui joue pour un absent) */
  private botAim(id: string, a: number, p: number) {
    this.broadcastRaw({ t: "aim", id, a: Math.round(a * 1000) / 1000, p: Math.round(p * 1000) / 1000 });
  }

  /** Chacun son tour : celui qui laisse passer son tour deux fois de suite, un bot joue sa balle */
  private noteMissed(m: Match, before: (GolfShot | null)[]) {
    m.players.forEach((p, i) => {
      if (!p.shot?.skip || p.shot === before[i]) return;
      const seat = this.data!.seats.find((s) => s.id === p.id);
      if (!seat || seat.kind !== "human" || seat.autoplay) return;
      seat.missed = (seat.missed ?? 0) + 1;
      if (seat.missed >= MAX_MISSED_TURNS) {
        seat.autoplay = "afk";
        this.systemChat(`${seat.name} laisse passer ses tours : un bot joue sa balle en attendant.`);
      }
    });
  }

  /** Il reprend sa balle au bot qui jouait pour lui */
  private takeBack(seat: Seat) {
    seat.autoplay = false;
    seat.missed = 0;
    this.botAt.delete(seat.id);
    this.botPlan.delete(seat.id);
    this.systemChat(`${seat.name} reprend la main.`);
  }

  private broadcastRaw(msg: MinigolfServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: MinigolfServerMessage) {
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
    return { code: d.code, game: "minigolf", status: d.status, lateJoin: lateJoinOf(d.settings, d.quick) };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    return {
      code: d.code,
      game: "minigolf",
      variant: d.settings.minigolf.course,
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
