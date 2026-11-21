import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { botInput, newBotMemory, type BotLevel, type BotMemory } from "../shared/games/culbute/bot.ts";
import { createFight, stepFight } from "../shared/games/culbute/engine.ts";
import { botPick, HABITUES, isFighterPick, styleOf, type FighterPick } from "../shared/games/culbute/fighters.ts";
import { HABITUE_IDS, type Fight, type FightEvent, type Input } from "../shared/games/culbute/model.ts";
import {
  addRound,
  newSeries,
  recordStatsOf,
  seriesArena,
  seriesRanks,
  SERIES_PAUSE_MS,
  type CulbuteSeries,
} from "../shared/games/culbute/series.ts";
import {
  CULBUTE_MAX_PLAYERS,
  SAMPLE_STRIDE,
  type CulbuteClientMessage,
  type CulbuteRoomSettings,
  type CulbuteRoomView,
  type CulbuteServerMessage,
} from "../shared/games/culbute/net.ts";
import {
  culbuteView,
  DEFAULT_CONFIG,
  encodeTick,
  mergeConfig,
  packFull,
  packInputs,
  pickArena,
  stateKey,
} from "../shared/games/culbute/view.ts";
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
import { canUse, tenueItem } from "../shared/shop.ts";
import { variantSettings, type TourInit } from "../shared/tour.ts";
import { applyDrawnRules, drawNotice, drawRules, hostDraw, hostPatch } from "../shared/randomRules.ts";
import type { RoomInit } from "./room.ts";
import { abortToTour, reportToTour, TOUR_JOIN_MS, TOUR_LOCKED, TOUR_PICK_MS, TOUR_TABLE_LINGER_MS, tourChat } from "./tourLink.ts";
import { ownedItems } from "./shop.ts";
import { recordGame, type EloResults } from "./users.ts";
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

// Des habitués pour compléter l'arène, après les six (qui se battent chacun avec son propre style)
const EXTRA_BOT_NAMES = ["Gaston", "Josiane", "Odette", "Paulette", "Fernand", "Germaine", "Jacqueline"];
const AWAY_AFTER_MS = 8000;
const SEAT_RELEASE_MS = 25_000;
/** Pendant la partie, l'alarme de garde ne dort jamais plus longtemps */
const WATCHDOG_MS = 60_000;
const CHAT_KEEP = 80;
/** La boucle : le combat avance par soixantièmes de seconde, et tout le monde reçoit ce qui bouge une trentaine de fois par seconde */
const LOOP_MS = 16;
const STEP_MS = 1000 / 60;
const SEND_EVERY_MS = 32;
const SAVE_EVERY_MS = 15_000;
/** Les commandes en attente d'un joueur amortissent les à-coups du réseau. Tant que sa file n'est jamais descendue sous
 * QUEUE_LOW pendant QUEUE_DRAIN pas, elle a plus de marge qu'il n'en faut : une commande de moins (ses appuis passent à la
 * suivante). Au-delà de QUEUE_MAX (un onglet revenu au premier plan), on serre d'un coup jusqu'à QUEUE_KEEP. Serrer
 * dès 6 faisait osciller la file sur un réseau qui hoquette : tantôt vide, tantôt serrée, le combattant sautait. */
const QUEUE_LOW = 3;
const QUEUE_DRAIN = 120;
const QUEUE_MAX = 30;
const QUEUE_KEEP = 4;
/** Plus rien d'un joueur depuis une demi-seconde (onglet caché, connexion morte) : il lâche tout */
const STALE_STEPS = 30;
/** Un numéro de commande aussi loin derrière le dernier reçu vient d'un nouvel écran, qui recompte depuis 1 */
const SEQ_RESTART = 600;
/** Le niveau des bots de la tournée, traduit pour Culbute */
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
  fighter: FighterPick;
}

type TimerKind = "away" | "seatCleanup" | "cleanup" | "tourStart" | "nextRound";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
}

interface CulbuteData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: CulbuteRoomSettings;
  status: RoomStatus;
  seats: Seat[];
  botCounter: number;
  fight: Fight | null;
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
  /** En tournée : plusieurs combats d'affilée, et les points de chacun */
  series?: CulbuteSeries | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
  replaced?: boolean;
}

/** Les commandes d'un joueur en attente d'être jouées, une par image */
interface InputQueue {
  samples: { seq: number; input: Input }[];
  lastSeq: number;
  ack: number;
  last: Input;
  stamp: number;
  /** Les pas joués d'affilée sans nouvelle commande */
  starved: number;
  /** La file la plus courte vue depuis la dernière vidange, et les pas depuis */
  low: number;
  since: number;
}

/** Les statistiques de celui qui n'a fini aucune manche */
const EMPTY_STATS = { kos: 0, falls: 0, dealt: 0, taken: 0, items: 0, lowKo: 0, stocksLeft: 0, lostStock: 0, won: 0 };

/** Une table de Culbute : le salon commun, puis un combat que le serveur mène image par image. */
export class CulbuteRoom extends DurableObject<Env> {
  private data: CulbuteData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private acc = 0;
  private lastSent = 0;
  private lastSave = 0;
  private lastKey = "";
  private pendingEvents: FightEvent[] = [];
  private queues = new Map<string, InputQueue>();
  private memory = new Map<string, BotMemory>();
  /** La commande de chacun à la dernière image jouée (les joueurs l'envoient aux autres pour qu'ils l'anticipent) */
  private lastInputs: Input[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<CulbuteData>("room")) ?? null;
      if (this.data?.status === "playing" && this.data.fight) this.startLoop();
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
      settings: { visibility: opts.visibility, maxPlayers: 4, lateJoin: defaultLateJoin(opts.quick), culbute: { ...DEFAULT_CONFIG } },
      status: "lobby",
      seats: [],
      botCounter: 0,
      fight: null,
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
    const taken: FighterPick[] = [];
    const humans: Seat[] = tour.players.map((u) => ({
      ...this.newHumanSeat(u),
      disconnectedAt: now,
    }));
    const bots: Seat[] = tour.bots.map((b) => {
      const fighter = botPick(
        taken.map((p) => styleOf(p)),
        Math.random,
      );
      taken.push(fighter);
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
        fighter,
      };
    });
    d.seats = [...humans, ...bots];
    if (tour.teams) for (const s of d.seats) s.team = tour.teams[s.userId ?? s.id] ?? 0;
    d.settings.culbute = mergeConfig(d.settings.culbute, {
      ...variantSettings("culbute", tour.variant),
      teams: Boolean(tour.teams),
      botLevel: TOUR_LEVEL[tour.botLevel] ?? "moyen",
      arena: "hasard",
    });
    d.settings.maxPlayers = Math.min(CULBUTE_MAX_PLAYERS, Math.max(MIN_PLAYERS, d.seats.length));
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
      midGame: JOINS_STARTED.culbute,
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
      // Ses commandes repartent de zéro (un appareil rechargé recompte depuis le début)
      this.queues.delete(seat.id);
      if (seat.autoplay === "away") {
        seat.autoplay = false;
        if (d.status === "playing") this.systemChat(`${seat.name} est de retour dans l'arène.`);
      }
      if (d.status !== "playing") {
        seat.name = user.pseudo;
        seat.avatar = user.avatar;
        seat.photo = user.photo;
      }
    } else if (decision === "seat" && d.status !== "playing") {
      seat = this.seatHuman(user) ?? undefined;
      if (seat) this.systemChat(`${user.pseudo} entre dans l'arène.`);
    }
    if (!seat) {
      d.watchers = rememberWatcher(d.watchers, user.id);
      this.systemChat(`${user.pseudo} regarde le combat.`);
    }
    this.ensureHost();
    this.send(ws, { t: "chat", messages: d.chat, reset: true });
    if (d.tour && d.status === "lobby" && !d.pickUntil && d.seats.every((s) => s.kind === "bot" || this.isConnected(s.userId))) {
      // Tout le monde est là : une fenêtre pour choisir son combattant, puis le combat part
      d.pickUntil = now + TOUR_PICK_MS;
      d.timers = d.timers.filter((t) => t.kind !== "tourStart");
      d.timers.push({ at: d.pickUntil, kind: "tourStart" });
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
      team: 0,
      // Son personnage, avec le style de Ginette, tant qu'il n'a rien choisi (l'appareil envoie aussitôt son choix)
      fighter: { who: "moi", style: "ginette" },
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
    // Plus de place : il prend celle d'un bot
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
      // Il ne bouge plus en attendant : pas de touche restée enfoncée
      this.queues.delete(seat.id);
      if (d.status === "playing") this.addTimer({ at: now + AWAY_AFTER_MS, kind: "away", seatId: seat.id });
      else this.addTimer({ at: now + SEAT_RELEASE_MS, kind: "seatCleanup", seatId: seat.id });
    }
    if (this.connectedUsers(ws).size === 0) {
      this.addTimer({ at: now + (d.status === "playing" ? 20 : 10) * 60_000, kind: "cleanup" });
    }
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
  /** Ce qui empêche un combat de partir avec les combattants présents, ou null */
  private startProblem(): string | null {
    const seats = this.data!.seats.filter((s) => s.kind === "bot" || this.isConnected(s.userId));
    return seats.length < MIN_PLAYERS ? "Il faut au moins deux combattants : ajoute un bot !" : null;
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
    return d.seats.filter((s) => s.kind === "human" && this.isConnected(s.userId)).every((s) => d.rematch.includes(s.userId!));
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
    let msg: CulbuteClientMessage;
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
      case "in": {
        // Les commandes : jamais enregistrées, seulement mises en file
        if (!seat || !d.fight || d.status !== "playing" || seat.autoplay) return;
        this.queueInputs(seat.id, msg.s, msg.d, msg.c);
        return;
      }

      case "pick": {
        if (!seat || d.status === "playing" || !isFighterPick(msg.fighter) || !this.allowMessage(`pick:${userId}`, 120)) return;
        const pick = msg.fighter;
        if (pick.who !== "moi" && pick.tenue) {
          const owned = await ownedItems(this.env.DB, userId);
          // Le combat a pu se lancer pendant qu'on lisait la boutique : il se joue avec le combattant d'avant, qu'on
          // ne change plus (sinon le salon et la fin montreraient un autre combattant que celui qui s'est battu)
          const live = this.data;
          if (live !== d || !live || live.status === "playing" || !live.seats.includes(seat)) return;
          if (!canUse(tenueItem(pick.who, pick.tenue), owned)) return error("Cette tenue s'achète à la boutique.");
        }
        seat.fighter =
          pick.who === "moi" ? { who: "moi", style: pick.style } : pick.tenue ? { who: pick.who, tenue: pick.tenue } : { who: pick.who };
        return this.afterChange([], now);
      }

      case "team": {
        if (!seat || d.status === "playing" || (msg.team !== 0 && msg.team !== 1)) return;
        // Rien qui change, ou un changement par-dessus l'autre : ni écriture ni envoi à toute la table
        if (seat.team === msg.team || !this.allowMessage(`team:${userId}`, 150)) return;
        seat.team = msg.team;
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

      case "ready": {
        if (!this.announcing() || !seat || !this.allowMessage(`ready:${userId}`, 150)) return;
        d.ready = [...new Set([...(d.ready ?? []), userId])];
        if (this.allReady()) return d.tour ? this.startTourGame(now) : this.announceDone(now);
        return this.afterChange([], now);
      }

      case "sit": {
        if (seat || d.tour || !maySit(this.arrivalCase(userId, "play"))) return;
        if (!this.seatHuman(att.user)) return error("L'arène est complète.");
        d.watchers = forgetWatcher(d.watchers, userId);
        this.systemChat(`${att.user.pseudo} entre dans l'arène.`);
        return this.afterChange([], now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            this.queues.delete(seat.id);
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
          this.systemChat(lateJoinNotice("culbute", msg.lateJoin));
          if (d.status === "playing") return this.afterChange([], now);
        }
        if (d.status === "playing") return msg.lateJoin === undefined ? error("On ne change pas les règles en plein combat.") : undefined;
        const current = { ...DEFAULT_CONFIG, ...d.settings.culbute };
        const drawn = d.tour ? null : hostDraw("culbute", d.settings.randomRules, current, DEFAULT_CONFIG, msg.randomRules, Math.random);
        if (drawn) {
          d.settings.randomRules = drawn.draw;
          d.settings.culbute = drawn.settings;
          this.systemChat(drawn.notice);
        }
        d.settings.culbute = mergeConfig(d.settings.culbute, hostPatch("culbute", d.settings.randomRules, msg.settings));
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= MIN_PLAYERS && max <= CULBUTE_MAX_PLAYERS) {
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
        if (d.seats.length >= d.settings.maxPlayers) return error("L'arène est complète.");
        const used = new Set(d.seats.map((s) => s.name));
        // D'abord les six Habitués, chacun avec son style ; ensuite d'autres habitués de la table
        const free = HABITUE_IDS.filter((id) => !used.has(HABITUES[id].name));
        const style = free.length > 0 ? free[Math.floor(Math.random() * free.length)]! : null;
        const name = style ? HABITUES[style].name : (EXTRA_BOT_NAMES.find((n) => !used.has(n)) ?? `Habitué ${d.botCounter + 1}`);
        const fighter: FighterPick = style ? { who: style } : botPick([], Math.random);
        const inTeam = (t: 0 | 1) => d.seats.filter((s) => s.team === t).length;
        d.seats.push({
          id: `bot-${++d.botCounter}`,
          kind: "bot",
          userId: null,
          name,
          avatar: style ? HABITUES[style].avatar : seededAvatar(`${name}-${d.code}`),
          photo: 0,
          autoplay: false,
          disconnectedAt: null,
          team: inTeam(0) <= inTeam(1) ? 0 : 1,
          fighter,
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

  /** Les commandes reçues, rangées dans l'ordre (celles déjà reçues sont ignorées) */
  private queueInputs(seatId: string, first: unknown, data: unknown, stamp: unknown) {
    if (typeof first !== "number" || !Array.isArray(data) || data.length > SAMPLE_STRIDE * 30) return;
    let q = this.queues.get(seatId);
    if (!q) {
      q = { samples: [], lastSeq: 0, ack: 0, last: { x: 0, y: 0, held: 0, pressed: 0 }, stamp: 0, starved: 0, low: 0, since: 0 };
      this.queues.set(seatId, q);
    }
    // Un nouvel écran (après une revanche) recompte depuis 1 : un paquet en retard de l'ancien ne doit pas faire ignorer
    // toutes ses commandes. On repart d'une file vide.
    if (Math.floor(first) < q.lastSeq - SEQ_RESTART) {
      q.samples = [];
      q.lastSeq = Math.floor(first) - 1;
      q.ack = 0;
      q.last = { x: 0, y: 0, held: 0, pressed: 0 };
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
          held: num(data[i + 2], 0, 255) | 0,
          pressed: num(data[i + 3], 0, 255) | 0,
        },
      });
    }
    if (typeof stamp === "number" && Number.isFinite(stamp)) q.stamp = stamp;
  }

  /** La commande d'un joueur pour ce pas : la suivante de sa file, ou la dernière tenue s'il n'y en a pas */
  private nextInput(seatId: string): Input {
    const q = this.queues.get(seatId);
    if (!q) return { x: 0, y: 0, held: 0, pressed: 0 };
    if (q.samples.length > QUEUE_MAX) {
      // Beaucoup de retard d'un coup : on serre, sans perdre un seul appui
      let pressed = 0;
      while (q.samples.length > QUEUE_KEEP) pressed |= q.samples.shift()!.input.pressed;
      q.samples[0]!.input.pressed |= pressed;
      q.low = q.samples.length;
      q.since = 0;
    } else {
      // Une marge qui n'a pas servi depuis un moment : une commande de moins, en douceur
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
      // Un trou court, le réseau qui hoquette : la commande tenue continue ; au-delà, plus rien n'est tenu
      q.starved += 1;
      return q.starved > STALE_STEPS ? { x: 0, y: 0, held: 0, pressed: 0 } : { ...q.last, pressed: 0 };
    }
    q.starved = 0;
    q.ack = next.seq;
    q.last = next.input;
    return next.input;
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
  // Le combat
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
    // Plusieurs combats d'affilée : les points de chaque manche font le classement envoyé à la tournée
    d.series = newSeries(
      present.map((x) => ({
        id: x.id,
        name: x.name,
        userId: x.kind === "human" ? (x.userId ?? null) : null,
        bot: x.kind !== "human",
        team: x.team,
      })),
    );
    return this.startGame(now);
  }

  private async startGame(now: number, ws?: WebSocket) {
    const d = this.data!;
    // L'annonce (revanche ou tournée) est passée
    d.pickUntil = null;
    d.ready = [];
    d.timers = d.timers.filter((t) => t.kind !== "tourStart");
    d.seats = d.seats.filter((x) => x.kind === "bot" || this.isConnected(x.userId));
    this.ensureHost();
    if (d.seats.length < MIN_PLAYERS) {
      if (ws) this.send(ws, { t: "error", message: "Il faut au moins deux combattants : ajoute un bot !" });
      return this.afterChange([], now);
    }
    for (const seat of d.seats) {
      seat.autoplay = false;
      seat.disconnectedAt = null;
    }
    if (d.settings.randomRules && !d.tour) {
      d.settings.culbute = applyDrawnRules("culbute", { ...DEFAULT_CONFIG, ...d.settings.culbute }, DEFAULT_CONFIG, d.settings.randomRules);
    }
    const cfg = { ...DEFAULT_CONFIG, ...d.settings.culbute };
    d.fight = createFight(
      cfg,
      d.series ? seriesArena(cfg, d.series, Math.random) : pickArena(cfg, Math.random),
      d.seats.map((s) => ({ id: s.id, team: s.team, style: styleOf(s.fighter) })),
      randomSeed(),
    );
    this.queues.clear();
    this.memory.clear();
    this.pendingEvents = [];
    d.status = "playing";
    d.startedAt = now;
    d.recorded = false;
    d.results = null;
    d.rematch = [];
    d.timers = d.timers.filter((t) => t.kind === "cleanup" || t.kind === "seatCleanup");
    this.lastKey = stateKey(d.fight);
    this.systemChat(d.series ? `Manche ${d.series.round} sur ${d.series.rounds} : que le meilleur gagne !` : "Que le meilleur gagne !");
    if (d.settings.randomRules && !d.tour) this.systemChat(drawNotice("culbute", d.settings.randomRules, "start"));
    this.startLoop();
    return this.afterChange([], now);
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

  /** Les commandes de chacun pour ce pas : les joueurs, et les bots (ou ceux qu'un bot remplace) */
  private inputs(f: Fight): Input[] {
    const d = this.data!;
    const level = d.settings.culbute.botLevel ?? "moyen";
    return f.fighters.map((ft) => {
      const seat = d.seats.find((s) => s.id === ft.id);
      if (seat && seat.kind === "human" && !seat.autoplay) return this.nextInput(seat.id);
      let mem = this.memory.get(ft.id);
      if (!mem) {
        mem = newBotMemory(f.rng ^ (ft.slot * 7919));
        this.memory.set(ft.id, mem);
      }
      // Un joueur parti : un bot tient sa place, au niveau de la table (comme à Escarmouche)
      return botInput(f, ft.slot, mem, level);
    });
  }

  private async tick() {
    const d = this.data;
    const f = d?.fight;
    if (!d || !f || d.status !== "playing" || d.series?.nextAt) {
      this.stopLoop();
      return;
    }
    const now = Date.now();
    this.acc += Math.min(now - this.lastTick, 200);
    this.lastTick = now;
    let steps = 0;
    while (this.acc >= STEP_MS && steps < 8) {
      this.acc -= STEP_MS;
      steps++;
      const inputs = this.inputs(f);
      this.lastInputs = inputs;
      this.pendingEvents.push(...stepFight(f, inputs));
    }
    if (steps === 0) return;
    if (now - this.lastSent >= SEND_EVERY_MS || this.pendingEvents.length > 0) {
      this.lastSent = now;
      this.sendTick(f, now);
    }
    const key = stateKey(f);
    if (f.phase === "over" && f.clock <= 0) {
      await this.finishGame(now);
      return;
    }
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.saveLive();
      this.lastSave = now;
      this.broadcast([]);
    } else if (now - this.lastSave > SAVE_EVERY_MS) {
      this.lastSave = now;
      this.saveLive();
    }
  }

  /** Ce qui bouge, à tous ; et à chacun, son propre combattant en entier */
  private sendTick(f: Fight, now: number) {
    const d = this.data!;
    const acks: number[] = [];
    const stamps: number[] = [];
    for (const ft of f.fighters) {
      const q = this.queues.get(ft.id);
      acks.push(q?.ack ?? 0);
      stamps.push(q?.stamp ?? 0);
    }
    const events = this.pendingEvents;
    this.pendingEvents = [];
    const base = JSON.stringify({ t: "tick", now, ...encodeTick(f, events, acks, stamps) });
    // Aux joueurs, de quoi anticiper tout le combat : chacun en entier, et la dernière commande de chacun
    const full = `,"w":${JSON.stringify(f.fighters.map((x) => packFull(x)))},"u":${JSON.stringify(packInputs(this.lastInputs))}}`;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      const seat = att ? d.seats.find((s) => s.userId === att.userId) : undefined;
      const ft = seat ? f.fighters.find((x) => x.id === seat.id) : undefined;
      try {
        ws.send(ft ? `${base.slice(0, -1)}${full}` : base);
      } catch {
        // déjà fermée
      }
    }
  }

  private async finishGame(now: number) {
    const d = this.data!;
    const s = d.series;
    if (s && !s.final) {
      if (s.nextAt) return;
      addRound(s, d.fight!);
      if (s.round < s.rounds) return this.betweenRounds(now);
      s.final = seriesRanks(s, d.fight!.settings.teams);
    }
    d.status = "finished";
    this.stopLoop();
    if (d.tour) this.addTimer({ at: now + TOUR_TABLE_LINGER_MS, kind: "cleanup" });
    const f = d.fight!;
    if (s?.final) {
      const first = Object.keys(s.final).filter((id) => s.final![id] === 1);
      const who = first.map((id) => s.seats[id]?.name ?? "?");
      if (who.length === 1) this.systemChat(`${who[0]} remporte les ${s.rounds} manches avec ${s.points[first[0]!]} points !`);
      else if (who.length > 1) this.systemChat(`Victoire de ${who.join(", ")} aux points !`);
    } else {
      const names = f.winners.map((slot) => d.seats.find((x) => x.id === f.fighters[slot]?.id)?.name ?? "?");
      if (names.length === 1) this.systemChat(`${names[0]} remporte le combat !`);
      else if (names.length > 1) this.systemChat(`Victoire de ${names.join(", ")} !`);
    }
    if (d.settings.randomRules && !d.tour) {
      d.settings.randomRules = drawRules("culbute", Math.random, d.settings.randomRules);
      this.systemChat(drawNotice("culbute", d.settings.randomRules, "next"));
    }
    await this.afterChange([], now);
  }

  /** Une manche de la série est finie : le combat s'enregistre, chacun regarde les scores, puis la suivante part */
  private async betweenRounds(now: number) {
    const d = this.data!;
    const s = d.series!;
    this.stopLoop();
    s.nextAt = now + SERIES_PAUSE_MS;
    this.addTimer({ at: s.nextAt, kind: "nextRound" });
    const ranks = seriesRanks(s, d.fight!.settings.teams);
    const lead = Object.keys(ranks).filter((id) => ranks[id] === 1);
    const who = lead.map((id) => s.seats[id]?.name ?? "?").join(", ");
    this.systemChat(
      `Fin de la manche ${s.round} sur ${s.rounds} : ${who} ${lead.length > 1 ? "mènent" : "mène"} avec ${s.points[lead[0]!]} points.`,
    );
    await this.afterChange([], now);
    await this.recordResults(now);
  }

  /** La manche suivante, avec ceux qui sont encore là ; s'il n'y a plus de quoi se battre, la série s'arrête là */
  private async nextRound(now: number) {
    const d = this.data!;
    const s = d.series!;
    s.nextAt = null;
    const present = d.seats.filter((x) => x.kind === "bot" || this.isConnected(x.userId));
    if (present.length < MIN_PLAYERS || !present.some((x) => x.kind === "human")) {
      s.final = seriesRanks(s, d.fight!.settings.teams);
      return this.finishGame(now);
    }
    s.round++;
    return this.startGame(now);
  }

  // -------------------------------------------------------------------------
  // Minuteurs
  // -------------------------------------------------------------------------

  private async afterChange(events: FightEvent[], now: number, closing?: WebSocket) {
    const d = this.data;
    if (!d) return;
    this.releaseAbsent(now);
    await this.persist();
    this.broadcast(events, closing);
    await this.armAlarm();
    await this.syncHub();
    void now;
    await this.recordIfNeeded();
  }

  private async recordIfNeeded() {
    const d = this.data;
    if (!d || d.status !== "finished" || d.recorded || d.fight?.phase !== "over") return;
    d.recorded = true;
    await this.persist();
    await this.recordResults(Date.now());
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
    if (d.status === "playing" && d.fight) this.startLoop();
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
    const seat = t.seatId ? d.seats.find((s) => s.id === t.seatId) : undefined;
    switch (t.kind) {
      case "away": {
        if (!seat || seat.disconnectedAt === null || d.status !== "playing" || seat.autoplay) return false;
        seat.autoplay = "away";
        this.systemChat(`${seat.name} s'est déconnecté : un bot prend sa place en attendant son retour.`);
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
      case "nextRound":
        if (!d.series?.nextAt || d.status !== "playing") return false;
        await this.nextRound(now);
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
    const f = d.fight!;
    const series = d.series;
    try {
      const players = f.fighters.map((ft) => {
        const seat = d.seats.find((s) => s.id === ft.id);
        const stats = recordStatsOf(f, ft);
        return {
          seat: ft.slot,
          userId: seat?.kind === "human" ? seat.userId : null,
          name: seat?.name ?? "?",
          isBot: seat?.kind !== "human",
          absent: Boolean(seat?.autoplay),
          rank: ft.rank,
          score: f.settings.mode === "temps" ? ft.score : ft.stats.kos,
          eliminated: ft.state === "out",
          team: f.settings.teams ? ft.team : null,
          stats,
        };
      });
      if (d.tour && series?.final) {
        // La série finie : la place au total, et ce que chacun a fait sur toutes les manches
        const ids = Object.keys(series.seats);
        await reportToTour(this.env, d.tour.code, {
          code: d.code,
          index: d.tour.index,
          game: "culbute",
          seats: ids.length,
          players: ids.map((id) => ({
            userId: series.seats[id]!.userId ?? id,
            rank: series.final![id]!,
            stats: { ...(series.totals[id] ?? EMPTY_STATS) },
          })),
        });
      } else if (d.tour && !series) {
        await reportToTour(this.env, d.tour.code, {
          code: d.code,
          index: d.tour.index,
          game: "culbute",
          seats: players.length,
          players: players.map((p) => ({ userId: p.userId ?? f.fighters[p.seat]!.id, rank: p.rank, stats: { ...p.stats } })),
        });
      }
      // Chaque combat ne s'enregistre qu'une fois (dans une série, chaque manche à sa fin)
      if (series) {
        if (series.recorded >= series.round) return;
        series.recorded = series.round;
        await this.persist();
      }
      const cfg = { ...DEFAULT_CONFIG, ...d.settings.culbute };
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "culbute",
        mode: f.settings.mode,
        roomCode: d.code,
        settings: { ...cfg, ...f.settings, arena: f.arena as typeof cfg.arena },
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: 1,
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
      console.error("Enregistrement du combat de Culbute impossible", err);
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

  private viewFor(userId: string, connected: Map<string, PublicUser>): CulbuteRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    const cfg = { ...DEFAULT_CONFIG, ...d.settings.culbute };
    return {
      code: d.code,
      game: "culbute",
      status: d.status,
      settings: { ...d.settings, lateJoin: lateJoinOf(d.settings, d.quick), culbute: cfg },
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
        fighter: s.fighter,
      })),
      spectators: [...connected.values()].filter((u) => !seatedUsers.has(u.id)).map((u) => ({ userId: u.id, name: u.pseudo })),
      hostId: d.hostId,
      you: { userId, seatId: seat?.id ?? null, isHost: userId === d.hostId, isAdmin: Boolean(connected.get(userId)?.admin) },
      teams: Object.fromEntries(d.seats.map((s) => [s.id, s.team])),
      culbute: d.fight ? culbuteView(d.fight, cfg) : null,
      series: d.series ?? null,
      serverNow: Date.now(),
      rematch: d.rematch,
      results: d.results ?? null,
      quick: d.quick,
      tour: d.tour?.code ?? null,
      pickUntil: d.pickUntil ?? null,
      ready: d.ready ?? [],
    };
  }

  private broadcast(events: FightEvent[], except?: WebSocket) {
    const connected = this.connectedUsers(except);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !isLive(ws)) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: "room", room: this.viewFor(att.userId, connected), events });
    }
  }

  private broadcastRaw(msg: CulbuteServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: CulbuteServerMessage) {
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
    return { code: d.code, game: "culbute", status: d.status, lateJoin: lateJoinOf(d.settings, d.quick) };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    return {
      code: d.code,
      game: "culbute",
      variant: d.settings.culbute.mode,
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
