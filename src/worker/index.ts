import { Hono, type Context, type Next } from "hono";
import { normalizePseudo, validatePseudo, isRoomCode } from "../shared/app.ts";
import { sanitizeAvatar } from "../shared/avatar.ts";
import {
  ANNOUNCE_MAX,
  BAN_REASON_MAX,
  type AdminOverview,
  type AdminUserAction,
  type FriendEntry,
  type MeResponse,
  type PresenceRoom,
  type Visibility,
} from "../shared/protocol.ts";
import { findUser, findUsers, recentGames, siteCounts } from "./admin.ts";
import {
  BANNED_MESSAGE,
  clearSessionCookie,
  createSession,
  destroySession,
  getSession,
  rateLimit,
  requestLoginCode,
  sessionCookie,
  verifyLoginCode,
  type Session,
  type UserRow,
} from "./auth.ts";
import {
  acceptFriend,
  findUserByPseudo,
  isAdmin,
  leaderboard,
  listFriends,
  removeFriend,
  requestFriend,
  toMe,
  toPublic,
  userProfile,
} from "./users.ts";
import { clientIp, encodeHeaderJson, sameOrigin } from "./util.ts";

export { GameRoom } from "./room.ts";
export { Hub } from "./hub.ts";

type AppEnv = { Bindings: Env; Variables: { session: Session; user: UserRow } };
type Ctx = Context<AppEnv>;

const app = new Hono<AppEnv>().basePath("/api");

const MAX_PHOTO_BYTES = 120 * 1024;
const PHOTO_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

// Toute requete qui modifie quelque chose doit venir du site lui-meme
app.use("*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD" && !sameOrigin(c.req.raw)) {
    return c.json({ error: "Origine refusée." }, 403);
  }
  await next();
});

async function withSession(c: Ctx, next: Next) {
  const session = await getSession(c.env, c.req.raw);
  if (!session) return c.json({ error: "Connecte-toi d'abord." }, 401);
  c.set("session", session);
  c.set("user", session.user);
  await next();
  if (session.renewed && c.res.status !== 101) {
    c.header("Set-Cookie", sessionCookie(c.req.raw, session.token, session.renewed), { append: true });
  }
}

async function withProfile(c: Ctx, next: Next) {
  if (!c.get("user").pseudo) return c.json({ error: "Choisis d'abord ton pseudo." }, 403);
  await next();
}

function hub(c: Ctx) {
  return c.env.HUB.get(c.env.HUB.idFromName("hub"));
}

function siteUrl(c: Ctx) {
  return new URL(c.req.url).origin;
}

function meResponse(user: UserRow): MeResponse {
  return user.pseudo ? { user: toMe(user), pending: null } : { user: null, pending: { email: user.email } };
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

app.post("/auth/request", async (c) => {
  const body = await c.req.json<{ email?: unknown }>().catch(() => ({}) as { email?: unknown });
  const res = await requestLoginCode(c.env, body.email, clientIp(c.req.raw), siteUrl(c));
  if (!res.ok) return c.json({ error: res.error }, res.status as 400);
  return c.json({ ok: true, ...(res.devCode ? { devCode: res.devCode } : {}) });
});

app.post("/auth/verify", async (c) => {
  if (!(await rateLimit(c.env.DB, `verify:${clientIp(c.req.raw)}`, 40, 3600_000))) {
    return c.json({ error: "Trop d'essais depuis ta connexion. Réessaie plus tard." }, 429);
  }
  const body = await c.req.json<{ email?: unknown; code?: unknown }>().catch(() => ({}) as { email?: unknown; code?: unknown });
  const res = await verifyLoginCode(c.env, body.email, body.code);
  if (!res.ok) return c.json({ error: res.error }, res.status as 400);
  const { token, expires } = await createSession(c.env, res.user.id);
  c.header("Set-Cookie", sessionCookie(c.req.raw, token, expires));
  return c.json(meResponse(res.user));
});

app.post("/auth/logout", async (c) => {
  const session = await getSession(c.env, c.req.raw);
  if (session) await destroySession(c.env, session.tokenHash);
  c.header("Set-Cookie", clearSessionCookie(c.req.raw));
  return c.json({ ok: true });
});

app.get("/me", async (c) => {
  const session = await getSession(c.env, c.req.raw);
  if (!session) return c.json({ user: null, pending: null } satisfies MeResponse);
  if (session.renewed) c.header("Set-Cookie", sessionCookie(c.req.raw, session.token, session.renewed));
  return c.json(meResponse(session.user));
});

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

app.patch("/me", withSession, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ pseudo?: unknown; avatar?: unknown }>().catch(() => ({}) as { pseudo?: unknown; avatar?: unknown });
  let pseudo = user.pseudo;
  if (body.pseudo !== undefined) {
    if (typeof body.pseudo !== "string") return c.json({ error: "Pseudo invalide." }, 400);
    const problem = validatePseudo(body.pseudo);
    if (problem) return c.json({ error: problem }, 400);
    pseudo = normalizePseudo(body.pseudo);
    const taken = await findUserByPseudo(c.env.DB, pseudo);
    if (taken && taken.id !== user.id) return c.json({ error: "Ce pseudo est déjà pris." }, 409);
  }
  if (!pseudo) return c.json({ error: "Choisis un pseudo." }, 400);
  let avatar = user.avatar;
  if (body.avatar !== undefined) {
    const clean = sanitizeAvatar(body.avatar);
    if (!clean) return c.json({ error: "Avatar invalide." }, 400);
    avatar = JSON.stringify(clean);
  }
  try {
    const updated = await c.env.DB.prepare("UPDATE users SET pseudo = ?, avatar = ? WHERE id = ? RETURNING *")
      .bind(pseudo, avatar, user.id)
      .first<UserRow>();
    return c.json(meResponse(updated!));
  } catch {
    return c.json({ error: "Ce pseudo est déjà pris." }, 409);
  }
});

app.delete("/me", withSession, async (c) => {
  const user = c.get("user");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM friendships WHERE user_a = ?1 OR user_b = ?1").bind(user.id),
    c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  c.header("Set-Cookie", clearSessionCookie(c.req.raw));
  return c.json({ ok: true });
});

app.put("/me/photo", withSession, withProfile, async (c) => {
  const user = c.get("user");
  const type = (c.req.header("Content-Type") ?? "").split(";")[0]!.trim();
  if (!PHOTO_TYPES.has(type)) return c.json({ error: "Format d'image non pris en charge." }, 415);
  const data = await c.req.arrayBuffer();
  if (data.byteLength === 0 || data.byteLength > MAX_PHOTO_BYTES) return c.json({ error: "Image trop lourde." }, 413);
  const now = Date.now();
  const res = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO user_photos (user_id, data, mime, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(user_id) DO UPDATE SET data = ?2, mime = ?3, updated_at = ?4`,
    ).bind(user.id, data, type, now),
    c.env.DB.prepare("UPDATE users SET photo_version = photo_version + 1 WHERE id = ? RETURNING *").bind(user.id),
  ]);
  const updated = (res[1]!.results as UserRow[])[0]!;
  return c.json(meResponse(updated));
});

app.delete("/me/photo", withSession, async (c) => {
  const user = c.get("user");
  const res = await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM user_photos WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("UPDATE users SET photo_version = 0 WHERE id = ? RETURNING *").bind(user.id),
  ]);
  return c.json(meResponse((res[1]!.results as UserRow[])[0]!));
});

app.get("/users/:id/photo", async (c) => {
  const row = await c.env.DB.prepare("SELECT data, mime FROM user_photos WHERE user_id = ?")
    .bind(param(c, "id"))
    .first<{ data: ArrayBuffer | number[]; mime: string }>();
  if (!row) return c.body(null, 404);
  const bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data);
  return c.body(bytes, 200, {
    "Content-Type": row.mime,
    "Cache-Control": "public, max-age=31536000, immutable",
  });
});

app.get("/profile/:pseudo", withSession, async (c) => {
  const user = await findUserByPseudo(c.env.DB, param(c, "pseudo"));
  const me = c.get("user");
  if (!user || !user.pseudo || (user.banned_at && !isAdmin(me))) return c.json({ error: "Joueur introuvable." }, 404);
  const profile = await userProfile(c.env.DB, user);
  let friendship: FriendEntry["status"] | "none" | "self" = "none";
  if (user.id === me.id) friendship = "self";
  else {
    const entry = (await listFriends(c.env.DB, me.id)).find((f) => f.user.id === user.id);
    if (entry) friendship = entry.status;
  }
  return c.json({ ...profile, friendship });
});

app.get("/leaderboard", withSession, withProfile, async (c) => {
  const scope = c.req.query("scope") === "friends" ? "friends" : "all";
  return c.json({ entries: await leaderboard(c.env.DB, scope, c.get("user").id) });
});

app.get("/users/search", withSession, withProfile, async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ users: [] });
  const { results } = await c.env.DB.prepare(
    "SELECT id, pseudo, avatar, photo_version, is_admin FROM users WHERE pseudo LIKE ? ESCAPE '\\' AND banned_at IS NULL AND id != ? ORDER BY length(pseudo) LIMIT 8",
  )
    .bind(`${q.replace(/[\\%_]/g, "\\$&")}%`, c.get("user").id)
    .all<Pick<UserRow, "id" | "pseudo" | "avatar" | "photo_version" | "is_admin">>();
  return c.json({ users: results.map(toPublic) });
});

// ---------------------------------------------------------------------------
// Amis
// ---------------------------------------------------------------------------

app.get("/friends", withSession, withProfile, async (c) => {
  const me = c.get("user");
  const list = await listFriends(c.env.DB, me.id);
  const accepted = list.filter((f) => f.status === "accepted").map((f) => f.user.id);
  const presence: Record<string, PresenceRoom | null> = accepted.length > 0 ? await hub(c).presence(accepted) : {};
  const friends: FriendEntry[] = list.map((f) => ({
    ...f,
    online: f.user.id in presence,
    room: presence[f.user.id] ?? null,
  }));
  return c.json({ friends });
});

app.post("/friends", withSession, withProfile, async (c) => {
  const me = c.get("user");
  const body = await c.req.json<{ pseudo?: unknown }>().catch(() => ({}) as { pseudo?: unknown });
  if (typeof body.pseudo !== "string") return c.json({ error: "Indique un pseudo." }, 400);
  if (!(await rateLimit(c.env.DB, `friend:${me.id}`, 30, 3600_000))) return c.json({ error: "Doucement !" }, 429);
  const target = await findUserByPseudo(c.env.DB, normalizePseudo(body.pseudo));
  if (!target || !target.pseudo) return c.json({ error: "Aucun joueur ne porte ce pseudo." }, 404);
  if (target.id === me.id) return c.json({ error: "Tu es déjà ton meilleur ami." }, 400);
  const result = await requestFriend(c.env.DB, me.id, target.id);
  await hub(c).friendsChanged([me.id, target.id]);
  return c.json({ result });
});

app.post("/friends/:id/accept", withSession, withProfile, async (c) => {
  const me = c.get("user");
  const other = param(c, "id");
  if (!(await acceptFriend(c.env.DB, me.id, other))) return c.json({ error: "Demande introuvable." }, 404);
  await hub(c).friendsChanged([me.id, other]);
  return c.json({ ok: true });
});

app.delete("/friends/:id", withSession, withProfile, async (c) => {
  const me = c.get("user");
  const other = param(c, "id");
  await removeFriend(c.env.DB, me.id, other);
  await hub(c).friendsChanged([me.id, other]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Salons
// ---------------------------------------------------------------------------

async function createRoom(c: Ctx, visibility: Visibility, quick: boolean): Promise<string> {
  const code = await hub(c).allocateCode();
  const stub = c.env.ROOMS.get(c.env.ROOMS.idFromName(code));
  await stub.init({ code, host: toPublic(c.get("user")), visibility, quick });
  return code;
}

app.post("/rooms", withSession, withProfile, async (c) => {
  const body = await c.req.json<{ visibility?: unknown }>().catch(() => ({}) as { visibility?: unknown });
  if (!(await rateLimit(c.env.DB, `room:${c.get("user").id}`, 40, 3600_000))) return c.json({ error: "Trop de salons créés." }, 429);
  const visibility: Visibility = body.visibility === "public" ? "public" : "private";
  return c.json({ code: await createRoom(c, visibility, false) });
});

app.post("/rooms/quick", withSession, withProfile, async (c) => {
  const existing = await hub(c).quickMatch();
  if (existing) return c.json({ code: existing, created: false });
  return c.json({ code: await createRoom(c, "public", true), created: true });
});

app.get("/rooms/:code", withSession, async (c) => {
  const code = param(c, "code").toUpperCase();
  if (!isRoomCode(code)) return c.json({ error: "Code invalide." }, 400);
  const summary = await c.env.ROOMS.get(c.env.ROOMS.idFromName(code)).summary();
  if (!summary) return c.json({ error: "Ce salon n'existe pas ou est fermé." }, 404);
  return c.json({ room: summary });
});

function upgradeTo(c: Ctx, stub: { fetch: (req: Request) => Promise<Response> }) {
  if (c.req.header("Upgrade") !== "websocket") return c.json({ error: "WebSocket attendu." }, 426);
  const origin = c.req.header("Origin");
  if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: "Origine refusée." }, 403);
  const headers = new Headers(c.req.raw.headers);
  headers.set("X-User", encodeHeaderJson(toPublic(c.get("user"))));
  return stub.fetch(new Request(c.req.url, { headers }));
}

app.get("/rooms/:code/ws", withSession, withProfile, async (c) => {
  const code = param(c, "code").toUpperCase();
  if (!isRoomCode(code)) return c.json({ error: "Code invalide." }, 400);
  return upgradeTo(c, c.env.ROOMS.get(c.env.ROOMS.idFromName(code)));
});

app.get("/hub/ws", withSession, withProfile, async (c) => upgradeTo(c, hub(c)));

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

async function withAdmin(c: Ctx, next: Next) {
  if (!isAdmin(c.get("user"))) return c.json({ error: "Réservé à l'administrateur du site." }, 403);
  await next();
}

async function onlineUsers(c: Ctx): Promise<Set<string>> {
  return new Set((await hub(c).adminSnapshot()).online);
}

/** Sort un compte de partout : connexions au site et table en cours. */
async function cutOff(c: Ctx, userId: string, reason: string) {
  await hub(c).signOut(userId, reason);
  const room = await hub(c).userRoom(userId);
  if (room) await c.env.ROOMS.get(c.env.ROOMS.idFromName(room.code)).adminKick(userId);
}

app.get("/admin/overview", withSession, withAdmin, async (c) => {
  const [counts, snapshot, games, announcement] = await Promise.all([
    siteCounts(c.env.DB),
    hub(c).adminSnapshot(),
    recentGames(c.env.DB),
    hub(c).currentAnnouncement(),
  ]);
  return c.json({
    ...counts,
    online: snapshot.online.length,
    rooms: snapshot.rooms.filter((r) => r.status !== "finished" || Date.now() - r.updatedAt < 30 * 60_000),
    recentGames: games,
    announcement,
  } satisfies AdminOverview);
});

app.get("/admin/users", withSession, withAdmin, async (c) => {
  return c.json({ users: await findUsers(c.env.DB, c.req.query("q") ?? "", await onlineUsers(c)) });
});

app.post("/admin/users/:id", withSession, withAdmin, async (c) => {
  const me = c.get("user");
  const id = param(c, "id");
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  if (!target) return c.json({ error: "Compte introuvable." }, 404);
  const body = await c.req.json<AdminUserAction>().catch(() => null);
  const db = c.env.DB;
  switch (body?.action) {
    case "rename": {
      if (typeof body.pseudo !== "string") return c.json({ error: "Pseudo invalide." }, 400);
      const problem = validatePseudo(body.pseudo);
      if (problem) return c.json({ error: problem }, 400);
      const pseudo = normalizePseudo(body.pseudo);
      const taken = await findUserByPseudo(db, pseudo);
      if (taken && taken.id !== id) return c.json({ error: "Ce pseudo est déjà pris." }, 409);
      await db.prepare("UPDATE users SET pseudo = ? WHERE id = ?").bind(pseudo, id).run();
      break;
    }
    case "removePhoto":
      await db.batch([
        db.prepare("DELETE FROM user_photos WHERE user_id = ?").bind(id),
        db.prepare("UPDATE users SET photo_version = 0 WHERE id = ?").bind(id),
      ]);
      break;
    case "resetStats":
      await db.batch([
        db.prepare("DELETE FROM user_stats WHERE user_id = ?").bind(id),
        db.prepare("DELETE FROM achievements WHERE user_id = ?").bind(id),
      ]);
      break;
    case "setAdmin":
      if (id === me.id && !body.on) return c.json({ error: "Tu ne peux pas te retirer toi-même le rôle d'admin." }, 400);
      await db
        .prepare("UPDATE users SET is_admin = ? WHERE id = ?")
        .bind(body.on ? 1 : 0, id)
        .run();
      break;
    case "ban": {
      if (id === me.id) return c.json({ error: "Tu ne peux pas suspendre ton propre compte." }, 400);
      if (isAdmin(target)) return c.json({ error: "Retire-lui d'abord le rôle d'admin." }, 400);
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, BAN_REASON_MAX) || null : null;
      await db.batch([
        db.prepare("UPDATE users SET banned_at = ?, ban_reason = ? WHERE id = ?").bind(Date.now(), reason, id),
        db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
      ]);
      await cutOff(c, id, BANNED_MESSAGE);
      break;
    }
    case "unban":
      await db.prepare("UPDATE users SET banned_at = NULL, ban_reason = NULL WHERE id = ?").bind(id).run();
      break;
    default:
      return c.json({ error: "Action inconnue." }, 400);
  }
  return c.json({ user: await findUser(db, id, await onlineUsers(c)) });
});

app.delete("/admin/users/:id", withSession, withAdmin, async (c) => {
  const id = param(c, "id");
  if (id === c.get("user").id) return c.json({ error: "Pour supprimer ton propre compte, passe par la page Mon compte." }, 400);
  await cutOff(c, id, "Ce compte a été supprimé par l'administrateur du site.");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM friendships WHERE user_a = ?1 OR user_b = ?1").bind(id),
    c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

app.delete("/admin/rooms/:code", withSession, withAdmin, async (c) => {
  const code = param(c, "code").toUpperCase();
  if (!isRoomCode(code)) return c.json({ error: "Code invalide." }, 400);
  const closed = await c.env.ROOMS.get(c.env.ROOMS.idFromName(code)).adminClose();
  // Une table deja disparue peut encore trainer dans la liste du hub
  if (!closed) await hub(c).removeRoom(code);
  return c.json({ ok: true });
});

app.post("/admin/announce", withSession, withAdmin, async (c) => {
  const body = await c.req.json<{ text?: unknown }>().catch(() => ({}) as { text?: unknown });
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, ANNOUNCE_MAX) : "";
  if (!text) return c.json({ error: "Écris d'abord ton message." }, 400);
  return c.json({ announcement: await hub(c).announce(text, c.get("user").pseudo ?? "L'admin") });
});

app.delete("/admin/announce", withSession, withAdmin, async (c) => {
  await hub(c).clearAnnouncement();
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: "Introuvable." }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Oups, une erreur est survenue côté serveur." }, 500);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

function param(c: Ctx, name: string): string {
  return c.req.param(name) ?? "";
}
