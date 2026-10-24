import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { botCatchDelay, botThinkDelay, botTurn } from "../shared/games/uno/bot.ts";
import { sameFace } from "../shared/games/uno/cards.ts";
import {
  applyAction,
  createGame,
  DEFAULT_SETTINGS,
  effectiveRules,
  startNextRound,
  tick,
  timeoutActions,
  topCard,
  UNO_GRACE_MS,
  type UnoAction,
  type UnoEvent,
  type UnoSettings,
  type UnoState,
} from "../shared/games/uno/engine.ts";
import { viewFor } from "../shared/games/uno/view.ts";
import {
  CHAT_MAX,
  MAX_PLAYERS,
  MIN_PLAYERS,
  REACTIONS,
  TAUNTS,
  type ChatMessage,
  type PresenceRoom,
  type PublicUser,
  type RoomClientMessage,
  type RoomServerMessage,
  type RoomSettings,
  type RoomStatus,
  type RoomSummary,
  type RoomView,
  type Visibility,
} from "../shared/protocol.ts";
import { random, randomSeed } from "../shared/rng.ts";
import { recordGame, type EloResults } from "./users.ts";
import { decodeHeaderJson } from "./util.ts";

const BOT_NAMES = [
  "Gaston",
  "Ginette",
  "Marcel",
  "Josiane",
  "Raymond",
  "Huguette",
  "Lucien",
  "Simone",
  "Bernard",
  "Paulette",
  "Roger",
  "Mireille",
];
// Délai laissé à un joueur déconnecté pour revenir avant qu'un bot joue à sa place (compte à rebours affiché à tous)
const AWAY_AFTER_MS = 10_000;
const SEAT_RELEASE_MS = 25_000;
const NEXT_ROUND_MS = 12_000;
const MAX_MISSED_TURNS = 2;
const CHAT_KEEP = 80;

interface Seat {
  id: string;
  kind: "human" | "bot";
  userId: string | null;
  name: string;
  avatar: AvatarConfig;
  photo: number;
  /** Administrateur du site */
  admin?: boolean;
  /** « away » : deconnecte ; « afk » : a laisse passer plusieurs tours */
  autoplay: false | "away" | "afk";
  missed: number;
  disconnectedAt: number | null;
}

type TimerKind = "bot" | "timeout" | "tick" | "catch" | "botUno" | "jumpIn" | "nextRound" | "away" | "seatCleanup" | "cleanup" | "emote";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
  target?: string;
  turnId?: number;
  cardId?: number;
  emote?: string;
}

interface RoomData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: RoomSettings;
  status: RoomStatus;
  seats: Seat[];
  botCounter: number;
  uno: UnoState | null;
  startedAt: number | null;
  turnDeadline: number | null;
  scheduledTurnId: number;
  catchKey: string | null;
  nextRoundAt: number | null;
  rematch: string[];
  chat: ChatMessage[];
  chatSeq: number;
  timers: Timer[];
  kicked: string[];
  rng: number;
  recorded: boolean;
  /** Elo de chacun après la dernière partie, affiché sur la feuille de fin */
  results?: EloResults | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
}

export interface RoomInit {
  code: string;
  host: PublicUser;
  visibility: Visibility;
  quick: boolean;
}

/** Un salon de jeu : un serveur de partie autoritaire, une connexion WebSocket par joueur. */
export class GameRoom extends DurableObject<Env> {
  private data: RoomData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<RoomData>("room")) ?? null;
    });
  }

  private get hub() {
    return this.env.HUB.get(this.env.HUB.idFromName("hub"));
  }

  // -------------------------------------------------------------------------
  // API appelee par le worker
  // -------------------------------------------------------------------------

  async init(opts: RoomInit): Promise<boolean> {
    if (this.data) return false;
    const now = Date.now();
    this.data = {
      code: opts.code,
      createdAt: now,
      hostId: opts.host.id,
      quick: opts.quick,
      settings: { visibility: opts.visibility, maxPlayers: 6, uno: { ...DEFAULT_SETTINGS } },
      status: "lobby",
      seats: [],
      botCounter: 0,
      uno: null,
      startedAt: null,
      turnDeadline: null,
      scheduledTurnId: -1,
      catchKey: null,
      nextRoundAt: null,
      rematch: [],
      chat: [],
      chatSeq: 0,
      timers: [{ at: now + 10 * 60_000, kind: "cleanup" }],
      kicked: [],
      rng: randomSeed(),
      recorded: false,
    };
    await this.persist();
    await this.syncHub();
    await this.armAlarm();
    return true;
  }

  async summary(): Promise<RoomSummary | null> {
    return this.data ? this.buildSummary() : null;
  }

  /** Administration : ferme la table pour tout le monde. */
  async adminClose(): Promise<boolean> {
    if (!this.data) return false;
    await this.close("La table a été fermée par l'administrateur du site.");
    return true;
  }

  /** Administration : sort un joueur de la table (compte suspendu par exemple). */
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
  // Arrivees et departs
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
        d.scheduledTurnId = -1;
        if (d.status === "playing") this.systemChat(`${seat.name} est de retour à la table.`);
      }
      if (d.status !== "playing") {
        seat.name = user.pseudo;
        seat.avatar = user.avatar;
        seat.photo = user.photo;
      }
    } else if (d.status !== "playing") {
      seat = this.seatHuman(user) ?? undefined;
      if (seat) this.systemChat(`${user.pseudo} s'installe à la table.`);
    }
    if (!seat) this.systemChat(`${user.pseudo} regarde la partie.`);
    this.ensureHost();
    this.send(ws, { t: "chat", messages: d.chat, reset: true });
    await this.afterChange([], now);
    void this.hub.setUserRoom(user.id, this.presenceRoom()).catch(() => {});
  }

  /** Installe un humain : place libre, ou a la place d'un bot si la table est pleine. */
  private seatHuman(user: PublicUser): Seat | null {
    const d = this.data!;
    const seat: Seat = {
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
    if (d.seats.length < d.settings.maxPlayers) {
      d.seats.push(seat);
      return seat;
    }
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
    void this.hub.setUserRoom(att.userId, null).catch(() => {});
    await this.afterChange([], now, ws);
  }

  private ensureHost() {
    const d = this.data!;
    const hostSeat = d.seats.find((s) => s.userId === d.hostId);
    if (hostSeat) return;
    const connected = this.connectedUsers();
    if (d.seats.length === 0 && connected.has(d.hostId)) return;
    const next = d.seats.find((s) => s.kind === "human" && this.isConnected(s.userId)) ?? d.seats.find((s) => s.kind === "human");
    const fallback = next?.userId ?? connected.keys().next().value;
    if (fallback && fallback !== d.hostId) {
      d.hostId = fallback;
      const name = next?.name ?? connected.get(fallback)?.pseudo ?? "Quelqu'un";
      this.systemChat(`${name} est maintenant l'hôte.`);
    }
  }

  // -------------------------------------------------------------------------
  // Messages des joueurs
  // -------------------------------------------------------------------------

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const d = this.data;
    if (!d || typeof raw !== "string" || raw.length > 4000) return;
    let msg: RoomClientMessage;
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

    switch (msg.t) {
      case "action": {
        if (d.status !== "playing" || !d.uno) return error("Aucune partie en cours.");
        if (!seat) return error("Tu regardes la partie : attends la prochaine pour jouer.");
        if (seat.autoplay) {
          seat.autoplay = false;
          seat.missed = 0;
          d.scheduledTurnId = -1;
        }
        const res = applyAction(d.uno, seat.id, sanitizeAction(msg.action), now);
        if (!res.ok) {
          error(res.error);
          return this.afterChange([], now);
        }
        if (d.uno.players[d.uno.turn]?.id !== seat.id || res.events.length > 0) seat.missed = 0;
        return this.afterChange(res.events, now);
      }

      case "takeBack": {
        if (!seat || !seat.autoplay) return;
        seat.autoplay = false;
        seat.missed = 0;
        d.scheduledTurnId = -1;
        this.systemChat(`${seat.name} reprend la main.`);
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
        const seated = this.seatHuman(att.user);
        if (!seated) return error("La table est complète.");
        this.systemChat(`${att.user.pseudo} s'installe à la table.`);
        return this.afterChange([], now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            d.scheduledTurnId = -1;
            this.systemChat(`${seat.name} a quitté la table, un bot prend le relais.`);
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
            // deja fermee
          }
        }
        this.ensureHost();
        void this.hub.setUserRoom(userId, null).catch(() => {});
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

    // Actions reservees a l'hote ; l'admin du site peut aussi faire le menage
    const moderation = msg.t === "kick" || msg.t === "removeSeat";
    if (!isHost && !(isAdmin && moderation)) return error("Seul l'hôte peut faire ça.");
    switch (msg.t) {
      case "settings": {
        if (d.status === "playing") return error("On ne change pas les règles en pleine partie.");
        d.settings.uno = mergeSettings(d.settings.uno, msg.settings ?? {});
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= MIN_PLAYERS && max <= MAX_PLAYERS) {
            d.settings.maxPlayers = max;
            // On retire d'abord des bots si la table devient trop petite
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
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${d.botCounter + 1}`;
        const id = `bot-${++d.botCounter}`;
        d.seats.push({
          id,
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

      case "nextRound": {
        if (!d.uno || d.uno.phase !== "roundOver") return;
        d.nextRoundAt = null;
        d.timers = d.timers.filter((t) => t.kind !== "nextRound");
        return this.afterChange(startNextRound(d.uno), now);
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
        d.scheduledTurnId = -1;
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
        // deja fermee
      }
    }
    this.ensureHost();
    void this.hub.setUserRoom(target, null).catch(() => {});
    return this.afterChange([], now);
  }

  /** Ferme la table : tout le monde est prevenu puis le salon disparait. */
  private async close(reason: string) {
    const connected = [...this.connectedUsers().keys()];
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, { t: "closed", reason });
      try {
        ws.close(4004, "Table fermee");
      } catch {
        // deja fermee
      }
    }
    for (const id of connected) void this.hub.setUserRoom(id, null).catch(() => {});
    await this.destroy();
  }

  private allowMessage(key: string, minGapMs: number): boolean {
    const now = Date.now();
    const last = this.lastMessageAt.get(key) ?? 0;
    if (now - last < minGapMs) return false;
    this.lastMessageAt.set(key, now);
    return true;
  }

  private async startGame(now: number, ws?: WebSocket) {
    const d = this.data!;
    // Les absents ne sont pas reconduits pour la nouvelle partie
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
      d.settings.uno,
      randomSeed(),
    );
    d.uno = state;
    d.status = "playing";
    d.startedAt = now;
    d.recorded = false;
    d.results = null;
    d.rematch = [];
    d.scheduledTurnId = -1;
    d.catchKey = null;
    d.nextRoundAt = null;
    d.timers = d.timers.filter((t) => t.kind === "cleanup" || t.kind === "seatCleanup");
    this.systemChat(`La partie commence ! ${variantLabel(d.settings.uno)}.`);
    return this.afterChange(events, now);
  }

  // -------------------------------------------------------------------------
  // Boucle : apres chaque changement, on programme la suite
  // -------------------------------------------------------------------------

  private async afterChange(events: UnoEvent[], now: number, closing?: WebSocket) {
    const d = this.data;
    if (!d) return;
    let finished = false;
    if (d.uno && d.status === "playing") {
      if (d.uno.phase === "gameOver") {
        d.status = "finished";
        d.turnDeadline = null;
        d.nextRoundAt = null;
        finished = !d.recorded;
        if (finished) d.recorded = true;
        const winner = d.seats.find((s) => s.id === d.uno!.ranking?.[0]);
        if (winner) this.systemChat(`${winner.name} remporte la partie !`);
      } else if (d.uno.phase === "roundOver" && d.nextRoundAt === null) {
        d.nextRoundAt = now + NEXT_ROUND_MS;
        this.addTimer({ at: d.nextRoundAt, kind: "nextRound" });
      }
    }
    this.schedule(now, events);
    this.botReactions(events, now);
    await this.persist();
    this.broadcast(events, closing);
    await this.armAlarm();
    await this.syncHub();
    if (finished) await this.recordResults(now);
  }

  private seatById(id: string): Seat | undefined {
    return this.data!.seats.find((s) => s.id === id);
  }

  private schedule(now: number, events: UnoEvent[]) {
    const d = this.data!;
    const g = d.uno;
    d.timers = d.timers.filter((t) => (t.kind !== "bot" && t.kind !== "timeout") || (g !== null && t.turnId === g.turnId));
    if (!g || d.status !== "playing" || g.phase !== "playing") {
      d.turnDeadline = null;
      d.timers = d.timers.filter((t) => !["bot", "timeout", "catch", "botUno", "jumpIn", "tick"].includes(t.kind));
      return;
    }
    const current = this.seatById(g.players[g.turn]!.id)!;
    if (d.scheduledTurnId !== g.turnId) {
      d.scheduledTurnId = g.turnId;
      d.timers = d.timers.filter((t) => t.kind !== "bot" && t.kind !== "timeout");
      d.turnDeadline = null;
      if (current.kind === "bot" || current.autoplay) {
        const delay = botThinkDelay(g, d) * (current.kind === "bot" ? 1 : 0.6);
        this.addTimer({ at: now + delay, kind: "bot", seatId: current.id, turnId: g.turnId });
      } else if (d.settings.uno.turnSeconds > 0) {
        d.turnDeadline = now + d.settings.uno.turnSeconds * 1000;
        this.addTimer({ at: d.turnDeadline + 400, kind: "timeout", seatId: current.id, turnId: g.turnId });
      }
    }

    // Fenetre du contre-UNO : les bots peuvent denoncer, le fautif peut se rattraper
    const w = g.unoWindow;
    if (w) {
      const key = `${w.player}:${w.since}`;
      if (d.catchKey !== key) {
        d.catchKey = key;
        const vulnerable = this.seatById(g.players[w.player]!.id)!;
        this.addTimer({ at: w.since + UNO_GRACE_MS + 80, kind: "tick" });
        let best: { seat: Seat; delay: number } | null = null;
        for (const s of d.seats) {
          if (s === vulnerable || !(s.kind === "bot" || s.autoplay)) continue;
          if (g.players.find((p) => p.id === s.id)?.out) continue;
          const delay = botCatchDelay(d);
          if (delay !== null && (!best || delay < best.delay)) best = { seat: s, delay };
        }
        if (best) this.addTimer({ at: w.since + best.delay, kind: "catch", seatId: best.seat.id, target: vulnerable.id });
        if (vulnerable.kind === "bot" && random(d) < 0.5) {
          this.addTimer({ at: w.since + 900 + random(d) * 1600, kind: "botUno", seatId: vulnerable.id });
        }
      }
    }

    // Interception par un bot
    const lastPlay = [...events].reverse().find((e) => e.type === "play");
    if (lastPlay && effectiveRules(g.settings).jumpIn && g.pendingDraw === 0) {
      const top = topCard(g);
      for (const s of d.seats) {
        if (s.kind !== "bot" || s.id === g.players[g.turn]!.id) continue;
        const twin = g.players.find((p) => p.id === s.id)?.hand.find((c) => sameFace(c, top) && c.id !== top.id);
        if (twin && random(d) < 0.45) {
          this.addTimer({ at: now + 700 + random(d) * 900, kind: "jumpIn", seatId: s.id, cardId: twin.id, turnId: g.turnId });
          break;
        }
      }
    }
  }

  /** Petites reactions des bots pour animer la table. */
  private botReactions(events: UnoEvent[], now: number) {
    const d = this.data!;
    for (const e of events) {
      let seatId: string | null = null;
      let pool: readonly string[] = [];
      if (e.type === "draw" && (e.reason === "penalty" || e.reason === "roulette") && e.count >= 4) {
        seatId = e.player;
        pool = ["😡", "😭", "😱", "C'est personnel", "Pitié…"];
      } else if (e.type === "caught") {
        seatId = e.by;
        pool = ["😎", "🤡", "Oups"];
      } else if (e.type === "gameOver") {
        seatId = e.ranking[0] ?? null;
        pool = ["😎", "Trop facile", "👏"];
      } else if (e.type === "challenge" && e.success) {
        seatId = e.challenger;
        pool = ["🤡", "😎"];
      }
      const seat = seatId ? this.seatById(seatId) : undefined;
      if (seat?.kind === "bot" && random(d) < 0.4) {
        const emote = pool[Math.floor(random(d) * pool.length)]!;
        this.addTimer({ at: now + 700 + random(d) * 700, kind: "emote", seatId: seat.id, emote });
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
    const events: UnoEvent[] = [];
    let changed = false;
    for (const t of due) {
      if (!this.data) return;
      const res = await this.runTimer(t, now);
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

  /** Renvoie les evenements produits (tableau vide = changement sans evenement), ou null si rien n'a bouge. */
  private async runTimer(t: Timer, now: number): Promise<UnoEvent[] | null> {
    const d = this.data!;
    const g = d.uno;
    const playing = g !== null && d.status === "playing" && g.phase === "playing";
    const seat = t.seatId ? this.seatById(t.seatId) : undefined;

    switch (t.kind) {
      case "bot": {
        if (!playing || !seat || g.turnId !== t.turnId || g.players[g.turn]!.id !== seat.id) return null;
        if (!(seat.kind === "bot" || seat.autoplay)) return null;
        return this.playAll(g, seat.id, botTurn(g, seat.id, d), now);
      }
      case "timeout": {
        if (!playing || !seat || g.turnId !== t.turnId || g.players[g.turn]!.id !== seat.id || seat.autoplay) return null;
        seat.missed += 1;
        const events = this.playAll(g, seat.id, timeoutActions(g), now);
        if (seat.missed >= MAX_MISSED_TURNS) {
          seat.autoplay = "afk";
          d.scheduledTurnId = -1;
          this.systemChat(`${seat.name} semble absent : un bot joue à sa place.`);
        }
        return events;
      }
      case "tick":
        return g && tick(g, now) ? [] : null;
      case "catch": {
        if (!playing || !seat || !g.unoWindow || g.players[g.unoWindow.player]!.id !== t.target) return null;
        const res = applyAction(g, seat.id, { type: "catch", target: t.target! }, now);
        return res.ok ? res.events : null;
      }
      case "botUno": {
        if (!playing || !seat || !g.unoWindow || g.players[g.unoWindow.player]!.id !== seat.id) return null;
        const res = applyAction(g, seat.id, { type: "uno" }, now);
        return res.ok ? res.events : null;
      }
      case "jumpIn": {
        if (!playing || !seat || g.turnId !== t.turnId || t.cardId === undefined) return null;
        const res = applyAction(g, seat.id, { type: "play", cardId: t.cardId }, now);
        return res.ok ? res.events : null;
      }
      case "nextRound": {
        if (!g || g.phase !== "roundOver") return null;
        d.nextRoundAt = null;
        return startNextRound(g);
      }
      case "away": {
        if (!seat || seat.disconnectedAt === null || d.status !== "playing" || seat.autoplay) return null;
        seat.autoplay = "away";
        d.scheduledTurnId = -1;
        this.systemChat(`${seat.name} s'est déconnecté : un bot joue à sa place en attendant son retour.`);
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
    }
  }

  /** Joue une suite d'actions pour un siege ; en cas de refus, se rabat sur l'action de secours. */
  private playAll(g: UnoState, seatId: string, actions: UnoAction[], now: number): UnoEvent[] {
    const events: UnoEvent[] = [];
    for (const action of actions) {
      const res = applyAction(g, seatId, action, now);
      if (res.ok) {
        events.push(...res.events);
        continue;
      }
      console.warn("Action de bot refusee", res.error, action);
      if (g.phase === "playing" && g.players[g.turn]!.id === seatId) {
        for (const fallback of timeoutActions(g)) {
          const again = applyAction(g, seatId, fallback, now);
          if (again.ok) events.push(...again.events);
        }
      }
      break;
    }
    return events;
  }

  private async destroy() {
    const d = this.data!;
    for (const s of d.seats) if (s.userId) void this.hub.setUserRoom(s.userId, null).catch(() => {});
    await this.hub.removeRoom(d.code).catch(() => {});
    this.data = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private async recordResults(now: number) {
    const d = this.data!;
    const g = d.uno!;
    const ranking = g.ranking ?? [];
    try {
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "uno",
        roomCode: d.code,
        settings: g.settings,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: g.round,
        players: g.players.map((p, i) => {
          const seat = this.seatById(p.id);
          return {
            seat: i,
            userId: seat?.kind === "human" ? seat.userId : null,
            name: seat?.name ?? "?",
            isBot: seat?.kind !== "human",
            rank: ranking.indexOf(p.id) + 1,
            score: p.score,
            eliminated: p.eliminated,
            stats: p.stats,
          };
        }),
      });
      const unlocks = Object.entries(unlocked).map(([userId, ids]) => ({ userId, ids }));
      if (unlocks.length > 0) this.broadcastRaw({ t: "achievements", unlocks });
      // Le nouvel Elo arrive après la fin de partie : on rediffuse la table pour la feuille de fin
      if (this.data === d && Object.keys(elo).length > 0) {
        d.results = elo;
        await this.persist();
        this.broadcast([]);
      }
    } catch (err) {
      console.error("Enregistrement de la partie impossible", err);
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
  }

  private pushChat(message: ChatMessage) {
    const d = this.data!;
    d.chat.push(message);
    if (d.chat.length > CHAT_KEEP) d.chat.splice(0, d.chat.length - CHAT_KEEP);
  }

  private viewFor(userId: string, connected: Map<string, PublicUser>): RoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    return {
      code: d.code,
      game: "uno",
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
      uno: d.uno ? viewFor(d.uno, seat?.id ?? null) : null,
      turnDeadline: d.turnDeadline,
      nextRoundAt: d.nextRoundAt,
      serverNow: Date.now(),
      rematch: d.rematch,
      results: d.results ?? null,
      quick: d.quick,
    };
  }

  private broadcast(events: UnoEvent[], except?: WebSocket) {
    const connected = this.connectedUsers(except);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: "room", room: this.viewFor(att.userId, connected), events });
    }
  }

  private broadcastRaw(msg: RoomServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // deja fermee
      }
    }
  }

  private send(ws: WebSocket, msg: RoomServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // deja fermee
    }
  }

  private async persist() {
    if (this.data) await this.ctx.storage.put("room", this.data);
  }

  private presenceRoom(): PresenceRoom {
    return { code: this.data!.code, game: "uno", status: this.data!.status };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    return {
      code: d.code,
      game: "uno",
      variant: d.settings.uno.variant,
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
    // Statut des joueurs presents pour leurs amis
    const presence = JSON.stringify(this.presenceRoom());
    for (const userId of this.connectedUsers().keys()) {
      if (this.lastPresence.get(userId) === presence) continue;
      this.lastPresence.set(userId, presence);
      void this.hub.setUserRoom(userId, this.presenceRoom()).catch(() => {});
    }
  }
}

function variantLabel(s: UnoSettings): string {
  return s.variant === "nomercy" ? "Mode No Mercy, sans pitié" : "UNO classique";
}

function sanitizeAction(raw: unknown): UnoAction {
  const a = (raw ?? {}) as Record<string, unknown>;
  switch (a.type) {
    case "play":
      return {
        type: "play",
        cardId: Number(a.cardId),
        ...(typeof a.color === "string" ? { color: a.color as never } : {}),
        ...(typeof a.target === "string" ? { target: a.target } : {}),
      };
    case "catch":
      return { type: "catch", target: String(a.target ?? "") };
    case "roulette":
      return { type: "roulette", color: String(a.color ?? "") as never };
    case "draw":
    case "pass":
    case "uno":
    case "challenge":
      return { type: a.type };
    default:
      return { type: "pass" };
  }
}

function mergeSettings(current: UnoSettings, patch: Partial<UnoSettings>): UnoSettings {
  const next = { ...current };
  if (patch.variant === "classic" || patch.variant === "nomercy") {
    if (patch.variant !== next.variant && next.endMode === "points") next.targetScore = patch.variant === "nomercy" ? 1000 : 500;
    next.variant = patch.variant;
  }
  for (const key of ["stacking", "drawUntilPlayable", "sevenZero", "jumpIn"] as const) {
    if (typeof patch[key] === "boolean") next[key] = patch[key];
  }
  if (patch.endMode === "first" || patch.endMode === "ranking" || patch.endMode === "points") next.endMode = patch.endMode;
  if (typeof patch.targetScore === "number" && [100, 200, 300, 500, 750, 1000, 1500, 2000].includes(patch.targetScore)) {
    next.targetScore = patch.targetScore;
  }
  if (typeof patch.turnSeconds === "number" && [0, 15, 30, 60].includes(patch.turnSeconds)) next.turnSeconds = patch.turnSeconds;
  return next;
}
