// La série côté serveur : le jour compté quand on ouvre l'accueil (et ses points), les jours de jeu notés à la fin de
// chaque partie, le défi de la semaine. Le jour vient de l'horloge du serveur ; le site n'envoie ni date ni montant.
// Chaque versement a sa ligne dans point_ledger, unique par joueur : deux onglets ou deux requêtes en même temps ne
// paient jamais deux fois.

import type { GameId } from "../shared/protocol.ts";
import {
  addDays,
  claimLogin,
  countsForStreak,
  cycleDayOf,
  isDay,
  liveLogin,
  livePlay,
  nextPlay,
  parisDay,
  PLAY_DAYS_KEPT,
  weekBonus,
  weekDone,
  weekStart,
  type LoginState,
  type PlayState,
  type StreakClaimResponse,
  type StreakGain,
  type StreakPlayer,
  type StreakStatus,
} from "../shared/streak.ts";
import { BALANCE } from "./shop.ts";

interface StreakRow {
  login_day: string | null;
  login_streak: number;
  login_best: number;
  jokers: number;
  play_day: string | null;
  play_streak: number;
  play_best: number;
}

export const dayReason = (day: string) => `serie:${day}`;
export const weekReason = (monday: string) => `tous-les-jeux:${monday}`;

const STATE_SQL =
  "SELECT login_day, login_streak, login_best, jokers, play_day, play_streak, play_best FROM user_streaks WHERE user_id = ?";

const loginOf = (row: StreakRow | undefined): LoginState | null =>
  row ? { day: isDay(row.login_day) ? row.login_day : null, streak: row.login_streak, best: row.login_best, jokers: row.jokers } : null;

const playOf = (row: Pick<StreakRow, "play_day" | "play_streak" | "play_best"> | undefined): PlayState | null =>
  row ? { day: isDay(row.play_day) ? row.play_day : null, streak: row.play_streak, best: row.play_best } : null;

interface Snapshot {
  row: StreakRow | undefined;
  /** Les jeux terminés, par lundi de semaine (cette semaine et la précédente) */
  played: Map<string, Set<string>>;
  paid: Set<string>;
  balance: number;
}

async function snapshot(db: D1Database, userId: string, today: string, withBalance: boolean): Promise<Snapshot> {
  const monday = weekStart(today);
  const before = addDays(monday, -7);
  const statements = [
    db.prepare(STATE_SQL).bind(userId),
    db.prepare("SELECT day, game FROM play_days WHERE user_id = ? AND day >= ?").bind(userId, before),
    db
      .prepare("SELECT reason FROM point_ledger WHERE user_id = ? AND reason IN (?, ?)")
      .bind(userId, weekReason(monday), weekReason(before)),
    ...(withBalance ? [db.prepare(`SELECT ${BALANCE} AS balance`).bind(userId)] : []),
  ];
  const [state, days, reasons, balance] = await db.batch<Record<string, unknown>>(statements);
  const played = new Map<string, Set<string>>([
    [monday, new Set()],
    [before, new Set()],
  ]);
  for (const r of (days?.results ?? []) as { day: string; game: string }[]) {
    if (isDay(r.day)) played.get(weekStart(r.day))?.add(r.game);
  }
  return {
    row: state?.results[0] as unknown as StreakRow | undefined,
    played,
    paid: new Set(((reasons?.results ?? []) as { reason: string }[]).map((r) => r.reason)),
    balance: Math.max(0, Number((balance?.results[0] as { balance?: number } | undefined)?.balance ?? 0)),
  };
}

function statusOf(snap: Snapshot, today: string, games: readonly GameId[]): StreakStatus {
  const login = loginOf(snap.row);
  const play = playOf(snap.row);
  const monday = weekStart(today);
  const playedNow = snap.played.get(monday) ?? new Set<string>();
  const claimedToday = login?.day === today;
  const streak = liveLogin(login, today);
  // La place d'aujourd'hui : celle qu'il vient de gagner, ou celle qu'il aura en revenant sur l'accueil
  const cycleDay = claimedToday ? cycleDayOf(login!.streak) : (claimLogin(login, today)?.cycleDay ?? 1);
  return {
    today,
    login: { streak, best: login?.best ?? 0, jokers: login?.jokers ?? 0, claimedToday, cycleDay },
    play: { streak: livePlay(play, today), best: play?.best ?? 0, today: play?.day === today },
    week: {
      start: monday,
      games: [...games],
      played: games.filter((g) => playedNow.has(g)),
      bonus: weekBonus(games),
      paid: snap.paid.has(weekReason(monday)),
    },
  };
}

/**
 * L'accueil vient d'être ouvert : compte le jour (une seule fois), paie le jour du cycle, et le défi de la semaine s'il
 * vient d'être réussi (celui de la semaine dernière aussi, s'il n'avait pas encore été versé). `games` : les jeux
 * ouverts à ce compte.
 */
export async function claimStreak(db: D1Database, userId: string, now: number, games: readonly GameId[]): Promise<StreakClaimResponse> {
  const today = parisDay(now);
  const snap = await snapshot(db, userId, today, true);
  const login = loginOf(snap.row);
  const claim = claimLogin(login, today);
  const monday = weekStart(today);
  const weeks = [monday, addDays(monday, -7)].filter(
    (start) => weekDone(games, snap.played.get(start) ?? new Set()) && !snap.paid.has(weekReason(start)),
  );
  if (!claim && weeks.length === 0)
    return { status: statusOf(snap, today, games), gained: { day: null, weeks: [] }, balance: snap.balance };

  const statements: D1PreparedStatement[] = [];
  let ledgerAt = -1;
  if (claim) {
    const s = claim.state;
    statements.push(
      // Le nouvel état, seulement si personne ne l'a changé depuis qu'on l'a lu
      db
        .prepare(
          `INSERT INTO user_streaks (user_id, login_day, login_streak, login_best, jokers) VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(user_id) DO UPDATE SET login_day = ?2, login_streak = ?3, login_best = ?4, jokers = ?5
           WHERE user_streaks.login_day IS ?6`,
        )
        .bind(userId, s.day, s.streak, s.best, s.jokers, login?.day ?? null),
    );
    ledgerAt = statements.length;
    statements.push(
      // Les points du jour, seulement si c'est bien cet état-là qui a été enregistré, et une seule fois par jour
      db
        .prepare(
          `INSERT OR IGNORE INTO point_ledger (user_id, reason, delta, at)
           SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM user_streaks WHERE user_id = ?1 AND login_day = ?5 AND login_streak = ?6)`,
        )
        .bind(userId, dayReason(today), claim.reward, now, today, s.streak),
      // Une fois par jour, on oublie les vieux jours de jeu
      db.prepare("DELETE FROM play_days WHERE user_id = ? AND day < ?").bind(userId, addDays(today, -PLAY_DAYS_KEPT)),
    );
  }
  const bonus = weekBonus(games);
  const weekAt = weeks.map((start) => {
    statements.push(
      db
        .prepare("INSERT OR IGNORE INTO point_ledger (user_id, reason, delta, at) VALUES (?, ?, ?, ?)")
        .bind(userId, weekReason(start), bonus, now),
    );
    return statements.length - 1;
  });
  const results = await db.batch(statements);
  const changed = (i: number) => i >= 0 && (results[i]?.meta.changes ?? 0) > 0;

  const gained: StreakGain = { day: null, weeks: [] };
  if (claim && changed(ledgerAt)) {
    const { state: _state, ...day } = claim;
    gained.day = day;
  }
  weeks.forEach((start, i) => {
    if (changed(weekAt[i]!)) gained.weeks.push({ start, bonus, current: start === monday });
  });
  const after = await snapshot(db, userId, today, true);
  return { status: statusOf(after, today, games), gained, balance: after.balance };
}

/** La série d'un joueur, pour son profil (rien n'est écrit) */
export async function streakStatus(db: D1Database, userId: string, now: number, games: readonly GameId[]): Promise<StreakStatus> {
  const today = parisDay(now);
  return statusOf(await snapshot(db, userId, today, false), today, games);
}

/**
 * Une partie vient d'être enregistrée : note le jour et le jeu de chaque joueur qui compte (ni bot, ni parti en cours de
 * route, ni partie abandonnée tout de suite) et fait avancer sa série de jeu.
 */
export async function recordPlayDays(
  db: D1Database,
  rec: { game: GameId; startedAt: number; endedAt: number; players: StreakPlayer[] },
): Promise<void> {
  const ids = [...new Set(rec.players.filter((p) => countsForStreak(p, rec.startedAt, rec.endedAt)).map((p) => p.userId!))];
  if (ids.length === 0) return;
  const day = parisDay(rec.endedAt);
  const { results } = await db
    .prepare(`SELECT user_id, play_day, play_streak, play_best FROM user_streaks WHERE user_id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<Pick<StreakRow, "play_day" | "play_streak" | "play_best"> & { user_id: string }>();
  const byUser = new Map(results.map((r) => [r.user_id, r]));
  const statements: D1PreparedStatement[] = [];
  for (const id of ids) {
    statements.push(db.prepare("INSERT OR IGNORE INTO play_days (user_id, day, game) VALUES (?, ?, ?)").bind(id, day, rec.game));
    const prev = playOf(byUser.get(id));
    const next = nextPlay(prev, day);
    if (!next) continue;
    statements.push(
      db
        .prepare(
          `INSERT INTO user_streaks (user_id, play_day, play_streak, play_best) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(user_id) DO UPDATE SET play_day = ?2, play_streak = ?3, play_best = ?4
           WHERE user_streaks.play_day IS ?5`,
        )
        .bind(id, next.day, next.streak, next.best, prev?.day ?? null),
    );
  }
  await db.batch(statements);
}
