import { DurableObject } from "cloudflare:workers";
import { seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import {
  CHAT_MAX,
  GAME_NAMES,
  REACTIONS,
  TAUNTS,
  type ChatMessage,
  type GameId,
  type PresenceRoom,
  type PublicUser,
  type RoomStatus,
  type RoomSummary,
} from "../shared/protocol.ts";
import { random, randomSeed } from "../shared/rng.ts";
import {
  adoptedVariant,
  baseVariant,
  defaultTourSettings,
  drawGame,
  drawVariant,
  findVariant,
  FIRST_DRAW_MS,
  fitsGame,
  GAME_SEATS,
  INTERMISSION_MS,
  resolveVariant,
  sanitizeEnd,
  teamScores,
  TOUR_BOT_NAMES,
  TOUR_GAMES,
  TOUR_MAX_PLAYERS,
  TOUR_MIN_PLAYERS,
  TOUR_TEAMS,
  tourOver,
  tourPoints,
  tourTitles,
  VOTE_EXTRA_MS,
  voteNeed,
  type TableReport,
  type TourClientMessage,
  type TourGameLine,
  type TourGameResult,
  type TourServerMessage,
  type TourSettings,
  type TourStatus,
  type TourTitle,
  type TourView,
} from "../shared/tour.ts";
import type { RoomInit } from "./room.ts";
import { gameStub } from "./tourLink.ts";
import { recordTour } from "./users.ts";
import { decodeHeaderJson } from "./util.ts";

/** Salon d'attente : un membre déconnecté libère sa place après ce délai */
const RELEASE_MS = 60_000;
/** L'hôte parti, un autre membre prend la main après ce délai */
const HOST_HANDOVER_MS = 20_000;
/** Une table qui ne donne jamais son résultat (panne) ne bloque pas la tournée au-delà */
const STALE_TABLE_MS = 45 * 60_000;
const CHAT_KEEP = 120;

interface Member {
  /** Id du compte, ou « bot-t1 »… pour un bot de la tournée */
  userId: string;
  kind: "human" | "bot";
  name: string;
  avatar: AvatarConfig;
  photo: number;
  admin: boolean;
  role: "player" | "spectator";
  team: 0 | 1 | null;
  points: number;
  wins: number;
  joinedAt: number;
  /** Arrivé pendant un jeu : il entre au suivant */
  waiting: boolean;
  /** A quitté la tournée : ses points restent au classement, il peut revenir */
  left: boolean;
  disconnectedAt: number | null;
}

interface TourGame {
  index: number;
  game: GameId;
  code: string;
  startedAt: number;
  endedAt: number | null;
  players: string[];
  results: TourGameResult[] | null;
  aborted: boolean;
  /** Les règles jouées (id de variante) */
  variant: string;
}

type TimerKind = "launch" | "host" | "release" | "cleanup" | "stale";

interface Timer {
  at: number;
  kind: TimerKind;
  userId?: string;
  code?: string;
}

interface TourData {
  code: string;
  createdAt: number;
  hostId: string;
  quick: boolean;
  settings: TourSettings;
  status: TourStatus;
  members: Member[];
  games: TourGame[];
  current: { index: number; game: GameId; code: string } | null;
  /** Le jeu tiré, l'heure du départ, ses règles (null : vote ouvert) et les voix pour ses règles */
  next: { game: GameId; at: number | null; variant: string | null; votes: Record<string, string> } | null;
  /** Joueurs prêts à lancer, au salon ou à l'entracte */
  ready: string[];
  startedAt: number | null;
  finishAfterCurrent: boolean;
  titles: TourTitle[] | null;
  /** Ce que chacun a fait à chaque jeu, pour les titres de fin */
  lines: Record<string, TourGameLine[]>;
  notice: string | null;
  chat: ChatMessage[];
  chatSeq: number;
  timers: Timer[];
  kicked: string[];
  rng: number;
  recorded: boolean;
  botCounter: number;
}

interface Attachment {
  userId: string;
  user: PublicUser;
}

/** Une tournée : la bande, le programme tiré au hasard, les points, et une table de jeu créée pour chaque jeu. */
export class TourRoom extends DurableObject<Env> {
  private data: TourData | null = null;
  private lastSummary = "";
  private lastPresence = new Map<string, string>();
  private lastMessageAt = new Map<string, number>();
  private launching = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<TourData>("tour")) ?? null;
      // Tournées ouvertes avant les bots et l'option « chaque jeu une fois »
      const d = this.data;
      if (d) {
        for (const m of d.members) m.kind ??= "human";
        d.settings.once ??= false;
        d.settings.botLevel ??= "normal";
        d.botCounter ??= 0;
        // Tournées ouvertes avant les règles au choix et les votes
        d.settings.rules ??= "base";
        d.ready ??= [];
        if (d.next) {
          d.next.variant ??= baseVariant(d.next.game);
          d.next.votes ??= {};
        }
        for (const g of d.games) g.variant ??= baseVariant(g.game);
      }
    });
  }

  private get hub() {
    return this.env.HUB.get(this.env.HUB.idFromName("hub"));
  }

  // -------------------------------------------------------------------------
  // API appelée par le worker et par les tables de jeu
  // -------------------------------------------------------------------------

  async init(opts: RoomInit): Promise<boolean> {
    if (this.data) return false;
    const now = Date.now();
    this.data = {
      code: opts.code,
      createdAt: now,
      hostId: opts.host.id,
      quick: opts.quick,
      settings: defaultTourSettings(opts.visibility),
      status: "lobby",
      members: [],
      games: [],
      current: null,
      next: null,
      ready: [],
      startedAt: null,
      finishAfterCurrent: false,
      titles: null,
      lines: {},
      notice: null,
      chat: [],
      chatSeq: 0,
      timers: [{ at: now + 10 * 60_000, kind: "cleanup" }],
      kicked: [],
      rng: randomSeed(),
      recorded: false,
      botCounter: 0,
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
    await this.close("La tournée a été fermée par l'administrateur du site.");
    return true;
  }

  async adminKick(userId: string): Promise<void> {
    if (!this.data) return;
    await this.kickUser(userId, Date.now());
  }

  /** Une table de la tournée a fini sa partie : les points de chacun, puis l'entracte ou la fin. */
  async tableFinished(report: TableReport): Promise<void> {
    const d = this.data;
    if (!d || !d.current || report.code !== d.current.code) return;
    const now = Date.now();
    const game = d.games.find((g) => g.code === report.code)!;
    const results: TourGameResult[] = [];
    for (const p of report.players) {
      const member = this.member(p.userId);
      if (!member || !game.players.includes(p.userId)) continue;
      const points = tourPoints(p.rank);
      member.points += points;
      if (p.rank === 1) member.wins += 1;
      results.push({ userId: p.userId, name: member.name, rank: p.rank, points });
      (d.lines[p.userId] ??= []).push({ game: report.game, rank: p.rank, players: report.seats, stats: p.stats });
    }
    game.results = results.sort((a, b) => a.rank - b.rank);
    game.endedAt = now;
    d.current = null;
    d.timers = d.timers.filter((t) => t.kind !== "stale");
    const best = d.settings.teams ? Math.max(...teamScores(d.members)) : Math.max(0, ...d.members.map((m) => m.points));
    const played = d.games.filter((g) => !g.aborted && g.results).length;
    if (d.finishAfterCurrent || tourOver(d.settings.end, { played, best, startedAt: d.startedAt ?? now, now })) {
      await this.finishTour(now);
      return;
    }
    // Chaque jeu une seule fois : quand ils sont tous passés, c'est la fin
    if (d.settings.once && this.nextDraw() === null) {
      this.systemChat("Tous les jeux du programme ont été joués !");
      await this.finishTour(now);
      return;
    }
    d.status = "intermission";
    this.drawNext(now, INTERMISSION_MS);
    await this.afterChange();
  }

  /** La table n'a pas pu commencer (moins de deux joueurs arrivés) : on retire un jeu au sort. */
  async tableAborted(code: string): Promise<void> {
    const d = this.data;
    if (!d || !d.current || d.current.code !== code) return;
    const now = Date.now();
    const game = d.games.find((g) => g.code === code);
    if (game) {
      game.aborted = true;
      game.endedAt = now;
    }
    d.current = null;
    d.timers = d.timers.filter((t) => t.kind !== "stale");
    d.status = "intermission";
    // Deux tables de suite où personne n'est venu : on attend l'hôte plutôt que d'en recréer sans fin
    const lastTwo = d.games.slice(-2);
    if (lastTwo.length === 2 && lastTwo.every((g) => g.aborted)) {
      this.systemChat("Personne n'est arrivé à la table : la tournée se met en pause.");
      this.drawNext(now, INTERMISSION_MS);
      if (d.next) {
        d.next.at = null;
        d.timers = d.timers.filter((t) => t.kind !== "launch");
        d.notice = "Personne n'est venu aux deux dernières tables : la tournée est en pause. L'hôte la relance quand tout le monde est là.";
      }
      await this.afterChange();
      return;
    }
    this.systemChat("Pas assez de joueurs arrivés à la table : ce jeu ne compte pas, on retire au sort.");
    this.drawNext(now, INTERMISSION_MS);
    await this.afterChange();
  }

  /** Un message de la table de jeu en cours (un bot prend le relais, le vainqueur…) */
  async tableChat(code: string, text: string): Promise<void> {
    const d = this.data;
    if (!d || !d.games.some((g) => g.code === code)) return;
    this.systemChat(text.slice(0, CHAT_MAX));
    await this.persist();
  }

  override async fetch(request: Request): Promise<Response> {
    const d = this.data;
    if (!d) return new Response("Tournée introuvable", { status: 404 });
    const user = decodeHeaderJson<PublicUser>(request.headers.get("X-User"));
    if (!user || request.headers.get("Upgrade") !== "websocket") return new Response("Requête invalide", { status: 400 });
    if (d.kicked.includes(user.id)) return new Response("Tu as été exclu de cette tournée", { status: 403 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [user.id]);
    server.serializeAttachment({ userId: user.id, user } satisfies Attachment);
    await this.onJoin(user, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // -------------------------------------------------------------------------
  // Arrivées et départs
  // -------------------------------------------------------------------------

  private member(userId: string): Member | undefined {
    return this.data!.members.find((m) => m.userId === userId);
  }

  /** Un bot est toujours là ; un joueur, s'il est connecté */
  private present(m: Member): boolean {
    return m.kind === "bot" || this.isConnected(m.userId);
  }

  /** Joueurs présents qui joueront le prochain jeu, dans l'ordre d'arrivée */
  private activePlayers(): Member[] {
    return this.data!.members.filter((m) => m.role === "player" && !m.left && this.present(m)).sort((a, b) => a.joinedAt - b.joinedAt);
  }

  /** Un nouveau joueur prend la place d'un bot quand la tournée est complète */
  private freeSeatFromBot(): boolean {
    const d = this.data!;
    if (d.status === "finished") return false;
    const bot = d.members.findLast((m) => m.kind === "bot" && m.role === "player" && !m.left);
    if (!bot) return false;
    if (d.status === "lobby") {
      d.members = d.members.filter((m) => m !== bot);
      this.systemChat(`${bot.name}, un bot, cède sa place.`);
    } else {
      // Tournée commencée : il garde ses points au classement, mais ne joue plus (il finit le jeu en cours)
      bot.left = true;
      const atTable = d.status === "playing" && d.games.at(-1)?.players.includes(bot.userId);
      this.systemChat(atTable ? `${bot.name}, un bot, finit ce jeu puis cède sa place.` : `${bot.name}, un bot, cède sa place.`);
    }
    return true;
  }

  /** Ceux qui votent : les vrais joueurs présents, ni bots ni spectateurs */
  private voters(): Member[] {
    return this.data!.members.filter((m) => m.kind === "human" && m.role === "player" && !m.left && this.isConnected(m.userId));
  }

  /** À la moitié des joueurs prêts, la tournée part (au salon) ou le jeu tiré est lancé (à l'entracte) */
  private async checkReady(now: number): Promise<boolean> {
    const d = this.data!;
    if (d.status !== "lobby" && d.status !== "intermission") return false;
    const voters = this.voters().map((m) => m.userId);
    const yes = d.ready.filter((id) => voters.includes(id)).length;
    if (voters.length === 0 || yes < voteNeed(voters.length)) return false;
    if (d.status === "lobby") {
      if (this.startError()) return false;
      this.systemChat("La moitié des joueurs est prête : c'est parti !");
      await this.startTour(now);
      return true;
    }
    if (!d.next || this.launching) return false;
    this.systemChat("La moitié des joueurs est prête : on lance le jeu !");
    await this.launch(now);
    return true;
  }

  /** Les règles du jeu tiré, dès qu'une variante a la moitié des voix */
  private adoptIfMajority() {
    const d = this.data!;
    if (!d.next || d.next.variant !== null) return;
    const v = adoptedVariant(
      d.next.votes,
      this.voters().map((m) => m.userId),
    );
    const variant = v ? findVariant(d.next.game, v) : null;
    if (!variant) return;
    d.next.variant = variant.id;
    this.systemChat(`Règles adoptées : ${variant.name} !`);
  }

  private playerCount(): number {
    return this.data!.members.filter((m) => m.role === "player" && !m.left).length;
  }

  /** L'équipe la moins remplie, les Rouges en cas d'égalité */
  private emptierTeam(): 0 | 1 {
    const players = this.data!.members.filter((m) => m.role === "player" && !m.left);
    const red = players.filter((m) => m.team === 0).length;
    return red <= players.length - red ? 0 : 1;
  }

  private async onJoin(user: PublicUser, ws: WebSocket) {
    const d = this.data!;
    const now = Date.now();
    d.timers = d.timers.filter((t) => t.kind !== "cleanup" && !(t.userId === user.id && (t.kind === "release" || t.kind === "host")));
    let member = this.member(user.id);
    if (member) {
      member.disconnectedAt = null;
      member.admin = Boolean(user.admin);
      if (d.status === "lobby") {
        member.name = user.pseudo;
        member.avatar = user.avatar;
        member.photo = user.photo;
      }
      if (member.left) {
        member.left = false;
        member.waiting = d.status === "playing";
        if (d.status !== "finished") this.systemChat(`${member.name} revient dans la tournée.`);
      }
    } else if (d.status !== "finished") {
      const player = this.playerCount() < d.settings.maxPlayers || this.freeSeatFromBot();
      member = {
        userId: user.id,
        kind: "human",
        name: user.pseudo,
        avatar: user.avatar,
        photo: user.photo,
        admin: Boolean(user.admin),
        role: player ? "player" : "spectator",
        team: null,
        points: 0,
        wins: 0,
        joinedAt: now,
        waiting: d.status === "playing",
        left: false,
        disconnectedAt: null,
      };
      if (player && d.settings.teams) member.team = this.emptierTeam();
      d.members.push(member);
      if (!player) this.systemChat(`${user.pseudo} suit la tournée en spectateur.`);
      else if (d.status === "lobby") this.systemChat(`${user.pseudo} rejoint la tournée.`);
      else this.systemChat(`${user.pseudo} rejoint la tournée : il jouera dès le prochain jeu.`);
    }
    this.ensureHost();
    this.send(ws, { t: "chat", messages: d.chat, reset: true });
    await this.afterChange();
    void this.hub.setUserRoom(user.id, this.presenceRoom()).catch(() => {});
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

  private isConnected(userId: string): boolean {
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
    const member = this.member(att.userId);
    if (member) {
      member.disconnectedAt = now;
      if (d.status === "lobby") this.addTimer({ at: now + RELEASE_MS, kind: "release", userId: member.userId });
      if (member.userId === d.hostId) this.addTimer({ at: now + HOST_HANDOVER_MS, kind: "host", userId: member.userId });
    }
    if (this.connectedUsers(ws).size === 0) {
      const minutes = d.status === "lobby" || d.status === "finished" ? 10 : 30;
      this.addTimer({ at: now + minutes * 60_000, kind: "cleanup" });
    }
    void this.hub.setUserRoom(att.userId, null).catch(() => {});
    // Un votant de moins : la moitié des prêts peut être atteinte
    if (await this.checkReady(now)) return;
    await this.afterChange(ws);
  }

  /** L'hôte n'est plus là : la main passe au premier joueur présent */
  private ensureHost(force = false) {
    const d = this.data!;
    const host = this.member(d.hostId);
    if (!force && host && !host.left) return;
    const connected = this.connectedUsers();
    if (!force && !host && d.members.length === 0 && connected.has(d.hostId)) return;
    const present = d.members.filter((m) => m.kind === "human" && !m.left && m.userId !== d.hostId && this.isConnected(m.userId));
    const next = present.find((m) => m.role === "player") ?? present[0];
    if (next) {
      d.hostId = next.userId;
      this.systemChat(`${next.name} mène maintenant la tournée.`);
    }
  }

  // -------------------------------------------------------------------------
  // Messages des membres
  // -------------------------------------------------------------------------

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const d = this.data;
    if (!d || typeof raw !== "string" || raw.length > 4000) return;
    let msg: TourClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;
    const userId = att.userId;
    const isHost = userId === d.hostId;
    const isAdmin = Boolean(att.user.admin);
    const member = this.member(userId) ?? null;
    const now = Date.now();
    const error = (message: string) => this.send(ws, { t: "error", message });

    switch (msg.t) {
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
        return this.broadcastRaw({ t: "emote", seatId: member ? userId : null, userId, emote: msg.emote });
      }

      case "sit": {
        if (!member || member.role === "player" || d.status === "finished") return;
        if (this.playerCount() >= d.settings.maxPlayers && !this.freeSeatFromBot()) return error("La tournée est complète.");
        member.role = "player";
        member.waiting = d.status === "playing";
        if (d.settings.teams) member.team = this.emptierTeam();
        this.systemChat(`${member.name} joue la tournée.`);
        return this.afterChange();
      }

      case "watch": {
        if (!member || member.role === "spectator" || d.status === "finished") return;
        member.role = "spectator";
        member.team = null;
        this.systemChat(`${member.name} regarde seulement.`);
        if (await this.checkReady(now)) return;
        return this.afterChange();
      }

      case "ready": {
        if (d.status !== "lobby" && d.status !== "intermission") return;
        if (!member || !this.voters().includes(member) || !this.allowMessage(`ready:${userId}`, 150)) return;
        const want = msg.ready !== false;
        if (want === d.ready.includes(userId)) return;
        d.ready = want ? [...d.ready, userId] : d.ready.filter((id) => id !== userId);
        if (await this.checkReady(now)) return;
        return this.afterChange();
      }

      case "vote": {
        if (d.status !== "intermission" || !d.next || d.settings.rules !== "vote" || d.next.variant !== null) return;
        if (!member || !this.voters().includes(member) || !findVariant(d.next.game, msg.variant)) return;
        if (d.next.votes[userId] === msg.variant || !this.allowMessage(`vote:${userId}`, 150)) return;
        d.next.votes = { ...d.next.votes, [userId]: msg.variant };
        this.adoptIfMajority();
        return this.afterChange();
      }

      case "team": {
        if (d.status !== "lobby") return error("Les équipes sont faites pour toute la tournée.");
        if (!d.settings.teams) return;
        const target = this.member(msg.seatId);
        if (!target || target.role !== "player" || (msg.team !== 0 && msg.team !== 1)) return;
        if (target.userId !== userId && !isHost) return error("Seul l'hôte peut changer l'équipe d'un autre joueur.");
        target.team = msg.team;
        return this.afterChange();
      }

      case "leave": {
        if (member) {
          if (d.status === "lobby") {
            d.members = d.members.filter((m) => m !== member);
            this.systemChat(`${member.name} a quitté la tournée.`);
          } else if (!member.left && d.status !== "finished") {
            member.left = true;
            this.systemChat(`${member.name} a quitté la tournée : ses points restent au classement.`);
          }
        }
        for (const other of this.ctx.getWebSockets(userId)) {
          try {
            other.close(1000, "Au revoir");
          } catch {
            // déjà fermée
          }
        }
        if (userId === d.hostId) this.ensureHost(true);
        void this.hub.setUserRoom(userId, null).catch(() => {});
        if (await this.checkReady(now)) return;
        return this.afterChange(ws);
      }
    }

    if (msg.t === "close") {
      if (!isAdmin) return error("Seul l'administrateur du site peut fermer une tournée.");
      return this.close("La tournée a été fermée par l'administrateur du site.");
    }

    // Le reste est réservé à l'hôte ; l'admin du site peut aussi exclure
    if (!isHost && !(isAdmin && msg.t === "kick")) return error("Seul l'hôte peut faire ça.");
    switch (msg.t) {
      case "kick": {
        if (typeof msg.userId !== "string" || msg.userId === userId) return;
        return this.kickUser(msg.userId, now);
      }

      case "addBot": {
        if (d.status !== "lobby") return error("Les bots s'ajoutent au salon, avant le départ.");
        if (this.playerCount() >= d.settings.maxPlayers) return error("La tournée est complète.");
        const used = new Set(d.members.map((m) => m.name));
        const name = TOUR_BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${d.botCounter + 1}`;
        const bot: Member = {
          userId: `bot-t${++d.botCounter}`,
          kind: "bot",
          name,
          avatar: seededAvatar(`${name}-${d.code}`),
          photo: 0,
          admin: false,
          role: "player",
          team: d.settings.teams ? this.emptierTeam() : null,
          points: 0,
          wins: 0,
          joinedAt: now,
          waiting: false,
          left: false,
          disconnectedAt: null,
        };
        d.members.push(bot);
        if (await this.checkReady(now)) return;
        return this.afterChange();
      }

      case "removeSeat": {
        if (d.status !== "lobby") return;
        const bot = this.member(msg.seatId);
        if (!bot || bot.kind !== "bot") return;
        d.members = d.members.filter((m) => m !== bot);
        return this.afterChange();
      }

      case "settings": {
        if (d.status !== "lobby") return error("Les règles de la tournée sont fixées une fois lancée.");
        const patch = msg.settings ?? {};
        if (Array.isArray(patch.games)) {
          const games = TOUR_GAMES.filter((g) => patch.games!.includes(g));
          if (games.length > 0) d.settings.games = games;
        }
        const end = patch.end === undefined ? null : sanitizeEnd(patch.end);
        if (end) d.settings.end = end;
        if (typeof patch.teams === "boolean" && patch.teams !== d.settings.teams) {
          d.settings.teams = patch.teams;
          // Des équipes équilibrées d'emblée, dans l'ordre d'arrivée
          const players = d.members.filter((m) => m.role === "player" && !m.left).sort((a, b) => a.joinedAt - b.joinedAt);
          for (const m of d.members) m.team = null;
          if (patch.teams) players.forEach((m, i) => (m.team = (i % 2) as 0 | 1));
        }
        if (typeof patch.once === "boolean") d.settings.once = patch.once;
        if (patch.botLevel === "easy" || patch.botLevel === "normal" || patch.botLevel === "hard") d.settings.botLevel = patch.botLevel;
        if (patch.rules === "base" || patch.rules === "random" || patch.rules === "vote") d.settings.rules = patch.rules;
        if (msg.visibility === "public" || msg.visibility === "private") d.settings.visibility = msg.visibility;
        if (typeof msg.maxPlayers === "number") {
          const max = Math.round(msg.maxPlayers);
          if (max >= TOUR_MIN_PLAYERS && max <= TOUR_MAX_PLAYERS && max >= this.playerCount()) d.settings.maxPlayers = max;
        }
        // Des joueurs déjà prêts : la tournée part si elle le peut maintenant
        if (await this.checkReady(now)) return;
        return this.afterChange();
      }

      case "start": {
        if (d.status !== "lobby") return;
        const problem = this.startError();
        if (problem) return error(problem);
        return this.startTour(now);
      }

      case "launch": {
        if (d.status !== "intermission" || !d.next) return;
        return this.launch(now);
      }

      case "pickVariant": {
        if (d.status !== "intermission" || !d.next || d.settings.rules !== "vote") return;
        const variant = findVariant(d.next.game, msg.variant);
        if (!variant) return;
        d.next.variant = variant.id;
        this.systemChat(`L'hôte choisit les règles : ${variant.name}.`);
        return this.afterChange();
      }

      case "pause": {
        if (d.status !== "intermission" || !d.next || d.next.at === null) return;
        d.next.at = null;
        // Les « prêts » d'avant la pause ne relancent pas tout seuls
        d.ready = [];
        d.timers = d.timers.filter((t) => t.kind !== "launch");
        this.systemChat("L'hôte met la tournée en pause.");
        return this.afterChange();
      }

      case "resume": {
        if (d.status !== "intermission") return;
        d.notice = null;
        if (!d.next) this.drawNext(now, INTERMISSION_MS);
        else {
          d.next.at = now + 6000;
          this.addTimer({ at: d.next.at, kind: "launch" });
        }
        if (d.next) this.systemChat("C'est reparti !");
        return this.afterChange();
      }

      case "finish": {
        if (d.status === "playing") {
          d.finishAfterCurrent = !d.finishAfterCurrent;
          this.systemChat(d.finishAfterCurrent ? "La tournée s'arrêtera après ce jeu." : "Finalement, la tournée continue après ce jeu.");
          return this.afterChange();
        }
        if (d.status !== "intermission") return;
        return this.finishTour(now);
      }

      case "again": {
        if (d.status !== "finished") return;
        // Une nouvelle tournée avec la même bande et les mêmes règles
        d.members = d.members.filter((m) => !m.left && this.present(m));
        for (const m of d.members) {
          m.points = 0;
          m.wins = 0;
          m.waiting = false;
        }
        d.status = "lobby";
        d.games = [];
        d.current = null;
        d.next = null;
        d.ready = [];
        d.startedAt = null;
        d.finishAfterCurrent = false;
        d.titles = null;
        d.lines = {};
        d.notice = null;
        d.recorded = false;
        this.systemChat("Nouvelle tournée : même bande, même programme.");
        return this.afterChange();
      }
    }
  }

  private async kickUser(target: string, now: number) {
    const d = this.data!;
    if (!d.kicked.includes(target)) d.kicked.push(target);
    const member = this.member(target);
    if (member) {
      if (d.status === "lobby") d.members = d.members.filter((m) => m !== member);
      else member.left = true;
      this.systemChat(`${member.name} a été exclu de la tournée.`);
    }
    for (const other of this.ctx.getWebSockets(target)) {
      this.send(other, { t: "kicked" });
      try {
        other.close(4003, "Exclu");
      } catch {
        // déjà fermée
      }
    }
    // Il ne garde pas sa place à la table du jeu en cours
    if (d.current)
      await gameStub(this.env, d.current.game, d.current.code)
        .adminKick(target)
        .catch(() => {});
    if (target === d.hostId) this.ensureHost(true);
    void this.hub.setUserRoom(target, null).catch(() => {});
    void now;
    return this.afterChange();
  }

  private async close(reason: string) {
    const connected = [...this.connectedUsers().keys()];
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, { t: "closed", reason });
      try {
        ws.close(4004, "Tournee fermee");
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
  // Le programme : tirage, table du jeu, fin
  // -------------------------------------------------------------------------

  /** Jeux joués jusqu'au bout, à écarter du tirage quand chaque jeu ne se joue qu'une fois */
  private excluded(): GameId[] {
    const d = this.data!;
    return d.settings.once ? d.games.filter((g) => !g.aborted && g.results).map((g) => g.game) : [];
  }

  /** Le jeu que donnerait le tirage maintenant, ou rien s'il ne reste aucun jeu possible */
  private nextDraw(players = this.activePlayers().length): GameId | null {
    const d = this.data!;
    return drawGame(d.settings.games, Math.max(TOUR_MIN_PLAYERS, players), this.previousGame(), () => random(d), this.excluded());
  }

  /** Pourquoi la tournée ne peut pas encore commencer, ou null si elle peut */
  private startError(): string | null {
    const d = this.data!;
    const players = this.activePlayers();
    if (players.length < TOUR_MIN_PLAYERS) return "Il faut au moins deux joueurs : invite un ami ou ajoute un bot.";
    if (!players.some((m) => m.kind === "human")) return "Il faut au moins un vrai joueur dans la tournée.";
    if (!d.settings.games.some((g) => fitsGame(g, players.length))) return `Aucun des jeux cochés n'accueille ${players.length} joueurs.`;
    if (d.settings.teams) {
      const red = players.filter((m) => m.team === 0).length;
      if (red === 0 || red * 2 !== players.length) {
        return `Il faut deux équipes de même taille : c'est ${red} contre ${players.length - red} pour l'instant.`;
      }
    }
    return null;
  }

  private async startTour(now: number) {
    const d = this.data!;
    // Ceux qui ne sont pas là au départ restent dans la liste, mais en spectateurs
    for (const m of d.members) if (m.role === "player" && !this.present(m)) m.role = "spectator";
    d.status = "intermission";
    d.startedAt = now;
    this.systemChat(`La tournée commence : ${d.settings.games.map((g) => GAME_NAMES[g]).join(", ")} au programme !`);
    this.drawNext(now, FIRST_DRAW_MS);
    await this.afterChange();
  }

  private previousGame(): GameId | null {
    const played = this.data!.games.filter((g) => !g.aborted);
    return played.at(-1)?.game ?? null;
  }

  /** Tire le jeu suivant et programme son départ ; sans jeu possible, la tournée se met en pause. */
  private drawNext(now: number, delay: number) {
    const d = this.data!;
    d.timers = d.timers.filter((t) => t.kind !== "launch");
    const players = this.activePlayers().length;
    const game = this.nextDraw(players);
    if (!game) {
      d.next = null;
      d.notice = `Aucun des jeux ${this.excluded().length > 0 ? "qui restent" : "cochés"} n'accueille ${players} joueurs : la tournée est en pause.`;
      return;
    }
    d.notice = null;
    // Les règles : celles de base, tirées avec le jeu, ou laissées au vote (avec un peu plus de temps)
    const rules = d.settings.rules;
    const variant = rules === "random" ? drawVariant(game, () => random(d)) : rules === "vote" ? null : baseVariant(game);
    d.next = { game, at: now + delay + (rules === "vote" ? VOTE_EXTRA_MS : 0), variant, votes: {} };
    d.ready = [];
    this.addTimer({ at: d.next.at!, kind: "launch" });
  }

  /** Crée la table du jeu tiré, avec les joueurs présents déjà assis. */
  private async launch(now: number) {
    const d = this.data!;
    if (this.launching || d.status !== "intermission" || !d.next) return;
    this.launching = true;
    try {
      d.timers = d.timers.filter((t) => t.kind !== "launch");
      // Les joueurs d'abord, les bots ensuite : s'il y a trop de monde pour le jeu, ce sont les bots qui attendent
      const active = this.activePlayers();
      let players = [...active.filter((m) => m.kind === "human"), ...active.filter((m) => m.kind === "bot")];
      if (players.length < TOUR_MIN_PLAYERS || !players.some((m) => m.kind === "human")) {
        d.next.at = null;
        d.ready = [];
        d.notice = "Il faut au moins deux joueurs, dont un vrai joueur connecté, pour continuer : la tournée attend.";
        return await this.afterChange();
      }
      let game = d.next.game;
      // Les règles : déjà retenues, ou la plus votée au moment du départ
      let variant =
        d.next.variant ??
        resolveVariant(
          game,
          d.next.votes,
          this.voters().map((m) => m.userId),
          () => random(d),
        );
      if (!fitsGame(game, players.length)) {
        // Le nombre de joueurs a changé depuis le tirage
        const other = this.nextDraw(players.length);
        if (other) {
          this.systemChat(`${GAME_NAMES[game]} n'accueille pas ${players.length} joueurs : on passe à ${GAME_NAMES[other]}.`);
          game = other;
          variant = d.settings.rules === "random" ? drawVariant(other, () => random(d)) : baseVariant(other);
        } else {
          // Trop de monde pour tous les jeux cochés : les derniers arrivés regardent celui-ci et jouent le suivant
          const extra = players.slice(GAME_SEATS[game].max);
          players = players.slice(0, GAME_SEATS[game].max);
          for (const m of extra) m.waiting = true;
          this.systemChat(`${extra.map((m) => m.name).join(", ")} regarde ce jeu-ci et jouera le suivant en priorité.`);
        }
      }
      const index = d.games.length + 1;
      const code = await this.hub.allocateCode();
      // Le 2 contre 2 de la bataille navale et de Briques se joue avec les équipes de la tournée
      const red = players.filter((m) => m.team === 0).length;
      const teams =
        d.settings.teams && game !== "uno" && players.length === 4 && red === 2
          ? Object.fromEntries(players.map((m) => [m.userId, m.team as 0 | 1]))
          : null;
      const users: PublicUser[] = players
        .filter((m) => m.kind === "human")
        .map((m) => ({
          id: m.userId,
          pseudo: m.name,
          avatar: m.avatar,
          photo: m.photo,
          ...(m.admin ? { admin: true as const } : {}),
        }));
      const bots = players.filter((m) => m.kind === "bot").map((m) => ({ id: m.userId, name: m.name, avatar: m.avatar }));
      await gameStub(this.env, game, code).init({
        code,
        host: users[0]!,
        visibility: "private",
        quick: false,
        tour: { code: d.code, index, players: users, bots, botLevel: d.settings.botLevel, teams, variant },
      });
      if (this.data !== d || d.status !== "intermission") return;
      d.games.push({
        index,
        game,
        code,
        startedAt: now,
        endedAt: null,
        players: players.map((m) => m.userId),
        results: null,
        aborted: false,
        variant,
      });
      d.current = { index, game, code };
      d.next = null;
      d.ready = [];
      d.notice = null;
      d.status = "playing";
      for (const m of players) m.waiting = false;
      this.addTimer({ at: now + STALE_TABLE_MS, kind: "stale", code });
      const rulesName = findVariant(game, variant)?.name;
      this.systemChat(
        d.settings.rules === "base" || !rulesName
          ? `Jeu ${index} : ${GAME_NAMES[game]} !`
          : `Jeu ${index} : ${GAME_NAMES[game]}, règles « ${rulesName} » !`,
      );
      await this.afterChange();
    } catch (err) {
      console.error("Table de la tournée impossible à ouvrir", err);
      if (this.data === d && d.status === "intermission" && d.next) {
        d.next.at = now + 8000;
        this.addTimer({ at: d.next.at, kind: "launch" });
        await this.afterChange();
      }
    } finally {
      this.launching = false;
    }
  }

  /** Classement de la tournée : points, puis jeux gagnés ; à égalité, même place */
  private standings(): Member[] {
    const d = this.data!;
    const played = new Set(Object.keys(d.lines));
    return d.members.filter((m) => played.has(m.userId)).sort((a, b) => b.points - a.points || b.wins - a.wins || a.joinedAt - b.joinedAt);
  }

  private async finishTour(now: number) {
    const d = this.data!;
    d.status = "finished";
    d.current = null;
    d.next = null;
    d.notice = null;
    d.finishAfterCurrent = false;
    d.timers = d.timers.filter((t) => t.kind !== "launch" && t.kind !== "stale");
    const standings = this.standings();
    d.titles = tourTitles(standings.map((m) => ({ userId: m.userId, name: m.name, lines: d.lines[m.userId] ?? [] })));
    if (standings.length === 0) this.systemChat("La tournée s'arrête avant d'avoir commencé.");
    else if (d.settings.teams) {
      const [red, blue] = teamScores(standings);
      this.systemChat(
        red === blue
          ? `Fin de la tournée : égalité parfaite, ${red} partout !`
          : `Fin de la tournée : victoire des ${TOUR_TEAMS[red > blue ? 0 : 1]} !`,
      );
    } else this.systemChat(`Fin de la tournée : ${standings[0]!.name} l'emporte avec ${standings[0]!.points} points !`);
    await this.afterChange();
    await this.recordIfNeeded(now);
  }

  private async recordIfNeeded(now: number) {
    const d = this.data;
    if (!d || d.recorded || d.status !== "finished") return;
    const games = d.games.filter((g) => !g.aborted && g.results);
    if (games.length === 0) return;
    d.recorded = true;
    await this.persist();
    const standings = this.standings();
    const [red, blue] = teamScores(standings);
    const winnerTeam = d.settings.teams && red !== blue ? (red > blue ? 0 : 1) : null;
    // Place de chacun : à égalité de points et de victoires, même place
    let rank = 0;
    const placed = standings.map((m, i) => {
      const prev = standings[i - 1];
      if (!prev || prev.points !== m.points || prev.wins !== m.wins) rank = i + 1;
      return { member: m, rank };
    });
    try {
      const { unlocked } = await recordTour(this.env.DB, {
        code: d.code,
        startedAt: d.startedAt ?? now,
        endedAt: now,
        settings: d.settings,
        games: games.map((g) => ({ game: g.game, variant: g.variant, results: g.results! })),
        winnerTeam,
        players: placed.map(({ member, rank: r }) => ({
          // Les bots ont leur ligne sur la feuille, mais ni stats ni succès
          userId: member.kind === "human" ? member.userId : null,
          name: member.name,
          rank: d.settings.teams ? (member.team === winnerTeam ? 1 : winnerTeam === null ? 1 : 2) : r,
          points: member.points,
          wins: member.wins,
          team: member.team,
          lines: d.lines[member.userId] ?? [],
          titles: (d.titles ?? []).filter((t) => t.userId === member.userId).map((t) => t.id),
        })),
      });
      const unlocks = Object.entries(unlocked).map(([userId, ids]) => ({ userId, ids }));
      if (unlocks.length > 0) this.broadcastRaw({ t: "achievements", unlocks });
    } catch (err) {
      console.error("Enregistrement de la tournée impossible", err);
    }
  }

  // -------------------------------------------------------------------------
  // Minuteries
  // -------------------------------------------------------------------------

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
    if (changed) await this.afterChange();
    else {
      await this.persist();
      await this.armAlarm();
    }
  }

  /** Renvoie vrai si la tournée a changé et doit être rediffusée */
  private async runTimer(t: Timer, now: number): Promise<boolean> {
    const d = this.data!;
    switch (t.kind) {
      case "launch":
        if (d.status !== "intermission" || !d.next || d.next.at === null) return false;
        await this.launch(now);
        return false;
      case "host": {
        if (d.hostId !== t.userId || this.isConnected(d.hostId)) return false;
        this.ensureHost(true);
        return true;
      }
      case "release": {
        const m = t.userId ? this.member(t.userId) : undefined;
        if (!m || d.status !== "lobby" || this.isConnected(m.userId)) return false;
        d.members = d.members.filter((x) => x !== m);
        return true;
      }
      case "stale": {
        if (!d.current || d.current.code !== t.code) return false;
        await this.tableAborted(t.code);
        return false;
      }
      case "cleanup":
        if (this.connectedUsers().size > 0) return false;
        await this.destroy();
        return false;
    }
  }

  private async destroy() {
    const d = this.data!;
    for (const m of d.members) void this.hub.setUserRoom(m.userId, null).catch(() => {});
    await this.hub.removeRoom(d.code).catch(() => {});
    this.data = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // -------------------------------------------------------------------------
  // Diffusion
  // -------------------------------------------------------------------------

  private async afterChange(closing?: WebSocket) {
    const d = this.data;
    if (!d) return;
    await this.persist();
    this.broadcast(closing);
    await this.armAlarm();
    await this.syncHub();
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

  private viewFor(userId: string, connected: Map<string, PublicUser>): TourView {
    const d = this.data!;
    const me = this.member(userId);
    const memberIds = new Set(d.members.map((m) => m.userId));
    const endsAt = d.settings.end.kind === "time" && d.startedAt !== null ? d.startedAt + d.settings.end.minutes * 60_000 : null;
    // Les votants vus d'ici : vrais joueurs connectés ; seules leurs voix comptent
    const voters = d.members
      .filter((m) => m.kind === "human" && m.role === "player" && !m.left && connected.has(m.userId))
      .map((m) => m.userId);
    const counts = (ids: string[]) => ids.filter((id) => voters.includes(id));
    return {
      code: d.code,
      game: "tour",
      status: d.status,
      settings: d.settings,
      hostId: d.hostId,
      members: d.members.map((m) => ({
        userId: m.userId,
        kind: m.kind,
        name: m.name,
        avatar: m.avatar,
        photo: m.photo,
        admin: m.admin,
        connected: m.kind === "bot" || connected.has(m.userId),
        role: m.role,
        team: m.team,
        points: m.points,
        wins: m.wins,
        waiting: m.waiting,
        left: m.left,
        isHost: m.userId === d.hostId,
      })),
      spectators: [...connected.values()].filter((u) => !memberIds.has(u.id)).map((u) => ({ userId: u.id, name: u.pseudo })),
      you: {
        userId,
        isHost: userId === d.hostId,
        isAdmin: Boolean(connected.get(userId)?.admin),
        member: Boolean(me && !me.left),
        role: me && !me.left ? me.role : null,
      },
      games: d.games,
      current: d.current,
      next: d.next && { ...d.next, votes: Object.fromEntries(Object.entries(d.next.votes).filter(([id]) => voters.includes(id))) },
      voters,
      ready: counts(d.ready),
      startedAt: d.startedAt,
      endsAt,
      finishAfterCurrent: d.finishAfterCurrent,
      titles: d.titles,
      notice: d.notice,
      serverNow: Date.now(),
      quick: d.quick,
    };
  }

  private broadcast(except?: WebSocket) {
    const connected = this.connectedUsers(except);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: "tour", tour: this.viewFor(att.userId, connected) });
    }
  }

  private broadcastRaw(msg: TourServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // déjà fermée
      }
    }
  }

  private send(ws: WebSocket, msg: TourServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // déjà fermée
    }
  }

  private async persist() {
    if (this.data) await this.ctx.storage.put("tour", this.data);
  }

  /** Statut vu des autres : en attente au salon, en cours (jeu ou entracte), ou finie */
  private roomStatus(): RoomStatus {
    const s = this.data!.status;
    return s === "lobby" ? "lobby" : s === "finished" ? "finished" : "playing";
  }

  private presenceRoom(): PresenceRoom {
    return { code: this.data!.code, game: "tour", status: this.roomStatus() };
  }

  private buildSummary(): RoomSummary {
    const d = this.data!;
    const host = this.member(d.hostId);
    const players = d.members.filter((m) => m.role === "player" && !m.left);
    return {
      code: d.code,
      game: "tour",
      variant: d.settings.games.join(","),
      status: this.roomStatus(),
      visibility: d.settings.visibility,
      hostName: host?.name ?? "",
      humans: players.filter((m) => m.kind === "human").length,
      bots: players.filter((m) => m.kind === "bot").length,
      maxPlayers: d.settings.maxPlayers,
      names: players.filter((m) => m.kind === "human").map((m) => m.name),
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
