import type { AdminGame, AdminUser } from "../shared/protocol.ts";
import type { UserRow } from "./auth.ts";
import { toPublic } from "./users.ts";

const DAY = 24 * 3600_000;

interface AdminUserRow extends UserRow {
  played: number | null;
  won: number | null;
  points: number | null;
}

const USER_SELECT = `SELECT u.*, s.played, s.won, s.points
  FROM users u LEFT JOIN user_stats s ON s.user_id = u.id AND s.game = 'uno'`;

function toAdminUser(r: AdminUserRow, online: Set<string>): AdminUser {
  return {
    user: toPublic(r),
    pending: r.pseudo === null,
    email: r.email,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    played: r.played ?? 0,
    won: r.won ?? 0,
    points: r.points ?? 0,
    banned: r.banned_at ? { at: r.banned_at, reason: r.ban_reason } : null,
    online: online.has(r.id),
  };
}

export async function siteCounts(db: D1Database) {
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE pseudo IS NOT NULL) AS accounts,
         (SELECT COUNT(*) FROM users WHERE pseudo IS NOT NULL AND created_at > ?1) AS newThisWeek,
         (SELECT COUNT(*) FROM users WHERE banned_at IS NOT NULL) AS banned,
         (SELECT COUNT(*) FROM games) AS games,
         (SELECT COUNT(*) FROM games WHERE ended_at > ?2) AS gamesToday`,
    )
    .bind(now - 7 * DAY, now - DAY)
    .first<{ accounts: number; newThisWeek: number; banned: number; games: number; gamesToday: number }>();
  return row ?? { accounts: 0, newThisWeek: 0, banned: 0, games: 0, gamesToday: 0 };
}

export async function recentGames(db: D1Database, limit = 12): Promise<AdminGame[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.variant, g.ended_at, g.rounds,
         (SELECT json_group_array(json_object('name', p.name, 'rank', p.rank, 'bot', p.is_bot))
            FROM game_players p WHERE p.game_id = g.id) AS players
       FROM games g ORDER BY g.ended_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: string; variant: string; ended_at: number; rounds: number; players: string }>();
  return results.map((r) => ({
    id: r.id,
    variant: r.variant,
    endedAt: r.ended_at,
    rounds: r.rounds,
    players: (JSON.parse(r.players) as { name: string; rank: number; bot: number }[])
      .sort((a, b) => a.rank - b.rank)
      .map((p) => ({ name: p.name, rank: p.rank, bot: p.bot === 1 })),
  }));
}

/** Sans recherche : les derniers venus sur le site. Sinon par pseudo ou email. */
export async function findUsers(db: D1Database, query: string, online: Set<string>): Promise<AdminUser[]> {
  const q = query.trim().toLowerCase();
  const statement = q
    ? db
        .prepare(`${USER_SELECT} WHERE u.pseudo LIKE ?1 ESCAPE '\\' OR u.email LIKE ?1 ESCAPE '\\' ORDER BY u.last_seen_at DESC LIMIT 40`)
        .bind(`%${q.replace(/[\\%_]/g, "\\$&")}%`)
    : db.prepare(`${USER_SELECT} ORDER BY u.last_seen_at DESC LIMIT 12`);
  const { results } = await statement.all<AdminUserRow>();
  return results.map((r) => toAdminUser(r, online));
}

export async function findUser(db: D1Database, id: string, online: Set<string>): Promise<AdminUser | null> {
  const row = await db.prepare(`${USER_SELECT} WHERE u.id = ?`).bind(id).first<AdminUserRow>();
  return row ? toAdminUser(row, online) : null;
}
