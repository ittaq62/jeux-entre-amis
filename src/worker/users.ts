import { sanitizeAvatar, seededAvatar, type AvatarConfig } from "../shared/avatar.ts";
import { earnedAchievements, earnedNavalAchievements } from "../shared/achievements.ts";
import { botElo, ELO_START, eloChanges } from "../shared/elo.ts";
import type { NavalMode, NavalSettings, NavalStats } from "../shared/games/naval/engine.ts";
import type { FriendEntry, GameId, Me, PublicUser } from "../shared/protocol.ts";
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

export function toPublic(row: Pick<UserRow, "id" | "pseudo" | "avatar" | "photo_version"> & { is_admin?: number }): PublicUser {
  return {
    id: row.id,
    pseudo: row.pseudo ?? "Anonyme",
    avatar: parseAvatar(row.avatar, row.id),
    photo: row.photo_version,
    ...(row.is_admin ? { admin: true as const } : {}),
  };
}

export function toMe(row: UserRow): Me {
  return { ...toPublic(row), email: row.email, createdAt: row.created_at };
}

export const isAdmin = (row: Pick<UserRow, "is_admin">) => row.is_admin === 1;

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
  is_admin: number;
}

export async function listFriends(db: D1Database, userId: string): Promise<Omit<FriendEntry, "online" | "room">[]> {
  const { results } = await db
    .prepare(
      `SELECT f.user_a, f.user_b, f.requested_by, f.status, u.id, u.pseudo, u.avatar, u.photo_version, u.is_admin
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
  /** Équipe en 2 contre 2 */
  team?: number | null;
  stats: PlayerStats | NavalRecordStats;
}

/** Elo de chaque joueur humain après la partie, et ce qu'il a gagné ou perdu */
export type EloResults = Record<string, { elo: number; delta: number }>;

/** Stats d'une bataille navale, avec les navires restés à flot */
export type NavalRecordStats = NavalStats & { afloat: number };

export type GameRecord = {
  roomCode: string;
  startedAt: number;
  endedAt: number;
  rounds: number;
  players: GameRecordPlayer[];
} & ({ game: "uno"; settings: UnoSettings } | { game: "naval"; settings: NavalSettings; mode: NavalMode });

/** Cumul des stats de bataille navale : on additionne tout, sauf les records qu'on garde au maximum. */
function mergeNavalTotals(raw: string | null, stats: NavalRecordStats): Record<string, number> {
  let totals: Record<string, number> = {};
  try {
    totals = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    totals = {};
  }
  for (const key of ["shots", "hits", "sunk", "lost", "weapons"] as const) totals[key] = (totals[key] ?? 0) + stats[key];
  totals.bestStreak = Math.max(totals.bestStreak ?? 0, stats.bestStreak);
  return totals;
}

/** Enregistre une partie terminee ; renvoie les succes nouvellement debloques et le nouvel Elo de chaque joueur. */
export async function recordGame(db: D1Database, rec: GameRecord): Promise<{ unlocked: Record<string, string[]>; elo: EloResults }> {
  const gameId = randomId(10);
  const humans = rec.players.filter((p) => p.userId);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO games (id, game, variant, room_code, settings, started_at, ended_at, rounds, player_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        gameId,
        rec.game,
        rec.game === "uno" ? rec.settings.variant : rec.mode,
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
    return { unlocked: {}, elo: {} };
  }

  // Etat actuel des joueurs humains
  const placeholders = humans.map(() => "?").join(",");
  const { results: statRows } = await db
    .prepare(`SELECT * FROM user_stats WHERE game = ? AND user_id IN (${placeholders})`)
    .bind(rec.game, ...humans.map((h) => h.userId))
    .all<{
      user_id: string;
      played: number;
      won: number;
      points: number;
      elo: number;
      streak: number;
      best_streak: number;
      totals: string;
    }>();
  const { results: achRows } = await db
    .prepare(`SELECT user_id, achievement FROM achievements WHERE user_id IN (${placeholders})`)
    .bind(...humans.map((h) => h.userId))
    .all<{ user_id: string; achievement: string }>();
  const byUser = new Map(statRows.map((r) => [r.user_id, r]));
  const owned = new Set(achRows.map((r) => `${r.user_id}:${r.achievement}`));

  // Elo : tout le monde avec son niveau d'avant la partie, les bots à leur niveau fixe
  const botLevel = rec.game === "naval" ? rec.settings.botLevel : undefined;
  const ratingOf = (p: GameRecordPlayer) => (p.userId ? (byUser.get(p.userId)?.elo ?? ELO_START) : botElo(rec.game, botLevel));
  const deltas = eloChanges(
    rec.players.map((p) => ({
      id: p.userId ?? `bot-${p.seat}`,
      rating: ratingOf(p),
      rank: p.rank,
      team: p.team ?? null,
      isBot: !p.userId,
      played: p.userId ? (byUser.get(p.userId)?.played ?? 0) : 0,
    })),
  );
  const elo: EloResults = {};

  const now = Date.now();
  const unlocked: Record<string, string[]> = {};
  for (const p of humans) {
    const prev = byUser.get(p.userId!);
    const won = p.rank === 1;
    const played = (prev?.played ?? 0) + 1;
    const streak = won ? (prev?.streak ?? 0) + 1 : 0;
    let totals: object;
    let earnedIds: string[];
    if (rec.game === "uno") {
      const stats = p.stats as PlayerStats;
      const t = parseTotals(prev?.totals ?? null);
      for (const k of SUM_KEYS) t[k] += stats[k];
      for (const k of MAX_KEYS) t[k] = Math.max(t[k], stats[k]);
      t.eliminated += p.eliminated ? 1 : 0;
      t.points += p.score;
      totals = t;
      earnedIds = earnedAchievements({
        won,
        players: rec.players.length,
        variant: rec.settings.variant,
        eliminated: p.eliminated,
        stats,
        played,
        streak,
      });
    } else {
      const stats = p.stats as NavalRecordStats;
      totals = mergeNavalTotals(prev?.totals ?? null, stats);
      earnedIds = earnedNavalAchievements({ won, mode: rec.mode, afloat: stats.afloat, out: p.eliminated, stats, played });
    }
    const delta = deltas[p.userId!] ?? 0;
    elo[p.userId!] = { elo: ratingOf(p) + delta, delta };
    statements.push(
      db
        .prepare(
          `INSERT INTO user_stats (user_id, game, played, won, points, streak, best_streak, totals, updated_at, elo)
           VALUES (?1, ?9, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?10)
           ON CONFLICT(user_id, game) DO UPDATE SET played = ?2, won = ?3, points = ?4, streak = ?5, best_streak = ?6, totals = ?7, updated_at = ?8, elo = ?10`,
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
          rec.game,
          elo[p.userId!]!.elo,
        ),
    );
    const earned = earnedIds.filter((id) => !owned.has(`${p.userId}:${id}`));
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
  return { unlocked, elo };
}

interface StatsRow {
  game: GameId;
  played: number;
  won: number;
  points: number;
  elo: number;
  streak: number;
  best_streak: number;
  totals: string;
}

function statsSummary(row: StatsRow | undefined) {
  return {
    played: row?.played ?? 0,
    won: row?.won ?? 0,
    points: row?.points ?? 0,
    elo: row?.elo ?? ELO_START,
    streak: row?.streak ?? 0,
    bestStreak: row?.best_streak ?? 0,
  };
}

export async function userProfile(db: D1Database, user: UserRow) {
  const [statRows, achievements, recent] = await Promise.all([
    db
      .prepare("SELECT game, played, won, points, elo, streak, best_streak, totals FROM user_stats WHERE user_id = ?")
      .bind(user.id)
      .all<StatsRow>(),
    db.prepare("SELECT achievement, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC").bind(user.id).all<{
      achievement: string;
      unlocked_at: number;
    }>(),
    db
      .prepare(
        `SELECT g.id, g.game, g.variant, g.ended_at, g.player_count, gp.rank, gp.score,
           (SELECT json_group_array(json_object('name', p2.name, 'rank', p2.rank, 'bot', p2.is_bot))
              FROM game_players p2 WHERE p2.game_id = g.id) AS players
         FROM game_players gp JOIN games g ON g.id = gp.game_id
         WHERE gp.user_id = ? ORDER BY g.ended_at DESC LIMIT 12`,
      )
      .bind(user.id)
      .all<{
        id: string;
        game: GameId;
        variant: string;
        ended_at: number;
        player_count: number;
        rank: number;
        score: number;
        players: string;
      }>(),
  ]);
  const uno = statRows.results.find((r) => r.game === "uno");
  const naval = statRows.results.find((r) => r.game === "naval");
  let navalTotals: Record<string, number> = {};
  try {
    navalTotals = naval ? (JSON.parse(naval.totals) as Record<string, number>) : {};
  } catch {
    navalTotals = {};
  }
  return {
    user: toPublic(user),
    memberSince: user.created_at,
    stats: { ...statsSummary(uno), totals: parseTotals(uno?.totals ?? null) },
    naval: { ...statsSummary(naval), totals: navalTotals },
    achievements: achievements.results.map((a) => ({ id: a.achievement, at: a.unlocked_at })),
    recent: recent.results.map((r) => ({
      id: r.id,
      game: r.game,
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

export async function leaderboard(db: D1Database, scope: "all" | "friends", me: string, game: GameId, sort: "points" | "elo" = "points") {
  const friendFilter =
    scope === "friends"
      ? `AND (s.user_id = ?1 OR s.user_id IN (SELECT CASE WHEN user_a = ?1 THEN user_b ELSE user_a END FROM friendships
           WHERE (user_a = ?1 OR user_b = ?1) AND status = 'accepted'))`
      : "";
  const statement = db.prepare(
    `SELECT u.id, u.pseudo, u.avatar, u.photo_version, u.is_admin, s.played, s.won, s.points, s.elo, s.best_streak
     FROM user_stats s JOIN users u ON u.id = s.user_id
     WHERE s.game = ?2 AND u.pseudo IS NOT NULL AND u.banned_at IS NULL AND s.played > 0 ${friendFilter}
     ORDER BY ${sort === "elo" ? "s.elo DESC, s.points DESC" : "s.points DESC, s.elo DESC"}, s.won DESC, s.played ASC LIMIT 100`,
  );
  const { results } = await statement.bind(me, game).all<{
    id: string;
    pseudo: string;
    avatar: string;
    photo_version: number;
    is_admin: number;
    played: number;
    won: number;
    points: number;
    elo: number;
    best_streak: number;
  }>();
  return results.map((r, i) => ({
    rank: i + 1,
    user: toPublic(r),
    played: r.played,
    won: r.won,
    points: r.points,
    elo: r.elo,
    bestStreak: r.best_streak,
  }));
}
