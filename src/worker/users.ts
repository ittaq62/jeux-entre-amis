import { sanitizeAvatar, seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { earnedAchievements } from "../shared/achievements.ts";
import type { FriendEntry, Me, PublicUser } from "../shared/protocol.ts";
import type { PlayerStats, UnoSettings } from "../shared/games/uno/engine.ts";
import { rankingPoints } from "../shared/ranking.ts";
import type { UserRow } from "./auth.ts";
import { randomId } from "./util.ts";

export function parseAvatar(raw: string, seed: string): AvatarConfig {
  try {
    return sanitizeAvatar(JSON.parse(raw)) ?? seededAvatar(seed);
  } catch {
    return seededAvatar(seed);
  }
}

export function toPublic(row: Pick<UserRow, "id" | "pseudo" | "avatar" | "photo_version">): PublicUser {
  return {
    id: row.id,
    pseudo: row.pseudo ?? "Anonyme",
    avatar: parseAvatar(row.avatar, row.id),
    photo: row.photo_version,
  };
}

export function toMe(row: UserRow): Me {
  return { ...toPublic(row), email: row.email, createdAt: row.created_at };
}

export async function findUserByPseudo(db: D1Database, pseudo: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE pseudo = ? COLLATE NOCASE").bind(pseudo).first<UserRow>();
}

// ---------------------------------------------------------------------------
// Amis
// ---------------------------------------------------------------------------

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

interface FriendRow {
  user_a: string;
  user_b: string;
  requested_by: string;
  status: "pending" | "accepted";
  id: string;
  pseudo: string | null;
  avatar: string;
  photo_version: number;
}

export async function listFriends(db: D1Database, userId: string): Promise<Omit<FriendEntry, "online" | "room">[]> {
  const { results } = await db
    .prepare(
      `SELECT f.user_a, f.user_b, f.requested_by, f.status, u.id, u.pseudo, u.avatar, u.photo_version
       FROM friendships f JOIN users u ON u.id = CASE WHEN f.user_a = ?1 THEN f.user_b ELSE f.user_a END
       WHERE (f.user_a = ?1 OR f.user_b = ?1) AND u.pseudo IS NOT NULL
       ORDER BY u.pseudo COLLATE NOCASE`,
    )
    .bind(userId)
    .all<FriendRow>();
  return results.map((r) => ({
    user: toPublic(r),
    status: r.status === "accepted" ? "accepted" : r.requested_by === userId ? "outgoing" : "incoming",
  }));
}

export async function acceptedFriendIds(db: D1Database, userId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT CASE WHEN user_a = ?1 THEN user_b ELSE user_a END AS id FROM friendships
       WHERE (user_a = ?1 OR user_b = ?1) AND status = 'accepted'`,
    )
    .bind(userId)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

export async function areFriends(db: D1Database, a: string, b: string): Promise<boolean> {
  const [x, y] = pair(a, b);
  const row = await db
    .prepare("SELECT 1 AS ok FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted'")
    .bind(x, y)
    .first();
  return row !== null;
}

/** Demande d'ami ; si l'autre avait deja demande, l'amitie est acceptee directement. */
export async function requestFriend(db: D1Database, from: string, to: string): Promise<"sent" | "accepted" | "already"> {
  const [a, b] = pair(from, to);
  const existing = await db
    .prepare("SELECT requested_by, status FROM friendships WHERE user_a = ? AND user_b = ?")
    .bind(a, b)
    .first<{ requested_by: string; status: string }>();
  if (existing) {
    if (existing.status === "accepted" || existing.requested_by === from) return "already";
    await db.prepare("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?").bind(a, b).run();
    return "accepted";
  }
  await db
    .prepare("INSERT INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
    .bind(a, b, from, Date.now())
    .run();
  return "sent";
}

export async function acceptFriend(db: D1Database, me: string, other: string): Promise<boolean> {
  const [a, b] = pair(me, other);
  const res = await db
    .prepare("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ? AND status = 'pending' AND requested_by = ?")
    .bind(a, b, other)
    .run();
  return res.meta.changes > 0;
}

export async function removeFriend(db: D1Database, me: string, other: string): Promise<void> {
  const [a, b] = pair(me, other);
  await db.prepare("DELETE FROM friendships WHERE user_a = ? AND user_b = ?").bind(a, b).run();
}

// ---------------------------------------------------------------------------
// Statistiques, succes, classement
// ---------------------------------------------------------------------------

export interface StatTotals {
  played: number;
  drawn: number;
  penaltyCards: number;
  plusGiven: number;
  unoCalls: number;
  caughtOthers: number;
  gotCaught: number;
  challengesWon: number;
  challengesLost: number;
  skipsGiven: number;
  wildsPlayed: number;
  maxHand: number;
  biggestStackTaken: number;
  eliminated: number;
  points: number;
}

const SUM_KEYS = [
  "played",
  "drawn",
  "penaltyCards",
  "plusGiven",
  "unoCalls",
  "caughtOthers",
  "gotCaught",
  "challengesWon",
  "challengesLost",
  "skipsGiven",
  "wildsPlayed",
] as const;
const MAX_KEYS = ["maxHand", "biggestStackTaken"] as const;

function emptyTotals(): StatTotals {
  return {
    played: 0,
    drawn: 0,
    penaltyCards: 0,
    plusGiven: 0,
    unoCalls: 0,
    caughtOthers: 0,
    gotCaught: 0,
    challengesWon: 0,
    challengesLost: 0,
    skipsGiven: 0,
    wildsPlayed: 0,
    maxHand: 0,
    biggestStackTaken: 0,
    eliminated: 0,
    points: 0,
  };
}

export function parseTotals(raw: string | null): StatTotals {
  try {
    return { ...emptyTotals(), ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return emptyTotals();
  }
}

export interface GameRecordPlayer {
  seat: number;
  userId: string | null;
  name: string;
  isBot: boolean;
  rank: number;
  score: number;
  eliminated: boolean;
  stats: PlayerStats;
}

export interface GameRecord {
  roomCode: string;
  settings: UnoSettings;
  startedAt: number;
  endedAt: number;
  rounds: number;
  players: GameRecordPlayer[];
}

/** Enregistre une partie terminee ; renvoie les succes nouvellement debloques par joueur. */
export async function recordGame(db: D1Database, rec: GameRecord): Promise<Record<string, string[]>> {
  const gameId = randomId(10);
  const humans = rec.players.filter((p) => p.userId);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO games (id, game, variant, room_code, settings, started_at, ended_at, rounds, player_count) VALUES (?, 'uno', ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        gameId,
        rec.settings.variant,
        rec.roomCode,
        JSON.stringify(rec.settings),
        rec.startedAt,
        rec.endedAt,
        rec.rounds,
        rec.players.length,
      ),
    ...rec.players.map((p) =>
      db
        .prepare("INSERT INTO game_players (game_id, seat, user_id, name, is_bot, rank, score, stats) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(gameId, p.seat, p.userId, p.name, p.isBot ? 1 : 0, p.rank, p.score, JSON.stringify(p.stats)),
    ),
  ];
  if (humans.length === 0) {
    await db.batch(statements);
    return {};
  }

  // Etat actuel des joueurs humains
  const placeholders = humans.map(() => "?").join(",");
  const { results: statRows } = await db
    .prepare(`SELECT * FROM user_stats WHERE game = 'uno' AND user_id IN (${placeholders})`)
    .bind(...humans.map((h) => h.userId))
    .all<{ user_id: string; played: number; won: number; points: number; streak: number; best_streak: number; totals: string }>();
  const { results: achRows } = await db
    .prepare(`SELECT user_id, achievement FROM achievements WHERE user_id IN (${placeholders})`)
    .bind(...humans.map((h) => h.userId))
    .all<{ user_id: string; achievement: string }>();
  const byUser = new Map(statRows.map((r) => [r.user_id, r]));
  const owned = new Set(achRows.map((r) => `${r.user_id}:${r.achievement}`));

  const now = Date.now();
  const unlocked: Record<string, string[]> = {};
  for (const p of humans) {
    const prev = byUser.get(p.userId!);
    const won = p.rank === 1;
    const played = (prev?.played ?? 0) + 1;
    const streak = won ? (prev?.streak ?? 0) + 1 : 0;
    const totals = parseTotals(prev?.totals ?? null);
    for (const k of SUM_KEYS) totals[k] += p.stats[k];
    for (const k of MAX_KEYS) totals[k] = Math.max(totals[k], p.stats[k]);
    totals.eliminated += p.eliminated ? 1 : 0;
    totals.points += p.score;
    statements.push(
      db
        .prepare(
          `INSERT INTO user_stats (user_id, game, played, won, points, streak, best_streak, totals, updated_at)
           VALUES (?1, 'uno', ?2, ?3, ?4, ?5, ?6, ?7, ?8)
           ON CONFLICT(user_id, game) DO UPDATE SET played = ?2, won = ?3, points = ?4, streak = ?5, best_streak = ?6, totals = ?7, updated_at = ?8`,
        )
        .bind(
          p.userId,
          played,
          (prev?.won ?? 0) + (won ? 1 : 0),
          (prev?.points ?? 0) + rankingPoints(rec.players, p),
          streak,
          Math.max(prev?.best_streak ?? 0, streak),
          JSON.stringify(totals),
          now,
        ),
    );
    const earned = earnedAchievements({
      won,
      players: rec.players.length,
      variant: rec.settings.variant,
      eliminated: p.eliminated,
      stats: p.stats,
      played,
      streak,
    }).filter((id) => !owned.has(`${p.userId}:${id}`));
    if (earned.length > 0) {
      unlocked[p.userId!] = earned;
      for (const id of earned) {
        statements.push(
          db.prepare("INSERT OR IGNORE INTO achievements (user_id, achievement, unlocked_at) VALUES (?, ?, ?)").bind(p.userId, id, now),
        );
      }
    }
  }
  await db.batch(statements);
  return unlocked;
}

export async function userProfile(db: D1Database, user: UserRow) {
  const [stats, achievements, recent] = await Promise.all([
    db
      .prepare("SELECT played, won, points, streak, best_streak, totals FROM user_stats WHERE user_id = ? AND game = 'uno'")
      .bind(user.id)
      .first<{
        played: number;
        won: number;
        points: number;
        streak: number;
        best_streak: number;
        totals: string;
      }>(),
    db.prepare("SELECT achievement, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC").bind(user.id).all<{
      achievement: string;
      unlocked_at: number;
    }>(),
    db
      .prepare(
        `SELECT g.id, g.variant, g.ended_at, g.player_count, gp.rank, gp.score,
           (SELECT json_group_array(json_object('name', p2.name, 'rank', p2.rank, 'bot', p2.is_bot))
              FROM game_players p2 WHERE p2.game_id = g.id) AS players
         FROM game_players gp JOIN games g ON g.id = gp.game_id
         WHERE gp.user_id = ? ORDER BY g.ended_at DESC LIMIT 12`,
      )
      .bind(user.id)
      .all<{ id: string; variant: string; ended_at: number; player_count: number; rank: number; score: number; players: string }>(),
  ]);
  return {
    user: toPublic(user),
    memberSince: user.created_at,
    stats: {
      played: stats?.played ?? 0,
      won: stats?.won ?? 0,
      points: stats?.points ?? 0,
      streak: stats?.streak ?? 0,
      bestStreak: stats?.best_streak ?? 0,
      totals: parseTotals(stats?.totals ?? null),
    },
    achievements: achievements.results.map((a) => ({ id: a.achievement, at: a.unlocked_at })),
    recent: recent.results.map((r) => ({
      id: r.id,
      variant: r.variant,
      endedAt: r.ended_at,
      players: r.player_count,
      rank: r.rank,
      score: r.score,
      table: (JSON.parse(r.players) as { name: string; rank: number; bot: number }[])
        .sort((a, b) => a.rank - b.rank)
        .map((p) => ({ name: p.name, rank: p.rank, bot: p.bot === 1 })),
    })),
  };
}

export async function leaderboard(db: D1Database, scope: "all" | "friends", me: string) {
  const friendFilter =
    scope === "friends"
      ? `AND (s.user_id = ?1 OR s.user_id IN (SELECT CASE WHEN user_a = ?1 THEN user_b ELSE user_a END FROM friendships
           WHERE (user_a = ?1 OR user_b = ?1) AND status = 'accepted'))`
      : "";
  const statement = db.prepare(
    `SELECT u.id, u.pseudo, u.avatar, u.photo_version, s.played, s.won, s.points, s.best_streak
     FROM user_stats s JOIN users u ON u.id = s.user_id
     WHERE s.game = 'uno' AND u.pseudo IS NOT NULL AND s.played > 0 ${friendFilter}
     ORDER BY s.points DESC, s.won DESC, s.played ASC LIMIT 100`,
  );
  const { results } = await (scope === "friends" ? statement.bind(me) : statement).all<{
    id: string;
    pseudo: string;
    avatar: string;
    photo_version: number;
    played: number;
    won: number;
    points: number;
    best_streak: number;
  }>();
  return results.map((r, i) => ({
    rank: i + 1,
    user: toPublic(r),
    played: r.played,
    won: r.won,
    points: r.points,
    bestStreak: r.best_streak,
  }));
}
