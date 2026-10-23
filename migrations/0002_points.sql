-- Classement : des points qui s'accumulent avec les victoires, à la place d'un Elo
-- qui restait collé autour de 1000. Même barème que src/shared/ranking.ts :
-- 30 pour une victoire, 10 par humain et 5 par bot terminés derrière soi.

ALTER TABLE user_stats ADD COLUMN points INTEGER NOT NULL DEFAULT 0;

UPDATE user_stats
SET points = COALESCE((
  SELECT SUM(
    CASE WHEN gp.rank = 1 THEN 30 ELSE 0 END
    + (SELECT COALESCE(SUM(CASE WHEN o.is_bot = 1 THEN 5 ELSE 10 END), 0)
       FROM game_players o
       WHERE o.game_id = gp.game_id AND o.rank > gp.rank)
  )
  FROM game_players gp
  JOIN games g ON g.id = gp.game_id
  WHERE gp.user_id = user_stats.user_id AND g.game = user_stats.game AND gp.rank >= 1
), 0);

DROP INDEX user_stats_rating;
ALTER TABLE user_stats DROP COLUMN rating;
CREATE INDEX user_stats_points ON user_stats(game, points DESC);
