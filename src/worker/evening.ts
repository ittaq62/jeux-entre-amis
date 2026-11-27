// La ligne de fin de partie d'un joueur (voir shared/evening.ts), tirée de ses parties enregistrées : sa dernière partie
// de ce jeu (finie il y a moins d'un quart d'heure), ses séries contre chacun des vrais joueurs de cette partie, ses
// victoires à ce jeu et celles de la soirée.

import { eveningLine, type Duel } from "../shared/evening.ts";
import { TABLE_NAMES, type TableGame } from "../shared/protocol.ts";

const RECENT_MS = 15 * 60_000;
const EVENING_MS = 6 * 3600_000;
const DUELS = 12;

export async function eveningFor(db: D1Database, userId: string, game: TableGame, now = Date.now()): Promise<string | null> {
  const last = await db
    .prepare(
      `SELECT g.id AS id, me.rank AS rank FROM games g JOIN game_players me ON me.game_id = g.id AND me.user_id = ?1
       WHERE g.game = ?2 AND g.ended_at > ?3 ORDER BY g.ended_at DESC LIMIT 1`,
    )
    .bind(userId, game, now - RECENT_MS)
    .first<{ id: string; rank: number }>();
  if (!last) return null;
  const { results: others } = await db
    .prepare(
      "SELECT DISTINCT user_id AS id, name FROM game_players WHERE game_id = ?1 AND is_bot = 0 AND user_id IS NOT NULL AND user_id != ?2",
    )
    .bind(last.id, userId)
    .all<{ id: string; name: string }>();
  const rivals = await Promise.all(
    others.map(async (o) => {
      const { results } = await db
        .prepare(
          `SELECT me.rank AS mine, o.rank AS theirs FROM games g
           JOIN game_players me ON me.game_id = g.id AND me.user_id = ?1
           JOIN game_players o ON o.game_id = g.id AND o.user_id = ?2
           WHERE g.game = ?3 ORDER BY g.ended_at DESC LIMIT ?4`,
        )
        .bind(userId, o.id, game, DUELS)
        .all<Duel>();
      return { name: o.name, duels: results };
    }),
  );
  const wins = await db
    .prepare(
      `SELECT SUM(CASE WHEN g.game = ?2 THEN 1 ELSE 0 END) AS inGame, SUM(CASE WHEN g.ended_at > ?3 THEN 1 ELSE 0 END) AS tonight
       FROM game_players p JOIN games g ON g.id = p.game_id WHERE p.user_id = ?1 AND p.rank = 1`,
    )
    .bind(userId, game, now - EVENING_MS)
    .first<{ inGame: number | null; tonight: number | null }>();
  return eveningLine({
    gameName: TABLE_NAMES[game],
    rank: last.rank,
    winsInGame: wins?.inGame ?? 0,
    winsTonight: wins?.tonight ?? 0,
    rivals,
  });
}
