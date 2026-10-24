-- Elo, à côté des points : le niveau de chacun, qui monte et qui baisse (src/shared/elo.ts).
-- Tout le monde part de 1000 ; scripts/elo-history.ts rejoue ensuite les parties déjà jouées.

ALTER TABLE user_stats ADD COLUMN elo INTEGER NOT NULL DEFAULT 1000;
CREATE INDEX user_stats_elo ON user_stats(game, elo DESC);
