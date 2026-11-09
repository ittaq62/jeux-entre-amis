import { DurableObject } from "cloudflare:workers";
import type { AvatarConfig } from "../shared/avatar.ts";
import { addHuman, createMatch, dropHuman, pushAction, setInput, stepMatch } from "../shared/games/crampons/match.ts";
import type { HumanActionKind, Match, MatchEvent, Team } from "../shared/games/crampons/model.ts";
import { DT } from "../shared/games/crampons/pitch.ts";
import { cramponsView, DEFAULT_CONFIG, encodeTick, mergeConfig, stateKey, teamsFor } from "../shared/games/crampons/view.ts";
import {
  CHAT_MAX,
  CRAMPONS_MAX_PLAYERS,
  REACTIONS,
  TAUNTS,
  type ChatMessage,
  type CramponsClientMessage,
  type CramponsRoomSettings,
  type CramponsRoomView,
  type CramponsServerMessage,
  type PresenceRoom,
  type PublicUser,
  type RoomStatus,
  type RoomSummary,
} from "../shared/protocol.ts";
import { randomSeed } from "../shared/rng.ts";
import type { RoomInit } from "./room.ts";
import { recordGame, type EloResults } from "./users.ts";
import { decodeHeaderJson } from "./util.ts";

const AWAY_AFTER_MS = 8000;
const SEAT_RELEASE_MS = 25_000;
const CHAT_KEEP = 80;
/** Le serveur envoie les positions de tout le monde une trentaine de fois par seconde */
const TICK_MS = 34;
const SAVE_EVERY_MS = 15_000;

const ACTIONS: readonly string[] = [
  "pass",
  "through",
  "lob",
  "shot",
  "finesse",
  "chip",
  "cross",
  "clear",
  "tackle",
  "slide",
  "switch",
  "rush",
  "skill",
];

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
  team: Team;
}

type TimerKind = "away" | "seatCleanup" | "cleanup";

interface Timer {
  at: number;
  kind: TimerKind;
  seatId?: string;
}

interface CramponsData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: CramponsRoomSettings;
  status: RoomStatus;
  seats: Seat[];
  match: Match | null;
  startedAt: number | null;
  rematch: string[];
  chat: ChatMessage[];
  chatSeq: number;
  timers: Timer[];
  kicked: string[];
  recorded: boolean;
  results?: EloResults | null;
}

interface Attachment {
  userId: string;
  user: PublicUser;
}

/** Une table de Crampons : le salon commun, puis un match que le serveur arbitre de bout en bout. */
export class CramponsRoom extends DurableObject<Env> {
  private data: CramponsData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private acc = 0;
  private lastKey = "";
  private lastSave = 0;
  /** La dernière commande de chaque joueur, renvoyée telle quelle pour qu'il mesure son temps de trajet */
  private stamps = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<CramponsData>("room")) ?? null;
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
      settings: { visibility: opts.visibility, maxPlayers: CRAMPONS_MAX_PLAYERS, crampons: { ...DEFAULT_CONFIG } },
      status: "lobby",
      seats: [],
      match: null,
      startedAt: null,
      rematch: [],
      chat: [],
      chatSeq: 0,
      timers: [{ at: now + 10 * 60_000, kind: "cleanup" }],
      kicked: [],
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
        if (d.status === "playing" && d.match) {
          this.systemChat(`${seat.name} est de retour.`);
          addHuman(d.match, seat.id, seat.team);
        }
      }
      if (d.status !== "playing") {
        seat.name = user.pseudo;
        seat.avatar = user.avatar;
        seat.photo = user.photo;
      }
    } else if (d.status !== "playing") {
      seat = this.seatHuman(user) ?? undefined;
      if (seat) this.systemChat(`${user.pseudo} entre sur le terrain.`);
    }
    if (!seat) this.systemChat(`${user.pseudo} s'installe en tribune.`);
    this.ensureHost();
    this.send(ws, { t: "chat", messages: d.chat, reset: true });
    await this.afterChange([], now);
    void this.setPresence(user.id, this.presenceRoom()).catch(() => {});
  }

  private seatHuman(user: PublicUser): Seat | null {
    const d = this.data!;
    if (d.seats.length >= d.settings.maxPlayers) return null;
    // Il rejoint l'équipe qui a le moins de monde
    const inTeam = (t: Team) => d.seats.filter((s) => s.team === t).length;
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
      team: inTeam(0) <= inTeam(1) ? 0 : 1,
    };
    d.seats.push(seat);
    return seat;
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
    const next = d.seats.find((s) => this.isConnected(s.userId)) ?? d.seats[0];
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
    let msg: CramponsClientMessage;
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
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

    switch (msg.t) {
      case "in": {
        // Le stick : jamais enregistré, seulement appliqué
        if (!seat || !d.match || d.status !== "playing") return;
        setInput(d.match, seat.id, num(msg.x), num(msg.z), msg.s === true, msg.p === true);
        if (typeof msg.c === "number" && Number.isFinite(msg.c)) this.stamps.set(seat.id, msg.c);
        return;
      }

      case "act": {
        if (!seat || !d.match || d.status !== "playing" || !ACTIONS.includes(msg.k) || !this.allowMessage(`act:${userId}`, 40)) return;
        pushAction(d.match, seat.id, msg.k as HumanActionKind, Math.max(0, num(msg.p)), num(msg.x), num(msg.z));
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

      case "team": {
        if (!seat || d.status === "playing" || (msg.team !== 0 && msg.team !== 1)) return;
        seat.team = msg.team;
        return this.afterChange([], now);
      }

      case "sit": {
        if (seat || d.status === "playing") return;
        if (!this.seatHuman(att.user)) return error("Le terrain est complet.");
        this.systemChat(`${att.user.pseudo} entre sur le terrain.`);
        return this.afterChange([], now);
      }

      case "leave": {
        if (seat) {
          if (d.status === "playing") {
            seat.autoplay = "away";
            seat.disconnectedAt = now;
            if (d.match) dropHuman(d.match, seat.id);
            this.systemChat(`${seat.name} a quitté le match, l'ordinateur prend sa place.`);
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
        const humans = d.seats.filter((s) => this.isConnected(s.userId));
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
        if (d.status === "playing") return error("On ne change pas les règles en plein match.");
        d.settings.crampons = mergeConfig(d.settings.crampons, msg.settings ?? {});
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= 1 && max <= CRAMPONS_MAX_PLAYERS) d.settings.maxPlayers = Math.max(max, d.seats.length);
        }
        return this.afterChange([], now);
      }

      case "removeSeat": {
        if (d.status === "playing") return;
        const target = d.seats.find((s) => s.id === msg.seatId);
        if (!target || target.userId === userId) return;
        d.seats = d.seats.filter((s) => s !== target);
        this.systemChat(`${target.name} a été retiré de la table.`);
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
        if (d.match) dropHuman(d.match, seat.id);
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
  // Le match
  // -------------------------------------------------------------------------

  private async startGame(now: number, ws?: WebSocket) {
    const d = this.data!;
    d.seats = d.seats.filter((x) => this.isConnected(x.userId));
    this.ensureHost();
    if (d.seats.length === 0) {
      if (ws) this.send(ws, { t: "error", message: "Il faut au moins un joueur." });
      return this.afterChange([], now);
    }
    for (const seat of d.seats) {
      seat.autoplay = false;
      seat.disconnectedAt = null;
    }
    const cfg = d.settings.crampons;
    d.match = createMatch(
      cfg,
      teamsFor(cfg),
      d.seats.map((s) => ({ id: s.id, team: s.team })),
      randomSeed(),
    );
    d.status = "playing";
    d.startedAt = now;
    d.recorded = false;
    d.results = null;
    d.rematch = [];
    d.timers = d.timers.filter((t) => t.kind === "cleanup" || t.kind === "seatCleanup");
    this.lastKey = stateKey(d.match);
    this.systemChat("Coup d'envoi !");
    this.startLoop();
    return this.afterChange([], now);
  }

  private startLoop() {
    if (this.loop) return;
    this.lastTick = Date.now();
    this.acc = 0;
    this.loop = setInterval(() => void this.tick(), TICK_MS);
  }

  private stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  /** Un tic : le match avance d'autant de pas que le temps écoulé, et tout le monde reçoit les positions */
  private async tick() {
    const d = this.data;
    const m = d?.match;
    if (!d || !m || d.status !== "playing") {
      this.stopLoop();
      return;
    }
    const now = Date.now();
    this.acc += Math.min(now - this.lastTick, 250);
    this.lastTick = now;
    const events: MatchEvent[] = [];
    const step = DT * 1000;
    let steps = 0;
    while (this.acc >= step) {
      this.acc -= step;
      steps++;
      events.push(...stepMatch(m));
      if (m.phase === "over") break;
    }
    // Rien n'a avancé depuis le dernier envoi : inutile de renvoyer la même chose
    if (steps === 0) return;
    this.broadcastRaw({ t: "tick", now, ...encodeTick(m, events, this.stamps) });
    const key = stateKey(m);
    if (key !== this.lastKey) {
      this.lastKey = key;
      if (m.phase === "over") {
        await this.finishGame(now);
        return;
      }
      this.saveLive();
      this.lastSave = now;
      this.broadcast([]);
    } else if (now - this.lastSave > SAVE_EVERY_MS) {
      this.lastSave = now;
      this.saveLive();
    }
  }

  private async finishGame(now: number) {
    const d = this.data!;
    d.status = "finished";
    this.stopLoop();
    const m = d.match!;
    const name = (t: Team) => cramponsView(m, d.settings.crampons).teams[t].name;
    this.systemChat(
      `Fin du match : ${m.score[0]} - ${m.score[1]}${m.winner !== null ? `, victoire de ${name(m.winner)}` : ", match nul"}.`,
    );
    await this.afterChange([], now);
  }

  // -------------------------------------------------------------------------
  // Boucle des minuteurs
  // -------------------------------------------------------------------------

  private async afterChange(events: MatchEvent[], now: number, closing?: WebSocket) {
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
    if (!d || d.status !== "finished" || d.recorded || d.match?.phase !== "over") return;
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
      if (await this.runTimer(t)) changed = true;
    }
    if (!this.data) return;
    if (changed) await this.afterChange([], now);
    else {
      await this.persist();
      await this.armAlarm();
    }
  }

  private async runTimer(t: Timer): Promise<boolean> {
    const d = this.data!;
    const seat = t.seatId ? d.seats.find((s) => s.id === t.seatId) : undefined;
    switch (t.kind) {
      case "away": {
        if (!seat || seat.disconnectedAt === null || d.status !== "playing" || seat.autoplay) return false;
        seat.autoplay = "away";
        if (d.match) dropHuman(d.match, seat.id);
        this.systemChat(`${seat.name} s'est déconnecté : l'ordinateur prend sa place en attendant son retour.`);
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
      // Égalité sans vainqueur : tout le monde est deuxième, personne ne compte pour une victoire
      const rankOf = (t: Team) => (m.winner === t ? 1 : 2);
      const goalsOf = (id: string) => m.players.find((p) => p.human === id)?.goals ?? 0;
      const statsOf = (t: Team, id: string | null) => {
        const s = m.stats[t];
        return {
          goals: m.score[t],
          conceded: m.score[t === 0 ? 1 : 0],
          shots: s.shots,
          onTarget: s.onTarget,
          passes: s.passes,
          passesOk: s.passesOk,
          myGoals: id ? goalsOf(id) : 0,
        };
      };
      const players = d.seats
        .filter((s) => s.userId)
        .map((s, i) => ({
          seat: i,
          userId: s.userId,
          name: s.name,
          isBot: false,
          rank: rankOf(s.team),
          score: m.score[s.team],
          eliminated: false,
          team: s.team as number,
          stats: statsOf(s.team, s.id),
        }));
      // L'ordinateur compte comme un adversaire pour une équipe sans humain en face
      for (const t of [0, 1] as const) {
        if (d.seats.some((s) => s.team === t)) continue;
        players.push({
          seat: players.length,
          userId: null,
          name: cramponsView(m, d.settings.crampons).teams[t].name,
          isBot: true,
          rank: rankOf(t),
          score: m.score[t],
          eliminated: false,
          team: t,
          stats: statsOf(t, null),
        });
      }
      const { unlocked, elo } = await recordGame(this.env.DB, {
        game: "crampons",
        mode: `${d.settings.crampons.side}`,
        roomCode: d.code,
        settings: d.settings.crampons,
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
      }
    } catch (err) {
      console.error("Enregistrement du match de Crampons impossible", err);
    }
  }

  // -------------------------------------------------------------------------
  // Diffusion
  // -------------------------------------------------------------------------

  private setPresence(userId: string, room: PresenceRoom | null): Promise<void> {
    return this.hub.setUserRoom(userId, room);
  }

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

  private viewFor(userId: string, connected: Map<string, PublicUser>): CramponsRoomView {
    const d = this.data!;
    const seat = d.seats.find((s) => s.userId === userId);
    const seatedUsers = new Set(d.seats.map((s) => s.userId));
    return {
      code: d.code,
      game: "crampons",
      status: d.status,
      settings: { ...d.settings, crampons: { ...DEFAULT_CONFIG, ...d.settings.crampons } },
      seats: d.seats.map((s) => ({
        id: s.id,
        kind: s.kind,
        userId: s.userId,
        name: s.name,
        avatar: s.avatar,
        photo: s.photo,
        admin: Boolean(s.admin),
        connected: connected.has(s.userId!),
        autoplay: Boolean(s.autoplay),
        ...(s.autoplay ? { autoplayReason: s.autoplay } : {}),
        awayAt:
          d.status === "playing" && !s.autoplay && s.disconnectedAt !== null && !connected.has(s.userId!)
            ? s.disconnectedAt + AWAY_AFTER_MS
            : null,
        isHost: s.userId === d.hostId,
      })),
      spectators: [...connected.values()].filter((u) => !seatedUsers.has(u.id)).map((u) => ({ userId: u.id, name: u.pseudo })),
      hostId: d.hostId,
      you: { userId, seatId: seat?.id ?? null, isHost: userId === d.hostId, isAdmin: Boolean(connected.get(userId)?.admin) },
      teams: Object.fromEntries(d.seats.map((s) => [s.id, s.team])),
      crampons: d.match ? cramponsView(d.match, d.settings.crampons) : null,
      serverNow: Date.now(),
      rematch: d.rematch,
      results: d.results ?? null,
      quick: d.quick,
      tour: null,
    };
  }

  private broadcast(events: MatchEvent[], except?: WebSocket) {
    const connected = this.connectedUsers(except);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: "room", room: this.viewFor(att.userId, connected), events });
    }
  }

  private broadcastRaw(msg: CramponsServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: CramponsServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // déjà fermée
    }
  }

  /** Pendant le match : on enregistre sans faire attendre les positions en route vers les joueurs */
  private saveLive() {
    if (this.data) void this.ctx.storage.put("room", this.data, { allowUnconfirmed: true });
  }

  private async persist() {
    if (this.data) await this.ctx.storage.put("room", this.data);
  }

  private presenceRoom(): PresenceRoom {
    return { code: this.data!.code, game: "crampons", status: this.data!.status };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = d.seats.find((s) => s.userId === d.hostId);
    return {
      code: d.code,
      game: "crampons",
      variant: `${d.settings.crampons.side}`,
      status: d.status,
      visibility: d.settings.visibility,
      hostName: host?.name ?? "",
      humans: d.seats.length,
      bots: 0,
      maxPlayers: d.settings.maxPlayers,
      names: d.seats.map((s) => s.name),
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
