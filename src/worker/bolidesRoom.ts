import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import type { BotLevel, BotMemory } from "../shared/games/bolides/bot.ts";
import {
  botGarage,
  isSkinId,
  isVehicleId,
  NO_PROGRESS,
  skinUnlocked,
  vehicleUnlocked,
  type GarageProgress,
  type SkinId,
  type VehicleId,
} from "../shared/games/bolides/garage.ts";
import { SPEED_CLASSES } from "../shared/games/bolides/physics.ts";
import {
  CUP_RACES,
  cupPoints,
  DEFAULT_SETTINGS,
  driveBots,
  holdForLoading,
  LAP_CHOICES,
  loadingOver,
  markLoaded,
  newRace,
  racerOf,
  releaseStart,
  reportKart,
  useItem,
  worldTick,
  type BolidesEvent,
  type BolidesSettings,
  type Race,
} from "../shared/games/bolides/race.ts";
import { TRACK_IDS, type BaseTrackId } from "../shared/games/bolides/track.ts";
import { bolidesView, decodeKart, encodeKart } from "../shared/games/bolides/view.ts";
import {
  BOLIDES_MAX_PLAYERS,
  CHAT_MAX,
  MIN_PLAYERS,
  REACTIONS,
  TAUNTS,
  type BolidesClientMessage,
  type BolidesRoomSettings,
  type BolidesRoomView,
  type BolidesServerMessage,
  type ChatMessage,
  type PresenceRoom,
  type PublicUser,
  type RoomStatus,
  type RoomSummary,
} from "../shared/protocol.ts";
import { randomSeed } from "../shared/rng.ts";
import { TOUR_BOT_LEVELS, TOUR_GUEST_PREFIX, variantSettings, type TourInit } from "../shared/tour.ts";
import type { RoomInit } from "./room.ts";
import { abortToTour, reportToTour, TOUR_JOIN_MS, TOUR_LOCKED, TOUR_TABLE_LINGER_MS, tourChat } from "./tourLink.ts";
import { recordGame, type EloResults } from "./users.ts";
import { decodeHeaderJson } from "./util.ts";

// Des pilotes pour compléter la grille
const BOT_NAMES = ["Gaston", "Jacqueline", "Marcel", "Odette", "Raymond", "Simone", "Lucien", "Paulette", "Fernand", "Germaine"];
// Délai laissé à un joueur déconnecté pour revenir avant qu'un bot conduise à sa place
const AWAY_AFTER_MS = 8000;
const SEAT_RELEASE_MS = 25_000;
const CHAT_KEEP = 80;
/** La boucle de course : les bots avancent et les positions partent vers tout le monde, 20 fois par seconde */
const TICK_MS = 50;

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
  /** Son véhicule et son skin */
  vehicle?: VehicleId;
  skin?: SkinId;
}

type TimerKind = "away" | "seatCleanup" | "cleanup" | "tourStart";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
}

interface BolidesData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: BolidesRoomSettings;
  status: RoomStatus;
  seats: Seat[];
  botCounter: number;
  race: Race | null;
  startedAt: number | null;
  rematch: string[];
  chat: ChatMessage[];
  chatSeq: number;
  timers: Timer[];
  kicked: string[];
  recorded: boolean;
  results?: EloResults | null;
  /** Le Grand Prix en cours : ses circuits, la course où on en est, et les points de chacun */
  cup?: { tracks: BaseTrackId[]; index: number; points: Record<string, number>; last: Record<string, number> } | null;
  /** Table d'une tournée : la tournée l'a créée et attend son résultat */
  tour?: TourInit | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
}

/** Une table de Bolides : le salon commun, puis une course que le serveur mène pour les bots, les objets et l'arrivée. */
export class BolidesRoom extends DurableObject<Env> {
  private data: BolidesData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();
  /** Ce dont chaque bot se souvient en conduisant (perdu si le serveur redémarre, sans gravité) */
  private memory = new Map<string, BotMemory>();
  private loop: ReturnType<typeof setInterval> | null = null;
  /** Des changements à enregistrer au prochain tic (on n'écrit pas à chaque position reçue) */
  private dirty = false;
  /** Ce que chaque joueur a débloqué (lu dans ses statistiques, relu après chaque course) */
  private progress = new Map<string, GarageProgress>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<BolidesData>("room")) ?? null;
      // Une course en cours au réveil : la boucle repart
      if (this.data?.status === "playing" && this.data.race) this.startLoop();
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
      settings: { visibility: opts.visibility, maxPlayers: 6, bolides: { ...DEFAULT_SETTINGS } },
      status: "lobby",
      seats: [],
      botCounter: 0,
      race: null,
      startedAt: null,
      rematch: [],
      chat: [],
      chatSeq: 0,
      timers: [{ at: now + 10 * 60_000, kind: "cleanup" }],
      kicked: [],
      recorded: false,
      tour: opts.tour ?? null,
    };
    if (opts.tour) {
      // Tout le monde est déjà assis, y compris les bots de la tournée sous leur nom de tournée
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
          disconnectedAt: null,
        })),
      ];
      d.settings.maxPlayers = Math.min(BOLIDES_MAX_PLAYERS, Math.max(MIN_PLAYERS, d.seats.length));
      d.settings.bolides = { ...d.settings.bolides, ...variantSettings("bolides", opts.tour.variant) };
      d.settings.bolides.botLevel = TOUR_BOT_LEVELS[opts.tour.botLevel]?.bolides ?? d.settings.bolides.botLevel;
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

  /** Ses statistiques de Bolides : ce qui débloque véhicules et skins */
  private async loadProgress(userId: string): Promise<GarageProgress> {
    try {
      const row = await this.env.DB.prepare(`SELECT played, won, totals FROM user_stats WHERE user_id = ? AND game = 'bolides'`)
        .bind(userId)
        .first<{ played: number; won: number; totals: string | null }>();
      let totals: Record<string, number> = {};
      try {
        totals = row?.totals ? (JSON.parse(row.totals) as Record<string, number>) : {};
      } catch {
        totals = {};
      }
      const p: GarageProgress = {
        played: row?.played ?? 0,
        won: row?.won ?? 0,
        turbos: totals.turbos ?? 0,
        hitsGiven: totals.hitsGiven ?? 0,
      };
      this.progress.set(userId, p);
      return p;
    } catch {
      return this.progress.get(userId) ?? NO_PROGRESS;
    }
  }

  private async onJoin(user: PublicUser, ws: WebSocket) {
    await this.loadProgress(user.id);
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
        // Il reprend le volant là où le bot l'a laissé
        const r = d.race ? racerOf(d.race, seat.id) : undefined;
        if (r) {
          r.bot = false;
          r.seen = now;
        }
      }
      if (d.status !== "playing") {
        seat.name = user.pseudo;
        seat.avatar = user.avatar;
        seat.photo = user.photo;
      }
    } else if (d.status !== "playing" && !d.tour) {
      seat = this.seatHuman(user) ?? undefined;
      if (seat) this.systemChat(`${user.pseudo} s'installe sur la grille.`);
    }
    if (!seat) this.systemChat(`${user.pseudo} regarde la course.`);
    this.ensureHost();
    this.send(ws, { t: "chat", messages: d.chat, reset: true });
    if (d.tour && d.status === "lobby" && d.seats.every((s) => s.kind === "bot" || this.isConnected(s.userId))) {
      await this.startTourGame(now);
      return;
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
      this.systemChat(`${name} prend la main sur la table.`);
    }
  }

  // -------------------------------------------------------------------------
  // Messages des joueurs
  // -------------------------------------------------------------------------

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const d = this.data;
    if (!d || typeof raw !== "string" || raw.length > 4000) return;
    let msg: BolidesClientMessage;
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
      case "kart": {
        // Où en est son kart : jamais enregistré à chaque fois, seulement gardé en mémoire
        const race = d.race;
        if (!seat || !race || d.status !== "playing" || !this.allowMessage(`kart:${userId}`, 25)) return;
        const r = racerOf(race, seat.id);
        if (!r || r.bot) return;
        const k = decodeKart(msg.k, r.kart);
        if (!k) return;
        const n = Array.isArray(msg.n) && msg.n.every((x) => typeof x === "number" && Number.isFinite(x)) ? msg.n : null;
        const at = typeof msg.at === "number" ? msg.at : undefined;
        const events = reportKart(race, seat.id, k, now, n ? { turbos: n[0], walls: n[1] } : undefined, at);
        if (events.length > 0) this.onEvents(events);
        return;
      }

      case "loaded": {
        // Son jeu est prêt : tout le monde le voit, et le prochain tic allume les feux si c'était le dernier
        const race = d.race;
        if (!seat || !race || d.status !== "playing" || msg.race !== race.createdAt || !markLoaded(race, seat.id)) return;
        this.dirty = true;
        return this.broadcast([]);
      }

      case "use": {
        const race = d.race;
        if (!seat || !race || d.status !== "playing" || !this.allowMessage(`use:${userId}`, 150)) return;
        const r = racerOf(race, seat.id);
        if (!r || r.bot) return;
        const events = useItem(race, seat.id, now, msg.flip === true);
        if (events.length > 0) this.onEvents(events);
        return;
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

      case "garage": {
        // Son véhicule et son skin : seulement ce qu'il a débloqué, et pas en pleine course
        if (!seat || d.status === "playing" || !this.allowMessage(`garage:${userId}`, 80)) return;
        const p = this.progress.get(userId) ?? (await this.loadProgress(userId));
        if (isVehicleId(msg.vehicle) && vehicleUnlocked(msg.vehicle, p)) seat.vehicle = msg.vehicle;
        if (isSkinId(msg.skin) && skinUnlocked(msg.skin, p)) seat.skin = msg.skin;
        return this.afterChange([], now);
      }

      case "sit": {
        if (seat || d.status === "playing") return;
        if (!this.seatHuman(att.user)) return error("La grille est complète.");
        this.systemChat(`${att.user.pseudo} s'installe sur la grille.`);
        return this.afterChange([], now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            const r = d.race ? racerOf(d.race, seat.id) : undefined;
            if (r) r.bot = true;
            this.systemChat(`${seat.name} a quitté la course, un bot prend le volant.`);
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

    const moderation = msg.t === "kick" || msg.t === "removeSeat";
    if (!isHost && !(isAdmin && moderation)) return error("Seul l'hôte peut faire ça.");
    switch (msg.t) {
      case "settings": {
        if (d.status === "playing") return error("On ne change pas les règles en pleine course.");
        d.settings.bolides = mergeSettings(d.settings.bolides, msg.settings ?? {});
        // De nouvelles règles : le prochain départ recommence un Grand Prix
        d.cup = null;
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= MIN_PLAYERS && max <= BOLIDES_MAX_PLAYERS) {
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
        if (d.seats.length >= d.settings.maxPlayers) return error("La grille est complète.");
        const used = new Set(d.seats.map((s) => s.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Pilote ${d.botCounter + 1}`;
        d.seats.push({
          id: `bot-${++d.botCounter}`,
          kind: "bot",
          userId: null,
          name,
          avatar: seededAvatar(`${name}-${d.code}`),
          photo: 0,
          autoplay: false,
          disconnectedAt: null,
          ...botGarage(`${name}-${d.code}`),
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
        const r = d.race ? racerOf(d.race, seat.id) : undefined;
        if (r) r.bot = true;
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

  // -------------------------------------------------------------------------
  // La course
  // -------------------------------------------------------------------------

  private seatById(id: string): Seat | undefined {
    return this.data!.seats.find((s) => s.id === id);
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
    d.seats = d.seats.filter((x) => x.kind === "bot" || this.isConnected(x.userId));
    this.ensureHost();
    if (d.seats.length < MIN_PLAYERS) {
      if (ws) this.send(ws, { t: "error", message: "Il faut au moins deux pilotes : ajoute un bot !" });
      return this.afterChange([], now);
    }
    for (const seat of d.seats) {
      seat.autoplay = false;
      seat.disconnectedAt = null;
    }
    const bots = new Set(d.seats.filter((s) => s.kind === "bot").map((s) => s.id));
    const settings = { ...DEFAULT_SETTINGS, ...d.settings.bolides };
    if (settings.cup && !d.tour) {
      // La course suivante du Grand Prix, ou un nouveau Grand Prix (quatre circuits tirés au sort)
      if (d.cup && d.status === "finished" && d.cup.index + 1 < d.cup.tracks.length) {
        d.cup.index += 1;
        d.cup.last = {};
      } else {
        const tracks = [...TRACK_IDS];
        for (let i = tracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [tracks[i], tracks[j]] = [tracks[j]!, tracks[i]!];
        }
        d.cup = { tracks: tracks.slice(0, CUP_RACES), index: 0, points: {}, last: {} };
      }
      settings.track = d.cup.tracks[d.cup.index]!;
    } else d.cup = null;
    d.race = newRace(
      d.seats.map((s) => s.id),
      bots,
      settings,
      now,
      randomSeed(),
    );
    // Chacun part avec le véhicule et le skin qu'il a choisis
    for (const r of d.race.racers) {
      const seat = this.seatById(r.id);
      const bot = seat?.kind === "bot" && !seat.vehicle ? botGarage(`${seat.name}-${d.code}`) : null;
      r.vehicle = seat?.vehicle ?? bot?.vehicle ?? "kart";
      r.skin = seat?.skin ?? bot?.skin ?? "usine";
    }
    holdForLoading(d.race, now);
    this.memory.clear();
    d.status = "playing";
    d.startedAt = now;
    d.recorded = false;
    d.results = null;
    d.rematch = [];
    d.timers = d.timers.filter((t) => t.kind === "cleanup" || t.kind === "seatCleanup");
    this.systemChat("En piste !");
    this.startLoop();
    return this.afterChange([], now);
  }

  private startLoop() {
    if (this.loop) return;
    this.loop = setInterval(() => void this.tick(), TICK_MS);
  }

  private stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  /** Un tic de course : les bots roulent, le monde avance, tout le monde reçoit les positions */
  private async tick() {
    const d = this.data;
    const race = d?.race;
    if (!d || !race || d.status !== "playing") {
      this.stopLoop();
      return;
    }
    const now = Date.now();
    if (race.phase === "loading") {
      if (loadingOver(race, now)) {
        releaseStart(race, now);
        await this.afterChange([], now);
      } else if (this.dirty) {
        this.dirty = false;
        await this.persist();
      }
      return;
    }
    const events = [...driveBots(race, now, this.memory), ...worldTick(race, now)];
    this.broadcastRaw({
      t: "tick",
      now,
      k: race.racers.map((r) => encodeKart(r.kart)),
      a: race.racers.map((r) => Math.max(0, Math.min(1000, Math.round(now - r.stateAt)))),
      c: race.racers.map((r) => r.coins ?? 0),
      ct: (race.coins ?? []).flatMap((at, i) => (at > now ? [i] : [])),
    });
    if (events.length > 0) this.onEvents(events);
    if (race.phase === "over" && d.status === "playing") await this.finishGame(now);
    else if (this.dirty) {
      this.dirty = false;
      await this.persist();
    }
  }

  /** Ce qui vient d'arriver (objets, coups, tours) : tout le monde reçoit la table à jour, avec ces évènements */
  private onEvents(events: BolidesEvent[]) {
    for (const e of events) {
      if (e.type === "finish" && e.place === 1) this.systemChat(`${this.seatById(e.id)?.name ?? "?"} franchit la ligne en tête !`);
    }
    this.dirty = true;
    this.broadcast(events);
  }

  private async finishGame(now: number) {
    const d = this.data!;
    d.status = "finished";
    this.stopLoop();
    if (d.tour) this.addTimer({ at: now + TOUR_TABLE_LINGER_MS, kind: "cleanup" });
    const winner = d.race?.ranking?.[0];
    if (winner) this.systemChat(`${this.seatById(winner)?.name ?? "?"} remporte la course !`);
    const cup = d.cup;
    if (cup && d.race?.ranks) {
      cup.last = {};
      for (const [id, rank] of Object.entries(d.race.ranks)) {
        const won = cupPoints(rank);
        cup.last[id] = won;
        cup.points[id] = (cup.points[id] ?? 0) + won;
      }
      if (cup.index + 1 >= cup.tracks.length) {
        const best = Object.entries(cup.points).sort((a, b) => b[1] - a[1])[0];
        if (best) this.systemChat(`${this.seatById(best[0])?.name ?? "?"} remporte le Grand Prix !`);
      }
    }
    await this.afterChange([], now);
  }

  // -------------------------------------------------------------------------
  // Boucle des minuteurs : après chaque changement, on programme la suite
  // -------------------------------------------------------------------------

  private async afterChange(events: BolidesEvent[], now: number, closing?: WebSocket) {
    const d = this.data;
    if (!d) return;
    this.dirty = false;
    await this.persist();
    this.broadcast(events, closing);
    await this.armAlarm();
    await this.syncHub();
    void now;
    await this.recordIfNeeded();
  }

  private async recordIfNeeded() {
    const d = this.data;
    if (!d || d.status !== "finished" || d.recorded || d.race?.phase !== "over") return;
    d.recorded = true;
    await this.persist();
    await this.recordResults(Date.now());
    // Une course de plus au compteur : ce qui vient d'être débloqué est disponible tout de suite
    await Promise.all(d.seats.flatMap((s) => (s.userId ? [this.loadProgress(s.userId)] : [])));
    this.broadcast([]);
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
    let changed = false;
    for (const t of due) {
      if (!this.data) return;
      if (await this.runTimer(t, now)) changed = true;
    }
    if (!this.data) return;
    if (changed) await this.afterChange([], now);
    else {
      await this.persist();
      await this.armAlarm();
    }
  }

  /** Renvoie vrai si le minuteur a changé quelque chose */
  private async runTimer(t: Timer, now: number): Promise<boolean> {
    const d = this.data!;
    const seat = t.seatId ? this.seatById(t.seatId) : undefined;
    switch (t.kind) {
      case "away": {
        if (!seat || seat.disconnectedAt === null || d.status !== "playing" || seat.autoplay) return false;
        seat.autoplay = "away";
        const r = d.race ? racerOf(d.race, seat.id) : undefined;
        if (r) r.bot = true;
        this.systemChat(`${seat.name} s'est déconnecté : un bot prend le volant en attendant son retour.`);
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
    const race = d.race!;
    try {
      const players = race.racers.map((r, i) => {
        const seat = this.seatById(r.id);
        return {
          seat: i,
          userId: seat?.kind === "human" ? seat.userId : null,
          name: seat?.name ?? "?",
          isBot: seat?.kind !== "human",
          rank: race.ranks?.[r.id] ?? race.racers.length,
          score: r.laps,
          eliminated: false,
          team: null,
          stats: { ...r.stats, time: r.finish ?? 0 },
        };
      });
      if (d.tour) {
        // Les bots invités pour ce seul jeu courent, mais ne prennent la place de personne au classement de la tournée
        const counted = race.racers
          .map((r, i) => ({ r, p: players[i]! }))
          .filter(({ r }) => !r.id.startsWith(TOUR_GUEST_PREFIX))
          .sort((a, b) => a.p.rank - b.p.rank);
        await reportToTour(this.env, d.tour.code, {
          code: d.code,
          index: d.tour.index,
          game: "bolides",
          seats: counted.length,
          // Un bot de la tournée se reconnaît à son id de siège ; les places se comptent entre membres de la tournée
          players: counted.map(({ r, p }, i) => ({
            userId: p.userId ?? r.id,
            rank: i === 0 || counted[i - 1]!.p.rank !== p.rank ? i + 1 : counted.findIndex((c) => c.p.rank === p.rank) + 1,
            stats: { ...p.stats },
          })),
        });
      }
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "bolides",
        mode: race.track,
        roomCode: d.code,
        settings: race.settings,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: race.settings.laps,
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
      console.error("Enregistrement de la course de Bolides impossible", err);
    }
  }

  // -------------------------------------------------------------------------
  // Diffusion
  // -------------------------------------------------------------------------

  /** Statut montré aux amis ; à une table de tournée, c'est la tournée qui le donne */
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

  private viewFor(userId: string, connected: Map<string, PublicUser>): BolidesRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    return {
      code: d.code,
      game: "bolides",
      status: d.status,
      settings: { ...d.settings, bolides: { ...DEFAULT_SETTINGS, ...d.settings.bolides } },
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
      bolides: d.race ? bolidesView(d.race) : null,
      cup: d.cup
        ? {
            index: d.cup.index,
            tracks: d.cup.tracks,
            points: d.cup.points,
            last: d.cup.last,
            over: d.status === "finished" && d.cup.index + 1 >= d.cup.tracks.length,
          }
        : null,
      garage: {
        choices: Object.fromEntries(d.seats.map((s) => [s.id, { vehicle: s.vehicle ?? "kart", skin: s.skin ?? "usine" }])),
        progress: this.progress.get(userId) ?? null,
      },
      serverNow: Date.now(),
      rematch: d.rematch,
      results: d.results ?? null,
      quick: d.quick,
      tour: d.tour?.code ?? null,
    };
  }

  private broadcast(events: BolidesEvent[], except?: WebSocket) {
    const connected = this.connectedUsers(except);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: "room", room: this.viewFor(att.userId, connected), events });
    }
  }

  private broadcastRaw(msg: BolidesServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: BolidesServerMessage) {
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
    return { code: this.data!.code, game: "bolides", status: this.data!.status };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    return {
      code: d.code,
      game: "bolides",
      variant: d.race?.track ?? d.settings.bolides.track,
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

function mergeSettings(current: BolidesSettings, patch: Partial<BolidesSettings>): BolidesSettings {
  const next = { ...DEFAULT_SETTINGS, ...current };
  if (patch.track === "hasard" || (TRACK_IDS as readonly string[]).includes(patch.track as string)) next.track = patch.track!;
  if ((LAP_CHOICES as readonly number[]).includes(patch.laps as number)) next.laps = patch.laps!;
  if (SPEED_CLASSES.includes(patch.speed as never)) next.speed = patch.speed!;
  if (typeof patch.items === "boolean") next.items = patch.items;
  if (patch.botLevel === "facile" || patch.botLevel === "moyen" || patch.botLevel === "fort") next.botLevel = patch.botLevel as BotLevel;
  if (typeof patch.cup === "boolean") next.cup = patch.cup;
  if (typeof patch.mirror === "boolean") next.mirror = patch.mirror;
  return next;
}
