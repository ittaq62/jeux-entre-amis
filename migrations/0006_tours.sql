-- Tournées : plusieurs jeux à la suite pour la même bande, avec un classement en points.
-- Les jeux eux-mêmes restent dans « games » comme n'importe quelle partie ; une tournée en garde le résumé.

CREATE TABLE tours (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  settings TEXT NOT NULL,
  -- Jeu par jeu : quel jeu, et la place et les points de chacun
  games TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  player_count INTEGER NOT NULL,
  -- En équipes : 0 Rouges, 1 Bleus ; vide si chacun pour soi ou égalité
  winner_team INTEGER
);

CREATE TABLE tour_players (
  tour_id TEXT NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  rank INTEGER NOT NULL,
  points INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  team INTEGER,
  titles TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (tour_id, name)
);
CREATE INDEX tour_players_user ON tour_players(user_id);
