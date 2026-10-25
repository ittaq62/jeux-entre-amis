import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { botAction, randomShot } from "../shared/games/naval/bot.ts";
import {
  applyAction,
  createGame,
  DEFAULT_SETTINGS,
  fleetAfloat,
  forceReady,
  GRID_SIZES,
  modeOf,
  TURN_SECONDS,
  type BotLevel,
  type NavalAction,
  type NavalEvent,
  type NavalSettings,
  type NavalState,
  type Placement,
} from "../shared/games/naval/engine.ts";
import { eventsFor, viewFor } from "../shared/games/naval/view.ts";
import {
  CHAT_MAX,
  MIN_PLAYERS,
  NAVAL_MAX_PLAYERS,
  REACTIONS,
  TAUNTS,
  type ChatMessage,
  type NavalClientMessage,
  type NavalRoomSettings,
  type NavalRoomView,
  type NavalServerMessage,
  type PresenceRoom,
  type PublicUser,
  type RoomStatus,
  type RoomSummary,
} from "../shared/protocol.ts";
import { random, randomSeed } from "../shared/rng.ts";
import type { TourInit } from "../shared/tour.ts";
import type { RoomInit } from "./room.ts";
import { abortToTour, reportToTour, TOUR_JOIN_MS, TOUR_LOCKED, TOUR_TABLE_LINGER_MS, tourChat } from "./tourLink.ts";
import { recordGame, type EloResults } from "./users.ts";
import { decodeHeaderJson } from "./util.ts";

// Des marins bretons pour compléter l'équipage
const BOT_NAMES = ["Corentin", "Yvonne", "Loïc", "Maëlle", "Gwenaël", "Soizic", "Erwan", "Nolwenn", "Ronan", "Anaïg"];
// Délai laissé à un joueur déconnecté pour revenir avant qu'un bot joue à sa place (compte à rebours affiché à tous)
const AWAY_AFTER_MS = 10_000;
const SEAT_RELEASE_MS = 25_000;
const PLACEMENT_MS = 90_000;
const MAX_MISSED_TURNS = 2;
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
  /** Équipe choisie au salon pour le 2 contre 2 : 0 bâbord, 1 tribord */
  team: 0 | 1;
}

/** L'équipe la moins remplie, bâbord en cas d'égalité : on y place chaque nouvel arrivant. */
function emptierTeam(seats: Seat[]): 0 | 1 {
  const port = seats.filter((s) => s.team === 0).length;
  return port <= seats.length - port ? 0 : 1;
}

type TimerKind = "bot" | "timeout" | "placement" | "away" | "seatCleanup" | "cleanup" | "emote" | "tourStart";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
  turnId?: number;
  emote?: string;
}

interface NavalData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: NavalRoomSettings;
  status: RoomStatus;
  seats: Seat[];
  botCounter: number;
  naval: NavalState | null;
  startedAt: number | null;
  turnDeadline: number | null;
  placementDeadline: number | null;
  scheduledTurnId: number;
  rematch: string[];
  chat: ChatMessage[];
  chatSeq: number;
  timers: Timer[];
  kicked: string[];
  rng: number;
  recorded: boolean;
  /** Elo de chacun après la dernière partie, affiché sur la feuille de fin */
  results?: EloResults | null;
  /** Table d'une tournée : la tournée l'a créée et attend son résultat */
  tour?: TourInit | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
}

/** Un salon de bataille navale : même fonctionnement que le salon UNO, avec son propre moteur. */
export class NavalRoom extends DurableObject<Env> {
  private data: NavalData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<NavalData>("room")) ?? null;
      // Tables ouvertes avant le choix des équipes : on alterne comme avant
      this.data?.seats.forEach((seat, i) => (seat.team ??= (i % 2) as 0 | 1));
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
      settings: { visibility: opts.visibility, maxPlayers: 2, naval: { ...DEFAULT_SETTINGS } },
      status: "lobby",
      seats: [],
      botCounter: 0,
      naval: null,
      startedAt: null,
      turnDeadline: null,
      placementDeadline: null,
      scheduledTurnId: -1,
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
      // Tout le monde est déjà à bord ; en 2 contre 2, avec les équipes de la tournée
      const d = this.data;
      const teams = opts.tour.teams;
      d.seats = opts.tour.players.map((u, i) => ({ ...this.newHumanSeat(u, teams?.[u.id] ?? ((i % 2) as 0 | 1)), disconnectedAt: now }));
      d.settings.maxPlayers = Math.min(NAVAL_MAX_PLAYERS, Math.max(MIN_PLAYERS, d.seats.length));
      d.settings.naval.teams = teams !== null && d.seats.length === 4;
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
        d.scheduledTurnId = -1;
        if (d.status === "playing") this.systemChat(`${seat.name} est de retour à bord.`);
      }
      if (d.status !== "playing") {
        seat.name = user.pseudo;
        seat.avatar = user.avatar;
        seat.photo = user.photo;
      }
    } else if (d.status !== "playing" && !d.tour) {
      seat = this.seatHuman(user) ?? undefined;
      if (seat) this.systemChat(`${user.pseudo} monte à bord.`);
    }
    if (!seat) this.systemChat(`${user.pseudo} observe la bataille.`);
    this.ensureHost();
    this.send(ws, { t: "chat", messages: d.chat, reset: true });
    if (d.tour && d.status === "lobby" && d.seats.every((s) => s.kind === "bot" || this.isConnected(s.userId))) {
      return this.startTourGame(now);
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
      missed: 0,
      disconnectedAt: null,
      team,
    };
  }

  private seatHuman(user: PublicUser): Seat | null {
    const d = this.data!;
    const seat = this.newHumanSeat(user, emptierTeam(d.seats));
    if (d.seats.length < d.settings.maxPlayers) {
      d.seats.push(seat);
      return seat;
    }
    // Table pleine : on prend la place d'un bot, et son équipe
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
      this.systemChat(`${name} prend le commandement de la table.`);
    }
  }

  // -------------------------------------------------------------------------
  // Messages des joueurs
  // -------------------------------------------------------------------------

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const d = this.data;
    if (!d || typeof raw !== "string" || raw.length > 6000) return;
    let msg: NavalClientMessage;
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
        const g = d.naval;
        if (d.status !== "playing" || !g) return error("Aucune partie en cours.");
        if (!seat) return error("Tu observes la bataille : attends la prochaine pour jouer.");
        if (seat.autoplay) {
          seat.autoplay = false;
          seat.missed = 0;
          d.scheduledTurnId = -1;
        }
        const action = sanitizeAction(msg.action);
        if (!action) return error("Action invalide.");
        const res = applyAction(g, seat.id, action);
        if (!res.ok) {
          error(res.error);
          return this.afterChange([], now);
        }
        seat.missed = 0;
        return this.afterChange(res.events, now);
      }

      case "takeBack": {
        if (!seat || !seat.autoplay) return;
        seat.autoplay = false;
        seat.missed = 0;
        d.scheduledTurnId = -1;
        this.systemChat(`${seat.name} reprend la barre.`);
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
        this.systemChat(`${att.user.pseudo} monte à bord.`);
        return this.afterChange([], now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            d.scheduledTurnId = -1;
            this.systemChat(`${seat.name} a quitté la table, un bot prend la barre.`);
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

      case "team": {
        if (d.status === "playing") return error("Les équipes sont faites : attends la fin de la bataille.");
        const target = d.seats.find((s) => s.id === msg.seatId);
        if (!target || (msg.team !== 0 && msg.team !== 1) || target.team === msg.team) return;
        if (target !== seat && !isHost) return error("Seul l'hôte peut changer l'équipe d'un autre joueur.");
        // Équipe déjà à deux : un de ses bots passe de l'autre côté pour faire la place
        const crew = d.seats.filter((s) => s !== target && s.team === msg.team);
        const bot = crew.length >= 2 ? crew.findLast((s) => s.kind === "bot") : undefined;
        if (bot) bot.team = target.team;
        target.team = msg.team;
        return this.afterChange([], now);
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
        if (d.status === "playing") return error("On ne change pas les règles en pleine bataille.");
        d.settings.naval = mergeSettings(d.settings.naval, msg.settings ?? {});
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= MIN_PLAYERS && max <= NAVAL_MAX_PLAYERS) {
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
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Matelot ${d.botCounter + 1}`;
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
          team: emptierTeam(d.seats),
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
    if (present.length < MIN_PLAYERS) {
      await abortToTour(this.env, d.tour!.code, d.code);
      await this.close("Pas assez de joueurs arrivés : la tournée reprend la main.");
      return;
    }
    // Un absent défait le 2 contre 2 : la bataille se joue alors chacun pour soi
    if (d.settings.naval.teams && (present.length !== 4 || present.filter((s) => s.team === 0).length !== 2)) {
      d.settings.naval.teams = false;
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
    // En 2 contre 2, les équipes choisies au salon ; on alterne bâbord et tribord pour l'ordre de tir
    let order = d.seats;
    if (d.settings.naval.teams && d.seats.length === 4) {
      const port = d.seats.filter((s) => s.team === 0);
      const starboard = d.seats.filter((s) => s.team === 1);
      if (port.length !== 2) {
        const msg = `Il faut deux marins de chaque côté : c'est ${port.length} contre ${starboard.length} pour l'instant.`;
        if (ws) this.send(ws, { t: "error", message: msg });
        return this.afterChange([], now);
      }
      order = [port[0]!, starboard[0]!, port[1]!, starboard[1]!];
    }
    for (const s of d.seats) {
      s.autoplay = false;
      s.missed = 0;
      s.disconnectedAt = null;
    }
    const { state, events } = createGame(
      order.map((s) => s.id),
      d.settings.naval,
      randomSeed(),
    );
    d.naval = state;
    d.status = "playing";
    d.startedAt = now;
    d.recorded = false;
    d.results = null;
    d.rematch = [];
    d.scheduledTurnId = -1;
    d.turnDeadline = null;
    d.placementDeadline = now + PLACEMENT_MS;
    d.timers = d.timers.filter((t) => t.kind === "cleanup" || t.kind === "seatCleanup");
    this.addTimer({ at: d.placementDeadline + 300, kind: "placement" });
    // Les bots ont placé leur flotte avant même qu'on s'assoie
    for (const s of d.seats) if (s.kind === "bot") events.push(...forceReady(state, s.id));
    this.systemChat("Branle-bas de combat : placez vos navires !");
    return this.afterChange(events, now);
  }

  // -------------------------------------------------------------------------
  // Boucle : après chaque changement, on programme la suite
  // -------------------------------------------------------------------------

  private async afterChange(events: NavalEvent[], now: number, closing?: WebSocket) {
    const d = this.data;
    if (!d) return;
    let finished = false;
    const g = d.naval;
    if (g && d.status === "playing") {
      if (g.phase !== "placement") {
        d.placementDeadline = null;
        d.timers = d.timers.filter((t) => t.kind !== "placement");
      }
      if (g.phase === "gameOver") {
        d.status = "finished";
        d.turnDeadline = null;
        finished = !d.recorded;
        if (finished) d.recorded = true;
        if (finished && d.tour) this.addTimer({ at: now + TOUR_TABLE_LINGER_MS, kind: "cleanup" });
        const winners = (g.ranking ?? []).filter((id) => g.ranks?.[id] === 1).map((id) => this.seatById(id)?.name ?? "?");
        if (winners.length > 0) this.systemChat(`${winners.join(" et ")} ${winners.length > 1 ? "remportent" : "remporte"} la bataille !`);
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

  private seatById(id: string): Seat | undefined {
    return this.data!.seats.find((s) => s.id === id);
  }

  private schedule(now: number) {
    const d = this.data!;
    const g = d.naval;
    d.timers = d.timers.filter((t) => (t.kind !== "bot" && t.kind !== "timeout") || (g !== null && t.turnId === g.turnId));
    if (!g || d.status !== "playing" || g.phase !== "battle") {
      d.turnDeadline = null;
      d.timers = d.timers.filter((t) => t.kind !== "bot" && t.kind !== "timeout");
      return;
    }
    if (d.scheduledTurnId === g.turnId) return;
    d.scheduledTurnId = g.turnId;
    d.timers = d.timers.filter((t) => t.kind !== "bot" && t.kind !== "timeout");
    d.turnDeadline = null;
    const current = this.seatById(g.players[g.turn]!.id)!;
    if (current.kind === "bot" || current.autoplay) {
      // Le temps que l'obus précédent arrive, puis un temps de réflexion
      const delay = current.kind === "bot" ? 1500 + random(d) * 900 : 1100;
      this.addTimer({ at: now + delay, kind: "bot", seatId: current.id, turnId: g.turnId });
    } else if (d.settings.naval.turnSeconds > 0) {
      d.turnDeadline = now + d.settings.naval.turnSeconds * 1000;
      this.addTimer({ at: d.turnDeadline + 400, kind: "timeout", seatId: current.id, turnId: g.turnId });
    }
  }

  /** Quelques réactions des bots pour animer la table. */
  private botReactions(events: NavalEvent[], now: number) {
    const d = this.data!;
    for (const e of events) {
      let seatId: string | null = null;
      let pool: readonly string[] = [];
      if (e.type === "shot" && e.result === "sunk") {
        if (this.seatById(e.by)?.kind === "bot") {
          seatId = e.by;
          pool = ["😎", "Trop facile", "🔥"];
        } else {
          seatId = e.target;
          pool = ["😭", "😡", "Coup bas !", "Tu vas le regretter"];
        }
      } else if (e.type === "gameOver") {
        seatId = e.ranking[0] ?? null;
        pool = ["😎", "👏", "Bien joué"];
      }
      const seat = seatId ? this.seatById(seatId) : undefined;
      if (seat?.kind === "bot" && random(d) < 0.35) {
        const emote = pool[Math.floor(random(d) * pool.length)]!;
        this.addTimer({ at: now + 1600 + random(d) * 700, kind: "emote", seatId: seat.id, emote });
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
    const events: NavalEvent[] = [];
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
    return seat.kind === "bot" ? this.data!.settings.naval.botLevel : "chasseur";
  }

  /** Joue pour un siège, avec un tir au hasard en secours si le coup prévu est refusé. */
  private playFor(g: NavalState, seat: Seat, action: NavalAction | null): NavalEvent[] {
    if (action) {
      const res = applyAction(g, seat.id, action);
      if (res.ok) return res.events;
    }
    const fallback = randomShot(g, seat.id);
    if (!fallback) return [];
    const res = applyAction(g, seat.id, fallback);
    return res.ok ? res.events : [];
  }

  private async runTimer(t: Timer): Promise<NavalEvent[] | null> {
    const d = this.data!;
    const g = d.naval;
    const battle = g !== null && d.status === "playing" && g.phase === "battle";
    const seat = t.seatId ? this.seatById(t.seatId) : undefined;

    switch (t.kind) {
      case "bot": {
        if (!battle || !seat || g.turnId !== t.turnId || g.players[g.turn]!.id !== seat.id) return null;
        if (!(seat.kind === "bot" || seat.autoplay)) return null;
        return this.playFor(g, seat, botAction(g, seat.id, this.botLevel(seat)));
      }
      case "timeout": {
        if (!battle || !seat || g.turnId !== t.turnId || g.players[g.turn]!.id !== seat.id || seat.autoplay) return null;
        seat.missed += 1;
        const events = this.playFor(g, seat, randomShot(g, seat.id));
        if (seat.missed >= MAX_MISSED_TURNS) {
          seat.autoplay = "afk";
          d.scheduledTurnId = -1;
          this.systemChat(`${seat.name} semble absent : un bot prend la barre.`);
        }
        return events;
      }
      case "placement": {
        if (!g || d.status !== "playing" || g.phase !== "placement") return null;
        const events: NavalEvent[] = [];
        for (const p of g.players) if (!p.ready) events.push(...forceReady(g, p.id));
        return events;
      }
      case "away": {
        if (!seat || seat.disconnectedAt === null || d.status !== "playing" || seat.autoplay) return null;
        seat.autoplay = "away";
        d.scheduledTurnId = -1;
        this.systemChat(`${seat.name} s'est déconnecté : un bot tient la barre en attendant son retour.`);
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
    const g = d.naval!;
    const players = g.players.map((p, i) => {
      const seat = this.seatById(p.id);
      return {
        seat: i,
        userId: seat?.kind === "human" ? seat.userId : null,
        name: seat?.name ?? "?",
        isBot: seat?.kind !== "human",
        rank: g.ranks?.[p.id] ?? g.players.length,
        score: p.stats.hits,
        eliminated: p.out,
        team: p.team,
        stats: { ...p.stats, afloat: fleetAfloat(p.board) },
      };
    });
    if (d.tour) {
      await reportToTour(this.env, d.tour.code, {
        code: d.code,
        index: d.tour.index,
        game: "naval",
        seats: players.length,
        players: players.flatMap((p) => (p.userId ? [{ userId: p.userId, rank: p.rank, stats: { ...p.stats } }] : [])),
      });
    }
    try {
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "naval",
        mode: modeOf(g),
        roomCode: d.code,
        settings: g.settings,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: 1,
        players,
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
      console.error("Enregistrement de la bataille impossible", err);
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

  private viewFor(userId: string, connected: Map<string, PublicUser>): NavalRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    return {
      code: d.code,
      game: "naval",
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
        team: s.team,
      })),
      spectators: [...connected.values()].filter((u) => !seatedUsers.has(u.id)).map((u) => ({ userId: u.id, name: u.pseudo })),
      hostId: d.hostId,
      you: { userId, seatId: seat?.id ?? null, isHost: userId === d.hostId, isAdmin: Boolean(connected.get(userId)?.admin) },
      naval: d.naval ? viewFor(d.naval, seat?.id ?? null) : null,
      turnDeadline: d.turnDeadline,
      placementDeadline: d.placementDeadline,
      serverNow: Date.now(),
      rematch: d.rematch,
      results: d.results ?? null,
      quick: d.quick,
      tour: d.tour?.code ?? null,
    };
  }

  private broadcast(events: NavalEvent[], except?: WebSocket) {
    const d = this.data!;
    const connected = this.connectedUsers(except);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      const seat = d.seats.find((s) => s.userId === att.userId);
      const visible = d.naval ? eventsFor(d.naval, events, seat?.id ?? null) : events;
      this.send(ws, { t: "room", room: this.viewFor(att.userId, connected), events: visible });
    }
  }

  private broadcastRaw(msg: NavalServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: NavalServerMessage) {
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
    return { code: this.data!.code, game: "naval", status: this.data!.status };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    const variant = d.naval
      ? modeOf(d.naval)
      : d.settings.naval.teams && d.settings.maxPlayers === 4
        ? "teams"
        : d.settings.maxPlayers === 2
          ? "duel"
          : "melee";
    return {
      code: d.code,
      game: "naval",
      variant,
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

function sanitizePlacements(raw: unknown): Placement[] | undefined {
  if (!Array.isArray(raw) || raw.length > 12) return undefined;
  return raw.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return { kind: String(o.kind) as Placement["kind"], x: Number(o.x), y: Number(o.y), dir: o.dir === "v" ? "v" : "h" };
  });
}

function sanitizeAction(raw: unknown): NavalAction | null {
  const a = (raw ?? {}) as Record<string, unknown>;
  switch (a.type) {
    case "place": {
      const ships = sanitizePlacements(a.ships);
      return ships ? { type: "place", ships } : null;
    }
    case "ready": {
      const ships = a.ships === undefined ? undefined : sanitizePlacements(a.ships);
      return { type: "ready", ...(ships ? { ships } : {}) };
    }
    case "fire":
      return { type: "fire", target: String(a.target ?? ""), cell: Number(a.cell) };
    case "weapon": {
      const weapon = a.weapon === "radar" || a.weapon === "torpedo" || a.weapon === "barrage" ? a.weapon : null;
      if (!weapon) return null;
      return { type: "weapon", weapon, target: String(a.target ?? ""), cell: Number(a.cell), dir: a.dir === "v" ? "v" : "h" };
    }
    default:
      return null;
  }
}

function mergeSettings(current: NavalSettings, patch: Partial<NavalSettings>): NavalSettings {
  const next = { ...current };
  if (GRID_SIZES.includes(patch.grid as never)) next.grid = patch.grid!;
  if (patch.shots === "single" || patch.shots === "replay" || patch.shots === "salvo") next.shots = patch.shots;
  for (const key of ["touching", "arsenal", "teams"] as const) {
    if (typeof patch[key] === "boolean") next[key] = patch[key];
  }
  if (typeof patch.turnSeconds === "number" && (TURN_SECONDS as readonly number[]).includes(patch.turnSeconds))
    next.turnSeconds = patch.turnSeconds;
  if (patch.botLevel === "mousse" || patch.botLevel === "chasseur" || patch.botLevel === "amiral") next.botLevel = patch.botLevel;
  return next;
}
