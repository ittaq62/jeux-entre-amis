-- La série : les jours d'affilée où l'on ouvre l'accueil connecté, ceux où l'on termine une partie, et le défi de la
-- semaine (jouer à chacun des jeux). Les règles et les montants sont dans src/shared/streak.ts ; les points versés
-- passent par point_ledger (« serie:<jour> », « tous-les-jeux:<lundi> »), une seule fois chacun.

CREATE TABLE user_streaks (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Connexion : le dernier jour compté (à Paris, AAAA-MM-JJ), la série en cours, la meilleure, les jokers en réserve
  login_day TEXT,
  login_streak INTEGER NOT NULL DEFAULT 0,
  login_best INTEGER NOT NULL DEFAULT 0,
  jokers INTEGER NOT NULL DEFAULT 0,
  -- Jeu : pareil, pour les jours où une partie a été terminée
  play_day TEXT,
  play_streak INTEGER NOT NULL DEFAULT 0,
  play_best INTEGER NOT NULL DEFAULT 0
);

-- Les jeux terminés, jour par jour (une ligne par jeu et par jour), gardés quelques semaines pour le défi de la semaine
CREATE TABLE play_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  game TEXT NOT NULL,
  PRIMARY KEY (user_id, day, game)
);
