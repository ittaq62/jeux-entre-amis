-- Les étoiles, carte par carte : la meilleure à vie (0 à 3) et le meilleur résultat qui l'a donnée.
-- Accordées par le serveur seulement (src/worker/stars.ts), d'après le résultat validé par la salle.
CREATE TABLE user_stars (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  map TEXT NOT NULL,
  stars INTEGER NOT NULL DEFAULT 0,
  -- Dans l'unité de la règle de la carte (millisecondes, coups, points) ; NULL si le jeu a donné les étoiles directement
  best REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game, map)
);
