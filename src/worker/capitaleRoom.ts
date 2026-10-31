import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { botAction, botAnswer, botBid } from "../shared/games/capitale/bot.ts";
import { SQUARES } from "../shared/games/capitale/board.ts";
import {
  actorOf,
  applyAction,
  auctionBidders,
  closeAuction,
  createGame,
  DEFAULT_SETTINGS,
  expireTrade,
  GAME_MINUTES,
  timeUp,
  TURN_SECONDS,
  type BotLevel,
  type CapitaleAction,
  type CapitaleEvent,
  type CapitaleSettings,
  type CapitaleState,
  type Offer,
} from "../shared/games/capitale/engine.ts";
import { viewFor } from "../shared/games/capitale/view.ts";
import {
  CAPITALE_MAX_PLAYERS,
  CHAT_MAX,
  MIN_PLAYERS,
  REACTIONS,
  TAUNTS,
  type CapitaleClientMessage,
  type CapitaleRoomSettings,
  type CapitaleRoomView,
  type CapitaleServerMessage,
  type ChatMessage,
  type PresenceRoom,
  type PublicUser,
  type RoomStatus,
  type RoomSummary,
} from "../shared/protocol.ts";
import { random, randomSeed } from "../shared/rng.ts";
import { TOUR_BOT_LEVELS, variantSettings, type TourInit } from "../shared/tour.ts";
import type { RoomInit } from "./room.ts";
import { abortToTour, reportToTour, TOUR_JOIN_MS, TOUR_LOCKED, TOUR_TABLE_LINGER_MS, tourChat } from "./tourLink.ts";
import { recordGame, type EloResults } from "./users.ts";
import { decodeHeaderJson } from "./util.ts";

// Des notaires et agents immobiliers pour compléter la table
const BOT_NAMES = ["Hubert", "Odile", "Bernard", "Colette", "Gérard", "Monique", "Jean-Pierre", "Danielle", "Thierry", "Brigitte"];
// Délai laissé à un joueur déconnecté pour revenir avant qu'un bot joue à sa place
const AWAY_AFTER_MS = 10_000;
const SEAT_RELEASE_MS = 25_000;
const MAX_MISSED = 2;
/** Enchère : le temps de la première offre, puis le chrono repart à chaque offre */
const AUCTION_FIRST_MS = 12_000;
const AUCTION_BID_MS = 6_000;
/** Une proposition d'échange sans réponse s'efface */
const TRADE_EXPIRES_MS = 60_000;
/** La version de la tournée dure 20 minutes */
const TOUR_MINUTES = 20;
const CHAT_KEEP = 80;

interface Seat {
  id: string;
  kind: "human" | "bot";
  userId: string | null;
  name: string;
  avatar: AvatarConfig;
  photo: number;
  admin?: boolean;
  autoplay: false | "away" | "afk";
  missed: number;
  disconnectedAt: number | null;
}

type TimerKind =
  | "bot"
  | "timeout"
  | "auction"
  | "botBid"
  | "answer"
  | "tradeExpiry"
  | "timeUp"
  | "away"
  | "seatCleanup"
  | "cleanup"
  | "emote"
  | "tourStart";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
  key?: string;
  trade?: number;
  emote?: string;
}

interface CapitaleData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: CapitaleRoomSettings;
  status: RoomStatus;
  seats: Seat[];
  botCounter: number;
  capitale: CapitaleState | null;
  startedAt: number | null;
  /** Fin du temps de la décision en cours, et la décision qu'il concerne */
  deadline: number | null;
  deadlineKey: string;
  auctionDeadline: number | null;
  auctionKey: string;
  /** Partie à durée fixe : quand le tour en cours devient le dernier */
  endsAt: number | null;
  /** Compte les coups joués : un bot attend le suivant avant de rejouer */
  actionSeq: number;
  botKey: string;
  /** Dernier tour où chaque bot a proposé un échange (un par tour au plus) */
  botTraded: Record<string, number>;
  rematch: string[];
  chat: ChatMessage[];
  chatSeq: number;
  timers: Timer[];
  kicked: string[];
  rng: number;
  recorded: boolean;
  results?: EloResults | null;
  tour?: TourInit | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
}

/** Un salon de Capitale : même fonctionnement que les autres salons, avec son propre moteur. */
export class CapitaleRoom extends DurableObject<Env> {
  private data: CapitaleData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<CapitaleData>("room")) ?? null;
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
      settings: { visibility: opts.visibility, maxPlayers: 4, capitale: { ...DEFAULT_SETTINGS } },
      status: "lobby",
      seats: [],
      botCounter: 0,
      capitale: null,
      startedAt: null,
      deadline: null,
      deadlineKey: "",
      auctionDeadline: null,
      auctionKey: "",
      endsAt: null,
      actionSeq: 0,
      botKey: "",
      botTraded: {},
      rematch: [],
      chat: [],
      chatSeq: 0,
      timers: [{ at: now + 10 * 60_000, kind: "cleanup" }],
      kicked: [],
      rng: randomSeed(),
      recorded: false,
      tour: opts.tour ?? null,
    };
    if (opts.tour) {
      // Tout le monde est déjà assis : les joueurs de la tournée, puis ses bots sous leur nom
      const d = this.data;
      d.seats = [
        ...opts.tour.players.map((u) => ({ ...this.newHumanSeat(u), disconnectedAt: now })),
        ...opts.tour.bots.map((b) => ({
          id: b.id,
          kind: "bot" as const,
          userId: null,
          name: b.name,
          avatar: b.avatar,
          photo: 0,
          autoplay: false as const,
          missed: 0,
          disconnectedAt: null,
        })),
      ];
      d.settings.maxPlayers = Math.min(CAPITALE_MAX_PLAYERS, Math.max(MIN_PLAYERS, d.seats.length));
      // Les règles de la tournée (variante), en version courte
      d.settings.capitale = {
        ...d.settings.capitale,
        ...variantSettings("capitale", opts.tour.variant),
        end: "timed",
        minutes: TOUR_MINUTES,
        botLevel: TOUR_BOT_LEVELS[opts.tour.botLevel]?.capitale ?? d.settings.capitale.botLevel,
      };
      d.hostId = d.seats[0]?.userId ?? opts.host.id;
      d.timers.push({ at: now + TOUR_JOIN_MS, kind: "tourStart" });
    }
    await this.persist();
    await this.syncHub();
    await this.armAlarm();
    return true;
  }

  async summary(): Promise<RoomSummary | null> {
    return this.data ? this.buildSummary() : null;
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
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [user.id]);
    server.serializeAttachment({ userId: user.id, user } satisfies Attachment);
    await this.onJoin(user, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // -------------------------------------------------------------------------
  // Arrivées et départs
  // -------------------------------------------------------------------------

  private async onJoin(user: PublicUser, ws: WebSocket) {
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
        seat.missed = 0;
        d.botKey = "";
        d.deadlineKey = "";
        if (d.status === "playing") this.systemChat(`${seat.name} reprend ses affaires.`);
      }
      if (d.status !== "playing") {
        seat.name = user.pseudo;
        seat.avatar = user.avatar;
        seat.photo = user.photo;
      }
    } else if (d.status !== "playing" && !d.tour) {
      seat = this.seatHuman(user) ?? undefined;
      if (seat) this.systemChat(`${user.pseudo} s'installe à la table.`);
    }
    if (!seat) this.systemChat(`${user.pseudo} regarde la partie.`);
    this.ensureHost();
    this.send(ws, { t: "chat", messages: d.chat, reset: true });
    if (d.tour && d.status === "lobby" && d.seats.every((s) => s.kind === "bot" || this.isConnected(s.userId))) {
      return this.startTourGame(now);
    }
    await this.afterChange([], now);
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
      missed: 0,
      disconnectedAt: null,
    };
  }

  private seatHuman(user: PublicUser): Seat | null {
    const d = this.data!;
    const seat = this.newHumanSeat(user);
    if (d.seats.length < d.settings.maxPlayers) {
      d.seats.push(seat);
      return seat;
    }
    // Table pleine : on prend la place d'un bot
    for (let i = d.seats.length - 1; i >= 0; i--) {
      if (d.seats[i]!.kind === "bot") {
        d.seats[i] = seat;
        return seat;
      }
    }
    return null;
  }

  private connectedUsers(except?: WebSocket): Map<string, PublicUser> {
    const out = new Map<string, PublicUser>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att) out.set(att.userId, att.user);
    }
    return out;
  }

  private isConnected(userId: string | null): boolean {
    if (!userId) return false;
    return this.ctx.getWebSockets(userId).some((ws) => ws.readyState === WebSocket.OPEN);
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
    if (!d || !att) return;
    const stillHere = this.ctx.getWebSockets(att.userId).some((o) => o !== ws && o.readyState === WebSocket.OPEN);
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
    await this.afterChange([], now, ws);
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
      this.systemChat(`${name} mène maintenant la table.`);
    }
  }

  // -------------------------------------------------------------------------
  // Messages des joueurs
  // -------------------------------------------------------------------------

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const d = this.data;
    if (!d || typeof raw !== "string" || raw.length > 6000) return;
    let msg: CapitaleClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;
    const userId = att.userId;
    const isHost = userId === d.hostId;
    const isAdmin = Boolean(att.user.admin);
    const seat = d.seats.find((s) => s.userId === userId) ?? null;
    const now = Date.now();
    const error = (message: string) => this.send(ws, { t: "error", message });
    if (d.tour && TOUR_LOCKED.has(msg.t)) return;

    switch (msg.t) {
      case "action": {
        const g = d.capitale;
        if (d.status !== "playing" || !g) return error("Aucune partie en cours.");
        if (!seat) return error("Tu regardes la partie : attends la prochaine pour jouer.");
        if (seat.autoplay) {
          seat.autoplay = false;
          seat.missed = 0;
          d.botKey = "";
          d.deadlineKey = "";
        }
        const action = sanitizeAction(msg.action);
        if (!action) return error("Action invalide.");
        if (!this.allowMessage(`action:${userId}`, 120)) return;
        const res = applyAction(g, seat.id, action);
        if (!res.ok) {
          error(res.error);
          return this.afterChange([], now);
        }
        seat.missed = 0;
        d.actionSeq += 1;
        return this.afterChange(res.events, now);
      }

      case "takeBack": {
        if (!seat || !seat.autoplay) return;
        seat.autoplay = false;
        seat.missed = 0;
        d.botKey = "";
        d.deadlineKey = "";
        this.systemChat(`${seat.name} reprend ses affaires.`);
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

      case "sit": {
        if (seat || d.status === "playing") return;
        if (!this.seatHuman(att.user)) return error("La table est complète.");
        this.systemChat(`${att.user.pseudo} s'installe à la table.`);
        return this.afterChange([], now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            d.botKey = "";
            this.systemChat(`${seat.name} a quitté la table, un bot gère ses affaires.`);
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
        return this.afterChange([], now, ws);
      }

      case "rematch": {
        if (d.status !== "finished" || !seat || d.rematch.includes(userId)) return;
        d.rematch.push(userId);
        const humans = d.seats.filter((s) => s.kind === "human" && this.isConnected(s.userId));
        if (humans.every((s) => d.rematch.includes(s.userId!))) return this.startGame(now);
        return this.afterChange([], now);
      }
    }

    if (msg.t === "close") {
      if (!isAdmin) return error("Seul l'administrateur du site peut fermer une table.");
      return this.close("La table a été fermée par l'administrateur du site.");
    }

    // Actions réservées à l'hôte ; l'admin du site peut aussi faire le ménage
    const moderation = msg.t === "kick" || msg.t === "removeSeat";
    if (!isHost && !(isAdmin && moderation)) return error("Seul l'hôte peut faire ça.");
    switch (msg.t) {
      case "settings": {
        if (d.status === "playing") return error("On ne change pas les règles en pleine partie.");
        d.settings.capitale = mergeSettings(d.settings.capitale, msg.settings ?? {});
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= MIN_PLAYERS && max <= CAPITALE_MAX_PLAYERS) {
            d.settings.maxPlayers = max;
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
        if (d.seats.length >= d.settings.maxPlayers) return error("La table est complète.");
        const used = new Set(d.seats.map((s) => s.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Notaire ${d.botCounter + 1}`;
        d.seats.push({
          id: `bot-${++d.botCounter}`,
          kind: "bot",
          userId: null,
          name,
          avatar: seededAvatar(`${name}-${d.code}`),
          photo: 0,
          autoplay: false,
          missed: 0,
          disconnectedAt: null,
        });
        return this.afterChange([], now);
      }

      case "removeSeat": {
        if (d.status === "playing") return;
        const target = d.seats.find((s) => s.id === msg.seatId);
        if (!target || target.userId === userId) return;
        d.seats = d.seats.filter((s) => s !== target);
        if (target.kind === "human") this.systemChat(`${target.name} a été retiré de la table.`);
        return this.afterChange([], now);
      }

      case "kick": {
        if (typeof msg.userId !== "string" || msg.userId === userId) return;
        return this.kickUser(msg.userId, now);
      }

      case "start": {
        if (d.status === "playing") return;
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
        d.botKey = "";
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

  /** Table de tournée : on joue avec ceux qui sont arrivés ; s'ils sont moins de deux, la tournée reprend la main. */
  private async startTourGame(now: number) {
    const d = this.data!;
    d.timers = d.timers.filter((t) => t.kind !== "tourStart");
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
    d.seats = d.seats.filter((s) => s.kind === "bot" || this.isConnected(s.userId));
    this.ensureHost();
    if (d.seats.length < MIN_PLAYERS) {
      if (ws) this.send(ws, { t: "error", message: "Il faut au moins deux joueurs : ajoute un bot !" });
      return this.afterChange([], now);
    }
    for (const s of d.seats) {
      s.autoplay = false;
      s.missed = 0;
      s.disconnectedAt = null;
    }
    const { state, events } = createGame(
      d.seats.map((s) => s.id),
      d.settings.capitale,
      randomSeed(),
    );
    d.capitale = state;
    d.status = "playing";
    d.startedAt = now;
    d.recorded = false;
    d.results = null;
    d.rematch = [];
    d.deadline = null;
    d.deadlineKey = "";
    d.auctionDeadline = null;
    d.auctionKey = "";
    d.actionSeq = 0;
    d.botKey = "";
    d.botTraded = {};
    d.timers = d.timers.filter((t) => t.kind === "cleanup" || t.kind === "seatCleanup");
    d.endsAt = d.settings.capitale.end === "timed" ? now + d.settings.capitale.minutes * 60_000 : null;
    if (d.endsAt) this.addTimer({ at: d.endsAt, kind: "timeUp" });
    const first = this.seatById(state.players[state.turn]!.id);
    this.systemChat(`La partie commence : ${first?.name ?? "?"} lance les dés en premier.`);
    return this.afterChange(events, now);
  }

  // -------------------------------------------------------------------------
  // Boucle : après chaque changement, on programme la suite
  // -------------------------------------------------------------------------

  private async afterChange(events: CapitaleEvent[], now: number, closing?: WebSocket) {
    const d = this.data;
    if (!d) return;
    let finished = false;
    const g = d.capitale;
    if (g && d.status === "playing") {
      this.narrate(events);
      if (g.step === "over") {
        d.status = "finished";
        d.deadline = null;
        d.auctionDeadline = null;
        d.endsAt = null;
        finished = !d.recorded;
        if (finished) d.recorded = true;
        if (finished && d.tour) this.addTimer({ at: now + TOUR_TABLE_LINGER_MS, kind: "cleanup" });
      }
    }
    this.schedule(now);
    this.botReactions(events, now);
    await this.persist();
    this.broadcast(events, closing);
    await this.armAlarm();
    await this.syncHub();
    if (finished) await this.recordResults(now);
  }

  /** Quelques messages dans le chat pour les grands moments */
  private narrate(events: CapitaleEvent[]) {
    const name = (id: string) => this.seatById(id)?.name ?? "?";
    for (const e of events) {
      if (e.type === "bankrupt") {
        this.systemChat(
          e.to === "bank" ? `${name(e.player)} fait faillite.` : `${name(e.player)} fait faillite : ${name(e.to)} récupère tout.`,
        );
      } else if (e.type === "timeUp") {
        this.systemChat("C'est l'heure : ce tour est le dernier, puis on compte les fortunes.");
      } else if (e.type === "gameOver") {
        const g = this.data!.capitale!;
        const winners = e.ranking.filter((id) => g.ranks?.[id] === 1).map(name);
        if (winners.length > 0) this.systemChat(`${winners.join(" et ")} ${winners.length > 1 ? "remportent" : "remporte"} la partie !`);
      } else if (e.type === "auctionEnd" && e.winner) {
        this.systemChat(`${name(e.winner)} remporte ${SQUARES[e.square]!.name} aux enchères pour ${e.amount}.`);
      } else if (e.type === "trade" && e.status === "accepted") {
        this.systemChat(`Marché conclu entre ${name(e.trade.from)} et ${name(e.trade.to)}.`);
      }
    }
  }

  private seatById(id: string): Seat | undefined {
    return this.data!.seats.find((s) => s.id === id);
  }

  private plays(seat: Seat | undefined): boolean {
    return Boolean(seat && (seat.kind === "bot" || seat.autoplay));
  }

  private schedule(now: number) {
    const d = this.data!;
    const g = d.capitale;
    const decisionKinds: TimerKind[] = ["bot", "timeout", "auction", "botBid", "answer", "tradeExpiry"];
    if (!g || d.status !== "playing" || g.step === "over") {
      d.timers = d.timers.filter((t) => !decisionKinds.includes(t.kind) && t.kind !== "timeUp");
      d.deadline = null;
      d.auctionDeadline = null;
      return;
    }

    // L'enchère : un chrono qui repart à chaque offre ; les bots réfléchissent chacun à leur rythme
    if (g.auction) {
      const key = `${g.turnId}:${g.auction.square}:${g.auction.bids}`;
      if (d.auctionKey !== key) {
        d.auctionKey = key;
        d.timers = d.timers.filter((t) => t.kind !== "auction" && t.kind !== "botBid");
        d.auctionDeadline = now + (g.auction.bids === 0 ? AUCTION_FIRST_MS : AUCTION_BID_MS);
        this.addTimer({ at: d.auctionDeadline + 200, kind: "auction", key });
        for (const id of auctionBidders(g)) {
          if (this.plays(this.seatById(id))) this.addTimer({ at: now + 900 + random(d) * 1800, kind: "botBid", seatId: id, key });
        }
      }
    } else if (d.auctionKey) {
      d.auctionKey = "";
      d.auctionDeadline = null;
      d.timers = d.timers.filter((t) => t.kind !== "auction" && t.kind !== "botBid");
    }

    // La décision attendue : un bot joue après un temps de réflexion, un joueur a son chrono
    const actor = actorOf(g);
    const seat = actor ? this.seatById(actor) : undefined;
    if (!seat) {
      d.timers = d.timers.filter((t) => t.kind !== "bot" && t.kind !== "timeout");
      d.deadline = null;
      d.deadlineKey = "";
      d.botKey = "";
    } else if (this.plays(seat)) {
      d.timers = d.timers.filter((t) => t.kind !== "timeout");
      d.deadline = null;
      d.deadlineKey = "";
      const key = `${d.actionSeq}`;
      if (d.botKey !== key) {
        d.botKey = key;
        d.timers = d.timers.filter((t) => t.kind !== "bot");
        // Une suite de constructions va vite ; lancer les dés ou acheter prend un instant de réflexion
        const delay = g.step === "manage" || g.step === "debt" ? 650 : 1100 + random(d) * 700;
        this.addTimer({ at: now + delay, kind: "bot", seatId: seat.id, key });
      }
    } else {
      d.timers = d.timers.filter((t) => t.kind !== "bot");
      d.botKey = "";
      const key = `${g.decision}`;
      if (d.deadlineKey !== key) {
        d.deadlineKey = key;
        d.timers = d.timers.filter((t) => t.kind !== "timeout");
        d.deadline = null;
        const seconds = d.settings.capitale.turnSeconds;
        if (seconds > 0) {
          d.deadline = now + seconds * 1000;
          this.addTimer({ at: d.deadline + 300, kind: "timeout", seatId: seat.id, key });
        }
      }
    }

    // Les propositions d'échange : un bot répond, une offre à un joueur finit par s'effacer
    const live = new Set(g.trades.map((t) => t.id));
    d.timers = d.timers.filter((t) => (t.kind !== "answer" && t.kind !== "tradeExpiry") || live.has(t.trade!));
    for (const t of g.trades) {
      if (d.timers.some((x) => (x.kind === "answer" || x.kind === "tradeExpiry") && x.trade === t.id)) continue;
      if (this.plays(this.seatById(t.to))) this.addTimer({ at: now + 1500 + random(d) * 2000, kind: "answer", trade: t.id });
      else this.addTimer({ at: now + TRADE_EXPIRES_MS, kind: "tradeExpiry", trade: t.id });
    }
  }

  /** Quelques réactions des bots pour animer la table. */
  private botReactions(events: CapitaleEvent[], now: number) {
    const d = this.data!;
    for (const e of events) {
      let seatId: string | null = null;
      let pool: readonly string[] = [];
      if (e.type === "money" && e.reason === "rent" && e.amount >= 300) {
        if (this.seatById(e.to as string)?.kind === "bot") {
          seatId = e.to as string;
          pool = ["😎", "Merci bien", "🔥"];
        } else if (typeof e.from === "string") {
          seatId = e.from;
          pool = ["😭", "😡", "Coup bas !"];
        }
      } else if (e.type === "bankrupt") {
        seatId = e.player;
        pool = ["😭", "😡"];
      } else if (e.type === "gameOver") {
        seatId = e.ranking[0] ?? null;
        pool = ["😎", "👏", "Bien joué"];
      }
      const seat = seatId ? this.seatById(seatId) : undefined;
      if (seat?.kind === "bot" && random(d) < 0.35) {
        const emote = pool[Math.floor(random(d) * pool.length)]!;
        this.addTimer({ at: now + 1400 + random(d) * 700, kind: "emote", seatId: seat.id, emote });
      }
    }
  }

  private addTimer(t: Timer) {
    this.data!.timers.push(t);
  }

  private async armAlarm() {
    const d = this.data;
    if (!d || d.timers.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const next = Math.min(...d.timers.map((t) => t.at));
    await this.ctx.storage.setAlarm(Math.max(next, Date.now() + 5));
  }

  override async alarm() {
    const d = this.data;
    if (!d) return;
    const now = Date.now();
    const due = d.timers.filter((t) => t.at <= now + 15).sort((a, b) => a.at - b.at);
    d.timers = d.timers.filter((t) => t.at > now + 15);
    const events: CapitaleEvent[] = [];
    let changed = false;
    for (const t of due) {
      if (!this.data) return;
      const res = await this.runTimer(t);
      if (res) {
        changed = true;
        events.push(...res);
      }
    }
    if (!this.data) return;
    if (changed) await this.afterChange(events, now);
    else {
      await this.persist();
      await this.armAlarm();
    }
  }

  private botLevel(seat: Seat): BotLevel {
    return seat.kind === "bot" ? this.data!.settings.capitale.botLevel : "moyen";
  }

  /** Applique un coup ; s'il est refusé, un coup sûr le remplace pour que la partie ne se bloque jamais */
  private apply(g: CapitaleState, seatId: string, action: CapitaleAction | null): CapitaleEvent[] {
    const d = this.data!;
    if (action) {
      const res = applyAction(g, seatId, action);
      if (res.ok) {
        d.actionSeq += 1;
        return res.events;
      }
    }
    const fallback = safeAction(g, seatId);
    if (!fallback) return [];
    const res = applyAction(g, seatId, fallback);
    if (!res.ok) return [];
    d.actionSeq += 1;
    return res.events;
  }

  private async runTimer(t: Timer): Promise<CapitaleEvent[] | null> {
    const d = this.data!;
    const g = d.capitale;
    const playing = g !== null && d.status === "playing" && g.step !== "over";
    const seat = t.seatId ? this.seatById(t.seatId) : undefined;

    switch (t.kind) {
      case "bot": {
        if (!playing || !seat || t.key !== `${d.actionSeq}` || actorOf(g) !== seat.id || !this.plays(seat)) return null;
        const allowTrade = seat.kind === "bot" && d.botTraded[seat.id] !== g.turnId;
        const action = botAction(g, seat.id, this.botLevel(seat), { allowTrade });
        if (action?.type === "propose") d.botTraded[seat.id] = g.turnId;
        return this.apply(g, seat.id, action);
      }
      case "timeout": {
        if (!playing || !seat || t.key !== `${g.decision}` || actorOf(g) !== seat.id || this.plays(seat)) return null;
        seat.missed += 1;
        // À la place du joueur, le plus prudent : lancer, laisser aux enchères, finir son tour ; une dette se règle en entier
        const events: CapitaleEvent[] = [];
        for (let k = 0; k < 40 && g.step !== "over" && actorOf(g) === seat.id; k++) {
          const step = g.step;
          const action = step === "debt" ? botAction(g, seat.id, "moyen") : safeAction(g, seat.id);
          events.push(...this.apply(g, seat.id, action));
          if (step !== "debt") break;
        }
        if (seat.missed >= MAX_MISSED) {
          seat.autoplay = "afk";
          d.botKey = "";
          this.systemChat(`${seat.name} semble absent : un bot gère ses affaires.`);
        }
        return events;
      }
      case "auction": {
        if (!playing || !g.auction || t.key !== d.auctionKey) return null;
        return closeAuction(g);
      }
      case "botBid": {
        if (!playing || !g.auction || !seat || t.key !== d.auctionKey || !this.plays(seat)) return null;
        const action = botBid(g, seat.id, this.botLevel(seat));
        if (!action) return null;
        const res = applyAction(g, seat.id, action);
        if (!res.ok) return null;
        d.actionSeq += 1;
        return res.events;
      }
      case "answer": {
        const trade = g?.trades.find((x) => x.id === t.trade);
        if (!playing || !trade) return null;
        const to = this.seatById(trade.to);
        if (!this.plays(to)) return null;
        // Un joueur absent ne voit pas ses titres partir : son remplaçant refuse toujours
        const action: CapitaleAction =
          to!.kind === "bot" ? botAnswer(g, to!.id, trade, this.botLevel(to!)) : { type: "reject", trade: trade.id };
        const res = applyAction(g, to!.id, action);
        if (!res.ok) return this.apply(g, to!.id, { type: "reject", trade: trade.id });
        d.actionSeq += 1;
        return res.events;
      }
      case "tradeExpiry": {
        if (!playing || t.trade === undefined) return null;
        const events = expireTrade(g, t.trade);
        return events.length > 0 ? events : null;
      }
      case "timeUp": {
        if (!playing) return null;
        return timeUp(g);
      }
      case "away": {
        if (!seat || seat.disconnectedAt === null || d.status !== "playing" || seat.autoplay) return null;
        seat.autoplay = "away";
        d.botKey = "";
        this.systemChat(`${seat.name} s'est déconnecté : un bot gère ses affaires en attendant son retour.`);
        return [];
      }
      case "seatCleanup": {
        if (!seat || seat.disconnectedAt === null || d.status === "playing") return null;
        if (this.isConnected(seat.userId)) return null;
        d.seats = d.seats.filter((s) => s !== seat);
        d.rematch = d.rematch.filter((id) => id !== seat.userId);
        this.ensureHost();
        return [];
      }
      case "emote": {
        if (seat && t.emote) this.broadcastRaw({ t: "emote", seatId: seat.id, userId: seat.id, emote: t.emote });
        return null;
      }
      case "cleanup": {
        if (this.connectedUsers().size > 0) return null;
        await this.destroy();
        return null;
      }
      case "tourStart": {
        if (!d.tour || d.status !== "lobby") return null;
        await this.startTourGame(Date.now());
        return null;
      }
    }
  }

  private async destroy() {
    const d = this.data!;
    for (const s of d.seats) if (s.userId) void this.setPresence(s.userId, null).catch(() => {});
    await this.hub.removeRoom(d.code).catch(() => {});
    this.data = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private async recordResults(now: number) {
    const d = this.data!;
    const g = d.capitale!;
    const players = g.players.map((p, i) => {
      const seat = this.seatById(p.id);
      return {
        seat: i,
        userId: seat?.kind === "human" ? seat.userId : null,
        name: seat?.name ?? "?",
        isBot: seat?.kind !== "human",
        rank: g.ranks?.[p.id] ?? g.players.length,
        score: p.stats.netWorth,
        eliminated: p.bankrupt,
        team: null,
        stats: { ...p.stats },
      };
    });
    if (d.tour) {
      await reportToTour(this.env, d.tour.code, {
        code: d.code,
        index: d.tour.index,
        game: "capitale",
        seats: players.length,
        players: g.players.map((p, i) => ({ userId: players[i]!.userId ?? p.id, rank: players[i]!.rank, stats: { ...players[i]!.stats } })),
      });
    }
    try {
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "capitale",
        mode: g.settings.end,
        roomCode: d.code,
        settings: g.settings,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: g.round,
        players,
      });
      const unlocks = Object.entries(unlocked).map(([userId, ids]) => ({ userId, ids }));
      if (unlocks.length > 0) this.broadcastRaw({ t: "achievements", unlocks });
      if (this.data === d && Object.keys(elo).length > 0) {
        d.results = elo;
        await this.persist();
        this.broadcast([]);
      }
    } catch (err) {
      console.error("Enregistrement de la partie de Capitale impossible", err);
    }
  }

  // -------------------------------------------------------------------------
  // Diffusion
  // -------------------------------------------------------------------------

  private systemChat(text: string) {
    const d = this.data!;
    const message: ChatMessage = { id: ++d.chatSeq, userId: null, name: "", text, at: Date.now(), system: true };
    this.pushChat(message);
    this.broadcastRaw({ t: "chat", messages: [message] });
    if (d.tour && d.status !== "lobby") tourChat(this.env, d.tour.code, d.code, text);
  }

  /** Statut montré aux amis ; à une table de tournée, c'est la tournée qui le donne */
  private setPresence(userId: string, room: PresenceRoom | null): Promise<void> {
    if (this.data?.tour) return Promise.resolve();
    return this.hub.setUserRoom(userId, room);
  }

  private pushChat(message: ChatMessage) {
    const d = this.data!;
    d.chat.push(message);
    if (d.chat.length > CHAT_KEEP) d.chat.splice(0, d.chat.length - CHAT_KEEP);
  }

  private viewFor(userId: string, connected: Map<string, PublicUser>): CapitaleRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    return {
      code: d.code,
      game: "capitale",
      status: d.status,
      settings: d.settings,
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
      })),
      spectators: [...connected.values()].filter((u) => !seatedUsers.has(u.id)).map((u) => ({ userId: u.id, name: u.pseudo })),
      hostId: d.hostId,
      you: { userId, seatId: seat?.id ?? null, isHost: userId === d.hostId, isAdmin: Boolean(connected.get(userId)?.admin) },
      capitale: d.capitale ? viewFor(d.capitale, seat?.id ?? null) : null,
      deadline: d.deadline,
      auctionDeadline: d.auctionDeadline,
      endsAt: d.endsAt,
      serverNow: Date.now(),
      rematch: d.rematch,
      results: d.results ?? null,
      quick: d.quick,
      tour: d.tour?.code ?? null,
    };
  }

  private broadcast(events: CapitaleEvent[], except?: WebSocket) {
    const connected = this.connectedUsers(except);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: "room", room: this.viewFor(att.userId, connected), events });
    }
  }

  private broadcastRaw(msg: CapitaleServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: CapitaleServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // déjà fermée
    }
  }

  private async persist() {
    if (this.data) await this.ctx.storage.put("room", this.data);
  }

  private presenceRoom(): PresenceRoom {
    return { code: this.data!.code, game: "capitale", status: this.data!.status };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    return {
      code: d.code,
      game: "capitale",
      variant: d.settings.capitale.end,
      status: d.status,
      visibility: d.settings.visibility,
      hostName: host?.name ?? "",
      humans: d.seats.filter((s) => s.kind === "human").length,
      bots: d.seats.filter((s) => s.kind === "bot").length,
      maxPlayers: d.settings.maxPlayers,
      names: d.seats.filter((s) => s.kind === "human").map((s) => s.name),
      createdAt: d.createdAt,
      quick: d.quick,
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

/** Le coup le plus prudent à la place d'un joueur : lancer, laisser aux enchères, finir son tour, ou faillite s'il ne reste rien */
function safeAction(g: CapitaleState, seatId: string): CapitaleAction | null {
  if (actorOf(g) !== seatId) return null;
  switch (g.step) {
    case "roll":
      return { type: "roll" };
    case "buy":
      return { type: "decline" };
    case "manage":
      return { type: "endTurn" };
    case "debt":
      return { type: "bankrupt" };
    default:
      return null;
  }
}

function sanitizeOffer(raw: unknown): Offer {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    cash: Number(o.cash) || 0,
    squares: Array.isArray(o.squares) ? o.squares.slice(0, 28).map(Number) : [],
    jailCards: Number(o.jailCards) || 0,
  };
}

function sanitizeAction(raw: unknown): CapitaleAction | null {
  const a = (raw ?? {}) as Record<string, unknown>;
  switch (a.type) {
    case "roll":
    case "payJail":
    case "useJailCard":
    case "buy":
    case "decline":
    case "pass":
    case "bankrupt":
    case "endTurn":
      return { type: a.type };
    case "bid":
      return { type: "bid", amount: Number(a.amount) };
    case "build":
    case "sell":
    case "mortgage":
    case "unmortgage":
      return { type: a.type, square: Number(a.square) };
    case "propose":
      return {
        type: "propose",
        to: String(a.to ?? ""),
        give: sanitizeOffer(a.give),
        get: sanitizeOffer(a.get),
        ...(a.replaces !== undefined ? { replaces: Number(a.replaces) } : {}),
      };
    case "accept":
    case "reject":
    case "cancel":
      return { type: a.type, trade: Number(a.trade) };
    default:
      return null;
  }
}

function mergeSettings(current: CapitaleSettings, patch: Partial<CapitaleSettings>): CapitaleSettings {
  const next = { ...current };
  if (patch.end === "timed" || patch.end === "bankrupt") next.end = patch.end;
  if ((GAME_MINUTES as readonly number[]).includes(patch.minutes as number)) next.minutes = patch.minutes!;
  if ((TURN_SECONDS as readonly number[]).includes(patch.turnSeconds as number)) next.turnSeconds = patch.turnSeconds!;
  for (const key of ["freeParking", "doubleGo", "noRentInJail", "quickStart"] as const) {
    if (typeof patch[key] === "boolean") next[key] = patch[key];
  }
  if (patch.botLevel === "facile" || patch.botLevel === "moyen" || patch.botLevel === "fort") next.botLevel = patch.botLevel;
  return next;
}
