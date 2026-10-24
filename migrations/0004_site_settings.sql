-- Réglages du site modifiables depuis la page Admin (par exemple : sortir un jeu de la bêta).

CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
