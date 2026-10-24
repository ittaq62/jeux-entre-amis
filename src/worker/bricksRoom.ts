import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { BOT_PACE, botPlacement } from "../shared/games/bricks/bot.ts";
import {
  COLS,
  DEFAULT_SETTINGS,
  emptyGrid,
  fits,
  garbageHoles,
  gridToString,
  newBoard,
  PIECES,
  place,
  spawn,
  SPRINT_LINES,
  stackHeight,
  type Active,
  type BotLevel,
  type BricksMode,
  type BricksSettings,
  type PlaceResult,
  type Placement,
  type PlayerBoard,
  type Rot,
  type TargetStrategy,
} from "../shared/games/bricks/engine.ts";
import { emptyStats, type BricksFx, type BricksPlayerView, type BricksStats, type BricksView } from "../shared/games/bricks/view.ts";
import {
  BRICKS_MAX_PLAYERS,
  CHAT_MAX,
  MIN_PLAYERS,
  REACTIONS,
  TAUNTS,
  type BricksClientMessage,
  type BricksRoomSettings,
  type BricksRoomView,
  type BricksServerMessage,
  type ChatMessage,
  type PresenceRoom,
  type PublicUser,
  type RoomStatus,
  type RoomSummary,
} from "../shared/protocol.ts";
import { random, randomSeed } from "../shared/rng.ts";
import type { RoomInit } from "./room.ts";
import { recordGame, recordSprint, type EloResults } from "./users.ts";
import { decodeHeaderJson } from "./util.ts";

// Des maçons et des tailleurs de pierre pour compléter la table
const BOT_NAMES = ["Gaston", "Jacqueline", "Marcel", "Odette", "Raymond", "Simone", "Lucien", "Paulette", "Fernand", "Germaine"];
// Délai laissé à un joueur déconnecté pour revenir avant qu'un bot joue à sa place
const AWAY_AFTER_MS = 10_000;
const SEAT_RELEASE_MS = 25_000;
/** Sans pose depuis ce temps en pleine manche, un bot prend le relais */
const AFK_MS = 20_000;
const COUNTDOWN_MS = 3600;
const INTERMISSION_MS = 6000;
// Le temps de lire « K.O. ! Ta pile repart à zéro » avant que les pièces reprennent
const KO_PAUSE_MS = 2000;
/** Dernier debout : la marée montante commence après 3 minutes, une ligne grise toutes les 5 s */
const TIDE_AFTER_MS = 180_000;
const TIDE_EVERY_MS = 5000;
const TICK_MS = 4000;
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
  disconnectedAt: number | null;
  team: 0 | 1;
}

function emptierTeam(seats: Seat[]): 0 | 1 {
  const first = seats.filter((s) => s.team === 0).length;
  return first <= seats.length - first ? 0 : 1;
}

interface BrickPlayer {
  id: string;
  team: number | null;
  board: PlayerBoard;
  alive: boolean;
  koUntil: number | null;
  place: number | null;
  kos: number;
  sent: number;
  lines: number;
  pieces: number;
  roundWins: number;
  strategy: TargetStrategy;
  target: string | null;
  attackers: { id: string; at: number }[];
  lastGarbage: { id: string; at: number } | null;
  lastPlacedAt: number;
  sprintTime: number | null;
  stats: BricksStats;
  /** Tirage des trous des lignes grises que ce joueur reçoit */
  holes: number;
}

interface BricksMatch {
  settings: BricksSettings;
  mode: BricksMode;
  players: BrickPlayer[];
  round: {
    index: number;
    phase: "countdown" | "playing" | "over";
    seed: number;
    startAt: number;
    endAt: number | null;
    tideAt: number | null;
    winners: string[] | null;
    nextAt: number | null;
  };
  matchOver: boolean;
  ranking: string[] | null;
  ranks: Record<string, number> | null;
  garbageSeq: number;
  rng: number;
}

type TimerKind = "start" | "roundEnd" | "nextRound" | "tide" | "tick" | "away" | "seatCleanup" | "cleanup" | "emote";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
  emote?: string;
  round?: number;
}

interface BricksData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: BricksRoomSettings;
  status: RoomStatus;
  seats: Seat[];
  botCounter: number;
  match: BricksMatch | null;
  startedAt: number | null;
  rematch: string[];
  chat: ChatMessage[];
  chatSeq: number;
  timers: Timer[];
  kicked: string[];
  rng: number;
  recorded: boolean;
  results?: EloResults | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
}

export function modeOf(settings: BricksSettings, players: number): BricksMode {
  if (settings.sprint) return "sprint";
  if (settings.teams && players === 4) return "teams";
  return players === 2 ? "duel" : "melee";
}

/** Une table de Briques : le salon commun, et des manches en temps réel où le serveur vérifie chaque pose. */
export class BricksRoom extends DurableObject<Env> {
  private data: BricksData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();
  private bots = new Map<string, ReturnType<typeof setTimeout>>();
  private placeTimes = new Map<string, number[]>();
  private lastResync = new Map<string, number>();
  private dirty = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<BricksData>("room")) ?? null;
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
      settings: { visibility: opts.visibility, maxPlayers: 2, bricks: { ...DEFAULT_SETTINGS } },
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
        this.stopBot(seat.id);
        if (d.status === "playing") this.systemChat(`${seat.name} est de retour.`);
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
    await this.afterChange(now);
    // Son plateau exact, pour reprendre la manche en cours
    if (seat && d.match) this.sendSnapshot(seat.id, true);
    void this.hub.setUserRoom(user.id, this.presenceRoom()).catch(() => {});
  }

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
      disconnectedAt: null,
      team: emptierTeam(d.seats),
    };
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
    await this.afterChange(now, ws);
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
    let msg: BricksClientMessage;
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
      case "place":
        // Un K.O. ou une fin de manche change toute la table : on la rediffuse en entier
        if (seat && this.onPlace(seat, msg, now)) await this.afterChange(now);
        return;

      case "live": {
        // La pièce en vol, relayée telle quelle aux autres (jamais enregistrée)
        if (!seat || !d.match || d.match.round.phase !== "playing" || !this.allowMessage(`live:${userId}`, 60)) return;
        const piece = sanitizeActive(msg.piece);
        const text = JSON.stringify({ t: "live", id: seat.id, piece } satisfies BricksServerMessage);
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

      case "strategy": {
        const p = seat && d.match ? this.player(seat.id) : undefined;
        if (!p) return;
        if (msg.strategy === "random" || msg.strategy === "attackers" || msg.strategy === "danger" || msg.strategy === "manual") {
          p.strategy = msg.strategy;
        }
        if (p.strategy === "manual" && typeof msg.target === "string" && this.player(msg.target)) p.target = msg.target;
        this.dirty = true;
        return this.broadcastBoard(p, []);
      }

      case "resync":
        if (seat) this.sendSnapshot(seat.id, false);
        return;

      case "blocked": {
        // L'écran dit que sa prochaine pièce ne peut plus apparaître : on le vérifie sur notre plateau
        const m = d.match;
        const p = seat && m ? this.player(seat.id) : undefined;
        if (!p || !m || m.round.phase !== "playing" || !p.alive || seat!.autoplay || (p.koUntil && now < p.koUntil)) return;
        const b = p.board;
        const alternative = b.hold ?? b.bag.queue[0]!;
        const stuck = !fits(b.grid, spawn(b.current)) || (m.settings.hold && !fits(b.grid, spawn(alternative)));
        if (!stuck) return this.sendSnapshot(seat!.id, false);
        const fx: BricksFx[] = [];
        this.topOut(p, now, fx);
        this.dirty = true;
        this.broadcastBoard(p, fx);
        this.checkRoundEnd(now);
        return this.afterChange(now);
      }

      case "takeBack": {
        if (!seat || !seat.autoplay) return;
        seat.autoplay = false;
        this.stopBot(seat.id);
        const p = this.player(seat.id);
        if (p) p.lastPlacedAt = now;
        this.systemChat(`${seat.name} reprend la main.`);
        await this.afterChange(now);
        return this.sendSnapshot(seat.id, true);
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
        return this.afterChange(now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            this.startBot(seat.id, 400);
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
            // déjà fermée
          }
        }
        this.ensureHost();
        void this.hub.setUserRoom(userId, null).catch(() => {});
        return this.afterChange(now, ws);
      }

      case "rematch": {
        if (d.status !== "finished" || !seat || d.rematch.includes(userId)) return;
        d.rematch.push(userId);
        const humans = d.seats.filter((s) => s.kind === "human" && this.isConnected(s.userId));
        if (humans.every((s) => d.rematch.includes(s.userId!))) return this.startGame(now);
        return this.afterChange(now);
      }

      case "team": {
        if (d.status === "playing") return error("Les équipes sont faites : attends la fin de la partie.");
        const target = d.seats.find((s) => s.id === msg.seatId);
        if (!target || (msg.team !== 0 && msg.team !== 1) || target.team === msg.team) return;
        if (target !== seat && !isHost) return error("Seul l'hôte peut changer l'équipe d'un autre joueur.");
        const crew = d.seats.filter((s) => s !== target && s.team === msg.team);
        const bot = crew.length >= 2 ? crew.findLast((s) => s.kind === "bot") : undefined;
        if (bot) bot.team = target.team;
        target.team = msg.team;
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
        if (d.status === "playing") return error("On ne change pas les règles en pleine partie.");
        d.settings.bricks = mergeSettings(d.settings.bricks, msg.settings ?? {});
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= 1 && max <= BRICKS_MAX_PLAYERS) {
            d.settings.maxPlayers = max;
            while (d.seats.length > max) {
              const botIndex = d.seats.map((s) => s.kind).lastIndexOf("bot");
              if (botIndex < 0) break;
              d.seats.splice(botIndex, 1);
            }
            d.settings.maxPlayers = Math.max(max, d.seats.length);
          }
        }
        // Le solo se joue seul : une seule place
        if (d.settings.bricks.sprint) {
          d.seats = d.seats.filter((s) => s.kind === "human");
          d.settings.maxPlayers = Math.max(1, d.seats.length);
        } else if (d.settings.maxPlayers < MIN_PLAYERS) d.settings.maxPlayers = MIN_PLAYERS;
        return this.afterChange(now);
      }

      case "addBot": {
        if (d.status === "playing" || d.settings.bricks.sprint) return;
        if (d.seats.length >= d.settings.maxPlayers) return error("La table est complète.");
        const used = new Set(d.seats.map((s) => s.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Maçon ${d.botCounter + 1}`;
        d.seats.push({
          id: `bot-${++d.botCounter}`,
          kind: "bot",
          userId: null,
          name,
          avatar: seededAvatar(`${name}-${d.code}`),
          photo: 0,
          autoplay: false,
          disconnectedAt: null,
          team: emptierTeam(d.seats),
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
        this.startBot(seat.id, 400);
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
    void this.hub.setUserRoom(target, null).catch(() => {});
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

  // -------------------------------------------------------------------------
  // Match et manches
  // -------------------------------------------------------------------------

  private player(id: string): BrickPlayer | undefined {
    return this.data?.match?.players.find((p) => p.id === id);
  }

  private seatById(id: string): Seat | undefined {
    return this.data!.seats.find((s) => s.id === id);
  }

  private async startGame(now: number, ws?: WebSocket) {
    const d = this.data!;
    const s = d.settings.bricks;
    d.seats = d.seats.filter((x) => x.kind === "bot" || this.isConnected(x.userId));
    this.ensureHost();
    const fail = (message: string) => {
      if (ws) this.send(ws, { t: "error", message });
      return this.afterChange(now);
    };
    if (s.sprint && d.seats.length !== 1) return fail("Le solo 40 lignes se joue seul.");
    if (!s.sprint && d.seats.length < MIN_PLAYERS) return fail("Il faut au moins deux joueurs : ajoute un bot !");
    let order = d.seats;
    if (!s.sprint && s.teams && d.seats.length === 4) {
      const a = d.seats.filter((x) => x.team === 0);
      const b = d.seats.filter((x) => x.team === 1);
      if (a.length !== 2) return fail(`Il faut deux joueurs dans chaque équipe : c'est ${a.length} contre ${b.length} pour l'instant.`);
      order = [a[0]!, b[0]!, a[1]!, b[1]!];
    }
    for (const seat of d.seats) {
      seat.autoplay = false;
      seat.disconnectedAt = null;
    }
    const mode = modeOf(s, order.length);
    const holder = { rng: randomSeed() };
    d.match = {
      settings: { ...s },
      mode,
      players: order.map((seat, i) => ({
        id: seat.id,
        team: mode === "teams" ? i % 2 : null,
        board: newBoard(1),
        alive: true,
        koUntil: null,
        place: null,
        kos: 0,
        sent: 0,
        lines: 0,
        pieces: 0,
        roundWins: 0,
        strategy: seat.kind === "bot" && s.botLevel === "expert" ? "danger" : "random",
        target: null,
        attackers: [],
        lastGarbage: null,
        lastPlacedAt: now,
        sprintTime: null,
        stats: emptyStats(),
        holes: Math.floor(random(holder) * 2 ** 32),
      })),
      round: { index: 0, phase: "countdown", seed: 0, startAt: now, endAt: null, tideAt: null, winners: null, nextAt: null },
      matchOver: false,
      ranking: null,
      ranks: null,
      garbageSeq: 0,
      rng: holder.rng,
    };
    d.status = "playing";
    d.startedAt = now;
    d.recorded = false;
    d.results = null;
    d.rematch = [];
    d.timers = d.timers.filter((t) => t.kind === "cleanup" || t.kind === "seatCleanup");
    this.systemChat(mode === "sprint" ? "Quarante lignes, le plus vite possible : à vos marques !" : "Que la meilleure pile gagne !");
    this.startRound(now);
    await this.afterChange(now);
    for (const p of d.match.players) this.sendSnapshot(p.id, true);
  }

  private startRound(now: number) {
    const d = this.data!;
    const m = d.match!;
    const seed = Math.floor(random(m) * 2 ** 32);
    const startAt = now + COUNTDOWN_MS;
    m.round = {
      index: m.round.index + 1,
      phase: "countdown",
      seed,
      startAt,
      endAt: m.mode !== "sprint" && m.settings.win === "ko" ? startAt + m.settings.minutes * 60_000 : null,
      tideAt: m.mode !== "sprint" && m.settings.win === "survival" ? startAt + TIDE_AFTER_MS : null,
      winners: null,
      nextAt: null,
    };
    for (const p of m.players) {
      p.board = newBoard(seed);
      p.alive = true;
      p.koUntil = null;
      p.place = null;
      p.kos = 0;
      p.sent = 0;
      p.lines = 0;
      p.pieces = 0;
      p.attackers = [];
      p.lastGarbage = null;
      p.lastPlacedAt = startAt;
      p.sprintTime = null;
      if (p.strategy === "manual") p.target = null;
    }
    d.timers = d.timers.filter((t) => !["start", "roundEnd", "nextRound", "tide", "tick"].includes(t.kind));
    this.addTimer({ at: startAt, kind: "start", round: m.round.index });
    if (m.round.endAt) this.addTimer({ at: m.round.endAt, kind: "roundEnd", round: m.round.index });
    if (m.round.tideAt) this.addTimer({ at: m.round.tideAt, kind: "tide", round: m.round.index });
    this.addTimer({ at: now + TICK_MS, kind: "tick" });
    for (const p of m.players) {
      const seat = this.seatById(p.id);
      if (seat && (seat.kind === "bot" || seat.autoplay)) this.startBot(p.id, COUNTDOWN_MS + 300 + random(m) * 700);
    }
  }

  /** Le compte à rebours est fini (une pose peut arriver un rien avant l'alarme : on bascule alors tout de suite) */
  private ensurePlaying(now: number) {
    const m = this.data?.match;
    if (m && m.round.phase === "countdown" && now >= m.round.startAt - 250) m.round.phase = "playing";
  }

  /** Une pose envoyée par un joueur ; renvoie vrai si elle a changé toute la table (K.O., fin de manche). */
  private onPlace(seat: Seat, msg: Extract<BricksClientMessage, { t: "place" }>, now: number): boolean {
    const m = this.data!.match;
    if (!m) return false;
    this.ensurePlaying(now);
    const p = this.player(seat.id);
    if (!p || m.round.phase !== "playing" || !p.alive || seat.autoplay) return false;
    if (p.koUntil && now < p.koUntil) return false;
    if (m.round.endAt && now > m.round.endAt) return false;
    // Pas plus de 25 poses par seconde
    const times = (this.placeTimes.get(seat.id) ?? []).filter((t) => now - t < 1000);
    if (times.length >= 25) return false;
    times.push(now);
    this.placeTimes.set(seat.id, times);
    const placement = sanitizePlacement(msg.p);
    if (!placement || msg.seq !== p.board.seq) {
      this.sendSnapshot(seat.id, false);
      return false;
    }
    const ack = Number.isInteger(msg.ack) ? msg.ack : 0;
    const res = place(p.board, placement, ack, { hold: m.settings.hold, strict: true });
    if (!res.ok) {
      this.sendSnapshot(seat.id, false);
      return false;
    }
    return this.afterPlacement(p, res, now);
  }

  /** Applique les suites d'une pose ; renvoie vrai si toute la table change (K.O., fin de manche). */
  private afterPlacement(p: BrickPlayer, res: PlaceResult, now: number): boolean {
    const m = this.data!.match!;
    const fx: BricksFx[] = [];
    p.lastPlacedAt = now;
    p.pieces += 1;
    p.stats.pieces += 1;
    if (res.lines > 0) {
      p.lines += res.lines;
      p.stats.lines += res.lines;
      if (res.lines === 4) p.stats.tetrises += 1;
      if (res.spin !== "none") p.stats.tspins += 1;
      if (res.perfect) p.stats.allClears += 1;
      p.stats.maxCombo = Math.max(p.stats.maxCombo, res.combo);
      fx.push({
        type: "clear",
        id: p.id,
        lines: res.lines,
        rows: res.rows,
        spin: res.spin,
        combo: res.combo,
        b2b: res.b2b,
        perfect: res.perfect,
        attack: res.attack,
      });
    }
    if (res.garbageIn > 0) {
      p.stats.received += res.garbageIn;
      if (res.garbageFrom) p.lastGarbage = { id: res.garbageFrom, at: now };
      fx.push({ type: "garbage", id: p.id, lines: res.garbageIn });
    }
    if (res.sent > 0 && m.mode !== "sprint") {
      const target = this.attack(p, res.sent, now);
      if (target) fx.push({ type: "attack", from: p.id, to: target.id, lines: res.sent });
    }
    if (m.mode === "sprint" && p.lines >= SPRINT_LINES && p.sprintTime === null) {
      p.sprintTime = now - m.round.startAt;
      fx.push({ type: "sprint", id: p.id, time: p.sprintTime });
    }
    if (res.topOut) this.topOut(p, now, fx);
    this.dirty = true;
    this.broadcastBoard(p, fx);
    this.checkRoundEnd(now);
    return res.topOut || m.round.phase === "over" || p.sprintTime !== null;
  }

  /** Envoie une attaque à la cible choisie par la stratégie du joueur ; renvoie la cible. */
  private attack(p: BrickPlayer, lines: number, now: number): BrickPlayer | null {
    const m = this.data!.match!;
    const enemies = m.players.filter(
      (o) => o.id !== p.id && o.alive && !(p.team !== null && o.team === p.team) && !(o.koUntil && o.koUntil > now),
    );
    if (enemies.length === 0) return null;
    const pickRandom = () => enemies[Math.floor(random(m) * enemies.length)]!;
    let target: BrickPlayer;
    switch (p.strategy) {
      case "manual":
        target = enemies.find((o) => o.id === p.target) ?? pickRandom();
        break;
      case "attackers": {
        const recent = p.attackers.filter((a) => now - a.at < 15_000).reverse();
        target = recent.map((a) => enemies.find((o) => o.id === a.id)).find(Boolean) ?? pickRandom();
        break;
      }
      case "danger": {
        const top = Math.max(...enemies.map((o) => stackHeight(o.board.grid)));
        const worst = enemies.filter((o) => stackHeight(o.board.grid) === top);
        target = worst[Math.floor(random(m) * worst.length)]!;
        break;
      }
      default:
        target = pickRandom();
    }
    if (p.strategy !== "manual") p.target = target.id;
    p.sent += lines;
    p.stats.sent += lines;
    target.attackers.push({ id: p.id, at: now });
    if (target.attackers.length > 12) target.attackers.splice(0, target.attackers.length - 12);
    this.addGarbage(target, lines, p.id);
    return target;
  }

  private addGarbage(target: BrickPlayer, lines: number, from: string | null) {
    const m = this.data!.match!;
    const holder = { rng: target.holes };
    const holes = garbageHoles(holder, lines, m.settings.messy);
    target.holes = holder.rng;
    const chunk = { id: ++m.garbageSeq, lines, ...holes, from };
    target.board.pending.push(chunk);
    const seat = this.seatById(target.id);
    if (seat?.userId) for (const ws of this.ctx.getWebSockets(seat.userId)) this.send(ws, { t: "garbage", chunk });
  }

  private topOut(p: BrickPlayer, now: number, fx: BricksFx[]) {
    const m = this.data!.match!;
    p.stats.deaths += 1;
    if (m.mode === "sprint") {
      p.alive = false;
      return;
    }
    const recent = p.lastGarbage && now - p.lastGarbage.at < 20_000 ? p.lastGarbage.id : null;
    const enemies = m.players.filter((o) => o.id !== p.id && !(p.team !== null && o.team === p.team));
    const by = recent ?? (enemies.length === 1 ? enemies[0]!.id : null);
    const killer = by ? this.player(by) : undefined;
    if (killer && killer.id !== p.id) {
      killer.kos += 1;
      killer.stats.kos += 1;
    }
    if (m.settings.win === "ko") {
      // Au chrono, le plateau repart à zéro après une courte pause
      p.board = { ...p.board, grid: emptyGrid(), pending: [], combo: -1, b2b: false, seq: p.board.seq + 1 };
      p.koUntil = now + KO_PAUSE_MS;
      p.lastGarbage = null;
      fx.push({ type: "ko", id: p.id, by: killer?.id ?? null });
      this.sendSnapshot(p.id, true);
      const seat = this.seatById(p.id);
      if (seat && (seat.kind === "bot" || seat.autoplay)) this.startBot(p.id, KO_PAUSE_MS + 300);
      return;
    }
    p.alive = false;
    const sideOf = (o: BrickPlayer) => (o.team !== null ? `t${o.team}` : o.id);
    const aliveSides = new Set(m.players.filter((o) => o.alive).map(sideOf));
    const sideAlive = m.players.some((o) => o.alive && sideOf(o) === sideOf(p));
    if (!sideAlive) {
      const placeNo = aliveSides.size + 1;
      for (const o of m.players) {
        if (sideOf(o) === sideOf(p)) {
          o.place = placeNo;
          fx.push({ type: "eliminated", id: o.id, place: placeNo });
        }
      }
    }
    fx.push({ type: "ko", id: p.id, by: killer?.id ?? null });
    this.stopBot(p.id);
  }

  private checkRoundEnd(now: number) {
    const m = this.data!.match!;
    if (m.round.phase !== "playing") return;
    if (m.mode === "sprint") {
      const p = m.players[0]!;
      if (p.sprintTime !== null || !p.alive) this.endRound(now, p.sprintTime !== null ? [p.id] : []);
      return;
    }
    if (m.settings.win === "survival") {
      const sideOf = (o: BrickPlayer) => (o.team !== null ? `t${o.team}` : o.id);
      const alive = m.players.filter((o) => o.alive);
      if (new Set(alive.map(sideOf)).size <= 1)
        this.endRound(
          now,
          alive.map((o) => o.id),
        );
    }
  }

  private endRound(now: number, winnersIn?: string[]) {
    const d = this.data!;
    const m = d.match!;
    if (m.round.phase === "over") return;
    m.round.phase = "over";
    for (const p of m.players) this.stopBot(p.id);
    const sideOf = (o: BrickPlayer) => (o.team !== null ? `t${o.team}` : o.id);
    let winners = winnersIn;
    if (!winners) {
      // Au chrono : le plus de K.O., puis le plus de lignes envoyées, puis de lignes faites
      const sides = new Map<string, { kos: number; sent: number; lines: number; ids: string[] }>();
      for (const p of m.players) {
        const s = sides.get(sideOf(p)) ?? { kos: 0, sent: 0, lines: 0, ids: [] };
        s.kos += p.kos;
        s.sent += p.sent;
        s.lines += p.lines;
        s.ids.push(p.id);
        sides.set(sideOf(p), s);
      }
      const sorted = [...sides.values()].sort((a, b) => b.kos - a.kos || b.sent - a.sent || b.lines - a.lines);
      const best = sorted[0]!;
      winners = sorted.filter((s) => s.kos === best.kos && s.sent === best.sent && s.lines === best.lines).flatMap((s) => s.ids);
    }
    m.round.winners = winners;
    for (const id of winners) {
      const p = this.player(id);
      if (p) {
        p.roundWins += 1;
        p.stats.roundsWon += 1;
      }
    }
    d.timers = d.timers.filter((t) => !["start", "roundEnd", "tide"].includes(t.kind));
    const names = winners.map((id) => this.seatById(id)?.name ?? "?");
    const best = Math.max(...m.players.map((p) => p.roundWins));
    if (m.mode === "sprint" || best >= m.settings.series) {
      this.finishMatch(now);
      return;
    }
    if (names.length > 0) this.systemChat(`Manche ${m.round.index} pour ${names.join(" et ")}.`);
    m.round.nextAt = now + INTERMISSION_MS;
    this.addTimer({ at: m.round.nextAt, kind: "nextRound", round: m.round.index });
  }

  private finishMatch(now: number) {
    const d = this.data!;
    const m = d.match!;
    m.matchOver = true;
    d.timers = d.timers.filter((t) => !["start", "roundEnd", "nextRound", "tide", "tick"].includes(t.kind));
    const sideOf = (o: BrickPlayer) => (o.team !== null ? `t${o.team}` : o.id);
    const sides = new Map<string, BrickPlayer[]>();
    for (const p of m.players) sides.set(sideOf(p), [...(sides.get(sideOf(p)) ?? []), p]);
    const sum = (ps: BrickPlayer[], f: (p: BrickPlayer) => number) => ps.reduce((n, p) => n + f(p), 0);
    // Dernier debout : la place de la dernière manche départage ceux qui ont autant de manches
    const placeOf = (ps: BrickPlayer[]) => Math.min(...ps.map((p) => p.place ?? 0));
    const ordered = [...sides.values()].sort(
      (a, b) =>
        sum(b, (p) => p.roundWins) - sum(a, (p) => p.roundWins) ||
        (m.settings.win === "survival" ? placeOf(a) - placeOf(b) : 0) ||
        sum(b, (p) => p.stats.kos) - sum(a, (p) => p.stats.kos) ||
        sum(b, (p) => p.stats.sent) - sum(a, (p) => p.stats.sent) ||
        sum(b, (p) => p.stats.lines) - sum(a, (p) => p.stats.lines),
    );
    m.ranking = ordered.flat().map((p) => p.id);
    m.ranks = {};
    if (m.mode === "teams") {
      ordered[0]!.forEach((p) => (m.ranks![p.id] = 1));
      ordered
        .slice(1)
        .flat()
        .forEach((p) => (m.ranks![p.id] = 3));
    } else {
      m.ranking.forEach((id, i) => (m.ranks![id] = i + 1));
    }
    d.status = "finished";
    if (m.mode === "sprint") {
      const p = m.players[0]!;
      this.systemChat(p.sprintTime !== null ? `40 lignes en ${formatTime(p.sprintTime)} !` : "La pile a débordé avant les 40 lignes.");
    } else {
      const winners = m.ranking.filter((id) => m.ranks![id] === 1).map((id) => this.seatById(id)?.name ?? "?");
      this.systemChat(`${winners.join(" et ")} ${winners.length > 1 ? "remportent" : "remporte"} la partie !`);
    }
    void now;
  }

  // -------------------------------------------------------------------------
  // Bots (et relais d'un joueur absent)
  // -------------------------------------------------------------------------

  private startBot(id: string, delay: number) {
    this.stopBot(id);
    this.bots.set(
      id,
      setTimeout(() => void this.botStep(id), Math.max(50, delay)),
    );
  }

  private stopBot(id: string) {
    const t = this.bots.get(id);
    if (t) clearTimeout(t);
    this.bots.delete(id);
  }

  private botLevel(seat: Seat): BotLevel {
    return seat.kind === "bot" ? this.data!.match!.settings.botLevel : "confirme";
  }

  private async botStep(id: string) {
    this.bots.delete(id);
    const d = this.data;
    const m = d?.match;
    if (!d || !m || d.status !== "playing") return;
    const now = Date.now();
    this.ensurePlaying(now);
    const p = this.player(id);
    const seat = this.seatById(id);
    if (!p || !seat || !p.alive || !(seat.kind === "bot" || seat.autoplay)) return;
    if (m.round.phase === "countdown") return this.startBot(id, m.round.startAt - now + 200);
    if (m.round.phase !== "playing") return;
    if (p.koUntil && now < p.koUntil) return this.startBot(id, p.koUntil - now + 200);
    const level = this.botLevel(seat);
    const placement = botPlacement(p.board, level, m.settings.hold, m);
    const res = place(p.board, placement, Number.MAX_SAFE_INTEGER, { hold: m.settings.hold, strict: false });
    let structural: boolean;
    if (res.ok) structural = this.afterPlacement(p, res, now);
    else {
      // Plus aucune pose possible : la pile a débordé
      const fx: BricksFx[] = [];
      this.topOut(p, now, fx);
      this.dirty = true;
      this.broadcastBoard(p, fx);
      this.checkRoundEnd(now);
      structural = true;
    }
    if (structural) await this.afterChange(Date.now());
    if (this.data?.match?.round.phase === "over") return;
    if (p.alive && !this.bots.has(id)) {
      const pace = BOT_PACE[level];
      // L'apprenti s'arrête parfois pour réfléchir
      const pause = level === "apprenti" && random(m) < 0.12 ? 1400 : 0;
      this.startBot(id, pace * (0.75 + random(m) * 0.5) + pause);
    }
  }

  // -------------------------------------------------------------------------
  // Boucle : après chaque changement, on programme la suite
  // -------------------------------------------------------------------------

  private async afterChange(now: number, closing?: WebSocket) {
    const d = this.data;
    if (!d) return;
    await this.persist();
    this.broadcast(closing);
    await this.armAlarm();
    await this.syncHub();
    void now;
    await this.recordIfNeeded();
  }

  private async recordIfNeeded() {
    const d = this.data;
    if (!d || d.status !== "finished" || d.recorded || !d.match?.matchOver) return;
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
    let changed = false;
    for (const t of due) {
      if (!this.data) return;
      if (await this.runTimer(t, now)) changed = true;
    }
    if (!this.data) return;
    if (changed) await this.afterChange(now);
    else {
      await this.persist();
      await this.armAlarm();
    }
  }

  private async runTimer(t: Timer, now: number): Promise<boolean> {
    const d = this.data!;
    const m = d.match;
    const seat = t.seatId ? this.seatById(t.seatId) : undefined;
    const current = m && d.status === "playing" && t.round === m.round.index;

    switch (t.kind) {
      case "start":
        if (!current || m.round.phase !== "countdown") return false;
        m.round.phase = "playing";
        return true;
      case "roundEnd":
        if (!current || m.round.phase === "over") return false;
        this.endRound(now);
        return true;
      case "nextRound":
        if (!current || m.matchOver) return false;
        this.startRound(now);
        await this.afterChange(now);
        for (const p of m.players) this.sendSnapshot(p.id, true);
        return false;
      case "tide": {
        if (!current || m.round.phase !== "playing") return false;
        for (const p of m.players) if (p.alive) this.addGarbage(p, 1, null);
        this.addTimer({ at: now + TIDE_EVERY_MS, kind: "tide", round: m.round.index });
        for (const p of m.players) if (p.alive) this.broadcastBoard(p, []);
        return false;
      }
      case "tick": {
        // Toutes les quelques secondes en pleine manche : bots relancés, absents relayés, sauvegarde
        if (!m || d.status !== "playing") return false;
        this.addTimer({ at: now + TICK_MS, kind: "tick" });
        this.ensurePlaying(now);
        let changed = false;
        if (m.round.phase === "playing") {
          for (const p of m.players) {
            const s = this.seatById(p.id);
            if (!s || !p.alive) continue;
            if (s.kind === "human" && !s.autoplay && !(p.koUntil && p.koUntil > now) && now - p.lastPlacedAt > AFK_MS) {
              s.autoplay = "afk";
              this.systemChat(`${s.name} ne joue plus : un bot prend le relais.`);
              changed = true;
            }
            if ((s.kind === "bot" || s.autoplay) && !this.bots.has(p.id)) this.startBot(p.id, 200);
          }
        }
        if (this.dirty) {
          this.dirty = false;
          await this.persist();
        }
        return changed;
      }
      case "away": {
        if (!seat || seat.disconnectedAt === null || d.status !== "playing" || seat.autoplay) return false;
        seat.autoplay = "away";
        this.systemChat(`${seat.name} s'est déconnecté : un bot joue à sa place en attendant son retour.`);
        this.startBot(seat.id, 300);
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
      case "emote":
        if (seat && t.emote) this.broadcastRaw({ t: "emote", seatId: seat.id, userId: seat.id, emote: t.emote });
        return false;
      case "cleanup":
        if (this.connectedUsers().size > 0) return false;
        await this.destroy();
        return false;
    }
  }

  private async destroy() {
    const d = this.data!;
    for (const id of [...this.bots.keys()]) this.stopBot(id);
    for (const s of d.seats) if (s.userId) void this.hub.setUserRoom(s.userId, null).catch(() => {});
    await this.hub.removeRoom(d.code).catch(() => {});
    this.data = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private async recordResults(now: number) {
    const d = this.data!;
    const m = d.match!;
    try {
      if (m.mode === "sprint") {
        const p = m.players[0]!;
        const seat = this.seatById(p.id);
        if (!seat?.userId) return;
        const { unlocked } = await recordSprint(this.env.DB, seat.userId, p.sprintTime, p.stats);
        const ids = unlocked[seat.userId];
        if (ids?.length) this.broadcastRaw({ t: "achievements", unlocks: [{ userId: seat.userId, ids }] });
        return;
      }
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "bricks",
        mode: m.mode,
        roomCode: d.code,
        settings: m.settings,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        rounds: m.round.index,
        players: m.players.map((p, i) => {
          const seat = this.seatById(p.id);
          return {
            seat: i,
            userId: seat?.kind === "human" ? seat.userId : null,
            name: seat?.name ?? "?",
            isBot: seat?.kind !== "human",
            rank: m.ranks?.[p.id] ?? m.players.length,
            score: p.stats.sent,
            eliminated: false,
            team: p.team,
            stats: p.stats,
          };
        }),
      });
      const unlocks = Object.entries(unlocked).map(([userId, ids]) => ({ userId, ids }));
      if (unlocks.length > 0) this.broadcastRaw({ t: "achievements", unlocks });
      if (this.data === d && Object.keys(elo).length > 0) {
        d.results = elo;
        await this.persist();
        this.broadcast();
      }
    } catch (err) {
      console.error("Enregistrement de la partie de Briques impossible", err);
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

  private playerView(p: BrickPlayer): BricksPlayerView {
    const m = this.data!.match!;
    return {
      id: p.id,
      team: p.team,
      grid: gridToString(p.board.grid),
      current: p.board.current,
      hold: p.board.hold,
      next: p.board.bag.queue.slice(0, m.settings.previews),
      pending: p.board.pending.reduce((n, g) => n + g.lines, 0),
      combo: p.board.combo,
      b2b: p.board.b2b,
      alive: p.alive,
      koUntil: p.koUntil,
      place: p.place,
      kos: p.kos,
      sent: p.sent,
      lines: p.lines,
      pieces: p.pieces,
      roundWins: p.roundWins,
      strategy: p.strategy,
      target: p.target,
      sprintTime: p.sprintTime,
      seq: p.board.seq,
    };
  }

  private gameView(): BricksView | null {
    const m = this.data!.match;
    if (!m) return null;
    return {
      settings: m.settings,
      mode: m.mode,
      players: m.players.map((p) => this.playerView(p)),
      round: {
        index: m.round.index,
        phase: m.round.phase,
        startAt: m.round.startAt,
        endAt: m.round.endAt,
        tideAt: m.round.tideAt,
        winners: m.round.winners,
        nextAt: m.round.nextAt,
      },
      matchOver: m.matchOver,
      ranking: m.ranking,
      ranks: m.ranks,
      stats: Object.fromEntries(m.players.map((p) => [p.id, p.stats])),
    };
  }

  private viewFor(userId: string, connected: Map<string, PublicUser>, game: BricksView | null): BricksRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    return {
      code: d.code,
      game: "bricks",
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
      bricks: game,
      serverNow: Date.now(),
      rematch: d.rematch,
      results: d.results ?? null,
      quick: d.quick,
    };
  }

  private broadcast(except?: WebSocket) {
    const connected = this.connectedUsers(except);
    const game = this.gameView();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: "room", room: this.viewFor(att.userId, connected, game) });
    }
  }

  /** Après une pose : le plateau de ce joueur seulement, pour tout le monde. */
  private broadcastBoard(p: BrickPlayer, fx: BricksFx[]) {
    this.broadcastRaw({ t: "board", player: this.playerView(p), fx });
  }

  private sendSnapshot(id: string, force: boolean) {
    const p = this.player(id);
    const seat = this.seatById(id);
    const m = this.data?.match;
    if (!p || !seat?.userId || !m) return;
    const now = Date.now();
    if (!force && now - (this.lastResync.get(id) ?? 0) < 400) return;
    this.lastResync.set(id, now);
    const snapshot = { id, round: m.round.index, board: structuredClone(p.board), koUntil: p.koUntil };
    for (const ws of this.ctx.getWebSockets(seat.userId)) this.send(ws, { t: "self", snapshot });
  }

  private broadcastRaw(msg: BricksServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: BricksServerMessage) {
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
    return { code: this.data!.code, game: "bricks", status: this.data!.status };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    const variant = d.match?.mode ?? modeOf(d.settings.bricks, d.settings.maxPlayers);
    return {
      code: d.code,
      game: "bricks",
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
      void this.hub.setUserRoom(userId, this.presenceRoom()).catch(() => {});
    }
  }
}

function formatTime(ms: number): string {
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)} min ${(s % 60).toFixed(2).padStart(5, "0")} s` : `${s.toFixed(2)} s`;
}

const int = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : null;

function sanitizeActive(raw: unknown): Active | null {
  const o = (raw ?? null) as Record<string, unknown> | null;
  if (!o || !(PIECES as readonly string[]).includes(String(o.type))) return null;
  const x = int(o.x, -3, COLS + 2);
  const y = int(o.y, -3, 30);
  const rot = int(o.rot, 0, 3);
  if (x === null || y === null || rot === null) return null;
  return { type: o.type as Active["type"], x, y, rot: rot as Rot };
}

function sanitizePlacement(raw: unknown): Placement | null {
  const a = sanitizeActive(raw);
  const o = (raw ?? {}) as Record<string, unknown>;
  const kick = int(o.kick, 0, 5);
  if (!a || kick === null) return null;
  return { ...a, hold: o.hold === true, lastRotation: o.lastRotation === true, kick };
}

function mergeSettings(current: BricksSettings, patch: Partial<BricksSettings>): BricksSettings {
  const next = { ...current };
  for (const key of ["sprint", "teams", "hold", "speedUp", "messy"] as const) {
    if (typeof patch[key] === "boolean") next[key] = patch[key];
  }
  if (patch.win === "ko" || patch.win === "survival") next.win = patch.win;
  if (patch.minutes === 2 || patch.minutes === 3) next.minutes = patch.minutes;
  if (patch.series === 1 || patch.series === 2 || patch.series === 3) next.series = patch.series;
  if (patch.previews === 1 || patch.previews === 3 || patch.previews === 5) next.previews = patch.previews;
  if (patch.botLevel === "apprenti" || patch.botLevel === "confirme" || patch.botLevel === "expert") next.botLevel = patch.botLevel;
  return next;
}
