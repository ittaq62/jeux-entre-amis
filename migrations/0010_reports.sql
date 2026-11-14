-- Les signalements envoyés depuis la fin d'une partie ou d'une tournée : un bug, un problème ou une idée.
-- Ni adresse IP ni navigateur complet : le type d'appareil, le système et le navigateur en clair, la taille de l'écran.
-- Le compte supprimé emporte ses signalements.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- bug, problem ou idea
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  -- Le jeu (ou « tour »), sa variante en clair, le code de la table et celui de la tournée
  game TEXT,
  variant TEXT,
  room_code TEXT,
  tour_code TEXT,
  -- player ou watcher
  role TEXT,
  -- phone, tablet ou pc
  device TEXT NOT NULL,
  os TEXT NOT NULL,
  browser TEXT NOT NULL,
  screen_w INTEGER NOT NULL,
  screen_h INTEGER NOT NULL,
  view_w INTEGER NOT NULL,
  view_h INTEGER NOT NULL,
  version TEXT,
  -- new, seen ou done
  status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX reports_by_date ON reports (created_at);
CREATE INDEX reports_by_status ON reports (status, created_at);
