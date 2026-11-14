import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { botPlan } from "../shared/games/meche/bot.ts";
import {
  checkWord,
  DEFAULT_SETTINGS,
  explode,
  FUSE_MODES,
  FUSE_NAMES,
  holderOf,
  lightFuse,
  LIVES_CHOICES,
  newGame,
  playWord,
  usePass,
  type BotLevel,
  type MecheEvent,
  type FuseMode,
  type MecheGame,
  type MecheSettings,
} from "../shared/games/meche/engine.ts";
import { mecheView } from "../shared/games/meche/view.ts";
import { cleanShown, Dictionary, normalizeWord, Vocabulary } from "../shared/games/meche/words.ts";
import {
  CHAT_MAX,
  MECHE_MAX_PLAYERS,
  MIN_PLAYERS,
  REACTIONS,
  TAUNTS,
  type ChatMessage,
  type MecheClientMessage,
  type MecheRoomSettings,
  type MecheRoomView,
  type MecheServerMessage,
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
import { isLive, replaceOlder } from "./sockets.ts";
import { decodeHeaderJson } from "./util.ts";

// Des artificiers et des pompiers pour compléter la table
const BOT_NAMES = ["Gaston", "Jacqueline", "Marcel", "Odette", "Raymond", "Simone", "Lucien", "Paulette", "Fernand", "Germaine"];
// Délai laissé à un joueur déconnecté pour revenir avant qu'un bot joue à sa place
const AWAY_AFTER_MS = 10_000;
const SEAT_RELEASE_MS = 25_000;
const CHAT_KEEP = 80;

// Les listes de mots restent en mémoire entre deux parties, tant que le Worker vit. On ne garde que le résultat :
// une promesse lancée par une salle ne peut pas être attendue par une autre.
let dictionary: Dictionary | null = null;
let vocabulary: Vocabulary | null = null;

async function fetchList(env: Env, path: string): Promise<Response> {
  // Seul le chemin compte en ligne ; en développement, le serveur Vite n'accepte que localhost
  const res = await env.ASSETS.fetch(new Request(`http://localhost${path}`));
  // Une page d'accueil renvoyée à la place du fichier (il manque au déploiement) ne doit pas passer pour une liste
  if (!res.ok || !(res.headers.get("Content-Type") ?? "").startsWith("text/plain")) {
    throw new Error(`Liste de mots introuvable : ${path} (${res.status})`);
  }
  return res;
}

async function loadDictionary(env: Env): Promise<Dictionary> {
  dictionary ??= new Dictionary(new Uint8Array(await (await fetchList(env, "/meche/mots.txt")).arrayBuffer()));
  return dictionary;
}

async function loadVocabulary(env: Env): Promise<Vocabulary> {
  vocabulary ??= new Vocabulary(await (await fetchList(env, "/meche/courants.txt")).text());
  return vocabulary;
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
}

type TimerKind = "light" | "boom" | "away" | "seatCleanup" | "cleanup" | "tourStart";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
}

interface MecheData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: MecheRoomSettings;
  status: RoomStatus;
  seats: Seat[];
  botCounter: number;
  game: MecheGame | null;
  startedAt: number | null;
  rematch: string[];
  chat: ChatMessage[];
  chatSeq: number;
  timers: Timer[];
  kicked: string[];
  rng: number;
  recorded: boolean;
  results?: EloResults | null;
  /** Table d'une tournée : la tournée l'a créée et attend son résultat */
  tour?: TourInit | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
  /** Un autre appareil du même compte a pris sa place */
  replaced?: boolean;
}

/** Une table de Mèche : le salon commun, et une mèche que le serveur est seul à savoir quand elle saute. */
export class MecheRoom extends DurableObject<Env> {
  private data: MecheData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();
  /** Le bot qui tape en ce moment : ses lettres à venir, annulées dès que la mèche change de main */
  private botTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<MecheData>("room")) ?? null;
      // Une partie commencée avant que la mèche compte ses mots
      if (this.data?.game) this.data.game.chain ??= 0;
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
      settings: { visibility: opts.visibility, maxPlayers: 6, meche: { ...DEFAULT_SETTINGS } },
      status: "lobby",
      seats: [],
      botCounter: 0,
      game: null,
      startedAt: null,
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
      d.settings.maxPlayers = Math.min(MECHE_MAX_PLAYERS, Math.max(MIN_PLAYERS, d.seats.length));
      d.settings.meche = { ...d.settings.meche, ...variantSettings("meche", opts.tour.variant) };
      d.settings.meche.botLevel = TOUR_BOT_LEVELS[opts.tour.botLevel]?.meche ?? d.settings.meche.botLevel;
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
    // Un seul appareil par compte : s'il était déjà là ailleurs, l'ancien appareil est prévenu et laisse la place
    replaceOlder(this.ctx.getWebSockets(user.id), server);
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
        if (d.status === "playing") this.systemChat(`${seat.name} est de retour.`);
        // S'il tenait la mèche, c'est de nouveau à lui d'écrire
        if (d.game && holderOf(d.game).id === seat.id) this.stopBot();
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
    // Remplacée par un autre appareil du même compte : il est toujours là, rien ne change pour lui
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
    let msg: MecheClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
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
      case "typing": {
        // Les lettres tapées passent aux autres telles quelles, sans jamais être enregistrées
        const g = d.game;
        if (!seat || !g || g.phase !== "lit" || holderOf(g).id !== seat.id || msg.turn !== g.turn) return;
        if (!this.allowMessage(`typing:${userId}`, 35)) return;
        return this.relayTyping(seat.id, cleanShown(msg.text), g.turn, ws);
      }

      case "word":
        return this.onWord(seat, msg);

      case "pass": {
        const g = d.game;
        if (!seat || !g || !this.isHolding(seat, msg.turn, now)) return;
        const events = usePass(g, now);
        if (events.length > 0) await this.afterMove(events, now);
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
            this.systemChat(`${seat.name} a quitté la table, un bot prend le relais.`);
            this.scheduleBot();
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
        if (d.status === "playing") return error("On ne change pas les règles en pleine partie.");
        d.settings.meche = mergeSettings(d.settings.meche, msg.settings ?? {});
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= MIN_PLAYERS && max <= MECHE_MAX_PLAYERS) {
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
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Artificier ${d.botCounter + 1}`;
        d.seats.push({
          id: `bot-${++d.botCounter}`,
          kind: "bot",
          userId: null,
          name,
          avatar: seededAvatar(`${name}-${d.code}`),
          photo: 0,
          autoplay: false,
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

  /** Ce joueur tient bien la mèche, et son message vise la main en cours. Une mèche déjà censée sauter saute d'abord. */
  private isHolding(seat: Seat, turn: unknown, now: number): boolean {
    const g = this.data!.game;
    if (!g || g.phase !== "lit" || holderOf(g).id !== seat.id || turn !== g.turn) return false;
    return now < g.boomAt;
  }

  private async onWord(seat: Seat | null, msg: Extract<MecheClientMessage, { t: "word" }>) {
    if (!seat || !this.allowMessage(`word:${seat.id}`, 120)) return;
    // Le mot compte à l'heure où il est arrivé : si le dictionnaire doit d'abord être rechargé, ce n'est pas au joueur de payer l'attente
    const arrived = Date.now();
    let words: Dictionary;
    try {
      words = await loadDictionary(this.env);
    } catch (err) {
      console.error(err);
      return this.broadcastRaw({ t: "error", message: "Le dictionnaire ne répond pas : réessaie dans un instant." });
    }
    const d = this.data;
    const g = d?.game;
    const now = Date.now();
    if (!g || !this.isHolding(seat, msg.turn, arrived)) return;
    // Vérifié sans accents, montré tel qu'il a été écrit
    const shown = cleanShown(msg.word);
    const word = normalizeWord(shown);
    if (word.length === 0) return;
    const refusal = checkWord(g, word, (w) => words.has(w));
    if (refusal) {
      holderOf(g).stats.refused += 1;
      return this.broadcastRaw({ t: "refused", id: seat.id, word: shown, reason: refusal, turn: g.turn });
    }
    await this.afterMove(playWord(g, word, now, shown), now);
  }

  private async kickUser(target: string, now: number) {
    const d = this.data!;
    if (!d.kicked.includes(target)) d.kicked.push(target);
    const seat = d.seats.find((s) => s.userId === target);
    if (seat) {
      if (d.status === "playing") {
        seat.autoplay = "away";
        seat.disconnectedAt = now;
        this.scheduleBot();
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
  // La partie
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
      if (ws) this.send(ws, { t: "error", message: "Il faut au moins deux joueurs : ajoute un bot !" });
      return this.afterChange([], now);
    }
    // Les mots d'abord : une partie ne démarre pas sans eux
    try {
      await Promise.all([loadDictionary(this.env), loadVocabulary(this.env)]);
    } catch (err) {
      console.error(err);
      if (ws) this.send(ws, { t: "error", message: "Le dictionnaire ne répond pas : réessaie dans un instant." });
      return this.afterChange([], now);
    }
    for (const seat of d.seats) {
      seat.autoplay = false;
      seat.disconnectedAt = null;
    }
    d.game = newGame(
      d.seats.map((s) => s.id),
      { ...DEFAULT_SETTINGS, ...d.settings.meche },
      now,
      randomSeed(),
    );
    // En tournée par équipes : la partie s'arrête quand il ne reste qu'une équipe en jeu
    d.game.teams = d.tour?.teams ?? null;
    d.status = "playing";
    d.startedAt = now;
    d.recorded = false;
    d.results = null;
    d.rematch = [];
    d.timers = d.timers.filter((t) => t.kind === "cleanup" || t.kind === "seatCleanup");
    this.addTimer({ at: d.game.breakUntil, kind: "light" });
    this.stopBot();
    this.systemChat(
      d.settings.meche.mode === "hasard"
        ? `La partie commence ! Le hasard a choisi : ${FUSE_NAMES[d.game.settings.mode]}.`
        : "La partie commence !",
    );
    return this.afterChange([], now);
  }

  /** Un coup vient d'être joué : le sursis éventuel, la suite, puis tout le monde est prévenu */
  private async afterMove(events: MecheEvent[], now: number) {
    this.resetBoomTimer();
    this.scheduleBot();
    await this.afterChange(events, now);
  }

  private resetBoomTimer() {
    const d = this.data!;
    d.timers = d.timers.filter((t) => t.kind !== "boom");
    if (d.game?.phase === "lit") this.addTimer({ at: d.game.boomAt, kind: "boom" });
  }

  /** La mèche saute chez celui qui la tient */
  private doExplode(now: number): MecheEvent[] {
    const d = this.data!;
    const g = d.game!;
    const victim = holderOf(g);
    const events = explode(g, now);
    this.stopBot();
    d.timers = d.timers.filter((t) => t.kind !== "boom");
    if (victim.lives === 0) this.systemChat(`${this.seatById(victim.id)?.name ?? "?"} n'a plus d'allumette.`);
    if (g.phase === "break") this.addTimer({ at: g.breakUntil, kind: "light" });
    if (g.phase === "over") this.finishGame(now);
    return events;
  }

  private finishGame(now: number) {
    const d = this.data!;
    const g = d.game!;
    d.status = "finished";
    d.timers = d.timers.filter((t) => t.kind !== "boom" && t.kind !== "light");
    if (d.tour) this.addTimer({ at: now + TOUR_TABLE_LINGER_MS, kind: "cleanup" });
    const winner = g.ranking?.[0];
    if (winner) this.systemChat(`${this.seatById(winner)?.name ?? "?"} remporte la partie !`);
  }

  // -------------------------------------------------------------------------
  // Bots (et relais d'un joueur absent)
  // -------------------------------------------------------------------------

  private stopBot() {
    for (const t of this.botTimers) clearTimeout(t);
    this.botTimers = [];
  }

  private botLevel(seat: Seat): BotLevel {
    return seat.kind === "bot" ? this.data!.game!.settings.botLevel : "moyen";
  }

  /** Si la mèche est chez un bot (ou un absent relayé), il réfléchit puis tape lettre par lettre */
  private scheduleBot() {
    this.stopBot();
    const d = this.data;
    const g = d?.game;
    if (!d || !g || g.phase !== "lit") return;
    const id = holderOf(g).id;
    const seat = this.seatById(id);
    if (!seat || (seat.kind !== "bot" && !seat.autoplay)) return;
    void this.planBot(seat, g.turn);
  }

  private async planBot(seat: Seat, turn: number) {
    let vocab: Vocabulary;
    try {
      vocab = await loadVocabulary(this.env);
    } catch (err) {
      console.error(err);
      return;
    }
    const d = this.data;
    const g = d?.game;
    if (!d || !g || g.phase !== "lit" || g.turn !== turn) return;
    const plan = botPlan(g, this.botLevel(seat), vocab, d);
    if (plan.pass) {
      this.botTimers.push(setTimeout(() => void this.botPass(seat.id, turn), plan.thinkMs));
      return;
    }
    if (!plan.word) return;
    const { word, shown } = plan.word;
    let at = plan.thinkMs;
    for (let i = 1; i <= shown.length; i++) {
      at += plan.letterMs * (0.7 + random(d) * 0.6);
      this.botTimers.push(setTimeout(() => this.relayTyping(seat.id, shown.slice(0, i), turn), at));
    }
    this.botTimers.push(setTimeout(() => void this.botWord(seat.id, word, shown, turn), at + plan.letterMs * 1.5));
  }

  private async botPass(id: string, turn: number) {
    const g = this.data?.game;
    if (!g || g.phase !== "lit" || g.turn !== turn || holderOf(g).id !== id) return;
    const now = Date.now();
    if (now >= g.boomAt) return;
    const events = usePass(g, now);
    if (events.length > 0) await this.afterMove(events, now);
  }

  private async botWord(id: string, word: string, shown: string, turn: number) {
    const g = this.data?.game;
    if (!g || g.phase !== "lit" || g.turn !== turn || holderOf(g).id !== id) return;
    const now = Date.now();
    if (now >= g.boomAt) return;
    await this.afterMove(playWord(g, word, now, shown), now);
  }

  // -------------------------------------------------------------------------
  // Boucle : après chaque changement, on programme la suite
  // -------------------------------------------------------------------------

  private async afterChange(events: MecheEvent[], now: number, closing?: WebSocket) {
    const d = this.data;
    if (!d) return;
    await this.persist();
    this.broadcast(events, closing);
    await this.armAlarm();
    await this.syncHub();
    void now;
    await this.recordIfNeeded();
  }

  private async recordIfNeeded() {
    const d = this.data;
    if (!d || d.status !== "finished" || d.recorded || d.game?.phase !== "over") return;
    d.recorded = true;
    await this.persist();
    await this.recordResults(Date.now());
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
    const events: MecheEvent[] = [];
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

  /** Renvoie les événements du minuteur s'il a changé quelque chose, null sinon */
  private async runTimer(t: Timer, now: number): Promise<MecheEvent[] | null> {
    const d = this.data!;
    const g = d.game;
    const seat = t.seatId ? this.seatById(t.seatId) : undefined;

    switch (t.kind) {
      case "light": {
        if (!g || g.phase !== "break" || d.status !== "playing") return null;
        const events = lightFuse(g, now);
        this.resetBoomTimer();
        this.scheduleBot();
        return events;
      }
      case "boom":
        // Un sursis a pu repousser l'heure : le minuteur à jour est déjà en place
        if (!g || g.phase !== "lit" || d.status !== "playing") return null;
        return this.doExplode(now);
      case "away": {
        if (!seat || seat.disconnectedAt === null || d.status !== "playing" || seat.autoplay) return null;
        seat.autoplay = "away";
        this.systemChat(`${seat.name} s'est déconnecté : un bot joue à sa place en attendant son retour.`);
        if (g && holderOf(g).id === seat.id) this.scheduleBot();
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
      case "cleanup":
        if (this.connectedUsers().size > 0) return null;
        await this.destroy();
        return null;
      case "tourStart":
        if (!d.tour || d.status !== "lobby") return null;
        await this.startTourGame(now);
        return null;
    }
  }

  private async destroy() {
    const d = this.data!;
    this.stopBot();
    for (const s of d.seats) if (s.userId) void this.setPresence(s.userId, null).catch(() => {});
    await this.hub.removeRoom(d.code).catch(() => {});
    this.data = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private async recordResults(now: number) {
    const d = this.data!;
    const g = d.game!;
    try {
      const players = g.players.map((p, i) => {
        const seat = this.seatById(p.id);
        return {
          seat: i,
          userId: seat?.kind === "human" ? seat.userId : null,
          name: seat?.name ?? "?",
          isBot: seat?.kind !== "human",
          rank: g.ranks?.[p.id] ?? g.players.length,
          score: p.stats.words,
          eliminated: false,
          team: null,
          stats: p.stats,
        };
      });
      if (d.tour) {
        await reportToTour(this.env, d.tour.code, {
          code: d.code,
          index: d.tour.index,
          game: "meche",
          seats: players.length,
          // Un bot de la tournée se reconnaît à son id de siège
          players: g.players.map((p, i) => ({
            userId: players[i]!.userId ?? p.id,
            rank: players[i]!.rank,
            stats: { ...players[i]!.stats },
          })),
        });
      }
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "meche",
        mode: g.settings.mode,
        roomCode: d.code,
        settings: g.settings,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: g.fuse,
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
      console.error("Enregistrement de la partie de Mèche impossible", err);
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

  private viewFor(userId: string, connected: Map<string, PublicUser>): MecheRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    return {
      code: d.code,
      game: "meche",
      status: d.status,
      // Une table ouverte avant les modes de jeu n'a pas tous les réglages
      settings: { ...d.settings, meche: { ...DEFAULT_SETTINGS, ...d.settings.meche } },
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
      meche: d.game ? mecheView(d.game) : null,
      serverNow: Date.now(),
      rematch: d.rematch,
      results: d.results ?? null,
      quick: d.quick,
      tour: d.tour?.code ?? null,
    };
  }

  private broadcast(events: MecheEvent[], except?: WebSocket) {
    const connected = this.connectedUsers(except);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !isLive(ws)) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: "room", room: this.viewFor(att.userId, connected), events });
    }
  }

  /** Les lettres tapées, pour tous sauf celui qui les tape (la mèche d'un bot, pour tout le monde) */
  private relayTyping(id: string, text: string, turn: number, from?: WebSocket) {
    const data = JSON.stringify({ t: "typing", id, text, turn } satisfies MecheServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === from) continue;
      try {
        ws.send(data);
      } catch {
        // déjà fermée
      }
    }
  }

  private broadcastRaw(msg: MecheServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: MecheServerMessage) {
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
    return { code: this.data!.code, game: "meche", status: this.data!.status };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    return {
      code: d.code,
      game: "meche",
      variant: d.game?.settings.mode ?? d.settings.meche.mode ?? "commune",
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

function mergeSettings(current: MecheSettings, patch: Partial<MecheSettings>): MecheSettings {
  // Une table ouverte avant les modes de jeu n'en a pas encore
  const next = { ...DEFAULT_SETTINGS, ...current };
  if (FUSE_MODES.includes(patch.mode as FuseMode) || patch.mode === "hasard") next.mode = patch.mode!;
  if ((LIVES_CHOICES as readonly number[]).includes(patch.lives as number)) next.lives = patch.lives!;
  if (patch.pace === "pose" || patch.pace === "normal" || patch.pace === "nerveux") next.pace = patch.pace;
  if (patch.difficulty === "simple" || patch.difficulty === "normal" || patch.difficulty === "corse") next.difficulty = patch.difficulty;
  if (patch.source === "hasard" || patch.source === "marabout") next.source = patch.source;
  if (typeof patch.passes === "boolean") next.passes = patch.passes;
  if (patch.botLevel === "facile" || patch.botLevel === "moyen" || patch.botLevel === "fort") next.botLevel = patch.botLevel;
  return next;
}
