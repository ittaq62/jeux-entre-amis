import { DurableObject } from "cloudflare:workers";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../shared/app.ts";
import type { Announcement, HubClientMessage, HubServerMessage, PresenceRoom, PublicUser, RoomSummary } from "../shared/protocol.ts";
import { acceptedFriendIds } from "./users.ts";
import { decodeHeaderJson } from "./util.ts";

interface HubAttachment {
  userId: string;
  user: PublicUser;
  friends: string[];
  lobby: boolean;
}

interface StoredRoom {
  summary: RoomSummary;
  updatedAt: number;
}

const STALE_ROOM_MS = 6 * 3600_000;
/** Une annonce reste visible pour ceux qui arrivent pendant ce temps */
const ANNOUNCE_TTL_MS = 3 * 3600_000;

/**
 * Objet unique du site : presence des joueurs, liste des salons publics,
 * partie rapide et invitations entre amis.
 */
export class Hub extends DurableObject<Env> {
  private rooms = new Map<string, StoredRoom>();
  private userRooms = new Map<string, PresenceRoom>();
  private reserved = new Map<string, number>();
  private announcement: Announcement | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      const rooms = await ctx.storage.get<Record<string, StoredRoom>>("rooms");
      const userRooms = await ctx.storage.get<Record<string, PresenceRoom>>("userRooms");
      this.rooms = new Map(Object.entries(rooms ?? {}));
      this.userRooms = new Map(Object.entries(userRooms ?? {}));
      this.announcement = (await ctx.storage.get<Announcement>("announcement")) ?? null;
    });
  }

  // -------------------------------------------------------------------------
  // Connexions
  // -------------------------------------------------------------------------

  override async fetch(request: Request): Promise<Response> {
    const user = decodeHeaderJson<PublicUser>(request.headers.get("X-User"));
    if (!user || request.headers.get("Upgrade") !== "websocket") return new Response("Requête invalide", { status: 400 });
    const friends = await acceptedFriendIds(this.env.DB, user.id);
    const wasOnline = this.isOnline(user.id);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [user.id]);
    const attachment: HubAttachment = { userId: user.id, user, friends, lobby: false };
    server.serializeAttachment(attachment);
    this.send(server, { t: "presence", online: this.presenceMap(friends) });
    const announcement = this.activeAnnouncement();
    if (announcement) this.send(server, { t: "announce", announcement });
    if (!wasOnline) this.notifyFriends(user.id, friends);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 2000) return;
    let msg: HubClientMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as HubAttachment;
    switch (msg.t) {
      case "watchLobby":
        att.lobby = Boolean(msg.on);
        ws.serializeAttachment(att);
        if (att.lobby) this.send(ws, { t: "lobby", rooms: this.publicRooms() });
        break;
      case "invite":
        if (typeof msg.to !== "string" || typeof msg.code !== "string" || !att.friends.includes(msg.to)) return;
        if (!this.rooms.has(msg.code)) return;
        for (const target of this.ctx.getWebSockets(msg.to)) {
          this.send(target, { t: "invite", from: att.user, code: msg.code, game: "uno" });
        }
        break;
    }
  }

  override async webSocketClose(ws: WebSocket) {
    this.handleGone(ws);
  }

  override async webSocketError(ws: WebSocket) {
    this.handleGone(ws);
  }

  private handleGone(ws: WebSocket) {
    const att = ws.deserializeAttachment() as HubAttachment | null;
    if (!att) return;
    const still = this.ctx.getWebSockets(att.userId).some((other) => other !== ws && other.readyState === WebSocket.OPEN);
    if (!still) this.notifyFriends(att.userId, att.friends, ws);
  }

  private isOnline(userId: string, except?: WebSocket): boolean {
    return this.ctx.getWebSockets(userId).some((ws) => ws !== except && ws.readyState === WebSocket.OPEN);
  }

  private presenceMap(ids: string[]): Record<string, PresenceRoom | null> {
    const out: Record<string, PresenceRoom | null> = {};
    for (const id of ids) if (this.isOnline(id)) out[id] = this.userRooms.get(id) ?? null;
    return out;
  }

  private notifyFriends(userId: string, friends: string[], except?: WebSocket) {
    const online = this.isOnline(userId, except);
    const room = online ? (this.userRooms.get(userId) ?? null) : null;
    for (const friend of friends) {
      for (const ws of this.ctx.getWebSockets(friend)) this.send(ws, { t: "presenceUpdate", userId, online, room });
    }
  }

  private friendsOf(userId: string): string[] {
    const ws = this.ctx.getWebSockets(userId)[0];
    return ws ? ((ws.deserializeAttachment() as HubAttachment).friends ?? []) : [];
  }

  private send(ws: WebSocket, msg: HubServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // connexion deja fermee
    }
  }

  // -------------------------------------------------------------------------
  // Salons
  // -------------------------------------------------------------------------

  private async persistRooms() {
    await this.ctx.storage.put("rooms", Object.fromEntries(this.rooms));
  }

  private publicRooms(): RoomSummary[] {
    return [...this.rooms.values()]
      .map((r) => r.summary)
      .filter((r) => r.visibility === "public" && r.status !== "finished")
      .sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === "lobby" ? -1 : 1))
      .slice(0, 50);
  }

  private broadcastLobby() {
    const rooms = this.publicRooms();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as HubAttachment | null;
      if (att?.lobby) this.send(ws, { t: "lobby", rooms });
    }
  }

  async allocateCode(): Promise<string> {
    const now = Date.now();
    for (const [code, at] of this.reserved) if (now - at > 120_000) this.reserved.delete(code);
    for (let attempt = 0; attempt < 200; attempt++) {
      const buf = new Uint32Array(ROOM_CODE_LENGTH);
      crypto.getRandomValues(buf);
      const code = [...buf].map((v) => ROOM_CODE_ALPHABET[v % ROOM_CODE_ALPHABET.length]).join("");
      if (!this.rooms.has(code) && !this.reserved.has(code)) {
        this.reserved.set(code, now);
        return code;
      }
    }
    throw new Error("Plus de code de salon disponible");
  }

  async upsertRoom(summary: RoomSummary): Promise<void> {
    const now = Date.now();
    const prev = this.rooms.get(summary.code);
    this.reserved.delete(summary.code);
    this.rooms.set(summary.code, { summary, updatedAt: now });
    for (const [code, r] of this.rooms) if (now - r.updatedAt > STALE_ROOM_MS) this.rooms.delete(code);
    await this.persistRooms();
    if (summary.visibility === "public" || prev?.summary.visibility === "public") this.broadcastLobby();
  }

  async removeRoom(code: string): Promise<void> {
    const prev = this.rooms.get(code);
    if (!prev) return;
    this.rooms.delete(code);
    await this.persistRooms();
    if (prev.summary.visibility === "public") this.broadcastLobby();
  }

  async getRoom(code: string): Promise<RoomSummary | null> {
    return this.rooms.get(code)?.summary ?? null;
  }

  /** Partie rapide : le salon public en attente le plus rempli qui a encore de la place. */
  async quickMatch(): Promise<string | null> {
    const now = Date.now();
    const candidates = [...this.rooms.values()]
      .filter(
        (r) =>
          r.summary.visibility === "public" &&
          r.summary.status === "lobby" &&
          r.summary.humans > 0 &&
          r.summary.humans < r.summary.maxPlayers &&
          now - r.updatedAt < 30 * 60_000,
      )
      .sort((a, b) => b.summary.humans - a.summary.humans || b.summary.createdAt - a.summary.createdAt);
    return candidates[0]?.summary.code ?? null;
  }

  // -------------------------------------------------------------------------
  // Presence et amis
  // -------------------------------------------------------------------------

  async setUserRoom(userId: string, room: PresenceRoom | null): Promise<void> {
    const prev = this.userRooms.get(userId) ?? null;
    if (room) this.userRooms.set(userId, room);
    else this.userRooms.delete(userId);
    if (JSON.stringify(prev) === JSON.stringify(room)) return;
    await this.ctx.storage.put("userRooms", Object.fromEntries(this.userRooms));
    if (this.isOnline(userId)) this.notifyFriends(userId, this.friendsOf(userId));
  }

  async friendsChanged(userIds: string[]): Promise<void> {
    for (const id of userIds) {
      const sockets = this.ctx.getWebSockets(id);
      if (sockets.length === 0) continue;
      const friends = await acceptedFriendIds(this.env.DB, id);
      for (const ws of sockets) {
        const att = ws.deserializeAttachment() as HubAttachment;
        att.friends = friends;
        ws.serializeAttachment(att);
        this.send(ws, { t: "friendsChanged" });
        this.send(ws, { t: "presence", online: this.presenceMap(friends) });
      }
    }
  }

  async presence(ids: string[]): Promise<Record<string, PresenceRoom | null>> {
    return this.presenceMap(ids);
  }

  // -------------------------------------------------------------------------
  // Administration
  // -------------------------------------------------------------------------

  /** Joueurs connectés et toutes les tables, privées comprises. */
  async adminSnapshot(): Promise<{ online: string[]; rooms: (RoomSummary & { updatedAt: number })[] }> {
    const online = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as HubAttachment | null;
      if (att && ws.readyState === WebSocket.OPEN) online.add(att.userId);
    }
    const rooms = [...this.rooms.values()].map((r) => ({ ...r.summary, updatedAt: r.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt);
    return { online: [...online], rooms };
  }

  async userRoom(userId: string): Promise<PresenceRoom | null> {
    return this.userRooms.get(userId) ?? null;
  }

  /** Message à tout le site : affiché aux connectés et aux arrivants pendant quelques heures. */
  async announce(text: string, from: string): Promise<Announcement> {
    const now = Date.now();
    const announcement: Announcement = { id: now, text, from, at: now, until: now + ANNOUNCE_TTL_MS };
    this.announcement = announcement;
    await this.ctx.storage.put("announcement", announcement);
    for (const ws of this.ctx.getWebSockets()) this.send(ws, { t: "announce", announcement });
    return announcement;
  }

  async clearAnnouncement(): Promise<void> {
    this.announcement = null;
    await this.ctx.storage.delete("announcement");
  }

  async currentAnnouncement(): Promise<Announcement | null> {
    return this.activeAnnouncement();
  }

  private activeAnnouncement(): Announcement | null {
    return this.announcement && this.announcement.until > Date.now() ? this.announcement : null;
  }

  /** Coupe les connexions d'un compte (suspendu ou supprimé). */
  async signOut(userId: string, reason: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets(userId)) {
      this.send(ws, { t: "signedOut", reason });
      try {
        ws.close(4001, "Deconnecte");
      } catch {
        // deja fermee
      }
    }
  }
}
