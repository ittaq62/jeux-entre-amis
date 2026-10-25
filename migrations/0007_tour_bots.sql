-- Les bots d'une tournée ont leur ligne sur la feuille de tournée, sans compte.
ALTER TABLE tour_players ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;
